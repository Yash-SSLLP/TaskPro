/**
 * The list query, built ONCE and shared by the list, its counters, the board,
 * the export and the dashboard, so a figure can never disagree with the rows
 * under it.
 *
 *   scope    mine | delegated | loop | team | all
 *   org      all | general | <teamId>   (the Tasks screen's organization tabs)
 *   range    today | yesterday | week | nextWeek | month | all | custom (from, to)
 *   filters  team, category, assignedTo, assignedBy, frequency, priority, status,
 *            overdue, late, moreTime, includeSubtasks, parentTask, q
 *
 * Dates are read in the viewer's time zone.
 */
const mongoose = require('mongoose');
const Task = require('../models/Task');
const access = require('./access');
const { zoneOf, inZone, startOfDay } = require('./time');
const { listParam } = require('./inputs');
const { PERSON_FIELDS } = require('./present');
const {
  STATUS, TASK_STATUS, OPEN_STATUS, DOING_STATUS, FREQUENCIES, EXTENSION_STATUS, SORTS, SORT_KEYS, DEFAULT_SORT,
  PRIORITY_RANK, normalisePriority,
} = require('../config');

const oid = (v) => (mongoose.isValidObjectId(String(v ?? '')) ? new mongoose.Types.ObjectId(String(v)) : null);
const HEX_ID = /^[a-f\d]{24}$/i;
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The deadline window a range chip asks for, or null for "all time". */
function rangeWindow(range, fromRaw, toRaw, tz) {
  const now = inZone(new Date(), tz);
  const today = now.startOf('day');
  const win = (a, b) => ({ $gte: a.toJSDate(), $lt: b.toJSDate() });
  switch (range) {
    case 'today': return win(today, today.plus({ days: 1 }));
    case 'yesterday': return win(today.minus({ days: 1 }), today);
    case 'week': {
      const monday = today.startOf('week');
      return win(monday, monday.plus({ weeks: 1 }));
    }
    case 'nextWeek': {
      const monday = today.startOf('week').plus({ weeks: 1 });
      return win(monday, monday.plus({ weeks: 1 }));
    }
    case 'month': return win(today.startOf('month'), today.startOf('month').plus({ months: 1 }));
    case 'custom': {
      const from = startOfDay(fromRaw, tz);
      const to = startOfDay(toRaw, tz);
      const w = {};
      if (from) w.$gte = from;
      if (to) w.$lt = inZone(to, tz).plus({ days: 1 }).toJSDate();
      return Object.keys(w).length ? w : null;
    }
    default: return null;
  }
}

/** The chips that contain today: open work always shows on them. */
const CURRENT_RANGES = ['today', 'week', 'month'];

/**
 * One filter for the list AND its counters. `overrides` pins parameters;
 * `strictRange` (the dashboard's) makes a date chip mean "due in that period".
 */
