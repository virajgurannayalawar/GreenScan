import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import {
  Canvas,
  Fill,
  Group,
  ImageShader,
  Rect,
  Shader,
  type SkImage,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import config from '../config/env';
import { colors, radius, spacing, typography } from '../theme';
import { buildFalseColorUniforms, getFalseColorEffect } from '../shaders/falseColor';
import { getPlaceholderTexture, type BandTextures } from '../services/skiaTexture';
import { bandName } from '../utils/format';
import type { BandMapping, BandStretch, RenderMode } from '../types';

/**
 * Step 3 — native canvas rendering.
 *
 * There is no `<Image>` here on purpose. The pixels on screen are not an
 * encoded bitmap; they are the output of the SkSL program in
 * `shaders/falseColor.ts` sampling two raw band textures. That means:
 *
 *  - the NIR/RedEdge/Green remap costs one GPU dispatch, not a JS pixel loop;
 *  - changing the band assignment or stretch is a uniform write, so it is
 *    effectively free and re-renders on the next frame;
 *  - pan and pinch run entirely on the UI thread through Reanimated shared
 *    values, so gestures stay at display refresh rate even while the JS thread
 *    is blocked on the upload.
 */

export interface MultispectralViewerProps {
  textures: BandTextures;
  stretches: BandStretch[];
  bandCount: number;
  mapping: BandMapping;
  renderMode: RenderMode;
  gain: number;
  gamma: number;
  height?: number;
}

export function MultispectralViewer({
  textures,
  stretches,
  bandCount,
  mapping,
  renderMode,
  gain,
  gamma,
  height = 340,
}: MultispectralViewerProps) {
  const [container, setContainer] = useState({ width: 0, height });
  const [zoomLabel, setZoomLabel] = useState('1.0×');

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height: measuredHeight } = event.nativeEvent.layout;
    setContainer({ width, height: measuredHeight });
  }, []);

  // Compiled once per process and cached inside the shader module.
  const effect = useMemo(() => {
    try {
      return getFalseColorEffect();
    } catch {
      return null;
    }
  }, []);

  const uniforms = useMemo(
    () =>
      buildFalseColorUniforms({
        mapping,
        stretches,
        bandCount,
        hasTextureB: textures.imageB !== null,
        mode: renderMode,
        gain,
        gamma,
      }),
    [mapping, stretches, bandCount, textures.imageB, renderMode, gain, gamma],
  );

  const imageWidth = textures.width;
  const imageHeight = textures.height;

  /** Scale that fits the raster inside the viewport at zoom 1. */
  const baseScale = useMemo(() => {
    if (!container.width || !imageWidth || !imageHeight) return 1;
    return Math.min(container.width / imageWidth, container.height / imageHeight);
  }, [container.width, container.height, imageWidth, imageHeight]);

  const zoom = useSharedValue(1);
  const savedZoom = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const savedPanX = useSharedValue(0);
  const savedPanY = useSharedValue(0);

  const reportZoom = useCallback((value: number) => {
    setZoomLabel(`${value.toFixed(1)}×`);
  }, []);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          savedZoom.value = zoom.value;
        })
        .onUpdate((event) => {
          const next = savedZoom.value * event.scale;
          zoom.value = Math.min(config.zoom.max, Math.max(config.zoom.min, next));
        })
        .onEnd(() => {
          runOnJS(reportZoom)(zoom.value);
        }),
    [zoom, savedZoom, reportZoom],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          savedPanX.value = panX.value;
          savedPanY.value = panY.value;
        })
        .onUpdate((event) => {
          panX.value = savedPanX.value + event.translationX;
          panY.value = savedPanY.value + event.translationY;
        }),
    [panX, panY, savedPanX, savedPanY],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          zoom.value = withTiming(1, { duration: 220 });
          panX.value = withTiming(0, { duration: 220 });
          panY.value = withTiming(0, { duration: 220 });
          runOnJS(reportZoom)(1);
        }),
    [zoom, panX, panY, reportZoom],
  );

  // Double tap must win outright; pan and pinch coexist.
  const gesture = useMemo(
    () => Gesture.Race(doubleTap, Gesture.Simultaneous(pan, pinch)),
    [doubleTap, pan, pinch],
  );

  /**
   * Centre, scale about the raster's midpoint, then apply the pan offset.
   * Transforms apply in array order, so the trailing negative half-size
   * translation is what makes the scale pivot on the image centre rather than
   * its top-left corner.
   */
  const transform = useDerivedValue(() => {
    const scale = baseScale * zoom.value;
    return [
      { translateX: container.width / 2 + panX.value },
      { translateY: container.height / 2 + panY.value },
      { scale },
      { translateX: -imageWidth / 2 },
      { translateY: -imageHeight / 2 },
    ];
  }, [baseScale, container.width, container.height, imageWidth, imageHeight]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: zoom.value > 1.05 ? 1 : 0 }));

  const ready = effect !== null && container.width > 0 && imageWidth > 0;
  const imageB: SkImage = textures.imageB ?? getPlaceholderTexture();

  return (
    <View style={styles.wrapper}>
      <GestureDetector gesture={gesture}>
        <View style={[styles.canvasHost, { height }]} onLayout={onLayout}>
          {ready ? (
            <Canvas style={StyleSheet.absoluteFill}>
              <Fill color={colors.canvasBackdrop} />
              <Group transform={transform}>
                <Rect x={0} y={0} width={imageWidth} height={imageHeight}>
                  <Shader source={effect!} uniforms={uniforms}>
                    {/*
                      Child order binds to the shader's `uniform shader` slots:
                      first child -> bandsA, second -> bandsB.

                      `fm="nearest"` is deliberate. Bilinear filtering would
                      invent reflectance values that the sensor never recorded,
                      which is wrong for a measurement you are about to read a
                      pesticide number off.
                    */}
                    <ImageShader
                      image={textures.imageA}
                      fit="none"
                      rect={{ x: 0, y: 0, width: imageWidth, height: imageHeight }}
                      tx="clamp"
                      ty="clamp"
                      fm="nearest"
                    />
                    <ImageShader
                      image={imageB}
                      fit="none"
                      rect={{ x: 0, y: 0, width: imageWidth, height: imageHeight }}
                      tx="clamp"
                      ty="clamp"
                      fm="nearest"
                    />
                  </Shader>
                </Rect>
              </Group>
            </Canvas>
          ) : (
            <View style={styles.canvasFallback}>
              <Text style={styles.fallbackText}>
                {effect === null
                  ? 'The GPU shader failed to compile on this device.'
                  : 'Preparing canvas…'}
              </Text>
            </View>
          )}

          <Animated.View style={[styles.zoomPill, overlayStyle]} pointerEvents="none">
            <Text style={styles.zoomText}>{zoomLabel}</Text>
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={styles.legend}>
        <ChannelChip channel="R" color="#F87171" band={mapping.red} active={renderMode === 'false-color'} />
        <ChannelChip channel="G" color="#4ADE80" band={mapping.green} active={renderMode === 'false-color'} />
        <ChannelChip channel="B" color="#60A5FA" band={mapping.blue} active={renderMode === 'false-color'} />
        {renderMode === 'ndvi' ? <Text style={styles.legendNote}>NDVI colour ramp</Text> : null}
      </View>

      <Text style={styles.hint}>Drag to pan · pinch to zoom · double-tap to reset</Text>
    </View>
  );
}

function ChannelChip({
  channel,
  color,
  band,
  active,
}: {
  channel: string;
  color: string;
  band: number;
  active: boolean;
}) {
  return (
    <View style={[styles.chip, { borderColor: active ? `${color}88` : colors.border }]}>
      <View style={[styles.chipDot, { backgroundColor: active ? color : colors.textFaint }]} />
      <Text style={styles.chipChannel}>{channel}</Text>
      <Text style={styles.chipBand}>{bandName(band)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },

  canvasHost: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.canvasBackdrop,
    borderWidth: 1,
    borderColor: colors.border,
  },
  canvasFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  fallbackText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },

  zoomPill: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(5, 9, 8, 0.72)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  zoomText: { ...typography.caption, color: colors.text, fontWeight: '700' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipChannel: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  chipBand: { ...typography.caption, color: colors.text },
  legendNote: { ...typography.caption, color: colors.textMuted },

  hint: { ...typography.caption, color: colors.textFaint },
});

export default MultispectralViewer;
