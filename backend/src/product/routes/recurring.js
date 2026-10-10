/**
 * Repeating schedules, under /api/tasks/recurring. Open to everyone.
 *
 * You see schedules you set up or are on; team owners/admins also see those
 * filed under their team; the Super Admin sees all. Only the creator, a team
 * owner/admin of its team, or the Super Admin may change, pause, delete or
 * run one. Each occurrence becomes an ordinary task in the doer's list.
 */
const express = require('express');
const mongoose = require('mongoose');
const RecurringTask = require('../models/RecurringTask');
const Task = require('../models/Task');
const User = require('../../platform/models/User');
const { badRequest, forbidden, notFound } = require('../../platform/errors');
const access = require('../services/access');
const people = require('../services/people');
const recurrence = require('../services/recurrence');
const { personOut, teamOut, withUrl, PERSON_FIELDS } = require('../services/present');
const {
  taskUpload, parseBody, truthy, isOn, cleanReminders, ROUTINE_REMINDERS, cleanLinks, storeVoiceNote,
} = require('../services/inputs');
const { zoneOf, dayKey, startOfDay, settingsOf, dayText } = require('../services/time');
const {
  FREQUENCY, FREQUENCIES, MONTHLY_MODE, MONTHLY_MODES, NTH_WEEKS, MAX_DAY_INTERVAL, MAX_LEAD_DAYS, DEFAULT_LEAD_DAYS,
  STATUS, OPEN_STATUS, DEFAULT_PRIORITY, normalisePriority, patternLabel, reminderLabel, isRoutineFrequency, hhmmOf, idOf,
} = require('../config');
const { teamFor } = require('./tasks');

const router = express.Router();

const fail = (m) => badRequest(m);

