/**
 * Dates in a person's time zone. Requests use the viewer's Settings zone,
 * background jobs the task setter's (or, for digests, the recipient's).
 *
 * Days are 'YYYY-MM-DD' keys read in a zone and stepped in plain UTC
 * arithmetic, so no server zone reaches any of it.
 */
const { DateTime } = require('luxon');
const settings = require('../settings');

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');

/** The viewer's zone for a request. */
const zoneOf = (req) => req?.settings?.timezone || settings.read(req?.user?.settings).timezone;

/** A person's settings (from a User doc or lean row). */
const settingsOf = (user) => settings.read(user?.settings);

const inZone = (date, tz) => DateTime.fromJSDate(new Date(date)).setZone(tz);

/** "2026-09-21" for an instant, in the zone. */
const dayKey = (date, tz) => inZone(date, tz).toISODate();

function keyToUtc(key) {
  const [y, m, d] = String(key).split('-').map((n) => parseInt(n, 10));
  return Date.UTC(y, m - 1, d);
}
function utcToKey(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const addDaysKey = (key, n) => utcToKey(keyToUtc(key) + n * DAY_MS);
const daysBetween = (a, b) => Math.round((keyToUtc(b) - keyToUtc(a)) / DAY_MS);

/** Year, month (1-12), day, weekday (0 = Sunday) and the month's last day. */
function partsOf(key) {
  const d = new Date(keyToUtc(key));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return { y, m, d: d.getUTCDate(), dow: d.getUTCDay(), last: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

/** "HH:mm" → [h, m], 18:00 when unreadable. */
function hm(hhmm) {
  const [h, m] = String(hhmm || '18:00').split(':').map((n) => parseInt(n, 10));
  return [Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 18, Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0];
}

/** The instant day `key` reads `hhmm` in the zone. */
function atZone(key, hhmm, tz) {
  const [hour, minute] = hm(hhmm);
  return DateTime.fromISO(key, { zone: tz }).set({ hour, minute, second: 0, millisecond: 0 }).toJSDate();
}

const minutesOf = (hhmm) => {
  const [h, m] = hm(hhmm);
  return h * 60 + m;
};
const hhmmFromMinutes = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** Minutes past local midnight. */
function localMinutes(date, tz) {
  const d = inZone(date, tz);
  return d.hour * 60 + d.minute;
}

/** "4 Oct, 6:00 PM" */
const fmtDateTime = (d, tz) => (d ? inZone(d, tz).toFormat('d LLL, h:mm a') : '');
/** "4 Oct 2026, 6:00 PM" */
const whenText = (d, tz) => (d ? inZone(d, tz).toFormat('d LLL yyyy, h:mm a') : '');
/** "4 Oct" */
const dayText = (d, tz) => (d ? inZone(d, tz).toFormat('d LLL') : '');
/** "6:00 PM" */
const clockText = (d, tz) => (d ? inZone(d, tz).toFormat('h:mm a') : '');

/** A date-only string or ISO instant → local midnight of that day, or null. */
function startOfDay(raw, tz) {
  if (!raw) return null;
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return DateTime.fromISO(s, { zone: tz }).startOf('day').toJSDate();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return inZone(d, tz).startOf('day').toJSDate();
}

/**
 * A wall-clock Date for a spreadsheet cell: exceljs writes a Date's UTC
 * fields, so shifting by the zone's offset makes them read as local time.
 */
function sheetCell(d, tz) {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + inZone(d, tz).offset * 60 * 1000);
}

module.exports = {
  DAY_MS,
  zoneOf,
  settingsOf,
  inZone,
  dayKey,
  addDaysKey,
  daysBetween,
  partsOf,
  atZone,
  minutesOf,
  hhmmFromMinutes,
  localMinutes,
  fmtDateTime,
  whenText,
  dayText,
  clockText,
  startOfDay,
  sheetCell,
};
