/**
 * The task vocabulary, for the app: PRESENTATION ONLY. The server decides
 * what a status is, which moves are legal and who may make them, and says
 * which buttons to draw (the `can` block on every row and on the detail
 * response). What lives here is colour, wording and date phrasing, ported
 * from the HRMS Tasks app (utils/taskStatus) without points.
 *
 * Words are produced by functions at render time (tr() inside), so a
 * language switch redraws them.
 */
import { tr } from '../i18n';
import { colors, theme } from '../platform/theme';

export const STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const TERMINAL = [STATUS.COMPLETED, STATUS.CANCELLED];
export const isTerminal = (status) => TERMINAL.includes(status);

export function statusLabel(status) {
  switch (status) {
    case STATUS.PENDING:
      return tr('Pending');
    case STATUS.IN_PROGRESS:
      return tr('In progress');
    case STATUS.SUBMITTED:
      return tr('In review');
    case STATUS.COMPLETED:
      return tr('Completed');
    case STATUS.CANCELLED:
      return tr('Cancelled');
    default:
      return status || '';
  }
}

// ===== Acceptance: a second axis, not a fifth status =====

export const ACCEPTANCE = { AWAITING: 'AWAITING', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED' };

export function acceptanceLabel(a) {
  if (a === ACCEPTANCE.AWAITING) return tr('Not yet accepted');
  if (a === ACCEPTANCE.ACCEPTED) return tr('Accepted');
  if (a === ACCEPTANCE.REJECTED) return tr('Declined');
  return '';
}

export const DECLINED_COLORS = { bg: colors.dangerSoft, fg: colors.danger };
export const AWAITING_COLORS = { bg: colors.warningSoft, fg: colors.warning };
/** In review: violet, the one hue no status or priority already owns. */
export const REVIEW_COLORS = theme.dark ? { bg: '#2e1f5e', fg: '#c4b5fd' } : { bg: '#ede9fe', fg: '#6d28d9' };

/** The colours a status chip is drawn in. Red is reserved for overdue. */
export function statusColors(status, overdue = false) {
  if (overdue) return { bg: colors.dangerSoft, fg: colors.danger };
  switch (status) {
    case STATUS.IN_PROGRESS:
      return { bg: colors.infoSoft, fg: colors.info };
    case STATUS.SUBMITTED:
      return REVIEW_COLORS;
    case STATUS.COMPLETED:
      return { bg: colors.successSoft, fg: colors.success };
    case STATUS.CANCELLED:
      return { bg: colors.muted, fg: colors.textFaint };
    case 'DECLINED':
      return DECLINED_COLORS;
    default:
      return { bg: colors.warningSoft, fg: colors.warning };
  }
}

// ===== Priority: three levels, and they colour the whole card =====

export const TASK_PRIORITY = ['Urgent', 'Medium', 'Low'];
export const DEFAULT_PRIORITY = 'Medium';

const LEGACY_PRIORITY = {
  High: 'Urgent', HIGH: 'Urgent', Critical: 'Urgent', Highest: 'Urgent', Immediate: 'Urgent',
  Normal: 'Medium', MEDIUM: 'Medium', Moderate: 'Medium',
  Lowest: 'Low', LOW: 'Low', Minor: 'Low',
};

export function normalisePriority(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (TASK_PRIORITY.includes(raw)) return raw;
  if (LEGACY_PRIORITY[raw]) return LEGACY_PRIORITY[raw];
  const title = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (TASK_PRIORITY.includes(title)) return title;
  return LEGACY_PRIORITY[title] || null;
}

export function priorityLabel(p) {
  const key = normalisePriority(p) || DEFAULT_PRIORITY;
  if (key === 'Urgent') return tr('Urgent');
  if (key === 'Low') return tr('Low');
  return tr('Medium');
}

/** A copy of the server's palette, used when a row carries none (and in dark mode, whose tints the server does not send). */
export const PRIORITY_COLORS = theme.dark
  ? {
      Urgent: { ink: '#FDA29B', bg: '#3B1714', border: '#7A271A', solid: '#F04438' },
      Medium: { ink: '#FEC84B', bg: '#3A2A0C', border: '#7A4A06', solid: '#F79009' },
      Low: { ink: '#D0D5DD', bg: '#1F2937', border: '#344054', solid: '#98A2B3' },
    }
  : {
      Urgent: { ink: '#B42318', bg: '#FEF3F2', border: '#FDA29B', solid: '#D92D20' },
      Medium: { ink: '#B54708', bg: '#FFFAEB', border: '#FEC84B', solid: '#F79009' },
      Low: { ink: '#475467', bg: '#F2F4F7', border: '#D0D5DD', solid: '#98A2B3' },
    };
export const DONE_COLOR = theme.dark
  ? { ink: '#6CE9A6', bg: '#0B2E1F', border: '#05603A', solid: '#12B76A' }
  : { ink: '#027A48', bg: '#ECFDF3', border: '#6CE9A6', solid: '#12B76A' };
export const CANCELLED_COLOR = theme.dark
  ? { ink: '#98A2B3', bg: '#1A2230', border: '#2B3546', solid: '#667085' }
  : { ink: '#667085', bg: '#F9FAFB', border: '#EAECF0', solid: '#98A2B3' };

const served = (accent) => Boolean(accent && accent.solid && accent.bg && accent.border && accent.ink);

function fallbackKey(task) {
  if (task?.status === STATUS.COMPLETED) return 'DONE';
  if (task?.status === STATUS.CANCELLED) return 'CANCELLED';
  return normalisePriority(task?.priority) || DEFAULT_PRIORITY;
}

export function priorityColor(priority) {
  const key = normalisePriority(priority) || DEFAULT_PRIORITY;
  return { key, ...(PRIORITY_COLORS[key] || PRIORITY_COLORS[DEFAULT_PRIORITY]) };
}

/** THE colour rule for every card: completed → green · cancelled → grey and faded · otherwise the priority. */
export function accentFor(task) {
  // The server's tints are made for a light surface; dark mode uses its own.
  const raw = served(task?.accent) && !theme.dark
    ? { key: task.accent.key || fallbackKey(task), ...task.accent }
    : (() => {
        const key = fallbackKey(task);
        if (key === 'DONE') return { key, ...DONE_COLOR };
        if (key === 'CANCELLED') return { key, ...CANCELLED_COLOR };
        return priorityColor(task?.priority);
      })();
  return { ...raw, faded: raw.key === 'CANCELLED' };
}

// ===== Progress =====

export const PROGRESS_STEPS = [0, 25, 50, 75, 100];
export const clampProgress = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

// ===== Sorting =====

export const SORT_KEYS = ['due', 'assigned', 'pending', 'priority'];
export const SORT_DIR = { due: 'desc', assigned: 'desc', pending: 'asc', priority: 'asc' };

export function sortLabel(key) {
  return (
    {
      due: tr('Due date'),
      assigned: tr('Day assigned'),
      pending: tr('Pending days'),
      priority: tr('Priority'),
    }[key] || tr('Due date')
  );
}

export function dirLabel(key, dir) {
  const words = {
    due: [tr('Earliest first'), tr('Latest first')],
    assigned: [tr('Oldest first'), tr('Newest first')],
    pending: [tr('Waiting longest first'), tr('Newest first')],
    priority: [tr('Urgent first'), tr('Low first')],
  }[key] || [tr('First to last'), tr('Last to first')];
  return words[dir === 'desc' ? 1 : 0];
}

// ===== Recurrence =====

export const RECUR_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

export function frequencyLabel(f) {
  return (
    {
      ONCE: tr('One time'),
      DAILY: tr('Daily'),
      WEEKLY: tr('Weekly'),
      MONTHLY: tr('Monthly'),
      YEARLY: tr('Yearly'),
    }[f] || tr('One time')
  );
}

export const WEEKDAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekdayName = (i) => tr(WEEKDAY_KEYS[i] || '');
export const weekdayShort = (i) => tr(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i] || '');
/** One letter per day for the day buttons (the first letter of the short name). */
export const weekdayLetter = (i) => Array.from(weekdayShort(i))[0] || '';

