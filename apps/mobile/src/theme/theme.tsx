/**
 * @file apps/mobile/src/theme/theme.ts
 * @description Master UI/UX Design System — "Monochrome Ultra-Premium" (Vercel/Apple style).
 * Supports Dark & Light modes via `useColorScheme()`, Inter typography with tight tracking (-0.5),
 * pill-shaped buttons (radius 9999, minHeight 52), curvy 24px cards, >=48x48px touch targets,
 * tactile haptics (`react-native-haptic-feedback`), and 60fps `react-native-reanimated` primitives.
 * Primary accent: Pure White (#ffffff) in Dark, Pure Black (#000000) in Light — strictly monochrome.
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
  ViewStyle,
  StyleProp,
} from 'react-native';
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
  background: string;        // #000000 in Dark, #ffffff in Light
  surface: string;           // #111111 in Dark, #ffffff in Light
  card: string;              // Alias for surface
  surfaceElevated: string;   // Elevated sheet / floating bar surface
  surfaceSubtle: string;     // Soft grey input & secondary pill background
  inputBackground: string;   // Input fill — #1a1a1a dark / #f4f4f5 light
  border: string;            // Subtle structural hairline
  borderSubtle: string;      // Muted divider

  // Primary Brand Accent (Monochrome: White in Dark, Black in Light)
  primary: string;           // #ffffff dark / #000000 light
  primaryHover: string;      // Slightly dimmed primary
  primaryGlow: string;       // Subtle glow tint for focused inputs & badges
  primaryBorderGlow: string; // Focus ring border
  onPrimary: string;         // Text on primary button — #000000 dark / #ffffff light

  // Typography
  text: string;              // #ffffff dark / #000000 light
  textHeading: string;       // Pure white / pure black
  textMuted: string;         // #a1a1aa subtitles
  textDim: string;           // #71717a placeholders & hints

  // Semantic & Status Accents
  danger: string;            // Soft Red (#ef4444)
  dangerGlow: string;
  dangerBorder: string;
  warning: string;           // Amber (#f59e0b)
  warningGlow: string;

  // Accent tokens (kept for backward compat — now zinc-based)
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
  background: '#000000',      // Pure Black
  surface: '#111111',         // Near-black surface
  card: '#111111',
  surfaceElevated: '#1a1a1a', // Slightly lifted
  surfaceSubtle: '#1a1a1a',   // Input background
  inputBackground: '#1a1a1a', // Dark input fill
  border: '#222222',          // Hairline
  borderSubtle: '#333333',    // Divider

  primary: '#ffffff',         // Pure White — monochrome CTA
  primaryHover: '#e4e4e7',    // Slightly dimmed white
  primaryGlow: 'rgba(255, 255, 255, 0.08)',  // Subtle white glow badge
  primaryBorderGlow: 'rgba(255, 255, 255, 0.35)', // White focus ring
  onPrimary: '#000000',       // Black text on white button

  text: '#ffffff',            // Pure White
  textHeading: '#ffffff',     // Pure White
  textMuted: '#a1a1aa',       // Zinc-400 subtitles
  textDim: '#71717a',         // Zinc-500 placeholders

  danger: '#ef4444',
  dangerGlow: 'rgba(239, 68, 68, 0.14)',
  dangerBorder: 'rgba(239, 68, 68, 0.38)',
  warning: '#f59e0b',
  warningGlow: 'rgba(245, 158, 11, 0.14)',

  accentIndigo: '#a1a1aa',
  accentIndigoGlow: 'rgba(161, 161, 170, 0.16)',
  accentViolet: '#d4d4d8',
  accentVioletGlow: 'rgba(212, 212, 216, 0.14)',
  accentZinc: '#a1a1aa',
  accentZincGlow: 'rgba(161, 161, 170, 0.16)',
  floatingBar: 'rgba(0, 0, 0, 0.92)',
  backdrop: 'rgba(0, 0, 0, 0.78)',

  skeletonBase: '#111111',
  skeletonHighlight: '#1a1a1a',
};

export const lightColors: ThemeColors = {
  background: '#ffffff',      // Pure White
  surface: '#ffffff',         // White surface
  card: '#ffffff',
  surfaceElevated: '#f4f4f5', // Zinc-100
  surfaceSubtle: '#f4f4f5',   // Zinc-100 input bg
  inputBackground: '#f4f4f5', // Soft grey input
  border: '#e4e4e7',          // Zinc-200
  borderSubtle: '#d4d4d8',    // Zinc-300

  primary: '#000000',         // Pure Black — monochrome CTA
  primaryHover: '#27272a',    // Slightly lighter black
  primaryGlow: 'rgba(0, 0, 0, 0.06)',       // Subtle black glow badge
  primaryBorderGlow: 'rgba(0, 0, 0, 0.25)', // Black focus ring
  onPrimary: '#ffffff',       // White text on black button

  text: '#000000',            // Pure Black
  textHeading: '#000000',     // Pure Black
  textMuted: '#52525b',       // Zinc-600 subtitles
  textDim: '#71717a',         // Zinc-500 placeholders

  danger: '#ef4444',
  dangerGlow: 'rgba(239, 68, 68, 0.10)',
  dangerBorder: 'rgba(239, 68, 68, 0.30)',
  warning: '#f59e0b',
  warningGlow: 'rgba(245, 158, 11, 0.12)',

  accentIndigo: '#52525b',
  accentIndigoGlow: 'rgba(82, 82, 91, 0.12)',
  accentViolet: '#3f3f46',
  accentVioletGlow: 'rgba(63, 63, 70, 0.10)',
  accentZinc: '#71717a',
  accentZincGlow: 'rgba(113, 113, 122, 0.12)',
  floatingBar: 'rgba(255, 255, 255, 0.94)',
  backdrop: 'rgba(0, 0, 0, 0.45)',

  skeletonBase: '#e4e4e7',
  skeletonHighlight: '#f4f4f5',
};

// Default static colors export for non-hook consumers
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
  card: 24,     // Large 24px card radius (rounded-3xl)
  pill: 9999,   // Pill-shaped button radius (rounded-full)
  full: 9999,
};

export const layout = {
  minButtonHeight: 52, // Pill buttons MUST be >= 52px tall
  minTouchTarget: 48,  // Every interactive icon/button >= 48x48px
  hitSlop: { top: 12, bottom: 12, left: 12, right: 12 },
};

export const HIT_SLOP = layout.hitSlop;

// ─── Theme Store & Persistence (AsyncStorage) ──────────────────────────────────
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

// Load persisted preference once on module load
AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)
  .then((saved) => {
    if (saved === 'system' || saved === 'light' || saved === 'dark') {
      currentThemePreference = saved;
      themeListeners.forEach((fn) => fn());
    }
  })
  .catch(() => {});

export const themeStore = {
  getState: (): ThemeStoreState => ({
    themePreference: currentThemePreference,
    setThemePreference: (pref: ThemePreference) => {
      if (currentThemePreference === pref) return;
      currentThemePreference = pref;
      themeListeners.forEach((fn) => fn());
      AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, pref).catch(() => {});
    },
  }),
  subscribe: (listener: () => void) => {
    themeListeners.add(listener);
    return () => {
      themeListeners.delete(listener);
    };
  },
};

/**
 * Zustand-compatible global hook selector for theme state:
 * e.g. const themePref = useThemeStore(s => s.themePreference);
 */
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

