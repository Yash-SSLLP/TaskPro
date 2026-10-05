/**
 * − value + : a number chosen in steps, with the value worded in the middle
 * ("3 days", "15th", "2 hours").
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, font, radius, space } from '../../platform/theme';
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
          style={[styles.btn, value <= min && styles.off]}
          accessibilityRole="button"
          accessibilityLabel={tr('Less')}
        >
          <Minus size={18} color={colors.text} />
        </Pressable>
        <Text style={styles.value}>{format ? format(value) : value}</Text>
        <Pressable
          onPress={() => set(value + 1)}
          disabled={value >= max}
          style={[styles.btn, value >= max && styles.off]}
          accessibilityRole="button"
          accessibilityLabel={tr('More')}
        >
          <Plus size={18} color={colors.text} />
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
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: font.semibold, flexShrink: 1 },
  ctl: { flexDirection: 'row', alignItems: 'center', gap: space(2.5) },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  off: { opacity: 0.35 },
  value: { minWidth: 76, textAlign: 'center', color: colors.text, fontSize: 15, fontWeight: font.bold },
});
