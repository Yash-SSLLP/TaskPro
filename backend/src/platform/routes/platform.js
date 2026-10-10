/**
 * /api/platform: the Super Admin console. Everyone on the platform, who is
 * signed in where and on which app version, every team, the activity log,
 * and the switches: add or delete an account, disable it, reset its password,
 * sign it out (one device or everywhere), change its notification settings.
 * (Tasks are handled through the normal task routes, where the Super Admin
 * can see and change everything.)
 */
const crypto = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const product = require('../../product');
const User = require('../models/User');
const Team = require('../models/Team');
const Contact = require('../models/Contact');
const Device = require('../models/Device');
const Session = require('../models/Session');
const ActivityLog = require('../models/ActivityLog');
const { publicUser } = require('../models/User');
const { protect, requireSuperAdmin } = require('../auth');
const { z, parse, password, trimmed, idParam } = require('../validate');
const { normalizePin } = require('../pin');
const { requireIdentifier, identifierFilter, formatPhone } = require('../identity');
const { badRequest, forbidden, notFound, conflict } = require('../errors');
const { teamsOf } = require('../services/people');
const { deleteAccount } = require('../services/accounts');
const sessions = require('../services/sessions');
const activity = require('../services/activity');
const { teamView, deleteTeam } = require('./teams');

const router = express.Router();
router.use(protect, requireSuperAdmin);

const DAY = 24 * 3600 * 1000;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tzOf = (req) => req.settings?.timezone || 'Asia/Kolkata';
const person = (u) => (u ? publicUser(u, { full: false }) : null);
const loginOf = (u) => u?.email || formatPhone(u?.phone) || u?.username || '';

// ---------------------------------------------------------------- overview

router.get('/overview', async (req, res) => {
  const now = Date.now();
  const since = new Date(now - 7 * DAY);
  const people = { role: 'user', deletedAt: null };
  // Who is online counts people, not the Super Admin looking at it.
  const admins = await User.distinct('_id', { role: 'superadmin' });
  const live = { ...sessions.liveFilter(now), user: { $nin: admins } };
  const onlineSince = new Date(now - sessions.ONLINE_MS);
  const onlineNow = { revokedAt: null, lastSeenAt: { $gte: onlineSince }, user: { $nin: admins } };
  const [users, activeWeek, newWeek, disabled, teams, tasks, online, onlineDevices, signedIn, everyone] = await Promise.all([
    User.countDocuments(people),
    User.countDocuments({ ...people, lastSeenAt: { $gte: since } }),
    User.countDocuments({ ...people, createdAt: { $gte: since } }),
    User.countDocuments({ ...people, status: 'disabled' }),
    Team.countDocuments({}),
    product.platformTotals(),
    Session.distinct('user', onlineNow),
    Session.countDocuments(onlineNow),
    Session.distinct('user', live),
    User.find({ ...people, status: 'active' }).select('_id').lean(),
  ]);
  const app = sessions.adoptionSummary(await sessions.appStateOf(everyone, now));
  res.json({
    users,
    activeWeek,
    newWeek,
    disabled,
    teams,
    tasks,
    online: online.length,
    onlineDevices,
    signedIn: signedIn.length,
    app,
  });
});

// ---------------------------------------------------------------- people

router.get('/users', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = { role: 'user', deletedAt: null };
  if (['active', 'disabled'].includes(req.query.status)) filter.status = req.query.status;
  if (q) {
    const rx = new RegExp(escapeRe(q), 'i');
    const pin = normalizePin(q);
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { username: rx }, { pin: pin || rx }];
  }
  const list = await User.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  const [stats, states] = await Promise.all([product.userStats(list.map((u) => u._id)), sessions.appStateOf(list)]);
  res.json({
    users: list.map((u) => {
      const app = states.get(String(u._id));
      return {
        ...publicUser(u),
        lastLoginAt: u.lastLoginAt || null,
        online: !!app?.online,
        sessions: app?.sessions || 0,
        stats: stats.get(String(u._id)) || { open: 0, given: 0, overdue: 0 },
      };
    }),
  });
});

