/**
 * @file apps/mobile/src/theme/theme.tsx
 * @description Master UI/UX Design System — "Apple/Stripe Level" Zinc (#18181b) & Electric Indigo (#6366f1).
 * Features edgeless pill buttons (borderRadius: 999, minHeight: 52), 24px curvy cards,
 * proper touch targets (hitSlop), 60fps react-native-reanimated transitions, and haptics.
 */

import React, { useEffect, useRef } from 'react';
import {
  useColorScheme,
  View,
  StyleSheet,
  PanResponder,
  Dimensions,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ViewStyle,
  StyleProp,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  runOnJS,
} from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ColorSchemeMode = 'dark' | 'light';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface ThemeColors {
  background: string;        // #09090b (Zinc-950) in Dark, #fafafa in Light
  surface: string;           // #18181b (Zinc-900) in Dark, #ffffff in Light
  card: string;              // #18181b
  surfaceElevated: string;   // #27272a (Zinc-800)
  surfaceSubtle: string;     // #27272a
  inputBackground: string;   // #18181b
  border: string;            // #27272a
  borderSubtle: string;      // #3f3f46

  // Primary Brand Accent: Electric Indigo (#6366f1)
  primary: string;           // #6366f1
  primaryHover: string;      // #4f46e5
  primaryGlow: string;       // rgba(99, 102, 241, 0.18)
  primaryBorderGlow: string; // rgba(99, 102, 241, 0.45)
  onPrimary: string;         // #ffffff

  // Typography
  text: string;
  textHeading: string;
  textMuted: string;
  textDim: string;

  // Semantic & Status Accents
  danger: string;
  dangerGlow: string;
  dangerBorder: string;
  warning: string;
  warningGlow: string;
  success: string;
  successGlow: string;

  // Category Accents
  accentIndigo: string;
  accentIndigoGlow: string;
  accentViolet: string;
  accentVioletGlow: string;
  accentZinc: string;
  accentZincGlow: string;
  floatingBar: string;
  backdrop: string;

  skeletonBase: string;
  skeletonHighlight: string;
}

export const darkColors: ThemeColors = {
  background: '#000000',      // Pure OLED Black
  surface: '#121212',         // Deep Charcoal
  card: '#121212',            // Deep Charcoal
  surfaceElevated: '#1a1a1e', // Charcoal Elevated
  surfaceSubtle: '#18181b',   // Charcoal Subtle
  inputBackground: '#121212', // Charcoal Input
  border: '#27272a',          // Subtle Zinc-800
  borderSubtle: '#3f3f46',    // Zinc-700

  // Primary Brand Accent: Ultra-Clean Monochrome High-Contrast
  primary: '#ffffff',         // Pure White High Contrast
  primaryHover: '#e4e4e7',    // Zinc-200
  primaryGlow: 'rgba(255, 255, 255, 0.14)',
  primaryBorderGlow: 'rgba(255, 255, 255, 0.35)',
  onPrimary: '#000000',       // Deep Black on White CTA

  text: '#ffffff',            // Pure White
  textHeading: '#ffffff',     // Pure White
  textMuted: '#a1a1aa',       // Zinc-400 Subtext
  textDim: '#71717a',         // Zinc-500

  danger: '#ef4444',
  dangerGlow: 'rgba(239, 68, 68, 0.16)',
  dangerBorder: 'rgba(239, 68, 68, 0.42)',
  warning: '#f59e0b',
  warningGlow: 'rgba(245, 158, 11, 0.15)',
  success: '#10b981',
  successGlow: 'rgba(16, 185, 129, 0.16)',

  accentIndigo: '#ffffff',
  accentIndigoGlow: 'rgba(255, 255, 255, 0.14)',
  accentViolet: '#d4d4d8',
  accentVioletGlow: 'rgba(212, 212, 216, 0.14)',
  accentZinc: '#a1a1aa',
  accentZincGlow: 'rgba(161, 161, 170, 0.16)',
  floatingBar: 'rgba(10, 10, 12, 0.94)',
  backdrop: 'rgba(0, 0, 0, 0.88)',

  skeletonBase: '#121212',
  skeletonHighlight: '#27272a',
};

