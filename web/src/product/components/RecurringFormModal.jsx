/**
 * Set up (or edit) a recurring task — a SCHEDULE. Nothing is raised here:
 * each occurrence lands in the doer's Tasks when it is due to appear (on its
 * day, or `leadDays` early). Patterns: every N days, weekdays, a monthly date
 * or "the first Monday", yearly; with a time, a start and an optional end.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarDays, Eye, Flag, Link2, Plus, Repeat, Tag, UserCheck, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { dayKey } from '../../platform/format';
import { useSettings } from '../../platform/session';
import { Button, Modal, Switch } from '../../platform/ui';
import * as T from '../api';
import { useCategories } from '../hooks';
import {
  DEFAULT_LEAD_DAYS, FREQUENCY_LABELS, MAX_LEAD_DAYS, MONTH_NAMES, NTH_WEEKS, RECUR_FREQUENCIES, TASK_PRIORITY, WEEKDAY_NAMES, idOf, ordinal,
  patternLabel, priorityColor, tintStyle,
} from '../lifecycle';
import { PeoplePicker } from './PeoplePicker';
import { ReminderEditor, Stepper, WeekdayPicker, chipCls } from './Reminders';
import { VoiceRecorder } from './VoiceNote';

const inputCls = 'block h-11 w-full rounded-xl border border-line bg-card px-3 text-[15px] text-ink shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';
const labelCls = 'mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink';

/** A stored day (midnight in some zone, or "YYYY-MM-DD") → "YYYY-MM-DD" in mine. */
const ymd = (d, tz) => (!d ? '' : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : dayKey(d, tz));

function emptyForm(tz, approvalDefault) {
  const now = new Date();
  return {
    title: '',
    description: '',
    assignees: [],
    onBehalfOf: '',
    loopUsers: [],
    team: '',
    category: '',
    priority: 'Medium',
    requiresApproval: approvalDefault !== false,
    links: [],
    reminders: [],
    frequency: 'DAILY',
    interval: 1,
    weekdays: [now.getDay()],
    monthlyMode: 'DATE',
    monthDay: now.getDate(),
    nthWeek: 1,
    weekday: 1,
    month: now.getMonth() + 1,
    time: '18:00',
    startDate: dayKey(now, tz),
    until: '',
    leadDays: null,
  };
}

