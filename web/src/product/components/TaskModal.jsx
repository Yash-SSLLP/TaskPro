/**
 * A task, opened over the list (so somebody working down twenty rows keeps
 * their place, filters and page). The page at /tasks/:id renders the same
 * TaskDetailBody. Opening a piece inside swaps the window to that piece.
 *
 * As the HRMS draws it: a slim bar — a small "TASK" on the left, "Open in
 * full" beside the close on the right — over one scroller on the page colour.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Modal } from '../../platform/ui';
import { TaskDetailBody } from './TaskDetailBody';

export function TaskModal({ taskId, open, onClose, onChanged, initialEdit = false }) {
  const [override, setOverride] = useState(null);
  const current = override || taskId;
  useEffect(() => setOverride(null), [taskId, open]);
  if (!open || !current) return null;

  // The way out of the window, kept on purpose: a link to copy, bookmark or send.
  const openInFull = (
    <Link
      to={`/tasks/${current}`}
      onClick={onClose}
      title="Open the full page"
      className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-ink-soft transition hover:bg-slate-100 hover:text-ink"
    >
      <ExternalLink className="h-[13px] w-[13px]" /> Open in full
    </Link>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      compact
      title={<span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Task</span>}
      actions={openInFull}
      focusFirst={false}
      bodyClassName="bg-page px-3 py-3 sm:px-4 sm:py-4"
    >
      <TaskDetailBody key={current} taskId={current} initialEdit={current === taskId ? initialEdit : false} onChanged={onChanged} onOpenTask={(id) => id && setOverride(String(id))} onGone={onClose} />
    </Modal>
  );
}
