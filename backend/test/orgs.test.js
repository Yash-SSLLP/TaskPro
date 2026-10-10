const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const h = require('./helpers');
const Team = require('../src/platform/models/Team');
const { DAY, inMs, give, move, ids, alertTitles } = require('./task-helpers');

before(h.start);
after(h.stop);

const KEYS = ['total', 'overdue', 'pending', 'notAccepted', 'inProgress', 'inReview', 'completed', 'inTime', 'delayed', 'cancelled', 'moreTime'];
const sorted = (list) => [...list].sort();
const newId = () => new mongoose.Types.ObjectId().toString();

/**
 * The boss owns Sales (with b) and is a plain member of Ops (c's); a, a
 * contact, has an organization of their own the boss is not in.
 */
async function orgWorld(label) {
  const boss = await h.signup(`${label} Boss`);
  const a = await h.signup(`${label} A`);
  const b = await h.signup(`${label} B`);
  const c = await h.signup(`${label} C`);
  await h.connect(boss, a);
  const sales = await h.makeTeam(boss, [b], { name: `${label} Sales` });
  const ops = await h.makeTeam(c, [boss], { name: `${label} Ops` });
  const theirs = await h.makeTeam(a, [], { name: `${label} Theirs` });
  const welcome = (await boss.get('/api/tasks?scope=mine')).body.tasks[0]._id;
  const plain = await give(boss, { title: 'Unfiled', assignees: [a.id] });
  const filed = await give(boss, { title: 'Sales job', assignees: [b.id], team: sales.id, dueDate: inMs(-DAY) });
  const opsJob = await give(c, { title: 'Ops job', assignees: [boss.id], team: ops.id });
  // Filed under an organization the boss is not in: General, for the boss.
  const foreign = await give(a, { title: 'Their job', assignees: [boss.id], team: theirs.id });
  return { boss, a, b, c, sales, ops, theirs, t: { welcome, plain: plain._id, filed: filed._id, opsJob: opsJob._id, foreign: foreign._id } };
}

