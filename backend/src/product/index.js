/**
 * KARO, as the platform sees it: its name, settings, file rules, routes,
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
require('./models/Reminder');
const { STATUS, OPEN_STATUS, DOING_STATUS, ACCEPTANCE } = require('./config');

const oid = (id) => new mongoose.Types.ObjectId(String(id));

module.exports = {
  key: 'taskpro',
  name: 'KARO',

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
    app.use('/api/reminders', require('./routes/reminders'));
    app.use('/api/calendar', require('./routes/calendar'));
  },

  /** A new person starts with one task that shows them how it works. */
  async onUserCreated({ user }) {
    if (!user || user.role === 'superadmin') return;
    const task = await Task.create({
      title: 'Welcome to KARO: share your Task Pin',
      description:
        'Share your Task Pin with the people you work with and add theirs from Contacts. ' +
        'Create a team to give tasks to everyone in it. Mark this done when you have added your first contact.',
      createdBy: user._id,
      createdByName: user.name,
      assignees: [{ user: user._id, name: user.name, status: STATUS.PENDING }],
      requiresApproval: false,
      reminders: [],
    });
    await TaskUpdate.create({ task: task._id, kind: 'CREATED', byName: 'KARO', to: task.status, note: 'Welcome aboard.', system: true });
  },

  /** May this person open a file attached to `ref`? (Uploader and Super Admin are let in by the platform.) */
  async canAccessFile({ user, ref }) {
    // Profile photos are seen wherever people are listed: anyone signed in.
    if (ref?.kind === 'avatar') return true;
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

  /** A team was deleted: its tasks, schedules, templates and reminders are no longer filed under it. */
  async onTeamDeleted(teamId) {
    const team = oid(teamId);
    await Promise.all([
      Task.updateMany({ team }, { $set: { team: null } }),
      RecurringTask.updateMany({ team }, { $set: { team: null } }),
      // A shared template goes back to whoever made it.
      TaskTemplate.updateMany({ team }, { $set: { team: null } }),
      require('./services/calendar').onTeamDeleted(team),
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

  /**
   * A person deleted their account. Tasks and schedules only they were on go
   * for good, files and all, as do their own templates and categories. Work
   * shared with others stays, with their name replaced by `deletedName`.
   */
  async onUserDeleted({ user, deletedName }) {
    const { deleteFiles } = require('../platform/services/files');
    const engine = require('./services/engine');
    const me = user._id;
    const onlyMe = (field) => ({ [field]: { $not: { $elemMatch: { $ne: me } } } });
    const fileOf = (f) => String(f.file || f.storagePath);

    // Schedules nobody else is on are deleted; the rest stop (they were theirs to run).
    const soloSchedules = await RecurringTask.find({ createdBy: me, ...onlyMe('assignees'), ...onlyMe('loopUsers') }).select('_id voiceNote').lean();
    const soloScheduleIds = soloSchedules.map((s) => s._id);
    await RecurringTask.deleteMany({ _id: { $in: soloScheduleIds } });
    await RecurringTask.updateMany({ createdBy: me }, { $set: { isActive: false, createdByName: deletedName } });
    await RecurringTask.updateMany({ $or: [{ assignees: me }, { loopUsers: me }] }, { $pull: { assignees: me, loopUsers: me } });

    // Tasks nobody else is on (and no piece of theirs went to someone else).
    const soloFilter = {
      createdBy: me,
      assignees: { $not: { $elemMatch: { user: { $ne: me } } } },
      ...onlyMe('loopUsers'),
      ...onlyMe('openTo'),
      ...onlyMe('originalAssignees'),
    };
    let solo = await Task.find(soloFilter).select('_id parentTask attachments voiceNote recurringTask').lean();
    const shared = await Task.distinct('parentTask', { parentTask: { $in: solo.map((t) => t._id) }, _id: { $nin: solo.map((t) => t._id) } });
    const keepParents = new Set(shared.map(String));
    solo = solo.filter((t) => !keepParents.has(String(t._id)));
    const soloIds = solo.map((t) => t._id);

    if (soloIds.length) {
      // A voice note recorded on a schedule that lives on stays with the schedule.
      const liveVoice = new Set(
        (await RecurringTask.find({ _id: { $in: solo.map((t) => t.recurringTask).filter(Boolean) } }).select('voiceNote').lean())
          .map((s) => s.voiceNote?.storagePath)
          .filter(Boolean)
      );
      const updates = await TaskUpdate.find({ task: { $in: soloIds } }).select('files voiceNote').lean();
      const fileIds = [
        ...solo.flatMap((t) => [
          ...(t.attachments || []).map(fileOf),
          ...(t.voiceNote?.storagePath && !liveVoice.has(t.voiceNote.storagePath) ? [fileOf(t.voiceNote)] : []),
        ]),
        ...updates.flatMap((u) => [...(u.files || []).map(fileOf), ...(u.voiceNote ? [fileOf(u.voiceNote)] : [])]),
        ...soloSchedules.filter((s) => s.voiceNote).map((s) => fileOf(s.voiceNote)),
      ];
      await TaskUpdate.deleteMany({ task: { $in: soloIds } });
      await Task.deleteMany({ _id: { $in: soloIds } });
      await deleteFiles([...new Set(fileIds)]);
      const parents = [...new Set(solo.map((t) => t.parentTask).filter(Boolean).map(String))];
      for (const p of parents) await engine.recomputeParent(p).catch(() => {});
    }

    // Their reminders go, and they leave everyone else's.
    await require('./services/calendar').onUserDeleted(me);

    // What stays reads "Deleted user".
    await Promise.all([
      Task.updateMany({ createdBy: me }, { $set: { createdByName: deletedName } }),
      Task.updateMany({ approver: me }, { $set: { approverName: deletedName } }),
      Task.updateMany({ 'assignees.user': me }, { $set: { 'assignees.$[a].name': deletedName } }, { arrayFilters: [{ 'a.user': me }] }),
      TaskUpdate.updateMany({ by: me }, { $set: { byName: deletedName } }),
      TaskTemplate.deleteMany({ createdBy: me, team: null }),
      TaskTemplate.updateMany({ createdBy: me }, { $set: { createdByName: deletedName } }),
      TaskCategory.deleteMany({ scope: TaskCategory.scopeOf(null, me) }),
      TaskCategory.updateMany({ createdBy: me }, { $set: { createdByName: deletedName } }),
    ]);
  },

  startJobs() {
    require('./jobs').startJobs();
  },

  /**
   * A cheap catch-up the platform runs while people use the app (the unread
   * count both apps poll). On a host that never runs startJobs (Vercel calls
   * the app per request), this is what makes calendar reminders ring on time.
   */
  catchUp: (now) => require('./jobs').catchUp(now),

  /** The job ticks, for tests and one-off runs (each takes an optional `now`). */
  get jobs() {
    return require('./jobs');
  },
  tick: (now) => require('./jobs').tick(now),
  recurringTick: (now) => require('./jobs').recurringTick(now),
  reminderTick: (now) => require('./jobs').reminderTick(now),
  overdueTick: (now) => require('./jobs').overdueTick(now),
  digestTick: (now) => require('./jobs').digestTick(now),
  calendarTick: (now) => require('./jobs').calendarTick(now),
};
