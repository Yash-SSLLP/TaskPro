/**
 * The Super Admin console:
 *   Overview   people (active this week, new this week, switched off), teams,
 *              tasks (open, overdue, in review, completed)
 *   People     search by name, pin, email, phone or username; filter by status;
 *              open one to switch them off or on, or reset their password
 *   Teams      search; open one to see its members or delete it
 * All tasks is its own tab.
 */
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { platformApi, platformKeys } from '../endpoints';
import { relativeTime } from '../format';
import { usePullRefresh, useRefetchOnFocus } from '../hooks';
import { LayoutDashboard, Search, User, Users, X } from '../icons';
import { pinOf } from '../pin';
import { colors, font, radius, space, type } from '../theme';
import { Avatar, Badge, Card, Chip, ChipRow, EmptyState, ErrorState, Header, ListRow, Screen, Segmented, SkeletonList } from '../ui';

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

function Tile({ label, value, tint, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]} accessibilityRole={onPress ? 'button' : undefined}>
      <Text style={[styles.tileValue, tint && { color: tint }]}>{value ?? '–'}</Text>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Overview({ navigation, onTab }) {
  const q = useQuery({ queryKey: platformKeys.overview, queryFn: platformApi.overview });
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  useRefetchOnFocus(q.refetch);
  const d = q.data || {};
  const t = d.tasks || {};
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
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
            <Tile label={tr('People')} value={d.users} onPress={() => onTab('people')} />
            <Tile label={tr('Active this week')} value={d.activeWeek} />
            <Tile label={tr('New this week')} value={d.newWeek} />
            <Tile label={tr('Switched off')} value={d.disabled} tint={d.disabled ? colors.danger : undefined} onPress={() => onTab('people', 'disabled')} />
          </View>
          <Text style={styles.group}>{tr('Teams')}</Text>
          <View style={styles.tiles}>
            <Tile label={tr('Teams')} value={d.teams} onPress={() => onTab('teams')} />
          </View>
          <Text style={styles.group}>{tr('Tasks')}</Text>
          <View style={styles.tiles}>
            <Tile label={tr('All tasks')} value={t.total} onPress={() => navigation.navigate('Main', { screen: 'AllTasks', params: { pile: 'all', nonce: Date.now() } })} />
            <Tile label={tr('Open')} value={t.open} />
            <Tile label={tr('Overdue')} value={t.overdue} tint={t.overdue ? colors.danger : undefined} />
            <Tile label={tr('In review')} value={t.inReview} />
            <Tile label={tr('Completed')} value={t.completed} tint={colors.success} />
          </View>
          <ListRow icon={LayoutDashboard} title={tr('Dashboard')} subtitle={tr('Who finished what, and on time')} onPress={() => navigation.navigate('Dashboard')} style={styles.cardRow} />
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
          {q.isPending ? <SkeletonList rows={6} avatar /> : null}
          {q.isError ? <ErrorState compact error={q.error} onRetry={q.refetch} /> : null}
        </View>
      }
      ListEmptyComponent={!q.isPending && !q.isError ? <EmptyState compact icon={User} title={tr('Nobody found')} message={tr('Try a name, a Task Pin, an email or a mobile number.')} /> : null}
      renderItem={({ item: u }) => (
        <Card padded={false} style={styles.rowCard}>
          <ListRow
            left={<Avatar name={u.name} size={40} dimmed={u.status === 'disabled'} />}
            title={u.name}
            subtitle={[pinOf(u) || (u.role === 'superadmin' ? tr('Super Admin') : ''), u.email || u.phoneDisplay, u.lastSeenAt ? tr('seen {when}', { when: relativeTime(u.lastSeenAt) }) : ''].filter(Boolean).join(' · ')}
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
          <SearchBox value={term} onChange={setTerm} placeholder={tr('Search teams')} />
          {q.isPending ? <SkeletonList rows={5} /> : null}
          {q.isError ? <ErrorState compact error={q.error} onRetry={q.refetch} /> : null}
        </View>
      }
      ListEmptyComponent={!q.isPending && !q.isError ? <EmptyState compact icon={Users} title={tr('No teams found')} /> : null}
      renderItem={({ item: t }) => (
        <Card padded={false} style={styles.rowCard}>
          <ListRow
            icon={Users}
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
    <Screen inTabs padded={false} header={<Header large title={tr('Console')} subtitle={tr('Super Admin')} />}>
      <View style={styles.tabs}>
        <Segmented
          options={[
            { value: 'overview', label: tr('Overview') },
            { value: 'people', label: tr('People') },
            { value: 'teams', label: tr('Teams') },
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
  pressed: { opacity: 0.85 },
  cardRow: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.input, backgroundColor: colors.card, marginTop: space(2) },
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
