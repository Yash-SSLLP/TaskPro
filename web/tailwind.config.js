/** @type {import('tailwindcss').Config} */
// Brand colours come from CSS variables (src/index.css), so the same UI kit
// serves both Seq Book (emerald) and KARO (Salesforce's blues).
//
// LIGHT AND DARK: every colour the pages use is a CSS variable, so one class
// on <html> (`dark`, set by src/platform/theme.js) re-themes the whole app
// without a `dark:` variant on each element. The neutrals (slate) are
// Salesforce's greys, with WhatsApp's dark greys in the dark. On the other hues the dark theme works the way the HRMS
// web app does (its index.css "Dark mode COLOUR accuracy"): the pale tints
// (50-300, the washes behind chips, banners and selected tiles) become a soft
// wash of the hue over the dark card instead of a deep, muddy block; the inks
// (700-950) turn light so coloured text reads; 400-600 stay, so a solid button
// keeps its white label. Text set in 500/600 is lifted to 400 on its own (see
// the remap below), since the same step also fills buttons; a 700/800 FILL (a
// button's hover) keeps its light value for the same reason. The status hues
// go further (DARK_INKS): one WhatsApp-style ink per meaning.
import plugin from 'tailwindcss/plugin';
import palette from 'tailwindcss/colors';

const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgb = (hex) => hexRgb(hex).join(' ');
/** `a` laid over `b` at strength `t`, as "r g b". */
const mix = (a, b, t) => {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return A.map((x, i) => Math.round(x * t + B[i] * (1 - t))).join(' ');
};

// The dark card (src/index.css --card): the surface the washes are mixed into.
const DARK_CARD = '#111b21';

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const HUES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'rose'];
// Salesforce's neutral greys (its design system's neutral palette) in place of
// the cool slate: #f3f3f3 page, #e5e5e5 lines, #747474 / #5c5c5c muted text,
// #181818 ink.
const LIGHT_SLATE = {
  50: '#f8f8f8',
  100: '#f3f3f3',
  200: '#e5e5e5',
  300: '#c9c9c9',
  400: '#aeaeae',
  500: '#747474',
  600: '#5c5c5c',
  700: '#444444',
  800: '#2e2e2e',
  900: '#242424',
  950: '#181818',
};
// WhatsApp's dark greys, from its raised surfaces up to its text.
const DARK_SLATE = {
  50: '#182229',
  100: '#202c33',
  200: '#2a3942',
  300: '#374248',
  400: '#54656f',
  500: '#8696a0',
  600: '#aebac1',
  700: '#d1d7db',
  800: '#e1e5e8',
  900: '#e9edef',
  950: '#f7f8fa',
};

// The status hues' inks in the dark, one per meaning: amber waiting (not
// accepted yet, medium), sky in progress, violet under review, green done, red
// overdue / declined / urgent, orange more time asked / sent back. Blue chips
// are In progress, so blue takes the sky ink too.
const DARK_INKS = {
  amber: '#ffd279',
  sky: '#53bdeb',
  blue: '#53bdeb',
  violet: '#a791ff',
  green: '#3dd68c',
  red: '#ff6b78',
  orange: '#ffa056',
};

/** One hue's dark scale. */
function darkHue(hue) {
  const p = palette[hue];
  const ink = DARK_INKS[hue];
  if (ink) {
    // The chip's wash (16%), an icon's circle (20%), its edge (45%); the ink
    // for text, dots and lifted 500/600 text; 600 stays a fill under white.
    return {
      50: mix(ink, DARK_CARD, 0.16),
      100: mix(ink, DARK_CARD, 0.2),
      200: mix(ink, DARK_CARD, 0.45),
      300: mix(ink, DARK_CARD, 0.6),
      400: rgb(ink),
      500: rgb(ink),
      600: rgb(p[600]),
      700: rgb(ink),
      800: mix('#ffffff', ink, 0.3),
      900: mix('#ffffff', ink, 0.55),
      950: mix('#ffffff', ink, 0.8),
    };
  }
  return {
    50: mix(p[500], DARK_CARD, 0.12),
    100: mix(p[500], DARK_CARD, 0.18),
    200: mix(p[500], DARK_CARD, 0.3),
    300: mix(p[400], DARK_CARD, 0.5),
    400: rgb(p[400]),
    500: rgb(p[500]),
    600: rgb(p[600]),
    700: rgb(p[300]),
    800: rgb(p[200]),
    900: rgb(p[100]),
    950: rgb(p[50]),
  };
}

const scale = (hue) => Object.fromEntries(SHADES.map((s) => [s, v(`${hue}-${s}`)]));

const scaleVars = plugin(({ addBase }) => {
  const light = {};
  const dark = {};
  for (const s of SHADES) {
    light[`--slate-${s}`] = rgb(LIGHT_SLATE[s]);
    dark[`--slate-${s}`] = rgb(DARK_SLATE[s]);
  }
  for (const hue of HUES) {
    const d = darkHue(hue);
    for (const s of SHADES) {
      light[`--${hue}-${s}`] = rgb(palette[hue][s]);
      dark[`--${hue}-${s}`] = d[s];
    }
  }
  // Coloured TEXT in 500/600 reads at the 400 step on the dark card (a 600
  // label on #141c2f sits near 4:1). Fills keep 500/600 for their white label.
  const textLift = {};
  for (const hue of HUES) {
    for (const s of ['500', '600']) {
      const lifted = { color: `rgb(var(--${hue}-400) / var(--tw-text-opacity, 1))` };
      textLift[`html.dark .text-${hue}-${s}`] = lifted;
      textLift[`html.dark .hover\\:text-${hue}-${s}:hover`] = lifted;
    }
  }
  // A FILL in 700/800 is a solid button's hover, under a white label: it keeps
  // its light value. The dark scale turns those steps pale for text, which
  // would leave the label white on pink.
  const fillKeep = {};
  for (const hue of HUES) {
    for (const s of ['700', '800']) {
      const kept = { 'background-color': `rgb(${rgb(palette[hue][s])} / var(--tw-bg-opacity, 1))` };
      fillKeep[`html.dark .bg-${hue}-${s}`] = kept;
      fillKeep[`html.dark .hover\\:bg-${hue}-${s}:hover`] = kept;
    }
  }
  addBase({ ':root': light, 'html.dark': dark, ...textLift, ...fillKeep });
});

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: { DEFAULT: v('brand'), dark: v('brand-dark'), soft: v('brand-soft'), accent: v('brand-accent') },
        // Text and icons on a brand fill: white in the light theme, Ink in the dark.
        'on-brand': v('on-brand'),
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), faint: v('ink-faint') },
        line: v('line'),
        page: v('page'),
        // A raised surface: cards, dialogs, inputs. White in the light theme.
        card: v('card'),
        // A step off the card: table heads, footers, wells, hovered rows.
        well: v('well'),
        cashin: { DEFAULT: '#047857', soft: '#ecfdf5' },
        cashout: { DEFAULT: '#dc2626', soft: '#fef2f2' },
        slate: scale('slate'),
        ...Object.fromEntries(HUES.map((hue) => [hue, scale(hue)])),
      },
      borderRadius: { xl: '12px', '2xl': '16px' },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [scaleVars],
};
