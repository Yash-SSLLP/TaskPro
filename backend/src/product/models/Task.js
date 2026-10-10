/**
 * A job somebody has been handed (possibly themselves).
 *
 * A task may be on several people; each assignee row carries its own status,
 * acceptance and progress, and the task's `status` is ROLLED UP from them on
 * every save (cancelling is the one status set directly). Names are snapshots
 * so a row keeps reading right after someone's account changes.
 */
const mongoose = require('mongoose');
const {
  STATUS, TASK_STATUS, ACCEPTANCE, ACCEPTANCE_STATES, TASK_PRIORITY, DEFAULT_PRIORITY,
  normalisePriority, EXTENSION_STATUS, EXTENSION_STATES, FREQUENCY, FREQUENCIES,
  EVIDENCE_KINDS, MONTHLY_MODES, isTerminal,
} = require('../config');
const { reminderSchema, voiceNoteSchema, linkSchema, ObjectId } = require('./shared');
const { nextSeq } = require('../../platform/models/Counter');

/** A file on the task: added by the setter, or with an update (`update`). */
const attachmentSchema = new mongoose.Schema(
  {
    file: { type: ObjectId },
    name: { type: String, trim: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, trim: true },
    sizeBytes: Number,
    kind: { type: String, enum: EVIDENCE_KINDS, default: 'document' },
    uploadedBy: { type: ObjectId, ref: 'User' },
    uploadedByName: { type: String, trim: true },
    uploadedAt: { type: Date, default: Date.now },
    update: { type: ObjectId, ref: 'TaskUpdate' },
  },
  { _id: true }
);

/** One person on the task, and where they have got to. */
const assigneeSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    name: { type: String, trim: true },
    status: { type: String, enum: TASK_STATUS, default: STATUS.PENDING },
    startedAt: Date,
    completedAt: Date,
    // Frozen when they hand in (or finish): moving the deadline later never
    // turns a late delivery into an on-time one.
    completedLate: { type: Boolean, default: false },
    acceptance: { type: String, enum: ACCEPTANCE_STATES, default: ACCEPTANCE.AWAITING },
    acceptedAt: Date,
    declinedAt: Date,
    declineReason: { type: String, trim: true, maxlength: 500 },
    // Declared by the person, 0-100.
    progress: { type: Number, min: 0, max: 100, default: 0 },
    progressAt: Date,
    submittedAt: Date,
    delegatedFrom: { type: ObjectId, ref: 'User' },
    delegatedFromName: { type: String, trim: true },
  },
  { _id: true }
);

/** "I will do it, but not by then." Append only. */
const extensionSchema = new mongoose.Schema(
  {
    requestedBy: { type: ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, trim: true },
    requestedAt: { type: Date, default: Date.now },
    fromDate: Date,
    toDate: { type: Date, required: true },
    reason: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: EXTENSION_STATES, default: EXTENSION_STATUS.PENDING },
    decidedBy: { type: ObjectId, ref: 'User' },
    decidedByName: { type: String, trim: true },
    decidedAt: Date,
    decisionNote: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: true }
);

