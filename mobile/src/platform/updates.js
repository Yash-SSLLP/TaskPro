/**
 * In-app updates for the Android app, which is installed from an APK rather
 * than a store, so nothing tells a phone a new build exists: it asks.
 *
 * The web app publishes the newest APK with a small release.json beside it
 * under /app/ (web/public/app, staged by `npm run publish` in mobile/). The app
 * reads `<server>/app/release.json`, compares its versionCode with its own,
 * and on a tap downloads the APK and hands it to Android's installer, which
 * always asks the person to confirm. Nothing is installed silently.
 *
 * Android installs an update over the existing app only when both builds are
 * signed with the SAME key; a build signed with another fails with "App not
 * installed" until the old one is uninstalled.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { create } from 'zustand';
import { tr } from '../i18n';
import { getApiUrl } from './api';

// The iPhone web build has no native package: it is the build app.json names.
export const installedVersion = Application.nativeApplicationVersion || Constants.expoConfig?.version || '1.0.0';
// Compared as the build number (Android's versionCode): it is what Android
// compares, and it refuses to install a lower one over a higher one.
export const installedBuild = Number(Application.nativeBuildVersion) || 0;

/** Only the Android app can replace itself; iOS updates come from the App Store. */
export const canSelfUpdate = Platform.OS === 'android';

const CHECKED_KEY = 'taskpro.updateCheckedAt';
const DISMISSED_KEY = 'taskpro.updateDismissed';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 15000;
const APK_RE = /^taskpro-.*\.apk$/i;

/** What the last check found: `available` is a newer build, or null. */
export const useUpdate = create(() => ({ available: null }));

/**
 * Ask the server for the newest build.
 * @returns {Promise<{ upToDate: boolean, versionName?, versionCode?, size?, notes?, url?, fileName? }>}
 */
export async function checkForUpdate() {
  const base = getApiUrl();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    // The time in the query keeps a cache between here and the server from
    // answering with yesterday's release.
    res = await fetch(`${base}/app/release.json?t=${Date.now()}`, { headers: { Accept: 'application/json' }, signal: ctl.signal });
  } catch {
    throw new Error(tr("Can't reach the server. Check your internet connection and try again."));
  } finally {
    clearTimeout(timer);
  }
  // Nothing published yet is a normal state: you are up to date.
  if (res.status === 404) return { upToDate: true };
  if (!res.ok) throw new Error(tr('The server answered with an error ({status}). Try again later.', { status: res.status }));

  let release;
  try {
    release = await res.json();
  } catch {
    throw new Error(tr('This server does not offer app updates.'));
  }
  const versionCode = Number(release?.versionCode) || 0;
  if (!versionCode || !release.fileName) return { upToDate: true };

  const info = {
    upToDate: versionCode <= installedBuild,
    versionName: String(release.versionName || ''),
    versionCode,
    size: Number(release.size) || 0,
    notes: String(release.notes || '').trim(),
    fileName: release.fileName,
    url: `${base}/app/${encodeURIComponent(release.fileName)}`,
  };
  useUpdate.setState({ available: info.upToDate ? null : info });
  return info;
}

/** Download the APK, then open Android's installer on it. `onProgress` gets 0..1. */
export async function downloadAndInstall(info, onProgress) {
  if (!canSelfUpdate) throw new Error(tr('In-app updates work on Android only.'));
  const target = `${FileSystem.cacheDirectory}${info.fileName}`;
  // A part-downloaded file from a failed attempt would be rejected as corrupt.
  await FileSystem.deleteAsync(target, { idempotent: true });

  const task = FileSystem.createDownloadResumable(info.url, target, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
    if (onProgress && totalBytesExpectedToWrite > 0) onProgress(Math.min(1, totalBytesWritten / totalBytesExpectedToWrite));
  });
  let result;
  try {
    result = await task.downloadAsync();
  } catch {
    throw new Error(tr('The download stopped. Check your connection and try again.'));
  }

  // A truncated file, or an HTML error page, handed to the installer shows a
  // baffling "App not installed". The release says the exact size.
  const file = result?.status === 200 ? await FileSystem.getInfoAsync(result.uri) : null;
  if (!file?.exists || file.size < 1_000_000 || (info.size && file.size !== info.size)) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    throw new Error(tr('The download did not complete properly. Try again.'));
  }

  // The installer is another app: it needs a content:// address it may read.
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}

/** Remove downloaded APKs: once the app has restarted, they have been installed or abandoned. */
async function cleanupDownloads() {
  try {
    const names = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
    await Promise.all(names.filter((n) => APK_RE.test(n)).map((n) => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${n}`, { idempotent: true })));
  } catch {
    /* nothing to clean */
  }
}

/**
 * The background check: on every launch, and when the app comes back to the
 * foreground at most every few hours. Silent on any failure (offline, an
 * older server): the button on the update screen shows real errors.
 * @returns {Promise<object|null>} the newer build, or null
 */
export async function checkInBackground({ launch = false } = {}) {
  if (!canSelfUpdate) return null;
  try {
    if (launch) await cleanupDownloads();
    const last = Number(await AsyncStorage.getItem(CHECKED_KEY)) || 0;
    if (!launch && Date.now() - last < CHECK_EVERY_MS) return useUpdate.getState().available;
    const info = await checkForUpdate();
    await AsyncStorage.setItem(CHECKED_KEY, String(Date.now()));
    return info.upToDate ? null : info;
  } catch {
    return null;
  }
}

/** Whether to put a prompt up for this build: once per version, unless "Later" was chosen. */
export async function shouldPrompt(info) {
  try {
    return (await AsyncStorage.getItem(DISMISSED_KEY)) !== String(info.versionCode);
  } catch {
    return true;
  }
}

export async function dismissPrompt(info) {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, String(info.versionCode));
  } catch {
    /* it asks again next time */
  }
}

/** "41.2 MB" */
export function sizeLabel(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
