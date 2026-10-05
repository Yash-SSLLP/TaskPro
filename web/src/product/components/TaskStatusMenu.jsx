/**
 * The status dropdown on every task row. The button says where the task is
 * (from this reader's side); the menu says what they may do about it — only
 * the moves the server's `can` allows — plus Edit (while terms are open) and
 * Open. Rendered in a portal at fixed coordinates so no ancestor clips it; it
 * flips above the button near the bottom of the screen and closes on scroll.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  ArrowRightLeft, Check, CheckCircle2, ChevronDown, Clock, ExternalLink, GitBranch, Pencil, RotateCcw, Send, ThumbsDown, ThumbsUp, UserPlus,
} from 'lucide-react';
import { STATUS_DOT, statusActions, statusBadge, statusStyle } from '../lifecycle';

export const ACTION_ICONS = {
  approve: CheckCircle2,
  accept: ThumbsUp,
  sendBack: RotateCcw,
  decline: ThumbsDown,
  delegate: GitBranch,
  transfer: ArrowRightLeft,
  submit: Send,
  complete: Check,
  claim: UserPlus,
  extension: Clock,
};

const TONE_CHIP = {
  green: 'bg-green-50 text-green-700',
  red: 'bg-red-50 text-red-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  slate: 'bg-slate-100 text-slate-600',
  violet: 'bg-violet-50 text-violet-700',
  blue: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
};

const MENU_WIDTH = 296;
const GAP = 6;

export function TaskStatusMenu({ task, onAction, onOpen, className }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const badge = statusBadge(task);
  const actions = statusActions(task);
  const canEdit = Boolean(task?.can?.canEdit);
  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    const btn = buttonRef.current?.getBoundingClientRect();
    if (!btn) return;
    const height = menuRef.current?.offsetHeight || 0;
    const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
    const below = btn.bottom + GAP;
    const fitsBelow = below + height <= window.innerHeight - 8;
    const top = fitsBelow || btn.top - GAP - height < 8 ? below : btn.top - GAP - height;
    const left = Math.max(8, Math.min(btn.right - width, window.innerWidth - width - 8));
    setPos({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, actions.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        buttonRef.current?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!items.length) return;
      e.preventDefault();
      const at = items.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? items[(at + 1) % items.length] : items[(at - 1 + items.length) % items.length];
      next?.focus();
    };
    const onScroll = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open, pos]);

  const pick = (key) => {
    close();
    if (key === 'open') onOpen?.(task);
    else onAction?.(key, task);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={actions.length ? 'Change the status' : 'See what can be done'}
        className={clsx('inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold shadow-sm transition', statusStyle(badge.key), open ? 'ring-2 ring-slate-300' : 'hover:shadow', className)}
      >
        <span className={clsx('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[badge.key] || STATUS_DOT.PENDING)} aria-hidden />
        <span className="whitespace-nowrap">{badge.label}</span>
        {actions.length > 0 && <span className="tnum rounded-full bg-white/70 px-1.5 text-[10px] font-bold">{actions.length}</span>}
        <ChevronDown className={clsx('h-3.5 w-3.5 shrink-0 opacity-70 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Status of ${task?.title || 'this task'}`}
            onClick={(e) => e.stopPropagation()}
            style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: -9999, left: -9999, width: MENU_WIDTH }}
            className="fixed z-[80] overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-pop"
          >
            <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{actions.length ? 'Change status' : 'Status'}</p>
            {actions.length === 0 && <p className="px-3 pb-2 text-xs text-ink-soft">Nothing for you to change on this one right now.</p>}
            {actions.map((a) => {
              const Icon = ACTION_ICONS[a.icon] || Check;
              return (
                <button
                  key={a.key}
                  type="button"
                  role="menuitem"
                  onClick={() => pick(a.key)}
                  className="flex min-h-[44px] w-full items-start gap-3 rounded-xl px-3 py-2 text-left outline-none transition hover:bg-slate-50 focus:bg-slate-50"
                >
                  <span className={clsx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', TONE_CHIP[a.tone] || TONE_CHIP.slate)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{a.label}</span>
                    <span className="block text-xs leading-snug text-ink-soft">{a.hint}</span>
                  </span>
                </button>
              );
            })}
            <div className="my-1 border-t border-line" />
            {canEdit && (
              <button type="button" role="menuitem" onClick={() => pick('edit')} className="flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink outline-none hover:bg-slate-50 focus:bg-slate-50">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
                  <Pencil className="h-3.5 w-3.5" />
                </span>
                Edit task
                <span className="ml-auto text-[11px] font-normal text-ink-faint">while terms are open</span>
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => pick('open')} className="flex min-h-[40px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-soft outline-none hover:bg-slate-50 focus:bg-slate-50">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-ink-soft">
                <ExternalLink className="h-3.5 w-3.5" />
              </span>
              Open task
              <span className="ml-auto text-[11px] font-normal text-ink-faint">progress · comments</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
