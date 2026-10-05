/**
 * One person, for the Super Admin: who they are, how they sign in, their
 * teams and figures; switch them off or on (switching off signs them out),
 * reset their password (they choose a new one at next sign-in), and open
 * their tasks.
 */
import React, { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import productConfig from '../../product/config';
import { tr } from '../../i18n';
import { platformApi, platformKeys } from '../endpoints';
import { formatDate, relativeTime } from '../format';
import { usePullRefresh } from '../hooks';
import { KeyRound, LayoutDashboard, Power, RefreshCw, Share as ShareIcon, Users } from '../icons';
import { pinOf, roleLabel, roleTone } from '../pin';
import { colors, font, radius, space, type } from '../theme';
import { Avatar, Badge, BottomSheet, Button, Card, ErrorState, Header, ListRow, Notice, Screen, Section, SkeletonList, TextField, confirm, toast } from '../ui';

const LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
/** An easy-to-read temporary password such as "kmrt-4829". */
function tempPassword() {
  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  let word = '';
  for (let i = 0; i < 4; i += 1) word += pick(LETTERS);
  let num = '';
  for (let i = 0; i < 4; i += 1) num += pick(DIGITS);
  return `${word}-${num}`;
}

function Figure({ label, value, tint }) {
  return (
    <View style={styles.figure}>
      <Text style={[styles.figureValue, tint && { color: tint }]}>{value ?? 0}</Text>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

export default function AdminPersonScreen({ navigation, route }) {
  const id = route.params?.id;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: platformKeys.user(id), queryFn: () => platformApi.user(id), enabled: !!id });
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  const [resetOpen, setResetOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [resetError, setResetError] = useState(null);
  const [resetDone, setResetDone] = useState(null);

  const u = q.data?.user;
  const teams = q.data?.teams || [];
  const stats = q.data?.stats || {};
  const off = u?.status === 'disabled';
  const login = u ? u.email || u.phoneDisplay || u.username || '' : '';

  const refresh = () => {
    q.refetch();
    qc.invalidateQueries({ queryKey: platformKeys.console });
  };

  const toggle = async () => {
    const ok = await confirm({
      title: off ? tr('Switch {name} back on?', { name: u.name }) : tr('Switch {name} off?', { name: u.name }),
      message: off ? tr('They can sign in again.') : tr('They are signed out at once and cannot sign in. Their tasks stay.'),
      confirmLabel: off ? tr('Switch on') : tr('Switch off'),
      destructive: !off,
    });
    if (!ok) return;
    try {
      await platformApi.setStatus(id, off ? 'active' : 'disabled');
      toast.success(off ? tr('Switched on.') : tr('Switched off.'));
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const openReset = () => {
    setPassword(tempPassword());
    setResetError(null);
    setResetDone(null);
    setResetOpen(true);
  };
  const doReset = async () => {
    if (password.length < 8) {
      setResetError(tr('Use at least 8 characters'));
      return;
    }
    setResetError(null);
    try {
      await platformApi.resetPassword(id, password);
      setResetDone(password);
      refresh();
    } catch (e) {
      setResetError(e.message);
    }
  };
  const shareReset = () =>
    Share.share({
      message: tr('Your {app} password was reset. Sign in with {login} and this temporary password: {password} — you will choose a new one straight away.', {
        app: productConfig.name,
        login: login || tr('your email or mobile'),
        password: resetDone,
      }),
    }).catch(() => {});

  const header = <Header back title={u?.name || tr('Person')} />;
  if (q.isPending) {
    return (
      <Screen header={header}>
        <SkeletonList rows={4} avatar />
      </Screen>
    );
  }
  if (q.isError || !u) {
    return (
      <Screen header={header}>
        <ErrorState error={q.error} onRetry={q.refetch} />
      </Screen>
    );
  }

  return (
    <Screen header={header} scroll refreshing={refreshing} onRefresh={onRefresh}>
      <Card style={styles.head}>
        <Avatar name={u.name} size={56} dimmed={off} />
        <View style={styles.flex}>
          <Text style={styles.name}>{u.name}</Text>
          {u.title ? <Text style={styles.sub}>{u.title}</Text> : null}
          <View style={styles.badges}>
            {u.role === 'superadmin' ? <Badge label={roleLabel('superadmin')} tone="primary" /> : null}
            <Badge label={off ? tr('Switched off') : tr('Active')} tone={off ? 'danger' : 'success'} />
            {u.mustChangePassword ? <Badge label={tr('Must choose a new password')} tone="warning" /> : null}
          </View>
        </View>
      </Card>

      <View style={styles.figures}>
        <Figure label={tr('Open')} value={stats.open} />
        <Figure label={tr('Given')} value={stats.given} />
        <Figure label={tr('Overdue')} value={stats.overdue} tint={stats.overdue ? colors.danger : undefined} />
        <Figure label={tr('Contacts')} value={q.data?.contacts} />
      </View>

      <Section title={tr('Details')}>
        {pinOf(u) ? <ListRow title={tr('Task Pin')} right={pinOf(u)} /> : null}
        {u.email ? <ListRow title={tr('Email')} right={u.email} /> : null}
        {u.phoneDisplay ? <ListRow title={tr('Mobile')} right={u.phoneDisplay} /> : null}
        {u.username ? <ListRow title={tr('Username')} right={u.username} /> : null}
        <ListRow title={tr('Joined')} right={u.createdAt ? formatDate(u.createdAt) : '—'} />
        <ListRow title={tr('Last seen')} right={u.lastSeenAt ? relativeTime(u.lastSeenAt) : tr('Never')} />
      </Section>

      {teams.length ? (
        <Section title={tr('Teams')}>
          {teams.map((t) => (
            <ListRow key={t.id} icon={Users} title={t.name} right={<Badge label={roleLabel(t.role)} tone={roleTone(t.role)} style={styles.badge} />} onPress={() => navigation.navigate('TeamDetail', { id: t.id })} />
          ))}
        </Section>
      ) : null}

      <Section title={tr('Actions')}>
        <ListRow
          icon={LayoutDashboard}
          title={tr('Their tasks')}
          onPress={() => navigation.navigate('Main', { screen: 'AllTasks', params: { pile: 'all', assignedTo: u.id, nonce: Date.now() } })}
        />
        {u.role !== 'superadmin' ? <ListRow icon={KeyRound} title={tr('Reset password')} onPress={openReset} /> : null}
        {u.role !== 'superadmin' ? <ListRow icon={Power} title={off ? tr('Switch on') : tr('Switch off')} danger={!off} chevron={false} onPress={toggle} /> : null}
      </Section>

      <BottomSheet visible={resetOpen} onClose={() => setResetOpen(false)} title={tr('Reset password')}>
        {resetDone ? (
          <View>
            <Notice tone="success">{tr('Done. {name} must choose a new password at the next sign-in.', { name: u.name })}</Notice>
            <View style={styles.temp}>
              <Text style={styles.tempLabel}>{tr('Temporary password')}</Text>
              <Text style={styles.tempValue} selectable>
                {resetDone}
              </Text>
            </View>
            <Button title={tr('Share with them')} icon={ShareIcon} onPress={shareReset} />
          </View>
        ) : (
          <View>
            <Text style={styles.intro}>{tr('Give them a temporary password. They sign in with it and choose their own straight away.')}</Text>
            <TextField
              label={tr('Temporary password')}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              right={<Button title={tr('New')} icon={RefreshCw} size="sm" variant="ghost" full={false} onPress={() => setPassword(tempPassword())} />}
            />
            <Notice tone="danger">{resetError}</Notice>
            <Button title={tr('Reset password')} size="lg" onPress={doReset} />
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(4), marginBottom: space(4) },
  name: { fontSize: 20, fontWeight: font.bold, color: colors.text },
  sub: { ...type.small, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1.5), marginTop: space(2) },
  badge: { alignSelf: 'center' },
  figures: { flexDirection: 'row', gap: space(2), marginBottom: space(5) },
  figure: { flex: 1, padding: space(3), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  figureValue: { fontSize: 20, fontWeight: font.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  intro: { ...type.small, lineHeight: 20, marginBottom: space(4) },
  temp: { padding: space(4), borderRadius: radius.input, backgroundColor: colors.muted, marginBottom: space(4), alignItems: 'center' },
  tempLabel: { ...type.caption },
  tempValue: { fontSize: 24, fontWeight: font.bold, color: colors.text, letterSpacing: 1, marginTop: space(1) },
});
