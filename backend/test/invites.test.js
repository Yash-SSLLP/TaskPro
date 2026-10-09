const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const User = require('../src/platform/models/User');
const { inMs, give, detail } = require('./task-helpers');

before(h.start);
after(h.stop);

const pinOf = (path) => /\/join\/([^?]+)/.exec(path)[1];
const sigOf = (path) => new URL(path, 'http://x').searchParams.get('w') || undefined;

describe('invite links', () => {
  test('a plain link joins as contacts at once, with no WhatsApp', async () => {
    const boss = await h.signup('InvBoss');
    const guest = await h.signup('InvGuest');

    const link = (await boss.get('/api/contacts/invite')).body;
    assert.match(link.path, /^\/join\/[2-9A-Z]{4}-[2-9A-Z]{4}$/);

    // The landing page, before signing in.
    const preview = await h.client().get(`/api/contacts/invite/${pinOf(link.path)}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.inviter.id, boss.id);
    assert.equal(preview.body.whatsapp, false);
    assert.equal(preview.body.inviter.phone, undefined);

    const joined = await guest.post('/api/contacts/join', { pin: pinOf(link.path) });
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    assert.equal(joined.body.status, 'accepted');
    assert.equal(joined.body.contact.whatsapp, false);

    const list = (await boss.get('/api/contacts')).body;
    assert.deepEqual(list.contacts.map((c) => [c.person.id, c.whatsapp]), [[guest.id, false]]);
    assert.equal((await guest.post('/api/contacts/join', { pin: pinOf(link.path) })).body.status, 'already');
    assert.equal((await boss.post('/api/contacts/join', { pin: pinOf(link.path) })).status, 400);
  });

  test('a WhatsApp link is signed; a forged one is a plain join', async () => {
    const boss = await h.signup('WaBoss');
    const guest = await h.signup('WaGuest');
    const plain = (await boss.get('/api/contacts/invite')).body.path;
    const wa = (await boss.get('/api/contacts/invite?whatsapp=1')).body.path;
    assert.equal(pinOf(wa), pinOf(plain));
    assert.ok(sigOf(wa));

    assert.equal((await h.client().get(`/api/contacts/invite/${pinOf(wa)}?w=${sigOf(wa)}`)).body.whatsapp, true);
    assert.equal((await h.client().get(`/api/contacts/invite/${pinOf(wa)}?w=AAAAAAAAAAAA`)).body.whatsapp, false);

    const forged = await guest.post('/api/contacts/join', { pin: pinOf(wa), w: 'AAAAAAAAAAAA' });
    assert.equal(forged.body.contact.whatsapp, false);
    // The real one later switches it on for contacts already made.
    const real = await guest.post('/api/contacts/join', { pin: pinOf(wa), w: sigOf(wa) });
    assert.equal(real.body.status, 'already');
    assert.equal(real.body.contact.whatsapp, true);
  });

  test('a task shows WhatsApp only for WhatsApp contacts with a mobile number, until switched off', async () => {
    const boss = await h.signup('TaskWaBoss');
    const wa = await h.signup('TaskWaYes');
    const plainGuest = await h.signup('TaskWaNo');
    const link = (await boss.get('/api/contacts/invite?whatsapp=1')).body.path;
    await wa.post('/api/contacts/join', { pin: pinOf(link), w: sigOf(link) });
    await plainGuest.post('/api/contacts/join', { pin: pinOf(link) });

    const task = await give(boss, { title: 'Ship the order', assignees: [wa.id, plainGuest.id], dueDate: inMs(86400000) });

    // No mobile number yet: nothing to open WhatsApp to.
    assert.deepEqual((await detail(boss, task._id)).can.whatsappTo, []);

    await User.updateOne({ _id: wa.id }, { phone: '919876543210' });
    await User.updateOne({ _id: plainGuest.id }, { phone: '919876500000' });
    assert.deepEqual((await detail(boss, task._id)).can.whatsappTo, [{ id: wa.id, name: wa.name, phone: '919876543210' }]);
    // The doer isn't chasing anyone on an open task.
    assert.deepEqual((await detail(wa, task._id)).can.whatsappTo, []);

    const contact = (await wa.get('/api/contacts')).body.contacts.find((c) => c.person.id === boss.id);
    assert.equal((await wa.patch(`/api/contacts/${contact.id}`, { whatsapp: true })).status, 400);
    assert.equal((await wa.patch(`/api/contacts/${contact.id}`, { whatsapp: false })).body.contact.whatsapp, false);
    assert.deepEqual((await detail(boss, task._id)).can.whatsappTo, []);
  });
});
