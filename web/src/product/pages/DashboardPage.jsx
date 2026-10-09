/**
 * Dashboard — count-based: what was given, what is open, overdue, in review,
 * done, and whether it was done on time. Views: Mine · Assigned by me · People
 * (team owners/admins and the Super Admin) · Category · Over time · Overdue
 * report. `completion %` = completed / total; `on-time %` = in time / completed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertCircle, Send, Tag, TrendingUp, User, Users } from 'lucide-react';
import { isSuperAdmin, useSession, useTz } from '../../platform/session';
import { ErrorState, PageHeader, Skeleton } from '../../platform/ui';
import * as T from '../api';
import { useAdminTeams, useTaskMeta } from '../hooks';
import { RANGES, dueLabel } from '../lifecycle';

const VIEWS = [
  ['mine', 'Mine', User, false],
  ['delegated', 'Assigned by me', Send, false],
  ['people', 'People', Users, true],
  ['category', 'Category', Tag, false],
  ['trend', 'Over time', TrendingUp, false],
  ['overdue', 'Overdue report', AlertCircle, false],
];

/* The HRMS report's vocabulary: 32px chips, small fields, a hairline table pane with tracked capitals for heads. */
const CHIP = 'inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition';
const FIELD = 'h-8 rounded-lg border border-line bg-card px-2 text-xs text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';
const PANE = 'overflow-auto rounded-2xl border border-line bg-card';
const TH = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft';

const num = (v) => Number(v) || 0;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

function scoreTone(score) {
  if (score >= 85) return 'bg-green-100 text-green-700';
  if (score >= 60) return 'bg-amber-100 text-amber-700';
  if (score > 0) return 'bg-orange-100 text-orange-700';
  return 'bg-slate-100 text-ink-soft';
}

/** One row, whichever shape the server sends (KARO or HRMS words). */
function normalise(r) {
  const open = r.open ?? num(r.pending) + num(r.inProgress) + num(r.overdue) + num(r.inReview);
  const completed = num(r.completed);
  const total = num(r.total);
  return {
    key: r.key || r.person?.id || r.person?._id || r.category || r.bucket || r.label,
    label: r.label || r.person?.name || r.category || r.bucket || '—',
    pin: r.person?.pinDisplay || '',
    total,
    open: num(open),
    overdue: num(r.overdue),
    inReview: num(r.inReview),
    completed,
    inTime: num(r.inTime),
    delayed: num(r.delayed),
    cancelled: num(r.cancelled),
    completionPct: r.completionPct ?? r.score ?? pct(completed, total - num(r.cancelled)),
    onTimePct: r.onTimePct ?? r.onTimeScore ?? pct(num(r.inTime), completed),
  };
}

function Cell({ n, of, tone = 'text-ink', border }) {
  return (
    <td className={clsx('tnum px-3 py-2 text-right', border && 'border-l border-line')}>
      <span className={n > 0 ? tone : 'text-slate-300'}>{n}</span>
      {n > 0 && of > 0 && <span className="ml-1 text-[11px] text-ink-faint">({pct(n, of)}%)</span>}
    </td>
  );
}

