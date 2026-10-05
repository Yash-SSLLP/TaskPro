/**
 * A task's reminders (and my default reminders in Settings): one repeating
 * rule, every few hours inside a window until the work is done. Rules of
 * other shapes saved earlier ("1 day before", an email one) are kept as they
 * are, listed as chips to be taken off, never dropped by a save.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, font, radius, space } from '../../platform/theme';
import { Plus, Trash, X } from '../icons';
import { reminderLabel } from '../taskStatus';
import ReminderPatternPicker, { repeatingRule } from './ReminderPatternPicker';

export default function ReminderEditor({ value = [], onChange, hourlyOnly = true }) {
  const list = Array.isArray(value) ? value : [];
  const everyAt = list.findIndex((r) => r.when === 'EVERY');
  const replace = (i, rule) => onChange?.(list.map((r, j) => (j === i ? rule : r)));
  const remove = (i) => onChange?.(list.filter((_, j) => j !== i));
  const add = () => onChange?.([...list, repeatingRule('HOURLY')]);
  const others = list.map((r, i) => [r, i]).filter(([r]) => r.when !== 'EVERY');

  return (
    <View>
      {list.length === 0 ? <Text style={styles.empty}>{tr('No reminders. Nobody will be chased about this one.')}</Text> : null}

      {everyAt >= 0 ? (
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.label}>{tr('Every few hours until it is done')}</Text>
            <Pressable
              onPress={() => remove(everyAt)}
              style={styles.trash}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={tr('Remove this reminder')}
            >
              <Trash size={17} color={colors.danger} />
            </Pressable>
          </View>
          <ReminderPatternPicker value={list[everyAt]} allowOff={false} hourlyOnly={hourlyOnly} onChange={(r) => r && replace(everyAt, r)} />
        </View>
      ) : null}

      {others.length > 0 ? (
        <View style={styles.otherRow}>
          {others.map(([r, i]) => (
            <View key={`${r.when}-${r.amount}-${r.unit}-${r.channel}-${i}`} style={styles.otherChip}>
              <Text style={styles.otherText}>
                {reminderLabel(r)}
                {r.channel === 'EMAIL' ? ` · ${tr('email')}` : ''}
              </Text>
              <Pressable
                onPress={() => remove(i)}
                hitSlop={10}
                style={styles.otherX}
                accessibilityRole="button"
                accessibilityLabel={tr('Remove the reminder {label}', { label: reminderLabel(r) })}
              >
                <X size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {everyAt < 0 ? (
        <Pressable onPress={add} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]} accessibilityRole="button">
          <Plus size={17} color={colors.textSecondary} />
          <Text style={styles.addText}>{tr('Add a reminder')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.textFaint, fontSize: 13, lineHeight: 18, marginBottom: space(2) },
  card: {
    padding: space(3),
    marginBottom: space(2),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(2.5) },
  label: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: font.semibold },
  trash: {
    width: 40,
    height: 40,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  otherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1.5), marginBottom: space(2) },
  otherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    minHeight: 34,
    paddingLeft: space(2.5),
    paddingRight: space(1),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  otherText: { color: colors.textSecondary, fontSize: 12, fontWeight: font.semibold },
  otherX: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
    borderRadius: radius.input,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  addText: { color: colors.textSecondary, fontSize: 14, fontWeight: font.semibold },
  pressed: { opacity: 0.8 },
});
