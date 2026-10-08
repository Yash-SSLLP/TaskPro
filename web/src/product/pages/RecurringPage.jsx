/**
 * Recurring — the schedules (not the tasks they raise). Each occurrence is an
 * ordinary task that lands in the doer's Tasks when it is due to appear.
 * Pause / resume, run now, edit, delete. Open to everyone; the server decides
 * who may change which (creator, the team's owner/admin, the Super Admin).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, Bell, CalendarDays, CheckCircle2, Pencil, Play, Plus, Repeat, Search, Trash2, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTz } from '../../platform/session';
import { Button, Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, Switch, useConfirm } from '../../platform/ui';
import * as T from '../api';
import { useMeId, useTaskMeta } from '../hooks';
import { dateTimeLabel, idOf, patternLabel, personName, reminderLabel, statusLabel } from '../lifecycle';
import { PriorityChip } from '../components/TaskChips';
import { RecurringFormModal } from '../components/RecurringFormModal';

/** May I change this one? The server's word when it sends one; otherwise assume yes (it still refuses). */
const mayManage = (r) => r.can?.edit ?? r.canManage ?? true;

function Stat({ label, value, tone }) {
  return (
    <Card className="px-4 py-3">
      <p className={clsx('tnum text-2xl font-bold', tone || 'text-ink')}>{value}</p>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
    </Card>
  );
}

