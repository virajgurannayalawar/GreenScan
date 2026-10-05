import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import type { RootTabParamList } from './types';

/**
 * Hand-rolled SVG tab glyphs rather than an icon font package — three icons is
 * not worth another native dependency, and `react-native-svg` is already here.
 */
export function TabBarIcon({
  route,
  color,
  size = 24,
}: {
  route: keyof RootTabParamList;
  color: string;
  size?: number;
}) {
  const common = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  if (route === 'Scan') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" {...common} />
        <Path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" {...common} />
        <Path d="M21 16v2.5A2.5 2.5 0 0 1 18.5 21H16" {...common} />
        <Path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" {...common} />
        <Circle cx={12} cy={12} r={3.2} {...common} />
      </Svg>
    );
  }

  if (route === 'Profile') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={8} r={3.6} {...common} />
        <Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" {...common} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.5} {...common} />
      <Path d="M12 7.5V12l3 2" {...common} />
    </Svg>
  );
}

export default TabBarIcon;
