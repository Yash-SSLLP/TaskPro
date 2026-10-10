/**
 * /api/teams: organizations (teams, in the code) anyone can create and fill
 * by Task Pin or from the people they are already connected with.
 *
 * Adding someone sends an invite they accept or decline. The owner can make
 * admins, hand the organization over or delete it; admins can invite and
 * remove members. The Super Admin can open and delete any organization.
 * Everything a person reads here says "organization".
 */
const express = require('express');
const product = require('../../product');
const Team = require('../models/Team');
const User = require('../models/User');
const { publicUser } = require('../models/User');
const { protect, isSuperAdmin, requirePerson } = require('../auth');
const { z, parse, trimmed, idParam, objectId } = require('../validate');
const { badRequest, forbidden, notFound, conflict } = require('../errors');
const { notify } = require('../services/notify');
const activity = require('../services/activity');
const { findByPin } = require('./contacts');
const { assignableIdSet, assignablePeople } = require('../services/people');

const router = express.Router();
router.use(protect);

/** How many organizations one person may own, and how many people one may hold (invites included). */
const MAX_OWNED = 50;
const MAX_MEMBERS = 500;

const person = (u) => (u ? publicUser(u, { full: false }) : null);

/** Someone named in a team activity row: { id, name } (one small read). */
async function named(userId) {
  const u = await User.findById(userId).select('name').lean();
  return { id: String(userId), name: u?.name || 'someone' };
}

/** A team as the API returns it. `withMembers` adds the member list. */
async function teamView(team, viewer, { withMembers = true } = {}) {
  const ids = [team.owner, ...team.members.map((m) => m.user), ...team.members.map((m) => m.invitedBy)].filter(Boolean);
  const people = await User.find({ _id: { $in: ids } }).lean();
  const byId = new Map(people.map((p) => [String(p._id), p]));
  const mine = team.members.find((m) => String(m.user) === String(viewer._id) && m.status === 'active');

  const view = {
    id: String(team._id),
    name: team.name,
    description: team.description || '',
    owner: person(byId.get(String(team.owner))),
    myRole: mine ? mine.role : null,
    memberCount: team.members.filter((m) => m.status === 'active').length,
    createdAt: team.createdAt,
  };
  if (!withMembers) return view;

  const order = { owner: 0, admin: 1, member: 2 };
  view.members = team.members
    .map((m) => ({
      person: person(byId.get(String(m.user))),
      role: m.role,
      status: m.status,
      invitedBy: person(byId.get(String(m.invitedBy))),
      invitedAt: m.invitedAt,
      joinedAt: m.joinedAt,
    }))
    .filter((m) => m.person)
    .sort((x, y) => (x.status === y.status ? 0 : x.status === 'active' ? -1 : 1) || order[x.role] - order[y.role] || x.person.name.localeCompare(y.person.name));
  return view;
}

/** Load a team the caller is in (active or invited), or any team for the Super Admin. */
async function loadTeam(req) {
  const team = await Team.findById(idParam(req.params.id));
  if (!team) throw notFound('Organization not found');
  if (!isSuperAdmin(req.user) && !team.memberOf(req.user._id)) throw notFound('Organization not found');
  return team;
}

function myRole(team, user) {
  const m = team.memberOf(user._id);
  return m?.status === 'active' ? m.role : null;
}

function requireRole(team, user, roles, message = 'Only the organization’s owner or an admin can do this') {
  if (isSuperAdmin(user)) return;
  if (!roles.includes(myRole(team, user))) throw forbidden(message);
}

// ---------------------------------------------------------------- list & create

router.get('/', requirePerson, async (req, res) => {
  const me = req.user._id;
  const teams = await Team.find({ 'members.user': me }).sort({ name: 1 });
  const active = teams.filter((t) => t.memberOf(me).status === 'active');
  const invited = teams.filter((t) => t.memberOf(me).status === 'invited');

  const inviters = await User.find({ _id: { $in: invited.map((t) => t.memberOf(me).invitedBy).filter(Boolean) } }).lean();
  const inviterById = new Map(inviters.map((p) => [String(p._id), p]));

  res.json({
    teams: await Promise.all(active.map((t) => teamView(t, req.user, { withMembers: false }))),
    invites: invited.map((t) => {
      const m = t.memberOf(me);
      return { team: { id: String(t._id), name: t.name }, invitedBy: person(inviterById.get(String(m.invitedBy))), at: m.invitedAt };
    }),
  });
});

