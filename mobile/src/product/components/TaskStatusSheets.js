/**
 * The status button's sheets: tapping the status on a task card lists what
 * THIS person may do to THIS task (taskStatus.statusActions, read off the
 * server's `can` only). Picking one then:
 *
 *   Accept (no swipe) / Pick it up      happens at once
 *   Delegate / Transfer / More time     their own sheets
 *   everything else                     a remark sheet
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
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, font, radius, space, type } from '../../platform/theme';
import { BottomSheet, Button, Notice, TextField, toast } from '../../platform/ui';
import { acceptTask, approveTask, changeStatus, claimTask, declineTask, rejectTask, submitTask } from '../api';
import { ChevronDown, ChevronRight, ExternalLink, SquarePen } from '../icons';
import { REVIEW_COLORS, statusActions, statusBadge, statusColors } from '../taskStatus';
import { ActionIcon } from './actionIcons';
import DelegateSheet from './DelegateSheet';
import ExtensionSheet from './ExtensionSheet';
import TransferSheet from './TransferSheet';

const SWAP_MS = 260;

function copyFor(stage) {
  return {
    accept: {
      title: tr('Accept this task?'),
      body: tr('It moves to In progress, and whoever set it is told.'),
      label: tr('Remark'),
      placeholder: tr('e.g. On it — I will send it by 5 pm'),
      defaultNote: tr('Accepted — on it.'),
      confirm: tr('Accept'),
      tone: 'success',
    },
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
    decline: {
      title: tr('Decline this task?'),
      body: tr('Whoever set it is told, with your reason, so it can go to somebody else.'),
      label: tr('Why can you not take it on?'),
      placeholder: tr('e.g. I am on leave from Thursday'),
      confirm: tr('Decline'),
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

function toneColors(tone) {
  switch (tone) {
    case 'success':
      return { soft: colors.successSoft, ink: colors.success, fill: colors.success };
    case 'danger':
      return { soft: colors.dangerSoft, ink: colors.danger, fill: colors.danger };
    case 'review':
      return { soft: REVIEW_COLORS.bg, ink: REVIEW_COLORS.fg, fill: REVIEW_COLORS.fg };
    case 'info':
      return { soft: colors.infoSoft, ink: colors.info, fill: colors.info };
    case 'warning':
      return { soft: colors.warningSoft, ink: colors.warning, fill: colors.warning };
    case 'primary':
      return { soft: colors.primarySoft, ink: colors.primary, fill: colors.primary };
    default:
      return { soft: colors.muted, ink: colors.textSecondary, fill: colors.text };
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
      <Text style={[styles.pillText, { color: tone.fg }]} numberOfLines={1}>
        {badge.label}
      </Text>
      <ChevronDown size={14} color={tone.fg} />
    </Pressable>
  );
}

/**
 * @param {{ task: object|null, meta: object, onClose, onChanged, onOpen?, onEdit?,
 *   initialStage?: string, requireRemark?: boolean }} props
 */
