/**
 * What people do to a task: status moves (and their worded twins submit /
 * approve / reject), the doer's answers (accept, decline, delegate, more
 * time, progress), splitting and claiming, transferring, the bell, and
 * remarks. Every response carries the task and its `can` object.
 */
const express = require('express');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const { badRequest, forbidden } = require('../../platform/errors');
const { attachFiles, deleteFiles } = require('../../platform/services/files');
const access = require('../services/access');
const engine = require('../services/engine');
const notify = require('../services/notify');
const people = require('../services/people');
const { updateOut, PERSON_FIELDS } = require('../services/present');
const { taskUpload, parseBody, isOn, storeFiles, storeVoiceNote } = require('../services/inputs');
const { zoneOf, clockText } = require('../services/time');
const { STATUS, TASK_STATUS, NUDGE_COOLDOWN_MIN, nudgeReadyAt, clampProgress, normaliseStatus } = require('../config');
const { taskBody, listRow } = require('./helpers');
const { populateRows } = require('../services/query');

const router = express.Router();

/**
 * Store a request's files and voice note (unattached), run `fn` with them,
 * then attach them to the task, or remove them if `fn` failed.
 */
async function withUploads(req, taskId, fn) {
  const body = parseBody(req);
  const files = await storeFiles(req.files, null, req.user);
  const voiceNote = await storeVoiceNote(req.files, null, req.user, body.voiceDurationMs);
  const ids = [...files.map((f) => f.file), ...(voiceNote ? [voiceNote.file] : [])];
  try {
    const result = await fn({ body, files, voiceNote });
    if (ids.length) await attachFiles({ userId: req.user._id, ids, ref: { kind: 'task', id: taskId } });
    return result;
  } catch (err) {
    await deleteFiles(ids);
    throw err;
  }
}

const mentionsOf = (body) => people.validIds(Array.isArray(body.mentions) ? body.mentions : String(body.mentions || '').split(','));

/** Make sure the task is there and visible before anything is uploaded. */
async function visible(req) {
  const who = await access.actor(req);
  const task = await access.loadVisible(who, req.params.id);
  return { who, task };
}

/** POST /:id/status — the one endpoint that moves anything: `{ to, note }` (+ voice/files). */
router.post('/:id/status', taskUpload, async (req, res) => {
  const { who, task } = await visible(req);
  const result = await withUploads(req, task._id, ({ body, files, voiceNote }) => {
    const to = normaliseStatus(body.to || body.status);
    if (!to || !TASK_STATUS.includes(to)) throw badRequest('That is not a status a task can be in.');
    return engine.move({ taskId: task._id, who, task, to, note: body.note, voiceNote, files, mentions: mentionsOf(body) });
  });
  res.json({ ...(await taskBody(who, task)), update: result.update ? updateOut(result.update) : null, unchanged: Boolean(result.unchanged), coerced: Boolean(result.coerced) });
});

/** POST /:id/submit — hand it in (lands in review). */
router.post('/:id/submit', taskUpload, async (req, res) => {
  const { who, task } = await visible(req);
  const result = await withUploads(req, task._id, ({ body, files, voiceNote }) =>
    engine.move({ taskId: task._id, who, task, to: STATUS.SUBMITTED, note: body.note || '', voiceNote, files, mentions: mentionsOf(body) }));
  res.json({ ...(await taskBody(who, task)), update: result.update ? updateOut(result.update) : null, unchanged: Boolean(result.unchanged), coerced: Boolean(result.coerced) });
});

/** POST /:id/approve — sign it off; /:id/reject — send it back (a note is required). */
const decide = (approve) => async (req, res) => {
  const { who, task } = await visible(req);
  const result = await withUploads(req, task._id, ({ body, files, voiceNote }) => {
    const note = String(body.note || '').trim();
    if (!approve && !note) throw badRequest('Say what needs doing before sending this back. That is the whole point of sending it back.');
    return engine.move({ taskId: task._id, who, task, to: approve ? STATUS.COMPLETED : STATUS.IN_PROGRESS, note, voiceNote, files });
  });
  res.json({ ...(await taskBody(who, task)), update: result.update ? updateOut(result.update) : null, unchanged: Boolean(result.unchanged) });
};
router.post('/:id/approve', taskUpload, decide(true));
router.post('/:id/reject', taskUpload, decide(false));

/** POST /:id/updates — a remark, with or without a recording and files. */
router.post('/:id/updates', taskUpload, async (req, res) => {
  const { who, task } = await visible(req);
  const { update } = await withUploads(req, task._id, ({ body, files, voiceNote }) =>
    engine.comment({ taskId: task._id, who, note: body.note, voiceNote, files, mentions: mentionsOf(body) }));
  const full = await TaskUpdate.findById(update._id).populate('by', PERSON_FIELDS).lean();
  res.status(201).json({ update: updateOut(full) });
});

/** POST /:id/accept — take it on (and start it). */
router.post('/:id/accept', async (req, res) => {
  const who = await access.actor(req);
  const { task, unchanged } = await engine.accept({ taskId: req.params.id, who, note: parseBody(req).note });
  res.json({ ...(await taskBody(who, task)), unchanged: Boolean(unchanged) });
});

/** POST /:id/decline — refuse it, with a reason. */
router.post('/:id/decline', async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  const { task } = await engine.decline({ taskId: req.params.id, who, reason: body.reason || body.note });
  res.json(await taskBody(who, task));
});

