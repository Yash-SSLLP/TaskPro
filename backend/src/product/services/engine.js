/**
 * The only way a task moves, plus the doer's other answers.
 *
 * Every move: is LEGAL (config.TRANSITIONS), the mover is ENTITLED
 * (access.actorRoleOn), it is SAID OUT LOUD (a note or a voice note), it
 * happens ONCE (a conditional claim on status + rev: a race gets a 409),
 * everyone who cares HEARS (notify), and the feed RECORDS it (TaskUpdate).
 *
 * A move lands on the mover's own assignee row; the task's status is rolled
 * up from all of them by the model. An assigner's verdict (approve, send
 * back, cancel) moves everybody's row at once.
 */
const mongoose = require('mongoose');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const Team = require('../../platform/models/Team');
const { HttpError } = require('../../platform/errors');
const {
  STATUS, ACCEPTANCE, transitionFor, effectiveTarget, isTerminal, statusLabel, MAX_SUBTASKS,
  MAX_SPLIT_DEPTH, clampProgress, normalisePriority, EXTENSION_STATUS, DEFAULT_PRIORITY, idOf,
} = require('../config');
const access = require('./access');
const notify = require('./notify');
const people = require('./people');

const fail = (message, status = 400) => new HttpError(status, message);
const later = (p) => p.catch((e) => console.warn('[tasks] notify failed:', e.message));

/** Feed kinds the clients word for themselves. */
const FEED_KIND = {
  [`${STATUS.PENDING}>${STATUS.SUBMITTED}`]: 'SUBMITTED',
  [`${STATUS.IN_PROGRESS}>${STATUS.SUBMITTED}`]: 'SUBMITTED',
  [`${STATUS.SUBMITTED}>${STATUS.COMPLETED}`]: 'APPROVED',
  [`${STATUS.SUBMITTED}>${STATUS.IN_PROGRESS}`]: 'SENT_BACK',
};

const load = (who, taskId) => access.loadVisible(who, taskId);

async function afterChildChange(task) {
  if (task.parentTask) await recomputeParent(task.parentTask).catch((e) => console.warn('[tasks] parent recompute:', e.message));
}

const feed = (task, who, fields) =>
  TaskUpdate.create({ task: task._id, by: who.user._id, byName: who.user.name, ...fields });

/**
 * Move a task (or the mover's part of it).
 * @param {{ taskId, who, to, note?, voiceNote?, files?, mentions?, task? }} opts
 *   `task` may be a document already loaded (the claim still guards it).
 */
