/**
 * Badge: a small coloured label ("Owner", "Switched off", "View only") and
 * Dot, the unread marker.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme';

const TONES = {
  neutral: [colors.muted, colors.textSecondary],
  primary: [colors.primarySoft, colors.primary],
  success: [colors.successSoft, colors.success],
  danger: [colors.dangerSoft, colors.danger],
  warning: [colors.warningSoft, colors.warning],
  info: [colors.infoSoft, colors.info],
};

export function Badge({ label, tone = 'neutral', style, bg, fg }) {
  const [b, f] = TONES[tone] || TONES.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: bg || b }, style]}>
      <Text style={[styles.text, { color: fg || f }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Dot({ color = colors.primary, size = 10, style }) {
  return <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space(2.5),
    paddingVertical: space(0.75),
    borderRadius: radius.chip,
  },
  text: { fontSize: 12, fontWeight: font.semibold },
});
