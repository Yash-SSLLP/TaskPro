/**
 * A repeating task: the schedule, not the tasks. The worker (services/
 * recurrence) raises an ordinary Task for each occurrence when it is due to
 * appear; `Task.recurringTask` + `occurrenceKey` (unique) make that idempotent.
 */
const mongoose = require('mongoose');
const {
  TASK_PRIORITY, DEFAULT_PRIORITY, FREQUENCY, FREQUENCIES, MONTHLY_MODES, MONTHLY_MODE,
  DEFAULT_LEAD_DAYS, isRoutineFrequency,
} = require('../config');
const { reminderSchema, voiceNoteSchema, linkSchema, ObjectId } = require('./shared');

const recurringTaskSchema = new mongoose.Schema(
  {
    // ----- what each occurrence looks like
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 5000 },
    category: { type: String, trim: true },
    priority: { type: String, enum: TASK_PRIORITY, default: DEFAULT_PRIORITY },
    team: { type: ObjectId, ref: 'Team', default: null },
    assignees: [{ type: ObjectId, ref: 'User' }],
    loopUsers: [{ type: ObjectId, ref: 'User' }],
    onBehalf: {
      by: { type: ObjectId, ref: 'User' },
      byName: { type: String, trim: true },
      at: Date,
    },
    // Recorded once, copied onto every occurrence.
    voiceNote: { type: voiceNoteSchema, default: undefined },
    links: { type: [linkSchema], default: [] },
    reminders: { type: [reminderSchema], default: [] },

    // ----- the schedule (all in the setter's time zone)
    frequency: { type: String, enum: FREQUENCIES, default: FREQUENCY.DAILY, required: true },
    // DAILY: every N days, counted from the start date (2 = alternate days).
    interval: { type: Number, min: 1, default: 1 },
    // WEEKLY: 0 = Sunday.
    weekdays: { type: [Number], default: undefined },
    // MONTHLY: on a date, or the Nth weekday (nthWeek 1-4 or -1 = last).
    monthlyMode: { type: String, enum: MONTHLY_MODES, default: MONTHLY_MODE.DATE },
    nthWeek: Number,
    weekday: Number,
    // MONTHLY/YEARLY: 29-31 clamp to a short month's last day.
    monthDay: Number,
    month: Number,
    // "HH:mm" when an occurrence falls due that day.
    time: { type: String, trim: true, default: '18:00' },
    // How many days before it is due an occurrence appears.
    leadDays: { type: Number, min: 0 },
    // Ignored for DAILY, which is routine (only ever marked done).
    requiresApproval: { type: Boolean, default: true },
    startDate: { type: Date, required: true },
    until: Date,
    // Nothing due before this is raised: set on create and whenever it is switched back on.
    mintFrom: Date,

    createdBy: { type: ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    lastRunAt: Date,
    lastOccurrenceKey: { type: String, trim: true },
    generatedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

recurringTaskSchema.index({ isActive: 1, startDate: 1 });
recurringTaskSchema.index({ createdBy: 1 });
recurringTaskSchema.index({ assignees: 1 });
recurringTaskSchema.index({ team: 1 });

recurringTaskSchema.pre('validate', function shapeDefaults(next) {
  if (this.leadDays === undefined || this.leadDays === null) this.leadDays = DEFAULT_LEAD_DAYS[this.frequency] ?? 0;
  if (!Number.isInteger(this.interval) || this.interval < 1) this.interval = 1;
  if (isRoutineFrequency(this.frequency)) this.requiresApproval = false;
  next();
});

module.exports = mongoose.model('RecurringTask', recurringTaskSchema);
