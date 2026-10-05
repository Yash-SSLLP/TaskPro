/**
 * What comes in on the wire, cleaned: multipart bodies (arrays arrive
 * JSON-encoded), reminder rules, repeat shapes, links, and uploaded files
 * (stored in the platform's GridFS, already attached to their task).
 */
const multer = require('multer');
const { badRequest } = require('../../platform/errors');
const { saveFile } = require('../../platform/services/files');
const {
  REMINDER_CHANNELS, REMINDER_UNITS, REMINDER_WHENS, REMINDER_WHEN, REMINDER_PATTERN, REPEAT_REMINDER,
  MAX_REMIND_EVERY_HOURS, DEFAULT_REMIND_WINDOW, DEFAULT_REMIND_AT, MAX_DAY_INTERVAL, MONTHLY_MODE, MONTHLY_MODES,
  NTH_WEEKS, FREQUENCY, FREQUENCIES, reminderPattern, hhmmOf, evidenceKindFor,
} = require('../config');

/**
 * Attachments and a voice note on one multipart request: the recording under
 * `voice`, files under any other field. 25 MB each, 10 files plus the voice.
 * Matched on type OR extension (some phones send PDFs as octet-stream).
 */
const taskUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 11 },
  defParamCharset: 'utf8',
  fileFilter: (req, file, cb) => {
    const ok = /^(image|video|audio)\//.test(file.mimetype) ||
      file.mimetype === 'application/pdf' ||
      /officedocument|ms-excel|msword|spreadsheet|presentation/.test(file.mimetype) ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/octet-stream' ||
      /\.(pdf|jpe?g|png|webp|heic|heif|gif|mp4|mov|webm|mp3|m4a|wav|amr|ogg|docx?|xlsx?|pptx?|csv|txt)$/i.test(file.originalname || '');
    cb(ok ? null : badRequest('That kind of file cannot be attached to a task.'), ok);
  },
}).any();

const JSON_FIELDS = ['assignees', 'loopUsers', 'reminders', 'repeat', 'links', 'mentions', 'items', 'openTo',
  'weekdays', 'defaultAssignees', 'defaultLoopUsers'];

/** The body however it arrived; multipart arrays/objects are JSON-decoded. */
function parseBody(req) {
  const b = { ...(req.body || {}) };
  for (const key of JSON_FIELDS) {
    if (typeof b[key] === 'string') {
      try {
        b[key] = JSON.parse(b[key]);
      } catch {
        /* left as is; validation speaks */
      }
    }
  }
  return b;
}

/** "false", "0" and false are false; anything else present is true. */
const truthy = (v) => !(v === false || v === 'false' || v === '0' || v === 0);
const isOn = (v) => v === true || v === 'true' || v === '1' || v === 1;

