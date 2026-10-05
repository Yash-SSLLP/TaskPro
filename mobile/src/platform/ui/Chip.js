/**
 * Chips (filters, categories, payment modes) and Segmented, a two-to-four way
 * switch such as Cash In / Cash Out.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme';

export function Chip({
  label,
  selected = false,
  onPress,
  color = colors.primary,
  softColor = colors.primarySoft,
  icon: Icon,
  trailingIcon: Trailing,
  style,
  accessibilityLabel,
}) {
  const fg = selected ? color : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel || label}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: softColor, borderColor: color } : styles.chipIdle,
        pressed && styles.pressed,
        style,
      ]}
    >
      {Icon ? <Icon size={16} color={fg} strokeWidth={2} /> : null}
      <Text style={[styles.chipText, { color: fg }, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
      {Trailing ? <Trailing size={16} color={fg} strokeWidth={2} /> : null}
    </Pressable>
  );
}

/** Chips in a wrapping row, or (scroll) a single horizontally scrolling line. */
export function ChipRow({ children, scroll = false, style, contentStyle }) {
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={style}
        contentContainerStyle={[styles.scrollRow, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.wrapRow, style]}>{children}</View>;
}

/**
 * @param {{ options: Array<{ value: string, label: string, color?: string, icon?: any }>,
 *   value: string, onChange: (v: string) => void }} props
 */
export function Segmented({ options, value, onChange, style, size = 'md' }) {
  const tall = size === 'lg';
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        const bg = selected ? o.color || colors.card : 'transparent';
        const fg = selected ? (o.color ? colors.white : colors.text) : colors.textSecondary;
        const Icon = o.icon;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={[styles.segment, tall && styles.segmentTall, { backgroundColor: bg }, selected && !o.color && styles.segmentRaised]}
          >
            {Icon ? <Icon size={tall ? 20 : 16} color={fg} strokeWidth={2.5} /> : null}
            <Text style={[styles.segmentText, tall && styles.segmentTextTall, { color: fg }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    paddingHorizontal: space(3.5),
    borderRadius: radius.chip,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
  },
  chipIdle: { backgroundColor: colors.card, borderColor: colors.border },
  chipText: { fontSize: 14, fontWeight: font.medium },
  chipTextSelected: { fontWeight: font.semibold },
  pressed: { opacity: 0.75 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  scrollRow: { flexDirection: 'row', gap: space(2), paddingHorizontal: space(4) },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.muted,
    borderRadius: radius.input,
    padding: space(1),
    gap: space(1),
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.input - 3,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space(1.5),
    paddingHorizontal: space(2),
  },
  segmentTall: { minHeight: 48 },
  segmentRaised: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segmentText: { fontSize: 15, fontWeight: font.semibold },
  segmentTextTall: { fontSize: 16, fontWeight: font.bold },
});
