/**
 * Notice: an inline message box (an error under a form, a hint, a warning
 * such as "This book is archived").
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CircleAlert, CircleCheck, Info } from '../icons';
import { colors, radius, space } from '../theme';

const TONES = {
  info: { bg: colors.infoSoft, fg: colors.info, Icon: Info },
  success: { bg: colors.successSoft, fg: colors.success, Icon: CircleCheck },
  warning: { bg: colors.warningSoft, fg: colors.warning, Icon: CircleAlert },
  danger: { bg: colors.dangerSoft, fg: colors.danger, Icon: CircleAlert },
  neutral: { bg: colors.muted, fg: colors.textSecondary, Icon: Info },
};

export function Notice({ tone = 'info', children, action, style }) {
  if (!children) return null;
  const t = TONES[tone] || TONES.info;
  return (
    <View style={[styles.box, { backgroundColor: t.bg }, style]} accessibilityLiveRegion="polite">
      <t.Icon size={18} color={t.fg} style={styles.icon} />
      <View style={styles.body}>
        <Text style={[styles.text, { color: tone === 'neutral' ? colors.text : t.fg }]}>{children}</Text>
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: space(2.5), padding: space(3), borderRadius: radius.input, marginBottom: space(4) },
  icon: { marginTop: 1 },
  body: { flex: 1 },
  text: { fontSize: 14, lineHeight: 20 },
});