/** A comma-separated query parameter (or array) as a clean list. */
function listParam(v) {
  if (!v) return [];
  const raw = Array.isArray(v) ? v : String(v).split(',');
  return raw.map((s) => String(s).trim()).filter(Boolean);
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** A repeating rule in the shape it says it is, or null when it could never fire. */
function cleanRepeatingReminder(r, base) {
  const pattern = reminderPattern(r);
  const head = { channel: base.channel, when: REMINDER_WHEN.EVERY, pattern };

  if (pattern === REMINDER_PATTERN.HOURLY) {
    const minutes = base.unit === 'MINUTES';
    const out = {
      ...head,
      unit: minutes ? 'MINUTES' : 'HOURS',
      amount: minutes
        ? Math.min(MAX_REMIND_EVERY_HOURS * 60, Math.max(REPEAT_REMINDER.minMinutes, Math.round(base.amount)))
        : Math.min(MAX_REMIND_EVERY_HOURS, Math.max(1, Math.round(base.amount) || 1)),
    };
    const from = hhmmOf(r?.from);
    const to = hhmmOf(r?.to);
    if (from && to && from < to && (from !== DEFAULT_REMIND_WINDOW.from || to !== DEFAULT_REMIND_WINDOW.to)) {
      out.from = from;
      out.to = to;
    }
    return out;
  }

  const out = { ...head, unit: 'DAYS', amount: 1, at: hhmmOf(r?.at) || DEFAULT_REMIND_AT };
  if (pattern === REMINDER_PATTERN.DAILY) {
    out.amount = Math.min(MAX_DAY_INTERVAL, Math.max(1, Math.round(Number(r?.amount) || 1)));
    return out;
  }
  if (pattern === REMINDER_PATTERN.WEEKLY) {
    const days = [...new Set(asList(r?.weekdays).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
    if (!days.length) return null;
    out.weekdays = days;
    return out;
  }
  if (r?.monthlyMode === MONTHLY_MODE.WEEKDAY) {
    const wd = Number(r.weekday);
    const nth = Number(r.nthWeek);
    out.monthlyMode = MONTHLY_MODE.WEEKDAY;
    out.weekday = Number.isInteger(wd) && wd >= 0 && wd <= 6 ? wd : 1;
    out.nthWeek = NTH_WEEKS.includes(nth) ? nth : 1;
  } else {
    const d = Math.round(Number(r?.monthDay));
    out.monthlyMode = MONTHLY_MODE.DATE;
    out.monthDay = Number.isFinite(d) ? Math.min(31, Math.max(1, d)) : 1;
  }
  return out;
}

/** Reminder rules off the wire: nonsense dropped, one repeating rule, no duplicates, at most 10. */
function cleanReminders(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const base = {
        channel: REMINDER_CHANNELS.includes(r?.channel) ? r.channel : 'APP',
        amount: Math.max(0, Math.min(365, Number(r?.amount) || 0)),
        unit: REMINDER_UNITS.includes(r?.unit) ? r.unit : 'DAYS',
        when: REMINDER_WHENS.includes(r?.when) ? r.when : 'BEFORE',
      };
      return base.when === REMINDER_WHEN.EVERY ? cleanRepeatingReminder(r, base) : base;
    })
    .filter((r) => r && r.amount > 0)
    .filter((r, i, all) => r.when !== REMINDER_WHEN.EVERY || all.findIndex((o) => o.when === REMINDER_WHEN.EVERY) === i)
    .filter((r, i, all) => all.findIndex((o) => o.channel === r.channel && o.amount === r.amount && o.unit === r.unit && o.when === r.when) === i)
    .slice(0, 10);
}

/** The every-2-hours rule a routine (daily) task gets unless told otherwise. */
const ROUTINE_REMINDERS = () => [{ channel: 'APP', amount: 2, unit: 'HOURS', when: REMINDER_WHEN.EVERY, pattern: REMINDER_PATTERN.HOURLY }];

function cleanRepeat(raw) {
  const frequency = FREQUENCIES.includes(raw?.frequency) ? raw.frequency : FREQUENCY.ONCE;
  const out = { frequency };
  if (frequency === FREQUENCY.DAILY) out.interval = Math.min(MAX_DAY_INTERVAL, Math.max(1, Math.round(Number(raw?.interval) || 1)));
  if (frequency === FREQUENCY.WEEKLY) {
    out.weekdays = [...new Set(asList(raw?.weekdays).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  }
  if (frequency === FREQUENCY.MONTHLY || frequency === FREQUENCY.YEARLY) {
    const d = Number(raw?.monthDay);
    if (Number.isInteger(d) && d >= 1 && d <= 31) out.monthDay = d;
  }
  if (frequency === FREQUENCY.MONTHLY) {
    out.monthlyMode = MONTHLY_MODES.includes(raw?.monthlyMode) ? raw.monthlyMode : MONTHLY_MODE.DATE;
    if (out.monthlyMode === MONTHLY_MODE.WEEKDAY) {
      const nth = Number(raw?.nthWeek);
      const wd = Number(raw?.weekday);
      out.nthWeek = NTH_WEEKS.includes(nth) ? nth : 1;
      out.weekday = Number.isInteger(wd) && wd >= 0 && wd <= 6 ? wd : 1;
    }
  }
  if (frequency === FREQUENCY.YEARLY) {
    const m = Number(raw?.month);
    if (Number.isInteger(m) && m >= 1 && m <= 12) out.month = m;
  }
  if (hhmmOf(raw?.time)) out.time = hhmmOf(raw.time);
  if (raw?.until) {
    const u = new Date(raw.until);
    if (!Number.isNaN(u.getTime())) out.until = u;
  }
  return out;
}

function cleanLinks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => ({ url: String(l?.url || '').trim(), label: String(l?.label || '').trim() }))
    .filter((l) => /^https?:\/\//i.test(l.url))
    .slice(0, 20);
}

/** Store the non-voice uploads, already attached to `ref`. @returns attachment rows */
async function storeFiles(files, ref, user) {
  const out = [];
  for (const f of (files || []).filter((x) => x.fieldname !== 'voice')) {
    const saved = await saveFile({ uploadedBy: user._id, buffer: f.buffer, name: f.originalname, mime: f.mimetype, ref });
    out.push({
      file: saved.id,
      name: saved.name,
      storagePath: String(saved.id),
      mimeType: f.mimetype,
      sizeBytes: saved.size,
      kind: evidenceKindFor(f.mimetype, f.originalname),
      uploadedBy: user._id,
      uploadedByName: user.name,
    });
  }
  return out;
}

/** The recording under `voice`, stored and attached to `ref`, or null. */
async function storeVoiceNote(files, ref, user, durationMs) {
  const f = (files || []).find((x) => x.fieldname === 'voice');
  if (!f) return null;
  const mime = f.mimetype && f.mimetype !== 'application/octet-stream' ? f.mimetype : 'audio/webm';
  const saved = await saveFile({ uploadedBy: user._id, buffer: f.buffer, name: f.originalname || 'voice-note.webm', mime, ref });
  return {
    file: saved.id,
    storagePath: String(saved.id),
    mimeType: mime,
    sizeBytes: saved.size,
    durationMs: Number(durationMs) || undefined,
    recordedBy: user._id,
    recordedByName: user.name,
  };
}

module.exports = {
  taskUpload,
  parseBody,
  truthy,
  isOn,
  listParam,
  cleanReminders,
  ROUTINE_REMINDERS,
  cleanRepeat,
  cleanLinks,
  storeFiles,
  storeVoiceNote,
};
