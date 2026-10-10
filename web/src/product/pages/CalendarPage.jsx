/**
 * Calendar: the month board, after the HRMS's (pages/Calendar.jsx there).
 *
 * What is on it (GET /api/calendar): my open tasks on the day they are due
 * (overdue in red), tasks finished on the day they were finished, and the
 * reminders I can see: mine, and ones set for me. Reminders are added, edited
 * and deleted right here (/api/reminders): for myself, for people I can give
 * work to, for an organization I run, or (the Super Admin) for everyone.
 *
 * A lone entry fills its day as a solid tile; more stack as chips, then
 * "+N more". On a phone the chips become dots and a tap on the day lists it.
 * The footer keeps the colour key with the month's counts, and the month's
 * first dozen entries.
 *
 * URL: ?date=YYYY-MM-DD opens that month with the day's list showing (the
 * link a reminder's alert carries).
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../platform/api';
import { Button, ErrorState, Input, Modal, PageHeader, Select, Textarea, finePointer, useConfirm } from '../../platform/ui';
import { useTaskMeta } from '../hooks';
import { TaskModal } from '../components/TaskModal';
import {
  KINDS, KIND_ORDER, MONTH_NAMES, PRIORITIES, SCOPE_LABELS, WEEKDAYS, dayKeyOf, detailRows, isReminder, kindMeta, kindOf, longDate,
  monthCells, parseDay, ymKey,
} from '../calendar';

const MAX_TILES = 3;
const PEOPLE_SHOWN = 60;
const BLANK = { id: null, title: '', date: '', time: '', notes: '', priority: 'Normal', scope: 'self', recipients: [], team: '', ownAudience: true };

/** "16:00" → "16:00"; "4:00 PM" → "16:00"; anything else → '' (a time input can't show it). */
function toInputTime(text) {
  const s = String(text || '').trim();
  const twelve = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i.exec(s);
  if (twelve) {
    const h = (Number(twelve[1]) % 12) + (twelve[3].toLowerCase() === 'p' ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${twelve[2] || '00'}`;
  }
  return /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, '0') : '';
}

export function CalendarPage() {
  const [search, setSearch] = useSearchParams();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const today = new Date();
  const asked = parseDay(search.get('date'));

  const [view, setView] = useState(() => (asked ? { y: asked.y, m: asked.m } : { y: today.getFullYear(), m: today.getMonth() + 1 }));
  const [dayList, setDayList] = useState(asked ? asked.d : null); // the day open in the day sheet
  const [picked, setPicked] = useState(asked ? asked.d : null); // the day ringed on the grid
  const [selected, setSelected] = useState(null); // the entry open in its detail
  const [form, setForm] = useState(null); // the reminder editor; null = closed
  const [openTask, setOpenTask] = useState(null);

  // A new ?date= (an alert opened while this page is showing) moves the board there.
  useEffect(() => {
    if (!asked) return;
    setView({ y: asked.y, m: asked.m });
    setPicked(asked.d);
    setDayList(asked.d);
    setSearch((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('date');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.get('date')]);

  const month = ymKey(view.y, view.m);
  const q = useQuery({ queryKey: ['calendar', month], queryFn: () => api.get(`/api/calendar?month=${month}`) });
  const events = useMemo(() => (q.data?.events || []).map((e) => ({ ...e, kind: kindOf(e) })), [q.data]);
  const aim = q.data?.aim || { users: true, teams: [], everyone: false };

  const byDay = useMemo(() => {
    const map = {};
    for (const e of events) (map[e.day] = map[e.day] || []).push(e);
    for (const d of Object.keys(map)) map[d].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    return map;
  }, [events]);
  const counts = useMemo(() => {
    const c = {};
    for (const e of events) c[e.kind] = (c[e.kind] || 0) + 1;
    return c;
  }, [events]);
  const cells = useMemo(() => monthCells(view.y, view.m), [view]);

  const isToday = (d) => d === today.getDate() && view.m === today.getMonth() + 1 && view.y === today.getFullYear();
  const step = (dir) => {
    setPicked(null);
    setView(({ y, m }) => {
      const n = m + dir;
      return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n };
    });
  };
  const goToday = () => {
    setView({ y: today.getFullYear(), m: today.getMonth() + 1 });
    setPicked(today.getDate());
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['calendar'] });

  // ---- Reminders ----
  const openNew = (day) => setForm({ ...BLANK, date: dayKeyOf(view.y, view.m, day || (view.m === today.getMonth() + 1 && view.y === today.getFullYear() ? today.getDate() : 1)) });
  const openEdit = (e) => {
    const m = e.meta || {};
    setSelected(null);
    setForm({
      id: m.reminderId,
      title: e.label,
      date: e.date,
      // A clock time goes in the time box; words typed elsewhere ("after
      // lunch") are kept as they are unless a time is picked.
      time: m.timed ? m.time : '',
      rawTime: m.timed ? '' : m.time || '',
      notes: m.notes || '',
      priority: m.priority || 'Normal',
      scope: m.scope || 'self',
      recipients: (m.recipientIds || []).map(String),
      team: m.team?.id || '',
      // Only the setter is handed the audience list; the Super Admin editing
      // someone else's "specific people" reminder keeps theirs untouched.
      ownAudience: m.mine || (m.recipientIds || []).length > 0 || m.scope !== 'users',
      teamName: m.team?.name || '',
    });
  };
  const deleteReminder = async (e) => {
    const ok = await confirm({
      title: 'Delete this reminder?',
      text: `“${e.label}” is removed for everyone it was set for.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`/api/reminders/${e.meta.reminderId}`);
      setSelected(null);
      toast.success('Reminder deleted.');
      refresh();
    } catch (err) {
      toast.error(err.message || 'Could not delete the reminder.');
    }
  };
  const onSaved = (date) => {
    const at = parseDay(date);
    if (at && (at.y !== view.y || at.m !== view.m)) setView({ y: at.y, m: at.m });
    if (at) setPicked(at.d);
    refresh();
  };

  // ---- A day cell ----
  const renderCell = (cell, idx) => {
    const entries = cell.inMonth ? byDay[cell.day] || [] : [];
    const solo = entries.length === 1 ? entries[0] : null;
    const soloMeta = solo ? kindMeta(solo.kind) : null;
    return (
      <div
        key={idx}
        className={clsx('cal-cell', !cell.inMonth && 'is-out', cell.inMonth && isToday(cell.day) && 'is-today', cell.inMonth && picked === cell.day && 'is-picked')}
        style={solo ? { backgroundColor: soloMeta.color } : undefined}
      >
        {solo ? (
          <button type="button" onClick={() => setSelected(solo)} title={`${soloMeta.label}: ${solo.label}`} className="cal-tile cal-tile-solo" style={{ color: soloMeta.fg }}>
            <span className="cal-daynum on-fill">{cell.day}</span>
            <span className={clsx('cal-tile-label', solo.kind === 'done' && 'cal-tile-done')}>{solo.label}</span>
          </button>
        ) : (
          <>
            <span className="cal-daynum">{cell.day}</span>
            {entries.slice(0, MAX_TILES).map((e, i) => {
              const k = kindMeta(e.kind);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelected(e)}
                  title={`${k.label}: ${e.label}`}
                  className={clsx('cal-tile', e.kind === 'done' && 'cal-tile-done')}
                  style={{ backgroundColor: k.color, color: k.fg }}
                >
                  {e.label}
                </button>
              );
            })}
            {entries.length > MAX_TILES && (
              <button type="button" className="cal-more" onClick={() => setDayList(cell.day)}>
                +{entries.length - MAX_TILES} more
              </button>
            )}
          </>
        )}
        {cell.inMonth && <button type="button" className="cal-cell-tap" aria-label={`Open ${cell.day} ${MONTH_NAMES[view.m - 1]}`} onClick={() => setDayList(cell.day)} />}
        {cell.inMonth && (
          <button
            type="button"
            className="cal-add"
            title={`Add a reminder on ${cell.day} ${MONTH_NAMES[view.m - 1]}`}
            aria-label={`Add a reminder on ${cell.day} ${MONTH_NAMES[view.m - 1]}`}
            onClick={() => openNew(cell.day)}
          >
            <Plus className="h-3 w-3" strokeWidth={3} />
          </button>
        )}
      </div>
    );
  };

  const dayEntries = dayList ? byDay[dayList] || [] : [];

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Your tasks by the day they're due or were finished, and your reminders."
        actions={
          <>
            {q.isFetching && !q.isLoading && <span className="text-xs text-ink-faint">Updating…</span>}
            <Button variant="secondary" size="sm" onClick={goToday}>
              Today
            </Button>
            <div className="flex items-center gap-1 rounded-xl border border-line bg-card p-0.5 shadow-sm">
              <button type="button" onClick={() => step(-1)} className="grid h-7 w-7 place-items-center rounded-lg text-ink-soft hover:bg-well hover:text-ink" aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[118px] text-center text-[13px] font-semibold text-ink">
                {MONTH_NAMES[view.m - 1]} {view.y}
              </span>
              <button type="button" onClick={() => step(1)} className="grid h-7 w-7 place-items-center rounded-lg text-ink-soft hover:bg-well hover:text-ink" aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Button size="sm" icon={Plus} onClick={() => openNew(picked)}>
              Reminder
            </Button>
          </>
        }
      />

      {q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <div className={clsx('cal-shell transition-opacity', q.isLoading && 'opacity-60')}>
          <div className="cal-topline">
            <span className="cal-month">{MONTH_NAMES[view.m - 1]}</span>
            <span className="cal-year">{view.y}</span>
          </div>
          <div className="cal-weekbar">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="cal-grid">{cells.map(renderCell)}</div>

          <div className="cal-footer">
            <div className="cal-panelbox">
              <h3>Key</h3>
              <div className="cal-legend-grid">
                {KIND_ORDER.map((k) => (
                  <span key={k} className="cal-legend-row">
                    <span className="cal-swatch" style={{ backgroundColor: KINDS[k].color }} />
                    <span className="truncate">{KINDS[k].label}</span>
                    {counts[k] ? <span className="cal-count">{counts[k]}</span> : null}
                  </span>
                ))}
              </div>
            </div>
            <div className="cal-panelbox">
              <h3>This month</h3>
              {q.isLoading ? (
                <p className="text-sm" style={{ color: 'var(--cal-ink-dim)' }}>
                  Loading…
                </p>
              ) : events.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--cal-ink-dim)' }}>
                  Nothing on the calendar this month.
                </p>
              ) : (
                <div className="cal-legend-grid">
                  {events.slice(0, 12).map((e, i) => (
                    <button key={i} type="button" onClick={() => setSelected(e)} className="cal-legend-row text-left hover:underline">
                      <span className="cal-swatch" style={{ backgroundColor: kindMeta(e.kind).color }} />
                      <span className={clsx('truncate', e.kind === 'done' && 'line-through opacity-70')}>
                        {e.day} · {e.label}
                      </span>
                    </button>
                  ))}
                  {events.length > 12 && (
                    <span className="cal-legend-row" style={{ color: 'var(--cal-ink-dim)' }}>
                      +{events.length - 12} more this month
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Everything on one day ---- */}
      <Modal
        open={Boolean(dayList)}
        onClose={() => setDayList(null)}
        title={dayList ? longDate(view.y, view.m, dayList) : ''}
        size="sm"
        bodyClassName="px-2 pb-2 pt-1"
        footer={
          <Button
            variant="secondary"
            icon={Plus}
            className="w-full"
            onClick={() => {
              const d = dayList;
              setDayList(null);
              openNew(d);
            }}
          >
            Add a reminder on this day
          </Button>
        }
      >
        {dayEntries.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-soft">Nothing on this day.</p>
        ) : (
          dayEntries.map((e, i) => {
            const k = kindMeta(e.kind);
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setDayList(null);
                  setSelected(e);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-well"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${k.color} 12.16%, transparent)`, color: k.color }}>
                  <k.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className={clsx('block truncate text-sm font-semibold text-ink', e.kind === 'done' && 'text-ink-faint line-through')}>{e.label}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {k.label}
                    {e.meta?.time ? ` · ${e.meta.time}` : ''}
                    {isReminder(e.kind) && e.kind === 'sharedReminder' ? ` · from ${e.meta?.setBy?.name}` : ''}
                    {!isReminder(e.kind) && e.meta?.assignedTo ? ` · ${e.meta.assignedTo}` : ''}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </Modal>

      {/* ---- One entry ---- */}
      <EntryDetail
        entry={selected}
        view={view}
        onClose={() => setSelected(null)}
        onOpenTask={(id) => {
          setSelected(null);
          setOpenTask(id);
        }}
        onEdit={openEdit}
        onDelete={deleteReminder}
      />

      <ReminderForm form={form} setForm={setForm} aim={aim} onSaved={onSaved} />

      <TaskModal taskId={openTask} open={Boolean(openTask)} onClose={() => setOpenTask(null)} onChanged={refresh} />
    </div>
  );
}

function EntryDetail({ entry, view, onClose, onOpenTask, onEdit, onDelete }) {
  if (!entry) return null;
  const k = kindMeta(entry.kind);
  const m = entry.meta || {};
  const reminder = isReminder(entry.kind);
  const [y, mo, d] = entry.date ? entry.date.split('-').map(Number) : [view.y, view.m, entry.day];
  const footer = reminder ? (
    m.canEdit ? (
      <>
        <Button variant="danger-soft" icon={Trash2} onClick={() => onDelete(entry)} className="mr-auto">
          Delete
        </Button>
        <Button variant="secondary" icon={Pencil} onClick={() => onEdit(entry)}>
          Edit
        </Button>
      </>
    ) : null
  ) : m.taskId ? (
    <Button icon={ExternalLink} onClick={() => onOpenTask(m.taskId)}>
      Open task
    </Button>
  ) : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className="flex min-w-0 flex-col items-start gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: k.color, color: k.fg }}>
            <k.icon className="h-3 w-3" /> {k.label}
          </span>
          <span className={clsx('break-words leading-snug', entry.kind === 'done' && 'line-through decoration-2 opacity-80')}>{entry.label}</span>
        </span>
      }
      subtitle={longDate(y, mo, d)}
      footer={footer}
    >
      <div className="space-y-2 pb-1">
        {detailRows(entry).map(([label, value]) => (
          <div key={label} className="flex gap-3 text-sm">
            <span className="w-24 shrink-0 text-ink-faint">{label}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words text-ink">{value}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ReminderForm({ form, setForm, aim, onSaved }) {
  const { data: meta } = useTaskMeta();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    setError('');
    setQ('');
  }, [form?.id, form?.date]);

  const people = useMemo(() => (meta?.people || []).filter((p) => p.relation !== 'self'), [meta]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? people.filter((p) => `${p.name} ${p.pin || ''} ${p.pinDisplay || ''}`.toLowerCase().includes(s)) : people;
    return list.slice(0, PEOPLE_SHOWN);
  }, [people, q]);
  if (!form) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggle = (id) => set({ recipients: form.recipients.includes(id) ? form.recipients.filter((x) => x !== id) : [...form.recipients, id] });
  const chosen = people.filter((p) => form.recipients.includes(String(p._id)));

  const scopes = [
    'self',
    ...(form.ownAudience ? ['users'] : []),
    ...(aim.teams?.length || (form.scope === 'team' && form.team) ? ['team'] : []),
    ...(aim.everyone || form.scope === 'everyone' ? ['everyone'] : []),
  ];
  const teams = [...(aim.teams || [])];
  if (form.team && !teams.some((t) => t.id === form.team)) teams.push({ id: form.team, name: form.teamName || 'This organization' });

  const save = async () => {
    if (!form.title.trim() || !form.date) {
      setError('A title and a date are required.');
      return;
    }
    if (form.scope === 'users' && form.ownAudience && !form.recipients.length) {
      setError('Pick at least one person, or change who sees this reminder.');
      return;
    }
    if (form.scope === 'team' && !form.team) {
      setError('Pick an organization, or change who sees this reminder.');
      return;
    }
    setSaving(true);
    setError('');
    const body = {
      title: form.title.trim(),
      date: form.date,
      time: form.time || form.rawTime || '',
      notes: form.notes.trim(),
      priority: form.priority,
      scope: form.scope,
      ...(form.scope === 'team' ? { team: form.team } : {}),
      // Only send an audience we actually hold: a PUT replaces it.
      ...(form.scope === 'users' && form.ownAudience ? { recipients: form.recipients } : {}),
    };
    try {
      const res = form.id ? await api.patch(`/api/reminders/${form.id}`, body) : await api.post('/api/reminders', body);
      const told = res?.notified ? ` ${res.notified} ${res.notified === 1 ? 'person was' : 'people were'} told.` : '';
      toast.success(form.id ? 'Reminder saved.' : `Reminder added.${told}`);
      setForm(null);
      onSaved(form.date);
    } catch (err) {
      setError(err.message || 'Could not save the reminder.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && setForm(null)}
      title={form.id ? 'Edit reminder' : 'New reminder'}
      subtitle="It rings on the day: at its time, or at your workday start."
      footer={
        <>
          <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {form.id ? 'Save changes' : 'Add reminder'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Input label="Title" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="What is this about?" maxLength={200} autoFocus={finePointer()} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          <div>
            <Input label="Time" optional type="time" value={toInputTime(form.time)} onChange={(e) => set({ time: e.target.value, rawTime: '' })} />
            {form.rawTime && !form.time && <p className="mt-1 text-xs text-ink-soft">Now: “{form.rawTime}”</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Priority" value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Select label="Who sees it" value={form.scope} onChange={(e) => set({ scope: e.target.value })}>
            {scopes.map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>

        {form.scope === 'users' && !form.ownAudience && (
          <p className="rounded-xl border border-line bg-well px-3 py-2 text-sm text-ink-soft">Sent to the people whoever set it chose. Saving here keeps them as they are.</p>
        )}

        {form.scope === 'users' && form.ownAudience && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">
              People <span className="font-normal text-ink-faint">({form.recipients.length} selected)</span>
            </p>
            {chosen.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chosen.map((p) => (
                  <button key={p._id} type="button" onClick={() => toggle(String(p._id))} className="inline-flex h-7 items-center gap-1 rounded-full border border-brand bg-brand-soft pl-2.5 pr-1.5 text-xs font-semibold text-ink">
                    {p.name}
                    <X className="h-3 w-3 text-ink-soft" />
                  </button>
                ))}
              </div>
            )}
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name or Task Pin…" aria-label="Search people" />
            <div className="max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {people.length === 0 && <p className="px-3 py-2.5 text-sm text-ink-soft">Add people by their Task Pin under Contacts first.</p>}
              {people.length > 0 && matches.length === 0 && <p className="px-3 py-2.5 text-sm text-ink-soft">No matching people.</p>}
              {matches.map((p) => {
                const id = String(p._id);
                return (
                  <label key={id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-well">
                    <input type="checkbox" checked={form.recipients.includes(id)} onChange={() => toggle(id)} aria-label={p.name} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{p.name}</span>
                      <span className="block font-mono text-[11px] tracking-wider text-ink-faint">{p.pinDisplay || p.pin}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {form.scope === 'team' && (
          <Select label="Organization" value={form.team} onChange={(e) => set({ team: e.target.value })}>
            <option value="">Pick an organization…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}

        <Textarea label="Notes" optional rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything worth remembering" maxLength={2000} />
      </div>
    </Modal>
  );
}
