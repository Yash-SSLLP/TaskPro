/**
 * /api/teams: teams anyone can create and fill by Task Pin.
 *
 * Adding someone sends an invite they accept or decline. The owner can make
 * admins, hand the team over or delete it; admins can invite and remove
 * members. The Super Admin can open and delete any team.
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
const { findByPin } = require('./contacts');

const router = express.Router();
router.use(protect);

const person = (u) => (u ? publicUser(u, { full: false }) : null);

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
  if (!team) throw notFound('Team not found');
  if (!isSuperAdmin(req.user) && !team.memberOf(req.user._id)) throw notFound('Team not found');
  return team;
}

function myRole(team, user) {
  const m = team.memberOf(user._id);
  return m?.status === 'active' ? m.role : null;
}

function requireRole(team, user, roles, message = 'Only the team owner or an admin can do this') {
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
  name: trimmed(80, 'Team name').min(2, 'Give the team a name'),
  description: trimmed(300, 'Description').optional(),
});

router.post('/', requirePerson, async (req, res) => {
  const body = parse(teamSchema, req.body);
  const now = new Date();
  const team = await Team.create({
    name: body.name,
    description: body.description || '',
    owner: req.user._id,
    members: [{ user: req.user._id, role: 'owner', status: 'active', invitedAt: now, joinedAt: now }],
  });
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
  if (body.name !== undefined) team.name = body.name;
  if (body.description !== undefined) team.description = body.description;
  await team.save();
  res.json({ team: await teamView(team, req.user) });
});

router.delete('/:id', async (req, res) => {
  const team = await loadTeam(req);
  requireRole(team, req.user, ['owner'], 'Only the team owner can delete the team');
  await deleteTeam(team, req.user);
  res.json({ ok: true });
});

async function deleteTeam(team, by) {
  const others = team.members.filter((m) => m.status === 'active').map((m) => m.user);
  await Team.deleteOne({ _id: team._id });
  await product.onTeamDeleted?.(team._id);
  notify(others, {
    title: `The team "${team.name}" was deleted`,
    body: `${by.name} deleted it. Tasks filed under it are kept.`,
    link: '/teams',
    kind: 'team',
    exclude: by._id,
  });
}

// ---------------------------------------------------------------- members

router.post('/:id/members', async (req, res) => {
  const team = await loadTeam(req);
  requireRole(team, req.user, ['owner', 'admin']);
  const body = parse(z.object({ pin: z.string({ required_error: 'Enter a Task Pin' }), role: z.enum(['admin', 'member']).default('member') }), req.body);
  if (body.role === 'admin' && !isSuperAdmin(req.user) && myRole(team, req.user) !== 'owner') {
    throw forbidden('Only the team owner can add an admin');
  }
  const invitee = await findByPin(body.pin);
  const existing = team.memberOf(invitee._id);
  if (existing) throw conflict(existing.status === 'active' ? `${invitee.name} is already in this team` : `${invitee.name} has already been invited`);

  team.members.push({ user: invitee._id, role: body.role, status: 'invited', invitedBy: req.user._id, invitedAt: new Date() });
  await team.save();
  notify([invitee._id], {
    title: `${req.user.name} invited you to the team "${team.name}"`,
    body: 'Open Teams to join or decline.',
    link: `/teams/${team._id}`,
    kind: 'team',
  });
  res.status(201).json({ team: await teamView(team, req.user) });
});

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
  notify(team.members.filter((x) => x.status === 'active' && ['owner', 'admin'].includes(x.role)).map((x) => x.user), {
    title: `${req.user.name} joined the team "${team.name}"`,
    link: `/teams/${team._id}`,
    kind: 'team',
    exclude: req.user._id,
  });
  res.json({ team: await teamView(team, req.user) });
});

router.post('/:id/decline', requirePerson, async (req, res) => {
  const { team } = await myInvite(req);
  team.members = team.members.filter((x) => String(x.user) !== String(req.user._id));
  await team.save();
  res.json({ ok: true });
});

router.patch('/:id/members/:userId', async (req, res) => {
  const team = await loadTeam(req);
  requireRole(team, req.user, ['owner'], 'Only the team owner can change roles');
  const body = parse(z.object({ role: z.enum(['admin', 'member']) }), req.body);
  const m = team.memberOf(idParam(req.params.userId, 'person'));
  if (!m) throw notFound('Person not found in this team');
  if (m.role === 'owner') throw badRequest('Hand the team over first to change the owner');
  m.role = body.role;
  await team.save();
  res.json({ team: await teamView(team, req.user) });
});

router.delete('/:id/members/:userId', async (req, res) => {
  const team = await loadTeam(req);
  const targetId = idParam(req.params.userId, 'person');
  const m = team.memberOf(targetId);
  if (!m) throw notFound('Person not found in this team');
  const leaving = String(targetId) === String(req.user._id);

  if (m.role === 'owner') throw badRequest(leaving ? 'Hand the team over to someone else before you leave' : "The owner can't be removed");
  if (!leaving) {
    requireRole(team, req.user, ['owner', 'admin']);
    if (m.role === 'admin' && !isSuperAdmin(req.user) && myRole(team, req.user) !== 'owner') {
      throw forbidden('Only the team owner can remove an admin');
    }
  }
  team.members = team.members.filter((x) => String(x.user) !== String(targetId));
  await team.save();
  if (!leaving && m.status === 'active') {
    notify([targetId], { title: `You were removed from the team "${team.name}"`, link: '/teams', kind: 'team' });
  }
  res.json({ ok: true });
});

router.post('/:id/transfer', async (req, res) => {
  const team = await loadTeam(req);
  requireRole(team, req.user, ['owner'], 'Only the team owner can hand the team over');
  const body = parse(z.object({ userId: objectId }), req.body);
  const next = team.memberOf(body.userId);
  if (!next || next.status !== 'active') throw badRequest('Choose someone who has joined the team');
  const current = team.members.find((x) => x.role === 'owner');
  if (current) current.role = 'admin';
  next.role = 'owner';
  team.owner = next.user;
  await team.save();
  notify([next.user], {
    title: `You are now the owner of the team "${team.name}"`,
    link: `/teams/${team._id}`,
    kind: 'team',
    exclude: req.user._id,
  });
  res.json({ team: await teamView(team, req.user) });
});

module.exports = router;
module.exports.teamView = teamView;
module.exports.deleteTeam = deleteTeam;
