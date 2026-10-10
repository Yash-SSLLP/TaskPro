/**
 * Sessions and access control.
 *
 * A token is a signed JWT `{ sub: userId, v: tokenVersion, sid }`. `sid` names
 * the signed-in device (models/Session.js): ending that session signs out that
 * one device; bumping the user's tokenVersion (password change, disabling
 * someone, "sign out everywhere") ends every session they have.
 *
 * A token from before sessions existed has no `sid`. It keeps working: its
 * session is made on first use (services/sessions.js adoptLegacy) and
 * GET /auth/me hands back a token that names it.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
// Only the settings module: requiring the whole product here would be circular
// (product routes require this file).
const settings = require('../product/settings');
const User = require('./models/User');
const Session = require('./models/Session');
const sessions = require('./services/sessions');
const activity = require('./services/activity');
const { unauthorized, forbidden } = require('./errors');

function signToken(user, sid) {
  const payload = { sub: String(user._id), v: user.tokenVersion || 0 };
  if (sid) payload.sid = String(sid);
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Throttle "last seen" writes to one per person per few minutes.
const SEEN_THROTTLE_MS = 5 * 60 * 1000;
const seenAt = new Map();

/** Stamp the person's lastSeenAt (throttled). Resolves either way. */
function stampSeen(user) {
  const key = String(user._id);
  const now = Date.now();
  if (now - (seenAt.get(key) || 0) < SEEN_THROTTLE_MS) return null;
  seenAt.set(key, now);
  if (seenAt.size > 5000) seenAt.clear();
  return User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date(now) } }).catch(() => {});
}

// While a person must choose a new password, these are all they may call.
const PASSWORD_GATE_ALLOW = ['/api/auth/me', '/api/auth/change-password', '/api/auth/delete-account', '/api/auth/logout', '/api/devices'];

const ENDED = 'You were signed out. Please sign in again.';

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

  const sid = payload.sid ? String(payload.sid) : null;
  const [user, found] = await Promise.all([User.findById(payload.sub), sid ? Session.findOne({ sid }).lean() : null]);
  if (!user || (user.tokenVersion || 0) !== payload.v) {
    throw unauthorized('Your session has ended. Please sign in again.', 'SESSION_EXPIRED');
  }
  if (user.status !== 'active') {
    throw forbidden('Your account has been switched off. Please contact support.', 'USER_DISABLED');
  }

  let session = found;
  if (sid) {
    if (!session || session.revokedAt || String(session.user) !== String(user._id)) throw unauthorized(ENDED, 'SESSION_EXPIRED');
  } else {
    // An older token: give it a session now. Never sign anyone out over this.
    try {
      session = await sessions.adoptLegacy(req, user, payload.iat);
    } catch (err) {
      console.warn('[auth] could not start a session for an older token:', err.message);
      session = null;
    }
    if (session?.revokedAt) throw unauthorized(ENDED, 'SESSION_EXPIRED');
  }

  if (user.mustChangePassword && !PASSWORD_GATE_ALLOW.some((p) => req.originalUrl.startsWith(p))) {
    throw forbidden('Please choose a new password first', 'PASSWORD_CHANGE_REQUIRED');
  }

  req.user = user;
  req.settings = settings.read(user.settings);
  req.tokenIssuedAt = payload.iat;
  req.tokenSid = sid;
  req.authSession = session;
  // Awaited (a serverless host may stop once the response is out); written at most once a minute.
  await Promise.all([
    sessions.touch(session, req).catch((err) => console.warn('[auth] could not stamp the session:', err.message)),
    stampSeen(user),
  ]);
  // The rest of the request can reach `req` from deep inside (the activity log's task hook).
  return activity.withRequest(req, next);
}

const isSuperAdmin = (user) => user?.role === 'superadmin';

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) throw forbidden();
  next();
}

/** Contacts, teams and task pins belong to people, not to the Super Admin. */
function requirePerson(req, res, next) {
  if (isSuperAdmin(req.user)) throw forbidden('The Super Admin has no contacts or organizations of their own');
  next();
}

module.exports = { signToken, protect, isSuperAdmin, requireSuperAdmin, requirePerson };
