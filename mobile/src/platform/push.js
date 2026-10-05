/**
 * Push notifications: the Android channel, how alerts show while the app is
 * open, and registering this phone's Expo push token with the server.
 *
 * Registration quietly does nothing when the build has no EAS project id
 * (extra.eas.projectId), when running in Expo Go or a simulator, or when the
 * person says no to notifications. The in-app Alerts tab works regardless.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import productConfig from '../product/config';
import { devicesApi } from './endpoints';
import { brand } from './theme';
import { tr } from '../i18n';

const PUSH_KEY = `${productConfig.key}.pushToken`;
let pushToken = null;

/** Call once at start-up. */
export function setupNotifications() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // Android 13+ only shows the permission prompt once a channel exists.
    Notifications.setNotificationChannelAsync('default', {
      name: tr('Alerts'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: brand.primary,
    }).catch(() => {});
  }
}

const easProjectId = () => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;

/** Ask for permission, get the Expo push token and tell the server. */
export async function registerForPush() {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return null;
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
    const projectId = easProjectId();
    if (!projectId) return null;

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!data) return null;
    await devicesApi.register(data, Platform.OS === 'ios' ? 'ios' : 'android');
    pushToken = data;
    AsyncStorage.setItem(PUSH_KEY, data).catch(() => {});
    return data;
  } catch {
    return null;
  }
}

/** On sign-out: stop pushes to this phone for this person. */
export async function unregisterPush() {
  let t = pushToken;
  if (!t) {
    try {
      t = await AsyncStorage.getItem(PUSH_KEY);
    } catch {
      t = null;
    }
  }
  forgetPushToken();
  if (!t) return;
  try {
    await devicesApi.unregister(t);
  } catch {
    /* the server forgets dead tokens on its own */
  }
}

export function forgetPushToken() {
  pushToken = null;
  AsyncStorage.removeItem(PUSH_KEY).catch(() => {});
}

/** The in-app link carried by a notification ("/tasks/<id>"). */
export const linkOf = (notification) => notification?.request?.content?.data?.link || '';
