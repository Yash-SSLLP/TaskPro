/**
 * Raising the occurrences of a repeating task.
 *
 * All date maths is by day key in the SETTER's time zone. An occurrence
 * appears at the setter's workday start on its day (or an hour before it is
 * due, if that is earlier), `leadDays` early for monthly/yearly ones. Nothing
 * is raised due before `mintFrom`, a sleeping schedule catches up at most
 * CATCHUP_DAYS, and the unique (recurringTask, occurrenceKey) index makes
 * every raise idempotent. A daily occurrence is routine: raised already
 * taken on, with no review.
 */
const RecurringTask = require('../models/RecurringTask');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const User = require('../../platform/models/User');
const notify = require('./notify');
const people = require('./people');
const {
  FREQUENCY, STATUS, ACCEPTANCE, MONTHLY_MODE, DEFAULT_LEAD_DAYS, MAX_LEAD_DAYS, MAX_DAY_INTERVAL, isRoutineFrequency,
} = require('../config');
const { dayKey, addDaysKey, daysBetween, partsOf, atZone, settingsOf, DAY_MS } = require('./time');

const CATCHUP_DAYS = 7;
const LOOKAHEAD_DAYS = 400;

/** The setter's zone and workday start, which every schedule calculation uses. */
const zoneFromUser = (user) => {
  const s = settingsOf(user);
  return { tz: s.timezone, start: s.workdayStart };
};

async function zoneOfSchedule(schedule) {
  const setter = await User.findById(schedule.createdBy).select('name settings status').lean();
  return { ...zoneFromUser(setter), setter };
}

function leadDaysOf(schedule) {
  const n = Number(schedule?.leadDays);
  if (Number.isFinite(n) && n >= 0) return Math.min(MAX_LEAD_DAYS, Math.round(n));
  return DEFAULT_LEAD_DAYS[schedule?.frequency] ?? 0;
}

const intervalOf = (s) => Math.min(MAX_DAY_INTERVAL, Math.max(1, Math.round(Number(s?.interval) || 1)));

/** Does the schedule fall due on local day `key`? */
function fallsOn(schedule, key, tz) {
  const startKey = schedule.startDate ? dayKey(schedule.startDate, tz) : null;
  if (startKey && key < startKey) return false;
  const anchorKey = startKey || key;
  const p = partsOf(key);
  switch (schedule.frequency) {
    case FREQUENCY.DAILY:
      return daysBetween(anchorKey, key) % intervalOf(schedule) === 0;
    case FREQUENCY.WEEKLY: {
      const days = schedule.weekdays?.length ? schedule.weekdays.map(Number) : [partsOf(anchorKey).dow];
      return days.includes(p.dow);
    }
    case FREQUENCY.MONTHLY: {
      const wd = Number(schedule.weekday);
      if (schedule.monthlyMode === MONTHLY_MODE.WEEKDAY && Number.isInteger(wd) && wd >= 0 && wd <= 6) {
        if (p.dow !== wd) return false;
        const nth = Number(schedule.nthWeek) || 1;
        return nth === -1 ? p.d + 7 > p.last : Math.ceil(p.d / 7) === nth;
      }
      const want = Number(schedule.monthDay) || partsOf(anchorKey).d;
      return p.d === Math.min(want, p.last);
    }
    case FREQUENCY.YEARLY: {
      const sp = partsOf(anchorKey);
      const wantM = Number(schedule.month) || sp.m;
      const wantD = Number(schedule.monthDay) || sp.d;
      return p.m === wantM && p.d === Math.min(wantD, new Date(Date.UTC(p.y, wantM, 0)).getUTCDate());
    }
    default:
      return false;
  }
}

/** When the occurrence due on `key` shows up in the doer's list. */
function appearAt(schedule, key, zone) {
  const due = atZone(key, schedule.time, zone.tz);
  const lead = leadDaysOf(schedule);
  const morning = atZone(addDaysKey(key, -lead), zone.start, zone.tz);
  const hourBefore = new Date(due.getTime() - 60 * 60 * 1000);
  return lead === 0 && hourBefore < morning ? hourBefore : morning;
}

/** The next occurrence at or after `from` (not before mintFrom), or null. */
function nextOccurrence(schedule, from, zone, { skipKeys = null } = {}) {
  const startKey = dayKey(schedule.startDate || from, zone.tz);
  const fromKey = dayKey(from, zone.tz);
  let key = startKey > fromKey ? startKey : fromKey;
  const untilKey = schedule.until ? dayKey(schedule.until, zone.tz) : null;
  const floor = schedule.mintFrom ? new Date(schedule.mintFrom) : null;
  for (let i = 0; i < LOOKAHEAD_DAYS; i += 1, key = addDaysKey(key, 1)) {
    if (untilKey && key > untilKey) return null;
    if (!fallsOn(schedule, key, zone.tz)) continue;
    if (skipKeys && skipKeys.has(key)) continue;
    const dueAt = atZone(key, schedule.time, zone.tz);
    if (dueAt < from || (floor && dueAt < floor)) continue;
    return { key, dueAt, appearAt: appearAt(schedule, key, zone) };
  }
  return null;
}

