/**
 * One task, as a row: tinted by priority (green once done, faded once
 * cancelled) from the server's palette; serial and code, title, who set it and
 * who it is for, the day it was handed over, the deadline, progress, and on the
 * right the chips, the reminder bell and the status dropdown. Nothing here
 * decides what anybody may do — the dropdown reads `task.can`.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, CornerUpRight, Layers, Pencil, Repeat, User, UserPlus, Users } from 'lucide-react';
import { useTz } from '../../platform/session';
import {
  DueChip, ExtensionChip, OverdueChip, PiecesChip, PriorityChip, ProgressBar, TaskMarks, TransferredChip,
} from './TaskChips';
import { TaskStatusMenu } from './TaskStatusMenu';
import { NudgeBell } from './NudgeBell';
import { SwipeRow } from './SwipeRow';
import { FREQUENCY_LABELS, accentStyle, assigneeNames, dayLabel, idOf, personName, swipeActionsFor } from '../lifecycle';

const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [role="menu"]';

export const teamNameOf = (task) => task?.team?.name || task?.teamName || '';

export function TaskRow({ task, meId = '', onOpen, onAction, onSwipe, nudgedAt = null, onNudged, cooldownMin }) {
  const tz = useTz();
  const parentId = idOf(task.parentTask) || null;
  const swipe = useMemo(() => (onSwipe ? swipeActionsFor(task) : {}), [task, onSwipe]);
  const freq = task.recurringTask && task.repeat?.frequency && task.repeat.frequency !== 'ONCE' ? FREQUENCY_LABELS[task.repeat.frequency] : '';

  const setterId = idOf(task.createdBy);
  const byMe = Boolean(meId) && setterId === String(meId);
  const onlyMe = byMe && (task.assignees || []).length === 1 && idOf(task.assignees[0].user) === String(meId);
  const setBy = byMe ? 'you' : task.createdByName || personName(task.createdBy) || '—';
  const sentById = idOf(task.onBehalf?.by);
  const sentBy = sentById ? (sentById === String(meId) ? 'you' : task.onBehalf.byName || personName(task.onBehalf.by)) : '';
  const setFor = task.isOpenPiece ? 'nobody yet' : assigneeNames(task.assignees);
  const assignedOn = dayLabel(task.assignedAt || task.createdAt, tz);
  const team = teamNameOf(task);

  const openRow = (e) => {
    if (!onOpen || e.target.closest?.(INTERACTIVE)) return;
    onOpen(task);
  };
  const openFromTitle = (e) => {
    if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(task);
  };

  return (
    <SwipeRow actions={swipe} onAction={(key) => onSwipe?.(key, task)}>
      <div onClick={openRow} style={accentStyle(task)} className="group cursor-pointer rounded-2xl px-3 py-3 shadow-sm transition duration-200 hover:-translate-y-px hover:shadow-md sm:px-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="tnum w-8 shrink-0 pt-0.5 text-right font-mono text-[11px] text-ink-faint">{task.serial ? `#${task.serial}` : ''}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {task.code && <span className="shrink-0 font-mono text-[11px] text-ink-faint">{task.code}</span>}
                <ExtensionChip task={task} className="shrink-0" />
                <Link to={`/tasks/${task._id}`} onClick={openFromTitle} className="min-w-0 break-words text-[15px] font-semibold text-ink hover:text-brand">
                  {task.title}
                </Link>
              </div>

              {task.isPiece && (
                <div className="mt-1 text-[11px] text-ink-soft">
                  <Layers className="mr-1 inline h-3 w-3 align-[-2px] text-ink-faint" />
                  part of{' '}
                  {parentId ? (
                    <Link to={`/tasks/${parentId}`} onClick={(e) => e.stopPropagation()} className="text-ink hover:text-brand" title={task.parentTitle || undefined}>
                      {task.parentCode || task.parentTitle || 'the parent task'}
                    </Link>
                  ) : (
                    <span>{task.parentCode || task.parentTitle || 'another task'}</span>
                  )}
                </div>
              )}

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                {onlyMe ? (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3 text-ink-faint" /> Your own task
                  </span>
                ) : (
                  <>
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <User className="h-3 w-3 shrink-0 text-ink-faint" />
                      <span className="text-ink-faint">By</span>
                      <span className="truncate text-ink">{setBy}</span>
                      {sentBy && <span className="shrink-0 text-ink-faint">(sent by {sentBy})</span>}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <ArrowRight className="h-3 w-3 shrink-0 text-ink-faint" />
                      <span className="text-ink-faint">To</span>
                      <span className="truncate text-ink">{setFor}</span>
                    </span>
                  </>
                )}
                {assignedOn && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3 shrink-0 text-ink-faint" /> {assignedOn}
                  </span>
                )}
                <DueChip task={task} />
                {task.category && <span className="rounded-md bg-white/70 px-1.5 text-ink-soft">{task.category}</span>}
                {team && (
                  <span className="inline-flex items-center gap-1 text-ink-soft">
                    <Users className="h-3 w-3 text-ink-faint" /> {team}
                  </span>
                )}
                {task.delegationCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-ink-faint">
                    <CornerUpRight className="h-3 w-3" /> passed on
                  </span>
                )}
                {task.isOpenPiece && (
                  <span className="inline-flex items-center gap-1 font-medium text-sky-700">
                    <UserPlus className="h-3 w-3" /> open — pick it up
                  </span>
                )}
                {freq && (
                  <span className="inline-flex items-center gap-1" title={task.repeatLabel || freq}>
                    <Repeat className="h-3 w-3 text-ink-faint" /> {freq}
                  </span>
                )}
                {task.editCount > 0 && task.status === 'PENDING' && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 font-medium text-amber-700" title={task.lastEditedByName ? `Last edited by ${task.lastEditedByName}` : 'Edited after it was sent'}>
                    <Pencil className="h-2.5 w-2.5" /> Edited{task.editCount > 1 ? ` ×${task.editCount}` : ''}
                  </span>
                )}
                <TaskMarks task={task} />
              </div>

              {Number(task.progress) > 0 && <ProgressBar task={task} className="mt-2 w-full max-w-[240px]" />}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pl-11 md:shrink-0 md:justify-end md:pl-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <OverdueChip task={task} />
              <PriorityChip priority={task.priority} />
              <PiecesChip task={task} />
              <TransferredChip task={task} />
            </div>
            <div className="flex items-center gap-2">
              <NudgeBell task={task} override={nudgedAt} onNudged={onNudged} cooldownMin={cooldownMin} />
              <TaskStatusMenu task={task} onAction={onAction} onOpen={onOpen} />
            </div>
          </div>
        </div>
        {task.stateNote && task.status === 'CANCELLED' && <p className="mt-2 border-t border-black/5 pt-2 text-xs text-ink-soft">{task.stateNote}</p>}
      </div>
    </SwipeRow>
  );
}