async function move({ taskId, who, to, note = '', voiceNote = null, files = [], mentions = [], task = null }) {
  task = task || (await load(who, taskId));
  const role = access.actorRoleOn(who, task);
  if (!role) throw fail('That task is not yours to act on.', 403);

  const from = task.status;
  const wanted = to;
  to = effectiveTarget(task, role, to, who.id);
  if (from === to) return { task, update: null, unchanged: true };

  const rule = transitionFor(from, to);
  if (!rule) throw fail(`A ${statusLabel(from).toLowerCase()} task cannot be marked ${statusLabel(to).toLowerCase()}.`);
  if (!rule.by.includes(role) && !who.superAdmin) {
    throw fail(role === 'doer' ? 'Only the person who set this can make that change.' : 'Only the person doing this can make that change.', 403);
  }

  const said = String(note || '').trim();
  if (rule.note && !said && !voiceNote) {
    const why = {
      [STATUS.COMPLETED]: from === STATUS.SUBMITTED
        ? 'Say a word about what you are approving.'
        : 'Add a note (or a voice note) saying what was done before marking this complete.',
      [STATUS.SUBMITTED]: 'Say what you did before handing this in. A voice note counts.',
      [STATUS.IN_PROGRESS]: from === STATUS.SUBMITTED
        ? 'Say what needs doing before sending this back.'
        : 'Add a note (or a voice note) explaining this change.',
    }[to];
    throw fail(why || 'Add a note (or a voice note) explaining this change.');
  }

  // It happens once: claim the status we read. A second mover finds nothing.
  const rev = task.rev || 0;
  const claimed = await Task.updateOne({ _id: task._id, status: from, rev }, { $inc: { rev: 1 } });
  if (!claimed.matchedCount) throw fail('Somebody else moved this task a moment ago. Open it again to see where it is.', 409);
  task.rev = rev + 1;

  const now = new Date();
  const mine = task.assigneeFor(who.id);
  const verdict = from === STATUS.SUBMITTED && role === 'assigner' && [STATUS.COMPLETED, STATUS.IN_PROGRESS, STATUS.PENDING].includes(to);
  const wholeTask = to === STATUS.CANCELLED || verdict || !mine;
  const everyone = task.assignees || [];
  // A refuser is moved only by a cancellation.
  const rows = wholeTask
    ? to === STATUS.CANCELLED ? everyone : everyone.filter((a) => a.acceptance !== ACCEPTANCE.REJECTED)
    : [mine];

  for (const row of rows) {
    // Starting work implies acceptance.
    if ((to === STATUS.IN_PROGRESS || to === STATUS.COMPLETED) && row.acceptance === ACCEPTANCE.AWAITING) {
      row.acceptance = ACCEPTANCE.ACCEPTED;
      row.acceptedAt = now;
    }
    if (to === STATUS.IN_PROGRESS) {
      if (row.status === STATUS.COMPLETED) {
        row.completedAt = undefined;
        row.completedLate = false;
      }
      if (row.status === STATUS.SUBMITTED && role === 'assigner') task.rejectionCount = (task.rejectionCount || 0) + 1;
      row.status = STATUS.IN_PROGRESS;
      if (!row.startedAt) row.startedAt = now;
    } else if (to === STATUS.SUBMITTED) {
      // Punctuality is decided when it is handed in, not when it is approved.
      row.status = STATUS.SUBMITTED;
      if (!row.startedAt) row.startedAt = now;
      if (!row.submittedAt) row.submittedAt = now;
      if (!row.progress) row.progress = 100;
      row.completedLate = Boolean(task.dueDate && row.submittedAt > new Date(task.dueDate));
    } else if (to === STATUS.COMPLETED) {
      row.status = STATUS.COMPLETED;
      if (!row.startedAt) row.startedAt = now;
      row.completedAt = now;
      row.progress = 100;
      row.completedLate = row.submittedAt
        ? Boolean(task.dueDate && new Date(row.submittedAt) > new Date(task.dueDate))
        : Boolean(task.dueDate && now > new Date(task.dueDate));
    } else if (to === STATUS.PENDING) {
      row.status = STATUS.PENDING;
      row.startedAt = undefined;
      row.completedAt = undefined;
      row.submittedAt = undefined;
      row.completedLate = false;
    } else if (to === STATUS.CANCELLED) {
      row.status = STATUS.CANCELLED;
    }
  }

  if (to === STATUS.CANCELLED) task.status = STATUS.CANCELLED;
  else if (from === STATUS.CANCELLED) task.status = STATUS.PENDING;
  if (said) task.stateNote = said.slice(0, 1000);
  // Back in play: the reminders may fire again.
  if (to === STATUS.PENDING || to === STATUS.IN_PROGRESS) {
    task.firedReminders = [];
    task.submittedAt = undefined;
  }
  task.updateCount = (task.updateCount || 0) + 1;
  await task.save();
  await afterChildChange(task);

  const update = await feed(task, who, {
    kind: FEED_KIND[`${from}>${task.status}`] || 'STATUS',
    from,
    to: task.status,
    note: said,
    voiceNote: voiceNote || undefined,
    files: files || [],
    mentions: mentions || [],
  });

  // Files on a move also hang on the task, so its file list is one array.
  if (files?.length) {
    task.attachments.push(...files.map((f) => ({ ...f, uploadedBy: who.user._id, uploadedByName: who.user.name, update: update._id })));
    await task.save();
  }

  later(notify.statusMoved(task, update, who.user));
  return { task, update, coerced: wanted !== to, requested: wanted };
}

