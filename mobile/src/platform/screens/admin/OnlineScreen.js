/**
 * Who is signed in, device by device, for the Super Admin: online now (a
 * request in the last two minutes; both apps check in every minute while
 * open), today, or in the last 7 days. Refreshed every 10 seconds while this
 * screen is open and the app is in front. Tap a person to open them; the
 * sign-out button ends that one device.
 */
import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Wifi from 'lucide-react-native/icons/wifi';
import productConfig from '../../../product/config';
import { tr } from '../../../i18n';
import { platformApi, platformKeys } from '../../endpoints';
import { usePullRefresh } from '../../hooks';
import { LogOut } from '../../icons';
import { pinOf } from '../../pin';
import { colors, font, radius, space, type } from '../../theme';
import { Badge, Card, EmptyState, ErrorState, Header, IconButton, Screen, Segmented, SkeletonList, confirm, toast } from '../../ui';
import { deviceLine, OnlineDot, PersonAvatar, PlatformIcon, seenLabel, useLivePolling, useRelease, VersionLine } from './shared';

export default function OnlineScreen({ navigation }) {
  const qc = useQueryClient();
  const [win, setWin] = useState('online');
  const q = useQuery({ queryKey: platformKeys.sessions(win), queryFn: () => platformApi.sessions(win), placeholderData: (prev) => prev });
  const release = useRelease().data;
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  useLivePolling(q.refetch, 10000);
  const rows = q.data?.sessions || [];
  const counts = q.data?.counts;

  const signOut = async (s) => {
    const ok = await confirm({
      title: tr('Sign {name} out on {device}?', { name: s.user.name, device: deviceLine(s) }),
      message: tr('That device goes back to the sign-in screen the next time it opens {app}. Their other devices stay signed in.', { app: productConfig.name }),
      confirmLabel: tr('Sign out'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await platformApi.revokeSession(s.sid);
      toast.success(tr('Signed out on that device.'));
      q.refetch();
      qc.invalidateQueries({ queryKey: platformKeys.console });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const label = (text, n) => (n === undefined ? text : `${text} · ${n}`);

  return (
    <Screen padded={false} header={<Header back title={tr('Who is online')} subtitle={tr('Updates every 10 seconds')} />}>
      <View style={styles.tabs}>
        <Segmented
          options={[
            { value: 'online', label: label(tr('Now'), counts?.online) },
            { value: 'today', label: label(tr('Today'), counts?.today) },
            { value: '7d', label: label(tr('7 days'), counts?.week) },
          ]}
          value={win}
          onChange={setWin}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(s) => s.sid}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {q.data ? (
              <Text style={styles.count}>
                {tr('{people} people on {devices} devices', { people: q.data.people, devices: rows.length })}
              </Text>
            ) : null}
            {q.isPending ? <SkeletonList rows={5} avatar /> : null}
            {q.isError ? <ErrorState compact error={q.error} onRetry={q.refetch} /> : null}
          </View>
        }
        ListEmptyComponent={
          !q.isPending && !q.isError ? (
            <EmptyState
              compact
              icon={Wifi}
              title={win === 'online' ? tr('Nobody is online right now') : tr('Nobody was signed in then')}
              message={win === 'online' ? tr('Someone counts as online for two minutes after the app last checked in.') : tr('Try a wider window.')}
            />
          ) : null
        }
        renderItem={({ item: s }) => {
          const admin = s.user.role === 'superadmin';
          return (
            <Card padded={false} style={styles.card} onPress={admin ? undefined : () => navigation.navigate('AdminPerson', { id: s.user.id })}>
              <View style={styles.row}>
                <PersonAvatar person={s.user} online={s.online} />
                <View style={styles.body}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {s.user.name}
                    </Text>
                    {admin ? <Badge label={tr('Super Admin')} tone="primary" /> : null}
                    {s.current ? <Badge label={tr('This phone')} tone="info" /> : null}
                  </View>
                  {pinOf(s.user) ? <Text style={styles.pin}>{pinOf(s.user)}</Text> : null}
                  <View style={styles.device}>
                    <PlatformIcon platform={s.platform} size={15} />
                    <Text style={styles.deviceText} numberOfLines={1}>
                      {deviceLine(s)}
                    </Text>
                  </View>
                  <VersionLine s={s} latest={release} style={styles.version} />
                  <View style={styles.seen}>
                    <OnlineDot online={s.online} />
                    <Text style={styles.seenText}>{seenLabel(s)}</Text>
                  </View>
                </View>
                {!s.current ? <IconButton icon={LogOut} label={tr('Sign out')} color={colors.danger} onPress={() => signOut(s)} /> : null}
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: space(4), paddingBottom: space(2) },
  list: { paddingHorizontal: space(4), paddingBottom: space(10), gap: space(2) },
  count: { ...type.caption, marginBottom: space(2), marginLeft: space(1) },
  card: { borderRadius: radius.card },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3), padding: space(3) },
  body: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(1.5) },
  name: { fontSize: 16, fontWeight: font.semibold, color: colors.text, flexShrink: 1 },
  pin: { ...type.caption, letterSpacing: 1 },
  device: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), marginTop: 2 },
  deviceText: { fontSize: 14, color: colors.text, flexShrink: 1 },
  version: { marginTop: 2 },
  seen: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), marginTop: 2 },
  seenText: { ...type.caption },
});
