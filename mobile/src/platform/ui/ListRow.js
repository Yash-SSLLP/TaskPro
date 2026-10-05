/**
 * ListRow: one tappable line in a list or Section: something on the left
 * (icon or avatar), a title and sub-line, and something on the right.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from '../icons';
import { colors, font, space } from '../theme';

export function ListRow({
  title,
  subtitle,
  left,
  icon: Icon,
  iconColor,
  right,
  onPress,
  chevron,
  danger = false,
  disabled = false,
  style,
  titleStyle,
  subtitleLines = 1,
  accessibilityLabel,
}) {
  const showChevron = chevron ?? !!onPress;
  const tint = danger ? colors.danger : iconColor || colors.textSecondary;
  const body = (
    <>
      {left ? <View style={styles.left}>{left}</View> : null}
      {!left && Icon ? (
        <View style={styles.left}>
          <Icon size={20} color={tint} strokeWidth={2} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text style={[styles.title, danger && styles.danger, titleStyle]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right != null ? (typeof right === 'string' ? <Text style={styles.rightText}>{right}</Text> : right) : null}
      {showChevron ? <ChevronRight size={18} color={colors.textFaint} style={styles.chevron} /> : null}
    </>
  );
  if (!onPress) return <View style={[styles.row, disabled && styles.disabled, style]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    gap: space(3),
  },
  left: { minWidth: 24, alignItems: 'center' },
  texts: { flex: 1 },
  title: { fontSize: 16, fontWeight: font.medium, color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  rightText: { fontSize: 15, color: colors.textSecondary },
  danger: { color: colors.danger },
  chevron: { marginLeft: -space(1) },
  pressed: { backgroundColor: colors.muted },
  disabled: { opacity: 0.5 },
});
