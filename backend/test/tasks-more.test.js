const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const h = require('./helpers');
const Task = require('../src/product/models/Task');
const { DAY, inMs, give, act, move, detail, crew } = require('./task-helpers');

before(h.start);
after(h.stop);

describe('templates are gone', () => {
  test('old apps get an empty list; a template id on a new task is ignored', async () => {
    const { boss, a } = await crew('NoTpl');
    const list = await boss.get('/api/tasks/templates');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body, { mine: [], team: [], templates: [] });
    assert.equal((await boss.post('/api/tasks/templates', { title: 'x' })).status, 404);

    const t = await give(boss, { title: 'Plain', assignees: [a.id], template: new mongoose.Types.ObjectId().toString() });
    assert.equal('template' in t, false);
    assert.equal((await Task.findById(t._id).lean()).template, undefined);

    // A task made from a template before keeps the id in the database, never in the API.
    await Task.collection.updateOne({ _id: new mongoose.Types.ObjectId(t._id) }, { $set: { template: new mongoose.Types.ObjectId() } });
    assert.equal('template' in (await detail(boss, t._id)).task, false);
  });

  test('deleting an account still clears the templates it saved before', async () => {
    const me = await h.signup('OldTpl');
    const other = await h.signup('OldTplOther');
    const templates = mongoose.connection.collection('tasktemplates');
    const mine = new mongoose.Types.ObjectId(me.id);
    const team = new mongoose.Types.ObjectId();
    await templates.insertMany([
      { title: 'Mine', createdBy: mine, createdByName: me.name, team: null },
      { title: 'Shared', createdBy: mine, createdByName: me.name, team },
      { title: 'Theirs', createdBy: new mongoose.Types.ObjectId(other.id), createdByName: other.name, team: null },
    ]);
    assert.equal((await me.post('/api/auth/delete-account', { password: 'password123' })).status, 200);
    const left = await templates.find({ title: { $in: ['Mine', 'Shared', 'Theirs'] } }).sort({ title: 1 }).toArray();
    assert.deepEqual(left.map((x) => [x.title, x.createdByName]), [['Shared', 'Deleted user'], ['Theirs', other.name]]);
  });
});

describe('categories', () => {
  test('personal and team lists; renames carry tasks; removal hides one in use', async () => {
    const owner = await h.signup('CatOwner');
    const member = await h.signup('CatMember');
    const stranger = await h.signup('CatStranger');
    const team = await h.makeTeam(owner, [member]);

    const sales = await owner.post('/api/tasks/categories', { name: 'Sales' });
    assert.equal(sales.status, 201);
    assert.deepEqual(Object.keys(sales.body.category).filter((k) => ['_id', 'name', 'color', 'team'].includes(k)).sort(), ['_id', 'color', 'name', 'team']);
    const again = await owner.post('/api/tasks/categories', { name: 'sales' });
    assert.equal(again.status, 200);
    assert.equal(again.body.existed, true);
    const ops = await owner.post('/api/tasks/categories', { name: 'Operations', team: team.id });
    assert.equal(ops.status, 201);
    assert.equal(String(ops.body.category.team), team.id);
    assert.equal((await member.post('/api/tasks/categories', { name: 'Nope', team: team.id })).status, 403);
    await member.post('/api/tasks/categories', { name: 'Personal' });

    const names = async (who) => (await who.get('/api/tasks/categories')).body.categories.map((c) => c.name).sort();
    assert.deepEqual(await names(owner), ['Operations', 'Sales']);
    assert.deepEqual(await names(member), ['Operations', 'Personal']);
    assert.deepEqual(await names(stranger), []);
    assert.deepEqual((await member.get('/api/tasks/meta')).body.categories.map((c) => c.name).sort(), ['Operations', 'Personal']);

    const t = await give(owner, { title: 'Call leads', category: 'Sales' });
    assert.equal((await member.patch(`/api/tasks/categories/${sales.body.category._id}`, { name: 'X' })).status, 403);
    const renamed = await owner.patch(`/api/tasks/categories/${sales.body.category._id}`, { name: 'Sales & Leads' });
    assert.equal(renamed.body.movedTasks, 1);
    assert.equal((await detail(owner, t._id)).task.category, 'Sales & Leads');

    const counted = (await owner.get('/api/tasks/categories?withCounts=1')).body.categories.find((c) => c.name === 'Sales & Leads');
    assert.equal(counted.taskCount, 1);
    const hidden = await owner.del(`/api/tasks/categories/${sales.body.category._id}`);
    assert.equal(hidden.body.hidden, true);
    assert.deepEqual(await names(owner), ['Operations']);
    const removed = await owner.del(`/api/tasks/categories/${ops.body.category._id}`);
    assert.equal(removed.body.removed, true);
  });
});

