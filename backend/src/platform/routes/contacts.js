/**
 * /api/contacts: adding people by Task Pin, BBM style.
 *
 * Asking sends a request; the other person accepts or declines. If they had
 * already asked you, asking back simply accepts. Either side can remove the
 * contact later; that doesn't touch tasks already given.
 *
 * Invite links (platform/invite.js) do it in one step: the link is the
 * inviter's ask, so joining through it makes the two contacts straight away,
 * and a WhatsApp invite also lets them WhatsApp each other about tasks.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../../config');
const User = require('../models/User');
const Contact = require('../models/Contact');
const { publicUser } = require('../models/User');
const { pairOf, involving, otherOf } = require('../models/Contact');
const { protect, requirePerson } = require('../auth');
const { z, parse, idParam } = require('../validate');
const { normalizePin } = require('../pin');
const { invitePath, allowsWhatsapp } = require('../invite');
const { badRequest, notFound, conflict } = require('../errors');
const { notify } = require('../services/notify');
const activity = require('../services/activity');

const router = express.Router();

const person = (u) => publicUser(u, { full: false });

// The invite page is public (it is opened before signing up), so it is
// slowed down like sign-in: it says whose pin a pin is.
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10_000 : 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

/** GET /invite/:pin?w= — who sent this invite link (public). */
router.get('/invite/:pin', inviteLimiter, async (req, res) => {
  const pin = normalizePin(req.params.pin);
  const user = pin ? await User.findOne({ pin, role: 'user', status: 'active' }).lean() : null;
  if (!user) throw notFound('This invite link is not valid any more');
  res.json({ inviter: person(user), whatsapp: allowsWhatsapp(pin, req.query.w) });
});

router.use(protect, requirePerson);

/** GET /invite?whatsapp=1 — my invite link's path (each app adds its address). */
router.get('/invite', async (req, res) => {
  const whatsapp = req.query.whatsapp === '1' || req.query.whatsapp === 'true';
  res.json({ path: invitePath(req.user.pin, { whatsapp }), whatsapp, pinDisplay: publicUser(req.user).pinDisplay });
});

/** The other person on a link, as an activity target (one small read). */
async function otherTarget(link, me) {
  const other = await User.findById(otherOf(link, me)).select('name').lean();
  return other ? activity.personTarget(other) : undefined;
}

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
      contacts.push({ id: String(l._id), person: person(other), since: l.acceptedAt, whatsapp: !!l.whatsapp });
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
    await activity.record({ req, action: 'contact.accepted', target: activity.personTarget(other), meta: { askedBack: true } });
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
  await activity.record({ req, action: 'contact.requested', target: activity.personTarget(other) });
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

/**
 * POST /join { pin, w? } — through someone's invite link. Contacts at once
 * (or already); a valid `w` also switches on WhatsApp reminders for the pair.
 */
router.post('/join', async (req, res) => {
  const body = parse(z.object({ pin: z.string({ required_error: 'Enter a Task Pin' }), w: z.string().max(40).optional() }), req.body);
  const other = await findByPin(body.pin);
  if (String(other._id) === String(req.user._id)) throw badRequest("That's your own invite link. Send it to someone else.");
  const whatsapp = allowsWhatsapp(other.pin, body.w);

  const pair = pairOf(req.user._id, other._id);
  let link = await Contact.findOne(pair);
  const already = link?.status === 'accepted';
  const whatsappBefore = !!link?.whatsapp;
  if (!link) link = new Contact({ ...pair, requestedBy: other._id });
  if (!already) {
    link.status = 'accepted';
    link.acceptedAt = new Date();
  }
  if (whatsapp) link.whatsapp = true;
  try {
    await link.save();
  } catch (err) {
    // Both joined at the same moment: the other save won, so build on it.
    if (err?.code !== 11000) throw err;
    link = await Contact.findOne(pair);
    link.status = 'accepted';
    link.acceptedAt ||= new Date();
    if (whatsapp) link.whatsapp = true;
    await link.save();
  }

  const turnedOn = link.whatsapp && !whatsappBefore;
  if (!already || turnedOn) {
    await activity.record({ req, action: 'contact.joined', target: activity.personTarget(other), meta: { whatsapp: !!link.whatsapp, already } });
    notify([other._id], {
      title: already ? `${req.user.name} switched on WhatsApp reminders with you` : `${req.user.name} joined from your invite`,
      body: link.whatsapp ? 'You can give each other tasks, and WhatsApp each other about them.' : 'You can now give each other tasks.',
      link: '/contacts',
      kind: 'contact',
    });
  }
  res.json({
    status: already ? 'already' : 'accepted',
    contact: { id: String(link._id), person: person(other), since: link.acceptedAt, whatsapp: !!link.whatsapp },
  });
});

/** PATCH /:id { whatsapp: false } — stop WhatsApp reminders between us (either side). */
router.patch('/:id', async (req, res) => {
  const body = parse(z.object({ whatsapp: z.literal(false, { errorMap: () => ({ message: 'Send a new WhatsApp invite link to switch it on' }) }) }), req.body);
  const link = await Contact.findOne({ _id: idParam(req.params.id), ...involving(req.user._id), status: 'accepted' });
  if (!link) throw notFound('Contact not found');
  if (link.whatsapp !== body.whatsapp) {
    link.whatsapp = body.whatsapp;
    await link.save();
    await activity.record({ req, action: 'contact.whatsapp_off', target: await otherTarget(link, req.user._id) });
  }
  const other = await User.findById(otherOf(link, req.user._id));
  res.json({ contact: { id: String(link._id), person: person(other), since: link.acceptedAt, whatsapp: !!link.whatsapp } });
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
  await activity.record({ req, action: 'contact.accepted', target: activity.personTarget(other) });
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
  await activity.record({ req, action: 'contact.declined', target: await otherTarget(link, req.user._id) });
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const link = await Contact.findOneAndDelete({ _id: idParam(req.params.id), ...involving(req.user._id) }).lean();
  if (!link) throw notFound('Contact not found');
  const cancelled = link.status === 'pending' && String(link.requestedBy) === String(req.user._id);
  await activity.record({
    req,
    action: link.status === 'accepted' ? 'contact.removed' : cancelled ? 'contact.cancelled' : 'contact.declined',
    target: await otherTarget(link, req.user._id),
  });
  res.json({ ok: true });
});

module.exports = router;
module.exports.findByPin = findByPin;
