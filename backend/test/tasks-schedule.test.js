const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const h = require('./helpers');
const Task = require('../src/product/models/Task');
const recurrence = require('../src/product/services/recurrence');
const jobs = require('../src/product/jobs');
const { patternLabel } = require('../src/product/config');
const { give, act, detail, crew, alertTitles } = require('./task-helpers');

before(h.start);
after(h.stop);

/** An Etc/GMT zone where it is about noon right now. */
function noonZone() {
  const offset = 12 - new Date().getUTCHours();
  if (offset === 0) return 'Etc/GMT';
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

const setSettings = async (who, body) => {
  const res = await who.patch('/api/me/settings', body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
};

const at = (iso) => new Date(iso);

describe('repeating shapes', () => {
  const tz = 'Asia/Kolkata';
  const falls = (s, key) => recurrence.fallsOn({ startDate: at('2026-01-01T00:00:00+05:30'), ...s }, key, tz);

  test('daily, every N days, weekly, monthly by date and by weekday, yearly', () => {
    assert.equal(falls({ frequency: 'DAILY' }, '2026-03-05'), true);
    assert.equal(falls({ frequency: 'DAILY', interval: 2 }, '2026-01-03'), true);
    assert.equal(falls({ frequency: 'DAILY', interval: 2 }, '2026-01-04'), false);
    // 2026-03-02 is a Monday.
    assert.equal(falls({ frequency: 'WEEKLY', weekdays: [1, 4] }, '2026-03-02'), true);
    assert.equal(falls({ frequency: 'WEEKLY', weekdays: [1, 4] }, '2026-03-03'), false);
    // The 31st clamps to the end of a short month.
    assert.equal(falls({ frequency: 'MONTHLY', monthDay: 31 }, '2026-02-28'), true);
    assert.equal(falls({ frequency: 'MONTHLY', monthDay: 31 }, '2026-03-30'), false);
    // First Monday of March 2026 is the 2nd; last Friday is the 27th.
    assert.equal(falls({ frequency: 'MONTHLY', monthlyMode: 'WEEKDAY', nthWeek: 1, weekday: 1 }, '2026-03-02'), true);
    assert.equal(falls({ frequency: 'MONTHLY', monthlyMode: 'WEEKDAY', nthWeek: 1, weekday: 1 }, '2026-03-09'), false);
    assert.equal(falls({ frequency: 'MONTHLY', monthlyMode: 'WEEKDAY', nthWeek: -1, weekday: 5 }, '2026-03-27'), true);
    assert.equal(falls({ frequency: 'MONTHLY', monthlyMode: 'WEEKDAY', nthWeek: -1, weekday: 5 }, '2026-03-20'), false);
    assert.equal(falls({ frequency: 'YEARLY', month: 4, monthDay: 1 }, '2027-04-01'), true);
    // Nothing before the start.
    assert.equal(falls({ frequency: 'DAILY' }, '2025-12-31'), false);

    assert.equal(patternLabel({ frequency: 'DAILY', interval: 2, time: '18:00' }), 'Alternate days · 6:00 PM');
    assert.equal(patternLabel({ frequency: 'WEEKLY', weekdays: [1, 3], time: '09:30' }), 'Weekly on Mon, Wed · 9:30 AM');
    assert.equal(patternLabel({ frequency: 'MONTHLY', monthlyMode: 'WEEKDAY', nthWeek: 1, weekday: 1, time: '18:00' }), 'Monthly on the first Monday · 6:00 PM');
  });

  test('an occurrence appears at the workday start, monthly ones two days early', () => {
    const zone = { tz, start: '09:00' };
    const s = { frequency: 'MONTHLY', monthDay: 15, time: '18:00' };
    assert.equal(recurrence.appearAt(s, '2026-03-15', zone).toISOString(), '2026-03-13T03:30:00.000Z');
    // Due before the day starts: an hour before instead.
    const early = { frequency: 'DAILY', time: '09:30' };
    assert.equal(recurrence.appearAt(early, '2026-03-15', zone).toISOString(), '2026-03-15T03:00:00.000Z');
  });
});

describe('recurring schedules', () => {
  test('a routine daily for a contact: raised now, only ever marked done, run-now is idempotent', async () => {
    const { boss, a } = await crew('Recur');
    const stranger = await h.signup('Outside');
    await setSettings(boss, { timezone: noonZone(), workdayStart: '00:00' });

    assert.equal((await boss.post('/api/tasks/recurring', { title: 'x', frequency: 'DAILY', assignees: [stranger.id] })).status, 400);
    assert.equal((await boss.post('/api/tasks/recurring', { title: 'x', frequency: 'ONCE' })).status, 400);

    const res = await boss.post('/api/tasks/recurring', { title: 'Cash count', frequency: 'DAILY', time: '23:00', assignees: [a.id] });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const s = res.body.schedule;
    assert.equal(res.body.raised, 1);
    assert.equal(s.routine, true);
    assert.equal(s.requiresApproval, false);
    assert.equal(s.patternLabel, 'Every day · 11:00 PM');
    assert.deepEqual(s.reminderLabels, ['Every 2 hours until done']);
    assert.equal(s.canManage, true);
    assert.equal(s.assignees[0].id, a.id);
    assert.ok(s.next);

    const raised = (await a.get('/api/tasks?scope=mine&q=Cash')).body.tasks;
    assert.equal(raised.length, 1);
    const t = raised[0];
    assert.equal(t.routine, true);
    assert.equal(t.status, 'IN_PROGRESS');
    assert.equal(t.repeatLabel, 'Every day · 11:00 PM');
    assert.equal(t.can.canDone, true);
    assert.equal(t.can.canAccept, false);
    assert.deepEqual(t.can.transitions.map((m) => m.to), ['COMPLETED']);
    const done = await act(a, t._id, 'status', { to: 'COMPLETED', note: 'Counted' });
    assert.equal(done.body.task.status, 'COMPLETED');

    const run = await boss.post(`/api/tasks/recurring/${s._id}/run`);
    assert.equal(run.status, 200);
    assert.equal(run.body.raised, 0);

    // Who sees and who manages.
    const list = (await a.get('/api/tasks/recurring')).body.schedules;
    assert.equal(list.length, 1);
    assert.equal(list[0].canManage, false);
    assert.equal(list[0].stats.raised, 1);
    assert.equal(list[0].stats.done, 1);
    assert.equal((await a.patch(`/api/tasks/recurring/${s._id}`, { title: 'Mine' })).status, 403);
    assert.equal((await a.post(`/api/tasks/recurring/${s._id}/run`)).status, 403);
    assert.equal((await stranger.get(`/api/tasks/recurring/${s._id}`)).status, 404);
    assert.equal((await stranger.get('/api/tasks/recurring')).body.schedules.length, 0);

    const paused = await boss.patch(`/api/tasks/recurring/${s._id}`, { isActive: false });
    assert.equal(paused.body.schedule.isActive, false);
    assert.equal(paused.body.schedule.next, null);
    const resumed = await boss.patch(`/api/tasks/recurring/${s._id}`, { isActive: true, title: 'Cash count (till)' });
    assert.equal(resumed.body.schedule.title, 'Cash count (till)');
    assert.equal((await boss.del(`/api/tasks/recurring/${s._id}`)).body.ok, true);
    assert.equal((await boss.get(`/api/tasks/recurring/${s._id}`)).body.schedule.isActive, false);
  });

  test('weekly appears on its day; monthly on the last Friday; a team admin manages team schedules', async () => {
    const owner = await h.signup('TeamOwner');
    const admin = await h.signup('TeamAdmin');
    const m = await h.signup('TeamMember');
    const team = await h.makeTeam(owner, [admin, m], { admins: [admin] });
    const tz = noonZone();
    await setSettings(m, { timezone: tz, workdayStart: '00:00' });

    const tomorrow = DateTime.now().setZone(tz).plus({ days: 1 });
    const weekly = await m.post('/api/tasks/recurring', {
      title: 'Weekly report', frequency: 'WEEKLY', weekdays: [tomorrow.weekday % 7], time: '10:00', assignees: [m.id], team: team.id,
    });
    assert.equal(weekly.status, 201, JSON.stringify(weekly.body));
    assert.equal(weekly.body.raised, 0);
    assert.equal(DateTime.fromISO(weekly.body.schedule.next.dueAt).setZone(tz).toISODate(), tomorrow.toISODate());

    // The team admin sees and manages it.
    const adminList = (await admin.get('/api/tasks/recurring')).body.schedules;
    assert.ok(adminList.some((x) => x._id === weekly.body.schedule._id && x.canManage && x.can.edit));
    assert.deepEqual(weekly.body.schedule.team, { id: team.id, name: team.name });

    // Tomorrow, just after the day starts, the job raises it.
    const now = tomorrow.startOf('day').plus({ minutes: 30 }).toJSDate();
    await jobs.recurringTick(now);
    const raised = await Task.find({ recurringTask: weekly.body.schedule._id }).lean();
    assert.equal(raised.length, 1);
    assert.equal(raised[0].occurrenceKey, tomorrow.toISODate());
    assert.equal(raised[0].requiresApproval, true);
    assert.equal(String(raised[0].team), team.id);
    await jobs.recurringTick(now);
    assert.equal(await Task.countDocuments({ recurringTask: weekly.body.schedule._id }), 1);

    const monthly = await m.post('/api/tasks/recurring', {
      title: 'Month end', repeat: { frequency: 'MONTHLY', monthlyMode: 'WEEKDAY', nthWeek: -1, weekday: 5 }, assignees: [m.id],
    });
    assert.equal(monthly.status, 201);
    assert.equal(monthly.body.schedule.patternLabel, 'Monthly on the last Friday · 6:00 PM');
    assert.equal(monthly.body.schedule.leadDays, 2);
    const next = DateTime.fromISO(monthly.body.schedule.next.dueAt).setZone(tz);
    assert.equal(next.weekday, 5);
    assert.ok(next.day + 7 > next.daysInMonth);
  });

  test('a Repeat on the assign form becomes a schedule and its first occurrence', async () => {
    const { boss, a } = await crew('Repeat');
    const t = await give(boss, { title: 'Water the plants', assignees: [a.id], repeat: { frequency: 'WEEKLY', weekdays: [0, 1, 2, 3, 4, 5, 6], time: '23:30' } });
    assert.ok(t.recurringTask);
    assert.equal(t.repeat.frequency, 'WEEKLY');
    assert.ok(t.dueDate);
    assert.ok(t.occurrenceKey);
    const schedules = (await boss.get('/api/tasks/recurring')).body.schedules;
    assert.equal(schedules[0].title, 'Water the plants');
  });
});

describe('reminders, overdue and the digest', () => {
  test('before: once, inside the window; too old: never', async () => {
    const { boss, a } = await crew('Remind');
    const t = await give(boss, {
      title: 'Pay rent', assignees: [a.id], dueDate: '2030-03-04T12:00:00.000Z',
      reminders: [{ channel: 'APP', when: 'BEFORE', amount: 1, unit: 'HOURS' }, { channel: 'EMAIL', when: 'BEFORE', amount: 1, unit: 'DAYS' }],
    });
    // 11:05: the 1-hour rule fires (the 1-day one is far too old and is burned silently).
    assert.ok((await jobs.reminderTick(at('2030-03-04T11:05:00Z'))) >= 1);
    const alerts = await h.alerts(a);
    assert.equal(alerts.filter((n) => n.title === `Reminder: ${t.code} — Pay rent`).length, 1);
    assert.match(alerts[0].body, /^Due 4 Mar, 5:30 PM \(1 hour before\)\.$/);
    const stored = await Task.findById(t._id).lean();
    assert.deepEqual(stored.firedReminders.sort(), ['APP:BEFORE:1:HOURS', 'EMAIL:BEFORE:1:DAYS']);
    await jobs.reminderTick(at('2030-03-04T11:10:00Z'));
    assert.equal((await h.alerts(a)).filter((n) => n.title.startsWith('Reminder:')).length, 1);
    const feed = (await boss.get(`/api/tasks/${t._id}/updates`)).body.updates;
    assert.equal(feed[0].kind, 'REMINDER');
    assert.equal(feed[0].system, true);
  });

  test('after: the doer and the setter both hear', async () => {
    const { boss, a } = await crew('After');
    const t = await give(boss, {
      title: 'File returns', assignees: [a.id], dueDate: '2030-03-04T12:00:00.000Z',
      reminders: [{ channel: 'APP', when: 'AFTER', amount: 1, unit: 'HOURS' }],
    });
    await jobs.reminderTick(at('2030-03-04T13:01:00Z'));
    assert.ok((await alertTitles(a)).includes(`Overdue: ${t.code} — File returns`));
    assert.ok((await alertTitles(boss)).includes(`Still not done: ${t.code} — File returns`));
  });

  test('every 2 hours until done: on the clock, inside the window, once per beat', async () => {
    const { boss, a } = await crew('Every');
    await setSettings(boss, { timezone: 'Etc/UTC' });
    const t = await give(boss, {
      title: 'Follow up leads', assignees: [a.id], dueDate: '2030-03-05T18:00:00.000Z',
      reminders: [{ channel: 'APP', when: 'EVERY', amount: 2, unit: 'HOURS' }],
    });
    await Task.updateOne({ _id: t._id }, { $set: { remindFrom: at('2030-03-04T06:00:00Z') } });
    const count = async () => (await h.alerts(a)).filter((n) => n.title === `Reminder: ${t.code} — Follow up leads`).length;

    await jobs.reminderTick(at('2030-03-04T11:05:00Z'));
    assert.equal(await count(), 1);
    await jobs.reminderTick(at('2030-03-04T12:30:00Z'));
    assert.equal(await count(), 1);
    await jobs.reminderTick(at('2030-03-04T13:02:00Z'));
    assert.equal(await count(), 2);
    // Outside the 9-to-9 window: nothing new.
    await jobs.reminderTick(at('2030-03-04T22:30:00Z'));
    assert.equal(await count(), 3); // the 21:00 beat, late but inside the firing window
    await jobs.reminderTick(at('2030-03-05T02:00:00Z'));
    assert.equal(await count(), 3);
    // Done: no more.
    await act(a, t._id, 'submit', { note: 'Done' });
    await jobs.reminderTick(at('2030-03-05T09:01:00Z'));
    assert.equal(await count(), 3);
  });

  test('overdue is announced once to both sides; the daily digest at my time', async () => {
    const { boss, a } = await crew('Late');
    await setSettings(a, { timezone: 'Etc/UTC', dailyDigestAt: '18:00' });
    const t = await give(boss, { title: 'Renew licence', assignees: [a.id], dueDate: '2030-06-01T10:00:00.000Z', reminders: [] });
    await give(boss, { title: 'Open one', assignees: [a.id], dueDate: '2030-06-09T10:00:00.000Z', reminders: [] });

    assert.ok((await jobs.overdueTick(at('2030-06-01T10:30:00Z'))) >= 1);
    assert.ok((await alertTitles(a)).includes(`Overdue: ${t.code} — Renew licence`));
    const bossAlert = (await h.alerts(boss)).find((n) => n.title === `Overdue: ${t.code} — Renew licence`);
    assert.match(bossAlert.body, new RegExp(`${a.name} has not finished it`));
    await jobs.overdueTick(at('2030-06-01T10:40:00Z'));
    assert.equal((await alertTitles(a)).filter((x) => x.startsWith('Overdue:')).length, 1);
    assert.equal((await detail(boss, t._id)).updates[0].kind, 'OVERDUE');

    // 17:59 is too early; 18:10 sends; a second run that day does not.
    await jobs.digestTick(at('2030-06-01T17:59:00Z'));
    assert.ok(!(await alertTitles(a)).includes('Your tasks today'));
    await jobs.digestTick(at('2030-06-01T18:10:00Z'));
    const digest = (await h.alerts(a)).find((n) => n.title === 'Your tasks today');
    assert.equal(digest.body, 'You have 1 overdue, 3 pending.');
    assert.equal(digest.link, '/tasks');
    await jobs.digestTick(at('2030-06-01T18:20:00Z'));
    assert.equal((await alertTitles(a)).filter((x) => x === 'Your tasks today').length, 1);

    // Switched off: no digest.
    await setSettings(boss, { timezone: 'Etc/UTC', dailyDigest: false });
    await jobs.digestTick(at('2030-06-02T18:05:00Z'));
    assert.ok(!(await alertTitles(boss)).includes('Your tasks today'));
    assert.equal((await alertTitles(a)).filter((x) => x === 'Your tasks today').length, 2);

    // The whole tick never throws.
    const all = await jobs.tick(at('2030-06-03T12:00:00Z'));
    assert.ok(all && typeof all.recurring === 'number');
  });
});
