/**
 * The one short question a status move asks — a remark (typed or spoken) and
 * a button. No move is silent: an empty box sends a plain default where one
 * exists ("Approved."), and is REQUIRED where somebody else cannot act without
 * it (declining, sending back) — and for every move made by a swipe while the
 * server says so (`meta.swipeRemarkRequired`).
 */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, CheckCircle2, RotateCcw, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button, Modal } from '../../platform/ui';
import { VoiceRecorder } from './VoiceNote';

const COPY = {
  accept: { title: 'Accept this task?', body: 'It moves to In progress, and whoever gave it is told.', label: 'Remark', placeholder: 'e.g. On it — I will send it by 5 pm (optional)', defaultNote: 'Accepted — on it.', confirm: 'Accept', icon: ThumbsUp, tone: 'green' },
  done: { title: 'Mark as done?', body: 'Today’s routine is finished — it is marked completed.', label: 'Remark', placeholder: 'Anything to add? (optional)', defaultNote: 'Done.', confirm: 'Mark done', icon: CheckCircle2, tone: 'green' },
  approve: { title: 'Approve this task?', body: 'It is marked completed.', label: 'Remark', placeholder: 'Anything to say about the work? (optional)', defaultNote: 'Approved.', confirm: 'Approve', icon: CheckCircle2, tone: 'green' },
  sendBack: { title: 'Send it back?', body: 'It reopens with everything already done still on it.', label: 'What still needs doing?', placeholder: 'e.g. The March figures are missing', confirm: 'Send back', icon: RotateCcw, tone: 'red' },
  decline: { title: 'Decline this task?', body: 'Whoever gave it is told, with your reason, so it can go to somebody else.', label: 'Why can you not take it on?', placeholder: 'e.g. I am away from Thursday', confirm: 'Decline', icon: ThumbsDown, tone: 'red' },
  submit: { title: 'Send for review?', body: 'It goes to whoever reviews it, who approves it or sends it back.', label: 'What did you do?', placeholder: 'A line about the work (optional)', defaultNote: 'Submitted for review.', confirm: 'Send for review', icon: Send, tone: 'violet' },
  complete: { title: 'Mark as completed?', body: 'It is finished for everybody on it.', label: 'Remark', placeholder: 'Anything to add? (optional)', defaultNote: 'Marked completed.', confirm: 'Mark completed', icon: Check, tone: 'green' },
};

const CHIP_TONES = {
  green: 'bg-green-50 text-green-700',
  red: 'bg-red-50 text-red-600',
  violet: 'bg-violet-50 text-violet-700',
};

// The confirm button, in the move's colour.
const VARIANTS = { green: 'success', red: 'danger', violet: 'review' };

/** Whether a key opens this dialog. */
export const isRemarkAction = (key) => Boolean(COPY[key]);

export function TaskActionDialog({ action, task, onClose, onConfirm, requireRemark = false }) {
  const copy = COPY[action] || null;
  const [note, setNote] = useState('');
  const [voice, setVoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    if (!copy) return;
    setNote('');
    setVoice(null);
    setError('');
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, task?._id]);

  if (!copy || !task) return null;

  // Decline takes a typed reason (the server's `reason`); the rest take a voice note too.
  const voiceOk = action !== 'decline' && action !== 'accept';
  const required = requireRemark || !copy.defaultNote;
  const Icon = copy.icon;
  const placeholder = required ? copy.placeholder.replace(/\s*\(optional\)$/i, '') : copy.placeholder;

  const confirm = async () => {
    const said = note.trim();
    if (required && !said && !(voiceOk && voice)) {
      setError(copy.defaultNote ? 'Add a remark first — a swipe needs one.' : 'Say why — the other person has nothing else to go on.');
      boxRef.current?.focus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm?.(said || (voice ? '' : copy.defaultNote), voiceOk ? voice : null);
    } catch (err) {
      setError(err?.message || 'That did not go through. Try again.');
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose?.()}
      title={copy.title}
      subtitle={task.title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant={VARIANTS[copy.tone] || 'success'} icon={Icon} loading={saving} onClick={confirm}>
            {saving ? 'Saving…' : copy.confirm}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', CHIP_TONES[copy.tone] || CHIP_TONES.green)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <p className="pt-0.5 text-xs leading-relaxed text-ink-soft">{copy.body}</p>
      </div>
      <label htmlFor="task-action-note" className="mb-1 mt-4 block text-xs font-medium text-ink-soft">
        {copy.label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <textarea
        id="task-action-note"
        ref={boxRef}
        autoFocus
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          if (error) setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            confirm();
          }
        }}
        rows={3}
        maxLength={1000}
        placeholder={placeholder}
        className="block w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {voiceOk && (
        <div className="mt-2">
          <VoiceRecorder value={voice} onChange={setVoice} />
        </div>
      )}
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </Modal>
  );
}
