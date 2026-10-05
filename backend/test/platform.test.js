const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { normalizePin, formatPin, generatePin, PIN_RE } = require('../src/platform/pin');

before(h.start);
after(h.stop);

describe('task pins', () => {
  test('pins use 8 characters without look-alikes and are forgiving to type', () => {
    for (let i = 0; i < 200; i += 1) assert.match(generatePin(), PIN_RE);
    assert.equal(normalizePin(' 7kq4-m9xa '), '7KQ4M9XA');
    assert.equal(normalizePin('7KQ4 M9XA'), '7KQ4M9XA');
    assert.equal(normalizePin('7KQ4M9X0'), null, 'zero is not in the alphabet');
    assert.equal(normalizePin('7KQ4'), null);
    assert.equal(formatPin('7KQ4M9XA'), '7KQ4-M9XA');
  });

  test('everyone who signs up gets their own pin', async () => {
    const a = await h.signup('Asha');
    const b = await h.signup('Ravi');
    assert.match(a.pin, PIN_RE);
    assert.notEqual(a.pin, b.pin);
    assert.equal(a.session.user.pinDisplay, formatPin(a.pin));
    assert.equal(a.session.user.role, 'user');
  });
});

describe('sign up and sign in', () => {
  test('sign-up is personal and returns the session with settings', async () => {
    const res = await h.request().post('/api/auth/signup').send({ name: 'Meera', identifier: 'meera@example.com', password: 'password123' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.name, 'Meera');
    assert.equal(res.body.product.key, 'taskpro');
    assert.equal(res.body.settings.timezone, 'Asia/Kolkata');
    assert.equal(res.body.settings.approvalDefault, true);
    assert.equal(res.body.settings.lang, 'en');
    assert.equal('workspace' in res.body, false);
  });

  test('signs in with email or mobile number; wrong password is refused', async () => {
    const res = await h.request().post('/api/auth/signup').send({ name: 'Asha', identifier: '98765 43210', password: 'password123' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.phone, '919876543210');

    const byPhone = await h.request().post('/api/auth/login').send({ identifier: '+91 9876543210', password: 'password123' });
    assert.equal(byPhone.status, 200);
    assert.equal(byPhone.body.user.pin, res.body.user.pin);
    const wrong = await h.request().post('/api/auth/login').send({ identifier: '9876543210', password: 'nope-nope' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error, 'Wrong login or password');
  });

  test('the same login cannot be used twice', async () => {
    const a = await h.signup('Dup');
    const res = await h.request().post('/api/auth/signup').send({ name: 'X', identifier: a.identifier, password: 'password123' });
    assert.equal(res.status, 409);
  });

  test('changing the password ends other sessions', async () => {
    const a = await h.signup('Pw');
    const res = await a.post('/api/auth/change-password', { currentPassword: 'password123', newPassword: 'new-password-9' });
    assert.equal(res.status, 200);
    assert.equal((await a.get('/api/auth/me')).status, 401);
    assert.equal((await h.client(res.body.token).get('/api/auth/me')).status, 200);
  });
});

describe('settings', () => {
  test('each person keeps their own settings; bad values are refused', async () => {
    const a = await h.signup('Set');
    const b = await h.signup('Other');
    const res = await a.patch('/api/me/settings', { timezone: 'Asia/Dubai', lang: 'hi', dailyDigestAt: '19:30' });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.timezone, 'Asia/Dubai');
    assert.equal(res.body.settings.lang, 'hi');
    assert.equal((await a.get('/api/me/settings')).body.settings.dailyDigestAt, '19:30');
    assert.equal((await b.get('/api/me/settings')).body.settings.timezone, 'Asia/Kolkata');

    assert.equal((await a.patch('/api/me/settings', { timezone: 'Mars/Base' })).status, 400);
    assert.equal((await a.patch('/api/me/settings', { lang: 'fr' })).status, 400);
    assert.equal((await a.patch('/api/me/settings', { colour: 'blue' })).status, 400);
    assert.equal((await a.get('/api/auth/me')).body.settings.lang, 'hi');
  });
});

describe('contacts', () => {
  test('ask by pin, see it on both sides, accept, then both are contacts', async () => {
    const a = await h.signup('Asker');
    const b = await h.signup('Asked');

    const look = await a.get(`/api/people/lookup?pin=${b.session.user.pinDisplay.toLowerCase()}`);
    assert.equal(look.status, 200);
    assert.equal(look.body.person.name, b.name);
    assert.equal(look.body.relation, 'none');
    assert.equal('email' in look.body.person, false, 'a lookup never shows logins');

    const asked = await a.post('/api/contacts', { pin: b.pin });
    assert.equal(asked.status, 201);
    assert.equal(asked.body.status, 'requested');
    assert.equal((await a.get(`/api/people/lookup?pin=${b.pin}`)).body.relation, 'outgoing');
    assert.equal((await b.get(`/api/people/lookup?pin=${a.pin}`)).body.relation, 'incoming');

    const bList = (await b.get('/api/contacts')).body;
    assert.equal(bList.incoming.length, 1);
    assert.equal(bList.incoming[0].person.id, a.id);
    const alert = (await h.alerts(b))[0];
    assert.equal(alert.kind, 'contact');
    assert.match(alert.title, /wants to add you/);

    // Only the person asked can accept.
    assert.equal((await a.post(`/api/contacts/${asked.body.request.id}/accept`)).status, 404);
    assert.equal((await b.post(`/api/contacts/${asked.body.request.id}/accept`)).status, 200);

    const aList = (await a.get('/api/contacts')).body;
    assert.deepEqual(aList.contacts.map((c) => c.person.id), [b.id]);
    assert.equal(aList.outgoing.length, 0);
    assert.equal((await a.get(`/api/people/lookup?pin=${b.pin}`)).body.relation, 'contact');
    assert.match((await h.alerts(a))[0].title, /accepted your contact request/);
  });

  test('asking back accepts; duplicates, your own pin and unknown pins are refused', async () => {
    const a = await h.signup('One');
    const b = await h.signup('Two');
    assert.equal((await a.post('/api/contacts', { pin: b.pin })).status, 201);
    assert.equal((await a.post('/api/contacts', { pin: b.pin })).status, 409);
    const back = await b.post('/api/contacts', { pin: a.pin });
    assert.equal(back.status, 200);
    assert.equal(back.body.status, 'accepted');
    assert.equal((await a.post('/api/contacts', { pin: b.pin })).status, 409);

    assert.equal((await a.post('/api/contacts', { pin: a.pin })).status, 400);
    assert.equal((await a.post('/api/contacts', { pin: 'ZZZZZZZZ' })).status, 404);
    assert.equal((await a.post('/api/contacts', { pin: 'hello' })).status, 400);
    assert.equal((await a.get('/api/people/lookup?pin=ZZZZ-ZZZZ')).status, 404);
  });

  test('declining removes the request; either side can remove a contact', async () => {
    const a = await h.signup('D1');
    const b = await h.signup('D2');
    const asked = await a.post('/api/contacts', { pin: b.pin });
    assert.equal((await b.post(`/api/contacts/${asked.body.request.id}/decline`)).status, 200);
    assert.equal((await a.get('/api/contacts')).body.outgoing.length, 0);

    const link = await h.connect(a, b);
    assert.equal((await b.del(`/api/contacts/${link.id}`)).status, 200);
    assert.equal((await a.get('/api/contacts')).body.contacts.length, 0);

    // Cancelling your own request.
    const again = await a.post('/api/contacts', { pin: b.pin });
    assert.equal((await a.del(`/api/contacts/${again.body.request.id}`)).status, 200);
    assert.equal((await b.get('/api/contacts')).body.incoming.length, 0);
  });

  test('a disabled person cannot be found by pin', async () => {
    const root = await h.root();
    const a = await h.signup('Finder');
    const b = await h.signup('Gone');
    await root.patch(`/api/platform/users/${b.id}`, { status: 'disabled' });
    assert.equal((await a.get(`/api/people/lookup?pin=${b.pin}`)).status, 404);
    assert.equal((await a.post('/api/contacts', { pin: b.pin })).status, 404);
  });
});

describe('teams', () => {
  test('create, invite by pin, accept, and members show up for everyone', async () => {
    const owner = await h.signup('Owner');
    const m = await h.signup('Member');
    const created = await owner.post('/api/teams', { name: 'Sales', description: 'North zone' });
    assert.equal(created.status, 201);
    const id = created.body.team.id;
    assert.equal(created.body.team.myRole, 'owner');

    const invited = await owner.post(`/api/teams/${id}/members`, { pin: m.session.user.pinDisplay });
    assert.equal(invited.status, 201);
    assert.equal(invited.body.team.members.find((x) => x.person.id === m.id).status, 'invited');
    assert.equal((await owner.post(`/api/teams/${id}/members`, { pin: m.pin })).status, 409);

    const mine = (await m.get('/api/teams')).body;
    assert.equal(mine.teams.length, 0);
    assert.equal(mine.invites[0].team.name, 'Sales');
    assert.equal(mine.invites[0].invitedBy.id, owner.id);
    assert.equal((await h.alerts(m))[0].kind, 'team');

    assert.equal((await m.post(`/api/teams/${id}/accept`)).status, 200);
    const after = (await m.get('/api/teams')).body;
    assert.equal(after.teams[0].myRole, 'member');
    assert.equal(after.teams[0].memberCount, 2);
    assert.equal((await m.get(`/api/teams/${id}`)).body.team.members.length, 2);
  });

  test('roles: members cannot invite, only the owner makes admins or deletes', async () => {
    const owner = await h.signup('O');
    const admin = await h.signup('A');
    const member = await h.signup('M');
    const outsider = await h.signup('X');
    const team = await h.makeTeam(owner, [admin, member], { admins: [admin] });

    assert.equal((await member.post(`/api/teams/${team.id}/members`, { pin: outsider.pin })).status, 403);
    assert.equal((await admin.post(`/api/teams/${team.id}/members`, { pin: outsider.pin, role: 'admin' })).status, 403);
    assert.equal((await admin.post(`/api/teams/${team.id}/members`, { pin: outsider.pin })).status, 201);
    assert.equal((await admin.patch(`/api/teams/${team.id}/members/${member.id}`, { role: 'admin' })).status, 403);
    assert.equal((await owner.patch(`/api/teams/${team.id}/members/${member.id}`, { role: 'admin' })).status, 200);
    assert.equal((await admin.del(`/api/teams/${team.id}`)).status, 403);
    assert.equal((await admin.patch(`/api/teams/${team.id}`, { name: 'Renamed' })).status, 200);

    // An outsider can't even see it.
    assert.equal((await h.signup('Y').then((y) => y.get(`/api/teams/${team.id}`))).status, 404);
  });

  test('leave, remove, hand over and delete', async () => {
    const owner = await h.signup('Lead');
    const a = await h.signup('Aa');
    const b = await h.signup('Bb');
    const team = await h.makeTeam(owner, [a, b]);

    assert.equal((await owner.del(`/api/teams/${team.id}/members/${owner.id}`)).status, 400, 'the owner cannot leave');
    assert.equal((await a.del(`/api/teams/${team.id}/members/${a.id}`)).status, 200, 'a member can leave');
    assert.equal((await owner.del(`/api/teams/${team.id}/members/${b.id}`)).status, 200);
    assert.match((await h.alerts(b))[0].title, /removed from the team/);

    await h.makeTeam(owner, [], { name: 'Unused' });
    const t2 = await h.makeTeam(owner, [a]);
    const handed = await owner.post(`/api/teams/${t2.id}/transfer`, { userId: a.id });
    assert.equal(handed.status, 200);
    assert.equal(handed.body.team.myRole, 'admin');
    assert.equal(handed.body.team.owner.id, a.id);
    assert.equal((await owner.del(`/api/teams/${t2.id}`)).status, 403);
    assert.equal((await a.del(`/api/teams/${t2.id}`)).status, 200);
    assert.equal((await owner.get(`/api/teams/${t2.id}`)).status, 404);
  });

  test('declining an invite removes it', async () => {
    const owner = await h.signup('Inv');
    const m = await h.signup('No');
    const created = (await owner.post('/api/teams', { name: 'Ops' })).body.team;
    await owner.post(`/api/teams/${created.id}/members`, { pin: m.pin });
    assert.equal((await m.post(`/api/teams/${created.id}/decline`)).status, 200);
    assert.equal((await m.get('/api/teams')).body.invites.length, 0);
    assert.equal((await m.post(`/api/teams/${created.id}/accept`)).status, 404);
  });
});

describe('who you can give work to', () => {
  test('yourself, then team-mates, then contacts; never strangers', async () => {
    const me = await h.signup('Zed');
    const contact = await h.signup('Contact');
    const mate = await h.signup('Mate');
    const stranger = await h.signup('Stranger');
    const pending = await h.signup('Pending');
    await h.connect(me, contact);
    await h.makeTeam(mate, [me], { name: 'Shared' });
    await me.post('/api/contacts', { pin: pending.pin });

    const people = (await me.get('/api/people/assignable')).body.people;
    assert.deepEqual(people.map((p) => p.id), [me.id, mate.id, contact.id]);
    assert.equal(people[0].self, true);
    assert.deepEqual(people[1].teams.map((t) => t.name), ['Shared']);
    assert.equal(people[2].contact, true);
    assert.ok(!people.some((p) => p.id === stranger.id || p.id === pending.id));
    assert.deepEqual((await me.get('/api/people/assignable?q=cont')).body.people.map((p) => p.id), [contact.id]);

    const { assertAssignable } = require('../src/platform/services/people');
    const User = require('../src/platform/models/User');
    const meDoc = await User.findById(me.id);
    await assertAssignable(meDoc, [me.id, mate.id, contact.id]);
    await assert.rejects(assertAssignable(meDoc, [stranger.id]), /isn't in your contacts or teams yet/);
  });

  test('an invited (not yet joined) team member is not assignable', async () => {
    const owner = await h.signup('Boss');
    const m = await h.signup('Invitee');
    const created = (await owner.post('/api/teams', { name: 'Wait' })).body.team;
    await owner.post(`/api/teams/${created.id}/members`, { pin: m.pin });
    const ids = (await owner.get('/api/people/assignable')).body.people.map((p) => p.id);
    assert.deepEqual(ids, [owner.id]);
  });
});

describe('super admin', () => {
  test('sees everyone and every team, disables and re-enables people', async () => {
    const root = await h.root();
    const a = await h.signup('Console');
    const b = await h.signup('Teammate');
    await h.makeTeam(a, [b], { name: 'Console team' });

    const overview = await root.get('/api/platform/overview');
    assert.equal(overview.status, 200);
    assert.ok(overview.body.users >= 2);
    assert.ok(overview.body.teams >= 1);
    assert.ok(overview.body.tasks);

    const found = await root.get(`/api/platform/users?q=${a.pin}`);
    assert.deepEqual(found.body.users.map((u) => u.id), [a.id]);
    assert.equal(found.body.users[0].email, a.identifier, 'the console sees logins');
    assert.ok(found.body.users[0].stats);

    const one = await root.get(`/api/platform/users/${a.id}`);
    assert.deepEqual(one.body.teams.map((t) => t.name), ['Console team']);

    assert.equal((await root.patch(`/api/platform/users/${a.id}`, { status: 'disabled' })).status, 200);
    assert.equal((await a.get('/api/auth/me')).status, 401, 'disabling signs them out');
    const login = await h.request().post('/api/auth/login').send({ identifier: a.identifier, password: 'password123' });
    assert.equal(login.status, 403);
    assert.equal(login.body.code, 'USER_DISABLED');
    await root.patch(`/api/platform/users/${a.id}`, { status: 'active' });
    const back = await h.request().post('/api/auth/login').send({ identifier: a.identifier, password: 'password123' });
    assert.equal(back.status, 200);

    const teams = await root.get('/api/platform/teams?q=Console');
    assert.equal(teams.body.teams.length, 1);
    assert.equal((await root.get(`/api/platform/teams/${teams.body.teams[0].id}`)).body.team.members.length, 2);
    assert.equal((await root.del(`/api/platform/teams/${teams.body.teams[0].id}`)).status, 200);
    assert.equal((await h.client(back.body.token).get('/api/teams')).body.teams.length, 0);
  });

  test('a password reset forces a new password at next sign-in', async () => {
    const root = await h.root();
    const a = await h.signup('Reset');
    assert.equal((await root.post(`/api/platform/users/${a.id}/password`, { password: 'temp-pass-1' })).status, 200);
    const login = await h.request().post('/api/auth/login').send({ identifier: a.identifier, password: 'temp-pass-1' });
    assert.equal(login.body.user.mustChangePassword, true);
    const c = h.client(login.body.token);
    assert.equal((await c.get('/api/contacts')).body.code, 'PASSWORD_CHANGE_REQUIRED');
    const changed = await c.post('/api/auth/change-password', { newPassword: 'mine-again-1' });
    assert.equal(changed.status, 200);
    assert.equal((await h.client(changed.body.token).get('/api/contacts')).status, 200);
  });

  test('people cannot open the console; the super admin has no pin and no contacts', async () => {
    const root = await h.root();
    const a = await h.signup('Nosy');
    assert.equal((await a.get('/api/platform/overview')).status, 403);
    assert.equal((await root.get('/api/auth/me')).body.user.pin, '');
    assert.equal((await root.get('/api/contacts')).status, 403);
    assert.equal((await root.post('/api/teams', { name: 'Root team' })).status, 403);
    // …but can see anyone's team and the full assignable list.
    const ids = (await root.get('/api/people/assignable')).body.people.map((p) => p.id);
    assert.ok(ids.includes(a.id));
  });
});

describe('alerts and files', () => {
  test('alerts are per person; reading and clearing only touch your own', async () => {
    const a = await h.signup('Al');
    const b = await h.signup('Bo');
    await a.post('/api/contacts', { pin: b.pin });
    assert.equal((await b.get('/api/notifications/unread-count')).body.unread, 1);
    assert.equal((await a.get('/api/notifications/unread-count')).body.unread, 0);
    assert.equal((await b.post('/api/notifications/read', { all: true })).status, 200);
    assert.equal((await b.get('/api/notifications/unread-count')).body.unread, 0);
    assert.equal((await b.del('/api/notifications')).status, 200);
    assert.equal((await h.alerts(b)).length, 0);
  });

  test('an upload opens for its uploader and by signed link, not for others', async () => {
    const a = await h.signup('Up');
    const b = await h.signup('Peek');
    const up = await a.upload('/api/files', 'file', h.PNG, 'dot.png', 'image/png');
    assert.equal(up.status, 201);
    const { id, url } = up.body.file;
    assert.equal((await a.get(`/api/files/${id}`)).status, 200);
    assert.equal((await b.get(`/api/files/${id}`)).status, 404);
    assert.equal((await h.request().get(url)).status, 200);
    assert.equal((await h.request().get(`/api/files/${id}`)).status, 401);
  });
});
