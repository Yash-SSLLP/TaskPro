/**
 * Invite links: one link with my Task Pin in it that gets the app and joins.
 *
 *   https://<this site>/join/7KQ4-M9XA          add me as a contact
 *   https://<this site>/join/7KQ4-M9XA?w=<sig>  …and we may WhatsApp each other
 *
 * The server signs the WhatsApp part (GET /api/contacts/invite). A link opened
 * before signing in is remembered here, and opens again once signed in.
 *
 * Also: opening a WhatsApp chat with one person, the message typed in.
 */
import { useQuery } from '@tanstack/react-query';
import { product } from '../product/config';
import { api } from './api';

// Read when used: product/config imports pages that import this file.
const storageKey = () => `${product.key}.invite`;
const KEEP_MS = 7 * 24 * 3600_000;

export const JOIN_RE = /^\/join\/[^/?#]+/i;

/** My invite link, with or without WhatsApp. */
export function useInviteLink(whatsapp) {
  const q = useQuery({
    queryKey: ['contacts', 'invite', !!whatsapp],
    queryFn: () => api.get(`/api/contacts/invite${whatsapp ? '?whatsapp=1' : ''}`),
    staleTime: Infinity,
  });
  return q.data?.path ? `${window.location.origin}${q.data.path}` : '';
}

export function inviteMessage(person, url, whatsapp) {
  const lines = [
    `${person?.name || 'I'} invited you to ${product.name}, so we can give each other tasks.`,
    `Tap to join (you get the ${product.name} app too): ${url}`,
  ];
  if (person?.pinDisplay) lines.push(`Or add my Task Pin: ${person.pinDisplay}`);
  if (whatsapp) lines.push('We can also WhatsApp each other about our tasks.');
  return lines.join('\n');
}

/** Keep an invite opened before signing in (path + query). */
export function rememberInvite(path) {
  try {
    if (JOIN_RE.test(path)) localStorage.setItem(storageKey(), JSON.stringify({ path, at: Date.now() }));
  } catch {
    // Private mode: the person opens the link again after signing in.
  }
}

/** The remembered invite, once (it is forgotten on reading). */
export function takeInvite() {
  try {
    const raw = localStorage.getItem(storageKey());
    localStorage.removeItem(storageKey());
    const v = raw ? JSON.parse(raw) : null;
    return v && Date.now() - v.at < KEEP_MS && JOIN_RE.test(v.path) ? v.path : null;
  } catch {
    return null;
  }
}

/**
 * Where the signed-in app goes from /sign-in or /sign-up. The auth pages set
 * it just before storing the session: their own navigate() runs as a
 * transition, so the redirect App draws for those paths gets there first.
 */
let afterSignIn = null;
export const setAfterSignIn = (path) => {
  afterSignIn = path || null;
};
export const peekAfterSignIn = () => afterSignIn;
export const clearAfterSignIn = () => {
  afterSignIn = null;
};

/** A chat with this number (digits with country code), the message typed in. */
export const whatsappChatUrl = (phone, text) =>
  `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

/** The same message to anyone (WhatsApp asks who). */
export const whatsappShareUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
