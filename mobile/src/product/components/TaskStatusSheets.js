/**
 * The status button's sheets: tapping the status on a task card lists what
 * THIS person may do to THIS task (taskStatus.statusActions, read off the
 * server's `can` only). Picking one then:
 *
 *   Approve on a new task (= accept) / Pick it up    happens at once
 *   Delegate / Transfer / Ask for more time          their own sheets
 *   everything else                                 a remark sheet
 *
 * The HRMS app's sheet (2026-10-08): the task and where it stands on top,
 * one line per move (no hint under it), "Ask for more time" as its own row
 * after the moves, then Edit task / Open task. ACCEPTING ASKS FOR NOTHING:
 * it happens at once, from here as from a swipe ("while accepting any task
 * no need to give reason", the HRMS user's call).
 *
 * The remark is required where somebody else cannot act without it (turning
 * a task down, sending work back); elsewhere an empty box sends a plain
 * default, unless the move came from a swipe and the server says a swipe
 * needs a remark (`meta.swipeRemarkRequired`).
 *
 * ONE SHEET AT A TIME: going from the list to the next sheet closes the one
 * and opens the other a beat later. Errors show in the sheet.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, font, radius, space } from '../../platform/theme';
import { BottomSheet, Button, Notice, toast } from '../../platform/ui';
import { acceptTask, approveTask, changeStatus, claimTask, declineTask, rejectTask, submitTask } from '../api';
import { ChevronDown, ChevronRight, ExternalLink, SquarePen } from '../icons';
import { REVIEW_COLORS, statusActions, statusBadge, statusColors } from '../taskStatus';
import { ActionIcon, actionIcon } from './actionIcons';
import DelegateSheet from './DelegateSheet';
import ExtensionSheet from './ExtensionSheet';
import TransferSheet from './TransferSheet';

const SWAP_MS = 260;
/** Long enough for the sheet to be up before the keyboard is asked for. */
const FOCUS_DELAY_MS = 300;

/** What each remark sheet says. No `defaultNote` means the remark is required. */
function copyFor(stage) {
  return {
    // For a caller that opens the sheet on 'accept' itself: the list and the
    // menu accept at once now, without asking.
    accept: {
      title: tr('Accept this task?'),
      body: tr('It moves to In progress, and whoever set it is told.'),
      label: tr('Remark'),
      placeholder: tr('e.g. On it — I will send it by 5 pm'),
      defaultNote: tr('Accepted — on it.'),
      confirm: tr('Accept'),
      tone: 'success',
    },
    // A routine (daily) task's one move.
    done: {
      title: tr('Mark as done?'),
      body: tr('Today’s routine is finished — it is marked completed.'),
      label: tr('Remark'),
      placeholder: tr('e.g. Counted and locked the cash'),
      defaultNote: tr('Done.'),
      confirm: tr('Mark done'),
      tone: 'success',
    },
    approve: {
      title: tr('Approve this task?'),
      body: tr('It is marked completed.'),
      label: tr('Remark'),
      placeholder: tr('Anything to say about the work?'),
      defaultNote: tr('Approved.'),
      confirm: tr('Approve'),
      tone: 'success',
    },
    sendBack: {
      title: tr('Send it back?'),
      body: tr('It reopens with everything already done still on it.'),
      label: tr('What still needs doing?'),
      placeholder: tr('e.g. The March figures are missing'),
      confirm: tr('Send back'),
      tone: 'danger',
    },
    // The doer's Reject, in the HRMS app's words.
    decline: {
      title: tr('Reject this task?'),
      body: tr('Whoever set it is told, with your reason, so it can go to somebody else.'),
      label: tr('Why can you not take it on?'),
      placeholder: tr('e.g. I am on leave from Thursday'),
      confirm: tr('Reject'),
      tone: 'danger',
    },
    submit: {
      title: tr('Send for review?'),
      body: tr('It goes to whoever set it, who approves it or sends it back.'),
      label: tr('What did you do?'),
      placeholder: tr('A line about the work'),
      defaultNote: tr('Submitted for review.'),
      confirm: tr('Send for review'),
      tone: 'review',
    },
    complete: {
      title: tr('Mark as completed?'),
      body: tr('It is finished for everybody on it.'),
      label: tr('Remark'),
      placeholder: tr('Anything to add?'),
      defaultNote: tr('Marked completed.'),
      confirm: tr('Mark completed'),
      tone: 'success',
    },
  }[stage];
}

