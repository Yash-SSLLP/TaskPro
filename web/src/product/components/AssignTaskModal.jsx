/**
 * Assign a task — the one form (HRMS AssignTaskModal on Task Pins), and the same
 * form to edit one while its terms are still open (`editTask`).
 *
 * The title is the only thing always required. An empty "Assign to" means the
 * task is yours (the server assigns it to its setter). The people picker is
 * fed by `/api/tasks/meta` → people (you, team-mates, contacts); somebody not
 * there yet is one "Add by Task Pin" away — a contact request they accept,
 * after which they can be given tasks. Everybody else gets the task as
 * "awaiting acceptance".
 *
 * "Assign more tasks" keeps the form open after a save and clears only what
 * differs between tasks (title, details, recording, files).
 *
 * Laid out as the HRMS lays it out: 12px grey labels over 40px fields, in its
 * order — who, priority, review, pieces, then when — with KARO's team and
 * category before the priority.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Bell, Bookmark, CalendarDays, Check, Eye, Flag, GitBranch, ImageIcon, KeyRound, Link2, Paperclip, Plus, Tag, Trash2, UserCheck, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../platform/api';
import { dayKey, fromLocalInput, toLocalInput } from '../../platform/format';
import { useSettings } from '../../platform/session';
import { Button, Modal, PinLookup, usePrompt } from '../../platform/ui';
import * as T from '../api';
import { useCategories } from '../hooks';
import { TASK_PRIORITY, idOf, priorityColor, reminderLabel, sizeLabel, tintStyle } from '../lifecycle';
import { PeoplePicker } from './PeoplePicker';
import { ReminderEditor } from './Reminders';
import { VoiceRecorder } from './VoiceNote';
import { PieceEditor, emptyPiece, filledPieces, pieceItems } from './DelegateModal';
import { TemplatesDrawer } from './TaskTemplates';

/* Shared with RecurringFormModal: the HRMS's form vocabulary. */
export const inputCls = 'block h-10 w-full rounded-xl border border-line bg-card px-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';
export const textareaCls = 'block w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';
export const labelCls = 'mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft';
/** A 36px square in the attachments row; `on` once it holds something. */
export const iconBtn = (on) =>
  clsx('inline-flex h-9 min-w-[36px] items-center justify-center gap-1 rounded-lg border px-2 transition', on ? 'border-brand text-brand' : 'border-line bg-card text-ink-soft hover:border-slate-300 hover:text-brand');

/** Urgent · Medium · Low: tinted, and filled with its own colour once chosen. */
export function PriorityPills({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <Flag className="h-3 w-3" /> Priority
      </span>
      {TASK_PRIORITY.map((p) => {
        const colour = priorityColor(p);
        const on = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={on}
            // Weight and border on the base class: picking one cannot resize the pill.
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition"
            style={on ? { backgroundColor: colour.solid, borderColor: colour.solid, color: '#fff' } : tintStyle(colour)}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: on ? '#fff' : colour.solid }} />
            {p}
          </button>
        );
      })}
    </div>
  );
}

/** "Do you want the last word?" — a checkbox line, as the HRMS asks it. */
export function ReviewCheck({ checked, onChange }) {
  return (
    <label className="flex items-start gap-2 text-xs text-ink-soft">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-line accent-brand" />
      <span>I want to review this before it is marked done</span>
    </label>
  );
}

/** Six this evening in my zone (tomorrow, if that has passed). */
function defaultDue(tz) {
  const today = dayKey(new Date(), tz);
  const at = `${today}T18:00`;
  if (fromLocalInput(at, tz) > new Date()) return at;
  return `${dayKey(new Date(Date.now() + 86400000), tz)}T18:00`;
}

const EMPTY = {
  title: '',
  description: '',
  assignees: [],
  onBehalfOf: '',
  loopUsers: [],
  team: '',
  category: '',
  priority: 'Medium',
  requiresApproval: true,
  startDate: '',
  dueDate: '',
  reminders: [],
  links: [],
  template: '',
};

