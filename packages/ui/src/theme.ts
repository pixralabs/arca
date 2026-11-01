/**
 * @file packages/ui/src/theme.ts
 * @description Arca by Pixra — Premium Charcoal Theme Design System Tokens
 * (`bg-zinc-950` App base, `bg-zinc-900` Cards/Modals, `bg-zinc-900/80` Glassmorphism,
 * `border-zinc-800` & `border-zinc-700/50`, `text-zinc-50` Headings, `text-zinc-400` Subtitles,
 * `text-zinc-300` Body, and 3-Key Logo Accents: Emerald-500, Amber-500, and Rose-500).
 * Strictly uses Charcoal, Emerald, Amber, and Rose palette.
 */

export const DARK_TOKENS = {
  bgPrimary: '#09090B', // Zinc 950 (App Base)
  bgElevated: '#18181B', // Zinc 900 (Cards / Modals)
  bgGlass: 'rgba(24, 24, 27, 0.80)', // Zinc 900/80 + backdrop-blur-md
  textPrimary: '#FAFAFA', // Zinc 50 (Headings)
  textBody: '#D4D4D8', // Zinc 300 (Body)
  textMuted: '#A1A1AA', // Zinc 400 (Subtitles)
  borderDefault: '#27272A', // Zinc 800
  borderSubtle: 'rgba(63, 63, 70, 0.50)', // Zinc 700/50
  accentPrimary: '#10B981', // Emerald 500 (Green Key — Primary CTA)
  accentEmerald: '#10B981', // Emerald 500 (Green Key — Save, Fill, Unlock)
  accentWarning: '#F59E0B', // Amber 500 (Gold Key — 2FA Timer Ring, TOTP, Warnings)
  accentDanger: '#F43F5E', // Rose 500 (Red/Pink Key — Delete, Revoke, Errors, <5s TOTP)
  accentSuccess: '#10B981', // Emerald 500
  focusRing: '#10B981', // Emerald 500
  fontSans: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  fontMono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export const LIGHT_TOKENS = {
  bgPrimary: '#FAFAFA',
  bgElevated: '#FFFFFF',
  bgGlass: 'rgba(255, 255, 255, 0.85)',
  textPrimary: '#09090B',
  textBody: '#27272A',
  textMuted: '#52525B',
  borderDefault: '#E4E4E7',
  borderSubtle: 'rgba(212, 212, 216, 0.60)',
  accentPrimary: '#10B981',
  accentEmerald: '#059669',
  accentWarning: '#D97706',
  accentDanger: '#E11D48',
  accentSuccess: '#059669',
  focusRing: '#10B981',
  fontSans: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  fontMono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

/**
 * Logical CSS utility classes using inline-start (`ms-*`, `ps-*`, `text-start`)
 * and inline-end (`me-*`, `pe-*`, `text-end`) with Charcoal glassmorphism (`bg-zinc-900/80 backdrop-blur-md`).
 */
export const LOGICAL_CLASSES = {
  container: 'vg-container ps-4 pe-4 pt-3 pb-3 text-start bg-zinc-950 text-zinc-50 font-sans',
  card: 'vg-card ps-3.5 pe-3.5 pt-3 pb-3 rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md shadow-2xl text-start',
  rowBetween: 'vg-row flex items-center justify-between gap-2',
  iconSpacingStart: 'ms-2',
  iconSpacingEnd: 'me-2',
  focusRing:
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
} as const;