/**
 * Icon chip and button colours per tone. Fills under a white label use the
 * *Fill tokens (and a fixed violet for review), which stay dark enough for
 * white in both themes; the soft/ink pair follows the theme.
 */
function toneColors(tone) {
  switch (tone) {
    case 'success':
      return { soft: colors.successSoft, ink: colors.success, fill: colors.successFill };
    case 'danger':
      return { soft: colors.dangerSoft, ink: colors.danger, fill: colors.dangerFill };
    case 'review':
      return { soft: REVIEW_COLORS.bg, ink: REVIEW_COLORS.fg, fill: '#6d28d9' };
    case 'info':
      return { soft: colors.infoSoft, ink: colors.info, fill: '#2563eb' };
    case 'warning':
      return { soft: colors.warningSoft, ink: colors.warning, fill: colors.warningFill };
    case 'primary':
      return { soft: colors.primarySoft, ink: colors.primary, fill: colors.primary };
    default:
      return { soft: colors.muted, ink: colors.textSecondary, fill: colors.primary };
  }
}

/** The pill on a card that opens the sheet: its label IS the task's status. */
export function StatusPill({ task, onPress }) {
  const badge = statusBadge(task);
  const tone = statusColors(badge.status, false);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={tr('Status: {status}. Change it', { status: badge.label })}
      style={({ pressed }) => [styles.pill, { backgroundColor: tone.bg, borderColor: tone.fg }, pressed && styles.pressed]}
    >
      <View style={[styles.pillDot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.pillText, { color: tone.fg }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {badge.label}
      </Text>
      <ChevronDown size={14} color={tone.fg} strokeWidth={2.5} />
    </Pressable>
  );
}

/**
 * @param {{ task: object|null, meta: object, onClose, onChanged, onOpen?, onEdit?,
 *   initialStage?: string, requireRemark?: boolean }} props
 */
export default function TaskStatusSheets({ task, meta, onClose, onChanged, onOpen, onEdit, initialStage = null, requireRemark = false }) {
  // 'menu' | a copyFor key | 'delegate' | 'transfer' | 'extension' | null
  const [stage, setStage] = useState(null);
  const [held, setHeld] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // The menu row that is running at once (accept, claim), for its spinner.
  const [running, setRunning] = useState('');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const noteRef = useRef(null);
  const timer = useRef(null);

  // A new task opens on its list of moves, or (a swipe) straight on the one
  // move it asked for. Closing clears everything.
  useEffect(() => {
    clearTimeout(timer.current);
    if (task) {
      setHeld(task);
      setStage(initialStage || 'menu');
    } else setStage(null);
    setNote('');
    setError('');
    setBusy(false);
    setRunning('');
  }, [task, initialStage]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const base = stage ? copyFor(stage) : null;
  const copy = base && requireRemark ? { ...base, defaultNote: undefined } : base;
  const optional = Boolean(copy?.defaultNote);

  // Straight into the remark box, keyboard up, once the sheet has slid in.
  const remarkStage = copy ? stage : null;
  useEffect(() => {
    if (!remarkStage) return undefined;
    const t = setTimeout(() => noteRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(t);
  }, [remarkStage]);

  const close = useCallback(() => {
    clearTimeout(timer.current);
    setStage(null);
    onClose?.();
  }, [onClose]);

  /** Move from the list to the next sheet, one modal at a time. */
  const swapTo = (next) => {
    setStage(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStage(next), SWAP_MS);
  };

  const runNow = async (key, fn, done) => {
    setBusy(true);
    setRunning(key);
    setError('');
    try {
      await fn();
      toast.success(done);
      close();
      onChanged?.();
    } catch (e) {
      setError(e?.message || tr('That did not go through. Try again.'));
    } finally {
      setBusy(false);
      setRunning('');
    }
  };

  const pick = (key) => {
    if (!held || busy) return;
    if (key === 'accept') {
      runNow(key, () => acceptTask(held._id), tr('Accepted — it is in progress now.'));
      return;
    }
    if (key === 'claim') {
      runNow(key, () => claimTask(held._id), tr('Picked up. It is yours.'));
      return;
    }
    setNote('');
    setError('');
    swapTo(key);
  };

  const confirmIt = async () => {
    if (!held || !copy) return;
    const said = note.trim();
    if (!optional && !said) {
      // A move that is optional elsewhere but required from a swipe says so
      // plainly, rather than asking "why" about an approval.
      setError(base?.defaultNote ? tr('Add a remark first — a swipe needs one.') : tr('Say why — the other person has nothing else to go on.'));
      noteRef.current?.focus();
      return;
    }
    const text = said || copy.defaultNote;
    setBusy(true);
    setError('');
    try {
      let res = null;
      if (stage === 'approve') res = await approveTask(held._id, { note: text });
      else if (stage === 'sendBack') res = await rejectTask(held._id, { note: text });
      else if (stage === 'decline') res = await declineTask(held._id, text);
      else if (stage === 'submit') res = await submitTask(held._id, { note: text });
      else if (stage === 'complete' || stage === 'done') res = await changeStatus(held._id, 'COMPLETED', { note: text });
      else if (stage === 'accept') res = await acceptTask(held._id, text);
      const done = {
        approve: tr('Approved — it is completed.'),
        sendBack: tr('Sent back. They have been told what is missing.'),
        decline: tr('Rejected. Whoever set it has been told.'),
        submit: tr('Sent for review.'),
        accept: tr('Accepted — it is in progress now.'),
        done: tr('Done — nicely.'),
        // A doer's Complete on a reviewed task lands in review; the server says so.
        complete: res?.coerced ? tr('Sent for review — it needs approving first.') : tr('Marked completed.'),
      }[stage];
      toast.success(done);
      close();
      onChanged?.();
    } catch (e) {
      setError(e?.message || tr('That did not go through. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  // More time is its own row after the moves (HRMS), not one of them.
  const actions = held ? statusActions(held).filter((a) => a.key !== 'extension') : [];
  const canAskTime = Boolean(held?.can?.canRequestExtension);
  const badge = held ? statusBadge(held) : null;
  const tone = copy ? toneColors(copy.tone) : null;

  return (
    <>
      {/* ── What can be done ─────────────────────────────── */}
      <BottomSheet visible={stage === 'menu' && Boolean(held)} onClose={close} title={tr('Change status')}>
        {held ? (
          <View>
            <Text style={styles.taskTitle} numberOfLines={2}>
              {held.title}
            </Text>
            <Text style={styles.taskNow}>{tr('Now: {status}', { status: badge?.label })}</Text>
            {actions.length === 0 && !canAskTime ? <Text style={styles.nothing}>{tr('Nothing for you to change on this one right now.')}</Text> : null}
            {actions.map((a) => (
              <ActionRow key={a.key} icon={a.icon} tone={a.tone} label={a.label} running={running === a.key} disabled={busy} onPress={() => pick(a.key)} />
            ))}
            {canAskTime ? <ActionRow icon="extension" tone="warning" label={tr('Ask for more time')} disabled={busy} onPress={() => pick('extension')} /> : null}
            <Notice tone="danger" style={styles.error}>
              {error}
            </Notice>
            {/* EDIT, while nobody has taken it on. Not a status, so it sits
                with Open task rather than among the moves. */}
            {held.can?.canEdit && onEdit ? (
              <Pressable
                onPress={() => {
                  const t = held;
                  close();
                  onEdit(t);
                }}
                style={({ pressed }) => [styles.openRow, pressed && styles.actionPressed]}
                accessibilityRole="button"
              >
                <SquarePen size={17} color={colors.warning} />
                <Text style={styles.openText}>{tr('Edit task')}</Text>
                <Text style={styles.openHint}>{tr('before it is accepted')}</Text>
              </Pressable>
            ) : null}
            {onOpen ? (
              <Pressable
                onPress={() => {
                  const t = held;
                  close();
                  onOpen(t);
                }}
                style={({ pressed }) => [styles.openRow, pressed && styles.actionPressed]}
                accessibilityRole="button"
              >
                <ExternalLink size={17} color={colors.textSecondary} />
                <Text style={styles.openText}>{tr('Open task')}</Text>
                <Text style={styles.openHint}>{tr('progress · comments · more')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>

      {/* ── The remark ───────────────────────────────────── */}
      <BottomSheet
        visible={Boolean(copy) && Boolean(held)}
        onClose={close}
        title={copy?.title || ''}
        footer={copy ? <Button title={copy.confirm} size="lg" color={tone.fill} icon={actionIcon(stage)} loading={busy} onPress={confirmIt} /> : null}
      >
        {copy && held ? (
          <View>
            <Text style={styles.taskTitle} numberOfLines={2}>
              {held.title}
            </Text>
            <Text style={styles.body}>{copy.body}</Text>
            <Text style={styles.label}>
              {copy.label}
              {optional ? <Text style={styles.optional}>{`  ${tr('optional')}`}</Text> : <Text style={styles.required}> *</Text>}
            </Text>
            <TextInput
              ref={noteRef}
              value={note}
              onChangeText={(t) => {
                setNote(t);
                if (error) setError('');
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={copy.placeholder}
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={1000}
              accessibilityLabel={copy.label}
              style={[styles.input, focused && styles.inputFocused]}
            />
            <Notice tone="danger" style={styles.error}>
              {error}
            </Notice>
          </View>
        ) : null}
      </BottomSheet>

      {/* ── Delegate · Transfer · More time: their own sheets ── */}
      <DelegateSheet
        visible={stage === 'delegate' && Boolean(held)}
        task={held}
        meta={meta}
        can={held?.can}
        onClose={close}
        onDone={() => {
          close();
          onChanged?.();
        }}
      />
      <TransferSheet
        visible={stage === 'transfer' && Boolean(held)}
        task={held}
        meta={meta}
        onClose={close}
        onDone={() => {
          close();
          onChanged?.();
        }}
      />
      <ExtensionSheet
        visible={stage === 'extension' && Boolean(held)}
        task={held}
        onClose={close}
        onDone={() => {
          close();
          onChanged?.();
        }}
      />
    </>
  );
}

/** One row of the menu: icon chip, label, chevron (or a spinner while it runs). */
function ActionRow({ icon, tone, label, onPress, disabled, running }) {
  const c = toneColors(tone);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
    >
      <View style={[styles.actionIcon, { backgroundColor: c.soft }]}>
        <ActionIcon name={icon} size={18} color={c.ink} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={2}>
        {label}
      </Text>
      {running ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <ChevronRight size={16} color={colors.textFaint} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  // No maxWidth: the status reads whole ("Needs your review"); the tags beside it give way.
  pill: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  taskTitle: { color: colors.text, fontSize: 15, fontWeight: font.bold },
  taskNow: { color: colors.textSecondary, fontSize: 12, marginTop: 2, marginBottom: space(3) },
  nothing: { color: colors.textSecondary, fontSize: 13, paddingVertical: space(3) },
  action: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingHorizontal: space(2),
    paddingVertical: space(2),
    borderRadius: radius.md,
  },
  actionPressed: { backgroundColor: colors.muted },
  actionIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: font.bold },
  error: { marginTop: space(3), marginBottom: 0 },
  openRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    marginTop: space(2),
    paddingHorizontal: space(2),
    borderRadius: radius.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  openText: { color: colors.textSecondary, fontSize: 14, fontWeight: font.bold },
  openHint: { marginLeft: 'auto', color: colors.textFaint, fontSize: 11 },
  body: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: space(1), marginBottom: space(3) },
  label: { color: colors.text, fontSize: 13, fontWeight: font.bold, marginBottom: 6 },
  optional: { color: colors.textFaint, fontWeight: font.regular },
  required: { color: colors.danger, fontWeight: '800' },
  input: {
    minHeight: 96,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(3),
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.card,
  },
  // Colour only, so focusing never moves the text.
  inputFocused: { borderColor: colors.primary },
});
