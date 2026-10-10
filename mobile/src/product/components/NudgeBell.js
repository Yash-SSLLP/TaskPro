/**
 * The reminder bell on a task: the setter chasing the people doing it, or
 * the doer chasing the reviewer, whichever the server says (`can.canNudge` /
 * `nudgeTo`). Once per task per cooldown: a bell that is waiting shows how
 * long for ("25m") and counts down on its own. `override` is the moment THIS
 * phone last rang it, so the countdown starts before the list is refetched.
 * A waiting bell sits on the muted grey, its words in the HRMS 13/800.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, theme } from '../../platform/theme';
import { toast } from '../../platform/ui';
import { nudgeTask } from '../api';
import { Bell, BellRing } from '../icons';
import { REVIEW_COLORS, clockOf, nudgeState } from '../taskStatus';

const GOLD = theme.dark ? '#D6B25A' : '#A9863A';
const GOLD_SOFT = theme.dark ? '#31332A' : '#fdf6e3'; // dark: the gold at 16% over the card

export default function NudgeBell({ task, override = null, onNudged, size = 36, label = false }) {
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const state = nudgeState(task, override);

  useEffect(() => {
    if (!state.can || !state.waitMin) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, [state.can, state.waitMin]);

  if (!state.can) return null;

  const review = state.to === 'approver';
  const tint = review ? REVIEW_COLORS.fg : GOLD;
  const soft = review ? REVIEW_COLORS.bg : GOLD_SOFT;
  const waiting = state.waitMin > 0;

  const ring = async () => {
    if (busy) return;
    if (waiting) {
      toast(tr('Reminder already sent. You can send another at {time}.', { time: clockOf(state.readyAt) }));
      return;
    }
    setBusy(true);
    try {
      const res = await nudgeTask(task._id);
      toast.success(res?.message || tr('Reminder sent.'));
      onNudged?.(task._id, res?.nextAt ? new Date(res.nextAt) : new Date(Date.now() + 30 * 60000));
    } catch (e) {
      const nextAt = e?.data?.nextAt;
      if (e?.status === 429 && nextAt) {
        onNudged?.(task._id, new Date(nextAt));
        toast(tr('Reminder already sent. You can send another at {time}.', { time: clockOf(nextAt) }));
      } else {
        toast.error(e.message || tr('Could not send the reminder.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const Icon = waiting ? Bell : BellRing;
  return (
    <Pressable
      onPress={ring}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={
        waiting
          ? tr('Reminder sent. You can remind again in {n} minutes', { n: state.waitMin })
          : review
            ? tr('Remind the reviewer to review it')
            : tr('Send a reminder')
      }
      style={({ pressed }) => [
        label ? styles.pill : [styles.round, { width: size, height: size, borderRadius: size / 2 }],
        { backgroundColor: waiting ? colors.muted : soft, borderColor: waiting ? colors.border : tint },
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Icon size={label ? 15 : Math.round(size * 0.47)} color={waiting ? colors.textFaint : tint} />
      )}
      {label ? (
        <Text style={[styles.pillText, { color: waiting ? colors.textFaint : tint }]} numberOfLines={1}>
          {waiting ? tr('Reminded · again in {n}m', { n: state.waitMin }) : review ? tr('Remind to review') : tr('Remind')}
        </Text>
      ) : null}
      {!label && waiting ? (
        <View style={styles.wait}>
          <Text style={styles.waitText} maxFontSizeMultiplier={1.1}>
            {state.waitMin}m
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  // The status pill's size (36), so the two sit level on the task page.
  pill: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  wait: {
    position: 'absolute',
    bottom: -7,
    alignSelf: 'center',
    minWidth: 26,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  waitText: { fontSize: 9.5, fontWeight: '800', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
});