describe('organization tabs (org=)', () => {
  test('all, general and one organization, across the list, counters, piles and board', async () => {
    const { boss, sales, ops, t } = await orgWorld('Tabs');
    const everything = sorted(Object.values(t));
    assert.deepEqual(sorted(ids(await boss.get('/api/tasks'))), everything);
    assert.deepEqual(sorted(ids(await boss.get('/api/tasks?org=all'))), everything);
    assert.deepEqual(sorted(ids(await boss.get('/api/tasks?org=general'))), sorted([t.welcome, t.plain, t.foreign]));
    assert.deepEqual(ids(await boss.get(`/api/tasks?org=${sales.id}`)), [t.filed]);
    assert.deepEqual(ids(await boss.get(`/api/tasks?org=${ops.id}`)), [t.opsJob]);
    assert.deepEqual(ids(await boss.get('/api/tasks?org=nonsense')), []);
    assert.deepEqual(ids(await boss.get(`/api/tasks?org=${newId()}`)), []);

    const counters = (await boss.get(`/api/tasks?org=${sales.id}`)).body.counters;
    assert.equal(counters.total, 1);
    assert.equal(counters.overdue, 1);
    assert.equal((await boss.get('/api/tasks/counters?org=general')).body.total, 3);

    // The Organization pile: Sales is the boss's to oversee, Ops is not.
    assert.deepEqual(ids(await boss.get('/api/tasks?scope=team')), [t.filed]);
    assert.deepEqual(ids(await boss.get(`/api/tasks?scope=team&org=${sales.id}`)), [t.filed]);
    assert.deepEqual(ids(await boss.get(`/api/tasks?scope=team&org=${ops.id}`)), []);
    assert.deepEqual(ids(await boss.get('/api/tasks?scope=team&org=general')), []);

    // Pile cards follow the tab; their keys stay the piles (1.0.6 reads scopes.team).
    const scoped = (await boss.get(`/api/tasks?withScopes=1&org=${sales.id}`)).body.scopes;
    assert.deepEqual(Object.keys(scoped), ['mine', 'delegated', 'loop', 'team']);
    assert.equal(scoped.delegated.total, 1);
    assert.equal(scoped.mine.total, 0);
    assert.equal(scoped.team.total, 1);
    const general = (await boss.get('/api/tasks?withScopes=1&org=general')).body.scopes;
    assert.equal(general.mine.total, 2, 'the welcome task and the foreign one');
    assert.equal(general.team.total, 0);

    const board = (await boss.get('/api/tasks/board?org=general')).body;
    assert.equal(board.columns.reduce((n, col) => n + col.count, 0), 3);

    // The older `team` filter keeps working the way installed apps use it.
    assert.deepEqual(ids(await boss.get(`/api/tasks?scope=delegated&team=${sales.id}`)), [t.filed]);
  });

  test('withOrgs: a tab per organization, General takes the rest, All is the sum', async () => {
    const { boss, a, sales, ops, theirs, t } = await orgWorld('Counts');
    const res = await boss.get('/api/tasks?withOrgs=1');
    assert.equal(res.status, 200);
    const { orgs } = res.body;
    assert.deepEqual(sorted(Object.keys(orgs)), sorted(['all', 'general', sales.id, ops.id]));
    assert.equal(theirs.id in orgs, false, 'only organizations the viewer is in');
    for (const tab of Object.values(orgs)) assert.deepEqual(sorted(Object.keys(tab)), sorted(KEYS));
    assert.equal(orgs.general.total, 3, 'unfiled work plus the task filed under an organization the boss is not in');
    assert.equal(orgs[sales.id].total, 1);
    assert.equal(orgs[sales.id].overdue, 1);
    assert.equal(orgs[ops.id].total, 1);
    for (const k of KEYS) assert.equal(orgs.all[k], orgs.general[k] + orgs[sales.id][k] + orgs[ops.id][k], k);
    assert.deepEqual(orgs.all, res.body.counters);
    assert.equal('orgs' in (await boss.get('/api/tasks')).body, false);

    // The selected tab, the figure clicked and the search box don't change the tab counts; the pile does.
    const picked = (await boss.get(`/api/tasks?withOrgs=1&org=${sales.id}&status=COMPLETED&q=zzz`)).body;
    assert.deepEqual(picked.orgs, orgs);
    assert.equal(picked.counters.total, 1);
    const delegated = (await boss.get('/api/tasks?withOrgs=1&scope=delegated')).body;
    assert.deepEqual(delegated.orgs.all, delegated.counters);
    assert.equal(delegated.orgs[ops.id].total, 0);
    assert.equal(delegated.orgs.general.total, 2);
    await move(boss, t.plain, 'CANCELLED', 'not needed');
    assert.equal((await boss.get('/api/tasks?withOrgs=1')).body.orgs.general.cancelled, 1);

    // The contact sees the foreign task under their own organization.
    const theirsCounts = (await a.get('/api/tasks?withOrgs=1')).body.orgs;
    assert.equal(theirsCounts[theirs.id].total, 1);

    // The Super Admin: General is unfiled work only; other work is in All alone.
    const root = await h.root();
    const rootRes = (await root.get('/api/tasks?withOrgs=1')).body;
    assert.deepEqual(sorted(Object.keys(rootRes.orgs)), ['all', 'general']);
    assert.equal(rootRes.orgs.all.total, rootRes.counters.total);
    const rootGeneral = ids(await root.get('/api/tasks?org=general&limit=200'));
    assert.ok(rootGeneral.includes(t.plain) && !rootGeneral.includes(t.foreign) && !rootGeneral.includes(t.filed));
    assert.equal(rootRes.orgs.general.total, (await root.get('/api/tasks/counters?org=general')).body.total);
  });

  test('the export names the organization tab', async () => {
    const { boss, c, sales, theirs } = await orgWorld('Export');
    const sheet = async (query) => {
      const res = await h.binary(boss.get(`/api/tasks/export?${query}`));
      assert.equal(res.status, 200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body);
      const rows = [];
      wb.getWorksheet('Summary').eachRow((r) => rows.push(r.values.slice(1)));
      return { rows, tasks: wb.getWorksheet('Tasks').rowCount - 1 };
    };
    const one = await sheet(`scope=team&org=${sales.id}`);
    assert.ok(one.rows.some(([k, v]) => k === 'Organization' && v === sales.name));
    assert.ok(one.rows.some(([k, v]) => k === 'Pile' && v === 'Organization tasks'));
    assert.equal(one.tasks, 1);
    assert.ok((await sheet('org=general')).rows.some(([k, v]) => k === 'Organization' && v === 'General'));
    assert.ok(!(await sheet('org=all')).rows.some(([k]) => k === 'Organization'));
    // One I'm not in: named from the rows I can see, never looked up by its id.
    assert.ok((await sheet(`org=${theirs.id}`)).rows.some(([k, v]) => k === 'Organization' && v === theirs.name));
    const hidden = await h.makeTeam(c, [], { name: 'Export Hidden' });
    const unseen = await sheet(`org=${hidden.id}`);
    assert.equal(unseen.tasks, 0);
    assert.ok(unseen.rows.some(([k, v]) => k === 'Organization' && v === 'Another organization'));
    assert.ok(!unseen.rows.some(([, v]) => v === hidden.name));
  });
});

