/**
 * The Super Admin console:
 *   Overview   who is online now, people (active this week, new this week,
 *              switched off), the app (on the latest, out of date, web only,
 *              never reported), organizations, tasks; and the ways in to Who is
 *              online, App versions and the Activity log
 *   People     search by name, pin, email, phone or username; filter by status;
 *              add a person; open one for everything about them
 *   Organizations  search; open one to see its members or delete it
 * All tasks is its own tab.
 */
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Logs from 'lucide-react-native/icons/logs';
import Wifi from 'lucide-react-native/icons/wifi';
import productConfig from '../../product/config';
import { tr } from '../../i18n';
import { platformApi, platformKeys } from '../endpoints';
import { relativeTime } from '../format';
import { usePullRefresh, useRefetchOnFocus } from '../hooks';
import { Building, LayoutDashboard, Search, Smartphone, User, UserPlus, X } from '../icons';
import { pinOf } from '../pin';
import { colors, font, radius, space, type } from '../theme';
import { Badge, Button, Card, Chip, ChipRow, EmptyState, ErrorState, Header, HeaderIcon, ListRow, Screen, ScrollSegmented, SkeletonList } from '../ui';
import { freshness, PersonAvatar, useLivePolling, useRelease } from './admin/shared';

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <View style={styles.search}>
      <Search size={17} color={colors.textFaint} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textFaint} style={styles.searchInput} autoCorrect={false} autoCapitalize="none" />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel={tr('Clear the search')}>
          <X size={17} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Tile({ label, value, tint, onPress, sub }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]} accessibilityRole={onPress ? 'button' : undefined}>
      <Text style={[styles.tileValue, tint && { color: tint }]}>{value ?? '–'}</Text>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text style={styles.tileSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Overview({ navigation, onTab }) {
  const q = useQuery({ queryKey: platformKeys.overview, queryFn: platformApi.overview });
  const release = useRelease().data;
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  // "Online now" is only true for a minute or two: keep it current while the console is open.
  useLivePolling(q.refetch, 30000);
  const d = q.data || {};
  const t = d.tasks || {};
  const app = d.app || {};
  const count = (state) => (app.builds || []).filter((b) => freshness(b, release) === state).reduce((n, b) => n + b.people, 0);
  const latest = q.data ? (release ? count('latest') : app.app) : undefined;
  const behind = q.data ? (release ? count('behind') : 0) : undefined;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const versions = (show) => navigation.navigate('AdminAppVersions', { show });
  return (
    <FlatList
      data={[]}
      renderItem={null}
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.gap}>
          <Text style={styles.group}>{tr('People')}</Text>
          <View style={styles.tiles}>
            <Tile
              label={tr('Online now')}
              value={d.online}
              tint={d.online ? colors.success : undefined}
              sub={q.data ? (d.onlineDevices === 1 ? tr('1 device') : tr('{n} devices', { n: d.onlineDevices || 0 })) : undefined}
              onPress={() => navigation.navigate('AdminOnline')}
            />
            <Tile label={tr('People')} value={d.users} onPress={() => onTab('people')} />
            <Tile label={tr('Active this week')} value={d.activeWeek} />
            <Tile label={tr('New this week')} value={d.newWeek} />
            <Tile label={tr('Switched off')} value={d.disabled} tint={d.disabled ? colors.danger : undefined} onPress={() => onTab('people', 'disabled')} />
            <Tile label={tr('Organizations')} value={d.teams} onPress={() => onTab('teams')} />
          </View>
          <Text style={styles.group}>{tr('{app} app', { app: productConfig.name })}</Text>
          <View style={styles.tiles}>
            <Tile label={tr('On the latest')} value={latest} tint={latest ? colors.success : undefined} onPress={() => versions('latest')} />
            <Tile label={tr('Out of date')} value={behind} tint={behind ? colors.warning : undefined} onPress={() => versions('behind')} />
            <Tile label={tr('Web only')} value={q.data ? app.web : undefined} onPress={() => versions('web')} />
            <Tile label={tr('Never reported')} value={q.data ? (app.unknown || 0) + (app.none || 0) : undefined} onPress={() => versions('never')} />
          </View>
          <Text style={styles.group}>{tr('Tasks')}</Text>
          <View style={styles.tiles}>
            <Tile label={tr('All tasks')} value={t.total} onPress={() => navigation.navigate('Main', { screen: 'AllTasks', params: { pile: 'all', nonce: Date.now() } })} />
            <Tile label={tr('Open')} value={t.open} />
            <Tile label={tr('Overdue')} value={t.overdue} tint={t.overdue ? colors.danger : undefined} />
            <Tile label={tr('In review')} value={t.inReview} />
            <Tile label={tr('Completed')} value={t.completed} tint={colors.success} />
          </View>
          <Card padded={false} style={styles.entries}>
            <ListRow icon={Wifi} title={tr('Who is online')} subtitle={tr('Every device signed in, now, today or this week')} onPress={() => navigation.navigate('AdminOnline')} />
            <ListRow icon={Smartphone} title={tr('App versions')} subtitle={tr('Which {app} version each person is on', { app: productConfig.name })} onPress={() => navigation.navigate('AdminAppVersions')} style={styles.rule} />
            <ListRow icon={Logs} title={tr('Activity log')} subtitle={tr('Sign-ins, task moves and every change')} onPress={() => navigation.navigate('AdminActivity')} style={styles.rule} />
            <ListRow icon={LayoutDashboard} title={tr('Dashboard')} subtitle={tr('Who finished what, and on time')} onPress={() => navigation.navigate('Dashboard')} style={styles.rule} />
          </Card>
        </View>
      }
    />
  );
}

