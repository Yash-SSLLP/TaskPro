/**
 * /api/auth: sign up, sign in, the session, passwords.
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
const { requireIdentifier, identifierFilter, parseIdentifier } = require('../identity');
const { badRequest, unauthorized, forbidden, conflict } = require('../errors');
const { sendMail, mailEnabled } = require('../services/mailer');

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

  res.status(201).json({ token: signToken(user), ...sessionPayload(user) });
});

// ---------------------------------------------------------------- sign in

const loginSchema = z.object({
  identifier: z.string({ required_error: 'Enter your email, mobile number or username' }).min(1, 'Enter your email, mobile number or username'),
  password: z.string({ required_error: 'Enter your password' }).min(1, 'Enter your password'),
});

router.post('/login', authLimiter, async (req, res) => {
  const body = parse(loginSchema, req.body);
  const id = parseIdentifier(body.identifier);
  const WRONG = 'Wrong login or password';
  if (!id) throw unauthorized(WRONG, 'BAD_CREDENTIALS');

  const user = await User.findOne(identifierFilter(id)).select('+passwordHash');
  if (!user || !(await user.checkPassword(body.password))) throw unauthorized(WRONG, 'BAD_CREDENTIALS');
  if (user.status !== 'active') throw forbidden('Your account has been switched off. Please contact support.', 'USER_DISABLED');

  user.lastLoginAt = new Date();
  await user.save();
  res.json({ token: signToken(user), ...sessionPayload(user) });
});

// ---------------------------------------------------------------- session

// Sessions slide: someone who opens the app at least once a month never gets
// signed out. A fresh token is handed out at most once a day, so the apps can
// store it without churning.
const REFRESH_AFTER_SEC = 24 * 3600;

router.get('/me', protect, async (req, res) => {
  const stale = !req.tokenIssuedAt || Date.now() / 1000 - req.tokenIssuedAt > REFRESH_AFTER_SEC;
  res.json({ ...(stale ? { token: signToken(req.user) } : {}), ...sessionPayload(req.user) });
});

const profileSchema = z.object({
  name: trimmed(80, 'Name').min(1, 'Enter your name').optional(),
  title: trimmed(60, 'Title').optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

router.patch('/profile', protect, async (req, res) => {
  const body = parse(profileSchema, req.body);
  const user = req.user;
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
  res.json({ user: publicUser(user) });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: password,
});

router.post('/change-password', protect, async (req, res) => {
  const body = parse(changePasswordSchema, req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  // Someone holding an admin-chosen password has just proven it by signing in.
  if (!user.mustChangePassword) {
    if (!body.currentPassword || !(await user.checkPassword(body.currentPassword))) {
      throw badRequest('Your current password is not correct');
    }
  }
  if (await user.checkPassword(body.newPassword)) throw badRequest('Choose a password different from the current one');
  await user.setPassword(body.newPassword);
  user.mustChangePassword = false;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out other devices
  await user.save();
  res.json({ token: signToken(user), user: publicUser(user) });
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
  res.json(generic);
});

const resetSchema = z.object({ token: z.string().min(10, 'This reset link is not valid'), newPassword: password });

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
  res.json({ ok: true });
});

module.exports = router;
