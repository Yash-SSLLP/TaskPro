/**
 * One person, in full, for the Super Admin: who they are, how they sign in,
 * their teams and figures; every device they are signed in on (sign one out,
 * or all of them); their notification settings (the daily summary and the
 * default reminders can be changed here); what they did lately; and the
 * switches: switch off or on (switching off signs them out), reset the
 * password (they choose a new one at next sign-in), delete for good (typed
 * confirmation), and open their tasks.
 */
import React, { useEffect, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BellRing from 'lucide-react-native/icons/bell-ring';
import productConfig from '../../product/config';
import { tr } from '../../i18n';
import { platformApi, platformKeys } from '../endpoints';
import { formatDate, formatDateTime, relativeTime } from '../format';
import { usePullRefresh } from '../hooks';
import { KeyRound, LayoutDashboard, LogOut, Plus, Power, RefreshCw, Share as ShareIcon, Trash, Users, X } from '../icons';
import { pinOf, roleLabel, roleTone } from '../pin';
import { colors, font, radius, space, type } from '../theme';
import {
  Badge, BottomSheet, Button, Card, Chip, ChipRow, ErrorState, Header, IconButton, ListRow, Notice, Screen, Section, SkeletonList,
  SwitchRow, TextField, TimeField, confirm, toast,
} from '../ui';
import { ActivityRow, deviceLine, OnlineDot, PersonAvatar, PlatformIcon, seenLabel, useLivePolling, useRelease, VersionLine } from './admin/shared';

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

const LANGS = { en: 'English', hi: 'हिन्दी', kn: 'ಕನ್ನಡ', ta: 'தமிழ்', te: 'తెలుగు', ml: 'മലയാളം' };

/** A default reminder rule in words ("1 day before"). */
function ruleLabel(r) {
  if (r.when === 'EVERY') {
    if (r.pattern === 'HOURLY') return tr('Every hour');
    if (r.pattern === 'DAILY') return tr('Every day');
    return tr('Every');
  }
  const n = r.amount;
  if (r.unit === 'DAYS') {
    if (r.when === 'AFTER') return n === 1 ? tr('1 day after') : tr('{n} days after', { n });
    return n === 1 ? tr('1 day before') : tr('{n} days before', { n });
  }
  if (r.unit === 'HOURS') {
    if (r.when === 'AFTER') return n === 1 ? tr('1 hour after') : tr('{n} hours after', { n });
    return n === 1 ? tr('1 hour before') : tr('{n} hours before', { n });
  }
  return r.when === 'AFTER' ? tr('{n} min after', { n }) : tr('{n} min before', { n });
}

/** Reminders the Super Admin can add with one tap. */
const PRESETS = [
  { channel: 'APP', when: 'BEFORE', amount: 15, unit: 'MINUTES' },
  { channel: 'APP', when: 'BEFORE', amount: 1, unit: 'HOURS' },
  { channel: 'APP', when: 'BEFORE', amount: 1, unit: 'DAYS' },
  { channel: 'APP', when: 'BEFORE', amount: 2, unit: 'DAYS' },
  { channel: 'APP', when: 'AFTER', amount: 1, unit: 'HOURS' },
];
const sameRule = (a, b) => a.when === b.when && a.amount === b.amount && a.unit === b.unit && (a.pattern || '') === (b.pattern || '');

function pushText(p) {
  if (p === 'granted') return tr('Allowed on their phone');
  if (p === 'denied') return tr('Turned off on their phone');
  if (p === 'undetermined') return tr('Not asked yet on their phone');
  return tr('No phone has said yet');
}

function Figure({ label, value, tint }) {
  return (
    <View style={styles.figure}>
      <Text style={[styles.figureValue, tint && { color: tint }]}>{value ?? 0}</Text>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

/** The daily summary and default reminders, editable; the rest of their notification picture, read-only. */
function Notifications({ id, n, onSaved }) {
  const [digest, setDigest] = useState(n.dailyDigest);
  const [at, setAt] = useState(n.dailyDigestAt);
  const [rules, setRules] = useState(n.defaultReminders || []);
  const [busy, setBusy] = useState(false);
  // Follow the server only when its values really change (a refetch brings new arrays every time).
  const serverRules = JSON.stringify(n.defaultReminders || []);
  useEffect(() => {
    setDigest(n.dailyDigest);
    setAt(n.dailyDigestAt);
    setRules(JSON.parse(serverRules));
  }, [n.dailyDigest, n.dailyDigestAt, serverRules]);

  const dirty = digest !== n.dailyDigest || at !== n.dailyDigestAt || JSON.stringify(rules) !== serverRules;
  const save = async () => {
    setBusy(true);
    try {
      const res = await platformApi.updateSettings(id, { dailyDigest: digest, dailyDigestAt: at, defaultReminders: rules });
      onSaved(res.notifications);
      toast.success(tr('Saved'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const addable = PRESETS.filter((p) => !rules.some((r) => sameRule(r, p)));

  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{tr('Notifications')}</Text>
      <Card style={styles.notifCard}>
        <SwitchRow
          boxed={false}
          label={tr('Daily summary')}
          description={tr('An evening alert with their open, overdue and in-review tasks.')}
          value={digest}
          onChange={setDigest}
        />
        {digest ? <TimeField label={tr('Sent at')} value={at} onChange={setAt} style={styles.time} /> : null}
        <Text style={styles.subTitle}>{tr('Default reminders')}</Text>
        <Text style={styles.subText}>{tr('Added to a task they set without reminders of its own.')}</Text>
        <ChipRow style={styles.chips}>
          {rules.length ? (
            rules.map((r, i) => (
              <Chip
                key={`${i}-${ruleLabel(r)}`}
                label={ruleLabel(r)}
                selected
                trailingIcon={X}
                accessibilityLabel={tr('Remove {what}', { what: ruleLabel(r) })}
                onPress={() => setRules((list) => list.filter((_, j) => j !== i))}
              />
            ))
          ) : (
            <Text style={styles.subText}>{tr('None')}</Text>
          )}
        </ChipRow>
        {rules.length < 5 && addable.length ? (
          <>
            <Text style={styles.subText}>{tr('Tap to add:')}</Text>
            <ChipRow style={styles.chips}>
              {addable.map((p) => (
                <Chip key={ruleLabel(p)} label={ruleLabel(p)} icon={Plus} onPress={() => setRules((list) => [...list, p])} />
              ))}
            </ChipRow>
          </>
        ) : null}
        {dirty ? (
          <View style={styles.row2}>
            <Button
              title={tr('Undo')}
              variant="secondary"
              style={styles.flex}
              onPress={() => {
                setDigest(n.dailyDigest);
                setAt(n.dailyDigestAt);
                setRules(JSON.parse(serverRules));
              }}
            />
            <Button title={tr('Save')} style={styles.flex} loading={busy} onPress={save} />
          </View>
        ) : null}
      </Card>
      <Card padded={false} style={styles.notifFacts}>
        <ListRow icon={BellRing} title={tr('Push on their phone')} subtitle={pushText(n.pushPermission)} />
        <ListRow title={tr('Phones registered for push')} right={String(n.devices || 0)} />
        <ListRow title={tr('Time zone')} right={n.timezone} />
        <ListRow title={tr('Work day starts')} right={n.workdayStart} />
        <ListRow title={tr('Language')} right={LANGS[n.lang] || n.lang} />
      </Card>
    </View>
  );
}

export default function AdminPersonScreen({ navigation, route }) {
  const id = route.params?.id;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: platformKeys.user(id), queryFn: () => platformApi.user(id), enabled: !!id });
  const release = useRelease().data;
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  // Who is online changes by the minute: keep this page current while it is open.
  useLivePolling(q.refetch, 30000);
  const [resetOpen, setResetOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [resetError, setResetError] = useState(null);
  const [resetDone, setResetDone] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleteError, setDeleteError] = useState(null);

  const u = q.data?.user;
  const teams = q.data?.teams || [];
  const stats = q.data?.stats || {};
  const sessions = q.data?.sessions || [];
  const recent = (q.data?.recent || []).slice(0, 8);
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

  const signOutDevice = async (s) => {
    const ok = await confirm({
      title: tr('Sign {name} out on {device}?', { name: u.name, device: deviceLine(s) }),
      message: tr('That device goes back to the sign-in screen the next time it opens KARO. Their other devices stay signed in.'),
      confirmLabel: tr('Sign out'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await platformApi.revokeSession(s.sid);
      toast.success(tr('Signed out on that device.'));
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const signOutAll = async () => {
    const ok = await confirm({
      title: tr('Sign {name} out everywhere?', { name: u.name }),
      message: tr('Every device they are signed in on goes back to the sign-in screen. Their password and their data stay as they are.'),
      confirmLabel: tr('Sign out everywhere'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await platformApi.signOutEverywhere(id);
      toast.success(tr('Signed out everywhere.'));
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

  const openDelete = () => {
    setTyped('');
    setDeleteError(null);
    setDeleteOpen(true);
  };
  const doDelete = async () => {
    if (typed.trim() !== 'DELETE') {
      setDeleteError(tr('Type DELETE (in capitals) to confirm.'));
      return;
    }
    setDeleteError(null);
    try {
      await platformApi.deleteUser(id);
      setDeleteOpen(false);
      qc.removeQueries({ queryKey: platformKeys.user(id) });
      qc.invalidateQueries({ queryKey: platformKeys.console });
      toast.success(tr('{name}’s account is deleted.', { name: u.name }));
      navigation.goBack();
    } catch (e) {
      setDeleteError(e.message);
    }
  };

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

  const online = !!q.data.online;
  const seen = online ? tr('Online now') : u.lastSeenAt ? tr('seen {when}', { when: relativeTime(u.lastSeenAt) }) : tr('Never');

  return (
    <Screen header={header} scroll refreshing={refreshing} onRefresh={onRefresh}>
      <Card style={styles.head}>
        <PersonAvatar person={u} size={56} online={online} dimmed={off} />
        <View style={styles.flex}>
          <Text style={styles.name}>{u.name}</Text>
          {u.title ? <Text style={styles.sub}>{u.title}</Text> : null}
          <View style={styles.seenRow}>
            <OnlineDot online={online} />
            <Text style={styles.sub}>{seen}</Text>
          </View>
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
        <ListRow title={tr('Last sign-in')} right={q.data.lastLoginAt ? formatDateTime(q.data.lastLoginAt) : tr('Never')} />
        <ListRow title={tr('Last seen')} right={u.lastSeenAt ? relativeTime(u.lastSeenAt) : tr('Never')} />
      </Section>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>{tr('Signed in on')}</Text>
        <Card padded={false} style={styles.sectionCard}>
          {sessions.length ? (
            sessions.map((s, i) => (
              <View key={s.sid} style={[styles.session, i > 0 && styles.rule]}>
                <View style={styles.sessionIcon}>
                  <PlatformIcon platform={s.platform} size={18} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.sessionTitle} numberOfLines={1}>
                    {deviceLine(s)}
                  </Text>
                  <VersionLine s={s} latest={release} style={styles.sessionLine} />
                  <View style={[styles.seenRow, styles.sessionLine]}>
                    <OnlineDot online={s.online} />
                    <Text style={styles.sub}>{seenLabel(s)}</Text>
                  </View>
                  <Text style={styles.faint}>
                    {s.legacy ? tr('Signed in before devices were tracked') : tr('Signed in {when}', { when: s.createdAt ? formatDateTime(s.createdAt) : '—' })}
                  </Text>
                </View>
                <IconButton icon={LogOut} label={tr('Sign out')} color={colors.danger} onPress={() => signOutDevice(s)} />
              </View>
            ))
          ) : (
            <Text style={styles.empty}>{tr('Not signed in anywhere.')}</Text>
          )}
        </Card>
        {sessions.length ? <Button title={tr('Sign out everywhere')} icon={LogOut} variant="secondary" color={colors.danger} onPress={signOutAll} style={styles.gapTop} /> : null}
      </View>

      {q.data.notifications ? (
        <Notifications
          id={id}
          n={q.data.notifications}
          onSaved={(next) => qc.setQueryData(platformKeys.user(id), (old) => (old ? { ...old, notifications: next } : old))}
        />
      ) : null}

      {teams.length ? (
        <Section title={tr('Teams')}>
          {teams.map((t) => (
            <ListRow key={t.id} icon={Users} title={t.name} right={<Badge label={roleLabel(t.role)} tone={roleTone(t.role)} style={styles.badge} />} onPress={() => navigation.navigate('TeamDetail', { id: t.id })} />
          ))}
        </Section>
      ) : null}

      <View style={styles.block}>
        <View style={styles.blockHead}>
          <Text style={styles.blockTitle}>{tr('Recent activity')}</Text>
          <Button title={tr('See all')} variant="ghost" size="sm" full={false} onPress={() => navigation.navigate('AdminActivity', { userId: u.id, userName: u.name })} />
        </View>
        <Card padded={false} style={styles.sectionCard}>
          {recent.length ? (
            recent.map((item, i) => (
              <View key={item.id} style={i > 0 ? styles.rule : null}>
                <ActivityRow item={item} withDay onPress={() => navigation.navigate('AdminActivity', { userId: u.id, userName: u.name })} />
              </View>
            ))
          ) : (
            <Text style={styles.empty}>{tr('Nothing yet.')}</Text>
          )}
        </Card>
      </View>

      <Section title={tr('Actions')}>
        <ListRow
          icon={LayoutDashboard}
          title={tr('Their tasks')}
          onPress={() => navigation.navigate('Main', { screen: 'AllTasks', params: { pile: 'all', assignedTo: u.id, nonce: Date.now() } })}
        />
        {u.role !== 'superadmin' ? <ListRow icon={KeyRound} title={tr('Reset password')} onPress={openReset} /> : null}
        {u.role !== 'superadmin' ? <ListRow icon={Power} title={off ? tr('Switch on') : tr('Switch off')} danger={!off} chevron={false} onPress={toggle} /> : null}
        {u.role !== 'superadmin' ? <ListRow icon={Trash} title={tr('Delete permanently')} danger chevron={false} onPress={openDelete} /> : null}
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

      <BottomSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title={tr('Delete {name}’s account for good?', { name: u.name })}>
        <View>
          <Text style={styles.intro}>{tr('This cannot be undone. Gone at once: their logins, Task Pin, profile and settings; their contacts and team places (teams they own pass to someone else); their devices, alerts and reminders; and tasks nobody else is on. Work shared with others stays with them, showing "Deleted user".')}</Text>
          <TextField label={tr('Type DELETE to confirm')} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" />
          <Notice tone="danger">{deleteError}</Notice>
          <Button title={tr('Delete for good')} variant="danger" size="lg" disabled={typed.trim() !== 'DELETE'} onPress={doDelete} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(4), marginBottom: space(4) },
  name: { fontSize: 20, fontWeight: font.bold, color: colors.text },
  sub: { ...type.small },
  faint: { ...type.caption, color: colors.textFaint, marginTop: 2 },
  seenRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1.5), marginTop: space(2) },
  badge: { alignSelf: 'center' },
  figures: { flexDirection: 'row', gap: space(2), marginBottom: space(5) },
  figure: { flex: 1, padding: space(3), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  figureValue: { fontSize: 20, fontWeight: font.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  block: { marginBottom: space(5) },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockTitle: { ...type.overline, marginBottom: space(2), marginLeft: space(1) },
  sectionCard: { overflow: 'hidden' },
  session: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3), paddingLeft: space(4), paddingRight: space(1), paddingVertical: space(3) },
  sessionIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  sessionTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.text },
  sessionLine: { marginTop: 3 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  empty: { ...type.small, padding: space(4) },
  gapTop: { marginTop: space(3) },
  notifCard: { gap: space(2) },
  notifFacts: { marginTop: space(3), overflow: 'hidden' },
  time: { marginBottom: space(1) },
  subTitle: { fontSize: 16, fontWeight: font.medium, color: colors.text, marginTop: space(2) },
  subText: { ...type.caption },
  chips: { marginVertical: space(1) },
  row2: { flexDirection: 'row', gap: space(3), marginTop: space(2) },
  intro: { ...type.small, lineHeight: 20, marginBottom: space(4) },
  temp: { padding: space(4), borderRadius: radius.input, backgroundColor: colors.muted, marginBottom: space(4), alignItems: 'center' },
  tempLabel: { ...type.caption },
  tempValue: { fontSize: 24, fontWeight: font.bold, color: colors.text, letterSpacing: 1, marginTop: space(1) },
});
