import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';
import type { PackedBands } from '../types';

/**
 * Wrap packed band bytes as Skia images — step 3's handoff to the GPU.
 *
 * `Skia.Data.fromBytes` takes ownership of the byte range natively, so the
 * texture upload does not re-cross the bridge, and `MakeImage` hands back a
 * GPU-resident `SkImage` the shader can sample directly.
 *
 * `AlphaType.Opaque` matters: it tells Skia the alpha channel is meaningless
 * and must not be used to premultiply RGB. Any other alpha type would scale the
 * band values stored in R/G/B by the alpha byte and quietly destroy the
 * radiometry.
 */

export interface BandTextures {
  imageA: SkImage;
  /** Null when the source had three or fewer bands. */
  imageB: SkImage | null;
  width: number;
  height: number;
}

function makeImage(bytes: Uint8Array, width: number, height: number): SkImage {
  const data = Skia.Data.fromBytes(bytes);
  const image = Skia.Image.MakeImage(
    {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Opaque,
    },
    data,
    width * 4,
  );

  if (!image) {
    throw new Error(`Skia rejected a ${width}x${height} RGBA8 texture upload.`);
  }

  return image;
}

export function createBandTextures(packed: PackedBands): BandTextures {
  const { width, height, textureA, textureB } = packed;

  return {
    imageA: makeImage(textureA, width, height),
    imageB: textureB ? makeImage(textureB, width, height) : null,
    width,
    height,
  };
}

let placeholder: SkImage | null = null;

/**
 * A 1x1 opaque black image used to satisfy the shader's second `uniform shader`
 * slot when the file has three or fewer bands. SkSL requires every child shader
 * to be bound even on code paths that never evaluate it.
 */
export function getPlaceholderTexture(): SkImage {
  if (!placeholder) {
    placeholder = makeImage(new Uint8Array([0, 0, 0, 255]), 1, 1);
  }
  return placeholder;
}
