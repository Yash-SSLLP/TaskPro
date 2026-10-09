/**
 * /api/auth: sign up, sign in, the session, passwords.
 *
 * Every token handed out names its session (the signed-in device, see
 * models/Session.js); POST /logout ends it. Sign-ins (and failed ones),
 * sign-outs, password changes and profile edits go to the activity log.
 */
const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../../config');
const product = require('../../product');
const User = require('../models/User');
const { publicUser } = require('../models/User');
const { signToken, protect } = require('../auth');
const { z, parse, password, trimmed } = require('../validate');
const { requireIdentifier, identifierFilter, parseIdentifier, formatPhone } = require('../identity');
const { badRequest, unauthorized, forbidden, conflict } = require('../errors');
const { sendMail, mailEnabled } = require('../services/mailer');
const { deleteAccount } = require('../services/accounts');
const sessions = require('../services/sessions');
const activity = require('../services/activity');

const router = express.Router();

// Slow down password guessing. Generous enough for a whole office behind one IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

/** What the apps need right after sign-in. */
function sessionPayload(user) {
  return {
    user: publicUser(user),
    settings: product.settings.read(user.settings),
    product: { key: product.key, name: product.name },
  };
}

async function assertIdentifierFree(id, exceptUserId) {
  const existing = await User.findOne(identifierFilter(id)).select('_id').lean();
  if (existing && String(existing._id) !== String(exceptUserId || '')) {
    const label = { email: 'email', phone: 'mobile number', username: 'username' }[id.type];
    throw conflict(`An account with this ${label} already exists`);
  }
}

/** The device a new session was started on, for the activity log. */
const deviceMeta = (s) =>
  s ? { platform: s.platform, appVersion: s.appVersion, appBuild: s.appBuild, deviceName: s.deviceName, osVersion: s.osVersion, sid: s.sid } : {};

/** Start a session for `user` on this device and sign its token. */
async function startSession(req, user) {
  const session = await sessions.start(req, user);
  return { session, token: signToken(user, session.sid) };
}

// ---------------------------------------------------------------- sign up

const signupSchema = z.object({
  name: trimmed(80, 'Name').min(1, 'Enter your name'),
  identifier: z.string({ required_error: 'Enter your email or mobile number' }),
  password,
});

router.post('/signup', authLimiter, async (req, res) => {
  if (!config.signupEnabled) throw forbidden('Sign-up is closed. Please contact us to get an account.');
  const body = parse(signupSchema, req.body);
  const id = requireIdentifier(body.identifier, ['email', 'phone']);
  await assertIdentifierFree(id);

  const user = new User({
    name: body.name,
    role: 'user',
    [id.type]: id.value,
    settings: product.settings.defaults(),
    lastLoginAt: new Date(),
  });
  await user.setPassword(body.password);
  try {
    await user.saveWithPin();
  } catch (err) {
    if (err?.code === 11000) throw conflict('An account with these details already exists');
    throw err;
  }
  try {
    await product.onUserCreated?.({ user });
  } catch (err) {
    console.warn('[signup] welcome task failed:', err.message);
  }

  const { session, token } = await startSession(req, user);
  await activity.record({ req, action: 'auth.signup', actor: user, target: activity.personTarget(user), meta: deviceMeta(session) });
  res.status(201).json({ token, ...sessionPayload(user) });
});

// ---------------------------------------------------------------- sign in

const loginSchema = z.object({
  identifier: z.string({ required_error: 'Enter your email, mobile number or username' }).min(1, 'Enter your email, mobile number or username'),
  password: z.string({ required_error: 'Enter your password' }).min(1, 'Enter your password'),
});

/**
 * What a failed sign-in typed, safe to keep: people sometimes type their
 * password into the login box, so a login that matches no account is only
 * kept in part ("ra…@example.com", "…3210", "pa…").
 */
function maskIdentifier(raw) {
  const s = String(raw || '').trim().slice(0, 100);
  if (!s) return '';
  const at = s.indexOf('@');
  if (at > 0) return `${s.slice(0, Math.min(2, at))}…${s.slice(at)}`;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 7 && /^[+\d\s()-]+$/.test(s)) return `…${digits.slice(-4)}`;
  return `${s.slice(0, 2)}…`;
}

