/**
 * Buttons.
 *
 * Button: primary / secondary / danger / ghost / soft. It shows a spinner
 * while `loading`, and when onPress returns a promise it stays busy until the
 * promise settles, so a double tap never submits twice.
 * TextButton: a small text link. FAB: the floating main action of a list.
 *
 * SMALLER SINCE 2026-10-08 ("reduce the size of all the buttons"), on the
 * HRMS app's scale: sm 32 · md 42 · lg 46, nothing taller. A title too long
 * for one line wraps to a second rather than being cut ("Send for rev…"); the
 * line height keeps two lines inside the same height.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space, TAP, theme } from '../theme';

function useBusyPress(onPress, blocked) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const running = useRef(false);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  const handle = async () => {
    if (blocked || running.current || !onPress) return;
    const result = onPress();
    if (result && typeof result.then === 'function') {
      running.current = true;
      setBusy(true);
      try {
        await result;
      } catch {
        /* the caller shows its own error */
      } finally {
        running.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  };
  return [busy, handle];
}

const SIZES = {
  sm: { height: 32, paddingHorizontal: 12, fontSize: 13, lineHeight: 15, icon: 15 },
  md: { height: 42, paddingHorizontal: 14, fontSize: 15, lineHeight: 18, icon: 17 },
  lg: { height: 46, paddingHorizontal: 16, fontSize: 15, lineHeight: 18, icon: 18 },
};

function palette(variant, color) {
  switch (variant) {
    case 'secondary':
      return { bg: colors.card, fg: color || colors.text, border: colors.borderStrong };
    case 'danger':
      return { bg: colors.dangerFill, fg: colors.white, border: colors.dangerFill };
    case 'ghost':
      return { bg: 'transparent', fg: color || colors.primary, border: 'transparent' };
    case 'soft':
      return { bg: colors.primarySoft, fg: color || colors.primary, border: 'transparent' };
    default:
      return { bg: color || colors.primary, fg: color ? colors.white : colors.onPrimary, border: color || colors.primary };
  }
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled = false,
  color,
  style,
  textStyle,
  full = true,
  accessibilityLabel,
}) {
  const [busy, handle] = useBusyPress(onPress, loading || disabled);
  const showSpinner = loading || busy;
  const p = palette(variant, color);
  const s = SIZES[size] || SIZES.md;
  return (
    <Pressable
      onPress={handle}
      disabled={disabled || showSpinner}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: disabled || showSpinner, busy: showSpinner }}
      style={({ pressed }) => [
        styles.base,
        {
          // A floor, not a fixed height: a larger system font may still grow it.
          minHeight: s.height,
          paddingHorizontal: s.paddingHorizontal,
          backgroundColor: p.bg,
          borderColor: p.border,
        },
        full ? styles.full : styles.auto,
        pressed && !showSpinner && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {showSpinner ? (
        <ActivityIndicator size="small" color={p.fg} />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={s.icon} color={p.fg} strokeWidth={2.25} /> : null}
          <Text
            style={[styles.text, { color: p.fg, fontSize: s.fontSize, lineHeight: s.lineHeight }, textStyle]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function TextButton({ title, onPress, color = colors.primary, style, icon: Icon, disabled, align = 'center' }) {
  const [busy, handle] = useBusyPress(onPress, disabled);
  return (
    <Pressable
      onPress={handle}
      disabled={disabled || busy}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => [
        styles.textButton,
        { justifyContent: align === 'left' ? 'flex-start' : 'center' },
        pressed && styles.pressedText,
        (disabled || busy) && styles.disabled,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={color} style={styles.textSpinner} /> : null}
      {Icon && !busy ? <Icon size={18} color={color} strokeWidth={2} /> : null}
      <Text style={[styles.textButtonText, { color }]}>{title}</Text>
    </Pressable>
  );
}

/**
 * The FAB sits on tab screens, whose curved bottom bar (CurvedTabBar) carries
 * a bubble that rises 25 over its top edge, so the default `bottom` clears it
 * with room to spare — at 16 the bubble ate the corner of a wide button above
 * the middle tab.
 */
export function FAB({ title, icon: Icon, onPress, color = colors.primary, style, bottom = space(9) }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.fab, { backgroundColor: color, bottom }, pressed && styles.pressed, style]}
    >
      {Icon ? <Icon size={20} color={colors.onPrimary} strokeWidth={2.5} /> : null}
      <Text style={styles.fabText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
    </Pressable>
  );
}

/**
 * The FAB's lift: iOS only. Android elevation on a fully rounded view renders
 * blank on some OEM GPUs (the HRMS app's realme/ColorOS finding), so there it
 * sits flat on its colour.
 */
const floating = Platform.select({
  ios: { shadowColor: '#000000', shadowOpacity: theme.dark ? 0.5 : 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  default: {},
});

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: { alignSelf: 'stretch' },
  auto: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2), paddingVertical: 2 },
  text: { fontWeight: font.bold, textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  textButton: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingHorizontal: space(1) },
  textButtonText: { fontSize: 15, fontWeight: font.semibold },
  textSpinner: { marginRight: space(1) },
  pressedText: { opacity: 0.6 },
  fab: {
    position: 'absolute',
    right: space(4),
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...floating,
  },
  fabText: { color: colors.onPrimary, fontSize: 15, fontWeight: '800' },
});
