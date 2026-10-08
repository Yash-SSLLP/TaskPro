/**
 * Small building blocks: cards, chips, avatars, empty states, skeletons.
 */
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { initials } from '../format';

export function Card({ className, children, as: Tag = 'div', ...rest }) {
  return (
    <Tag className={clsx('rounded-2xl border border-line bg-card shadow-card', className)} {...rest}>
      {children}
    </Tag>
  );
}

const CHIP_TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-soft text-brand',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
};

export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', CHIP_TONES[tone], className)}>
      {children}
    </span>
  );
}

/** A selectable pill (filters, categories). */
export function Chip({ active, onClick, children, className, tone = 'brand', ...rest }) {
  const activeTone = {
    brand: 'border-brand bg-brand text-white',
    in: 'border-cashin bg-cashin text-white',
    out: 'border-cashout bg-cashout text-white',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={clsx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors',
        active ? activeTone : 'border-line bg-card text-ink hover:bg-slate-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const AVATAR_COLORS = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-800',
  'bg-lime-100 text-lime-800',
  'bg-emerald-100 text-emerald-800',
  'bg-sky-100 text-sky-800',
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-800',
  'bg-orange-100 text-orange-800',
];

export function Avatar({ name, size = 'md', className }) {
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const sizes = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' };
  return (
    <span
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', AVATAR_COLORS[hash % AVATAR_COLORS.length], sizes[size], className)}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text, action, className }) {
  return (
    <div className={clsx('flex flex-col items-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <Icon className="h-7 w-7" aria-hidden />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-[15px] text-ink-soft">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={clsx('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

export function Spinner({ className, label = 'Loading' }) {
  return (
    <div className={clsx('flex items-center justify-center py-10 text-ink-faint', className)} role="status">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Error block with a retry button, for a query that failed. */
export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <p className="text-[15px] text-ink">{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-semibold text-brand hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

/** Two or three mutually exclusive options. */
export function Segmented({ value, onChange, options, className }) {
  return (
    <div className={clsx('inline-flex rounded-xl bg-slate-100 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-9 rounded-lg px-3.5 text-sm font-semibold transition-colors',
            value === o.value ? 'bg-card text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[15px] text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
