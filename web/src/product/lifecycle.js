/**
 * The task vocabulary, mirrored for the browser — ported from the HRMS
 * `utils/taskLifecycle.js` (points, requests and translation removed).
 *
 * PRESENTATION ONLY. The server decides what a status is, which moves are
 * legal and who may make them, and says which buttons to draw (`can` on every
 * row). What lives here is colour, wording and date phrasing.
 */
import { dayKey, formatDate, formatTime } from '../platform/format';

// ===== States =====

export const STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const TASK_STATUS = Object.values(STATUS);
export const TERMINAL = [STATUS.COMPLETED, STATUS.CANCELLED];
export const OPEN_STATUSES = [STATUS.PENDING, STATUS.IN_PROGRESS, STATUS.SUBMITTED];

const LABELS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'In review',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const statusLabel = (status) => LABELS[status] || status || '';

export const BOARD_COLUMNS = [
  { key: STATUS.PENDING, label: 'To do' },
  { key: STATUS.IN_PROGRESS, label: 'In progress' },
  { key: STATUS.SUBMITTED, label: 'Review' },
  { key: STATUS.COMPLETED, label: 'Done' },
];

/*
 * COLOUR. The row is tinted by PRIORITY (green once completed, grey and faded
 * once cancelled) from the server's palette (`task.accent`). The STATUS keeps
 * its own chip. OVERDUE is neither: a SOLID red chip, the only solid red.
 */
export const STATUS_STYLES = {
  PENDING: 'bg-amber-50 text-amber-700 border border-amber-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border border-blue-200',
  SUBMITTED: 'bg-violet-50 text-violet-700 border border-violet-200',
  COMPLETED: 'bg-green-50 text-green-700 border border-green-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border border-slate-200',
  DECLINED: 'bg-red-50 text-red-700 border border-red-200',
};

export const STATUS_DOT = {
  PENDING: 'bg-amber-500',
  IN_PROGRESS: 'bg-sky-500',
  SUBMITTED: 'bg-violet-500',
  COMPLETED: 'bg-green-500',
  CANCELLED: 'bg-slate-400',
  DECLINED: 'bg-red-500',
};

export const OVERDUE_STYLE = 'bg-red-600 text-white border border-red-600';

export const statusStyle = (status, overdue = false) => (overdue ? OVERDUE_STYLE : STATUS_STYLES[status]) || STATUS_STYLES.PENDING;

// ===== Priority =====

export const TASK_PRIORITY = ['Urgent', 'Medium', 'Low'];
export const DEFAULT_PRIORITY = 'Medium';

const LEGACY_PRIORITY = {
  High: 'Urgent', HIGH: 'Urgent', Critical: 'Urgent', Highest: 'Urgent', Immediate: 'Urgent', high: 'Urgent',
  Normal: 'Medium', MEDIUM: 'Medium', Moderate: 'Medium', normal: 'Medium',
  Lowest: 'Low', LOW: 'Low', Minor: 'Low', low: 'Low',
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

/*
 * The colours themselves are CSS variables (src/index.css, --tp-<key>-*), one
 * set per theme, so a row repaints the moment the look changes; nothing here
 * needs to know which look is on. The server sends the light palette too
 * (`/meta`, `task.accent`): setServedPalette writes it over the light set, so
 * the server's palette still wins there.
 */
const VAR_OF = { Urgent: 'urgent', Medium: 'medium', Low: 'low', DONE: 'done', CANCELLED: 'cancelled' };
const tokens = (key) => {
  const name = VAR_OF[key] || VAR_OF[DEFAULT_PRIORITY];
  return {
    ink: `var(--tp-${name}-ink)`,
    bg: `var(--tp-${name}-bg)`,
    border: `var(--tp-${name}-border)`,
    solid: `var(--tp-${name}-solid)`,
  };
};

/** Called once `/meta` lands: the server's light palette, written over the defaults. */
export function setServedPalette(meta) {
  if (!meta || typeof document === 'undefined') return;
  const sets = { ...(meta.priorityColors || {}), DONE: meta.doneColor, CANCELLED: meta.cancelledColor };
  const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : null);
  const lines = [];
  for (const [key, c] of Object.entries(sets)) {
    const name = VAR_OF[key];
    if (!name || !c) continue;
    for (const part of ['ink', 'bg', 'border', 'solid']) {
      if (hex(c[part])) lines.push(`--tp-${name}-${part}:${c[part]};`);
    }
  }
  if (!lines.length) return;
  let el = document.getElementById('tp-served-palette');
  if (!el) {
    el = document.createElement('style');
    el.id = 'tp-served-palette';
    document.head.appendChild(el);
  }
  // `:root` only: html.dark (more specific) keeps the dark set.
  el.textContent = `:root{${lines.join('')}}`;
}

