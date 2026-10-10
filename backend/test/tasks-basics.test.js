const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { HOUR, DAY, inMs, give, act, move, detail, ids, titles, crew, alertTitles } = require('./task-helpers');

before(h.start);
after(h.stop);

describe('giving tasks', () => {
  test('a new person has a welcome task of their own', async () => {
    const p = await h.signup('Newbie');
    const res = await p.get('/api/tasks?scope=mine');
    assert.equal(res.status, 200);
    assert.deepEqual(titles(res), ['Welcome to Karo: share your Task Pin']);
    const t = res.body.tasks[0];
    assert.match(t.description, /^In Karo, you give tasks by Task Pin\./);
    assert.match(t.description, /Create an organization/);
    assert.equal((await detail(p, t._id)).updates[0].byName, 'Karo');
    assert.equal(t.requiresApproval, false);
    assert.equal(t.createdBy.id, p.id);
    assert.match(t.code, /^TSK-\d{4}-\d{5}$/);
    assert.equal(t.can.transitions.some((m) => m.to === 'COMPLETED'), true);
    // Nobody accepts a task they gave themselves, and it stays editable.
    assert.equal(t.assignees[0].acceptance, 'ACCEPTED');
    assert.equal(t.can.canAccept, false);
    assert.equal(res.body.counters.notAccepted, 0);
    assert.equal((await p.patch(`/api/tasks/${t._id}`, { title: 'Renamed welcome' })).status, 200);
  });

  test('your own row on a task you give others needs no accepting; theirs does', async () => {
    const { boss, a } = await crew('Mixed');
    const t = await give(boss, { title: 'Both of us', assignees: [boss.id, a.id] });
    const rows = Object.fromEntries(t.assignees.map((r) => [String(r.user?._id ?? r.user?.id ?? r.user), r.acceptance]));
    assert.equal(rows[boss.id], 'ACCEPTED');
    assert.equal(rows[a.id], 'AWAITING');
    assert.equal((await boss.patch(`/api/tasks/${t._id}`, { title: 'Still open' })).status, 200, 'terms stay open until the other person accepts');
  });

  test('to contacts and team-mates; never to strangers; nobody chosen means yourself', async () => {
    const { boss, a, b, team } = await crew();
    const stranger = await h.signup('Stranger');

    const t = await give(boss, { title: 'Send GST invoices', assignees: [a.id, b.id], dueDate: inMs(2 * DAY), priority: 'Urgent', team: team.id });
    assert.match(t.code, /^TSK-\d{4}-\d{5}$/);
    assert.equal(t.status, 'PENDING');
    assert.equal(t.requiresApproval, false, 'review is off unless asked for');
    assert.deepEqual(t.team, { id: team.id, name: team.name });
    assert.deepEqual(t.assignees.map((x) => x.user.id), [a.id, b.id]);
    const person = t.assignees[0].user;
    assert.deepEqual(Object.keys(person).sort(), ['_id', 'id', 'name', 'photoUrl', 'pin', 'pinDisplay']);
    assert.equal(person.pinDisplay, `${a.pin.slice(0, 4)}-${a.pin.slice(4)}`);
    assert.equal(t.createdBy.id, boss.id);
    assert.equal(t.accent.key, 'Urgent');

    assert.ok((await alertTitles(a)).includes(`New task from ${boss.name}`));
    assert.ok(!(await alertTitles(boss)).some((x) => x.startsWith('New task')));
    assert.equal((await h.alerts(a))[0].link, `/tasks/${t._id}`);

    const refused = await boss.post('/api/tasks', { title: 'x', assignees: [stranger.id] });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, `${stranger.name} isn't in your contacts or organizations yet. Add them by their Task Pin first.`);
    const loopRefused = await boss.post('/api/tasks', { title: 'x', loopUsers: [stranger.id] });
    assert.equal(loopRefused.status, 400);

    const mine = await give(stranger, { title: 'Call the CA' });
    assert.deepEqual(mine.assignees.map((x) => x.user.id), [stranger.id]);
    assert.equal((await detail(stranger, mine._id)).can.canSubmit, false);

    assert.equal((await boss.post('/api/tasks', { title: '  ' })).body.error, 'Give the task a title.');
    assert.equal((await boss.post('/api/tasks', { title: 'x', dueDate: 'someday' })).status, 400);
    // Only a team you are in.
    const other = await h.makeTeam(stranger);
    assert.equal((await boss.post('/api/tasks', { title: 'x', team: other.id })).status, 400);
    // On someone else's behalf is the Super Admin's alone.
    assert.equal((await boss.post('/api/tasks', { title: 'x', onBehalfOf: a.id })).status, 403);
  });

  test('a task given without saying is not awaiting review, unless the setter turned review on', async () => {
    const { boss, a } = await crew('Review');
    const plain = await give(boss, { title: 'No review', assignees: [a.id] });
    assert.equal(plain.requiresApproval, false);
    await act(a, plain._id, 'accept');
    const done = await move(a, plain._id, 'COMPLETED', 'done');
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.task.status, 'COMPLETED', 'closed without waiting for the setter');

    assert.equal((await boss.patch('/api/me/settings', { approvalDefault: true })).status, 200);
    assert.equal((await give(boss, { title: 'Check it', assignees: [a.id] })).requiresApproval, true);
    assert.equal((await give(boss, { title: 'Not this one', assignees: [a.id], requiresApproval: false })).requiresApproval, false);
  });

  test('meta: the assignable people, my teams, and the vocabulary', async () => {
    const { boss, a, b, team } = await crew();
    const res = await boss.get('/api/tasks/meta');
    assert.equal(res.status, 200);
    const m = res.body;
    assert.deepEqual(m.people.map((p) => [p.id, p.relation]), [[boss.id, 'self'], [b.id, 'team'], [a.id, 'contact']]);
    const pb = m.people[1];
    assert.equal(pb._id, b.id);
    assert.deepEqual(pb.teams, [team.id]);
    assert.equal(pb.canAssign, true);
    assert.equal(pb.departed, false);
    assert.equal(pb.pinDisplay.length, 9);
    assert.deepEqual(m.team, { direct: [b.id], indirect: [] });
    assert.equal(m.hasTeam, true);
    assert.deepEqual(m.teams, [{ id: team.id, name: team.name, myRole: 'owner' }]);
    assert.equal(m.canAssignOnBehalf, false);
    assert.equal(m.canRecur, true);
    assert.equal(m.canSetReminders, true);
    assert.equal(m.isAdmin, false);
    assert.equal(m.canManageCategories, true);
    assert.equal(m.swipeRemarkRequired, true);
    assert.deepEqual(m.defaultReminders, [{ channel: 'APP', when: 'BEFORE', amount: 1, unit: 'DAYS' }]);
    assert.deepEqual(m.priorities, ['Urgent', 'Medium', 'Low']);
    assert.deepEqual(m.statuses.map((s) => s.key), ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'CANCELLED']);
    assert.deepEqual(m.sorts.map((s) => s.key), ['due', 'assigned', 'pending', 'priority', 'title', 'created']);
    assert.equal(m.nudgeCooldownMin, 30);
    assert.equal(m.maxPieces, 50);
    assert.ok(m.boardColumns.length === 4 && m.frequencies.length === 5 && m.reminderPatterns.length === 4);
    assert.equal('departments' in m, false);
    assert.equal('defaultPoints' in m, false);

    const root = await h.root();
    const rm = (await root.get('/api/tasks/meta')).body;
    assert.equal(rm.canAssignOnBehalf, true);
    assert.equal(rm.isAdmin, true);
    assert.ok(rm.people.length >= 3 && rm.people.every((p) => p.relation === 'other'));
  });
});