/** An account's own login, as the log shows it. */
const loginOf = (id) => (id.type === 'phone' ? formatPhone(id.value) : id.value);

const failed = (req, reason, identifier, user = null) =>
  activity.record({
    req,
    action: 'auth.login_failed',
    actor: null,
    target: user ? activity.personTarget(user) : undefined,
    meta: { reason, identifier, platform: sessions.clientInfo(req).platform },
  });

router.post('/login', authLimiter, async (req, res) => {
  const body = parse(loginSchema, req.body);
  const id = parseIdentifier(body.identifier);
  const WRONG = 'Wrong login or password';
  if (!id) {
    await failed(req, 'invalid', maskIdentifier(body.identifier));
    throw unauthorized(WRONG, 'BAD_CREDENTIALS');
  }

  const user = await User.findOne(identifierFilter(id)).select('+passwordHash');
  if (!user) {
    await failed(req, 'no_account', maskIdentifier(body.identifier));
    throw unauthorized(WRONG, 'BAD_CREDENTIALS');
  }
  if (!(await user.checkPassword(body.password))) {
    await failed(req, 'wrong_password', loginOf(id), user);
    throw unauthorized(WRONG, 'BAD_CREDENTIALS');
  }
  if (user.status !== 'active') {
    await failed(req, 'disabled', loginOf(id), user);
    throw forbidden('Your account has been switched off. Please contact support.', 'USER_DISABLED');
  }

  user.lastLoginAt = new Date();
  await user.save();
  const { session, token } = await startSession(req, user);
  await activity.record({ req, action: 'auth.login', actor: user, target: activity.personTarget(user), meta: deviceMeta(session) });
  res.json({ token, ...sessionPayload(user) });
});

// ---------------------------------------------------------------- session

// Sessions slide: someone who opens the app at least once a month never gets
// signed out. A fresh token is handed out at most once a day, so the apps can
// store it without churning; a token from before sessions existed is swapped
// at once for one that names its session.
const REFRESH_AFTER_SEC = 24 * 3600;

router.get('/me', protect, async (req, res) => {
  const stale = !req.tokenIssuedAt || Date.now() / 1000 - req.tokenIssuedAt > REFRESH_AFTER_SEC;
  const upgrade = !req.tokenSid && !!req.authSession?.sid;
  const fresh = stale || upgrade ? { token: signToken(req.user, req.authSession?.sid || req.tokenSid) } : {};
  res.json({ ...fresh, ...sessionPayload(req.user) });
});

/** Sign out this device: its session ends, so its token stops working at once. */
router.post('/logout', protect, async (req, res) => {
  const sid = req.authSession?.sid;
  if (sid) await sessions.revoke(sid, { reason: 'signed_out', by: req.user._id });
  await activity.record({ req, action: 'auth.logout', target: activity.personTarget(req.user), meta: deviceMeta(req.authSession) });
  res.json({ ok: true });
});

