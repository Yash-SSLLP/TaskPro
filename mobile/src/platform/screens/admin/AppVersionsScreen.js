/**
 * Which Karo version each person is on, from the devices they are signed in on:
 * their newest phone (its app version), else the web, else nothing. "Latest"
 * is the newest published Android build (<server>/app/release.json).
 *
 *   On the latest    a phone on that build or newer
 *   Out of date      a phone on an older build: ask them to update
 *   Web only         signed in on the web, no phone
 *   Never reported   an older app that does not say its version, or not
 *                    signed in anywhere lately
 * The four figures are filters.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import productConfig from '../../../product/config';
import { tr } from '../../../i18n';
import { platformApi, platformKeys } from '../../endpoints';
import { formatDate } from '../../format';
import { usePullRefresh, useRefetchOnFocus } from '../../hooks';
import { Search, Smartphone, X } from '../../icons';
import { pinOf } from '../../pin';
import { colors, font, radius, space, type } from '../../theme';
import { Card, EmptyState, ErrorState, Header, Screen, SkeletonList } from '../../ui';
import { deviceLine, freshness, OnlineDot, PersonAvatar, PlatformIcon, seenLabel, useRelease, VersionLine } from './shared';

/** Which figure a person falls under. */
export function bucketOf(a, latest) {
  if (a.state === 'app') return freshness(a, latest) === 'behind' ? 'behind' : 'latest';
  if (a.state === 'web') return 'web';
  return 'never';
}

function Tile({ label, value, tint, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.tile, selected && styles.tileOn, pressed && styles.pressed]}
    >
      <Text style={[styles.tileValue, tint && { color: tint }]}>{value ?? '–'}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AppVersionsScreen({ navigation, route }) {
  const [filter, setFilter] = useState(route.params?.show || '');
  useEffect(() => {
    if (route.params?.show !== undefined) setFilter(route.params.show);
  }, [route.params?.show]);
  const [term, setTerm] = useState('');
  const q = useQuery({ queryKey: platformKeys.appVersions, queryFn: platformApi.appVersions });
  const release = useRelease();
  const latest = release.data;
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  useRefetchOnFocus(q.refetch);
  const accounts = useMemo(() => q.data?.accounts || [], [q.data]);

  const counts = useMemo(() => {
    const c = { latest: 0, behind: 0, web: 0, never: 0 };
    for (const a of accounts) c[bucketOf(a, latest)] += 1;
    return c;
  }, [accounts, latest]);

  const needle = term.trim().toLowerCase();
  const rows = accounts.filter((a) => {
    if (filter && bucketOf(a, latest) !== filter) return false;
    if (!needle) return true;
    return `${a.name} ${a.pin} ${a.deviceName} ${a.appVersion}`.toLowerCase().includes(needle);
  });
  const pick = (key) => setFilter((f) => (f === key ? '' : key));

  return (
    <Screen padded={false} header={<Header back title={tr('App versions')} />}>
      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.gap}>
            <View style={styles.tiles}>
              <Tile label={tr('On the latest')} value={q.data ? counts.latest : undefined} tint={colors.success} selected={filter === 'latest'} onPress={() => pick('latest')} />
              <Tile label={tr('Out of date')} value={q.data ? counts.behind : undefined} tint={counts.behind ? colors.warning : undefined} selected={filter === 'behind'} onPress={() => pick('behind')} />
              <Tile label={tr('Web only')} value={q.data ? counts.web : undefined} selected={filter === 'web'} onPress={() => pick('web')} />
              <Tile label={tr('Never reported')} value={q.data ? counts.never : undefined} selected={filter === 'never'} onPress={() => pick('never')} />
            </View>
            <Text style={styles.release}>
              {latest
                ? tr('Latest: {app} {version} (build {build}), published {date}', {
                    app: productConfig.name,
                    version: latest.versionName,
                    build: latest.versionCode,
                    date: latest.publishedAt ? formatDate(latest.publishedAt) : '—',
                  })
                : release.isPending
                  ? ' '
                  : tr('No Android build has been published yet.')}
            </Text>
            <View style={styles.search}>
              <Search size={17} color={colors.textFaint} />
              <TextInput
                value={term}
                onChangeText={setTerm}
                placeholder={tr('Name, Task Pin, device or version')}
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
            {q.isPending ? <SkeletonList rows={6} avatar /> : null}
            {q.isError ? <ErrorState compact error={q.error} onRetry={q.refetch} /> : null}
          </View>
        }
        ListEmptyComponent={!q.isPending && !q.isError ? <EmptyState compact icon={Smartphone} title={tr('No one here')} message={term ? tr('Try another search.') : undefined} /> : null}
        renderItem={({ item: a }) => (
          <Card padded={false} onPress={() => navigation.navigate('AdminPerson', { id: a.id })}>
            <View style={styles.row}>
              <PersonAvatar person={a} online={a.online} />
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>
                  {a.name}
                </Text>
                {pinOf(a) ? <Text style={styles.sub}>{pinOf(a)}</Text> : null}
                {a.state === 'none' ? (
                  <Text style={styles.sub}>{tr('Not signed in lately')}</Text>
                ) : (
                  <>
                    <View style={styles.device}>
                      <PlatformIcon platform={a.platform} size={15} />
                      <Text style={styles.deviceText} numberOfLines={1}>
                        {deviceLine(a)}
                        {a.web && a.state === 'app' ? `  ·  ${tr('also on the web')}` : ''}
                      </Text>
                    </View>
                    {a.state === 'unknown' ? (
                      <Text style={styles.sub}>{tr('Version not reported (an older app)')}</Text>
                    ) : a.state === 'app' ? (
                      <VersionLine s={a} latest={latest} />
                    ) : null}
                  </>
                )}
                <View style={styles.seen}>
                  <OnlineDot online={a.online} />
                  <Text style={styles.sub}>{a.state === 'none' && !a.lastSeenAt ? tr('Never') : seenLabel(a)}</Text>
                </View>
              </View>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space(4), paddingBottom: space(10), gap: space(2) },
  gap: { gap: space(3), marginBottom: space(1) },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  tile: { flexGrow: 1, flexBasis: '45%', padding: space(3), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  tileOn: { borderColor: colors.primary, borderWidth: 2, padding: space(3) - 1 },
  tileValue: { fontSize: 24, fontWeight: font.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: font.medium, marginTop: 2 },
  pressed: { opacity: 0.85 },
  release: { ...type.caption },
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3), padding: space(3) },
  body: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 16, fontWeight: font.semibold, color: colors.text },
  sub: { ...type.caption },
  device: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  deviceText: { fontSize: 14, color: colors.text, flexShrink: 1 },
  seen: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
});
