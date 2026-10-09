/**
 * The calendar: dated reminders (the HRMS's, aimed through contacts and teams
 * instead of departments) and the month both apps draw.
 *
 *   MONTH     open tasks on the day they are due, finished ones on the day
 *             they were finished, and every reminder the viewer can see. Rows
 *             are { date, day, type, label, meta } like the HRMS calendar's,
 *             with types task · done · reminder (mine) · sharedReminder (set
 *             for me by someone else).
 *   AIM       who a reminder may go to: yourself; people you may give a task
 *             to; a team you own or run; everyone (the Super Admin).
 *   RING      a reminder rings once on its day: at its time when that reads
 *             as a clock time, otherwise at the setter's workday start. Set
 *             for other people, they are told the moment it is saved too.
 */
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const Reminder = require('../models/Reminder');
const { REMINDER_SCOPES, REMINDER_PRIORITIES } = require('../models/Reminder');
const Task = require('../models/Task');
const User = require('../../platform/models/User');
const Team = require('../../platform/models/Team');
const platformPeople = require('../../platform/services/people');
const { notify } = require('../../platform/services/notify');
const { badRequest, forbidden, notFound } = require('../../platform/errors');
const { STATUS, OPEN_STATUS, ACCEPTANCE, statusLabel, isOverdue, idOf } = require('../config');
const { settingsOf, atZone, inZone, dayKey } = require('./time');

const SCOPE_LABELS = { self: 'Just me', users: 'Specific people', team: 'A team', everyone: 'Everyone' };
/** A ring this late (the server was off) is settled without a word. */
const RING_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Rows of one kind in a month, at most. */
const MONTH_CAP = 1500;

const pad = (n) => String(n).padStart(2, '0');
const isSuperAdmin = (user) => user?.role === 'superadmin';
const validIds = (ids) =>
  [...new Set((Array.isArray(ids) ? ids : ids ? [ids] : []).filter(Boolean).map((v) => String(v?._id ?? v?.id ?? v)))].filter((id) =>
    mongoose.isValidObjectId(id)
  );

// ---------------------------------------------------------------- time

/**
 * `time` is free text, as on the HRMS: the web types "4:00 PM", a phone's
 * picker sends "16:00". Read as a clock when it is one ({ h, m }), else null.
 */
function clockOf(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const twelve = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s*m\.?$/i.exec(s);
  if (twelve) {
    const h = Number(twelve[1]);
    const m = Number(twelve[2] || 0);
    if (h < 1 || h > 12 || m > 59) return null;
    return { h: (h % 12) + (twelve[3].toLowerCase() === 'p' ? 12 : 0), m };
  }
  const twentyFour = /^(\d{1,2})[:.](\d{2})$/.exec(s);
  if (twentyFour) {
    const h = Number(twentyFour[1]);
    const m = Number(twentyFour[2]);
    if (h > 23 || m > 59) return null;
    return { h, m };
  }
  return null;
}

/** "4:00 PM" for a clock time, the words as typed for anything else. */
function timeLabel(text) {
  const c = clockOf(text);
  if (!c) return String(text || '').trim();
  return `${c.h % 12 || 12}:${pad(c.m)} ${c.h < 12 ? 'AM' : 'PM'}`;
}

/** 'YYYY-MM-DD' (an ISO prefix is fine) as a real calendar day, or null. */
function dayOf(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
  if (!m) return null;
  const key = `${m[1]}-${m[2]}-${m[3]}`;
  const d = DateTime.fromISO(key, { zone: 'UTC' });
  return d.isValid && d.toISODate() === key ? key : null;
}

/** When a reminder rings: its clock time on its day, or the setter's workday start. */
function ringAtFor(day, time, setter) {
  const s = settingsOf(setter);
  const c = clockOf(time);
  return atZone(day, c ? `${pad(c.h)}:${pad(c.m)}` : s.workdayStart, s.timezone);
}

/** "Fri, 9 Oct" for a day key. */
const dayText = (day) => DateTime.fromISO(day, { zone: 'UTC' }).toFormat('ccc, d LLL');

/** 'YYYY-MM' → { y, m, start, next } day keys, or the current month in `tz`. */
function monthOf(value, tz) {
  const now = inZone(new Date(), tz);
  let y = now.year;
  let m = now.month;
  const hit = /^(\d{4})-(\d{2})$/.exec(String(value || '').trim());
  if (hit && Number(hit[2]) >= 1 && Number(hit[2]) <= 12) {
    y = Number(hit[1]);
    m = Number(hit[2]);
  }
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { y, m, start: `${y}-${pad(m)}-01`, next: `${ny}-${pad(nm)}-01` };
}

