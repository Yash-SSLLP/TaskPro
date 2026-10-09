/**
 * EmptyState: an empty screen that teaches in one sentence and offers one
 * button. ErrorState: what went wrong, and "Try again".
 *
 * The HRMS look (2026-10-08): the icon in a soft rounded square with a faint
 * ring, a 16pt title, and the sentence in the quiet label style under it.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CircleAlert, WifiOff } from '../icons';
import { colors, font, space, type } from '../theme';
import { Button } from './Button';
import { tr } from '../../i18n';

export function EmptyState({ icon: Icon, title, message, actionLabel, onAction, actionIcon, compact = false, style }) {
  return (
    <View style={[styles.wrap, compact && styles.compact, style]}>
      {Icon ? (
        <View style={styles.iconCircle}>
          <Icon size={28} color={colors.primary} strokeWidth={2} />
        </View>
      ) : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} icon={actionIcon} full={false} style={styles.action} />
      ) : null}
    </View>
  );
}

export function ErrorState({ error, onRetry, compact = false, style }) {
  const offline = error?.code === 'NETWORK';
  return (
    <View style={[styles.wrap, compact && styles.compact, style]}>
      <View style={[styles.iconCircle, styles.iconError]}>
        {offline ? <WifiOff size={28} color={colors.danger} /> : <CircleAlert size={28} color={colors.danger} />}
      </View>
      <Text style={styles.title}>{offline ? tr('You seem to be offline') : tr("Couldn't load this")}</Text>
      <Text style={styles.message}>{error?.message || tr('Something went wrong. Please try again.')}</Text>
      {onRetry ? <Button title={tr('Try again')} variant="secondary" onPress={onRetry} full={false} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(8), paddingVertical: space(12) },
  compact: { paddingVertical: space(6) },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: `${colors.primary}40`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space(3),
  },
  iconError: { backgroundColor: colors.dangerSoft, borderColor: `${colors.danger}40` },
  title: { fontSize: 16, fontWeight: font.bold, color: colors.text, textAlign: 'center' },
  message: { ...type.caption, fontWeight: font.semibold, textAlign: 'center', marginTop: space(1), lineHeight: 19 },
  action: { marginTop: space(5) },
});