describe('tab order (orgTabs)', () => {
  test('saved with the settings, kept by later saves, resolved in /meta', async () => {
    const { boss, c, sales, ops } = await orgWorld('Order');
    const keys = async () => (await boss.get('/api/tasks/meta')).body.orgTabs.map((x) => x.key);
    // Nothing saved: All, General, then the organizations by name.
    assert.deepEqual((await boss.get('/api/me/settings')).body.settings.orgTabs, []);
    assert.deepEqual(await keys(), ['all', 'general', ops.id, sales.id]);

    const saved = await boss.patch('/api/me/settings', { orgTabs: [ops.id, 'general', ops.id.toUpperCase()] });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.settings.orgTabs, [ops.id, 'general']);
    // Saving something else later keeps the order (merge rebuilds the settings).
    assert.deepEqual((await boss.patch('/api/me/settings', { lang: 'hi' })).body.settings.orgTabs, [ops.id, 'general']);
    assert.deepEqual((await boss.get('/api/auth/me')).body.settings.orgTabs, [ops.id, 'general']);

    const meta = (await boss.get('/api/tasks/meta')).body;
    assert.deepEqual(meta.orgTabs, [
      { key: ops.id, name: ops.name, myRole: 'member' },
      { key: 'general' },
      { key: 'all' },
      { key: sales.id, name: sales.name, myRole: 'owner' },
    ]);
    // `teams` is as before, for installed apps.
    assert.deepEqual(meta.teams, [
      { id: ops.id, name: ops.name, myRole: 'member' },
      { id: sales.id, name: sales.name, myRole: 'owner' },
    ]);

    // Leaving an organization drops its tab; one not in the saved order joins the others by name.
    assert.equal((await boss.del(`/api/teams/${ops.id}/members/${boss.id}`)).status, 200);
    assert.deepEqual(await keys(), ['general', 'all', sales.id]);
    const fresh = await h.makeTeam(c, [boss], { name: 'Order Aardvarks' });
    assert.deepEqual(await keys(), ['general', 'all', fresh.id, sales.id]);
    assert.deepEqual((await boss.get('/api/me/settings')).body.settings.orgTabs, [ops.id, 'general'], 'saved as sent; read against memberships');

    assert.equal((await boss.patch('/api/me/settings', { orgTabs: ['team'] })).status, 400);
    // Someone in more than 60 organizations can still save: the first 60 are kept.
    const many = Array.from({ length: 61 }, () => newId());
    const cut = await boss.patch('/api/me/settings', { orgTabs: many });
    assert.equal(cut.status, 200, JSON.stringify(cut.body));
    assert.deepEqual(cut.body.settings.orgTabs, many.slice(0, 60));
    assert.equal((await boss.patch('/api/me/settings', { orgTabs: Array.from({ length: 1001 }, () => newId()) })).status, 400);
    assert.equal((await boss.patch('/api/me/settings', { orgTabs: [] })).status, 200);
    assert.deepEqual(await keys(), ['all', 'general', fresh.id, sales.id]);

    const root = await h.root();
    const rootMeta = (await root.get('/api/tasks/meta')).body;
    assert.deepEqual(rootMeta.orgTabs, [{ key: 'all' }, { key: 'general' }]);
    assert.deepEqual(rootMeta.teams, []);
  });
});

