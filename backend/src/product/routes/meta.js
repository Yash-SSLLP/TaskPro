/**
 * Reference data: GET /meta (everything the assign form needs, in one call)
 * and the category list (yours plus your teams').
 */
const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const TaskCategory = require('../models/TaskCategory');
const { badRequest, forbidden, notFound } = require('../../platform/errors');
const access = require('../services/access');
const people = require('../services/people');
const { parseBody } = require('../services/inputs');
const {
  TASK_PRIORITY, PRIORITY_COLORS, DONE_COLOR, CANCELLED_COLOR, TASK_STATUS, BOARD_COLUMNS, SORTS, SORT_KEYS,
  PROGRESS_STEPS, MAX_SUBTASKS, FREQUENCIES, FREQUENCY_LABELS, WEEKDAYS, WEEKDAY_NAMES, MONTHLY_MODES, NTH_WEEKS,
  NTH_WEEK_LABELS, MAX_DAY_INTERVAL, DEFAULT_LEAD_DAYS, MAX_LEAD_DAYS, REPEAT_REMINDER, REMINDER_CHANNELS,
  REMINDER_CHANNEL_LABELS, REMINDER_UNITS, REMINDER_PATTERNS, REMINDER_PATTERN_LABELS, DEFAULT_REMIND_AT,
  DEFAULT_REMIND_WINDOW, NUDGE_COOLDOWN_MIN, statusLabel, idOf,
} = require('../config');

const router = express.Router();

/** The category lists a person sees: their own, and their teams'. */
async function categoryFilter(who) {
  if (who.superAdmin) return { isActive: true };
  const teams = await people.platform.teamsOf(who.user._id);
  return {
    isActive: true,
    $or: [{ scope: `user:${who.id}` }, { team: { $in: teams.map((t) => new mongoose.Types.ObjectId(t.id)) } }],
  };
}

const categoryOut = (c) => ({ _id: c._id, name: c.name, color: c.color || null, team: c.team || null, createdBy: c.createdBy, createdByName: c.createdByName });

/** The Super Admin's picker: every active person (no limit). */
async function everyone() {
  const User = require('../../platform/models/User');
  const { publicUser } = User;
  const users = await User.find({ role: 'user', status: 'active' }).sort({ name: 1 }).lean();
  return users.map((u) => ({ ...publicUser(u, { full: false }), self: false, contact: false, teams: [] }));
}

/** GET /meta */
router.get('/meta', async (req, res) => {
  const who = await access.actor(req);
  const [list, teams, categories] = await Promise.all([
    who.superAdmin ? everyone() : people.platform.assignablePeople(req.user),
    who.superAdmin ? [] : people.platform.teamsOf(req.user._id),
    TaskCategory.find(await categoryFilter(who)).sort({ name: 1 }).lean(),
  ]);

  const relationOf = (p) => (p.self ? 'self' : p.teams.length ? 'team' : p.contact ? 'contact' : 'other');
  const out = list.map((p) => ({
    _id: p.id,
    id: p.id,
    name: p.name,
    title: p.title || '',
    pin: p.pin,
    pinDisplay: p.pinDisplay,
    photoUrl: p.photoUrl || null,
    relation: relationOf(p),
    teams: (p.teams || []).map((t) => t.id),
    canAssign: true,
    departed: false,
  }));
  const direct = out.filter((p) => p.relation === 'team').map((p) => p.id);

  res.json({
    people: out,
    me: who.id,
    canAssignOnBehalf: who.superAdmin,
    canRecur: true,
    canSetReminders: true,
    team: { direct, indirect: [] },
    hasTeam: direct.length > 0,
    teams: teams.map((t) => ({ id: t.id, name: t.name, myRole: t.role })),
    categories: categories.map(categoryOut),
    priorities: TASK_PRIORITY,
    priorityColors: PRIORITY_COLORS,
    doneColor: DONE_COLOR,
    cancelledColor: CANCELLED_COLOR,
    statuses: TASK_STATUS.map((s) => ({ key: s, label: statusLabel(s) })),
    boardColumns: BOARD_COLUMNS,
    sorts: SORT_KEYS.map((k) => ({ key: k, label: SORTS[k].label, dir: SORTS[k].dir === 1 ? 'asc' : 'desc' })),
    progressSteps: PROGRESS_STEPS,
    maxPieces: MAX_SUBTASKS,
    frequencies: FREQUENCIES.map((f) => ({ key: f, label: FREQUENCY_LABELS[f] })),
    weekdays: WEEKDAYS,
    weekdayNames: WEEKDAY_NAMES,
    monthlyModes: MONTHLY_MODES,
    nthWeeks: NTH_WEEKS.map((n) => ({ key: n, label: NTH_WEEK_LABELS[String(n)] })),
    maxDayInterval: MAX_DAY_INTERVAL,
    defaultLeadDays: DEFAULT_LEAD_DAYS,
    maxLeadDays: MAX_LEAD_DAYS,
    repeatReminder: REPEAT_REMINDER,
    reminderChannels: REMINDER_CHANNELS.map((c) => ({ key: c, label: REMINDER_CHANNEL_LABELS[c] })),
    reminderUnits: REMINDER_UNITS,
    reminderPatterns: REMINDER_PATTERNS.map((k) => ({ key: k, label: REMINDER_PATTERN_LABELS[k] })),
    defaultRemindAt: DEFAULT_REMIND_AT,
    defaultRemindWindow: DEFAULT_REMIND_WINDOW,
    swipeRemarkRequired: true,
    nudgeCooldownMin: NUDGE_COOLDOWN_MIN,
    defaultReminders: req.settings?.defaultReminders || [],
    approvalDefault: req.settings?.approvalDefault ?? true,
    isAdmin: who.superAdmin,
    canManageCategories: true,
  });
});

