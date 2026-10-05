/**
 * Form fields with a label, an optional hint and an error line.
 */
import { forwardRef, useId, useState } from 'react';
import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';

const inputBase =
  'block w-full rounded-xl border bg-white px-3.5 text-[15px] text-ink placeholder:text-ink-faint shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-slate-50 disabled:text-ink-soft';

function Shell({ id, label, hint, error, children, className, optional }) {
  return (
    <div className={clsx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-faint">(optional)</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ label, hint, error, className, inputClassName, optional, prefix, ...rest }, ref) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className} optional={optional}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-soft">{prefix}</span>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={!!error || undefined}
          className={clsx(inputBase, 'h-11', prefix && 'pl-9', error ? 'border-red-400' : 'border-line focus:border-brand', inputClassName)}
          {...rest}
        />
      </div>
    </Shell>
  );
});

export const PasswordInput = forwardRef(function PasswordInput({ label = 'Password', hint, error, className, ...rest }, ref) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={show ? 'text' : 'password'}
          aria-invalid={!!error || undefined}
          className={clsx(inputBase, 'h-11 pr-11', error ? 'border-red-400' : 'border-line focus:border-brand')}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-faint hover:text-ink"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </Shell>
  );
});

export const Textarea = forwardRef(function Textarea({ label, hint, error, className, optional, rows = 3, ...rest }, ref) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className} optional={optional}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={!!error || undefined}
        className={clsx(inputBase, 'resize-y py-2.5', error ? 'border-red-400' : 'border-line focus:border-brand')}
        {...rest}
      />
    </Shell>
  );
});

export const Select = forwardRef(function Select({ label, hint, error, className, optional, children, ...rest }, ref) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className} optional={optional}>
      <select
        ref={ref}
        id={id}
        className={clsx(inputBase, 'h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', error ? 'border-red-400' : 'border-line focus:border-brand')}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  );
});

/** An on/off switch with a label and a description. */
export function Switch({ checked, onChange, label, description, disabled }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-[15px] font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60',
          checked ? 'bg-brand' : 'bg-slate-300'
        )}
      >
        <span className={clsx('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