/** "Add by Task Pin" from inside the form: lookup → contact request (or straight in). */
function AddByPinModal({ open, onClose, onReady }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  useEffect(() => {
    if (open) setSent(null);
  }, [open]);
  if (!open) return null;

  const refreshPeople = async () => {
    await qc.invalidateQueries({ queryKey: ['tasks', 'meta'] });
    qc.invalidateQueries({ queryKey: ['contacts'] });
    qc.invalidateQueries({ queryKey: ['people'] });
  };

  const request = async (person, pin, reset) => {
    setBusy(true);
    try {
      const res = await api.post('/api/contacts', { pin });
      if (res?.status === 'accepted') {
        toast.success(`You and ${person.name} are now contacts.`);
        await refreshPeople();
        onReady?.(person);
        onClose?.();
      } else {
        setSent(person);
        reset();
        refreshPeople();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add by Task Pin" subtitle="You can give tasks to your contacts and team-mates.">
      {sent ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            Contact request sent to <strong>{sent.name}</strong>. You can give them tasks once they accept — you will get an alert.
          </p>
          <Button variant="secondary" onClick={() => setSent(null)}>
            Add someone else
          </Button>
        </div>
      ) : (
        <PinLookup
          autoFocus
          hint="Ask them for their Task Pin — it is on their Contacts page."
          action={({ person, relation, pin, reset }) => {
            if (relation === 'contact') {
              return (
                <Button
                  size="sm"
                  icon={Check}
                  onClick={async () => {
                    await refreshPeople();
                    onReady?.(person);
                    onClose?.();
                  }}
                >
                  Give them this task
                </Button>
              );
            }
            if (relation === 'self') return <p className="text-sm text-ink-soft">That&apos;s your own pin — leave “Assign to” empty to keep the task.</p>;
            if (relation === 'outgoing') return <p className="text-sm text-ink-soft">You have already asked. They can be given tasks once they accept.</p>;
            return (
              <Button size="sm" icon={KeyRound} loading={busy} onClick={() => request(person, pin, reset)}>
                {relation === 'incoming' ? 'Accept their request' : 'Send contact request'}
              </Button>
            );
          }}
        />
      )}
    </Modal>
  );
}

export function AssignTaskModal({ open, onClose, onCreated, meta, prefill = null, presetAssignees = null, presetOnBehalf = '', editTask = null }) {
  const settings = useSettings();
  const tz = settings.timezone;
  const prompt = usePrompt();
  const qc = useQueryClient();
  const categories = useCategories(meta);
  const editing = Boolean(editTask);

  const [form, setForm] = useState(EMPTY);
  const [original, setOriginal] = useState(null);
  const [voice, setVoice] = useState(null);
  const [files, setFiles] = useState([]);
  const [showReminders, setShowReminders] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const [showPieces, setShowPieces] = useState(false);
  const [pieces, setPieces] = useState([]);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinFor, setPinFor] = useState('assignees');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const fileRef = useRef(null);
  const imageRef = useRef(null);
  // Edit: the task's updatedAt when the form was filled in (the server's conflict check).
  const baseRef = useRef(null);
  const set = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);

  const fromPrefill = useCallback(
    (p) => ({
      ...(p.title !== undefined ? { title: p.title || '' } : {}),
      ...(p.description !== undefined ? { description: p.description || '' } : {}),
      ...(p.category !== undefined ? { category: p.category || '' } : {}),
      ...(p.priority ? { priority: p.priority } : {}),
      ...(p.dueDate ? { dueDate: toLocalInput(p.dueDate, tz) } : {}),
      ...(Array.isArray(p.reminders) ? { reminders: p.reminders } : {}),
      ...(Array.isArray(p.links) ? { links: p.links.map((l) => ({ url: l.url, label: l.label || '' })) } : {}),
      ...(Array.isArray(p.assignees) ? { assignees: p.assignees.map(idOf) } : {}),
      ...(Array.isArray(p.loopUsers) ? { loopUsers: p.loopUsers.map(idOf) } : {}),
      ...(p.team ? { team: String(p.team?.id || p.team) } : {}),
      ...(p.template ? { template: String(p.template) } : {}),
    }),
    [tz]
  );

  /** The form filled in from a task as it stands (edit). */
  const seedOf = useCallback(
    (t) => ({
      ...EMPTY,
      title: t.title || '',
      description: t.description || '',
      assignees: (t.assignees || []).map((a) => idOf(a.user)).filter(Boolean),
      loopUsers: (t.loopUsers || []).map(idOf).filter(Boolean),
      team: idOf(t.team) || '',
      category: t.category || '',
      priority: t.priority || 'Medium',
      requiresApproval: t.requiresApproval !== false,
      startDate: t.startDate ? toLocalInput(t.startDate, tz) : '',
      dueDate: t.dueDate ? toLocalInput(t.dueDate, tz) : '',
      reminders: t.reminders || [],
      links: (t.links || []).map((l) => ({ url: l.url, label: l.label || '' })),
    }),
    [tz]
  );

  // ===== Opening =====
  // Filled in once per opening (and per task): the task refetching while the
  // form is open (somebody else's change, live) must not wipe what is typed.
  useEffect(() => {
    if (!open) return;
    if (editTask) {
      const seeded = seedOf(editTask);
      setForm(seeded);
      setOriginal(seeded);
      setShowStart(Boolean(editTask.startDate));
      baseRef.current = editTask.updatedAt || null;
    } else {
      setForm({
        ...EMPTY,
        requiresApproval: settings.approvalDefault !== false,
        dueDate: defaultDue(tz),
        assignees: presetAssignees || [],
        onBehalfOf: presetOnBehalf || '',
        ...(prefill ? fromPrefill(prefill) : {}),
      });
      setOriginal(null);
      setShowStart(false);
    }
    setVoice(null);
    setFiles([]);
    setShowReminders(false);
    setShowLinks(false);
    setLinkDraft('');
    setShowPieces(false);
    setPieces([]);
    setMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTask?._id, prefill, presetAssignees, presetOnBehalf]);

  const people = meta?.people || [];
  const myId = String(meta?.me || people.find((p) => p.relation === 'self')?._id || '');
  const onBehalf = meta?.canAssignOnBehalf && form.onBehalfOf && String(form.onBehalfOf) !== myId ? String(form.onBehalfOf) : '';
  const onBehalfName = onBehalf ? people.find((p) => idOf(p) === onBehalf)?.name || 'them' : '';
  const setterId = editing ? idOf(editTask.createdBy) : onBehalf || myId;
  const selfOnly = form.assignees.length === 0 || (form.assignees.length === 1 && String(form.assignees[0]) === setterId);
  const teams = meta?.teams || [];
  const team = teams.find((t) => String(t.id) === String(form.team));
  const canSetReminders = meta?.canSetReminders !== false;

  const others = useMemo(() => people.filter((p) => idOf(p) !== myId), [people, myId]);

  const pickFiles = (e) => {
    setFiles((f) => [...f, ...(e.target.files || [])].slice(0, 10));
    e.target.value = '';
  };

  const addLink = () => {
    const url = linkDraft.trim();
    if (!url) return;
    set({ links: [...form.links, { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, label: '' }] });
    setLinkDraft('');
  };

  const newCategory = async () => {
    const name = await prompt({ title: 'New category', label: 'Name', placeholder: 'e.g. Accounts', required: true, confirmLabel: 'Add category', rows: 1, maxLength: 60 });
    if (!name) return;
    try {
      const adminOfTeam = team && (team.myRole === 'owner' || team.myRole === 'admin');
      const res = await T.createCategory(name, adminOfTeam ? team.id : undefined);
      const made = res?.category?.name || name;
      set({ category: made });
      qc.invalidateQueries({ queryKey: ['tasks', 'meta'] });
      qc.invalidateQueries({ queryKey: ['tasks', 'categories'] });
      toast.success(adminOfTeam ? `Added for ${team.name}.` : 'Category added.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  /** The body for a create, or only what changed for an edit. */
  const buildBody = () => {
    const due = form.dueDate ? fromLocalInput(form.dueDate, tz) : null;
    const start = showStart && form.startDate ? fromLocalInput(form.startDate, tz) : null;
    const body = {
      title: form.title.trim(),
      description: form.description.trim(),
      assignees: form.assignees,
      loopUsers: form.loopUsers,
      team: form.team || null,
      category: form.category,
      priority: form.priority,
      requiresApproval: selfOnly ? false : form.requiresApproval !== false,
      startDate: start ? start.toISOString() : null,
      dueDate: due ? due.toISOString() : null,
      links: form.links,
      ...(canSetReminders && (form.reminders.length || editing) ? { reminders: form.reminders } : {}),
    };
    if (!editing) {
      return {
        ...body,
        repeat: { frequency: 'ONCE' },
        ...(onBehalf ? { onBehalfOf: onBehalf } : {}),
        ...(form.template ? { template: form.template } : {}),
      };
    }
    // Edit: only the fields that moved, so the edit trail says what changed.
    const was = {
      ...original,
      title: original.title.trim(),
      description: original.description.trim(),
      team: original.team || null,
      requiresApproval: original.requiresApproval,
      startDate: original.startDate ? fromLocalInput(original.startDate, tz).toISOString() : null,
      dueDate: original.dueDate ? fromLocalInput(original.dueDate, tz).toISOString() : null,
    };
    const out = {};
    for (const [k, v] of Object.entries(body)) {
      if (JSON.stringify(v) !== JSON.stringify(was[k])) out[k] = v;
    }
    return out;
  };

  /**
   * Somebody else changed some of the same things while this form was open
   * (a 409 EDIT_CONFLICT, `clashed` its fields): bring the form up to date.
   * Their change shows in those fields and in anything not touched here; the
   * rest of what was typed stays, ready to save again on top of the latest.
   */
  const showLatest = async (clashed) => {
    try {
      const data = await T.getTask(editTask._id);
      if (!data?.task) return;
      qc.setQueryData(['task', String(editTask._id)], data);
      const latest = seedOf(data.task);
      const touched = (f, k) => JSON.stringify(f[k]) !== JSON.stringify(original?.[k]);
      setForm((f) => Object.fromEntries(Object.keys(latest).map((k) => [k, touched(f, k) && !clashed.includes(k) ? f[k] : latest[k]])));
      setOriginal(latest);
      if (latest.startDate) setShowStart(true);
      baseRef.current = data.task.updatedAt || null;
    } catch {
      /* the message already said to look again */
    }
  };

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error('Give the task a title.');
      return;
    }
    const wanted = filledPieces(pieces);
    if (!editing && wanted.some((p) => !p.title.trim())) {
      toast.error('Give every piece a name, or remove the blank one.');
      return;
    }
    if (form.startDate && form.dueDate && showStart && form.startDate > form.dueDate) {
      toast.error('The start is after the deadline.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const body = buildBody();
        if (!Object.keys(body).length && !voice && !files.length) {
          toast.info('Nothing to save — it was already like that.');
          onClose?.();
          return;
        }
        const res = await T.updateTask(editTask._id, { ...body, ...(baseRef.current ? { baseUpdatedAt: baseRef.current } : {}) }, { voice, files });
        const n = (res?.changes || []).length;
        toast.success(n ? `Saved — ${n} change${n === 1 ? '' : 's'} added to the edit history.` : 'Saved.');
        onCreated?.(res?.task || editTask);
        onClose?.();
        return;
      }

      const res = await T.createTask(buildBody(), { voice, files });
      const task = res?.task;
      toast.success(
        selfOnly
          ? onBehalf
            ? `Added to ${onBehalfName}'s tasks.`
            : 'Added to your tasks.'
          : onBehalf
            ? `Given on behalf of ${onBehalfName}. They will see it as theirs.`
            : 'Task given. They will see it as awaiting acceptance.'
      );
      if (task?._id && wanted.length && !onBehalf) {
        try {
          const split = await T.splitTask(task._id, pieceItems(pieces, tz));
          const n = split?.children?.length || wanted.length;
          toast.success(`Split into ${n} piece${n === 1 ? '' : 's'} — you approve each one.`);
        } catch (err) {
          toast.error(err.message || 'The task was given, but it could not be split up. Open it and split it there.');
        }
      }
      onCreated?.(task);
      if (more) {
        setForm((f) => ({ ...f, title: '', description: '', links: [], template: '' }));
        setVoice(null);
        setFiles([]);
        setPieces([]);
        setShowPieces(false);
      } else onClose?.();
    } catch (err) {
      toast.error(err.message || 'Could not save that task.');
      if (editing && err?.code === 'EDIT_CONFLICT') await showLatest(err.data?.fields || []);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={editing ? 'Edit task' : 'Assign a task'}
        subtitle={editing ? `${editTask.code ? `${editTask.code} · ` : ''}Every change is kept in the edit history.` : undefined}
        footer={
          <>
            {!editing && (
              <label className="mr-auto flex items-center gap-2 text-xs text-ink-soft">
                <input type="checkbox" checked={more} onChange={(e) => setMore(e.target.checked)} className="h-3.5 w-3.5 rounded border-line accent-brand" />
                Assign more tasks
              </label>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button icon={Check} loading={saving} onClick={submit}>
              {editing ? 'Save changes' : selfOnly ? (onBehalf ? `Add to ${onBehalfName}'s tasks` : 'Add to my tasks') : 'Assign task'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* ── Title & details ── */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-ink-soft" htmlFor="task-title">
                Task title
              </label>
              {!editing && (
                <button type="button" onClick={() => setTemplatesOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  <Bookmark className="h-3 w-3" /> {form.template ? 'From a template ✓' : 'Use a template'}
                </button>
              )}
            </div>
            <input id="task-title" autoFocus value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Send the March sales report" maxLength={300} className={inputCls} />
          </div>
          <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="A short description…" rows={3} maxLength={5000} className={textareaCls} />

          {/* ── Who ── */}
          <PeoplePicker
            label="Assign to"
            icon={Users}
            people={people}
            value={form.assignees}
            onChange={(ids) => set({ assignees: ids })}
            allowSelf
            selfId={myId}
            teamId={form.team}
            teamName={team?.name}
            placeholder="Myself — or choose people"
            onAddByPin={() => {
              setPinFor('assignees');
              setPinOpen(true);
            }}
          />

          {meta?.canAssignOnBehalf && !editing && (
            <PeoplePicker
              label="On behalf of"
              icon={UserCheck}
              people={others}
              value={form.onBehalfOf}
              onChange={(id) => set({ onBehalfOf: (Array.isArray(id) ? id[0] : id) || '' })}
              max={1}
              placeholder="Yourself — or whose task this is"
              hint={onBehalf ? `Becomes ${onBehalfName}'s task, not yours.` : null}
            />
          )}

          <PeoplePicker
            label="Keep in the loop"
            icon={Eye}
            people={people}
            value={form.loopUsers}
            onChange={(ids) => set({ loopUsers: ids })}
            placeholder="Nobody"
            onAddByPin={() => {
              setPinFor('loopUsers');
              setPinOpen(true);
            }}
          />

          {/* ── Where it is filed ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="task-team">
                <Users className="h-3 w-3" /> Team <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <select id="task-team" value={form.team} onChange={(e) => set({ team: e.target.value })} className={inputCls}>
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {!teams.length && <p className="mt-1 text-[11px] text-ink-faint">Create a team on the Teams page to file tasks under it.</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="task-category">
                <Tag className="h-3 w-3" /> Category <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <div className="flex gap-2">
                <select id="task-category" value={form.category} onChange={(e) => set({ category: e.target.value })} className={inputCls}>
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c._id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {form.category && !categories.some((c) => c.name === form.category) && <option value={form.category}>{form.category}</option>}
                </select>
                {meta?.canManageCategories !== false && (
                  <button type="button" onClick={newCategory} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-ink-soft transition hover:border-slate-300 hover:text-brand" aria-label="New category" title="New category">
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── How much it matters ── */}
          <PriorityPills value={form.priority} onChange={(priority) => set({ priority })} />

          {/* ── Your own task: what does not apply, said once ── */}
          {selfOnly ? (
            <p className="rounded-xl border border-line bg-well px-3 py-2 text-xs text-ink-soft">
              On <strong className="font-semibold text-slate-700">{onBehalf ? `${onBehalfName}'s own list` : 'your own list'}</strong> — no review step.
            </p>
          ) : (
            <ReviewCheck checked={form.requiresApproval !== false} onChange={(v) => set({ requiresApproval: v })} />
          )}

          {/* ── Split it straight away ── */}
          {!editing && !selfOnly && !onBehalf && (
            <div className="rounded-xl border border-line bg-well p-3">
              <button
                type="button"
                onClick={() => {
                  const opening = !showPieces;
                  setShowPieces(opening);
                  if (opening && !pieces.length) {
                    const mates = (meta?.team?.direct || []).map(String);
                    setPieces([emptyPiece(mates), emptyPiece(mates)]);
                  }
                }}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <GitBranch className="h-3 w-3" /> Split it into pieces straight away
                  {filledPieces(pieces).length > 0 && (
                    <span className="font-normal text-ink-faint">
                      {filledPieces(pieces).length} piece{filledPieces(pieces).length === 1 ? '' : 's'}
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-medium text-ink-soft">{showPieces ? 'Hide' : 'Split it up'}</span>
              </button>
              {showPieces && (
                <div className="mt-3">
                  <PieceEditor rows={pieces} onRows={setPieces} people={people} defaultOpenTo={(meta?.team?.direct || []).map(String)} maxPieces={meta?.maxPieces || 50} />
                </div>
              )}
            </div>
          )}

          {/* ── When ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="task-due">
                <CalendarDays className="h-3 w-3" /> Due date &amp; time
              </label>
              <div className="flex gap-2">
                <input id="task-due" type="datetime-local" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className={inputCls} />
                {form.dueDate && (
                  <button type="button" onClick={() => set({ dueDate: '' })} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-ink-faint transition hover:text-ink" aria-label="No deadline" title="No deadline">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div>
              {showStart ? (
                <>
                  <label className={labelCls} htmlFor="task-start">
                    <CalendarDays className="h-3 w-3" /> Starts
                  </label>
                  <div className="flex gap-2">
                    <input id="task-start" type="datetime-local" value={form.startDate} max={form.dueDate || undefined} onChange={(e) => set({ startDate: e.target.value })} className={inputCls} />
                    <button
                      type="button"
                      onClick={() => {
                        setShowStart(false);
                        set({ startDate: '' });
                      }}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-ink-faint transition hover:text-ink"
                      aria-label="No start date"
                      title="No start date"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => setShowStart(true)} className="inline-flex h-10 items-center gap-1 text-xs font-medium text-brand hover:underline sm:mt-5">
                  <Plus className="h-3.5 w-3.5" /> Add a start date
                </button>
              )}
            </div>
          </div>

          {/* ── The icon row ── */}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" onClick={() => setShowLinks((v) => !v)} title="Add a link" aria-label="Add a link" className={iconBtn(form.links.length > 0)}>
              <Link2 className="h-4 w-4" />
              {form.links.length > 0 && <span className="text-[11px] font-medium">{form.links.length}</span>}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} title="Attach a file" aria-label="Attach a file" className={iconBtn(false)}>
              <Paperclip className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => imageRef.current?.click()} title="Attach an image" aria-label="Attach an image" className={iconBtn(false)}>
              <ImageIcon className="h-4 w-4" />
            </button>
            {canSetReminders && (
              <button type="button" onClick={() => setShowReminders((v) => !v)} title="Reminders" aria-label="Reminders" className={iconBtn(form.reminders.length > 0)}>
                <Bell className="h-4 w-4" />
                {form.reminders.length > 0 && <span className="text-[11px] font-medium">{form.reminders.length}</span>}
              </button>
            )}
            {!voice && <VoiceRecorder value={voice} onChange={setVoice} compact />}
            <input ref={fileRef} type="file" multiple hidden onChange={pickFiles} />
            <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={pickFiles} />
          </div>

          {showLinks && (
            <div className="space-y-1.5 rounded-xl border border-line bg-well p-3">
              <div className="flex gap-1.5">
                <input
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addLink();
                    }
                  }}
                  placeholder="Paste a sheet, drive folder or ticket link…"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-card px-2 text-xs text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <button type="button" onClick={addLink} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-card text-ink-soft transition hover:border-slate-300 hover:text-brand" aria-label="Add this link" title="Add this link">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {form.links.map((l, i) => (
                <div key={`${l.url}-${i}`} className="flex items-center gap-2 text-xs">
                  <Link2 className="h-3 w-3 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate text-ink-soft">{l.url}</span>
                  <button type="button" onClick={() => set({ links: form.links.filter((_, j) => j !== i) })} className="text-ink-faint hover:text-red-600" aria-label="Remove link">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-well px-2 py-1.5 text-xs">
                  <Paperclip className="h-3 w-3 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate text-ink-soft">{f.name}</span>
                  <span className="shrink-0 text-ink-faint">{sizeLabel(f.size)}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="shrink-0 text-ink-faint hover:text-red-600" aria-label={`Remove ${f.name}`}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {editing && (editTask.attachments || []).length > 0 && <p className="text-[11px] text-ink-faint">{editTask.attachments.length} file(s) already on the task stay; new ones are added.</p>}

          {voice && <VoiceRecorder value={voice} onChange={setVoice} />}

          {showReminders && canSetReminders && (
            <div className="space-y-3 rounded-xl border border-line bg-well p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Bell className="h-3 w-3" /> Reminders
                </p>
                <button type="button" onClick={() => setShowReminders(false)} className="grid h-7 w-7 place-items-center rounded-lg text-ink-faint transition hover:bg-slate-100 hover:text-ink" aria-label="Hide reminders">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <ReminderEditor
                value={form.reminders}
                onChange={(reminders) => set({ reminders })}
                emptyText={
                  settings.defaultReminders?.length
                    ? `None of your own — your defaults apply: ${settings.defaultReminders.map(reminderLabel).join(', ')}.`
                    : 'No reminders — add one, or set defaults in Settings.'
                }
              />
            </div>
          )}
        </div>
      </Modal>
      <AddByPinModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onReady={(person) => {
          const id = String(person.id || person._id);
          setForm((f) => ({ ...f, [pinFor]: f[pinFor].includes(id) ? f[pinFor] : [...f[pinFor], id] }));
        }}
      />
      <TemplatesDrawer
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onUse={(p) => {
          setForm((f) => ({ ...f, ...fromPrefill(p) }));
          toast.success('Filled in from the template.');
        }}
      />
    </>
  );
}