/** POST /:id/delegate — pass your own part to someone you may assign to. */
router.post('/:id/delegate', async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  const { task, delegatedTo } = await engine.delegate({ taskId: req.params.id, who, to: body.to, note: body.note });
  res.json({ ...(await taskBody(who, task)), delegatedTo: { user: String(delegatedTo.user), name: delegatedTo.name } });
});

/**
 * POST /:id/nudge — the bell. Once per direction per 30 minutes: a second
 * press inside that is a 429 carrying `nextAt`.
 */
router.post('/:id/nudge', async (req, res) => {
  const { who, task } = await visible(req);
  const target = access.nudgeTargets(who, task);
  if (!target) {
    throw forbidden(task.status === STATUS.SUBMITTED
      ? 'Only somebody who handed this in can remind the reviewer.'
      : 'There is nobody on this task for you to remind right now.');
  }
  const now = new Date();
  const cutoff = new Date(now.getTime() - NUDGE_COOLDOWN_MIN * 60 * 1000);
  const note = String(parseBody(req).note || '').trim().slice(0, 300);
  const names = await people.namesOf(target.to);
  const toNames = target.to.map((id) => names.get(id)).filter(Boolean).join(', ');
  const gate = `nudgeAt.${target.kind}`;

  const won = await Task.updateOne(
    { _id: task._id, $or: [{ [gate]: null }, { [gate]: { $lte: cutoff } }] },
    {
      $set: { lastNudgeAt: now, [gate]: now },
      $inc: { nudgeCount: 1 },
      $push: { nudges: { $each: [{ by: req.user._id, byName: req.user.name, kind: target.kind, to: target.to, toNames, note, at: now }], $slice: -50 } },
    }
  );
  if (!won.modifiedCount) {
    const fresh = await Task.findById(task._id).select('nudgeAt lastNudgeAt').lean();
    const last = fresh?.nudgeAt?.[target.kind] || now;
    const nextAt = nudgeReadyAt(fresh, now, target.kind) || new Date(now.getTime() + NUDGE_COOLDOWN_MIN * 60 * 1000);
    const message = `A reminder went out ${Math.max(1, Math.round((now - new Date(last)) / 60000))} min ago. ` +
      `You can send another after ${clockText(nextAt, zoneOf(req))}.`;
    return res.status(429).json({ error: message, code: 'NUDGE_COOLDOWN', message, nextAt });
  }

  await TaskUpdate.create({
    task: task._id,
    kind: 'NUDGED',
    by: req.user._id,
    byName: req.user.name,
    note: note || (target.kind === 'REVIEW' ? `Reminded ${toNames || 'the reviewer'} to review it.` : `Sent ${toNames || 'them'} a reminder.`),
  });
  notify.nudged(task, req.user, { to: target.to, kind: target.kind, note }).catch((e) => console.warn('[tasks] nudge notify:', e.message));
  res.json({
    ok: true,
    sentTo: toNames,
    kind: target.kind,
    nextAt: new Date(now.getTime() + NUDGE_COOLDOWN_MIN * 60 * 1000),
    message: `Reminder sent to ${toNames || (target.kind === 'REVIEW' ? 'the reviewer' : 'them')}.`,
  });
});

/** PATCH /:id/progress — "I am this far along" (0-100). */
router.patch('/:id/progress', async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  if (body.progress === undefined || body.progress === null || body.progress === '') throw badRequest('Say how far along you are.');
  const { task, update, unchanged, progress } = await engine.setProgress({ taskId: req.params.id, who, progress: body.progress, note: body.note || '' });
  res.json({ ...(await taskBody(who, task)), update: update ? updateOut(update) : null, progress: progress ?? clampProgress(body.progress), unchanged: Boolean(unchanged) });
});

/** POST /:id/extension — ask for more time: `{ toDate, reason }`. */
router.post('/:id/extension', async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  const { task, extension } = await engine.requestExtension({ taskId: req.params.id, who, toDate: body.toDate || body.dueDate, reason: body.reason || body.note || '' });
  res.status(201).json({ ...(await taskBody(who, task)), extension });
});

/** POST /:id/extension/:reqId — answer it: `{ approve, note }`. */
router.post('/:id/extension/:reqId', async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  const { task, extension, unchanged } = await engine.decideExtension({
    taskId: req.params.id, requestId: req.params.reqId, who, approve: isOn(body.approve), note: body.note || '',
  });
  res.json({ ...(await taskBody(who, task)), extension, unchanged: Boolean(unchanged) });
});

/** POST /:id/split — `{ items: [{ title, description?, assignee?, openTo?, dueDate?, priority? }] }`. */
router.post('/:id/split', async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  const items = Array.isArray(body.items) ? body.items : [body];
  const { parent, children } = await engine.splitTask({ taskId: req.params.id, who, items });
  const fresh = await populateRows(Task.find({ _id: { $in: children.map((c) => c._id) } }).sort({ createdAt: 1 })).lean();
  res.status(201).json({
    ...(await taskBody(who, parent)),
    children: fresh.map((c, i) => listRow(who, c, i + 1)),
  });
});

/** POST /:id/claim — take an open piece. */
router.post('/:id/claim', async (req, res) => {
  const who = await access.actor(req);
  const { task } = await engine.claimTask({ taskId: req.params.id, who });
  res.json(await taskBody(who, task));
});

/** POST /:id/transfer — it went to the wrong person: `{ to, reason }`. */
router.post('/:id/transfer', async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  const { task, transferredTo } = await engine.transferTask({ taskId: req.params.id, who, to: body.to || body.assignee, reason: body.reason || body.note || '' });
  res.json({ ...(await taskBody(who, task)), transferredTo });
});

module.exports = router;
