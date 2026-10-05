/**
 * Task Pro, as the platform sees it: its name, settings, file rules, routes,
 * and the hooks the platform calls (sign-up, file access, team deletion, the
 * Super Admin console's numbers, background jobs).
 *
 * Only models and settings are loaded up front; routes and services load
 * lazily so the platform can require this file without a cycle.
 */
const mongoose = require('mongoose');
const settings = require('./settings');
const Task = require('./models/Task');
const TaskUpdate = require('./models/TaskUpdate');
const RecurringTask = require('./models/RecurringTask');
const TaskTemplate = require('./models/TaskTemplate');
const TaskCategory = require('./models/TaskCategory');
require('./models/TaskDigest');
const { STATUS, OPEN_STATUS, DOING_STATUS, ACCEPTANCE } = require('./config');

const oid = (id) => new mongoose.Types.ObjectId(String(id));

module.exports = {
  key: 'taskpro',
  name: 'Task Pro',

  settings,

  files: {
    maxBytes: 25 * 1024 * 1024,
    types: [
      /^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/,
      /^application\/pdf$/,
      /^application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint)$/,
      /^application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)$/,
      /^text\/(plain|csv)$/,
      /^audio\/(m4a|x-m4a|mp4|aac|mpeg|ogg|webm|wav|x-wav|amr|3gpp)$/,
      /^video\/(mp4|quicktime|webm|3gpp)$/,
    ],
    typesMessage: "This file type can't be attached",
  },

  mountRoutes(app) {
    app.use('/api/tasks', require('./routes'));
  },

  /** A new person starts with one task that shows them how it works. */
  async onUserCreated({ user }) {
    if (!user || user.role === 'superadmin') return;
    const task = await Task.create({
      title: 'Welcome to Task Pro: share your Task Pin',
      description:
        'Share your Task Pin with the people you work with and add theirs from Contacts. ' +
        'Create a team to give tasks to everyone in it. Mark this done when you have added your first contact.',
      createdBy: user._id,
      createdByName: user.name,
      assignees: [{ user: user._id, name: user.name, status: STATUS.PENDING }],
      requiresApproval: false,
      reminders: [],
    });
    await TaskUpdate.create({ task: task._id, kind: 'CREATED', byName: 'Task Pro', to: task.status, note: 'Welcome aboard.', system: true });
  },

  /** May this person open a file attached to `ref`? (Uploader and Super Admin are let in by the platform.) */
  async canAccessFile({ user, ref }) {
    const access = require('./services/access');
    const who = await access.actorFor(user);
    const sees = async (task) => !!task && !task.archived && (access.canSee(who, task) || (await access.canSeeThroughParent(who, task)));
    if (ref?.kind === 'task') {
      return sees(await Task.findById(ref.id).select(access.VISIBILITY_FIELDS).lean());
    }
    if (ref?.kind === 'recurring') {
      const s = await RecurringTask.findById(ref.id).select('createdBy assignees team').lean();
      if (!s) return false;
      if (who.superAdmin || String(s.createdBy) === who.id || (s.assignees || []).some((u) => String(u) === who.id)) return true;
      if (s.team && who.adminTeams.has(String(s.team))) return true;
      const tasks = await Task.find({ recurringTask: s._id, archived: { $ne: true } }).select(access.VISIBILITY_FIELDS).limit(200).lean();
      for (const t of tasks) if (await sees(t)) return true;
    }
    return false;
  },

  /** Platform-wide task numbers for the Super Admin overview. */
  async platformTotals() {
    const now = new Date();
    const live = { archived: { $ne: true } };
    const [total, open, overdue, inReview, completed] = await Promise.all([
      Task.countDocuments(live),
      Task.countDocuments({ ...live, status: { $in: OPEN_STATUS } }),
      Task.countDocuments({ ...live, status: { $in: DOING_STATUS }, dueDate: { $lt: now } }),
      Task.countDocuments({ ...live, status: STATUS.SUBMITTED }),
      Task.countDocuments({ ...live, status: STATUS.COMPLETED }),
    ]);
    return { total, open, overdue, inReview, completed };
  },

  /**
   * Per person: `open` (on them and not done or refused), `given` (open tasks
   * they set for someone else), `overdue` (on them and late).
   */
  async userStats(userIds) {
    const ids = (userIds || []).map(oid);
    const map = new Map(ids.map((id) => [String(id), { open: 0, given: 0, overdue: 0 }]));
    if (!ids.length) return map;
    const now = new Date();
    const [onThem, given] = await Promise.all([
      Task.aggregate([
        { $match: { archived: { $ne: true }, status: { $in: OPEN_STATUS }, 'assignees.user': { $in: ids } } },
        { $unwind: '$assignees' },
        { $match: { 'assignees.user': { $in: ids }, 'assignees.status': { $in: OPEN_STATUS }, 'assignees.acceptance': { $ne: ACCEPTANCE.REJECTED } } },
        {
          $group: {
            _id: '$assignees.user',
            open: { $sum: 1 },
            overdue: {
              $sum: { $cond: [{ $and: [{ $in: ['$assignees.status', DOING_STATUS] }, { $ne: [{ $ifNull: ['$dueDate', null] }, null] }, { $lt: ['$dueDate', now] }] }, 1, 0] },
            },
          },
        },
      ]),
      Task.aggregate([
        { $match: { archived: { $ne: true }, status: { $in: OPEN_STATUS }, createdBy: { $in: ids } } },
        { $match: { $expr: { $gt: [{ $size: { $filter: { input: '$assignees', as: 'a', cond: { $ne: ['$$a.user', '$createdBy'] } } } }, 0] } } },
        { $group: { _id: '$createdBy', given: { $sum: 1 } } },
      ]),
    ]);
    for (const r of onThem) Object.assign(map.get(String(r._id)), { open: r.open, overdue: r.overdue });
    for (const r of given) map.get(String(r._id)).given = r.given;
    return map;
  },

  /** A team was deleted: its tasks, schedules and templates are no longer filed under it. */
  async onTeamDeleted(teamId) {
    const team = oid(teamId);
    await Promise.all([
      Task.updateMany({ team }, { $set: { team: null } }),
      RecurringTask.updateMany({ team }, { $set: { team: null } }),
      // A shared template goes back to whoever made it.
      TaskTemplate.updateMany({ team }, { $set: { team: null } }),
    ]);
    // Team categories become their creator's own (or go, if they already have one by that name).
    const cats = await TaskCategory.find({ team });
    for (const c of cats) {
      c.team = null;
      c.scope = TaskCategory.scopeOf(null, c.createdBy);
      try {
        await c.save();
      } catch (err) {
        if (err?.code !== 11000) throw err;
        await TaskCategory.deleteOne({ _id: c._id });
      }
    }
  },

  startJobs() {
    require('./jobs').startJobs();
  },

  /** The job ticks, for tests and one-off runs (each takes an optional `now`). */
  get jobs() {
    return require('./jobs');
  },
  tick: (now) => require('./jobs').tick(now),
  recurringTick: (now) => require('./jobs').recurringTick(now),
  reminderTick: (now) => require('./jobs').reminderTick(now),
  overdueTick: (now) => require('./jobs').overdueTick(now),
  digestTick: (now) => require('./jobs').digestTick(now),
};
