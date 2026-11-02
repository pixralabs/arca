/**
 * @file apps/mobile/src/theme/theme.ts
 * @description Arca Mobile Design Tokens — Apple iOS 18 Passwords Dark Mode Palette
 * (`#09090b` Zinc-950 background, `#18181b` Zinc-900 cards, vibrant category icon tokens,
 * and backward-compatible Emerald/Amber/Rose accents).
 */

export const colors = {
  // Core Surfaces (Dark Mode First)
  background: '#09090b',      // Zinc-950 deep OLED charcoal-black
  surface: '#18181b',         // Zinc-900 elevated tile/card surface
  surfaceElevated: '#222226', // Floating bottom bar / modal sheet surface
  surfaceSubtle: '#27272a',   // Zinc-800 pressed/secondary surface
  border: '#27272a',          // Zinc-800 subtle hairline border
  borderSubtle: '#3f3f46',    // Zinc-700

  // Typography
  text: '#f4f4f5',            // Zinc-100 crisp primary text
  textMuted: '#a1a1aa',       // Zinc-400 top-right tile numbers & subtitles
  textDim: '#71717a',         // Zinc-500 placeholders & disabled labels

  // iOS 18 Passwords Category Tile Accents
  iosBlue: '#0a84ff',         // "All" category circle
  iosBlueGlow: 'rgba(10, 132, 255, 0.18)',
  iosGreen: '#30d158',        // "Passkeys" category circle
  iosGreenGlow: 'rgba(48, 209, 88, 0.18)',
  iosYellow: '#eab308',       // "Codes" (TOTP/2FA) category circle
  iosYellowGlow: 'rgba(234, 179, 8, 0.18)',
  iosSky: '#38bdf8',          // "Wi-Fi" category circle
  iosSkyGlow: 'rgba(56, 189, 248, 0.14)',
  iosRed: '#ef4444',          // "Security" category circle
  iosRedGlow: 'rgba(239, 68, 68, 0.18)',
  iosGray: '#71717a',         // "Deleted" category circle
  iosGrayGlow: 'rgba(113, 113, 122, 0.18)',
  iosOrange: '#f97316',       // Optional trash/archive accent

  // Existing Brand Tokens (Emerald / Amber / Rose)
  emerald: '#10b981',         // emerald-500
  emeraldHover: '#059669',    // emerald-600
  emeraldSubtle: 'rgba(16, 185, 129, 0.12)',

  amber: '#f59e0b',           // amber-500
  amberHover: '#d97706',      // amber-600
  amberSubtle: 'rgba(245, 158, 11, 0.12)',

  rose: '#f43f5e',            // rose-500
  roseHover: '#e11d48',       // rose-600
  roseSubtle: 'rgba(244, 63, 94, 0.12)',
};

export const typography = {
  fontFamily: 'Inter',
  largeTitle: {
    fontSize: 34,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
  },
  tileCount: {
    fontSize: 24,
    fontWeight: '600' as const,
    letterSpacing: -0.4,
  },
  tileTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
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
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};
