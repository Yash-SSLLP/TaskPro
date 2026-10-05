/**
 * Task Pins: the public ID people share to find each other, like a BlackBerry
 * BBM PIN.
 *
 * Eight characters from an alphabet without look-alikes (no 0/O, 1/I), so a
 * pin read out over the phone or copied from a photo comes through right.
 * Stored without the dash ("7KQ4M9XA"), shown with it ("7KQ4-M9XA"), and typed
 * any way at all: case, spaces and dashes are ignored.
 */
const crypto = require('node:crypto');

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const LENGTH = 8;
const PIN_RE = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`);

function generatePin() {
  let pin = '';
  for (let i = 0; i < LENGTH; i += 1) pin += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return pin;
}

/** Whatever was typed → the stored form, or null if it can't be a pin. */
function normalizePin(raw) {
  const s = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');
  return PIN_RE.test(s) ? s : null;
}

/** "7KQ4M9XA" → "7KQ4-M9XA". */
const formatPin = (pin) => (pin ? `${pin.slice(0, 4)}-${pin.slice(4)}` : '');

module.exports = { generatePin, normalizePin, formatPin, PIN_RE };
