/**
 * WHO A WRITE IS NEWS TO, model by model (./plugin.js applies these; ./index.js
 * has the keys). Models with no rule here (sessions, activity logs, counters,
 * devices, files, digests…) never bump anything.
 *
 * A rule:
 *   shape(row)         the fields that decide who sees a row, as plain ids (a
 *                      loaded document remembers its shape, so a save that
 *                      takes somebody off it still reaches them)
 *   fields             the same fields as a projection, to read rows by id
 *   audience           paths that change who sees a row: an update touching
 *                      them reads the rows BEFORE the write as well
 *   ignore / watch     bookkeeping paths (a write touching only these bumps
 *                      nothing) / the only paths that matter (User)
 *   fromFilter(f)      rows the query's filter names on its own, so nothing
 *                      need be read (a person's own alerts)
 *   keysFor(rows, ctx) the keys to bump; may read (a team's admins, a task)
 *   bulk()             the keys when the rows can't be told (a sweep)
 *   seen(rows, ctx)    note what this request now knows, for later writes
 *
 * This file knows the task product's models by name on purpose: the platform
 * cannot require the product's model files without a cycle, and naming them
 * here keeps every "who sees what" decision for live updates in one place.
 * It mirrors product/services/access.js canSee and calendar.js audienceOf.
 */
const mongoose = require('mongoose');
const live = require('./index');

const { ALL_TASKS, ALL_PEOPLE, bulkKey, personal } = live;

/** An id as a string, from an id, a string or a populated document; null when empty. */
const id = (v) => {
  const s = String(v?._id ?? v ?? '');
  return s || null;
};
const ids = (list) => [...(list || [])].map(id).filter(Boolean);
const addAll = (set, list) => list.forEach((x) => x && set.add(String(x)));
const model = (name) => mongoose.models[name] || null;

/** The ids a filter value names plainly (`id`, `{ $eq: id }`, `{ $in: [...] }`), or null. */
function idsIn(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || value instanceof mongoose.Types.ObjectId || value._bsontype === 'ObjectId') return [String(value)];
  if (typeof value === 'object') {
    if (value.$eq !== undefined) return idsIn(value.$eq);
    if (Array.isArray(value.$in)) return value.$in.map((x) => id(x)).filter(Boolean);
    if (value._id) return [id(value)];
  }
  return null;
}

// ---------------------------------------------------------------- tasks

const TASK_FIELDS = 'createdBy approver assignedTo assignees.user loopUsers openTo originalAssignees team parentTask';

function taskShape(t) {
  return {
    _id: id(t._id),
    createdBy: id(t.createdBy),
    approver: id(t.approver),
    assignedTo: id(t.assignedTo),
    assignees: [...(t.assignees || [])].map((a) => ({ user: id(a?.user) })),
    loopUsers: ids(t.loopUsers),
    openTo: ids(t.openTo),
    originalAssignees: ids(t.originalAssignees),
    team: id(t.team),
    parentTask: id(t.parentTask),
  };
}

/**
 * A task is news to everyone who can see it (access.canSee): its setter,
 * approver, the people on it, in the loop, offered it, who first had it, and
 * the owners/admins of its team. A piece is news to whoever sees the task it
 * came from too (its row there moved). The Super Admin sees every task
 * (all:tasks). Its calendar moves for the setter and the people on it
 * (calendar.monthFeed); a remark on it moves nobody's calendar.
 */
async function taskKeys(rows, ctx, { calendar }) {
  const see = new Set();
  const cal = new Set();
  const teams = new Set();
  const visit = (t, own) => {
    const doers = t.assignees.map((a) => a.user);
    addAll(see, [t.createdBy, t.approver, t.assignedTo, ...doers, ...t.loopUsers, ...t.openTo, ...t.originalAssignees]);
    if (own && calendar) addAll(cal, [t.createdBy, ...doers]);
    if (t.team) teams.add(t.team);
  };
  for (const row of rows) {
    const t = taskShape(row);
    visit(t, true);
    for (const parent of await ctx.parentsOf(t)) visit(parent, false);
  }
  for (const team of teams) addAll(see, await ctx.overseers(team));
  return [ALL_TASKS, ...personal(see, 'tasks'), ...personal(cal, 'calendar')];
}

