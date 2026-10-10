/**
 * The small pieces every task surface repeats: status, overdue, priority,
 * due date, progress, pieces, more-time and transfer chips, the quiet marks,
 * and the empty list. Kept together so the list, the board and the detail
 * page cannot grow different ideas of what "overdue" looks like.
 */
import clsx from 'clsx';
import { AlertCircle, Clock, CornerUpRight, Eye, GitBranch, MessageSquare, Mic, Paperclip, Plus, Repeat } from 'lucide-react';
import { useTz } from '../../platform/session';
import { Button } from '../../platform/ui';
import {
  DUE_TONES, EXTENSION_LOOK, accentFor, clampProgress, dayLabel, dueLabel, isOverdue, priorityColor, repeatLabel, statusLabel,
  statusStyle, tintStyle,
} from '../lifecycle';

const CHIP = 'inline-flex min-h-[22px] items-center gap-1 whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-medium';

export function StatusChip({ task, status, className }) {
  const s = status || task?.status;
  return <span className={clsx(CHIP, statusStyle(s), className)}>{statusLabel(s)}</span>;
}

/** Late — the one solid red in the module. */
export function OverdueChip({ task, label = 'Overdue', className }) {
  const tz = useTz();
  if (task && !isOverdue(task)) return null;
  return (
    <span className={clsx(CHIP, 'border border-red-600 bg-red-600 text-white', className)} title={task?.dueDate ? `Was due ${dayLabel(task.dueDate, tz)}` : undefined}>
      <AlertCircle className="h-3 w-3 shrink-0" /> {label}
    </span>
  );
}

/** Medium is the default, so it is only drawn with `always`. */
export function PriorityChip({ priority, task, always = false, className }) {
  const value = priority || task?.priority;
  const colour = priorityColor(value);
  if (!value || (!always && colour.key === 'Medium')) return null;
  return (
    <span className={clsx(CHIP, 'border', className)} style={tintStyle(colour)}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: colour.solid }} />
      {colour.key}
    </span>
  );
}

export function DueChip({ task, className }) {
  const tz = useTz();
  const { text, tone } = dueLabel(task?.dueDate, task?.status, tz);
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs', DUE_TONES[tone], className)}>
      {tone === 'overdue' ? <AlertCircle className="h-3 w-3 shrink-0" /> : <Clock className="h-3 w-3 shrink-0 opacity-60" />}
      {text}
    </span>
  );
}

/** How far along, as the doer declared it — coloured with the row's accent. */
export function ProgressBar({ value, task, showLabel = true, className }) {
  const pct = clampProgress(value ?? task?.progress ?? 0);
  const solid = accentFor(task || {}).solid;
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-2', className)}>
      <span className="h-1.5 min-w-[48px] flex-1 overflow-hidden rounded-full bg-slate-200">
        <span className="block h-full rounded-full transition-[width]" style={{ width: `${pct}%`, backgroundColor: solid }} />
      </span>
      {showLabel && <span className="tnum shrink-0 text-[11px] font-medium text-ink-soft">{pct}%</span>}
    </span>
  );
}

/** "3 of 5 pieces" — nothing on a task nobody has split. */
export function PiecesChip({ task, className }) {
  const total = Number(task?.childCount ?? task?.subtaskCount) || 0;
  if (!total) return null;
  const done = Number(task?.childDoneCount ?? task?.subtasksDone) || 0;
  return (
    <span className={clsx(CHIP, 'bg-slate-100 text-slate-600', className)} title={`Split into ${total} piece${total === 1 ? '' : 's'}`}>
      <GitBranch className="h-3 w-3 shrink-0" />
      {done} of {total} piece{total === 1 ? '' : 's'}
    </span>
  );
}

export function ReviewChip({ task, yours = false, className }) {
  if (task && task.status !== 'SUBMITTED') return null;
  return (
    <span className={clsx(CHIP, 'border border-violet-200 bg-violet-50 text-violet-700', className)}>
      <Eye className="h-3 w-3 shrink-0" />
      {yours ? 'Needs your review' : 'In review'}
    </span>
  );
}

