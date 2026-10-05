/**
 * /api/devices: phones registering (and unregistering) for push.
 */
const express = require('express');
const Device = require('../models/Device');
const { protect } = require('../auth');
const { z, parse } = require('../validate');
const { isExpoToken } = require('../services/push');
const { badRequest } = require('../errors');

const router = express.Router();
router.use(protect);

const schema = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['android', 'ios', 'web', 'other']).default('android'),
});

router.post('/', async (req, res) => {
  const body = parse(schema, req.body);
  if (!isExpoToken(body.token)) throw badRequest('Not a push token');
  // A phone belongs to whoever signed in on it last.
  await Device.deleteMany({ token: body.token });
  await Device.create({ user: req.user._id, token: body.token, platform: body.platform });
  res.json({ ok: true });
});

router.delete('/', async (req, res) => {
  const token = String(req.body?.token || req.query.token || '');
  if (token) await Device.deleteMany({ user: req.user._id, token });
  res.json({ ok: true });
});

module.exports = router;
