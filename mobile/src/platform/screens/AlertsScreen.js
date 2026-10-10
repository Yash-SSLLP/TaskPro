/**
 * Alerts: what happened that concerns me. Unread alerts have a dot; tapping
 * one marks it read and opens the screen it is about.
 */
import React, { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, platformKeys } from '../endpoints';
import { relativeTime } from '../format';
import { usePullRefresh, useRefetchOnFocus, useUnreadCount } from '../hooks';
import { Bell, CheckCheck } from '../icons';
import { openLink } from '../navigation/links';
import { useSettings } from '../session';
import { tr } from '../../i18n';
import { colors, font, radius, space, type } from '../theme';
import { confirm, Dot, EmptyState, ErrorState, Header, IconButton, Screen, SkeletonList, TextButton, toast } from '../ui';

const LIST_KEY = [...platformKeys.notifications, 'list'];

export default function AlertsScreen() {
  const qc = useQueryClient();
  const { timezone } = useSettings();
  const unread = useUnreadCount().data || 0;
  const q = useInfiniteQuery({
    queryKey: LIST_KEY,
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.hasMore ? last.notifications[last.notifications.length - 1]?.createdAt : undefined),
  });
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  useRefetchOnFocus(q.refetch);

  const items = q.data?.pages.flatMap((p) => p.notifications) || [];
  const hasRead = items.some((n) => n.read);

  /** Mark alerts read in the cache at once, then tell the server. */
  const markLocally = useCallback(
    (ids) => {
      qc.setQueryData(LIST_KEY, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                notifications: p.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)),
              })),
            }
          : data
      );
      qc.setQueryData(platformKeys.unread, (n) => (ids ? Math.max(0, (n || 0) - ids.length) : 0));
    },
    [qc]
  );

  const markAll = async () => {
    markLocally(null);
    try {
      await notificationsApi.markAllRead();
    } catch (e) {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: platformKeys.notifications });
    }
  };

  const openAlert = (n) => {
    if (!n.read) {
      markLocally([n.id]);
      notificationsApi.markRead([n.id]).catch(() => qc.invalidateQueries({ queryKey: platformKeys.notifications }));
    }
    if (n.link) openLink(n.link);
  };

  const clearRead = async () => {
    const ok = await confirm({ title: tr('Clear read alerts?'), message: tr('Alerts you have already read will be removed.'), confirmLabel: tr('Clear') });
    if (!ok) return;
    try {
      await notificationsApi.clearRead();
      await qc.invalidateQueries({ queryKey: platformKeys.notifications });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const header = (
    <Header
      large
      title={tr('Alerts')}
      right={unread > 0 ? <IconButton icon={CheckCheck} label={tr('Mark all read')} showLabel size={18} color={colors.primary} onPress={markAll} /> : null}
    />
  );

  let body;
  if (q.isPending) body = <SkeletonList rows={6} style={styles.skeleton} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={q.refetch} />;
  else
    body = (
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={items.length ? styles.list : styles.emptyList}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <EmptyState
            icon={Bell}
            title={tr('No alerts yet')}
            message={tr("You'll see here when someone gives you a task, asks to add you, invites you to an organization, or a task is due.")}
          />
        }
        ListFooterComponent={
          items.length ? (
            q.isFetchingNextPage ? (
              <SkeletonList rows={2} style={styles.more} />
            ) : hasRead && !q.hasNextPage ? (
              <TextButton title={tr('Clear read alerts')} color={colors.textSecondary} onPress={clearRead} style={styles.more} />
            ) : null
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openAlert(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.read ? '' : `${tr('Unread')}. `}${item.title}. ${item.body || ''}`}
            style={({ pressed }) => [styles.item, !item.read && styles.unreadItem, pressed && styles.pressed]}
          >
            <View style={styles.dotCol}>{!item.read ? <Dot /> : null}</View>
            <View style={styles.texts}>
              <Text style={[styles.title, !item.read && styles.titleUnread]}>{item.title}</Text>
              {item.body ? (
                <Text style={styles.body} numberOfLines={3}>
                  {item.body}
                </Text>
              ) : null}
              <Text style={styles.time}>{relativeTime(item.createdAt, timezone)}</Text>
            </View>
          </Pressable>
        )}
      />
    );

  return (
    <Screen inTabs padded={false} header={header}>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: { marginHorizontal: space(4), marginTop: space(2) },
  list: { paddingHorizontal: space(4), paddingBottom: space(8), gap: space(2), paddingTop: space(2) },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  item: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    paddingLeft: space(2),
  },
  unreadItem: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.8 },
  dotCol: { width: space(5), alignItems: 'center', paddingTop: space(1.5) },
  texts: { flex: 1 },
  title: { fontSize: 16, color: colors.text, fontWeight: font.medium },
  titleUnread: { fontWeight: font.bold },
  body: { ...type.small, marginTop: space(1), lineHeight: 20 },
  time: { ...type.caption, color: colors.textFaint, marginTop: space(2) },
  more: { marginTop: space(2) },
});
