/**
 * /api/me: the signed-in person's own settings.
 */
const express = require('express');
const product = require('../../product');
const User = require('../models/User');
const { protect } = require('../auth');

const router = express.Router();
router.use(protect);

router.get('/settings', (req, res) => {
  res.json({ settings: req.settings });
});

router.patch('/settings', async (req, res) => {
  // Merge onto the stored settings so two quick saves don't undo each other.
  const current = await User.findById(req.user._id).select('settings').lean();
  const settings = product.settings.merge(current?.settings, req.body);
  await User.updateOne({ _id: req.user._id }, { $set: { settings } });
  res.json({ settings });
});

module.exports = router;
