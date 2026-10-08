/**
 * The board: To do · In progress · Review · Done, from GET /api/tasks/board
 * (the list's own filters; each column capped, with "+N more"). Cards can be
 * dragged to another column on a desktop — the drop becomes the move the
 * server allows (`can`), through the same remark box as the list.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ErrorState, Skeleton } from '../../platform/ui';
import * as T from '../api';
import { BOARD_COLUMNS, STATUS, STATUS_DOT, accentStyle, assigneeNames } from '../lifecycle';
import { DueChip, OverdueChip, PriorityChip, ProgressBar } from './TaskChips';
import { TaskStatusMenu } from './TaskStatusMenu';

/** Which move a drop on `to` means for this task, from `can`. */
export function dropAction(task, to) {
  const can = task.can || {};
  if (task.status === to) return null;
  if (to === STATUS.IN_PROGRESS) {
    if (can.canAccept && task.status === STATUS.PENDING) return 'accept';
    if (can.canReject && task.status === STATUS.SUBMITTED) return 'sendBack';
  }
  if (to === STATUS.SUBMITTED && can.canSubmit) return 'submit';
  if (to === STATUS.COMPLETED) {
    if (can.canApprove) return 'approve';
    if (can.canDone) return 'done';
    if ((can.transitions || []).some((t) => t.to === STATUS.COMPLETED)) return 'complete';
  }
  return null;
}

export function TaskBoard({ params, onOpen, onAction }) {
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState('');
  const q = useQuery({
    queryKey: ['tasks', 'board', params],
    queryFn: () => T.boardTasks({ ...params, limitPerColumn: 50 }),
    placeholderData: (prev) => prev,
  });

  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const columns = q.data?.columns || BOARD_COLUMNS.map((c) => ({ ...c, tasks: null }));

  const drop = (col) => {
    setOver('');
    const task = dragging;
    setDragging(null);
    if (!task) return;
    const key = dropAction(task, col.key);
    if (key) onAction?.(key, task);
    else if (task.status !== col.key) {
      toast.info('You can’t move this task there. Open it to see what you can do.');
    }
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[880px] grid-cols-4 gap-3">
        {columns.map((col) => {
          const meta = BOARD_COLUMNS.find((c) => c.key === col.key);
          return (
            <section
              key={col.key}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver((o) => (o === col.key ? '' : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(col);
              }}
              className={clsx('flex max-h-[75vh] min-h-[16rem] flex-col rounded-2xl border bg-slate-50/80', over === col.key ? 'border-brand ring-2 ring-brand/20' : 'border-line')}
            >
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span className={clsx('h-2 w-2 rounded-full', STATUS_DOT[col.key])} />
                <h3 className="text-sm font-semibold text-ink">{meta?.label || col.boardLabel || col.label}</h3>
                <span className="tnum ml-auto rounded-full bg-card px-2 text-xs font-semibold text-ink-soft">{col.count ?? col.tasks?.length ?? ''}</span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {!col.tasks && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                {col.tasks?.length === 0 && <p className="px-2 py-6 text-center text-xs text-ink-faint">Nothing here</p>}
                {col.tasks?.map((t) => (
                  <article
                    key={t._id}
                    draggable
                    onDragStart={(e) => {
                      setDragging(t);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver('');
                    }}
                    onClick={(e) => {
                      if (e.target.closest('button,a,[role="menu"]')) return;
                      onOpen?.(t);
                    }}
                    style={accentStyle(t, { rail: 3 })}
                    className={clsx('cursor-pointer rounded-xl px-3 py-2.5 shadow-sm transition hover:shadow-md', dragging?._id === t._id && 'opacity-50')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-semibold leading-snug text-ink">{t.title}</p>
                      <PriorityChip priority={t.priority} />
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-soft">
                      {t.code && <span className="font-mono text-ink-faint">{t.code} · </span>}
                      {t.isOpenPiece ? 'open — nobody yet' : assigneeNames(t.assignees)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <OverdueChip task={t} />
                      <DueChip task={t} />
                    </div>
                    {Number(t.progress) > 0 && <ProgressBar task={t} className="mt-2 w-full" />}
                    <div className="mt-2 flex justify-end">
                      <TaskStatusMenu task={t} onAction={onAction} onOpen={onOpen} className="h-8" />
                    </div>
                  </article>
                ))}
                {col.more > 0 && <p className="px-2 py-1 text-center text-xs text-ink-faint">+{col.more} more — narrow the filters to see them</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
