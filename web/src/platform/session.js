/**
 * The signed-in session: token, the person (with their Task Pin), their
 * personal settings, and product metadata. The token (and a copy of the last
 * session, so the app paints instantly) is kept in localStorage.
 */
import { create } from 'zustand';
import { queryClient } from './queryClient';

// v2: Task Pins. A v1 (business) session is not readable by the new API, so it
// is simply not loaded and the person signs in again.
const KEY = 'taskpro.session.v2';

const DEFAULT_SETTINGS = {
  timezone: 'Asia/Kolkata',
  workdayStart: '09:00',
  approvalDefault: true,
  defaultReminders: [],
  dailyDigest: true,
  dailyDigestAt: '18:00',
  lang: 'en',
};

function load() {
  try {
    localStorage.removeItem('session.v1');
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(state) {
  try {
    if (!state.token) localStorage.removeItem(KEY);
    else {
      const { token, user, settings, product } = state;
      localStorage.setItem(KEY, JSON.stringify({ token, user, settings, product }));
    }
  } catch {
    /* private mode: the session just won't survive a reload */
  }
}

const initial = load();

export const useSession = create((set, get) => ({
  token: initial.token || null,
  user: initial.user || null,
  settings: initial.settings || null,
  product: initial.product || null,
  // Shown on the sign-in page after being signed out for a reason.
  notice: null,

  /** Store what /auth/login, /auth/signup or /auth/me returned. */
  setSession(payload) {
    // A different person on this browser must never see the last one's data.
    if (payload.user && get().user && payload.user.id !== get().user.id) queryClient.clear();
    const next = {
      token: payload.token ?? get().token,
      user: payload.user ?? get().user,
      settings: payload.settings ?? get().settings,
      product: payload.product ?? get().product,
      notice: null,
    };
    set(next);
    save({ ...get(), ...next });
  },

  updateUser(user) {
    set({ user });
    save(get());
  },

  updateSettings(settings) {
    set({ settings });
    save(get());
  },

  signOut(notice = null) {
    set({ token: null, user: null, settings: null, product: null, notice });
    save({ token: null });
    queryClient.clear();
  },
}));

export const isSuperAdmin = (user) => user?.role === 'superadmin';

/** The signed-in person's settings, with safe defaults for anything missing. */
export function useSettings() {
  const settings = useSession((s) => s.settings);
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

/** The settings' time zone (dates are shown in it). */
export const useTz = () => useSettings().timezone || DEFAULT_SETTINGS.timezone;
