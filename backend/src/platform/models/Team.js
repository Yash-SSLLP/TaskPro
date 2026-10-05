/**
 * A team anyone can create and fill by Task Pin.
 *
 *   owner  – created it (or was handed it); everything, including deleting it
 *   admin  – invites and removes people, sees every task filed under the team
 *   member – can give tasks to and get tasks from everyone else in the team
 *
 * Someone added by pin is `invited` until they accept; only `active` members
 * count anywhere.
 */
const mongoose = require('mongoose');

const TEAM_ROLES = ['owner', 'admin', 'member'];

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: TEAM_ROLES, default: 'member' },
    status: { type: String, enum: ['invited', 'active'], default: 'invited' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    invitedAt: { type: Date, default: Date.now },
    joinedAt: { type: Date, default: null },
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
  },
  { timestamps: true }
);

teamSchema.index({ 'members.user': 1 });

teamSchema.methods.memberOf = function memberOf(userId) {
  return this.members.find((m) => String(m.user) === String(userId)) || null;
};

module.exports = mongoose.model('Team', teamSchema);
module.exports.TEAM_ROLES = TEAM_ROLES;
