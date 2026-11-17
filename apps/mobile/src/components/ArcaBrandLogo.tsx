/**
 * @file apps/mobile/src/components/ArcaBrandLogo.tsx
 * @description Official Arca 3D Realistic Padlock Brand Component.
 * Uses the clean isolated 3D metallic padlock from `icon_transparent.png`
 * with seamless alpha transparency, smooth lighting highlights, and keyhole cutout.
 */

import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

export interface ArcaBrandLogoProps {
  isDark?: boolean;
  size?: number;
}

export function ArcaBrandLogo({ size = 80 }: ArcaBrandLogoProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image
        source={require('../assets/icon_transparent.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
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
