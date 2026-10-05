/** @type {import('tailwindcss').Config} */
// Brand colours come from CSS variables (src/index.css), so the same UI kit
// serves both Seq Book (emerald) and Task Pro (indigo).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: { DEFAULT: v('brand'), dark: v('brand-dark'), soft: v('brand-soft'), accent: v('brand-accent') },
        ink: { DEFAULT: '#0f172a', soft: '#64748b', faint: '#94a3b8' },
        line: '#e2e8f0',
        page: '#f8fafc',
        cashin: { DEFAULT: '#047857', soft: '#ecfdf5' },
        cashout: { DEFAULT: '#dc2626', soft: '#fef2f2' },
      },
      borderRadius: { xl: '12px', '2xl': '16px' },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        pop: '0 10px 30px -10px rgb(15 23 42 / 0.25), 0 4px 10px -4px rgb(15 23 42 / 0.10)',
      },
    },
  },
  plugins: [],
};
