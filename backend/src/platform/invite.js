/**
 * Invite links: one link that carries a Task Pin, gets the app, and joins.
 *
 *   /join/7KQ4-M9XA            add me as a contact
 *   /join/7KQ4-M9XA?w=<sig>    …and we may WhatsApp each other about tasks
 *
 * The `w` part is signed by the server, so someone handed a plain link can't
 * add it themselves and see the inviter's mobile number. The signature only
 * depends on the pin, so one person's WhatsApp link is always the same link.
 */
const crypto = require('node:crypto');
const config = require('../config');
const { formatPin, normalizePin } = require('./pin');

const SIG_LENGTH = 12;

const sign = (pin) =>
  crypto.createHmac('sha256', config.jwtSecret).update(`invite:whatsapp:${pin}`).digest('base64url').slice(0, SIG_LENGTH);

/** The in-app path of my invite link (apps put their own address in front). */
function invitePath(pin, { whatsapp = false } = {}) {
  return `/join/${formatPin(pin)}${whatsapp ? `?w=${sign(pin)}` : ''}`;
}

/** Whether `w` is this pin's WhatsApp signature. */
function allowsWhatsapp(rawPin, w) {
  const pin = normalizePin(rawPin);
  if (!pin || typeof w !== 'string' || w.length !== SIG_LENGTH) return false;
  return crypto.timingSafeEqual(Buffer.from(sign(pin)), Buffer.from(w));
}

module.exports = { invitePath, allowsWhatsapp };
