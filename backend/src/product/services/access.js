/**
 * Who may see a task, and what they may do to it.
 *
 * You see a task if you are on it, set it, sign it off, are in the loop, may
 * claim it (openTo), first had it, or own/admin the team it is filed under.
 * Pieces follow their parent. The Super Admin sees everything. Anyone else
 * gets a 404, never a 403, so a task's existence isn't leaked.
 *
 * "Assigner" rights belong to the setter, the approver, the owner/admins of
 * the task's team and the Super Admin. Being the doer wins: someone working a
 * task gets the doer's buttons.
 */
const mongoose = require('mongoose');
const Task = require('../models/Task');
const people = require('../../platform/services/people');
const { HttpError, forbidden, notFound } = require('../../platform/errors');
const {
  TRANSITIONS, ACCEPTANCE, STATUS, EXTENSION_STATUS, MAX_SPLIT_DEPTH, isTerminal, effectiveTarget,
  nudgeReadyAt, termsOpen, idOf,
} = require('../config');

const isSuperAdmin = (user) => user?.role === 'superadmin';
const same = (a, b) => a != null && b != null && idOf(a) === idOf(b);
const has = (list, id) => (list || []).some((x) => same(x, id));
const onIt = (task, id) => (task.assignees || []).some((a) => same(a.user, id));
const oid = (v) => new mongoose.Types.ObjectId(idOf(v));

/**
 * The caller as access checks need them: who they are, the organizations
 * (teams) they are an active member of (`memberTeams`: id → { name, role },
 * by name) and the ones they own or admin (`adminTeams`). One read, built
 * once per request (cached on `req`).
 */
async function actorFor(user) {
  const superAdmin = isSuperAdmin(user);
  const teams = superAdmin ? [] : await people.teamsOf(user._id);
  return {
    user,
    id: String(user._id),
    superAdmin,
    memberTeams: new Map(teams.map((t) => [t.id, { name: t.name, role: t.role }])),
    adminTeams: new Set(teams.filter((t) => t.role === 'owner' || t.role === 'admin').map((t) => t.id)),
  };
}

async function actor(req) {
  if (!req.taskActor) req.taskActor = await actorFor(req.user);
  return req.taskActor;
}

/** Super Admin, or owner/admin of the team the task is filed under. */
const isOverseer = (who, task) => who.superAdmin || (!!task?.team && who.adminTeams.has(idOf(task.team)));

function canSee(who, task) {
  if (!task) return false;
  if (who.superAdmin) return true;
  const id = who.id;
  return (
    same(task.createdBy, id) ||
    onIt(task, id) ||
    same(task.assignedTo, id) ||
    same(task.approver, id) ||
    has(task.loopUsers, id) ||
    has(task.openTo, id) ||
    has(task.originalAssignees, id) ||
    isOverseer(who, task)
  );
}

const VISIBILITY_FIELDS = 'createdBy approver assignees.user assignedTo loopUsers openTo originalAssignees team parentTask archived';

/** May they open a piece through the task it came from? */
async function canSeeThroughParent(who, task) {
  let parentId = task?.parentTask;
  for (let hop = 0; parentId && hop < MAX_SPLIT_DEPTH; hop += 1) {
    const parent = await Task.findById(idOf(parentId)).select(VISIBILITY_FIELDS).lean();
    if (!parent) return false;
    if (canSee(who, parent)) return true;
    parentId = parent.parentTask;
  }
  return false;
}

const gone = () => notFound('That task no longer exists.');

/** A live task the caller may see (or a 404). `query` lets callers populate/select. */
async function loadVisible(who, id, { query = (q) => q, throughParent = true } = {}) {
  const { idParam } = require('../../platform/validate');
  let taskId;
  try {
    taskId = idParam(id, 'task');
  } catch {
    throw gone();
  }
  const task = await query(Task.findById(taskId));
  if (!task || task.archived) throw gone();
  if (canSee(who, task)) return task;
  if (throughParent && (await canSeeThroughParent(who, task))) return task;
  throw gone();
}

/** The caller's standing on a task: 'doer', 'assigner' or null. */
function actorRoleOn(who, task) {
  if (!task) return null;
  if (onIt(task, who.id)) return 'doer';
  if (same(task.createdBy, who.id) || same(task.approver, who.id)) return 'assigner';
  if (isOverseer(who, task)) return 'assigner';
  return null;
}

const approverOf = (task) => task?.approver || task?.createdBy || null;

