/**
 * LIVE REFRESH: when somebody else changes what the app shows, it refreshes
 * on its own, within a few seconds.
 *
 * The user: "multiple people do update in same time so all should get updated
 * screen with proper data, like real time". The API runs on Vercel functions
 * (no sockets), so ONE poller asks GET /api/live for four numbers (tasks,
 * alerts, calendar, people; backend/src/platform/live) and, when one moves,
 * invalidates the React Query caches behind it: the screens showing them
 * refetch, the rest are marked stale and refetch when next shown.
 *
 * THE RULES (the HRMS app's store/live.js, on React Query):
 *   - Every 5 s, only while the app is in the foreground and somebody is
 *     signed in; at once on coming back to the foreground; nothing in the
 *     background.
 *   - The first answer only sets the baselines (the screens have just loaded
 *     their own data). A burst of changes is delivered once (250 ms).
 *   - Never while this phone has a write of its own out (react-query
 *     isMutating) or within a second of one landing.
 *   - Errors back off (doubling, at most a minute), with a 15 s timeout; a
 *     404 (an older server with no /api/live) pauses it for ten minutes.
 *   - The answer carries the bell's count: it is written straight into the
 *     unread query when the alerts number moves, so the badge needs no poll
 *     of its own while this one is working (hooks.js useUnreadCount).
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { platformKeys } from './endpoints';
import { queryClient } from './queryClient';

const POLL_MS = 5000;
/** The first poll of a sign-in waits a moment: the launch's own loads go first. */
const FIRST_POLL_MS = 1500;
const DEBOUNCE_MS = 250;
const SETTLE_MS = 1000;
const MAX_BACKOFF_MS = 60 * 1000;
const PAUSE_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 15000;
/** How long one good answer vouches for the poller (useUnreadCount asks). */
const HEALTHY_MS = 30 * 1000;

const isUnread = (q) => q.queryKey[1] === 'unread';

/** What a moved number refetches (product/api.js taskKeys live under ['tasks']). */
const REFRESH = {
  tasks: [{ queryKey: ['tasks'] }, { queryKey: ['calendar'] }],
  // The count itself comes with the answer (see apply).
  alerts: [{ queryKey: platformKeys.notifications, predicate: (q) => !isUnread(q) }],
  calendar: [{ queryKey: ['calendar'] }],
  people: [
    { queryKey: platformKeys.contacts },
    { queryKey: platformKeys.teams },
    { queryKey: ['people'] },
    { queryKey: platformKeys.console },
    { queryKey: ['taskMeta'] },
  ],
};

/**
 * One signed-in person's poller: { user, known (topic -> last number, null
 * until the first answer), timer, inFlight, failures, pausedUntil, okAt,
 * owed (topics waiting to be delivered), deliverTimer, appState }. A new
 * person gets a new one, so nothing of the last person's carries over.
 */
let session = null;
let lastMutationAt = 0;

// Any change to this phone's own writes (one starting, one landing).
queryClient.getMutationCache().subscribe(() => {
  lastMutationAt = Date.now();
});

// In the foreground ('unknown' too: some phones report it until the first change).
const active = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
const settling = () => queryClient.isMutating() > 0 || Date.now() - lastMutationAt < SETTLE_MS;

function stopTimer(s) {
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
}

function schedule(s, ms) {
  stopTimer(s);
  if (s !== session || !active()) return;
  s.timer = setTimeout(() => poll(s), Math.max(0, ms));
}

function nextDelay(s) {
  const now = Date.now();
  if (s.pausedUntil > now) return s.pausedUntil - now;
  if (s.failures) return Math.min(POLL_MS * 2 ** s.failures, MAX_BACKOFF_MS);
  return POLL_MS;
}

/** Refetch what the moved topics show, once this phone's own writes have settled. */
function deliver(s) {
  s.deliverTimer = null;
  if (s !== session) return;
  if (settling()) {
    s.deliverTimer = setTimeout(() => deliver(s), SETTLE_MS);
    return;
  }
  const topics = [...s.owed];
  s.owed.clear();
  const done = new Set();
  topics.forEach((topic) =>
    (REFRESH[topic] || []).forEach((filter) => {
      const id = `${JSON.stringify(filter.queryKey)}${filter.predicate ? '*' : ''}`;
      if (done.has(id)) return;
      done.add(id);
      queryClient.invalidateQueries(filter);
    })
  );
}

function owe(s, topics) {
  topics.forEach((t) => s.owed.add(t));
  if (s.deliverTimer) clearTimeout(s.deliverTimer);
  s.deliverTimer = setTimeout(() => deliver(s), DEBOUNCE_MS);
}

/** The bell's count, written into the unread query (a number), when the shape matches. */
function setUnread(unread) {
  const old = queryClient.getQueryData(platformKeys.unread);
  if (old !== undefined && typeof old !== 'number') return;
  if (old !== unread) queryClient.setQueryData(platformKeys.unread, unread);
}

function apply(s, data) {
  const v = data?.v;
  if (!v || typeof v !== 'object') return;
  const first = !s.known;
  const moved = first ? [] : Object.keys(v).filter((topic) => s.known[topic] !== v[topic]);
  s.known = { ...v };
  // Only when it moved: an alert this phone marked read a moment ago stays read.
  if (typeof data.unread === 'number' && (first || moved.includes('alerts'))) setUnread(data.unread);
  if (moved.length) owe(s, moved);
}

async function poll(s) {
  s.timer = null;
  if (s !== session || !active() || s.inFlight) return;
  if (Date.now() < s.pausedUntil) {
    schedule(s, s.pausedUntil - Date.now());
    return;
  }
  s.inFlight = true;
  try {
    const data = await api.get('/api/live', { timeout: TIMEOUT_MS });
    s.failures = 0;
    s.okAt = Date.now();
    if (s === session) apply(s, data);
  } catch (err) {
    if (err?.status === 404) s.pausedUntil = Date.now() + PAUSE_MS;
    else s.failures = Math.min(s.failures + 1, 8);
  } finally {
    s.inFlight = false;
    schedule(s, nextDelay(s));
  }
}

function start(user) {
  if (session?.user === user) return;
  stop();
  const s = { user, known: null, timer: null, inFlight: false, failures: 0, pausedUntil: 0, okAt: 0, owed: new Set(), deliverTimer: null };
  session = s;
  // Back in the foreground: catch up at once. Anything else: ask nothing.
  s.appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') schedule(s, 0);
    else stopTimer(s);
  });
  schedule(s, FIRST_POLL_MS);
}

function stop() {
  if (!session) return;
  stopTimer(session);
  if (session.deliverTimer) clearTimeout(session.deliverTimer);
  session.appState?.remove();
  session = null;
}

/** Is the poller answering? Then the bell's count needs no poll of its own. */
export const liveHealthy = () => Boolean(session?.okAt && Date.now() - session.okAt < HEALTHY_MS);

/**
 * Keep the app live while someone is signed in. AppEvents mounts it once,
 * with the person's id (null while signed out or held on a gate); a new
 * person starts from fresh baselines.
 */
export function useLiveSync(userId) {
  useEffect(() => {
    if (!userId) return undefined;
    start(String(userId));
    return stop;
  }, [userId]);
}
