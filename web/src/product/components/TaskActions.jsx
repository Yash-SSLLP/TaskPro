/**
 * One place that turns a pick from a row's dropdown, a swipe or a board drop
 * into the right move — and owns the dialogs those moves open (the remark
 * box, Delegate, Transfer, More time). Used by the list and the board.
 *
 *   const actions = useTaskActions({ meta, onChanged, onEdit });
 *   actions.run(key, task)    // from the dropdown
 *   actions.swipe(key, task)  // from a swipe: the remark is required while meta says so
 *   {actions.element}         // render once
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '../../platform/ui';
import * as T from '../api';
import { TaskActionDialog, isRemarkAction } from './TaskActionDialog';
import { DelegateModal } from './DelegateModal';
import { TransferModal } from './TransferModal';
import { ExtensionModal } from './ExtensionModal';

const SAID = {
  approve: 'Approved — it is completed.',
  sendBack: 'Sent back. They have been told what is missing.',
  decline: 'Declined. Whoever gave it has been told.',
  submit: 'Sent for review.',
  accept: 'Accepted — it is in progress now.',
  done: 'Done — nicely.',
};

export function useTaskActions({ meta, onChanged, onEdit }) {
  const confirm = useConfirm();
  const [action, setAction] = useState(null); // { key, task, swipe }
  const [delegating, setDelegating] = useState(null);
  const [transferring, setTransferring] = useState(null);
  const [extending, setExtending] = useState(null);

  const run = useCallback(
    async (key, task) => {
      if (key === 'accept') {
        try {
          await T.acceptTask(task._id);
          toast.success(SAID.accept);
          onChanged?.(task._id);
        } catch (err) {
          toast.error(err.message || 'Could not accept that task.');
        }
        return;
      }
      if (key === 'claim') {
        const ok = await confirm({ title: 'Pick this up?', text: `"${task.title}" has nobody on it yet. It becomes yours, and nobody else can claim it.`, confirmLabel: 'Pick it up', tone: 'primary' });
        if (!ok) return;
        try {
          await T.claimTask(task._id);
          toast.success('It is yours now.');
          onChanged?.(task._id);
        } catch (err) {
          toast.error(err.message || 'Could not pick that up.');
        }
        return;
      }
      if (key === 'delegate') return setDelegating(task);
      if (key === 'transfer') return setTransferring(task);
      if (key === 'extension') return setExtending(task);
      if (key === 'edit') return onEdit?.(task);
      if (isRemarkAction(key)) setAction({ key, task });
    },
    [confirm, onChanged, onEdit]
  );

  const swipe = useCallback((key, task) => {
    if (key === 'extension') return setExtending(task);
    setAction({ key, task, swipe: true });
    return undefined;
  }, []);

  const confirmAction = useCallback(
    async (note, voice) => {
      const { key, task } = action;
      const payload = { note, voice: voice || undefined };
      let res = null;
      if (key === 'approve') res = await T.approveTask(task._id, payload);
      else if (key === 'sendBack') res = await T.rejectTask(task._id, payload);
      else if (key === 'decline') res = await T.declineTask(task._id, note);
      else if (key === 'submit') res = await T.submitTask(task._id, payload);
      else if (key === 'complete' || key === 'done') res = await T.changeStatus(task._id, 'COMPLETED', payload);
      else if (key === 'accept') res = await T.acceptTask(task._id, note);
      if (res?.unchanged) toast.info('That was already done.');
      else toast.success(key === 'complete' ? (res?.coerced ? 'Sent for review — it needs approving first.' : 'Marked completed.') : SAID[key]);
      setAction(null);
      onChanged?.(task._id);
    },
    [action, onChanged]
  );

  const changed = (task) => () => onChanged?.(task?._id);

  const element = (
    <>
      {action && (
        <TaskActionDialog
          action={action.key}
          task={action.task}
          requireRemark={Boolean(action.swipe) && meta?.swipeRemarkRequired !== false}
          onClose={() => setAction(null)}
          onConfirm={confirmAction}
        />
      )}
      <ExtensionModal open={Boolean(extending)} onClose={() => setExtending(null)} task={extending} can={extending?.can || {}} mode="ask" onDone={changed(extending)} />
      <DelegateModal open={Boolean(delegating)} onClose={() => setDelegating(null)} task={delegating} meta={meta} can={delegating?.can} onDone={changed(delegating)} />
      <TransferModal open={Boolean(transferring)} onClose={() => setTransferring(null)} task={transferring} meta={meta} onDone={changed(transferring)} />
    </>
  );

  return { run, swipe, element };
}
