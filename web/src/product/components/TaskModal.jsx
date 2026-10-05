/**
 * A task, opened over the list (so somebody working down twenty rows keeps
 * their place, filters and page). The page at /tasks/:id renders the same
 * TaskDetailBody. Opening a piece inside swaps the window to that piece.
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

  return (
    <Modal open onClose={onClose} size="xl" title="Task" focusFirst={false} bodyClassName="bg-page px-3 pb-4 pt-3 sm:px-4">
      <div className="-mt-1 mb-2 flex justify-end">
        <Link to={`/tasks/${current}`} onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-ink-soft hover:bg-white hover:text-brand">
          <ExternalLink className="h-3.5 w-3.5" /> Open in full
        </Link>
      </div>
      <TaskDetailBody key={current} taskId={current} initialEdit={current === taskId ? initialEdit : false} onChanged={onChanged} onOpenTask={(id) => id && setOverride(String(id))} onGone={onClose} />
    </Modal>
  );
}
