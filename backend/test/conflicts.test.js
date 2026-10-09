/**
 * Proper data when people change the same task at the same time: the edit
 * form's conflict check (baseUpdatedAt) and the engine's race guards.
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { DAY, inMs, give, act, detail } = require('./task-helpers');
const access = require('../src/product/services/access');
const TaskUpdate = require('../src/product/models/TaskUpdate');

before(h.start);
after(h.stop);

/** A team task two people may edit (its setter and the team's owner), and its doer. */
async function sharedTask(label) {
  const owner = await h.signup(`${label} Owner`);
  const setter = await h.signup(`${label} Setter`);
  const doer = await h.signup(`${label} Doer`);
  const team = await h.makeTeam(owner, [setter, doer]);
  const t = await give(setter, { title: 'Book the hall', assignees: [doer.id], team: team.id, dueDate: inMs(3 * DAY) });
  return { owner, setter, doer, team, t };
}

const opened = async (who, id) => (await detail(who, id)).task.updatedAt;

/**
 * Hold the engine's task reads until `n` requests are waiting, then let them
 * all go: they act on the same version, as two people pressing at once would.
 * One round only; later reads (a retry) go straight through.
 */
function together(n) {
  const real = access.loadVisible;
  const waiting = [];
  access.loadVisible = async (...args) => {
    const task = await real(...args);
    if (waiting.length + 1 >= n) {
      access.loadVisible = real;
      waiting.splice(0).forEach((go) => go());
      return task;
    }
    await new Promise((go) => waiting.push(go));
    return task;
  };
  return () => {
    access.loadVisible = real;
  };
}

const feedKinds = async (who, id) => (await detail(who, id)).updates.map((u) => u.kind);

describe('editing what somebody else just changed', () => {
  test('the same field: a 409 that says who and what; nothing is saved', async () => {
    const { owner, setter, t } = await sharedTask('Clash');
    const base = await opened(setter, t._id);
    assert.equal((await owner.patch(`/api/tasks/${t._id}`, { title: 'Book the big hall' })).status, 200);

    const res = await setter.patch(`/api/tasks/${t._id}`, { title: 'Book the small hall', baseUpdatedAt: base });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'EDIT_CONFLICT');
    assert.deepEqual(res.body.fields, ['title']);
    assert.equal(res.body.by.id, owner.id);
    assert.equal(res.body.by.name, owner.name);
    assert.equal(res.body.message, `${owner.name} changed the title while you were editing. Look at the latest and save again.`);
    assert.equal(res.body.error, res.body.message);
    assert.equal((await detail(setter, t._id)).task.title, 'Book the big hall');
  });

  test('a different field goes through, and keeps the other change', async () => {
    const { owner, setter, t } = await sharedTask('Apart');
    const base = await opened(setter, t._id);
    assert.equal((await owner.patch(`/api/tasks/${t._id}`, { title: 'Book the big hall' })).status, 200);

    const res = await setter.patch(`/api/tasks/${t._id}`, { priority: 'Urgent', baseUpdatedAt: base });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.task.priority, 'Urgent');
    assert.equal(res.body.task.title, 'Book the big hall');
  });

  test('loading after the other edit, editing your own change again, or sending no base: no conflict', async () => {
    const { owner, setter, t } = await sharedTask('Fresh');
    assert.equal((await owner.patch(`/api/tasks/${t._id}`, { title: 'Owner title' })).status, 200);
    // Opened after it: the form already shows it.
    const base = await opened(setter, t._id);
    const mine = await setter.patch(`/api/tasks/${t._id}`, { title: 'Setter title', baseUpdatedAt: base });
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    // My own earlier edit never counts against me.
    assert.equal((await setter.patch(`/api/tasks/${t._id}`, { title: 'Setter title 2', baseUpdatedAt: base })).status, 200);
    // Without a base, exactly as before: the last save wins.
    assert.equal((await setter.patch(`/api/tasks/${t._id}`, { title: 'Setter title 3' })).status, 200);
    assert.equal((await owner.patch(`/api/tasks/${t._id}`, { title: 'Owner wins' })).status, 200);
    assert.equal((await detail(owner, t._id)).task.title, 'Owner wins');
  });

  test('several fields and people are named together', async () => {
    const { owner, setter, t } = await sharedTask('Many');
    const root = await h.root();
    const base = await opened(setter, t._id);
    assert.equal((await owner.patch(`/api/tasks/${t._id}`, { title: 'Owner title' })).status, 200);
    assert.equal((await root.patch(`/api/tasks/${t._id}`, { dueDate: inMs(5 * DAY) })).status, 200);
    const res = await setter.patch(`/api/tasks/${t._id}`, { title: 'Mine', dueDate: inMs(6 * DAY), priority: 'Low', baseUpdatedAt: base });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.fields, ['title', 'dueDate']);
    assert.match(res.body.message, /changed the title and the deadline while you were editing/);
    assert.ok(res.body.message.includes(owner.name) && res.body.message.includes(root.name));
    assert.equal(res.body.by.id, root.id, 'the latest of them');
  });

  test('a transfer since the form was opened clashes with changing who is on it', async () => {
    const { owner, setter, doer, t } = await sharedTask('Moved');
    const other = await h.signup('Moved Other');
    await h.connect(owner, other);
    await h.connect(setter, other);
    const base = await opened(setter, t._id);
    assert.equal((await act(owner, t._id, 'transfer', { to: other.id, reason: 'Their area' })).status, 200);
    const res = await setter.patch(`/api/tasks/${t._id}`, { assignees: [doer.id], baseUpdatedAt: base });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.fields, ['assignees']);
    assert.match(res.body.message, /changed who is on it while you were editing/);
    assert.equal((await detail(setter, t._id)).task.assignees[0].user.id, other.id);
  });

  test('a conflicting voice note stores nothing', async () => {
    const { owner, setter, t } = await sharedTask('Voice');
    const base = await opened(setter, t._id);
    const first = await owner.multipart('patch', `/api/tasks/${t._id}`, {}, [{ field: 'voice', buffer: h.AUDIO, filename: 'a.m4a', contentType: 'audio/mp4' }]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const res = await setter.multipart('patch', `/api/tasks/${t._id}`, { baseUpdatedAt: base }, [
      { field: 'voice', buffer: h.AUDIO, filename: 'b.m4a', contentType: 'audio/mp4' },
    ]);
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.fields, ['voiceNote']);
    const edits = await TaskUpdate.countDocuments({ task: t._id, kind: 'EDITED' });
    assert.equal(edits, 1);
  });
});

