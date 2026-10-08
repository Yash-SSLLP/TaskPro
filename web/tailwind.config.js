/** @type {import('tailwindcss').Config} */
// Brand colours come from CSS variables (src/index.css), so the same UI kit
// serves both Seq Book (emerald) and Task Pro (indigo).
//
// LIGHT AND DARK: every colour the pages use is a CSS variable, so one class
// on <html> (`dark`, set by src/platform/theme.js) re-themes the whole app
// without a `dark:` variant on each element. The neutrals (slate) get a dark
// scale of their own; on the other hues the pale tints and the deep inks swap
// ends (bg-red-50 turns deep, text-red-700 turns light) while the middle
// stays, so a solid button keeps its white label.
import plugin from 'tailwindcss/plugin';
import palette from 'tailwindcss/colors';

const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const HUES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'rose'];
const SWAP = { 50: '950', 100: '900', 200: '800', 700: '300', 800: '200', 900: '100', 950: '50' };
const DARK_SLATE = {
  50: '#1a2438',
  100: '#1e293b',
  200: '#263248',
  300: '#334155',
  400: '#475569',
  500: '#64748b',
  600: '#94a3b8',
  700: '#cbd5e1',
  800: '#e2e8f0',
  900: '#f1f5f9',
  950: '#f8fafc',
};

const scale = (hue) => Object.fromEntries(SHADES.map((s) => [s, v(`${hue}-${s}`)]));

const scaleVars = plugin(({ addBase }) => {
  const light = {};
  const dark = {};
  for (const s of SHADES) {
    light[`--slate-${s}`] = rgb(palette.slate[s]);
    dark[`--slate-${s}`] = rgb(DARK_SLATE[s]);
  }
  for (const hue of HUES) {
    for (const s of SHADES) {
      light[`--${hue}-${s}`] = rgb(palette[hue][s]);
      dark[`--${hue}-${s}`] = rgb(palette[hue][SWAP[s] || s]);
    }
  }
  addBase({ ':root': light, 'html.dark': dark });
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
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), faint: v('ink-faint') },
        line: v('line'),
        page: v('page'),
        // A raised surface: cards, dialogs, inputs. White in the light theme.
        card: v('card'),
        cashin: { DEFAULT: '#047857', soft: '#ecfdf5' },
        cashout: { DEFAULT: '#dc2626', soft: '#fef2f2' },
        slate: scale('slate'),
        ...Object.fromEntries(HUES.map((hue) => [hue, scale(hue)])),
      },
      borderRadius: { xl: '12px', '2xl': '16px' },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        pop: '0 10px 30px -10px rgb(15 23 42 / 0.25), 0 4px 10px -4px rgb(15 23 42 / 0.10)',
      },
    },
  },
  plugins: [scaleVars],
};
