/**
 * Transfer: it went to the wrong person. NOT delegation: whoever it is on
 * comes off it completely, progress resets, and the reason is required. The
 * warning stays on screen, and the confirmation names who loses the task.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { tr } from '../../i18n';
import { colors, font, space } from '../../platform/theme';
import { BottomSheet, Button, Notice, TextField, toast } from '../../platform/ui';
import { transferTask } from '../api';
import { ArrowLeftRight } from '../icons';
import { assigneeNames, idOf } from '../taskStatus';
import TaskPeoplePicker from './TaskPeoplePicker';

export default function TransferSheet({ visible, task, meta, onClose, onDone }) {
  const [to, setTo] = useState([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTo([]);
    setReason('');
    setError('');
  }, [visible]);

  const onIt = useMemo(() => (task?.assignees || []).map((a) => idOf(a.user)), [task]);
  const leaving = useMemo(() => assigneeNames(task?.assignees || [], 3), [task]);
  const target = (meta?.people || []).find((p) => idOf(p) === String(to[0]));
  const targetName = target?.name || tr('them');
  const who = leaving === '—' ? tr('Nobody') : leaving;

  const send = async () => {
    setError('');
    try {
      const res = await transferTask(task._id, to[0], reason.trim());
      toast.success(tr("Now {name}'s. Everyone else is off it.", { name: res?.transferredTo?.name || targetName }));
      onDone?.(res);
    } catch (e) {
      setError(e.message || tr('Could not transfer that task.'));
    }
  };

  const confirmIt = () => {
    if (!to.length) return setError(tr('Choose who it should have gone to.'));
    if (!reason.trim()) return setError(tr('Say why it is moving.'));
    Alert.alert(
      tr('Transfer to {name}?', { name: targetName }),
      tr('{who} comes off this task completely — no updates, no alerts, and the progress goes back to zero. Use Delegate instead to stay involved.', { who }),
      [
        { text: tr('Cancel'), style: 'cancel' },
        { text: tr('Transfer it'), style: 'destructive', onPress: send },
      ]
    );
    return undefined;
  };

  if (!task) return null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={tr('Transfer this task')}
      footer={<Button title={tr('Transfer it')} icon={ArrowLeftRight} variant="danger" size="lg" onPress={confirmIt} />}
    >
      <Notice tone="danger">
        {tr('This is for work that went to the wrong person. {who} comes off it completely and stops hearing about it, and the progress so far is cleared. To hand work on and stay involved, use Delegate.', { who })}
      </Notice>
      <Text style={styles.label}>{tr('It should have gone to')}</Text>
      <TaskPeoplePicker people={meta?.people || []} value={to} onChange={setTo} max={1} grouped={false} exclude={onIt} autoFocus maxListHeight={300} />
      <TextField
        label={tr('Why is it moving?')}
        value={reason}
        onChangeText={(t) => {
          setReason(t);
          if (error) setError('');
        }}
        placeholder={tr("e.g. this is the accounts team's, not mine")}
        multiline
        maxLength={1000}
        style={styles.reason}
        hint={tr('Required. It stays on the task’s record.')}
      />
      <Notice tone="danger">{error}</Notice>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.text, fontSize: 14, fontWeight: font.medium, marginBottom: space(2) },
  reason: { marginTop: space(4) },
});
