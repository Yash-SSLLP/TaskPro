const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers');
const { give, detail } = require('./task-helpers');

before(h.start);
after(h.stop);

describe('deleting your own account', () => {
  test('needs the right password, and the Super Admin cannot do it', async () => {
    const me = await h.signup('Keeper');
    const wrong = await me.post('/api/auth/delete-account', { password: 'not-my-password' });
    assert.equal(wrong.status, 400);
    assert.equal((await me.get('/api/auth/me')).status, 200);

    const root = await h.root();
    const res = await root.post('/api/auth/delete-account', { password: 'root-password-1' });
    assert.equal(res.status, 403);
  });

  test('removes the person and their own data, and keeps shared work for others', async () => {
    const me = await h.signup('Leaver');
    const friend = await h.signup('Friend');
    const mate = await h.signup('Mate');
    await h.connect(me, friend);
    const team = await h.makeTeam(me, [mate]);

    const own = await give(me, { title: 'Only mine' });
    const given = await give(me, { title: 'For my friend', assignees: [friend.id] });

    const res = await me.post('/api/auth/delete-account', { password: 'password123' });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    // Signed out everywhere, and the login no longer exists.
    assert.equal((await me.get('/api/auth/me')).status, 401);
    const login = await h.request().post('/api/auth/login').send({ identifier: me.identifier, password: 'password123' });
    assert.equal(login.status, 401);

    // Nothing personal is left on the record.
    const doc = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(me.id) });
    assert.equal(doc.name, 'Deleted user');
    assert.equal(doc.email, undefined);
    assert.equal(doc.pin, undefined);
    assert.ok(doc.deletedAt);

    // Their private task is gone; the one they gave stays with the friend.
    assert.equal(await mongoose.model('Task').countDocuments({ _id: own._id }), 0);
    const kept = await detail(friend, given._id);
    assert.equal(kept.task.title, 'For my friend');
    assert.equal(kept.task.createdByName, 'Deleted user');

    // The contact is gone, and the team passed to the remaining member.
    const contacts = (await friend.get('/api/contacts')).body;
    assert.equal(contacts.contacts.length, 0);
    const teamNow = (await mate.get(`/api/teams/${team.id}`)).body.team;
    assert.equal(teamNow.myRole, 'owner');
    assert.equal(teamNow.memberCount, 1);

    // The Super Admin's console no longer lists them.
    const root = await h.root();
    const users = (await root.get('/api/platform/users')).body.users;
    assert.equal(users.some((u) => u.id === me.id), false);
  });
});
