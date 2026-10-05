/**
 * Formatting helpers: dates in a time zone and "2h ago" style relative times.
 * Words go through tr(); day and month names are translated as short words.
 */
import { tr } from '../i18n';

// ---------------------------------------------------------------- dates

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

// Used when the JS engine cannot resolve a time zone (minutes east of UTC).
const FALLBACK_OFFSETS = {
  'Asia/Kolkata': 330, 'Asia/Calcutta': 330, 'Asia/Colombo': 330, 'Asia/Kathmandu': 345,
  'Asia/Dhaka': 360, 'Asia/Karachi': 300, 'Asia/Dubai': 240, 'Asia/Riyadh': 180, 'Asia/Qatar': 180,
  'Asia/Singapore': 480, 'Asia/Kuala_Lumpur': 480, 'Africa/Nairobi': 180, 'Africa/Lagos': 60,
  'Africa/Johannesburg': 120, UTC: 0, 'Etc/UTC': 0,
};

const zoneFormatters = new Map();

function zoneOffsetMinutes(date, tz) {
  if (!tz) return -date.getTimezoneOffset();
  try {
    let f = zoneFormatters.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
      zoneFormatters.set(tz, f);
    }
    const p = {};
    for (const part of f.formatToParts(date)) p[part.type] = part.value;
    let hour = +p.hour % 24;
    // Some engines ignore hourCycle and answer on a 12-hour clock.
    if (p.dayPeriod) {
      const pm = /p/i.test(p.dayPeriod);
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
    const off = Math.round((asUtc - (date.getTime() - date.getMilliseconds())) / 60000);
    // Real offsets are whole quarter hours within ±14h; anything else means a broken answer.
    if (Number.isFinite(off) && Math.abs(off) <= 14 * 60 && off % 15 === 0) return off;
  } catch {
    /* fall through */
  }
  return FALLBACK_OFFSETS[tz] ?? -date.getTimezoneOffset();
}

const toDate = (d) => (d instanceof Date ? d : new Date(d));

/** Calendar fields of an instant as seen in a time zone. */
export function zoned(date, tz) {
  const d = toDate(date);
  const s = new Date(d.getTime() + zoneOffsetMinutes(d, tz) * 60000);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth(),
    day: s.getUTCDate(),
    weekday: s.getUTCDay(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
  };
}

/** "2026-09-28" in a time zone. */
export function dayKey(date, tz) {
  const z = zoned(date, tz);
  return `${z.year}-${pad(z.month + 1)}-${pad(z.day)}`;
}

/** "2026-09-28" from a phone-local Date (what a date picker returns). */
export function localDayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-09-28" → "28 Sep 2026". */
export function formatDayKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${tr(MONTHS[m - 1])} ${y}`;
}

/** "28 Sep 2026" */
export function formatDate(date, tz) {
  if (!date) return '';
  const z = zoned(date, tz);
  return `${z.day} ${tr(MONTHS[z.month])} ${z.year}`;
}

/** "Mon, 28 Sep" (the year is added when it is not this year). */
export function formatDay(date, tz) {
  if (!date) return '';
  const z = zoned(date, tz);
  const thisYear = zoned(new Date(), tz).year;
  return `${tr(DAYS[z.weekday])}, ${z.day} ${tr(MONTHS[z.month])}${z.year !== thisYear ? ` ${z.year}` : ''}`;
}

/** "3:45 PM" */
export function formatTime(date, tz) {
  if (!date) return '';
  const z = zoned(date, tz);
  const h = z.hour % 12 || 12;
  return `${h}:${pad(z.minute)} ${z.hour < 12 ? 'AM' : 'PM'}`;
}

/** "28 Sep 2026, 3:45 PM" */
export function formatDateTime(date, tz) {
  if (!date) return '';
  return `${formatDate(date, tz)}, ${formatTime(date, tz)}`;
}

/** "Today", "Yesterday" or "Mon, 28 Sep". */
export function dayLabel(date, tz) {
  const key = dayKey(date, tz);
  const now = new Date();
  if (key === dayKey(now, tz)) return tr('Today');
  if (key === dayKey(new Date(now.getTime() - 86400000), tz)) return tr('Yesterday');
  return formatDay(date, tz);
}

/** "just now", "5 min ago", "2h ago", "Yesterday", "3 days ago", "28 Sep". */
export function relativeTime(date, tz) {
  if (!date) return '';
  const d = toDate(date);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return tr('just now');
  if (min < 60) return tr('{n} min ago', { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return tr('{n}h ago', { n: hours });
  const label = dayLabel(d, tz);
  if (label === tr('Yesterday')) return label;
  const days = Math.max(2, Math.round(hours / 24));
  if (days < 7) return tr('{n} days ago', { n: days });
  const z = zoned(d, tz);
  const thisYear = zoned(new Date(), tz).year;
  return `${z.day} ${tr(MONTHS[z.month])}${z.year !== thisYear ? ` ${z.year}` : ''}`;
}

/** First and last day of a month relative to this one, as day keys. */
export function monthRange(tz, offset = 0) {
  const z = zoned(new Date(), tz);
  const first = new Date(Date.UTC(z.year, z.month + offset, 1));
  const last = new Date(Date.UTC(z.year, z.month + offset + 1, 0));
  const key = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return { from: key(first), to: key(last), label: `${tr(MONTHS[first.getUTCMonth()])} ${first.getUTCFullYear()}` };
}

// ---------------------------------------------------------------- misc

/** "Ravi Kumar" → "RK" */
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}