/** A doer passing their part on (they keep following it). */
const delegationSchema = new mongoose.Schema(
  {
    from: { type: ObjectId, ref: 'User', required: true },
    fromName: { type: String, trim: true },
    to: { type: ObjectId, ref: 'User', required: true },
    toName: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

/** A task handed to the person it should have gone to (they drop out entirely). */
const transferSchema = new mongoose.Schema(
  {
    from: { type: ObjectId, ref: 'User' },
    fromName: { type: String, trim: true },
    to: { type: ObjectId, ref: 'User', required: true },
    toName: { type: String, trim: true },
    by: { type: ObjectId, ref: 'User' },
    byName: { type: String, trim: true },
    reason: { type: String, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

/** How an occurrence repeats, kept on the task so a row can say "Weekly on Fri". */
const repeatSchema = new mongoose.Schema(
  {
    frequency: { type: String, enum: FREQUENCIES, default: FREQUENCY.ONCE },
    weekdays: { type: [Number], default: undefined },
    monthDay: Number,
    month: Number,
    interval: Number,
    monthlyMode: { type: String, enum: MONTHLY_MODES },
    nthWeek: Number,
    weekday: Number,
    time: { type: String, trim: true },
    until: Date,
  },
  { _id: false }
);

/** One press of the bell. Capped at 50 by the route. */
const nudgeSchema = new mongoose.Schema(
  {
    by: { type: ObjectId, ref: 'User' },
    byName: { type: String, trim: true },
    kind: { type: String, enum: ['DOER', 'REVIEW'], default: 'DOER' },
    to: [{ type: ObjectId, ref: 'User' }],
    toNames: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: 300 },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const taskSchema = new mongoose.Schema(
  {
    // TSK-2026-00042, minted once from the global counter.
    code: { type: String, trim: true, unique: true, sparse: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 5000 },
    // Free text, picked from (or added to) the category list.
    category: { type: String, trim: true },
    // Filed under a team: its owner/admins see it and act as its assigners.
    team: { type: ObjectId, ref: 'Team', default: null },

    // ----- people
    createdBy: { type: ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true },
    // Who signs it off. The setter, until someone delegates and takes it on.
    approver: { type: ObjectId, ref: 'User' },
    approverName: { type: String, trim: true },
    // assignees[0], kept in step by the model.
    assignedTo: { type: ObjectId, ref: 'User' },
    assignees: { type: [assigneeSchema], default: [] },
    loopUsers: [{ type: ObjectId, ref: 'User' }],
    // Whoever first had it (and anyone who delegated it on): they keep hearing.
    originalAssignees: [{ type: ObjectId, ref: 'User' }],
    // Set by the Super Admin in `createdBy`'s name.
    onBehalf: {
      by: { type: ObjectId, ref: 'User' },
      byName: { type: String, trim: true },
      at: Date,
    },

    // ----- pieces (a piece is a task of its own)
    parentTask: { type: ObjectId, ref: 'Task' },
    parentCode: { type: String, trim: true },
    parentTitle: { type: String, trim: true },
    depth: { type: Number, default: 0, min: 0 },
    // Who may claim a piece nobody has been named for.
    openTo: [{ type: ObjectId, ref: 'User' }],
    childCount: { type: Number, default: 0 },
    childDoneCount: { type: Number, default: 0 },
    delegations: { type: [delegationSchema], default: [] },
    transfers: { type: [transferSchema], default: [] },

    // ----- state
    status: { type: String, enum: TASK_STATUS, default: STATUS.PENDING },
    priority: { type: String, enum: TASK_PRIORITY, default: DEFAULT_PRIORITY },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    requiresApproval: { type: Boolean, default: true },
    submittedAt: Date,
    rejectionCount: { type: Number, default: 0 },
    // Bumped by every status move; the move's claim matches on it (409 on a race).
    rev: { type: Number, default: 0 },

    // ----- dates
    startDate: Date,
    dueDate: Date,
    originalDueDate: Date,
    extensionCount: { type: Number, default: 0 },
    extensions: { type: [extensionSchema], default: [] },
    assignedAt: { type: Date, default: Date.now },
    startedAt: Date,
    completedAt: Date,
    completedLate: { type: Boolean, default: false },

    // ----- content
    voiceNote: { type: voiceNoteSchema, default: undefined },
    attachments: { type: [attachmentSchema], default: [] },
    links: { type: [linkSchema], default: [] },

    // ----- chasing
    reminders: { type: [reminderSchema], default: [] },
    // Before/after rules already sent (config.reminderKey).
    firedReminders: { type: [String], default: [] },
    // Repeating rules: counted from remindFrom; the last beat sent.
    remindFrom: Date,
    repeatReminderAt: { type: Date, default: undefined },
    // The deadline passing, announced once (cleared when the deadline moves).
    overdueNotifiedAt: Date,

    // ----- the bell
    lastNudgeAt: Date,
    nudgeAt: { DOER: Date, REVIEW: Date },
    nudgeCount: { type: Number, default: 0 },
    nudges: { type: [nudgeSchema], default: [] },

    // ----- edits before acceptance
    editCount: { type: Number, default: 0 },
    lastEditedAt: Date,
    lastEditedByName: { type: String, trim: true },

    // ----- recurrence
    repeat: { type: repeatSchema, default: () => ({ frequency: FREQUENCY.ONCE }) },
    recurringTask: { type: ObjectId, ref: 'RecurringTask' },
    // The local day this occurrence is for: the generator's idempotence key.
    occurrenceKey: { type: String, trim: true },
    // A daily occurrence: only ever marked done.
    routine: { type: Boolean, default: false },

    updateCount: { type: Number, default: 0 },
    // Why it was last moved; on the row so a list can say it.
    stateNote: { type: String, trim: true, maxlength: 1000 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

taskSchema.index({ 'assignees.user': 1, status: 1, dueDate: 1 });
taskSchema.index({ createdBy: 1, status: 1, dueDate: 1 });
taskSchema.index({ approver: 1, status: 1 });
taskSchema.index({ team: 1, status: 1, dueDate: 1 });
taskSchema.index({ status: 1, dueDate: 1 });
taskSchema.index({ loopUsers: 1, status: 1 });
taskSchema.index({ parentTask: 1, status: 1 });
taskSchema.index({ openTo: 1, status: 1 });
taskSchema.index({ originalAssignees: 1, status: 1 });
taskSchema.index({ recurringTask: 1, occurrenceKey: 1 }, { unique: true, sparse: true });

taskSchema.pre('validate', function normalise(next) {
  this.priority = normalisePriority(this.priority) || DEFAULT_PRIORITY;
  if (this.assignees?.length) this.assignedTo = this.assignees[0].user;
  else this.assignedTo = undefined;
  if (this.dueDate && !this.originalDueDate) this.originalDueDate = this.dueDate;
  if (!this.approver && this.createdBy) {
    this.approver = this.createdBy;
    this.approverName = this.createdByName;
  }
  // Nobody has to accept a task they gave themselves.
  for (const a of this.assignees || []) {
    if (this.createdBy && sameId(a.user, this.createdBy) && a.acceptance === ACCEPTANCE.AWAITING) {
      a.acceptance = ACCEPTANCE.ACCEPTED;
      a.acceptedAt = a.acceptedAt || new Date();
    }
  }
  // Stamped once: whoever had it first keeps hearing about it.
  if (this.isNew && !this.originalAssignees?.length) {
    this.originalAssignees = (this.assignees || []).map((a) => a.user).filter(Boolean);
  }
  next();
});

/**
 * The headline status from the assignee rows: all done → COMPLETED, all
 * handed in or done → SUBMITTED, anybody started → IN_PROGRESS, else PENDING.
 * People taken off it or who declined don't hold it open.
 */
taskSchema.pre('validate', function rollUpStatus(next) {
  if (this.status === STATUS.CANCELLED) return next();
  const people = this.assignees || [];
  if (!people.length) return next();

  const live = people.filter((a) => a.status !== STATUS.CANCELLED && a.acceptance !== ACCEPTANCE.REJECTED);
  const pool = live.length ? live : people;
  const started = (a) => [STATUS.IN_PROGRESS, STATUS.SUBMITTED, STATUS.COMPLETED].includes(a.status);
  const times = (key) => pool.map((a) => a[key]).filter(Boolean).map((d) => new Date(d).getTime());

  if (pool.every((a) => a.status === STATUS.COMPLETED)) {
    this.status = STATUS.COMPLETED;
    const done = times('completedAt');
    this.completedAt = done.length ? new Date(Math.max(...done)) : this.completedAt || new Date();
    this.completedLate = pool.some((a) => a.completedLate);
  } else if (pool.every((a) => a.status === STATUS.SUBMITTED || a.status === STATUS.COMPLETED)) {
    this.status = STATUS.SUBMITTED;
    this.completedAt = undefined;
    this.completedLate = false;
    const subs = times('submittedAt');
    if (subs.length) this.submittedAt = new Date(Math.max(...subs));
  } else if (pool.some(started)) {
    this.status = STATUS.IN_PROGRESS;
    this.completedAt = undefined;
    this.completedLate = false;
    if (!this.startedAt) {
      const starts = times('startedAt');
      if (starts.length) this.startedAt = new Date(Math.min(...starts));
    }
  } else {
    this.status = STATUS.PENDING;
    this.completedAt = undefined;
    this.completedLate = false;
  }

  // A task with pieces gets its bar from them (engine.recomputeParent).
  if (!this.childCount) {
    const pct = (a) => (a.status === STATUS.COMPLETED || a.status === STATUS.SUBMITTED
      ? 100
      : Math.min(100, Math.max(0, Number(a.progress) || 0)));
    this.progress = Math.round(pool.reduce((s, a) => s + pct(a), 0) / pool.length);
  }
  next();
});

/** TSK-YYYY-NNNNN from a global counter, stamped on first save. */
taskSchema.pre('save', async function stampCode() {
  if (this.code) return;
  const year = (this.createdAt || new Date()).getFullYear();
  const seq = await nextSeq(`task:${year}`);
  this.code = `TSK-${year}-${String(seq).padStart(5, '0')}`;
});

const sameId = (a, b) => String(a?._id ?? a ?? '') === String(b?._id ?? b ?? '');

taskSchema.methods.isDoer = function isDoer(userId) {
  return (this.assignees || []).some((a) => sameId(a.user, userId));
};

taskSchema.methods.assigneeFor = function assigneeFor(userId) {
  return (this.assignees || []).find((a) => sameId(a.user, userId)) || null;
};

/** Everyone involved: setter, approver, assignees, loop, original assignees. */
taskSchema.methods.audience = function audience() {
  const ids = new Set();
  const add = (v) => v && ids.add(String(v._id ?? v));
  add(this.createdBy);
  add(this.approver);
  (this.assignees || []).forEach((a) => add(a.user));
  (this.loopUsers || []).forEach(add);
  (this.originalAssignees || []).forEach(add);
  return [...ids].filter(Boolean);
};

taskSchema.methods.pendingExtensionBy = function pendingExtensionBy(userId) {
  return (this.extensions || []).find((e) => e.status === EXTENSION_STATUS.PENDING && sameId(e.requestedBy, userId)) || null;
};

taskSchema.methods.isTerminal = function terminal() {
  return isTerminal(this.status);
};

module.exports = mongoose.model('Task', taskSchema);
module.exports.attachmentSchema = attachmentSchema;
