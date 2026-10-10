/**
 * Task Pins: how they look, how they are typed, and how they are shared.
 *
 * A pin is 8 characters from 23456789ABCDEFGHJKLMNPQRSTUVWXYZ, stored without a
 * dash and shown as 7KQ4-M9XA. Typing is forgiving (case, spaces and dashes are
 * ignored) — the server normalises too; this only helps the input look right.
 */
import { toast } from 'sonner';
import { product } from '../product/config';

const ALPHABET = /[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g;

/** "7kq4 m9-xa" → "7KQ4M9XA" (letters outside the alphabet dropped). */
export const cleanPin = (text) => String(text || '').toUpperCase().replace(ALPHABET, '').slice(0, 8);

/** "7KQ4M9XA" → "7KQ4-M9XA" (partial pins are shown as typed so far). */
export function formatPin(text) {
  const p = cleanPin(text);
  return p.length > 4 ? `${p.slice(0, 4)}-${p.slice(4)}` : p;
}

export const isFullPin = (text) => cleanPin(text).length === 8;

/** The pin to show for a person or user object. */
export const pinOf = (person) => person?.pinDisplay || (person?.pin ? formatPin(person.pin) : '');

// `product` is read when called: product/config imports pages that import this file.
export const shareMessage = (pinDisplay) => `Add me on ${product.name}. My Task Pin is ${pinDisplay}`;

export const whatsappUrl = (pinDisplay) => `https://wa.me/?text=${encodeURIComponent(shareMessage(pinDisplay))}`;

/** Copy text to the clipboard, with a toast either way. */
export async function copyText(text, done = 'Copied') {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    toast.success(done);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it yourself.");
  }
}
