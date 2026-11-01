/**
 * @file apps/mobile/src/theme/theme.ts
 * @description Arca Mobile Design Tokens matching Charcoal, Emerald, Amber, and Rose palette.
 */

export const colors = {
  background: '#09090b', // zinc-950
  surface: '#18181b',    // zinc-900
  surfaceSubtle: '#27272a', // zinc-800
  border: '#27272a',     // zinc-800
  borderSubtle: '#3f3f46', // zinc-700
  
  text: '#f4f4f5',       // zinc-100
  textMuted: '#a1a1aa',  // zinc-400
  textDim: '#71717a',    // zinc-500
  
  // Emerald Primary / Accent
  emerald: '#10b981',    // emerald-500
  emeraldHover: '#059669', // emerald-600
  emeraldSubtle: 'rgba(16, 185, 129, 0.12)',
  
  // Amber Warning / Gold Key
  amber: '#f59e0b',      // amber-500
  amberHover: '#d97706',  // amber-600
  amberSubtle: 'rgba(245, 158, 11, 0.12)',
  
  // Rose Destructive
  rose: '#f43f5e',       // rose-500
  roseHover: '#e11d48',  // rose-600
  roseSubtle: 'rgba(244, 63, 94, 0.12)',
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
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};