// ---------------------------------------------------------------- who

/** Active teams the person is in (ids), for what a team reminder reaches. */
async function myTeamIds(user) {
  const teams = await platformPeople.teamsOf(user._id);
  return teams.map((t) => new mongoose.Types.ObjectId(t.id));
}

/** Teams this person may remind as a whole: owner/admin (the Super Admin: none needed here). */
async function remindableTeams(user) {
  if (isSuperAdmin(user)) return [];
  const teams = await platformPeople.teamsOf(user._id);
  return teams.filter((t) => t.role === 'owner' || t.role === 'admin').map((t) => ({ id: t.id, name: t.name }));
}

/** What the reminder form may offer this person. */
async function aimOptions(user) {
  const sa = isSuperAdmin(user);
  return { users: true, teams: await remindableTeams(user), everyone: sa, anyTeam: sa };
}

/** Mongo filter for the reminders a person can see. */
async function visibleFilter(user) {
  const teams = await myTeamIds(user);
  const or = [{ createdBy: user._id }, { scope: 'everyone' }, { scope: 'users', recipients: user._id }];
  if (teams.length) or.push({ scope: 'team', team: { $in: teams } });
  return { $or: or };
}

const canSee = async (user, r) => !!(await Reminder.exists({ _id: r._id, ...(await visibleFilter(user)) }));

/**
 * Who a reminder reaches besides its setter, as id strings: active people
 * only, never the setter.
 */
async function audienceOf(r) {
  const setter = String(idOf(r.createdBy));
  let ids = [];
  if (r.scope === 'users') ids = (r.recipients || []).map((x) => String(idOf(x)));
  else if (r.scope === 'team' && r.team) ids = (await platformPeople.teamMemberIds(idOf(r.team))).map(String);
  else if (r.scope === 'everyone') ids = (await User.find({ role: 'user', status: 'active' }).select('_id').lean()).map((u) => String(u._id));
  ids = [...new Set(ids)].filter((id) => id && id !== setter);
  if (!ids.length || r.scope === 'everyone') return ids;
  const active = await User.find({ _id: { $in: ids }, status: 'active' }).select('_id').lean();
  return active.map((u) => String(u._id));
}

/**
 * Check and normalise who a reminder is aimed at. `current` is the saved
 * reminder on an edit: a field left out keeps its value.
 */
async function aimFor(user, body, current = null) {
  const sa = isSuperAdmin(user);
  const scope = REMINDER_SCOPES.includes(body.scope) ? body.scope : current?.scope || 'self';
  if (scope === 'self') return { scope, recipients: [], team: null };

  if (scope === 'users') {
    const given = body.recipients !== undefined ? body.recipients : current?.recipients;
    const ids = validIds(given).filter((id) => id !== String(user._id));
    if (!ids.length) throw badRequest('Pick at least one person, or set it for just you.');
    await platformPeople.assertAssignable(user, ids);
    return { scope, recipients: ids, team: null };
  }

  if (scope === 'team') {
    const teamId = String(body.team !== undefined ? body.team : idOf(current?.team) || '');
    if (!mongoose.isValidObjectId(teamId)) throw badRequest('Pick the team this reminder is for.');
    const team = await Team.findById(teamId).select('name members').lean();
    if (!team) throw badRequest('That team no longer exists.');
    if (!sa) {
      const m = team.members.find((x) => String(x.user) === String(user._id) && x.status === 'active');
      if (!m || !['owner', 'admin'].includes(m.role)) throw forbidden('Only the team’s owner or an admin can remind the whole team.');
    }
    return { scope, recipients: [], team: team._id };
  }

  if (!sa) throw forbidden('Only the Super Admin can remind everyone.');
  return { scope: 'everyone', recipients: [], team: null };
}

// ---------------------------------------------------------------- shapes

const populated = (q) => q.populate('recipients', 'name status photo').populate('team', 'name');

