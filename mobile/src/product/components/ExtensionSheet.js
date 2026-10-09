/**
 * "I will do it, but not by then": ask for a later deadline. Not a status:
 * the work carries on while the answer is awaited. The reason is required
 * and the new date must be later than the deadline it replaces; the new
 * deadline keeps the old one's time of day.
 *
 * Laid out as the HRMS app's sheet (2026-10-08): small bold labels, three
 * equal quick-pick buttons, a 15pt reason box, and one 46 button.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, radius, space } from '../../platform/theme';
import { BottomSheet, Button, DateField, Notice, TextField, dateOfYmd, toast, ymdOf } from '../../platform/ui';
import { requestExtension } from '../api';
import { Clock } from '../icons';
import { fullWhen } from '../taskStatus';

const addDays = (d, n) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

export default function ExtensionSheet({ visible, task, onClose, onDone }) {
  // On the due date only: a live refresh of the task must not reset the form.
  const base = useMemo(() => (task?.dueDate ? new Date(task.dueDate) : new Date()), [task?.dueDate]);
  const [ymd, setYmd] = useState(ymdOf(addDays(base, 1)));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setYmd(ymdOf(addDays(base, 1)));
    setReason('');
    setError('');
  }, [visible, base]);

  const wanted = useMemo(() => {
    const day = dateOfYmd(ymd);
    if (!day) return null;
    day.setHours(base.getHours(), base.getMinutes(), 0, 0);
    return day;
  }, [ymd, base]);

  const tooEarly = Boolean(task?.dueDate) && wanted && wanted <= base;

  const submit = async () => {
    if (!wanted) return setError(tr('Pick the new date you need.'));
    if (tooEarly) return setError(tr('That is not later than the current deadline.'));
    if (!reason.trim()) return setError(tr('Say why you need longer.'));
    setError('');
    try {
      const res = await requestExtension(task._id, { toDate: wanted.toISOString(), reason: reason.trim() });
      toast.success(tr('Asked. The person who set it decides.'));
      onDone?.(res);
    } catch (e) {
      setError(e.message || tr('Could not ask for more time.'));
    }
  };

  if (!task) return null;
  const quick = [
    [tr('1 more day'), 1],
    [tr('3 days'), 3],
    [tr('A week'), 7],
  ];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={tr('Ask for more time')}
      footer={<Button title={tr('Ask for more time')} icon={Clock} size="lg" onPress={submit} />}
    >
      <View style={styles.current}>
        <Text style={styles.currentLabel}>{tr('Due now')}</Text>
        <Text style={styles.currentValue}>{fullWhen(task.dueDate)}</Text>
      </View>

      <Text style={styles.label}>{tr('New date')}</Text>
      {/* Three equal answers to "how much longer?" — the ones that cover almost every case. */}
      <View style={styles.quickRow}>
        {quick.map(([label, days]) => {
          const day = ymdOf(addDays(base, days));
          const on = ymd === day;
          return (
            <Pressable
              key={days}
              onPress={() => setYmd(day)}
              style={({ pressed }) => [styles.quick, on && styles.quickOn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.quickText, on && styles.quickTextOn]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <DateField value={ymd} onChange={setYmd} minimumDate={addDays(base, 1)} />
      {wanted && !tooEarly ? <Text style={styles.hint}>{tr('New deadline: {when} — the same time of day.', { when: fullWhen(wanted) })}</Text> : null}
      {tooEarly ? <Text style={[styles.hint, styles.bad]}>{tr('That is not later than the current deadline.')}</Text> : null}

      <Text style={styles.label}>{tr('Why do you need longer?')}</Text>
      <TextField
        value={reason}
        onChangeText={(t) => {
          setReason(t);
          if (error) setError('');
        }}
        placeholder={tr('e.g. the figures only arrive on Thursday')}
        multiline
        maxLength={1000}
        accessibilityLabel={tr('Why do you need longer?')}
        inputStyle={styles.input}
        style={styles.reason}
        hint={tr('Required. You can only have one request open at a time.')}
      />
      <Notice tone="danger">{error}</Notice>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  current: { padding: space(3), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted },
  currentLabel: { color: colors.textFaint, fontSize: 11.5 },
  currentValue: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: space(4), marginBottom: space(2) },
  quickRow: { flexDirection: 'row', gap: space(2), marginBottom: space(2) },
  quick: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(2),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  quickOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  // Weight on the BASE: choosing one must not resize it.
  quickText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
  quickTextOn: { color: colors.text },
  pressed: { opacity: 0.8 },
  hint: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: space(1.5) },
  bad: { color: colors.danger },
  input: { fontSize: 15 },
  reason: { marginBottom: space(3) },
});
