/**
 * /api/people: finding someone by Task Pin, and the people you can give work to.
 */
const express = require('express');
const Contact = require('../models/Contact');
const { publicUser } = require('../models/User');
const { pairOf } = require('../models/Contact');
const { protect, isSuperAdmin } = require('../auth');
const { assignablePeople } = require('../services/people');
const { findByPin } = require('./contacts');

const router = express.Router();
router.use(protect);

router.get('/lookup', async (req, res) => {
  const other = await findByPin(req.query.pin);
  let relation = 'none';
  if (String(other._id) === String(req.user._id)) {
    relation = 'self';
  } else if (!isSuperAdmin(req.user)) {
    const link = await Contact.findOne(pairOf(req.user._id, other._id)).lean();
    if (link?.status === 'accepted') relation = 'contact';
    else if (link) relation = String(link.requestedBy) === String(req.user._id) ? 'outgoing' : 'incoming';
  }
  res.json({ person: publicUser(other, { full: false }), relation });
});

router.get('/assignable', async (req, res) => {
  res.json({ people: await assignablePeople(req.user, { q: req.query.q }) });
});

module.exports = router;
