/**
 * Buttons.
 *
 * Button: primary / secondary / danger / ghost / soft. It shows a spinner
 * while `loading`, and when onPress returns a promise it stays busy until the
 * promise settles, so a double tap never submits twice.
 * TextButton: a small text link. FAB: the floating main action of a list.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, shadowRaised, space, TAP } from '../theme';

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
  sm: { height: 36, paddingHorizontal: space(3), fontSize: 14, icon: 16 },
  md: { height: 48, paddingHorizontal: space(4), fontSize: 16, icon: 20 },
  lg: { height: 56, paddingHorizontal: space(5), fontSize: 17, icon: 22 },
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
      return { bg: color || colors.primary, fg: colors.white, border: color || colors.primary };
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
          height: s.height,
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
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={s.icon} color={p.fg} strokeWidth={2.25} /> : null}
          <Text style={[styles.text, { color: p.fg, fontSize: s.fontSize }, textStyle]} numberOfLines={1}>
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

export function FAB({ title, icon: Icon, onPress, color = colors.primary, style, bottom = space(4) }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.fab, { backgroundColor: color, bottom }, pressed && styles.pressed, style]}
    >
      {Icon ? <Icon size={22} color={colors.white} strokeWidth={2.5} /> : null}
      <Text style={styles.fabText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: { alignSelf: 'stretch' },
  auto: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  text: { fontWeight: font.semibold },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  textButton: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingHorizontal: space(1) },
  textButtonText: { fontSize: 15, fontWeight: font.semibold },
  textSpinner: { marginRight: space(1) },
  pressedText: { opacity: 0.6 },
  fab: {
    position: 'absolute',
    right: space(4),
    height: 56,
    paddingHorizontal: space(5),
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    ...shadowRaised,
  },
  fabText: { color: colors.white, fontSize: 16, fontWeight: font.bold },
});