async function buildQuery(req, overrides = {}, { strictRange = false } = {}) {
  const who = await access.actor(req);
  const tz = zoneOf(req);
  const {
    scope, range = 'all', from, to, org, team, category, assignedTo, assignedBy, frequency, priority, status, q,
    overdue, late, moreTime, includeSubtasks, parentTask,
  } = { ...req.query, ...overrides };

  const and = [access.visibleFilter(who, scope || undefined, { team: scope === 'team' ? team : undefined })];

  // Today / this week / this month narrow finished work only; open work always shows.
  const window = rangeWindow(range, from, to, tz);
  if (window) {
    const carryOpen = !strictRange && CURRENT_RANGES.includes(range);
    and.push(carryOpen ? { $or: [{ dueDate: window }, { status: { $in: OPEN_STATUS } }] } : { dueDate: window });
  }

  if (team && scope !== 'team') {
    const t = oid(team);
    and.push(t ? { team: t } : { _id: null });
  }

  // The organization tabs. General is everything not under one of my
  // organizations (a task can be filed under one I'm not in), so All is
  // General plus each organization. On the Organization pile an id narrows
  // it like `team` (nothing if I don't own/admin it) and General is empty.
  const tab = String(org ?? '').trim();
  if (tab === 'general') {
    if (scope === 'team') and.push({ _id: null });
    else and.push(who.superAdmin ? { team: null } : { team: { $nin: [...who.memberTeams.keys()].map(oid) } });
  } else if (tab && tab !== 'all') {
    and.push(HEX_ID.test(tab) ? { team: oid(tab) } : { _id: null });
  }

  const cats = listParam(category);
  if (cats.length) and.push({ category: { $in: cats } });

  const doers = listParam(assignedTo).map(oid).filter(Boolean);
  if (doers.length) and.push({ 'assignees.user': { $in: doers } });

  const setters = listParam(assignedBy).map(oid).filter(Boolean);
  if (setters.length) and.push({ createdBy: { $in: setters } });

  const freqs = listParam(frequency).filter((f) => FREQUENCIES.includes(f));
  if (freqs.length) and.push({ 'repeat.frequency': { $in: freqs } });

  const prios = [...new Set(listParam(priority).map(normalisePriority).filter(Boolean))];
  if (prios.length) and.push({ priority: { $in: prios } });

  const states = listParam(status).map((s) => s.toUpperCase()).filter((s) => TASK_STATUS.includes(s));
  if (states.length) and.push({ status: { $in: states } });

  // Pieces show on "mine" (they are my work) and under their parent elsewhere.
  const pieces = includeSubtasks === undefined || includeSubtasks === null || includeSubtasks === ''
    ? scope === 'mine'
    : !(includeSubtasks === '0' || includeSubtasks === 'false' || includeSubtasks === false);
  if (parentTask && oid(parentTask)) and.push({ parentTask: oid(parentTask) });
  else if (!pieces) and.push({ parentTask: null });

  const lateNow = { status: { $in: DOING_STATUS }, dueDate: { $lt: new Date() } };
  if (overdue === 'true' || overdue === '1') and.push(lateNow);
  else if (overdue === 'false' || overdue === '0') and.push({ $nor: [lateNow] });

  // The frozen flag, so these rows match the In time / Delayed figures exactly.
  if (late === 'true' || late === '1') and.push({ completedLate: true });
  else if (late === 'false' || late === '0') and.push({ completedLate: { $ne: true } });

  if (moreTime === 'true' || moreTime === '1') {
    and.push({ status: { $in: OPEN_STATUS }, extensions: { $elemMatch: { status: EXTENSION_STATUS.PENDING } } });
  }

  // The search box: the task, and the people on either side of it.
  const search = String(q || '').trim();
  if (search) {
    const rx = new RegExp(escapeRx(search), 'i');
    and.push({ $or: [{ title: rx }, { description: rx }, { code: rx }, { category: rx }, { 'assignees.name': rx }, { createdByName: rx }, { approverName: rx }] });
  }

  return and.length === 1 ? and[0] : { $and: and };
}

/** The bar's figures ignore the figure clicked and the search box. */
const FIGURES_IGNORE = { status: '', overdue: '', late: '', moreTime: '', q: '' };

const COUNTER_KEYS = ['total', 'overdue', 'pending', 'notAccepted', 'inProgress', 'inReview', 'completed', 'inTime', 'delayed', 'cancelled', 'moreTime'];
const countersOf = (c = {}) => Object.fromEntries(COUNTER_KEYS.map((k) => [k, c[k] || 0]));

/**
 * The counter row's `$group` fields. The boxes don't overlap: overdue wins
 * over pending and in progress, so they sum to the total.
 */
function counterFields(now = new Date()) {
  const late = { $and: [{ $in: ['$status', DOING_STATUS] }, { $ne: [{ $ifNull: ['$dueDate', null] }, null] }, { $lt: ['$dueDate', now] }] };
  const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
  return {
    total: { $sum: 1 },
    overdue: countIf(late),
    pending: countIf({ $and: [{ $eq: ['$status', STATUS.PENDING] }, { $not: [late] }] }),
    inProgress: countIf({ $and: [{ $eq: ['$status', STATUS.IN_PROGRESS] }, { $not: [late] }] }),
    // Pending, not late, and somebody hasn't answered the handover yet.
    notAccepted: countIf({
      $and: [
        { $eq: ['$status', STATUS.PENDING] },
        { $not: [late] },
        { $anyElementTrue: [{ $map: { input: { $ifNull: ['$assignees', []] }, as: 'a', in: { $eq: ['$$a.acceptance', 'AWAITING'] } } }] },
      ],
    }),
    inReview: countIf({ $eq: ['$status', STATUS.SUBMITTED] }),
    completed: countIf({ $eq: ['$status', STATUS.COMPLETED] }),
    cancelled: countIf({ $eq: ['$status', STATUS.CANCELLED] }),
    inTime: countIf({ $and: [{ $eq: ['$status', STATUS.COMPLETED] }, { $ne: ['$completedLate', true] }] }),
    delayed: countIf({ $and: [{ $eq: ['$status', STATUS.COMPLETED] }, { $eq: ['$completedLate', true] }] }),
    moreTime: countIf({
      $and: [
        { $in: ['$status', OPEN_STATUS] },
        { $gt: [{ $size: { $filter: { input: { $ifNull: ['$extensions', []] }, as: 'x', cond: { $eq: ['$$x.status', EXTENSION_STATUS.PENDING] } } } }, 0] },
      ],
    }),
  };
}