export default function TaskStatusSheets({ task, meta, onClose, onChanged, onOpen, onEdit, initialStage = null, requireRemark = false }) {
  const [stage, setStage] = useState(null);
  const [held, setHeld] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (task) {
      setHeld(task);
      setStage(initialStage || 'menu');
    } else setStage(null);
    setNote('');
    setError('');
    setBusy(false);
  }, [task, initialStage]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const base = stage ? copyFor(stage) : null;
  const copy = base && requireRemark ? { ...base, defaultNote: undefined } : base;

  const close = useCallback(() => {
    clearTimeout(timer.current);
    setStage(null);
    onClose?.();
  }, [onClose]);

  const swapTo = (next) => {
    setStage(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStage(next), SWAP_MS);
  };

  const runNow = async (fn, done) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      toast.success(done);
      close();
      onChanged?.();
    } catch (e) {
      setError(e.message || tr('That did not go through. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const pick = (key) => {
    if (!held) return;
    if (key === 'claim') {
      runNow(() => claimTask(held._id), tr('Picked up. It is yours.'));
      return;
    }
    setNote('');
    setError('');
    swapTo(key);
  };

  const confirmIt = async () => {
    if (!held || !copy) return;
    const said = note.trim();
    if (!copy.defaultNote && !said) {
      setError(base?.defaultNote ? tr('Add a remark first — a swipe needs one.') : tr('Say why — the other person has nothing else to go on.'));
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
        decline: tr('Declined. Whoever set it has been told.'),
        submit: tr('Sent for review.'),
        accept: tr('Accepted — it is in progress now.'),
        done: tr('Done — nicely.'),
        complete: res?.coerced ? tr('Sent for review — it needs approving first.') : tr('Marked completed.'),
      }[stage];
      toast.success(done);
      close();
      onChanged?.();
    } catch (e) {
      setError(e.message || tr('That did not go through. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const actions = held ? statusActions(held) : [];
  const badge = held ? statusBadge(held) : null;
  const tone = copy ? toneColors(copy.tone) : null;

  return (
    <>
      <BottomSheet visible={stage === 'menu' && Boolean(held)} onClose={close} title={tr('Change status')}>
        {held ? (
          <View>
            <Text style={styles.taskTitle} numberOfLines={2}>
              {held.title}
            </Text>
            <Text style={styles.taskNow}>{tr('Now: {status}', { status: badge?.label })}</Text>
            {actions.length === 0 ? <Text style={styles.nothing}>{tr('Nothing for you to change on this one right now.')}</Text> : null}
            {actions.map((a) => {
              const c = toneColors(a.tone);
              return (
                <Pressable
                  key={a.key}
                  onPress={() => pick(a.key)}
                  disabled={busy}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                >
                  <View style={[styles.actionIcon, { backgroundColor: c.soft }]}>
                    <ActionIcon name={a.icon} size={18} color={c.ink} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.actionLabel}>{a.label}</Text>
                    <Text style={styles.actionHint}>{a.hint}</Text>
                  </View>
                  {busy && a.key === 'claim' ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <ChevronRight size={16} color={colors.textFaint} />}
                </Pressable>
              );
            })}
            <Notice tone="danger" style={styles.error}>
              {error}
            </Notice>
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

      <BottomSheet
        visible={Boolean(copy) && Boolean(held)}
        onClose={close}
        title={copy?.title || ''}
        footer={copy ? <Button title={copy.confirm} size="lg" color={tone.fill} loading={busy} onPress={confirmIt} /> : null}
      >
        {copy && held ? (
          <View>
            <Text style={styles.taskTitle} numberOfLines={2}>
              {held.title}
            </Text>
            <Text style={styles.body}>{copy.body}</Text>
            <TextField
              label={copy.label}
              optional={Boolean(copy.defaultNote)}
              value={note}
              onChangeText={(t) => {
                setNote(t);
                if (error) setError('');
              }}
              placeholder={copy.placeholder}
              multiline
              maxLength={1000}
              autoFocus
            />
            <Notice tone="danger">{error}</Notice>
          </View>
        ) : null}
      </BottomSheet>

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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  pill: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.input,
    borderWidth: 1,
    maxWidth: 200,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 13, fontWeight: font.bold, flexShrink: 1 },
  taskTitle: { color: colors.text, fontSize: 16, fontWeight: font.semibold },
  taskNow: { ...type.caption, marginTop: 2, marginBottom: space(3) },
  nothing: { ...type.small, paddingVertical: space(3) },
  action: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(2), paddingVertical: space(2), borderRadius: radius.input },
  actionPressed: { backgroundColor: colors.muted },
  actionIcon: { width: 40, height: 40, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.text, fontSize: 16, fontWeight: font.semibold },
  actionHint: { ...type.caption, marginTop: 1 },
  error: { marginTop: space(2) },
  openRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    marginTop: space(2),
    paddingHorizontal: space(2),
    borderRadius: radius.input,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  openText: { color: colors.textSecondary, fontSize: 15, fontWeight: font.semibold },
  openHint: { marginLeft: 'auto', color: colors.textFaint, fontSize: 12 },
  body: { ...type.small, lineHeight: 20, marginTop: space(1), marginBottom: space(4) },
});
