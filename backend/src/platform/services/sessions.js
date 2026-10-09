/**
 * Signed-in devices (models/Session.js): starting one at sign-in, keeping it
 * current on every request, ending one or all of them, and reading them back
 * for the Super Admin (who is online, on which app version).
 *
 * The apps describe themselves on every request:
 *   X-Platform        web | android | ios
 *   X-App-Version     "1.0.3"            X-App-Build    "4"
 *   X-Device-Name     "Pixel 7", "Chrome on Windows"
 *   X-OS-Version      "Android 14"       X-Push-Permission  granted | denied | undetermined
 * An older app sends none of these; its platform and browser are then read
 * from the User-Agent, once, when its session is made.
 */
const crypto = require('node:crypto');
const Session = require('../models/Session');
const { PLATFORMS, PUSH_PERMISSIONS } = require('../models/Session');

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

/** "Online" = a request in the last two minutes (both apps poll every minute while open). */
const ONLINE_MS = 2 * MIN;
/** A session nobody has used for this long counts as signed out (tokens last 30 days). */
const SIGNED_IN_MS = 30 * DAY;
/** `lastSeenAt` is written at most this often per session. */
const STAMP_MS = MIN;

const newSid = () => crypto.randomBytes(18).toString('base64url');

/** A header (or any value) as a short, printable string. */
function clean(value, max) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[^\x20-\x7e -￿]/g, '')
    .trim()
    .slice(0, max);
}

/** Which kind of app a User-Agent belongs to, for apps that do not say. */
function platformFromAgent(ua) {
  if (!ua) return 'other';
  if (/okhttp/i.test(ua)) return 'android'; // React Native's networking on Android
  if (/CFNetwork|Darwin/i.test(ua)) return 'ios';
  if (/Mozilla\//.test(ua)) return 'web';
  return 'other';
}

/** "Chrome on Windows" from a browser's User-Agent ('' when it cannot tell). */
function browserName(ua) {
  if (!ua || !/Mozilla\//.test(ua)) return '';
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/i.test(ua)
        ? 'iOS'
        : /CrOS/i.test(ua)
          ? 'ChromeOS'
          : /Mac OS X|Macintosh/i.test(ua)
            ? 'macOS'
            : /Linux/i.test(ua)
              ? 'Linux'
              : '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : '';
  if (browser && os) return `${browser} on ${os}`;
  return browser || os;
}

/**
 * What a request says about the device it came from.
 * `explicit` is true when the app described itself (X-Platform).
 */
function clientInfo(req) {
  const get = (name) => (typeof req?.get === 'function' ? req.get(name) : req?.headers?.[name.toLowerCase()]);
  const ua = clean(get('user-agent'), 300);
  const said = clean(get('x-platform'), 16).toLowerCase();
  const explicit = PLATFORMS.includes(said);
  const platform = explicit ? said : platformFromAgent(ua);
  const push = clean(get('x-push-permission'), 16).toLowerCase();
  return {
    explicit,
    platform,
    appVersion: clean(get('x-app-version'), 40) || undefined,
    appBuild: clean(get('x-app-build'), 20) || undefined,
    deviceName: clean(get('x-device-name'), 80) || (platform === 'web' ? browserName(ua) : '') || undefined,
    osVersion: clean(get('x-os-version'), 40) || undefined,
    pushPermission: PUSH_PERMISSIONS.includes(push) ? push : undefined,
    userAgent: ua || undefined,
    ip: clean(req?.ip, 64) || undefined,
  };
}

const DEVICE_FIELDS = ['platform', 'appVersion', 'appBuild', 'deviceName', 'osVersion', 'pushPermission', 'userAgent'];

/** The fields of `info` worth storing on a new session. */
function deviceFields(info) {
  const out = {};
  for (const key of [...DEVICE_FIELDS, 'ip']) if (info[key] !== undefined) out[key] = info[key];
  return out;
}

/** Start a session for someone who just signed in (or signed up). */
async function start(req, user) {
  const info = clientInfo(req);
  const session = await Session.create({ user: user._id, sid: newSid(), ...deviceFields(info), lastSeenAt: new Date() });
  return session.toObject();
}

/**
 * The session for a token signed before sessions existed: made on first use,
 * one per token (person + the token's issue time), so a burst of requests
 * from one device makes one session and two devices get two. May come back
 * revoked: that token was signed out.
 */
async function adoptLegacy(req, user, issuedAt) {
  const legacyKey = `${user._id}:${issuedAt || 0}`;
  const found = await Session.findOne({ legacyKey }).lean();
  if (found) return found;
  const info = clientInfo(req);
  try {
    const made = await Session.create({ user: user._id, sid: newSid(), legacy: true, legacyKey, ...deviceFields(info), lastSeenAt: new Date() });
    return made.toObject();
  } catch (err) {
    if (err?.code === 11000) return Session.findOne({ legacyKey }).lean();
    throw err;
  }
}

// When each session was last stamped by this server instance. A cap keeps it small.
const stamped = new Map();

/**
 * Keep a session current: `lastSeenAt` (at most once a minute) and the
 * device details the app reports, when they change. Only requests where the
 * app described itself update the device details, so a media player fetching
 * a voice note with the same token does not rewrite them.
 */
async function touch(session, req, now = Date.now()) {
  if (!session?._id) return;
  const info = clientInfo(req);
  const set = {};
  if (info.explicit) {
    for (const key of DEVICE_FIELDS) {
      if (info[key] !== undefined && info[key] !== session[key]) set[key] = info[key];
    }
  }
  const last = Math.max(stamped.get(session.sid) || 0, session.lastSeenAt ? new Date(session.lastSeenAt).getTime() : 0);
  if (now - last >= STAMP_MS) {
    set.lastSeenAt = new Date(now);
    if (info.ip && info.ip !== session.ip) set.ip = info.ip;
    stamped.set(session.sid, now);
    if (stamped.size > 20000) stamped.clear();
  }
  if (!Object.keys(set).length) return;
  Object.assign(session, set);
  await Session.updateOne({ _id: session._id }, { $set: set });
}

/** End one session. Returns true when it was live. */
async function revoke(sid, { reason = 'signed_out', by = null } = {}) {
  const res = await Session.updateOne({ sid, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason, revokedBy: by } });
  return res.modifiedCount > 0;
}

/** End every live session someone has (optionally keeping one). Returns how many ended. */
async function revokeAll(userId, { reason = 'admin_all', by = null, except = null } = {}) {
  const filter = { user: userId, revokedAt: null };
  if (except) filter.sid = { $ne: except };
  const res = await Session.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason, revokedBy: by } });
  return res.modifiedCount;
}

