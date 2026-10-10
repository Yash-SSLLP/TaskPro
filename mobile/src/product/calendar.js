/**
 * The calendar's vocabulary, for the app: what kind each row of GET
 * /api/calendar is, its colour, icon and words, the month as a grid, and the
 * lines an entry's detail sheet shows. The same kinds, colours and order as
 * the web (web/src/product/calendar.js), so a month reads alike on both.
 *
 * The server sends tasks as `task` (still open, on the day they are due) or
 * `done` (on the day they were finished), and reminders as `reminder` (mine)
 * or `sharedReminder` (set for me by someone else). An open task is split
 * here by where it has got to, so overdue work stands out.
 *
 * Words are English keys, translated where they are shown. The helpers that
 * build a sentence call tr() themselves, and are only called while drawing.
 */
import { tr } from '../i18n';
import { theme } from '../platform/theme';
import { AlarmClock, BellRing, CircleAlert, CircleCheckBig, CirclePlay, Clock, Eye } from './icons';
import { DARK_HUES, monthName, priorityLabel, statusLabel, weekdayName } from './taskStatus';

const dark = theme.dark;

/**
 * The order is the filter chips', and what survives when a day holds more dots than fit.
 * Dark mode takes the status hues (and a light indigo for my own reminders), as the web does.
 */
export const KINDS = {
  overdue: { label: 'Overdue', chip: 'Overdue', color: dark ? DARK_HUES.red.ink : '#ef4444', icon: CircleAlert },
  reminder: { label: 'My reminder', chip: 'My reminders', color: dark ? '#818CF8' : '#6366f1', icon: AlarmClock },
  sharedReminder: { label: 'Reminder for me', chip: 'Reminders for me', color: dark ? DARK_HUES.orange.ink : '#f97316', icon: BellRing },
  pending: { label: 'Due · to do', chip: 'To do', color: dark ? DARK_HUES.amber.ink : '#f59e0b', icon: Clock },
  inProgress: { label: 'Due · in progress', chip: 'In progress', color: dark ? DARK_HUES.sky.ink : '#0ea5e9', icon: CirclePlay },
  inReview: { label: 'Due · in review', chip: 'In review', color: dark ? DARK_HUES.violet.ink : '#8b5cf6', icon: Eye },
  done: { label: 'Completed', chip: 'Completed', color: dark ? DARK_HUES.green.ink : '#10b981', icon: CircleCheckBig },
};
export const KIND_ORDER = Object.keys(KINDS);
export const kindMeta = (kind) => KINDS[kind] || KINDS.pending;

/** The kind of one row from GET /api/calendar. */
export function kindOf(e) {
  if (e?.type !== 'task') return KINDS[e?.type] ? e.type : 'pending';
  if (e.meta?.overdue) return 'overdue';
  if (e.meta?.status === 'IN_PROGRESS') return 'inProgress';
  if (e.meta?.status === 'SUBMITTED') return 'inReview';
  return 'pending';
}

export const isReminder = (kind) => kind === 'reminder' || kind === 'sharedReminder';

/** Who a reminder goes to, in the form's words. */
export const SCOPE_LABELS = { self: 'Just me', users: 'Specific people', team: 'An organization', everyone: 'Everyone' };

// ---------------------------------------------------------------- days

const pad = (n) => String(n).padStart(2, '0');
export const ymKey = (y, m) => `${y}-${pad(m)}`;
export const dayKeyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const daysIn = (y, m) => new Date(y, m, 0).getDate();

/** 'YYYY-MM-DD' → { y, m, d } when it is a real day, else null. */
export function parseDay(value) {
  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!hit) return null;
  const y = Number(hit[1]);
  const m = Number(hit[2]);
  const d = Number(hit[3]);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m) ? { y, m, d } : null;
}

/**
 * The month as whole weeks, Sunday first like the web: the previous month's
 * tail, the month, the next month's head. Always a multiple of seven.
 * @returns {{ day: number, inMonth: boolean }[]}
 */
export function monthGrid(y, m) {
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const days = daysIn(y, m);
  const prevDays = new Date(y, m - 1, 0).getDate();
  const cells = [];
  for (let i = firstWeekday; i > 0; i -= 1) cells.push({ day: prevDays - i + 1, inMonth: false });
  for (let d = 1; d <= days; d += 1) cells.push({ day: d, inMonth: true });
  let next = 1;
  while (cells.length % 7 !== 0) cells.push({ day: next++, inMonth: false });
  return cells;
}

