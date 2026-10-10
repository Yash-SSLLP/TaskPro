/**
 * /api/devices: phones registering (and unregistering) for push. The phone
 * app sends an Expo push token; the iPhone home-screen app (platform 'web')
 * sends a Web Push subscription instead, and its token is made here from the
 * subscription's endpoint, never taken from the client.
 */
const express = require('express');
const Device = require('../models/Device');
const { protect } = require('../auth');
const { z, parse } = require('../validate');
const { isExpoToken } = require('../services/push');
const webPush = require('../services/webPush');
const { badRequest } = require('../errors');

const router = express.Router();
router.use(protect);

const schema = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['android', 'ios', 'web', 'other']).default('android'),
});

// The VAPID public key the iPhone home-screen app subscribes with.
router.get('/web-push-key', async (req, res) => {
  res.json({ publicKey: await webPush.publicKey() });
});

router.post('/', async (req, res) => {
  let device;
  if (req.body?.platform === 'web') {
    const subscription = webPush.cleanSubscription(req.body.webPush);
    if (!subscription) throw badRequest('Not a push subscription');
    device = { token: webPush.tokenFor(subscription.endpoint), platform: 'web', webPush: subscription };
  } else {
    const body = parse(schema, req.body);
    if (!isExpoToken(body.token)) throw badRequest('Not a push token');
    device = { token: body.token, platform: body.platform };
  }
  // A phone belongs to whoever signed in on it last.
  await Device.deleteMany({ token: device.token });
  await Device.create({ user: req.user._id, ...device });
  res.json({ ok: true, token: device.token });
});

router.delete('/', async (req, res) => {
  const token = String(req.body?.token || req.query.token || '');
  if (token) await Device.deleteMany({ user: req.user._id, token });
  res.json({ ok: true });
});

module.exports = router;
