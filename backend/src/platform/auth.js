/**
 * Sessions and access control.
 *
 * A session is a signed JWT `{ sub: userId, v: tokenVersion }`. Bumping the
 * user's tokenVersion (password change, disabling someone) ends every session
 * they have.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
// Only the settings module: requiring the whole product here would be circular
// (product routes require this file).
const settings = require('../product/settings');
const User = require('./models/User');
const { unauthorized, forbidden } = require('./errors');

function signToken(user) {
  return jwt.sign({ sub: String(user._id), v: user.tokenVersion || 0 }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

// Throttle "last seen" writes to one per person per few minutes.
const SEEN_THROTTLE_MS = 5 * 60 * 1000;
const seenAt = new Map();

function stampSeen(user) {
  const key = String(user._id);
  const now = Date.now();
  if (now - (seenAt.get(key) || 0) < SEEN_THROTTLE_MS) return;
  seenAt.set(key, now);
  if (seenAt.size > 5000) seenAt.clear();
  User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date(now) } }).catch(() => {});
}

// While a person must choose a new password, these are all they may call.
const PASSWORD_GATE_ALLOW = ['/api/auth/me', '/api/auth/change-password', '/api/auth/delete-account', '/api/devices'];

async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw unauthorized('Please sign in');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }

  const user = await User.findById(payload.sub);
  if (!user || (user.tokenVersion || 0) !== payload.v) {
    throw unauthorized('Your session has ended. Please sign in again.', 'SESSION_EXPIRED');
  }
  if (user.status !== 'active') {
    throw forbidden('Your account has been switched off. Please contact support.', 'USER_DISABLED');
  }

  if (user.mustChangePassword && !PASSWORD_GATE_ALLOW.some((p) => req.originalUrl.startsWith(p))) {
    throw forbidden('Please choose a new password first', 'PASSWORD_CHANGE_REQUIRED');
  }

  req.user = user;
  req.settings = settings.read(user.settings);
  req.tokenIssuedAt = payload.iat;
  stampSeen(user);
  next();
}

const isSuperAdmin = (user) => user?.role === 'superadmin';

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) throw forbidden();
  next();
}

/** Contacts, teams and task pins belong to people, not to the Super Admin. */
function requirePerson(req, res, next) {
  if (isSuperAdmin(req.user)) throw forbidden('The Super Admin has no contacts or teams of their own');
  next();
}

module.exports = { signToken, protect, isSuperAdmin, requireSuperAdmin, requirePerson };
