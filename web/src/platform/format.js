/**
 * Formatting for people: dates in the viewer's Settings time zone, relative
 * times, initials.
 */

// ---------------------------------------------------------------- dates

const fmtCache = new Map();
function dtf(tz, opts) {
  const key = tz + JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat('en-IN', { timeZone: tz, ...opts }));
  return fmtCache.get(key);
}

/** "2026-09-30" for a moment, in the given time zone. */
export function dayKey(date, tz = 'Asia/Kolkata') {
  const parts = dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(date));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "30 Sep 2026" */
export const formatDate = (date, tz) => dtf(tz, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));

/** "3:45 pm" */
export const formatTime = (date, tz) =>
  dtf(tz, { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(date)).replace(' ', ' ');

/** "30 Sep 2026, 3:45 pm" */
export const formatDateTime = (date, tz) => `${formatDate(date, tz)}, ${formatTime(date, tz)}`;

/** "Today", "Yesterday", "Mon, 28 Sep", or "28 Sep 2025" for another year. */
export function dayLabel(date, tz) {
  const key = dayKey(date, tz);
  const today = dayKey(new Date(), tz);
  const yesterday = dayKey(new Date(Date.now() - 86400000), tz);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return dtf(tz, sameYear ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", or a date. */
export function timeAgo(date, tz) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return formatDate(date, tz);
}

/**
 * Value for <input type="datetime-local"> showing `date` in the given
 * zone (the viewer's Settings), and the reverse. The browser's own zone may differ.
 */
export function toLocalInput(date, tz) {
  const d = new Date(date);
  const parts = dtf(tz, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/** Offset of `tz` from UTC at `date`, in minutes. */
function zoneOffset(date, tz) {
  const local = toLocalInput(date, tz);
  const asUtc = Date.parse(`${local}:00Z`);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

export function fromLocalInput(value, tz) {
  if (!value) return null;
  const guess = new Date(`${value}:00Z`);
  const offset = zoneOffset(guess, tz);
  return new Date(guess.getTime() - offset * 60000);
}

/** First and last day ("YYYY-MM-DD") of this month / last month, in tz. */
export function monthRange(which, tz) {
  const [y, m] = dayKey(new Date(), tz).split('-').map(Number);
  const year = which === 'last' ? (m === 1 ? y - 1 : y) : y;
  const month = which === 'last' ? (m === 1 ? 12 : m - 1) : m;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

/** "RK" for "Ravi Kumar". */
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
