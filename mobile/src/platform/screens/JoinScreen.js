/**
 * An invite link, opened in the app (/join/<pin>?w=<sig>): who invited me,
 * whether we'd WhatsApp each other about tasks, and "Add <name>", which makes
 * us contacts at once. A link opened before signing in waits for it
 * (navigation/links.js), so a new person lands here after signing up.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import productConfig from '../../product/config';
import { WhatsAppIcon, WHATSAPP_GREEN } from '../components/WhatsAppIcon';
import { contactsApi, platformKeys } from '../endpoints';
import { UserPlus } from '../icons';
import { normalizePin } from '../pin';
import { useSession } from '../session';
import { colors, font, radius, space, type } from '../theme';
import { Avatar, Button, ErrorState, Header, Screen, Skeleton, TextButton, toast } from '../ui';

export default function JoinScreen({ navigation, route }) {
  const qc = useQueryClient();
  const me = useSession((s) => s.user);
  const pin = normalizePin(route.params?.pin);
  const w = route.params?.w || '';
  const [busy, setBusy] = useState(false);

  const q = useQuery({ queryKey: ['invite', pin, w], queryFn: () => contactsApi.invite(pin, w), retry: false });
  const inviter = q.data?.inviter;
  const whatsapp = !!q.data?.whatsapp;
  const first = String(inviter?.name || '').split(' ')[0];
  const own = inviter && inviter.id === me?.id;

  const join = async () => {
    setBusy(true);
    try {
      const res = await contactsApi.join(pin, w);
      qc.invalidateQueries({ queryKey: platformKeys.contacts });
      toast.success(
        res?.status === 'already'
          ? tr('You and {name} are already contacts.', { name: first })
          : tr('{name} is now a contact.', { name: inviter.name })
      );
      navigation.replace('Contacts');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (q.isPending) body = <Skeleton height={260} r={radius.card} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={q.refetch} />;
  else {
    body = (
      <View style={styles.card}>
        <Avatar person={inviter} size={84} />
        <Text style={styles.title}>
          {own ? tr('This is your own invite link') : tr('{name} invited you to {app}', { name: inviter.name, app: productConfig.name })}
        </Text>
        {inviter.title ? <Text style={styles.sub}>{inviter.title}</Text> : null}
        <Text style={styles.text}>
          {own
            ? tr('Send it to someone so they can join you.')
            : tr('In {app}, you give each other tasks, follow them up and get reminders. Task Pin {pin}.', { app: productConfig.name, pin: inviter.pinDisplay })}
        </Text>
        {whatsapp && !own ? (
          <View style={styles.wa}>
            <WhatsAppIcon size={20} />
            <Text style={styles.waText}>
              {tr("You'll also be able to WhatsApp each other about tasks: {name} sees your mobile number on tasks you share, and you see theirs. Either of you can switch it off in Contacts.", { name: first })}
            </Text>
          </View>
        ) : null}
        {whatsapp && !own && !me?.phone ? (
          <TextButton title={tr('Add your mobile number in Profile so {name} can WhatsApp you.', { name: first })} onPress={() => navigation.navigate('Profile')} style={styles.phone} />
        ) : null}
      </View>
    );
  }

  return (
    <Screen
      header={<Header back title={tr('Invite')} />}
      scroll
      footer={
        inviter && !own ? <Button title={tr('Add {name} as a contact', { name: first })} icon={UserPlus} size="lg" loading={busy} onPress={join} /> : null
      }
    >
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space(6),
    marginTop: space(2),
  },
  title: { fontSize: 22, fontWeight: font.bold, color: colors.text, textAlign: 'center', marginTop: space(4) },
  sub: { ...type.caption, marginTop: 2 },
  text: { ...type.small, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: space(2) },
  wa: {
    flexDirection: 'row',
    gap: space(2.5),
    alignItems: 'flex-start',
    marginTop: space(4),
    padding: space(3),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: `${WHATSAPP_GREEN}55`,
    backgroundColor: `${WHATSAPP_GREEN}1A`,
  },
  waText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  phone: { marginTop: space(3) },
});
