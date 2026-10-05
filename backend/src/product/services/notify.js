/**
 * Every task alert, in one file: who hears about which event, and in what
 * words. The actor is never told about their own doing, and whoever first had
 * a task keeps hearing about it after delegating it on. Every alert links to
 * `/tasks/<id>`. Fire-and-forget: a failed alert never fails the action.
 */
const { notify } = require('../../platform/services/notify');
const { statusLabel, STATUS, idOf } = require('../config');
const { fmtDateTime, settingsOf } = require('./time');

const link = (task) => `/tasks/${idOf(task._id)}`;
const nameOf = (u) => u?.name || 'Somebody';
const tzOf = (u) => settingsOf(u).timezone;

/** "TSK-2026-00042 — Sales report". */
const taskName = (task) => (task.code ? `${task.code} — ${task.title}` : `"${task.title}"`);

/** "· Urgent · due 12 Mar, 6:00 PM" */
function meta(task, tz) {
  const bits = [];
  if (task.priority && task.priority !== 'Medium') bits.push(task.priority);
  if (task.dueDate) bits.push(`due ${fmtDateTime(task.dueDate, tz)}`);
  return bits.length ? ` · ${bits.join(' · ')}` : '';
}

/** Ids as strings, deduped, without the actor. */
function recipients(list, actorId) {
  const skip = actorId ? String(actorId) : '';
  return [...new Set((list || []).filter(Boolean).map(idOf))].filter((id) => id && id !== skip);
}

const ids = (list) => (list || []).map((x) => idOf(x?.user ?? x));
const followers = (task) => (task?.originalAssignees || []).map(idOf);

function everyone(task) {
  if (typeof task.audience === 'function') return task.audience();
  return recipients([task.createdBy, task.approver, ...ids(task.assignees), ...(task.loopUsers || []), ...followers(task)]);
}

const send = (to, title, body, task) => (to.length ? notify(to, { title, body, link: link(task), kind: 'task' }) : null);

/** A new task: the doers are told, and the loop that they are watching. */
async function assigned(task, actor) {
  const tz = tzOf(actor);
  const doers = recipients(ids(task.assignees), actor?._id);
  const sentBy = task.onBehalf?.byName ? ` · sent by ${task.onBehalf.byName}` : '';
  await send(doers, `New task from ${nameOf(actor)}`, `${taskName(task)}${meta(task, tz)}${sentBy}`, task);
  const watchers = recipients(task.loopUsers, actor?._id).filter((id) => !doers.includes(id));
  const who = (task.assignees || []).map((a) => a.name).filter(Boolean).join(', ');
  await send(watchers, 'You are in the loop on a task', `${taskName(task)}${who ? ` · ${who}` : ''}${meta(task, tz)}`, task);
}

/** The Super Admin set a task in someone's name: they are told. */
async function setOnYourBehalf(task, sender) {
  const to = recipients([task.createdBy], sender?._id);
  const who = (task.assignees || []).map((a) => a.name).filter(Boolean).join(', ');
  await send(to, `${nameOf(sender)} set a task on your behalf`, `${taskName(task)}${who ? ` · for ${who}` : ''}${meta(task, tzOf(sender))}`, task);
}

/** Somebody moved it. Submissions, approvals and send-backs are routed at one side. */
async function statusMoved(task, update, actor) {
  const word = statusLabel(update.to).toLowerCase();
  const line = update.note ? `${nameOf(actor)}: ${String(update.note).slice(0, 140)}` : `${nameOf(actor)} marked it ${word}.`;

  if (update.kind === 'SUBMITTED') {
    const to = recipients([task.approver || task.createdBy], actor?._id);
    await send(to, `${nameOf(actor)} handed in ${taskName(task)}`, String(update.note || 'Waiting on your approval.').slice(0, 160), task);
    const watchers = recipients([...(task.loopUsers || []), ...followers(task)], actor?._id).filter((id) => !to.includes(id));
    await send(watchers, `${taskName(task)} is in review`, line, task);
    return;
  }

  if (update.kind === 'APPROVED' || update.kind === 'SENT_BACK') {
    const yes = update.kind === 'APPROVED';
    const doers = recipients(ids(task.assignees), actor?._id);
    await send(
      doers,
      yes ? `${nameOf(actor)} approved ${taskName(task)}` : `${nameOf(actor)} sent ${taskName(task)} back`,
      String(update.note || (yes ? 'Signed off.' : 'It needs another look.')).slice(0, 160),
      task
    );
    const watchers = recipients([...(task.loopUsers || []), ...followers(task)], actor?._id).filter((id) => !doers.includes(id));
    await send(watchers, `${taskName(task)} is ${word}`, line, task);
    return;
  }

  const overseers = recipients([task.createdBy, ...(task.loopUsers || []), ...followers(task)], actor?._id);
  await send(overseers, `${taskName(task)} is ${word}`, line, task);
  const others = recipients(ids(task.assignees), actor?._id).filter((id) => !overseers.includes(id));
  await send(others, `${taskName(task)} is ${word}`, line, task);

  if (update.to === STATUS.CANCELLED) {
    const doers = recipients(ids(task.assignees), actor?._id);
    await send(doers, `${nameOf(actor)} called off a task`, `${taskName(task)}${update.note ? ` — ${String(update.note).slice(0, 140)}` : ''}`, task);
  }
}

