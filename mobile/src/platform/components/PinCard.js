/**
 * "Your Task Pin": the pin in big letters, and the invite link: one link
 * with the pin in it that gets the app and joins, sent on WhatsApp, the
 * share sheet, or copied. "Let us WhatsApp each other" signs the link so
 * the two can WhatsApp each other about tasks once joined.
 * Shown after sign-up, at the top of Contacts and on the More tab.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { tr } from '../../i18n';
import { Copy, Share } from '../icons';
import { inviteMessage, openWhatsapp, shareText, useInviteLink } from '../invite';
import { copyPin, pinOf } from '../pin';
import { colors, font, radius, space, type } from '../theme';
import { SwitchRow, toast } from '../ui';
import { WhatsAppIcon, WHATSAPP_GREEN } from './WhatsAppIcon';

function Action({ icon: Icon, label, onPress, disabled, solid }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, solid && styles.actionSolid, (pressed || disabled) && styles.pressed]}
    >
      <Icon size={18} color={solid ? '#FFFFFF' : colors.primary} strokeWidth={2.25} />
      <Text style={[styles.actionText, solid && styles.actionTextSolid]} numberOfLines={1}>
        {label}
      </Text>
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
      <Pressable onPress={copy} hitSlop={6} accessibilityRole="button" style={({ pressed }) => [styles.copyPin, pressed && styles.pressed]}>
        <Copy size={15} color={colors.primary} />
        <Text style={styles.copyPinText}>{tr('Copy pin')}</Text>
      </Pressable>
      <InviteLink user={user} />
    </View>
  );
}

/** Send the invite link: the WhatsApp choice, then WhatsApp / Share / Copy. */
function InviteLink({ user }) {
  const [whatsapp, setWhatsapp] = useState(true);
  const url = useInviteLink(whatsapp);
  const message = url ? inviteMessage(user, url, whatsapp) : '';
  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(url);
      toast.success(tr('Invite link copied'));
    } catch {
      toast.error(tr('Could not copy.'));
    }
  };
  return (
    <View style={styles.invite}>
      <Text style={styles.inviteTitle}>{tr('Invite link')}</Text>
      <Text style={styles.inviteHint}>{tr('One link: they get the app, sign up and become your contact. No pin to type.')}</Text>
      <SwitchRow
        boxed={false}
        label={tr('Let us WhatsApp each other about tasks')}
        description={tr("You each see the other's mobile number on tasks you share. Either of you can switch it off.")}
        value={whatsapp}
        onChange={setWhatsapp}
        style={styles.switch}
      />
      <View style={styles.actions}>
        <Action icon={WhatsAppIcon} label={tr('WhatsApp')} solid disabled={!url} onPress={() => openWhatsapp(message)} />
        <Action icon={Share} label={tr('Share')} disabled={!url} onPress={() => shareText(message)} />
        <Action icon={Copy} label={tr('Copy link')} disabled={!url} onPress={copyLink} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
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
    borderColor: colors.primaryBorder,
    paddingHorizontal: space(2),
  },
  actionSolid: { backgroundColor: WHATSAPP_GREEN, borderColor: WHATSAPP_GREEN },
  actionText: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  actionTextSolid: { color: '#FFFFFF' },
  pressed: { opacity: 0.75 },
  copyPin: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), marginTop: space(3), paddingVertical: space(1) },
  copyPinText: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  invite: { alignSelf: 'stretch', marginTop: space(4), paddingTop: space(4), borderTopWidth: 1, borderTopColor: colors.primaryBorder },
  inviteTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  inviteHint: { ...type.caption, marginTop: 2 },
  switch: { marginTop: space(2) },
});
