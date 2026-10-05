/**
 * Templates: a task with the dates left off. Yours, or shared with a team by
 * its owner/admin. `prefill` returns the assign form's starting values.
 */
const express = require('express');
const mongoose = require('mongoose');
const TaskTemplate = require('../models/TaskTemplate');
const { badRequest, forbidden, notFound } = require('../../platform/errors');
const access = require('../services/access');
const people = require('../services/people');
const { parseBody, cleanReminders, cleanRepeat, cleanLinks, truthy } = require('../services/inputs');
const { zoneOf, dayKey, addDaysKey, atZone } = require('../services/time');
const { DEFAULT_PRIORITY, FREQUENCY, normalisePriority, idOf } = require('../config');

const router = express.Router();

/** The fields a body may set, cleaned (only what was sent). */
function templateFields(body) {
  const out = {};
  if (body.name !== undefined) out.name = String(body.name ?? '').trim().slice(0, 200);
  if (body.title !== undefined) out.title = String(body.title ?? '').trim().slice(0, 300);
  if (body.description !== undefined) out.description = String(body.description ?? '').trim();
  if (body.category !== undefined) out.category = String(body.category ?? '').trim();
  if (body.priority !== undefined) {
    const p = normalisePriority(body.priority);
    if (p) out.priority = p;
  }
  if (body.dueInDays !== undefined) {
    const d = Number(body.dueInDays);
    out.dueInDays = body.dueInDays !== null && body.dueInDays !== '' && Number.isFinite(d) && d >= 0 ? Math.round(d) : undefined;
  }
  if (body.repeat !== undefined) out.repeat = cleanRepeat(body.repeat);
  if (body.reminders !== undefined) out.reminders = cleanReminders(body.reminders);
  if (body.links !== undefined) out.links = cleanLinks(body.links);
  if (body.requiresApproval !== undefined) out.requiresApproval = truthy(body.requiresApproval);
  if (body.defaultAssignees !== undefined) out.defaultAssignees = people.validIds(body.defaultAssignees);
  if (body.defaultLoopUsers !== undefined) out.defaultLoopUsers = people.validIds(body.defaultLoopUsers);
  return out;
}

/** The teams the caller is in: { id → name }. */
async function myTeams(who) {
  if (who.superAdmin) return null;
  const teams = await people.platform.teamsOf(who.user._id);
  return new Map(teams.map((t) => [t.id, t.name]));
}

const canUse = (who, tpl, teams) => Boolean(who.superAdmin || access.same(tpl.owner, who.id) || (tpl.team && teams?.has(idOf(tpl.team))));
const canChange = (who, tpl) =>
  Boolean(who.superAdmin || (!tpl.team && access.same(tpl.owner, who.id)) || (tpl.team && (who.adminTeams.has(idOf(tpl.team)) || access.same(tpl.createdBy, who.id))));

async function loadTemplate(who, id, { change = false } = {}) {
  const tpl = mongoose.isValidObjectId(id) ? await TaskTemplate.findById(id) : null;
  if (!tpl || !tpl.isActive) throw notFound('That template is gone.');
  const teams = await myTeams(who);
  if (!canUse(who, tpl, teams)) throw notFound('That template is gone.');
  if (change && !canChange(who, tpl)) throw forbidden('That template is not yours to change.');
  return tpl;
}

/** A team the caller may share a template with (owner/admin). */
function shareTeam(who, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (!mongoose.isValidObjectId(String(raw))) throw badRequest('Choose a valid team.');
  if (!who.superAdmin && !who.adminTeams.has(String(raw))) throw forbidden('Only a team owner or admin can share a template with the team.');
  return new mongoose.Types.ObjectId(String(raw));
}

const out = (who, t) => {
  const mayChange = canChange(who, t);
  return { ...(t.toObject ? t.toObject() : t), canEdit: mayChange, can: { edit: mayChange, delete: mayChange } };
};

/** GET /templates — `{ mine, team: [{ team: { id, name }, templates }] }`. */
router.get('/templates', async (req, res) => {
  const who = await access.actor(req);
  const teams = await myTeams(who);
  const teamFilter = who.superAdmin ? { team: { $ne: null } } : { team: { $in: [...teams.keys()].map((id) => new mongoose.Types.ObjectId(id)) } };
  const [mine, shared] = await Promise.all([
    TaskTemplate.find({ owner: req.user._id, team: null, isActive: true }).sort({ lastUsedAt: -1, name: 1 }).lean(),
    TaskTemplate.find({ ...teamFilter, isActive: true }).sort({ name: 1 }).lean(),
  ]);
  let names = teams;
  if (who.superAdmin) {
    const Team = require('../../platform/models/Team');
    names = new Map((await Team.find({ _id: { $in: shared.map((t) => t.team) } }).select('name').lean()).map((t) => [String(t._id), t.name]));
  }
  const groups = new Map();
  for (const t of shared) {
    const id = idOf(t.team);
    if (!groups.has(id)) groups.set(id, { team: { id, name: names.get(id) || 'Team' }, templates: [] });
    groups.get(id).templates.push(out(who, t));
  }
  const mineOut = mine.map((t) => out(who, t));
  res.json({ mine: mineOut, team: [...groups.values()].sort((a, b) => a.team.name.localeCompare(b.team.name)), templates: mineOut });
});

