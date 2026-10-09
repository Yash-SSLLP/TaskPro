/**
 * LIVE VERSIONS: how a screen learns that somebody else changed what it shows.
 *
 * The user: "multiple people do update in same time so all should get updated
 * screen with proper data, like real time". Production runs on Vercel
 * functions: no sockets, nothing long-lived, memory is per instance, and work
 * left for after the answer may never run. So the apps POLL, but they poll
 * this: GET /api/live hands back four small numbers, and a screen reloads only
 * when the number for what it shows has moved (the HRMS's design: its
 * models/LiveVersion.js and services/liveVersions.js).
 *
 *   KEYS        one counter per person and topic, `u:<userId>:<topic>`, so
 *               nobody reloads for work that is not theirs. Topics: tasks,
 *               alerts, calendar, people. Shared counters for the rest:
 *                 all:tasks     every task change (the Super Admin sees all)
 *                 all:people    contacts, teams, profiles (rare)
 *                 bulk:<topic>  a sweep whose people can't be told cheaply
 *                               (an account or a team deleted); everyone
 *                               reads it
 *   WRITE SIDE  ./plugin.js hooks every model and ./rules.js says whose keys
 *               a write moves. Inside a request bump() only COLLECTS the
 *               keys, and middleware() writes them all as ONE bulkWrite
 *               BEFORE the answer goes out (on Vercel, anything left for
 *               after it may never run). Outside a request (the jobs, scripts,
 *               tests) a bump is written at once.
 *   READ SIDE   versionsFor(user): one indexed read. Each topic is the sum of
 *               the person's own key and the shared keys that apply to them:
 *               counters only go up, so the sum moves exactly when one does.
 *
 * NOTHING HERE MAY FAIL A WRITE OR A REQUEST. Every fault is caught and logged
 * (at most once a minute); the worst it can do is a screen refreshing late.
 */
const { AsyncLocalStorage } = require('node:async_hooks');
const mongoose = require('mongoose');

const TOPICS = ['tasks', 'alerts', 'calendar', 'people'];
const ALL_TASKS = 'all:tasks';
const ALL_PEOPLE = 'all:people';
const userKey = (id, topic) => `u:${id}:${topic}`;
const bulkKey = (topic) => `bulk:${topic}`;

/** Above this many people, one shared bump is cheaper than a key each. */
const MAX_PERSONAL = 200;
/** The longest an answer waits for its changes to be recorded. */
const FLUSH_WAIT_MS = 2000;

/** Counters for tests and diagnostics. */
const stats = { bumps: 0, writes: 0, errors: 0 };

let lastWarnAt = 0;
function warn(message) {
  const now = Date.now();
  if (now - lastWarnAt < 60 * 1000) return;
  lastWarnAt = now;
  console.warn(`[live] ${message}`);
}

// Lazy: compiled the first time something is bumped or read, never while
// another model file is still being loaded.
let LiveVersion = null;
const model = () => LiveVersion || (LiveVersion = require('./LiveVersion'));

/** The keys for these people on one topic: theirs, or the shared one when there are too many. */
function personal(ids, topic) {
  const list = [...new Set([...(ids || [])].filter(Boolean).map(String))];
  if (list.length > MAX_PERSONAL) return [bulkKey(topic)];
  return list.map((id) => userKey(id, topic));
}

// ---------------------------------------------------------------- writing

/** One store per request: { keys, work, memo, closed } (see middleware). */
const als = new AsyncLocalStorage();
/** Work started outside an open request: the jobs, or after an answer went out. */
const loose = new Set();

/** The current request's store, while it is still collecting. */
function openStore() {
  const store = als.getStore();
  return store && !store.closed ? store : null;
}

/** Keep a (never-rejecting) promise in view of whoever must wait for it. */
function track(promise) {
  const store = openStore();
  const bag = store ? store.work : loose;
  bag.add(promise);
  promise.then(() => bag.delete(promise));
  return promise;
}

/** Add one to each key, in one round trip. Never throws. */
async function write(keys) {
  const list = [...new Set(keys)];
  if (!list.length) return;
  try {
    const M = model();
    // A script that has already disconnected, or tests shutting down: drop it
    // rather than let Mongoose buffer the command and hold the process open.
    if (!M.db || M.db.readyState !== 1) return;
    await M.bulkWrite(
      list.map((_id) => ({ updateOne: { filter: { _id }, update: { $inc: { v: 1 }, $currentDate: { at: true } }, upsert: true } })),
      { ordered: false }
    );
    stats.writes += 1;
  } catch (err) {
    stats.errors += 1;
    warn(`could not record a change to ${list.length} key(s): ${err.message}`);
  }
}

/**
 * Say that these keys changed. Cheap and synchronous: inside a request the
 * keys are only collected; outside one they are written at once.
 * @param {string|string[]} keys
 */
function bump(keys) {
  try {
    const list = [].concat(keys || []).filter(Boolean).map(String);
    if (!list.length) return;
    stats.bumps += list.length;
    const store = openStore();
    if (store) list.forEach((k) => store.keys.add(k));
    else track(write(list));
  } catch {
    /* never let this reach the write that caused it */
  }
}