/** The schedule fields a body may set (flat or under `repeat`), only what was sent. */
function scheduleFields(body, tz) {
  const src = { ...(body.repeat && typeof body.repeat === 'object' ? body.repeat : {}), ...body };
  const out = {};
  if (src.frequency !== undefined) {
    if (!FREQUENCIES.includes(src.frequency) || src.frequency === FREQUENCY.ONCE) throw fail('Choose how often it repeats: daily, weekly, monthly or yearly.');
    out.frequency = src.frequency;
  }
  if (src.interval !== undefined) out.interval = Math.min(MAX_DAY_INTERVAL, Math.max(1, Math.round(Number(src.interval) || 1)));
  if (src.weekdays !== undefined) {
    const raw = Array.isArray(src.weekdays) ? src.weekdays : [src.weekdays];
    out.weekdays = [...new Set(raw.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  }
  if (src.monthlyMode !== undefined) out.monthlyMode = MONTHLY_MODES.includes(src.monthlyMode) ? src.monthlyMode : MONTHLY_MODE.DATE;
  if (src.nthWeek !== undefined) out.nthWeek = NTH_WEEKS.includes(Number(src.nthWeek)) ? Number(src.nthWeek) : 1;
  if (src.weekday !== undefined) {
    const w = Number(src.weekday);
    out.weekday = Number.isInteger(w) && w >= 0 && w <= 6 ? w : 1;
  }
  if (src.monthDay !== undefined) {
    const d = Number(src.monthDay);
    out.monthDay = Number.isInteger(d) && d >= 1 && d <= 31 ? d : undefined;
  }
  if (src.month !== undefined) {
    const m = Number(src.month);
    out.month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : undefined;
  }
  if (src.time !== undefined && hhmmOf(src.time)) out.time = hhmmOf(src.time);
  if (src.startDate !== undefined) out.startDate = startOfDay(src.startDate, tz) || undefined;
  if (src.until !== undefined) out.until = src.until ? startOfDay(src.until, tz) : null;
  if (src.leadDays !== undefined && src.leadDays !== null && src.leadDays !== '') {
    const n = Math.round(Number(src.leadDays));
    if (Number.isFinite(n)) out.leadDays = Math.min(MAX_LEAD_DAYS, Math.max(0, n));
  }
  return out;
}

function assertShape(s) {
  if (s.frequency === FREQUENCY.WEEKLY && !(s.weekdays || []).length) throw fail('Pick at least one day of the week.');
  if (s.until && s.startDate && new Date(s.until) < new Date(s.startDate)) throw fail('The end date is before the start date.');
}

const mayManage = (who, s) => Boolean(who.superAdmin || access.same(s.createdBy, who.id) || (s.team && who.adminTeams.has(idOf(s.team))));
const maySee = (who, s) => mayManage(who, s) || (s.assignees || []).some((u) => access.same(u, who.id));

/** What each schedule has produced, in one aggregation (plus the days already raised). */
async function statsFor(ids) {
  if (!ids.length) return new Map();
  const rows = await Task.aggregate([
    { $match: { recurringTask: { $in: ids }, archived: { $ne: true } } },
    { $sort: { dueDate: -1 } },
    {
      $group: {
        _id: '$recurringTask',
        raised: { $sum: 1 },
        open: { $sum: { $cond: [{ $in: ['$status', OPEN_STATUS] }, 1, 0] } },
        done: { $sum: { $cond: [{ $eq: ['$status', STATUS.COMPLETED] }, 1, 0] } },
        last: { $first: { _id: '$_id', code: '$code', status: '$status', dueDate: '$dueDate' } },
      },
    },
  ]);
  const out = new Map(rows.map((r) => [String(r._id), { ...r, upcoming: new Set() }]));
  const recent = await Task.find({ recurringTask: { $in: ids }, dueDate: { $gte: new Date(Date.now() - 2 * 86400000) } })
    .select('recurringTask occurrenceKey').lean();
  for (const t of recent) {
    const id = String(t.recurringTask);
    if (!out.has(id)) out.set(id, { upcoming: new Set() });
    out.get(id).upcoming.add(t.occurrenceKey);
  }
  return out;
}

/** Each setter's zone, for a page of schedules. */
async function zonesFor(schedules) {
  const ids = [...new Set(schedules.map((s) => idOf(s.createdBy)))];
  const users = await User.find({ _id: { $in: ids } }).select('settings').lean();
  return new Map(users.map((u) => [String(u._id), recurrence.zoneFromUser(u)]));
}

/** One schedule as both apps draw it. */
function present(who, s, stats = {}, off = new Set(), zone = recurrence.zoneFromUser(null)) {
  const assignees = (s.assignees || []).filter((u) => u && !off.has(idOf(u)));
  const next = s.isActive ? recurrence.nextOccurrence(s, new Date(), zone, { skipKeys: stats.upcoming || null }) : null;
  return {
    ...s,
    assignees: assignees.map(personOut),
    loopUsers: (s.loopUsers || []).map(personOut),
    team: teamOut(s.team),
    voiceNote: s.voiceNote ? withUrl(s.voiceNote) : s.voiceNote,
    routine: isRoutineFrequency(s.frequency),
    leadDays: recurrence.leadDaysOf(s),
    patternLabel: patternLabel(s),
    reminderLabels: (s.reminders || []).map((r) => `${reminderLabel(r)}${r.channel === 'EMAIL' ? ' (email)' : ''}`),
    next: next ? { dueAt: next.dueAt, appearAt: next.appearAt } : null,
    nextDueDate: next ? next.dueAt : null,
    who: assignees.map((u) => u.name).filter(Boolean).join(', '),
    canManage: mayManage(who, s),
    can: { edit: mayManage(who, s), delete: mayManage(who, s), run: mayManage(who, s) },
    stats: { raised: stats.raised || 0, open: stats.open || 0, done: stats.done || 0, last: stats.last || null },
  };
}

const populated = (q) => q.populate('assignees', PERSON_FIELDS).populate('loopUsers', PERSON_FIELDS).populate('team', 'name');

async function presentOne(who, id) {
  const s = await populated(RecurringTask.findById(id)).lean();
  const [stats, zones, off] = await Promise.all([statsFor([s._id]), zonesFor([s]), people.disabledSet((s.assignees || []).map((u) => u._id))]);
  return present(who, s, stats.get(String(s._id)), off, zones.get(idOf(s.createdBy)));
}

async function loadSchedule(who, id, { manage = false } = {}) {
  const s = mongoose.isValidObjectId(id) ? await RecurringTask.findById(id) : null;
  if (!s || !maySee(who, s)) throw notFound('That schedule is gone.');
  if (manage && !mayManage(who, s)) throw forbidden('Only whoever set this up, an organization owner or admin, or the Super Admin can change it.');
  return s;
}

/** GET /recurring (?scope=mine: only the ones you set up). */
router.get('/', async (req, res) => {
  const who = await access.actor(req);
  const me = req.user._id;
  let filter;
  if (req.query.scope === 'mine') filter = { createdBy: me };
  else if (who.superAdmin) filter = {};
  else {
    const teams = [...who.adminTeams].map((id) => new mongoose.Types.ObjectId(id));
    filter = { $or: [{ createdBy: me }, { assignees: me }, ...(teams.length ? [{ team: { $in: teams } }] : [])] };
  }
  const schedules = await populated(RecurringTask.find(filter).sort({ isActive: -1, createdAt: -1 }).limit(500)).lean();
  const [stats, zones, off] = await Promise.all([
    statsFor(schedules.map((s) => s._id)),
    zonesFor(schedules),
    people.disabledSet(schedules.flatMap((s) => (s.assignees || []).map((u) => u?._id))),
  ]);
  res.json({
    schedules: schedules.map((s) => present(who, s, stats.get(String(s._id)), off, zones.get(idOf(s.createdBy)))),
    canSeeAll: who.superAdmin,
  });
});

/** GET /recurring/:id */
router.get('/:id', async (req, res) => {
  const who = await access.actor(req);
  const s = await loadSchedule(who, req.params.id);
  res.json({ schedule: await presentOne(who, s._id) });
});

/**
 * POST /recurring — set one up. Only the schedule is made; whatever is already
 * due to appear is raised at once, the rest when its day comes.
 */
router.post('/', taskUpload, async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  const title = String(body.title || '').trim();
  if (!title) throw fail('Give the task a title.');
  if (title.length > 300) throw fail('Keep the title under 300 characters.');

  let setter = req.user;
  let proxy = null;
  const behalfId = String(body.onBehalfOf || '').trim();
  if (behalfId && behalfId !== who.id) {
    if (!who.superAdmin) throw forbidden('Only the Super Admin can set a task on somebody else’s behalf.');
    const principal = mongoose.isValidObjectId(behalfId) ? await User.findOne({ _id: behalfId, role: 'user', status: 'active' }).select('name settings status') : null;
    if (!principal) throw fail('Choose an active person to set the task for.');
    setter = principal;
    proxy = { by: req.user._id, byName: req.user.name, at: new Date() };
  }
  const zone = recurrence.zoneFromUser(setter);
  const setterSettings = settingsOf(setter);

  let wanted = people.validIds(Array.isArray(body.assignees) ? body.assignees : body.assignees ? [body.assignees] : []);
  if (!wanted.length) wanted = [String(setter._id)];
  const loopUsers = people.validIds(body.loopUsers).filter((id) => !wanted.includes(id));
  await people.assertAssignable(req.user, [...wanted, ...loopUsers]);
  const rows = await people.buildAssignees(wanted);
  if (!rows.length) throw fail('None of the people chosen are available any more.');
  const team = await teamFor(body.team, setter, who.superAdmin);

  const shape = scheduleFields(body, zone.tz);
  if (!shape.frequency) throw fail('Choose how often it repeats: daily, weekly, monthly or yearly.');
  if (!shape.startDate) shape.startDate = startOfDay(new Date(), zone.tz);
  if (shape.frequency === FREQUENCY.WEEKLY && !(shape.weekdays || []).length) {
    shape.weekdays = [new Date(`${dayKey(shape.startDate, zone.tz)}T12:00:00Z`).getUTCDay()];
  }
  assertShape(shape);

  const reminders = body.reminders !== undefined
    ? cleanReminders(body.reminders)
    : isRoutineFrequency(shape.frequency) ? ROUTINE_REMINDERS() : cleanReminders(setterSettings.defaultReminders);

  const schedule = await RecurringTask.create({
    title,
    description: String(body.description || '').trim(),
    category: String(body.category || '').trim(),
    priority: normalisePriority(body.priority) || DEFAULT_PRIORITY,
    team,
    assignees: rows.map((r) => r.user),
    loopUsers,
    links: cleanLinks(body.links),
    reminders,
    requiresApproval: body.requiresApproval === undefined || body.requiresApproval === '' ? setterSettings.approvalDefault : truthy(body.requiresApproval),
    time: '18:00',
    ...shape,
    mintFrom: new Date(),
    isActive: true,
    createdBy: setter._id,
    createdByName: setter.name,
    ...(proxy ? { onBehalf: proxy } : {}),
  });

  const voice = await storeVoiceNote(req.files, { kind: 'recurring', id: schedule._id }, req.user, body.voiceDurationMs);
  if (voice) {
    schedule.voiceNote = voice;
    await schedule.save();
  }

  const made = await recurrence.runSchedule(schedule.toObject(), new Date(), { ...zone, setter });
  const out = await presentOne(who, schedule._id);
  res.status(201).json({
    schedule: out,
    raised: made.length,
    message: made.length
      ? `Set up. The first one is on ${out.who || 'their'} list now.`
      : out.next ? `Set up. The first one appears on ${dayText(out.next.appearAt, zoneOf(req))}.` : 'Set up.',
  });
});

/**
 * PATCH /recurring/:id — pause, resume or change it. Tasks already raised keep
 * their terms. Changing when it repeats, or switching it back on, moves
 * mintFrom to now so nothing missed is raised overdue.
 */
router.patch('/:id', taskUpload, async (req, res) => {
  const who = await access.actor(req);
  const schedule = await loadSchedule(who, req.params.id, { manage: true });
  const setter = await User.findById(schedule.createdBy).select('name settings status');
  const zone = recurrence.zoneFromUser(setter);
  const b = parseBody(req);
  const now = new Date();
  let reshaped = false;

  if (b.isActive !== undefined) {
    const on = isOn(b.isActive);
    if (on && !schedule.isActive) schedule.mintFrom = now;
    schedule.isActive = on;
  }
  if (b.title !== undefined) {
    const t = String(b.title).trim();
    if (!t) throw fail('A task needs a title.');
    schedule.title = t.slice(0, 300);
  }
  if (b.description !== undefined) schedule.description = String(b.description ?? '').trim();
  if (b.category !== undefined) schedule.category = String(b.category ?? '').trim();
  if (b.priority !== undefined) {
    const p = normalisePriority(b.priority);
    if (p) schedule.priority = p;
  }
  if (b.requiresApproval !== undefined) schedule.requiresApproval = truthy(b.requiresApproval);
  if (b.assignees !== undefined) {
    const ids = people.validIds(Array.isArray(b.assignees) ? b.assignees : [b.assignees]);
    if (!ids.length) throw fail('A schedule needs at least one person on it.');
    const before = (schedule.assignees || []).map(String);
    await people.assertAssignable(req.user, ids.filter((id) => !before.includes(id)));
    schedule.assignees = ids;
  }
  if (b.loopUsers !== undefined) {
    const ids = people.validIds(b.loopUsers);
    const before = (schedule.loopUsers || []).map(String);
    await people.assertAssignable(req.user, ids.filter((id) => !before.includes(id)));
    schedule.loopUsers = ids;
  }
  if (b.team !== undefined) schedule.team = await teamFor(b.team, setter || req.user, who.superAdmin);
  if (b.reminders !== undefined) schedule.reminders = cleanReminders(b.reminders);
  if (b.links !== undefined) schedule.links = cleanLinks(b.links);

  const shape = scheduleFields(b, zone.tz);
  const SHAPE_KEYS = ['frequency', 'interval', 'weekdays', 'monthlyMode', 'nthWeek', 'weekday', 'monthDay', 'month', 'time', 'startDate', 'leadDays'];
  for (const [k, v] of Object.entries(shape)) {
    const was = schedule[k];
    const same = Array.isArray(v)
      ? JSON.stringify([...(was || [])]) === JSON.stringify(v)
      : v instanceof Date ? was && new Date(was).getTime() === v.getTime() : String(was ?? '') === String(v ?? '');
    if (!same && SHAPE_KEYS.includes(k)) reshaped = true;
    schedule[k] = v === null ? undefined : v;
  }
  if (shape.frequency && shape.leadDays === undefined && reshaped) schedule.leadDays = DEFAULT_LEAD_DAYS[shape.frequency] ?? 0;
  assertShape(schedule);
  if (reshaped) schedule.mintFrom = now;

  const voice = await storeVoiceNote(req.files, { kind: 'recurring', id: schedule._id }, req.user, b.voiceDurationMs);
  if (voice) schedule.voiceNote = voice;
  await schedule.save();

  if (schedule.isActive) {
    await recurrence.runSchedule(schedule.toObject(), now, { ...zone, setter }).catch((e) => console.warn('[tasks] recurring run:', e.message));
  }
  res.json({ schedule: await presentOne(who, schedule._id) });
});

/** DELETE /recurring/:id — switched off; the tasks it raised stay. */
router.delete('/:id', async (req, res) => {
  const who = await access.actor(req);
  const schedule = await loadSchedule(who, req.params.id, { manage: true });
  schedule.isActive = false;
  await schedule.save();
  res.json({ ok: true });
});

/** POST /recurring/:id/run — raise whatever is due to appear now. */
router.post('/:id/run', async (req, res) => {
  const who = await access.actor(req);
  const schedule = await loadSchedule(who, req.params.id, { manage: true });
  const made = await recurrence.runSchedule(schedule.toObject());
  res.json({ raised: made.length, tasks: made.map((t) => ({ _id: t._id, code: t.code, dueDate: t.dueDate })) });
});

module.exports = router;