/** The latest ask for more time, and where it stands. */
export function ExtensionChip({ task, className }) {
  const tz = useTz();
  const last = task?.lastExtension || (task?.pendingExtension ? { ...task.pendingExtension, status: 'PENDING' } : null);
  const look = last && EXTENSION_LOOK[last.status || 'PENDING'];
  if (!look) return null;
  const who = last.requestedByName ? `${last.requestedByName} asked` : 'Asked';
  const till = last.toDate ? ` to move the deadline to ${dayLabel(last.toDate, tz)}` : '';
  const decided = last.status !== 'PENDING' && last.decidedByName ? ` — ${last.status === 'APPROVED' ? 'approved' : 'declined'} by ${last.decidedByName}` : '';
  return (
    <span className={clsx(CHIP, 'border', look.cls, className)} title={`${who}${till}${decided}`}>
      <Clock className="h-3 w-3 shrink-0" /> {look.label}
    </span>
  );
}

/** "transferred" — the last hop, for "why is this mine?". */
export function TransferredChip({ task, className }) {
  const tz = useTz();
  const hops = task?.transfers;
  if (!Array.isArray(hops) || !hops.length) return null;
  const last = hops[hops.length - 1];
  const title = `Transferred${last.fromName ? ` from ${last.fromName}` : ''}${last.byName ? ` by ${last.byName}` : ''}${last.at ? ` · ${dayLabel(last.at, tz)}` : ''}${last.reason ? ` — ${last.reason}` : ''}`;
  return (
    <span className={clsx(CHIP, 'border border-line bg-slate-50 text-slate-600', className)} title={title}>
      <CornerUpRight className="h-3 w-3 shrink-0" /> transferred
    </span>
  );
}

/** The quiet marks along a row: a recording, files, repetition, remarks. */
export function TaskMarks({ task }) {
  const marks = [];
  if (task.hasVoiceNote || task.voiceNote?.storagePath || task.voiceNote?.url) marks.push(['voice', Mic, 'Has a voice note']);
  const files = task.attachmentCount || task.attachments?.length;
  if (files) marks.push(['files', Paperclip, `${files} file${files === 1 ? '' : 's'}`]);
  if (task.repeat?.frequency && task.repeat.frequency !== 'ONCE' && !task.recurringTask) marks.push(['repeat', Repeat, repeatLabel(task.repeat)]);
  if (task.updateCount > 1) marks.push(['updates', MessageSquare, `${task.updateCount} updates`]);
  if (!marks.length) return null;
  return (
    <span className="inline-flex items-center gap-2 text-ink-faint">
      {marks.map(([key, Icon, title]) => (
        <span key={key} title={title} className="inline-flex items-center">
          <Icon className="h-3.5 w-3.5" aria-label={title} />
        </span>
      ))}
    </span>
  );
}

/**
 * Nothing here — said briefly, as the HRMS does. Total lists open work only,
 * so a pile of finished tasks opens empty: say where they went.
 */
export function EmptyTasks({ scope, onAssign, filtered = false, completedHint = false }) {
  const done = completedHint ? 'Finished tasks are under Completed, beside Filter.' : '';
  const lines = {
    mine: [completedHint ? 'Nothing open on your plate' : 'Nothing assigned to you', done],
    delegated: ['Nothing you assigned is open', done],
    loop: ['Nothing to follow', done],
    team: ['No open organization tasks', done],
    all: ['No open tasks', done],
  };
  const [title, body] = filtered ? ['Nothing matches', 'Try clearing the filters.'] : lines[scope] || lines.all;
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 text-xs text-ink-soft">{body}</p>}
      {onAssign && (
        <Button className="mt-4" icon={Plus} onClick={onAssign}>
          Assign task
        </Button>
      )}
    </div>
  );
}
