/**
 * The piles (Mine · Given by me · In the loop · Team · All) as big cards, each
 * wearing its own figures from `withScopes`, and the stat bar under them —
 * Total · Not accepted yet · Overdue · In progress · In review · More time
 * asked · Completed — where every figure is a filter. Selection is paint only.
 */
import clsx from 'clsx';
import { AlertCircle, Bell, CheckCircle2, Clock, Eye, Hourglass, Inbox, Layers, PlayCircle, Send, Users } from 'lucide-react';
import { STAT_BAR, openCount, statValue } from '../lifecycle';

const PILE_ICONS = { mine: Inbox, delegated: Send, loop: Bell, team: Users, all: Layers };
const STAT_ICONS = { total: Layers, pending: Clock, overdue: AlertCircle, inProgress: PlayCircle, inReview: Eye, moreTime: Hourglass, completed: CheckCircle2 };
const GRID = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2 xl:grid-cols-3', 4: 'grid-cols-2 xl:grid-cols-4', 5: 'grid-cols-2 xl:grid-cols-5' };

export function TaskPileCards({ piles, active, onPick, scopes }) {
  return (
    <div className={clsx('grid gap-3', GRID[piles.length] || GRID[4])}>
      {piles.map((pile, i) => {
        const Icon = PILE_ICONS[pile.key] || Inbox;
        const on = active === pile.key;
        const c = scopes?.[pile.key] || null;
        const review = Number(c?.inReview) || 0;
        const overdue = Number(c?.overdue) || 0;
        const done = Number(c?.completed) || 0;
        const odd = piles.length % 2 === 1 && i === piles.length - 1;
        return (
          <button
            key={pile.key}
            type="button"
            onClick={() => onPick?.(pile.key)}
            aria-pressed={on}
            className={clsx(
              'group relative flex min-w-0 flex-col gap-2.5 rounded-2xl border bg-card p-3.5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop sm:p-4',
              on ? 'border-brand ring-2 ring-brand/20' : 'border-line',
              odd && 'col-span-2 xl:col-span-1'
            )}
          >
            <span className="flex items-center gap-2.5">
              <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', on ? 'bg-brand text-white' : 'bg-slate-100 text-ink-soft group-hover:text-ink')}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold leading-tight text-ink">{pile.label}</span>
                <span className="block truncate text-xs text-ink-faint">{pile.sub}</span>
              </span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="tnum text-3xl font-bold leading-none text-ink">{c ? openCount(c) : <span className="text-slate-300">—</span>}</span>
              <span className="text-xs font-medium text-ink-soft">open</span>
            </span>
            <span className="flex min-h-[18px] flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium">
              {c && overdue > 0 && (
                <span className="inline-flex items-center gap-1 text-red-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {overdue} overdue
                </span>
              )}
              {c && review > 0 && (
                <span className="inline-flex items-center gap-1 text-violet-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> {review} {pile.key === 'mine' || pile.key === 'loop' ? 'in review' : 'to review'}
                </span>
              )}
              {c && (
                <span className="inline-flex items-center gap-1 text-ink-soft">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> {done} done
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TaskStatBar({ counters = {}, active = '', onPick, loading = false }) {
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card sm:grid-cols-4 lg:grid-cols-7" role="group" aria-label="Task figures">
      {STAT_BAR.map(({ key, label, colour }) => {
        const Icon = STAT_ICONS[key] || Layers;
        const on = active === key || (!active && key === 'total');
        const value = statValue(counters, key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onPick?.(key === 'total' || active === key ? '' : key)}
            title={key === 'total' ? 'Every open task in this pile' : `Show ${label.toLowerCase()} only`}
            style={on ? { backgroundColor: `color-mix(in srgb, ${colour} var(--tint), rgb(var(--card)))` } : undefined}
            className="relative flex min-w-0 flex-col gap-2 bg-card px-3 pb-3 pt-3 text-left transition hover:bg-slate-50"
          >
            <span className="flex items-center justify-between gap-2">
              <span className={clsx('tnum text-2xl font-bold leading-none', !on && (value || loading ? 'text-ink' : 'text-slate-300'))} style={on ? { color: colour } : undefined}>
                {loading ? <span className="text-slate-300">·</span> : value}
              </span>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={on ? { backgroundColor: colour, color: '#fff' } : { backgroundColor: `color-mix(in srgb, ${colour} 12%, transparent)`, color: colour }}>
                <Icon className="h-3.5 w-3.5" />
              </span>
            </span>
            <span className="line-clamp-2 min-h-[2.5em] text-xs font-semibold leading-tight text-ink-soft" style={on ? { color: colour } : undefined}>
              {label}
            </span>
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ backgroundColor: colour, opacity: on ? 1 : 0 }} />
          </button>
        );
      })}
    </div>
  );
}