/** Take the job on: accepting also starts it (it leaves To do). */
async function accept({ taskId, who, note = '' }) {
  const task = await load(who, taskId);
  const mine = task.assigneeFor(who.id);
  if (!mine) throw fail('That task is not yours to accept.', 403);
  if (isTerminal(task.status)) throw fail('That task is closed.');
  if (mine.acceptance === ACCEPTANCE.ACCEPTED) return { task, update: null, unchanged: true };

  const now = new Date();
  mine.acceptance = ACCEPTANCE.ACCEPTED;
  mine.acceptedAt = now;
  mine.declinedAt = undefined;
  mine.declineReason = undefined;
  if (mine.status === STATUS.PENDING) {
    mine.status = STATUS.IN_PROGRESS;
    if (!mine.startedAt) mine.startedAt = now;
  }
  task.updateCount = (task.updateCount || 0) + 1;
  await task.save();
  await afterChildChange(task);

  const update = await feed(task, who, { kind: 'ACCEPTED', note: String(note || '').trim() || 'Accepted this, and started on it.' });
  later(notify.accepted(task, update, who.user));
  return { task, update };
}

/** Refuse it, with a reason. Doesn't cancel anything: the setter reassigns or calls it off. */
async function decline({ taskId, who, reason = '' }) {
  const task = await load(who, taskId);
  const mine = task.assigneeFor(who.id);
  if (!mine) throw fail('That task is not yours to decline.', 403);
  if (mine.status === STATUS.COMPLETED) throw fail('You have already finished this one, so it cannot be declined now.');
  if (isTerminal(task.status)) throw fail('That task is closed.');
  const why = String(reason || '').trim();
  if (!why) throw fail('Say why you cannot take this on, so it can be given to somebody else.');

  mine.acceptance = ACCEPTANCE.REJECTED;
  mine.declinedAt = new Date();
  mine.declineReason = why.slice(0, 500);
  mine.status = STATUS.PENDING;
  mine.startedAt = undefined;
  task.updateCount = (task.updateCount || 0) + 1;
  await task.save();
  await afterChildChange(task);

  const update = await feed(task, who, { kind: 'REJECTED', note: why });
  later(notify.declined(task, update, who.user));
  return { task, update };
}

/**
 * Pass your own part on. The delegator keeps following it and becomes its
 * approver; the new person starts fresh (pending, awaiting acceptance).
 */
async function delegate({ taskId, who, to, note = '' }) {
  const task = await load(who, taskId);
  const mine = task.assigneeFor(who.id);
  if (!mine) throw fail('That task is not yours to pass on.', 403);
  if (mine.status === STATUS.COMPLETED) throw fail('You have already finished this one.');
  if (isTerminal(task.status)) throw fail('That task is closed.');

  const targetId = String(to || '');
  if (!mongoose.isValidObjectId(targetId)) throw fail('Choose who to pass it to.');
  if (targetId === who.id) throw fail('That is already you.');
  if (task.isDoer(targetId)) throw fail('They are already on this task.');
  await people.assertAssignable(who.user, [targetId]);
  const [fresh] = await people.buildAssignees([targetId]);
  if (!fresh) throw fail('That person is no longer here.');

  const said = String(note || '').trim();
  Object.assign(fresh, { acceptance: ACCEPTANCE.AWAITING, delegatedFrom: who.user._id, delegatedFromName: who.user.name });
  task.assignees = (task.assignees || []).filter((a) => idOf(a.user) !== who.id).concat([fresh]);
  task.delegations.push({ from: who.user._id, fromName: who.user.name, to: targetId, toName: fresh.name, note: said.slice(0, 1000), at: new Date() });
  const following = new Set((task.originalAssignees || []).map(String));
  following.add(who.id);
  task.originalAssignees = [...following];
  task.approver = who.user._id;
  task.approverName = who.user.name;
  task.updateCount = (task.updateCount || 0) + 1;
  await task.save();
  await afterChildChange(task);

  const update = await feed(task, who, { kind: 'DELEGATED', note: said ? `Passed to ${fresh.name}: ${said}` : `Passed to ${fresh.name}.` });
  later(notify.delegated(task, update, who.user, fresh));
  return { task, update, delegatedTo: fresh };
}

