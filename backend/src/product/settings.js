/**
 * Personal settings for KARO, stored on User.settings.
 * Always read through read(), so settings added later get their defaults.
 */
const { IANAZone } = require('luxon');
const { z } = require('zod');
const { badRequest } = require('../platform/errors');

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const LANGS = ['en', 'hi', 'kn', 'ta', 'te', 'ml'];

// A reminder rule as the task form sends it (see config/tasks REMINDER_*).
const reminderRule = z
  .object({
    channel: z.enum(['APP', 'EMAIL']).default('APP'),
    when: z.enum(['BEFORE', 'AFTER', 'EVERY']),
    amount: z.number().int().min(0).max(1000),
    unit: z.enum(['MINUTES', 'HOURS', 'DAYS']),
    pattern: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(),
    at: z.string().regex(HHMM).optional(),
    from: z.string().regex(HHMM).optional(),
    to: z.string().regex(HHMM).optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    monthlyMode: z.enum(['DATE', 'WEEKDAY']).optional(),
    monthDay: z.number().int().min(1).max(31).optional(),
    nthWeek: z.number().int().min(-1).max(4).optional(),
    weekday: z.number().int().min(0).max(6).optional(),
  })
  .strip();

const DEFAULTS = Object.freeze({
  timezone: 'Asia/Kolkata',
  // When repeating tasks appear (local time).
  workdayStart: '09:00',
  // Default for "I'll check it before it's done" when giving a task to someone else.
  approvalDefault: true,
  // Applied to a new task created without reminders of its own.
  defaultReminders: [{ channel: 'APP', when: 'BEFORE', amount: 1, unit: 'DAYS' }],
  // An evening summary of open, overdue and in-review tasks.
  dailyDigest: true,
  dailyDigestAt: '18:00',
  // The mobile app's language. Server text stays English.
  lang: 'en',
});

const patchSchema = z
  .object({
    timezone: z.string().optional(),
    workdayStart: z.string().regex(HHMM, 'Use a time like 09:00').optional(),
    approvalDefault: z.boolean().optional(),
    defaultReminders: z.array(reminderRule).max(5).optional(),
    dailyDigest: z.boolean().optional(),
    dailyDigestAt: z.string().regex(HHMM, 'Use a time like 18:00').optional(),
    lang: z.enum(LANGS, { errorMap: () => ({ message: 'Unknown language' }) }).optional(),
  })
  .strict();

function read(raw = {}) {
  const s = raw || {};
  const rules = Array.isArray(s.defaultReminders)
    ? s.defaultReminders.map((r) => reminderRule.safeParse(r)).filter((r) => r.success).map((r) => r.data)
    : null;
  return {
    timezone: s.timezone && IANAZone.isValidZone(s.timezone) ? s.timezone : DEFAULTS.timezone,
    workdayStart: typeof s.workdayStart === 'string' && HHMM.test(s.workdayStart) ? s.workdayStart : DEFAULTS.workdayStart,
    approvalDefault: typeof s.approvalDefault === 'boolean' ? s.approvalDefault : DEFAULTS.approvalDefault,
    defaultReminders: rules ?? DEFAULTS.defaultReminders.map((r) => ({ ...r })),
    dailyDigest: typeof s.dailyDigest === 'boolean' ? s.dailyDigest : DEFAULTS.dailyDigest,
    dailyDigestAt: typeof s.dailyDigestAt === 'string' && HHMM.test(s.dailyDigestAt) ? s.dailyDigestAt : DEFAULTS.dailyDigestAt,
    lang: LANGS.includes(s.lang) ? s.lang : DEFAULTS.lang,
  };
}

/** Apply a partial update from the settings screen. Throws 400 on bad input. */
function merge(current, patch) {
  const result = patchSchema.safeParse(patch);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw badRequest(issue.code === 'unrecognized_keys' ? 'Unknown setting' : issue.message);
  }
  const p = result.data;
  const next = read(current);
  if (p.timezone) {
    if (!IANAZone.isValidZone(p.timezone)) throw badRequest('Unknown time zone');
    next.timezone = p.timezone;
  }
  for (const key of ['workdayStart', 'approvalDefault', 'defaultReminders', 'dailyDigest', 'dailyDigestAt', 'lang']) {
    if (p[key] !== undefined) next[key] = p[key];
  }
  return next;
}

const defaults = () => read({});

module.exports = { read, merge, defaults, LANGS };
