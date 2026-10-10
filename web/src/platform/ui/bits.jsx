/**
 * Small building blocks: cards, chips, avatars, empty states, skeletons.
 */
import { useState } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { apiUrl } from '../api';
import { initials } from '../format';
import { usePlace } from '../place';

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

/** A selectable pill (filters, categories). `warn` tints it red while it is not chosen (something overdue in it). */
export function Chip({ active, onClick, children, className, tone = 'brand', warn = false, ...rest }) {
  const activeTone = {
    brand: 'border-brand bg-brand text-on-brand',
    in: 'border-cashin bg-cashin text-white',
    out: 'border-cashout bg-cashout text-white',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={clsx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors',
        active ? activeTone : warn ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-line bg-card text-ink hover:bg-well',
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

const AVATAR_SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
  '2xl': 'h-28 w-28 text-4xl sm:h-32 sm:w-32',
};

/**
 * A person's profile photo, or their initials on a soft colour picked from
 * the name (the same person always gets the same colour). Pass `person`
 * (anything with `name` and `photoUrl`), or `name` and `photoUrl`; `src`
 * shows a local preview. A photo that fails to load falls back to initials.
 * `sizeClass` replaces the size steps for a spot drawn at its own size;
 * `tone` 'brand' or 'plain' colours the initials instead of the name.
 */
export function Avatar({ person, name, photoUrl, src, size = 'md', sizeClass, tone, className }) {
  const label = name ?? person?.name ?? '';
  const url = src || photoUrl || person?.photoUrl || null;
  const [failed, setFailed] = useState(null);
  const sizing = sizeClass || AVATAR_SIZES[size] || AVATAR_SIZES.md;
  if (url && failed !== url) {
    return (
      <img
        src={apiUrl(url)}
        alt=""
        aria-hidden
        draggable={false}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(url)}
        className={clsx('inline-block shrink-0 select-none rounded-full bg-well object-cover', sizing, className)}
      />
    );
  }
  let hash = 0;
  for (const ch of String(label)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const colour = tone === 'brand' ? 'bg-brand text-on-brand' : tone === 'plain' ? 'bg-slate-100 text-ink-soft' : AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <span className={clsx('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold', colour, sizing, className)} aria-hidden>
      {initials(label)}
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
  return <div className={clsx('animate-pulse rounded-lg bg-slate-200', className)} />;
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

/** Two or three mutually exclusive options. The track and the lit option swap depth in dark (index.css .seg-*). */
export function Segmented({ value, onChange, options, className }) {
  return (
    <div className={clsx('seg-track inline-flex rounded-xl p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors',
            value === o.value ? 'seg-on text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The page's header, as the HRMS draws it: the sidebar row's icon in a tile,
 * the row's section as a small eyebrow, the title, and the actions on the
 * right (they wrap to the right, never under the title on the left). `icon`
 * and `eyebrow` override what the sidebar says; `eyebrow={null}` drops it.
 */
/** `compact`: on a phone the actions stay on the title's line (short titles, icon actions). */
export function PageHeader({ title, subtitle, actions, back, icon, eyebrow, compact = false }) {
  const place = usePlace();
  const Icon = icon === undefined ? place?.icon : icon;
  let label = eyebrow === undefined ? place?.group : eyebrow;
  if (label && typeof title === 'string' && label.toLowerCase() === title.trim().toLowerCase()) label = null;
  return (
    <div className={clsx('flex flex-wrap items-center justify-between gap-3', compact ? 'mb-3 sm:mb-5' : 'mb-5')}>
      <div className={clsx('flex min-w-0 grow items-center gap-3', compact ? 'basis-0 sm:basis-72' : 'basis-72')}>
        {Icon && (
          <span className="page-head-icon" aria-hidden>
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          {back}
          {label && <div className="page-eyebrow">{label}</div>}
          <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}
