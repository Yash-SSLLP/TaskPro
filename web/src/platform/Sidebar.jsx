/**
 * The desktop sidebar: a floating panel that folds into a slim rail.
 *
 * Every row keeps its icon at the same spot in both forms (12px in, a 20px
 * icon centred 22px from the row's edge, which is the middle of the rail's
 * 44px buttons). Folding only narrows the panel and dissolves the words, so
 * nothing jumps sideways while it moves. In the rail a row names itself in a
 * tooltip; its words stay in the page for screen readers.
 *
 * Fold it with the button beside the logo, the handle on the panel's edge, or
 * Ctrl/⌘ + B; in the rail the logo itself opens it again. The choice is
 * remembered in this browser.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronLeft, Copy, LogOut, PanelLeftClose, PanelLeftOpen, Smartphone } from 'lucide-react';
import { Logo, Wordmark } from './Logo';
import { copyText } from './pin';

const RAIL_KEY = 'pintask.sidebar';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
export const RAIL_SHORTCUT = isMac ? '⌘ B' : 'Ctrl B';

/** Folded or not, remembered per browser; Ctrl/⌘ + B flips it. */
export function useSidebarRail() {
  const [rail, setRail] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === 'rail';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, rail ? 'rail' : 'full');
    } catch {
      /* not remembered; it still works */
    }
  }, [rail]);
  const toggle = useCallback(() => setRail((r) => !r), []);
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b') return;
      // Not while typing: Ctrl + B means bold there.
      const t = e.target;
      if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName || '')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
  return [rail, toggle];
}

/** One tooltip for the whole rail, drawn beside the row under the pointer. */
function useRailTip(rail) {
  const [tip, setTip] = useState(null);
  const timer = useRef(0);
  const show = useCallback(
    (el, text, extra) => {
      if (!rail || !el) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        setTip({ text, extra, top: r.top + r.height / 2, left: r.right + 14 });
      }, 70);
    },
    [rail]
  );
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setTip(null);
  }, []);
  useEffect(() => {
    if (!rail) hide();
  }, [rail, hide]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const bind = (text, extra) =>
    rail
      ? {
          onMouseEnter: (e) => show(e.currentTarget, text, extra),
          onMouseLeave: hide,
          onFocus: (e) => show(e.currentTarget, text, extra),
          onBlur: hide,
        }
      : {};
  const node = tip
    ? createPortal(
        <div className="side-tip" style={{ top: tip.top, left: tip.left }} aria-hidden>
          <span>{tip.text}</span>
          {tip.extra ? <span className="side-tip-extra">{tip.extra}</span> : null}
        </div>,
        document.body
      )
    : null;
  return { bind, node, hide };
}

function Count({ n, rail }) {
  if (!n) return null;
  const text = n > 99 ? '99+' : n;
  return rail ? <span className="side-count-dot tnum">{text}</span> : <span className="side-count side-fade tnum">{text}</span>;
}

/**
 * @param sections  [{ group, items: [{ to, label, icon, badge? }] }]
 * @param isOn      (item) => boolean — the row the page belongs to
 * @param badgeOf   (item) => number
 * @param avatar    the person's Avatar element (sm)
 */
export function Sidebar({ rail, onToggle, sections, isOn, badgeOf, user, pin, admin, avatar, onSignOut }) {
  const { bind, node: tipNode, hide } = useRailTip(rail);

  return (
    <aside className={clsx('side-panel hidden lg:flex', rail && 'is-rail')} aria-label="Sidebar">
      {/* The edge handle: shows on hovering the panel, folds or unfolds it. */}
      <button
        type="button"
        onClick={() => {
          hide();
          onToggle();
        }}
        className="side-handle"
        aria-label={rail ? 'Expand the sidebar' : 'Collapse the sidebar'}
        aria-expanded={!rail}
        aria-keyshortcuts="Control+B Meta+B"
        title={`${rail ? 'Expand' : 'Collapse'} (${RAIL_SHORTCUT})`}
      >
        <ChevronLeft className="side-handle-icon" aria-hidden />
      </button>

      <div className="side-brand">
        {/* In the rail the mark is the way back out: it turns into the panel
            icon under the pointer. */}
        {rail ? (
          <button
            type="button"
            onClick={() => {
              hide();
              onToggle();
            }}
            className="side-mark"
            aria-label="Expand the sidebar"
            aria-expanded={false}
            aria-keyshortcuts="Control+B Meta+B"
            {...bind('Expand', RAIL_SHORTCUT)}
          >
            <Logo size={36} withName={false} />
            <span className="side-mark-open" aria-hidden>
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            </span>
          </button>
        ) : (
          <span className="side-mark">
            <Logo size={36} withName={false} />
          </span>
        )}
        <span className="side-fade min-w-0 flex-1 leading-tight">
          <Wordmark className="block text-[17px] text-ink" />
          {admin && <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-brand">Super Admin</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            hide();
            onToggle();
          }}
          tabIndex={rail ? -1 : undefined}
          className="side-fold side-fade"
          aria-label="Collapse the sidebar"
          aria-expanded
          aria-keyshortcuts="Control+B Meta+B"
          title={`Collapse (${RAIL_SHORTCUT})`}
        >
          <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

      <nav className="side-nav" aria-label="Main">
        {sections.map((s) => (
          <div key={s.group} className="side-section">
            <p className="side-heading">
              <span className="side-fade">{s.group}</span>
              <span className="side-rule" aria-hidden />
            </p>
            {s.items.map((item) => {
              const on = isOn(item);
              const n = badgeOf(item);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={clsx('side-item', on && 'is-active')}
                  aria-current={on ? 'page' : undefined}
                  {...bind(item.label, n ? String(n > 99 ? '99+' : n) : null)}
                >
                  <span className="side-bar" aria-hidden />
                  <span className="side-icon">
                    <item.icon className="h-[18px] w-[18px]" aria-hidden />
                    {rail && <Count n={n} rail />}
                  </span>
                  <span className="side-label side-fade">{item.label}</span>
                  {!rail && <Count n={n} rail={false} />}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="side-foot">

        <NavLink to="/get-app" className="side-app" {...bind('Get the app')}>
          <span className="side-app-icon">
            <Smartphone className="h-4 w-4" aria-hidden />
          </span>
          <span className="side-fade min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[12.5px] font-semibold text-ink">Get the app</span>
            <span className="block truncate text-[11px] text-ink-faint">Android and iPhone</span>
          </span>
        </NavLink>

        <div className="side-me">
          <NavLink to="/profile" className="side-me-avatar" aria-label="My profile" {...bind(user?.name || 'My profile', pin || (admin ? 'Super Admin' : null))}>
            {avatar}
          </NavLink>
          <div className="side-fade min-w-0 flex-1 leading-tight">
            <NavLink to="/profile" tabIndex={rail ? -1 : undefined} className="block truncate text-[13px] font-semibold text-ink hover:underline">
              {user?.name}
            </NavLink>
            {pin ? (
              <button
                type="button"
                onClick={() => copyText(pin, 'Task Pin copied')}
                tabIndex={rail ? -1 : undefined}
                className="group mt-0.5 inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md font-mono text-[11px] font-semibold tracking-wider text-ink-soft hover:text-brand"
                title="Copy my Task Pin"
              >
                {pin}
                <Copy className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />
              </button>
            ) : (
              <p className="mt-0.5 text-[11px] text-ink-soft">{admin ? 'Super Admin' : ''}</p>
            )}
          </div>
          <button type="button" onClick={onSignOut} tabIndex={rail ? -1 : undefined} className="side-signout" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {tipNode}
    </aside>
  );
}