export function RecurringFormModal({ open, onClose, onSaved, meta, scheduleId = null }) {
  const settings = useSettings();
  const tz = settings.timezone;
  const qc = useQueryClient();
  const categories = useCategories(meta);
  const [form, setForm] = useState(() => emptyForm(tz, settings.approvalDefault));
  const [voice, setVoice] = useState(null);
  const [linkDraft, setLinkDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return undefined;
    setForm(emptyForm(tz, settings.approvalDefault));
    setVoice(null);
    setLinkDraft('');
    if (!scheduleId) return undefined;
    let live = true;
    setLoading(true);
    T.getRecurring(scheduleId)
      .then(({ schedule: sc }) => {
        if (!live || !sc) return;
        setForm((f) => ({
          ...f,
          title: sc.title || '',
          description: sc.description || '',
          assignees: (sc.assignees || []).map(idOf).filter(Boolean),
          loopUsers: (sc.loopUsers || []).map(idOf).filter(Boolean),
          team: idOf(sc.team) || '',
          category: sc.category || '',
          priority: sc.priority || 'Medium',
          requiresApproval: sc.requiresApproval !== false,
          links: (sc.links || []).map((l) => ({ url: l.url, label: l.label || '' })),
          reminders: sc.reminders || [],
          frequency: sc.frequency || 'DAILY',
          interval: sc.interval || 1,
          ...(sc.weekdays?.length ? { weekdays: sc.weekdays } : {}),
          monthlyMode: sc.monthlyMode || 'DATE',
          ...(sc.monthDay ? { monthDay: sc.monthDay } : {}),
          ...(sc.nthWeek ? { nthWeek: sc.nthWeek } : {}),
          ...(Number.isInteger(sc.weekday) ? { weekday: sc.weekday } : {}),
          ...(sc.month ? { month: sc.month } : {}),
          time: sc.time || '18:00',
          startDate: ymd(sc.startDate, tz) || f.startDate,
          until: ymd(sc.until, tz),
          leadDays: Number.isInteger(sc.leadDays) ? sc.leadDays : null,
        }));
      })
      .catch((err) => {
        toast.error(err.message || 'Could not open that schedule.');
        onClose?.();
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scheduleId]);

  const people = meta?.people || [];
  const myId = String(meta?.me || people.find((p) => p.relation === 'self')?._id || '');
  const onBehalf = meta?.canAssignOnBehalf && !scheduleId && form.onBehalfOf && form.onBehalfOf !== myId ? form.onBehalfOf : '';
  const selfOnly = form.assignees.length === 0 || (form.assignees.length === 1 && form.assignees[0] === (onBehalf || myId));
  const routine = form.frequency === 'DAILY';
  const teams = meta?.teams || [];
  const team = teams.find((t) => String(t.id) === String(form.team));
  const lead = form.leadDays ?? (meta?.defaultLeadDays?.[form.frequency] ?? DEFAULT_LEAD_DAYS[form.frequency] ?? 0);
  const maxLead = meta?.maxLeadDays || MAX_LEAD_DAYS;

  const pattern = useMemo(
    () => ({
      frequency: form.frequency,
      ...(form.frequency === 'DAILY' ? { interval: form.interval } : {}),
      ...(form.frequency === 'WEEKLY' ? { weekdays: form.weekdays } : {}),
      ...(form.frequency === 'MONTHLY' ? { monthlyMode: form.monthlyMode, ...(form.monthlyMode === 'WEEKDAY' ? { nthWeek: form.nthWeek, weekday: form.weekday } : { monthDay: form.monthDay }) } : {}),
      ...(form.frequency === 'YEARLY' ? { month: form.month, monthDay: form.monthDay } : {}),
      time: form.time || '18:00',
    }),
    [form]
  );

  if (!open) return null;

  const submit = async () => {
    if (!form.title.trim()) return toast.error('Give the task a title.');
    if (form.frequency === 'WEEKLY' && !form.weekdays.length) return toast.error('Pick at least one day of the week.');
    if (form.until && form.until < form.startDate) return toast.error('The end date is before the start date.');
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim(),
        assignees: form.assignees,
        loopUsers: form.loopUsers,
        team: form.team || null,
        category: form.category,
        priority: form.priority,
        requiresApproval: selfOnly || routine ? false : form.requiresApproval !== false,
        links: form.links,
        ...pattern,
        startDate: form.startDate,
        until: form.until || null,
        leadDays: lead,
        reminders: form.reminders,
        ...(onBehalf ? { onBehalfOf: onBehalf } : {}),
      };
      const res = scheduleId ? await T.updateRecurring(scheduleId, body, { voice }) : await T.createRecurring(body, { voice });
      toast.success(res?.message || (scheduleId ? 'Recurring task saved.' : 'Recurring task set up.'));
      qc.invalidateQueries({ queryKey: ['tasks', 'recurring'] });
      onSaved?.(res?.schedule);
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Could not save the recurring task.');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={scheduleId ? 'Edit recurring task' : 'New recurring task'}
      subtitle="Set it up once — each time it comes round, it lands in their Tasks on its own."
      footer={
        <>
          <span className="mr-auto hidden text-xs text-ink-soft sm:inline">{patternLabel(pattern)}</span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Repeat} loading={saving} onClick={submit}>
            {scheduleId ? 'Save' : 'Set it up'}
          </Button>
        </>
      }
    >
      <div className={clsx('space-y-4', loading && 'pointer-events-none opacity-50')}>
        <div>
          <label className={labelCls} htmlFor="rec-title">
            Task title
          </label>
          <input id="rec-title" autoFocus value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Count and lock the cash" maxLength={300} className={inputCls} />
        </div>
        <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2} maxLength={5000} placeholder="Details…" className="block w-full resize-y rounded-xl border border-line px-3.5 py-2.5 text-[15px] shadow-sm placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />

        <PeoplePicker label="Assign to" icon={Users} people={people} value={form.assignees} onChange={(ids) => set({ assignees: ids })} allowSelf selfId={myId} teamId={form.team} teamName={team?.name} placeholder="Myself — or choose people" hint={form.assignees.length ? null : 'Nobody chosen: each one goes on your own list.'} />
        {meta?.canAssignOnBehalf && !scheduleId && (
          <PeoplePicker label="On behalf of" icon={UserCheck} people={people.filter((p) => idOf(p) !== myId)} value={form.onBehalfOf} onChange={(id) => set({ onBehalfOf: (Array.isArray(id) ? id[0] : id) || '' })} max={1} placeholder="Yourself" />
        )}
        <PeoplePicker label="Keep in the loop" icon={Eye} people={people} value={form.loopUsers} onChange={(ids) => set({ loopUsers: ids })} placeholder="Nobody" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              <Users className="h-4 w-4 text-ink-faint" /> Team <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <select value={form.team} onChange={(e) => set({ team: e.target.value })} className={inputCls}>
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              <Tag className="h-4 w-4 text-ink-faint" /> Category <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <select value={form.category} onChange={(e) => set({ category: e.target.value })} className={inputCls}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c._id || c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
              {form.category && !categories.some((c) => c.name === form.category) && <option value={form.category}>{form.category}</option>}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <Flag className="h-4 w-4 text-ink-faint" /> Priority
          </span>
          {TASK_PRIORITY.map((p) => {
            const colour = priorityColor(p);
            const on = form.priority === p;
            return (
              <button key={p} type="button" onClick={() => set({ priority: p })} aria-pressed={on} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold" style={on ? { backgroundColor: colour.solid, borderColor: colour.solid, color: '#fff' } : tintStyle(colour)}>
                {p}
              </button>
            );
          })}
        </div>

        {/* ── Repeats ── */}
        <div className="space-y-3 rounded-2xl border border-line p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Repeats</p>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 min-[380px]:grid-cols-4" role="tablist">
            {RECUR_FREQUENCIES.map((f) => (
              <button key={f} type="button" role="tab" aria-selected={form.frequency === f} onClick={() => set({ frequency: f, leadDays: null })} className={clsx('h-9 rounded-lg text-sm font-semibold', form.frequency === f ? 'bg-card text-ink shadow-sm' : 'text-ink-soft hover:text-ink')}>
                {FREQUENCY_LABELS[f]}
              </button>
            ))}
          </div>

          {form.frequency === 'DAILY' && (
            <div className="flex flex-wrap items-center gap-2">
              {[[1, 'Every day'], [2, 'Alternate days'], [3, 'Every 3 days']].map(([n, label]) => (
                <button key={n} type="button" aria-pressed={form.interval === n} onClick={() => set({ interval: n })} className={chipCls(form.interval === n)}>
                  {label}
                </button>
              ))}
              <Stepper label="Every how many days" value={form.interval} min={1} max={meta?.maxDayInterval || 31} onChange={(n) => set({ interval: n })} format={(n) => `every ${n} day${n === 1 ? '' : 's'}`} />
            </div>
          )}
          {form.frequency === 'WEEKLY' && <WeekdayPicker value={form.weekdays} onChange={(weekdays) => set({ weekdays })} />}
          {form.frequency === 'MONTHLY' && (
            <div className="space-y-2">
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                {[['DATE', 'On a date'], ['WEEKDAY', 'On a weekday']].map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={form.monthlyMode === k} onClick={() => set({ monthlyMode: k })} className={clsx('h-8 rounded-lg px-3 text-xs font-semibold', form.monthlyMode === k ? 'bg-card text-ink shadow-sm' : 'text-ink-soft')}>
                    {label}
                  </button>
                ))}
              </div>
              {form.monthlyMode === 'DATE' ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                  Day of the month <Stepper value={form.monthDay} min={1} max={31} onChange={(n) => set({ monthDay: n })} format={ordinal} />
                  {form.monthDay > 28 && <span className="text-xs text-ink-faint">In a shorter month it falls on the last day.</span>}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                  The
                  <select value={form.nthWeek} onChange={(e) => set({ nthWeek: Number(e.target.value) })} className="h-9 rounded-lg border border-line px-2 text-sm" aria-label="Which one">
                    {NTH_WEEKS.map((n) => (
                      <option key={n.key} value={n.key}>
                        {n.label.toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <select value={form.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })} className="h-9 rounded-lg border border-line px-2 text-sm" aria-label="Day of the week">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <option key={d} value={d}>
                        {WEEKDAY_NAMES[d]}
                      </option>
                    ))}
                  </select>
                  of every month
                </div>
              )}
            </div>
          )}
          {form.frequency === 'YEARLY' && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              On <Stepper value={form.monthDay} min={1} max={31} onChange={(n) => set({ monthDay: n })} format={(n) => String(n)} />
              <select value={form.month} onChange={(e) => set({ month: Number(e.target.value) })} className="h-9 rounded-lg border border-line px-2 text-sm" aria-label="Month">
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium text-ink">
              Due at
              <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value || '18:00' })} className={clsx(inputCls, 'mt-1.5')} />
            </label>
            <label className="text-sm font-medium text-ink">
              Starts on
              <input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} className={clsx(inputCls, 'mt-1.5')} />
            </label>
            <label className="text-sm font-medium text-ink">
              Ends on <span className="font-normal text-ink-faint">(optional)</span>
              <input type="date" value={form.until} min={form.startDate} onChange={(e) => set({ until: e.target.value })} className={clsx(inputCls, 'mt-1.5')} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <CalendarDays className="h-4 w-4 text-ink-faint" /> Appears in their Tasks
            <Stepper label="Lead days" value={lead} min={0} max={maxLead} onChange={(n) => set({ leadDays: n })} format={(n) => (n === 0 ? 'on the day' : `${n} day${n === 1 ? '' : 's'} early`)} />
          </div>

          <div className="flex items-start gap-3 rounded-xl bg-brand-soft/70 px-3 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-white">
              <Repeat className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{patternLabel(pattern)}</p>
              <p className="text-xs text-ink-soft">
                {lead ? `Appears ${lead} day${lead === 1 ? '' : 's'} before it is due.` : 'Appears on the day it is due.'}
                {routine ? ' A daily task is only marked done — nothing to accept, no review.' : ''}
              </p>
            </div>
          </div>
        </div>

        {!selfOnly && !routine && (
          <Switch checked={form.requiresApproval !== false} onChange={(v) => set({ requiresApproval: v })} label="I'll check it before it's done" description="Each occurrence waits for your approval once handed in." />
        )}

        <div className="space-y-2 rounded-2xl border border-line p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">Reminders</p>
          <ReminderEditor value={form.reminders} onChange={(reminders) => set({ reminders })} emptyText="No reminders of your own — your defaults from Settings apply to each occurrence." />
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && linkDraft.trim()) {
                  e.preventDefault();
                  const url = linkDraft.trim();
                  set({ links: [...form.links, { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, label: '' }] });
                  setLinkDraft('');
                }
              }}
              placeholder="Add a link (press Enter)"
              className="h-10 min-w-0 flex-1 rounded-xl border border-line px-3 text-sm"
            />
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              onClick={() => {
                const url = linkDraft.trim();
                if (!url) return;
                set({ links: [...form.links, { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, label: '' }] });
                setLinkDraft('');
              }}
            >
              Link
            </Button>
          </div>
          {form.links.map((l, i) => (
            <div key={`${l.url}-${i}`} className="flex items-center gap-2 text-sm">
              <Link2 className="h-3.5 w-3.5 text-ink-faint" />
              <span className="min-w-0 flex-1 truncate text-ink-soft">{l.url}</span>
              <button type="button" onClick={() => set({ links: form.links.filter((_, j) => j !== i) })} className="text-ink-faint hover:text-red-600" aria-label="Remove link">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <VoiceRecorder value={voice} onChange={setVoice} />
        </div>
      </div>
    </Modal>
  );
}
