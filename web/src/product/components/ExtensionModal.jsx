/**
 * "I will do it — but not by then." Both sides of one conversation:
 *   mode 'ask'     the doer names a later date and says why   POST /:id/extension
 *   mode 'decide'  the approver answers                         POST /:id/extension/:reqId
 * It is not a status: the work carries on while the answer is awaited.
 *
 * One narrow box, as the HRMS draws it: the title with an amber clock, the task
 * it is about, the fields, and the buttons underneath (no footer bar).
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { fromLocalInput, toLocalInput } from '../../platform/format';
import { useTz } from '../../platform/session';
import { Button, Modal } from '../../platform/ui';
import * as T from '../api';
import { dateTimeLabel, dayLabel, timeAgo } from '../lifecycle';

const LABEL = 'mb-1 block text-xs font-medium text-ink-soft';
const BOX = 'block w-full rounded-xl border border-line bg-card px-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';

function suggested(dueDate, tz) {
  const base = dueDate ? new Date(dueDate) : new Date();
  const out = new Date(base.getTime() + 2 * 86400000);
  return toLocalInput(out, tz);
}

function Title({ children }) {
  return (
    <span className="flex items-center gap-1.5">
      <Clock className="h-4 w-4 shrink-0 text-amber-500" /> {children}
    </span>
  );
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
    // By id: a live refresh of the same task must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?._id, tz]);

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
    <div className="rounded-xl border border-line bg-well px-3 py-2.5">
      <p className="truncate text-sm font-medium text-ink">{task.title}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
        <CalendarDays className="h-[11px] w-[11px] shrink-0" /> Due {task.dueDate ? dateTimeLabel(task.dueDate, tz) : 'no deadline set'}
      </p>
    </div>
  );

  if (deciding) {
    // The button they pressed on the task to get here is the answer they had in mind: it opens lit.
    const declining = initialApprove === false;
    // A step wider than the ask: its three buttons (Cancel · Decline · Give until …) need one line.
    return (
      <Modal open onClose={onClose} size="md" title={<Title>More time?</Title>}>
        <div className="space-y-3">
          {summary}
          {!request ? (
            <p className="text-sm text-ink-soft">That request has already been answered.</p>
          ) : (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-sm font-medium text-amber-900">
                  {request.requestedByName || 'Somebody'} wants until {dateTimeLabel(request.toDate, tz)}
                </p>
                <p className="mt-0.5 text-[11px] text-amber-700">asked {timeAgo(request.requestedAt, tz)}</p>
                {request.reason && <p className="mt-1.5 whitespace-pre-wrap text-sm text-amber-900">{request.reason}</p>}
              </div>
              <div>
                <label className={LABEL} htmlFor="ext-note">
                  Anything to say back? <span className="font-normal text-ink-faint">(optional)</span>
                </label>
                <textarea id="ext-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. Fine, but it cannot slip again." className={`${BOX} resize-y py-2`} />
              </div>
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            {request && (
              <>
                {declining ? (
                  <Button variant="danger" icon={XCircle} disabled={saving} onClick={() => decide(false)}>
                    Decline
                  </Button>
                ) : (
                  <Button variant="secondary" icon={XCircle} disabled={saving} onClick={() => decide(false)}>
                    Decline
                  </Button>
                )}
                {declining ? (
                  <Button variant="secondary" icon={Check} disabled={saving} onClick={() => decide(true)}>
                    Give until {dayLabel(request.toDate, tz)}
                  </Button>
                ) : (
                  <Button variant="go" icon={Check} disabled={saving} onClick={() => decide(true)}>
                    {saving ? 'Saving…' : `Give until ${dayLabel(request.toDate, tz)}`}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  const waiting = can.canRequestExtension === false;
  return (
    <Modal open onClose={onClose} size="sm" title={<Title>Ask for more time</Title>}>
      <div className="space-y-3">
        {summary}
        <div>
          <label className={LABEL} htmlFor="ext-date">
            New date you need <span className="text-red-600">*</span>
          </label>
          <input id="ext-date" type="datetime-local" value={toDate} min={task.dueDate ? toLocalInput(task.dueDate, tz) : undefined} onChange={(e) => setToDate(e.target.value)} className={`${BOX} h-10`} />
        </div>
        <div>
          <label className={LABEL} htmlFor="ext-reason">
            Why do you need longer? <span className="text-red-600">*</span>
            <span className="ml-1 font-normal text-ink-faint">(required)</span>
          </label>
          <textarea id="ext-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={1000} placeholder="e.g. the supplier has not sent the invoices yet — I have chased twice" className={`${BOX} resize-y py-2`} />
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="warning"
            icon={Clock}
            loading={saving}
            disabled={waiting || !reason.trim()}
            title={waiting ? 'You already have a request waiting on this task' : !reason.trim() ? 'Say why you need longer first' : undefined}
            onClick={askIt}
          >
            {saving ? 'Asking…' : 'Ask for more time'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
