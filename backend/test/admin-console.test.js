const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers');
const { give, detail } = require('./task-helpers');

before(h.start);
after(h.stop);

const login = (identifier, password, headers = {}) => h.request().post('/api/auth/login').set(headers).send({ identifier, password });

describe('adding people', () => {
  test('the Super Admin adds someone with a temporary password they must change', async () => {
    const root = await h.root();
    const res = await root.post('/api/platform/users', { name: 'Priya Shah', email: 'priya@example.com', title: 'Accounts' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { user, temporaryPassword } = res.body;
    assert.equal(user.name, 'Priya Shah');
    assert.equal(user.title, 'Accounts');
    assert.equal(user.email, 'priya@example.com');
    assert.equal(user.role, 'user');
    assert.ok(user.pin, 'a Task Pin, like anyone who signs up');
    assert.equal(user.mustChangePassword, true);
    assert.match(temporaryPassword, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);

    // Exactly like sign-up: the welcome task is waiting.
    const signedIn = await login('priya@example.com', temporaryPassword);
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.user.mustChangePassword, true);
    const c = h.client(signedIn.body.token);
    assert.equal((await c.get('/api/tasks')).body.code, 'PASSWORD_CHANGE_REQUIRED');
    const changed = await c.post('/api/auth/change-password', { newPassword: 'priya-own-pass-1' });
    assert.equal(changed.status, 200);
    const tasks = (await h.client(changed.body.token).get('/api/tasks')).body.tasks;
    assert.ok(tasks.some((t) => /Welcome/.test(t.title)));

    // Logged.
    const log = (await root.get(`/api/platform/activity?user=${user.id}&group=admin`)).body.items;
    assert.equal(log[0].action, 'admin.user_created');
    assert.equal(log[0].summary, `${root.name} added Priya Shah (priya@example.com) with a temporary password.`);
  });

  test('a chosen password, a mobile number or a username work too; mistakes are explained', async () => {
    const root = await h.root();
    const mine = await root.post('/api/platform/users', { name: 'Field Staff', username: 'field.staff', phone: '98111 22334', password: 'chosen-pass-1' });
    assert.equal(mine.status, 201);
    assert.equal(mine.body.temporaryPassword, 'chosen-pass-1');
    assert.equal(mine.body.user.phone, '919811122334');
    assert.equal((await login('field.staff', 'chosen-pass-1')).status, 200);

    const none = await root.post('/api/platform/users', { name: 'No login' });
    assert.equal(none.status, 400);
    assert.match(none.body.error, /email, a mobile number or a username/);
    const dupEmail = await root.post('/api/platform/users', { name: 'Dup', email: 'PRIYA@example.com' });
    assert.equal(dupEmail.status, 409);
    assert.equal(dupEmail.body.error, 'An account with this email already exists');
    const dupPhone = await root.post('/api/platform/users', { name: 'Dup', phone: '+91 98111 22334' });
    assert.equal(dupPhone.status, 409);
    assert.equal(dupPhone.body.error, 'An account with this mobile number already exists');
    assert.equal((await root.post('/api/platform/users', { name: 'Bad', email: 'not-an-email' })).status, 400);
    assert.equal((await root.post('/api/platform/users', { name: 'Short', email: 'short@example.com', password: 'abc' })).status, 400);
    assert.equal((await root.post('/api/platform/users', { email: 'noname@example.com' })).status, 400);
  });
});

describe('deleting people', () => {
  test('deletes the account the way self-service does, after typing DELETE', async () => {
    const root = await h.root();
    const leaver = await h.signup('Leaver');
    const friend = await h.signup('Friend');
    await h.connect(leaver, friend);
    const own = await give(leaver, { title: 'Only mine' });
    const shared = await give(leaver, { title: 'For my friend', assignees: [friend.id] });

    assert.equal((await root.del(`/api/platform/users/${leaver.id}`)).status, 400, 'needs the typed confirmation');
    assert.equal((await root.del(`/api/platform/users/${leaver.id}`, { confirm: 'delete it' })).status, 400);
    const res = await root.del(`/api/platform/users/${leaver.id}`, { confirm: 'DELETE' });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    assert.equal((await leaver.get('/api/auth/me')).status, 401, 'signed out');
    assert.equal((await login(leaver.identifier, 'password123')).status, 401, 'the login is gone');
    assert.equal(await mongoose.model('Session').countDocuments({ user: leaver.id, revokedAt: null }), 0);
    assert.equal(await mongoose.model('Task').countDocuments({ _id: own._id }), 0, 'their own task went');
    assert.equal((await detail(friend, shared._id)).task.createdByName, 'Deleted user', 'shared work stays');
    assert.equal((await friend.get('/api/contacts')).body.contacts.length, 0);

    // Gone from the console: the empty shell is not a person.
    assert.equal((await root.get(`/api/platform/users/${leaver.id}`)).status, 404);
    assert.equal((await root.patch(`/api/platform/users/${leaver.id}`, { status: 'active' })).status, 404);
    assert.equal((await root.del(`/api/platform/users/${leaver.id}`, { confirm: 'DELETE' })).status, 404);
    const listed = (await root.get('/api/platform/users')).body.users.map((u) => u.id);
    assert.ok(!listed.includes(leaver.id));

    const log = (await root.get(`/api/platform/activity?user=${leaver.id}&group=admin`)).body.items;
    assert.equal(log[0].action, 'admin.user_deleted');
    assert.equal(log[0].summary, `${root.name} deleted ${leaver.name}'s account.`);
  });

  test('not yourself, and never a Super Admin', async () => {
    const root = await h.root();
    const self = await root.del(`/api/platform/users/${root.id}`, { confirm: 'DELETE' });
    assert.equal(self.status, 400);
    const User = mongoose.model('User');
    const other = new User({ name: 'Second Admin', username: 'second.admin', role: 'superadmin' });
    await other.setPassword('second-admin-1');
    await other.save();
    const res = await root.del(`/api/platform/users/${other._id}`, { confirm: 'DELETE' });
    assert.equal(res.status, 403);
    assert.ok(await User.findOne({ _id: other._id, deletedAt: null }));
  });
});

describe('a person, in full', () => {
  test('devices, app version, notification settings and recent activity', async () => {
    const root = await h.root();
    const me = await h.signup('Detailed');
    const android = { 'X-Platform': 'android', 'X-App-Version': '1.0.3', 'X-App-Build': '4', 'X-Device-Name': 'Pixel 7', 'X-Push-Permission': 'granted', 'User-Agent': 'okhttp/4.12.0' };
    assert.equal((await login(me.identifier, 'password123', android)).status, 200);

    const res = await root.get(`/api/platform/users/${me.id}`);
    assert.equal(res.status, 200);
    const b = res.body;
    assert.ok(b.lastLoginAt);
    assert.ok(b.user.lastLoginAt);
    assert.equal(b.sessions.length, 2, 'sign-up and the phone');
    const phone = b.sessions.find((s) => s.platform === 'android');
    assert.equal(phone.appVersion, '1.0.3');
    assert.equal(phone.deviceName, 'Pixel 7');
    assert.equal(phone.online, true);
    assert.ok(phone.sid);
    assert.equal(b.online, true);
    assert.equal(b.app.state, 'app');
    assert.equal(b.app.appBuild, '4');
    assert.equal(b.notifications.dailyDigest, true);
    assert.equal(b.notifications.dailyDigestAt, '18:00');
    assert.equal(b.notifications.timezone, 'Asia/Kolkata');
    assert.equal(b.notifications.lang, 'en');
    assert.equal(b.notifications.pushPermission, 'granted');
    assert.equal(b.notifications.devices, 0);
    assert.ok(Array.isArray(b.notifications.defaultReminders));
    assert.ok(b.recent.some((r) => r.action === 'auth.login'));
    assert.ok(b.recent.every((r) => r.summary && r.badge));
  });

  test('the Super Admin changes someone\'s notification settings', async () => {
    const root = await h.root();
    const me = await h.signup('Notified');
    const res = await root.patch(`/api/platform/users/${me.id}/settings`, {
      dailyDigest: false,
      dailyDigestAt: '19:30',
      defaultReminders: [{ channel: 'APP', when: 'BEFORE', amount: 2, unit: 'HOURS' }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.notifications.dailyDigest, false);
    assert.equal(res.body.notifications.dailyDigestAt, '19:30');
    assert.equal(res.body.notifications.defaultReminders[0].amount, 2);

    // The person sees it as their own settings.
    const theirs = (await me.get('/api/me/settings')).body.settings;
    assert.equal(theirs.dailyDigest, false);
    assert.equal(theirs.dailyDigestAt, '19:30');
    assert.equal(theirs.timezone, 'Asia/Kolkata', 'the rest is untouched');

    assert.equal((await root.patch(`/api/platform/users/${me.id}/settings`, { timezone: 'Asia/Dubai' })).status, 400, 'only notification settings');
    assert.equal((await root.patch(`/api/platform/users/${me.id}/settings`, { dailyDigestAt: '7pm' })).status, 400);
    assert.equal((await root.patch(`/api/platform/users/${me.id}/settings`, { defaultReminders: [{ when: 'SOON' }] })).status, 400);

    const log = (await root.get(`/api/platform/activity?user=${me.id}&group=admin`)).body.items[0];
    assert.equal(log.action, 'admin.settings_changed');
    assert.equal(log.summary, `${root.name} changed ${me.name}'s notification settings (daily summary: off; daily summary time: 19:30; default reminders: 2 hours before).`);
  });
});

describe('app versions and the overview', () => {
  test('which app each person is on', async () => {
    const root = await h.root();
    const onApp = await h.signup('On app');
    const webOnly = await h.signup('Web only');
    const oldApp = await h.signup('Old app');
    const nowhere = await h.signup('Nowhere');
    const Session = mongoose.model('Session');
    // Only the devices under test count.
    await Session.updateMany({ user: { $in: [onApp.id, webOnly.id, oldApp.id, nowhere.id] } }, { $set: { revokedAt: new Date() } });
    await login(onApp.identifier, 'password123', { 'X-Platform': 'android', 'X-App-Version': '1.0.3', 'X-App-Build': '4', 'User-Agent': 'okhttp/4.12.0' });
    await login(onApp.identifier, 'password123', { 'X-Platform': 'web', 'X-Device-Name': 'Firefox on Linux' });
    await login(webOnly.identifier, 'password123', { 'X-Platform': 'web', 'X-App-Version': '1.0.0', 'X-Device-Name': 'Chrome on Windows' });
    await login(oldApp.identifier, 'password123', { 'User-Agent': 'okhttp/4.9.2' });

    const res = await root.get('/api/platform/app-versions');
    assert.equal(res.status, 200);
    const by = Object.fromEntries(res.body.accounts.map((a) => [a.id, a]));
    assert.equal(by[onApp.id].state, 'app');
    assert.equal(by[onApp.id].platform, 'android');
    assert.equal(by[onApp.id].appVersion, '1.0.3');
    assert.equal(by[onApp.id].appBuild, '4');
    assert.equal(by[onApp.id].sessions, 2);
    assert.equal(by[onApp.id].web, true);
    assert.equal(by[onApp.id].online, true);
    assert.equal(by[webOnly.id].state, 'web');
    assert.equal(by[webOnly.id].deviceName, 'Chrome on Windows');
    assert.equal(by[oldApp.id].state, 'unknown', 'an older app that never said its version');
    assert.equal(by[nowhere.id].state, 'none');
    const s = res.body.summary;
    assert.equal(s.total, res.body.accounts.length);
    assert.equal(s.app + s.unknown + s.web + s.none, s.total);
    assert.ok(s.builds.some((x) => x.appVersion === '1.0.3' && x.appBuild === '4' && x.people >= 1));

    const overview = (await root.get('/api/platform/overview')).body;
    assert.ok(overview.online >= 1);
    assert.ok(overview.onlineDevices >= overview.online);
    assert.ok(overview.signedIn >= overview.online);
    assert.equal(overview.app.total, s.total);
    assert.ok(overview.app.app >= 1);

    // The people list says who is online.
    const listed = (await root.get(`/api/platform/users?q=${encodeURIComponent(onApp.name)}`)).body.users[0];
    assert.equal(listed.online, true);
    assert.equal(listed.sessions, 2);
  });

  test('none of it is open to people', async () => {
    const a = await h.signup('Nosy console');
    for (const [method, url, body] of [
      ['post', '/api/platform/users', { name: 'X', email: 'x@example.com' }],
      ['del', `/api/platform/users/${a.id}`, { confirm: 'DELETE' }],
      ['patch', `/api/platform/users/${a.id}/settings`, { dailyDigest: false }],
      ['get', '/api/platform/app-versions'],
      ['get', `/api/platform/users/${a.id}`],
    ]) {
      const res = await a[method](url, body);
      assert.equal(res.status, 403, `${method} ${url}`);
    }
  });
});
