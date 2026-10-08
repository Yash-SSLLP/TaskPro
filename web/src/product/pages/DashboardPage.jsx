/**
 * Dashboard — count-based: what was given, what is open, overdue, in review,
 * done, and whether it was done on time. Views: Mine · Given by me · People
 * (team owners/admins and the Super Admin) · Category · Over time · Overdue
 * report. `completion %` = completed / total; `on-time %` = in time / completed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertCircle, Send, Tag, TrendingUp, User, Users } from 'lucide-react';
import { isSuperAdmin, useSession, useTz } from '../../platform/session';
import { Card, ErrorState, PageHeader, Skeleton } from '../../platform/ui';
import * as T from '../api';
import { useAdminTeams, useTaskMeta } from '../hooks';
import { RANGES, dueLabel } from '../lifecycle';

const VIEWS = [
  ['mine', 'Mine', User, false],
  ['delegated', 'Given by me', Send, false],
  ['people', 'People', Users, true],
  ['category', 'Category', Tag, false],
  ['trend', 'Over time', TrendingUp, false],
  ['overdue', 'Overdue report', AlertCircle, false],
];

const num = (v) => Number(v) || 0;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

function scoreTone(score) {
  if (score >= 85) return 'bg-green-100 text-green-700';
  if (score >= 60) return 'bg-amber-100 text-amber-700';
  if (score > 0) return 'bg-orange-100 text-orange-700';
  return 'bg-slate-100 text-ink-soft';
}

/** One row, whichever shape the server sends (Task Pro or HRMS words). */
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
    <td className={clsx('px-3 py-2.5 text-right', border && 'border-l border-line')}>
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

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Who is on top of their work — counted, not scored." />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {views.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              picked.current = true;
              setView(key);
              setTeam('');
            }}
            className={clsx('inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition', view === key ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-card text-ink-soft hover:border-slate-300')}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setRange(key)} className={clsx('h-8 rounded-lg border px-3 text-xs font-semibold', range === key ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink-soft hover:border-slate-300')}>
              {label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" aria-label="From" />
            <span className="text-ink-faint">–</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" aria-label="To" />
          </div>
        )}
        {view === 'trend' && (
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {[['day', 'By day'], ['month', 'By month']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setGrain(k)} className={clsx('h-7 rounded-lg px-3 text-xs font-semibold', grain === k ? 'bg-card text-ink shadow-sm' : 'text-ink-soft')}>
                {l}
              </button>
            ))}
          </div>
        )}
        {teamChoices.length > 0 && (
          <select value={team} onChange={(e) => setTeam(e.target.value)} className="ml-auto h-9 rounded-lg border border-line bg-card px-2 text-sm" aria-label="Team">
            <option value="">{view === 'people' && !admin ? 'All my teams' : 'Any team'}</option>
            {teamChoices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {q.error && <ErrorState error={q.error} onRetry={q.refetch} />}
      {range === 'custom' && !(from && to) && <p className="py-8 text-center text-sm text-ink-soft">Pick both dates.</p>}
      {q.isLoading && <Skeleton className="h-64 rounded-2xl" />}

      {q.data && view === 'overdue' && (
        (q.data.rows || []).length === 0 ? (
          <Card className="border-green-200 bg-green-50/50 px-6 py-12 text-center">
            <p className="text-[15px] font-semibold text-green-700">Nothing is overdue</p>
            <p className="mt-1 text-sm text-green-600">Every task in this window is on time or done.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line bg-slate-50 text-xs text-ink-soft">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">Task</th>
                  <th className="px-3 py-2.5 text-left font-semibold">With</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Given by</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Was due</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Late by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.rows.map((t) => (
                  <tr key={t._id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      <Link to={`/tasks/${t._id}`} className="hover:text-brand">
                        <span className="font-mono text-[11px] text-ink-faint">{t.code}</span> <span className="font-medium text-ink">{t.title}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">{t.who || (t.assignees || []).map((a) => a.name).join(', ') || '—'}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{t.createdByName || '—'}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{dueLabel(t.dueDate, 'COMPLETED', tz).text}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-red-600">{t.daysLate === 0 ? 'today' : `${t.daysLate} day${t.daysLate === 1 ? '' : 's'}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {q.data && view !== 'overdue' && (rows.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-ink">Nothing in this window</p>
          <p className="mt-1 text-sm text-ink-soft">Try a wider date range.</p>
        </Card>
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
              <Card key={label} className="px-3 py-2.5">
                <p className={clsx('tnum text-xl font-bold', tone)}>{value}</p>
                <p className="text-[11px] font-medium text-ink-soft">{label}</p>
              </Card>
            ))}
          </div>
          <Card className="max-h-[34rem] overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-ink-soft">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2.5 text-left font-semibold">{first}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                  <th className="border-l border-line px-3 py-2.5 text-right font-semibold">Open</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-red-600">Overdue</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-violet-600">In review</th>
                  <th className="border-l border-line px-3 py-2.5 text-right font-semibold text-green-600">Completed</th>
                  <th className="px-3 py-2.5 text-right font-semibold">In time</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-orange-600">Late</th>
                  <th className="border-l border-line px-3 py-2.5 text-right font-semibold">On time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={clsx('tnum inline-flex min-w-[42px] shrink-0 justify-center rounded-lg px-1.5 py-0.5 text-[11px] font-bold', scoreTone(r.completionPct))} title={`${r.completionPct}% of what was given is finished`}>
                          {r.completionPct}%
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{r.label}</span>
                          {r.pin && <span className="block font-mono text-[11px] text-ink-faint">{r.pin}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right font-semibold text-ink">{r.total}</td>
                    <Cell n={r.open} of={r.total} tone="text-blue-600" border />
                    <Cell n={r.overdue} of={r.open} tone="text-red-600" />
                    <Cell n={r.inReview} of={r.open} tone="text-violet-600" />
                    <Cell n={r.completed} of={r.total} tone="text-green-600" border />
                    <Cell n={r.inTime} of={r.completed} tone="text-green-600" />
                    <Cell n={r.delayed} of={r.completed} tone="text-orange-600" />
                    <td className="tnum border-l border-line px-3 py-2.5 text-right font-semibold text-ink">{r.completed ? `${r.onTimePct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-[11px] text-ink-faint">The badge is completion (completed ÷ given, cancelled left out). On time is in-time ÷ completed. Overdue and in review are shares of what is open.</p>
        </>
      ))}
    </div>
  );
}
