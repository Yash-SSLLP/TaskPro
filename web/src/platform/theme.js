/**
 * Light / dark: System (follow the computer or phone), Light or Dark.
 *
 * The choice is kept on this device (localStorage). index.html applies it
 * before the first paint, so a dark page never flashes white; this module
 * keeps it applied, follows the system while "System" is chosen, and tells
 * React when the look changes (the inline task colours are picked in JS).
 */
import { create } from 'zustand';

export const THEME_KEY = 'taskpro.theme';
export const THEME_MODES = ['system', 'light', 'dark'];

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readMode() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEME_MODES.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (mode) => (mode === 'system' ? (media?.matches ? 'dark' : 'light') : mode);

function apply(scheme) {
  document.documentElement.classList.toggle('dark', scheme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scheme === 'dark' ? '#0b1120' : '#4f46e5');
}

const initial = readMode();
export const useTheme = create(() => ({ mode: initial, scheme: resolve(initial) }));
apply(useTheme.getState().scheme);

/** Whether the dark look is on, for code that picks colours in JS. */
export const isDark = () => useTheme.getState().scheme === 'dark';

export function setThemeMode(mode) {
  const next = THEME_MODES.includes(mode) ? mode : 'system';
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* applies for this visit only */
  }
  const scheme = resolve(next);
  apply(scheme);
  useTheme.setState({ mode: next, scheme });
}

media?.addEventListener?.('change', () => {
  const { mode } = useTheme.getState();
  if (mode !== 'system') return;
  const scheme = resolve(mode);
  apply(scheme);
  useTheme.setState({ scheme });
});
