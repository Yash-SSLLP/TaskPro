/**
 * Sign-in identifiers.
 *
 * People sign in with whichever they have: an email address, a mobile number,
 * or a username (for staff with neither, and for the platform Super Admin).
 * All three are unique across the whole platform, so a login never has to ask
 * "which business?".
 */
const config = require('../config');
const { badRequest } = require('./errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Mobile number → digits with country code, e.g. "9876543210" → "919876543210". */
function normalizePhone(raw) {
  const hasPlus = String(raw).trim().startsWith('+');
  let digits = String(raw).replace(/\D/g, '');
  if (!hasPlus) {
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 10) digits = config.defaultCountryCode + digits;
  }
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

/**
 * Classify a typed identifier.
 * @returns {{ type: 'email'|'phone'|'username', value: string } | null}
 */
function parseIdentifier(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.includes('@')) {
    const email = s.toLowerCase();
    return EMAIL_RE.test(email) ? { type: 'email', value: email } : null;
  }
  if (/^[+\d][\d\s-]{6,}$/.test(s)) {
    const phone = normalizePhone(s);
    return phone ? { type: 'phone', value: phone } : null;
  }
  const username = s.toLowerCase();
  return USERNAME_RE.test(username) ? { type: 'username', value: username } : null;
}

/** Like parseIdentifier, but throws a friendly 400 and can restrict types. */
function requireIdentifier(raw, allowed = ['email', 'phone', 'username']) {
  const id = parseIdentifier(raw);
  const labels = { email: 'email', phone: 'mobile number', username: 'username' };
  const names = allowed.map((t) => labels[t]);
  const expected = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0];
  if (!id || !allowed.includes(id.type)) {
    throw badRequest(`Enter a valid ${expected}`);
  }
  return id;
}

/** Mongo filter for a parsed identifier. */
const identifierFilter = (id) => ({ [id.type]: id.value });

/** How to show a phone number: "919876543210" → "+91 98765 43210". */
function formatPhone(digits) {
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

module.exports = { parseIdentifier, requireIdentifier, identifierFilter, normalizePhone, formatPhone };
