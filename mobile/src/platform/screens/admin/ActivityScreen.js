/**
 * The activity log for the Super Admin, as the HRMS audit log reads: the
 * figures at the top (today, 7 days, people active, kept), a search, the kind
 * of activity, a date range and (opened from a person) one person; then
 * every entry as a sentence, grouped by day, newest first, older ones loading
 * as the list is scrolled. An entry opens its details and the other entries
 * about the same task, person or team.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Logs from 'lucide-react-native/icons/logs';
import productConfig from '../../../product/config';
import { tr } from '../../../i18n';
import { platformApi, platformKeys } from '../../endpoints';
import { dayKey, dayLabel, formatDateTime } from '../../format';
import { usePullRefresh, useRefetchOnFocus } from '../../hooks';
import { Search, User, X } from '../../icons';
import { pinOf } from '../../pin';
import { useSettings } from '../../session';
import { colors, font, radius, space, type } from '../../theme';
import { BottomSheet, Button, Chip, ChipRow, EmptyState, ErrorState, Header, Screen, SkeletonList } from '../../ui';
import { ActivityBadge, ActivityRow, ActorMark, platformLabel, Sentence } from './shared';

const DAY = 86400000;

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** From/to days ("YYYY-MM-DD", in the Super Admin's time zone) for a preset. */
function rangeDays(range, tz) {
  if (range === 'today') return { from: dayKey(new Date(), tz), to: '' };
  if (range === '7d') return { from: dayKey(new Date(Date.now() - 6 * DAY), tz), to: '' };
  if (range === '30d') return { from: dayKey(new Date(Date.now() - 29 * DAY), tz), to: '' };
  return { from: '', to: '' };
}

