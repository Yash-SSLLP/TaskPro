/**
 * A task worth setting more than once: a task with the dates left off.
 * Personal (`owner`), or shared with a team (`team`) by its owner/admin.
 * Using one opens the assign form filled in (GET /templates/:id/prefill).
 */
const mongoose = require('mongoose');
const { TASK_PRIORITY, DEFAULT_PRIORITY, FREQUENCY, FREQUENCIES } = require('../config');
const { reminderSchema, linkSchema, ObjectId } = require('./shared');

const taskTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 5000 },
    category: { type: String, trim: true },
    priority: { type: String, enum: TASK_PRIORITY, default: DEFAULT_PRIORITY },
    // "Always a three-day job": prefilled as a deadline.
    dueInDays: { type: Number, min: 0 },
    repeat: {
      type: new mongoose.Schema(
        {
          frequency: { type: String, enum: FREQUENCIES, default: FREQUENCY.ONCE },
          weekdays: { type: [Number], default: undefined },
          monthDay: Number,
          month: Number,
          interval: Number,
          monthlyMode: String,
          nthWeek: Number,
          weekday: Number,
          time: { type: String, trim: true },
        },
        { _id: false }
      ),
      default: () => ({ frequency: FREQUENCY.ONCE }),
    },
    reminders: { type: [reminderSchema], default: [] },
    links: { type: [linkSchema], default: [] },
    requiresApproval: { type: Boolean, default: undefined },
    // Pre-selected, never forced: anyone no longer assignable is dropped on prefill.
    defaultAssignees: [{ type: ObjectId, ref: 'User' }],
    defaultLoopUsers: [{ type: ObjectId, ref: 'User' }],

    owner: { type: ObjectId, ref: 'User' },
    team: { type: ObjectId, ref: 'Team', default: null },
    useCount: { type: Number, default: 0 },
    lastUsedAt: Date,
    isActive: { type: Boolean, default: true },
    createdBy: { type: ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true },
  },
  { timestamps: true }
);

taskTemplateSchema.index({ owner: 1, isActive: 1, name: 1 });
taskTemplateSchema.index({ team: 1, isActive: 1, name: 1 });

module.exports = mongoose.model('TaskTemplate', taskTemplateSchema);
