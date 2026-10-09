/**
 * Delegate: hand the work on, and become the person who signs it off.
 *
 *   WHOLE TASK   POST /tasks/:id/delegate { to, note }: one person takes it
 *                over and I become its approver (`can.canDelegate`).
 *   IN PIECES    POST /tasks/:id/split { items }: each piece is a real task
 *                with its own person; I approve each (`can.canSplit`).
 * A piece left without a person is open for anybody on it to pick up.
 * It is NOT Transfer, which takes the current people off completely.
 *
 * Laid out as the HRMS app's sheet (2026-10-08): a two-way switch that fills
 * with the brand colour, small bold labels, 15pt boxes, the pieces as framed
 * cards, and one 46 button.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import { tr } from '../../i18n';
import { colors, font, radius, space } from '../../platform/theme';
import { BottomSheet, Button, Notice, TextField, toast } from '../../platform/ui';
import { delegateTask, splitTask } from '../api';
import { ChevronDown, ChevronUp, Plus, Redo, User, X } from '../icons';
import { idOf } from '../taskStatus';
import TaskPeoplePicker from './TaskPeoplePicker';

export default function DelegateSheet({ visible, task, meta, can, onClose, onDone }) {
  const canWhole = can ? Boolean(can.canDelegate) : true;
  const canPieces = can ? Boolean(can.canSplit) : true;

  const [mode, setMode] = useState(canWhole ? 'whole' : 'pieces');
  const [to, setTo] = useState([]);
  const [note, setNote] = useState('');
  const [pieces, setPieces] = useState([]);
  const [draft, setDraft] = useState('');
  const [draftOwner, setDraftOwner] = useState('');
  const [pickingOwner, setPickingOwner] = useState(false);
  const [ownerFor, setOwnerFor] = useState(-1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setMode(canWhole ? 'whole' : 'pieces');
    setTo([]);
    setNote('');
    setPieces([]);
    setDraft('');
    setDraftOwner('');
    setPickingOwner(false);
    setOwnerFor(-1);
    setError('');
  }, [visible, canWhole]);

  const people = useMemo(() => meta?.people || [], [meta]);
  const onIt = useMemo(() => (task?.assignees || []).map((a) => idOf(a.user)), [task]);
  const nameOf = (id) => people.find((p) => idOf(p) === String(id))?.name || tr('Somebody');
  const maxPieces = meta?.maxPieces || 50;

  const addPiece = () => {
    const title = draft.trim();
    if (!title) return;
    setPieces((p) => [...p, { title, assignee: draftOwner }].slice(0, maxPieces));
    setDraft('');
    setDraftOwner('');
    setPickingOwner(false);
  };
  const editPiece = (i, patch) => setPieces((p) => p.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const submit = async () => {
    setError('');
    if (mode === 'whole') {
      if (!to.length) return setError(tr('Choose who is taking it on.'));
      try {
        const res = await delegateTask(task._id, to[0], note.trim());
        toast.success(tr('Passed to {name}. You approve it when it comes back.', { name: res?.delegatedTo?.name || nameOf(to[0]) }));
        onDone?.(res);
      } catch (e) {
        setError(e.message || tr('Could not pass that task on.'));
      }
      return undefined;
    }
    const all = draft.trim() ? [...pieces, { title: draft.trim(), assignee: draftOwner }] : pieces;
    const items = all.map((p) => ({ title: p.title.trim(), ...(p.assignee ? { assignee: p.assignee } : {}) })).filter((p) => p.title);
    if (!items.length) return setError(tr('Add at least one piece.'));
    try {
      const res = await splitTask(task._id, items);
      const n = res?.children?.length || items.length;
      toast.success(n === 1 ? tr('Split into 1 piece. You approve it.') : tr('Split into {n} pieces. You approve each one.', { n }));
      onDone?.(res);
    } catch (e) {
      setError(e.message || tr('Could not split that task.'));
    }
    return undefined;
  };

  const pieceCount = pieces.length + (draft.trim() ? 1 : 0);
  if (!task) return null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={canWhole ? tr('Delegate this task') : tr('Split it into pieces')}
      footer={
        <Button
          title={
            mode === 'whole'
              ? tr('Hand it over')
              : pieceCount === 1
                ? tr('Create 1 piece')
                : pieceCount
                  ? tr('Create {n} pieces', { n: pieceCount })
                  : tr('Create the pieces')
          }
          icon={Redo}
          size="lg"
          onPress={submit}
        />
      }
    >
      <Notice tone="info" style={styles.notice}>
        {tr('You stay answerable: whoever does it hands it back to you to approve, and you keep getting every update.')}
      </Notice>

      {canWhole && canPieces ? (
        <View style={styles.seg} accessibilityRole="tablist">
          {[
            ['whole', tr('Whole task'), User],
            ['pieces', tr('Split it up'), LayoutGrid],
          ].map(([key, label, Icon]) => {
            const on = mode === key;
            return (
              <Pressable
                key={key}
                onPress={() => setMode(key)}
                style={[styles.segBtn, on && styles.segBtnOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Icon size={15} color={on ? colors.onPrimary : colors.textSecondary} />
                <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {mode === 'whole' ? (
        <View>
          <Text style={styles.label}>{tr('Give it to')}</Text>
          <TaskPeoplePicker people={people} value={to} onChange={setTo} max={1} exclude={onIt} autoFocus maxListHeight={300} />
          <Text style={styles.hint}>{tr('They get it fresh to accept, and you become the one who approves their work.')}</Text>
          <Text style={styles.label}>
            {tr('Why are you passing it on?')}
            <Text style={styles.optional}>{`  ${tr('optional')}`}</Text>
          </Text>
          <TextField
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={2000}
            accessibilityLabel={tr('Why are you passing it on?')}
            inputStyle={styles.noteInput}
            style={styles.note}
          />
        </View>
      ) : (
        <View>
          <Text style={styles.label}>{tr('Who is this piece for?')}</Text>
          <Pressable
            onPress={() => setPickingOwner((v) => !v)}
            style={({ pressed }) => [styles.ownerBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: pickingOwner }}
          >
            <User size={15} color={colors.textSecondary} />
            <Text style={[styles.ownerText, draftOwner ? styles.ownerChosen : null]} numberOfLines={1}>
              {draftOwner ? nameOf(draftOwner) : tr('Anybody on the task')}
            </Text>
            {pickingOwner ? <ChevronUp size={16} color={colors.textFaint} /> : <ChevronDown size={16} color={colors.textFaint} />}
          </Pressable>
          {pickingOwner ? (
            <TaskPeoplePicker
              people={people}
              value={draftOwner ? [draftOwner] : []}
              onChange={(ids) => {
                setDraftOwner(ids[0] || '');
                setPickingOwner(false);
              }}
              max={1}
              autoFocus
              maxListHeight={260}
            />
          ) : null}

          <Text style={styles.label}>{tr('What needs doing?')}</Text>
          <View style={styles.addRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={addPiece}
              placeholder={tr('What needs doing?')}
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              maxLength={300}
            />
            <Pressable
              onPress={addPiece}
              disabled={!draft.trim()}
              style={({ pressed }) => [styles.addBtn, !draft.trim() && styles.off, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={tr('Add this piece')}
            >
              <Plus size={20} color={colors.onPrimary} />
            </Pressable>
          </View>

          {pieces.length === 0 ? (
            <Text style={styles.hint}>{tr('Add a piece for each part of the job. Leave the person empty and anybody on the task can pick it up.')}</Text>
          ) : (
            pieces.map((p, i) => (
              <View key={`${p.title}-${i}`} style={styles.piece}>
                <View style={styles.pieceTop}>
                  <Text style={styles.pieceTitle} numberOfLines={2}>
                    {p.title}
                  </Text>
                  <Pressable onPress={() => setPieces(pieces.filter((_, j) => j !== i))} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('Remove')}>
                    <X size={16} color={colors.textFaint} />
                  </Pressable>
                </View>
                <Pressable onPress={() => setOwnerFor(ownerFor === i ? -1 : i)} style={({ pressed }) => [styles.ownerBtn, styles.ownerSmall, pressed && styles.pressed]} accessibilityRole="button">
                  <User size={14} color={colors.textSecondary} />
                  <Text style={[styles.ownerText, p.assignee ? styles.ownerChosen : null]} numberOfLines={1}>
                    {p.assignee ? nameOf(p.assignee) : tr('Anybody on the task')}
                  </Text>
                  {ownerFor === i ? <ChevronUp size={15} color={colors.textFaint} /> : <ChevronDown size={15} color={colors.textFaint} />}
                </Pressable>
                {ownerFor === i ? (
                  <TaskPeoplePicker
                    people={people}
                    value={p.assignee ? [p.assignee] : []}
                    onChange={(ids) => {
                      editPiece(i, { assignee: ids[0] || '' });
                      setOwnerFor(-1);
                    }}
                    max={1}
                    autoFocus
                    maxListHeight={240}
                  />
                ) : null}
              </View>
            ))
          )}
        </View>
      )}
      <Notice tone="danger" style={styles.error}>
        {error}
      </Notice>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  notice: { marginBottom: space(3) },
  // The HRMS two-way switch: the picked half filled with the brand colour.
  seg: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: radius.input, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  segBtn: { flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: space(2), borderRadius: radius.sm },
  segBtnOn: { backgroundColor: colors.primary },
  // Weight lives on the BASE so picking a side cannot resize it.
  segText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  segTextOn: { color: colors.onPrimary },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: space(4), marginBottom: space(2) },
  optional: { color: colors.textFaint, fontWeight: font.regular },
  hint: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: space(2) },
  note: { marginBottom: space(2) },
  noteInput: { fontSize: 15 },
  ownerBtn: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(3),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: space(2),
  },
  ownerSmall: { minHeight: 38, marginBottom: 0, backgroundColor: colors.muted },
  ownerText: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  ownerChosen: { color: colors.text, fontWeight: font.semibold },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.input,
    paddingHorizontal: space(3),
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.card,
  },
  addBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.input, backgroundColor: colors.primary },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  piece: { gap: space(2), padding: space(3), marginTop: space(2), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  pieceTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  pieceTitle: { flex: 1, color: colors.text, fontSize: 14, fontWeight: font.semibold },
  error: { marginTop: space(3) },
});