/** The counter row for a filter. */
async function countersFor(filter) {
  const [c] = await Task.aggregate([{ $match: filter }, { $group: { _id: null, ...counterFields() } }]);
  return countersOf(c);
}

/**
 * The counter row for each organization tab, from one pass grouped by team:
 * `{ all, general, <teamId>: … }` with a key for every organization the
 * caller is in. Tasks under any other team count as General (as the `org`
 * filter has it; for the Super Admin General is unfiled work only), and
 * `all` is the sum.
 */
async function orgCounters(who, filter) {
  const groups = await Task.aggregate([{ $match: filter }, { $group: { _id: '$team', ...counterFields() } }]);
  const out = { all: countersOf(), general: countersOf() };
  for (const id of who.memberTeams.keys()) out[id] = countersOf();
  for (const g of groups) {
    const id = g._id ? String(g._id) : null;
    let tab = out.general;
    if (id && who.memberTeams.has(id)) tab = out[id];
    else if (id && who.superAdmin) tab = null;
    for (const c of [out.all, tab]) if (c) for (const k of COUNTER_KEYS) c[k] += g[k] || 0;
  }
  return out;
}

/** The order asked for; `_id` breaks ties so paging never repeats a row. */
function resolveSort(query = {}) {
  const key = SORT_KEYS.includes(query.sort) ? query.sort : DEFAULT_SORT;
  const spec = SORTS[key];
  const dir = query.dir === 'asc' ? 1 : query.dir === 'desc' ? -1 : spec.dir;
  return { key, dir: dir === 1 ? 'asc' : 'desc', sort: { [spec.field]: dir, _id: -1 } };
}

const populateRows = (q) => q.populate('assignees.user', PERSON_FIELDS).populate('createdBy', PERSON_FIELDS).populate('team', 'name');

/** One page of lean rows in the asked-for order (priority and pending need a computed key). */
async function sortedRows(filter, sort, key, skip, limit) {
  if (key !== 'priority' && key !== 'pending') {
    return populateRows(Task.find(filter).sort(sort).skip(skip).limit(limit)).lean();
  }
  const addFields = key === 'priority'
    ? { priorityRank: { $switch: { branches: [
      { case: { $eq: ['$priority', 'Urgent'] }, then: PRIORITY_RANK.Urgent },
      { case: { $eq: ['$priority', 'Low'] }, then: PRIORITY_RANK.Low },
    ], default: PRIORITY_RANK.Medium } } }
    : { openFirst: { $cond: [{ $in: ['$status', [STATUS.COMPLETED, STATUS.CANCELLED]] }, 1, 0] } };
  const sortStage = key === 'priority'
    ? { priorityRank: sort.priorityRank ?? 1, dueDate: 1, _id: -1 }
    : { openFirst: 1, assignedAt: sort.assignedAt ?? 1, _id: -1 };
  const ids = await Task.aggregate([
    { $match: filter },
    { $addFields: addFields },
    { $sort: sortStage },
    { $skip: skip },
    { $limit: limit },
    { $project: { _id: 1 } },
  ]);
  const order = new Map(ids.map((r, i) => [String(r._id), i]));
  const rows = await populateRows(Task.find({ _id: { $in: ids.map((r) => r._id) } })).lean();
  return rows.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
}

module.exports = { oid, rangeWindow, buildQuery, FIGURES_IGNORE, countersFor, orgCounters, resolveSort, sortedRows, populateRows };