/**
 * Hand it to the person it should have gone to. Whoever had it drops out
 * completely (assignees, original assignees, the loop) and the new person
 * starts from the top.
 */
async function transferTask({ taskId, who, to, reason = '' }) {
  const task = await load(who, taskId);
  if (!access.canTransfer(who, task)) throw fail('Only the person who set this, or the person it is on, can transfer it.', 403);
  if (isTerminal(task.status)) throw fail(`This task is ${statusLabel(task.status).toLowerCase()}. Reopen it first.`);
  if (task.routine && access.actorRoleOn(who, task) === 'doer') throw fail('A routine task cannot be transferred by the person doing it.', 403);

  const targetId = String(to || '');
  if (!mongoose.isValidObjectId(targetId)) throw fail('Choose who to transfer it to.');
  if (task.isDoer(targetId) && (task.assignees || []).length === 1) throw fail('It is already theirs.');
  const said = String(reason || '').trim();
  if (!said) throw fail('Say why it is moving. The person picking it up has nothing else to go on.');
  await people.assertAssignable(who.user, [targetId]);
  const [row] = await people.buildAssignees([targetId]);
  if (!row) throw fail('That person is no longer here.');

  const now = new Date();
  const leaving = (task.assignees || []).map((a) => ({ id: idOf(a.user), name: a.name || '' }));
  task.transfers.push({
    from: leaving[0]?.id || undefined,
    fromName: leaving[0]?.name || '',
    to: targetId,
    toName: row.name,
    by: who.user._id,
    byName: who.user.name,
    reason: said.slice(0, 1000),
    at: now,
  });
  task.assignees = [{ ...row, acceptance: ACCEPTANCE.AWAITING }];
  task.assignedAt = now;
  task.originalAssignees = [targetId];
  const goneIds = new Set(leaving.map((l) => l.id));
  task.loopUsers = (task.loopUsers || []).filter((u) => !goneIds.has(idOf(u)));
  task.startedAt = undefined;
  task.submittedAt = undefined;
  task.completedAt = undefined;
  task.completedLate = false;
  task.progress = 0;
  task.firedReminders = [];
  task.stateNote = said.slice(0, 1000);
  task.updateCount = (task.updateCount || 0) + 1;
  await task.save();
  await afterChildChange(task);

  const fromNames = leaving.map((l) => l.name).filter(Boolean).join(', ');
  const update = await feed(task, who, {
    kind: 'TRANSFERRED',
    note: leaving.length ? `Transferred from ${fromNames || 'nobody'} to ${row.name}: ${said}` : `Transferred to ${row.name}: ${said}`,
  });
  later(notify.transferred(task, update, who.user, leaving));
  return { task, update, transferredTo: task.assignees[0] };
}

// ---------------------------------------------------------------- pieces

/**
 * Re-derive a parent's counters and progress from its pieces (each piece
 * weighs the same, and the parent's own people count as one more part).
 */
async function recomputeParent(parentId, hops = 0) {
  if (!parentId || hops >= MAX_SPLIT_DEPTH) return null;
  const parent = await Task.findById(idOf(parentId));
  if (!parent) return null;

  const children = await Task.find({ parentTask: parent._id, archived: { $ne: true } }).select('status progress').lean();
  const live = children.filter((c) => c.status !== STATUS.CANCELLED);
  parent.childCount = children.length;
  parent.childDoneCount = children.filter((c) => c.status === STATUS.COMPLETED).length;

  if (live.length) {
    const pctOf = (x) => (x.status === STATUS.COMPLETED || x.status === STATUS.SUBMITTED ? 100 : Math.min(100, Math.max(0, Number(x.progress) || 0)));
    const rows = (parent.assignees || []).filter((a) => a.status !== STATUS.CANCELLED && a.acceptance !== ACCEPTANCE.REJECTED);
    let num = live.reduce((s, c) => s + pctOf(c), 0);
    let den = live.length;
    if (rows.length) {
      num += rows.reduce((s, a) => s + pctOf(a), 0) / rows.length;
      den += 1;
    }
    parent.progress = Math.round(num / den);
  }
  await parent.save();
  if (parent.parentTask) await recomputeParent(parent.parentTask, hops + 1);
  return parent;
}