export const MONTH_KEYS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m) => tr(MONTH_KEYS[(Number(m) || 1) - 1] || '');
export const monthShort = (m) => tr(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(Number(m) || 1) - 1] || '');

export const NTH_WEEK_KEYS = [1, 2, 3, 4, -1];
export function nthLabel(n) {
  return { 1: tr('First'), 2: tr('Second'), 3: tr('Third'), 4: tr('Fourth'), '-1': tr('Last') }[String(n)] || tr('First');
}

/** How early each shape appears in the doer's list (the server's defaults). */
export const DEFAULT_LEAD_DAYS = { DAILY: 0, WEEKLY: 0, MONTHLY: 2, YEARLY: 2 };

const pad2 = (n) => String(n).padStart(2, '0');

/** "18:00" → "6:00 PM". */
export function time12(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map((n) => parseInt(n, 10));
  if (!Number.isFinite(h)) return '';
  return `${((h + 11) % 12) + 1}:${pad2(Number.isFinite(m) ? m : 0)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "1st", "2nd"… (digits read the same in every language this app speaks). */
export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** A schedule in one line: the same words as the server's patternLabel. */
export function patternLabel(s = {}) {
  const at = s.time ? ` · ${time12(s.time)}` : '';
  switch (s.frequency) {
    case 'DAILY': {
      const n = Math.max(1, Number(s.interval) || 1);
      if (n === 1) return tr('Every day') + at;
      if (n === 2) return tr('Alternate days') + at;
      return tr('Every {n} days', { n }) + at;
    }
    case 'WEEKLY': {
      const days = (s.weekdays || []).slice().sort((a, b) => a - b).map(weekdayShort).filter(Boolean);
      if (days.length === 7) return tr('Every day of the week') + at;
      return (days.length ? tr('Weekly on {days}', { days: days.join(', ') }) : tr('Weekly')) + at;
    }
    case 'MONTHLY': {
      if (s.monthlyMode === 'WEEKDAY' && Number.isInteger(Number(s.weekday))) {
        return tr('Monthly on the {nth} {day}', { nth: nthLabel(s.nthWeek ?? 1), day: weekdayName(Number(s.weekday)) }) + at;
      }
      return tr('Monthly on the {date}', { date: ordinal(Number(s.monthDay) || 1) }) + at;
    }
    case 'YEARLY':
      return tr('Yearly on {day} {month}', { day: Number(s.monthDay) || 1, month: monthName(s.month) }) + at;
    default:
      return frequencyLabel(s.frequency);
  }
}

export function repeatLabel(repeat) {
  if (!repeat || !repeat.frequency || repeat.frequency === 'ONCE') return '';
  return patternLabel({ ...repeat, time: undefined });
}

// ===== Swiping a card =====

/**
 * What a swipe does on THIS card, for THIS person:
 *   not accepted   right → Accept      left → Reject
 *   in progress    right → Complete    left → Ask for more time
 *   in review      right → Complete    left → Send it back
 * …plus a routine (daily) task, whose only move is Done. Read off `can`.
 */
export function swipeActionsFor(task) {
  const can = task?.can || {};
  const status = task?.status;
  const tone = {
    success: { fill: colors.successFill, ink: '#fff' },
    danger: { fill: colors.dangerFill, ink: '#fff' },
    warning: { fill: colors.warningFill, ink: '#fff' },
  };
  if (can.canApprove) {
    return {
      right: { key: 'approve', label: tr('Complete'), icon: 'approve', ...tone.success },
      left: can.canReject ? { key: 'sendBack', label: tr('Send back'), icon: 'sendBack', ...tone.danger } : null,
    };
  }
  if (can.canDone) return { right: { key: 'done', label: tr('Done'), icon: 'approve', ...tone.success }, left: null };
  if (can.canAccept && status === STATUS.PENDING) {
    return {
      right: { key: 'accept', label: tr('Accept'), icon: 'accept', ...tone.success },
      left: can.canDecline ? { key: 'decline', label: tr('Reject'), icon: 'decline', ...tone.danger } : null,
    };
  }
  const canComplete = (can.transitions || []).some((t) => t.to === STATUS.COMPLETED);
  if (status === STATUS.IN_PROGRESS && (can.canSubmit || canComplete) && (can.myAcceptance || can.canSubmit)) {
    return {
      right: can.canSubmit
        ? { key: 'submit', label: tr('Complete'), icon: 'complete', ...tone.success }
        : { key: 'complete', label: tr('Complete'), icon: 'complete', ...tone.success },
      left: can.canRequestExtension ? { key: 'extension', label: tr('More time'), icon: 'extension', ...tone.warning } : null,
    };
  }
  return { right: null, left: null };
}

// ===== The reminder bell =====

export function nudgeState(task, override = null, now = Date.now()) {
  const can = task?.can || {};
  if (!can.canNudge) return { can: false };
  const servedAt = can.nudgeReadyAt || task.nudgeReadyAt || null;
  const readyAt = [servedAt, override]
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .reduce((a, b) => Math.max(a, b), 0);
  const waitMs = readyAt > now ? readyAt - now : 0;
  return {
    can: true,
    to: can.nudgeTo || 'doers',
    readyAt: waitMs ? new Date(readyAt) : null,
    waitMin: waitMs ? Math.ceil(waitMs / 60000) : 0,
  };
}

// ===== Reminders =====

export const REMINDER_PATTERNS = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY'];
export function reminderPatternLabel(p) {
  return { HOURLY: tr('Hourly'), DAILY: tr('Daily'), WEEKLY: tr('Weekly'), MONTHLY: tr('Monthly') }[p] || p;
}
export const DEFAULT_REMIND_AT = '10:00';
export const DEFAULT_REMIND_WINDOW = { from: '09:00', to: '21:00' };
export const MAX_REMIND_EVERY_HOURS = 12;

export function reminderPattern(rule) {
  if (REMINDER_PATTERNS.includes(rule?.pattern)) return rule.pattern;
  return rule?.unit === 'DAYS' ? 'DAILY' : 'HOURLY';
}

export function reminderWindow(rule) {
  const ok = (v) => /^\d{2}:\d{2}$/.test(String(v || ''));
  return ok(rule?.from) && ok(rule?.to) && rule.from < rule.to ? { from: rule.from, to: rule.to } : { ...DEFAULT_REMIND_WINDOW };
}

export function repeatEveryMinutes(rule) {
  const n = Math.abs(Number(rule?.amount) || 0);
  const per = rule?.unit === 'MINUTES' ? 1 : rule?.unit === 'DAYS' ? 1440 : 60;
  return Math.max(30, n * per);
}

export function repeatingReminderText(rule) {
  const at = time12(rule?.at || DEFAULT_REMIND_AT);
  switch (reminderPattern(rule)) {
    case 'DAILY': {
      const n = Math.max(1, Math.round(Number(rule?.amount) || 1));
      if (n === 1) return tr('Every day at {time}', { time: at });
      return n === 2 ? tr('Alternate days at {time}', { time: at }) : tr('Every {n} days at {time}', { n, time: at });
    }
    case 'WEEKLY': {
      const days = [...new Set((rule?.weekdays || []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
      if (days.length === 7) return tr('Every day at {time}', { time: at });
      if (days.join() === '1,2,3,4,5') return tr('Every weekday at {time}', { time: at });
      return tr('Every {days} at {time}', { days: days.map(weekdayShort).join(', ') || tr('week'), time: at });
    }
    case 'MONTHLY': {
      if (rule?.monthlyMode === 'WEEKDAY' && Number.isInteger(Number(rule?.weekday))) {
        return tr('Monthly on the {nth} {day} at {time}', { nth: nthLabel(rule.nthWeek ?? 1), day: weekdayName(Number(rule.weekday)), time: at });
      }
      return tr('Monthly on the {date} at {time}', { date: ordinal(Number(rule?.monthDay) || 1), time: at });
    }
    default: {
      const mins = repeatEveryMinutes(rule);
      let every = tr('Every {n} minutes', { n: mins });
      if (mins % 60 === 0) every = mins === 60 ? tr('Every hour') : tr('Every {n} hours', { n: mins / 60 });
      const w = reminderWindow(rule);
      const custom = w.from !== DEFAULT_REMIND_WINDOW.from || w.to !== DEFAULT_REMIND_WINDOW.to;
      return custom ? `${every}, ${time12(w.from)} – ${time12(w.to)}` : every;
    }
  }
}

/** "1 day before", "4 hours after", "Every 2 hours until done". */
export function reminderLabel(rule) {
  if (!rule) return '';
  if (rule.when === 'EVERY') return tr('{rhythm}, until done', { rhythm: repeatingReminderText(rule) });
  const n = Math.abs(Number(rule.amount) || 0);
  const unit = String(rule.unit || 'MINUTES').toUpperCase();
  const after = rule.when === 'AFTER';
  const key = `${unit}:${after ? 'after' : 'before'}`;
  const words = {
    'MINUTES:before': tr('{n} min before', { n }),
    'MINUTES:after': tr('{n} min after', { n }),
    'HOURS:before': n === 1 ? tr('1 hour before') : tr('{n} hours before', { n }),
    'HOURS:after': n === 1 ? tr('1 hour after') : tr('{n} hours after', { n }),
    'DAYS:before': n === 1 ? tr('1 day before') : tr('{n} days before', { n }),
    'DAYS:after': n === 1 ? tr('1 day after') : tr('{n} days after', { n }),
  };
  return words[key] || tr('{n} min before', { n });
}

// ===== Dates =====

const MS_DAY = 86400000;
const monthShortOf = (d) => monthShort(d.getMonth() + 1);

/** "9:30 AM" in the phone's own time. */
export function clockOf(d) {
  const when = new Date(d);
  if (Number.isNaN(when.getTime())) return '';
  const h = when.getHours();
  return `${h % 12 || 12}:${pad2(when.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "23 Sep 2026, 6:00 PM": the full deadline, for a detail line. */
export function fullWhen(d) {
  if (!d) return '—';
  const when = new Date(d);
  if (Number.isNaN(when.getTime())) return '—';
  return `${when.getDate()} ${monthShortOf(when)} ${when.getFullYear()}, ${clockOf(when)}`;
}

/** "24 Sep" (the year when it is not this one): the day a task was assigned. */
export function dayLabel(when) {
  if (!when) return '';
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${monthShortOf(d)}${year}`;
}

/** How the deadline reads on a card, and its tone ('overdue' | 'today' | 'soon' | 'none'). */
export function dueLabel(dueDate, status) {
  if (!dueDate) return { text: tr('No deadline'), tone: 'none' };
  const due = new Date(dueDate);
  const now = new Date();
  const done = TERMINAL.includes(status);
  const waiting = status === STATUS.SUBMITTED;
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(due) - startOf(now)) / MS_DAY);
  const at = clockOf(due);

  if (!done && !waiting && due < now) {
    const late = Math.floor((now - due) / MS_DAY);
    if (late >= 1) return { text: late === 1 ? tr('1 day overdue') : tr('{n} days overdue', { n: late }), tone: 'overdue' };
    return { text: tr('Overdue · {time}', { time: at }), tone: 'overdue' };
  }
  if (days === 0) return { text: tr('Today, {time}', { time: at }), tone: done ? 'none' : 'today' };
  if (days === 1) return { text: tr('Tomorrow, {time}', { time: at }), tone: done ? 'none' : 'soon' };
  if (days === -1) return { text: tr('Yesterday, {time}', { time: at }), tone: 'none' };
  if (days > 1 && days <= 6) return { text: `${weekdayName(due.getDay())}, ${at}`, tone: done ? 'none' : 'soon' };
  const withYear = due.getFullYear() !== now.getFullYear();
  return { text: `${due.getDate()} ${monthShortOf(due)}${withYear ? ` ${due.getFullYear()}` : ''}, ${at}`, tone: 'none' };
}

export function dueColor(tone) {
  if (tone === 'overdue') return colors.danger;
  if (tone === 'today') return colors.warning;
  return colors.textSecondary;
}

export function timeAgo(when) {
  if (!when) return '';
  const secs = Math.floor((Date.now() - new Date(when).getTime()) / 1000);
  if (secs < 60) return tr('just now');
  const mins = Math.floor(secs / 60);
  if (mins < 60) return tr('{n} min ago', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tr('{n}h ago', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return tr('{n}d ago', { n: days });
  return dayLabel(when);
}

/** A recording's length. */
export function duration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

// ===== Lists and figures =====

export const RANGE_KEYS = ['all', 'today', 'week', 'month', 'nextWeek', 'custom'];
export function rangeLabel(key) {
  return (
    {
      all: tr('All time'),
      today: tr('Today'),
      week: tr('This week'),
      month: tr('This month'),
      nextWeek: tr('Next week'),
      custom: tr('Custom'),
    }[key] || key
  );
}

/** The figure tiles on the Tasks screen, in order. */
export const GRID_TILES = [
  { key: 'total', icon: 'layers', tint: '#2a78d6' },
  { key: 'pending', icon: 'hourglass', tint: '#DC6803' },
  { key: 'overdue', icon: 'alert', tint: '#D92D20' },
  { key: 'inProgress', icon: 'play', tint: '#0086C9' },
  { key: 'inReview', icon: 'eye', tint: '#7C3AED' },
  { key: 'moreTime', icon: 'clock', tint: '#B54708' },
];
export const COMPLETED_TINT = '#079455';

export function tileLabel(key) {
  return (
    {
      total: tr('Total'),
      pending: tr('Not Accepted Yet'),
      overdue: tr('Overdue'),
      inProgress: tr('In Progress'),
      inReview: tr('Under Review'),
      completed: tr('Completed'),
      moreTime: tr('More Time Asked'),
    }[key] || key
  );
}

/** What tapping each figure asks the server for: exactly the rows that figure counted. */
export const TILE_QUERY = {
  total: { status: [STATUS.PENDING, STATUS.IN_PROGRESS, STATUS.SUBMITTED].join(',') },
  overdue: { overdue: 'true' },
  pending: { status: STATUS.PENDING, overdue: 'false' },
  inProgress: { status: STATUS.IN_PROGRESS, overdue: 'false' },
  inReview: { status: STATUS.SUBMITTED },
  completed: { status: STATUS.COMPLETED },
  moreTime: { moreTime: '1' },
};

export function openCount(c = {}) {
  return Math.max(0, (Number(c.total) || 0) - (Number(c.completed) || 0) - (Number(c.cancelled) || 0));
}

export function statValue(counters = {}, key) {
  if (key === 'total') return openCount(counters);
  return Number(counters[key]) || 0;
}

export function extensionLook(status) {
  if (status === 'PENDING') return { label: tr('More time: Pending'), tone: 'warning' };
  if (status === 'APPROVED') return { label: tr('More time: Approved'), tone: 'success' };
  if (status === 'DECLINED') return { label: tr('More time: Declined'), tone: 'danger' };
  return null;
}

/**
 * THE STATUS BUTTON ON EVERY CARD: what this person may do to this task, read
 * from the server's `can` only, in a fixed order.
 */
export function statusActions(task) {
  const can = task?.can || {};
  const out = [];
  if (can.canClaim) out.push({ key: 'claim', label: tr('Pick it up'), hint: tr('Nobody is on this piece yet — make it yours'), tone: 'info', icon: 'claim' });
  if (can.canApprove) out.push({ key: 'approve', label: tr('Approve'), hint: tr('Sign off the work — it is completed'), tone: 'success', icon: 'approve' });
  else if (can.canAccept) out.push({ key: 'accept', label: tr('Accept'), hint: tr('Accept it and start working on it'), tone: 'success', icon: 'accept' });
  if (can.canReject) out.push({ key: 'sendBack', label: tr('Send back'), hint: tr('Send it back with what still needs doing'), tone: 'danger', icon: 'sendBack' });
  else if (can.canDecline) out.push({ key: 'decline', label: tr('Decline'), hint: tr('Turn it down — say why'), tone: 'danger', icon: 'decline' });
  if (can.canDelegate || can.canSplit) out.push({ key: 'delegate', label: tr('Delegate'), hint: tr('Hand it to someone — you review their work'), tone: 'primary', icon: 'delegate' });
  if (can.canTransfer) out.push({ key: 'transfer', label: tr('Transfer'), hint: tr('It went to the wrong person — move it fully'), tone: 'neutral', icon: 'transfer' });
  if (can.canSubmit) out.push({ key: 'submit', label: tr('Send for review'), hint: tr('Hand it in for the assigner to check'), tone: 'review', icon: 'submit' });
  if (can.canDone) out.push({ key: 'done', label: tr('Mark done'), hint: tr('Today’s routine is finished'), tone: 'success', icon: 'approve' });
  if (can.canRequestExtension) out.push({ key: 'extension', label: tr('Ask for more time'), hint: tr('Ask for a later deadline'), tone: 'warning', icon: 'extension' });
  const canComplete = (can.transitions || []).some((t) => t.to === STATUS.COMPLETED);
  if (canComplete && !can.canApprove && !can.canDone) out.push({ key: 'complete', label: tr('Mark completed'), hint: tr('Mark it done'), tone: 'success', icon: 'complete' });
  return out;
}

/** What the status button itself says, from this reader's side. */
export function statusBadge(task) {
  if (!task) return { label: '', status: STATUS.PENDING };
  if (task.declined) return { label: tr('Declined'), status: 'DECLINED' };
  if (task.status === STATUS.SUBMITTED && task.can?.canApprove) return { label: tr('Needs your review'), status: STATUS.SUBMITTED };
  if (task.status === STATUS.PENDING && task.awaitingAcceptance) return { label: tr('Awaiting acceptance'), status: STATUS.PENDING };
  if (task.routine && task.status === STATUS.IN_PROGRESS) return { label: tr('To do'), status: STATUS.PENDING };
  return { label: statusLabel(task.status), status: task.status };
}

/** Open and past its deadline. Handed in is not overdue. */
export const isOverdue = (task) => {
  if (!task?.dueDate || isTerminal(task.status)) return false;
  if (task.status === STATUS.SUBMITTED) return false;
  return new Date(task.dueDate) < new Date();
};

/** A person's name from any of the shapes a task response carries. */
export const personName = (p) =>
  (typeof p === 'string' ? p : p?.name || [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim()) || '';

/** The id of a person or a populated ref. */
export const idOf = (p) => String(p?._id || p?.id || p || '');

export function assigneeNames(assignees = [], max = 2) {
  const names = assignees.map((a) => a.name || personName(a.user)).filter(Boolean);
  if (!names.length) return '—';
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}
