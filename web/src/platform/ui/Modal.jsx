/**
 * Dialogs. `Modal` is centred on desktop and slides up from the bottom on a
 * phone; `Drawer` slides in from the right (details panels). Both close on
 * Escape and on a click outside, and keep focus inside while open.
 */
import { useEffect, useRef } from 'react';
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

function Header({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 -mt-1 rounded-lg p-2 text-ink-faint hover:bg-slate-100 hover:text-ink"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', tone, focusFirst = true, bodyClassName }) {
  const panelRef = useRef(null);
  useDialogBehaviour(open, onClose, panelRef, focusFirst);
  if (!open) return null;
  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-pop outline-none sm:rounded-2xl',
          width
        )}
      >
        {tone && <div className={clsx('h-1.5 w-full', tone)} />}
        <Header title={title} subtitle={subtitle} onClose={onClose} />
        <div className={clsx('flex-1 overflow-y-auto', bodyClassName ?? 'px-5 pb-5 pt-2')}>{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap items-center justify-end gap-2 border-t border-line bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, wide = false }) {
  const panelRef = useRef(null);
  useDialogBehaviour(open, onClose, panelRef);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={clsx('relative flex h-full w-full flex-col bg-card shadow-pop outline-none', wide ? 'max-w-2xl' : 'max-w-md')}
      >
        <Header title={title} subtitle={subtitle} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