const teamSchema = z.object({
  name: trimmed(80, 'Organization name').min(2, 'Give the organization a name'),
  description: trimmed(300, 'Description').optional(),
});

/** 400 once this person already owns as many organizations as anyone may. */
async function assertCanOwnMore(userId, name = null) {
  if ((await Team.countDocuments({ owner: userId })) < MAX_OWNED) return;
  throw badRequest(`${name ? `${name} already owns` : 'You already own'} ${MAX_OWNED} organizations, the most anyone can. Delete one or hand it over first.`);
}

/** 400 unless `adding` more people still fit in the organization. */
function assertRoom(team, adding = 1) {
  const room = MAX_MEMBERS - team.members.length;
  if (adding <= room) return;
  throw badRequest(`An organization can have up to ${MAX_MEMBERS} people, invites included. ${room > 0 ? `This one has room for ${room} more.` : 'This one is full.'}`);
}

router.post('/', requirePerson, async (req, res) => {
  const body = parse(teamSchema, req.body);
  await assertCanOwnMore(req.user._id);
  const now = new Date();
  const team = await Team.create({
    name: body.name,
    description: body.description || '',
    owner: req.user._id,
    members: [{ user: req.user._id, role: 'owner', status: 'active', invitedAt: now, joinedAt: now }],
  });
  await activity.record({ req, action: 'team.created', target: activity.teamTarget(team) });
  res.status(201).json({ team: await teamView(team, req.user) });
});

// ---------------------------------------------------------------- one team

router.get('/:id', async (req, res) => {
  const team = await loadTeam(req);
  res.json({ team: await teamView(team, req.user) });
});

router.patch('/:id', async (req, res) => {
  const team = await loadTeam(req);
  requireRole(team, req.user, ['owner', 'admin']);
  const body = parse(teamSchema.partial(), req.body);
  const before = { name: team.name, description: team.description || '' };
  if (body.name !== undefined) team.name = body.name;
  if (body.description !== undefined) team.description = body.description;
  await team.save();
  const changes = ['name', 'description']
    .filter((f) => before[f] !== (team[f] || ''))
    .map((f) => ({ field: f, before: before[f], after: team[f] || '' }));
  if (changes.length) await activity.record({ req, action: 'team.updated', target: activity.teamTarget(team), meta: { changes } });
  res.json({ team: await teamView(team, req.user) });
});

router.delete('/:id', async (req, res) => {
  const team = await loadTeam(req);
  requireRole(team, req.user, ['owner'], 'Only the owner can delete the organization');
  await deleteTeam(team, req.user);
  res.json({ ok: true });
});

async function deleteTeam(team, by) {
  const others = team.members.filter((m) => m.status === 'active').map((m) => m.user);
  await Team.deleteOne({ _id: team._id });
  await product.onTeamDeleted?.(team._id);
  await activity.record({
    action: isSuperAdmin(by) ? 'admin.team_deleted' : 'team.deleted',
    actor: by,
    target: activity.teamTarget(team),
    meta: { members: others.length },
  });
  notify(others, {
    title: `The organization "${team.name}" was deleted`,
    body: `${by.name} deleted it. Tasks filed under it are kept.`,
    link: '/teams',
    kind: 'team',
    exclude: by._id,
  });
}

// ---------------------------------------------------------------- members

const inviteSchema = z.object({
  pin: z.string().optional(),
  userIds: z.array(objectId).min(1, 'Choose someone to invite').max(50, 'Invite up to 50 people at a time').optional(),
  role: z.enum(['admin', 'member']).default('member'),
});

/** Invite people (as `role`): each is told, and joins once they accept. */
async function invite(req, team, people, role) {
  const now = new Date();
  for (const p of people) team.members.push({ user: p._id, role, status: 'invited', invitedBy: req.user._id, invitedAt: now });
  await team.save();
  await Promise.all(
    people.map((p) => activity.record({ req, action: 'team.invited', target: activity.teamTarget(team), meta: { person: { id: String(p._id), name: p.name }, role } }))
  );
  notify(people.map((p) => p._id), {
    title: `${req.user.name} invited you to the organization "${team.name}"`,
    body: 'Open Organizations to join or decline.',
    link: `/teams/${team._id}`,
    kind: 'team',
  });
}