export function DashboardPage() {
  const tz = useTz();
  const admin = isSuperAdmin(useSession((s) => s.user));
  const { data: meta } = useTaskMeta();
  const adminTeams = useAdminTeams(meta);
  const canPeople = admin || Boolean(meta?.isAdmin) || adminTeams.length > 0;
  const views = VIEWS.filter(([key, , , peopleOnly]) => (!peopleOnly || canPeople) && !(admin && (key === 'mine' || key === 'delegated')));
  const [view, setView] = useState(admin ? 'people' : 'mine');
  const picked = useRef(false);
  useEffect(() => {
    if (!picked.current && admin) setView('people');
  }, [admin]);
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [grain, setGrain] = useState('day');
  const [team, setTeam] = useState('');

  const teamChoices = view === 'people' && !admin ? adminTeams : meta?.teams || [];
  const params = { range, ...(range === 'custom' ? { from, to } : {}), ...(team ? { team } : {}) };
  const q = useQuery({
    queryKey: ['tasks', 'dashboard', view, params, grain],
    queryFn: () => (view === 'overdue' ? T.overdueReport(params) : T.dashboard({ view, ...params, ...(view === 'trend' ? { grain } : {}) })),
    enabled: range !== 'custom' || Boolean(from && to),
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => (view === 'overdue' ? [] : (q.data?.rows || []).map(normalise)), [q.data, view]);
  const totals = useMemo(
    () => rows.reduce((a, r) => ({ total: a.total + r.total, open: a.open + r.open, overdue: a.overdue + r.overdue, inReview: a.inReview + r.inReview, completed: a.completed + r.completed, inTime: a.inTime + r.inTime, delayed: a.delayed + r.delayed, cancelled: a.cancelled + r.cancelled }), { total: 0, open: 0, overdue: 0, inReview: 0, completed: 0, inTime: 0, delayed: 0, cancelled: 0 }),
    [rows]
  );
  const first = view === 'category' ? 'Category' : view === 'trend' ? (grain === 'month' ? 'Month' : 'Day') : 'Person';
  const showExtras = range === 'custom' || view === 'trend' || teamChoices.length > 0;

  return (
    <div>
      <PageHeader title="Dashboard" />

      {/* The views on the left, the date window on the right — one row, as the HRMS's report has it. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {views.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                picked.current = true;
                setView(key);
                setTeam('');
              }}
              aria-pressed={view === key}
              className={clsx(CHIP, view === key ? 'border-brand bg-well text-brand' : 'border-line bg-card text-ink-soft hover:border-slate-300')}
            >
              <Icon className="h-[13px] w-[13px]" /> {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setRange(key)} aria-pressed={range === key} className={clsx(CHIP, range === key ? 'border-brand bg-brand text-on-brand' : 'border-line bg-card text-ink-soft hover:border-slate-300')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {showExtras && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD} aria-label="From" />
              <span className="text-ink-faint">–</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={FIELD} aria-label="To" />
            </div>
          )}
          {view === 'trend' && (
            <div className="flex gap-1.5">
              {[['day', 'By day'], ['month', 'By month']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setGrain(k)} aria-pressed={grain === k} className={clsx('min-h-[30px] rounded-lg border px-3 text-xs font-medium transition', grain === k ? 'border-brand bg-brand text-on-brand' : 'border-line bg-card text-ink-soft hover:border-slate-300')}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {teamChoices.length > 0 && (
            <select value={team} onChange={(e) => setTeam(e.target.value)} className={clsx(FIELD, 'ml-auto')} aria-label="Team">
              <option value="">{view === 'people' && !admin ? 'All my teams' : 'Any team'}</option>
              {teamChoices.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {q.error && <ErrorState error={q.error} onRetry={q.refetch} />}
      {range === 'custom' && !(from && to) && <p className="py-8 text-center text-sm text-ink-soft">Pick both dates.</p>}
      {q.isLoading && <Skeleton className="h-64 rounded-2xl" />}

      {q.data && view === 'overdue' && (
        (q.data.rows || []).length === 0 ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-6 py-12 text-center">
            <p className="text-sm font-medium text-green-700">Nothing is overdue</p>
            <p className="mt-1 text-xs text-green-600">Every task in this window is on time or done.</p>
          </div>
        ) : (
          <div className={PANE}>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 z-10 bg-well">
                <tr>
                  <th className={clsx(TH, 'text-left')}>Task</th>
                  <th className={clsx(TH, 'text-left')}>With</th>
                  <th className={clsx(TH, 'text-left')}>Given by</th>
                  <th className={clsx(TH, 'text-left')}>Was due</th>
                  <th className={clsx(TH, 'text-right')}>Late by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.rows.map((t) => (
                  <tr key={t._id} className="hover:bg-well">
                    <td className="px-3 py-2">
                      <Link to={`/tasks/${t._id}`} className="hover:text-brand">
                        <span className="text-[11px] font-semibold tracking-wide text-ink-faint">{t.code}</span> <span className="font-medium text-ink">{t.title}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{t.who || (t.assignees || []).map((a) => a.name).join(', ') || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{t.createdByName || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{dueLabel(t.dueDate, 'COMPLETED', tz).text}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600">{t.daysLate === 0 ? 'today' : `${t.daysLate} day${t.daysLate === 1 ? '' : 's'}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {q.data && view !== 'overdue' && (rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">Nothing in this window</p>
          <p className="mt-1 text-xs text-ink-soft">Try a wider date range.</p>
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {[
              ['Total', totals.total, 'text-ink'],
              ['Open', totals.open, 'text-blue-600'],
              ['Overdue', totals.overdue, 'text-red-600'],
              ['In review', totals.inReview, 'text-violet-600'],
              ['Completed', totals.completed, 'text-green-600'],
              ['Late', totals.delayed, 'text-orange-600'],
              ['Completion', `${pct(totals.completed, totals.total - totals.cancelled)}%`, 'text-brand'],
              ['On time', `${pct(totals.inTime, totals.completed)}%`, 'text-green-700'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-line bg-card px-3 py-2">
                <p className={clsx('tnum text-lg font-semibold', tone)}>{value}</p>
                <p className="text-[11px] text-ink-soft">{label}</p>
              </div>
            ))}
          </div>
          <div className={clsx(PANE, 'max-h-[32rem]')}>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 bg-well">
                <tr>
                  <th className={clsx(TH, 'sticky left-0 z-20 bg-well text-left')} title="The badge is completion: completed ÷ given, cancelled left out">
                    {first}
                  </th>
                  <th className={clsx(TH, 'text-right')}>Total</th>
                  <th className={clsx(TH, 'border-l border-line text-right')}>Open</th>
                  <th className={clsx(TH, 'text-right text-red-600')} title="A share of what is open">
                    Overdue
                  </th>
                  <th className={clsx(TH, 'text-right text-violet-600')} title="A share of what is open">
                    In review
                  </th>
                  <th className={clsx(TH, 'border-l border-line text-right text-green-600')}>Completed</th>
                  <th className={clsx(TH, 'text-right')}>In time</th>
                  <th className={clsx(TH, 'text-right text-orange-600')}>Late</th>
                  <th className={clsx(TH, 'border-l border-line text-right')} title="In time ÷ completed">
                    On time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-well">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={clsx('tnum inline-flex min-h-[20px] min-w-[42px] shrink-0 items-center justify-center rounded-lg px-1.5 py-0.5 text-[11px] font-semibold', scoreTone(r.completionPct))} title={`${r.completionPct}% of what was given is finished`}>
                          {r.completionPct}%
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-slate-700">{r.label}</span>
                          {r.pin && <span className="block font-mono text-[11px] text-ink-faint">{r.pin}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="tnum px-3 py-2 text-right font-medium text-slate-700">{r.total}</td>
                    <Cell n={r.open} of={r.total} tone="text-blue-600" border />
                    <Cell n={r.overdue} of={r.open} tone="text-red-600" />
                    <Cell n={r.inReview} of={r.open} tone="text-violet-600" />
                    <Cell n={r.completed} of={r.total} tone="text-green-600" border />
                    <Cell n={r.inTime} of={r.completed} tone="text-green-600" />
                    <Cell n={r.delayed} of={r.completed} tone="text-orange-600" />
                    <td className="tnum border-l border-line px-3 py-2 text-right font-medium text-slate-700">{r.completed ? `${r.onTimePct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ))}
    </div>
  );
}
