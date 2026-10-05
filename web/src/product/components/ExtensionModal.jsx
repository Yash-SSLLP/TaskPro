/**
 * "I will do it — but not by then." Both sides of one conversation:
 *   mode 'ask'     the doer names a later date and says why   POST /:id/extension
 *   mode 'decide'  the approver answers                         POST /:id/extension/:reqId
 * It is not a status: the work carries on while the answer is awaited.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { fromLocalInput, toLocalInput } from '../../platform/format';
import { useTz } from '../../platform/session';
import { Button, Modal } from '../../platform/ui';
import * as T from '../api';
import { dateTimeLabel, dayLabel, timeAgo } from '../lifecycle';

function suggested(dueDate, tz) {
  const base = dueDate ? new Date(dueDate) : new Date();
  const out = new Date(base.getTime() + 2 * 86400000);
  return toLocalInput(out, tz);
}

export function ExtensionModal({ open, onClose, task, can = {}, mode = 'ask', requestId = null, initialApprove, onDone }) {
  const tz = useTz();
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const deciding = mode === 'decide';

  const request = useMemo(() => {
    if (!deciding) return null;
    const rows = (task?.extensions || []).filter((e) => e.status === 'PENDING');
    return rows.find((e) => String(e._id) === String(requestId)) || rows[0] || null;
  }, [deciding, task, requestId]);

  useEffect(() => {
    if (!open) return;
    setToDate(suggested(task?.dueDate, tz));
    setReason('');
    setNote('');
    setSaving(false);
  }, [open, task, tz]);

  if (!open || !task) return null;

  const askIt = async () => {
    const said = reason.trim();
    if (!toDate) return toast.error('Pick the new date you need.');
    if (!said) return toast.error('Say why you need longer — the person deciding has nothing else to go on.');
    const when = fromLocalInput(toDate, tz);
    if (!when || Number.isNaN(when.getTime())) return toast.error('That date did not make sense.');
    if (task.dueDate && when <= new Date(task.dueDate)) return toast.error('That is not later than the current deadline.');
    setSaving(true);
    try {
      await T.requestExtension(task._id, { toDate: when.toISOString(), reason: said });
      toast.success('Asked. The work carries on while you wait for an answer.');
      onDone?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Could not send that request.');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const decide = async (approve) => {
    if (!request) return toast.error('That request is no longer there.');
    setSaving(true);
    try {
      await T.decideExtension(task._id, String(request._id), { approve, note: note.trim() });
      toast.success(approve ? `Deadline moved to ${dayLabel(request.toDate, tz)}.` : 'Declined — the deadline stands.');
      onDone?.();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Could not save that answer.');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const summary = (
    <div className="rounded-xl border border-line bg-slate-50 px-3 py-2.5">
      <p className="truncate text-sm font-semibold text-ink">{task.title}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
        <CalendarDays className="h-3 w-3" /> Due {task.dueDate ? dateTimeLabel(task.dueDate, tz) : 'no deadline set'}
      </p>
    </div>
  );

  if (deciding) {
    return (
      <Modal
        open
        onClose={onClose}
        title="More time?"
        subtitle="Nothing else moves either way — the task stays exactly where it is."
        footer={
          request && (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant={initialApprove === false ? 'danger' : 'secondary'} icon={XCircle} disabled={saving} onClick={() => decide(false)}>
                Decline
              </Button>
              <Button variant={initialApprove === false ? 'secondary' : 'primary'} icon={Check} disabled={saving} onClick={() => decide(true)}>
                Give until {dayLabel(request.toDate, tz)}
              </Button>
            </>
          )
        }
      >
        <div className="space-y-3">
          {summary}
          {!request ? (
            <p className="text-sm text-ink-soft">That request has already been answered.</p>
          ) : (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-sm font-semibold text-amber-900">
                  {request.requestedByName || 'Somebody'} wants until {dateTimeLabel(request.toDate, tz)}
                </p>
                <p className="mt-0.5 text-xs text-amber-700">asked {timeAgo(request.requestedAt, tz)}</p>
                {request.reason && <p className="mt-1.5 whitespace-pre-wrap text-sm text-amber-900">{request.reason}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="ext-note">
                  Anything to say back? <span className="font-normal text-ink-faint">(optional)</span>
                </label>
                <textarea id="ext-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className="block w-full resize-y rounded-xl border border-line px-3.5 py-2.5 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />
              </div>
              <p className="text-xs text-ink-faint">Giving the time moves the deadline and re-arms the reminders. It does not undo a late delivery already on file.</p>
            </>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Ask for more time"
      subtitle="The task does not stop while you wait for an answer."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Clock} loading={saving} disabled={can.canRequestExtension === false} onClick={askIt}>
            Ask for more time
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {summary}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="ext-date">
            New date you need <span className="text-red-600">*</span>
          </label>
          <input id="ext-date" type="datetime-local" value={toDate} min={task.dueDate ? toLocalInput(task.dueDate, tz) : undefined} onChange={(e) => setToDate(e.target.value)} className="block h-11 w-full rounded-xl border border-line px-3 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />
          <p className="mt-1 text-xs text-ink-faint">It has to be later than the deadline you have now.</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="ext-reason">
            Why <span className="text-red-600">*</span>
          </label>
          <textarea id="ext-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={1000} placeholder="e.g. the supplier has not sent the invoices yet — I have chased twice" className="block w-full resize-y rounded-xl border border-line px-3.5 py-2.5 text-[15px] placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
        <p className="text-xs text-ink-faint">{task.approverName || task.createdByName || 'Whoever set this'} answers it. You can only have one request waiting at a time.</p>
      </div>
    </Modal>
  );
}
