/**
 * Deleting your own account (Google Play and the App Store require it).
 *
 * The person's own data goes: logins, Task Pin, profile, settings, contacts,
 * team memberships, devices, alerts, and (through the product) tasks nobody
 * else is on. Work they shared with other people stays with those people,
 * with their name shown as "Deleted user". The User document itself is kept
 * as an empty, switched-off shell so those shared records still point at
 * something.
 */
const crypto = require('node:crypto');
const product = require('../../product');
const User = require('../models/User');
const Team = require('../models/Team');
const Contact = require('../models/Contact');
const Device = require('../models/Device');
const Notification = require('../models/Notification');
const { notify } = require('./notify');

const DELETED_NAME = 'Deleted user';

/**
 * Teams they own pass to an admin, or else the longest-standing member; a team
 * with nobody else in it is deleted. Every other membership or invite is
 * dropped.
 */
async function leaveTeams(user) {
  const teams = await Team.find({ 'members.user': user._id });
  for (const team of teams) {
    const others = team.members.filter((m) => String(m.user) !== String(user._id));
    if (String(team.owner) !== String(user._id)) {
      team.members = others;
      await team.save();
      continue;
    }
    const active = others.filter((m) => m.status === 'active');
    const heir = active.find((m) => m.role === 'admin') || [...active].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0];
    if (!heir) {
      await Team.deleteOne({ _id: team._id });
      await product.onTeamDeleted?.(team._id);
      continue;
    }
    heir.role = 'owner';
    team.owner = heir.user;
    team.members = others;
    await team.save();
    notify([heir.user], {
      title: `You now own the team "${team.name}"`,
      body: 'Its owner deleted their account.',
      link: `/teams/${team._id}`,
      kind: 'team',
    });
  }
}

/** Delete a person's account for good. The caller has already checked who is asking. */
async function deleteAccount(user) {
  await leaveTeams(user);
  await Promise.all([
    Contact.deleteMany(Contact.involving(user._id)),
    Device.deleteMany({ user: user._id }),
    Notification.deleteMany({ user: user._id }),
  ]);
  await product.onUserDeleted?.({ user, deletedName: DELETED_NAME });

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        name: DELETED_NAME,
        status: 'disabled',
        settings: {},
        mustChangePassword: false,
        // Nobody knows this password, and the bumped version ends every session.
        passwordHash: crypto.randomBytes(32).toString('hex'),
        tokenVersion: (user.tokenVersion || 0) + 1,
        deletedAt: new Date(),
      },
      $unset: { pin: 1, email: 1, phone: 1, username: 1, title: 1, resetTokenHash: 1, resetTokenExpires: 1, lastLoginAt: 1, lastSeenAt: 1 },
    }
  );
}

module.exports = { deleteAccount, DELETED_NAME };