/**
 * Centralized theme hook supporting 'system' | 'light' | 'dark' preferences,
 * persisted via AsyncStorage and reacting in real-time across the app.
 */
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
      ? (systemScheme === 'dark' ? 'dark' : 'light')
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

/**
 * Tactile Haptic Feedback helper wrapping `react-native-haptic-feedback`.
 * - `impactLight` for button clicks, copying passwords, or switching tabs/screens.
 * - `notificationSuccess` when a password or vault item is saved.
 */
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
    // Graceful no-op on unsupported test runners
  }
}

export function triggerLightHaptic(): void {
  triggerHaptic('impactLight');
}

export function triggerSuccessHaptic(): void {
  triggerHaptic('notificationSuccess');
}

export interface AnimatedScreenProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  key?: React.Key;
}

/**
 * Smooth Spring-Based Screen Transition Wrapper (`react-native-reanimated`).
 * Animates opacity and subtle slide-in when mounted.
 */
export function AnimatedScreen({
  children,
  style,
}: AnimatedScreenProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(18);
  const scale = useSharedValue(0.985);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 220 });
    translateY.value = withSpring(0, {
      damping: 20,
      stiffness: 210,
      mass: 0.8,
    });
    scale.value = withSpring(1, {
      damping: 20,
      stiffness: 210,
      mass: 0.8,
    });
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

/**
 * Shimmering Skeleton Box powered by `react-native-reanimated`.
 */
export function ShimmerSkeleton({
  width = '100%',
  height = 20,
  borderRadius = radii.card,
  style,
}: ShimmerSkeletonProps) {
  const { colors: themeColors } = useTheme();
  const pulse = useSharedValue(0.35);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 750 }),
        withTiming(0.35, { duration: 750 })
      ),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
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

/**
 * Full-screen Shimmering Vault Skeleton Loader displayed while the vault is unlocking or decrypting.
 */
export function VaultSkeletonLoader() {
  const { colors: themeColors } = useTheme();
  return (
    <View style={[skeletonStyles.container, { backgroundColor: themeColors.background }]}>
      <View style={skeletonStyles.topRow}>
        <ShimmerSkeleton width={96} height={36} borderRadius={radii.pill} />
        <ShimmerSkeleton width={110} height={36} borderRadius={radii.pill} />
        <ShimmerSkeleton width={48} height={48} borderRadius={radii.pill} />
      </View>
      <ShimmerSkeleton
        width={190}
        height={38}
        borderRadius={radii.md}
        style={{ marginBottom: spacing.lg }}
      />
      <ShimmerSkeleton
        width="100%"
        height={84}
        borderRadius={radii.card}
        style={{ marginBottom: spacing.lg }}
      />
      <View style={skeletonStyles.gridRow}>
        <ShimmerSkeleton width="48%" height={116} borderRadius={radii.card} />
        <ShimmerSkeleton width="48%" height={116} borderRadius={radii.card} />
      </View>
      <View style={skeletonStyles.gridRow}>
        <ShimmerSkeleton width="48%" height={116} borderRadius={radii.card} />
        <ShimmerSkeleton width="48%" height={116} borderRadius={radii.card} />
      </View>
    </View>
  );
}

export interface DraggableBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}

/**
 * Smooth Drag-to-Dismiss Bottom Sheet powered by `react-native-reanimated` & `PanResponder`.
 * Replaces rigid modals with a spring-animated sheet that scrolls up with the keyboard.
 */
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
      translateY.value = withSpring(0, {
        damping: 22,
        stiffness: 220,
        mass: 0.85,
      });
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
          translateY.value = withSpring(0, {
            damping: 22,
            stiffness: 220,
          });
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