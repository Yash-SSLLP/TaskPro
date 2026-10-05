/**
 * /api/platform: the Super Admin console. Everyone on the platform, every
 * team, and the switches to disable an account or reset its password.
 * (Tasks are handled through the normal task routes, where the Super Admin
 * can see and change everything.)
 */
const express = require('express');
const product = require('../../product');
const User = require('../models/User');
const Team = require('../models/Team');
const Contact = require('../models/Contact');
const { publicUser } = require('../models/User');
const { protect, requireSuperAdmin } = require('../auth');
const { z, parse, password, idParam } = require('../validate');
const { normalizePin } = require('../pin');
const { notFound } = require('../errors');
const { teamsOf } = require('../services/people');
const { teamView, deleteTeam } = require('./teams');

const router = express.Router();
router.use(protect, requireSuperAdmin);

const DAY = 24 * 3600 * 1000;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/overview', async (req, res) => {
  const since = new Date(Date.now() - 7 * DAY);
  const people = { role: 'user' };
  const [users, activeWeek, newWeek, disabled, teams, tasks] = await Promise.all([
    User.countDocuments(people),
    User.countDocuments({ ...people, lastSeenAt: { $gte: since } }),
    User.countDocuments({ ...people, createdAt: { $gte: since } }),
    User.countDocuments({ ...people, status: 'disabled' }),
    Team.countDocuments({}),
    product.platformTotals(),
  ]);
  res.json({ users, activeWeek, newWeek, disabled, teams, tasks });
});

router.get('/users', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = { role: 'user' };
  if (['active', 'disabled'].includes(req.query.status)) filter.status = req.query.status;
  if (q) {
    const rx = new RegExp(escapeRe(q), 'i');
    const pin = normalizePin(q);
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { username: rx }, { pin: pin || rx }];
  }
  const list = await User.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  const stats = await product.userStats(list.map((u) => u._id));
  res.json({
    users: list.map((u) => ({ ...publicUser(u), stats: stats.get(String(u._id)) || { open: 0, given: 0, overdue: 0 } })),
  });
});

async function loadUser(req) {
  const user = await User.findOne({ _id: idParam(req.params.id), role: 'user' });
  if (!user) throw notFound('Person not found');
  return user;
}

router.get('/users/:id', async (req, res) => {
  const user = await loadUser(req);
  const [teams, contacts, stats] = await Promise.all([
    teamsOf(user._id),
    Contact.countDocuments({ $or: [{ a: user._id }, { b: user._id }], status: 'accepted' }),
    product.userStats([user._id]),
  ]);
  res.json({ user: publicUser(user), teams, contacts, stats: stats.get(String(user._id)) || { open: 0, given: 0, overdue: 0 } });
});

router.patch('/users/:id', async (req, res) => {
  const body = parse(z.object({ status: z.enum(['active', 'disabled']) }), req.body);
  const user = await loadUser(req);
  if (user.status !== body.status) {
    user.status = body.status;
    // Switching someone off ends their sessions at once.
    if (body.status === 'disabled') user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
  }
  res.json({ user: publicUser(user) });
});

router.post('/users/:id/password', async (req, res) => {
  const body = parse(z.object({ password }), req.body);
  const user = await loadUser(req);
  await user.setPassword(body.password);
  user.mustChangePassword = true;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  res.json({ ok: true });
});

router.get('/teams', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = q ? { name: new RegExp(escapeRe(q), 'i') } : {};
  const teams = await Team.find(filter).sort({ createdAt: -1 }).limit(500);
  res.json({ teams: await Promise.all(teams.map((t) => teamView(t, req.user, { withMembers: false }))) });
});

router.get('/teams/:id', async (req, res) => {
  const team = await Team.findById(idParam(req.params.id));
  if (!team) throw notFound('Team not found');
  res.json({ team: await teamView(team, req.user) });
});

router.delete('/teams/:id', async (req, res) => {
  const team = await Team.findById(idParam(req.params.id));
  if (!team) throw notFound('Team not found');
  await deleteTeam(team, req.user);
  res.json({ ok: true });
});

module.exports = router;