export function priorityColor(priority) {
  const key = normalisePriority(priority) || DEFAULT_PRIORITY;
  return { key, ...tokens(key) };
}

function fallbackKey(task) {
  if (task?.status === STATUS.COMPLETED) return 'DONE';
  if (task?.status === STATUS.CANCELLED) return 'CANCELLED';
  return normalisePriority(task?.priority) || DEFAULT_PRIORITY;
}

/** `{ key, ink, bg, border, solid }` for one task. */
export function accentFor(task) {
  const served = task?.accent?.key;
  const key = served && VAR_OF[served] ? served : fallbackKey(task);
  return { key, ...tokens(key) };
}

/** The tinted row/card: priority wash, a coloured rail on the left. */
export function accentStyle(task, { rail = 4 } = {}) {
  const a = accentFor(task);
  return {
    backgroundColor: a.bg,
    borderStyle: 'solid',
    borderWidth: `1px 1px 1px ${rail}px`,
    borderColor: `${a.border} ${a.border} ${a.border} ${a.solid}`,
    ...(a.key === 'CANCELLED' ? { opacity: 0.65 } : null),
  };
}

/**
 * A chip in a priority's colours. Its fill is a step stronger than the wash
 * (the HRMS lays an 18% chip on a 12% card), so on a row or header tinted the
 * same colour it still reads as a chip, not just an outline.
 */
export function tintStyle(colour) {
  if (!colour) return {};
  return { backgroundColor: `color-mix(in srgb, ${colour.solid} 12%, ${colour.bg})`, borderColor: colour.border, color: colour.ink };
}

// ===== Progress =====

export const PROGRESS_STEPS = [0, 25, 50, 75, 100];

export const clampProgress = (value) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
};

// ===== Recurrence =====

