/**
 * The reminder bell: the setter chasing the work, or the doer chasing the
 * review — whoever the server says (`can.canNudge` / `nudgeTo`). Once per task
 * per cooldown; a waiting bell counts down ("25m") on its own, and a press
 * inside the gate says when it opens instead of sending.
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { formatTime } from '../../platform/format';
import { useTz } from '../../platform/session';
import * as T from '../api';
import { nudgeState } from '../lifecycle';

export function NudgeBell({ task, override = null, onNudged, labelled = false, disabled = false, cooldownMin = 30 }) {
  const tz = useTz();
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const state = nudgeState(task, override);

  useEffect(() => {
    if (!state.can || !state.waitMin) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [state.can, state.waitMin]);

  if (!state.can) return null;

  const review = state.to === 'approver';
  const waiting = state.waitMin > 0;
  const who = review ? 'the reviewer' : 'them';

  const ring = async (e) => {
    e?.stopPropagation?.();
    if (busy || disabled) return;
    if (waiting) {
      toast.info(`Reminder already sent — you can remind ${who} again at ${formatTime(state.readyAt, tz)}.`);
      return;
    }
    setBusy(true);
    try {
      const res = await T.nudgeTask(task._id);
      toast.success(res?.message || 'Reminder sent.');
      onNudged?.(task._id, res?.nextAt ? new Date(res.nextAt) : new Date(Date.now() + cooldownMin * 60000));
    } catch (err) {
      if (err.status === 429 && err.data?.nextAt) {
        onNudged?.(task._id, new Date(err.data.nextAt));
        toast.info(err.message || `Try again at ${formatTime(err.data.nextAt, tz)}.`);
      } else toast.error(err.message || 'Could not send the reminder.');
    } finally {
      setBusy(false);
    }
  };

  const tone = waiting ? 'border-line bg-slate-50 text-ink-faint' : review ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-amber-200 bg-amber-50 text-amber-700';
  const title = waiting ? `Reminder sent — you can remind ${who} again in ${state.waitMin} min` : review ? 'Remind the reviewer to review it' : 'Send a reminder';

  if (labelled) {
    return (
      <button type="button" onClick={ring} disabled={busy || disabled} title={title} aria-label={title} className={clsx('inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition disabled:opacity-60', tone)}>
        <Bell className={clsx('h-4 w-4', busy && 'animate-pulse')} />
        {waiting ? `Reminded · again in ${state.waitMin}m` : review ? 'Remind to review' : 'Remind'}
      </button>
    );
  }

  return (
    <button type="button" onClick={ring} disabled={busy || disabled} title={title} aria-label={title} className={clsx('relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition disabled:opacity-60', tone)}>
      <Bell className={clsx('h-4 w-4', busy && 'animate-pulse')} />
      {waiting && (
        <span className="tnum pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-md border border-line bg-card px-1 text-[9.5px] font-bold leading-4 text-ink-soft">
          {state.waitMin}m
        </span>
      )}
    </button>
  );
}
