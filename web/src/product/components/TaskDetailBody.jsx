/**
 * One task, whole — the same component on the page (/tasks/:id) and in the
 * modal over the list, drawn the way the HRMS draws it. A split pane: the task
 * on the left (header, the server's buttons, edit history, declined, progress,
 * what was asked for, the facts, pieces, more time, hand-overs) and the talk on
 * the right (Comment · Files · Activity, with the composer pinned underneath).
 *
 * THE BUTTONS ARE THE SERVER'S: every one is drawn from `can`. The only
 * client-side decision is de-duplication — `can.transitions` also contains the
 * moves Submit, Approve and Send back already draw.
 *
 * NO SILENT MOVES: a status change puts the composer into "answer mode" for
 * that move, and it goes with a note or a voice note.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, ArrowRightLeft, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, Clock,
  CornerUpRight, Download, Eye, Flag, GitBranch, ImageIcon, Link2, Lock, MessageSquare, Paperclip, Pencil, Play, Repeat, RotateCcw, Send,
  Slash, Tag, ThumbsDown, ThumbsUp, Trash2, TrendingUp, User, UserCheck, Users, X, XCircle,
} from 'lucide-react';
import { openFile } from '../../platform/api';
import { dayKey, formatTime } from '../../platform/format';
import { useTz } from '../../platform/session';
import { Avatar, Skeleton, useConfirm, usePrompt } from '../../platform/ui';
import * as T from '../api';
import { useInvalidateTasks, useMeId, useTaskMeta } from '../hooks';
import {
  PROGRESS_STEPS, STATUS, TASK_PRIORITY, accentFor, accentStyle, clampProgress, dateTimeLabel, dayLabel, idOf, isOverdue, isTerminal,
  personName, priorityColor, reminderLabel, repeatLabel, sizeLabel, statusLabel, statusStyle, timeAgo, tintStyle,
} from '../lifecycle';
import { DueChip, OverdueChip, PiecesChip, ProgressBar, StatusChip, TransferredChip } from './TaskChips';
import { ChildTaskList } from './ChildTaskList';
import { ExtensionModal } from './ExtensionModal';
import { NudgeBell } from './NudgeBell';
import { WhatsAppNudge } from './WhatsAppNudge';
import { DelegateModal } from './DelegateModal';
import { TransferModal } from './TransferModal';
import { VoicePlayer, VoiceRecorder } from './VoiceNote';
import { AssignTaskModal } from './AssignTaskModal';
import { teamNameOf } from './TaskRow';

/* The one card, the one heading, the one chip, the one button — declared once
   so nothing here invents a second radius or a second height. */
const CARD = 'rounded-2xl border border-line bg-card shadow-card';
const SECTION = 'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft';
const CHIP = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-medium';
const BTN = 'inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition';
const ICON = 'h-3.5 w-3.5 shrink-0';
const TONES = {
  go: 'border-transparent bg-emerald-600 text-white hover:bg-emerald-700',
  send: 'border-transparent bg-brand text-on-brand hover:bg-brand-dark',
  ghost: 'border-line bg-card text-slate-700 hover:border-slate-300 hover:text-brand',
  warn: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  danger: 'border-line bg-card text-slate-600 hover:border-red-300 hover:text-red-600',
};
/** A 36px square that attaches something to the composer. */
const ICON_BTN = 'grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-card text-ink-soft transition hover:border-slate-300 hover:text-brand';

/** Rows whose note the ENGINE writes, not a person. */
const MACHINE_SAID = new Set(['PROGRESS', 'SPLIT', 'CLAIMED', 'REMINDER']);

// `more-time-ink`: sent back and more time asked turn orange in the dark (index.css).
const FEED_WORDS = {
  CREATED: { icon: Flag, says: 'set this task', tone: 'text-ink-faint' },
  STATUS: { icon: Activity, says: '', tone: 'text-blue-500' },
  COMMENT: { icon: MessageSquare, says: '', tone: 'text-ink-faint' },
  EDITED: { icon: Pencil, says: 'changed the details', tone: 'text-ink-faint' },
  ASSIGNED: { icon: Users, says: 'changed who is on it', tone: 'text-ink-faint' },
  REMINDER: { icon: Bell, says: 'a reminder went out', tone: 'text-ink-faint' },
  NUDGE: { icon: Bell, says: 'sent a reminder', tone: 'text-amber-500' },
  ACCEPTED: { icon: ThumbsUp, says: 'took it on', tone: 'text-emerald-500' },
  REJECTED: { icon: ThumbsDown, says: 'declined it', tone: 'text-red-500' },
  DELEGATED: { icon: CornerUpRight, says: 'passed it on', tone: 'text-blue-500' },
  SUBTASK: { icon: GitBranch, says: 'changed a piece', tone: 'text-ink-faint' },
  SUBMITTED: { icon: Send, says: 'handed it in', tone: 'text-violet-500' },
  APPROVED: { icon: CheckCircle2, says: 'approved it', tone: 'text-emerald-500' },
  SENT_BACK: { icon: RotateCcw, says: 'sent it back', tone: 'more-time-ink text-amber-500' },
  PROGRESS: { icon: TrendingUp, says: 'reported progress', tone: 'text-blue-500' },
  SPLIT: { icon: GitBranch, says: 'split it into pieces', tone: 'text-blue-500' },
  CLAIMED: { icon: UserCheck, says: 'picked it up', tone: 'text-emerald-500' },
  TRANSFERRED: { icon: ArrowRightLeft, says: 'handed it to the right person', tone: 'text-ink-faint' },
  EXTENSION_ASKED: { icon: Clock, says: 'asked for more time', tone: 'more-time-ink text-amber-500' },
  EXTENSION_DECIDED: { icon: Clock, says: 'answered the request for more time', tone: 'text-amber-500' },
};

/** A file on a task or a remark: its signed `url`, or the session stream. */
const fileTarget = (taskId, f) => ({ url: f.url, path: T.fileUrl(taskId, f._id || f.id) });

/** A recording: signed `url` when served, else the session stream. */
const voiceSrc = (voiceNote) => voiceNote?.url || null;

/**
 * The clock time something happened, beside its "5 min ago" (the HRMS's
 * stampOf, in my Settings zone): "7:02 AM" today, "8 Oct, 7:02 AM" another
 * day, with the year when it is not this one.
 */