function Tile({ label, value, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [styles.tile, selected && styles.tileOn, pressed && styles.pressed]}
    >
      <Text style={styles.tileValue}>{value ?? '–'}</Text>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Fact({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{children}</Text>
    </View>
  );
}

const REASONS = () => ({
  wrong_password: tr('Wrong password'),
  no_account: tr('No account with that login'),
  disabled: tr('The account is switched off'),
  invalid: tr('Not an email, a mobile number or a username'),
});

/** One entry in full (a sheet), with the others about the same thing. */
function EntrySheet({ id, onClose, onOpenPerson }) {
  const [current, setCurrent] = useState(id);
  useEffect(() => setCurrent(id), [id]);
  const q = useQuery({ queryKey: platformKeys.activityEntry(current), queryFn: () => platformApi.activityEntry(current), enabled: !!current });
  const e = q.data?.entry;
  const m = e?.meta || {};
  const changes = Array.isArray(m.changes) ? m.changes.filter((c) => c && typeof c === 'object') : [];
  const taskChanges = Array.isArray(m.changes) ? m.changes.filter((c) => typeof c === 'string') : [];
  const device = [m.deviceName, m.appVersion ? `${productConfig.name} ${m.appVersion}${m.appBuild ? ` (${m.appBuild})` : ''}` : '', m.osVersion].filter(Boolean).join(' · ');
  const actor = q.data?.actor;
  const subject = q.data?.subject;
  const canOpen = (p) => p && p.role === 'user' && !p.deleted;

  return (
    <BottomSheet visible={!!id} onClose={onClose} title={tr('Activity')} subtitle={e ? formatDateTime(e.at) : undefined}>
      {q.isPending ? <SkeletonList rows={3} /> : null}
      {q.isError ? <ErrorState compact error={q.error} onRetry={q.refetch} /> : null}
      {e ? (
        <View>
          <View style={styles.entryHead}>
            <ActorMark item={e} size={40} />
            <View style={styles.flex}>
              <Sentence item={e} style={styles.entrySentence} />
              <View style={styles.entryBadge}>
                <ActivityBadge badge={e.badge} />
              </View>
            </View>
          </View>
          <View style={styles.facts}>
            <Fact label={tr('Who')}>{actor ? `${actor.name}${pinOf(actor) ? ` · ${pinOf(actor)}` : ''}` : e.actorLabel}</Fact>
            <Fact label={e.target?.kind === 'task' ? tr('Task') : e.target?.kind === 'team' ? tr('Organization') : e.target?.kind === 'user' ? tr('Person') : tr('About')}>
              {e.target?.label || null}
            </Fact>
            <Fact label={tr('From')}>{[e.platform ? platformLabel(e.platform) : '', e.ip].filter(Boolean).join(' · ') || null}</Fact>
            <Fact label={tr('Device')}>{device || null}</Fact>
            <Fact label={tr('Login typed')}>{m.identifier || null}</Fact>
            <Fact label={tr('Why it failed')}>{m.reason ? REASONS()[m.reason] || m.reason : null}</Fact>
            <Fact label={tr('Person')}>{m.person?.name || null}</Fact>
            <Fact label={tr('Changed')}>{taskChanges.length ? taskChanges.join(', ') : null}</Fact>
          </View>
          {changes.map((c, i) => (
            <View key={i} style={styles.change}>
              <Text style={styles.factLabel}>{c.label || c.field}</Text>
              <Text style={styles.factValue}>
                <Text style={styles.before}>{c.before || '—'}</Text>
                {'  →  '}
                <Text style={styles.after}>{c.after || '—'}</Text>
              </Text>
            </View>
          ))}
          {m.note ? <Text style={styles.note}>{m.note}</Text> : null}
          <View style={styles.entryActions}>
            {canOpen(actor) ? (
              <Button title={tr('Open {name}', { name: actor.name })} variant="secondary" size="sm" full={false} onPress={() => onOpenPerson(actor.id)} />
            ) : null}
            {canOpen(subject) && subject.id !== actor?.id ? (
              <Button title={tr('Open {name}', { name: subject.name })} variant="secondary" size="sm" full={false} onPress={() => onOpenPerson(subject.id)} />
            ) : null}
            {e.target?.kind === 'task' ? (
              <Button title={tr('Open the task')} variant="secondary" size="sm" full={false} onPress={() => onOpenPerson(null, e.target.id)} />
            ) : null}
          </View>
          {q.data?.related?.length ? (
            <View style={styles.related}>
              <Text style={styles.relatedTitle}>{tr('More about this')}</Text>
              <View style={styles.relatedCard}>
                {q.data.related.map((r, i) => (
                  <View key={r.id} style={i > 0 ? styles.relatedRule : null}>
                    <ActivityRow item={r} withDay onPress={() => setCurrent(r.id)} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

export default function ActivityScreen({ navigation, route }) {
  const tz = useSettings()?.timezone;
  const [userId, setUserId] = useState(route.params?.userId || '');
  const [userName, setUserName] = useState(route.params?.userName || '');
  useEffect(() => {
    if (route.params?.userId !== undefined) {
      setUserId(route.params.userId || '');
      setUserName(route.params.userName || '');
    }
  }, [route.params?.userId, route.params?.userName]);
  const [term, setTerm] = useState('');
  const [group, setGroup] = useState('');
  const [range, setRange] = useState('all');
  const [open, setOpen] = useState(null);
  const query = useDebounced(term.trim());
  const days = rangeDays(range, tz);
  const filters = { q: query, group, user: userId, from: days.from, to: days.to };
  const filtered = Boolean(query || group || userId || range !== 'all');

  const stats = useQuery({ queryKey: platformKeys.activityStats, queryFn: platformApi.activityStats });
  const list = useInfiniteQuery({
    queryKey: platformKeys.activity(filters),
    queryFn: ({ pageParam }) => platformApi.activity({ ...filters, before: pageParam || undefined, limit: 40 }),
    initialPageParam: '',
    getNextPageParam: (last) => last?.next || undefined,
    placeholderData: (prev) => prev,
  });
  const refetchAll = async () => {
    await Promise.all([list.refetch(), stats.refetch()]);
  };
  const { refreshing, onRefresh } = usePullRefresh(refetchAll);
  useRefetchOnFocus(list.refetch);

  const sections = useMemo(() => {
    const out = [];
    for (const page of list.data?.pages || []) {
      for (const it of page.items || []) {
        const key = dayKey(it.at, tz);
        if (!out.length || out[out.length - 1].key !== key) out.push({ key, title: dayLabel(it.at, tz), data: [] });
        out[out.length - 1].data.push(it);
      }
    }
    return out;
  }, [list.data, tz]);

  const s = stats.data;
  const clear = () => {
    setTerm('');
    setGroup('');
    setRange('all');
    setUserId('');
    setUserName('');
  };
  const openPerson = (id, taskId) => {
    setOpen(null);
    if (taskId) navigation.navigate('TaskDetail', { id: taskId });
    else if (id) navigation.navigate('AdminPerson', { id });
  };

  const GROUPS = [
    { value: '', label: tr('Everything') },
    { value: 'auth', label: tr('Sign-ins') },
    { value: 'tasks', label: tr('Tasks') },
    { value: 'people', label: tr('People') },
    { value: 'admin', label: tr('Admin') },
  ];
  const RANGES = [
    { value: 'all', label: tr('All time') },
    { value: 'today', label: tr('Today') },
    { value: '7d', label: tr('7 days') },
    { value: '30d', label: tr('30 days') },
  ];

  return (
    <Screen padded={false} header={<Header back title={tr('Activity')} subtitle={userName ? tr('Only {name}', { name: userName }) : undefined} />}>
      <SectionList
        sections={sections}
        keyExtractor={(it) => it.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={styles.gap}>
            <View style={styles.tiles}>
              <Tile label={tr('Today')} value={s?.today} selected={range === 'today'} onPress={() => setRange(range === 'today' ? 'all' : 'today')} />
              <Tile label={tr('Last 7 days')} value={s?.week} selected={range === '7d'} onPress={() => setRange(range === '7d' ? 'all' : '7d')} />
              <Tile label={tr('People active (7 days)')} value={s?.people} />
              <Tile label={tr('Kept (180 days)')} value={s?.total} selected={!filtered} onPress={clear} />
            </View>
            <View style={styles.search}>
              <Search size={17} color={colors.textFaint} />
              <TextInput
                value={term}
                onChangeText={setTerm}
                placeholder={tr('Search a person, task, organization or login')}
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {term ? (
                <Pressable onPress={() => setTerm('')} hitSlop={10} accessibilityLabel={tr('Clear the search')}>
                  <X size={17} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
            <ChipRow scroll contentStyle={styles.chipsEdge} style={styles.chipsBleed}>
              {GROUPS.map((g) => (
                <Chip key={g.value || 'all'} label={g.label} selected={group === g.value} onPress={() => setGroup(g.value)} />
              ))}
            </ChipRow>
            <ChipRow scroll contentStyle={styles.chipsEdge} style={styles.chipsBleed}>
              {RANGES.map((r) => (
                <Chip key={r.value} label={r.label} selected={range === r.value} onPress={() => setRange(r.value)} />
              ))}
              {userId ? (
                <Chip label={userName || tr('One person')} icon={User} trailingIcon={X} selected onPress={() => {
                    setUserId('');
                    setUserName('');
                  }} accessibilityLabel={tr('Show everyone')} />
              ) : null}
            </ChipRow>
            {list.isPending ? <SkeletonList rows={6} avatar /> : null}
            {list.isError ? <ErrorState compact error={list.error} onRetry={list.refetch} /> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHead}>
            <Text style={styles.dayTitle}>{section.title}</Text>
            <Text style={styles.dayCount}>{section.data.length === 1 ? tr('1 entry') : tr('{n} entries', { n: section.data.length })}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View style={[styles.item, index === 0 && styles.itemFirst, index === section.data.length - 1 && styles.itemLast, index > 0 && styles.itemRule]}>
            <ActivityRow item={item} onPress={() => setOpen(item.id)} />
          </View>
        )}
        ListEmptyComponent={
          !list.isPending && !list.isError ? (
            <EmptyState
              compact
              icon={Logs}
              title={filtered ? tr('Nothing matches these filters') : tr('Nothing recorded yet')}
              message={filtered ? tr('Try another search or a wider date range.') : tr('Sign-ins, task moves and changes appear here as they happen.')}
              actionLabel={filtered ? tr('Clear filters') : undefined}
              onAction={filtered ? clear : undefined}
            />
          ) : null
        }
        ListFooterComponent={
          sections.length ? (
            <View style={styles.footer}>
              {list.isFetchingNextPage ? (
                <ActivityIndicator color={colors.primary} />
              ) : list.hasNextPage ? (
                <Button title={tr('Load older')} variant="secondary" full={false} onPress={() => list.fetchNextPage()} />
              ) : (
                <Text style={styles.end}>{tr('That is everything.')}</Text>
              )}
            </View>
          ) : null
        }
      />
      <EntrySheet id={open} onClose={() => setOpen(null)} onOpenPerson={openPerson} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: space(4), paddingBottom: space(10) },
  gap: { gap: space(3), marginBottom: space(2) },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  tile: { flexGrow: 1, flexBasis: '45%', padding: space(3), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  tileOn: { borderColor: colors.primary, borderWidth: 2, padding: space(3) - 1 },
  tileValue: { fontSize: 22, fontWeight: font.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: font.medium, marginTop: 2 },
  pressed: { opacity: 0.85 },
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
  // The chip rows scroll edge to edge.
  chipsBleed: { marginHorizontal: -space(4) },
  chipsEdge: { paddingHorizontal: space(4) },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: space(4), paddingBottom: space(2), paddingHorizontal: space(1) },
  dayTitle: { fontSize: 15, fontWeight: font.bold, color: colors.text },
  dayCount: { ...type.caption },
  item: { backgroundColor: colors.card, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  itemFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, overflow: 'hidden' },
  itemLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card, overflow: 'hidden' },
  itemRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footer: { alignItems: 'center', paddingVertical: space(5) },
  end: { ...type.caption },
  entryHead: { flexDirection: 'row', gap: space(3), marginBottom: space(4) },
  entrySentence: { fontSize: 16, lineHeight: 23 },
  entryBadge: { marginTop: space(2) },
  facts: { backgroundColor: colors.card, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space(3), marginBottom: space(3) },
  fact: { paddingVertical: space(2.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  factLabel: { ...type.caption },
  factValue: { fontSize: 15, color: colors.text, marginTop: 2 },
  change: { backgroundColor: colors.card, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, padding: space(3), marginBottom: space(2) },
  before: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  after: { fontWeight: font.semibold, color: colors.text },
  note: { fontSize: 14, lineHeight: 20, color: colors.text, backgroundColor: colors.muted, borderRadius: radius.input, padding: space(3), marginBottom: space(3) },
  entryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginBottom: space(3) },
  related: { marginTop: space(2) },
  relatedTitle: { ...type.overline, marginBottom: space(2) },
  relatedCard: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  relatedRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