export const FREQUENCIES = ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
export const FREQUENCY_LABELS = { ONCE: 'One time', DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' };
export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const RECUR_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
export const NTH_WEEKS = [
  { key: 1, label: 'First' }, { key: 2, label: 'Second' }, { key: 3, label: 'Third' },
  { key: 4, label: 'Fourth' }, { key: -1, label: 'Last' },
];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DEFAULT_LEAD_DAYS = { DAILY: 0, WEEKLY: 0, MONTHLY: 2, YEARLY: 2 };
export const MAX_LEAD_DAYS = 14;

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** "18:00" → "6:00 PM". */
export function time12(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map((n) => parseInt(n, 10));
  if (!Number.isFinite(h)) return '';
  return `${((h + 11) % 12) + 1}:${String(Number.isFinite(m) ? m : 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A schedule in one line — the same words as the server's patternLabel. */
export function patternLabel(s = {}) {
  const at = s.time ? ` · ${time12(s.time)}` : '';
  const short = (d) => WEEKDAY_NAMES[d]?.slice(0, 3);
  switch (s.frequency) {
    case 'DAILY': {
      const n = Math.max(1, Number(s.interval) || 1);
      if (n === 1) return `Every day${at}`;
      if (n === 2) return `Alternate days${at}`;
      return `Every ${n} days${at}`;
    }
    case 'WEEKLY': {
      const days = (s.weekdays || []).slice().sort((a, b) => a - b).map(short).filter(Boolean);
      if (days.length === 7) return `Every day of the week${at}`;
      return `Weekly${days.length ? ` on ${days.join(', ')}` : ''}${at}`;
    }
    case 'MONTHLY': {
      if (s.monthlyMode === 'WEEKDAY' && Number.isInteger(Number(s.weekday))) {
        const nth = (NTH_WEEKS.find((n) => n.key === Number(s.nthWeek ?? 1)) || NTH_WEEKS[0]).label;
        return `Monthly on the ${nth.toLowerCase()} ${WEEKDAY_NAMES[Number(s.weekday)]}${at}`;
      }
      return `Monthly on the ${ordinal(Number(s.monthDay) || 1)}${at}`;
    }
    case 'YEARLY':
      return `Yearly on ${Number(s.monthDay) || 1} ${MONTH_NAMES[(Number(s.month) || 1) - 1] || ''}${at}`;
    default:
      return FREQUENCY_LABELS[s.frequency] || 'One time';
  }
}

export function repeatLabel(repeat) {
  if (!repeat || !repeat.frequency || repeat.frequency === 'ONCE') return '';
  return patternLabel({ ...repeat, time: undefined });
}

// ===== Swiping a row (touch screens) =====

/**
 *   not accepted   right → Accept          left → Reject
 *   in progress    right → Complete        left → Ask for more time
 *   in review      right → Complete        left → Send it back
 * …plus a routine (daily) task, whose only move is Done. Read off `can`.
 *
 * A TASK I SET THAT NOBODY HAS TAKEN ON YET swipes right to Edit (the HRMS
 * rule): `can.canEdit` is the server's "the terms are still open", so the
 * swipe goes the moment somebody accepts. Nothing swipes once a task is
 * finished (as in the app).
 */
export function swipeActionsFor(task) {
  if (!task || TERMINAL.includes(task.status)) return { right: null, left: null };
  const pair = pairedSwipes(task);
  const can = task.can || {};
  if (!pair.right && can.canEdit && !can.canAccept) {
    return { ...pair, right: { key: 'edit', label: 'Edit', icon: 'edit', tone: 'blue' } };
  }
  return pair;
}

/** The three pairs, without the Edit above. */
function pairedSwipes(task) {
  const can = task?.can || {};
  const status = task?.status;
  if (can.canApprove) {
    return {
      right: { key: 'approve', label: 'Complete', icon: 'approve', tone: 'green' },
      left: can.canReject ? { key: 'sendBack', label: 'Send back', icon: 'sendBack', tone: 'red' } : null,
    };
  }
  if (can.canDone) return { right: { key: 'done', label: 'Done', icon: 'approve', tone: 'green' }, left: null };
  if (can.canAccept && status === STATUS.PENDING) {
    return {
      right: { key: 'accept', label: 'Accept', icon: 'accept', tone: 'green' },
      left: can.canDecline ? { key: 'decline', label: 'Reject', icon: 'decline', tone: 'red' } : null,
    };
  }
  const canComplete = (can.transitions || []).some((t) => t.to === STATUS.COMPLETED);
  if (status === STATUS.IN_PROGRESS && (can.canSubmit || canComplete) && can.myAcceptance) {
    return {
      right: { key: can.canSubmit ? 'submit' : 'complete', label: 'Complete', icon: 'complete', tone: 'green' },
      left: can.canRequestExtension ? { key: 'extension', label: 'More time', icon: 'extension', tone: 'amber' } : null,
    };
  }
  return { right: null, left: null };
}

// ===== The reminder bell =====

export function nudgeState(task, override = null, now = Date.now()) {
  const can = task?.can || {};
  if (!can.canNudge) return { can: false };
  const readyAt = [can.nudgeReadyAt || task.nudgeReadyAt, override]
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

export const REMINDER_CHANNELS = [
  { key: 'APP', label: 'App' },
  { key: 'EMAIL', label: 'Email' },
];
export const REMINDER_UNITS = ['MINUTES', 'HOURS', 'DAYS'];
export const UNIT_LABELS = { MINUTES: 'minutes', HOURS: 'hours', DAYS: 'days' };
export const REMINDER_PATTERNS = [
  { key: 'HOURLY', label: 'Hourly' },
  { key: 'DAILY', label: 'Daily' },
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
];
export const DEFAULT_REMIND_AT = '10:00';
export const DEFAULT_REMIND_WINDOW = { from: '09:00', to: '21:00' };
export const MAX_REMIND_EVERY_HOURS = 12;

export function reminderPattern(rule) {
  if (REMINDER_PATTERNS.some((p) => p.key === rule?.pattern)) return rule.pattern;
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
  const at = ` at ${time12(rule?.at || DEFAULT_REMIND_AT)}`;
  switch (reminderPattern(rule)) {
    case 'DAILY': {
      const n = Math.max(1, Math.round(Number(rule?.amount) || 1));
      if (n === 1) return `Every day${at}`;
      return n === 2 ? `Alternate days${at}` : `Every ${n} days${at}`;
    }
    case 'WEEKLY': {
      const days = [...new Set((rule?.weekdays || []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
      if (days.length === 7) return `Every day${at}`;
      if (days.join() === '1,2,3,4,5') return `Every weekday${at}`;
      return `Every ${days.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(', ') || 'week'}${at}`;
    }
    case 'MONTHLY': {
      if (rule?.monthlyMode === 'WEEKDAY' && Number.isInteger(Number(rule?.weekday))) {
        const nth = (NTH_WEEKS.find((n) => n.key === Number(rule.nthWeek ?? 1)) || NTH_WEEKS[0]).label;
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
export function reminderLabel(rule) {
  if (!rule) return '';
  if (rule.when === 'EVERY') {
    const text = repeatingReminderText(rule);
    return `${text}${text.includes(' – ') ? ',' : ''} until done`;
  }
  const n = Math.abs(Number(rule.amount) || 0);
  const unit = String(rule.unit || 'MINUTES').toLowerCase().replace(/s$/, '');
  const when = rule.when === 'AFTER' ? 'after' : 'before';
  return `${n} ${unit}${n === 1 ? '' : 's'} ${when}`;
}

// ===== Dates (in the viewer's Settings time zone) =====

const MS_DAY = 86400000;

/** Whole days between two "YYYY-MM-DD" keys. */
const keyDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / MS_DAY);

/**
 * When it is due, said the way somebody glancing at a row wants it. A
 * SUBMITTED task never reads as overdue (the doer handed it in).
 */
export function dueLabel(dueDate, status, tz) {
  if (!dueDate) return { text: 'No deadline', tone: 'none' };
  const due = new Date(dueDate);
  const now = new Date();
  const settled = TERMINAL.includes(status) || status === STATUS.SUBMITTED;
  const days = keyDiff(dayKey(due, tz), dayKey(now, tz));
  const time = formatTime(due, tz);

  if (!settled && due < now) {
    const lateDays = Math.floor((now - due) / MS_DAY);
    return { text: lateDays >= 1 ? `${lateDays} day${lateDays === 1 ? '' : 's'} overdue` : `Overdue · ${time}`, tone: 'overdue' };
  }
  if (days === 0) return { text: `Today, ${time}`, tone: settled ? 'none' : 'today' };
  if (days === 1) return { text: `Tomorrow, ${time}`, tone: settled ? 'none' : 'soon' };
  if (days === -1) return { text: `Yesterday, ${time}`, tone: 'none' };
  if (days > 1 && days <= 6) {
    const weekday = new Intl.DateTimeFormat('en-IN', { timeZone: tz, weekday: 'long' }).format(due);
    return { text: `${weekday}, ${time}`, tone: settled ? 'none' : 'soon' };
  }
  return { text: `${dayLabel(due, tz)}, ${time}`, tone: 'none' };
}

export const DUE_TONES = {
  overdue: 'text-red-600 font-medium',
  today: 'text-amber-600 font-medium',
  soon: 'text-ink-soft',
  none: 'text-ink-soft',
};

/** "30 Sep" (with the year when it is not this one). */
export function dayLabel(when, tz) {
  if (!when) return '';
  const full = formatDate(when, tz);
  const thisYear = dayKey(new Date(), tz).slice(0, 4);
  return full.endsWith(thisYear) ? full.replace(/\s\d{4}$/, '') : full;
}

/** "30 Sep, 3:45 pm" */
export const dateTimeLabel = (when, tz) => (when ? `${dayLabel(when, tz)}, ${formatTime(when, tz)}` : '');

export function timeAgo(when, tz) {
  if (!when) return '';
  const secs = Math.floor((Date.now() - new Date(when).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(when, tz);
}

/** mm:ss for a recording's length. */
export function duration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ===== The list =====

export const RANGES = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['nextWeek', 'Next week'],
  ['all', 'All time'],
  ['custom', 'Custom'],
];

/** The piles (the API's `scope`). `team` needs an organization I own or admin; `all` is the Super Admin's. */
export const PILES = [
  { key: 'mine', label: 'Assigned to me' },
  { key: 'delegated', label: 'Assigned by me' },
  { key: 'loop', label: 'In the loop' },
  { key: 'team', label: 'Organization tasks', teamOnly: true },
  { key: 'all', label: 'All tasks', adminOnly: true },
];

/**
 * The organization tabs (`/meta` → orgTabs: { key: 'all' | 'general' | <id>,
 * name?, myRole? }) in my saved order (settings.orgTabs): the saved ones that
 * still exist, then All and General, then the other organizations by name —
 * the server's order, worked out here too so a reorder shows at once.
 */
export function orderOrgTabs(tabs = [], saved = []) {
  const byKey = new Map(tabs.map((t) => [String(t.key), t]));
  // By name as the server sorts them (character codes, so 'Zeta' before 'acme'), so web and phone agree.
  const named = tabs.filter((t) => t.name).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((t) => String(t.key));
  return [...new Set([...(saved || []).map(String), 'all', 'general', ...named])].filter((k) => byKey.has(k)).map((k) => byKey.get(k));
}

export const orgTabLabel = (tab) => (tab.key === 'all' ? 'All' : tab.key === 'general' ? 'General' : tab.name || 'Organization');

/**
 * The figures, as the HRMS has them since 2026-09-29: Total (open work) · Not
 * Accepted Yet · Overdue · In Progress · Under Review · More Time Asked on the
 * bar (STAT_BAR_FIGURES), and Completed as the button beside Filter. Each is
 * a filter; the slices come from the server's counters and do not overlap
 * (Overdue wins).
 */
export const STAT_BAR = [
  { key: 'total', label: 'Total', colour: 'rgb(var(--brand))', query: { status: OPEN_STATUSES.join(',') } },
  { key: 'pending', label: 'Not Accepted Yet', colour: 'var(--stat-pending)', query: { status: STATUS.PENDING, overdue: 'false' } },
  { key: 'overdue', label: 'Overdue', colour: 'var(--stat-overdue)', query: { overdue: 'true' } },
  { key: 'inProgress', label: 'In Progress', colour: 'var(--stat-in-progress)', query: { status: STATUS.IN_PROGRESS, overdue: 'false' } },
  { key: 'inReview', label: 'Under Review', colour: 'var(--stat-in-review)', query: { status: STATUS.SUBMITTED } },
  { key: 'moreTime', label: 'More Time Asked', colour: 'var(--stat-more-time)', query: { moreTime: '1' } },
  { key: 'completed', label: 'Completed', colour: 'var(--stat-completed)', query: { status: STATUS.COMPLETED } },
];
export const STAT_BAR_FIGURES = STAT_BAR.filter((s) => s.key !== 'completed');

/** Total is the open work: everything bar the finished and the called-off. */
export function statValue(counters = {}, key) {
  if (key === 'total') {
    return Math.max(0, (Number(counters.total) || 0) - (Number(counters.completed) || 0) - (Number(counters.cancelled) || 0));
  }
  return Number(counters[key]) || 0;
}

export function statQueryFor(key) {
  return (STAT_BAR.find((s) => s.key === (key || 'total')) || STAT_BAR[0]).query;
}

export const openCount = (c = {}) => statValue(c, 'total');

// `more-time-chip`: orange in the dark (index.css), amber in the light.
export const EXTENSION_LOOK = {
  PENDING: { label: 'More time: Pending', cls: 'more-time-chip border-amber-200 bg-amber-50 text-amber-700' },
  APPROVED: { label: 'More time: Approved', cls: 'border-green-200 bg-green-50 text-green-700' },
  DECLINED: { label: 'More time: Declined', cls: 'border-red-200 bg-red-50 text-red-700' },
};

/**
 * The status dropdown on every row — the HRMS's six words: Approve · Reject ·
 * Delegate · Transfer · In Review · Completed (plus Pick it up on an open
 * piece and Mark done on a routine), only what `can` allows. Two words mean
 * different things by side: Approve is the doer's accept or the assigner's
 * sign-off; Reject is the doer's decline or the assigner's send-back. More
 * time is asked from the task itself (and by a swipe), not from this menu.
 */
export function statusActions(task) {
  const can = task?.can || {};
  const out = [];
  if (can.canClaim) out.push({ key: 'claim', label: 'Pick it up', hint: 'Nobody is on this piece yet — make it yours', tone: 'blue', icon: 'claim' });
  if (can.canApprove) out.push({ key: 'approve', label: 'Approve', hint: 'Sign off the work — it is completed', tone: 'green', icon: 'approve' });
  else if (can.canAccept) out.push({ key: 'accept', label: 'Approve', hint: 'Accept it and start working on it', tone: 'green', icon: 'accept' });
  if (can.canReject) out.push({ key: 'sendBack', label: 'Reject', hint: 'Send it back with what still needs doing', tone: 'red', icon: 'sendBack' });
  else if (can.canDecline) out.push({ key: 'decline', label: 'Reject', hint: 'Turn it down — say why', tone: 'red', icon: 'decline' });
  if (can.canDelegate || can.canSplit) out.push({ key: 'delegate', label: 'Delegate', hint: 'Hand it on or split it — you review the work', tone: 'indigo', icon: 'delegate' });
  if (can.canTransfer) out.push({ key: 'transfer', label: 'Transfer', hint: 'It went to the wrong person — move it fully', tone: 'slate', icon: 'transfer' });
  if (can.canSubmit) out.push({ key: 'submit', label: 'In Review', hint: 'Hand it in for the setter to check', tone: 'violet', icon: 'submit' });
  if (can.canDone) out.push({ key: 'done', label: 'Mark done', hint: 'Today’s routine is finished', tone: 'green', icon: 'approve' });
  const canComplete = (can.transitions || []).some((t) => t.to === STATUS.COMPLETED);
  if (canComplete && !can.canApprove && !can.canDone) out.push({ key: 'complete', label: 'Completed', hint: 'Mark it done', tone: 'green', icon: 'complete' });
  return out;
}

/** What the dropdown's own button says, from THIS reader's side. */
export function statusBadge(task) {
  if (!task) return { label: '', key: STATUS.PENDING };
  if (task.declined) return { label: 'Rejected', key: 'DECLINED' };
  if (task.status === STATUS.SUBMITTED && task.can?.canApprove) return { label: 'Needs your review', key: STATUS.SUBMITTED };
  if (task.status === STATUS.PENDING && task.awaitingAcceptance) return { label: 'Not accepted', key: STATUS.PENDING };
  if (task.routine && task.status === STATUS.IN_PROGRESS) return { label: 'To do', key: STATUS.PENDING };
  return { label: statusLabel(task.status), key: task.status };
}

// ===== People =====

export const idOf = (p) => (p && typeof p === 'object' ? String(p._id || p.id || '') : p ? String(p) : '');

export const personName = (p) => {
  if (!p) return '';
  if (typeof p === 'string') return p;
  return p.name || [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || '';
};

/** "Megha, Sonu +2" */
export function assigneeNames(assignees = [], max = 2) {
  const names = assignees.map((a) => a.name || personName(a.user)).filter(Boolean);
  if (!names.length) return '—';
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}

export const isTerminal = (status) => TERMINAL.includes(status);

export const isOverdue = (task) => {
  if (!task) return false;
  if (typeof task.overdue === 'boolean') return task.overdue;
  if (!task.dueDate || isTerminal(task.status) || task.status === STATUS.SUBMITTED) return false;
  return new Date(task.dueDate) < new Date();
};

export const RELATION_LABEL = { self: 'You', team: 'Organization member', contact: 'Contact', other: 'Everyone' };

export const sizeLabel = (bytes) => {
  const n = Number(bytes) || 0;
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
