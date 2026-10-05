/**
 * Test harness: an in-memory MongoDB, the real app, and helpers to sign people
 * up, link them by Task Pin and call the API as someone.
 */
process.env.NODE_ENV = 'test';
process.env.SUPERADMIN_USERNAME = 'root';
process.env.SUPERADMIN_PASSWORD = 'root-password-1';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../src/app');
const { connectDB } = require('../src/platform/db');
const { ensureSuperAdmin } = require('../src/platform/seed');

let mongo;
let app;

async function start() {
  mongo = await MongoMemoryServer.create();
  await connectDB(mongo.getUri('test'));
  await ensureSuperAdmin();
  app = createApp();
  return app;
}

async function stop() {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
}

/** An API client that remembers its token. */
function client(token) {
  const withAuth = (req) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
  return {
    token,
    get: (url) => withAuth(request(app).get(url)),
    post: (url, body) => withAuth(request(app).post(url)).send(body ?? {}),
    patch: (url, body) => withAuth(request(app).patch(url)).send(body ?? {}),
    put: (url, body) => withAuth(request(app).put(url)).send(body ?? {}),
    del: (url, body) => withAuth(request(app).delete(url)).send(body ?? {}),
    upload: (url, field, buffer, filename, contentType) =>
      withAuth(request(app).post(url)).attach(field, buffer, { filename, contentType }),
    /** A multipart request: `fields` as form fields, `files` as [{ field, buffer, filename, contentType }]. */
    multipart: (method, url, fields = {}, files = []) => {
      let req = withAuth(request(app)[method](url));
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) continue;
        req = req.field(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
      for (const f of files) req = req.attach(f.field, f.buffer, { filename: f.filename, contentType: f.contentType });
      return req;
    },
    raw: () => request(app),
  };
}

let n = 0;
/** Sign up a new person; returns their client plus who they are. */
async function signup(name = 'Person') {
  n += 1;
  const identifier = `person${n}@example.com`;
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name: `${name} ${n}`, identifier, password: 'password123' });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    ...client(res.body.token),
    session: res.body,
    identifier,
    id: res.body.user.id,
    pin: res.body.user.pin,
    name: res.body.user.name,
  };
}

/** a asks b by Task Pin and b accepts: they are now contacts. */
async function connect(a, b) {
  const asked = await a.post('/api/contacts', { pin: b.pin });
  if (asked.status !== 201) throw new Error(`contact request failed: ${asked.status} ${JSON.stringify(asked.body)}`);
  const accepted = await b.post(`/api/contacts/${asked.body.request.id}/accept`);
  if (accepted.status !== 200) throw new Error(`contact accept failed: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  return accepted.body.contact;
}

let t = 0;
/**
 * A team owned by `owner`, with everyone in `members` invited by pin and
 * joined. Pass `{ admins: [person] }` to make some of them admins.
 */
async function makeTeam(owner, members = [], { name, admins = [] } = {}) {
  t += 1;
  const created = await owner.post('/api/teams', { name: name || `Team ${t}` });
  if (created.status !== 201) throw new Error(`team create failed: ${created.status} ${JSON.stringify(created.body)}`);
  const id = created.body.team.id;
  const adminIds = new Set(admins.map((a) => a.id));
  for (const m of members) {
    const role = adminIds.has(m.id) ? 'admin' : 'member';
    const invited = await owner.post(`/api/teams/${id}/members`, { pin: m.pin, role });
    if (invited.status !== 201) throw new Error(`team invite failed: ${invited.status} ${JSON.stringify(invited.body)}`);
    const joined = await m.post(`/api/teams/${id}/accept`);
    if (joined.status !== 200) throw new Error(`team join failed: ${joined.status} ${JSON.stringify(joined.body)}`);
  }
  return { id, name: created.body.team.name };
}

/** The Super Admin's client. */
async function root() {
  const res = await request(app).post('/api/auth/login').send({ identifier: 'root', password: 'root-password-1' });
  if (res.status !== 200) throw new Error(`root login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...client(res.body.token), id: res.body.user.id, name: res.body.user.name };
}

/** Everything in someone's bell, newest first. */
async function alerts(who) {
  const res = await who.get('/api/notifications');
  return res.body.notifications;
}

/** Read a binary response (xlsx, files) into a Buffer. */
const binary = (req) =>
  req.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
// Not a real recording; the server only checks the type.
const AUDIO = Buffer.from('0000001c667479704d344120000000004d34412069736f6d', 'hex');

module.exports = {
  start,
  stop,
  client,
  signup,
  connect,
  makeTeam,
  root,
  alerts,
  binary,
  PNG,
  AUDIO,
  request: () => request(app),
};
