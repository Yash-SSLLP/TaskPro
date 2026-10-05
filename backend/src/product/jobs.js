/**
 * Background jobs, every 5 minutes, in this order:
 *   1. repeating tasks: raise whatever is due to appear
 *   2. reminders (before / after / every-N until done)
 *   3. overdue announcements
 *   4. daily digests
 *
 * Each is safe to run twice or on two servers (every send is claimed first),
 * never throws, and skips a run that is still going. The tick functions take
 * `now` so tests can move the clock.
 */
const recurrence = require('./services/recurrence');
const reminders = require('./services/reminders');

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

async function tick(now = new Date()) {
  const recurring = await recurringTick(now);
  const sent = await reminderTick(now);
  const overdue = await overdueTick(now);
  const digest = await digestTick(now);
  return { recurring, reminders: sent, overdue, digest };
}

let timer = null;

function startJobs() {
  if (timer) return;
  const run = () => tick().catch((err) => console.warn('[jobs] tick:', err.message));
  timer = setInterval(run, EVERY_MS);
  timer.unref();
  setTimeout(run, 30 * 1000).unref();
}

module.exports = { startJobs, tick, recurringTick, reminderTick, overdueTick, digestTick };
