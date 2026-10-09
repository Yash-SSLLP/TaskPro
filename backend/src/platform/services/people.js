/**
 * Who knows whom: the one place that decides who a person may give work to.
 *
 * You may give a task to yourself, to anyone who accepted you as a contact,
 * and to the active members of any team you are an active member of. The
 * Super Admin may give one to anyone. Every people picker in both apps is fed
 * from assignablePeople(), and every task route checks assertAssignable(), so
 * the two can't drift apart.
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const Team = require('../models/Team');
const Contact = require('../models/Contact');
const { publicUser } = require('../models/User');
const { badRequest } = require('../errors');

const oid = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));
const isSuperAdmin = (user) => user?.role === 'superadmin';

/** Ids of everyone this person has an accepted contact link with. */
async function contactIds(userId) {
  const uid = oid(userId);
  const links = await Contact.find({ $or: [{ a: uid }, { b: uid }], status: 'accepted' }).select('a b').lean();
  return links.map((l) => (String(l.a) === String(uid) ? l.b : l.a));
}

/** The teams this person is an active member of: [{ id, name, role }]. */
async function teamsOf(userId) {
  const uid = oid(userId);
  const teams = await Team.find({ members: { $elemMatch: { user: uid, status: 'active' } } })
    .select('name members')
    .sort({ name: 1 })
    .lean();
  return teams.map((t) => ({
    id: String(t._id),
    name: t.name,
    role: t.members.find((m) => String(m.user) === String(uid)).role,
  }));
}

/** Teams where this person is owner or admin. */
async function adminTeamIds(userId) {
  const uid = oid(userId);
  const teams = await Team.find({
    members: { $elemMatch: { user: uid, status: 'active', role: { $in: ['owner', 'admin'] } } },
  })
    .select('_id')
    .lean();
  return teams.map((t) => t._id);
}

async function teamRole(userId, teamId) {
  if (!teamId) return null;
  const team = await Team.findById(oid(teamId)).select('members').lean();
  const m = team?.members.find((x) => String(x.user) === String(userId) && x.status === 'active');
  return m ? m.role : null;
}

const isActiveMember = async (userId, teamId) => !!(await teamRole(userId, teamId));

/** Active members of a team. */
async function teamMemberIds(teamId) {
  const team = await Team.findById(oid(teamId)).select('members').lean();
  return (team?.members || []).filter((m) => m.status === 'active').map((m) => m.user);
}

/**
 * Team-mates (with the teams shared) of one person.
 * @returns {Promise<Map<string, Array<{id, name}>>>}
 */
async function teamMates(userId) {
  const uid = oid(userId);
  const teams = await Team.find({ members: { $elemMatch: { user: uid, status: 'active' } } })
    .select('name members')
    .lean();
  const mates = new Map();
  for (const t of teams) {
    for (const m of t.members) {
      if (m.status !== 'active') continue;
      const key = String(m.user);
      if (!mates.has(key)) mates.set(key, []);
      mates.get(key).push({ id: String(t._id), name: t.name });
    }
  }
  return mates;
}

/**
 * Everyone this person may give a task to, as a Set of id strings, or null
 * for the Super Admin ("anyone").
 */
async function assignableIdSet(user) {
  if (isSuperAdmin(user)) return null;
  const [contacts, mates] = await Promise.all([contactIds(user._id), teamMates(user._id)]);
  const set = new Set([String(user._id), ...contacts.map(String), ...mates.keys()]);
  return set;
}

/**
 * Throw a friendly 400 unless every id is someone this person may give work
 * to and is an active account.
 */
async function assertAssignable(user, ids) {
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!list.length) return;
  if (list.some((id) => !mongoose.isValidObjectId(id))) throw badRequest('One of the people is not valid');

  const people = await User.find({ _id: { $in: list.map(oid) } }).select('name status role').lean();
  const byId = new Map(people.map((p) => [String(p._id), p]));
  for (const id of list) {
    const p = byId.get(id);
    if (!p || p.role === 'superadmin') throw badRequest('One of the people could not be found');
    if (p.status !== 'active') throw badRequest(`${p.name}'s account is switched off`);
  }

  const allowed = await assignableIdSet(user);
  if (!allowed) return;
  const stranger = list.find((id) => !allowed.has(id));
  if (stranger) {
    throw badRequest(`${byId.get(stranger).name} isn't in your contacts or teams yet. Add them by their Task Pin first.`);
  }
}

/**
 * The people picker list: you, then team-mates, then contacts, each by name.
 * For the Super Admin: every active person, narrowed by `q`.
 */
async function assignablePeople(user, { q = '', limit = 200 } = {}) {
  const query = String(q || '').trim();
  const rx = query ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
  const matches = (p) => !rx || rx.test(p.name) || rx.test(p.pin || '') || rx.test(p.title || '');

  if (isSuperAdmin(user)) {
    const filter = { role: 'user', status: 'active' };
    if (rx) filter.$or = [{ name: rx }, { pin: rx }, { email: rx }, { phone: rx }, { username: rx }];
    const people = await User.find(filter).sort({ name: 1 }).limit(limit).lean();
    return people.map((p) => ({ ...publicUser(p, { full: false }), self: false, contact: false, teams: [] }));
  }

  const [contacts, mates] = await Promise.all([contactIds(user._id), teamMates(user._id)]);
  const contactSet = new Set(contacts.map(String));
  const ids = new Set([String(user._id), ...contactSet, ...mates.keys()]);
  const people = await User.find({ _id: { $in: [...ids].map(oid) }, status: 'active' }).lean();

  const rank = (p) => {
    if (String(p._id) === String(user._id)) return 0;
    return mates.has(String(p._id)) ? 1 : 2;
  };
  return people
    .filter(matches)
    .sort((x, y) => rank(x) - rank(y) || x.name.localeCompare(y.name))
    .map((p) => ({
      ...publicUser(p, { full: false }),
      self: String(p._id) === String(user._id),
      contact: contactSet.has(String(p._id)),
      teams: mates.get(String(p._id)) || [],
    }));
}

/**
 * The people among `ids` this person may WhatsApp about tasks: accepted
 * contacts who joined (or invited) with WhatsApp on, still active, with a
 * mobile number. In the order of `ids`: [{ id, name, phone }].
 */
async function whatsappContacts(userId, ids) {
  const uid = oid(userId);
  const wanted = [...new Set((ids || []).map(String))].filter((id) => id !== String(uid) && mongoose.isValidObjectId(id));
  if (!wanted.length) return [];
  const links = await Contact.find({
    $or: wanted.map((id) => {
      const [a, b] = [String(uid), id].sort();
      return { a: oid(a), b: oid(b) };
    }),
    status: 'accepted',
    whatsapp: true,
  })
    .select('a b')
    .lean();
  const open = new Set(links.map((l) => String(String(l.a) === String(uid) ? l.b : l.a)));
  if (!open.size) return [];
  const users = await User.find({ _id: { $in: [...open] }, status: 'active', phone: { $type: 'string', $ne: '' } })
    .select('name phone')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return wanted.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id).name, phone: byId.get(id).phone }));
}

module.exports = {
  contactIds,
  whatsappContacts,
  teamsOf,
  adminTeamIds,
  teamRole,
  isActiveMember,
  teamMemberIds,
  teamMates,
  assignableIdSet,
  assertAssignable,
  assignablePeople,
};
