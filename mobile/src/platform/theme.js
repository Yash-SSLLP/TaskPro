/**
 * Colours, type, spacing and shadows shared by every screen.
 *
 * `brand` is the only part a sibling product (e.g. Task Pro) needs to swap:
 * everything else is the neutral design language from the design brief.
 *
 * LIGHT AND DARK. The person picks System / Light / Dark (More → Appearance).
 * The choice is saved under THEME_KEY and applied ONCE at startup by
 * initTheme(), which index.js calls BEFORE it requires the app, so every
 * screen's module-level StyleSheet.create is built with the right palette.
 * The objects below are filled in place, never replaced, so `import { colors }`
 * always sees the chosen values. Changing the choice restarts the app.
 */
import { Appearance, Platform } from 'react-native';

export const THEME_KEY = 'taskpro.theme';
/** The choices, in the order they are offered. */
export const THEME_MODES = ['system', 'light', 'dark'];

const palettes = {
  light: {
    // Product brand colours (Task Pro: indigo).
    brand: {
      primary: '#4f46e5',
      primaryPressed: '#4338ca',
      primarySoft: '#eef2ff',
      accent: '#6366f1',
      onPrimary: '#ffffff',
    },
    colors: {
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
      // Fills under a WHITE label (a red Delete button, a count badge). The same
      // in both themes: the colours above are lightened in dark mode to read as
      // text on a dark surface, and white on them would sink.
      dangerFill: '#dc2626',
      successFill: '#15803d',
      warningFill: '#b45309',

      // A dark surface that always carries white text (toasts).
      inverse: '#0f172a',
      // The empty part of a progress bar; the edge of a primary-soft card.
      track: 'rgba(15, 23, 42, 0.08)',
      primaryBorder: '#c7d2fe',
      dangerBorder: '#fecaca',

      overlay: 'rgba(15, 23, 42, 0.45)',
      white: '#ffffff',
    },
    // Soft avatar palette: [background, text].
    avatars: [
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
    ],
  },
  dark: {
    // Indigo a step lighter, so it reads on the dark surface and still carries
    // a white label.
    brand: {
      primary: '#6366f1',
      primaryPressed: '#4f46e5',
      primarySoft: '#1e1b4b',
      accent: '#818cf8',
      onPrimary: '#ffffff',
    },
    colors: {
      bg: '#0b1120',
      card: '#141c2f',
      border: '#263248',
      borderStrong: '#334155',
      muted: '#1e293b',

      text: '#e2e8f0',
      textSecondary: '#94a3b8',
      textFaint: '#64748b',

      danger: '#f87171',
      dangerPressed: '#ef4444',
      dangerSoft: '#3b1518',
      success: '#4ade80',
      successSoft: '#0f2e1d',
      warning: '#fbbf24',
      warningSoft: '#3a2a0c',
      info: '#60a5fa',
      infoSoft: '#13233f',
      dangerFill: '#dc2626',
      successFill: '#15803d',
      warningFill: '#b45309',

      inverse: '#334155',
      track: 'rgba(255, 255, 255, 0.1)',
      primaryBorder: '#3730a3',
      dangerBorder: '#7f1d1d',

      overlay: 'rgba(0, 0, 0, 0.6)',
      white: '#ffffff',
    },
    avatars: [
      ['#0f2e24', '#6ee7b7'],
      ['#13233f', '#93c5fd'],
      ['#3a2a0c', '#fcd34d'],
      ['#3b1530', '#f9a8d4'],
      ['#2a1f4d', '#c4b5fd'],
      ['#0c2a3a', '#7dd3fc'],
      ['#3b1518', '#fca5a5'],
      ['#1e293b', '#cbd5e1'],
      ['#0f2e1d', '#86efac'],
      ['#3a1e0c', '#fdba74'],
    ],
  },
};

/** Which look is on: `mode` is the choice, `scheme` what it resolved to. */
export const theme = { mode: 'system', scheme: 'light', dark: false };

/** Product brand colours. */
export const brand = {};
export const colors = {};

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
  display: { fontSize: 32, fontWeight: font.bold, letterSpacing: -0.5, ...tabular },
  title: { fontSize: 22, fontWeight: font.bold },
  heading: { fontSize: 18, fontWeight: font.semibold },
  body: { fontSize: 16, fontWeight: font.regular },
  bodyStrong: { fontSize: 16, fontWeight: font.semibold },
  small: { fontSize: 14, fontWeight: font.regular },
  caption: { fontSize: 13, fontWeight: font.regular },
  label: { fontSize: 14, fontWeight: font.medium },
  overline: { fontSize: 12, fontWeight: font.semibold, letterSpacing: 0.4, textTransform: 'uppercase' },
};
const SECONDARY_TYPE = ['small', 'caption', 'overline'];

/** A very soft card shadow. */
export const shadow = {};
export const shadowRaised = {};

/** Minimum tap target (accessibility). */
export const TAP = 44;

/** Soft avatar palette: [background, text]. */
export const avatarPalette = [];

/** Colours for the React Navigation theme (merged into its Default or Dark theme). */
export const navigationColors = {};

/** Apply a choice: 'system' follows the phone's setting. */
export function initTheme(mode = 'system') {
  const chosen = THEME_MODES.includes(mode) ? mode : 'system';
  const scheme = chosen === 'system' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : chosen;
  const p = palettes[scheme];
  Object.assign(theme, { mode: chosen, scheme, dark: scheme === 'dark' });

  Object.assign(brand, p.brand);
  Object.assign(colors, p.brand, p.colors);
  for (const [key, style] of Object.entries(type)) style.color = SECONDARY_TYPE.includes(key) ? colors.textSecondary : colors.text;

  Object.assign(
    shadow,
    Platform.select({
      ios: { shadowColor: '#0f172a', shadowOpacity: theme.dark ? 0.4 : 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      default: { elevation: 1 },
    })
  );
  Object.assign(
    shadowRaised,
    Platform.select({
      ios: { shadowColor: '#000000', shadowOpacity: theme.dark ? 0.5 : 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      default: { elevation: 6 },
    })
  );
  avatarPalette.splice(0, avatarPalette.length, ...p.avatars);
  Object.assign(navigationColors, {
    primary: colors.primary,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.dangerFill,
  });
  return theme;
}

// The phone's setting until index.js applies the saved choice.
initTheme('system');
