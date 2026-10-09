/**
 * − value + : a number chosen in steps, with the value worded in the middle
 * ("3 days", "15th", "2 hours"). Shared by the recurring form's Repeats block
 * and the reminder picker beside it, so the two read as one.
 *
 * The HRMS app's shape (2026-10-08): a muted, rounded strip with a small bold
 * label. The round buttons are 36 rather than 40 (the user: "reduce the size
 * of all the buttons"); hitSlop keeps the touch target at 44.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, radius, space } from '../../platform/theme';
import { Minus, Plus } from '../icons';

export default function Stepper({ label, value, min, max, onChange, format }) {
  const set = (n) => onChange(Math.min(max, Math.max(min, n)));
  return (
    <View style={styles.stepper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.ctl}>
        <Pressable
          onPress={() => set(value - 1)}
          disabled={value <= min}
          hitSlop={4}
          style={({ pressed }) => [styles.btn, value <= min && styles.off, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={tr('Less')}
        >
          <Minus size={17} color={colors.text} />
        </Pressable>
        <Text style={styles.value}>{format ? format(value) : value}</Text>
        <Pressable
          onPress={() => set(value + 1)}
          disabled={value >= max}
          hitSlop={4}
          style={({ pressed }) => [styles.btn, value >= max && styles.off, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={tr('More')}
        >
          <Plus size={17} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(2.5),
    marginTop: space(3),
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  ctl: { flexDirection: 'row', alignItems: 'center', gap: space(2.5) },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  off: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
  value: { minWidth: 70, textAlign: 'center', color: colors.text, fontSize: 15, fontWeight: '800' },
});
