/**
 * Colours, type, spacing and shadows shared by every screen.
 *
 * `brand` is the only part a sibling product needs to swap (PinTask: Bone and
 * Ink with a red accent):
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
    // PinTask: Bone and Ink, one red accent. The check in the logo is #e8472b.
    brand: {
      primary: '#d9381e',
      primaryPressed: '#b62f19',
      primarySoft: '#f7e4dc',
      accent: '#e8472b',
      onPrimary: '#ffffff',
    },
    colors: {
      bg: '#f1ece2', // Bone
      card: '#faf7f1', // cards, inputs, sheets
      border: '#d9d2c3', // Sand
      borderStrong: '#aea89b',
      muted: '#ece6da',

      text: '#15130f', // Ink
      textSecondary: '#6b665b',
      textFaint: '#8a857a', // Stone

      danger: '#dc2626',
      dangerPressed: '#b91c1c',
      dangerSoft: '#fbe9e4',
      success: '#15803d',
      successSoft: '#ecf3e6',
      warning: '#b45309',
      warningSoft: '#faf0dc',
      info: '#2563eb',
      infoSoft: '#e9eef8',
      // Fills under a WHITE label (a red Delete button, a count badge, a swipe
      // pane). The same in both themes: the colours above are lightened in dark
      // mode to read as text on a dark surface, and white on them would sink.
      dangerFill: '#dc2626',
      successFill: '#16a34a',
      warningFill: '#b54708',

      // A dark surface that always carries white text (toasts).
      inverse: '#15130f',
      // The empty part of a progress bar; the edge of a primary-soft card.
      track: 'rgba(21, 19, 15, 0.08)',
      primaryBorder: '#f0beb2',
      dangerBorder: '#f3c4bb',

      overlay: 'rgba(21, 19, 15, 0.45)',
      white: '#ffffff',
    },
    // Soft avatar palette: [background, text].
    avatars: [
      ['#e6f2ea', '#047857'],
      ['#e8eef8', '#1d4ed8'],
      ['#f8ecd3', '#b45309'],
      ['#f7e6ee', '#be185d'],
      ['#ece8f6', '#6d28d9'],
      ['#e2eff6', '#0369a1'],
      ['#f7e4dc', '#b62f19'],
      ['#ece6da', '#444139'],
      ['#e4f1e4', '#15803d'],
      ['#f8e9da', '#c2410c'],
    ],
  },
  dark: {
    // The accent brighter, so it glows on the dark; Ink, not white, on it.
    brand: {
      primary: '#ff5a3c',
      primaryPressed: '#e54e32',
      primarySoft: '#3e251c',
      accent: '#ff5a3c',
      onPrimary: '#15130f',
    },
    colors: {
      bg: '#15130f', // Ink
      card: '#1f1c17',
      border: '#36322a',
      borderStrong: '#464239',
      muted: '#2c2821',

      text: '#f1ece2', // Bone
      textSecondary: '#a39d8f',
      textFaint: '#6f6a5e',

      danger: '#f87171',
      dangerPressed: '#ef4444',
      dangerSoft: '#3a1c17',
      success: '#4ade80',
      successSoft: '#162a1b',
      warning: '#fbbf24',
      warningSoft: '#352813',
      info: '#60a5fa',
      infoSoft: '#17233a',
      dangerFill: '#dc2626',
      successFill: '#16a34a',
      warningFill: '#b54708',

      inverse: '#36322a',
      track: 'rgba(255, 255, 255, 0.1)',
      primaryBorder: '#6d3224',
      dangerBorder: '#7f1d1d',

      overlay: 'rgba(0, 0, 0, 0.6)',
      white: '#ffffff',
    },
    avatars: [
      ['#16291f', '#6ee7b7'],
      ['#17233a', '#93c5fd'],
      ['#352813', '#fcd34d'],
      ['#36192a', '#f9a8d4'],
      ['#2a2140', '#c4b5fd'],
      ['#13283a', '#7dd3fc'],
      ['#3e251c', '#ff9b85'],
      ['#2c2821', '#d9d2c3'],
      ['#162a1b', '#86efac'],
      ['#3a2414', '#fdba74'],
    ],
  },
};

/** Which look is on: `mode` is the choice, `scheme` what it resolved to. */
export const theme = { mode: 'system', scheme: 'light', dark: false };

/** Product brand colours. */
export const brand = {};
export const colors = {};

// md / lg / xl / pill are the HRMS app's names for the same steps (its sheets
// are xl at the top), so a shape copied from there reads the same here.
export const radius = { card: 16, input: 12, button: 12, chip: 999, sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

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
      ios: { shadowColor: '#15130f', shadowOpacity: theme.dark ? 0.4 : 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
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
