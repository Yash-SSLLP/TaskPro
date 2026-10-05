const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const User = require('../src/platform/models/User');
const Task = require('../src/product/models/Task');
const engine = require('../src/product/services/engine');
const access = require('../src/product/services/access');
const { DAY, inMs, give, act, move, detail, crew, alertTitles } = require('./task-helpers');

before(h.start);
after(h.stop);

const feedKinds = async (who, id) => (await who.get(`/api/tasks/${id}/updates`)).body.updates.map((u) => u.kind).reverse();

describe('lifecycle', () => {
  test('accept, hand in, send back, withdraw, approve, reopen, cancel', async () => {
    const { boss, a } = await crew('Life');
    const t = await give(boss, { title: 'Send GST invoices', assignees: [a.id], dueDate: inMs(2 * DAY) });

    let can = (await detail(a, t._id)).can;
    assert.equal(can.role, 'doer');
    assert.equal(can.canAccept, true);
    assert.equal(can.canSubmit, true);
    assert.equal(can.canEdit, false);
    assert.deepEqual(can.transitions.map((m) => m.to), ['IN_PROGRESS', 'SUBMITTED']);
    can = (await detail(boss, t._id)).can;
    assert.equal(can.role, 'assigner');
    assert.equal(can.canEdit, true);
    assert.deepEqual(can.transitions.map((m) => m.to), ['IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

    const accepted = await act(a, t._id, 'accept');
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.task.status, 'IN_PROGRESS');
    assert.equal(accepted.body.task.assignees[0].acceptance, 'ACCEPTED');
    assert.equal(accepted.body.can.canAccept, false);
    assert.ok((await alertTitles(boss)).includes(`${a.name} accepted ${t.code} — Send GST invoices`));

    // Every move needs a note; a doer's Complete becomes a hand-in.
    assert.equal((await a.post(`/api/tasks/${t._id}/status`, { to: 'COMPLETED' })).status, 400);
    const handedIn = await move(a, t._id, 'COMPLETED', 'All sent');
    assert.equal(handedIn.body.task.status, 'SUBMITTED');
    assert.equal(handedIn.body.coerced, true);
    assert.equal(handedIn.body.task.assignees[0].completedLate, false);
    assert.ok((await alertTitles(boss)).includes(`${a.name} handed in ${t.code} — Send GST invoices`));
    assert.equal((await detail(boss, t._id)).can.canApprove, true);

    const noNote = await act(boss, t._id, 'reject', {});
    assert.equal(noNote.status, 400);
    assert.match(noNote.body.error, /Say what needs doing/);
    const back = await act(boss, t._id, 'reject', { note: 'Add March too' });
    assert.equal(back.body.task.status, 'IN_PROGRESS');
    assert.equal(back.body.task.rejectionCount, 1);
    assert.ok((await alertTitles(a)).includes(`${boss.name} sent ${t.code} — Send GST invoices back`));

    const sub = await act(a, t._id, 'submit', { note: 'Added March' });
    assert.equal(sub.body.task.status, 'SUBMITTED');
    assert.equal(sub.body.can.canWithdraw, true);
    const withdrawn = await move(a, t._id, 'PENDING', 'Spotted a mistake');
    assert.equal(withdrawn.body.task.status, 'PENDING');
    await act(a, t._id, 'submit', { note: 'Fixed' });
    const approved = await act(boss, t._id, 'approve', { note: 'Great' });
    assert.equal(approved.body.task.status, 'COMPLETED');
    assert.equal(approved.body.task.completedLate, false);
    assert.ok(approved.body.task.completedAt);
    assert.ok((await alertTitles(a)).includes(`${boss.name} approved ${t.code} — Send GST invoices`));

    assert.equal((await move(a, t._id, 'IN_PROGRESS', 'x')).status, 403);
    const reopened = await move(boss, t._id, 'IN_PROGRESS', 'One more file');
    assert.equal(reopened.body.task.status, 'IN_PROGRESS');
    assert.equal(reopened.body.task.completedAt, undefined);
    const cancelled = await move(boss, t._id, 'CANCELLED', 'Not needed');
    assert.equal(cancelled.body.task.status, 'CANCELLED');
    assert.ok((await alertTitles(a)).includes(`${boss.name} called off a task`));
    assert.equal((await move(a, t._id, 'IN_PROGRESS', 'x')).status, 400);
    const back2 = await move(boss, t._id, 'PENDING', 'Needed after all');
    assert.equal(back2.body.task.status, 'PENDING');

    assert.deepEqual(await feedKinds(boss, t._id), [
      'CREATED', 'ACCEPTED', 'SUBMITTED', 'SENT_BACK', 'SUBMITTED', 'STATUS', 'SUBMITTED', 'APPROVED', 'STATUS', 'STATUS', 'STATUS',
    ]);
    const feed = (await boss.get(`/api/tasks/${t._id}/updates?limit=2`)).body.updates;
    assert.equal(feed.length, 2);
    assert.equal(feed[0].by.id, boss.id);
    const older = (await boss.get(`/api/tasks/${t._id}/updates?before=${feed[1].createdAt}`)).body.updates;
    assert.ok(older.length >= 8);
  });

  test('declining needs a reason and tells the setter; a late hand-in is frozen as delayed', async () => {
    const { boss, a, b } = await crew('Decline');
    const t = await give(boss, { title: 'Cover the counter', assignees: [a.id] });
    assert.equal((await act(a, t._id, 'decline', {})).status, 400);
    const res = await act(a, t._id, 'decline', { reason: 'On leave Thursday' });
    assert.equal(res.body.task.declined, true);
    assert.equal(res.body.task.assignees[0].declineReason, 'On leave Thursday');
    assert.equal(res.body.can.canAccept, false);
    assert.equal(res.body.can.myAcceptance, 'REJECTED');
    const alert = (await h.alerts(boss)).find((n) => n.title.includes('cannot take on'));
    assert.equal(alert.body, 'On leave Thursday');

    const lateOne = await give(boss, { title: 'Was due yesterday', assignees: [b.id], dueDate: inMs(-DAY) });
    await act(b, lateOne._id, 'submit', { note: 'Done, late' });
    await act(boss, lateOne._id, 'approve', { note: 'ok' });
    const fresh = (await detail(boss, lateOne._id)).task;
    assert.equal(fresh.completedLate, true);
  });

  test('two moves at once: the second gets a 409', async () => {
    const { boss, a } = await crew('Race');
    const t = await give(boss, { title: 'Race me', assignees: [a.id] });
    const who = await access.actorFor(await User.findById(boss.id));
    const first = await Task.findById(t._id);
    const second = await Task.findById(t._id);
    await engine.move({ taskId: t._id, who, to: 'CANCELLED', note: 'first', task: first });
    await assert.rejects(
      engine.move({ taskId: t._id, who, to: 'COMPLETED', note: 'second', task: second }),
      (err) => err.status === 409 && /Somebody else moved this task/.test(err.message)
    );
  });
});

describe('changing the terms', () => {
  test('edits before acceptance leave a field-by-field trail; after it, a 409', async () => {
    const { boss, a } = await crew('Edit');
    const t = await give(boss, { title: 'Draft the letter', assignees: [a.id], dueDate: '2030-01-10' });
    assert.equal((await a.patch(`/api/tasks/${t._id}`, { title: 'Mine now' })).status, 403);
    const res = await boss.patch(`/api/tasks/${t._id}`, { title: 'Draft the notice', dueDate: '2030-01-12', priority: 'Urgent' });
    assert.equal(res.status, 200);
    assert.equal(res.body.task.editCount, 1);
    assert.deepEqual(res.body.changes.map((c) => c.field), ['title', 'priority', 'dueDate']);
    assert.equal(res.body.changes[0].before, 'Draft the letter');
    assert.equal(res.body.changes[0].after, 'Draft the notice');
    assert.match(res.body.changes[2].before, /10 Jan 2030, 6:00 PM/);
    const edited = (await boss.get(`/api/tasks/${t._id}/updates`)).body.updates[0];
    assert.equal(edited.kind, 'EDITED');
    assert.equal(edited.changes.length, 3);
    assert.ok((await alertTitles(a)).includes(`${boss.name} edited a task for you`));

    const started = await boss.patch(`/api/tasks/${t._id}`, { startDate: '2030-01-05', team: null });
    assert.equal(new Date(started.body.task.startDate).toISOString(), '2030-01-04T18:30:00.000Z');
    assert.deepEqual(started.body.changes.map((c) => c.field), ['startDate']);

    await act(a, t._id, 'accept');
    const locked = await boss.patch(`/api/tasks/${t._id}`, { title: 'Again' });
    assert.equal(locked.status, 409);
    assert.equal((await detail(boss, t._id)).can.editLocked, locked.body.error);
  });
});

describe('changing hands', () => {
  test('delegate: to my own contacts only; I keep following it and become the approver', async () => {
    const { boss, a } = await crew('Deleg');
    const c = await h.signup('Helper');
    const stranger = await h.signup('Nobody');
    await h.connect(a, c);
    const t = await give(boss, { title: 'Book the hall', assignees: [a.id] });

    const refused = await act(a, t._id, 'delegate', { to: stranger.id });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /isn't in your contacts or teams yet/);
    assert.equal((await act(boss, t._id, 'delegate', { to: c.id })).status, 403);

    const res = await act(a, t._id, 'delegate', { to: c.id, note: 'You know the manager' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.delegatedTo, { user: c.id, name: c.name });
    assert.deepEqual(res.body.task.assignees.map((x) => x.user.id), [c.id]);
    assert.equal(String(res.body.task.approver), a.id);
    assert.ok((await alertTitles(c)).includes(`${a.name} passed you a task`));
    // a still sees it and hears about it; c hands in to a.
    assert.equal((await a.get(`/api/tasks/${t._id}`)).status, 200);
    await act(c, t._id, 'submit', { note: 'Booked' });
    assert.ok((await alertTitles(a)).some((x) => x.startsWith(`${c.name} handed in`)));
    assert.equal((await detail(a, t._id)).can.canApprove, true);
  });

  test('transfer: the person it comes off drops out completely', async () => {
    const { boss, a, b } = await crew('Transfer');
    const t = await give(boss, { title: 'Wrong person', assignees: [a.id] });
    assert.equal((await act(boss, t._id, 'transfer', { to: b.id })).status, 400);
    const res = await act(boss, t._id, 'transfer', { to: b.id, reason: 'B handles accounts' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.task.assignees.map((x) => x.user.id), [b.id]);
    assert.equal(res.body.task.transfers.length, 1);
    assert.ok((await alertTitles(a)).includes(`${t.code} — Wrong person is no longer yours`));
    assert.ok((await alertTitles(b)).includes(`${t.code} — Wrong person is now yours`));
    assert.equal((await a.get(`/api/tasks/${t._id}`)).status, 404);
  });
});

describe('more time, progress and the bell', () => {
  test('ask for more time; the setter approves or declines', async () => {
    const { boss, a } = await crew('Ext');
    const due = inMs(DAY);
    const t = await give(boss, { title: 'Audit', assignees: [a.id], dueDate: due });
    assert.equal((await act(a, t._id, 'extension', { toDate: inMs(3 * DAY) })).status, 400);
    assert.equal((await act(a, t._id, 'extension', { toDate: inMs(-DAY), reason: 'x' })).status, 400);
    const asked = await act(a, t._id, 'extension', { toDate: inMs(3 * DAY), reason: 'Waiting on the bank' });
    assert.equal(asked.status, 201);
    assert.equal(asked.body.task.pendingExtension.reason, 'Waiting on the bank');
    assert.equal(asked.body.can.canRequestExtension, false);
    assert.equal((await act(a, t._id, 'extension', { toDate: inMs(4 * DAY), reason: 'again' })).status, 400);
    assert.ok((await alertTitles(boss)).some((x) => x.startsWith(`${a.name} needs longer`)));
    assert.equal((await detail(boss, t._id)).can.canDecideExtension, true);

    const reqId = asked.body.extension._id;
    assert.equal((await act(a, t._id, `extension/${reqId}`, { approve: true })).status, 403);
    const yes = await act(boss, t._id, `extension/${reqId}`, { approve: true, note: 'Fine' });
    assert.equal(yes.body.extension.status, 'APPROVED');
    assert.equal(new Date(yes.body.task.dueDate).toISOString(), new Date(asked.body.extension.toDate).toISOString());
    assert.equal(yes.body.task.extensionCount, 1);
    assert.ok((await alertTitles(a)).includes(`More time granted on ${t.code} — Audit`));

    const again = await act(a, t._id, 'extension', { toDate: inMs(10 * DAY), reason: 'Bank again' });
    const no = await act(boss, t._id, `extension/${again.body.extension._id}`, { approve: false, note: 'No' });
    assert.equal(no.body.extension.status, 'DECLINED');
    assert.equal(no.body.task.lastExtension.status, 'DECLINED');
  });

  test('progress is the doer’s; moving off zero starts it', async () => {
    const { boss, a } = await crew('Prog');
    const t = await give(boss, { title: 'Paint', assignees: [a.id] });
    assert.equal((await boss.patch(`/api/tasks/${t._id}/progress`, { progress: 50 })).status, 403);
    const res = await a.patch(`/api/tasks/${t._id}/progress`, { progress: 40 });
    assert.equal(res.status, 200);
    assert.equal(res.body.progress, 40);
    assert.equal(res.body.task.status, 'IN_PROGRESS');
    assert.equal(res.body.task.progress, 40);
    assert.equal(res.body.can.myProgress, 40);
    assert.equal((await a.patch(`/api/tasks/${t._id}/progress`, { progress: 40 })).body.unchanged, true);
  });

  test('the bell: once per direction per 30 minutes (429 with nextAt)', async () => {
    const { boss, a } = await crew('Bell');
    const t = await give(boss, { title: 'Chase me', assignees: [a.id] });
    assert.equal((await act(a, t._id, 'nudge')).status, 403);
    const first = await act(boss, t._id, 'nudge', { note: 'Today please' });
    assert.equal(first.status, 200);
    assert.equal(first.body.kind, 'DOER');
    assert.equal(first.body.sentTo, a.name);
    assert.ok((await alertTitles(a)).includes(`Reminder from ${boss.name}`));
    const again = await act(boss, t._id, 'nudge');
    assert.equal(again.status, 429);
    assert.ok(again.body.nextAt);
    assert.match(again.body.error, /A reminder went out/);
    assert.ok((await detail(boss, t._id)).can.nudgeReadyAt);

    // The doer chasing the review is another direction.
    await act(a, t._id, 'submit', { note: 'Done' });
    const review = await act(a, t._id, 'nudge');
    assert.equal(review.status, 200);
    assert.equal(review.body.kind, 'REVIEW');
    assert.ok((await alertTitles(boss)).includes(`${a.name} is waiting on your review`));
  });
});

describe('pieces', () => {
  test('split into pieces, claim an open one, and the parent rolls up', async () => {
    const boss = await h.signup('Lead');
    const b = await h.signup('Worker B');
    const c = await h.signup('Worker C');
    const stranger = await h.signup('Outsider');
    const team = await h.makeTeam(boss, [b, c]);
    const parent = await give(boss, { title: 'Launch event', assignees: [b.id], team: team.id, dueDate: inMs(5 * DAY) });

    assert.equal((await b.post(`/api/tasks/${parent._id}/split`, { items: [{ title: 'x', assignee: stranger.id }] })).status, 400);
    const split = await b.post(`/api/tasks/${parent._id}/split`, {
      items: [{ title: 'Book venue', assignee: c.id }, { title: 'Print posters' }],
    });
    assert.equal(split.status, 201, JSON.stringify(split.body));
    const [p1, p2] = split.body.children;
    assert.equal(p1.isPiece, true);
    assert.deepEqual(p1.assignees.map((x) => x.user.id), [c.id]);
    assert.equal(p2.isOpenPiece, true);
    assert.deepEqual(p2.openTo.map(String).sort(), [boss.id, c.id].sort());
    assert.equal(split.body.task.childCount, 2);
    assert.ok((await alertTitles(c)).includes('A piece of work is up for grabs'));

    // Open pieces show in "mine" for the people offered them; the first claim wins.
    const mine = (await c.get('/api/tasks?scope=mine')).body.tasks.map((x) => x._id);
    assert.ok(mine.includes(p2._id));
    assert.equal((await detail(c, p2._id)).can.canClaim, true);
    assert.equal((await act(stranger, p2._id, 'claim')).status, 404);
    const claimed = await act(c, p2._id, 'claim');
    assert.equal(claimed.status, 200);
    assert.deepEqual(claimed.body.task.assignees.map((x) => x.user.id), [c.id]);
    assert.equal((await act(boss, p2._id, 'claim')).status, 409);

    // The parent's owner sees the pieces through the parent.
    const d = await detail(boss, parent._id);
    assert.equal(d.children.length, 2);
    assert.equal((await boss.get(`/api/tasks/${p1._id}`)).status, 200);
    assert.equal((await boss.get(`/api/tasks/${parent._id}/children`)).body.children.length, 2);

    // c finishes one piece: b (who split it) approves.
    await act(c, p1._id, 'submit', { note: 'Venue booked' });
    await act(b, p1._id, 'approve', { note: 'Good' });
    const rolled = (await detail(boss, parent._id)).task;
    assert.equal(rolled.childDoneCount, 1);
    assert.equal(rolled.subtasksDone, 1);
    // One piece at 100, one at 0, and b's own share at 0 → 33%.
    assert.equal(rolled.progress, 33);
  });
});

describe('remarks', () => {
  test('comments with files, a voice note and mentions', async () => {
    const { boss, a } = await crew('Talk');
    const stranger = await h.signup('Eavesdropper');
    const t = await give(boss, { title: 'Discuss', assignees: [a.id] });
    assert.equal((await act(a, t._id, 'updates', {})).status, 400);

    const res = await a.multipart('post', `/api/tasks/${t._id}/updates`, { note: 'See attached', mentions: [stranger.id, boss.id], voiceDurationMs: '1500' }, [
      { field: 'files', buffer: h.PNG, filename: 'shot.png', contentType: 'image/png' },
      { field: 'voice', buffer: h.AUDIO, filename: 'v.m4a', contentType: 'audio/mp4' },
    ]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const u = res.body.update;
    assert.equal(u.kind, 'COMMENT');
    assert.equal(u.by.id, a.id);
    assert.equal(u.files[0].name, 'shot.png');
    assert.ok(u.files[0].url);
    assert.ok(u.voiceNote.url);
    // A mention can't reach someone who can't see the task.
    assert.deepEqual(u.mentions.map(String), [boss.id]);
    assert.equal((await h.alerts(stranger)).length, 0);
    assert.ok((await alertTitles(boss)).includes(`${a.name} on ${t.code} — Discuss`));

    const task = (await detail(boss, t._id)).task;
    assert.equal(task.attachments.length, 1);
    assert.equal(String(task.attachments[0].update), u._id);
    const file = await h.binary(boss.get(`/api/tasks/${t._id}/files/${u.files[0]._id}`));
    assert.equal(file.status, 200);
    assert.equal((await boss.get(`/api/tasks/${t._id}/updates/${u._id}/voice`)).status, 200);
    assert.equal((await stranger.get(`/api/tasks/${t._id}/updates/${u._id}/voice`)).status, 404);
    assert.ok([403, 404].includes((await stranger.get(`/api/files/${u.files[0].file}`)).status));

    // Files on a status move hang on the task too.
    const moved = await a.multipart('post', `/api/tasks/${t._id}/submit`, { note: 'Proof' }, [{ field: 'files', buffer: h.PNG, filename: 'proof.png', contentType: 'image/png' }]);
    assert.equal(moved.status, 200);
    assert.equal(moved.body.task.attachments.length, 2);
    assert.equal(moved.body.update.files[0].name, 'proof.png');
  });
});