const Task = {
  shape: taskShape,
  fields: TASK_FIELDS,
  audience: new Set(['createdBy', 'approver', 'assignedTo', 'assignees', 'loopUsers', 'openTo', 'originalAssignees', 'team', 'parentTask']),
  // The jobs' own stamps (what was already reminded or announced) and the
  // claim counter a status move bumps before its real save.
  ignore: new Set(['firedReminders', 'remindFrom', 'repeatReminderAt', 'overdueNotifiedAt', 'rev']),
  seen: (rows, ctx) => ctx.knowTasks(rows),
  keysFor: (rows, ctx) => taskKeys(rows, ctx, { calendar: true }),
  bulk: () => [ALL_TASKS, bulkKey('tasks'), bulkKey('calendar')],
};

/** A line of a task's history (a remark, a move, an edit): news to whoever sees the task. */
const TaskUpdate = {
  fields: 'task',
  audience: new Set(['task']),
  fromFilter: (f) => idsIn(f.task)?.map((task) => ({ task })) || null,
  keysFor: async (rows, ctx) => taskKeys(await ctx.tasks(rows.map((r) => id(r.task))), ctx, { calendar: false }),
  bulk: () => [ALL_TASKS, bulkKey('tasks')],
};

/** A repeating schedule: its setter, the people on it, its team's owners/admins (routes/recurring maySee). */
const RecurringTask = {
  shape: (s) => ({ _id: id(s._id), createdBy: id(s.createdBy), assignees: ids(s.assignees), loopUsers: ids(s.loopUsers), team: id(s.team) }),
  fields: 'createdBy assignees loopUsers team',
  audience: new Set(['createdBy', 'assignees', 'loopUsers', 'team']),
  // The worker's five-minutely "looked at it" stamp.
  ignore: new Set(['lastRunAt']),
  async keysFor(rows, ctx) {
    const see = new Set();
    for (const row of rows) {
      const s = RecurringTask.shape(row);
      addAll(see, [s.createdBy, ...s.assignees, ...s.loopUsers]);
      if (s.team) addAll(see, await ctx.overseers(s.team));
    }
    return [ALL_TASKS, ...personal(see, 'tasks')];
  },
  bulk: () => [ALL_TASKS, bulkKey('tasks')],
};

// ---------------------------------------------------------------- calendar & alerts

/** A calendar reminder: its setter and whoever it is aimed at (calendar.audienceOf). */
const Reminder = {
  shape: (r) => ({ _id: id(r._id), createdBy: id(r.createdBy), scope: r.scope, recipients: ids(r.recipients), team: id(r.team) }),
  fields: 'createdBy scope recipients team',
  audience: new Set(['createdBy', 'scope', 'recipients', 'team']),
  // "It has rung": the alert it sent is the news, and that bumps alerts.
  ignore: new Set(['rungAt']),
  async keysFor(rows, ctx) {
    const people = new Set();
    let everyone = false;
    for (const row of rows) {
      const r = Reminder.shape(row);
      addAll(people, [r.createdBy]);
      if (r.scope === 'users') addAll(people, r.recipients);
      else if (r.scope === 'team' && r.team) addAll(people, await ctx.members(r.team));
      else if (r.scope === 'everyone') everyone = true;
    }
    return [...(everyone ? [bulkKey('calendar')] : []), ...personal(people, 'calendar')];
  },
  bulk: () => [bulkKey('calendar')],
};

/** An alert is news to the one person it is for. */
const Notification = {
  fields: 'user',
  audience: new Set(['user']),
  fromFilter: (f) => idsIn(f.user)?.map((user) => ({ user })) || null,
  keysFor: async (rows) => personal(rows.map((n) => id(n.user)), 'alerts'),
  bulk: () => [bulkKey('alerts')],
};

// ---------------------------------------------------------------- people

/** A contact link (or request): only its two people's lists change. */
const Contact = {
  fields: 'a b',
  audience: new Set(['a', 'b']),
  keysFor: async (rows) => personal(rows.flatMap((c) => [id(c.a), id(c.b)]), 'people'),
  bulk: () => [ALL_PEOPLE],
};

/**
 * A team: every screen of people (a team list, the Super Admin's console),
 * and its members' tasks too (who runs a team decides who sees its tasks, and
 * task rows carry its name).
 */
