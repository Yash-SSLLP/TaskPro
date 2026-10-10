/**
 * Personal settings for Karo, stored on User.settings.
 * Always read through read(), so settings added later get their defaults.
 */
const { IANAZone } = require('luxon');
const { z } = require('zod');
const { badRequest } = require('../platform/errors');

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const LANGS = ['en', 'hi', 'kn', 'ta', 'te', 'ml'];
// An organization tab on the Tasks screen: All, General, or an organization (team) id.
const ORG_TAB = /^(all|general|[a-f\d]{24})$/i;
// Kept: the first 60 (the rest follow by name). A longer list, from someone in
// more organizations than that, is cut down rather than refused.
const MAX_ORG_TABS = 60;

/** Valid tabs only, lower case, each once, in the order given. */
const cleanOrgTabs = (list) => [...new Set(list.filter((k) => typeof k === 'string' && ORG_TAB.test(k)).map((k) => k.toLowerCase()))].slice(0, MAX_ORG_TABS);

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
  // Default for "I want to review this before it is marked done" when giving a task
  // to someone else: off unless they turn it on. The apps call it approvalDefault;
  // it is stored as reviewDefault because nearly everyone already has an old
  // approvalDefault: true saved (merge writes every key), and that one is ignored.
  reviewDefault: false,
  // Applied to a new task created without reminders of its own.
  defaultReminders: [{ channel: 'APP', when: 'BEFORE', amount: 1, unit: 'DAYS' }],
  // An evening summary of open, overdue and in-review tasks.
  dailyDigest: true,
  dailyDigestAt: '18:00',
  // The mobile app's language. Server text stays English.
  lang: 'en',
  // The order of the Tasks screen's organization tabs; the first one opens.
  // Tabs not listed (new organizations) follow, see GET /api/tasks/meta.
  orgTabs: [],
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
    orgTabs: z.array(z.string().regex(ORG_TAB, 'Unknown tab')).max(1000, 'Too many tabs').optional(),
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
    approvalDefault: typeof s.reviewDefault === 'boolean' ? s.reviewDefault : DEFAULTS.reviewDefault,
    defaultReminders: rules ?? DEFAULTS.defaultReminders.map((r) => ({ ...r })),
    dailyDigest: typeof s.dailyDigest === 'boolean' ? s.dailyDigest : DEFAULTS.dailyDigest,
    dailyDigestAt: typeof s.dailyDigestAt === 'string' && HHMM.test(s.dailyDigestAt) ? s.dailyDigestAt : DEFAULTS.dailyDigestAt,
    lang: LANGS.includes(s.lang) ? s.lang : DEFAULTS.lang,
    orgTabs: Array.isArray(s.orgTabs) ? cleanOrgTabs(s.orgTabs) : [...DEFAULTS.orgTabs],
  };
}

/** read()'s shape as it is stored: approvalDefault lives in reviewDefault. */
function stored(s) {
  const { approvalDefault, ...rest } = s;
  return { ...rest, reviewDefault: approvalDefault };
}

/**
 * Apply a partial update from the settings screen. Throws 400 on bad input.
 * Returns what to store on User.settings; read() it before sending it out.
 */
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
  for (const key of ['workdayStart', 'approvalDefault', 'defaultReminders', 'dailyDigest', 'dailyDigestAt', 'lang', 'orgTabs']) {
    if (p[key] !== undefined) next[key] = p[key];
  }
  next.orgTabs = cleanOrgTabs(next.orgTabs);
  return stored(next);
}

/** What a new account stores. */
const defaults = () => stored(read({}));

module.exports = { read, merge, defaults, LANGS };
