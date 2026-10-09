/**
 * Live updates: GET /api/live, and which writes move whose numbers.
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { DAY, inMs, give, act, move } = require('./task-helpers');
const live = require('../src/platform/live');
const LiveVersion = require('../src/platform/live/LiveVersion');
const Task = require('../src/product/models/Task');
const User = require('../src/platform/models/User');
const Counter = require('../src/platform/models/Counter');
const { notify } = require('../src/platform/services/notify');

before(h.start);
after(h.stop);

const versions = async (who) => {
  const res = await who.get('/api/live');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.v;
};

/** Which of a person's topics moved between two readings. */
const moved = (was, now) => Object.keys(now).filter((k) => now[k] !== was[k]).sort();

/** Read until a topic moves (a notification can land a moment after its answer). */
async function untilMoved(who, was, topic, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    const now = await versions(who);
    if (now[topic] !== was[topic] || Date.now() > end) return now;
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('GET /api/live', () => {
  test('answers four numbers and the unread count, never cached', async () => {
    const p = await h.signup('Live');
    const res = await p.get('/api/live');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.v).sort(), ['alerts', 'calendar', 'people', 'tasks']);
    assert.equal(typeof res.body.unread, 'number');
    assert.ok(res.body.at);
    assert.match(res.headers['cache-control'], /no-store/);
    assert.equal((await h.request().get('/api/live')).status, 401);
  });

  test('includes the bell count', async () => {
    const { boss, a } = await crewOf('Bell');
    await give(boss, { title: 'Ring my bell', assignees: [a.id] });
    const was = (await a.get('/api/notifications/unread-count')).body.unread;
    let res;
    for (let i = 0; i < 40; i += 1) {
      res = await a.get('/api/live');
      if (res.body.unread === (await a.get('/api/notifications/unread-count')).body.unread && res.body.unread > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(res.body.unread >= 1 && res.body.unread >= was);
    assert.equal(res.body.unread, (await a.get('/api/notifications/unread-count')).body.unread);
  });
});

/** A setter with a contact, plus somebody who has nothing to do with them. */
async function crewOf(label) {
  const boss = await h.signup(`${label} Boss`);
  const a = await h.signup(`${label} A`);
  const stranger = await h.signup(`${label} Stranger`);
  await h.connect(boss, a);
  return { boss, a, stranger };
}

describe('who hears about a task', () => {
  test('a change reaches everyone on the task, and nobody else', async () => {
    const { boss, a, stranger } = await crewOf('Reach');
    const [b0, a0, s0] = await Promise.all([versions(boss), versions(a), versions(stranger)]);

    const t = await give(boss, { title: 'Shared work', assignees: [a.id], dueDate: inMs(2 * DAY) });
    const [b1, a1, s1] = await Promise.all([versions(boss), versions(a), versions(stranger)]);
    assert.ok(moved(b0, b1).includes('tasks') && moved(b0, b1).includes('calendar'));
    assert.ok(moved(a0, a1).includes('tasks') && moved(a0, a1).includes('calendar'));
    assert.deepEqual(moved(s0, s1), []);

    // The doer's answer reaches the setter.
    assert.equal((await act(a, t._id, 'accept')).status, 200);
    const b2 = await versions(boss);
    assert.ok(moved(b1, b2).includes('tasks'));
    assert.deepEqual(moved(s1, await versions(stranger)), []);
  });

  test('a remark reaches everyone who can see the task', async () => {
    const { boss, a, stranger } = await crewOf('Remark');
    const t = await give(boss, { title: 'Talk about it', assignees: [a.id] });
    const [b0, s0] = await Promise.all([versions(boss), versions(stranger)]);
    const res = await a.post(`/api/tasks/${t._id}/updates`, { note: 'On it' });
    assert.equal(res.status, 201);
    assert.ok(moved(b0, await versions(boss)).includes('tasks'));
    assert.deepEqual(moved(s0, await versions(stranger)), []);
  });

  test('the number has moved by the time the answer arrives (recorded before it is sent)', async () => {
    const { boss, a } = await crewOf('Flush');
    const t = await give(boss, { title: 'Before the answer', assignees: [a.id] });
    const key = live.userKey(a.id, 'tasks');
    const v0 = (await LiveVersion.findById(key).lean())?.v || 0;
    // Slow the recording down: if it were left for after the answer, the read
    // straight after the answer could not see it.
    const real = LiveVersion.bulkWrite;
    LiveVersion.bulkWrite = async function slowBulkWrite(...args) {
      await new Promise((r) => setTimeout(r, 300));
      return real.apply(this, args);
    };
    try {
      const started = Date.now();
      const res = await boss.patch(`/api/tasks/${t._id}`, { title: 'Before the answer, renamed' });
      assert.equal(res.status, 200);
      assert.ok(Date.now() - started >= 300, 'the answer waited for the recording');
      assert.equal((await LiveVersion.findById(key).lean()).v, v0 + 1);
    } finally {
      LiveVersion.bulkWrite = real;
    }
  });

  test('somebody taken off a task hears it go', async () => {
    const { boss, a, stranger } = await crewOf('Transfer');
    await h.connect(boss, stranger);
    const t = await give(boss, { title: 'Wrong person', assignees: [a.id] });
    const [a0, s0] = await Promise.all([versions(a), versions(stranger)]);
    const res = await act(boss, t._id, 'transfer', { to: stranger.id, reason: 'Their area' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(moved(a0, await versions(a)).includes('tasks'), 'the person who lost it');
    assert.ok(moved(s0, await versions(stranger)).includes('tasks'), 'the person who got it');
  });

  test('a team task reaches the team’s owner, who is not on it', async () => {
    const owner = await h.signup('Team Owner');
    const setter = await h.signup('Team Setter');
    const doer = await h.signup('Team Doer');
    const team = await h.makeTeam(owner, [setter, doer]);
    const o0 = await versions(owner);
    await give(setter, { title: 'Filed under the team', assignees: [doer.id], team: team.id });
    assert.ok(moved(o0, await versions(owner)).includes('tasks'));
  });

  test('the Super Admin hears about every task', async () => {
    const root = await h.root();
    const { boss, a } = await crewOf('Admin');
    const r0 = await versions(root);
    const t = await give(boss, { title: 'Somewhere else', assignees: [a.id] });
    const r1 = await versions(root);
    assert.ok(moved(r0, r1).includes('tasks'));
    await move(a, t._id, 'IN_PROGRESS', 'Started');
    assert.ok(moved(r1, await versions(root)).includes('tasks'));
  });

  test('a write outside any request still counts; bookkeeping alone does not', async () => {
    const { boss, a } = await crewOf('Loose');
    const t = await give(boss, { title: 'Touched by a job', assignees: [a.id] });
    const a0 = await versions(a);

    await Task.updateOne({ _id: t._id }, { $set: { overdueNotifiedAt: new Date() }, $addToSet: { firedReminders: 'x' } });
    await live.idle();
    assert.deepEqual(moved(a0, await versions(a)), [], 'a job stamp is not news');

    await Task.updateOne({ _id: t._id }, { $set: { title: 'Renamed by a script' } });
    await live.idle();
    const a1 = await versions(a);
    assert.ok(moved(a0, a1).includes('tasks'));

    const doc = await Task.findById(t._id);
    doc.priority = 'Urgent';
    await doc.save();
    await live.idle();
    assert.ok(moved(a1, await versions(a)).includes('tasks'));
  });
});

describe('alerts, calendar and people', () => {
  test('an alert moves only its recipient’s number', async () => {
    const { boss, a, stranger } = await crewOf('Alert');
    const [a0, b0, s0] = await Promise.all([versions(a), versions(boss), versions(stranger)]);
    await notify([a.id], { title: 'Just for A' });
    await live.idle();
    assert.deepEqual(moved(a0, await versions(a)), ['alerts']);
    assert.deepEqual(moved(b0, await versions(boss)), []);
    assert.deepEqual(moved(s0, await versions(stranger)), []);

    // Through the API: being given a task rings the bell.
    const a1 = await versions(a);
    await give(boss, { title: 'Ring', assignees: [a.id] });
    assert.ok(moved(a1, await untilMoved(a, a1, 'alerts')).includes('alerts'));

    // Reading them moves it too (the count on another device drops).
    const a2 = await versions(a);
    assert.equal((await a.post('/api/notifications/read', { all: true })).status, 200);
    const a3 = await versions(a);
    assert.ok(moved(a2, a3).includes('alerts'));
    assert.equal((await a.get('/api/live')).body.unread, 0);
  });

  test('a reminder reaches its setter and the people it is aimed at', async () => {
    const { boss, a, stranger } = await crewOf('Remind');
    const [b0, a0, s0] = await Promise.all([versions(boss), versions(a), versions(stranger)]);
    const res = await boss.post('/api/reminders', { title: 'Stand-up', date: '2031-05-04', time: '10:00', scope: 'users', recipients: [a.id] });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(moved(b0, await versions(boss)).includes('calendar'));
    assert.ok(moved(a0, await versions(a)).includes('calendar'));
    assert.deepEqual(moved(s0, await versions(stranger)), []);

    const a1 = await versions(a);
    assert.equal((await boss.del(`/api/reminders/${res.body.reminder.id}`)).status, 200);
    assert.ok(moved(a1, await versions(a)).includes('calendar'), 'deleting it reaches them too');
  });

  test('contacts move their two people; a profile’s public fields move everyone; "last seen" moves nobody', async () => {
    const x = await h.signup('People X');
    const y = await h.signup('People Y');
    const z = await h.signup('People Z');
    const [x0, y0, z0] = await Promise.all([versions(x), versions(y), versions(z)]);
    await h.connect(x, y);
    assert.ok(moved(x0, await versions(x)).includes('people'));
    assert.ok(moved(y0, await versions(y)).includes('people'));
    assert.deepEqual(moved(z0, await versions(z)), []);

    const z1 = await versions(z);
    await User.updateOne({ _id: x.id }, { $set: { lastSeenAt: new Date(), lastLoginAt: new Date() } });
    await live.idle();
    assert.deepEqual(moved(z1, await versions(z)), []);
    await User.updateOne({ _id: x.id }, { $set: { title: 'Accounts' } });
    await live.idle();
    assert.deepEqual(moved(z1, await versions(z)), ['people']);
  });

  test('models with no rule never bump anything', async () => {
    const before = live.stats.bumps;
    await Counter.findOneAndUpdate({ _id: 'live-test' }, { $inc: { seq: 1 } }, { upsert: true, new: true });
    await live.idle();
    assert.equal(live.stats.bumps, before);
  });
});

describe('telling news from bookkeeping', () => {
  const { touchedPaths, matters, movesAudience } = require('../src/platform/live/plugin');
  const { RULES } = require('../src/platform/live/rules');

  test('which writes matter, and which can change who sees a row', () => {
    assert.deepEqual(touchedPaths({ $set: { 'nudgeAt.DOER': 1, title: 'x' }, $inc: { rev: 1 } }).sort(), ['nudgeAt', 'rev', 'title']);
    assert.equal(touchedPaths([{ $set: { a: 1 } }]), null, 'a pipeline: cannot tell');
    assert.equal(matters(RULES.Task, ['rev', 'updatedAt']), false);
    assert.equal(matters(RULES.Task, ['firedReminders', 'overdueNotifiedAt']), false);
    assert.equal(matters(RULES.Task, ['title']), true);
    assert.equal(matters(RULES.User, ['lastSeenAt', 'settings', 'tokenVersion']), false);
    assert.equal(matters(RULES.User, ['photo']), true);
    assert.equal(movesAudience(RULES.Task, ['assignees.$.acceptance', 'rev']), false);
    assert.equal(movesAudience(RULES.Task, ['assignees.$[a].name']), false);
    assert.equal(movesAudience(RULES.Task, ['assignees']), true);
    assert.equal(movesAudience(RULES.Task, ['assignees.0.user']), true);
    assert.equal(movesAudience(RULES.Task, ['loopUsers']), true);
    assert.equal(movesAudience(RULES.Task, null), true);
  });
});
