/**
 * Buttons. One `variant` per intent; `loading` disables the button and
 * shows a spinner so a double click can't submit twice.
 */
import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-dark shadow-sm',
  secondary: 'bg-white text-ink border border-line hover:bg-slate-50 shadow-sm',
  soft: 'bg-brand-soft text-brand hover:bg-brand/15',
  ghost: 'text-ink-soft hover:bg-slate-100 hover:text-ink',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  'danger-soft': 'bg-red-50 text-red-700 hover:bg-red-100',
  in: 'bg-cashin text-white hover:bg-emerald-800 shadow-sm',
  out: 'bg-cashout text-white hover:bg-red-700 shadow-sm',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, to, type = 'button', ...rest },
  ref
) {
  const classes = clsx(
    'inline-flex select-none items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTS[variant],
    SIZES[size],
    className
  );
  const content = (
    <>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden /> : null}
      {children}
    </>
  );
  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

/** A square icon-only button that still has an accessible name. */
export function IconButton({ icon: Icon, label, className, variant = 'ghost', ...rest }) {
  return (
    <Button variant={variant} size="icon" className={className} aria-label={label} title={label} {...rest}>
      <Icon className="h-5 w-5" aria-hidden />
    </Button>
  );
}