/** POST /templates — from scratch, or `{ fromTask }`; `team` shares it. */
router.post('/templates', async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  const team = shareTeam(who, body.team);
  const owner = { owner: req.user._id, team, createdBy: req.user._id, createdByName: req.user.name };

  if (body.fromTask) {
    const task = await access.loadVisible(who, body.fromTask);
    const tpl = await TaskTemplate.create({
      name: String(body.name || task.title).trim().slice(0, 200),
      title: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      repeat: task.repeat,
      reminders: task.reminders,
      links: task.links,
      requiresApproval: task.requiresApproval,
      defaultAssignees: (task.assignees || []).map((a) => a.user),
      defaultLoopUsers: task.loopUsers,
      ...owner,
    });
    return res.status(201).json({ template: out(who, tpl) });
  }

  const fields = templateFields(body);
  if (!fields.title) throw badRequest('Give the template a task title.');
  if (!fields.name) fields.name = fields.title;
  const tpl = await TaskTemplate.create({ ...fields, priority: fields.priority || DEFAULT_PRIORITY, ...owner });
  res.status(201).json({ template: out(who, tpl) });
});

/** POST /templates/:id/copy — a team template as your own. */
router.post('/templates/:id/copy', async (req, res) => {
  const who = await access.actor(req);
  const src = (await loadTemplate(who, req.params.id)).toObject();
  const { _id, createdAt, updatedAt, useCount, lastUsedAt, __v, ...rest } = src;
  const tpl = await TaskTemplate.create({
    ...rest,
    team: null,
    owner: req.user._id,
    createdBy: req.user._id,
    createdByName: req.user.name,
    useCount: 0,
    isActive: true,
  });
  res.status(201).json({ template: out(who, tpl) });
});

/** PATCH /templates/:id */
router.patch('/templates/:id', async (req, res) => {
  const who = await access.actor(req);
  const tpl = await loadTemplate(who, req.params.id, { change: true });
  const body = parseBody(req);
  const fields = templateFields(body);
  if (fields.title === '') throw badRequest('Give the template a task title.');
  if (fields.name === '') delete fields.name;
  Object.assign(tpl, fields);
  if (body.team !== undefined) tpl.team = shareTeam(who, body.team);
  await tpl.save();
  res.json({ template: out(who, tpl) });
});

/** DELETE /templates/:id */
router.delete('/templates/:id', async (req, res) => {
  const who = await access.actor(req);
  const tpl = await loadTemplate(who, req.params.id, { change: true });
  tpl.isActive = false;
  await tpl.save();
  res.json({ ok: true });
});

/**
 * GET /templates/:id/prefill — the assign form's starting values. The
 * deadline is worked out here (6 PM, `dueInDays` from today in your zone),
 * and anyone you may no longer assign to is left off.
 */
router.get('/templates/:id/prefill', async (req, res) => {
  const who = await access.actor(req);
  const tpl = (await loadTemplate(who, req.params.id)).toObject();
  const tz = zoneOf(req);
  const dueDate = Number.isFinite(tpl.dueInDays) ? atZone(addDaysKey(dayKey(new Date(), tz), tpl.dueInDays), '18:00', tz) : undefined;
  await TaskTemplate.updateOne({ _id: tpl._id }, { $inc: { useCount: 1 }, $set: { lastUsedAt: new Date() } });
  const [assignees, loopUsers] = await Promise.all([
    people.keepAssignable(req.user, tpl.defaultAssignees),
    people.keepAssignable(req.user, tpl.defaultLoopUsers),
  ]);
  res.json({
    prefill: {
      title: tpl.title,
      description: tpl.description || '',
      category: tpl.category || '',
      priority: tpl.priority || DEFAULT_PRIORITY,
      dueDate,
      repeat: tpl.repeat || { frequency: FREQUENCY.ONCE },
      reminders: tpl.reminders || [],
      links: tpl.links || [],
      ...(tpl.requiresApproval !== undefined && tpl.requiresApproval !== null ? { requiresApproval: tpl.requiresApproval } : {}),
      team: tpl.team || null,
      assignees,
      loopUsers,
      template: String(tpl._id),
    },
  });
});

module.exports = router;
