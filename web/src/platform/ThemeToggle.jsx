/**
 * The light / dark switch, as the HRMS draws it (components/ThemeToggle.jsx
 * there): a track with a sliding knob, a sun on the light side and a moon on
 * the dark side (the active one lights up), and the new look wiping in as a
 * circle from the switch.
 *
 * The reveal, best first:
 *   1. View Transitions (Chrome 111+): the real new page wipes in.
 *   2. Older engines: an overlay in the incoming page colour, clip-path'd from
 *      the switch out to the far corner, then the class flips under it.
 *   3. Instant, for reduced motion or a browser with neither.
 *
 * Flipping it picks Light or Dark outright; Settings → Appearance still offers
 * System (follow the computer or phone).
 */
import { flushSync } from 'react-dom';
import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { setThemeMode, useTheme } from './theme';

const DURATION = 550;
const EASING = 'cubic-bezier(.65, 0, .35, 1)';

/** The page colour the theme is about to switch TO, read from the stylesheet. */
function incomingPage(goingDark) {
  const root = document.documentElement;
  const had = root.classList.contains('dark');
  root.classList.toggle('dark', goingDark);
  const page = getComputedStyle(root).getPropertyValue('--page').trim();
  root.classList.toggle('dark', had);
  return page ? `rgb(${page})` : goingDark ? '#0b141a' : '#f3f3f3';
}

export function ThemeToggle({ className }) {
  const dark = useTheme((s) => s.scheme === 'dark');
  const flip = () => setThemeMode(dark ? 'light' : 'dark');

  const onClick = (e) => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      flip();
      return;
    }
    // From the switch's centre, so a keyboard press reveals from the same place.
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const frames = { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] };

    if (document.startViewTransition) {
      const t = document.startViewTransition(() => flushSync(flip));
      t.ready
        .then(() => document.documentElement.animate(frames, { duration: DURATION, easing: EASING, pseudoElement: '::view-transition-new(root)' }))
        .catch(() => {});
      return;
    }

    const overlay = document.createElement('div');
    const canReveal = typeof overlay.animate === 'function' && window.CSS?.supports?.('clip-path', 'circle(10px at 10px 10px)');
    if (!canReveal) {
      flip();
      return;
    }
    overlay.style.cssText = `position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:${incomingPage(!dark)}`;
    document.body.appendChild(overlay);
    const anim = overlay.animate(frames, { duration: DURATION, easing: EASING, fill: 'forwards' });
    // Three things race to finish it; only the first may flip the theme.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      flushSync(flip);
      overlay.remove();
    };
    anim.onfinish = finish;
    anim.oncancel = finish;
    setTimeout(finish, DURATION + 400);
  };

  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={dark}
      className={clsx('relative h-[28px] w-[58px] shrink-0 rounded-full bg-slate-200 transition-colors duration-200', className)}
      style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,.14)' }}
    >
      <span
        className="absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full transition-transform duration-200"
        style={{
          background: dark ? '#e9edef' : '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,.28)',
          transform: dark ? 'translateX(30px)' : 'translateX(0)',
        }}
      />
      <span className="relative z-[1] grid h-full grid-cols-2 place-items-center">
        <Sun className="h-[14px] w-[14px]" strokeWidth={2.4} color={dark ? '#8696a0' : '#f59e0b'} />
        <Moon className="h-[13px] w-[13px]" strokeWidth={2.4} color={dark ? '#0176d3' : '#747474'} />
      </span>
    </button>
  );
}
