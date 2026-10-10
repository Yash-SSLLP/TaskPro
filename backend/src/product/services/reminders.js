/**
 * Chasing, so nobody has to:
 *
 *   1. before/after rules fire once each (claimed on `firedReminders`);
 *   2. nothing older than FIRING_WINDOW_MIN fires at all (a server that was
 *      down overnight does not deliver yesterday's reminders at breakfast);
 *   3. "after" reminders also go to the setter and the loop;
 *   4. repeating rules ("every 2 hours until done") beat on the clock, claimed
 *      on `repeatReminderAt`, and stop once it is done;
 *   5. the deadline passing is announced once to both sides;
 *   6. a daily digest at each person's `dailyDigestAt`, if they want one.
 *
 * Times are the task setter's zone (the recipient's for digests). Switched-off
 * people are never chased. EMAIL goes by SMTP when configured, else as an app alert.
 */
const Task = require('../models/Task');
const TaskDigest = require('../models/TaskDigest');
const User = require('../../platform/models/User');
const { sendMail, mailEnabled } = require('../../platform/services/mailer');
const notify = require('./notify');
const engine = require('./engine');
const recurrence = require('./recurrence');
const {
  STATUS, DOING_STATUS, ACCEPTANCE, REMINDER_WHEN, REMINDER_CHANNEL, REMINDER_PATTERN, REPEAT_REMINDER, DEFAULT_REMIND_AT,
  reminderOffsetMinutes, reminderKey, reminderLabel, statusLabel, reminderPattern, reminderWindow, repeatEveryMinutes, hhmmOf, idOf,
} = require('../config');
const { dayKey, addDaysKey, atZone, minutesOf, hhmmFromMinutes, fmtDateTime, settingsOf } = require('./time');

const FIRING_WINDOW_MIN = 90;
const MIN = 60 * 1000;

/** id → settings for the setters of these tasks (and whether they are active). */
async function settersOf(tasks) {
  const ids = [...new Set(tasks.map((t) => idOf(t.createdBy)).filter(Boolean))];
  const users = await User.find({ _id: { $in: ids } }).select('settings').lean();
  return new Map(users.map((u) => [String(u._id), settingsOf(u)]));
}

const tzFor = (setters, task) => (setters.get(idOf(task.createdBy)) || settingsOf(null)).timezone;

/** Only people whose accounts are on. */
async function activeOnly(ids) {
  const list = [...new Set(ids.map(String))];
  if (!list.length) return [];
  const users = await User.find({ _id: { $in: list }, status: 'active' }).select('_id').lean();
  const ok = new Set(users.map((u) => String(u._id)));
  return list.filter((id) => ok.has(id));
}

/** Email when SMTP is set up (and they have an address); otherwise an app alert. */
async function deliver(task, to, { title, body }, channel) {
  const list = await activeOnly(to);
  if (!list.length) return;
  if (channel === REMINDER_CHANNEL.EMAIL && mailEnabled()) {
    const users = await User.find({ _id: { $in: list } }).select('name email').lean();
    const noEmail = [];
    for (const u of users) {
      if (!u.email) {
        noEmail.push(String(u._id));
        continue;
      }
      const text = `Hi ${u.name},\n\n${body}\n\n${notify.taskName(task)}${task.description ? `\n\n${String(task.description).slice(0, 500)}` : ''}` +
        `\n\n— Sent by ${require('..').name}`;
      await sendMail({ to: u.email, subject: title, text });
    }
    if (noEmail.length) await notify.reminder(task, noEmail, { title, body });
    return;
  }
  await notify.reminder(task, list, { title, body });
}

/** People still doing it: not handed in, finished or refused. */
const stillDoing = (task) =>
  (task.assignees || [])
    .filter((a) => DOING_STATUS.includes(a.status) && a.acceptance !== ACCEPTANCE.REJECTED)
    .map((a) => idOf(a.user));

