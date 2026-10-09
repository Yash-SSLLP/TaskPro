/**
 * A task row that swipes on a touch screen (finger only — a mouse keeps the
 * dropdown): the web twin of the app's TaskSwipe, with the HRMS's numbers
 * and the app's finish. Right/left hand the move to `onAction`; nothing
 * happens on the swipe itself, and the click the browser fires at its end is
 * swallowed so the task underneath does not open too.
 *
 * THE FEEL. The axis is decided once, after 8 px, so a scroll that wobbles
 * sideways never moves the row (vertical scrolling stays the browser's,
 * `touch-action: pan-y`). The row follows the finger to 84 px, where the
 * move counts (sooner with a flick), then resists, and past 120 px it
 * stretches like a rubber band instead of stopping dead. The pane deepens
 * from a muted tint to its full colour by the point where the pull counts;
 * there its icon pops and an Android phone ticks (navigator.vibrate). Let go
 * past it and the row opens to 120 px, closes, and the move goes a beat
 * later. The row and its pane are moved straight on the page, not through
 * React, so the pull keeps up with the finger. Reduced motion: no pop, no
 * open-and-close.
 */
import { useEffect, useRef } from 'react';
import { Check, CheckCircle2, Clock, Pencil, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';

const ICONS = { approve: CheckCircle2, accept: ThumbsUp, decline: ThumbsDown, sendBack: RotateCcw, complete: Check, extension: Clock, edit: Pencil };
/** Where a pull counts, where the row stops (give or take a rubber band STRETCH long), and the axis lock. */
const THRESHOLD = 84;
const MAX = 120;
const STRETCH = 32;
const LOCK = 8;
/** A flick counts the finger's speed this many ms ahead. */
const TOSS = 50;
const FILL = { green: '#16a34a', red: '#dc2626', amber: '#b54708', blue: '#2563eb' };
const EASE = 'cubic-bezier(.2,.8,.2,1)';
/** The pop's overshoot. */
const SPRING = 'cubic-bezier(.34,1.56,.64,1)';
/** The open-and-close after a counted pull, and the beat before the move goes. */
const OPEN_MS = 170;
const CLOSE_MS = 260;
const FIRE_AFTER = 140;

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** How far the row goes for the finger's `v`: all of it to the threshold, a third after that, and a rubber band past MAX. */
function travel(v) {
  const abs = Math.abs(v);
  let t = abs <= THRESHOLD ? abs : THRESHOLD + (abs - THRESHOLD) * 0.35;
  if (t > MAX) t = MAX + STRETCH * (1 - 1 / (1 + ((t - MAX) * 0.55) / STRETCH));
  return Math.sign(v) * t;
}

/** The pane a pull uncovers; its parts are kept in `parts` so the pull can paint them. */
function Pane({ action, side, parts }) {
  const Icon = ICONS[action.icon] || Check;
  const keep = (name) => (el) => {
    parts.current[name] = el;
  };
  return (
    <div
      ref={keep('root')}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 flex items-center overflow-hidden rounded-2xl text-white ${side === 'left' ? 'left-0 justify-start pl-5' : 'right-0 justify-end pr-5'}`}
      style={{ width: MAX + 24 + STRETCH, opacity: 0 }}
    >
      <span ref={keep('wash')} className="absolute inset-0" style={{ background: FILL[action.tone] || FILL.green, opacity: 0.45 }} />
      <span ref={keep('grow')} className="relative block" style={{ transform: 'scale(0.85)' }}>
        <span ref={keep('pop')} className="flex flex-col items-center gap-1 text-[12px] font-bold" style={{ transition: `transform 260ms ${SPRING}` }}>
          <Icon className="h-5 w-5" />
          {action.label}
        </span>
      </span>
    </div>
  );
}

export function SwipeRow({ actions, onAction, children }) {
  const { left, right } = actions || {};
  const row = useRef(null);
  // The pane a pull to the RIGHT uncovers (on the left edge), and the other.
  const rightPane = useRef({});
  const leftPane = useRef({});
  const gesture = useRef(null);
  // A counted move on its way: no new pull until the row is home.
  const busy = useRef(false);
  const swallowClick = useRef(false);
  const timers = useRef([]);
  const live = useRef(null);
  live.current = { left, right, onAction };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!left && !right) return children;

  const later = (fn, ms) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const panes = () => [
    [rightPane.current, 1],
    [leftPane.current, -1],
  ];

  /** The row `t` px across, and the pane it uncovers: deeper and bigger as the pull nears the point where it counts. */
  const paint = (t) => {
    if (row.current) row.current.style.transform = t ? `translate3d(${t}px,0,0)` : '';
    for (const [p, sign] of panes()) {
      if (!p.root) continue;
      const pull = Math.max(0, sign * t);
      const k = Math.min(1, pull / THRESHOLD);
      p.root.style.opacity = pull > 4 ? '1' : '0';
      p.wash.style.opacity = String(0.45 + 0.55 * k);
      p.grow.style.transform = `scale(${0.85 + 0.15 * k})`;
    }
  };

  /** Slide the row to `to` over `ms` (the pane stays as it is, under it). */
  const slide = (to, ms) => {
    const el = row.current;
    if (!el) return;
    el.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none';
    el.style.transform = to ? `translate3d(${to}px,0,0)` : '';
  };

  /** The icon pops on the side whose pull counts (1 right, -1 left, 0 neither); `buzz` ticks the phone. */
  const arm = (side, buzz) => {
    const g = gesture.current;
    if (g) {
      if (g.armed === side) return;
      g.armed = side;
    }
    if (buzz) {
      try {
        navigator.vibrate?.(8);
      } catch {
        /* not allowed here */
      }
    }
    const still = reducedMotion();
    for (const [p, sign] of panes()) {
      if (p.pop) p.pop.style.transform = side === sign && !still ? 'scale(1.12)' : '';
    }
  };

  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch' || busy.current) return;
    gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null, dx: 0, armed: 0, trail: [] };
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const ddx = e.clientX - g.x;
    const ddy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(ddx) < LOCK && Math.abs(ddy) < LOCK) return;
      g.axis = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
      if (g.axis !== 'x') return;
      // A row still gliding home from a short pull: take it from where the finger is.
      timers.current.forEach(clearTimeout);
      timers.current = [];
      e.currentTarget.setPointerCapture?.(e.pointerId);
      slide(0, 0);
      if (row.current) row.current.style.willChange = 'transform';
    }
    if (g.axis !== 'x') return;
    const { left: l, right: r } = live.current;
    let v = ddx;
    if (v > 0 && !r) v = 0;
    if (v < 0 && !l) v = 0;
    g.dx = v;
    // The last 100 ms of the pull, for the flick.
    g.trail.push([e.timeStamp, v]);
    while (g.trail.length > 2 && e.timeStamp - g.trail[0][0] > 100) g.trail.shift();
    const t = travel(v);
    paint(t);
    arm(t >= THRESHOLD ? 1 : t <= -THRESHOLD ? -1 : 0, true);
  };

  const finish = (e) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== 'x') return;
    swallowClick.current = true;
    setTimeout(() => {
      swallowClick.current = false;
    }, 350);
    if (row.current) row.current.style.willChange = '';

    // The finger's speed (px/ms) over its last moves, if it was still moving at the end.
    const first = g.trail[0];
    const last = g.trail[g.trail.length - 1];
    let speed = 0;
    if (first && last && last[0] > first[0] && e.timeStamp - last[0] < 60) speed = (last[1] - first[1]) / (last[0] - first[0]);
    const toss = g.dx + TOSS * speed;
    const { left: l, right: r } = live.current;
    const sign = e.type === 'pointercancel' ? 0 : toss >= THRESHOLD && r ? 1 : toss <= -THRESHOLD && l ? -1 : 0;
    const act = sign > 0 ? r : sign < 0 ? l : null;

    // Short of it: home, and the pane goes once the row covers it.
    if (!act) {
      arm(0, false);
      slide(0, 220);
      later(() => {
        paint(0);
        if (row.current) row.current.style.transition = '';
      }, 230);
      return;
    }

    busy.current = true;
    const hand = () => live.current.onAction?.(act.key);
    if (reducedMotion()) {
      arm(0, false);
      slide(0, 0);
      paint(0);
      later(() => {
        busy.current = false;
        hand();
      }, 60);
      return;
    }
    // Open to the stop in full colour, popped (flick or no flick), then home.
    arm(sign, false);
    const p = sign > 0 ? rightPane.current : leftPane.current;
    if (p.root) p.root.style.opacity = '1';
    if (p.wash) p.wash.style.opacity = '1';
    if (p.grow) p.grow.style.transform = 'scale(1)';
    slide(sign * MAX, OPEN_MS);
    later(() => {
      arm(0, false);
      slide(0, CLOSE_MS);
      later(hand, FIRE_AFTER);
      later(() => {
        paint(0);
        if (row.current) row.current.style.transition = '';
        busy.current = false;
      }, CLOSE_MS + 10);
    }, OPEN_MS + 50);
  };

  return (
    <div className="relative rounded-2xl" style={{ touchAction: 'pan-y' }}>
      {right && <Pane action={right} side="left" parts={rightPane} />}
      {left && <Pane action={left} side="right" parts={leftPane} />}
      <div
        ref={row}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(e) => {
          if (swallowClick.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className="relative"
      >
        {children}
      </div>
    </div>
  );
}
