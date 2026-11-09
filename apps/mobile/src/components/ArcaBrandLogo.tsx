/**
 * @file apps/mobile/src/components/ArcaBrandLogo.tsx
 * @description Official Arca Brand Padlock Vector Component.
 * Strict Monochrome (Black & White) aesthetic preserving the iconic Arca brand identity:
 * - Rounded U-Shackle
 * - Chubby pill-shaped body
 * - Signature glossy shoulder highlight arc
 * - High-contrast central keyhole cutout
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Path, Circle, G } from 'react-native-svg';

export interface ArcaBrandLogoProps {
  isDark: boolean;
  size?: number;
}

export function ArcaBrandLogo({ isDark, size = 80 }: ArcaBrandLogoProps) {
  const lockColor = isDark ? '#FFFFFF' : '#000000';
  const keyholeColor = isDark ? '#000000' : '#FFFFFF';
  const glossColor = isDark ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.24)';
  const shackleGlossColor = isDark ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.32)';

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          shadowColor: isDark ? '#FFFFFF' : '#000000',
          shadowOpacity: isDark ? 0.22 : 0.16,
          shadowRadius: isDark ? 20 : 16,
          shadowOffset: { width: 0, height: isDark ? 0 : 5 },
          elevation: 6,
        },
      ]}
    >
      <Svg
        width={size}
        height={size}
        viewBox="120 76 272 328"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
      >
        {/* ── 1. Rounded U-Shackle ── */}
        <Path
          d="M188 232 V174 C188 134.235 218.445 102 256 102 C293.555 102 324 134.235 324 174 V232"
          stroke={lockColor}
          strokeWidth={32}
          strokeLinecap="round"
        />

        {/* Shackle Highlight Arc */}
        <Path
          d="M180 186 V172 C180 138 206 111 242 108"
          stroke={shackleGlossColor}
          strokeWidth={7.5}
          strokeLinecap="round"
        />

        {/* ── 2. Pill-Shaped Padlock Body ── */}
        <Rect
          x="130"
          y="208"
          width="252"
          height="186"
          rx="93"
          fill={lockColor}
        />

        {/* Body Signature Glossy Shoulder Highlight Arc */}
        <Path
          d="M153 278 C161 247 184 228 214 223"
          stroke={glossColor}
          strokeWidth={11}
          strokeLinecap="round"
        />

        {/* ── 3. High-Contrast Keyhole Cutout ── */}
        <G>
          <Circle cx="256" cy="288" r="17.5" fill={keyholeColor} />
          <Path
            d="M247.5 297 L243 329 C242.2 334.2 246 338.5 251.2 338.5 H260.8 C266 338.5 269.8 334.2 269 329 L264.5 297 Z"
            fill={keyholeColor}
          />
        </G>
      </Svg>
    </View>
  );
}

// Also export as ArcaMonochromeLogo for backwards compatibility
export { ArcaBrandLogo as ArcaMonochromeLogo };

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

