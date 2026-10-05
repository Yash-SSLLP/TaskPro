/**
 * The dashboard: one aggregation, grouped differently per view.
 *
 *   mine       your own row
 *   delegated  what you handed out, per person
 *   people     per person in the teams you own/admin (everyone for the Super Admin)
 *   category   per category (counts TASKS, not person-jobs)
 *   trend      per day or month of the deadline (viewer's zone)
 *
 * Per-person views unwind the assignee rows; percentages are count-based:
 * completion = completed / total, on time = completed in time / completed.
 * Date chips are strict here: "this month" means due this month.
 */
const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const { forbidden } = require('../../platform/errors');
const access = require('../services/access');
const people = require('../services/people');
const { buildQuery } = require('../services/query');
const { zoneOf } = require('../services/time');
const { formatPin } = require('../../platform/pin');
const User = require('../../platform/models/User');
const { STATUS, DOING_STATUS } = require('../config');

const router = express.Router();
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

function statsStage(now, statusField = '$status', lateField = '$completedLate') {
  const late = { $and: [{ $in: [statusField, DOING_STATUS] }, { $ne: [{ $ifNull: ['$dueDate', null] }, null] }, { $lt: ['$dueDate', now] }] };
  const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
  return {
    total: { $sum: 1 },
    overdue: countIf(late),
    pending: countIf({ $and: [{ $eq: [statusField, STATUS.PENDING] }, { $not: [late] }] }),
    inProgress: countIf({ $and: [{ $eq: [statusField, STATUS.IN_PROGRESS] }, { $not: [late] }] }),
    inReview: countIf({ $eq: [statusField, STATUS.SUBMITTED] }),
    completed: countIf({ $eq: [statusField, STATUS.COMPLETED] }),
    inTime: countIf({ $and: [{ $eq: [statusField, STATUS.COMPLETED] }, { $ne: [lateField, true] }] }),
    delayed: countIf({ $and: [{ $eq: [statusField, STATUS.COMPLETED] }, { $eq: [lateField, true] }] }),
    cancelled: countIf({ $eq: [statusField, STATUS.CANCELLED] }),
  };
}
const perPerson = (now) => statsStage(now, '$assignees.status', '$assignees.completedLate');

/** A group row as the table draws it. */
function scoreRow(r, label, extra = {}) {
  const open = r.overdue + r.pending + r.inProgress + (r.inReview || 0);
  const completionPct = pct(r.completed, r.total);
  const onTimePct = pct(r.inTime, r.completed);
  return {
    ...extra,
    label,
    total: r.total,
    completed: r.completed,
    inTime: r.inTime,
    delayed: r.delayed,
    open,
    notDone: open,
    overdue: r.overdue,
    pending: r.pending,
    inProgress: r.inProgress,
    inReview: r.inReview || 0,
    cancelled: r.cancelled,
    completionPct,
    onTimePct,
    overduePct: pct(r.overdue, open),
    pendingPct: pct(r.pending, open),
    inProgressPct: pct(r.inProgress, open),
    inReviewPct: pct(r.inReview || 0, open),
    inTimePct: pct(r.inTime, r.completed),
    delayedPct: pct(r.delayed, r.completed),
    score: completionPct,
    onTimeScore: onTimePct,
  };
}

/** Person rows, labelled with the people's current names and pins (switched-off people dropped). */
async function personRows(rows) {
  const users = await User.find({ _id: { $in: rows.map((r) => r._id) }, status: 'active' }).select('name pin').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return rows
    .filter((r) => byId.has(String(r._id)))
    .map((r) => {
      const u = byId.get(String(r._id));
      const id = String(u._id);
      const person = { _id: id, id, name: u.name, pin: u.pin || '', pinDisplay: formatPin(u.pin) };
      return scoreRow(r, u.name, { key: id, person });
    });
}

const groupPeople = (match, now, extra = []) => Task.aggregate([
  { $match: match },
  { $unwind: '$assignees' },
  ...extra,
  { $group: { _id: '$assignees.user', ...perPerson(now) } },
  { $sort: { total: -1 } },
  { $limit: 500 },
]);

/** GET /dashboard?view=mine|delegated|people|category|trend (&team=, ranges and filters as the list) */
router.get('/', async (req, res) => {
  const who = await access.actor(req);
  const view = String(req.query.view || 'mine');
  const now = new Date();

  if (view === 'people' || view === 'employee') {
    if (!who.superAdmin && !who.adminTeams.size) {
      throw forbidden('The people view is for team owners and admins. Your own figures are on My report.');
    }
    const filter = await buildQuery(req, who.superAdmin && !req.query.team ? {} : { scope: 'team' }, { strictRange: true });
    let extra = [];
    if (!who.superAdmin) {
      const teamIds = req.query.team && who.adminTeams.has(String(req.query.team)) ? [String(req.query.team)] : [...who.adminTeams];
      const members = new Set();
      for (const id of teamIds) (await people.platform.teamMemberIds(id)).forEach((m) => members.add(String(m)));
      extra = [{ $match: { 'assignees.user': { $in: [...members].map((m) => new mongoose.Types.ObjectId(m)) } } }];
    }
    return res.json({ view: 'people', rows: await personRows(await groupPeople(filter, now, extra)) });
  }

  const filter = await buildQuery(req, {}, { strictRange: true });

  if (view === 'trend') {
    const grain = req.query.grain === 'month' ? 'month' : 'day';
    const rows = await Task.aggregate([
      { $match: { $and: [filter, { dueDate: { $ne: null } }] } },
      {
        $group: {
          _id: { $dateToString: { format: grain === 'month' ? '%Y-%m' : '%Y-%m-%d', date: '$dueDate', timezone: zoneOf(req) } },
          ...statsStage(now),
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 400 },
    ]);
    return res.json({ view, grain, rows: rows.map((r) => scoreRow(r, r._id, { key: r._id, bucket: r._id })) });
  }

  if (view === 'category') {
    const rows = await Task.aggregate([
      { $match: filter },
      { $group: { _id: { $ifNull: ['$category', ''] }, ...statsStage(now) } },
      { $sort: { total: -1 } },
      { $limit: 200 },
    ]);
    return res.json({
      view,
      rows: rows.map((r) => scoreRow(r, r._id || 'Uncategorised', { key: r._id || '', category: r._id || 'Uncategorised' })),
    });
  }

  if (view === 'delegated') {
    const rows = await groupPeople({ $and: [filter, { createdBy: req.user._id }] }, now);
    return res.json({ view, rows: await personRows(rows) });
  }

  // mine
  const rows = await groupPeople(filter, now, [{ $match: { 'assignees.user': req.user._id } }]);
  const [r] = rows;
  res.json({ view: 'mine', rows: r ? (await personRows([r])).map((row) => ({ ...row, label: 'You' })) : [] });
});

/** GET /dashboard/overdue — which tasks are late, and by how long. */
router.get('/overdue', async (req, res) => {
  const now = new Date();
  const filter = await buildQuery(req, {}, { strictRange: true });
  const rows = await Task.find({ $and: [filter, { status: { $in: DOING_STATUS }, dueDate: { $lt: now } }] })
    .select('code title category priority status dueDate assignees createdBy createdByName team')
    .sort({ dueDate: 1 })
    .limit(500)
    .lean();
  res.json({
    rows: rows.map((t) => ({
      ...t,
      daysLate: Math.floor((now - new Date(t.dueDate)) / 86400000),
      who: (t.assignees || []).map((a) => a.name).filter(Boolean).join(', '),
    })),
  });
});

module.exports = router;
