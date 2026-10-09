const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers');
const { give, detail } = require('./task-helpers');

before(h.start);
after(h.stop);

// The smallest real images of each kind the server accepts (1×1 pixel).
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);
const WEBP = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');
const PNG = h.PNG;

const URL_SHAPE = /^\/api\/files\/[a-f\d]{24}\?exp=\d+&sig=[\w-]+$/;

const setPhoto = (who, buffer, filename = 'me.jpg', contentType = 'image/jpeg', field = 'photo') =>
  who.multipart('put', '/api/me/photo', {}, [{ field, buffer, filename, contentType }]);

/** The GridFS id inside a photo link. */
const fileIdOf = (url) => /^\/api\/files\/([a-f\d]{24})\?/.exec(url)[1];

const fileDoc = (id) => mongoose.connection.db.collection('files.files').findOne({ _id: new mongoose.Types.ObjectId(id) });

/** Every profile photo file stored for this person. */
const avatarFiles = (userId) =>
  mongoose.connection.db
    .collection('files.files')
    .find({ 'metadata.ref.kind': 'avatar', 'metadata.ref.id': new mongoose.Types.ObjectId(userId) })
    .toArray();

describe('profile photo', () => {
  test('a JPEG, a PNG and a WebP are each taken; a new one replaces the old file', async () => {
    const me = await h.signup('Snap');
    assert.equal(me.session.user.photoUrl, null);

    const kinds = [
      [JPEG, 'me.jpg', 'image/jpeg', 'image/jpeg'],
      // The declared type is ignored: the bytes decide.
      [PNG, 'me.png', 'application/octet-stream', 'image/png'],
      [WEBP, 'me.webp', 'image/webp', 'image/webp'],
    ];
    let previous = null;
    for (const [buffer, filename, declared, stored] of kinds) {
      const res = await setPhoto(me, buffer, filename, declared);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const { user } = res.body;
      assert.equal(user.id, me.id);
      assert.equal(user.email, me.identifier, 'the full Me shape comes back');
      assert.match(user.photoUrl, URL_SHAPE);

      const id = fileIdOf(user.photoUrl);
      const doc = await fileDoc(id);
      assert.equal(doc.metadata.mime, stored);
      assert.equal(doc.metadata.ref.kind, 'avatar');
      assert.equal(String(doc.metadata.ref.id), me.id);
      if (previous) assert.equal(await fileDoc(previous), null, 'the old photo file is deleted');
      assert.deepEqual((await avatarFiles(me.id)).map((d) => String(d._id)), [id]);
      previous = id;
    }
  });

  test('refuses a file that is not an image, an oversize photo, and a missing one', async () => {
    const me = await h.signup('Careful');
    const ok = await setPhoto(me, PNG, 'dot.png', 'image/png');
    assert.equal(ok.status, 200);
    const kept = ok.body.user.photoUrl;

    const fake = await setPhoto(me, Buffer.from('%PDF-1.4 this is not a holiday snap at all'), 'holiday.jpg', 'image/jpeg');
    assert.equal(fake.status, 400);
    assert.match(fake.body.error, /JPEG, PNG or WebP/);

    const huge = await setPhoto(me, Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]), 'huge.jpg', 'image/jpeg');
    assert.equal(huge.status, 413);
    assert.match(huge.body.error, /2 MB/);

    assert.equal((await me.put('/api/me/photo', {})).status, 400);
    assert.equal((await setPhoto(me, PNG, 'dot.png', 'image/png', 'file')).status, 400);

    // Nothing changed, and nothing was left behind.
    assert.equal((await me.get('/api/auth/me')).body.user.photoUrl, kept);
    assert.equal((await avatarFiles(me.id)).length, 1);
    assert.equal((await h.request().put('/api/me/photo')).status, 401);
  });

  test('DELETE goes back to initials and removes the file', async () => {
    const me = await h.signup('Shy');
    const set = await setPhoto(me, JPEG);
    const id = fileIdOf(set.body.user.photoUrl);

    const res = await me.del('/api/me/photo');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.photoUrl, null);
    assert.equal(res.body.user.id, me.id);
    assert.equal(await fileDoc(id), null);
    assert.equal((await me.get('/api/auth/me')).body.user.photoUrl, null);
    const doc = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(me.id) });
    assert.equal(doc.photo, undefined);

    // Removing it again is harmless.
    assert.equal((await me.del('/api/me/photo')).status, 200);
  });

  test('the signed link serves the image to anyone holding it, and stays the same for the day', async () => {
    const me = await h.signup('Shown');
    const stranger = await h.signup('Passerby');
    const url = (await setPhoto(me, PNG, 'dot.png', 'image/png')).body.user.photoUrl;
    assert.equal((await me.get('/api/auth/me')).body.user.photoUrl, url, 'the same link on the next read');

    const got = await h.binary(h.request().get(url));
    assert.equal(got.status, 200);
    assert.deepEqual(got.body, PNG);
    assert.equal(got.headers['content-type'], 'image/png');
    assert.match(got.headers['cache-control'], /max-age=86400/);

    // The link expires 12 to 36 hours from now, and can't be bent to another file.
    const exp = Number(new URL(url, 'http://x').searchParams.get('exp'));
    const left = exp - Date.now() / 1000;
    assert.ok(left >= 12 * 3600 - 5 && left <= 36 * 3600, `expires in ${left}s`);
    const other = (await setPhoto(stranger, JPEG)).body.user.photoUrl;
    assert.equal((await h.request().get(`/api/files/${fileIdOf(other)}${url.slice(url.indexOf('?'))}`)).status, 401);

    // With a session instead of a signature: anyone signed in may see a profile photo.
    assert.equal((await stranger.get(`/api/files/${fileIdOf(url)}`)).status, 200);
    assert.equal((await h.request().get(`/api/files/${fileIdOf(url)}`)).status, 401);
  });

  test('photoUrl comes with people everywhere: me, contacts, lookup, teams, the picker and tasks', async () => {
    const boss = await h.signup('Pictured Boss');
    const a = await h.signup('Pictured A');
    const plain = await h.signup('No Photo');
    const bossUrl = (await setPhoto(boss, JPEG)).body.user.photoUrl;
    const aUrl = (await setPhoto(a, PNG, 'a.png', 'image/png')).body.user.photoUrl;
    await h.connect(boss, a);
    const team = await h.makeTeam(boss, [plain]);

    // Me
    assert.equal((await boss.get('/api/auth/me')).body.user.photoUrl, bossUrl);

    // Contacts and lookup
    const contacts = (await boss.get('/api/contacts')).body.contacts;
    assert.equal(contacts.find((c) => c.person.id === a.id).person.photoUrl, aUrl);
    assert.equal((await boss.get(`/api/people/lookup?pin=${a.pin}`)).body.person.photoUrl, aUrl);

    // Teams: a person with no photo says null
    const members = (await boss.get(`/api/teams/${team.id}`)).body.team.members;
    assert.equal(members.find((m) => m.person.id === boss.id).person.photoUrl, bossUrl);
    assert.equal(members.find((m) => m.person.id === plain.id).person.photoUrl, null);

    // The people pickers
    const assignable = (await boss.get('/api/people/assignable')).body.people;
    assert.equal(assignable.find((p) => p.id === a.id).photoUrl, aUrl);
    const meta = (await boss.get('/api/tasks/meta')).body.people;
    assert.equal(meta.find((p) => p.id === a.id).photoUrl, aUrl);
    assert.equal(meta.find((p) => p.id === plain.id).photoUrl, null);

    // Tasks: the setter, the assignee and the people in the history
    const t = await give(boss, { title: 'Frame the photos', assignees: [a.id] });
    assert.equal(t.createdBy.photoUrl, bossUrl);
    assert.equal(t.assignees[0].user.photoUrl, aUrl);
    const body = await detail(a, t._id);
    assert.equal(body.task.createdBy.photoUrl, bossUrl);
    const urlOf = { [boss.id]: bossUrl, [a.id]: aUrl };
    const byPeople = body.updates.filter((u) => u.by?.id);
    assert.ok(byPeople.some((u) => u.by.id === boss.id));
    for (const u of byPeople) assert.equal(u.by.photoUrl, urlOf[u.by.id] ?? null);
    const list = (await a.get('/api/tasks?scope=mine')).body.tasks;
    const row = list.find((x) => x._id === t._id);
    assert.equal(row.createdBy.photoUrl, bossUrl);
    assert.equal(row.assignees[0].user.photoUrl, aUrl);
  });

  test('deleting the account removes the photo file', async () => {
    const me = await h.signup('Gone');
    const id = fileIdOf((await setPhoto(me, JPEG)).body.user.photoUrl);
    assert.ok(await fileDoc(id));

    const res = await me.post('/api/auth/delete-account', { password: 'password123' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await fileDoc(id), null);
    assert.equal((await avatarFiles(me.id)).length, 0);
    const doc = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(me.id) });
    assert.equal(doc.photo, undefined);
  });
});
