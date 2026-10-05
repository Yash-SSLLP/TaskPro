/**
 * Transfer — it went to the wrong person. The opposite of delegating: whoever
 * holds it comes OFF completely, progress resets, the new person starts at
 * Pending and must accept it, and it stays with its original reviewer. The
 * reason is required.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Modal, useConfirm } from '../../platform/ui';
import * as T from '../api';
import { idOf, personName } from '../lifecycle';
import { PeoplePicker } from './PeoplePicker';

export function TransferModal({ task, meta, open, onClose, onDone }) {
  const confirm = useConfirm();
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo('');
    setReason('');
    setSaving(false);
  }, [open]);

  const holders = useMemo(() => (task?.assignees || []).map((a) => a.name || personName(a.user)).filter(Boolean), [task]);
  const people = useMemo(() => {
    const onIt = new Set((task?.assignees || []).map((a) => idOf(a.user)));
    return (meta?.people || []).filter((p) => !onIt.has(idOf(p)));
  }, [meta, task]);

  if (!open || !task) return null;
  const target = people.find((p) => idOf(p) === String(to));
  const leaving = holders.length ? holders.join(', ') : 'Nobody';

  const submit = async () => {
    if (!to) return toast.error('Choose who it should have gone to.');
    const said = reason.trim();
    if (!said) return toast.error('Say why it is moving.');
    const ok = await confirm({
      title: 'Transfer this task?',
      text: `${leaving} will come off "${task.title}" completely, and ${target?.name || 'the new person'} will hold it as if it had been theirs from the start.`,
      details: [
        `${leaving} will stop seeing it and stop being told about it.`,
        'Progress so far is wiped — the new person starts at Pending and has to accept it.',
        'It is still reviewed by whoever set it. To keep the outcome yours, delegate it instead.',
      ],
      confirmLabel: 'Transfer it',
      tone: 'primary',
    });
    if (!ok) return undefined;
    setSaving(true);
    try {
      const res = await T.transferTask(task._id, to, said);
      toast.success(`Transferred to ${res?.transferredTo?.name || target?.name || 'them'}.`);
      onDone?.(res);
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Could not transfer that task.');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Transfer this task"
      subtitle={`${task.code ? `${task.code} · ` : ''}${task.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={ArrowRightLeft} loading={saving} disabled={!to || !reason.trim()} onClick={submit}>
            Transfer it
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" /> This is not delegating — it hands the task over completely
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-amber-900">
            <li>
              <strong>{leaving}</strong> comes off the task and stops hearing about it.
            </li>
            <li>Any progress is <strong>reset</strong>; the new person has to accept it first.</li>
            <li>You do <strong>not</strong> become the reviewer — use <strong>Delegate</strong> for that.</li>
          </ul>
        </div>
        <PeoplePicker label="It should have gone to" icon={User} people={people} value={to} onChange={setTo} max={1} placeholder="Search by name or Task Pin…" />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="transfer-reason">
            Why is it moving? <span className="text-red-600">*</span>
          </label>
          <textarea id="transfer-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. This belongs to the accounts team, not ours." className="block w-full resize-y rounded-xl border border-line px-3.5 py-2.5 text-[15px] placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30" />
          <p className="mt-1 text-xs text-ink-soft">Written into the task&apos;s history — the only thing the new person has to go on.</p>
        </div>
      </div>
    </Modal>
  );
}
