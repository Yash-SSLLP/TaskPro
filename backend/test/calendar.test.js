const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const h = require('./helpers');
const Reminder = require('../src/product/models/Reminder');
const calendar = require('../src/product/services/calendar');
const jobs = require('../src/product/jobs');
const { give, move, act, crew, alertTitles, DAY } = require('./task-helpers');

before(h.start);
after(h.stop);

const TZ = 'Asia/Kolkata';
const today = () => DateTime.now().setZone(TZ).toISODate();
const plusDays = (n) => DateTime.now().setZone(TZ).plus({ days: n }).toISODate();
const monthOf = (key) => key.slice(0, 7);

async function remind(who, body, status = 201) {
  const res = await who.post('/api/reminders', body);
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
}

const feed = async (who, month) => {
  const res = await who.get(`/api/calendar${month ? `?month=${month}` : ''}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

describe('reading times', () => {
  test('clock times in either style, words kept as typed', () => {
    assert.deepEqual(calendar.clockOf('4:00 PM'), { h: 16, m: 0 });
    assert.deepEqual(calendar.clockOf('4 pm'), { h: 16, m: 0 });
    assert.deepEqual(calendar.clockOf('09:30'), { h: 9, m: 30 });
    assert.deepEqual(calendar.clockOf('12:15 am'), { h: 0, m: 15 });
    assert.equal(calendar.clockOf('after lunch'), null);
    assert.equal(calendar.clockOf('25:00'), null);
    assert.equal(calendar.timeLabel('16:05'), '4:05 PM');
    assert.equal(calendar.timeLabel('after lunch'), 'after lunch');
    assert.equal(calendar.dayOf('2026-02-31'), null);
    assert.equal(calendar.dayOf('2026-10-09T10:00:00Z'), '2026-10-09');
  });
});

describe('reminders', () => {
  test('a reminder for just me: mine to see, edit and delete', async () => {
    const asha = await h.signup('Asha');
    const ravi = await h.signup('Ravi');
    await h.connect(asha, ravi);
    const day = plusDays(3);
    const { reminder } = await remind(asha, { title: 'Pay electricity bill', date: day, time: '16:00', priority: 'High', notes: 'Online' });
    assert.equal(reminder.scope, 'self');
    assert.equal(reminder.timeLabel, '4:00 PM');
    assert.equal(reminder.canEdit, true);
    assert.equal(reminder.audience, 'Just me');

    const mine = await asha.get(`/api/reminders?month=${monthOf(day)}`);
    assert.equal(mine.body.count, 1);
    // A contact never sees somebody's own reminder.
    assert.equal((await ravi.get('/api/reminders')).body.count, 0);
    assert.equal((await ravi.get(`/api/reminders/${reminder.id}`)).status, 404);
    assert.equal((await ravi.del(`/api/reminders/${reminder.id}`)).status, 404);

    const edited = await asha.put(`/api/reminders/${reminder.id}`, { title: 'Pay the electricity bill', time: '' });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.reminder.title, 'Pay the electricity bill');
    assert.equal(edited.body.reminder.timed, false);

    const gone = await asha.del(`/api/reminders/${reminder.id}`);
    assert.equal(gone.status, 200);
    assert.equal((await asha.get('/api/reminders')).body.count, 0);
  });

  test('a title and a real day are required', async () => {
    const p = await h.signup('Checker');
    await remind(p, { date: today() }, 400);
    await remind(p, { title: 'No day' }, 400);
    await remind(p, { title: 'Bad day', date: '2026-02-30' }, 400);
  });

  test('specific people: only people I can give work to, who are told at once', async () => {
    const { boss, a, b } = await crew('Rem');
    const stranger = await h.signup('Stranger');
    const day = plusDays(2);
    const { reminder, notified } = await remind(boss, { title: 'Stock count', date: day, time: '5:00 PM', scope: 'users', recipients: [a.id, b.id] });
    assert.equal(notified, 2);
    assert.deepEqual(reminder.recipientIds.sort(), [a.id, b.id].sort());
    assert.ok((await alertTitles(a)).includes('Reminder: Stock count'));

    // They see it as set by someone else, read-only.
    const seen = (await a.get('/api/reminders')).body.reminders.find((r) => r.id === reminder.id);
    assert.ok(seen);
    assert.equal(seen.canEdit, false);
    assert.deepEqual(seen.recipientIds, []);
    assert.equal(seen.setBy.name, boss.name);
    assert.equal((await a.put(`/api/reminders/${reminder.id}`, { title: 'Mine now' })).status, 403);

    const res = await boss.post('/api/reminders', { title: 'Nope', date: day, scope: 'users', recipients: [stranger.id] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /contacts or teams/);
    await remind(boss, { title: 'Nobody', date: day, scope: 'users', recipients: [] }, 400);
  });

  test('people added later are told once; those who had it are not told again', async () => {
    const { boss, a, b } = await crew('Add');
    const day = plusDays(3);
    const { reminder } = await remind(boss, { title: 'Quarterly review', date: day });
    const told = async (who) => (await alertTitles(who)).filter((t) => t === 'Reminder: Quarterly review').length;

    const first = await boss.put(`/api/reminders/${reminder.id}`, { scope: 'users', recipients: [a.id] });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.notified, 1);
    const second = await boss.put(`/api/reminders/${reminder.id}`, { scope: 'users', recipients: [a.id, b.id], notes: 'Bring the numbers' });
    assert.equal(second.body.notified, 1);
    assert.equal(await told(a), 1);
    assert.equal(await told(b), 1);
  });

  test('a team: its owner or admins only, and every member sees it', async () => {
    const owner = await h.signup('Owner');
    const admin = await h.signup('Admin');
    const member = await h.signup('Member');
    const team = await h.makeTeam(owner, [admin, member], { admins: [admin] });
    const day = plusDays(1);
    const { notified } = await remind(admin, { title: 'Team meeting', date: day, scope: 'team', team: team.id });
    assert.equal(notified, 2);
    const forMember = (await member.get('/api/reminders')).body.reminders;
    assert.equal(forMember.length, 1);
    assert.equal(forMember[0].audience, `A team · ${team.name}`);

    const res = await member.post('/api/reminders', { title: 'Not mine to send', date: day, scope: 'team', team: team.id });
    assert.equal(res.status, 403);
    const aim = (await admin.get('/api/reminders')).body.aim;
    assert.deepEqual(aim.teams.map((t) => t.id), [team.id]);
    assert.equal(aim.everyone, false);
  });

  test('everyone: the Super Admin only', async () => {
    const root = await h.root();
    const p = await h.signup('Anyone');
    await remind(p, { title: 'All hands', date: today(), scope: 'everyone' }, 403);
    const { reminder } = await remind(root, { title: 'Server maintenance tonight', date: plusDays(1), time: '11:00 PM', scope: 'everyone' });
    const seen = (await p.get('/api/reminders')).body.reminders.map((r) => r.id);
    assert.ok(seen.includes(reminder.id));
    // The Super Admin may change anyone's reminder.
    const own = await remind(p, { title: 'Personal', date: plusDays(4) });
    assert.equal((await root.put(`/api/reminders/${own.reminder.id}`, { title: 'Personal (edited)' })).status, 200);
  });

  test('it rings once, at its time, for the setter and the audience', async () => {
    const { boss, a } = await crew('Ring');
    const day = plusDays(1);
    const { reminder } = await remind(boss, { title: 'Call the bank', date: day, time: '10:30', scope: 'users', recipients: [a.id] });
    const ringAt = new Date(reminder.ringAt);
    assert.equal(DateTime.fromJSDate(ringAt).setZone(TZ).toFormat('yyyy-MM-dd HH:mm'), `${day} 10:30`);

    const rings = async (who) => (await alertTitles(who)).filter((t) => t === '⏰ Reminder: Call the bank').length;

    await jobs.calendarTick(new Date(ringAt.getTime() - 60 * 1000));
    assert.equal((await Reminder.findById(reminder.id)).rungAt, null);
    assert.equal(await rings(boss), 0);

    await jobs.calendarTick(new Date(ringAt.getTime() + 60 * 1000));
    assert.equal(await rings(boss), 1);
    assert.equal(await rings(a), 1);
    await jobs.calendarTick(new Date(ringAt.getTime() + 2 * 60 * 1000));
    assert.equal(await rings(a), 1);
  });

  test('no time: it rings at the workday start; a long-missed one is settled quietly', async () => {
    const p = await h.signup('Morning');
    const day = plusDays(2);
    const { reminder } = await remind(p, { title: 'Water the plants', date: day });
    assert.equal(DateTime.fromJSDate(new Date(reminder.ringAt)).setZone(TZ).toFormat('HH:mm'), '09:00');

    const late = new Date(new Date(reminder.ringAt).getTime() + DAY);
    await jobs.calendarTick(late);
    assert.ok(!(await alertTitles(p)).some((t) => t.includes('Water the plants')));
    assert.ok((await Reminder.findById(reminder.id)).rungAt);
  });

  test('moving it to a later time rings it again then', async () => {
    const p = await h.signup('Mover');
    const { reminder } = await remind(p, { title: 'Book tickets', date: plusDays(1), time: '9:00 AM' });
    await jobs.calendarTick(new Date(new Date(reminder.ringAt).getTime() + 60 * 1000));
    assert.equal((await alertTitles(p)).filter((t) => t.includes('Book tickets')).length, 1);
    const moved = (await p.put(`/api/reminders/${reminder.id}`, { date: plusDays(2) })).body.reminder;
    assert.equal(moved.rung, false);
    await jobs.calendarTick(new Date(new Date(moved.ringAt).getTime() + 60 * 1000));
    assert.equal((await alertTitles(p)).filter((t) => t.includes('Book tickets')).length, 2);
  });
});

describe('the month', () => {
  test('open tasks on their due day, finished ones on the day they were finished, reminders too', async () => {
    const { boss, a } = await crew('Cal');
    const dueKey = plusDays(5);
    const due = DateTime.fromISO(`${dueKey}T15:00`, { zone: TZ }).toJSDate();
    const open = await give(boss, { title: 'Prepare the quote', assignees: [a.id], dueDate: due.toISOString() });
    const mineToDo = await give(a, { title: 'Clean the desk', dueDate: due.toISOString() });
    const finished = await give(a, { title: 'File the receipts', dueDate: new Date(Date.now() + 10 * DAY).toISOString() });
    assert.equal((await move(a, finished._id, 'COMPLETED', 'Filed')).status, 200);
    await remind(a, { title: 'Dentist', date: dueKey, time: '6:30 PM' });

    const todayKey = today();
    const forA = await feed(a, monthOf(dueKey));
    const forAToday = monthOf(dueKey) === monthOf(todayKey) ? forA : await feed(a, monthOf(todayKey));

    const quote = forA.events.find((e) => e.meta.taskId === open._id);
    assert.ok(quote, 'the task given to me shows');
    assert.equal(quote.type, 'task');
    assert.equal(quote.date, dueKey);
    assert.equal(quote.meta.time, '3:00 PM');
    assert.equal(quote.meta.setBy, boss.name);
    assert.ok(forA.events.some((e) => e.meta.taskId === mineToDo._id && e.type === 'task'));
    const dentist = forA.events.find((e) => e.label === 'Dentist');
    assert.equal(dentist.type, 'reminder');
    assert.equal(dentist.meta.time, '6:30 PM');

    const filed = forAToday.events.find((e) => e.meta.taskId === finished._id);
    assert.ok(filed, 'the finished task shows on the day it was finished');
    assert.equal(filed.type, 'done');
    assert.equal(filed.date, todayKey);

    // The setter sees what they gave; the doer's reminder is the doer's alone.
    const forBoss = await feed(boss, monthOf(dueKey));
    const given = forBoss.events.find((e) => e.meta.taskId === open._id);
    assert.ok(given);
    assert.equal(given.meta.given, true);
    assert.equal(given.meta.assignedTo, a.name);
    assert.ok(!forBoss.events.some((e) => e.label === 'Dentist'));
  });

  test('a task I declined leaves my calendar', async () => {
    const { boss, a } = await crew('Decl');
    const task = await give(boss, { title: 'Not for me', assignees: [a.id], dueDate: new Date(Date.now() + 2 * DAY).toISOString() });
    assert.equal((await act(a, task._id, 'decline', { reason: 'On leave' })).status, 200);
    const month = monthOf(DateTime.fromJSDate(new Date(Date.now() + 2 * DAY)).setZone(TZ).toISODate());
    assert.ok(!(await feed(a, month)).events.some((e) => e.meta.taskId === task._id));
  });

  test('the unread count catches up on reminders that are due', async () => {
    const p = await h.signup('Poller');
    const r = await Reminder.create({ title: 'Overdue ring', day: today(), createdBy: p.id, createdByName: p.name, ringAt: new Date(Date.now() - 60 * 1000) });
    const res = await p.get('/api/notifications/unread-count');
    assert.equal(res.status, 200);
    assert.ok((await Reminder.findById(r._id)).rungAt);
    assert.ok((await alertTitles(p)).includes('⏰ Reminder today: Overdue ring'));
  });
});
