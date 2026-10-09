/**
 * Background jobs, every 5 minutes, in this order:
 *   1. repeating tasks: raise whatever is due to appear
 *   2. reminders (before / after / every-N until done)
 *   3. overdue announcements
 *   4. daily digests
 *   5. calendar reminders whose moment has come
 *
 * Each is safe to run twice or on two servers (every send is claimed first),
 * never throws, and skips a run that is still going. The tick functions take
 * `now` so tests can move the clock.
 *
 * catchUp() is the part cheap enough to run while people use the app (see
 * product.catchUp): on a host that never calls startJobs, it keeps calendar
 * reminders ringing on time.
 */
const recurrence = require('./services/recurrence');
const reminders = require('./services/reminders');
const calendar = require('./services/calendar');

const EVERY_MS = 5 * 60 * 1000;
const running = new Set();

async function guarded(name, fn) {
  if (running.has(name)) return null;
  running.add(name);
  try {
    return await fn();
  } catch (err) {
    console.warn(`[jobs] ${name}:`, err.message);
    return null;
  } finally {
    running.delete(name);
  }
}

const recurringTick = (now = new Date()) => guarded('recurring', () => recurrence.tick(now));
const reminderTick = (now = new Date()) => guarded('reminders', () => reminders.reminderTick(now));
const overdueTick = (now = new Date()) => guarded('overdue', () => reminders.overdueTick(now));
const digestTick = (now = new Date()) => guarded('digest', () => reminders.digestTick(now));
const calendarTick = (now = new Date()) => guarded('calendar', () => calendar.ringDue(now));

async function tick(now = new Date()) {
  const recurring = await recurringTick(now);
  const sent = await reminderTick(now);
  const overdue = await overdueTick(now);
  const digest = await digestTick(now);
  const calendarSent = await calendarTick(now);
  return { recurring, reminders: sent, overdue, digest, calendar: calendarSent };
}

const CATCH_UP_MS = 60 * 1000;
let lastCatchUp = 0;

/** At most once a minute per server: ring the calendar reminders that are due. */
async function catchUp(now = new Date()) {
  if (now.getTime() - lastCatchUp < CATCH_UP_MS) return null;
  lastCatchUp = now.getTime();
  return calendarTick(now);
}

let timer = null;

function startJobs() {
  if (timer) return;
  const run = () => tick().catch((err) => console.warn('[jobs] tick:', err.message));
  timer = setInterval(run, EVERY_MS);
  timer.unref();
  setTimeout(run, 30 * 1000).unref();
}

module.exports = { startJobs, tick, recurringTick, reminderTick, overdueTick, digestTick, calendarTick, catchUp };
