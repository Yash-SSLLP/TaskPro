/**
 * One task on its own page — what an alert, a bookmark or a shared link opens.
 * The view is TaskDetailBody, the same one the list opens in a modal.
 */
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { isSuperAdmin, useSession } from '../../platform/session';
import { TaskDetailBody } from '../components/TaskDetailBody';

export function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const admin = isSuperAdmin(useSession((s) => s.user));
  const back = admin ? '/tasks?scope=all' : '/tasks';
  return (
    <div>
      <Link to={back} className="mb-3 inline-flex min-h-[32px] items-center gap-1.5 text-sm text-ink-soft transition hover:text-brand">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to tasks
      </Link>
      <TaskDetailBody key={id} taskId={id} onOpenTask={(childId) => navigate(`/tasks/${childId}`)} onGone={() => navigate(back)} />
    </div>
  );
}
