/**
 * Invite links: one link with my Task Pin in it that gets the app and joins.
 *
 *   https://<server>/join/7KQ4-M9XA          add me as a contact
 *   https://<server>/join/7KQ4-M9XA?w=<sig>  …and we may WhatsApp each other
 *
 * The server signs the WhatsApp part (GET /api/contacts/invite). The link's
 * web page offers the app; the app opens it straight away when installed
 * (Android App Links, or taskpro://join/…), and a new install finds it on the
 * clipboard, where the page put it before the download.
 *
 * Also: opening a WhatsApp chat with one person, the message typed in.
 */
import { Linking, Share } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import productConfig from '../product/config';
import { tr } from '../i18n';
import { api, getApiUrl } from './api';
import { pinOf } from './pin';

/** "…/join/7KQ4-M9XA?w=abc…" anywhere in a text → "/join/7KQ4-M9XA?w=abc", or null. */
export function joinPathIn(text) {
  const m = /\/join\/([2-9A-HJ-NP-Z]{4}-?[2-9A-HJ-NP-Z]{4})(?:\?w=([A-Za-z0-9_-]{6,40}))?/i.exec(String(text || ''));
  return m ? `/join/${m[1].toUpperCase()}${m[2] ? `?w=${m[2]}` : ''}` : null;
}

/** My invite link, with or without WhatsApp ('' while it loads). */
export function useInviteLink(whatsapp) {
  const q = useQuery({
    queryKey: ['contacts', 'invite', !!whatsapp],
    queryFn: () => api.get('/api/contacts/invite', { query: whatsapp ? { whatsapp: '1' } : {} }),
    staleTime: Infinity,
  });
  return q.data?.path ? `${getApiUrl()}${q.data.path}` : '';
}

export function inviteMessage(user, url, whatsapp) {
  const lines = [
    tr('{name} invited you to {app}, so we can give each other tasks.', { name: user?.name || '', app: productConfig.name }),
    tr('Tap to join (it gets you the app too): {url}', { url }),
  ];
  if (pinOf(user)) lines.push(tr('Or add my Task Pin: {pin}', { pin: pinOf(user) }));
  if (whatsapp) lines.push(tr('We can also WhatsApp each other about our tasks.'));
  return lines.join('\n');
}

/** The phone's share sheet. */
export const shareText = (message) => Share.share({ message }).catch(() => {});

/**
 * WhatsApp with the message typed in: a chat with `phone` (digits with
 * country code), or WhatsApp's own "send to…" with none. The share sheet if
 * WhatsApp is not there.
 */
export async function openWhatsapp(text, phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  const msg = encodeURIComponent(text);
  try {
    await Linking.openURL(`whatsapp://send?${digits ? `phone=${digits}&` : ''}text=${msg}`);
  } catch {
    try {
      await Linking.openURL(`https://wa.me/${digits}?text=${msg}`);
    } catch {
      shareText(text);
    }
  }
}
