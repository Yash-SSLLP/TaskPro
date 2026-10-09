/**
 * Header: the top bar of a screen (back arrow, title, actions), and
 * IconButton, a 44px tap target around one icon (optionally with a label).
 *
 * HeaderIcon is the HRMS navigation bar's round icon (2026-10-08): 42px, with
 * a count badge (how many filters are on) or a dot (a search is running).
 * `titleSlot` takes the title's place, e.g. a search box that spans the bar;
 * `surface` paints the bar in the card colour, the HRMS bar with no rule.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, X } from '../icons';
import { colors, font, space, TAP, type } from '../theme';
import { tr } from '../../i18n';

export function IconButton({ icon: Icon, label, onPress, color = colors.text, size = 22, disabled, showLabel = false, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        showLabel && styles.iconButtonLabeled,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon size={size} color={color} strokeWidth={2} />
      {showLabel ? <Text style={[styles.iconLabel, { color }]}>{label}</Text> : null}
    </Pressable>
  );
}

/**
 * A round icon for the right of a Header, with an optional count or dot.
 * @param {{ icon: any, label: string, onPress: () => void, count?: number, dot?: boolean,
 *   color?: string, disabled?: boolean }} props
 */
export function HeaderIcon({ icon: Icon, label, onPress, count = 0, dot = false, color = colors.text, disabled, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count}` : label}
      style={({ pressed }) => [styles.navBtn, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      <Icon size={22} color={color} strokeWidth={2} />
      {count > 0 ? (
        <View style={styles.navBadge}>
          <Text style={styles.navBadgeText} maxFontSizeMultiplier={1.1}>
            {count}
          </Text>
        </View>
      ) : null}
      {!count && dot ? <View style={styles.navDot} /> : null}
    </Pressable>
  );
}

/**
 * @param {{ title: string, subtitle?: string, back?: boolean | 'close', onBack?: () => void,
 *   right?: React.ReactNode, large?: boolean, titleSlot?: React.ReactNode, surface?: boolean }} props
 */
export function Header({ title, subtitle, back = false, onBack, right, large = false, titleSlot, surface = false }) {
  const navigation = useNavigation();
  return (
    <View style={[styles.bar, large && styles.barLarge, surface && styles.barSurface]}>
      {back ? (
        <IconButton
          icon={back === 'close' ? X : ArrowLeft}
          label={back === 'close' ? tr('Close') : tr('Back')}
          onPress={onBack || (() => navigation.goBack())}
          style={styles.back}
        />
      ) : null}
      {titleSlot ? (
        <View style={[styles.slot, !back && styles.titlesNoBack]}>{titleSlot}</View>
      ) : (
        <View style={[styles.titles, !back && styles.titlesNoBack]}>
          <Text style={large ? styles.titleLarge : styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(1),
    backgroundColor: colors.bg,
  },
  barLarge: { minHeight: 64, paddingTop: space(1) },
  barSurface: { backgroundColor: colors.card },
  back: { marginRight: space(1) },
  titles: { flex: 1, justifyContent: 'center' },
  titlesNoBack: { paddingLeft: space(3) },
  // The search box (or whatever stands in for the title) takes the whole bar.
  slot: { flex: 1, justifyContent: 'center', paddingRight: space(2), paddingVertical: space(2) },
  title: { fontSize: 18, fontWeight: font.bold, color: colors.text },
  titleLarge: { ...type.title },
  subtitle: { ...type.caption, marginTop: 1 },
  right: { flexDirection: 'row', alignItems: 'center' },
  iconButton: {
    minWidth: TAP,
    height: TAP,
    borderRadius: TAP / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonLabeled: { flexDirection: 'row', paddingHorizontal: space(3), gap: space(1.5) },
  iconLabel: { fontSize: 15, fontWeight: font.semibold },
  navBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  navBadge: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  navBadgeText: { color: colors.onPrimary, fontSize: 10, fontWeight: '800' },
  navDot: { position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  pressed: { backgroundColor: colors.muted },
  disabled: { opacity: 0.4 },
});