/** "Friday, 9 October 2026" */
export function longDate(y, m, d) {
  return `${weekdayName(new Date(y, m - 1, d).getDay())}, ${d} ${monthName(m)} ${y}`;
}

/**
 * A reminder's time is free text on the server ("4:00 PM" from one place,
 * "16:00" from another, words from a third). The clock-time ones become
 * 'HH:mm' for the time picker; anything else gives '' and is kept as typed.
 * The same reading as the server's clockOf (services/calendar.js).
 */
export function to24h(text) {
  const s = String(text || '').trim();
  const twelve = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s*m\.?$/i.exec(s);
  if (twelve) {
    const h = Number(twelve[1]);
    const m = Number(twelve[2] || 0);
    if (h < 1 || h > 12 || m > 59) return '';
    return `${pad((h % 12) + (twelve[3].toLowerCase() === 'p' ? 12 : 0))}:${pad(m)}`;
  }
  const plain = /^(\d{1,2})[:.](\d{2})$/.exec(s);
  if (!plain || Number(plain[1]) > 23 || Number(plain[2]) > 59) return '';
  return `${pad(Number(plain[1]))}:${plain[2]}`;
}

// ---------------------------------------------------------------- words

/** The server says "You" (and "You + 2") for the viewer: those words are translated, names are not. */
export function whoText(value) {
  const s = String(value || '');
  if (s === 'You') return tr('You');
  const plus = /^You \+ (\d+)$/.exec(s);
  return plus ? tr('You + {n}', { n: plus[1] }) : s;
}

/** "Just me", "An organization · Sales"… */
export function audienceText(m = {}) {
  if (m.scope === 'team') return m.team?.name ? `${tr('An organization')} · ${m.team.name}` : tr('An organization');
  return SCOPE_LABELS[m.scope] ? tr(SCOPE_LABELS[m.scope]) : m.audience || '';
}

/** "Ravi → You", "You → Asha + 2"; nothing for a task of my own. */
function taskPeople(m) {
  const by = m.setBy || '';
  const to = m.assignedTo || '';
  if (!by && !to) return '';
  if (by === 'You' && to === 'You') return '';
  return `${whoText(by) || '—'} → ${whoText(to) || '—'}`;
}

/**
 * The line under an entry: its kind, its time, then who — the people on a
 * task, who a reminder of mine is for, or who set one for me.
 */
export function entrySubtitle(e) {
  const m = e.meta || {};
  const parts = [tr(kindMeta(e.kind).label)];
  if (m.time) parts.push(m.time);
  if (e.kind === 'sharedReminder') {
    if (m.setBy?.name) parts.push(tr('from {name}', { name: whoText(m.setBy.name) }));
  } else if (e.kind === 'reminder') {
    parts.push(audienceText(m));
  } else {
    parts.push(taskPeople(m));
  }
  return parts.filter(Boolean).join(' · ');
}

/**
 * The label/value lines an entry's detail sheet shows, by kind. Labels are
 * English keys (translated where drawn); values are ready to show.
 * @returns {Array<[string, string]>}
 */
export function detailRows(e) {
  const m = e.meta || {};
  const rows = [];
  if (isReminder(e.kind)) {
    if (m.time) rows.push(['Time', m.time]);
    rows.push(['Set by', whoText(m.setBy?.name) || tr('You')]);
    rows.push(['Who sees it', audienceText(m)]);
    if (m.scope === 'users' && m.recipients?.length) rows.push(['People', m.recipients.map((p) => p.name).filter(Boolean).join(', ')]);
    if (m.priority && m.priority !== 'Normal') rows.push(['Priority', tr(m.priority)]);
    if (m.notes) rows.push(['Notes', m.notes]);
    return rows;
  }
  if (m.code) rows.push(['Task ID', m.code]);
  // The app's own wording for the state (translated); the server's only for one the app does not know.
  const status = m.status ? statusLabel(m.status) : m.statusLabel || '';
  if (status) rows.push(['Status', m.overdue ? tr('{status} — overdue', { status }) : status]);
  if (e.kind === 'done') {
    if (m.time) rows.push(['Finished at', m.time]);
    if (m.late) rows.push(['On time?', tr('Finished after its deadline')]);
  } else if (m.time) {
    rows.push(['Due at', m.time]);
  }
  if (m.priority) rows.push(['Priority', priorityLabel(m.priority)]);
  if (m.category) rows.push(['Category', m.category]);
  if (m.assignedTo) rows.push(['Assigned to', whoText(m.assignedTo)]);
  if (m.setBy) rows.push(['Set by', whoText(m.setBy)]);
  return rows;
}