/** A strong temporary password that is easy to read out: "kmrt-4829-xpqz". */
function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const group = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

const createSchema = z.object({
  name: trimmed(80, 'Name').min(1, 'Enter their name'),
  title: trimmed(60, 'Job title').optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  username: z.string().trim().max(40).optional(),
  password: z.string().max(128, 'Password is too long').optional(),
});

/** Add someone, exactly as sign-up would, with a password they must change. */
router.post('/users', async (req, res) => {
  const body = parse(createSchema, req.body);
  const ids = [];
  for (const type of ['email', 'phone', 'username']) {
    if (body[type]) ids.push(requireIdentifier(body[type], [type]));
  }
  if (!ids.length) throw badRequest('Give them an email, a mobile number or a username to sign in with');
  for (const id of ids) {
    const existing = await User.findOne(identifierFilter(id)).select('_id').lean();
    if (existing) throw conflict(`An account with this ${{ email: 'email', phone: 'mobile number', username: 'username' }[id.type]} already exists`);
  }
  const chosen = String(body.password || '');
  if (chosen && chosen.length < 8) throw badRequest('Password must be at least 8 characters');
  const temp = chosen || temporaryPassword();

  const user = new User({
    name: body.name,
    title: body.title || undefined,
    role: 'user',
    settings: product.settings.defaults(),
    mustChangePassword: true,
  });
  for (const id of ids) user[id.type] = id.value;
  await user.setPassword(temp);
  try {
    await user.saveWithPin();
  } catch (err) {
    if (err?.code === 11000) throw conflict('An account with these details already exists');
    throw err;
  }
  try {
    await product.onUserCreated?.({ user });
  } catch (err) {
    console.warn('[console] welcome task failed:', err.message);
  }
  await activity.record({ req, action: 'admin.user_created', target: activity.personTarget(user), meta: { login: loginOf(user), pin: user.pin } });
  res.status(201).json({ user: publicUser(user), temporaryPassword: temp });
});

/** Someone on the platform (never the Super Admin, never a deleted account). */
async function loadUser(req) {
  const user = await User.findOne({ _id: idParam(req.params.id), role: 'user', deletedAt: null });
  if (!user) throw notFound('Person not found');
  return user;
}

/** Their settings as the product reads them, and whether a phone can reach them. */
function notificationsOf(user, app, devices) {
  const s = product.settings.read(user.settings);
  return {
    dailyDigest: s.dailyDigest,
    dailyDigestAt: s.dailyDigestAt,
    defaultReminders: s.defaultReminders,
    approvalDefault: s.approvalDefault,
    workdayStart: s.workdayStart,
    timezone: s.timezone,
    lang: s.lang,
    // What the newest phone said about notifications, and how many phones are registered for push.
    pushPermission: app?.phone?.pushPermission || null,
    devices,
  };
}

router.get('/users/:id', async (req, res) => {
  const user = await loadUser(req);
  const now = Date.now();
  const [teams, contacts, stats, live, devices, recent, states] = await Promise.all([
    teamsOf(user._id),
    Contact.countDocuments({ $or: [{ a: user._id }, { b: user._id }], status: 'accepted' }),
    product.userStats([user._id]),
    Session.find({ user: user._id, ...sessions.liveFilter(now) }).sort({ lastSeenAt: -1 }).limit(20).lean(),
    Device.countDocuments({ user: user._id }),
    activity.recentFor(user._id, 20),
    sessions.appStateOf([user], now),
  ]);
  const app = states.get(String(user._id));
  const shownApp = app?.phone || app?.newest || null;
  res.json({
    user: { ...publicUser(user), lastLoginAt: user.lastLoginAt || null },
    lastLoginAt: user.lastLoginAt || null,
    teams,
    contacts,
    stats: stats.get(String(user._id)) || { open: 0, given: 0, overdue: 0 },
    online: !!app?.online,
    sessions: live.map((s) => sessions.view(s, { now })),
    app: shownApp ? { ...sessions.view(shownApp, { now }), state: app.state } : { state: 'none' },
    notifications: notificationsOf(user, app, devices),
    recent,
  });
});