describe('dashboard and reports', () => {
  test('mine, delegated, category, trend, people (team admins only) and overdue', async () => {
    const owner = await h.signup('DashOwner');
    const admin = await h.signup('DashAdmin');
    const m = await h.signup('DashMember');
    const outsider = await h.signup('DashOutsider');
    await h.connect(owner, outsider);
    const team = await h.makeTeam(owner, [admin, m], { admins: [admin] });

    const t1 = await give(owner, { title: 'One', assignees: [m.id], team: team.id, category: 'Ops', requiresApproval: false, dueDate: inMs(DAY) });
    await move(m, t1._id, 'COMPLETED', 'done');
    await give(owner, { title: 'Two', assignees: [m.id], team: team.id, category: 'Ops', dueDate: inMs(-DAY) });
    await give(owner, { title: 'Three', assignees: [outsider.id], category: 'Sales', dueDate: inMs(2 * DAY) });

    const mine = (await m.get('/api/tasks/dashboard?view=mine')).body;
    assert.equal(mine.view, 'mine');
    const r = mine.rows[0];
    assert.equal(r.person.id, m.id);
    // Welcome task + One + Two.
    assert.deepEqual([r.total, r.completed, r.inTime, r.overdue, r.open], [3, 1, 1, 1, 2]);
    assert.equal(r.completionPct, 33);
    assert.equal(r.onTimePct, 100);
    assert.equal('points' in r, false);

    const delegated = (await owner.get('/api/tasks/dashboard?view=delegated')).body.rows;
    // (their own welcome task counts too: they set it)
    assert.deepEqual(delegated.map((x) => [x.person.name, x.total]).sort(), [[m.name, 2], [outsider.name, 1], [owner.name, 1]].sort());

    const cats = (await owner.get('/api/tasks/dashboard?view=category&scope=delegated')).body.rows;
    assert.deepEqual(cats.map((x) => [x.category, x.total]).sort(), [['Ops', 2], ['Sales', 1], ['Uncategorised', 1]]);

    const trend = (await owner.get('/api/tasks/dashboard?view=trend&scope=delegated')).body;
    assert.equal(trend.grain, 'day');
    assert.equal(trend.rows.reduce((s, x) => s + x.total, 0), 3);
    assert.ok(trend.rows.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.bucket)));

    const people = await admin.get('/api/tasks/dashboard?view=people');
    assert.equal(people.status, 200);
    assert.deepEqual(people.body.rows.map((x) => [x.person.id, x.total]), [[m.id, 2]]);
    assert.equal((await m.get('/api/tasks/dashboard?view=people')).status, 403);
    const root = await h.root();
    const all = (await root.get(`/api/tasks/dashboard?view=people&team=${team.id}`)).body.rows;
    assert.deepEqual(all.map((x) => x.person.id), [m.id]);

    const overdue = (await owner.get('/api/tasks/dashboard/overdue?scope=delegated')).body.rows;
    assert.deepEqual(overdue.map((x) => [x.title, x.daysLate, x.who]), [['Two', 1, m.name]]);
  });

  test('export: the list as xlsx with Tasks and Summary sheets', async () => {
    const { boss, a } = await crew('Export');
    await give(boss, { title: 'Export me', assignees: [a.id], dueDate: '2030-01-15T12:30:00.000Z', category: 'Accounts' });
    const res = await h.binary(boss.get('/api/tasks/export?scope=delegated'));
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /spreadsheetml/);
    assert.match(res.headers['content-disposition'], /Tasks_Assigned-by-me_.*\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Tasks', 'Summary']);
    const ws = wb.getWorksheet('Tasks');
    const header = ws.getRow(1).values.slice(1);
    assert.ok(header.includes('Task') && header.includes('Assigned to'));
    assert.ok(!header.includes('Points'));
    const row = ws.getRow(2).values.slice(1);
    assert.equal(row[2], 'Export me');
    assert.equal(row[8], a.name);
    // 12:30 UTC is 6:00 PM in Asia/Kolkata (the viewer's zone).
    const dueCell = ws.getRow(2).getCell(11).value;
    assert.equal(dueCell.toISOString(), '2030-01-15T18:00:00.000Z');
    assert.equal(ws.rowCount, 3); // plus their own welcome task (no deadline, so last)
  });
});

describe('platform hooks', () => {
  test('deleting a team unfiles its tasks; the Super Admin console gets numbers', async () => {
    const owner = await h.signup('HookOwner');
    const m = await h.signup('HookMember');
    const team = await h.makeTeam(owner, [m]);
    const t = await give(owner, { title: 'Filed', assignees: [m.id], team: team.id, dueDate: inMs(-DAY) });
    assert.equal((await owner.del(`/api/teams/${team.id}`)).status, 200);
    assert.equal((await detail(owner, t._id)).task.team, null);
    // Still the member's task, not a team task any more.
    assert.equal((await m.get(`/api/tasks/${t._id}`)).status, 200);

    const root = await h.root();
    const overview = (await root.get('/api/platform/overview')).body;
    assert.deepEqual(Object.keys(overview.tasks).sort(), ['completed', 'inReview', 'open', 'overdue', 'total']);
    assert.ok(overview.tasks.overdue >= 1);
    const user = (await root.get(`/api/platform/users/${m.id}`)).body;
    assert.deepEqual(user.stats, { open: 2, given: 0, overdue: 1 });
    const ownerStats = (await root.get(`/api/platform/users/${owner.id}`)).body.stats;
    assert.equal(ownerStats.given, 1);
    await act(m, t._id, 'accept');
  });
});
