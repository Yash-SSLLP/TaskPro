/**
 * /api/live: the one cheap call both apps poll while they are open (the web
 * every 4 s while its tab is visible, the phone every 5 s in the foreground).
 *
 *   { v: { tasks, alerts, calendar, people }, unread, at }
 *
 * Each `v` number only ever goes up; a screen reloads the data behind a topic
 * only when its number has moved (platform/live has the design). `unread` is
 * the bell's count, so the apps need no separate unread poll. `at` is the
 * server's time, for diagnostics.
 */
const express = require('express');
const Notification = require('../models/Notification');
const product = require('../../product');
const live = require('../live');
const { protect } = require('../auth');

const router = express.Router();
router.use(protect);

/**
 * The bell's count only changes when the person's alerts do, so it is kept
 * per person beside the alerts number it was counted at: a quiet poll costs
 * no count (per instance; a cold one simply counts).
 */
const unreadSeen = new Map();
const MAX_REMEMBERED = 5000;

async function unreadFor(user, alertsVersion) {
  const key = String(user._id);
  const known = unreadSeen.get(key);
  if (known && known.v === alertsVersion) return known.unread;
  const unread = await Notification.countDocuments({ user: user._id, readAt: null });
  if (unreadSeen.size >= MAX_REMEMBERED) unreadSeen.clear();
  unreadSeen.set(key, { v: alertsVersion, unread });
  return unread;
}

router.get('/', async (req, res) => {
  // Calendar reminders that are due ring now (at most once a minute per
  // server): on a host that never runs the jobs (Vercel), these polls are what
  // make them ring. Recorded before the numbers are read, so this very answer
  // carries them.
  await Promise.resolve(product.catchUp?.()).catch((err) => console.warn('[catch-up]', err.message));
  await live.flushRequest();
  const v = await live.versionsFor(req.user);
  const unread = await unreadFor(req.user, v.alerts);
  // Never from a cache between here and the app: a stale copy is exactly the
  // "nothing changed" answer this exists to get right.
  res.set('Cache-Control', 'no-store');
  res.json({ v, unread, at: new Date().toISOString() });
});

module.exports = router;