/** One reminder, as both apps read it. The audience list is the setter's (and the Super Admin's) alone. */
function present(r, viewer) {
  const setterId = String(idOf(r.createdBy));
  const mine = setterId === String(viewer._id);
  const sa = isSuperAdmin(viewer);
  const team = r.team && typeof r.team === 'object' && r.team.name !== undefined ? { id: String(r.team._id), name: r.team.name } : r.team ? { id: String(r.team), name: '' } : null;
  const people = (r.recipients || []).map((p) =>
    p && typeof p === 'object' && p.name !== undefined ? { id: String(p._id), name: p.name, photoUrl: User.photoUrlOf(p) } : { id: String(p), name: '', photoUrl: null }
  );
  return {
    id: String(r._id),
    title: r.title,
    notes: r.notes || '',
    day: r.day,
    time: r.time || '',
    timeLabel: timeLabel(r.time),
    timed: !!clockOf(r.time),
    priority: r.priority,
    scope: r.scope,
    audience: r.scope === 'team' && team?.name ? `${SCOPE_LABELS.team} · ${team.name}` : SCOPE_LABELS[r.scope] || r.scope,
    team,
    recipients: mine || sa ? people : [],
    recipientIds: mine || sa ? people.map((p) => p.id) : [],
    setBy: { id: setterId, name: mine ? 'You' : r.createdByName || 'Someone' },
    mine,
    canEdit: mine || sa,
    ringAt: r.ringAt,
    rung: !!r.rungAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ---------------------------------------------------------------- reading

async function listReminders(user, { month, mine } = {}) {
  const filter = mine ? { createdBy: user._id } : await visibleFilter(user);
  if (month) {
    const mo = monthOf(month, settingsOf(user).timezone);
    filter.day = { $gte: mo.start, $lt: mo.next };
  }
  const rows = await populated(Reminder.find(filter).sort({ day: 1, ringAt: 1 }).limit(MONTH_CAP)).lean();
  return rows.map((r) => present(r, user));
}

async function loadVisible(user, id) {
  if (!mongoose.isValidObjectId(String(id))) throw notFound('Reminder not found');
  const r = await Reminder.findById(id);
  if (!r || !(isSuperAdmin(user) || String(r.createdBy) === String(user._id) || (await canSee(user, r)))) throw notFound('Reminder not found');
  return r;
}

/** The setter, or the Super Admin. */
async function loadOwned(user, id) {
  const r = await loadVisible(user, id);
  if (String(r.createdBy) !== String(user._id) && !isSuperAdmin(user)) throw forbidden('Only whoever set this reminder can change it.');
  return r;
}

// ---------------------------------------------------------------- writing

function cleanText(body, key, { max, required, label }) {
  const v = String(body[key] ?? '').trim();
  if (required && !v) throw badRequest(`${label} is required`);
  if (v.length > max) throw badRequest(`${label} is too long (${max} characters at most)`);
  return v;
}

async function createReminder(user, body = {}) {
  const title = cleanText(body, 'title', { max: 200, required: true, label: 'A title' });
  const day = dayOf(body.date ?? body.day);
  if (!day) throw badRequest('Pick the day for this reminder.');
  const time = cleanText(body, 'time', { max: 40, label: 'The time' });
  const notes = cleanText(body, 'notes', { max: 2000, label: 'The notes' });
  const priority = REMINDER_PRIORITIES.includes(body.priority) ? body.priority : 'Normal';
  const aim = await aimFor(user, body);

  const now = new Date();
  const ringAt = ringAtFor(day, time, user);
  const r = await Reminder.create({
    title,
    notes,
    day,
    time,
    priority,
    ...aim,
    createdBy: user._id,
    createdByName: user.name,
    ringAt,
    // Saved after its moment has passed: nothing left to ring.
    rungAt: ringAt <= now ? now : null,
  });

  const audience = await audienceOf(r);
  if (audience.length) {
    const label = timeLabel(time);
    await notify(audience, {
      title: `Reminder: ${title}`,
      body: `${dayText(day)}${label ? ` at ${label}` : ''} · set by ${user.name}`,
      link: `/calendar?date=${day}`,
      kind: 'reminder',
    });
  }
  const saved = await populated(Reminder.findById(r._id)).lean();
  return { reminder: present(saved, user), notified: audience.length };
}

async function updateReminder(user, id, body = {}) {
  const r = await loadOwned(user, id);
  const before = new Set(await audienceOf(r));
  if (body.title !== undefined) r.title = cleanText(body, 'title', { max: 200, required: true, label: 'A title' });
  if (body.notes !== undefined) r.notes = cleanText(body, 'notes', { max: 2000, label: 'The notes' });
  if (body.time !== undefined) r.time = cleanText(body, 'time', { max: 40, label: 'The time' });
  if (body.priority !== undefined && REMINDER_PRIORITIES.includes(body.priority)) r.priority = body.priority;
  if (body.date !== undefined || body.day !== undefined) {
    const day = dayOf(body.date ?? body.day);
    if (!day) throw badRequest('Pick the day for this reminder.');
    r.day = day;
  }
  if (body.scope !== undefined || body.recipients !== undefined || body.team !== undefined) {
    // The Super Admin editing someone else's reminder aims it as the Super Admin.
    Object.assign(r, await aimFor(user, body, r));
  }

  // The day or the time moved: it rings at the new moment (unless that has passed).
  const setter = String(r.createdBy) === String(user._id) ? user : await User.findById(r.createdBy).select('settings').lean();
  const ringAt = ringAtFor(r.day, r.time, setter);
  if (!r.ringAt || ringAt.getTime() !== new Date(r.ringAt).getTime()) {
    const now = new Date();
    r.ringAt = ringAt;
    r.rungAt = ringAt <= now ? now : null;
  }
  await r.save();

  // Whoever it now reaches for the first time is told, as on creation; the
  // people who already had it are not told again.
  const added = (await audienceOf(r)).filter((uid) => !before.has(uid));
  if (added.length) {
    const label = timeLabel(r.time);
    await notify(added, {
      title: `Reminder: ${r.title}`,
      body: `${dayText(r.day)}${label ? ` at ${label}` : ''} · set by ${r.createdByName || user.name}`,
      link: `/calendar?date=${r.day}`,
      kind: 'reminder',
    });
  }
  const saved = await populated(Reminder.findById(r._id)).lean();
  return { reminder: present(saved, user), notified: added.length };
}

async function deleteReminder(user, id) {
  const r = await loadOwned(user, id);
  await r.deleteOne();
  return { id: String(r._id), deleted: true };
}

// ---------------------------------------------------------------- ringing

/** Ring every reminder whose moment has come. Each is claimed first, so two servers never ring one twice. */
async function ringDue(now = new Date()) {
  await Reminder.updateMany({ rungAt: null, ringAt: { $lte: new Date(now.getTime() - RING_WINDOW_MS) } }, { $set: { rungAt: now } });
  const due = await Reminder.find({ rungAt: null, ringAt: { $lte: now } }).sort({ ringAt: 1 }).limit(200).lean();
  let sent = 0;
  for (const r of due) {
    const claimed = await Reminder.updateOne({ _id: r._id, rungAt: null }, { $set: { rungAt: now } });
    if (!claimed.modifiedCount) continue;
    const setter = await User.findById(r.createdBy).select('name status').lean();
    const audience = await audienceOf(r);
    const to = [...(setter?.status === 'active' ? [String(r.createdBy)] : []), ...audience];
    if (!to.length) continue;
    const label = timeLabel(r.time);
    const timed = !!clockOf(r.time);
    const body = [
      label ? `at ${label}` : null,
      r.scope !== 'self' && setter?.name ? `set by ${setter.name}` : null,
      r.priority === 'High' ? 'High priority' : null,
      r.notes || null,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 300);
    await notify(to, {
      title: timed ? `⏰ Reminder: ${r.title}` : `⏰ Reminder today: ${r.title}`,
      body: body || 'Today.',
      link: `/calendar?date=${r.day}`,
      kind: 'reminder',
    });
    sent += to.length;
  }
  return sent;
}

// ---------------------------------------------------------------- the month

/** A due time worth printing: not local midnight (a bare date). */
function clockIn(date, tz) {
  const d = inZone(date, tz);
  return d.hour === 0 && d.minute === 0 ? '' : d.toFormat('h:mm a');
}

/** "You", "Ravi", "You + 2" — the people on a task, as the viewer reads it. */
function peopleLine(task, meId) {
  const live = (task.assignees || []).filter((a) => a.acceptance !== ACCEPTANCE.REJECTED && a.status !== STATUS.CANCELLED);
  const me = live.some((a) => String(idOf(a.user)) === meId);
  const others = live.filter((a) => String(idOf(a.user)) !== meId).map((a) => a.name || 'Someone');
  if (me && !others.length) return 'You';
  if (me) return `You + ${others.length}`;
  if (others.length <= 2) return others.join(', ') || '—';
  return `${others[0]} + ${others.length - 1}`;
}

/**
 * One month of the viewer's calendar.
 * @returns {{ year, month, events: Array<{ date, day, type, label, meta }>, aim }}
 */
async function monthFeed(user, month) {
  const tz = settingsOf(user).timezone;
  const mo = monthOf(month, tz);
  const start = atZone(mo.start, '00:00', tz);
  const end = atZone(mo.next, '00:00', tz);
  const meId = String(user._id);
  const now = new Date();

  // Tasks I am on (and have not refused) or that I set.
  const mineOrGiven = {
    archived: { $ne: true },
    $or: [{ createdBy: user._id }, { assignees: { $elemMatch: { user: user._id, acceptance: { $ne: ACCEPTANCE.REJECTED } } } }],
  };
  const fields = 'code title status priority category dueDate completedAt createdBy createdByName assignees.user assignees.name assignees.acceptance assignees.status assignees.completedLate parentTask';
  const [open, done, reminders, aim] = await Promise.all([
    Task.find({ ...mineOrGiven, status: { $in: OPEN_STATUS }, dueDate: { $gte: start, $lt: end } }).select(fields).sort({ dueDate: 1 }).limit(MONTH_CAP).lean(),
    Task.find({ ...mineOrGiven, status: STATUS.COMPLETED, completedAt: { $gte: start, $lt: end } }).select(fields).sort({ completedAt: 1 }).limit(MONTH_CAP).lean(),
    listReminders(user, { month: `${mo.y}-${pad(mo.m)}` }),
    aimOptions(user),
  ]);

  const events = [];
  const taskMeta = (t) => {
    const setByMe = String(idOf(t.createdBy)) === meId;
    const onMe = (t.assignees || []).some((a) => String(idOf(a.user)) === meId && a.acceptance !== ACCEPTANCE.REJECTED);
    return {
      taskId: String(t._id),
      code: t.code || '',
      status: t.status,
      statusLabel: statusLabel(t.status),
      priority: t.priority,
      category: t.category || '',
      assignedTo: peopleLine(t, meId),
      setBy: setByMe ? 'You' : t.createdByName || 'Someone',
      mine: onMe,
      given: setByMe && !onMe,
      subtask: !!t.parentTask,
      dueAt: t.dueDate || null,
    };
  };

  for (const t of open) {
    const date = dayKey(t.dueDate, tz);
    events.push({
      date,
      day: Number(date.slice(8)),
      type: 'task',
      label: t.title,
      meta: { ...taskMeta(t), at: t.dueDate, time: clockIn(t.dueDate, tz), overdue: isOverdue(t, now) },
    });
  }
  for (const t of done) {
    const date = dayKey(t.completedAt, tz);
    events.push({
      date,
      day: Number(date.slice(8)),
      type: 'done',
      label: t.title,
      meta: {
        ...taskMeta(t),
        done: true,
        at: t.completedAt,
        time: clockIn(t.completedAt, tz),
        completedAt: t.completedAt,
        late: !!(t.dueDate && new Date(t.completedAt) > new Date(t.dueDate)) || (t.assignees || []).some((a) => a.completedLate),
      },
    });
  }
  for (const r of reminders) {
    events.push({
      date: r.day,
      day: Number(r.day.slice(8)),
      type: r.mine ? 'reminder' : 'sharedReminder',
      label: r.title,
      meta: { ...r, reminderId: r.id, time: r.timeLabel },
    });
  }

  // By day; on a day, timed rows by time, then the rest in the order above.
  const order = { reminder: 0, sharedReminder: 1, task: 2, done: 3 };
  const minuteOf = (e) => {
    if (e.type === 'reminder' || e.type === 'sharedReminder') {
      const c = clockOf(e.meta.time);
      return c ? c.h * 60 + c.m : 24 * 60;
    }
    if (!e.meta.time) return 24 * 60;
    const d = inZone(e.meta.at, tz);
    return d.hour * 60 + d.minute;
  };
  events.sort((a, b) => a.date.localeCompare(b.date) || minuteOf(a) - minuteOf(b) || order[a.type] - order[b.type]);
  return { year: mo.y, month: mo.m, events, aim };
}

// ---------------------------------------------------------------- account hooks

/** Someone deleted their account: their reminders go, and they leave everyone else's. */
async function onUserDeleted(userId) {
  await Reminder.deleteMany({ createdBy: userId });
  await Reminder.updateMany({ recipients: userId }, { $pull: { recipients: userId } });
}

/** A team was deleted: reminders aimed at it stay with whoever set them. */
async function onTeamDeleted(teamId) {
  await Reminder.updateMany({ team: teamId }, { $set: { scope: 'self', team: null } });
}

module.exports = {
  SCOPE_LABELS,
  clockOf,
  timeLabel,
  dayOf,
  ringAtFor,
  monthOf,
  aimOptions,
  visibleFilter,
  audienceOf,
  present,
  listReminders,
  loadVisible,
  createReminder,
  updateReminder,
  deleteReminder,
  ringDue,
  monthFeed,
  onUserDeleted,
  onTeamDeleted,
};