describe('who sees what', () => {
  test('strangers get 404; team admins see the team pile, members do not', async () => {
    const owner = await h.signup('Owner');
    const admin = await h.signup('Admin');
    const m1 = await h.signup('Member1');
    const m2 = await h.signup('Member2');
    const stranger = await h.signup('Stranger');
    const team = await h.makeTeam(owner, [admin, m1, m2], { admins: [admin] });

    const t = await give(m1, { title: 'Stock count', assignees: [m2.id], team: team.id });
    const solo = await give(m1, { title: 'Not filed', assignees: [m2.id] });

    const hidden = await stranger.get(`/api/tasks/${t._id}`);
    assert.equal(hidden.status, 404);
    assert.equal(hidden.body.error, 'That task no longer exists.');
    assert.equal((await move(stranger, t._id, 'IN_PROGRESS')).status, 404);
    assert.equal((await stranger.get(`/api/tasks/${t._id}/updates`)).status, 404);
    assert.equal((await stranger.get('/api/tasks/not-an-id')).status, 404);

    // The admin sees it through the team; the owner too; the other member does not.
    assert.equal((await admin.get(`/api/tasks/${t._id}`)).status, 200);
    assert.deepEqual(ids(await admin.get('/api/tasks?scope=team')), [t._id]);
    assert.deepEqual(ids(await admin.get(`/api/tasks?scope=team&team=${team.id}`)), [t._id]);
    assert.deepEqual(ids(await owner.get('/api/tasks?scope=team')), [t._id]);
    assert.equal((await admin.get(`/api/tasks/${solo._id}`)).status, 404);
    const m3 = await h.signup('Member3');
    await h.makeTeam(owner, [m3]);
    assert.deepEqual(ids(await m3.get('/api/tasks?scope=team')), []);
    assert.equal((await m3.get(`/api/tasks/${t._id}`)).status, 404);
    // A team admin acts as an assigner on team tasks.
    const asAdmin = (await detail(admin, t._id)).can;
    assert.equal(asAdmin.role, 'assigner');
    assert.equal(asAdmin.canDelete, true);
    assert.equal(asAdmin.canPurge, false);

    assert.equal((await m1.get('/api/tasks?scope=all')).status, 403);
    const scopes = (await admin.get('/api/tasks?withScopes=1')).body.scopes;
    assert.deepEqual(Object.keys(scopes), ['mine', 'delegated', 'loop', 'team']);
    assert.equal(scopes.team.total, 1);
    assert.deepEqual(Object.keys((await m2.get('/api/tasks?withScopes=1')).body.scopes), ['mine', 'delegated', 'loop']);

    // Mine / delegated / loop piles.
    const looped = await give(m1, { title: 'FYI', assignees: [m2.id], loopUsers: [admin.id] });
    assert.deepEqual(ids(await admin.get('/api/tasks?scope=loop')), [looped._id]);
    assert.ok(ids(await m2.get('/api/tasks?scope=mine')).includes(t._id));
    assert.ok(ids(await m1.get('/api/tasks?scope=delegated')).includes(solo._id));
    assert.ok(!ids(await m1.get('/api/tasks?scope=mine')).includes(solo._id));
  });

  test('the Super Admin sees, edits, deletes and purges anything, and sets tasks on behalf', async () => {
    const { boss, a } = await crew('SA');
    const root = await h.root();
    const t = await give(boss, { title: 'Quarterly filing', assignees: [a.id] });
    assert.ok(ids(await root.get('/api/tasks?scope=all&limit=200')).includes(t._id));
    assert.ok((await root.get('/api/tasks?withScopes=1')).body.scopes.all.total >= 1);

    await a.post(`/api/tasks/${t._id}/accept`);
    // The setter can no longer edit (409 with the reason); the Super Admin can.
    const locked = await boss.patch(`/api/tasks/${t._id}`, { title: 'Changed' });
    assert.equal(locked.status, 409);
    assert.match(locked.body.error, /has accepted this task/);
    const rootCan = (await detail(root, t._id)).can;
    assert.equal(rootCan.canEdit, true);
    assert.equal(rootCan.canDelete, true);
    assert.equal(rootCan.canPurge, true);
    assert.ok(rootCan.transitions.length >= 3);
    const edited = await root.patch(`/api/tasks/${t._id}`, { title: 'Quarterly filing (Q3)' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.task.title, 'Quarterly filing (Q3)');

    // On behalf: the task is the boss's; onBehalf records the Super Admin.
    const proxied = await give(root, { title: 'Proxy task', onBehalfOf: boss.id, assignees: [a.id] });
    assert.equal(proxied.createdBy.id, boss.id);
    assert.equal(String(proxied.onBehalf.by), root.id);
    assert.ok((await alertTitles(boss)).includes(`${root.name} set a task on your behalf`));

    // Archive, then purge.
    assert.equal((await a.del(`/api/tasks/${t._id}`)).status, 403);
    assert.equal((await boss.del(`/api/tasks/${t._id}?purge=1`)).status, 403);
    const archived = await root.del(`/api/tasks/${t._id}`);
    assert.deepEqual(archived.body, { ok: true, purged: false, message: 'Removed.' });
    assert.equal((await boss.get(`/api/tasks/${t._id}`)).status, 404);
    const purged = await root.del(`/api/tasks/${proxied._id}?purge=1`);
    assert.equal(purged.body.purged, true);
    assert.equal((await root.get(`/api/tasks/${proxied._id}`)).status, 404);
  });
});

describe('lists', () => {
  test('counters, filters, sorts, paging and serials agree with the rows', async () => {
    const { boss, a, b } = await crew('List');
    const late = await give(boss, { title: 'Late one', assignees: [a.id], dueDate: inMs(-2 * HOUR), priority: 'Low' });
    const soon = await give(boss, { title: 'Soon one', assignees: [a.id], dueDate: inMs(5 * HOUR), priority: 'Urgent' });
    const started = await give(boss, { title: 'Started one', assignees: [b.id], dueDate: inMs(3 * DAY) });
    await move(b, started._id, 'IN_PROGRESS', 'on it');
    const done = await give(boss, { title: 'Done one', assignees: [a.id], requiresApproval: false });
    await move(a, done._id, 'COMPLETED', 'finished');

    const base = `/api/tasks?scope=delegated&assignedTo=${a.id},${b.id}`;
    const res = await boss.get(base);
    assert.equal(res.body.total, 4);
    assert.deepEqual(res.body.counters, {
      total: 4, overdue: 1, pending: 1, notAccepted: 1, inProgress: 1, inReview: 0, completed: 1, inTime: 1, delayed: 0, cancelled: 0, moreTime: 0,
    });
    assert.equal(res.body.tasks.find((t) => t._id === late._id).overdue, true);
    assert.equal(res.body.sort, 'due');
    assert.equal(res.body.dir, 'desc');

    // Clicking a figure narrows the rows, not the bar.
    const od = await boss.get(`${base}&overdue=1`);
    assert.deepEqual(ids(od), [late._id]);
    assert.equal(od.body.counters.total, 4);
    assert.deepEqual(ids(await boss.get(`${base}&status=COMPLETED`)), [done._id]);
    assert.deepEqual(ids(await boss.get(`${base}&priority=urgent`)), [soon._id]);
    assert.deepEqual(ids(await boss.get(`/api/tasks?scope=delegated&assignedTo=${b.id}`)), [started._id]);
    assert.deepEqual(ids(await boss.get(`${base}&q=soon`)), [soon._id]);
    assert.deepEqual(ids(await boss.get(`${base}&late=0&status=COMPLETED`)), [done._id]);

    const byPriority = await boss.get(`${base}&sort=priority`);
    assert.equal(byPriority.body.tasks[0]._id, soon._id);
    const page2 = await boss.get(`${base}&sort=title&limit=2&page=2`);
    assert.deepEqual(page2.body.tasks.map((t) => t.serial), [3, 4]);
    assert.equal(page2.body.pages, 2);
    assert.deepEqual(titles(page2), ['Soon one', 'Started one']);

    const counters = await boss.get(`/api/tasks/counters?scope=delegated&assignedTo=${a.id},${b.id}`);
    assert.equal(counters.body.overdue, 1);

    const board = await boss.get(`/api/tasks/board?scope=delegated&assignedTo=${a.id},${b.id}`);
    assert.deepEqual(board.body.columns.map((c) => [c.key, c.count]), [['PENDING', 2], ['IN_PROGRESS', 1], ['SUBMITTED', 0], ['COMPLETED', 1]]);

    // Ranges are read in the viewer's zone; open work always shows on "today".
    const today = await boss.get('/api/tasks?scope=delegated&range=today');
    assert.ok(ids(today).includes(started._id));
  });
});

describe('files', () => {
  test('files and a voice note ride on the create; strangers cannot open them', async () => {
    const { boss, a } = await crew('Files');
    const stranger = await h.signup('Snoop');
    const res = await boss.multipart('post', '/api/tasks', { title: 'Check this invoice', assignees: [a.id], voiceDurationMs: '4200' }, [
      { field: 'files', buffer: h.PNG, filename: 'invoice.png', contentType: 'image/png' },
      { field: 'voice', buffer: h.AUDIO, filename: 'note.m4a', contentType: 'audio/mp4' },
    ]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const t = res.body.task;
    assert.equal(t.attachments.length, 1);
    const att = t.attachments[0];
    assert.equal(att.name, 'invoice.png');
    assert.equal(att.kind, 'image');
    assert.match(att.url, /^\/api\/files\/[a-f\d]{24}\?exp=\d+&sig=/);
    assert.equal(t.hasVoiceNote, true);
    assert.equal(t.voiceNote.durationMs, 4200);
    assert.ok(t.voiceNote.url);

    const got = await h.binary(a.get(`/api/tasks/${t._id}/files/${att._id}`));
    assert.equal(got.status, 200);
    assert.deepEqual(got.body, h.PNG);
    assert.equal((await a.get(`/api/tasks/${t._id}/files/voice`)).status, 200);
    assert.equal((await stranger.get(`/api/tasks/${t._id}/files/${att._id}`)).status, 404);
    // Through the platform's file route: the assignee may, a stranger may not.
    assert.equal((await a.get(`/api/files/${att.file}`)).status, 200);
    assert.ok([403, 404].includes((await stranger.get(`/api/files/${att.file}`)).status));
    // The signed link works with no session at all.
    assert.equal((await h.request().get(att.url)).status, 200);

    const bad = await boss.multipart('post', '/api/tasks', { title: 'x' }, [{ field: 'files', buffer: Buffer.from('MZ'), filename: 'run.exe', contentType: 'application/x-msdownload' }]);
    assert.equal(bad.status, 400);
  });
});
