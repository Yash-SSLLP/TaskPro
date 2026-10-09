/**
 * The signed-in session (zustand): who is signed in, their personal settings
 * and the product block sent with the session payload.
 *
 * status: 'booting' → 'signedOut' | 'signedIn' | 'offline' (a saved session
 * exists but the server could not be reached at launch).
 *
 * `justSignedUp` holds the new account's Task Pin card on screen right after
 * sign-up, before the app itself opens.
 *
 * The token lives in the secure store; everything else is refreshed from
 * GET /api/auth/me at every launch.
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import productConfig from '../product/config';
import { currentLanguage, initLanguage, isLanguage, languageChosen, setLanguage, tr } from '../i18n';
import { loadApiUrl, setToken, setSessionFailureHandler } from './api';
import { authApi, settingsApi } from './endpoints';
import { queryClient } from './queryClient';
import { unregisterPush, forgetPushToken } from './push';

const TOKEN_KEY = `${productConfig.key}_session_token`;

async function persistToken(t) {
  try {
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* the secure store can fail on some devices; the session still works until restart */
  }
}

export const DEFAULT_SETTINGS = {
  timezone: 'Asia/Kolkata',
  workdayStart: '09:00',
  approvalDefault: true,
  defaultReminders: [],
  dailyDigest: true,
  dailyDigestAt: '18:00',
  lang: 'en',
};

/**
 * Line the app's language up with the account's.
 *  - A language picked on THIS phone wins after a fresh sign-in, and is sent to the server.
 *  - Otherwise the account's language is adopted.
 */
function syncLanguage(settings, { fresh }) {
  const server = settings?.lang;
  const mine = currentLanguage();
  if (languageChosen()) {
    if (fresh && server !== mine) settingsApi.update({ lang: mine }).catch(() => {});
    return;
  }
  if (isLanguage(server) && server !== mine) setLanguage(server, { chosen: false });
}

let signingOut = false;

export const useSession = create((set, get) => ({
  status: 'booting',
  user: null,
  settings: DEFAULT_SETTINGS,
  product: null,
  justSignedUp: false,
  // A message for the sign-in screen, e.g. "Your session has expired".
  notice: null,
  // Why the launch could not reach the server (status 'offline').
  bootError: null,

  /** Launch: the language, the server address and any saved session. */
  boot: async () => {
    await initLanguage();
    await loadApiUrl();
    let saved = null;
    try {
      saved = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      saved = null;
    }
    if (!saved) {
      set({ status: 'signedOut' });
      return;
    }
    setToken(saved);
    await get().refresh({ launching: true });
  },

  /** Re-read the session from the server (user, settings). */
  refresh: async ({ launching = false } = {}) => {
    try {
      const data = await authApi.me();
      // The server slides the session: a day-old token comes back renewed.
      get().applySession(data, data.token);
    } catch (err) {
      // Expired sessions and disabled accounts are handled by the failure handler.
      const handled = err.status === 401 || err.code === 'USER_DISABLED' || err.code === 'SESSION_EXPIRED';
      if (launching && !handled && get().status !== 'signedOut') {
        set({ status: 'offline', bootError: err.message });
      }
      if (!launching && !handled) throw err;
    }
  },

  applySession: (data, newToken, { fresh = false } = {}) => {
    if (newToken) {
      setToken(newToken);
      persistToken(newToken);
    }
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    set((s) => ({
      status: 'signedIn',
      user: data.user,
      settings,
      product: data.product || s.product,
      notice: null,
      bootError: null,
    }));
    syncLanguage(settings, { fresh });
  },

  signIn: async (identifier, password) => {
    const data = await authApi.login(identifier.trim(), password);
    queryClient.clear();
    get().applySession(data, data.token, { fresh: true });
  },

  /** body: { name, identifier, password } */
  signUp: async (body) => {
    const data = await authApi.signup(body);
    queryClient.clear();
    set({ justSignedUp: true });
    get().applySession(data, data.token, { fresh: true });
  },

  /** Leave the "Your Task Pin" card and open the app. */
  finishWelcome: () => set({ justSignedUp: false }),

  /**
   * @param {{ notice?: string, remote?: boolean }} opts remote: also tell the
   *   server to stop pushes and end this device's session (skip when the
   *   session is already dead)
   */
  signOut: async ({ notice = null, remote = true } = {}) => {
    if (signingOut) return;
    signingOut = true;
    try {
      if (remote) await unregisterPush();
      else forgetPushToken();
      // Sent with the current token before it is dropped; never waited on, so
      // signing out never hangs on the network.
      if (remote) authApi.logout().catch(() => {});
      setToken(null);
      await persistToken(null);
      set({ status: 'signedOut', user: null, settings: DEFAULT_SETTINGS, justSignedUp: false, notice, bootError: null });
      // Clear cached data once the signed-in screens have gone, so they do not refetch.
      setTimeout(() => queryClient.clear(), 0);
    } finally {
      signingOut = false;
    }
  },

  /** After a password change the server hands out a new token. */
  replaceToken: async (t) => {
    if (!t) return;
    setToken(t);
    await persistToken(t);
  },

  setUser: (user) => set({ user }),
  setSettings: (settings) => set({ settings: { ...DEFAULT_SETTINGS, ...(settings || {}) } }),
  clearNotice: () => set({ notice: null }),
}));

// Session-wide failures from any request.
setSessionFailureHandler((err) => {
  const s = useSession.getState();
  if (s.status === 'signedOut') return;
  if (err.code === 'PASSWORD_CHANGE_REQUIRED') {
    if (s.user && !s.user.mustChangePassword) s.setUser({ ...s.user, mustChangePassword: true });
    return;
  }
  if (err.code === 'USER_DISABLED') {
    s.signOut({ notice: err.message || tr('This account has been switched off. Contact support.'), remote: false });
    return;
  }
  s.signOut({ notice: err.message || tr('Your session has ended. Please sign in again.'), remote: false });
});

// ---------------------------------------------------------------- selectors

export const isSuperAdmin = (user) => user?.role === 'superadmin';

export const useUser = () => useSession((s) => s.user);
export const useSettings = () => useSession((s) => s.settings);
export const useIsSuperAdmin = () => useSession((s) => isSuperAdmin(s.user));
