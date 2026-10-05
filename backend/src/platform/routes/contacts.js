/**
 * /api/contacts: adding people by Task Pin, BBM style.
 *
 * Asking sends a request; the other person accepts or declines. If they had
 * already asked you, asking back simply accepts. Either side can remove the
 * contact later; that doesn't touch tasks already given.
 */
const express = require('express');
const User = require('../models/User');
const Contact = require('../models/Contact');
const { publicUser } = require('../models/User');
const { pairOf, involving, otherOf } = require('../models/Contact');
const { protect, requirePerson } = require('../auth');
const { z, parse, idParam } = require('../validate');
const { normalizePin } = require('../pin');
const { badRequest, notFound, conflict } = require('../errors');
const { notify } = require('../services/notify');

const router = express.Router();
router.use(protect, requirePerson);

const person = (u) => publicUser(u, { full: false });

/** The active person with this pin, or a friendly 404. Never the Super Admin. */
async function findByPin(raw) {
  const pin = normalizePin(raw);
  if (!pin) throw badRequest('A Task Pin has 8 letters and numbers, like 7KQ4-M9XA');
  const user = await User.findOne({ pin, role: 'user', status: 'active' });
  if (!user) throw notFound('No one has that Task Pin');
  return user;
}

router.get('/', async (req, res) => {
  const me = req.user._id;
  const links = await Contact.find(involving(me)).sort({ updatedAt: -1 }).lean();
  const people = await User.find({ _id: { $in: links.map((l) => otherOf(l, me)) } }).lean();
  const byId = new Map(people.map((p) => [String(p._id), p]));

  const contacts = [];
  const incoming = [];
  const outgoing = [];
  for (const l of links) {
    const other = byId.get(String(otherOf(l, me)));
    if (!other) continue;
    if (l.status === 'accepted') {
      contacts.push({ id: String(l._id), person: person(other), since: l.acceptedAt });
    } else if (String(l.requestedBy) === String(me)) {
      outgoing.push({ id: String(l._id), person: person(other), at: l.createdAt });
    } else {
      incoming.push({ id: String(l._id), person: person(other), at: l.createdAt });
    }
  }
  contacts.sort((x, y) => x.person.name.localeCompare(y.person.name));
  res.json({ contacts, incoming, outgoing });
});

router.post('/', async (req, res) => {
  const body = parse(z.object({ pin: z.string({ required_error: 'Enter a Task Pin' }) }), req.body);
  const other = await findByPin(body.pin);
  if (String(other._id) === String(req.user._id)) throw badRequest("That's your own Task Pin");

  const pair = pairOf(req.user._id, other._id);
  const existing = await Contact.findOne(pair);
  if (existing?.status === 'accepted') throw conflict("You're already contacts");
  if (existing && String(existing.requestedBy) === String(req.user._id)) {
    throw conflict("You've already sent a request. They need to accept it.");
  }

  if (existing) {
    // They asked first: asking back is a yes.
    existing.status = 'accepted';
    existing.acceptedAt = new Date();
    await existing.save();
    notify([other._id], {
      title: `${req.user.name} accepted your contact request`,
      body: 'You can now give each other tasks.',
      link: '/contacts',
      kind: 'contact',
    });
    return res.json({
      status: 'accepted',
      contact: { id: String(existing._id), person: person(other), since: existing.acceptedAt },
    });
  }

  let link;
  try {
    link = await Contact.create({ ...pair, requestedBy: req.user._id });
  } catch (err) {
    if (err?.code === 11000) throw conflict("You've already sent a request. They need to accept it.");
    throw err;
  }
  notify([other._id], {
    title: `${req.user.name} wants to add you as a contact`,
    body: `Task Pin ${publicUser(req.user).pinDisplay}. Accept to give each other tasks.`,
    link: '/contacts',
    kind: 'contact',
  });
  res.status(201).json({
    status: 'requested',
    request: { id: String(link._id), person: person(other), at: link.createdAt },
  });
});

/** A request sent TO me that is still waiting. */
async function incomingRequest(req) {
  const link = await Contact.findOne({ _id: idParam(req.params.id), ...involving(req.user._id), status: 'pending' });
  if (!link || String(link.requestedBy) === String(req.user._id)) throw notFound('Request not found');
  return link;
}

router.post('/:id/accept', async (req, res) => {
  const link = await incomingRequest(req);
  link.status = 'accepted';
  link.acceptedAt = new Date();
  await link.save();
  const other = await User.findById(otherOf(link, req.user._id));
  notify([other._id], {
    title: `${req.user.name} accepted your contact request`,
    body: 'You can now give each other tasks.',
    link: '/contacts',
    kind: 'contact',
  });
  res.json({ contact: { id: String(link._id), person: person(other), since: link.acceptedAt } });
});

router.post('/:id/decline', async (req, res) => {
  const link = await incomingRequest(req);
  await Contact.deleteOne({ _id: link._id });
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const result = await Contact.deleteOne({ _id: idParam(req.params.id), ...involving(req.user._id) });
  if (!result.deletedCount) throw notFound('Contact not found');
  res.json({ ok: true });
});

module.exports = router;
module.exports.findByPin = findByPin;
