/**
 * More: me (name and Task Pin), the places that are not tabs (Contacts,
 * Teams, Dashboard; Recurring for the Super Admin), my settings, language,
 * appearance, account, about and sign out.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import productConfig from '../../product/config';
import { languageName, tr, useLang } from '../../i18n';
import { useContacts, useTeams } from '../hooks';
import { themeLabel, ThemeSheet } from '../appearance';
import { BookUser, Download, Info, KeyRound, Languages, LayoutDashboard, LogOut, RefreshCw, Settings, ShieldCheck, SunMoon, Trash, User, Users } from '../icons';
import { LanguageSheet } from '../language';
import { pinOf, roleLabel } from '../pin';
import { isSuperAdmin, useSession } from '../session';
import { colors, font, radius, space, theme, type } from '../theme';
import { Avatar, Badge, Card, confirm, Header, ListRow, Screen, Section } from '../ui';
import { canSelfUpdate, installedVersion, useUpdate } from '../updates';

function Count({ n }) {
  if (!n) return null;
  return <Badge label={String(n)} tone="danger" style={styles.badge} />;
}

export default function MoreScreen({ navigation }) {
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const lang = useLang();
  const admin = isSuperAdmin(user);
  const contacts = useContacts().data;
  const teams = useTeams().data;
  const [langOpen, setLangOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const update = useUpdate((s) => s.available);

  const askSignOut = async () => {
    const ok = await confirm({ title: tr('Sign out of {name}?', { name: productConfig.name }), confirmLabel: tr('Sign out') });
    if (ok) await signOut();
  };

  return (
    <Screen inTabs scroll header={<Header large title={tr('More')} />}>
      <Card onPress={() => navigation.navigate('Profile')} style={styles.me} accessibilityLabel={tr('My profile')}>
        <Avatar name={user?.name} size={52} />
        <View style={styles.meText}>
          <Text style={styles.name} numberOfLines={1}>
            {user?.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {admin ? roleLabel('superadmin') : tr('Task Pin: {pin}', { pin: pinOf(user) })}
          </Text>
        </View>
      </Card>

      {!admin ? (
        <Section title={tr('People')}>
          <ListRow
            icon={BookUser}
            title={tr('Contacts')}
            subtitle={tr('Add people by their Task Pin')}
            right={<Count n={contacts?.incoming?.length} />}
            onPress={() => navigation.navigate('Contacts')}
          />
          <ListRow icon={Users} title={tr('Teams')} subtitle={tr('Work together and share tasks')} right={<Count n={teams?.invites?.length} />} onPress={() => navigation.navigate('Teams')} />
        </Section>
      ) : null}

      <Section title={tr('Tasks')}>
        <ListRow icon={LayoutDashboard} title={tr('Dashboard')} subtitle={tr('Who finished what, and on time')} onPress={() => navigation.navigate('Dashboard')} />
        {admin ? <ListRow icon={RefreshCw} title={tr('Recurring')} subtitle={tr('Every repeating task')} onPress={() => navigation.navigate('RecurringList')} /> : null}
      </Section>

      <Section title={tr('Settings')}>
        <ListRow icon={Settings} title={tr('My settings')} subtitle={tr('Time zone, reviews, reminders, daily summary')} onPress={() => navigation.navigate('Settings')} />
        <ListRow icon={Languages} title={tr('Language')} right={languageName(lang)} onPress={() => setLangOpen(true)} />
        <ListRow icon={SunMoon} title={tr('Appearance')} right={themeLabel(theme.mode)} onPress={() => setThemeOpen(true)} />
      </Section>

      <Section title={tr('Account')}>
        <ListRow icon={User} title={tr('My profile')} onPress={() => navigation.navigate('Profile')} />
        <ListRow icon={KeyRound} title={tr('Change password')} onPress={() => navigation.navigate('ChangePassword')} />
        {!admin ? <ListRow icon={Trash} title={tr('Delete account')} danger onPress={() => navigation.navigate('DeleteAccount')} /> : null}
      </Section>

      <Section title={tr('About')}>
        <ListRow icon={Info} title={productConfig.name} right={tr('Version {v}', { v: installedVersion })} />
        {canSelfUpdate ? (
          <ListRow
            icon={Download}
            title={tr('App updates')}
            subtitle={update ? tr('Version {v} is ready to install', { v: update.versionName }) : tr('Check for a newer version')}
            right={update ? <Badge label={tr('New')} tone="danger" style={styles.badge} /> : null}
            onPress={() => navigation.navigate('AppUpdate')}
          />
        ) : null}
        <ListRow icon={ShieldCheck} title={tr('Privacy policy')} onPress={() => navigation.navigate('PrivacyPolicy')} />
      </Section>

      <Section>
        <ListRow icon={LogOut} title={tr('Sign out')} danger onPress={askSignOut} chevron={false} />
      </Section>
      <LanguageSheet visible={langOpen} onClose={() => setLangOpen(false)} />
      <ThemeSheet visible={themeOpen} onClose={() => setThemeOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center', gap: space(4), marginBottom: space(6), borderRadius: radius.card },
  meText: { flex: 1 },
  name: { fontSize: 18, fontWeight: font.semibold, color: colors.text },
  sub: { ...type.small, marginTop: 2 },
  badge: { alignSelf: 'center' },
});
