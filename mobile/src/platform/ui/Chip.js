/**
 * Chips (filters, categories, payment modes), Segmented, a two-to-four way
 * switch such as Cash In / Cash Out, and ScrollSegmented, the same switch as a
 * row that swipes sideways when there are more choices than fit.
 *
 * THE HRMS CHIP (2026-10-08): a rounded square, quiet grey words, and a
 * SELECTED chip FILLED with its colour under white words, so the choice reads
 * from across the sheet. The border and weight never change with selection,
 * so picking one cannot resize it. `color` is the fill (a priority's solid,
 * say); `dot` draws a small dot before the label in that colour (white once
 * selected). `softColor` is still accepted and no longer used.
 */
import React, { useEffect, useRef } from 'react';
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

/**
 * Segmented as a CAROUSEL, ported from the HRMS app's (ui.js, 2026-10-09): one
 * row that swipes sideways when its segments do not fit. When everything
 * fits, the segments share the full width; when it does not, the row scrolls
 * and the chosen segment is brought to the middle, so the last one peeking at
 * the edge is what says there is more. Selection is paint only: every segment
 * keeps its size (bold on every state, a ring that is always there).
 *
 * `count` draws a small bubble after the label and `alert` tints the segment
 * red (something in it is late). `compact` is the small size (the Tasks
 * screen's organization tabs). The rounded track is never clipped
 * (`overflow: hidden`): a clipped rounded view renders blank on realme/ColorOS,
 * and the ScrollView clips its own content to the inner edge.
 *
 * @param {{ options: Array<{ value: string, label: string, count?: number, alert?: boolean,
 *   accessibilityLabel?: string }>, value: string, onChange: (v: string) => void,
 *   compact?: boolean, accessibilityLabel?: string }} props
 */
export function ScrollSegmented({ options = [], value, onChange, style, compact = false, accessibilityLabel }) {
  const scrollRef = useRef(null);
  const spots = useRef({}); // String(value) -> { x, w } of each segment
  const viewW = useRef(0);
  const placed = useRef(false);
  const reveal = (animated) => {
    const spot = spots.current[String(value)];
    if (!spot || !scrollRef.current || !viewW.current) return;
    scrollRef.current.scrollTo({ x: Math.max(0, spot.x - (viewW.current - spot.w) / 2), animated });
  };
  // A new choice is brought into view; the first paint lands on it without a glide.
  useEffect(() => {
    if (placed.current) reveal(true);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={[styles.seg, compact && styles.segCompact, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.segRow, compact && styles.segRowCompact]}
        onLayout={(e) => {
          viewW.current = e.nativeEvent.layout.width;
        }}
        onContentSizeChange={() => {
          if (!placed.current) {
            placed.current = true;
            reveal(false);
          }
        }}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => onChange(o.value)}
              onLayout={(e) => {
                spots.current[String(o.value)] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              // The web build (iPhones) reads aria-* only; native reads it too.
              aria-selected={on}
              accessibilityLabel={o.accessibilityLabel || o.label}
              hitSlop={compact ? { top: 4, bottom: 4 } : undefined}
              style={({ pressed }) => [
                styles.segBtn,
                compact && styles.segBtnCompact,
                o.alert && !on && styles.segBtnAlert,
                on && styles.segBtnOn,
                pressed && !on && styles.pressed,
              ]}
            >
              <Text style={[styles.segLabel, compact && styles.segLabelCompact, on && styles.segLabelOn]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {o.label}
              </Text>
              {o.count != null ? (
                <View style={[styles.segCount, on && styles.segCountOn, o.alert && styles.segCountAlert]}>
                  <Text style={[styles.segCountText, on && styles.segCountTextOn, o.alert && styles.segCountTextAlert]} maxFontSizeMultiplier={1.2}>
                    {o.count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
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

  // ScrollSegmented: the track stays still and the row inside it scrolls.
  seg: { padding: 4, borderRadius: 14, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  segCompact: { padding: 3, borderRadius: 13 },
  // flexGrow lets the segments share the width when they all fit.
  segRow: { flexGrow: 1, flexDirection: 'row', gap: 6 },
  segRowCompact: { gap: 4 },
  segBtn: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segBtnCompact: { minHeight: 34, paddingHorizontal: 10, gap: 5 },
  segBtnOn: { backgroundColor: colors.card, borderColor: `${colors.primary}66` },
  segBtnAlert: { borderColor: `${colors.danger}40` },
  segLabel: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  segLabelCompact: { fontSize: 12.5 },
  segLabelOn: { color: colors.text },
  segCount: { minWidth: 20, paddingHorizontal: 5, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  segCountOn: { backgroundColor: colors.primarySoft },
  segCountAlert: { backgroundColor: colors.dangerSoft },
  segCountText: { fontSize: 10.5, fontWeight: '800', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  segCountTextOn: { color: colors.text },
  segCountTextAlert: { color: colors.danger },
});
