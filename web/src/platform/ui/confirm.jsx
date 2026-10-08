/**
 * Promise-based dialogs:
 *   const confirm = useConfirm(); if (await confirm({ title, text, details, confirmLabel, tone })) …
 *   const prompt = usePrompt();   const why = await prompt({ title, text, label, placeholder, required });
 * `prompt` resolves to the typed text, or null when cancelled.
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const resolver = useRef(null);

  const open = useCallback(
    (kind, opts) =>
      new Promise((resolve) => {
        resolver.current = resolve;
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

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(state?.kind === 'prompt' ? null : false)}
        title={state?.title}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(state?.kind === 'prompt' ? null : false)}>
              {state?.cancelLabel || 'Cancel'}
            </Button>
            <Button variant={state?.tone === 'danger' ? 'danger' : 'primary'} onClick={accept} autoFocus={state?.kind !== 'prompt'}>
              {state?.confirmLabel}
            </Button>
          </>
        }
      >
        {state?.text && <p className="text-[15px] text-ink-soft">{state.text}</p>}
        {state?.details?.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {state.details.filter(Boolean).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
        {state?.kind === 'prompt' && (
          <div className="mt-3 space-y-1.5">
            {state.label && (
              <label htmlFor="prompt-box" className="block text-sm font-medium text-ink">
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
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  accept();
                }
              }}
              className="block w-full resize-y rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] text-ink shadow-sm placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext).confirm;
export const usePrompt = () => useContext(ConfirmContext).prompt;