export const lightColors: ThemeColors = {
  background: '#fafafa',
  surface: '#ffffff',
  card: '#ffffff',
  surfaceElevated: '#f4f4f5',
  surfaceSubtle: '#f4f4f5',
  inputBackground: '#f4f4f5',
  border: '#e4e4e7',
  borderSubtle: '#d4d4d8',

  primary: '#09090b',         // Deep Black High Contrast
  primaryHover: '#18181b',    // Zinc-900
  primaryGlow: 'rgba(9, 9, 11, 0.08)',
  primaryBorderGlow: 'rgba(9, 9, 11, 0.25)',
  onPrimary: '#ffffff',       // Pure White on Black CTA

  text: '#09090b',
  textHeading: '#09090b',
  textMuted: '#71717a',
  textDim: '#a1a1aa',

  danger: '#ef4444',
  dangerGlow: 'rgba(239, 68, 68, 0.12)',
  dangerBorder: 'rgba(239, 68, 68, 0.32)',
  warning: '#f59e0b',
  warningGlow: 'rgba(245, 158, 11, 0.12)',
  success: '#10b981',
  successGlow: 'rgba(16, 185, 129, 0.12)',

  accentIndigo: '#09090b',
  accentIndigoGlow: 'rgba(9, 9, 11, 0.08)',
  accentViolet: '#27272a',
  accentVioletGlow: 'rgba(39, 39, 42, 0.08)',
  accentZinc: '#71717a',
  accentZincGlow: 'rgba(113, 113, 122, 0.12)',
  floatingBar: 'rgba(255, 255, 255, 0.94)',
  backdrop: 'rgba(9, 9, 11, 0.50)',

  skeletonBase: '#e4e4e7',
  skeletonHighlight: '#f4f4f5',
};

export const colors: ThemeColors = darkColors;

export const typography = {
  fontFamily: 'Inter',
  largeTitle: {
    fontFamily: 'Inter',
    fontSize: 34,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  heading1: {
    fontFamily: 'Inter',
    fontSize: 26,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  heading2: {
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  heading3: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: -0.5,
  },
  tileCount: {
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  tileTitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: -0.5,
  },
  body: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '400' as const,
    letterSpacing: -0.1,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: -0.1,
  },
  caption: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  card: 24,
  pill: 999, // Edgeless pill shape
  full: 999,
};

export const layout = {
  minButtonHeight: 52,
  minTouchTarget: 48,
  hitSlop: { top: 12, bottom: 12, left: 12, right: 12 },
};

export const HIT_SLOP = layout.hitSlop;

export function getSafeTopPadding(extra: number = 12): number {
  if (Platform.OS === 'android') {
    return (StatusBar.currentHeight || 28) + extra;
  }
  return extra;
}

export const THEME_PREFERENCE_STORAGE_KEY = '@arca_theme_preference';

export interface ThemeStoreState {
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
}

export interface ThemeContextValue {
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  activeTheme: 'dark' | 'light';
  isDark: boolean;
  mode: ColorSchemeMode;
  colors: ThemeColors;
  typography: typeof typography;
  spacing: typeof spacing;
  radii: typeof radii;
  layout: typeof layout;
  hitSlop: typeof HIT_SLOP;
}

let currentThemePreference: ThemePreference = 'dark';
const themeListeners = new Set<() => void>();

AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)
  .then((saved) => {
    if (saved === 'system' || saved === 'light' || saved === 'dark') {
      currentThemePreference = saved;
      themeListeners.forEach((fn) => fn());
    }
  })
  .catch(() => { });

export const themeStore = {
  getState: (): ThemeStoreState => ({
    themePreference: currentThemePreference,
    setThemePreference: (pref: ThemePreference) => {
      if (currentThemePreference === pref) return;
      currentThemePreference = pref;
      themeListeners.forEach((fn) => fn());
      AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, pref).catch(() => { });
    },
  }),
  subscribe: (listener: () => void) => {
    themeListeners.add(listener);
    return () => {
      themeListeners.delete(listener);
    };
  },
};

export function useTheme(): ThemeContextValue {
  const [themePreference, setThemePreferenceState] = React.useState<ThemePreference>(
    currentThemePreference
  );
  const systemScheme = useColorScheme();

  React.useEffect(() => {
    const unsub = themeStore.subscribe(() => {
      setThemePreferenceState(currentThemePreference);
    });
    return unsub;
  }, []);

  const setThemePreference = React.useCallback((pref: ThemePreference) => {
    themeStore.getState().setThemePreference(pref);
  }, []);

  const activeTheme: 'dark' | 'light' =
    themePreference === 'system'
      ? systemScheme === 'light'
        ? 'light'
        : 'dark'
      : themePreference;

  const isDark = activeTheme === 'dark';
  const activeColors = isDark ? darkColors : lightColors;

  return {
    themePreference,
    setThemePreference,
    activeTheme,
    isDark,
    mode: activeTheme as ColorSchemeMode,
    colors: activeColors,
    typography,
    spacing,
    radii,
    layout,
    hitSlop: HIT_SLOP,
  };
}

