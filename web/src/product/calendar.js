/**
 * The calendar's vocabulary, shared by the page and anything that links to
 * it: what kind each row is, its colour and words, and the reminder form's
 * choices. The same kinds, colours and order as the mobile app.
 *
 * GET /api/calendar sends tasks as `task` (still open, on the day they are
 * due) or `done` (on the day they were finished), and reminders as
 * `reminder` (mine) or `sharedReminder` (set for me by someone else). An open
 * task is split here by where it has got to, so overdue work stands out.
 */
import { AlarmClock, AlertCircle, BellRing, CheckCircle2, Clock, Eye, PlayCircle } from 'lucide-react';

/** Order = the legend's, and what survives when a day holds more than fits. */
export const KINDS = {
  overdue: { label: 'Overdue', chip: 'Overdue', color: '#ef4444', fg: '#ffffff', icon: AlertCircle },
  reminder: { label: 'My reminder', chip: 'My reminders', color: '#6366f1', fg: '#ffffff', icon: AlarmClock },
  sharedReminder: { label: 'Reminder for me', chip: 'Reminders for me', color: '#f97316', fg: '#ffffff', icon: BellRing },
  pending: { label: 'Due · to do', chip: 'To do', color: '#f59e0b', fg: '#1f2937', icon: Clock },
  inProgress: { label: 'Due · in progress', chip: 'In progress', color: '#0ea5e9', fg: '#ffffff', icon: PlayCircle },
  inReview: { label: 'Due · in review', chip: 'In review', color: '#8b5cf6', fg: '#ffffff', icon: Eye },
  done: { label: 'Completed', chip: 'Completed', color: '#10b981', fg: '#06281f', icon: CheckCircle2 },
};
export const KIND_ORDER = Object.keys(KINDS);
export const kindMeta = (kind) => KINDS[kind] || KINDS.pending;

/** The kind of one row from GET /api/calendar. */
export function kindOf(e) {
  if (e.type !== 'task') return e.type;
  if (e.meta?.overdue) return 'overdue';
  if (e.meta?.status === 'IN_PROGRESS') return 'inProgress';
  if (e.meta?.status === 'SUBMITTED') return 'inReview';
  return 'pending';
}

export const isReminder = (kind) => kind === 'reminder' || kind === 'sharedReminder';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');
export const ymKey = (y, m) => `${y}-${pad(m)}`;
export const dayKeyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** 'YYYY-MM-DD' → { y, m, d }, or null. */
export function parseDay(value) {
  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!hit) return null;
  const y = Number(hit[1]);
  const m = Number(hit[2]);
  const d = Number(hit[3]);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { y, m, d } : null;
}

/** The month as whole weeks, Sunday first: the previous month's tail, the month, the next month's head. */
export function monthCells(y, m) {
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const prevDays = new Date(y, m - 1, 0).getDate();
  const out = [];
  for (let i = firstWeekday; i > 0; i -= 1) out.push({ day: prevDays - i + 1, inMonth: false });
  for (let d = 1; d <= days; d += 1) out.push({ day: d, inMonth: true });
  let next = 1;
  while (out.length % 7 !== 0) out.push({ day: next++, inMonth: false });
  return out;
}

/** "Friday, 9 October 2026" */
export const longDate = (y, m, d) => new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const PRIORITIES = ['Low', 'Normal', 'High'];
export const SCOPE_LABELS = { self: 'Just me', users: 'Specific people', team: 'A team', everyone: 'Everyone' };

/** The label/value lines an entry's detail shows, by kind. */
export function detailRows(e) {
  const m = e.meta || {};
  const rows = [];
  if (isReminder(e.kind)) {
    if (m.time) rows.push(['Time', m.time]);
    rows.push(['Set by', m.setBy?.name || 'You']);
    rows.push(['Who sees it', m.audience || SCOPE_LABELS[m.scope] || m.scope]);
    if (m.scope === 'users' && m.recipients?.length) rows.push(['People', m.recipients.map((p) => p.name).join(', ')]);
    if (m.priority && m.priority !== 'Normal') rows.push(['Priority', m.priority]);
    if (m.notes) rows.push(['Notes', m.notes]);
    return rows;
  }
  if (m.code) rows.push(['Task ID', m.code]);
  rows.push(['Status', m.overdue ? `${m.statusLabel || m.status} — overdue` : m.statusLabel || m.status]);
  if (e.kind === 'done') {
    if (m.time) rows.push(['Finished at', m.time]);
    if (m.late) rows.push(['On time?', 'Finished after its deadline']);
  } else if (m.time) {
    rows.push(['Due at', m.time]);
  }
  if (m.priority) rows.push(['Priority', m.priority]);
  if (m.category) rows.push(['Category', m.category]);
  if (m.assignedTo) rows.push(['Assigned to', m.assignedTo]);
  if (m.setBy) rows.push(['Set by', m.setBy]);
  return rows;
}
