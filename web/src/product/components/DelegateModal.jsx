/**
 * Delegate — hand the work on, whole or in pieces. Either the whole task goes
 * to one person (POST /:id/delegate), or it is split into pieces that are real
 * tasks of their own (POST /:id/split). Either way THE PERSON DELEGATING
 * BECOMES THE APPROVER of what comes back. (Transfer is the opposite — see
 * TransferModal.) A piece with nobody named is OPEN: offered to `openTo`, held
 * by the first person to claim it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { CalendarDays, Flag, GitBranch, Plus, Trash2, User, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { fromLocalInput } from '../../platform/format';
import { useTz } from '../../platform/session';
import { Button, Modal } from '../../platform/ui';
import * as T from '../api';
import { TASK_PRIORITY, idOf, priorityColor, tintStyle } from '../lifecycle';
import { PeoplePicker } from './PeoplePicker';

let seq = 0;
export const emptyPiece = (openTo = [], assignee = '') => ({ key: `piece-${(seq += 1)}`, title: '', assignee, openTo: [...openTo], dueDate: '', priority: '' });
export const isLivePiece = (r) => Boolean(r && (String(r.title || '').trim() || r.assignee));
export const filledPieces = (rows = []) => rows.filter(isLivePiece);

/** The rows as the server wants them. */
export function pieceItems(rows = [], tz) {
  return filledPieces(rows).map((r) => ({
    title: r.title.trim(),
    assignee: r.assignee || undefined,
    openTo: r.assignee ? undefined : r.openTo || [],
    dueDate: r.dueDate ? fromLocalInput(r.dueDate, tz)?.toISOString() : undefined,
    priority: r.priority || undefined,
  }));
}

const inputCls = 'block h-10 w-full rounded-xl border border-line bg-card px-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';
const labelCls = 'mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-soft';

