/**
 * Things that happen outside any one screen: registering for push after
 * sign-in, opening the right screen when a notification or a
 * taskpro:// link is tapped, refreshing data when an alert arrives or
 * somebody else changes something (live.js), offering a newer app build,
 * and following the phone's light/dark switch.
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import productConfig from '../product/config';
import { tr } from '../i18n';
import { useInApp } from './hooks';
import { useLiveSync } from './live';
import { flushPendingLink, navigationRef, openLink } from './navigation/links';
import { joinPathIn } from './invite';
import { linkOf, registerForPush } from './push';
import { useSession } from './session';
import { confirm, toast } from './ui';
import { useFollowSystemTheme } from './appearance';
import { canSelfUpdate, checkInBackground, dismissPrompt, shouldPrompt } from './updates';
import { IS_WEB, listenWebPush } from './web';

// Builds already offered since the app started: one prompt per version per
// run, however often the app comes back to the foreground.
const offered = new Set();
let launched = false;
let clipboardChecked = false;

/**
 * "taskpro://tasks/<id>" → "/tasks/<id>"; an App Link to the web app
 * ("https://…/join/<pin>?w=…", "https://…/tasks/<id>") → its path; dev-server
 * URLs carry no in-app path.
 */
function pathFromUrl(url) {
  if (!url) return null;
  const s = String(url);
  // The iPhone web build, sent an invite or task link by the website (?open=).
  const opened = IS_WEB ? /[?&]open=([^&#]+)/.exec(s) : null;
  if (opened) return decodeURIComponent(opened[1]);
  const dashed = s.indexOf('/--/');
  if (dashed !== -1) return `/${s.slice(dashed + 4)}`;
  const web = /^https?:\/\/[^/]+(\/(?:join|tasks)\/[^#]*)/i.exec(s);
  if (web) return web[1];
  if (/^(exp|exps|https?):\/\//i.test(s)) return null;
  const rest = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '');
  return rest ? `/${rest}` : null;
}

export default function AppEvents({ navReady }) {
  const inApp = useInApp();
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  useFollowSystemTheme();
  // Other people's changes refresh what is on screen, while the app is open.
  useLiveSync(inApp ? userId : null);

  // Push token: once per sign-in.
  useEffect(() => {
    if (inApp) registerForPush();
  }, [inApp]);

  // Notifications: a tap opens its screen; an arrival refreshes what is on screen.
  useEffect(() => {
    // The iPhone web build: the same, through its service worker (web/webPush.js).
    if (IS_WEB) {
      return listenWebPush(
        (data) => openLink(data?.link || ''),
        () => qc.invalidateQueries()
      );
    }
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
    // Once read, so a reload does not open it again.
    if (IS_WEB && /[?&]open=/.test(window.location.search)) window.history.replaceState(null, '', window.location.pathname);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  // A new install: the invite page put its link on the clipboard before the
  // download, so look there once, signed out. The invite then waits for the
  // sign-up (or sign-in) and opens.
  const signedOutNow = useSession((s) => s.status === 'signedOut');
  useEffect(() => {
    if (Platform.OS === 'web' || !signedOutNow || clipboardChecked) return;
    clipboardChecked = true;
    (async () => {
      try {
        if (!(await Clipboard.hasStringAsync())) return;
        const path = joinPathIn(await Clipboard.getStringAsync());
        if (!path) return;
        openLink(path);
        toast(tr('Invite found. Sign up or sign in, and you join them.'));
      } catch {
        // No clipboard access: they can open the link again.
      }
    })();
  }, [signedOutNow]);

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
