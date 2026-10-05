/**
 * /api/notifications: the signed-in person's alerts.
 */
const express = require('express');
const Notification = require('../models/Notification');
const { protect } = require('../auth');
const { z, parse, objectId } = require('../validate');

const router = express.Router();
router.use(protect);

const mine = (req) => ({ user: req.user._id });

router.get('/', async (req, res) => {
  const filter = mine(req);
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ ...mine(req), readAt: null }),
  ]);
  res.json({
    unread,
    notifications: items.map((n) => ({
      id: String(n._id),
      title: n.title,
      body: n.body,
      link: n.link,
      kind: n.kind,
      read: !!n.readAt,
      createdAt: n.createdAt,
    })),
    hasMore: items.length === 30,
  });
});

router.get('/unread-count', async (req, res) => {
  res.json({ unread: await Notification.countDocuments({ ...mine(req), readAt: null }) });
});

const readSchema = z.object({ ids: z.array(objectId).max(200).optional(), all: z.boolean().optional() });

router.post('/read', async (req, res) => {
  const body = parse(readSchema, req.body);
  const filter = { ...mine(req), readAt: null };
  if (!body.all) filter._id = { $in: body.ids || [] };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  res.json({ ok: true });
});

router.delete('/', async (req, res) => {
  // Clear everything already read.
  await Notification.deleteMany({ ...mine(req), readAt: { $ne: null } });
  res.json({ ok: true });
});

module.exports = router;
