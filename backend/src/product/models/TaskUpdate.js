/**
 * One line of a task's history: a status move, a remark, an edit, a system
 * note. Append only. A status move is a remark with `from`/`to` filled in.
 */
const mongoose = require('mongoose');
const { UPDATE_KINDS, TASK_STATUS, EVIDENCE_KINDS, statusLabel } = require('../config');
const { ObjectId } = require('./shared');

const fileSchema = new mongoose.Schema(
  {
    file: { type: ObjectId },
    name: { type: String, trim: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, trim: true },
    sizeBytes: Number,
    kind: { type: String, enum: EVIDENCE_KINDS, default: 'document' },
  },
  { _id: true }
);

const voiceNoteSchema = new mongoose.Schema(
  {
    file: { type: ObjectId },
    storagePath: { type: String, required: true },
    mimeType: { type: String, trim: true, default: 'audio/webm' },
    sizeBytes: Number,
    durationMs: Number,
  },
  { _id: false }
);

/** What an edit changed, already worded for reading. */
const changeSchema = new mongoose.Schema(
  {
    field: { type: String, trim: true },
    label: { type: String, trim: true },
    before: { type: String, trim: true, maxlength: 600 },
    after: { type: String, trim: true, maxlength: 600 },
  },
  { _id: false }
);

const taskUpdateSchema = new mongoose.Schema(
  {
    task: { type: ObjectId, ref: 'Task', required: true },
    kind: { type: String, enum: UPDATE_KINDS, default: 'COMMENT' },
    by: { type: ObjectId, ref: 'User' },
    byName: { type: String, trim: true },
    from: { type: String, enum: [...TASK_STATUS, null] },
    to: { type: String, enum: [...TASK_STATUS, null] },
    note: { type: String, trim: true, maxlength: 5000 },
    voiceNote: { type: voiceNoteSchema, default: undefined },
    files: { type: [fileSchema], default: [] },
    mentions: [{ type: ObjectId, ref: 'User' }],
    changes: { type: [changeSchema], default: undefined },
    // Done by the system (a reminder, an occurrence): shown quieter, never notified.
    system: { type: Boolean, default: false },
  },
  { timestamps: true }
);

taskUpdateSchema.index({ task: 1, createdAt: -1 });

/**
 * Every new history row is also a line in the platform's activity log (the
 * Super Admin's Activity tab): "Asha Rao accepted the task “TSK-2026-00008
 * Check delivery schedule”". Awaited, because a serverless host may stop once
 * the response is out; a failure is reported and never fails the update.
 */
taskUpdateSchema.pre('save', function rememberNew() {
  this.$locals.mirror = this.isNew;
});

taskUpdateSchema.post('save', async function mirrorToActivity(doc) {
  if (!doc.$locals.mirror) return;
  doc.$locals.mirror = false;
  try {
    const activity = require('../../platform/services/activity');
    const kind = doc.kind || 'COMMENT';
    const task = await mongoose.model('Task').findById(doc.task).select('code title extensions.status extensions.decidedAt').lean();
    const decided = kind === 'EXTENSION_DECIDED'
      ? (task?.extensions || []).filter((e) => e.decidedAt).sort((a, b) => new Date(b.decidedAt) - new Date(a.decidedAt))[0]
      : null;
    const note = String(doc.note || '');
    const system = !!doc.system || !doc.by;
    await activity.record({
      action: `task.${kind.toLowerCase()}`,
      actor: system ? null : { _id: doc.by, name: doc.byName },
      system,
      target: { kind: 'task', id: String(doc.task), label: [task?.code, task?.title].filter(Boolean).join(' ') || 'a task' },
      meta: {
        kind,
        update: String(doc._id),
        ...(doc.from ? { from: doc.from, fromLabel: statusLabel(doc.from) } : {}),
        ...(doc.to ? { to: doc.to, toLabel: statusLabel(doc.to) } : {}),
        ...(note ? { note: note.length > 300 ? `${note.slice(0, 299)}…` : note } : {}),
        ...(doc.changes?.length ? { changes: doc.changes.map((c) => c.label || c.field).filter(Boolean) } : {}),
        ...(decided ? { decision: decided.status } : {}),
        ...(doc.files?.length ? { files: doc.files.length } : {}),
        ...(doc.voiceNote ? { voiceNote: true } : {}),
      },
      at: doc.createdAt,
    });
  } catch (err) {
    console.warn('[tasks] activity mirror failed:', err.message);
  }
});

module.exports = mongoose.model('TaskUpdate', taskUpdateSchema);