describe('two presses at once', () => {
  test('accepting twice: one answer, one feed line, both told it is accepted', async () => {
    const { doer, setter, t } = await sharedTask('Twice');
    const release = together(2);
    try {
      const [x, y] = await Promise.all([act(doer, t._id, 'accept'), act(doer, t._id, 'accept')]);
      assert.equal(x.status, 200, JSON.stringify(x.body));
      assert.equal(y.status, 200, JSON.stringify(y.body));
      assert.equal([x, y].filter((r) => r.body.unchanged).length, 1);
      assert.equal(y.body.task.assignees[0].acceptance, 'ACCEPTED');
    } finally {
      release();
    }
    assert.equal((await feedKinds(setter, t._id)).filter((k) => k === 'ACCEPTED').length, 1);
  });

  test('declining twice: one answer, one feed line', async () => {
    const { doer, setter, t } = await sharedTask('No twice');
    const release = together(2);
    try {
      const both = await Promise.all([act(doer, t._id, 'decline', { reason: 'Away' }), act(doer, t._id, 'decline', { reason: 'Away' })]);
      both.forEach((r) => assert.equal(r.status, 200, JSON.stringify(r.body)));
    } finally {
      release();
    }
    assert.equal((await feedKinds(setter, t._id)).filter((k) => k === 'REJECTED').length, 1);
  });

  test('passing it on twice: the second is told plainly, and only one person gets it', async () => {
    const { doer, setter, owner, t } = await sharedTask('Pass');
    const release = together(2);
    let results;
    try {
      results = await Promise.all([act(doer, t._id, 'delegate', { to: setter.id }), act(doer, t._id, 'delegate', { to: owner.id })]);
    } finally {
      release();
    }
    const ok = results.filter((r) => r.status === 200);
    const lost = results.filter((r) => r.status === 409);
    assert.equal(ok.length, 1);
    assert.equal(lost.length, 1);
    assert.equal(lost[0].body.error, 'Somebody else changed this task a moment ago. Open it again to see where it is.');
    const fresh = (await detail(setter, t._id)).task;
    assert.equal(fresh.assignees.length, 1);
    assert.equal(fresh.delegationCount, 1);
  });

  test('a transfer racing an accept: neither is lost silently', async () => {
    const { doer, setter, t } = await sharedTask('Cross');
    const other = await h.signup('Cross Other');
    await h.connect(setter, other);
    const release = together(2);
    let results;
    try {
      results = await Promise.all([act(setter, t._id, 'transfer', { to: other.id, reason: 'Their area' }), act(doer, t._id, 'accept')]);
    } finally {
      release();
    }
    const [transfer, accepted] = results;
    const fresh = (await detail(setter, t._id)).task;
    if (transfer.status === 200) {
      // The transfer won: the doer's accept was either refused or found them gone.
      assert.equal(fresh.assignees.length, 1);
      assert.equal(fresh.assignees[0].user.id, other.id);
      assert.ok([403, 409].includes(accepted.status), `accept answered ${accepted.status}`);
    } else {
      // The accept won: the transfer was told to look again.
      assert.equal(transfer.status, 409);
      assert.equal(accepted.status, 200);
      assert.equal(fresh.assignees[0].acceptance, 'ACCEPTED');
    }
  });

  test('a status move racing an accept keeps the move', async () => {
    const { doer, setter, t } = await sharedTask('Cancel');
    const release = together(2);
    let results;
    try {
      results = await Promise.all([act(setter, t._id, 'status', { to: 'CANCELLED', note: 'Not needed' }), act(doer, t._id, 'accept')]);
    } finally {
      release();
    }
    const fresh = (await detail(setter, t._id)).task;
    if (results[0].status === 200) {
      assert.equal(fresh.status, 'CANCELLED', 'an accept never re-opens a cancelled task');
      assert.ok(results[1].status >= 400, `accept answered ${results[1].status}`);
    } else {
      assert.equal(results[0].status, 409);
      assert.equal(fresh.assignees[0].acceptance, 'ACCEPTED');
    }
  });
});