/** Raise one occurrence. Null if it already exists or everyone on it is switched off. */
async function mintOccurrence(schedule, dueDate, { key, appear, now = new Date(), setter }) {
  const off = await people.disabledSet([...(schedule.assignees || []), ...(schedule.loopUsers || [])]);
  const rows = await people.buildAssignees((schedule.assignees || []).filter((u) => !off.has(String(u))));
  if (!rows.length) return null;
  const routine = isRoutineFrequency(schedule.frequency);
  const appeared = appear || now;

  let task;
  try {
    task = await Task.create({
      title: schedule.title,
      description: schedule.description,
      category: schedule.category,
      team: schedule.team || null,
      createdBy: schedule.createdBy,
      createdByName: setter?.name || schedule.createdByName,
      assignees: rows.map((r) => ({
        ...r,
        ...(routine ? { status: STATUS.IN_PROGRESS, acceptance: ACCEPTANCE.ACCEPTED, acceptedAt: now, startedAt: now } : {}),
      })),
      loopUsers: (schedule.loopUsers || []).filter((u) => !off.has(String(u))),
      ...(schedule.onBehalf?.by ? { onBehalf: schedule.onBehalf } : {}),
      priority: schedule.priority,
      dueDate,
      startDate: appeared,
      remindFrom: appeared,
      routine,
      requiresApproval: routine ? false : schedule.requiresApproval !== false,
      voiceNote: schedule.voiceNote,
      links: schedule.links,
      reminders: schedule.reminders,
      repeat: {
        frequency: schedule.frequency,
        weekdays: schedule.weekdays,
        monthDay: schedule.monthDay,
        month: schedule.month,
        interval: schedule.interval,
        monthlyMode: schedule.monthlyMode,
        nthWeek: schedule.nthWeek,
        weekday: schedule.weekday,
        time: schedule.time,
      },
      recurringTask: schedule._id,
      occurrenceKey: key,
    });
  } catch (err) {
    if (err.code === 11000) return null; // already raised
    throw err;
  }

  await TaskUpdate.create({
    task: task._id,
    kind: 'CREATED',
    byName: 'System',
    to: task.status,
    note: routine
      ? 'Raised automatically: today’s routine. Mark it done when it is done.'
      : `Raised automatically: ${String(schedule.frequency).toLowerCase()} task.`,
    system: true,
  });
  notify.assigned(task, setter || { _id: schedule.createdBy, name: schedule.createdByName }).catch((e) => console.warn('[tasks] notify failed:', e.message));
  return task;
}

/**
 * Raise everything one schedule owes, up to now: each occurrence that falls
 * on a day from the catch-up floor to `leadDays` ahead, has appeared, and is
 * not due before mintFrom or after `until`.
 */
async function runSchedule(schedule, now = new Date(), zoneIn = null) {
  const zone = zoneIn || (await zoneOfSchedule(schedule));
  const made = [];
  if (zone.setter && zone.setter.status !== 'active') return made;
  const todayKey = dayKey(now, zone.tz);
  const untilKey = schedule.until ? dayKey(schedule.until, zone.tz) : null;
  if (untilKey && untilKey < todayKey) {
    await RecurringTask.updateOne({ _id: schedule._id }, { $set: { isActive: false } });
    return made;
  }

  const startKey = dayKey(schedule.startDate || now, zone.tz);
  const catchupKey = addDaysKey(todayKey, -CATCHUP_DAYS);
  const endKey = addDaysKey(todayKey, leadDaysOf(schedule) + 1);
  const floor = schedule.mintFrom ? new Date(schedule.mintFrom) : null;

  for (let key = startKey > catchupKey ? startKey : catchupKey; key <= endKey; key = addDaysKey(key, 1)) {
    if (untilKey && key > untilKey) break;
    if (!fallsOn(schedule, key, zone.tz)) continue;
    const due = atZone(key, schedule.time, zone.tz);
    if (floor && due < floor) continue;
    const appear = appearAt(schedule, key, zone);
    if (appear > now) continue;
    const task = await mintOccurrence(schedule, due, { key, appear, now, setter: zone.setter });
    if (task) made.push(task);
  }

  await RecurringTask.updateOne(
    { _id: schedule._id },
    made.length
      ? { $set: { lastRunAt: now, lastOccurrenceKey: made[made.length - 1].occurrenceKey }, $inc: { generatedCount: made.length } }
      : { $set: { lastRunAt: now } }
  );
  return made;
}

/** One sweep over every live schedule. One bad schedule never stops the rest. */
async function tick(now = new Date()) {
  let minted = 0;
  const horizon = new Date(now.getTime() + (MAX_LEAD_DAYS + 2) * DAY_MS);
  const schedules = await RecurringTask.find({ isActive: true, startDate: { $lte: horizon } }).lean();
  for (const schedule of schedules) {
    try {
      minted += (await runSchedule(schedule, now)).length;
    } catch (err) {
      console.warn(`[jobs] recurring ${schedule._id}:`, err.message);
    }
  }
  return minted;
}

module.exports = {
  CATCHUP_DAYS,
  zoneFromUser,
  zoneOfSchedule,
  leadDaysOf,
  fallsOn,
  appearAt,
  nextOccurrence,
  mintOccurrence,
  runSchedule,
  tick,
};
