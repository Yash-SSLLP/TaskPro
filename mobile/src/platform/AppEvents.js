/**
 * Things that happen outside any one screen: registering for push after
 * sign-in, opening the right screen when a notification or a
 * taskpro:// link is tapped, and refreshing data when an alert arrives.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useInApp } from './hooks';
import { flushPendingLink, openLink } from './navigation/links';
import { linkOf, registerForPush } from './push';

/** "taskpro://tasks/<id>" → "/tasks/<id>"; dev-server URLs carry no in-app path. */
function pathFromUrl(url) {
  if (!url) return null;
  const s = String(url);
  const dashed = s.indexOf('/--/');
  if (dashed !== -1) return `/${s.slice(dashed + 4)}`;
  if (/^(exp|exps|https?):\/\//i.test(s)) return null;
  const rest = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '');
  return rest ? `/${rest}` : null;
}

export default function AppEvents({ navReady }) {
  const inApp = useInApp();
  const qc = useQueryClient();

  // Push token: once per sign-in.
  useEffect(() => {
    if (inApp) registerForPush();
  }, [inApp]);

  // Notifications: a tap opens its screen; an arrival refreshes what is on screen.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const handled = (response) => {
      if (!response) return;
      openLink(linkOf(response.notification));
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    const tapSub = Notifications.addNotificationResponseReceivedListener(handled);
    const arriveSub = Notifications.addNotificationReceivedListener(() => qc.invalidateQueries());
    // The app may have been opened by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then(handled).catch(() => {});
    return () => {
      tapSub.remove();
      arriveSub.remove();
    };
  }, [qc]);

  // Deep links such as taskpro://tasks/<id>.
  useEffect(() => {
    const handle = (url) => {
      const path = pathFromUrl(url);
      if (path) openLink(path);
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  // A link that arrived before sign-in finished opens now.
  useEffect(() => {
    if (!inApp || !navReady) return undefined;
    const t = setTimeout(flushPendingLink, 60);
    return () => clearTimeout(t);
  }, [inApp, navReady]);

  return null;
}