function People({ navigation, initialStatus }) {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState(initialStatus || '');
  useEffect(() => {
    if (initialStatus !== undefined) setStatus(initialStatus);
  }, [initialStatus]);
  const qText = useDebounced(term.trim());
  const q = useQuery({ queryKey: platformKeys.users(qText, status), queryFn: () => platformApi.users(qText, status), placeholderData: (prev) => prev });
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  useRefetchOnFocus(q.refetch);
  const rows = q.data || [];
  return (
    <FlatList
      data={rows}
      keyExtractor={(u) => String(u.id)}
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.gap}>
          <SearchBox value={term} onChange={setTerm} placeholder={tr('Name, Task Pin, email or mobile')} />
          <ChipRow>
            <Chip label={tr('Everyone')} selected={!status} onPress={() => setStatus('')} />
            <Chip label={tr('Active')} selected={status === 'active'} onPress={() => setStatus('active')} />
            <Chip label={tr('Switched off')} selected={status === 'disabled'} onPress={() => setStatus('disabled')} />
          </ChipRow>
          <Button title={tr('Add a person')} icon={UserPlus} variant="soft" onPress={() => navigation.navigate('AdminAddPerson')} />
          {q.isPending ? <SkeletonList rows={6} avatar /> : null}
          {q.isError ? <ErrorState compact error={q.error} onRetry={q.refetch} /> : null}
        </View>
      }
      ListEmptyComponent={!q.isPending && !q.isError ? <EmptyState compact icon={User} title={tr('Nobody found')} message={tr('Try a name, a Task Pin, an email or a mobile number.')} /> : null}
      renderItem={({ item: u }) => (
        <Card padded={false} style={styles.rowCard}>
          <ListRow
            left={<PersonAvatar person={u} size={40} online={u.online} dimmed={u.status === 'disabled'} />}
            title={u.name}
            subtitle={[
              pinOf(u) || (u.role === 'superadmin' ? tr('Super Admin') : ''),
              u.email || u.phoneDisplay,
              u.online ? tr('Online now') : u.lastSeenAt ? tr('seen {when}', { when: relativeTime(u.lastSeenAt) }) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
            subtitleLines={2}
            right={
              <View style={styles.rightCol}>
                {u.status === 'disabled' ? <Badge label={tr('Switched off')} tone="danger" /> : null}
                {u.stats ? (
                  <Text style={styles.stat}>
                    {tr('{n} open', { n: u.stats.open || 0 })}
                    {u.stats.overdue ? ` · ${tr('{n} late', { n: u.stats.overdue })}` : ''}
                  </Text>
                ) : null}
              </View>
            }
            onPress={() => navigation.navigate('AdminPerson', { id: u.id })}
          />
        </Card>
      )}
    />
  );
}

