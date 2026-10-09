/**
 * The activity log (models/ActivityLog.js): writing a row, and reading the
 * log back for the Super Admin's Activity tab.
 *
 * WRITING. `await activity.record({ req, action, target?, meta? })`. Await it:
 * on a serverless host nothing is guaranteed to run once the response is out.
 * It never throws: a log that cannot be written is reported on the console and
 * the request carries on. The actor defaults to the signed-in person (req.user
 * or, deeper in, the request `protect` is serving); `profile.*` rows are about
 * the actor unless a target is given. For example, from routes/me.js:
 *
 *   await activity.record({ req, action: 'profile.photo_changed' });
 *   await activity.record({ req, action: 'profile.photo_removed' });
 *
 * Actions, by group (describe.js words each one):
 *   auth    auth.login, auth.login_failed, auth.logout, auth.signup,
 *           auth.password_changed, auth.password_forgot, auth.password_reset,
 *           auth.account_deleted
 *   people  profile.updated, profile.photo_added|photo_changed|photo_removed,
 *           contact.requested|accepted|declined|removed|cancelled,
 *           team.created|updated|invited|joined|declined|left|member_removed|
 *           role_changed|transferred|deleted
 *   admin   admin.user_created|user_deleted|user_disabled|user_enabled|
 *           password_reset|signed_out|session_revoked|team_deleted|settings_changed
 *   tasks   task.<kind> for every task history row (product/models/TaskUpdate.js)
 *
 * Never put a password, a token or anything secret in `meta`.
 */
const { AsyncLocalStorage } = require('node:async_hooks');
const mongoose = require('mongoose');
const { DateTime, IANAZone } = require('luxon');
const ActivityLog = require('../models/ActivityLog');
const { badRequest } = require('../errors');
const { describe } = require('./describe');

// ---------------------------------------------------------------- request context

const als = new AsyncLocalStorage();

/** Run `fn` (the rest of the request) with `req` reachable from deep inside (model hooks). */
const withRequest = (req, fn) => als.run({ req }, fn);
const currentRequest = () => als.getStore()?.req || null;

// ---------------------------------------------------------------- writing

const GROUP_OF = { auth: 'auth', task: 'tasks', profile: 'people', contact: 'people', team: 'people', admin: 'admin' };
const groupOf = (action) => GROUP_OF[String(action || '').split('.')[0]] || 'other';

const idOf = (x) => (x && (x._id || x.id) ? String(x._id || x.id) : x ? String(x) : '');

/** A person as a row's target. */
const personTarget = (u) => (u ? { kind: 'user', id: idOf(u), label: u.name || '' } : undefined);
/** A team as a row's target. */
const teamTarget = (t) => (t ? { kind: 'team', id: idOf(t), label: t.name || '' } : undefined);

const SECRET_KEY = /password|passwd|token|secret|hash/i;

/** Copy `meta` without secrets, long strings or deep nesting. */
function scrub(value, depth = 0) {
  if (value === undefined || value === null) return value;
  if (value instanceof Date) return value;
  if (value instanceof mongoose.Types.ObjectId) return String(value);
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 499)}…` : value;
  if (typeof value !== 'object') return value;
  if (depth > 3) return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY.test(k) || v === undefined) continue;
    out[k] = scrub(v, depth + 1);
  }
  return out;
}

const platformOf = (req) => {
  if (!req) return undefined;
  if (req.authSession?.platform) return req.authSession.platform;
  // Lazy: sessions.js is only needed here when a request carries no session.
  return require('./sessions').clientInfo(req).platform;
};

/**
 * Write one row. Never throws; resolves to the row, or null if it could not be written.
 * @param {{ action: string, req?: object, actor?: object|null, actorName?: string, system?: boolean,
 *   target?: { kind, id, label }, meta?: object, at?: Date }} entry
 *   `actor`: a user (document, lean row, or { _id, name, role }); null for
 *   nobody known. Left out, it is the signed-in person.
 */
async function record({ action, req, actor, actorName, system = false, target, meta, at } = {}) {
  try {
    if (!action) throw new Error('an action is required');
    const r = req || currentRequest();
    const who = actor === undefined ? r?.user || null : actor;
    // A row written for someone else's update (a task hook) learns their role only if they are the one asking.
    const role = who?.role || (who && r?.user && idOf(r.user) === idOf(who) ? r.user.role : undefined);
    const row = {
      at: at || new Date(),
      actor: who?._id || who?.id || null,
      actorName: actorName || who?.name || (system ? 'KARO' : undefined),
      actorRole: role,
      action,
      group: groupOf(action),
      target: target || (action.startsWith('profile.') && who ? personTarget(who) : undefined),
      meta: scrub(meta),
      ip: r?.ip || undefined,
      platform: platformOf(r),
    };
    if (system) row.meta = { ...(row.meta || {}), system: true };
    return await ActivityLog.create(row);
  } catch (err) {
    console.warn(`[activity] could not record ${action}:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------- reading

const GROUPS = ['auth', 'tasks', 'people', 'admin'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A query-string value as one trimmed string (anything else is refused). */
function one(value, name) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw badRequest(`Invalid "${name}" filter`);
  return value.trim();
}