/** The piece rows — shared with the assign form's "split it straight away". */
export function PieceEditor({ rows, onRows, people = [], defaultOpenTo = [], maxPieces = 50 }) {
  const [oneOwner, setOneOwner] = useState(false);
  const [owner, setOwner] = useState('');
  const set = (i, patch) => onRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => {
    if (rows.length >= maxPieces) {
      toast.info(`A task can hold ${maxPieces} pieces.`);
      return;
    }
    onRows([...rows, emptyPiece(defaultOpenTo, oneOwner ? owner : '')]);
  };
  const drop = (i) => onRows(rows.filter((_, j) => j !== i));
  const applyOwner = (id) => {
    setOwner(id);
    onRows(rows.map((r) => ({ ...r, assignee: id })));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-card p-3">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={oneOwner}
            onChange={(e) => {
              setOneOwner(e.target.checked);
              if (e.target.checked) {
                const first = rows.find((r) => r.assignee)?.assignee || owner;
                if (first) applyOwner(first);
              }
            }}
            className="h-3.5 w-3.5 rounded border-line accent-brand"
          />
          <Users className="h-3 w-3 text-ink-faint" /> Same person, every piece
        </label>
        {oneOwner && (
          <div className="mt-2">
            <PeoplePicker people={people} value={owner} onChange={applyOwner} max={1} placeholder="Who gets all of them?" />
          </div>
        )}
      </div>

      {rows.map((row, i) => {
        const colour = priorityColor(row.priority || 'Medium');
        return (
          <div key={row.key} className="rounded-xl border border-line bg-card p-3">
            <div className="flex items-start gap-2">
              <span className="tnum mt-[9px] inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-lg border text-[11px] font-semibold" style={tintStyle(colour)}>
                {i + 1}
              </span>
              <input value={row.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="What is this piece?" maxLength={300} className={clsx(inputCls, 'min-w-0 flex-1')} />
              <button
                type="button"
                onClick={() => drop(i)}
                disabled={rows.length <= 1}
                title={rows.length <= 1 ? 'A split needs at least one piece' : 'Remove this piece'}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-ink-faint transition hover:border-red-300 hover:text-red-600 disabled:opacity-30"
                aria-label={`Remove piece ${i + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="sm:col-span-1">
                {oneOwner ? (
                  <div className="flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-line px-3 text-xs text-ink-soft sm:mt-5">
                    <User className="h-3 w-3" />
                    {people.find((p) => idOf(p) === String(owner))?.name || 'Nobody chosen yet'}
                  </div>
                ) : (
                  <PeoplePicker label="Who does it" icon={User} people={people} value={row.assignee} onChange={(id) => set(i, { assignee: id })} max={1} placeholder="Blank = open it up" />
                )}
              </div>
              <div>
                <label className={labelCls}>
                  <CalendarDays className="h-3 w-3" /> Deadline
                </label>
                <input type="datetime-local" value={row.dueDate} onChange={(e) => set(i, { dueDate: e.target.value })} className={inputCls} title="Left blank, the piece has the task's deadline" aria-label={`Deadline for piece ${i + 1}`} />
              </div>
              <div>
                <label className={labelCls}>
                  <Flag className="h-3 w-3" /> Priority
                </label>
                <select value={row.priority} onChange={(e) => set(i, { priority: e.target.value })} className={inputCls} aria-label={`Priority for piece ${i + 1}`}>
                  <option value="">Same as the task</option>
                  {TASK_PRIORITY.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {/* Only once the row is a piece at all: two dashed panels before a word is typed is noise. */}
            {isLivePiece(row) && !row.assignee && !oneOwner && (
              <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-well p-3">
                <PeoplePicker
                  label="Open to"
                  icon={Users}
                  people={people}
                  value={row.openTo}
                  onChange={(ids) => set(i, { openTo: ids })}
                  placeholder="Your organization members"
                  hint={(row.openTo || []).length ? 'The first to pick it up gets it.' : 'Left empty, it goes to your organization members — the first to pick it up gets it.'}
                />
              </div>
            )}
          </div>
        );
      })}
      <button type="button" onClick={add} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-ink-soft transition hover:border-slate-400 hover:text-ink">
        <Plus className="h-3.5 w-3.5" /> Add a piece
      </button>
    </div>
  );
}

export function DelegateModal({ task, meta, open, onClose, onDone, can = null }) {
  const tz = useTz();
  const rights = can || task?.can || {};
  const mayGiveWhole = rights.canDelegate !== false;
  const maySplit = rights.canSplit !== false;
  const [mode, setMode] = useState('whole');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const team = useMemo(() => (meta?.team?.direct || []).map(String), [meta]);

  const assignable = useMemo(() => {
    const onIt = new Set((task?.assignees || []).map((a) => idOf(a.user)));
    return (meta?.people || []).filter((p) => !onIt.has(idOf(p)));
  }, [meta, task]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setMode(mayGiveWhole ? 'whole' : 'split');
      setTo('');
      setNote('');
      setRows([emptyPiece(team), emptyPiece(team)]);
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, mayGiveWhole, team]);

  if (!open || !task) return null;
  const splitting = mode === 'split';
  const live = filledPieces(rows);

  const submit = async () => {
    if (!splitting) {
      if (!to) return toast.error('Choose who to hand it to.');
      setSaving(true);
      try {
        const res = await T.delegateTask(task._id, to, note.trim());
        toast.success(`Handed to ${res?.delegatedTo?.name || 'them'} — you approve it when it comes back.`);
        onDone?.(res);
        onClose?.();
      } catch (err) {
        toast.error(err.message || 'Could not hand that task over.');
      } finally {
        setSaving(false);
      }
      return undefined;
    }
    if (!live.length) return toast.error('Add at least one piece.');
    if (live.some((r) => !r.title.trim())) return toast.error('Give every piece a name.');
    setSaving(true);
    try {
      const res = await T.splitTask(task._id, pieceItems(rows, tz));
      const n = res?.children?.length || live.length;
      toast.success(`Split into ${n} piece${n === 1 ? '' : 's'} — you approve each one.`);
      onDone?.(res);
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Could not split that task up.');
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
      title="Delegate this task"
      subtitle={`${task.code ? `${task.code} · ` : ''}${task.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={splitting ? GitBranch : UserPlus} loading={saving} disabled={splitting && !live.length} onClick={submit}>
            {splitting ? `Create ${live.length || 0} piece${live.length === 1 ? '' : 's'}` : 'Hand it over'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mayGiveWhole && maySplit && (
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ['whole', UserPlus, 'Give the whole task to one person'],
              ['split', GitBranch, 'Split it into pieces'],
            ].map(([key, Icon, title]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                aria-pressed={mode === key}
                // Border width and weight on the base class: choosing one cannot resize the pair.
                className={clsx('min-h-[40px] rounded-xl border-2 p-3 text-left text-sm font-medium transition', mode === key ? 'border-brand bg-well' : 'border-line hover:border-slate-300')}
              >
                <span className={clsx('flex items-center gap-1.5', mode === key ? 'text-brand' : 'text-ink')}>
                  <Icon className="h-3.5 w-3.5 shrink-0" /> {title}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <strong className="font-semibold">You will approve this.</strong>
        </p>
        {!splitting ? (
          <div className="space-y-3">
            <PeoplePicker label="Hand it to" icon={User} people={assignable} value={to} onChange={setTo} max={1} placeholder="Choose somebody…" />
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft" htmlFor="delegate-note">
                Why are you passing it on? <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <textarea
                id="delegate-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Anything they need to know to pick it up…"
                className="block w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
          </div>
        ) : (
          <PieceEditor rows={rows} onRows={setRows} people={meta?.people || []} defaultOpenTo={team} maxPieces={meta?.maxPieces || 50} />
        )}
      </div>
    </Modal>
  );
}
