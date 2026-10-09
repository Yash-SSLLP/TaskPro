const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers');
const { give, act, move } = require('./task-helpers');
const { describe: words } = require('../src/platform/services/describe');

before(h.start);
after(h.stop);

const Log = () => mongoose.model('ActivityLog');

/** Every row matching, newest first, through the API. */
async function feed(root, query = '') {
  const res = await root.get(`/api/platform/activity${query}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.items;
}

describe('describe()', () => {
  test('turns rows into sentences with a badge', () => {
    const accepted = words({
      action: 'task.accepted',
      actorName: 'Asha Rao',
      target: { kind: 'task', id: 'x', label: 'TSK-2026-00008 Check delivery schedule' },
      meta: { kind: 'ACCEPTED' },
    });
    assert.equal(accepted.summary, 'Asha Rao accepted the task “TSK-2026-00008 Check delivery schedule”.');
    assert.deepEqual(accepted.badge, { text: 'Accepted', tone: 'good' });
    assert.equal(accepted.actorLabel, 'Asha Rao');

    const login = words({ action: 'auth.login', actorName: 'Ravi Test', platform: 'android', meta: { platform: 'android', appVersion: '1.0.3' } });
    assert.equal(login.summary, 'Ravi Test signed in on Android (KARO 1.0.3).');
    const web = words({ action: 'auth.login', actorName: 'Ravi Test', meta: { platform: 'web', deviceName: 'Chrome on Windows', appVersion: '1.0.0' } });
    assert.equal(web.summary, 'Ravi Test signed in on the web (Chrome on Windows).');

    const failed = words({ action: 'auth.login_failed', meta: { reason: 'wrong_password', identifier: 'ravi@example.com' }, target: { kind: 'user', id: 'u', label: 'Ravi Test' } });
    assert.equal(failed.summary, 'Someone tried to sign in as Ravi Test (ravi@example.com) — wrong password.');
    assert.equal(failed.badge.tone, 'bad');
    assert.equal(failed.actorLabel, 'Someone');

    const deleted = words({ action: 'admin.user_deleted', actorName: 'Super Admin', target: { kind: 'user', id: 'p', label: 'Priya' } });
    assert.equal(deleted.summary, "Super Admin deleted Priya's account.");

    const moved = words({ action: 'task.status', actorName: 'Asha', target: { kind: 'task', id: 't', label: 'TSK-1 Go' }, meta: { kind: 'STATUS', from: 'PENDING', fromLabel: 'Pending', to: 'IN_PROGRESS', toLabel: 'In progress' } });
    assert.equal(moved.summary, 'Asha moved the task “TSK-1 Go” from Pending to In progress.');
    const system = words({ action: 'task.overdue', meta: { kind: 'OVERDUE', system: true }, target: { kind: 'task', id: 't', label: 'TSK-1 Go' } });
    assert.equal(system.summary, 'The task “TSK-1 Go” is now overdue.');
    assert.equal(system.actorLabel, 'KARO');

    const profile = words({ action: 'profile.updated', actor: 'u', actorName: 'Ravi', target: { kind: 'user', id: 'u', label: 'Ravi' }, meta: { changes: [{ field: 'name', before: 'Ravi', after: 'Ravi K' }] } });
    assert.equal(profile.summary, 'Ravi changed their name from “Ravi” to “Ravi K”.');
    assert.match(words({ action: 'something.new', actorName: 'X' }).summary, /^X: something new\.$/);
  });
});

describe('the activity log', () => {
  test('sign-ins, failed sign-ins and sign-outs are logged, without passwords', async () => {
    const root = await h.root();
    const me = await h.signup('Logger');
    const ok = await h.request().post('/api/auth/login').set({ 'X-Platform': 'android', 'X-App-Version': '1.0.3', 'User-Agent': 'okhttp/4.12.0' }).send({ identifier: me.identifier, password: 'password123' });
    assert.equal(ok.status, 200);
    await h.request().post('/api/auth/login').send({ identifier: me.identifier, password: 'not-the-password' });
    await h.request().post('/api/auth/login').send({ identifier: 'nobody-here@example.com', password: 'whatever-1' });
    await h.request().post('/api/auth/login').send({ identifier: 'secretpass99', password: 'whatever-1' });
    await h.client(ok.body.token).post('/api/auth/logout');

    const mine = await feed(root, `?user=${me.id}&group=auth`);
    const actions = mine.map((r) => r.action);
    assert.ok(actions.includes('auth.signup'));
    assert.ok(actions.includes('auth.login'));
    assert.ok(actions.includes('auth.logout'));
    const login = mine.find((r) => r.action === 'auth.login');
    assert.equal(login.summary, `${me.name} signed in on Android (KARO 1.0.3).`);
    assert.equal(login.platform, 'android');

    const wrong = mine.find((r) => r.action === 'auth.login_failed');
    assert.equal(wrong.summary, `Someone tried to sign in as ${me.name} (${me.identifier}) — wrong password.`);
    assert.equal(wrong.actor, null);

    const failures = await feed(root, '?q=…&group=auth');
    const unknown = failures.find((r) => r.meta.identifier === 'no…@example.com');
    assert.ok(unknown, 'a login that matches nobody is kept only in part');
    assert.equal(unknown.meta.reason, 'no_account');
    assert.match(unknown.summary, /there is no such account/);
    const typo = failures.find((r) => r.meta.identifier === 'se…');
    assert.ok(typo, 'something that may be a password is never kept whole');

    const raw = await Log().find({}).lean();
    assert.ok(!JSON.stringify(raw).includes('not-the-password'));
    assert.ok(!JSON.stringify(raw).includes('secretpass99'));
  });

  test('every task history row is mirrored, worded with the task code and title', async () => {
    const root = await h.root();
    const boss = await h.signup('Boss');
    const doer = await h.signup('Doer');
    await h.connect(boss, doer);
    const task = await give(boss, { title: 'Check delivery schedule', assignees: [doer.id] });
    assert.equal((await act(doer, task._id, 'accept', {})).status, 200);
    assert.equal((await move(doer, task._id, 'SUBMITTED', 'All checked')).status, 200);
    assert.equal((await move(boss, task._id, 'COMPLETED', 'Great')).status, 200);

    // Written before the response: nothing is left to run afterwards.
    const rows = await feed(root, `?group=tasks&q=${encodeURIComponent('Check delivery')}`);
    const byAction = Object.fromEntries(rows.map((r) => [r.action, r]));
    const label = `${task.code} Check delivery schedule`;
    assert.equal(byAction['task.created'].summary, `${boss.name} created the task “${label}”.`);
    assert.equal(byAction['task.accepted'].summary, `${doer.name} accepted the task “${label}”.`);
    assert.equal(byAction['task.submitted'].summary, `${doer.name} handed in the task “${label}” for review.`);
    assert.equal(byAction['task.approved'].summary, `${boss.name} approved the task “${label}”.`);
    assert.equal(byAction['task.approved'].badge.tone, 'good');
    assert.equal(byAction['task.accepted'].target.id, String(task._id));
    assert.equal(byAction['task.accepted'].actor, doer.id);
    assert.equal(byAction['task.accepted'].actorRole, 'user');

    // The welcome task is the system's own.
    const welcome = (await feed(root, `?group=tasks&q=${encodeURIComponent('Welcome to KARO')}`))[0];
    assert.equal(welcome.actorLabel, 'KARO');
    assert.equal(welcome.actor, null);

    // The detail view brings the task's other rows.
    const detail = await root.get(`/api/platform/activity/${byAction['task.accepted'].id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.entry.action, 'task.accepted');
    assert.ok(detail.body.related.some((r) => r.action === 'task.approved'));
    assert.equal(detail.body.actor.id, doer.id);
  });

  test('profile edits, contacts and teams are logged', async () => {
    const root = await h.root();
    const a = await h.signup('Profile');
    const b = await h.signup('Friend');
    assert.equal((await a.patch('/api/auth/profile', { name: 'Profile Renamed', title: 'Accounts' })).status, 200);
    await h.connect(a, b);
    const team = await h.makeTeam(a, [b], { name: 'Logged team' });
    await a.del(`/api/teams/${team.id}`);

    const rows = await feed(root, `?user=${a.id}&group=people`);
    const profile = rows.find((r) => r.action === 'profile.updated');
    assert.equal(profile.summary, 'Profile Renamed changed their name and job title.');
    assert.deepEqual(profile.meta.changes.map((c) => c.field), ['name', 'title']);
    const actions = rows.map((r) => r.action);
    for (const x of ['contact.requested', 'team.created', 'team.invited', 'team.deleted']) assert.ok(actions.includes(x), x);
    assert.ok((await feed(root, `?user=${b.id}`)).some((r) => r.action === 'contact.accepted' && r.target.id === a.id));
    assert.ok((await feed(root, `?user=${b.id}`)).some((r) => r.action === 'team.joined'));
  });

  test('profile photos are logged, and rows carry the actor\'s photo', async () => {
    const root = await h.root();
    const me = await h.signup('Photographed');
    const photo = [{ field: 'photo', buffer: h.PNG, filename: 'me.png', contentType: 'image/png' }];
    assert.equal((await me.multipart('put', '/api/me/photo', {}, photo)).status, 200);
    assert.equal((await me.multipart('put', '/api/me/photo', {}, photo)).status, 200);
    assert.equal((await me.del('/api/me/photo')).status, 200);
    const rows = await feed(root, `?user=${me.id}&group=people`);
    const actions = rows.map((r) => r.action);
    assert.deepEqual(actions.slice(0, 3), ['profile.photo_removed', 'profile.photo_changed', 'profile.photo_added']);
    assert.equal(rows[2].summary, `${me.name} added a profile photo.`);
    assert.equal(rows[0].summary, `${me.name} removed their profile photo.`);

    await me.multipart('put', '/api/me/photo', {}, photo);
    const latest = (await feed(root, `?user=${me.id}&group=people`))[0];
    assert.ok(latest.actorPhotoUrl, 'the actor shows with their photo');
  });

  test('pages newest first with a cursor, and filters by group, person, text and date', async () => {
    const root = await h.root();
    const busy = await h.signup('Busy');
    for (let i = 0; i < 7; i += 1) await busy.patch('/api/auth/profile', { title: `Title ${i}` });

    const seen = [];
    let next = '';
    let pages = 0;
    do {
      const res = await root.get(`/api/platform/activity?user=${busy.id}&limit=3${next ? `&before=${encodeURIComponent(next)}` : ''}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.items.length <= 3);
      seen.push(...res.body.items);
      next = res.body.next;
      pages += 1;
    } while (next && pages < 10);
    assert.ok(pages >= 3);
    assert.equal(new Set(seen.map((r) => r.id)).size, seen.length, 'no row twice');
    const total = await Log().countDocuments({ $or: [{ actor: new mongoose.Types.ObjectId(busy.id) }, { 'target.id': busy.id }] });
    assert.equal(seen.length, total, 'every row once');
    for (let i = 1; i < seen.length; i += 1) assert.ok(new Date(seen[i - 1].at) >= new Date(seen[i].at), 'newest first');

    // Filters.
    assert.ok((await feed(root, '?group=auth')).every((r) => r.group === 'auth'));
    assert.ok((await feed(root, '?group=people&q=Busy')).every((r) => /Busy/.test(r.actorName + r.target?.label)));
    const today = new Date().toISOString().slice(0, 10);
    assert.ok((await feed(root, `?user=${busy.id}&from=2000-01-01&to=2999-12-31`)).length > 0);
    assert.equal((await feed(root, `?user=${busy.id}&to=2000-01-01`)).length, 0);
    assert.ok(today);
    assert.equal((await root.get('/api/platform/activity?group=nope')).status, 400);
    assert.equal((await root.get('/api/platform/activity?user=nope')).status, 400);
    assert.equal((await root.get('/api/platform/activity?from=yesterdayish')).status, 400);
    const big = await root.get('/api/platform/activity?limit=5000');
    assert.ok(big.body.items.length <= 200);
  });

  test('the numbers at the top of the log', async () => {
    const root = await h.root();
    await h.signup('Counted');
    const res = await root.get('/api/platform/activity/stats');
    assert.equal(res.status, 200);
    for (const k of ['today', 'week', 'people', 'total']) assert.equal(typeof res.body[k], 'number', k);
    assert.ok(res.body.today >= 1);
    assert.ok(res.body.week >= res.body.today);
    assert.ok(res.body.people >= 1);
  });

  test('a logging failure never fails the request', async () => {
    const activity = require('../src/platform/services/activity');
    const ok = await activity.record({ action: '' });
    assert.equal(ok, null);
    const Model = Log();
    const original = Model.create;
    Model.create = async () => {
      throw new Error('disk full');
    };
    try {
      const a = await h.signup('Unlogged');
      assert.equal((await a.patch('/api/auth/profile', { title: 'Still saved' })).status, 200);
    } finally {
      Model.create = original;
    }
  });

  test('people cannot read the log', async () => {
    const a = await h.signup('Nosy log');
    assert.equal((await a.get('/api/platform/activity')).status, 403);
    assert.equal((await a.get('/api/platform/activity/stats')).status, 403);
  });
});