/** One of the people who set the task's terms (whatever else they are). */
function setsTerms(who, task) {
  if (!task) return false;
  if (who.superAdmin) return true;
  if (same(task.createdBy, who.id) || same(task.approver, who.id)) return true;
  return actorRoleOn(who, task) === 'assigner';
}

/** Edit the terms: an assigner, only until someone takes it on. The Super Admin always. */
const canEdit = (who, task) => setsTerms(who, task) && (who.superAdmin || termsOpen(task));

/** Why an assigner's Edit is gone, in a sentence (or null). */
function editLockReason(who, task) {
  if (!setsTerms(who, task) || canEdit(who, task)) return null;
  if (isTerminal(task.status)) return 'This task is closed, so it can no longer be edited.';
  const took = (task.assignees || []).find((a) => a.acceptance === ACCEPTANCE.ACCEPTED) ||
    (task.assignees || []).find((a) => a.acceptance !== ACCEPTANCE.REJECTED);
  if (took && same(took.user, who.id)) return 'You have accepted this task, so it can no longer be edited.';
  return `${took?.name || 'The person on it'} has accepted this task, so it can no longer be edited. ` +
    'Say what should change in a remark, or they can ask for more time.';
}

function assertCanEdit(who, task) {
  if (canEdit(who, task)) return;
  const locked = editLockReason(who, task);
  if (locked) throw new HttpError(409, locked);
  throw forbidden('Only the person who set this task can change it.');
}

const canTransfer = (who, task) =>
  !!task && (same(task.createdBy, who.id) || same(task.approver, who.id) || onIt(task, who.id) || isOverseer(who, task));

/** Archive: the setter, the team's owner/admins, or the Super Admin. */
const canDelete = (who, task) => same(task.createdBy, who.id) || isOverseer(who, task);
const canPurge = (who) => who.superAdmin;

/**
 * Who the bell reaches for this caller, or null. The setter side chases the
 * people still doing it; someone who handed it in chases the approver.
 */
function nudgeTargets(who, task) {
  if (!task) return null;
  const id = who.id;
  if (task.status === STATUS.SUBMITTED) {
    if (!onIt(task, id)) return null;
    const approver = idOf(approverOf(task));
    if (!approver || approver === id) return null;
    return { kind: 'REVIEW', to: [approver] };
  }
  if (task.status !== STATUS.PENDING && task.status !== STATUS.IN_PROGRESS) return null;
  const setsIt = same(task.createdBy, id) || same(task.approver, id) || isOverseer(who, task);
  if (!setsIt) return null;
  const doing = (task.assignees || [])
    .filter((a) => (a.status === STATUS.PENDING || a.status === STATUS.IN_PROGRESS) && a.acceptance !== ACCEPTANCE.REJECTED)
    .map((a) => idOf(a.user))
    .filter((u) => u && u !== id);
  return doing.length ? { kind: 'DOER', to: [...new Set(doing)] } : null;
}

/** The moves this caller may make, after the review rule. */
function movesFor(who, task, role) {
  const routine = Boolean(task.routine);
  const seen = new Set();
  const moves = [];
  for (const t of TRANSITIONS[task.status] || []) {
    if (!role || (!t.by.includes(role) && !who.superAdmin)) continue;
    const to = effectiveTarget(task, role, t.to, who.id);
    if (seen.has(to) || to === task.status) continue;
    if (routine && to !== STATUS.COMPLETED && !(role === 'assigner' && to === STATUS.CANCELLED)) continue;
    seen.add(to);
    moves.push({ to, note: Boolean(t.note) });
  }
  return moves;
}

