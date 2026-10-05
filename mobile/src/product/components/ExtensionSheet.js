/**
 * "I will do it, but not by then": ask for a later deadline. Not a status:
 * the work carries on while the answer is awaited. The reason is required
 * and the new date must be later than the deadline it replaces; the new
 * deadline keeps the old one's time of day.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, font, radius, space, type } from '../../platform/theme';
import { BottomSheet, Button, Chip, ChipRow, DateField, Notice, TextField, dateOfYmd, toast, ymdOf } from '../../platform/ui';
import { requestExtension } from '../api';
import { Clock } from '../icons';
import { fullWhen } from '../taskStatus';

const addDays = (d, n) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

export default function ExtensionSheet({ visible, task, onClose, onDone }) {
  const base = useMemo(() => (task?.dueDate ? new Date(task.dueDate) : new Date()), [task]);
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
      <ChipRow style={styles.quick}>
        {quick.map(([label, days]) => (
          <Chip key={days} label={label} selected={ymd === ymdOf(addDays(base, days))} onPress={() => setYmd(ymdOf(addDays(base, days)))} />
        ))}
      </ChipRow>
      <DateField value={ymd} onChange={setYmd} minimumDate={addDays(base, 1)} />
      {wanted && !tooEarly ? <Text style={styles.hint}>{tr('New deadline: {when} — the same time of day.', { when: fullWhen(wanted) })}</Text> : null}
      {tooEarly ? <Text style={[styles.hint, styles.bad]}>{tr('That is not later than the current deadline.')}</Text> : null}

      <TextField
        label={tr('Why do you need longer?')}
        value={reason}
        onChangeText={(t) => {
          setReason(t);
          if (error) setError('');
        }}
        placeholder={tr('e.g. the figures only arrive on Thursday')}
        multiline
        maxLength={1000}
        style={styles.reason}
        hint={tr('Required. You can only have one request open at a time.')}
      />
      <Notice tone="danger">{error}</Notice>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  current: { padding: space(3), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted },
  currentLabel: { ...type.caption },
  currentValue: { color: colors.text, fontSize: 15, fontWeight: font.semibold, marginTop: 2 },
  label: { color: colors.text, fontSize: 14, fontWeight: font.medium, marginTop: space(4), marginBottom: space(2) },
  quick: { marginBottom: space(2) },
  hint: { ...type.caption, marginTop: space(2) },
  bad: { color: colors.danger },
  reason: { marginTop: space(4) },
});