/** Who a piece nobody is named for is offered to: the parent's team, or the splitter's team-mates. */
async function defaultOpenTo(who, parent) {
  const ids = new Set();
  if (parent.team) (await people.platform.teamMemberIds(parent.team)).forEach((id) => ids.add(String(id)));
  else (await people.platform.teamMates(who.user._id)).forEach((_, id) => ids.add(id));
  ids.delete(who.id);
  const off = await people.disabledSet([...ids]);
  return [...ids].filter((id) => !off.has(id));
}

/**
 * Split a task into pieces, each a task of its own. Anybody on the task may
 * split it. A piece with no assignee is offered to `openTo`.
 * @param {Array} items [{ title, description?, assignee?, openTo?, dueDate?, priority? }]
 */
async function splitTask({ taskId, who, items = [] }) {
  const parent = await load(who, taskId);
  if (!access.actorRoleOn(who, parent)) throw fail('That task is not yours to split.', 403);
  if (parent.routine) throw fail('A routine task cannot be split.');
  if (isTerminal(parent.status)) throw fail(`This task is ${statusLabel(parent.status).toLowerCase()}. Reopen it first.`);
  if ((Number(parent.depth) || 0) >= MAX_SPLIT_DEPTH - 1) throw fail('This is already a piece of a piece. Set it up as its own task instead.');

  const clean = (items || [])
    .map((it) => {
      const due = it?.dueDate ? new Date(it.dueDate) : null;
      return {
        title: String(it?.title || '').trim().slice(0, 300),
        description: String(it?.description || '').trim().slice(0, 5000) || undefined,
        assignee: mongoose.isValidObjectId(it?.assignee) ? String(it.assignee) : null,
        openTo: (Array.isArray(it?.openTo) ? it.openTo : []).filter((u) => mongoose.isValidObjectId(u)).map(String),
        dueDate: due && !Number.isNaN(due.getTime()) ? due : null,
        priority: normalisePriority(it?.priority) || null,
      };
    })
    .filter((it) => it.title);
  if (!clean.length) throw fail('Give each piece a name.');

  const existing = await Task.countDocuments({ parentTask: parent._id, archived: { $ne: true } });
  if (existing + clean.length > MAX_SUBTASKS) throw fail(`A task can hold ${MAX_SUBTASKS} pieces. Split it into two tasks instead.`);

  const named = [...new Set(clean.map((c) => c.assignee).filter(Boolean))];
  await people.assertAssignable(who.user, [...named, ...clean.flatMap((c) => c.openTo)]);
  const rows = new Map((await people.buildAssignees(named)).map((r) => [String(r.user), r]));
  const fallback = clean.some((c) => !c.assignee && !c.openTo.length) ? await defaultOpenTo(who, parent) : [];

  const created = [];
  for (const it of clean) {
    const row = it.assignee ? rows.get(it.assignee) : null;
    const child = await Task.create({
      title: it.title,
      description: it.description,
      category: parent.category,
      team: parent.team || null,
      createdBy: who.user._id,
      createdByName: who.user.name,
      parentTask: parent._id,
      parentCode: parent.code,
      parentTitle: parent.title,
      depth: (Number(parent.depth) || 0) + 1,
      assignees: row ? [row] : [],
      openTo: row ? [] : it.openTo.length ? it.openTo : fallback,
      loopUsers: [who.user._id],
      priority: it.priority || parent.priority || DEFAULT_PRIORITY,
      dueDate: it.dueDate || parent.dueDate,
      requiresApproval: parent.requiresApproval !== false,
      reminders: (parent.reminders || []).filter((r) => r.when !== 'EVERY').map((r) => ({ channel: r.channel, amount: r.amount, unit: r.unit, when: r.when })),
    });
    await TaskUpdate.create({ task: child._id, kind: 'CREATED', by: who.user._id, byName: who.user.name, to: child.status, note: `A piece of ${parent.code}.` });
    created.push(child);
  }

  await recomputeParent(parent._id);
  const fresh = await Task.findById(parent._id);
  const update = await feed(fresh, who, {
    kind: 'SPLIT',
    note: created.length === 1 ? `Split off a piece: ${created[0].title}` : `Split into ${created.length} pieces.`,
  });
  later(notify.taskSplit(fresh, update, who.user, created));
  return { parent: fresh, children: created, update };
}

