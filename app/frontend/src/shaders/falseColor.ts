import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import type { BandMapping, BandStretch, RenderMode } from '../types';

/**
 * The GPU band-remap shader — step 2 of the render pipeline.
 *
 * Everything per-pixel happens here, on the GPU, in parallel. A JavaScript loop
 * over a 2048x2048x5 raster is ~21 million reads on a single thread; the same
 * work as a fragment program is a sub-millisecond dispatch. Crucially the band
 * assignment is driven by *uniforms* rather than baked into the source, so
 * changing NIR -> R to Red Edge -> R is a uniform update, not a shader
 * recompile (which would stall the frame).
 *
 * Band plumbing
 * -------------
 * `bandsA` carries raw bands 0,1,2 in its R,G,B channels; `bandsB` carries
 * bands 3,4,5. Each output screen channel is produced by a dot product with a
 * one-hot selector vector per texture — so `selR_A = (0,0,0)` with
 * `selR_B = (1,0,0)` means "screen red comes from band 3 (NIR)".
 */
export const FALSE_COLOR_SKSL = `
uniform shader bandsA;   // R=band0 G=band1 B=band2, alpha pinned opaque
uniform shader bandsB;   // R=band3 G=band4 B=band5, alpha pinned opaque

uniform float3 loA;      // per-band percentile clip, low
uniform float3 hiA;      // per-band percentile clip, high
uniform float3 loB;
uniform float3 hiB;

uniform float3 selR_A;   // screen red   <- dot(bandsA, selR_A) + dot(bandsB, selR_B)
uniform float3 selR_B;
uniform float3 selG_A;   // screen green
uniform float3 selG_B;
uniform float3 selB_A;   // screen blue
uniform float3 selB_B;

uniform float3 selNIR_A; // NDVI mode only
uniform float3 selNIR_B;
uniform float3 selRED_A;
uniform float3 selRED_B;

uniform float gain;
uniform float gammaValue;
uniform float mode;      // 0 = false colour composite, 1 = NDVI
uniform float hasB;      // 0 when the file has 3 or fewer bands

float3 stretch(float3 v, float3 lo, float3 hi) {
  return clamp((v - lo) / max(hi - lo, float3(1e-4)), float3(0.0), float3(1.0));
}

// Soil -> sparse -> low vigour -> healthy -> dense canopy.
float3 ndviRamp(float t) {
  float3 c0 = float3(0.26, 0.17, 0.09);
  float3 c1 = float3(0.80, 0.68, 0.34);
  float3 c2 = float3(0.85, 0.87, 0.35);
  float3 c3 = float3(0.38, 0.72, 0.28);
  float3 c4 = float3(0.05, 0.32, 0.14);

  if (t < 0.25) { return mix(c0, c1, t / 0.25); }
  if (t < 0.50) { return mix(c1, c2, (t - 0.25) / 0.25); }
  if (t < 0.75) { return mix(c2, c3, (t - 0.50) / 0.25); }
  return mix(c3, c4, (t - 0.75) / 0.25);
}

half4 main(float2 xy) {
  float3 a = stretch(float3(bandsA.eval(xy).rgb), loA, hiA);

  float3 b = float3(0.0);
  if (hasB > 0.5) {
    b = stretch(float3(bandsB.eval(xy).rgb), loB, hiB);
  }

  if (mode > 0.5) {
    float nir = dot(a, selNIR_A) + dot(b, selNIR_B);
    float red = dot(a, selRED_A) + dot(b, selRED_B);
    float denom = nir + red;
    float ndvi = denom > 1e-4 ? (nir - red) / denom : 0.0;
    return half4(half3(ndviRamp(clamp((ndvi + 1.0) * 0.5, 0.0, 1.0))), 1.0);
  }

  float3 rgb = float3(
    dot(a, selR_A) + dot(b, selR_B),
    dot(a, selG_A) + dot(b, selG_B),
    dot(a, selB_A) + dot(b, selB_B)
  );

  rgb = pow(clamp(rgb * gain, float3(0.0), float3(1.0)), float3(1.0 / max(gammaValue, 0.01)));
  return half4(half3(rgb), 1.0);
}
`;

let cachedEffect: SkRuntimeEffect | null = null;

/**
 * Compile once and cache. Runtime effect compilation is not free and the source
 * never changes, so there is no reason to pay for it per mount.
 */
export function getFalseColorEffect(): SkRuntimeEffect {
  if (!cachedEffect) {
    const effect = Skia.RuntimeEffect.Make(FALSE_COLOR_SKSL);
    if (!effect) {
      throw new Error('Failed to compile the false-colour SkSL shader.');
    }
    cachedEffect = effect;
  }
  return cachedEffect;
}

type Vec3 = [number, number, number];

/** One-hot selector pair for a raw band index across the two textures. */
function selectorsFor(bandIndex: number, bandCount: number): { a: Vec3; b: Vec3 } {
  const clamped = Math.max(0, Math.min(bandIndex, Math.max(0, bandCount - 1)));
  const a: Vec3 = [0, 0, 0];
  const b: Vec3 = [0, 0, 0];

  if (clamped < 3) {
    a[clamped] = 1;
  } else if (clamped < 6) {
    b[clamped - 3] = 1;
  } else {
    // Out of packable range — fall back to band 0 rather than rendering black.
    a[0] = 1;
  }

  return { a, b };
}

function stretchVectors(stretches: BandStretch[], offset: number): { lo: Vec3; hi: Vec3 } {
  const lo: Vec3 = [0, 0, 0];
  const hi: Vec3 = [1, 1, 1];
  for (let i = 0; i < 3; i += 1) {
    const entry = stretches[offset + i];
    if (entry) {
      lo[i] = entry.lo;
      hi[i] = entry.hi;
    }
  }
  return { lo, hi };
}

export interface FalseColorUniformOptions {
  mapping: BandMapping;
  stretches: BandStretch[];
  bandCount: number;
  hasTextureB: boolean;
  mode: RenderMode;
  gain: number;
  gamma: number;
}

export function resolveDisplayMapping(mapping: BandMapping, bandCount: number): BandMapping {
  if (bandCount !== 3) return mapping;

  return {
    ...mapping,
    red: 0,
    green: 1,
    blue: 2,
    nir: 0,
    redBand: 2,
  };
}

/** Build the uniform payload for `<Shader uniforms={...}>`. */
export function buildFalseColorUniforms(options: FalseColorUniformOptions): Record<string, number[] | number> {
  const { mapping, stretches, bandCount, hasTextureB, mode, gain, gamma } = options;

  const red = selectorsFor(mapping.red, bandCount);
  const green = selectorsFor(mapping.green, bandCount);
  const blue = selectorsFor(mapping.blue, bandCount);
  const nir = selectorsFor(mapping.nir, bandCount);
  const redBand = selectorsFor(mapping.redBand, bandCount);

  const stretchA = stretchVectors(stretches, 0);
  const stretchB = stretchVectors(stretches, 3);

  return {
    loA: stretchA.lo,
    hiA: stretchA.hi,
    loB: stretchB.lo,
    hiB: stretchB.hi,

    selR_A: red.a,
    selR_B: red.b,
    selG_A: green.a,
    selG_B: green.b,
    selB_A: blue.a,
    selB_B: blue.b,

    selNIR_A: nir.a,
    selNIR_B: nir.b,
    selRED_A: redBand.a,
    selRED_B: redBand.b,

    gain,
    gammaValue: gamma,
    mode: mode === 'ndvi' ? 1 : 0,
    hasB: hasTextureB ? 1 : 0,
  };
}
