/**
 * Dialogs. `Modal` is centred on desktop and slides up from the bottom on a
 * phone; `Drawer` slides in from the right (details panels). Both close on
 * Escape and on a click outside, and keep focus inside while open.
 */
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

// Open dialogs, innermost last: only the top one answers Escape and Tab, so a
// prompt opened over a form closes alone instead of taking the form with it.
const stack = [];

function useDialogBehaviour(open, onClose, panelRef, focusFirst = true) {
  // The latest onClose, read at key time: a parent passing an inline function
  // must not re-run the effect (which would steal focus on every render).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const id = {};
    stack.push(id);
    const onKey = (e) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current?.();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll(
          'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = stack.length > 1 ? 'hidden' : document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the first field (or the panel) once it has rendered.
    const t = setTimeout(() => {
      const el = (focusFirst && panelRef.current?.querySelector('[autofocus],input:not([type=hidden]),textarea,select')) || panelRef.current;
      el?.focus?.({ preventScroll: !focusFirst });
    }, 30);
    return () => {
      clearTimeout(t);
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = stack.length ? 'hidden' : overflow === 'hidden' ? '' : overflow;
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/**
 * The header bar, as the HRMS's dialogs draw it: a hairline under it, a 16px
 * title, a 32px close. `actions` sit just left of the close; `compact` is the
 * slim 52px bar of a window that is mostly content (a task opened over a list).
 */
function Header({ id, title, subtitle, onClose, actions, compact = false }) {
  return (
    <div className={clsx('flex justify-between gap-4 border-b border-line', compact ? 'items-center px-4 py-2.5 sm:px-5' : 'items-start px-5 py-3.5')}>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
      </div>
      {(actions || onClose) && (
        <div className="-mr-1.5 flex shrink-0 items-center gap-1">
          {actions}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-slate-100 hover:text-ink"
              aria-label="Close"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, actions, compact = false, children, footer, size = 'md', tone, focusFirst = true, bodyClassName }) {
  const panelRef = useRef(null);
  const titleId = useId();
  useDialogBehaviour(open, onClose, panelRef, focusFirst);
  if (!open) return null;
  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div className="modal-backdrop absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={clsx('modal-panel relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-card outline-none sm:rounded-[1.1rem]', width)}
      >
        {tone && <div className={clsx('h-1.5 w-full', tone)} />}
        <Header id={titleId} title={title} subtitle={subtitle} onClose={onClose} actions={actions} compact={compact} />
        <div className={clsx('flex-1 overflow-y-auto', bodyClassName ?? 'px-5 py-4')}>{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, wide = false }) {
  const panelRef = useRef(null);
  const titleId = useId();
  useDialogBehaviour(open, onClose, panelRef);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <div className="modal-backdrop absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={clsx('relative flex h-full w-full flex-col bg-card shadow-pop outline-none', wide ? 'max-w-2xl' : 'max-w-md')}
      >
        <Header id={titleId} title={title} subtitle={subtitle} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