/** Take an open piece: a conditional claim, so two people can't both get it. */
async function claimTask({ taskId, who }) {
  const task = await load(who, taskId);
  if (!task.parentTask) throw fail('Only a piece of a task can be picked up.');
  if (isTerminal(task.status)) throw fail('That piece is closed.');
  if ((task.assignees || []).length) throw fail(`${task.assignees[0].name || 'Somebody'} has already picked that up.`, 409);
  const offered = (task.openTo || []).some((u) => idOf(u) === who.id);
  if (!offered && !access.isOverseer(who, task)) throw fail('That piece was not offered to you.', 403);

  const now = new Date();
  const row = {
    user: who.user._id,
    name: who.user.name,
    status: STATUS.PENDING,
    acceptance: ACCEPTANCE.ACCEPTED,
    acceptedAt: now,
  };
  const claimed = await Task.updateOne(
    { _id: task._id, assignees: { $size: 0 } },
    { $set: { assignees: [row], assignedTo: who.user._id, openTo: [], originalAssignees: [who.user._id] } }
  );
  if (!claimed.matchedCount) throw fail('Somebody else picked that up a moment ago.', 409);

  const fresh = await Task.findById(task._id);
  await fresh.save();
  await afterChildChange(fresh);
  const update = await feed(fresh, who, { kind: 'CLAIMED', note: `${who.user.name} picked this up.` });
  later(notify.pieceClaimed(fresh, update, who.user));
  return { task: fresh, update };
}

// ---------------------------------------------------------------- progress & more time

/** "How far along are you?" Moving off zero starts the task. */
async function setProgress({ taskId, who, progress, note = '' }) {
  const task = await load(who, taskId);
  const mine = task.assigneeFor(who.id);
  if (!mine) throw fail('Only the person doing this can say how far along it is.', 403);
  if (isTerminal(task.status)) throw fail('That task is closed.');
  if (mine.status === STATUS.COMPLETED) throw fail('Your part of this is already finished.');

  const pct = clampProgress(progress);
  const was = Number(mine.progress) || 0;
  if (pct === was) return { task, update: null, unchanged: true, progress: pct };

  const now = new Date();
  mine.progress = pct;
  mine.progressAt = now;
  if (pct > 0 && mine.status === STATUS.PENDING) {
    mine.status = STATUS.IN_PROGRESS;
    if (!mine.startedAt) mine.startedAt = now;
    if (mine.acceptance === ACCEPTANCE.AWAITING) {
      mine.acceptance = ACCEPTANCE.ACCEPTED;
      mine.acceptedAt = now;
    }
  }
  task.updateCount = (task.updateCount || 0) + 1;
  await task.save();
  await afterChildChange(task);

  const said = String(note || '').trim();
  const update = await feed(task, who, { kind: 'PROGRESS', note: said || `Progress: ${was}% → ${pct}%` });
  later(notify.progressSet(task, update, who.user, pct));
  return { task, update, progress: pct };
}

/** Ask for more time. One open ask per person; the work carries on meanwhile. */
async function requestExtension({ taskId, who, toDate, reason = '' }) {
  const task = await load(who, taskId);
  const mine = task.assigneeFor(who.id);
  if (!mine) throw fail('Only the person doing this can ask for more time.', 403);
  if (isTerminal(task.status)) throw fail('That task is closed.');
  if (task.routine) throw fail('A routine task cannot be given more time.');
  const said = String(reason || '').trim();
  if (!said) throw fail('Say why you need longer. The person deciding has nothing else to go on.');
  const when = toDate ? new Date(toDate) : null;
  if (!when || Number.isNaN(when.getTime())) throw fail('Pick the new date you need.');
  if (task.dueDate && when <= new Date(task.dueDate)) throw fail('That date is not later than the current deadline.');
  if (task.pendingExtensionBy(who.id)) throw fail('You have already asked for more time on this. Wait for an answer first.');

  task.extensions.push({
    requestedBy: who.user._id,
    requestedByName: who.user.name,
    requestedAt: new Date(),
    fromDate: task.dueDate,
    toDate: when,
    reason: said.slice(0, 1000),
    status: EXTENSION_STATUS.PENDING,
  });
  task.updateCount = (task.updateCount || 0) + 1;
  await task.save();

  const asked = task.extensions[task.extensions.length - 1];
  const update = await feed(task, who, { kind: 'EXTENSION_ASKED', note: said });
  later(notify.extensionAsked(task, update, who.user, asked));
  return { task, update, extension: asked };
}