const seenMs = (s) => (s?.lastSeenAt ? new Date(s.lastSeenAt).getTime() : 0);
const isOnline = (s, now = Date.now()) => !s?.revokedAt && now - seenMs(s) <= ONLINE_MS;
const isPhone = (s) => s?.platform === 'android' || s?.platform === 'ios';

/** A session as the console shows it. */
function view(s, { now = Date.now(), currentSid = null } = {}) {
  return {
    sid: s.sid,
    platform: s.platform || 'other',
    appVersion: s.appVersion || '',
    appBuild: s.appBuild || '',
    deviceName: s.deviceName || '',
    osVersion: s.osVersion || '',
    userAgent: s.userAgent || '',
    ip: s.ip || '',
    pushPermission: s.pushPermission || null,
    createdAt: s.createdAt || null,
    lastSeenAt: s.lastSeenAt || null,
    online: isOnline(s, now),
    current: !!currentSid && s.sid === currentSid,
    legacy: !!s.legacy,
    revokedAt: s.revokedAt || null,
    revokedReason: s.revokedReason || null,
  };
}

/** Live sessions: not signed out, used in the last 30 days. */
const liveFilter = (now = Date.now()) => ({ revokedAt: null, lastSeenAt: { $gte: new Date(now - SIGNED_IN_MS) } });

/**
 * What app each person is on. For each one: their newest phone session (the
 * Android or iPhone app) if they have one, else their newest session of any
 * kind, read as
 *   app      a phone that reported its version
 *   unknown  a phone (or an unknown device) that never said: an older app
 *   web      signed in on the web only
 *   none     not signed in anywhere
 * Whether a version is the latest is for the apps to say: they read the
 * published release (web /app/release.json) and compare build numbers.
 * @param {object[]} people lean users (any fields; `_id` is what counts)
 * @returns {Promise<Map<string, object>>} user id → { state, phone, newest, sessions, online, web }
 */
async function appStateOf(people, now = Date.now()) {
  const ids = people.map((p) => p._id);
  const rows = ids.length
    ? await Session.find({ user: { $in: ids }, ...liveFilter(now) })
        .select('user sid platform appVersion appBuild deviceName osVersion pushPermission lastSeenAt createdAt legacy')
        .sort({ lastSeenAt: -1 })
        .lean()
    : [];
  const map = new Map(ids.map((id) => [String(id), { state: 'none', phone: null, newest: null, sessions: 0, online: false, web: false }]));
  for (const s of rows) {
    const entry = map.get(String(s.user));
    if (!entry) continue;
    entry.sessions += 1;
    if (!entry.newest) entry.newest = s;
    if (!entry.phone && isPhone(s)) entry.phone = s;
    if (s.platform === 'web') entry.web = true;
    if (isOnline(s, now)) entry.online = true;
  }
  for (const entry of map.values()) {
    if (entry.phone) entry.state = entry.phone.appVersion ? 'app' : 'unknown';
    else if (entry.newest) entry.state = entry.newest.platform === 'web' ? 'web' : 'unknown';
  }
  return map;
}

/** The app-adoption summary for a set of people (from appStateOf). */
function adoptionSummary(states) {
  const summary = { total: 0, app: 0, unknown: 0, web: 0, none: 0, online: 0, builds: [] };
  const builds = new Map();
  for (const entry of states.values()) {
    summary.total += 1;
    summary[entry.state] += 1;
    if (entry.online) summary.online += 1;
    if (entry.state === 'app') {
      const key = `${entry.phone.platform}|${entry.phone.appVersion}|${entry.phone.appBuild || ''}`;
      const b = builds.get(key) || { platform: entry.phone.platform, appVersion: entry.phone.appVersion, appBuild: entry.phone.appBuild || '', people: 0 };
      b.people += 1;
      builds.set(key, b);
    }
  }
  summary.builds = [...builds.values()].sort((a, b) => (Number(b.appBuild) || 0) - (Number(a.appBuild) || 0) || b.people - a.people);
  return summary;
}

module.exports = {
  ONLINE_MS,
  SIGNED_IN_MS,
  STAMP_MS,
  clientInfo,
  browserName,
  platformFromAgent,
  start,
  adoptLegacy,
  touch,
  revoke,
  revokeAll,
  isOnline,
  isPhone,
  view,
  liveFilter,
  appStateOf,
  adoptionSummary,
};
