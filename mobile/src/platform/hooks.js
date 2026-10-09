/**
 * Small shared hooks: pull-to-refresh, refetch on focus, "is the app open",
 * the unread alert count, contacts and teams.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { contactsApi, notificationsApi, platformKeys, teamsApi } from './endpoints';
import { liveHealthy } from './live';
import { isSuperAdmin, useSession } from './session';

/** Pull-to-refresh that shows the spinner only while the person is pulling. */
export function usePullRefresh(refetch) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  return { refreshing, onRefresh };
}

/** Refetch when the screen comes back into view (not on the first visit). */
export function useRefetchOnFocus(refetch) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refetch();
    }, [refetch])
  );
}

/** True when the signed-in app is showing (not signing in, not the password gate, not the welcome card). */
export function useInApp() {
  return useSession((s) => s.status === 'signedIn' && !!s.user && !s.user.mustChangePassword && !s.justSignedUp);
}

/**
 * Unread alerts. The live poller (live.js) writes the count with every change
 * to the person's alerts, so this polls (every minute, in the foreground)
 * only while that poller is not answering (an older server, no network).
 */
export function useUnreadCount() {
  const enabled = useInApp();
  return useQuery({
    queryKey: platformKeys.unread,
    queryFn: notificationsApi.unreadCount,
    enabled,
    refetchInterval: () => (liveHealthy() ? false : 60 * 1000),
    refetchIntervalInBackground: false,
    staleTime: 15 * 1000,
  });
}

/** { contacts, incoming, outgoing } — not for the Super Admin, who has no pin. */
export function useContacts(options = {}) {
  const inApp = useInApp();
  const admin = useSession((s) => isSuperAdmin(s.user));
  return useQuery({
    queryKey: platformKeys.contacts,
    queryFn: contactsApi.list,
    enabled: inApp && !admin,
    staleTime: 30 * 1000,
    ...options,
  });
}

/** { teams, invites } */
export function useTeams(options = {}) {
  const inApp = useInApp();
  const admin = useSession((s) => isSuperAdmin(s.user));
  return useQuery({
    queryKey: platformKeys.teams,
    queryFn: teamsApi.list,
    enabled: inApp && !admin,
    staleTime: 30 * 1000,
    ...options,
  });
}