/** A remark: everyone on the task, plus anyone @-mentioned who can see it. */
async function commented(task, update, actor, mentionable = []) {
  const body = update.note ? String(update.note).slice(0, 160) : update.voiceNote ? 'Sent a voice note.' : 'Attached a file.';
  const all = recipients(everyone(task), actor?._id);
  await send(all, `${nameOf(actor)} on ${taskName(task)}`, body, task);
  const named = recipients(mentionable, actor?._id).filter((id) => !all.includes(id));
  await send(named, `${nameOf(actor)} mentioned you`, `${taskName(task)} — ${body}`, task);
}

/** Taken on: the setter and followers hear, quietly. */
async function accepted(task, update, actor) {
  const to = recipients([task.createdBy, ...followers(task)], actor?._id);
  const body = update.note && !/^Accepted this/.test(update.note)
    ? update.note
    : `Due ${task.dueDate ? fmtDateTime(task.dueDate, tzOf(actor)) : 'whenever'}.`;
  await send(to, `${nameOf(actor)} accepted ${taskName(task)}`, body, task);
}

/** Refused: the loud one, with the reason in the body. */
async function declined(task, update, actor) {
  const to = recipients([task.createdBy, ...(task.loopUsers || []), ...followers(task)], actor?._id);
  await send(to, `${nameOf(actor)} cannot take on ${taskName(task)}`, String(update.note || '').slice(0, 200), task);
}

/** Passed on: the new person, and everyone watching. */
async function delegated(task, update, actor, newAssignee) {
  const tz = tzOf(actor);
  const target = idOf(newAssignee?.user);
  if (target) await send([target], `${nameOf(actor)} passed you a task`, `${taskName(task)}${meta(task, tz)}`, task);
  const watching = recipients([task.createdBy, ...(task.loopUsers || []), ...followers(task)], actor?._id).filter((id) => id !== target);
  await send(watching, `${taskName(task)} passed to ${newAssignee?.name || 'somebody else'}`, String(update.note || `${nameOf(actor)} passed it on.`).slice(0, 200), task);
}

/** Split: each named owner hears about their piece; an open piece is offered; the rest hear once. */
async function taskSplit(task, update, actor, children = []) {
  const tz = tzOf(actor);
  for (const child of children.filter((c) => (c.assignees || []).length)) {
    const to = recipients(ids(child.assignees), actor?._id);
    await send(to, `New task from ${nameOf(actor)}`, `${child.title} — part of ${taskName(task)}${meta(child, tz)}`, child);
  }
  for (const child of children.filter((c) => !(c.assignees || []).length)) {
    const to = recipients(child.openTo, actor?._id);
    await send(to, 'A piece of work is up for grabs', `${child.title} — part of ${taskName(task)}. First to pick it up gets it.`, child);
  }
  const owners = new Set(children.flatMap((c) => [...ids(c.assignees), ...(c.openTo || []).map(idOf)]));
  const rest = recipients(everyone(task), actor?._id).filter((id) => !owners.has(id));
  await send(
    rest,
    `${taskName(task)} was split into ${children.length} piece${children.length === 1 ? '' : 's'}`,
    children.map((c) => c.title).slice(0, 3).join('; ').slice(0, 200),
    task
  );
}

/** Transferred: the new owner, the people taken off it (one last time), and the setter side. */
async function transferred(task, update, actor, leaving = []) {
  const to = recipients(ids(task.assignees), actor?._id);
  await send(to, `${taskName(task)} is now yours`, `${nameOf(actor)} transferred it to you.${meta(task, tzOf(actor))}`, task);
  const off = recipients(leaving.map((l) => l.id), actor?._id).filter((id) => !to.includes(id));
  await send(
    off,
    `${taskName(task)} is no longer yours`,
    `${nameOf(actor)} transferred it to ${task.assignees?.[0]?.name || 'somebody else'}. You will not hear about it again.`,
    task
  );
  const watchers = recipients([task.createdBy, task.approver, ...(task.loopUsers || [])], actor?._id)
    .filter((id) => !to.includes(id) && !off.includes(id));
  await send(watchers, `${taskName(task)} was transferred`, String(update.note || '').slice(0, 200), task);
}

async function pieceClaimed(task, update, actor) {
  const to = recipients([task.createdBy, ...(task.loopUsers || [])], actor?._id);
  await send(to, `${nameOf(actor)} picked up ${taskName(task)}`, task.parentTitle ? `Part of ${task.parentTitle}` : '', task);
}

