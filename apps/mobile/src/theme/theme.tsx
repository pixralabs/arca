/**
 * @file apps/mobile/src/theme/theme.tsx
 * @description Master UI/UX Design System — "Pure Monochrome Ultra-Premium" (Apple/Vercel/Luxury Banking style).
 * Strictly Black, White, and Zinc shades (#09090b, #18181b, #27272a, #ffffff).
 * Supports Dark & Light modes via `useColorScheme()`, Inter typography with tight tracking (-0.5),
 * pill-shaped buttons (radius 9999, minHeight 52), curvy 24px cards, >=48x48px touch targets,
 * tactile haptics (`react-native-haptic-feedback`), and 60fps `react-native-reanimated` primitives.
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
import { SafeAreaView } from '../components/SafeAreaView';
export { SafeAreaView };
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ColorSchemeMode = 'dark' | 'light';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface ThemeColors {
  // Core Surfaces
  background: string;        // #09090b in Dark, #ffffff in Light
  surface: string;           // #18181b in Dark, #f4f4f5 in Light
  card: string;              // Alias for surface
  surfaceElevated: string;   // Elevated sheet / modal surface
  surfaceSubtle: string;     // Subtle pill / secondary fill
  inputBackground: string;   // Input fill
  border: string;            // 1px structural glass border (#27272a dark / #e4e4e7 light)
  borderSubtle: string;      // Muted divider

  // Primary Brand Accent: Strictly Monochrome (Pure White in Dark, Pure Black in Light)
  primary: string;           // #ffffff in Dark, #000000 in Light
  primaryHover: string;      // #e4e4e7 in Dark, #27272a in Light
  primaryGlow: string;       // Subtle monochrome badge fill
  primaryBorderGlow: string; // Subtle monochrome focus ring
  onPrimary: string;         // #000000 in Dark, #ffffff in Light

  // Typography
  text: string;              // #ffffff dark / #000000 light
  textHeading: string;       // #ffffff dark / #000000 light
  textMuted: string;         // #a1a1aa dark / #52525b light
  textDim: string;           // #71717a placeholders

  // Semantic & Status Accents
  danger: string;            // Soft Red (#ef4444) for destructive actions
  dangerGlow: string;
  dangerBorder: string;
  warning: string;           // Monochrome light zinc for warnings
  warningGlow: string;

  // Legacy Accent aliases (mapped strictly to Monochrome Zincs so no purple/indigo leaks)
  accentIndigo: string;
  accentIndigoGlow: string;
  accentViolet: string;
  accentVioletGlow: string;
  accentZinc: string;
  accentZincGlow: string;
  floatingBar: string;
  backdrop: string;

  // Skeleton Shimmer Tokens
  skeletonBase: string;
  skeletonHighlight: string;
}

export const darkColors: ThemeColors = {
  background: '#09090b',      // Zinc-950 Deep Charcoal / Black
  surface: '#18181b',         // Zinc-900 Dark Charcoal Card Surface
  card: '#18181b',            // Zinc-900
  surfaceElevated: '#27272a', // Zinc-800
  surfaceSubtle: '#27272a',   // Zinc-800
  inputBackground: '#18181b', // Zinc-900
  border: '#27272a',          // 1px Glass Border in Dark Mode
  borderSubtle: '#3f3f46',    // Zinc-700

  primary: '#ffffff',         // Pure White Primary Accent
  primaryHover: '#e4e4e7',    // Zinc-200
  primaryGlow: 'rgba(255, 255, 255, 0.08)',
  primaryBorderGlow: 'rgba(255, 255, 255, 0.28)',
  onPrimary: '#000000',       // Pure Black text/icon on White button

  text: '#ffffff',            // Pure White
  textHeading: '#ffffff',     // Pure White
  textMuted: '#a1a1aa',       // Muted Grey (Zinc-400)
  textDim: '#71717a',         // Dim Grey (Zinc-500)

  danger: '#ef4444',
  dangerGlow: 'rgba(239, 68, 68, 0.14)',
  dangerBorder: 'rgba(239, 68, 68, 0.38)',
  warning: '#d4d4d8',
  warningGlow: 'rgba(212, 212, 216, 0.12)',

  accentIndigo: '#ffffff',
  accentIndigoGlow: 'rgba(255, 255, 255, 0.08)',
  accentViolet: '#e4e4e7',
  accentVioletGlow: 'rgba(228, 228, 231, 0.08)',
  accentZinc: '#a1a1aa',
  accentZincGlow: 'rgba(161, 161, 170, 0.12)',
  floatingBar: 'rgba(9, 9, 11, 0.94)',
  backdrop: 'rgba(0, 0, 0, 0.82)',

  skeletonBase: '#18181b',
  skeletonHighlight: '#27272a',
};

export const lightColors: ThemeColors = {
  background: '#ffffff',      // Pure White
  surface: '#f4f4f5',         // Light Grey (Zinc-100) Card Surface
  card: '#f4f4f5',            // Light Grey (Zinc-100)
  surfaceElevated: '#ffffff', // Pure White elevated sheet
  surfaceSubtle: '#e4e4e7',   // Zinc-200 subtle fill
  inputBackground: '#f4f4f5', // Light Grey input
  border: '#e4e4e7',          // 1px Subtle Border in Light Mode
  borderSubtle: '#d4d4d8',    // Zinc-300

  primary: '#000000',         // Pure Black Primary Accent
  primaryHover: '#27272a',    // Zinc-800
  primaryGlow: 'rgba(0, 0, 0, 0.06)',
  primaryBorderGlow: 'rgba(0, 0, 0, 0.22)',
  onPrimary: '#ffffff',       // Pure White text/icon on Black button

  text: '#000000',            // Pure Black
  textHeading: '#000000',     // Pure Black
  textMuted: '#52525b',       // Muted Grey (Zinc-600)
  textDim: '#71717a',         // Dim Grey (Zinc-500)

  danger: '#dc2626',
  dangerGlow: 'rgba(220, 38, 38, 0.10)',
  dangerBorder: 'rgba(220, 38, 38, 0.28)',
  warning: '#52525b',
  warningGlow: 'rgba(82, 82, 91, 0.10)',

  accentIndigo: '#000000',
  accentIndigoGlow: 'rgba(0, 0, 0, 0.06)',
  accentViolet: '#27272a',
  accentVioletGlow: 'rgba(39, 39, 42, 0.06)',
  accentZinc: '#52525b',
  accentZincGlow: 'rgba(82, 82, 91, 0.08)',
  floatingBar: 'rgba(255, 255, 255, 0.94)',
  backdrop: 'rgba(0, 0, 0, 0.50)',

  skeletonBase: '#f4f4f5',
  skeletonHighlight: '#e4e4e7',
};

export const colors: ThemeColors = darkColors;

export const typography = {
  fontFamily: 'Inter',
  largeTitle: {
    fontFamily: 'Inter',
    fontSize: 38,
    fontWeight: '900' as const,
    letterSpacing: -1.0,
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
  pill: 9999,
  full: 9999,
};

export const layout = {
  minButtonHeight: 52,
  minTouchTarget: 48,
  hitSlop: { top: 12, bottom: 12, left: 12, right: 12 },
};

export const HIT_SLOP = layout.hitSlop;

/**
 * Helper to guarantee top status bar clearance on Android & iOS
 * even when translucent StatusBar is active.
 */