/**
 * Work the keys out later (it may need a read: a task's people, a team's
 * admins) and bump them. The request waits for it before answering.
 * @param {() => Promise<string[]>} compute
 */
function defer(compute) {
  try {
    track(
      (async () => {
        try {
          bump(await compute());
        } catch (err) {
          stats.errors += 1;
          warn(`could not work out who a change is for: ${err.message}`);
        }
      })()
    );
  } catch {
    /* never let this reach the write that caused it */
  }
}

/** What this request's lookups share (a task's people, a team's admins); a fresh one outside requests. */
const memo = () => openStore()?.memo || new Map();

/**
 * Write everything this request has changed so far: wait for the work its
 * writes started (and whatever loose work was already in flight, which is
 * where a request's own changes land if the async context was lost on the
 * way, e.g. through a multipart parser on an older Node), then one bulkWrite.
 * `close`: the answer is going out, so anything later is written at once.
 */
async function drain(store, { close = false } = {}) {
  const inFlight = [...loose];
  if (inFlight.length) await Promise.all(inFlight);
  for (let round = 0; round < 20; round += 1) {
    if (store.work.size) await Promise.all([...store.work]);
    if (store.keys.size) {
      const keys = [...store.keys];
      store.keys.clear();
      await write(keys);
    }
    if (!store.work.size && !store.keys.size) break;
  }
  if (close) store.closed = true;
}

/**
 * Express middleware: collect what each request changes, and record it just
 * BEFORE the answer is sent (the answer waits for it, at most FLUSH_WAIT_MS).
 * Never after: on Vercel the function may be frozen the moment it answers.
 */
function middleware(req, res, next) {
  const store = { keys: new Set(), work: new Set(), memo: new Map(), closed: false };
  const end = res.end;
  let held = false;
  res.end = function endAfterChangesAreRecorded(...args) {
    if (held || store.closed) return end.apply(this, args);
    held = true;
    // Nothing changed (most reads): answer straight away.
    if (!store.keys.size && !store.work.size && !loose.size) {
      store.closed = true;
      return end.apply(this, args);
    }
    let timer = null;
    const cap = new Promise((resolve) => {
      timer = setTimeout(resolve, FLUSH_WAIT_MS);
    });
    Promise.race([drain(store, { close: true }), cap]).then(() => {
      clearTimeout(timer);
      end.apply(res, args);
    });
    return this;
  };
  // A client that went away before the answer still has its changes recorded.
  res.once('close', () => {
    if (held) return;
    held = true;
    drain(store, { close: true });
  });
  als.run(store, next);
}

/** Record what this request has changed so far, now (GET /api/live does, before it reads). */
async function flushRequest() {
  const store = openStore();
  if (store) await drain(store);
  else await idle();
}

/** Resolves once every change made so far outside a request has been recorded (tests, scripts). */
async function idle() {
  for (let round = 0; round < 50 && loose.size; round += 1) await Promise.all([...loose]);
}

// ---------------------------------------------------------------- reading

/**
 * The four numbers one person compares: each the sum of their own key and
 * the shared keys that apply to them. The Super Admin's tasks include every
 * task change; everyone's people include all:people.
 * @returns {Promise<{ tasks: number, alerts: number, calendar: number, people: number }>}
 */
async function versionsFor(user) {
  const id = String(user._id);
  const plan = {
    tasks: [userKey(id, 'tasks'), bulkKey('tasks'), ...(user.role === 'superadmin' ? [ALL_TASKS] : [])],
    alerts: [userKey(id, 'alerts'), bulkKey('alerts')],
    calendar: [userKey(id, 'calendar'), bulkKey('calendar')],
    people: [userKey(id, 'people'), ALL_PEOPLE],
  };
  const wanted = [...new Set(Object.values(plan).flat())];
  const rows = await model().find({ _id: { $in: wanted } }, { v: 1 }).lean();
  const v = new Map(rows.map((r) => [r._id, Number(r.v) || 0]));
  return Object.fromEntries(Object.entries(plan).map(([topic, keys]) => [topic, keys.reduce((n, k) => n + (v.get(k) || 0), 0)]));
}

// ---------------------------------------------------------------- setting up

let registered = false;

/**
 * Hook every model compiled from now on (./plugin.js). Must run before ANY
 * model is compiled: Mongoose applies a global plugin when a model is made,
 * never to one that already exists. app.js does it first thing.
 */
function register() {
  if (registered) return;
  registered = true;
  const { RULES } = require('./rules');
  const early = Object.keys(RULES).filter((name) => mongoose.modelNames().includes(name));
  mongoose.plugin(require('./plugin'));
  if (early.length) {
    console.warn(
      `[live] ${early.join(', ')} were compiled before live updates were set up, so their changes will not ` +
        'refresh other screens. Require src/app.js before any model (e.g. before src/product in server.js).'
    );
  }
}

module.exports = {
  TOPICS,
  ALL_TASKS,
  ALL_PEOPLE,
  userKey,
  bulkKey,
  MAX_PERSONAL,
  personal,
  bump,
  defer,
  memo,
  middleware,
  flushRequest,
  idle,
  versionsFor,
  register,
  stats,
};