export function RecurringPage() {
  const tz = useTz();
  const me = useMeId();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: meta } = useTaskMeta();
  const [show, setShow] = useState('all');
  const [text, setText] = useState('');
  const [form, setForm] = useState(null); // { id } | {}

  const q = useQuery({ queryKey: ['tasks', 'recurring'], queryFn: () => T.listRecurring() });
  const rows = useMemo(() => q.data?.schedules || [], [q.data]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tasks', 'recurring'] });
  };

  const toggle = useMutation({
    mutationFn: (r) => T.updateRecurring(r._id, { isActive: !r.isActive }),
    onSuccess: (res, r) => {
      toast.success(r.isActive ? 'Paused — nothing more is raised until you resume it.' : 'Resumed — it picks up from the next one.');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const run = useMutation({
    mutationFn: (r) => T.runRecurring(r._id),
    onSuccess: (res) => {
      const n = res?.raised ?? res?.tasks?.length ?? 0;
      toast.success(n ? `Raised ${n} task${n === 1 ? '' : 's'} now.` : 'Nothing was due to be raised.');
      refresh();
      qc.invalidateQueries({ queryKey: ['tasks', 'list'] });
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = async (r) => {
    const ok = await confirm({ title: 'Delete this recurring task?', text: `"${r.title}" will not be raised again. The tasks already raised stay, with their history.`, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await T.deleteRecurring(r._id);
      toast.success('Deleted.');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const shown = rows.filter((r) => {
    if (show === 'running' && !r.isActive) return false;
    if (show === 'paused' && r.isActive) return false;
    const s = text.trim().toLowerCase();
    if (!s) return true;
    return `${r.title} ${r.who || ''} ${r.category || ''}`.toLowerCase().includes(s);
  });
  const stats = {
    total: rows.length,
    running: rows.filter((r) => r.isActive).length,
    paused: rows.filter((r) => !r.isActive).length,
    raised: rows.reduce((n, r) => n + (r.stats?.raised || 0), 0),
    open: rows.reduce((n, r) => n + (r.stats?.open || 0), 0),
  };

  return (
    <div>
      <PageHeader
        title="Recurring"
        subtitle="Set it up once — each time it comes round, it lands in their Tasks on its own."
        actions={
          <Button icon={Plus} onClick={() => setForm({})}>
            New recurring task
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Schedules" value={stats.total} />
        <Stat label="Running" value={stats.running} tone="text-green-600" />
        <Stat label="Paused" value={stats.paused} tone="text-ink-soft" />
        <Stat label="Raised so far" value={stats.raised} tone="text-brand" />
        <Stat label="Open right now" value={stats.open} tone="text-amber-600" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 shadow-sm sm:max-w-sm">
          <Search className="h-4 w-4 text-ink-faint" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search schedules" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" aria-label="Search schedules" />
        </label>
        <Segmented
          value={show}
          onChange={setShow}
          options={[
            { value: 'all', label: 'All' },
            { value: 'running', label: 'Running' },
            { value: 'paused', label: 'Paused' },
          ]}
        />
      </div>

      {q.error && <ErrorState error={q.error} onRetry={q.refetch} />}
      {q.isLoading && <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>}
      {q.data && rows.length === 0 && (
        <Card>
          <EmptyState icon={Repeat} title="No recurring tasks yet" text="The daily cash count, Friday’s report, the month-end stock take — set it up once, and each one lands in their Tasks when it comes round." action={<Button icon={Plus} onClick={() => setForm({})}>New recurring task</Button>} />
        </Card>
      )}
      {q.data && rows.length > 0 && shown.length === 0 && <p className="py-10 text-center text-sm text-ink-soft">Nothing matches.</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {shown.map((r) => {
          const who = r.who || (r.assignees || []).map(personName).filter(Boolean).join(', ');
          const byMe = Boolean(me) && idOf(r.createdBy) === String(me);
          const onlyMe = byMe && (r.assignees || []).length === 1 && idOf(r.assignees[0]) === String(me);
          const setBy = byMe ? 'you' : r.createdByName || personName(r.createdBy) || '—';
          const future = r.next && new Date(r.next.appearAt) > new Date();
          const manage = mayManage(r);
          const team = r.team?.name || r.teamName;
          return (
            <Card key={r._id} className={clsx('flex flex-col gap-3 p-4', !r.isActive && 'bg-slate-50')}>
              <div className="flex items-start gap-3">
                <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', r.isActive ? 'bg-brand text-white' : 'bg-slate-100 text-ink-faint')}>
                  <Repeat className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[15px] font-semibold text-ink">{r.title}</p>
                  <p className="mt-0.5 text-xs font-semibold text-ink-soft">{r.patternLabel || patternLabel(r)}</p>
                </div>
                {manage && (
                  <div className="shrink-0" title={r.isActive ? 'Running — pause it' : 'Paused — resume it'}>
                    <Switch checked={Boolean(r.isActive)} onChange={() => toggle.mutate(r)} disabled={toggle.isPending} label={<span className="sr-only">{r.isActive ? 'Pause' : 'Resume'}</span>} />
                  </div>
                )}
              </div>
              <div className="space-y-1.5 text-xs text-ink-soft">
                <p className="flex items-start gap-2">
                  <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                  {onlyMe ? (
                    <span>Your own task</span>
                  ) : (
                    <span className="min-w-0 break-words">
                      <span className="text-ink-faint">By </span>
                      <span className="font-medium text-ink">{setBy}</span>
                      {r.onBehalf?.byName && <span className="text-ink-faint"> (sent by {r.onBehalf.byName})</span>}
                      <ArrowRight className="mx-1.5 inline h-3 w-3 text-ink-faint" />
                      <span className="text-ink-faint">To </span>
                      <span className="font-medium text-ink">{who || 'the setter'}</span>
                    </span>
                  )}
                </p>
                {team && (
                  <p className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-ink-faint" /> {team}
                  </p>
                )}
                <p className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                  {r.isActive && (r.next || r.nextDueDate) ? (
                    <span>
                      Next due <span className="font-semibold text-ink">{dateTimeLabel(r.next?.dueAt || r.nextDueDate, tz)}</span>
                      {future && <span className="text-ink-faint"> · appears {dateTimeLabel(r.next.appearAt, tz)}</span>}
                    </span>
                  ) : (
                    <span className="text-ink-faint">{r.isActive ? 'Nothing more to raise — it has ended.' : 'Paused — nothing is being raised.'}</span>
                  )}
                </p>
                {(r.reminders || []).length > 0 && (
                  <p className="flex items-start gap-2">
                    <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                    <span>{(r.reminderLabels || r.reminders.map(reminderLabel)).join(' · ')}</span>
                  </p>
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <PriorityChip priority={r.priority} always />
                {r.routine && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                    <CheckCircle2 className="h-3 w-3" /> Mark done only
                  </span>
                )}
                {r.stats?.raised > 0 && (
                  <span className="text-[11px] text-ink-faint">
                    {r.stats.raised} raised · {r.stats.open} open · {r.stats.done} done
                    {r.stats.last ? ` · latest ${r.stats.last.code || ''} ${statusLabel(r.stats.last.status).toLowerCase()}` : ''}
                  </span>
                )}
                {manage && (
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="secondary" icon={Play} loading={run.isPending && run.variables?._id === r._id} disabled={!r.isActive} onClick={() => run.mutate(r)} title="Raise any occurrence that is due now">
                      Run now
                    </Button>
                    <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setForm({ id: r._id })}>
                      Edit
                    </Button>
                    <button type="button" onClick={() => remove(r)} className="grid h-9 w-9 place-items-center rounded-xl text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <RecurringFormModal open={Boolean(form)} onClose={() => setForm(null)} meta={meta} scheduleId={form?.id || null} onSaved={refresh} />
    </div>
  );
}