function stampOf(when, tz) {
  if (!when) return '';
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return '';
  const clock = formatTime(d, tz).replace(/\s*([ap])\.?\s?m\.?$/i, (_, p) => ` ${p.toUpperCase()}M`);
  return dayKey(d, tz) === dayKey(new Date(), tz) ? clock : `${dayLabel(d, tz)}, ${clock}`;
}

/** "5 min ago · 7:02 AM". Past a week `timeAgo` is a date already, so the stamp says it alone. */
function whenLine(when, tz) {
  if (!when) return '';
  const stamp = stampOf(when, tz);
  return Date.now() - new Date(when).getTime() >= 7 * 86400000 ? stamp : `${timeAgo(when, tz)} · ${stamp}`;
}

function Fact({ icon: Icon, label, children, wide }) {
  return (
    <div className={clsx('flex gap-2', wide && 'sm:col-span-2')}>
      <Icon className="mt-0.5 h-[13px] w-[13px] shrink-0 text-ink-faint" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-ink-faint">{label}</p>
        <div className="text-sm text-ink-soft">{children}</div>
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <p className="py-8 text-center text-xs text-ink-faint">{children}</p>;
}

/**
 * A chip that drops down (status and priority on the header row). With no
 * items it is simply a chip.
 *
 * The menu is PORTALLED to <body> with fixed coordinates: the header card
 * clips (overflow-hidden, for its rounded rail), and a menu inside it was cut
 * off at the card's edge. It flips above the chip when there is no room
 * below, is pulled in from the screen's edges, follows the chip on scroll and
 * closes once the chip scrolls out of sight, on Escape, and on a click or a
 * focus anywhere else.
 */
function MenuChip({ label, className, style, dot, items = [], current, onPick, title }) {
  const [open, setOpen] = useState(false);
  // Viewport coordinates; null until placed, so the menu never flashes top-left.
  const [rect, setRect] = useState(null);
  const boxRef = useRef(null);
  // The menu is not inside boxRef (it is a child of <body>): it needs its own
  // ref, or a press on an option would count as a press outside.
  const menuRef = useRef(null);

  const place = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Gone from view — off the window, or scrolled out of a clipping ancestor
    // (the task window's own scroller): nothing left to point at.
    const offScreen = r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth;
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body && !clipped; p = p.parentElement) {
      const cs = window.getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const pr = p.getBoundingClientRect();
      clipped = r.bottom <= pr.top || r.top >= pr.bottom || r.right <= pr.left || r.left >= pr.right;
    }
    if (offScreen || clipped) {
      setOpen(false);
      return;
    }
    const below = window.innerHeight - r.bottom;
    const wanted = items.length * 40 + 8;
    const up = below < Math.min(wanted, 200) && r.top > below;
    const width = Math.min(Math.max(r.width, 176), window.innerWidth - 16);
    setRect({
      width,
      left: Math.max(8, Math.min(r.left, window.innerWidth - 8 - width)),
      // Clamped: a chip scrolled up past the top must not drag the menu off-screen.
      top: up ? undefined : Math.max(8, r.bottom + 6),
      bottom: up ? Math.max(8, window.innerHeight - r.top + 6) : undefined,
      maxHeight: Math.max(140, (up ? r.top : below) - 16),
    });
  }, [items.length]);

  // Before paint, so the first frame is already in place.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const inside = (t) => boxRef.current?.contains(t) || menuRef.current?.contains(t);
    const onDown = (e) => {
      if (!inside(e.target)) setOpen(false);
    };
    // A keyboard user tabbing away, or Enter on another control (no mousedown).
    const onFocus = (e) => {
      if (!inside(e.target)) setOpen(false);
    };
    // On the window, in the capture phase: ahead of the dialog's own Escape
    // (on the document), so closing this menu does not close the task window
    // — and whatever was half-typed in the composer — with it.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      boxRef.current?.querySelector('button')?.focus();
    };
    // Capture, so a scroll inside any container the chip sits in is followed.
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('focusin', onFocus);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  if (!items.length) {
    return (
      <span className={clsx(CHIP, 'min-h-[26px]', className)} style={style} title={title}>
        {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
        {label}
      </span>
    );
  }
  return (
    <span ref={boxRef} className="relative inline-flex">
      <button type="button" onClick={() => setOpen((v) => !v)} title={title} aria-haspopup="listbox" aria-expanded={open} className={clsx(CHIP, 'min-h-[32px] cursor-pointer', className)} style={style}>
        {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
        {label}
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
      </button>
      {/* z-[60]: over the task window (z-50), under the people picker's list (z-[70]). */}
      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="fixed z-[60] overflow-auto rounded-xl border border-line bg-card py-1 shadow-pop"
            style={{ left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width, maxHeight: rect.maxHeight }}
          >
            {items.map((it) => (
              <button
                key={it.key}
                type="button"
                role="option"
                aria-selected={current === it.key}
                onClick={() => {
                  setOpen(false);
                  onPick?.(it.key);
                }}
                className="flex min-h-[40px] w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-well"
              >
                <span className={clsx(CHIP, 'min-h-[26px]', it.className)} style={it.style}>
                  {it.label}
                </span>
                {current === it.key && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-faint" />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </span>
  );
}

/** "How far along are you?" — declared by the doer; above 0 also starts it. */
function ProgressPanel({ task, can, accent, onSaved }) {
  const saved = clampProgress(can.myProgress ?? task.progress ?? 0);
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(saved), [saved]);

  const commit = async (next) => {
    const pct = clampProgress(next);
    setValue(pct);
    if (pct === saved) return;
    setBusy(true);
    try {
      await T.setProgress(task._id, pct);
      onSaved?.();
    } catch (err) {
      setValue(saved);
      toast.error(err.message || 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={clsx(CARD, 'px-4 py-4 sm:px-5')}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={SECTION}>
          <TrendingUp className="h-3 w-3" /> How far along are you?
        </h2>
        <span className="tnum text-sm font-semibold" style={{ color: accent.solid }}>
          {value}%{busy && <span className="ml-1 text-[11px] font-normal text-ink-faint">saving…</span>}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => commit(Number(e.currentTarget.value))}
        className="mt-3 w-full cursor-pointer accent-brand"
        aria-label="Progress"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PROGRESS_STEPS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => commit(step)}
            aria-pressed={value === step}
            className={clsx('min-h-[32px] rounded-xl border px-3 text-xs font-medium transition', value === step ? 'border-brand bg-brand text-on-brand' : 'border-line bg-card text-slate-600 hover:border-slate-300')}
          >
            {step}%
          </button>
        ))}
      </div>
    </section>
  );
}

function FeedRow({ update, task, me, onOpenFile, tz }) {
  const words = FEED_WORDS[update.kind] || FEED_WORDS.COMMENT;
  const Icon = words.icon;
  const mine = idOf(update.by) === String(me || '');
  const moved = Boolean(update.to) && update.kind !== 'CREATED';
  const name = update.byName || personName(update.by) || 'System';
  return (
    <li className={clsx('flex gap-2.5', update.system && 'opacity-60')}>
      {update.system ? (
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-ink-soft" title={name} aria-hidden>
          <Icon className="h-3 w-3" />
        </span>
      ) : (
        <Avatar person={update.by} name={name} sizeClass="h-7 w-7 text-[10px]" tone={mine ? 'brand' : 'plain'} className="mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-sm font-medium text-ink">{mine ? 'You' : name}</span>
          {words.says && <span className="text-xs text-ink-soft">{words.says}</span>}
          {moved && <StatusChip status={update.to} />}
          <Icon className={clsx('h-[11px] w-[11px] shrink-0', words.tone)} />
          <span className="text-[11px] text-ink-faint">{whenLine(update.createdAt, tz)}</span>
        </div>
        {update.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{update.note}</p>}
        {update.kind === 'EDITED' && (update.changes || []).length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {update.changes.map((c, i) => (
              <li key={`${c.field}-${i}`} className="rounded-lg bg-well px-2.5 py-1.5 text-xs">
                <span className="font-semibold text-ink-faint">{c.label || c.field}: </span>
                <span className="text-ink-faint line-through">{c.before || '—'}</span> <ArrowRight className="inline h-3 w-3 text-ink-faint" /> <span className="font-medium text-ink">{c.after || '—'}</span>
              </li>
            ))}
          </ul>
        )}
        {(update.voiceNote?.storagePath || update.voiceNote?.url) && (
          <VoicePlayer className="mt-2" src={voiceSrc(update.voiceNote)} path={T.updateVoiceUrl(task._id, update._id)} durationMs={update.voiceNote.durationMs} />
        )}
        {update.files?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {update.files.map((f) => (
              <button
                key={f._id || f.id || f.name}
                type="button"
                onClick={() => onOpenFile(f)}
                className="inline-flex min-h-[32px] max-w-full items-center gap-1 rounded-lg border border-line px-2 text-[11px] text-ink-soft transition hover:border-slate-300 hover:text-brand"
              >
                <Paperclip className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function TaskDetailBody({ taskId, initialEdit = false, onChanged, onOpenTask, onGone, className }) {
  const tz = useTz();
  const me = useMeId();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const invalidate = useInvalidateTasks();
  const { data: meta } = useTaskMeta();

  const q = useQuery({
    queryKey: ['task', String(taskId)],
    queryFn: () => T.getTask(taskId),
    enabled: Boolean(taskId),
    retry: (n, err) => err?.status !== 404 && err?.status !== 403 && n < 2,
  });
  const task = q.data?.task || null;
  const children = q.data?.children || [];
  const updates = useMemo(() => q.data?.updates || [], [q.data]);
  const can = q.data?.can || task?.can || { transitions: [] };

  const [tab, setTab] = useState('comment');
  const [note, setNote] = useState('');
  const [voice, setVoice] = useState(null);
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [titling, setTitling] = useState(false);
  const [savingField, setSavingField] = useState('');
  const [editing, setEditing] = useState(false);
  const [extension, setExtension] = useState(null);
  const [delegating, setDelegating] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [nudgedAt, setNudgedAt] = useState(null);
  const noteRef = useRef(null);
  const titleRef = useRef(null);
  const fileRef = useRef(null);
  const imageRef = useRef(null);
  const feedRef = useRef(null);
  const appliedEdit = useRef(false);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab, updates]);

  // A 404 means it is gone (or never ours to see): tell, and leave.
  const goneRef = useRef(onGone);
  goneRef.current = onGone;
  useEffect(() => {
    if (q.error?.status === 404) {
      toast.error(q.error.message || 'That task no longer exists.');
      goneRef.current?.();
    }
  }, [q.error]);

  useEffect(() => {
    appliedEdit.current = false;
    setAnswer(null);
    setNote('');
    setVoice(null);
    setFiles([]);
    setTab('comment');
    setEditing(false);
  }, [taskId]);

  // Invalidating ['task', id] refetches this task; ['tasks'] the lists behind it.
  const refresh = useCallback(async () => {
    invalidate(taskId);
    onChanged?.();
  }, [invalidate, taskId, onChanged]);

  // ===== The composer =====
  const ask = useCallback((next) => {
    if (!next) return;
    setAnswer(next);
    setTab('comment');
    setTimeout(() => noteRef.current?.focus(), 60);
  }, []);

  const answerFor = useCallback(
    (to) => {
      if (!to) return null;
      if (to === STATUS.SUBMITTED && can.canSubmit) return { key: 'submit', to, title: 'Handing this in', verb: 'Submit', tone: 'send', needs: 'Say what you did before handing this in — a voice note counts.' };
      if (to === STATUS.COMPLETED && can.canApprove) return { key: 'approve', to, title: 'Approving this', verb: 'Approve', tone: 'go', needs: 'Say a word about what you are approving.' };
      if (to === STATUS.IN_PROGRESS && can.canReject && task?.status === STATUS.SUBMITTED) return { key: 'reject', to, title: 'Sending this back', verb: 'Send back', tone: 'warn', needs: 'Say what needs doing before sending this back.' };
      if (!(can.transitions || []).some((t) => t.to === to)) return null;
      const verb =
        {
          [STATUS.CANCELLED]: 'Cancel it',
          [STATUS.PENDING]: can.canWithdraw ? 'Withdraw it' : 'Put it back',
          [STATUS.COMPLETED]: can.canDone ? 'Mark done' : 'Mark complete',
          [STATUS.IN_PROGRESS]: isTerminal(task?.status) ? 'Reopen it' : task?.status === STATUS.PENDING ? 'Start it' : 'Move it along',
          [STATUS.SUBMITTED]: 'Send for review',
        }[to] || statusLabel(to);
      return { key: 'status', to, verb, title: `${verb} — ${statusLabel(to).toLowerCase()}`, tone: to === STATUS.CANCELLED ? 'danger' : to === STATUS.COMPLETED ? 'go' : 'ghost', needs: 'Add a note (or a voice note) explaining this change.' };
    },
    [can, task]
  );

  const clearComposer = () => {
    setNote('');
    setVoice(null);
    setFiles([]);
    setAnswer(null);
  };

  const send = async () => {
    const said = note.trim();
    if (answer && !said && !voice) {
      toast.error(answer.needs);
      noteRef.current?.focus();
      return;
    }
    if (!answer && !said && !voice && !files.length) {
      toast.error('Write something, record something, or attach a file.');
      return;
    }
    setSending(true);
    try {
      const payload = { note: said, voice: voice || undefined, files };
      let res = null;
      if (!answer) res = await T.addUpdate(task._id, payload);
      else if (answer.key === 'submit') res = await T.submitTask(task._id, payload);
      else if (answer.key === 'approve') res = await T.approveTask(task._id, payload);
      else if (answer.key === 'reject') res = await T.rejectTask(task._id, payload);
      else res = await T.changeStatus(task._id, answer.to, payload);
      if (res?.unchanged) toast.info('That was already done.');
      else if (!answer) toast.success('Added.');
      else if (answer.key === 'submit') toast.success('Handed in — it is in review now.');
      else if (answer.key === 'reject') toast.success('Sent back.');
      else if (answer.key === 'approve') toast.success('Approved.');
      else toast.success(`Marked ${statusLabel(res?.task?.status || answer.to).toLowerCase()}.`);
      clearComposer();
      await refresh();
      feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
    } catch (err) {
      toast.error(err.message || 'Could not save that.');
    } finally {
      setSending(false);
    }
  };

  // ===== Answers that do not need the composer =====
  const accept = async () => {
    try {
      await T.acceptTask(task._id, note.trim() || undefined);
      toast.success('Accepted — it is on your plate now.');
      clearComposer();
      refresh();
    } catch (err) {
      toast.error(err.message || 'Could not accept that task.');
    }
  };

  const decline = async () => {
    const why = await prompt({ title: 'Can’t take this on?', text: 'Say why, so it can go to somebody else. They will see this.', label: 'Reason', placeholder: 'e.g. I am away from Thursday', required: true, requiredText: 'Say why — the other person has nothing else to go on.', confirmLabel: 'Decline', tone: 'danger' });
    if (!why) return;
    try {
      await T.declineTask(task._id, why);
      toast.success('Declined. Whoever gave it has been told.');
      refresh();
    } catch (err) {
      toast.error(err.message || 'Could not decline that task.');
    }
  };

  const claim = async () => {
    if (!(await confirm({ title: 'Take this piece on?', text: 'It becomes yours, and nobody else can pick it up.', confirmLabel: 'Take it on', tone: 'primary' }))) return;
    try {
      await T.claimTask(task._id);
      toast.success('It is yours.');
      refresh();
    } catch (err) {
      toast.error(err.message || 'Could not pick that up.');
    }
  };

  const remove = async (purge = false) => {
    const yes = await confirm({
      title: purge ? 'Delete this task for good?' : 'Remove this task?',
      text: purge ? 'The task and its whole history are erased. This cannot be undone.' : 'It disappears from every list. Its history stays on file.',
      confirmLabel: purge ? 'Delete for good' : 'Remove',
    });
    if (!yes) return;
    try {
      const res = await T.deleteTask(task._id, { purge });
      toast.success(res?.message || (purge ? 'Deleted.' : 'Removed.'));
      invalidate(task._id);
      onChanged?.(null);
      onGone?.();
    } catch (err) {
      toast.error(err.message || 'Could not remove that task.');
    }
  };

  const patch = async (body, field) => {
    setSavingField(field);
    try {
      const res = await T.updateTask(task._id, body);
      const n = (res?.changes || []).length;
      if (n) toast.success(`Saved — ${n} change${n === 1 ? '' : 's'} added to the edit history.`);
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Could not save that change.');
    } finally {
      setSavingField('');
    }
  };

  const saveTitle = async () => {
    const next = (titleRef.current?.value || '').trim();
    setTitling(false);
    if (!next || next === task.title) return;
    await patch({ title: next }, 'title');
  };

  // "Edit task" from a row: open the editor once it is in — if still allowed.
  useEffect(() => {
    if (!task || !initialEdit || appliedEdit.current) return;
    appliedEdit.current = true;
    if (can.canEdit) setEditing(true);
    else toast.info(can.editLocked || 'This task can no longer be edited.');
  }, [task, can, initialEdit]);

  const onOpenFile = async (f) => {
    try {
      await openFile(fileTarget(task._id, f));
    } catch {
      toast.error('That file could not be opened.');
    }
  };

  const statusMoves = useMemo(() => (can.transitions || []).map((t) => ({ key: t.to, label: t.label || statusLabel(t.to), className: statusStyle(t.to) })), [can.transitions]);

  /* The buttons, in the HRMS's order: the answers, then the hand-offs, then
     whatever moves are left, then editing and removing. */
  const actions = useMemo(() => {
    if (!task) return [];
    const out = [];
    const add = (key, label, icon, tone, run, title) => out.push({ key, label, icon, tone, run, title });
    if (can.canAccept) add('accept', 'Accept', ThumbsUp, 'go', accept, 'Take it on — this also starts it');
    if (can.canDecline) add('decline', 'Decline', ThumbsDown, 'danger', decline, 'Say why you cannot');
    if (can.canSubmit) add('submit', 'Submit', Send, 'send', () => ask(answerFor(STATUS.SUBMITTED)), 'Hand it in for review');
    if (can.canApprove) add('approve', 'Approve', Check, 'go', () => ask(answerFor(STATUS.COMPLETED)), 'Sign it off');
    if (can.canReject) add('reject', 'Send back', RotateCcw, 'warn', () => ask(answerFor(STATUS.IN_PROGRESS)), 'Reopen it with what still needs doing');
    if (can.canRequestExtension) add('extend', 'Ask for more time', Clock, 'ghost', () => setExtension({ mode: 'ask' }), 'Ask to move the deadline');
    if (can.canDelegate || can.canSplit) add('delegate', can.canDelegate ? 'Delegate' : 'Split into pieces', can.canDelegate ? CornerUpRight : GitBranch, 'ghost', () => setDelegating(true), 'Hand it on or split it — you review the work');
    if (can.canTransfer) add('transfer', 'Transfer', Users, 'ghost', () => setTransferring(true), 'It went to the wrong person');
    if (can.canClaim) add('claim', 'Claim', UserCheck, 'go', claim, 'Nobody is named on this piece');
    if (can.canDone) add('done', 'Mark done', CheckCircle2, 'go', () => ask(answerFor(STATUS.COMPLETED)), 'Today’s routine is finished');

    const covered = new Set();
    if (can.canSubmit) covered.add(STATUS.SUBMITTED);
    if (can.canApprove || can.canDone) covered.add(STATUS.COMPLETED);
    if (can.canAccept || (can.canReject && task.status === STATUS.SUBMITTED)) covered.add(STATUS.IN_PROGRESS);
    for (const move of can.transitions || []) {
      if (covered.has(move.to)) continue;
      const done = isTerminal(task.status);
      const label =
        move.to === STATUS.CANCELLED
          ? 'Cancel it'
          : done
            ? 'Reopen'
            : move.to === STATUS.PENDING
              ? can.canWithdraw
                ? 'Withdraw submission'
                : 'Put back to pending'
              : move.to === STATUS.COMPLETED
                ? 'Mark complete'
                : move.to === STATUS.IN_PROGRESS && task.status === STATUS.PENDING
                  ? 'Start'
                  : statusLabel(move.to);
      const icon = move.to === STATUS.CANCELLED ? Slash : move.to === STATUS.COMPLETED ? Check : move.to === STATUS.IN_PROGRESS && !done ? Play : RotateCcw;
      add(`move-${move.to}`, label, icon, move.to === STATUS.CANCELLED ? 'danger' : move.to === STATUS.COMPLETED ? 'go' : 'ghost', () => ask(answerFor(move.to)));
    }
    if (can.canEdit) add('edit', 'Edit', Pencil, 'ghost', () => setEditing(true), 'Change the details while the terms are open');
    if (can.canDelete) add('remove', 'Remove', Trash2, 'danger', () => remove(false), 'Archive it');
    if (can.canPurge) add('purge', 'Delete for good', AlertTriangle, 'danger', () => remove(true), 'Super Admin only');
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, can, answerFor, ask, note]);

  // ===== The feed, three ways =====
  const comments = useMemo(
    () =>
      updates.filter((u) => {
        const kind = u.kind || 'COMMENT';
        const hasVoice = Boolean(u.voiceNote?.storagePath || u.voiceNote?.url);
        const spoke = Boolean(String(u.note || '').trim()) || hasVoice || (u.files || []).length > 0;
        if (!spoke || kind === 'EDITED') return false;
        if (MACHINE_SAID.has(kind)) return hasVoice || (u.files || []).length > 0;
        return true;
      }),
    [updates]
  );
  const attachments = useMemo(() => {
    const own = (task?.attachments || []).map((f) => ({ ...f, from: 'task' }));
    const fromFeed = updates.flatMap((u) => (u.files || []).map((f) => ({ ...f, uploadedByName: f.uploadedByName || u.byName, uploadedAt: f.uploadedAt || u.createdAt })));
    const seen = new Set();
    return [...own, ...fromFeed]
      .filter((f) => {
        // A file handed in with a remark is also on the task: same stored file, different row.
        const k = String(f.file || f.storagePath || f._id || f.id || f.name);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
  }, [task, updates]);
  const edits = useMemo(() => updates.filter((u) => u.kind === 'EDITED' && (u.changes || []).length > 0), [updates]);

  // ===== Drawing =====
  if (q.isLoading) {
    return (
      <div className={clsx('grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]', className)}>
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-12 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  if (!task) {
    return (
      <div className={clsx('rounded-2xl border border-red-200 bg-red-50 p-6 text-center', className)}>
        <AlertCircle className="mx-auto mb-3 h-7 w-7 text-red-500" />
        <p className="text-sm font-medium text-red-800">{q.error?.message || 'Could not open that task.'}</p>
        <p className="mt-1 font-mono text-[11px] text-red-500">
          {q.error?.status ? `HTTP ${q.error.status} · ` : ''}
          {String(taskId || '—')}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={() => q.refetch()} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700">
            <RotateCcw className={ICON} /> Try again
          </button>
          {onGone && (
            <button type="button" onClick={onGone} className="min-h-[36px] rounded-xl border border-red-200 bg-card px-4 text-sm font-medium text-red-700 transition hover:bg-red-100">
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  const accent = accentFor(task);
  const pending = (task.extensions || []).filter((e) => e.status === 'PENDING');
  const decided = (task.extensions || []).filter((e) => e.status !== 'PENDING');
  const parentId = idOf(task.parentTask);
  const team = teamNameOf(task);
  const setterName = task.createdByName || personName(task.createdBy) || '—';
  const reviewerName = task.approverName || setterName;
  const repeats = task.repeat?.frequency && task.repeat.frequency !== 'ONCE';
  const priority = priorityColor(task.priority);

  return (
    <div className={clsx('grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_26rem]', className)}>
      {/* ══════ LEFT: the task ══════ */}
      <div className="min-w-0 space-y-4">
        {/* ── Header ── */}
        <section className="overflow-hidden rounded-2xl shadow-card" style={accentStyle(task)}>
          <div className="px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
              <span className="font-semibold tracking-wide" style={{ color: accent.ink }}>
                {task.code || 'Task'}
              </span>
              {parentId && (
                <button type="button" onClick={() => onOpenTask?.(parentId)} className="veil inline-flex min-h-[24px] items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium text-ink-soft transition hover:text-brand" title="Open the task this is a piece of">
                  <GitBranch className="h-[11px] w-[11px]" /> part of {task.parentCode || task.parentTitle || 'a bigger task'}
                </button>
              )}
              {team && (
                <span className="inline-flex items-center gap-1 text-ink-soft">
                  <Users className="h-[11px] w-[11px]" /> {team}
                </span>
              )}
              {repeats && (
                <span className="inline-flex items-center gap-1 text-ink-soft">
                  <Repeat className="h-[11px] w-[11px]" /> {repeatLabel(task.repeat)}
                </span>
              )}
              {q.isFetching && <span className="text-ink-faint">updating…</span>}
            </div>

            {titling ? (
              <input
                ref={titleRef}
                defaultValue={task.title}
                autoFocus
                maxLength={300}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setTitling(false);
                  }
                }}
                className="mt-1.5 w-full rounded-xl border border-line bg-card px-3 py-1.5 text-xl font-semibold text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 sm:text-2xl"
                aria-label="Task title"
              />
            ) : (
              <h1
                // `hover-veil`, never a see-through card colour: on a dark wash that painted a navy slab.
                className={clsx('mt-1.5 break-words text-xl font-semibold leading-snug text-ink sm:text-2xl', can.canEdit && 'hover-veil -mx-1 cursor-text rounded-xl px-1 transition-colors')}
                onClick={() => can.canEdit && setTitling(true)}
                title={can.canEdit ? 'Click to rename' : undefined}
              >
                {task.title}
                {savingField === 'title' && <span className="ml-2 text-xs font-normal text-ink-soft">saving…</span>}
              </h1>
            )}

            {/* One meta row: its state, how much it matters, when it is due, how far along. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <MenuChip
                label={task.declined ? 'Declined' : task.awaitingAcceptance && task.status === STATUS.PENDING ? 'Not accepted yet' : statusLabel(task.status)}
                className={statusStyle(task.declined ? 'DECLINED' : task.status)}
                items={statusMoves}
                onPick={(key) => ask(answerFor(key))}
                title="Move this task"
              />
              <MenuChip
                label={priority.key}
                style={tintStyle(priority)}
                dot={priority.solid}
                items={can.canEdit ? TASK_PRIORITY.map((p) => ({ key: p, label: p, style: tintStyle(priorityColor(p)) })) : []}
                current={priority.key}
                onPick={(p) => p !== priority.key && patch({ priority: p }, 'priority')}
                title={can.canEdit ? 'Change the priority' : 'Priority'}
              />
              <OverdueChip task={task} />
              {/* One or the other: a late task's due chip would say "overdue" twice. */}
              {!isOverdue(task) && <DueChip task={task} />}
              <PiecesChip task={task} />
              <TransferredChip task={task} />
              {Number(task.progress) > 0 && <ProgressBar task={task} className="min-w-[7rem]" />}
              {/* The bell, and under it WhatsApp for people who agreed to it (invite links). */}
              <span className="ml-auto flex flex-col items-end gap-1.5">
                <NudgeBell
                  task={{ ...task, can }}
                  override={nudgedAt}
                  labelled
                  cooldownMin={meta?.nudgeCooldownMin}
                  onNudged={(_id, at) => {
                    setNudgedAt(at);
                    refresh();
                  }}
                />
                <WhatsAppNudge task={{ ...task, can }} />
              </span>
            </div>
          </div>
        </section>

        {/* ── The answer buttons ── */}
        {actions.length > 0 && (
          <section className={clsx(CARD, 'px-4 py-3 sm:px-5')}>
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <button key={a.key} type="button" onClick={a.run} title={a.title} className={clsx(BTN, TONES[a.tone])}>
                  <a.icon className={ICON} /> {a.label}
                </button>
              ))}
            </div>
            {can.canAccept && edits.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-slate-700">Edited {edits.length === 1 ? 'once' : `${edits.length} times`} since it was sent.</p>
            )}
            {!can.canEdit && can.editLocked && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-soft">
                <Lock className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" /> {can.editLocked}
              </p>
            )}
          </section>
        )}

        {/* ── Edit history ── */}
        {edits.length > 0 && (
          <section className={clsx(CARD, 'px-4 py-3 sm:px-5')}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Pencil className="h-3.5 w-3.5 text-ink-faint" /> Edit history
              </h2>
              <span className="text-xs text-ink-faint">
                {edits.length} edit{edits.length === 1 ? '' : 's'}
              </span>
            </div>
            <ol className="space-y-3">
              {edits.map((u) => (
                <li key={u._id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                  <p className="text-xs text-ink-soft">
                    <span className="font-semibold text-ink">{u.byName || personName(u.by) || 'Somebody'}</span> · {dateTimeLabel(u.createdAt, tz)}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {(u.changes || []).map((c, i) => (
                      <li key={`${u._id}-${c.field}-${i}`} className="rounded-xl bg-well px-3 py-2">
                        <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">{c.label || c.field}</p>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                          <span className="min-w-0 break-words text-ink-faint line-through">{c.before || '—'}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 self-center text-ink-faint" />
                          <span className="min-w-0 break-words font-medium text-ink">{c.after || '—'}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Everybody on it said no: the reasons, where the setter will see them ── */}
        {task.declined && (
          <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-red-800">
              <AlertTriangle className="h-3.5 w-3.5" /> Nobody has taken this on
            </p>
            <ul className="mt-1.5 space-y-1">
              {(task.assignees || [])
                .filter((a) => a.acceptance === 'REJECTED')
                .map((a) => (
                  <li key={a._id || idOf(a.user)} className="text-xs text-red-700">
                    <strong className="font-semibold">{a.name || personName(a.user)}:</strong> {a.declineReason || 'no reason given'}
                  </li>
                ))}
            </ul>
          </section>
        )}

        {/* ── Progress ── */}
        {can.canSetProgress && <ProgressPanel task={task} can={can} accent={accent} onSaved={refresh} />}

        {/* ── What was asked for ── */}
        {(task.description || task.voiceNote?.storagePath || task.voiceNote?.url || task.links?.length > 0) && (
          <section className={clsx(CARD, 'px-4 py-4 sm:px-5')}>
            <h2 className={SECTION}>
              <MessageSquare className="h-3 w-3" /> What was asked for
            </h2>
            {task.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{task.description}</p>}
            {(task.voiceNote?.storagePath || task.voiceNote?.url) && (
              <div className="mt-3">
                <p className="mb-1 text-xs text-ink-soft">Voice note from {task.voiceNote.recordedByName || setterName}</p>
                <VoicePlayer src={voiceSrc(task.voiceNote)} path={T.taskVoiceUrl(task._id)} durationMs={task.voiceNote.durationMs} />
              </div>
            )}
            {task.links?.length > 0 && (
              <ul className="mt-3 space-y-1">
                {task.links.map((l, i) => (
                  <li key={l._id || `${l.url}-${i}`}>
                    <a href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1.5 text-xs text-brand hover:underline">
                      <Link2 className="h-3 w-3 shrink-0" /> <span className="truncate">{l.label || l.url}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── The facts ── */}
        <section className={clsx(CARD, 'px-4 py-4 sm:px-5')}>
          <h2 className={SECTION}>
            <Flag className="h-3 w-3" /> Details
          </h2>
          <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Fact icon={User} label="Given by">
              {setterName}
              {(task.onBehalf?.byName || task.onBehalf?.by) && <span className="block text-[11px] text-ink-faint">Sent by {task.onBehalf.byName || personName(task.onBehalf.by)} on their behalf</span>}
            </Fact>
            <Fact icon={Eye} label="Reviewed by">
              {task.requiresApproval === false ? 'No review — finishing completes it' : reviewerName}
              {task.approverName && task.approverName !== setterName && <span className="block text-[11px] text-ink-faint">took it on when the task was delegated</span>}
            </Fact>
            <Fact icon={Users} label="Assigned to">
              {(task.assignees || []).length === 0 ? (
                <>Nobody yet — open for {(task.openTo || []).map(personName).filter(Boolean).join(', ') || 'organization members'} to pick up</>
              ) : (
                <ul className="space-y-1">
                  {task.assignees.map((a) => (
                    <li key={a._id || idOf(a.user)} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                      <span className="truncate">
                        {a.name || personName(a.user)}
                        {idOf(a.user) === String(me) && <span className="ml-1 text-[11px] text-ink-faint">(you)</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-faint">
                        {a.acceptance === 'REJECTED' ? 'declined' : a.acceptance === 'AWAITING' ? 'not yet accepted' : statusLabel(a.status).toLowerCase()}
                        {Number(a.progress) > 0 && a.status !== STATUS.COMPLETED && ` · ${clampProgress(a.progress)}%`}
                        {a.completedLate && ' · late'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Fact>
            {task.loopUsers?.length > 0 && (
              <Fact icon={Eye} label="In the loop">
                {task.loopUsers.map(personName).filter(Boolean).join(', ')}
              </Fact>
            )}
            {task.startDate && (
              <Fact icon={CalendarDays} label="Starts">
                {dateTimeLabel(task.startDate, tz)}
              </Fact>
            )}
            <Fact icon={CalendarDays} label="Deadline">
              <span title={task.dueDate ? dateTimeLabel(task.dueDate, tz) : undefined}>
                <DueChip task={task} />
              </span>
              {task.extensionCount > 0 && (
                <span className="block text-[11px] text-amber-600">
                  moved {task.extensionCount}× · first set for {dayLabel(task.originalDueDate, tz)}
                </span>
              )}
            </Fact>
            <Fact icon={Tag} label="Category">
              {task.category || '—'}
            </Fact>
            {repeats && (
              <Fact icon={Repeat} label="Repeats">
                {repeatLabel(task.repeat)}
              </Fact>
            )}
            {task.completedAt && (
              <Fact icon={CheckCircle2} label="Finished">
                <span className={task.completedLate ? 'text-orange-600' : 'text-green-600'}>
                  {dateTimeLabel(task.completedAt, tz)}
                  {task.completedLate ? ' · late' : ' · in time'}
                </span>
              </Fact>
            )}
            <Fact icon={Clock} label="Set">
              {whenLine(task.createdAt, tz) || '—'}
            </Fact>
            {task.reminders?.length > 0 && (
              <Fact icon={Bell} label="Reminders">
                {task.reminders.map((r, i) => (
                  <span key={i} className="block text-[11px] text-ink-soft">
                    {r.channel === 'EMAIL' ? 'Email' : 'App'} · {reminderLabel(r)}
                  </span>
                ))}
              </Fact>
            )}
          </div>
        </section>

        {/* ── The pieces ── */}
        <ChildTaskList children={children} onChanged={refresh} onOpen={onOpenTask} />

        {/* ── More time ── */}
        {(pending.length > 0 || decided.length > 0) && (
          <section className={clsx(CARD, 'px-4 py-4 sm:px-5')}>
            <h2 className={SECTION}>
              <Clock className="h-3 w-3" /> More time
            </h2>
            {pending.map((e) => (
              <div key={e._id} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-sm font-medium text-amber-900">
                  {e.requestedByName || 'Somebody'} asked to move the deadline to {dateTimeLabel(e.toDate, tz)}
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  {e.fromDate ? `From ${dayLabel(e.fromDate, tz)} · ` : ''}asked {timeAgo(e.requestedAt, tz)}
                </p>
                {e.reason && <p className="mt-1.5 whitespace-pre-wrap text-sm text-amber-900">{e.reason}</p>}
                {can.canDecideExtension ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setExtension({ mode: 'decide', requestId: String(e._id), approve: true })} className={clsx(BTN, TONES.go)}>
                      <Check className={ICON} /> Give the time
                    </button>
                    <button type="button" onClick={() => setExtension({ mode: 'decide', requestId: String(e._id), approve: false })} className={clsx(BTN, TONES.ghost)}>
                      <XCircle className={ICON} /> Decline
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-amber-700">Waiting on {reviewerName}.</p>
                )}
              </div>
            ))}
            {decided.length > 0 && (
              <ul className="mt-3 space-y-2">
                {decided.map((e) => (
                  <li key={e._id} className="flex gap-2 text-xs">
                    <span className={clsx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', e.status === 'APPROVED' ? 'bg-green-500' : 'bg-slate-300')} />
                    <span className="min-w-0 flex-1 text-ink-soft">
                      <span className="text-slate-700">{e.requestedByName || 'Somebody'}</span> asked for {dayLabel(e.fromDate, tz)} → {dayLabel(e.toDate, tz)} ·{' '}
                      <span className={e.status === 'APPROVED' ? 'text-green-600' : 'text-ink-soft'}>{e.status === 'APPROVED' ? 'granted' : 'refused'}</span>
                      {e.decidedByName ? ` by ${e.decidedByName}` : ''}
                      {e.decidedAt ? ` · ${dayLabel(e.decidedAt, tz)}` : ''}
                      {e.reason && <span className="block">“{e.reason}”</span>}
                      {e.decisionNote && <span className="block">— {e.decisionNote}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Hand-overs: passed on (still answerable as reviewer) or moved off completely ── */}
        {(task.delegations?.length > 0 || task.transfers?.length > 0) && (
          <section className={clsx(CARD, 'px-4 py-4 sm:px-5')}>
            <h2 className={SECTION}>
              <CornerUpRight className="h-3 w-3" /> Hand-overs
            </h2>
            <ul className="mt-2.5 space-y-2">
              {(task.delegations || []).map((d, i) => (
                <li key={d._id || `d-${i}`} className="text-xs text-ink-soft">
                  <span className="mr-1.5 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-px text-[10.5px] font-medium text-blue-700">delegated</span>
                  <span className="text-slate-700">{d.fromName || personName(d.from) || 'Somebody'}</span>
                  <span className="text-ink-faint"> → </span>
                  <span className="text-slate-700">{d.toName || personName(d.to) || 'somebody'}</span>
                  {d.at ? <span className="text-ink-faint"> · {dayLabel(d.at, tz)}</span> : null}
                  {d.note && <span className="block">{d.note}</span>}
                </li>
              ))}
              {(task.transfers || []).map((t, i) => (
                <li key={t._id || `t-${i}`} className="text-xs text-ink-soft">
                  <span className="mr-1.5 rounded-md border border-line bg-well px-1.5 py-px text-[10.5px] font-medium text-ink-soft">transferred</span>
                  <span className="text-slate-700">{t.fromName || 'Somebody'}</span>
                  <span className="text-ink-faint"> → </span>
                  <span className="text-slate-700">{t.toName || 'somebody else'}</span>
                  {t.byName ? <span className="text-ink-faint"> · by {t.byName}</span> : null}
                  {t.at ? <span className="text-ink-faint"> · {dayLabel(t.at, tz)}</span> : null}
                  {t.reason && <span className="block">{t.reason}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ══════ RIGHT: the talk ══════ */}
      <aside className="min-w-0">
        <div className={clsx(CARD, 'flex flex-col overflow-hidden lg:sticky lg:top-4')}>
          <div className="flex shrink-0 items-center gap-1 border-b border-line px-2" role="tablist">
            {[
              ['comment', 'Comment', MessageSquare, comments.length],
              ['files', 'Files', Paperclip, attachments.length],
              ['activity', 'Activity', Activity, updates.length],
            ].map(([key, label, Icon, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                // Weight and border on the base class: picking a tab must not shift the strip.
                className={clsx('inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 border-b-2 px-1.5 text-xs font-semibold transition sm:gap-1.5 sm:px-2', tab === key ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:text-ink')}
              >
                <Icon className="h-[13px] w-[13px] shrink-0" /> {label}
                {count > 0 && <span className="text-[11px] font-normal text-ink-faint">{count}</span>}
              </button>
            ))}
          </div>

          <div ref={feedRef} className="max-h-[calc(var(--vv-h,100vh)*0.52)] min-h-[10rem] flex-1 overflow-y-auto px-4 py-3">
            {tab === 'files' ? (
              attachments.length === 0 ? (
                <Empty>Nothing has been attached yet.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {attachments.map((f) => (
                    <li key={f._id || f.id || f.name}>
                      <button type="button" onClick={() => onOpenFile(f)} className="flex min-h-[40px] w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left text-xs transition hover:border-slate-300">
                        <Paperclip className="h-[13px] w-[13px] shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-slate-700">{f.name}</span>
                          <span className="block truncate text-[11px] text-ink-faint">{[f.uploadedByName, sizeLabel(f.sizeBytes || f.size), f.uploadedAt ? timeAgo(f.uploadedAt, tz) : ''].filter(Boolean).join(' · ')}</span>
                        </span>
                        <Download className="h-[13px] w-[13px] shrink-0 text-ink-faint" />
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              (() => {
                // Oldest first: the composer is underneath, so the newest sits next to it.
                const rows = (tab === 'comment' ? comments : updates).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                if (!rows.length) return <Empty>{tab === 'comment' ? 'No remarks yet. Say something below.' : 'Nothing has happened yet.'}</Empty>;
                return (
                  <ol className="space-y-3">
                    {rows.map((u) => (
                      <FeedRow key={u._id} update={u} task={task} me={me} onOpenFile={onOpenFile} tz={tz} />
                    ))}
                  </ol>
                );
              })()
            )}
          </div>

          {/* ── The composer, pinned ── */}
          {can.canComment && (
            <div className="shrink-0 border-t border-line bg-well px-3 py-2.5">
              {answer && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-line bg-card px-2.5 py-2">
                  <Send className="h-[13px] w-[13px] shrink-0 text-brand" />
                  <span className="min-w-0 flex-1 text-xs font-semibold text-ink">{answer.title}</span>
                  <button type="button" onClick={() => setAnswer(null)} className="shrink-0 rounded-lg p-1 text-ink-faint hover:bg-slate-100 hover:text-ink" aria-label="Not that — just a remark">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <textarea
                ref={noteRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={answer ? 3 : 2}
                maxLength={5000}
                placeholder={answer ? 'What happened?' : 'Write a remark…'}
                className="block w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              {voice && (
                <div className="mt-2">
                  <VoiceRecorder value={voice} onChange={setVoice} />
                </div>
              )}
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-card px-2 py-1.5 text-xs">
                      <Paperclip className="h-3 w-3 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1 truncate text-ink-soft">{f.name}</span>
                      <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="shrink-0 text-ink-faint hover:text-red-600" aria-label={`Remove ${f.name}`}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Wraps on a phone only: the recorder's red bar would push Send out of the card. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
                {!voice && <VoiceRecorder value={voice} onChange={setVoice} compact />}
                <button type="button" onClick={() => imageRef.current?.click()} title="Attach an image" aria-label="Attach an image" className={ICON_BTN}>
                  <ImageIcon className="h-[15px] w-[15px]" />
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} title="Attach a file" aria-label="Attach a file" className={ICON_BTN}>
                  <Paperclip className="h-[15px] w-[15px]" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    setFiles((f) => [...f, ...(e.target.files || [])].slice(0, 10));
                    e.target.value = '';
                  }}
                />
                <input
                  ref={imageRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    setFiles((f) => [...f, ...(e.target.files || [])].slice(0, 10));
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending}
                  // The answer's own colour where it has one; a plain move and a plain remark are both "send".
                  className={clsx(BTN, 'ml-auto shrink-0 disabled:opacity-50', answer && (answer.tone === 'go' || answer.tone === 'warn' || answer.tone === 'danger') ? TONES[answer.tone === 'danger' ? 'warn' : answer.tone] : TONES.send)}
                >
                  <Send className={ICON} />
                  {sending ? 'Sending…' : answer ? answer.verb : 'Post'}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <ExtensionModal open={Boolean(extension)} onClose={() => setExtension(null)} task={task} can={can} mode={extension?.mode || 'ask'} requestId={extension?.requestId || null} initialApprove={extension?.approve} onDone={refresh} />
      <DelegateModal open={delegating} onClose={() => setDelegating(false)} task={task} meta={meta} can={can} onDone={refresh} />
      <TransferModal open={transferring} onClose={() => setTransferring(false)} task={task} meta={meta} onDone={refresh} />
      <AssignTaskModal open={editing} onClose={() => setEditing(false)} meta={meta} editTask={editing ? task : null} onCreated={refresh} />
    </div>
  );
}