/** Progress: the setter side only, and only "started", "finished" or early reports. */
async function progressSet(task, update, actor, pct) {
  if (pct > 0 && pct < 100 && (task.updateCount || 0) > 3) return;
  const to = recipients([task.createdBy, ...(task.loopUsers || [])], actor?._id);
  await send(to, `${taskName(task)} — ${pct}% done`, `${nameOf(actor)}: ${String(update.note || '').slice(0, 140)}`, task);
}

async function extensionAsked(task, update, actor, request) {
  const to = recipients([task.approver || task.createdBy, task.createdBy], actor?._id);
  await send(
    to,
    `${nameOf(actor)} needs longer on ${taskName(task)}`,
    `Asking for ${fmtDateTime(request.toDate, tzOf(actor))} — ${String(request.reason || '').slice(0, 140)}`,
    task
  );
}

async function extensionDecided(task, update, actor, request) {
  const to = recipients([request.requestedBy], actor?._id);
  const yes = request.status === 'APPROVED';
  const note = request.decisionNote ? ` ${String(request.decisionNote).slice(0, 120)}` : '';
  await send(
    to,
    yes ? `More time granted on ${taskName(task)}` : `No extra time on ${taskName(task)}`,
    yes ? `New deadline: ${fmtDateTime(request.toDate, tzOf(actor))}.${note}` : String(request.decisionNote || '').slice(0, 160) || 'The deadline stands.',
    task
  );
}

/** Edited before acceptance: the doers read what moved. */
async function edited(task, actor, what = '') {
  const doers = recipients(ids(task.assignees), actor?._id);
  await send(doers, `${nameOf(actor)} edited a task for you`, `${taskName(task)}${what ? ` — ${what}` : ''}`, task);
}

/** The bell: chasing the doers, or the reviewer. */
async function nudged(task, actor, { to = [], kind = 'DOER', note = '' } = {}) {
  const list = recipients(to, actor?._id);
  if (!list.length) return;
  const said = String(note || '').trim();
  const tz = tzOf(actor);
  if (kind === 'REVIEW') {
    await send(list, `${nameOf(actor)} is waiting on your review`, `${taskName(task)}${said ? ` — “${said.slice(0, 140)}”` : ' — please approve it or send it back.'}`, task);
    return;
  }
  let state = 'It is still in progress';
  if (task.dueDate && new Date(task.dueDate) < new Date()) state = 'It is overdue';
  else if (task.status === STATUS.PENDING) state = 'You have not accepted it yet';
  const where = task.dueDate ? ` · due ${fmtDateTime(task.dueDate, tz)}` : '';
  await send(list, `Reminder from ${nameOf(actor)}`, `${taskName(task)} — ${said ? `“${said.slice(0, 140)}”` : `${state}.`}${where}`, task);
}

/** The deadline just passed: told once to the doers and the setter side (from a job). */
async function becameOverdue(task, tz) {
  const doing = (task.assignees || [])
    .filter((a) => ![STATUS.COMPLETED, STATUS.CANCELLED, STATUS.SUBMITTED].includes(a.status) && a.acceptance !== 'REJECTED')
    .map((a) => idOf(a.user));
  const doers = recipients(doing);
  const due = fmtDateTime(task.dueDate, tz);
  await send(doers, `Overdue: ${taskName(task)}`, `It was due ${due} and is not done yet.`, task);
  const setters = recipients([task.createdBy, task.approver]).filter((id) => !doers.includes(id));
  const who = (task.assignees || []).filter((a) => doing.includes(idOf(a.user))).map((a) => a.name).filter(Boolean).join(', ');
  await send(setters, `Overdue: ${taskName(task)}`, who ? `${who} has not finished it — it was due ${due}.` : `It is not finished — it was due ${due}.`, task);
}

/** A scheduled reminder (from a job). */
async function reminder(task, to, { title, body }) {
  await send(recipients(to), title, body, task);
}

/** The daily summary: one alert, not one per task. */
async function digest(userId, { pending, overdue, inReview }) {
  const bits = [];
  if (overdue) bits.push(`${overdue} overdue`);
  if (pending) bits.push(`${pending} pending`);
  if (inReview) bits.push(`${inReview} waiting for your review`);
  if (!bits.length) return false;
  await notify([userId], { title: 'Your tasks today', body: `You have ${bits.join(', ')}.`, link: '/tasks', kind: 'task' });
  return true;
}

module.exports = {
  taskName,
  recipients,
  everyone,
  assigned,
  setOnYourBehalf,
  statusMoved,
  accepted,
  declined,
  delegated,
  transferred,
  taskSplit,
  pieceClaimed,
  progressSet,
  extensionAsked,
  extensionDecided,
  commented,
  edited,
  nudged,
  becameOverdue,
  reminder,
  digest,
};
