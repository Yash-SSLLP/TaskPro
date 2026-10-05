/**
 * One line of a task's history: a status move, a remark, an edit, a system
 * note. Append only. A status move is a remark with `from`/`to` filled in.
 */
const mongoose = require('mongoose');
const { UPDATE_KINDS, TASK_STATUS, EVIDENCE_KINDS } = require('../config');
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

module.exports = mongoose.model('TaskUpdate', taskUpdateSchema);
