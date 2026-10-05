/**
 * "Your Task Pin": the pin in big letters, with Copy, Share and WhatsApp.
 * Shown after sign-up, at the top of Contacts and on the More tab.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { Copy, MessageCircle, Share } from '../icons';
import { copyPin, pinOf, sharePin, whatsappPin } from '../pin';
import { colors, font, radius, space, type } from '../theme';
import { toast } from '../ui';

function Action({ icon: Icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Icon size={18} color={colors.primary} strokeWidth={2.25} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

/**
 * @param {{ user: object, compact?: boolean, hint?: string, style?: any }} props
 */
export function PinCard({ user, compact = false, hint, style }) {
  const pin = pinOf(user);
  if (!pin) return null;
  const copy = async () => {
    try {
      await copyPin(user);
      toast.success(tr('Task Pin copied'));
    } catch {
      toast.error(tr('Could not copy. Long-press the pin to select it.'));
    }
  };
  return (
    <View style={[styles.card, compact && styles.cardCompact, style]}>
      <Text style={styles.label}>{tr('Your Task Pin')}</Text>
      <Text
        style={[styles.pin, compact && styles.pinCompact]}
        selectable
        accessibilityLabel={tr('Your Task Pin is {pin}', { pin: pin.split('').join(' ') })}
      >
        {pin}
      </Text>
      <Text style={styles.hint}>{hint || tr('Share it so people can add you and give you tasks.')}</Text>
      <View style={styles.actions}>
        <Action icon={Copy} label={tr('Copy')} onPress={copy} />
        <Action icon={Share} label={tr('Share')} onPress={() => sharePin(user)} />
        <Action icon={MessageCircle} label={tr('WhatsApp')} onPress={() => whatsappPin(user)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    padding: space(5),
    alignItems: 'center',
  },
  cardCompact: { padding: space(4) },
  label: { ...type.overline, color: colors.primary },
  pin: {
    fontSize: 38,
    fontWeight: font.bold,
    color: colors.text,
    letterSpacing: 3,
    marginTop: space(2),
    fontVariant: ['tabular-nums'],
  },
  pinCompact: { fontSize: 30, letterSpacing: 2 },
  hint: { ...type.caption, textAlign: 'center', marginTop: space(2) },
  actions: { flexDirection: 'row', gap: space(2), marginTop: space(4), alignSelf: 'stretch' },
  action: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
    borderRadius: radius.button,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    paddingHorizontal: space(2),
  },
  actionText: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  pressed: { opacity: 0.75 },
});