const Team = {
  shape: (t) => ({ _id: id(t._id), owner: id(t.owner), members: [...(t.members || [])].map((m) => ({ user: id(m?.user) })) }),
  fields: 'owner members.user',
  audience: new Set(['owner', 'members']),
  // Its owners/admins may have changed: read them afresh for the rest of the request.
  seen: (rows, ctx) => ctx.forgetTeams(rows),
  keysFor: async (rows) => [ALL_PEOPLE, ...personal(rows.flatMap((t) => [id(t.owner), ...[...(t.members || [])].map((m) => id(m?.user))]), 'tasks')],
  bulk: () => [ALL_PEOPLE, bulkKey('tasks')],
};

/**
 * A person, as others see them. Only these paths matter: never their
 * settings, logins, password or "last seen" (protect() stamps that all day).
 */
const User = {
  watch: new Set(['name', 'title', 'pin', 'status', 'deletedAt', 'photo']),
  keysFor: async () => [ALL_PEOPLE],
  bulk: () => [ALL_PEOPLE],
};

const RULES = { Task, TaskUpdate, RecurringTask, Reminder, Notification, Contact, Team, User };
for (const [name, rule] of Object.entries(RULES)) rule.name = name;

/** The rule for a model name, or null (most models). */
const ruleOf = (name) => (name && Object.hasOwn(RULES, name) ? RULES[name] : null);

// ---------------------------------------------------------------- shared lookups

/**
 * What one change's lookups share with the rest of its request: a task's
 * people (often saved a moment before its history line is written), a team's
 * owners/admins. `memo` is the request's (index.memo()).
 */
function context(memo) {
  const once = (key, load) => {
    if (!memo.has(key)) memo.set(key, load());
    return memo.get(key);
  };
  // exec(): a promise several lookups can share (a Query runs only once).
  const teamRow = (teamId) =>
    once(`team:${teamId}`, () => model('Team')?.findById(teamId).select('owner members').lean().exec() ?? Promise.resolve(null));
  const taskSlot = (taskId) => {
    if (!memo.has(`task:${taskId}`)) memo.set(`task:${taskId}`, []);
    return memo.get(`task:${taskId}`);
  };

  const ctx = {
    /** A team's active owners and admins (access.isOverseer). */
    async overseers(teamId) {
      const t = await teamRow(teamId);
      if (!t) return [];
      const runs = (t.members || []).filter((m) => m.status === 'active' && (m.role === 'owner' || m.role === 'admin'));
      return [id(t.owner), ...runs.map((m) => id(m.user))].filter(Boolean);
    },
    /** A team's active members (who a team reminder reaches). */
    async members(teamId) {
      const t = await teamRow(teamId);
      return (t?.members || []).filter((m) => m.status === 'active').map((m) => id(m.user)).filter(Boolean);
    },
    /** Tasks' shapes by id: what this request already saw, else one read. */
    async tasks(list) {
      const want = [...new Set(list.filter(Boolean).map(String))];
      const missing = want.filter((x) => !memo.has(`task:${x}`));
      if (missing.length && model('Task')) {
        const found = await model('Task').find({ _id: { $in: missing } }).select(TASK_FIELDS).lean();
        missing.forEach(taskSlot);
        found.forEach((row) => taskSlot(id(row._id)).push(taskShape(row)));
      }
      return want.flatMap((x) => memo.get(`task:${x}`) || []);
    },
    /** Remember tasks' shapes (a save, a fresh read) for the rest of the request. */
    knowTasks(rows) {
      rows.map(taskShape).forEach((t) => t._id && taskSlot(t._id).push(t));
    },
    /** The tasks a piece came from, up the chain. */
    async parentsOf(t) {
      const out = [];
      let next = t.parentTask ? [t.parentTask] : [];
      for (let hop = 0; hop < 3 && next.length; hop += 1) {
        const rows = await ctx.tasks(next);
        out.push(...rows);
        next = [...new Set(rows.map((r) => r.parentTask).filter(Boolean))];
      }
      return out;
    },
    forgetTeams(rows) {
      rows.forEach((t) => memo.delete(`team:${id(t._id)}`));
    },
    /** Rows by id as they are NOW (after a write), with the rule's fields. */
    async rows(rule, list) {
      const M = model(rule.name);
      if (!M || !rule.fields) return list.map((x) => ({ _id: x }));
      const found = await M.find({ _id: { $in: list } }).select(rule.fields).lean();
      rule.seen?.(found, ctx);
      return found;
    },
  };
  return ctx;
}

module.exports = { RULES, ruleOf, context, idsIn, taskShape };
