/**
 * Chips (filters, categories, payment modes) and Segmented, a two-to-four way
 * switch such as Cash In / Cash Out.
 *
 * THE HRMS CHIP (2026-10-08): a rounded square, quiet grey words, and a
 * SELECTED chip FILLED with its colour under white words, so the choice reads
 * from across the sheet. The border and weight never change with selection,
 * so picking one cannot resize it. `color` is the fill (a priority's solid,
 * say); `dot` draws a small dot before the label in that colour (white once
 * selected). `softColor` is still accepted and no longer used.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme';

export function Chip({
  label,
  selected = false,
  onPress,
  color = colors.primary,
  icon: Icon,
  trailingIcon: Trailing,
  dot,
  style,
  accessibilityLabel,
}) {
  const fg = selected ? colors.onPrimary : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel || label}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: color, borderColor: color } : styles.chipIdle,
        pressed && styles.pressed,
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: selected ? colors.onPrimary : dot }]} /> : null}
      {Icon ? <Icon size={15} color={fg} strokeWidth={2.25} /> : null}
      <Text style={[styles.chipText, { color: fg }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      {Trailing ? <Trailing size={13} color={fg} strokeWidth={2.5} /> : null}
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
  // minHeight + padding, never a fixed height: a larger system font grows it.
  chip: {
    minHeight: 38,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chipIdle: { backgroundColor: colors.card, borderColor: colors.border },
  chipText: { fontSize: 13, fontWeight: font.bold, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
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
