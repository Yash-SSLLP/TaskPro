/**
 * A dated reminder on the calendar, as in the HRMS (models/Reminder.js there).
 * Anyone sets one for themselves; it can also be aimed at other people:
 *
 *   self      only the person who set it
 *   users     them + the people named (contacts and team-mates: whoever they
 *             may give a task to)
 *   team      them + every active member of a team they own or run
 *   everyone  every active person (the Super Admin only)
 *
 * `day` is the calendar day in the setter's own zone, kept as 'YYYY-MM-DD' so
 * no time zone can move it. `time` is free text ("4:00 PM"); when it reads as
 * a clock time the reminder rings then, otherwise at the setter's workday
 * start. `ringAt` is that instant, worked out on every save, and `rungAt`
 * claims the ring so it goes out once (services/calendar.js).
 */
const mongoose = require('mongoose');

const REMINDER_SCOPES = ['self', 'users', 'team', 'everyone'];
const REMINDER_PRIORITIES = ['Low', 'Normal', 'High'];

const reminderSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    time: { type: String, trim: true, maxlength: 40, default: '' },
    scope: { type: String, enum: REMINDER_SCOPES, default: 'self' },
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    priority: { type: String, enum: REMINDER_PRIORITIES, default: 'Normal' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, trim: true, default: '' },
    ringAt: { type: Date, default: null },
    rungAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reminderSchema.index({ createdBy: 1, day: 1 });
reminderSchema.index({ recipients: 1, day: 1 });
reminderSchema.index({ team: 1, day: 1 });
reminderSchema.index({ scope: 1, day: 1 });
reminderSchema.index({ rungAt: 1, ringAt: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
module.exports.REMINDER_SCOPES = REMINDER_SCOPES;
module.exports.REMINDER_PRIORITIES = REMINDER_PRIORITIES;
