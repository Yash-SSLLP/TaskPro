/**
 * Promise-based dialogs:
 *   const confirm = useConfirm(); if (await confirm({ title, text, details, confirmLabel, tone })) …
 *   const prompt = usePrompt();   const why = await prompt({ title, text, label, placeholder, required });
 * `prompt` resolves to the typed text, or null when cancelled.
 * `tone`: 'danger' (red — the default for a confirm), 'warning' (amber: allowed, but look first)
 * or 'primary' (a plain question — the default for a prompt).
 *
 * Drawn as the HRMS draws them: one padded box, no header bar — a round icon
 * in the tone's colour, the title, the message, the details as • rows, and the
 * buttons underneath with no footer bar. They open over any other dialog, so
 * Escape and Tab are taken on the window (capture) before that dialog sees them.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Button } from './Button';

const ConfirmContext = createContext(null);

const ICON_TONES = {
  danger: 'bg-red-50 text-red-600',
  warning: 'bg-amber-50 text-amber-600',
  primary: 'bg-slate-100 text-slate-600',
};

/**
 * The dialog box: focus kept inside, Escape cancels, the page behind does not
 * scroll, and focus goes back to `returnFocus` (taken when the dialog was asked
 * for — by the time this mounts, autofocus has already moved it).
 */
function Shell({ onCancel, labelledBy, returnFocus, children }) {
  const panelRef = useRef(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const before = returnFocus;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        cancelRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Ours alone: the dialog underneath would otherwise pull focus back into itself.
      e.stopPropagation();
      const items = [...panelRef.current.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select,a[href],[tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const here = document.activeElement;
      if (e.shiftKey && (here === first || !panelRef.current.contains(here))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (here === last || !panelRef.current.contains(here))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="presentation">
      <div className="modal-backdrop absolute inset-0 bg-black/40" onClick={() => cancelRef.current?.()} aria-hidden />
      <div ref={panelRef} role="alertdialog" aria-modal="true" aria-labelledby={labelledBy} className="modal-panel relative w-full max-w-sm rounded-[1.1rem] bg-card p-5">
        {children}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const resolver = useRef(null);
  const returnFocus = useRef(null);

  const open = useCallback(
    (kind, opts) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        returnFocus.current = document.activeElement;
        setText(opts?.initial || '');
        setError('');
        setState({ kind, confirmLabel: kind === 'prompt' ? 'Save' : 'Confirm', tone: kind === 'prompt' ? 'primary' : 'danger', ...opts });
      }),
    []
  );

  const confirm = useCallback((opts) => open('confirm', opts), [open]);
  const prompt = useCallback((opts) => open('prompt', opts), [open]);

  const close = (answer) => {
    resolver.current?.(answer);
    resolver.current = null;
    setState(null);
  };
  const cancel = () => close(state?.kind === 'prompt' ? null : false);

  const accept = () => {
    if (state?.kind === 'prompt') {
      const said = text.trim();
      if (state.required && !said) {
        setError(state.requiredText || 'Please write something first.');
        return;
      }
      close(said);
    } else close(true);
  };

  const tone = state?.tone === 'danger' || state?.tone === 'warning' ? state.tone : 'primary';
  const Icon = tone === 'primary' ? HelpCircle : AlertTriangle;
  const details = (state?.details || []).filter(Boolean);

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}
      {state && (
        <Shell onCancel={cancel} labelledBy="confirm-title" returnFocus={returnFocus.current}>
          <div className="flex items-start gap-3">
            <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-full', ICON_TONES[tone])} aria-hidden>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="confirm-title" className="text-base font-semibold text-ink">
                {state.title || (state.kind === 'prompt' ? 'Enter a value' : 'Are you sure?')}
              </h2>
              {state.text && <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-soft">{state.text}</p>}
              {details.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {details.map((d) => (
                    <li key={d} className="flex gap-2 text-sm text-ink-soft">
                      <span className="text-ink-faint" aria-hidden>
                        •
                      </span>
                      <span className="min-w-0 break-words">{d}</span>
                    </li>
                  ))}
                </ul>
              )}
              {state.kind === 'prompt' && (
                <div className="mt-3">
                  {state.label && (
                    <label htmlFor="prompt-box" className="mb-1 block text-xs font-medium text-ink-soft">
                      {state.label}
                      {state.required && <span className="text-red-600"> *</span>}
                    </label>
                  )}
                  <textarea
                    id="prompt-box"
                    autoFocus
                    rows={state.rows || 3}
                    value={text}
                    maxLength={state.maxLength || 1000}
                    placeholder={state.placeholder}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (error) setError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (state.rows === 1 && !e.shiftKey))) {
                        e.preventDefault();
                        accept();
                      }
                    }}
                    className="block w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
                </div>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={cancel}>
              {state.cancelLabel || 'Cancel'}
            </Button>
            <Button variant={tone === 'danger' || tone === 'warning' ? tone : 'primary'} onClick={accept} autoFocus={state.kind !== 'prompt'}>
              {state.confirmLabel}
            </Button>
          </div>
        </Shell>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext).confirm;
export const usePrompt = () => useContext(ConfirmContext).prompt;
