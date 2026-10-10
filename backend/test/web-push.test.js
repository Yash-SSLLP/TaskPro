const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const Device = require('../src/platform/models/Device');
const { notify } = require('../src/platform/services/notify');

before(h.start);
after(h.stop);

const subscription = (id = 'abc') => ({
  endpoint: `https://web.push.apple.com/QH${id}`,
  keys: { p256dh: 'BOr6wSl6ZJtw0D2nVoIHGZ7Jq3Ll0Kq0z1Yt5ckkSpL8mO3k0yJfUq4mGn3w6Ywr0e1zK2Yb1uJx6hR8v4cVt0', auth: 'k0J5xg4mX7v1bL3pQ9wE2A' },
});

describe('iPhone home-screen app: Web Push', () => {
  test('the public key is stable and needs a session', async () => {
    const a = await h.signup('Asha');
    const first = await a.get('/api/devices/web-push-key');
    assert.equal(first.status, 200);
    assert.match(first.body.publicKey, /^[A-Za-z0-9_-]{80,}$/);
    const again = await a.get('/api/devices/web-push-key');
    assert.equal(again.body.publicKey, first.body.publicKey);
    const anon = await h.client().get('/api/devices/web-push-key');
    assert.equal(anon.status, 401);
  });

  test('a subscription registers as a web device, owned by whoever signed in last', async () => {
    const a = await h.signup('Asha');
    const b = await h.signup('Ravi');
    const res = await a.post('/api/devices', { platform: 'web', webPush: subscription('one') });
    assert.equal(res.status, 200);
    assert.match(res.body.token, /^webpush:[0-9a-f]{40}$/);
    const saved = await Device.findOne({ token: res.body.token }).lean();
    assert.equal(saved.platform, 'web');
    assert.equal(String(saved.user), a.id);
    assert.equal(saved.webPush.endpoint, subscription('one').endpoint);

    // Same iPhone, the other person signs in: it moves to them.
    const moved = await b.post('/api/devices', { platform: 'web', webPush: subscription('one') });
    assert.equal(moved.body.token, res.body.token);
    assert.equal(await Device.countDocuments({ token: res.body.token }), 1);
    assert.equal(String((await Device.findOne({ token: res.body.token })).user), b.id);

    const gone = await b.del('/api/devices', { token: res.body.token });
    assert.equal(gone.status, 200);
    assert.equal(await Device.countDocuments({ token: res.body.token }), 0);
  });

  test('endpoints off the push services and broken subscriptions are refused', async () => {
    const a = await h.signup('Asha');
    for (const webPush of [
      { ...subscription(), endpoint: 'https://evil.example.com/push' },
      { ...subscription(), endpoint: 'http://web.push.apple.com/QHx' },
      { endpoint: subscription().endpoint, keys: {} },
      null,
    ]) {
      const res = await a.post('/api/devices', { platform: 'web', webPush });
      assert.equal(res.status, 400, JSON.stringify(webPush));
    }
    // The Expo path is unchanged.
    assert.equal((await a.post('/api/devices', { token: 'not-a-token-at-all', platform: 'android' })).status, 400);
    assert.equal((await a.post('/api/devices', { token: 'ExponentPushToken[xyz123456]', platform: 'android' })).status, 200);
  });

  test('a notification for someone with both kinds of phone still lands in their alerts', async () => {
    const a = await h.signup('Asha');
    await a.post('/api/devices', { platform: 'web', webPush: subscription('two') });
    await a.post('/api/devices', { token: 'ExponentPushToken[asha-phone]', platform: 'android' });
    await notify([a.id], { title: 'Hello', body: 'World', link: '/tasks' });
    const alerts = await a.get('/api/notifications');
    assert.equal(alerts.status, 200);
    const list = alerts.body.notifications || alerts.body.items || alerts.body;
    assert.ok(JSON.stringify(list).includes('Hello'));
  });
});
