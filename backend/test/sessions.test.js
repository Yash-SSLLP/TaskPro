const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const h = require('./helpers');
const config = require('../src/config');

before(h.start);
after(h.stop);

const Session = () => mongoose.model('Session');
const sidOf = (token) => jwt.decode(token).sid;

const ANDROID = {
  'X-Platform': 'android',
  'X-App-Version': '1.0.3',
  'X-App-Build': '4',
  'X-Device-Name': 'Google Pixel 7',
  'X-OS-Version': 'Android 14',
  'X-Push-Permission': 'granted',
  'User-Agent': 'okhttp/4.12.0',
};
const WEB = { 'X-Platform': 'web', 'X-App-Version': '1.0.0', 'X-Device-Name': 'Chrome on Windows' };

/** Requests as one device: a token plus the headers its app sends. */
function device(token, headers = {}) {
  const auth = (req) => req.set({ ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  return {
    token,
    get: (url) => auth(h.request().get(url)),
    post: (url, body) => auth(h.request().post(url)).send(body ?? {}),
    patch: (url, body) => auth(h.request().patch(url)).send(body ?? {}),
  };
}

async function signIn(identifier, headers = {}, password = 'password123') {
  const res = await h.request().post('/api/auth/login').set(headers).send({ identifier, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return device(res.body.token, headers);
}

describe('sessions', () => {
  test('signing in starts a session for the device, named in the token, with what the app reports', async () => {
    const me = await h.signup('Phone');
    const phone = await signIn(me.identifier, ANDROID);
    const sid = sidOf(phone.token);
    assert.ok(sid, 'the token names its session');

    const s = await Session().findOne({ sid }).lean();
    assert.equal(String(s.user), me.id);
    assert.equal(s.platform, 'android');
    assert.equal(s.appVersion, '1.0.3');
    assert.equal(s.appBuild, '4');
    assert.equal(s.deviceName, 'Google Pixel 7');
    assert.equal(s.osVersion, 'Android 14');
    assert.equal(s.pushPermission, 'granted');
    assert.ok(s.lastSeenAt);
    assert.equal(s.revokedAt, null);

    // Sign-up starts one too.
    assert.ok(sidOf(me.token));
    assert.equal(await Session().countDocuments({ sid: sidOf(me.token) }), 1);
    assert.equal((await phone.get('/api/auth/me')).status, 200);
  });

  test('the app keeps its session current: a new version is stored at once, the last-seen time once a minute', async () => {
    const me = await h.signup('Updater');
    const phone = await signIn(me.identifier, ANDROID);
    const sid = sidOf(phone.token);

    const updated = device(phone.token, { ...ANDROID, 'X-App-Version': '1.0.4', 'X-App-Build': '5', 'X-Push-Permission': 'denied' });
    assert.equal((await updated.get('/api/auth/me')).status, 200);
    let s = await Session().findOne({ sid }).lean();
    assert.equal(s.appVersion, '1.0.4');
    assert.equal(s.appBuild, '5');
    assert.equal(s.pushPermission, 'denied');

    // A request that does not describe itself (a media player fetching a file) changes nothing.
    const bare = device(phone.token, { 'User-Agent': 'ExoPlayerLib/2.18' });
    assert.equal((await bare.get('/api/auth/me')).status, 200);
    s = await Session().findOne({ sid }).lean();
    assert.equal(s.platform, 'android');
    assert.equal(s.userAgent, 'okhttp/4.12.0');

    // Seen five minutes ago: the next request stamps it again.
    const old = new Date(Date.now() - 5 * 60 * 1000);
    await Session().updateOne({ sid }, { $set: { lastSeenAt: old } });
    await updated.get('/api/auth/me');
    s = await Session().findOne({ sid }).lean();
    assert.ok(s.lastSeenAt > old, 'last seen moved on');
  });

  test('signing out ends that device only', async () => {
    const me = await h.signup('Two devices');
    const phone = await signIn(me.identifier, ANDROID);
    const laptop = await signIn(me.identifier, WEB);

    const out = await phone.post('/api/auth/logout');
    assert.equal(out.status, 200);
    const after = await phone.get('/api/auth/me');
    assert.equal(after.status, 401);
    assert.equal(after.body.code, 'SESSION_EXPIRED');
    assert.equal((await laptop.get('/api/auth/me')).status, 200, 'the other device carries on');

    const s = await Session().findOne({ sid: sidOf(phone.token) }).lean();
    assert.ok(s.revokedAt);
    assert.equal(s.revokedReason, 'signed_out');
  });

  test('changing the password keeps this device on its session and ends the others', async () => {
    const me = await h.signup('Pw device');
    const phone = await signIn(me.identifier, ANDROID);
    const laptop = await signIn(me.identifier, WEB);
    const res = await laptop.post('/api/auth/change-password', { currentPassword: 'password123', newPassword: 'another-pass-9' });
    assert.equal(res.status, 200);
    assert.equal(sidOf(res.body.token), sidOf(laptop.token), 'same device, same session');
    assert.equal((await device(res.body.token, WEB).get('/api/auth/me')).status, 200);
    assert.equal((await phone.get('/api/auth/me')).status, 401);
    const s = await Session().findOne({ sid: sidOf(phone.token) }).lean();
    assert.equal(s.revokedReason, 'password');
  });

  test('a token from before sessions keeps working, gets one session, and /me swaps it for one that names it', async () => {
    const me = await h.signup('Old app');
    const legacy = jwt.sign({ sub: me.id, v: 0 }, config.jwtSecret, { expiresIn: '30d' });
    const oldApp = device(legacy, { 'User-Agent': 'okhttp/4.9.2' });

    // A burst of requests from one device makes one session.
    const burst = await Promise.all([oldApp.get('/api/contacts'), oldApp.get('/api/teams'), oldApp.get('/api/notifications/unread-count'), oldApp.get('/api/contacts')]);
    for (const r of burst) assert.equal(r.status, 200, 'never signed out');
    const made = await Session().find({ user: me.id, legacy: true }).lean();
    assert.equal(made.length, 1);
    assert.equal(made[0].platform, 'android', 'read from the User-Agent');
    assert.equal(made[0].appVersion, undefined, 'an old app reports no version');

    const meRes = await oldApp.get('/api/auth/me');
    assert.equal(meRes.status, 200);
    assert.ok(meRes.body.token, 'a fresh token comes back');
    assert.equal(sidOf(meRes.body.token), made[0].sid);
    assert.equal((await device(meRes.body.token).get('/api/auth/me')).status, 200);
    assert.equal((await oldApp.get('/api/contacts')).status, 200, 'the old token still works too');

    // Another device with its own old token gets its own session.
    const other = jwt.sign({ sub: me.id, v: 0, iat: Math.floor(Date.now() / 1000) - 3600 }, config.jwtSecret);
    assert.equal((await device(other, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36' }).get('/api/teams')).status, 200);
    const all = await Session().find({ user: me.id, legacy: true }).lean();
    assert.equal(all.length, 2);
    const web = all.find((s) => s.platform === 'web');
    assert.equal(web.deviceName, 'Chrome on Windows');

    // Signing out with an old token ends it.
    assert.equal((await device(other).post('/api/auth/logout')).status, 200);
    assert.equal((await device(other).get('/api/teams')).status, 401);
    assert.equal((await oldApp.get('/api/teams')).status, 200);
  });

  test('a token whose session is gone or belongs to someone else is refused', async () => {
    const a = await h.signup('Forged A');
    const b = await h.signup('Forged B');
    const ghost = jwt.sign({ sub: a.id, v: 0, sid: 'no-such-session' }, config.jwtSecret, { expiresIn: '1h' });
    const r1 = await device(ghost).get('/api/auth/me');
    assert.equal(r1.status, 401);
    assert.equal(r1.body.code, 'SESSION_EXPIRED');
    const swapped = jwt.sign({ sub: a.id, v: 0, sid: sidOf(b.token) }, config.jwtSecret, { expiresIn: '1h' });
    assert.equal((await device(swapped).get('/api/auth/me')).status, 401);
  });

  test('someone who must choose a new password can still sign out', async () => {
    const root = await h.root();
    const a = await h.signup('Gate');
    await root.post(`/api/platform/users/${a.id}/password`, { password: 'temp-pass-1' });
    const c = await signIn(a.identifier, WEB, 'temp-pass-1');
    assert.equal((await c.get('/api/contacts')).body.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });
});

describe('the Super Admin and sessions', () => {
  test('sign one device out; the person stays signed in elsewhere', async () => {
    const root = await h.root();
    const me = await h.signup('Revoked');
    const phone = await signIn(me.identifier, ANDROID);
    const laptop = await signIn(me.identifier, WEB);

    const res = await root.post(`/api/platform/sessions/${sidOf(phone.token)}/revoke`);
    assert.equal(res.status, 200);
    assert.equal((await phone.get('/api/auth/me')).status, 401);
    assert.equal((await laptop.get('/api/auth/me')).status, 200);
    const s = await Session().findOne({ sid: sidOf(phone.token) }).lean();
    assert.equal(s.revokedReason, 'admin');
    assert.equal(String(s.revokedBy), root.id);

    // Twice is fine; an unknown one is a 404; this very device is refused.
    assert.equal((await root.post(`/api/platform/sessions/${sidOf(phone.token)}/revoke`)).status, 200);
    assert.equal((await root.post('/api/platform/sessions/nope/revoke')).status, 404);
    const mine = await root.post(`/api/platform/sessions/${sidOf(root.token)}/revoke`);
    assert.equal(mine.status, 400);
    assert.equal((await root.get('/api/auth/me')).status, 200);
  });

  test('sign someone out everywhere', async () => {
    const root = await h.root();
    const me = await h.signup('Everywhere');
    const phone = await signIn(me.identifier, ANDROID);
    const laptop = await signIn(me.identifier, WEB);
    const res = await root.post(`/api/platform/users/${me.id}/sign-out`);
    assert.equal(res.status, 200);
    assert.equal(res.body.signedOut, 3, 'sign-up, phone and laptop');
    for (const d of [phone, laptop, me]) assert.equal((await d.get('/api/auth/me')).status, 401);
    assert.equal(await Session().countDocuments({ user: me.id, revokedAt: null }), 0);
    // Nothing else changed: they sign straight back in.
    await signIn(me.identifier, WEB);
    // Not on yourself.
    assert.equal((await root.post(`/api/platform/users/${root.id}/sign-out`)).status, 404);
  });

  test('switching someone off or resetting their password ends their sessions', async () => {
    const root = await h.root();
    const a = await h.signup('Off');
    await root.patch(`/api/platform/users/${a.id}`, { status: 'disabled' });
    assert.equal(await Session().countDocuments({ user: a.id, revokedAt: null }), 0);
    await root.patch(`/api/platform/users/${a.id}`, { status: 'active' });
    const phone = await signIn(a.identifier, ANDROID);
    await root.post(`/api/platform/users/${a.id}/password`, { password: 'temp-pass-2' });
    assert.equal((await Session().findOne({ sid: sidOf(phone.token) }).lean()).revokedReason, 'password_reset');
  });

  test('who is online, today and this week', async () => {
    const root = await h.root();
    const now = Date.now();
    const online = await h.signup('Online now');
    const weekly = await h.signup('This week');
    const gone = await h.signup('Long gone');
    const onlinePhone = await signIn(online.identifier, ANDROID);
    const weeklyWeb = await signIn(weekly.identifier, WEB);
    const goneWeb = await signIn(gone.identifier, WEB);
    // Only the device under test counts for each of them.
    for (const p of [online, weekly, gone]) await Session().updateMany({ user: p.id, sid: { $nin: [sidOf(onlinePhone.token), sidOf(weeklyWeb.token), sidOf(goneWeb.token)] } }, { $set: { revokedAt: new Date() } });
    await Session().updateOne({ sid: sidOf(weeklyWeb.token) }, { $set: { lastSeenAt: new Date(now - 3 * 24 * 3600 * 1000) } });
    await Session().updateOne({ sid: sidOf(goneWeb.token) }, { $set: { lastSeenAt: new Date(now - 10 * 24 * 3600 * 1000) } });

    const res = await root.get('/api/platform/sessions?window=online');
    assert.equal(res.status, 200);
    assert.equal(res.body.window, 'online');
    assert.equal(res.body.onlineWindowSeconds, 120);
    const ids = (r) => r.body.sessions.map((s) => s.user.id);
    assert.ok(ids(res).includes(online.id));
    assert.ok(!ids(res).includes(weekly.id));
    const row = res.body.sessions.find((s) => s.user.id === online.id);
    assert.equal(row.platform, 'android');
    assert.equal(row.appVersion, '1.0.3');
    assert.equal(row.deviceName, 'Google Pixel 7');
    assert.equal(row.online, true);
    assert.equal(row.user.name, online.name);
    assert.ok(res.body.counts.online >= 1);
    // The Super Admin sees their own device, marked as this one.
    assert.ok(res.body.sessions.some((s) => s.current && s.user.self));

    const week = await root.get('/api/platform/sessions?window=7d');
    assert.ok(ids(week).includes(online.id));
    assert.ok(ids(week).includes(weekly.id));
    assert.ok(!ids(week).includes(gone.id));
    assert.equal(week.body.sessions.find((s) => s.user.id === weekly.id).online, false);

    const today = await root.get('/api/platform/sessions?window=today');
    assert.ok(ids(today).includes(online.id));
    assert.ok(!ids(today).includes(weekly.id));
    assert.ok(today.body.counts.week >= today.body.counts.today);
    assert.ok(today.body.counts.today >= today.body.counts.online);

    // Revoked sessions are not "signed in".
    await root.post(`/api/platform/sessions/${sidOf(onlinePhone.token)}/revoke`);
    assert.ok(!ids(await root.get('/api/platform/sessions?window=online')).includes(online.id));
  });

  test('people cannot see or end sessions', async () => {
    const a = await h.signup('Nosy sessions');
    assert.equal((await a.get('/api/platform/sessions')).status, 403);
    assert.equal((await a.post(`/api/platform/sessions/${sidOf(a.token)}/revoke`)).status, 403);
    assert.equal((await a.post(`/api/platform/users/${a.id}/sign-out`)).status, 403);
  });
});
