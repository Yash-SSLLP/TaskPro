/**
 * The task vocabulary, in one place: statuses and who may move between them,
 * acceptance, priorities and their colours, sorts, repeating shapes and
 * reminder rules (and their maths). Ported from the HRMS Tasks module, minus
 * points, requests and legacy spellings.
 *
 *   PENDING ──> IN_PROGRESS ──> SUBMITTED (in review) ──> COMPLETED
 *      └──────────── CANCELLED (the assigner calls it off)
 *
 * Overdue, in time and delayed are derived, never stored.
 */

// ---------------------------------------------------------------- statuses

const STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  // Handed in, waiting on the approver. Skipped when review is off or the
  // person finishing is the one who set it.
  SUBMITTED: 'SUBMITTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};
const TASK_STATUS = Object.values(STATUS);
const TERMINAL_STATUS = [STATUS.COMPLETED, STATUS.CANCELLED];
const OPEN_STATUS = TASK_STATUS.filter((s) => !TERMINAL_STATUS.includes(s));
/** Still somebody's to do (not handed in). */
const DOING_STATUS = [STATUS.PENDING, STATUS.IN_PROGRESS];

const LABELS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'In review',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
const statusLabel = (status) => LABELS[status] || status || '';

/** The board, left to right. Cancelled is reachable from the list filter. */
const BOARD_COLUMNS = [
  { key: STATUS.PENDING, label: 'To do' },
  { key: STATUS.IN_PROGRESS, label: 'In progress' },
  { key: STATUS.SUBMITTED, label: 'Review' },
  { key: STATUS.COMPLETED, label: 'Done' },
];

/**
 * The legal moves, keyed by the state being left. `by`: doer (on the task) or
 * assigner (setter, approver, team owner/admin, Super Admin). Every move
 * needs a note or a voice note.
 */
const TRANSITIONS = {
  PENDING: [
    { to: STATUS.IN_PROGRESS, by: ['doer', 'assigner'], note: true },
    { to: STATUS.SUBMITTED, by: ['doer'], note: true },
    { to: STATUS.COMPLETED, by: ['doer', 'assigner'], note: true },
    { to: STATUS.CANCELLED, by: ['assigner'], note: true },
  ],
  IN_PROGRESS: [
    { to: STATUS.SUBMITTED, by: ['doer'], note: true },
    { to: STATUS.COMPLETED, by: ['doer', 'assigner'], note: true },
    { to: STATUS.PENDING, by: ['assigner'], note: true },
    { to: STATUS.CANCELLED, by: ['assigner'], note: true },
  ],
  SUBMITTED: [
    { to: STATUS.COMPLETED, by: ['assigner'], note: true },
    { to: STATUS.IN_PROGRESS, by: ['assigner'], note: true },
    // A doer may withdraw their own submission.
    { to: STATUS.PENDING, by: ['doer', 'assigner'], note: true },
    { to: STATUS.CANCELLED, by: ['assigner'], note: true },
  ],
  COMPLETED: [{ to: STATUS.IN_PROGRESS, by: ['assigner'], note: true }],
  CANCELLED: [{ to: STATUS.PENDING, by: ['assigner'], note: true }],
};

const transitionFor = (from, to) => (TRANSITIONS[from] || []).find((t) => t.to === to) || null;

const idOf = (v) => String(v?._id ?? v ?? '');

/**
 * Where a move actually lands: a doer's Complete on a task that needs review
 * becomes a submission, unless they set the task themselves.
 */
function effectiveTarget(task, role, to, userId) {
  if (to !== STATUS.COMPLETED || role !== 'doer') return to;
  if (task?.requiresApproval === false) return to;
  const setter = idOf(task?.createdBy);
  if (setter && setter === String(userId || '')) return to;
  return STATUS.SUBMITTED;
}

const isTerminal = (status) => TERMINAL_STATUS.includes(status);