/** The buttons a client should draw, worked out on the server. */
function capabilitiesFor(who, task) {
  const role = actorRoleOn(who, task);
  const id = who.id;
  const mine = (task.assignees || []).find((a) => same(a.user, id)) || null;
  const open = !isTerminal(task.status);
  const isSetter = same(task.createdBy, id);
  const unclaimed = Boolean(task.parentTask) && !(task.assignees || []).length;
  const routine = Boolean(task.routine);
  const canApprove = task.status === STATUS.SUBMITTED && role === 'assigner';
  const nudge = nudgeTargets(who, task);
  const hasPendingExtension = (task.extensions || []).some((e) => e.status === EXTENSION_STATUS.PENDING);

  return {
    role,
    canComment: Boolean(role) || canSee(who, task) || who.superAdmin,
    canEdit: canEdit(who, task),
    editLocked: editLockReason(who, task),
    canDelete: canDelete(who, task),
    canPurge: canPurge(who),
    transitions: movesFor(who, task, role),
    routine,
    canDone: routine && Boolean(mine) && open && mine.status !== STATUS.COMPLETED,

    canNudge: Boolean(nudge),
    nudgeTo: nudge ? (nudge.kind === 'REVIEW' ? 'approver' : 'doers') : null,
    nudgeReadyAt: nudge ? nudgeReadyAt(task, new Date(), nudge.kind) : null,

    canAccept: !routine && Boolean(mine) && open && mine.acceptance === ACCEPTANCE.AWAITING,
    canDecline: !routine && Boolean(mine) && open && mine.acceptance !== ACCEPTANCE.REJECTED && mine.status !== STATUS.COMPLETED,
    canDelegate: !routine && Boolean(mine) && open && mine.status !== STATUS.COMPLETED,
    myAcceptance: mine ? mine.acceptance : null,

    canSubmit: !routine && Boolean(mine) && open && task.status !== STATUS.SUBMITTED &&
      mine.status !== STATUS.COMPLETED && task.requiresApproval !== false && !isSetter,
    canApprove,
    canReject: canApprove,
    canWithdraw: Boolean(mine) && task.status === STATUS.SUBMITTED,

    canSetProgress: Boolean(mine) && open && mine.status !== STATUS.COMPLETED,
    myProgress: mine ? Number(mine.progress) || 0 : null,

    canSplit: !routine && Boolean(role) && open && (Number(task.depth) || 0) < MAX_SPLIT_DEPTH - 1,
    canClaim: unclaimed && open && (has(task.openTo, id) || isOverseer(who, task)),

    canRequestExtension: !routine && Boolean(mine) && open && Boolean(task.dueDate) &&
      !(task.extensions || []).some((e) => e.status === EXTENSION_STATUS.PENDING && same(e.requestedBy, id)),
    canDecideExtension: role === 'assigner' && hasPendingExtension,

    canTransfer: canTransfer(who, task) && open && !(routine && role === 'doer'),
  };
}

/**
 * The Mongo filter for the live tasks a caller may see in a pile.
 *   mine · delegated · loop · team (tasks under teams I own/admin) · all (Super Admin)
 * No scope: everything they can see.
 */
function visibleFilter(who, scope, { team } = {}) {
  const me = who.user._id;
  let base;
  if (scope === 'mine') {
    base = { $or: [{ assignedTo: me }, { 'assignees.user': me }, { openTo: me }] };
  } else if (scope === 'delegated') {
    base = { $or: [{ createdBy: me }, { approver: me }, { 'delegations.from': me }] };
  } else if (scope === 'loop') {
    base = { loopUsers: me };
  } else if (scope === 'team') {
    // The Organization pile.
    const mineTeams = [...who.adminTeams].map(oid);
    if (team) {
      if (!mongoose.isValidObjectId(String(team)) || (!who.superAdmin && !who.adminTeams.has(String(team)))) base = { _id: null };
      else base = { team: oid(team) };
    } else {
      base = who.superAdmin ? { team: { $ne: null } } : { team: { $in: mineTeams } };
    }
  } else if (scope === 'all') {
    if (!who.superAdmin) throw forbidden('Only the Super Admin can see every task');
    base = {};
  } else if (who.superAdmin) {
    base = {};
  } else {
    base = {
      $or: [
        { assignedTo: me }, { 'assignees.user': me }, { createdBy: me }, { approver: me },
        { loopUsers: me }, { openTo: me }, { originalAssignees: me },
        ...(who.adminTeams.size ? [{ team: { $in: [...who.adminTeams].map(oid) } }] : []),
      ],
    };
  }
  return { archived: { $ne: true }, ...base };
}

/** The scopes this caller has, for `withScopes`. */
function scopesFor(who) {
  return ['mine', 'delegated', 'loop', ...(who.superAdmin || who.adminTeams.size ? ['team'] : []), ...(who.superAdmin ? ['all'] : [])];
}

module.exports = {
  isSuperAdmin,
  same,
  actor,
  actorFor,
  isOverseer,
  canSee,
  canSeeThroughParent,
  loadVisible,
  actorRoleOn,
  approverOf,
  setsTerms,
  canEdit,
  editLockReason,
  assertCanEdit,
  canTransfer,
  canDelete,
  canPurge,
  nudgeTargets,
  capabilitiesFor,
  visibleFilter,
  scopesFor,
  VISIBILITY_FIELDS,
};
