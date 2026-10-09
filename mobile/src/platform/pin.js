/**
 * Task Pins: 8 characters from 23456789ABCDEFGHJKLMNPQRSTUVWXYZ (no 0, O, 1
 * or I), stored without a dash ("7KQ4M9XA") and shown as "7KQ4-M9XA".
 * Typing is forgiving: case, spaces and dashes are ignored.
 *
 * Also: copying my pin (invite links are in invite.js) and the words for
 * team roles.
 */
import * as Clipboard from 'expo-clipboard';
import { tr } from '../i18n';

export const PIN_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PIN_LENGTH = 8;

/** "7kq4 m9-xa" → "7KQ4M9XA" (only pin characters kept). */
export function normalizePin(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 12);
}

export function isValidPin(raw) {
  const p = normalizePin(raw);
  return p.length === PIN_LENGTH && [...p].every((c) => PIN_ALPHABET.includes(c));
}

/** Why a typed pin is not a pin yet, or null. */
export function pinProblem(raw) {
  const p = normalizePin(raw);
  if (!p) return tr('Type a Task Pin');
  if ([...p].some((c) => !PIN_ALPHABET.includes(c))) return tr('A Task Pin has no 0, O, 1 or I. Check the letters.');
  if (p.length !== PIN_LENGTH) return tr('A Task Pin has 8 letters and numbers.');
  return null;
}

/** "7KQ4M9XA" → "7KQ4-M9XA". */
export function formatPin(raw) {
  const p = normalizePin(raw);
  if (p.length <= 4) return p;
  return `${p.slice(0, 4)}-${p.slice(4, 8)}`;
}

/** What a pin field shows while it is typed: upper-case, dash after four. */
export function pinInput(text) {
  return formatPin(text).slice(0, 9);
}

/** The pin to show for a person or me (pinDisplay from the server, else formatted). */
export const pinOf = (p) => p?.pinDisplay || (p?.pin ? formatPin(p.pin) : '');

export async function copyPin(user) {
  await Clipboard.setStringAsync(pinOf(user));
}

// ---------------------------------------------------------------- team roles

export const roleLabel = (role) =>
  role === 'owner' ? tr('Owner') : role === 'admin' ? tr('Admin') : role === 'superadmin' ? tr('Super Admin') : tr('Member');
export const roleTone = (role) => (role === 'owner' ? 'primary' : role === 'admin' ? 'info' : 'neutral');
export const isTeamManager = (role) => role === 'owner' || role === 'admin';
