/**
 * The platform's activity log: who did what, when, from where. The Super
 * Admin's Activity tab reads it (services/describe.js turns a row into a
 * sentence).
 *
 *   action   "auth.login", "task.accepted", "admin.user_deleted"… (services/activity.js)
 *   group    auth | tasks | people | admin, from the action, for the filter
 *   actor    who did it; null for the system ("PinTask") or someone unknown
 *            (a failed sign-in). `actorName` is the name AT THE TIME.
 *   target   what it was done to: { kind: user|task|team|session, id, label }
 *   meta     the details worth keeping (fields changed, the device…). Never a
 *            password, a token or anything secret.
 *
 * Rows go by themselves after 180 days.
 */
const mongoose = require('mongoose');

const GROUPS = ['auth', 'tasks', 'people', 'admin', 'other'];

const targetSchema = new mongoose.Schema(
  {
    kind: { type: String, trim: true },
    // A string so one field holds a person's, a task's or a session's id.
    id: { type: String, trim: true },
    label: { type: String, trim: true, maxlength: 400 },
  },
  { _id: false }
);

const activityLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, trim: true, maxlength: 120 },
    actorRole: { type: String, trim: true },
    action: { type: String, required: true, trim: true },
    group: { type: String, enum: GROUPS, default: 'other' },
    target: { type: targetSchema, default: undefined },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ip: { type: String, trim: true, maxlength: 64 },
    platform: { type: String, trim: true, maxlength: 16 },
  },
  { minimize: true, versionKey: false }
);

// Newest first, page by page (the cursor is at + _id).
activityLogSchema.index({ at: -1, _id: -1 });
activityLogSchema.index({ group: 1, at: -1, _id: -1 });
activityLogSchema.index({ actor: 1, at: -1, _id: -1 });
activityLogSchema.index({ 'target.id': 1, at: -1, _id: -1 });
activityLogSchema.index({ action: 1, at: -1 });
// Kept for 180 days.
activityLogSchema.index({ at: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
module.exports.GROUPS = GROUPS;
