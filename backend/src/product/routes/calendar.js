/**
 * /api/calendar — one month as both apps draw it: open tasks on their due
 * day, finished ones on the day they were finished, and the reminders I can
 * see (services/calendar.js). Days are read in my own time zone.
 */
const express = require('express');
const { protect } = require('../../platform/auth');
const calendar = require('../services/calendar');

const router = express.Router();
router.use(protect);

/** GET /?month=YYYY-MM → { year, month, events: [{ date, day, type, label, meta }], aim } */
router.get('/', async (req, res) => {
  res.json(await calendar.monthFeed(req.user, req.query.month));
});

module.exports = router;
