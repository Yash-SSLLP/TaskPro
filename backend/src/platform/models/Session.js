/**
 * One signed-in device: a browser or a phone holding a token.
 *
 * Every token names its session (`sid`), so the Super Admin can see who is
 * signed in where, on which app version, and sign one device out without
 * touching the others. `protect` stamps `lastSeenAt` (at most once a minute)
 * and keeps the device details current from the headers the apps send.
 *
 * A token from before sessions existed has no `sid`: its session is made the
 * first time it is used (`legacyKey` = person + the token's issue time, so a
 * burst of requests makes one) and GET /auth/me hands back a token that names it.
 *
 * Revoked sessions are kept, so the console can say who was signed out and
 * when; everything goes 60 days after it was last used, long after any token
 * for it has expired (tokens last 30 days).
 */
const mongoose = require('mongoose');

const PLATFORMS = ['web', 'android', 'ios', 'other'];
const PUSH_PERMISSIONS = ['granted', 'denied', 'undetermined'];
const REVOKE_REASONS = ['signed_out', 'admin', 'admin_all', 'password', 'password_reset', 'disabled', 'deleted'];

const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sid: { type: String, required: true },
    platform: { type: String, enum: PLATFORMS, default: 'other' },
    appVersion: { type: String, trim: true, maxlength: 40 },
    appBuild: { type: String, trim: true, maxlength: 20 },
    deviceName: { type: String, trim: true, maxlength: 80 },
    osVersion: { type: String, trim: true, maxlength: 40 },
    userAgent: { type: String, trim: true, maxlength: 300 },
    ip: { type: String, trim: true, maxlength: 64 },
    pushPermission: { type: String, enum: [...PUSH_PERMISSIONS, null], default: null },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: [...REVOKE_REASONS, null], default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Made for a token signed before sessions existed (see above).
    legacy: { type: Boolean, default: false },
    legacyKey: { type: String },
  },
  { timestamps: true }
);

sessionSchema.index({ sid: 1 }, { unique: true });
sessionSchema.index({ user: 1, lastSeenAt: -1 });
sessionSchema.index({ legacyKey: 1 }, { unique: true, partialFilterExpression: { legacyKey: { $type: 'string' } } });
// Long-dead sessions clean themselves up.
sessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });

module.exports = mongoose.model('Session', sessionSchema);
module.exports.PLATFORMS = PLATFORMS;
module.exports.PUSH_PERMISSIONS = PUSH_PERMISSIONS;
