/**
 * Buttons. One `variant` per intent; `loading` disables the button and
 * shows a spinner so a double click can't submit twice.
 *
 * Compact, as the HRMS draws them: 32px small, 36px regular, 40px large.
 */
import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-brand text-on-brand hover:bg-brand-dark shadow-sm',
  secondary: 'bg-card text-ink border border-line hover:border-slate-300 hover:bg-well shadow-sm',
  soft: 'bg-brand-soft text-brand hover:bg-brand/15',
  ghost: 'text-ink-soft hover:bg-slate-100 hover:text-ink',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  'danger-soft': 'bg-red-50 text-red-700 hover:bg-red-100',
  // The task moves' own colours: approve / accept, a granted ask, a review, a hand-over.
  success: 'bg-green-600 text-white hover:bg-green-700 shadow-sm',
  go: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  review: 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm',
  warning: 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm',
  in: 'bg-cashin text-white hover:bg-emerald-800 shadow-sm',
  out: 'bg-cashout text-white hover:bg-red-700 shadow-sm',
};

const SIZES = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-1.5 rounded-xl',
  lg: 'h-10 px-4 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-xl',
};
const ICON_SIZES = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-[18px] w-[18px]', icon: 'h-[18px] w-[18px]' };

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
      {loading ? <Loader2 className={clsx(ICON_SIZES[size] || ICON_SIZES.md, 'animate-spin')} aria-hidden /> : Icon ? <Icon className={clsx(ICON_SIZES[size] || ICON_SIZES.md, 'shrink-0')} aria-hidden /> : null}
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
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </Button>
  );
}