// ---------------------------------------------------------------- categories

const mayManage = (who, cat) => Boolean(who.superAdmin || access.same(cat.createdBy, who.id) || (cat.team && who.adminTeams.has(idOf(cat.team))));

/** The tasks filed under a category's name, within its list. */
const tasksUnder = (cat, name = cat.name) => (cat.team ? { team: cat.team, category: name } : { createdBy: cat.createdBy, category: name });

async function loadCategory(who, id) {
  const cat = mongoose.isValidObjectId(id) ? await TaskCategory.findById(id) : null;
  if (!cat) throw notFound('That category is gone.');
  if (!mayManage(who, cat)) throw forbidden('Only whoever made this category, a team owner or admin, or the Super Admin can change it.');
  return cat;
}

function cleanName(raw) {
  const name = String(raw ?? '').trim();
  if (!name) throw badRequest('Give the category a name.');
  if (name.length > 80) throw badRequest('That category name is too long.');
  return name;
}

/** GET /categories (?withCounts=1 adds how many tasks are filed under each). */
router.get('/categories', async (req, res) => {
  const who = await access.actor(req);
  const categories = await TaskCategory.find(await categoryFilter(who)).sort({ name: 1 }).lean();
  if (req.query.withCounts !== '1' && req.query.withCounts !== 'true') return res.json({ categories: categories.map(categoryOut) });
  const counts = await Promise.all(categories.map((c) => Task.countDocuments({ ...tasksUnder(c), archived: { $ne: true } })));
  res.json({ categories: categories.map((c, i) => ({ ...categoryOut(c), taskCount: counts[i] })) });
});

/** POST /categories { name, team?, color? }: personal, or team-wide for a team owner/admin. */
router.post('/categories', async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  const name = cleanName(body.name);
  let team = null;
  if (body.team) {
    if (!mongoose.isValidObjectId(String(body.team))) throw badRequest('Choose a valid team.');
    if (!who.superAdmin && !who.adminTeams.has(String(body.team))) throw forbidden('Only a team owner or admin can add a category for the team.');
    team = new mongoose.Types.ObjectId(String(body.team));
  }
  const scope = TaskCategory.scopeOf(team, who.id);
  const existing = await TaskCategory.findOne({ scope, name }).collation({ locale: 'en', strength: 2 });
  if (existing) {
    if (!existing.isActive) {
      existing.isActive = true;
      await existing.save();
    }
    return res.status(200).json({ category: categoryOut(existing), existed: true });
  }
  const category = await TaskCategory.create({
    name,
    team,
    scope,
    color: typeof body.color === 'string' ? body.color.trim().slice(0, 20) : undefined,
    createdBy: req.user._id,
    createdByName: req.user.name,
  });
  res.status(201).json({ category: categoryOut(category) });
});

/** PATCH /categories/:id { name?, color? } — a rename carries its tasks with it. */
router.patch('/categories/:id', async (req, res) => {
  const who = await access.actor(req);
  const cat = await loadCategory(who, req.params.id);
  const body = parseBody(req);
  if (typeof body.color === 'string') cat.color = body.color.trim().slice(0, 20);
  let movedTasks = 0;
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (name !== cat.name) {
      const clash = await TaskCategory.findOne({ scope: cat.scope, name, _id: { $ne: cat._id } }).collation({ locale: 'en', strength: 2 });
      if (clash) throw badRequest(`There is already a category called "${clash.name}".`);
      const was = cat.name;
      cat.name = name;
      await cat.save();
      movedTasks = (await Task.updateMany(tasksUnder(cat, was), { $set: { category: name } })).modifiedCount || 0;
    }
  }
  await cat.save();
  res.json({ category: categoryOut(cat), movedTasks });
});

/**
 * DELETE /categories/:id — removed if nothing uses it, hidden if tasks are
 * filed under it (they keep the label). `?moveTo=<name>` refiles them first;
 * `?force=1` removes it anyway.
 */
router.delete('/categories/:id', async (req, res) => {
  const who = await access.actor(req);
  const cat = await loadCategory(who, req.params.id);
  const moveTo = String(req.query.moveTo || '').trim();
  let moved = 0;
  if (moveTo) {
    if (moveTo === cat.name) throw badRequest('That is the same category.');
    const target = await TaskCategory.findOne({ scope: cat.scope, name: moveTo }).collation({ locale: 'en', strength: 2 });
    if (!target) throw badRequest(`There is no category called "${moveTo}" to move these into.`);
    moved = (await Task.updateMany(tasksUnder(cat), { $set: { category: target.name } })).modifiedCount || 0;
  }
  const stillUsed = await Task.countDocuments({ ...tasksUnder(cat), archived: { $ne: true } });
  const force = req.query.force === '1' || req.query.force === 'true';
  if (stillUsed > 0 && !force) {
    cat.isActive = false;
    await cat.save();
    return res.json({
      ok: true,
      removed: false,
      hidden: true,
      movedTasks: moved,
      stillUsed,
      message: `Hidden. ${stillUsed} task${stillUsed === 1 ? '' : 's'} stay filed under "${cat.name}".`,
    });
  }
  await TaskCategory.deleteOne({ _id: cat._id });
  res.json({ ok: true, removed: true, hidden: false, movedTasks: moved, stillUsed, message: moved ? `Removed. ${moved} task${moved === 1 ? '' : 's'} moved to "${moveTo}".` : 'Removed.' });
});

module.exports = router;