function Teams({ navigation }) {
  const [term, setTerm] = useState('');
  const qText = useDebounced(term.trim());
  const q = useQuery({ queryKey: platformKeys.adminTeams(qText), queryFn: () => platformApi.teams(qText), placeholderData: (prev) => prev });
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  useRefetchOnFocus(q.refetch);
  const rows = q.data || [];
  return (
    <FlatList
      data={rows}
      keyExtractor={(t) => String(t.id)}
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.gap}>
          <SearchBox value={term} onChange={setTerm} placeholder={tr('Search organizations')} />
          {q.isPending ? <SkeletonList rows={5} /> : null}
          {q.isError ? <ErrorState compact error={q.error} onRetry={q.refetch} /> : null}
        </View>
      }
      ListEmptyComponent={!q.isPending && !q.isError ? <EmptyState compact icon={Building} title={tr('No organizations found')} /> : null}
      renderItem={({ item: t }) => (
        <Card padded={false} style={styles.rowCard}>
          <ListRow
            icon={Building}
            title={t.name}
            subtitle={[tr('Owner: {name}', { name: t.owner?.name || '—' }), t.memberCount === 1 ? tr('1 member') : tr('{n} members', { n: t.memberCount || 0 })].join(' · ')}
            onPress={() => navigation.navigate('TeamDetail', { id: t.id })}
          />
        </Card>
      )}
    />
  );
}

export default function ConsoleScreen({ navigation }) {
  const [tab, setTab] = useState('overview');
  const [peopleStatus, setPeopleStatus] = useState(undefined);
  const go = (next, status) => {
    if (next === 'people') setPeopleStatus(status || '');
    setTab(next);
  };
  return (
    <Screen
      inTabs
      padded={false}
      header={
        <Header
          large
          title={tr('Console')}
          subtitle={tr('Super Admin')}
          right={
            <>
              <HeaderIcon icon={Logs} label={tr('Activity log')} onPress={() => navigation.navigate('AdminActivity')} />
              <HeaderIcon icon={UserPlus} label={tr('Add a person')} onPress={() => navigation.navigate('AdminAddPerson')} />
            </>
          }
        />
      }
    >
      <View style={styles.tabs}>
        {/* Sized to its words: "Organizations" (and its Tamil or Malayalam) is cut off in a third of a 360 dp screen. */}
        <ScrollSegmented
          options={[
            { value: 'overview', label: tr('Overview') },
            { value: 'people', label: tr('People') },
            { value: 'teams', label: tr('Organizations') },
          ]}
          value={tab}
          onChange={(v) => go(v)}
        />
      </View>
      {tab === 'overview' ? <Overview navigation={navigation} onTab={go} /> : null}
      {tab === 'people' ? <People navigation={navigation} initialStatus={peopleStatus} /> : null}
      {tab === 'teams' ? <Teams navigation={navigation} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: space(4), paddingBottom: space(2) },
  list: { paddingHorizontal: space(4), paddingBottom: space(10), gap: space(2) },
  gap: { gap: space(3), marginBottom: space(1) },
  group: { ...type.overline, marginTop: space(2) },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  tile: { flexGrow: 1, flexBasis: '45%', padding: space(3), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  tileValue: { fontSize: 24, fontWeight: font.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: font.medium, marginTop: 2 },
  tileSub: { fontSize: 12, color: colors.textFaint, marginTop: 1 },
  pressed: { opacity: 0.85 },
  entries: { marginTop: space(2), overflow: 'hidden' },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    minHeight: 46,
    paddingHorizontal: space(3),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  rowCard: { overflow: 'hidden' },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  stat: { ...type.caption },
});
