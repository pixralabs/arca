/**
 * @file apps/mobile/src/components/SafeAreaView.tsx
 * @description Safe Area Container wrapping `useSafeAreaInsets()` from `react-native-safe-area-context`.
 * Provides full notch, status bar, and navigation bar insets without invoking the buggy C++
 * RNCSafeAreaViewShadowNode in Yoga / React Native 0.81.
 */

import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface SafeAreaViewProps {
  children?: React.ReactNode;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
  style?: StyleProp<ViewStyle>;
}

export function SafeAreaView({
  children,
  edges = ['top', 'bottom'],
  style,
}: SafeAreaViewProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        style,
        {
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
          paddingLeft: edges.includes('left') ? insets.left : 0,
          paddingRight: edges.includes('right') ? insets.right : 0,
        },
      ]}
    >
      {children}
    </View>
  );
}

export default SafeAreaView;

