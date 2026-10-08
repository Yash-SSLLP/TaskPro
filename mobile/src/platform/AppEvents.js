/**
 * Things that happen outside any one screen: registering for push after
 * sign-in, opening the right screen when a notification or a
 * taskpro:// link is tapped, refreshing data when an alert arrives,
 * offering a newer app build, and following the phone's light/dark switch.
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import productConfig from '../product/config';
import { tr } from '../i18n';
import { useInApp } from './hooks';
import { flushPendingLink, navigationRef, openLink } from './navigation/links';
import { linkOf, registerForPush } from './push';
import { useSession } from './session';
import { confirm } from './ui';
import { useFollowSystemTheme } from './appearance';
import { canSelfUpdate, checkInBackground, dismissPrompt, shouldPrompt } from './updates';

// Builds already offered since the app started: one prompt per version per
// run, however often the app comes back to the foreground.
const offered = new Set();
let launched = false;

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
  useFollowSystemTheme();

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

  // App updates: look on launch and on every return to the foreground (the
  // check itself runs at most every few hours) and offer a newer build, on
  // the sign-in screen or in the app, until "Later" is chosen for it.
  const signedOut = useSession((s) => s.status === 'signedOut');
  const canOffer = navReady && (inApp || signedOut);
  useEffect(() => {
    if (!canSelfUpdate || !canOffer) return undefined;
    const look = async () => {
      const info = await checkInBackground({ launch: !launched });
      launched = true;
      if (!info || offered.has(info.versionCode) || !(await shouldPrompt(info))) return;
      if (!(navigationRef.getRootState()?.routeNames || []).includes('AppUpdate')) return;
      offered.add(info.versionCode);
      const ok = await confirm({
        title: tr('Update available'),
        message: tr('{name} {v} is ready to install.', { name: productConfig.name, v: info.versionName }),
        confirmLabel: tr('Update'),
        cancelLabel: tr('Later'),
      });
      if (ok) navigationRef.navigate('AppUpdate');
      else await dismissPrompt(info);
    };
    look();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') look();
    });
    return () => sub.remove();
  }, [canOffer]);

  return null;
}
