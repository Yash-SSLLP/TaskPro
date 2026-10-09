/** @type {import('tailwindcss').Config} */
// Brand colours come from CSS variables (src/index.css), so the same UI kit
// serves both Seq Book (emerald) and PinTask (Bone and Ink, a red accent).
//
// LIGHT AND DARK: every colour the pages use is a CSS variable, so one class
// on <html> (`dark`, set by src/platform/theme.js) re-themes the whole app
// without a `dark:` variant on each element. The neutrals (slate) are warmed
// to PinTask's Bone, Sand and Stone, with a dark scale of their own. On the other hues the dark theme works the way the HRMS
// web app does (its index.css "Dark mode COLOUR accuracy"): the pale tints
// (50-300, the washes behind chips, banners and selected tiles) become a soft
// wash of the hue over the dark card instead of a deep, muddy block; the inks
// (700-950) turn light so coloured text reads; 400-600 stay, so a solid button
// keeps its white label. Text set in 500/600 is lifted to 400 on its own (see
// the remap below), since the same step also fills buttons; a 700/800 FILL (a
// button's hover) keeps its light value for the same reason.
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
const DARK_CARD = '#1f1c17';

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const HUES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'rose'];
// Warm neutrals in place of the cool slate: Bone #f1ece2, Sand #d9d2c3, Stone
// #8a857a, the muted text #6b665b and Ink #15130f, with steps mixed between.
const LIGHT_SLATE = {
  50: '#f5f1e9',
  100: '#f1ece2',
  200: '#e4ded1',
  300: '#d9d2c3',
  400: '#aea89b',
  500: '#8a857a',
  600: '#6b665b',
  700: '#444139',
  800: '#2b2822',
  900: '#1f1c17',
  950: '#15130f',
};
const DARK_SLATE = {
  50: '#26231e',
  100: '#2c2821',
  200: '#36322a',
  300: '#464239',
  400: '#585449',
  500: '#6f6a5e',
  600: '#a39d8f',
  700: '#cec8bd',
  800: '#e1dcd1',
  900: '#f1ece2',
  950: '#faf7f1',
};

/** One hue's dark scale. */
function darkHue(hue) {
  const p = palette[hue];
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