/**
 * Add people, by Task Pin (`{ pin }`: 201 { team }, as installed 1.0.6 apps
 * expect) or from your connections (`{ userIds }`: your contacts and the
 * people you share an organization with; 201 { team, invited, skipped }).
 */
router.post('/:id/members', async (req, res) => {
  const team = await loadTeam(req);
  requireRole(team, req.user, ['owner', 'admin']);
  const body = parse(inviteSchema, req.body);
  if (body.role === 'admin' && !isSuperAdmin(req.user) && myRole(team, req.user) !== 'owner') {
    throw forbidden('Only the organization’s owner can add an admin');
  }
  if (body.userIds && body.pin !== undefined) throw badRequest('Invite by Task Pin or from your connections, not both');

  if (!body.userIds) {
    if (body.pin === undefined) throw badRequest('Enter a Task Pin');
    const invitee = await findByPin(body.pin);
    const existing = team.memberOf(invitee._id);
    if (existing) throw conflict(existing.status === 'active' ? `${invitee.name} is already in this organization` : `${invitee.name} has already been invited`);
    assertRoom(team);
    await invite(req, team, [invitee], body.role);
    return res.status(201).json({ team: await teamView(team, req.user) });
  }

  const ids = [...new Set(body.userIds.map((id) => id.toLowerCase()))];
  const [found, connected] = await Promise.all([User.find({ _id: { $in: ids } }).select('name role status').lean(), assignableIdSet(req.user)]);
  const byId = new Map(found.map((u) => [String(u._id), u]));
  const invited = [];
  const skipped = [];
  for (const id of ids) {
    const u = byId.get(id);
    // Names only for people already in here (the inviter sees them anyway): any
    // other id says nothing about who it is, or whether it is an account at all.
    if (u && team.memberOf(id)) skipped.push({ id, name: u.name, reason: 'already' });
    // Connected: an accepted contact, or someone in an organization with you (the Super Admin: anyone).
    else if (!u || u.role !== 'user' || u.status !== 'active' || id === String(req.user._id) || (connected && !connected.has(id))) {
      skipped.push({ id, name: '', reason: 'not-connected' });
    } else invited.push(u);
  }
  if (invited.length) {
    assertRoom(team, invited.length);
    await invite(req, team, invited, body.role);
  }
  res.status(201).json({
    team: await teamView(team, req.user),
    invited: invited.map((u) => ({ id: String(u._id), name: u.name })),
    skipped,
  });
});

/**
 * GET /:id/candidates?q= — who the owner and admins can add from their
 * connections, by name, each with `membership` here: null, 'invited' or
 * 'active'.
 */
router.get('/:id/candidates', requirePerson, async (req, res) => {
  const team = await loadTeam(req);
  requireRole(team, req.user, ['owner', 'admin']);
  const list = await assignablePeople(req.user, { q: req.query.q });
  const people = list
    .filter((p) => !p.self)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 200)
    .map(({ self, teams, ...p }) => ({ ...p, membership: team.memberOf(p.id)?.status || null }));
  res.json({ people });
});

/** The active owner and admins: they hear who joins and who leaves. */
const leaders = (team) => team.members.filter((x) => x.status === 'active' && ['owner', 'admin'].includes(x.role)).map((x) => x.user);

/** Whoever sent an invite hears that it was turned down. */
function tellInviter(team, m, person) {
  if (!m.invitedBy) return;
  notify([m.invitedBy], {
    title: `${person.name} declined your invite to the organization "${team.name}"`,
    link: `/teams/${team._id}`,
    kind: 'team',
    exclude: person._id,
  });
}

async function myInvite(req) {
  const team = await Team.findById(idParam(req.params.id));
  const m = team?.memberOf(req.user._id);
  if (!m || m.status !== 'invited') throw notFound('Invite not found');
  return { team, m };
}

