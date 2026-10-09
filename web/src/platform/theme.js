/**
 * Light / dark: System (follow the computer or phone), Light or Dark.
 *
 * The choice is kept on this device (localStorage). index.html applies it
 * before the first paint, so a dark page never flashes white; this module
 * keeps it applied and follows the system while "System" is chosen. Every
 * colour is a CSS variable (src/index.css), so switching only flips the class
 * on <html>: nothing re-renders and no open form loses what was typed.
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scheme === 'dark' ? '#001639' : '#f3f3f3');
}

const initial = readMode();
export const useTheme = create(() => ({ mode: initial, scheme: resolve(initial) }));
apply(useTheme.getState().scheme);

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