export function getSafeTopPadding(extra: number = 12): number {
  if (Platform.OS === 'android') {
    return (StatusBar.currentHeight || 28) + extra;
  }
  return extra;
}

/* ── Theme Store & Persistence (AsyncStorage) ── */
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

let currentThemePreference: ThemePreference = 'system';
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

export function useThemeStore<T>(selector: (state: ThemeStoreState) => T): T {
  const [value, setValue] = React.useState(() => selector(themeStore.getState()));
  React.useEffect(() => {
    const unsub = themeStore.subscribe(() => {
      setValue(selector(themeStore.getState()));
    });
    return unsub;
  }, [selector]);
  return value;
}

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

export const theme = {
  dark: darkColors,
  light: lightColors,
  typography,
  spacing,
  radii,
  layout,
  hitSlop: HIT_SLOP,
};

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
  const { isDark } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1100 }),
      -1,
      true
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = 0.35 + progress.value * 0.55;
    return {
      opacity,
    };
  });

  return (
    <View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: isDark ? '#18181b' : '#f4f4f5',
          borderWidth: 1,
          borderColor: isDark ? '#27272a' : '#e4e4e7',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: isDark ? '#27272a' : '#e4e4e7',
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

/**
 * Premium Shimmering Vault Skeleton Loader matching the exact Vault Screen layout:
 * - Top Utility Bar: Quick Action Pills + Circular Menu
 * - Large "Passwords" Heading + Vault Badge
 * - Soft Grey Search Bar Pill
 * - Security Recommendations Card (24px curvy)
 * - 2x2 Grid of 4 Category Cards ("All", "Codes", "Security", "Deleted")
 */
export function VaultSkeletonLoader() {
  const { isDark } = useTheme();
  return (
    <View
      style={[
        skeletonStyles.container,
        { backgroundColor: isDark ? '#09090b' : '#ffffff' },
      ]}
    >
      {/* 1. Top Utility Row: Quick Actions + More Menu */}
      <View style={skeletonStyles.topBar}>
        <View style={skeletonStyles.pillRow}>
          <ShimmerSkeleton width={88} height={34} borderRadius={radii.pill} />
          <ShimmerSkeleton
            width={96}
            height={34}
            borderRadius={radii.pill}
            style={{ marginLeft: spacing.sm }}
          />
        </View>
        <ShimmerSkeleton width={38} height={38} borderRadius={radii.pill} />
      </View>

      {/* 2. Large "Passwords" Heading + Vault Badge */}
      <View style={skeletonStyles.headerRow}>
        <ShimmerSkeleton width={160} height={34} borderRadius={radii.md} />
        <ShimmerSkeleton width={105} height={28} borderRadius={radii.pill} />
      </View>

      {/* 3. Search Bar Pill */}
      <ShimmerSkeleton
        width="100%"
        height={46}
        borderRadius={radii.pill}
        style={{ marginBottom: spacing.lg }}
      />

      {/* 4. Security Audit Banner Card */}
      <ShimmerSkeleton
        width="100%"
        height={86}
        borderRadius={radii.card}
        style={{ marginBottom: spacing.lg }}
      />

      {/* 5. 2x2 Grid matching "All", "Codes", "Security", "Deleted" */}
      <View style={skeletonStyles.gridRow}>
        <ShimmerSkeleton width="48%" height={126} borderRadius={radii.card} />
        <ShimmerSkeleton width="48%" height={126} borderRadius={radii.card} />
      </View>
      <View style={skeletonStyles.gridRow}>
        <ShimmerSkeleton width="48%" height={126} borderRadius={radii.card} />
        <ShimmerSkeleton width="48%" height={126} borderRadius={radii.card} />
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
    paddingTop: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
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
    maxHeight: '90%',
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