/** A day-shaped repeating rule as a schedule, so "alternate days" etc. use the recurrence maths. */
function asSchedule(rule, anchorMs) {
  const pattern = reminderPattern(rule);
  return {
    frequency: pattern === REMINDER_PATTERN.WEEKLY ? 'WEEKLY' : pattern === REMINDER_PATTERN.MONTHLY ? 'MONTHLY' : 'DAILY',
    interval: Math.max(1, Math.round(Number(rule.amount) || 1)),
    weekdays: rule.weekdays,
    monthlyMode: rule.monthlyMode,
    monthDay: rule.monthDay,
    nthWeek: rule.nthWeek,
    weekday: rule.weekday,
    startDate: new Date(anchorMs),
  };
}

/** Every beat a rule has on one local day, as instants. */
function beatsOn(rule, key, anchorMs, tz) {
  if (reminderPattern(rule) === REMINDER_PATTERN.HOURLY) {
    const w = reminderWindow(rule);
    const every = repeatEveryMinutes(rule);
    const out = [];
    for (let m = minutesOf(w.from); m <= minutesOf(w.to); m += every) out.push(atZone(key, hhmmFromMinutes(m), tz).getTime());
    return out;
  }
  if (!recurrence.fallsOn(asSchedule(rule, anchorMs), key, tz)) return [];
  return [atZone(key, hhmmOf(rule.at) || DEFAULT_REMIND_AT, tz).getTime()];
}

/** The latest beat at or before now (today or yesterday), never within 30 min of the task appearing. */
function latestBeat(rule, anchorMs, nowMs, tz) {
  if (!Number.isFinite(anchorMs)) return null;
  const floor = anchorMs + REPEAT_REMINDER.minMinutes * MIN;
  const today = dayKey(new Date(nowMs), tz);
  for (const key of [today, addDaysKey(today, -1)]) {
    const due = beatsOn(rule, key, anchorMs, tz).filter((at) => at <= nowMs && at >= floor);
    if (due.length) return { at: Math.max(...due) };
  }
  return null;
}

/** When a repeating rule has said all it usefully can. */
function beatsStopAt(rule, dueMs, tz) {
  if (reminderPattern(rule) !== REMINDER_PATTERN.HOURLY) return dueMs + REPEAT_REMINDER.dayPatternStopAfterDueMinutes * MIN;
  const endOfDueDay = atZone(dayKey(new Date(dueMs), tz), reminderWindow(rule).to, tz).getTime();
  return Math.max(dueMs, endOfDueDay);
}

const claimKey = async (taskId, key) =>
  (await Task.updateOne({ _id: taskId, firedReminders: { $ne: key } }, { $addToSet: { firedReminders: key } })).modifiedCount > 0;

/** Send one before/after rule. */
async function fire(task, rule, tz) {
  const doers = stillDoing(task);
  const when = reminderLabel(rule);
  const name = notify.taskName(task);
  const due = fmtDateTime(task.dueDate, tz);
  const after = rule.when === REMINDER_WHEN.AFTER;
  if (doers.length) {
    await deliver(task, doers, after
      ? { title: `Overdue: ${name}`, body: `This task was due ${due} and is still ${statusLabel(task.status).toLowerCase()}.` }
      : { title: `Reminder: ${name}`, body: `Due ${due} (${when}).` }, rule.channel);
  }
  if (after) {
    const overseers = [...new Set([idOf(task.createdBy), ...(task.loopUsers || []).map(idOf)].filter(Boolean))].filter((id) => !doers.includes(id));
    const who = (task.assignees || []).map((a) => a.name).filter(Boolean).join(', ');
    await deliver(task, overseers, { title: `Still not done: ${name}`, body: `Due ${due}${who ? ` · ${who}` : ''}.` }, rule.channel);
  }
  await engine.systemUpdate(task._id, `Reminder sent: ${when}${rule.channel === REMINDER_CHANNEL.EMAIL ? ' (email)' : ''}.`);
}

