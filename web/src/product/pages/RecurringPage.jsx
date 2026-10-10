/**
 * Recurring — the schedules (not the tasks they raise). Each occurrence is an
 * ordinary task that lands in the doer's Tasks when it is due to appear.
 * Pause / resume, run now, edit, delete. Open to everyone; the server decides
 * who may change which (creator, the organization's owner/admin, the Super Admin).
 *
 * The cards are the HRMS's (TaskRecurring there): a brand tile, the title and
 * its pattern, a small on/off switch, who and when, and labelled small buttons.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, Bell, CalendarDays, CheckCircle2, Pencil, Play, Plus, Repeat, Search, Trash2, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTz } from '../../platform/session';
import { Button, ErrorState, PageHeader, Segmented, Skeleton, useConfirm } from '../../platform/ui';
import * as T from '../api';
import { useMeId, useTaskMeta } from '../hooks';
import { dateTimeLabel, idOf, patternLabel, personName, reminderLabel, statusLabel } from '../lifecycle';
import { PriorityChip } from '../components/TaskChips';
import { RecurringFormModal } from '../components/RecurringFormModal';

/** May I change this one? The server's word when it sends one; otherwise assume yes (it still refuses). */
const mayManage = (r) => r.can?.edit ?? r.canManage ?? true;

/** A small labelled button on a card's foot (HRMS 32px). */
const FOOT_BTN = 'inline-flex min-h-[32px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

function Stat({ label, value, tone }) {
  return (
    <div className="shrink-0 rounded-xl border border-line bg-card px-3 py-1.5 sm:py-2">
      <p className={clsx('tnum text-base font-semibold sm:text-lg', tone || 'text-ink')}>{value}</p>
      <p className="whitespace-nowrap text-[11px] text-ink-soft">{label}</p>
    </div>
  );
}

/** The HRMS's small switch (18 × 32): running or paused. */
function MiniSwitch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onChange}
      className={clsx(
        'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        checked ? 'border-transparent bg-brand' : 'border-slate-300 bg-slate-200 hover:bg-slate-300'
      )}
    >
      {/* The knob stays white on either track, in either theme. */}
      <span className={clsx('pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-150', checked ? 'translate-x-[14px]' : 'translate-x-[2px]')} />
    </button>
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
        actions={
          <Button icon={Plus} onClick={() => setForm({})}>
            New recurring task
          </Button>
        }
      />

      {/* One sideways strip on a phone (the list starts high), five across from sm up. */}
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:mb-4 sm:grid sm:grid-cols-5 sm:px-0">
        <Stat label="Schedules" value={stats.total} />
        <Stat label="Running" value={stats.running} tone="text-green-600" />
        <Stat label="Paused" value={stats.paused} tone="text-ink-soft" />
        <Stat label="Raised so far" value={stats.raised} tone="text-brand" />
        <Stat label="Open right now" value={stats.open} tone="text-amber-600" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 shadow-sm focus-within:border-slate-300 sm:max-w-sm">
          <Search className="h-[15px] w-[15px] shrink-0 text-ink-faint" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint focus-visible:ring-0 focus-visible:ring-offset-0" aria-label="Search schedules" />
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
      {q.isLoading && <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>}
      {q.data && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-ink-soft">
            <Repeat className="h-5 w-5" />
          </span>
          <p className="font-semibold text-ink">No recurring tasks yet</p>
          <Button className="mt-4" icon={Plus} onClick={() => setForm({})}>
            New recurring task
          </Button>
        </div>
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
            <div key={r._id} className={clsx('flex flex-col gap-3 rounded-2xl border border-line p-4 shadow-sm transition', r.isActive ? 'bg-card' : 'bg-well')}>
              <div className="flex items-start gap-3">
                <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', r.isActive ? 'bg-brand text-on-brand' : 'bg-slate-100 text-ink-faint')}>
                  <Repeat className="h-[17px] w-[17px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold text-ink">{r.title}</p>
                  <p className="mt-0.5 text-xs font-semibold text-ink-soft">{r.patternLabel || patternLabel(r)}</p>
                </div>
                {manage && <MiniSwitch checked={Boolean(r.isActive)} onChange={() => toggle.mutate(r)} disabled={toggle.isPending} label={r.isActive ? 'Running — pause it' : 'Paused — resume it'} />}
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <p className="flex items-start gap-2">
                  <User className="mt-0.5 h-[13px] w-[13px] shrink-0 text-ink-faint" />
                  {onlyMe ? (
                    <span>Your own task</span>
                  ) : (
                    <span className="min-w-0 break-words">
                      <span className="text-ink-faint">By </span>
                      <span className="font-medium text-slate-700">{setBy}</span>
                      {r.onBehalf?.byName && <span className="text-ink-faint"> (sent by {r.onBehalf.byName})</span>}
                      <ArrowRight className="mx-1.5 inline h-[11px] w-[11px] align-[-1px] text-ink-faint" />
                      <span className="text-ink-faint">To </span>
                      <span className="font-medium text-slate-700">{who || 'the setter'}</span>
                    </span>
                  )}
                </p>
                {team && (
                  <p className="flex items-center gap-2">
                    <Users className="h-[13px] w-[13px] shrink-0 text-ink-faint" /> {team}
                  </p>
                )}
                <p className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-[13px] w-[13px] shrink-0 text-ink-faint" />
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
                    <Bell className="mt-0.5 h-[13px] w-[13px] shrink-0 text-ink-faint" />
                    <span>{(r.reminderLabels || r.reminders.map(reminderLabel)).join(' · ')}</span>
                  </p>
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <PriorityChip priority={r.priority} always />
                {r.routine && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                    <CheckCircle2 className="h-[11px] w-[11px]" /> Mark done only
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
                    <button type="button" onClick={() => run.mutate(r)} disabled={!r.isActive || (run.isPending && run.variables?._id === r._id)} title="Raise any occurrence that is due now" className={clsx(FOOT_BTN, 'border-line bg-card text-slate-700 hover:border-slate-300')}>
                      <Play className="h-[13px] w-[13px]" /> {run.isPending && run.variables?._id === r._id ? 'Running…' : 'Run now'}
                    </button>
                    <button type="button" onClick={() => setForm({ id: r._id })} className={clsx(FOOT_BTN, 'border-line bg-card text-slate-700 hover:border-slate-300')}>
                      <Pencil className="h-[13px] w-[13px]" /> Edit
                    </button>
                    <button type="button" onClick={() => remove(r)} title="Delete this recurring task" className={clsx(FOOT_BTN, 'border-red-200 bg-card text-red-600 hover:bg-red-50')}>
                      <Trash2 className="h-[13px] w-[13px]" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <RecurringFormModal open={Boolean(form)} onClose={() => setForm(null)} meta={meta} scheduleId={form?.id || null} onSaved={refresh} />
    </div>
  );
}