/** Open (not handed in) and past its deadline. */
function isOverdue(task, now = new Date()) {
  if (!task?.dueDate || !DOING_STATUS.includes(task.status)) return false;
  return new Date(task.dueDate).getTime() < now.getTime();
}

const isInReview = (task) => task?.status === STATUS.SUBMITTED;

/** Whatever came in, any case, as a status (or null). */
function normaliseStatus(value) {
  if (!value) return null;
  const raw = String(value).trim().toUpperCase().replace(/[\s-]+/g, '_');
  return TASK_STATUS.includes(raw) ? raw : null;
}

// ---------------------------------------------------------------- acceptance

/** A second axis: has the person taken it on? Not a status. */
const ACCEPTANCE = { AWAITING: 'AWAITING', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED' };
const ACCEPTANCE_STATES = Object.values(ACCEPTANCE);
const ACCEPTANCE_LABELS = { AWAITING: 'Not yet accepted', ACCEPTED: 'Accepted', REJECTED: 'Declined' };

/** Everybody still on it has said no. */
function isDeclined(task) {
  const live = (task?.assignees || []).filter((a) => a.status !== STATUS.CANCELLED);
  return live.length > 0 && live.every((a) => a.acceptance === ACCEPTANCE.REJECTED);
}

function isAwaitingAcceptance(task) {
  return (task?.assignees || []).some((a) => a.acceptance === ACCEPTANCE.AWAITING && a.status === STATUS.PENDING);
}

/**
 * May the terms still change? Only while pending and nobody has taken it on
 * (accepted, started, handed in or finished). A refusal does not lock it.
 */
function termsOpen(task) {
  if (!task || task.status !== STATUS.PENDING) return false;
  const setter = String(task.createdBy?._id ?? task.createdBy ?? '');
  return !(task.assignees || []).some((a) => {
    if (a.acceptance === ACCEPTANCE.REJECTED) return false;
    // The setter's own row is accepted from the start; it doesn't lock the terms.
    if (setter && String(a.user?._id ?? a.user ?? '') === setter && a.status === STATUS.PENDING) return false;
    const s = a.status || STATUS.PENDING;
    return a.acceptance === ACCEPTANCE.ACCEPTED || (s !== STATUS.PENDING && s !== STATUS.CANCELLED);
  });
}

/** What the edit trail calls each field. */
const EDIT_FIELD_LABELS = {
  title: 'Title',
  description: 'Details',
  category: 'Category',
  priority: 'Priority',
  startDate: 'Start date',
  dueDate: 'Deadline',
  requiresApproval: 'Review',
  reminders: 'Reminders',
  links: 'Links',
  loopUsers: 'Kept in the loop',
  assignees: 'Assigned to',
  team: 'Team',
  attachments: 'Files',
  voiceNote: 'Voice note',
};

// ---------------------------------------------------------------- the bell

/** A person may chase the same task (in the same direction) once per 30 minutes. */
const NUDGE_COOLDOWN_MIN = 30;

/** When the bell may next be pressed (per direction DOER | REVIEW), or null. */
function nudgeReadyAt(task, now = new Date(), kind = null) {
  const last = kind ? task?.nudgeAt?.[kind] : task?.lastNudgeAt;
  if (!last) return null;
  const at = new Date(last).getTime() + NUDGE_COOLDOWN_MIN * 60 * 1000;
  return at > now.getTime() ? new Date(at) : null;
}

// ---------------------------------------------------------------- priority

const TASK_PRIORITY = ['Urgent', 'Medium', 'Low'];
const DEFAULT_PRIORITY = 'Medium';
const PRIORITY_ALIASES = { High: 'Urgent', Normal: 'Medium' };

function normalisePriority(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const title = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (TASK_PRIORITY.includes(title)) return title;
  return PRIORITY_ALIASES[title] || null;
}

/** The tint behind a whole row/card: priority while open, green when done. */
const PRIORITY_COLORS = {
  Urgent: { ink: '#B42318', bg: '#FEF3F2', border: '#FDA29B', solid: '#D92D20' },
  Medium: { ink: '#B54708', bg: '#FFFAEB', border: '#FEC84B', solid: '#F79009' },
  Low: { ink: '#475467', bg: '#F2F4F7', border: '#D0D5DD', solid: '#98A2B3' },
};
const DONE_COLOR = { ink: '#027A48', bg: '#ECFDF3', border: '#6CE9A6', solid: '#12B76A' };
const CANCELLED_COLOR = { ink: '#667085', bg: '#F9FAFB', border: '#EAECF0', solid: '#98A2B3' };

function accentFor(task) {
  if (task?.status === STATUS.COMPLETED) return { key: 'DONE', ...DONE_COLOR };
  if (task?.status === STATUS.CANCELLED) return { key: 'CANCELLED', ...CANCELLED_COLOR };
  const p = normalisePriority(task?.priority) || DEFAULT_PRIORITY;
  return { key: p, ...PRIORITY_COLORS[p] };
}

const PRIORITY_RANK = { Urgent: 0, Medium: 1, Low: 2 };

// ---------------------------------------------------------------- pieces & progress

/** How many pieces one task may be split into, and how deep. */
const MAX_SUBTASKS = 50;
const MAX_SPLIT_DEPTH = 3;

const PROGRESS_STEPS = [0, 25, 50, 75, 100];
function clampProgress(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/** "I'll do it, but not by then." Not a status. */
const EXTENSION_STATUS = { PENDING: 'PENDING', APPROVED: 'APPROVED', DECLINED: 'DECLINED' };
const EXTENSION_STATES = Object.values(EXTENSION_STATUS);

// ---------------------------------------------------------------- sorting

/** `dir` is each order's natural way round. */
const SORTS = {
  due: { label: 'Due date', field: 'dueDate', dir: -1 },
  assigned: { label: 'Day assigned', field: 'assignedAt', dir: -1 },
  pending: { label: 'Pending days', field: 'assignedAt', dir: 1, openFirst: true },
  priority: { label: 'Priority', field: 'priorityRank', dir: 1, computed: true },
  title: { label: 'Title', field: 'title', dir: 1 },
  created: { label: 'Newest first', field: 'createdAt', dir: -1 },
};
const SORT_KEYS = Object.keys(SORTS);
const DEFAULT_SORT = 'due';

// ---------------------------------------------------------------- recurrence

const FREQUENCY = { ONCE: 'ONCE', DAILY: 'DAILY', WEEKLY: 'WEEKLY', MONTHLY: 'MONTHLY', YEARLY: 'YEARLY' };
const FREQUENCIES = Object.values(FREQUENCY);
const FREQUENCY_LABELS = { ONCE: 'One time', DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' };

/** Sunday-first, so an index IS the weekday. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** MONTHLY on a date (the 15th) or on the Nth weekday (the first Monday, the last Friday). */
const MONTHLY_MODE = { DATE: 'DATE', WEEKDAY: 'WEEKDAY' };
const MONTHLY_MODES = Object.values(MONTHLY_MODE);
const NTH_WEEKS = [1, 2, 3, 4, -1];
const NTH_WEEK_LABELS = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', '-1': 'Last' };
const MAX_DAY_INTERVAL = 31;

/** How many days before it is due an occurrence appears. */
const DEFAULT_LEAD_DAYS = { DAILY: 0, WEEKLY: 0, MONTHLY: 2, YEARLY: 2 };
const MAX_LEAD_DAYS = 14;

/** A daily occurrence is routine: only ever marked done. */
const isRoutineFrequency = (frequency) => frequency === FREQUENCY.DAILY;

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** "18:00" → "6:00 PM". */
function time12(hhmm) {
  const [h, m] = String(hhmm || '18:00').split(':').map((n) => parseInt(n, 10));
  if (!Number.isFinite(h)) return '';
  return `${((h + 11) % 12) + 1}:${String(Number.isFinite(m) ? m : 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** A schedule in one line: "Alternate days · 6:00 PM", "Monthly on the first Monday · 6:00 PM". */
function patternLabel(s = {}) {
  const at = s.time ? ` · ${time12(s.time)}` : '';
  switch (s.frequency) {
    case 'DAILY': {
      const n = Math.max(1, Number(s.interval) || 1);
      if (n === 1) return `Every day${at}`;
      return n === 2 ? `Alternate days${at}` : `Every ${n} days${at}`;
    }
    case 'WEEKLY': {
      const days = (s.weekdays || []).slice().sort((a, b) => a - b).map((d) => WEEKDAYS[d]).filter(Boolean);
      if (days.length === 7) return `Every day of the week${at}`;
      return `Weekly${days.length ? ` on ${days.join(', ')}` : ''}${at}`;
    }
    case 'MONTHLY': {
      if (s.monthlyMode === MONTHLY_MODE.WEEKDAY && Number.isInteger(Number(s.weekday))) {
        const nth = NTH_WEEK_LABELS[String(s.nthWeek ?? 1)] || 'First';
        return `Monthly on the ${nth.toLowerCase()} ${WEEKDAY_NAMES[Number(s.weekday)]}${at}`;
      }
      return `Monthly on the ${ordinal(Number(s.monthDay) || 1)}${at}`;
    }
    case 'YEARLY':
      return `Yearly on ${Number(s.monthDay) || 1} ${MONTH_NAMES[(Number(s.month) || 1) - 1] || ''}${at}`;
    default:
      return 'One time';
  }
}

// ---------------------------------------------------------------- reminders

/** EMAIL goes through SMTP when it is configured, otherwise it falls back to APP. */
const REMINDER_CHANNEL = { APP: 'APP', EMAIL: 'EMAIL' };
const REMINDER_CHANNELS = Object.values(REMINDER_CHANNEL);
const REMINDER_CHANNEL_LABELS = { APP: 'App notification', EMAIL: 'Email' };

const REMINDER_UNIT = { MINUTES: 'MINUTES', HOURS: 'HOURS', DAYS: 'DAYS' };
const REMINDER_UNITS = Object.values(REMINDER_UNIT);
const UNIT_MINUTES = { MINUTES: 1, HOURS: 60, DAYS: 24 * 60 };

/** Before the deadline, after it, or again and again until done. */
const REMINDER_WHEN = { BEFORE: 'BEFORE', AFTER: 'AFTER', EVERY: 'EVERY' };
const REMINDER_WHENS = Object.values(REMINDER_WHEN);

/** Bounds on a repeating reminder, so it never becomes noise. */
const REPEAT_REMINDER = {
  minMinutes: 30,
  activeFromHour: 9,
  activeToHour: 21,
  stopAfterDueMinutes: 24 * 60,
  dayPatternStopAfterDueMinutes: 7 * 24 * 60,
};

/**
 * A repeating reminder's shape: HOURLY (every N hours on the clock inside a
 * window), DAILY (every N days at a time), WEEKLY (on ticked weekdays),
 * MONTHLY (on a date or the Nth weekday). One per task.
 */
const REMINDER_PATTERN = { HOURLY: 'HOURLY', DAILY: 'DAILY', WEEKLY: 'WEEKLY', MONTHLY: 'MONTHLY' };
const REMINDER_PATTERNS = Object.values(REMINDER_PATTERN);
const REMINDER_PATTERN_LABELS = { HOURLY: 'Hourly', DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' };
const DEFAULT_REMIND_AT = '10:00';
const DEFAULT_REMIND_WINDOW = { from: '09:00', to: '21:00' };
const MAX_REMIND_EVERY_HOURS = 12;

function reminderPattern(rule) {
  if (REMINDER_PATTERNS.includes(rule?.pattern)) return rule.pattern;
  return rule?.unit === REMINDER_UNIT.DAYS ? REMINDER_PATTERN.DAILY : REMINDER_PATTERN.HOURLY;
}

/** A clean 'HH:mm', or ''. */
function hhmmOf(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return '';
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function reminderWindow(rule) {
  const from = hhmmOf(rule?.from);
  const to = hhmmOf(rule?.to);
  return from && to && from < to ? { from, to } : { ...DEFAULT_REMIND_WINDOW };
}

/** A before/after rule as a signed offset in minutes from the deadline. */
function reminderOffsetMinutes(rule) {
  const mins = Math.abs(Number(rule?.amount) || 0) * (UNIT_MINUTES[rule?.unit] || 1);
  return rule?.when === REMINDER_WHEN.AFTER ? mins : -mins;
}

/** A repeating rule's beat in minutes, never faster than the floor. */
function repeatEveryMinutes(rule) {
  const n = Math.abs(Number(rule?.amount) || 0);
  return Math.max(REPEAT_REMINDER.minMinutes, n * (UNIT_MINUTES[rule?.unit] || 60));
}

/** The idempotence key a fired before/after rule is recorded under. */
const reminderKey = (rule) => `${rule.channel}:${rule.when}:${rule.amount}:${rule.unit}`;

/** "Every 2 hours", "Alternate days at 10:00 AM", "Every Mon, Thu at 10:00 AM". */
function repeatingReminderText(rule) {
  const at = ` at ${time12(hhmmOf(rule?.at) || DEFAULT_REMIND_AT)}`;
  switch (reminderPattern(rule)) {
    case REMINDER_PATTERN.DAILY: {
      const n = Math.max(1, Math.round(Number(rule?.amount) || 1));
      if (n === 1) return `Every day${at}`;
      return n === 2 ? `Alternate days${at}` : `Every ${n} days${at}`;
    }
    case REMINDER_PATTERN.WEEKLY: {
      const days = [...new Set((rule?.weekdays || []).map(Number))]
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .sort((a, b) => a - b);
      if (days.length === 7) return `Every day${at}`;
      if (days.join() === '1,2,3,4,5') return `Every weekday${at}`;
      return `Every ${days.map((d) => WEEKDAYS[d]).join(', ') || 'week'}${at}`;
    }
    case REMINDER_PATTERN.MONTHLY: {
      if (rule?.monthlyMode === MONTHLY_MODE.WEEKDAY && Number.isInteger(Number(rule?.weekday))) {
        const nth = NTH_WEEK_LABELS[String(rule.nthWeek ?? 1)] || 'First';
        return `Monthly on the ${nth.toLowerCase()} ${WEEKDAY_NAMES[Number(rule.weekday)]}${at}`;
      }
      return `Monthly on the ${ordinal(Number(rule?.monthDay) || 1)}${at}`;
    }
    default: {
      const mins = repeatEveryMinutes(rule);
      let every = `Every ${mins} minutes`;
      if (mins % 60 === 0) every = mins === 60 ? 'Every hour' : `Every ${mins / 60} hours`;
      const w = reminderWindow(rule);
      const custom = w.from !== DEFAULT_REMIND_WINDOW.from || w.to !== DEFAULT_REMIND_WINDOW.to;
      return custom ? `${every}, ${time12(w.from)} – ${time12(w.to)}` : every;
    }
  }
}

/** "1 day before", "4 hours after", "Every 2 hours until done". */
function reminderLabel(rule) {
  if (rule?.when === REMINDER_WHEN.EVERY) {
    const text = repeatingReminderText(rule);
    return `${text}${text.includes(' – ') ? ',' : ''} until done`;
  }
  const n = Math.abs(Number(rule?.amount) || 0);
  const unit = String(rule?.unit || 'MINUTES').toLowerCase().replace(/s$/, '');
  return `${n} ${unit}${n === 1 ? '' : 's'} ${rule?.when === REMINDER_WHEN.AFTER ? 'after' : 'before'}`;
}

// ---------------------------------------------------------------- files & feed

const EVIDENCE_KINDS = ['document', 'image', 'video', 'audio', 'other'];

function evidenceKindFor(mimeType = '', name = '') {
  const m = String(mimeType).toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf' || /officedocument|ms-excel|msword/.test(m)) return 'document';
  if (/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name)) return 'image';
  if (/\.(mp4|mov|webm|mkv)$/i.test(name)) return 'video';
  if (/\.(mp3|m4a|wav|amr|ogg)$/i.test(name)) return 'audio';
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/i.test(name)) return 'document';
  return 'other';
}

/** One row of a task's history. A status move and a remark are the same row. */
const UPDATE_KINDS = [
  'CREATED', 'STATUS', 'COMMENT', 'EDITED', 'ASSIGNED', 'REMINDER',
  'ACCEPTED', 'REJECTED', 'DELEGATED', 'SUBTASK',
  'SUBMITTED', 'APPROVED', 'SENT_BACK', 'PROGRESS', 'SPLIT', 'CLAIMED',
  'EXTENSION_ASKED', 'EXTENSION_DECIDED', 'TRANSFERRED', 'NUDGED', 'OVERDUE',
];

module.exports = {
  STATUS,
  TASK_STATUS,
  TERMINAL_STATUS,
  OPEN_STATUS,
  DOING_STATUS,
  LABELS,
  statusLabel,
  BOARD_COLUMNS,
  TRANSITIONS,
  transitionFor,
  effectiveTarget,
  isTerminal,
  isOverdue,
  isInReview,
  normaliseStatus,
  ACCEPTANCE,
  ACCEPTANCE_STATES,
  ACCEPTANCE_LABELS,
  isDeclined,
  isAwaitingAcceptance,
  termsOpen,
  EDIT_FIELD_LABELS,
  NUDGE_COOLDOWN_MIN,
  nudgeReadyAt,
  TASK_PRIORITY,
  DEFAULT_PRIORITY,
  normalisePriority,
  PRIORITY_COLORS,
  DONE_COLOR,
  CANCELLED_COLOR,
  accentFor,
  PRIORITY_RANK,
  MAX_SUBTASKS,
  MAX_SPLIT_DEPTH,
  PROGRESS_STEPS,
  clampProgress,
  EXTENSION_STATUS,
  EXTENSION_STATES,
  SORTS,
  SORT_KEYS,
  DEFAULT_SORT,
  FREQUENCY,
  FREQUENCIES,
  FREQUENCY_LABELS,
  WEEKDAYS,
  WEEKDAY_NAMES,
  MONTHLY_MODE,
  MONTHLY_MODES,
  NTH_WEEKS,
  NTH_WEEK_LABELS,
  MAX_DAY_INTERVAL,
  DEFAULT_LEAD_DAYS,
  MAX_LEAD_DAYS,
  isRoutineFrequency,
  patternLabel,
  time12,
  REMINDER_CHANNEL,
  REMINDER_CHANNELS,
  REMINDER_CHANNEL_LABELS,
  REMINDER_UNIT,
  REMINDER_UNITS,
  UNIT_MINUTES,
  REMINDER_WHEN,
  REMINDER_WHENS,
  REPEAT_REMINDER,
  REMINDER_PATTERN,
  REMINDER_PATTERNS,
  REMINDER_PATTERN_LABELS,
  DEFAULT_REMIND_AT,
  DEFAULT_REMIND_WINDOW,
  MAX_REMIND_EVERY_HOURS,
  reminderPattern,
  hhmmOf,
  reminderWindow,
  repeatingReminderText,
  reminderOffsetMinutes,
  repeatEveryMinutes,
  reminderKey,
  reminderLabel,
  EVIDENCE_KINDS,
  evidenceKindFor,
  UPDATE_KINDS,
  idOf,
};