/** "2026-10-08" (a whole day in `tz`) or an ISO time → a Date. */
function dateOf(value, tz, end) {
  if (DAY_RE.test(value)) {
    const day = DateTime.fromISO(value, { zone: tz });
    if (!day.isValid) return null;
    return (end ? day.endOf('day') : day.startOf('day')).toJSDate();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Midnight today in `tz`. */
function startOfToday(tz, now = new Date()) {
  const zone = tz && IANAZone.isValidZone(tz) ? tz : 'Asia/Kolkata';
  return DateTime.fromJSDate(now, { zone }).startOf('day').toJSDate();
}

/**
 * The Mongo filter for the Activity tab's filters.
 * @param {{ q?, group?, user?, from?, to?, action? }} query
 * @param {{ tz?: string }} opts the viewer's time zone, for whole days
 */
function buildFilter(query = {}, { tz = 'Asia/Kolkata' } = {}) {
  const zone = IANAZone.isValidZone(tz) ? tz : 'Asia/Kolkata';
  const filter = {};
  const and = [];
  const group = one(query.group, 'group');
  if (group) {
    if (!GROUPS.includes(group)) throw badRequest('Invalid "group" filter');
    filter.group = group;
  }
  const action = one(query.action, 'action');
  if (action) filter.action = action;
  const user = one(query.user, 'user');
  if (user) {
    if (!mongoose.isValidObjectId(user)) throw badRequest('Invalid "user" filter');
    and.push({ $or: [{ actor: new mongoose.Types.ObjectId(user) }, { 'target.id': user }] });
  }
  const q = one(query.q, 'q');
  if (q) {
    const rx = new RegExp(escapeRe(q.slice(0, 100)), 'i');
    and.push({ $or: [{ actorName: rx }, { 'target.label': rx }, { 'meta.identifier': rx }, { 'meta.person.name': rx }] });
  }
  const from = one(query.from, 'from');
  const to = one(query.to, 'to');
  if (from || to) {
    filter.at = {};
    if (from) {
      const d = dateOf(from, zone, false);
      if (!d) throw badRequest('Invalid "from" date');
      filter.at.$gte = d;
    }
    if (to) {
      const d = dateOf(to, zone, true);
      if (!d) throw badRequest('Invalid "to" date');
      filter.at.$lte = d;
    }
  }
  if (and.length) filter.$and = and;
  return filter;
}

/** The cursor of a row ("<ms>_<id>"), for `before`. */
const cursorOf = (row) => `${new Date(row.at).getTime()}_${row._id}`;

/** A `before` cursor → a filter for the rows after it (older), or null. */
function afterCursor(raw) {
  const s = one(raw, 'before');
  if (!s) return null;
  const m = /^(\d{1,15})_([a-f\d]{24})$/i.exec(s);
  if (m) {
    const at = new Date(Number(m[1]));
    const id = new mongoose.Types.ObjectId(m[2]);
    return { $or: [{ at: { $lt: at } }, { at, _id: { $lt: id } }] };
  }
  // A plain time also works: everything strictly older.
  const at = new Date(s);
  if (Number.isNaN(at.getTime())) throw badRequest('Invalid "before" cursor');
  return { at: { $lt: at } };
}

/** A row as the console shows it: the row, plus its sentence and badge (and the actor's photo, when `photos` has it). */
function view(row, photos) {
  const words = describe(row);
  return {
    id: String(row._id),
    at: row.at,
    action: row.action,
    group: row.group,
    actor: row.actor ? String(row.actor) : null,
    actorName: row.actorName || '',
    actorRole: row.actorRole || null,
    actorPhotoUrl: (row.actor && photos?.get(String(row.actor))) || null,
    target: row.target || null,
    meta: row.meta || {},
    ip: row.ip || '',
    platform: row.platform || '',
    summary: words.summary,
    actorLabel: words.actorLabel,
    badge: words.badge,
  };
}

/** Rows as the console shows them, with each actor's current photo (one query for them all). */
async function views(rows) {
  const ids = [...new Set(rows.map((r) => (r.actor ? String(r.actor) : '')).filter(Boolean))];
  let photos = null;
  if (ids.length) {
    try {
      // Lazy: the User model is only needed here.
      const User = require('../models/User');
      const people = await User.find({ _id: { $in: ids } }).select('photo').lean();
      photos = new Map(people.map((p) => [String(p._id), User.photoUrlOf ? User.photoUrlOf(p) : null]));
    } catch {
      photos = null; // initials instead
    }
  }
  return rows.map((r) => view(r, photos));
}

/**
 * One page of the log, newest first.
 * @returns {Promise<{ items: object[], next: string|null }>}
 */
async function list(query = {}, { tz, limit: max } = {}) {
  const limit = Math.min(Math.max(Number(max ?? query.limit) || 50, 1), 200);
  const filter = buildFilter(query, { tz });
  const older = afterCursor(query.before);
  const where = older ? { $and: [filter, older] } : filter;
  const rows = await ActivityLog.find(where).sort({ at: -1, _id: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  return { items: await views(page), next: rows.length > limit ? cursorOf(page[page.length - 1]) : null };
}

/** The latest rows done by, or done to, one person. */
async function recentFor(userId, limit = 20) {
  const id = String(userId);
  const rows = await ActivityLog.find({ $or: [{ actor: new mongoose.Types.ObjectId(id) }, { 'target.id': id }] })
    .sort({ at: -1, _id: -1 })
    .limit(limit)
    .lean();
  return views(rows);
}

module.exports = {
  record,
  withRequest,
  currentRequest,
  personTarget,
  teamTarget,
  groupOf,
  GROUPS,
  buildFilter,
  afterCursor,
  cursorOf,
  startOfToday,
  view,
  views,
  list,
  recentFor,
};