router.post('/:id/accept', requirePerson, async (req, res) => {
  const { team, m } = await myInvite(req);
  m.status = 'active';
  m.joinedAt = new Date();
  await team.save();
  await activity.record({ req, action: 'team.joined', target: activity.teamTarget(team) });
  notify(leaders(team), {
    title: `${req.user.name} joined the organization "${team.name}"`,
    link: `/teams/${team._id}`,
    kind: 'team',
    exclude: req.user._id,
  });
  res.json({ team: await teamView(team, req.user) });
});

router.post('/:id/decline', requirePerson, async (req, res) => {
  const { team, m } = await myInvite(req);
  team.members = team.members.filter((x) => String(x.user) !== String(req.user._id));
  await team.save();
  await activity.record({ req, action: 'team.declined', target: activity.teamTarget(team) });
  tellInviter(team, m, req.user);
  res.json({ ok: true });
});

router.patch('/:id/members/:userId', async (req, res) => {
  const team = await loadTeam(req);
  requireRole(team, req.user, ['owner'], 'Only the organization’s owner can change roles');
  const body = parse(z.object({ role: z.enum(['admin', 'member']) }), req.body);
  const m = team.memberOf(idParam(req.params.userId, 'person'));
  if (!m) throw notFound('Person not found in this organization');
  if (m.role === 'owner') throw badRequest('Hand the organization over first to change the owner');
  const changed = m.role !== body.role;
  m.role = body.role;
  await team.save();
  if (changed) {
    await activity.record({ req, action: 'team.role_changed', target: activity.teamTarget(team), meta: { person: await named(m.user), role: body.role } });
  }
  res.json({ team: await teamView(team, req.user) });
});

router.delete('/:id/members/:userId', async (req, res) => {
  const team = await loadTeam(req);
  const targetId = idParam(req.params.userId, 'person');
  const m = team.memberOf(targetId);
  if (!m) throw notFound('Person not found in this organization');
  const leaving = String(targetId) === String(req.user._id);

  if (m.role === 'owner') throw badRequest(leaving ? 'Hand the organization over to someone else before you leave' : "The owner can't be removed");
  if (!leaving) {
    requireRole(team, req.user, ['owner', 'admin']);
    if (m.role === 'admin' && !isSuperAdmin(req.user) && myRole(team, req.user) !== 'owner') {
      throw forbidden('Only the organization’s owner can remove an admin');
    }
  }
  team.members = team.members.filter((x) => String(x.user) !== String(targetId));
  await team.save();
  if (leaving) {
    await activity.record({ req, action: 'team.left', target: activity.teamTarget(team) });
    // Leaving before joining is turning the invite down.
    if (m.status !== 'active') tellInviter(team, m, req.user);
    else notify(leaders(team), { title: `${req.user.name} left the organization "${team.name}"`, link: `/teams/${team._id}`, kind: 'team', exclude: req.user._id });
  } else {
    await activity.record({
      req,
      action: 'team.member_removed',
      target: activity.teamTarget(team),
      meta: { person: await named(targetId), invite: m.status === 'invited' },
    });
  }
  if (!leaving && m.status === 'active') {
    notify([targetId], { title: `You were removed from the organization "${team.name}"`, link: '/teams', kind: 'team' });
  }
  res.json({ ok: true });
});

router.post('/:id/transfer', async (req, res) => {
  const team = await loadTeam(req);
  requireRole(team, req.user, ['owner'], 'Only the owner can hand the organization over');
  const body = parse(z.object({ userId: objectId }), req.body);
  const next = team.memberOf(body.userId);
  if (!next || next.status !== 'active') throw badRequest('Choose someone who has joined the organization');
  if (next.role !== 'owner') await assertCanOwnMore(next.user, (await named(next.user)).name);
  const current = team.members.find((x) => x.role === 'owner');
  if (current) current.role = 'admin';
  next.role = 'owner';
  team.owner = next.user;
  await team.save();
  await activity.record({ req, action: 'team.transferred', target: activity.teamTarget(team), meta: { person: await named(next.user) } });
  notify([next.user], {
    title: `You are now the owner of the organization "${team.name}"`,
    link: `/teams/${team._id}`,
    kind: 'team',
    exclude: req.user._id,
  });
  res.json({ team: await teamView(team, req.user) });
});

module.exports = router;
module.exports.teamView = teamView;
module.exports.deleteTeam = deleteTeam;
