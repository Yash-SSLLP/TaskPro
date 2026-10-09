/**
 * "Say what happened": the note box every move on a task goes through, and
 * the remark composer. Text, a voice note and files; a voice note counts as
 * saying something everywhere except sending work back.
 *
 *   submit    hand it in for review      POST /tasks/:id/submit
 *   approve   sign it off                POST /tasks/:id/approve
 *   reject    send it back (note required)
 *   status    any other move             POST /tasks/:id/status (needs `to`)
 *   comment   a plain remark             POST /tasks/:id/updates
 *
 * Laid out as the HRMS app's sheet (2026-10-08): a quiet prompt, a 15pt note
 * box, the microphone and the paperclip as small square buttons, and one 46
 * button in the move's own colour.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, radius, space } from '../../platform/theme';
import { BottomSheet, Button, Notice, TextField, toast } from '../../platform/ui';
import { addUpdate, approveTask, changeStatus, rejectTask, submitTask } from '../api';
import { CheckCheck, MessageSquare, Paperclip, Send, Undo } from '../icons';
import { statusLabel } from '../taskStatus';
import { MAX_FILES } from '../uploads';
import { AttachSheet, FileGrid } from './Files';
import { VoiceRecorder } from './VoiceNote';

function wording(action, to, task) {
  switch (action) {
    case 'submit':
      return {
        title: tr('Hand it in'),
        prompt: tr('Say what you have done. {name} reads this before approving.', { name: task?.approverName || task?.createdByName || tr('Whoever set it') }),
        placeholder: tr('What has been done?'),
        button: tr('Send for review'),
        icon: Send,
        required: true,
      };
    case 'approve':
      return {
        title: tr('Approve this'),
        prompt: tr('It is done. Add a word if you like.'),
        placeholder: tr('Anything to add? (optional)'),
        button: tr('Approve it'),
        icon: CheckCheck,
        required: false,
        variant: 'success',
      };
    case 'reject':
      return {
        title: tr('Send it back'),
        prompt: tr('It reopens on the same person. Say what still needs doing.'),
        placeholder: tr('What still needs doing?'),
        button: tr('Send it back'),
        icon: Undo,
        required: true,
        variant: 'danger',
      };
    case 'comment':
      return {
        title: tr('Add a remark'),
        prompt: tr('Everyone on this task will see it.'),
        placeholder: tr('Write a remark…'),
        button: tr('Add remark'),
        icon: MessageSquare,
        required: false,
      };
    default: {
      const label = statusLabel(to);
      return {
        title: tr('Update this task'),
        prompt: tr('Add a note before marking it {status}.', { status: label.toLowerCase() }),
        placeholder: tr('What has happened?'),
        button: tr('Mark {status}', { status: label.toLowerCase() }),
        icon: Send,
        required: true,
        variant: to === 'CANCELLED' ? 'danger' : undefined,
      };
    }
  }
}

export default function TaskUpdateSheet({ visible, task, onClose, onDone, action = 'status', to = null }) {
  const [note, setNote] = useState('');
  const [voice, setVoice] = useState(null);
  const [files, setFiles] = useState([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setNote('');
    setVoice(null);
    setFiles([]);
    setError('');
  }, [visible, action, to]);

  const w = wording(action, to, task);

  const submit = async () => {
    const said = note.trim();
    const upload = { note: said, voice, files };
    if (action === 'reject' && !said) return setError(tr('Type what still needs doing — a recording is not enough for this one.'));
    if (w.required && action !== 'reject' && !said && !voice) return setError(tr('Say what has happened — type a line or record a voice note.'));
    if (!w.required && !said && !voice && !files.length) return setError(tr('Write something, record something, or attach a file.'));
    setError('');
    try {
      let res = null;
      if (action === 'submit') res = await submitTask(task._id, upload);
      else if (action === 'approve') res = await approveTask(task._id, upload);
      else if (action === 'reject') res = await rejectTask(task._id, upload);
      else if (action === 'comment') res = await addUpdate(task._id, upload);
      else res = await changeStatus(task._id, to, upload);

      if (res?.unchanged) toast(tr('That was already done.'));
      else if (action === 'submit') toast.success(res?.coerced === false ? tr('Marked complete.') : tr('Handed in for review.'));
      else if (action === 'approve') toast.success(tr('Approved.'));
      else if (action === 'reject') toast.success(tr('Sent back. It is open again.'));
      else if (action === 'comment') toast.success(tr('Added.'));
      else toast.success(tr('Marked {status}.', { status: statusLabel(to).toLowerCase() }));
      onDone?.(res);
    } catch (e) {
      setError(e.message || tr('Could not save that update.'));
    }
    return undefined;
  };

  if (!task) return null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={w.title}
      footer={<Button title={w.button} icon={w.icon} size="lg" color={w.variant === 'success' ? colors.successFill : undefined} variant={w.variant === 'danger' ? 'danger' : 'primary'} onPress={submit} />}
    >
      <Text style={styles.prompt}>{w.prompt}</Text>
      <TextField
        value={note}
        onChangeText={(t) => {
          setNote(t);
          if (error) setError('');
        }}
        placeholder={w.placeholder}
        multiline
        maxLength={5000}
        autoFocus
        accessibilityLabel={w.title}
        inputStyle={styles.input}
        style={styles.field}
      />
      <View style={styles.iconRow}>
        {!voice ? <VoiceRecorder value={null} onChange={setVoice} compact /> : null}
        <Pressable
          onPress={() => setAttachOpen(true)}
          style={styles.iconBtn}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={tr('Attach a file')}
          disabled={files.length >= MAX_FILES}
        >
          <Paperclip size={18} color={colors.primary} />
        </Pressable>
      </View>
      {voice ? <VoiceRecorder value={voice} onChange={setVoice} /> : null}
      <FileGrid files={files} size={64} onRemove={(f) => setFiles((list) => list.filter((x) => x.key !== f.key))} style={styles.files} />
      <Notice tone="danger" style={styles.error}>
        {error}
      </Notice>
      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        room={MAX_FILES - files.length}
        onPicked={(picked) => setFiles((list) => [...list, ...picked].slice(0, MAX_FILES))}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  prompt: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: space(3) },
  field: { marginBottom: space(2) },
  input: { fontSize: 15, minHeight: 96 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(2) },
  // The HRMS app's attach button: a small square in the brand tint.
  iconBtn: {
    minHeight: 42,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  files: { marginTop: space(2) },
  error: { marginTop: space(3) },
});