router.patch('/users/:id', async (req, res) => {
  const body = parse(z.object({ status: z.enum(['active', 'disabled']) }), req.body);
  const user = await loadUser(req);
  if (user.status !== body.status) {
    user.status = body.status;
    // Switching someone off ends their sessions at once.
    if (body.status === 'disabled') user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    if (body.status === 'disabled') await sessions.revokeAll(user._id, { reason: 'disabled', by: req.user._id });
    await activity.record({ req, action: body.status === 'disabled' ? 'admin.user_disabled' : 'admin.user_enabled', target: activity.personTarget(user) });
  }
  res.json({ user: publicUser(user) });
});

router.post('/users/:id/password', async (req, res) => {
  const body = parse(z.object({ password }), req.body);
  const user = await loadUser(req);
  await user.setPassword(body.password);
  user.mustChangePassword = true;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await sessions.revokeAll(user._id, { reason: 'password_reset', by: req.user._id });
  await activity.record({ req, action: 'admin.password_reset', target: activity.personTarget(user) });
  res.json({ ok: true });
});

/** Sign someone out of every device. Nothing else about the account changes. */
router.post('/users/:id/sign-out', async (req, res) => {
  const user = await loadUser(req);
  if (String(user._id) === String(req.user._id)) throw badRequest('That is your own account. Use Sign out instead.');
  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  const ended = await sessions.revokeAll(user._id, { reason: 'admin_all', by: req.user._id });
  await activity.record({ req, action: 'admin.signed_out', target: activity.personTarget(user), meta: { sessions: ended } });
  res.json({ ok: true, signedOut: ended });
});

const settingsSchema = z
  .object({
    dailyDigest: z.boolean().optional(),
    dailyDigestAt: z.string().optional(),
    defaultReminders: z.array(z.any()).optional(),
  })
  .strict('Only the daily summary and the default reminders can be changed here');

/** "1 day before", "2 hours after", "every day at 09:00" */
function reminderText(r) {
  if (!r) return '';
  const unit = { MINUTES: 'minute', HOURS: 'hour', DAYS: 'day' }[r.unit] || 'day';
  if (r.when === 'EVERY') {
    const every = { HOURLY: 'every hour', DAILY: 'every day', WEEKLY: 'every week', MONTHLY: 'every month' }[r.pattern] || `every ${r.amount} ${unit}${r.amount === 1 ? '' : 's'}`;
    return `${every}${r.at ? ` at ${r.at}` : ''}`;
  }
  return `${r.amount} ${unit}${r.amount === 1 ? '' : 's'} ${r.when === 'AFTER' ? 'after' : 'before'}`;
}
const remindersText = (list) => (list?.length ? list.map(reminderText).join(', ') : 'none');

/** Change someone's notification settings (the daily summary and default reminders). */
router.patch('/users/:id/settings', async (req, res) => {
  const body = parse(settingsSchema, req.body);
  const user = await loadUser(req);
  const before = product.settings.read(user.settings);
  const settings = product.settings.merge(user.settings, body);
  await User.updateOne({ _id: user._id }, { $set: { settings } });
  user.settings = settings;

  const changes = [];
  if (before.dailyDigest !== settings.dailyDigest) {
    changes.push({ field: 'dailyDigest', label: 'Daily summary', before: before.dailyDigest ? 'on' : 'off', after: settings.dailyDigest ? 'on' : 'off' });
  }
  if (before.dailyDigestAt !== settings.dailyDigestAt) {
    changes.push({ field: 'dailyDigestAt', label: 'Daily summary time', before: before.dailyDigestAt, after: settings.dailyDigestAt });
  }
  const was = remindersText(before.defaultReminders);
  const now = remindersText(settings.defaultReminders);
  if (was !== now) changes.push({ field: 'defaultReminders', label: 'Default reminders', before: was, after: now });
  if (changes.length) await activity.record({ req, action: 'admin.settings_changed', target: activity.personTarget(user), meta: { changes } });

  const states = await sessions.appStateOf([user]);
  const devices = await Device.countDocuments({ user: user._id });
  res.json({ settings: product.settings.read(settings), notifications: notificationsOf(user, states.get(String(user._id)), devices) });
});