const profileSchema = z.object({
  name: trimmed(80, 'Name').min(1, 'Enter your name').optional(),
  title: trimmed(60, 'Title').optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

const PROFILE_LABELS = { name: 'Name', title: 'Job title', email: 'Email', phone: 'Mobile number' };
const shown = (field, value) => (field === 'phone' ? formatPhone(value) : value || '');

router.patch('/profile', protect, async (req, res) => {
  const body = parse(profileSchema, req.body);
  const user = req.user;
  const before = { name: user.name, title: user.title, email: user.email, phone: user.phone };
  if (body.name !== undefined) user.name = body.name;
  if (body.title !== undefined) user.title = body.title;
  for (const field of ['email', 'phone']) {
    if (body[field] === undefined) continue;
    if (body[field] === '') {
      if (field === 'email' && !user.phone && !user.username) throw badRequest('Keep at least one way to sign in');
      if (field === 'phone' && !user.email && !user.username) throw badRequest('Keep at least one way to sign in');
      user[field] = undefined;
      continue;
    }
    const id = requireIdentifier(body[field], [field]);
    await assertIdentifierFree(id, user._id);
    user[field] = id.value;
  }
  await user.save();

  const changes = Object.keys(PROFILE_LABELS)
    .filter((f) => (before[f] || '') !== (user[f] || ''))
    .map((f) => ({ field: f, label: PROFILE_LABELS[f], before: shown(f, before[f]), after: shown(f, user[f]) }));
  if (changes.length) await activity.record({ req, action: 'profile.updated', meta: { changes } });
  res.json({ user: publicUser(user) });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: password,
});

router.post('/change-password', protect, async (req, res) => {
  const body = parse(changePasswordSchema, req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  const forced = !!user.mustChangePassword;
  // Someone holding an admin-chosen password has just proven it by signing in.
  if (!forced) {
    if (!body.currentPassword || !(await user.checkPassword(body.currentPassword))) {
      throw badRequest('Your current password is not correct');
    }
  }
  if (await user.checkPassword(body.newPassword)) throw badRequest('Choose a password different from the current one');
  await user.setPassword(body.newPassword);
  user.mustChangePassword = false;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out other devices
  await user.save();

  // This device stays signed in (on its own session); every other one ends.
  let sid = req.authSession?.sid || null;
  if (!sid) sid = (await sessions.start(req, user)).sid;
  await sessions.revokeAll(user._id, { reason: 'password', by: user._id, except: sid });
  await activity.record({ req, action: 'auth.password_changed', target: activity.personTarget(user), meta: { forced } });
  res.json({ token: signToken(user, sid), user: publicUser(user) });
});

// ---------------------------------------------------------------- forgot password

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

router.post('/forgot-password', authLimiter, async (req, res) => {
  const id = parseIdentifier(req.body?.identifier);
  const generic = {
    ok: true,
    emailEnabled: mailEnabled(),
    message: mailEnabled()
      ? 'If that account has an email address, a reset link is on its way. No email? Please contact support.'
      : 'Please contact support to reset your password.',
  };
  if (!id || !mailEnabled()) return res.json(generic);

  const user = await User.findOne(identifierFilter(id));
  if (!user || !user.email || user.status !== 'active') return res.json(generic);

  const token = crypto.randomBytes(32).toString('base64url');
  user.resetTokenHash = sha256(token);
  user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const link = `${config.webUrl}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: `Reset your ${product.name} password`,
    text: `Hi ${user.name},\n\nOpen this link to choose a new password (valid for 1 hour):\n${link}\n\nIf you did not ask for this, ignore this email.`,
  });
  await activity.record({ req, action: 'auth.password_forgot', actor: null, target: activity.personTarget(user) });
  res.json(generic);
});

const resetSchema = z.object({ token: z.string().min(10, 'This reset link is not valid'), newPassword: password });

/**
 * A new password from an emailed link. Every session ends; both apps then
 * send the person to sign in, which starts this device's session (so none is
 * started here: it would show as a device that never signed in).
 */
router.post('/reset-password', authLimiter, async (req, res) => {
  const body = parse(resetSchema, req.body);
  const user = await User.findOne({
    resetTokenHash: sha256(body.token),
    resetTokenExpires: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpires');
  if (!user) throw badRequest('This reset link has expired. Please ask for a new one.');
  await user.setPassword(body.newPassword);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.mustChangePassword = false;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await sessions.revokeAll(user._id, { reason: 'password_reset', by: user._id });
  await activity.record({ req, action: 'auth.password_reset', actor: user, target: activity.personTarget(user) });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- delete account

const deleteAccountSchema = z.object({
  password: z.string({ required_error: 'Enter your password' }).min(1, 'Enter your password'),
});

router.post('/delete-account', authLimiter, protect, async (req, res) => {
  const body = parse(deleteAccountSchema, req.body);
  if (req.user.role === 'superadmin') throw forbidden('The Super Admin account cannot be deleted.');
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.checkPassword(body.password))) throw badRequest('Your password is not correct');
  // Who they were, for the log: the account is emptied below.
  const who = { _id: user._id, name: user.name, role: user.role };
  await deleteAccount(user);
  await sessions.revokeAll(user._id, { reason: 'deleted', by: user._id });
  await activity.record({ req, action: 'auth.account_deleted', actor: who, target: activity.personTarget(who) });
  res.json({ ok: true, message: 'Your account has been deleted.' });
});

module.exports = router;
