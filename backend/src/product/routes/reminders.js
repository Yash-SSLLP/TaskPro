/**
 * /api/reminders — dated reminders on the calendar (services/calendar.js).
 * Everyone manages their own; the setter (or the Super Admin) edits and
 * deletes. Who a reminder may be aimed at is checked on every save.
 */
const express = require('express');
const { protect } = require('../../platform/auth');
const calendar = require('../services/calendar');

const router = express.Router();
router.use(protect);

/** GET / — the reminders I can see (?month=YYYY-MM, ?mine=1), and who I may aim one at. */
router.get('/', async (req, res) => {
  const [reminders, aim] = await Promise.all([
    calendar.listReminders(req.user, { month: req.query.month, mine: req.query.mine === '1' }),
    calendar.aimOptions(req.user),
  ]);
  res.json({ count: reminders.length, reminders, aim });
});

/** GET /:id — one reminder I can see. */
router.get('/:id', async (req, res) => {
  const r = await calendar.loadVisible(req.user, req.params.id);
  await r.populate([{ path: 'recipients', select: 'name status' }, { path: 'team', select: 'name' }]);
  res.json({ reminder: calendar.present(r.toObject(), req.user) });
});

/** POST / — { title, date, time?, notes?, priority?, scope?, recipients?, team? } → 201 { reminder, notified } */
router.post('/', async (req, res) => {
  res.status(201).json(await calendar.createReminder(req.user, req.body || {}));
});

const update = async (req, res) => res.json(await calendar.updateReminder(req.user, req.params.id, req.body || {}));
router.put('/:id', update);
router.patch('/:id', update);

router.delete('/:id', async (req, res) => {
  res.json(await calendar.deleteReminder(req.user, req.params.id));
});

module.exports = router;