/** One beat of a repeating rule (no feed row: it would bury what people said). */
async function fireRepeat(task, rule, tz, nowMs) {
  const to = stillDoing(task);
  if (!to.length) return false;
  const late = task.dueDate && new Date(task.dueDate).getTime() < nowMs;
  const body = task.dueDate
    ? late ? `Still not done: it was due ${fmtDateTime(task.dueDate, tz)}.` : `Still to do: due ${fmtDateTime(task.dueDate, tz)}.`
    : 'Still to do.';
  await deliver(task, to, { title: `Reminder: ${notify.taskName(task)}`, body }, rule.channel);
  return true;
}

/** Rules 1-4. @returns {Promise<number>} reminders sent */
async function reminderTick(now = new Date()) {
  let sent = 0;
  const nowMs = now.getTime();
  const tasks = await Task.find({
    status: { $in: DOING_STATUS },
    archived: { $ne: true },
    'reminders.0': { $exists: true },
    $or: [{ dueDate: { $ne: null } }, { 'reminders.when': REMINDER_WHEN.EVERY }],
  })
    .select('code title description status dueDate reminders firedReminders assignees createdBy loopUsers remindFrom repeatReminderAt startDate createdAt')
    .limit(5000)
    .lean();
  const setters = await settersOf(tasks);

  for (const task of tasks) {
    const tz = tzFor(setters, task);
    const due = task.dueDate ? new Date(task.dueDate).getTime() : null;
    for (const rule of task.reminders || []) {
      try {
        if (rule.when === REMINDER_WHEN.EVERY) {
          const anchor = new Date(task.remindFrom || task.startDate || task.createdAt).getTime();
          const beat = latestBeat(rule, anchor, nowMs, tz);
          if (!beat) continue;
          if (task.repeatReminderAt && new Date(task.repeatReminderAt).getTime() >= beat.at) continue;
          if (due && beat.at > beatsStopAt(rule, due, tz)) continue;
          if (nowMs - beat.at > FIRING_WINDOW_MIN * MIN) continue;
          const won = await Task.updateOne(
            { _id: task._id, $or: [{ repeatReminderAt: { $lt: new Date(beat.at) } }, { repeatReminderAt: null }] },
            { $set: { repeatReminderAt: new Date(beat.at) } }
          );
          if (won.modifiedCount && (await fireRepeat(task, rule, tz, nowMs))) sent += 1;
          continue;
        }
        if (!due) continue;
        const key = reminderKey(rule);
        if ((task.firedReminders || []).includes(key)) continue;
        const at = due + reminderOffsetMinutes(rule) * MIN;
        if (at > nowMs) continue;
        if ((nowMs - at) / MIN > FIRING_WINDOW_MIN) {
          await claimKey(task._id, key); // too old to be useful: burn it silently
          continue;
        }
        if (!(await claimKey(task._id, key))) continue;
        await fire(task, rule, tz);
        sent += 1;
      } catch (err) {
        console.warn(`[jobs] reminder ${task._id}:`, err.message);
      }
    }
  }
  return sent;
}

/**
 * Rule 5. Anything that went overdue longer ago than the window is stamped
 * silently; what crossed its deadline inside it is claimed and announced.
 */
