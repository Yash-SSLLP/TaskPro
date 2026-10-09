/**
 * Colours, type, spacing and shadows shared by every screen.
 *
 * `brand` is the only part a sibling product needs to swap (KARO:
 * Salesforce's blues, navy in the dark):
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
    // KARO: Salesforce's blues. #0176d3 is its brand blue, #066afe the bright
    // blue of its hero panels (the check in the logo).
    brand: {
      primary: '#0176d3',
      primaryPressed: '#014486',
      primarySoft: '#eaf5fe',
      accent: '#066afe',
      onPrimary: '#ffffff',
    },
    colors: {
      bg: '#f3f3f3', // Salesforce's neutral page
      card: '#ffffff', // cards, inputs, sheets
      border: '#e5e5e5',
      borderStrong: '#c9c9c9',
      muted: '#eef1f6',

      text: '#181818',
      textSecondary: '#5c5c5c',
      textFaint: '#747474',

      danger: '#ea001e',
      dangerPressed: '#ba0517',
      dangerSoft: '#fef1ee',
      success: '#2e844a',
      successSoft: '#ebf7e6',
      warning: '#a86403',
      warningSoft: '#fbf3e0',
      info: '#0b5cab',
      infoSoft: '#eef4ff',
      // Fills under a WHITE label (a red Delete button, a count badge, a swipe
      // pane). The same in both themes: the colours above are lightened in dark
      // mode to read as text on a dark surface, and white on them would sink.
      dangerFill: '#ea001e',
      successFill: '#2e844a',
      warningFill: '#a86403',

      // A dark surface that always carries white text (toasts): the navy.
      inverse: '#032d60',
      // The empty part of a progress bar; the edge of a primary-soft card.
      track: 'rgba(3, 45, 96, 0.08)',
      primaryBorder: '#aacbff',
      dangerBorder: '#feb8ab',

      overlay: 'rgba(0, 22, 57, 0.45)',
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
      ['#eaf5fe', '#014486'],
      ['#eef1f6', '#444444'],
      ['#e4f1e4', '#15803d'],
      ['#f8e9da', '#c2410c'],
    ],
  },
  dark: {
    // Salesforce's navy, with its lighter "cloud" blue as the accent and the
    // navy, not white, on it.
    brand: {
      primary: '#1b96ff',
      primaryPressed: '#0176d3',
      primarySoft: '#093970',
      accent: '#1b96ff',
      onPrimary: '#001639',
    },
    colors: {
      bg: '#001639', // navy
      card: '#04224c',
      border: '#1c3d6b',
      borderStrong: '#2b4f80',
      muted: '#0d2b55',

      text: '#eef4ff',
      textSecondary: '#a8b8d0',
      textFaint: '#6f84a6',

      danger: '#fe8f7d',
      dangerPressed: '#fe5c4c',
      dangerSoft: '#321b43',
      success: '#91db8b',
      successSoft: '#0f3b4c',
      warning: '#fcc003',
      warningSoft: '#2d333a',
      info: '#78b0fd',
      infoSoft: '#033b75',
      dangerFill: '#ea001e',
      successFill: '#2e844a',
      warningFill: '#a86403',

      inverse: '#1c3d6b',
      track: 'rgba(255, 255, 255, 0.1)',
      primaryBorder: '#0d5094',
      dangerBorder: '#60143a',

      overlay: 'rgba(0, 8, 24, 0.6)',
      white: '#ffffff',
    },
    avatars: [
      ['#0d3436', '#6ee7b7'],
      ['#0b2f5e', '#93c5fd'],
      ['#2c3030', '#fcd34d'],
      ['#2e2347', '#f9a8d4'],
      ['#1f2a5e', '#c4b5fd'],
      ['#08345a', '#7dd3fc'],
      ['#0b2f5e', '#78b0fd'],
      ['#0d2b55', '#c9d4e5'],
      ['#0e3a35', '#86efac'],
      ['#33302a', '#fdba74'],
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
      ios: { shadowColor: '#032d60', shadowOpacity: theme.dark ? 0.4 : 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
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