export type HapticFeedbackType =
  | 'impactLight'
  | 'impactMedium'
  | 'impactHeavy'
  | 'notificationSuccess'
  | 'notificationWarning'
  | 'notificationError'
  | 'selection';

const HAPTIC_OPTIONS = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export function triggerHaptic(type: HapticFeedbackType = 'impactLight'): void {
  try {
    ReactNativeHapticFeedback?.trigger?.(type, HAPTIC_OPTIONS);
  } catch {
    // Graceful no-op
  }
}

export function triggerLightHaptic(): void {
  triggerHaptic('impactLight');
}

export function triggerMediumHaptic(): void {
  triggerHaptic('impactMedium');
}

export function triggerSuccessHaptic(): void {
  triggerHaptic('notificationSuccess');
}

export function triggerErrorHaptic(): void {
  triggerHaptic('notificationError');
}

export interface AnimatedScreenProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  key?: React.Key;
}

export function AnimatedScreen({ children, style }: AnimatedScreenProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(18);
  const scale = useSharedValue(0.985);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 220 });
    translateY.value = withSpring(0, { damping: 20, stiffness: 210, mass: 0.8 });
    scale.value = withSpring(1, { damping: 20, stiffness: 210, mass: 0.8 });
  }, [opacity, scale, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}

export interface ShimmerSkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function ShimmerSkeleton({
  width = '100%',
  height = 20,
  borderRadius = radii.card,
  style,
}: ShimmerSkeletonProps) {
  const { colors: themeColors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 950 }), -1, true);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.55,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: themeColors.skeletonHighlight,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function VaultSkeletonLoader() {
  const { colors: themeColors } = useTheme();
  return (
    <View style={[skeletonStyles.container, { backgroundColor: themeColors.background }]}>
      <View style={skeletonStyles.topRow}>
        <ShimmerSkeleton width={160} height={42} borderRadius={radii.md} />
        <ShimmerSkeleton width={44} height={44} borderRadius={radii.pill} />
      </View>
      <ShimmerSkeleton
        width="100%"
        height={88}
        borderRadius={radii.card}
        style={{ marginBottom: spacing.lg }}
      />
      <View style={skeletonStyles.gridRow}>
        <ShimmerSkeleton width="48%" height={124} borderRadius={radii.card} />
        <ShimmerSkeleton width="48%" height={124} borderRadius={radii.card} />
      </View>
      <View style={skeletonStyles.gridRow}>
        <ShimmerSkeleton width="48%" height={124} borderRadius={radii.card} />
        <ShimmerSkeleton width="48%" height={124} borderRadius={radii.card} />
      </View>
    </View>
  );
}

export interface DraggableBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}

export function DraggableBottomSheet({
  visible,
  onClose,
  children,
}: DraggableBottomSheetProps) {
  const { colors: themeColors } = useTheme();
  const screenHeight = Dimensions.get('window').height || 800;
  const translateY = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.85 });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(screenHeight, { duration: 200 });
    }
  }, [visible, backdropOpacity, screenHeight, translateY]);

  const dismissSheet = () => {
    triggerLightHaptic();
    backdropOpacity.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(screenHeight, { duration: 200 }, () => {
      runOnJS(onClose)();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 110 || gestureState.vy > 0.85) {
          dismissSheet();
        } else {
          translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
        }
      },
    })
  ).current;

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TouchableWithoutFeedback onPress={dismissSheet}>
        <Animated.View
          style={[
            sheetStyles.backdrop,
            { backgroundColor: themeColors.backdrop },
            backdropAnimatedStyle,
          ]}
        />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={sheetStyles.keyboardWrapper}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            sheetStyles.sheetContainer,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
            },
            sheetAnimatedStyle,
          ]}
        >
          <View {...panResponder.panHandlers} style={sheetStyles.dragHandleArea}>
            <View
              style={[
                sheetStyles.dragHandlePill,
                { backgroundColor: themeColors.borderSubtle },
              ]}
            />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
});

const sheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '92%',
  },
  dragHandleArea: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandlePill: {
    width: 44,
    height: 5,
    borderRadius: radii.pill,
  },
});