async function overdueTick(now = new Date()) {
  let told = 0;
  const cutoff = new Date(now.getTime() - FIRING_WINDOW_MIN * MIN);
  await Task.updateMany(
    { status: { $in: DOING_STATUS }, archived: { $ne: true }, dueDate: { $lt: cutoff }, overdueNotifiedAt: null },
    { $set: { overdueNotifiedAt: now } }
  );
  const fresh = await Task.find({
    status: { $in: DOING_STATUS },
    archived: { $ne: true },
    dueDate: { $gte: cutoff, $lte: now },
    overdueNotifiedAt: null,
  })
    .select('code title status dueDate assignees createdBy approver')
    .limit(1000)
    .lean();
  const setters = await settersOf(fresh);
  for (const task of fresh) {
    const won = await Task.updateOne({ _id: task._id, overdueNotifiedAt: null }, { $set: { overdueNotifiedAt: now } });
    if (!won.modifiedCount) continue;
    try {
      const tz = tzFor(setters, task);
      const active = new Set(await activeOnly([...(task.assignees || []).map((a) => idOf(a.user)), idOf(task.createdBy), idOf(task.approver)]));
      await notify.becameOverdue({
        ...task,
        assignees: (task.assignees || []).filter((a) => active.has(idOf(a.user))),
        createdBy: active.has(idOf(task.createdBy)) ? task.createdBy : null,
        approver: active.has(idOf(task.approver)) ? task.approver : null,
      }, tz);
      await engine.systemUpdate(task._id, `Now overdue: it was due ${fmtDateTime(task.dueDate, tz)}. Everybody on it was told.`, 'OVERDUE');
      told += 1;
    } catch (err) {
      console.warn(`[jobs] overdue ${task._id}:`, err.message);
    }
  }
  return told;
}

/**
 * Rule 6: one summary per person, at their `dailyDigestAt` in their zone
 * (never more than the window late), claimed per person per day.
 */
async function digestTick(now = new Date()) {
  const users = await User.find({ role: 'user', status: 'active' }).select('settings').lean();
  const due = [];
  for (const u of users) {
    const s = settingsOf(u);
    if (!s.dailyDigest) continue;
    const day = dayKey(now, s.timezone);
    const at = atZone(day, s.dailyDigestAt, s.timezone);
    const lateBy = (now.getTime() - at.getTime()) / MIN;
    if (lateBy < 0 || lateBy > FIRING_WINDOW_MIN) continue;
    due.push({ id: u._id, key: `${u._id}:${day}` });
  }
  if (!due.length) return 0;

  const claimed = [];
  for (const d of due) {
    try {
      await TaskDigest.create({ _id: d.key, at: now });
      claimed.push(d.id);
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  if (!claimed.length) return 0;

  const [doing, review] = await Promise.all([
    Task.aggregate([
      { $match: { archived: { $ne: true }, status: { $in: DOING_STATUS }, 'assignees.user': { $in: claimed } } },
      { $unwind: '$assignees' },
      { $match: { 'assignees.user': { $in: claimed }, 'assignees.status': { $in: DOING_STATUS }, 'assignees.acceptance': { $ne: ACCEPTANCE.REJECTED } } },
      {
        $group: {
          _id: '$assignees.user',
          pending: { $sum: 1 },
          overdue: { $sum: { $cond: [{ $and: [{ $ne: [{ $ifNull: ['$dueDate', null] }, null] }, { $lt: ['$dueDate', now] }] }, 1, 0] } },
        },
      },
    ]),
    Task.aggregate([
      { $match: { archived: { $ne: true }, status: STATUS.SUBMITTED, approver: { $in: claimed } } },
      { $match: { $expr: { $not: [{ $in: ['$approver', { $ifNull: ['$assignees.user', []] }] }] } } },
      { $group: { _id: '$approver', inReview: { $sum: 1 } } },
    ]),
  ]);
  const counts = new Map();
  for (const r of doing) counts.set(String(r._id), { pending: r.pending, overdue: r.overdue });
  for (const r of review) counts.set(String(r._id), { ...(counts.get(String(r._id)) || {}), inReview: r.inReview });

  let sent = 0;
  for (const id of claimed) {
    const c = counts.get(String(id));
    if (c && (await notify.digest(id, { pending: c.pending || 0, overdue: c.overdue || 0, inReview: c.inReview || 0 }))) sent += 1;
  }
  return sent;
}

module.exports = {
  FIRING_WINDOW_MIN,
  reminderTick,
  overdueTick,
  digestTick,
  latestBeat,
  beatsStopAt,
};