/** Yes or no to more time (an assigner's). Yes moves the deadline and re-arms the reminders. */
async function decideExtension({ taskId, requestId, who, approve, note = '' }) {
  const task = await load(who, taskId);
  if (access.actorRoleOn(who, task) !== 'assigner') throw fail('Only the person who set this task can give more time.', 403);
  const req = mongoose.isValidObjectId(requestId) ? task.extensions.id(requestId) : null;
  if (!req) throw fail('That request is no longer there.', 404);
  if (req.status !== EXTENSION_STATUS.PENDING) return { task, update: null, unchanged: true, extension: req };

  const now = new Date();
  req.status = approve ? EXTENSION_STATUS.APPROVED : EXTENSION_STATUS.DECLINED;
  req.decidedBy = who.user._id;
  req.decidedByName = who.user.name;
  req.decidedAt = now;
  req.decisionNote = String(note || '').trim().slice(0, 1000);
  if (approve) {
    task.dueDate = req.toDate;
    task.extensionCount = (task.extensionCount || 0) + 1;
    task.firedReminders = [];
    task.overdueNotifiedAt = undefined;
  }
  task.updateCount = (task.updateCount || 0) + 1;
  await task.save();

  const update = await feed(task, who, { kind: 'EXTENSION_DECIDED', note: req.decisionNote || (approve ? 'More time granted.' : 'More time refused.') });
  later(notify.extensionDecided(task, update, who.user, req));
  return { task, update, extension: req };
}

// ---------------------------------------------------------------- remarks

/** Team owners/admins of the task's team (they can see it, so they can be mentioned). */
async function teamAdmins(task) {
  if (!task.team) return [];
  const team = await Team.findById(idOf(task.team)).select('members').lean();
  return (team?.members || []).filter((m) => m.status === 'active' && ['owner', 'admin'].includes(m.role)).map((m) => String(m.user));
}

/** A remark without moving anything; @-mentions reach only people who can see the task. */
async function comment({ taskId, who, note = '', voiceNote = null, files = [], mentions = [] }) {
  const task = await load(who, taskId);
  const said = String(note || '').trim();
  if (!said && !voiceNote && !files?.length) throw fail('Write something, record something, or attach a file.');

  const canHear = new Set([...task.audience(), ...(task.openTo || []).map(idOf), ...(await teamAdmins(task))]);
  const named = people.validIds(mentions).filter((id) => canHear.has(id));
  const update = await feed(task, who, { kind: 'COMMENT', note: said, voiceNote: voiceNote || undefined, files: files || [], mentions: named });
  if (files?.length) {
    task.attachments.push(...files.map((f) => ({ ...f, uploadedBy: who.user._id, uploadedByName: who.user.name, update: update._id })));
  }
  task.updateCount = (task.updateCount || 0) + 1;
  await task.save();
  later(notify.commented(task, update, who.user, named));
  return { task, update };
}

/** Something the system did (a reminder, an occurrence). Never notified on. */
async function systemUpdate(taskId, note, kind = 'REMINDER') {
  try {
    return await TaskUpdate.create({ task: taskId, kind, byName: 'System', note: String(note || '').slice(0, 5000), system: true });
  } catch (err) {
    console.warn('[tasks] system update failed:', err.message);
    return null;
  }
}

module.exports = {
  move,
  accept,
  decline,
  delegate,
  transferTask,
  splitTask,
  claimTask,
  recomputeParent,
  setProgress,
  requestExtension,
  decideExtension,
  comment,
  systemUpdate,
  fail,
};
