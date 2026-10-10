/**
 * The piles (Assigned to me · Assigned by me · In the loop · Organization tasks · All
 * tasks) as big cards, each wearing its own figures from `withScopes`, and the
 * stat bar under them — Total · Not Accepted Yet · Overdue · In Progress ·
 * Under Review · More Time Asked — where every figure is a filter. Laid out as
 * the HRMS draws them (TaskPileCards / TaskStatBar there). Selection is paint
 * only: the same 1px border both ways, so choosing moves nothing.
 *
 * A phone draws the same cards and bar as the HRMS's phone does: two piles to
 * a row, three figures to a row.
 */
import clsx from 'clsx';
import { AlertCircle, Check, Clock, Eye, Hourglass, Inbox, Layers, PlayCircle, Send, Users } from 'lucide-react';
import { STAT_BAR_FIGURES, openCount, statValue } from '../lifecycle';

// Icons that say which pile is which: work coming in, work sent out, work I watch.
const PILE_ICONS = { mine: Inbox, delegated: Send, loop: Eye, team: Users, all: Layers };
const STAT_ICONS = { total: Layers, pending: Clock, overdue: AlertCircle, inProgress: PlayCircle, inReview: Eye, moreTime: Hourglass };
// Two per row on a phone; from lg up, one row.
const GRID = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4', 5: 'grid-cols-2 lg:grid-cols-5' };

export function TaskPileCards({ piles, active, onPick, scopes }) {
  return <PileGrid piles={piles} active={active} onPick={onPick} scopes={scopes} />;
}

function PileGrid({ piles, active, onPick, scopes }) {
  return (
    <div className={clsx('grid gap-3 sm:gap-4', GRID[piles.length] || GRID[4])}>
      {piles.map((pile, i) => {
        const Icon = PILE_ICONS[pile.key] || Inbox;
        const on = active === pile.key;
        const c = scopes?.[pile.key] || null;
        const review = Number(c?.inReview) || 0;
        const overdue = Number(c?.overdue) || 0;
        const done = Number(c?.completed) || 0;
        // An odd last card spans the phone row rather than sitting alone in half of it.
        const odd = piles.length % 2 === 1 && i === piles.length - 1;
        return (
          <button
            key={pile.key}
            type="button"
            onClick={() => onPick?.(pile.key)}
            aria-pressed={on}
            className={clsx(
              'task-pile group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5',
              on ? 'is-active border-brand' : 'border-line',
              odd && 'col-span-2 lg:col-span-1'
            )}
          >
            {/* A phone stacks the icon over the name: beside it, a half-width
                card would cut the name — and the name is the point. */}
            <span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
              <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl transition sm:h-11 sm:w-11', on ? 'bg-brand text-on-brand' : 'bg-slate-100 text-ink-soft group-hover:text-ink')}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold leading-tight text-ink sm:text-base">{pile.label}</span>
              <span className={clsx('hidden h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-on-brand transition sm:grid', on ? 'opacity-100' : 'opacity-0')} aria-hidden>
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="tnum text-3xl font-bold leading-none text-ink sm:text-4xl">{c ? openCount(c) : <span className="text-slate-300">—</span>}</span>
              <span className="text-xs font-medium text-ink-soft sm:text-sm">open</span>
            </span>
            <span className="flex min-h-[20px] flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium sm:text-xs">
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
  return <StatGrid counters={counters} active={active} onPick={onPick} loading={loading} />;
}

// Three to a row on a phone, so the longer names are never cut; one row from sm up.
function StatGrid({ counters, active, onPick, loading }) {
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-sm sm:grid-cols-6" role="group" aria-label="Task figures">
      {STAT_BAR_FIGURES.map(({ key, label, colour }) => {
        const Icon = STAT_ICONS[key] || Layers;
        const on = active === key || (!active && key === 'total');
        const value = statValue(counters, key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onPick?.(key === 'total' || active === key ? '' : key)}
            title={key === 'total' ? 'Every open task in this pile — finished ones are under Completed' : `Show ${label.toLowerCase()} only`}
            style={on ? { backgroundColor: `color-mix(in srgb, ${colour} var(--tint), rgb(var(--card)))` } : undefined}
            className="relative flex min-w-0 flex-col gap-2 bg-card px-3 pb-3 pt-3 text-left transition hover:bg-well sm:px-4 sm:pt-4"
          >
            <span className="flex items-center justify-between gap-2">
              <span className={clsx('tnum text-2xl font-bold leading-none sm:text-3xl', !on && (value || loading ? 'text-ink' : 'text-slate-300'))} style={on ? { color: colour } : undefined}>
                {loading ? <span className="text-slate-300">·</span> : value}
              </span>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={on ? { backgroundColor: colour, color: key === 'total' ? 'rgb(var(--on-brand))' : 'rgb(var(--on-solid))' } : { backgroundColor: `color-mix(in srgb, ${colour} 12%, transparent)`, color: colour }}>
                <Icon className="h-3.5 w-3.5" />
              </span>
            </span>
            {/* Two lines at most, and room for two everywhere, so a wrapped
                "Not Accepted Yet" cannot leave its row at two heights. */}
            <span className="line-clamp-2 min-h-[2.5em] text-xs font-semibold leading-tight text-ink-soft sm:text-sm" style={on ? { color: colour } : undefined}>
              {label}
            </span>
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] transition-opacity" style={{ backgroundColor: colour, opacity: on ? 1 : 0 }} />
          </button>
        );
      })}
    </div>
  );
}