/**
 * Delete someone's account for good, the same way people delete their own
 * (services/accounts.js): their logins, pin, profile, contacts, team places,
 * devices, alerts, and tasks nobody else is on. Shared work stays with the
 * others, showing "Deleted user". Body (or query): `confirm: "DELETE"`.
 */
router.delete('/users/:id', async (req, res) => {
  const confirm = String(req.body?.confirm ?? req.query.confirm ?? '').trim();
  if (confirm !== 'DELETE') throw badRequest('Type DELETE to confirm');
  const user = await User.findOne({ _id: idParam(req.params.id), deletedAt: null });
  if (!user) throw notFound('Person not found');
  if (String(user._id) === String(req.user._id)) throw badRequest('That is your own account.');
  if (user.role === 'superadmin') throw forbidden('A Super Admin account cannot be deleted.');

  const who = { _id: user._id, name: user.name };
  const meta = { login: loginOf(user), pin: user.pin };
  await deleteAccount(user);
  await sessions.revokeAll(user._id, { reason: 'deleted', by: req.user._id });
  await activity.record({ req, action: 'admin.user_deleted', target: activity.personTarget(who), meta });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- who is signed in

const WINDOWS = ['online', 'today', '7d'];

/**
 * Signed-in devices seen in a window: `online` (a request in the last two
 * minutes: the apps poll every minute while open), `today` (since midnight in
 * the Super Admin's time zone) or `7d`.
 */
router.get('/sessions', async (req, res) => {
  const window = WINDOWS.includes(req.query.window) ? req.query.window : 'online';
  const now = Date.now();
  const bounds = {
    online: new Date(now - sessions.ONLINE_MS),
    today: activity.startOfToday(tzOf(req), new Date(now)),
    '7d': new Date(now - 7 * DAY),
  };
  const seen = (since) => ({ revokedAt: null, lastSeenAt: { $gte: since } });
  const [rows, online, today, week] = await Promise.all([
    Session.find(seen(bounds[window])).sort({ lastSeenAt: -1 }).limit(500).lean(),
    Session.distinct('user', seen(bounds.online)),
    Session.distinct('user', seen(bounds.today)),
    Session.distinct('user', seen(bounds['7d'])),
  ]);
  const people = await User.find({ _id: { $in: [...new Set(rows.map((s) => String(s.user)))] }, deletedAt: null }).lean();
  const byId = new Map(people.map((p) => [String(p._id), p]));
  const currentSid = req.authSession?.sid || null;
  const list = rows
    .filter((s) => byId.has(String(s.user)))
    .map((s) => {
      const u = byId.get(String(s.user));
      return { ...sessions.view(s, { now, currentSid }), user: { ...person(u), role: u.role, self: String(u._id) === String(req.user._id) } };
    });
  res.json({
    window,
    onlineWindowSeconds: sessions.ONLINE_MS / 1000,
    counts: { online: online.length, today: today.length, week: week.length },
    people: new Set(list.map((s) => s.user.id)).size,
    sessions: list,
  });
});

/** Sign one device out. Not the one asking (use Sign out for that). */
router.post('/sessions/:sid/revoke', async (req, res) => {
  const sid = String(req.params.sid || '').trim();
  if (!sid || sid.length > 64) throw badRequest('Invalid session');
  const session = await Session.findOne({ sid }).lean();
  if (!session) throw notFound('That session is not here any more');
  if (session.sid === req.authSession?.sid) throw badRequest('That is this device. Use Sign out instead.');
  if (session.revokedAt) return res.json({ ok: true, already: true });
  await sessions.revoke(sid, { reason: 'admin', by: req.user._id });
  const owner = await User.findById(session.user).select('name').lean();
  await activity.record({
    req,
    action: 'admin.session_revoked',
    target: activity.personTarget(owner || { _id: session.user, name: 'Someone' }),
    meta: { sid, platform: session.platform, deviceName: session.deviceName, appVersion: session.appVersion },
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- app versions

/**
 * Which app each active person is on (their newest phone, else their newest
 * device): `state` app | unknown | web | none (services/sessions.js). Whether
 * a build is the latest is for the apps to say: they read /app/release.json.
 */
router.get('/app-versions', async (req, res) => {
  const now = Date.now();
  const people = await User.find({ role: 'user', deletedAt: null, status: 'active' }).sort({ name: 1 }).limit(2000).lean();
  const states = await sessions.appStateOf(people, now);
  const accounts = people.map((u) => {
    const app = states.get(String(u._id));
    const shown = app.phone || app.newest;
    return {
      ...person(u),
      state: app.state,
      platform: shown?.platform || null,
      appVersion: app.phone?.appVersion || '',
      appBuild: app.phone?.appBuild || '',
      deviceName: shown?.deviceName || '',
      osVersion: shown?.osVersion || '',
      pushPermission: app.phone?.pushPermission || null,
      lastSeenAt: shown?.lastSeenAt || null,
      online: app.online,
      sessions: app.sessions,
      web: app.web,
    };
  });
  res.json({ accounts, summary: sessions.adoptionSummary(states) });
});

// ---------------------------------------------------------------- activity log

/** The log, newest first, a page at a time (`next` is the cursor for `before`). */
router.get('/activity', async (req, res) => {
  res.json(await activity.list(req.query, { tz: tzOf(req) }));
});

/** Today (since midnight), the last 7 days, people active in 7 days, and everything kept. */
router.get('/activity/stats', async (req, res) => {
  const now = new Date();
  const today = activity.startOfToday(tzOf(req), now);
  const week = new Date(now.getTime() - 7 * DAY);
  const [todayCount, weekCount, actors, total] = await Promise.all([
    ActivityLog.countDocuments({ at: { $gte: today } }),
    ActivityLog.countDocuments({ at: { $gte: week } }),
    ActivityLog.distinct('actor', { at: { $gte: week }, actorRole: 'user' }),
    ActivityLog.estimatedDocumentCount(),
  ]);
  res.json({ today: todayCount, week: weekCount, people: actors.filter(Boolean).length, total });
});

/** One row, with the other recent rows about the same thing, and who did it. */
router.get('/activity/:id', async (req, res) => {
  const row = await ActivityLog.findById(idParam(req.params.id)).lean();
  if (!row) throw notFound('That entry is not in the log any more');
  const targetId = row.target?.id;
  const [related, actor, subject] = await Promise.all([
    targetId
      ? ActivityLog.find({ 'target.id': targetId, _id: { $ne: row._id } }).sort({ at: -1, _id: -1 }).limit(20).lean()
      : [],
    row.actor ? User.findById(row.actor).lean() : null,
    row.target?.kind === 'user' && mongoose.isValidObjectId(targetId) ? User.findById(targetId).lean() : null,
  ]);
  const shape = (u) => (u ? { ...publicUser(u), deleted: !!u.deletedAt } : null);
  const [entry, ...others] = await activity.views([row, ...related]);
  res.json({ entry, related: others, actor: shape(actor), subject: shape(subject) });
});

// ---------------------------------------------------------------- teams

router.get('/teams', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = q ? { name: new RegExp(escapeRe(q), 'i') } : {};
  const teams = await Team.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json({ teams: await Promise.all(teams.map((t) => teamView(t, req.user, { withMembers: false }))) });
});

router.get('/teams/:id', async (req, res) => {
  const team = await Team.findById(idParam(req.params.id));
  if (!team) throw notFound('Organization not found');
  res.json({ team: await teamView(team, req.user) });
});

router.delete('/teams/:id', async (req, res) => {
  const team = await Team.findById(idParam(req.params.id));
  if (!team) throw notFound('Organization not found');
  await deleteTeam(team, req.user);
  res.json({ ok: true });
});

module.exports = router;
