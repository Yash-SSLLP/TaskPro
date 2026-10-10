/**
 * Sub-schemas shared by tasks and schedules.
 */
const mongoose = require('mongoose');
const {
  REMINDER_CHANNELS, REMINDER_UNITS, REMINDER_WHENS, REMINDER_PATTERNS, MONTHLY_MODES,
} = require('../config');

const { ObjectId } = mongoose.Schema.Types;

/** One reminder rule. The wording and maths live in config.js. */
const reminderSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: REMINDER_CHANNELS, default: 'APP' },
    amount: { type: Number, min: 0, default: 1 },
    unit: { type: String, enum: REMINDER_UNITS, default: 'DAYS' },
    when: { type: String, enum: REMINDER_WHENS, default: 'BEFORE' },
    // A repeating rule's shape; absent on before/after rules.
    pattern: { type: String, enum: REMINDER_PATTERNS, default: undefined },
    at: { type: String, default: undefined },
    from: { type: String, default: undefined },
    to: { type: String, default: undefined },
    weekdays: { type: [Number], default: undefined },
    monthlyMode: { type: String, enum: MONTHLY_MODES, default: undefined },
    monthDay: { type: Number, min: 1, max: 31, default: undefined },
    nthWeek: { type: Number, default: undefined },
    weekday: { type: Number, min: 0, max: 6, default: undefined },
  },
  { _id: false }
);

/**
 * A recording. The bytes are in the platform's GridFS (`file`); `storagePath`
 * is the same id as a string, kept because both apps test for it.
 */
const voiceNoteSchema = new mongoose.Schema(
  {
    file: { type: ObjectId },
    storagePath: { type: String, required: true },
    mimeType: { type: String, trim: true, default: 'audio/webm' },
    sizeBytes: Number,
    durationMs: Number,
    recordedBy: { type: ObjectId, ref: 'User' },
    recordedByName: { type: String, trim: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const linkSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    label: { type: String, trim: true },
  },
  { _id: true }
);

module.exports = { reminderSchema, voiceNoteSchema, linkSchema, ObjectId };