describe('adding people to an organization', () => {
  test('from your connections: contacts and people you share an organization with', async () => {
    const owner = await h.signup('Inv Owner');
    const contact = await h.signup('Inv Contact');
    const mate = await h.signup('Inv Mate');
    const stranger = await h.signup('Inv Stranger');
    const member = await h.signup('Inv Member');
    await h.connect(owner, contact);
    await h.makeTeam(mate, [owner], { name: 'Elsewhere' });
    const team = await h.makeTeam(owner, [member], { name: 'Inv Org' });

    const res = await owner.post(`/api/teams/${team.id}/members`, {
      userIds: [contact.id, mate.id, stranger.id, member.id, owner.id, newId(), contact.id],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(res.body.invited, [{ id: contact.id, name: contact.name }, { id: mate.id, name: mate.name }]);
    const why = Object.fromEntries(res.body.skipped.map((s) => [s.id, s.reason]));
    assert.equal(why[stranger.id], 'not-connected');
    assert.equal(why[member.id], 'already');
    assert.equal(why[owner.id], 'already');
    assert.equal(Object.values(why).filter((r) => r === 'not-connected').length, 2);
    // A stranger's id (or an unknown one) gives away no name.
    assert.ok(res.body.skipped.filter((s) => s.reason === 'not-connected').every((s) => s.name === ''));
    const statusOf = (id) => res.body.team.members.find((m) => m.person.id === id)?.status;
    assert.equal(statusOf(contact.id), 'invited');
    assert.equal(statusOf(mate.id), 'invited');
    assert.equal(statusOf(stranger.id), undefined);

    // Invited, so told, and not in yet.
    assert.ok((await alertTitles(contact)).includes(`${owner.name} invited you to the organization "${team.name}"`));
    assert.equal((await h.alerts(contact))[0].kind, 'team');
    assert.deepEqual((await contact.get('/api/teams')).body.invites.map((i) => i.team.id), [team.id]);
    const again = await owner.post(`/api/teams/${team.id}/members`, { userIds: [contact.id] });
    assert.deepEqual(again.body.invited, []);
    assert.deepEqual(again.body.skipped, [{ id: contact.id, name: contact.name, reason: 'already' }]);

    // Until they accept, the organization's members cannot give them work.
    const refused = await member.post('/api/tasks', { title: 'Too soon', assignees: [contact.id] });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, `${contact.name} isn't in your contacts or organizations yet. Add them by their Task Pin first.`);
    assert.equal((await contact.post(`/api/teams/${team.id}/accept`)).status, 200);
    assert.equal((await member.post('/api/tasks', { title: 'Now', assignees: [contact.id] })).status, 201);
    assert.ok((await contact.get('/api/tasks/meta')).body.orgTabs.some((x) => x.key === team.id));

    // Who may, and with what.
    assert.equal((await member.post(`/api/teams/${team.id}/members`, { userIds: [stranger.id] })).status, 403);
    assert.equal((await owner.post(`/api/teams/${team.id}/members`, { userIds: [] })).status, 400);
    assert.equal((await owner.post(`/api/teams/${team.id}/members`, { userIds: Array.from({ length: 51 }, newId) })).status, 400);
    assert.equal((await owner.post(`/api/teams/${team.id}/members`, { userIds: ['nope'] })).status, 400);
    assert.equal((await owner.post(`/api/teams/${team.id}/members`, { userIds: [stranger.id], pin: stranger.pin })).status, 400);
    const noBody = await owner.post(`/api/teams/${team.id}/members`, {});
    assert.equal(noBody.status, 400);
    assert.equal(noBody.body.error, 'Enter a Task Pin');

    // By Task Pin, exactly as before.
    const byPin = await owner.post(`/api/teams/${team.id}/members`, { pin: stranger.pin });
    assert.equal(byPin.status, 201);
    assert.deepEqual(Object.keys(byPin.body), ['team']);
    const twice = await owner.post(`/api/teams/${team.id}/members`, { pin: stranger.pin });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.error, `${stranger.name} has already been invited`);
    assert.equal((await owner.post(`/api/teams/${team.id}/members`, { pin: member.pin })).body.error, `${member.name} is already in this organization`);
  });

  test('candidates: your connections, with where each stands here', async () => {
    const owner = await h.signup('Cand Owner');
    const admin = await h.signup('Cand Admin');
    const member = await h.signup('Cand Member');
    const zed = await h.signup('Cand Zed');
    const amy = await h.signup('Cand Amy');
    await h.connect(owner, zed);
    await h.connect(owner, amy);
    const team = await h.makeTeam(owner, [admin, member], { admins: [admin], name: 'Cand Org' });
    await owner.post(`/api/teams/${team.id}/members`, { pin: zed.pin });

    const res = await owner.get(`/api/teams/${team.id}/candidates`);
    assert.equal(res.status, 200);
    const people = res.body.people;
    assert.deepEqual(people.map((p) => p.id), [admin, amy, member, zed].sort((x, y) => x.name.localeCompare(y.name)).map((p) => p.id));
    const byId = Object.fromEntries(people.map((p) => [p.id, p]));
    assert.equal(byId[amy.id].membership, null);
    assert.equal(byId[amy.id].contact, true);
    assert.equal(byId[zed.id].membership, 'invited');
    assert.equal(byId[member.id].membership, 'active');
    assert.equal(byId[member.id].contact, false);
    assert.equal(byId[amy.id].pin, amy.pin);
    assert.ok('photoUrl' in byId[amy.id] && !('self' in byId[amy.id]) && !('teams' in byId[amy.id]));

    assert.deepEqual((await owner.get(`/api/teams/${team.id}/candidates?q=${encodeURIComponent('Cand Amy')}`)).body.people.map((p) => p.id), [amy.id]);
    assert.deepEqual((await owner.get(`/api/teams/${team.id}/candidates?q=${zed.pin}`)).body.people.map((p) => p.id), [zed.id]);
    assert.equal((await admin.get(`/api/teams/${team.id}/candidates`)).status, 200);
    assert.equal((await member.get(`/api/teams/${team.id}/candidates`)).status, 403);
    assert.equal((await amy.get(`/api/teams/${team.id}/candidates`)).status, 404);
    assert.equal((await (await h.root()).get(`/api/teams/${team.id}/candidates`)).status, 403);
  });

  test('a declined invite is told to whoever sent it; leaving is told to the owner and admins', async () => {
    const owner = await h.signup('Tell Owner');
    const admin = await h.signup('Tell Admin');
    const member = await h.signup('Tell Member');
    const other = await h.signup('Tell Other');
    const invitee = await h.signup('Tell Invitee');
    const team = await h.makeTeam(owner, [admin, member, other], { admins: [admin], name: 'Tell Org' });

    await admin.post(`/api/teams/${team.id}/members`, { pin: invitee.pin });
    assert.equal((await invitee.post(`/api/teams/${team.id}/decline`)).status, 200);
    const declined = `${invitee.name} declined your invite to the organization "${team.name}"`;
    assert.equal((await alertTitles(admin))[0], declined);
    assert.ok(!(await alertTitles(owner)).includes(declined));

    // Leaving before joining is declining too.
    await owner.post(`/api/teams/${team.id}/members`, { pin: invitee.pin });
    assert.equal((await invitee.del(`/api/teams/${team.id}/members/${invitee.id}`)).status, 200);
    assert.equal((await alertTitles(owner))[0], declined);

    assert.equal((await member.del(`/api/teams/${team.id}/members/${member.id}`)).status, 200);
    const left = `${member.name} left the organization "${team.name}"`;
    assert.equal((await alertTitles(owner))[0], left);
    assert.equal((await alertTitles(admin))[0], left);
    assert.ok(!(await alertTitles(other)).includes(left));
    assert.ok(!(await alertTitles(member)).includes(left));
  });

  test('limits: 50 organizations owned, 500 people in one', async () => {
    const owner = await h.signup('Cap Owner');
    const heir = await h.signup('Cap Heir');
    const outsider = await h.signup('Cap Outsider');
    const shared = await h.makeTeam(owner, [heir], { name: 'Cap Shared' });

    await Team.insertMany(Array.from({ length: 49 }, (_, i) => ({ name: `Cap ${i}`, owner: heir.id, members: [{ user: heir.id, role: 'owner', status: 'active' }] })));
    assert.equal((await heir.post('/api/teams', { name: 'Fiftieth' })).status, 201);
    const full = await heir.post('/api/teams', { name: 'One too many' });
    assert.equal(full.status, 400);
    assert.match(full.body.error, /You already own 50 organizations/);
    const handOver = await owner.post(`/api/teams/${shared.id}/transfer`, { userId: heir.id });
    assert.equal(handOver.status, 400);
    assert.match(handOver.body.error, new RegExp(`${heir.name} already owns 50 organizations`));

    const crowd = Array.from({ length: 498 }, () => ({ user: newId(), role: 'member', status: 'invited' }));
    await Team.updateOne({ _id: shared.id }, { $push: { members: { $each: crowd } } });
    const tooMany = await owner.post(`/api/teams/${shared.id}/members`, { pin: outsider.pin });
    assert.equal(tooMany.status, 400);
    assert.match(tooMany.body.error, /up to 500 people/);
  });
});
