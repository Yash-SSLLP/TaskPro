/**
 * LIVE REFRESH: when somebody else changes what this tab shows, it refreshes
 * on its own, within a few seconds.
 *
 * The user: "multiple people do update in same time so all should get updated
 * screen with proper data, like real time". The API runs on Vercel functions
 * (no sockets), so ONE poller per tab asks GET /api/live for four numbers
 * (tasks, alerts, calendar, people; backend/src/platform/live) and, when one
 * moves, invalidates the React Query caches behind it. Invalidating refetches
 * only the queries on screen; the rest are marked stale and refetch when next
 * shown. A quiet afternoon costs one tiny request every few seconds.
 *
 * THE RULES (the HRMS's liveStore.js, on React Query):
 *   - Every 4 s, only while the tab is visible and somebody is signed in; at
 *     once on coming back into view.
 *   - The first answer only sets the baselines (the page has just loaded its
 *     own data). A burst of changes is delivered once (250 ms debounce).
 *   - Never while this tab has a write of its own out (react-query
 *     isMutating) or within a second of one landing: a refetch then could
 *     overtake the write. The change is delivered once it settles.
 *   - Errors back off (doubling, at most a minute); a 404 (an older server
 *     with no /api/live) pauses it for ten minutes.
 *   - The answer carries the bell's count: it is written straight into the
 *     unread query when the alerts number moves.
 */
import { useEffect } from 'react';
import { api } from './api';
import { queryClient } from './queryClient';

const POLL_MS = 4000;
const FIRST_POLL_MS = 500;
const DEBOUNCE_MS = 250;
const SETTLE_MS = 1000;
const MAX_BACKOFF_MS = 60_000;
const PAUSE_MS = 10 * 60_000;

/** Under ['tasks'] but not task data (the forms' people and categories). */
const TASK_SIDE_DATA = new Set(['meta', 'categories']);
const UNREAD_KEY = ['notifications', 'unread'];

/** What a moved number refetches. */
const REFRESH = {
  tasks: [
    { queryKey: ['tasks'], predicate: (q) => !TASK_SIDE_DATA.has(q.queryKey[1]) },
    { queryKey: ['task'] },
    { queryKey: ['calendar'] },
  ],
  // The count itself comes with the answer (see apply).
  alerts: [{ queryKey: ['notifications'], predicate: (q) => q.queryKey[1] !== 'unread' }],
  calendar: [{ queryKey: ['calendar'] }],
  people: [
    { queryKey: ['contacts'] },
    { queryKey: ['teams'] },
    { queryKey: ['team'] },
    { queryKey: ['people'] },
    { queryKey: ['platform'] },
    { queryKey: ['tasks', 'meta'] },
  ],
};

/**
 * One signed-in person's poller: { user, known (topic -> last number, null
 * until the first answer), timer, inFlight, failures, pausedUntil, owed
 * (topics waiting to be delivered), deliverTimer }. A new person gets a new
 * one, so nothing of the last person's carries over.
 */
let session = null;
let lastMutationAt = 0;

// Any change to this tab's own writes (one starting, one landing).
queryClient.getMutationCache().subscribe(() => {
  lastMutationAt = Date.now();
});

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
const settling = () => queryClient.isMutating() > 0 || Date.now() - lastMutationAt < SETTLE_MS;

function stopTimer(s) {
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
}

function schedule(s, ms) {
  stopTimer(s);
  if (s !== session || !visible()) return;
  s.timer = setTimeout(() => poll(s), Math.max(0, ms));
}

function nextDelay(s) {
  const now = Date.now();
  if (s.pausedUntil > now) return s.pausedUntil - now;
  if (s.failures) return Math.min(POLL_MS * 2 ** s.failures, MAX_BACKOFF_MS);
  return POLL_MS;
}

/** Refetch what the moved topics show, once the tab's own writes have settled. */
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
  for (const topic of topics) {
    for (const filter of REFRESH[topic] || []) {
      const id = `${JSON.stringify(filter.queryKey)}${filter.predicate ? '*' : ''}`;
      if (done.has(id)) continue;
      done.add(id);
      queryClient.invalidateQueries(filter);
    }
  }
}

function owe(s, topics) {
  topics.forEach((t) => s.owed.add(t));
  if (s.deliverTimer) clearTimeout(s.deliverTimer);
  s.deliverTimer = setTimeout(() => deliver(s), DEBOUNCE_MS);
}

/** The bell's count, written into the query the layout reads ({ unread }), when the shape matches. */
function setUnread(unread) {
  const old = queryClient.getQueryData(UNREAD_KEY);
  if (old !== undefined && !(old && typeof old === 'object' && 'unread' in old)) return;
  if (old?.unread !== unread) queryClient.setQueryData(UNREAD_KEY, { ...(old || {}), unread });
}

function apply(s, data) {
  const v = data?.v;
  if (!v || typeof v !== 'object') return;
  const first = !s.known;
  const moved = first ? [] : Object.keys(v).filter((topic) => s.known[topic] !== v[topic]);
  s.known = { ...v };
  // Only when it moved: a count this tab lowered itself a moment ago stays put.
  if (typeof data.unread === 'number' && (first || moved.includes('alerts'))) setUnread(data.unread);
  if (moved.length) owe(s, moved);
}

async function poll(s) {
  s.timer = null;
  if (s !== session || !visible() || s.inFlight) return;
  if (Date.now() < s.pausedUntil) {
    schedule(s, s.pausedUntil - Date.now());
    return;
  }
  s.inFlight = true;
  try {
    const data = await api.get('/api/live');
    s.failures = 0;
    if (s === session) apply(s, data);
  } catch (err) {
    if (err?.status === 404) s.pausedUntil = Date.now() + PAUSE_MS;
    else s.failures = Math.min(s.failures + 1, 8);
  } finally {
    s.inFlight = false;
    schedule(s, nextDelay(s));
  }
}

function onVisibility() {
  if (!session) return;
  // Back in view: catch up at once. Hidden: ask nothing.
  if (visible()) schedule(session, 0);
  else stopTimer(session);
}

function start(user) {
  if (session?.user === user) return;
  stop();
  session = { user, known: null, timer: null, inFlight: false, failures: 0, pausedUntil: 0, owed: new Set(), deliverTimer: null };
  document.addEventListener('visibilitychange', onVisibility);
  schedule(session, FIRST_POLL_MS);
}

function stop() {
  if (!session) return;
  stopTimer(session);
  if (session.deliverTimer) clearTimeout(session.deliverTimer);
  document.removeEventListener('visibilitychange', onVisibility);
  session = null;
}

/**
 * Keep this tab live while someone is signed in. App mounts it once, with the
 * person's id (null while signed out or held on the password screen); a new
 * person starts from fresh baselines.
 */
export function useLiveSync(userId) {
  useEffect(() => {
    if (!userId) return undefined;
    start(String(userId));
    return stop;
  }, [userId]);
}

/** What the poller holds right now, for the browser console. */
export const liveDebugState = () => (session ? { ...session, owed: [...session.owed], lastMutationAt } : null);
