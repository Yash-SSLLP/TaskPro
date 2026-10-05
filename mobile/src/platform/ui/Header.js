/**
 * Header: the top bar of a screen (back arrow, title, actions), and
 * IconButton, a 44px tap target around one icon (optionally with a label).
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
 * @param {{ title: string, subtitle?: string, back?: boolean | 'close', onBack?: () => void,
 *   right?: React.ReactNode, large?: boolean }} props
 */
export function Header({ title, subtitle, back = false, onBack, right, large = false }) {
  const navigation = useNavigation();
  return (
    <View style={[styles.bar, large && styles.barLarge]}>
      {back ? (
        <IconButton
          icon={back === 'close' ? X : ArrowLeft}
          label={back === 'close' ? tr('Close') : tr('Back')}
          onPress={onBack || (() => navigation.goBack())}
          style={styles.back}
        />
      ) : null}
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
  back: { marginRight: space(1) },
  titles: { flex: 1, justifyContent: 'center' },
  titlesNoBack: { paddingLeft: space(3) },
  title: { fontSize: 18, fontWeight: font.semibold, color: colors.text },
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
  pressed: { backgroundColor: colors.muted },
  disabled: { opacity: 0.4 },
});
