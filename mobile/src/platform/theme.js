/**
 * Colours, type, spacing and shadows shared by every screen.
 *
 * `brand` is the only part a sibling product (e.g. Task Pro) needs to swap:
 * everything else is the neutral design language from the design brief.
 */
import { Platform } from 'react-native';

/** Product brand colours (Task Pro: indigo). */
export const brand = {
  primary: '#4f46e5',
  primaryPressed: '#4338ca',
  primarySoft: '#eef2ff',
  accent: '#6366f1',
  onPrimary: '#ffffff',
};

export const colors = {
  ...brand,
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  muted: '#f1f5f9',

  text: '#0f172a',
  textSecondary: '#64748b',
  textFaint: '#94a3b8',

  danger: '#dc2626',
  dangerPressed: '#b91c1c',
  dangerSoft: '#fef2f2',
  success: '#15803d',
  successSoft: '#f0fdf4',
  warning: '#b45309',
  warningSoft: '#fffbeb',
  info: '#2563eb',
  infoSoft: '#eff6ff',

  overlay: 'rgba(15, 23, 42, 0.45)',
  white: '#ffffff',
};

export const radius = { card: 16, input: 12, button: 12, chip: 999, sm: 8 };

/** 4px grid. */
export const space = (n) => n * 4;

export const font = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

/** Money and counts line up in columns. */
export const tabular = { fontVariant: ['tabular-nums'] };

export const type = {
  display: { fontSize: 32, fontWeight: font.bold, color: colors.text, letterSpacing: -0.5, ...tabular },
  title: { fontSize: 22, fontWeight: font.bold, color: colors.text },
  heading: { fontSize: 18, fontWeight: font.semibold, color: colors.text },
  body: { fontSize: 16, fontWeight: font.regular, color: colors.text },
  bodyStrong: { fontSize: 16, fontWeight: font.semibold, color: colors.text },
  small: { fontSize: 14, fontWeight: font.regular, color: colors.textSecondary },
  caption: { fontSize: 13, fontWeight: font.regular, color: colors.textSecondary },
  label: { fontSize: 14, fontWeight: font.medium, color: colors.text },
  overline: { fontSize: 12, fontWeight: font.semibold, color: colors.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase' },
};

/** A very soft card shadow. */
export const shadow = Platform.select({
  ios: { shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  default: { elevation: 1 },
});

export const shadowRaised = Platform.select({
  ios: { shadowColor: '#0f172a', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  default: { elevation: 6 },
});

/** Minimum tap target (accessibility). */
export const TAP = 44;

/** Soft avatar palette: [background, text]. */
export const avatarPalette = [
  ['#ecfdf5', '#047857'],
  ['#eff6ff', '#1d4ed8'],
  ['#fef3c7', '#b45309'],
  ['#fce7f3', '#be185d'],
  ['#ede9fe', '#6d28d9'],
  ['#e0f2fe', '#0369a1'],
  ['#fee2e2', '#b91c1c'],
  ['#f1f5f9', '#334155'],
  ['#dcfce7', '#15803d'],
  ['#ffedd5', '#c2410c'],
];

/** Colours for the React Navigation theme (merged into its DefaultTheme). */
export const navigationColors = {
  primary: colors.primary,
  background: colors.bg,
  card: colors.card,
  text: colors.text,
  border: colors.border,
  notification: colors.danger,
};
