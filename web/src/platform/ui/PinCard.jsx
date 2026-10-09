/**
 * The Task Pin, big: the card on the Contacts page, after sign-up, and in
 * Settings. Copy the pin, and send an invite link: one link with the pin in
 * it that gets the app and joins, optionally letting the two of you WhatsApp
 * each other about tasks.
 */
import { useState } from 'react';
import clsx from 'clsx';
import { Copy, KeyRound, Link2, Share2 } from 'lucide-react';
import { copyText, pinOf } from '../pin';
import { inviteMessage, useInviteLink, whatsappShareUrl } from '../invite';
import { Button } from './Button';
import { WhatsAppIcon } from './WhatsAppIcon';

/** The invite strip: the WhatsApp choice, then send or copy the link. */
function InviteLink({ person }) {
  const [whatsapp, setWhatsapp] = useState(true);
  const url = useInviteLink(whatsapp);
  const message = url ? inviteMessage(person, url, whatsapp) : '';

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    copyText(message, 'Invite copied');
  };

  return (
    <div className="border-t border-brand/15 bg-card/60 px-5 py-4 sm:px-6">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Link2 className="h-4 w-4 text-brand" aria-hidden /> Invite link
      </p>
      <p className="mt-0.5 text-sm text-ink-soft">One link: they get the app, sign up and become your contact. No pin to type.</p>
      <label className="mt-3 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={whatsapp}
          onChange={(e) => setWhatsapp(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-[#25D366]"
        />
        <span className="text-sm">
          <span className="font-medium text-ink">Let us WhatsApp each other about tasks</span>
          <span className="block text-ink-soft">You each see the other's mobile number on tasks you share. Either of you can switch it off.</span>
        </span>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={url ? whatsappShareUrl(message) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!url}
          className={clsx(
            'inline-flex h-9 items-center gap-2 rounded-xl bg-[#25D366] px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1ebe5a]',
            !url && 'pointer-events-none opacity-60'
          )}
        >
          <WhatsAppIcon className="h-[18px] w-[18px]" color="currentColor" /> Send on WhatsApp
        </a>
        <Button variant="secondary" icon={Share2} disabled={!url} onClick={share}>
          Share
        </Button>
        <Button variant="ghost" icon={Copy} disabled={!url} onClick={() => copyText(url, 'Invite link copied')}>
          Copy link
        </Button>
      </div>
    </div>
  );
}

export function PinCard({
  person,
  title = 'My Task Pin',
  text = 'Share it so people can add you as a contact or invite you to a team.',
  className,
  compact = false,
  invite = true,
}) {
  const pin = pinOf(person);
  if (!pin) return null;
  return (
    <div className={clsx('overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft via-card to-card shadow-card', className)}>
      {/* Wraps by the room the card has, not the screen: in a half-width card
          the buttons drop under the pin, and the pin itself never breaks. */}
      <div className={clsx('flex flex-wrap items-center justify-between gap-x-6 gap-y-4', compact ? 'p-4' : 'p-5 sm:p-6')}>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand">
            <KeyRound className="h-4 w-4" aria-hidden /> {title}
          </p>
          <p
            className={clsx('tnum mt-1 select-all whitespace-nowrap font-mono font-bold tracking-[0.12em] text-ink', compact ? 'text-2xl' : 'text-3xl sm:text-4xl')}
            aria-label={`Task Pin ${pin.split('').join(' ')}`}
          >
            {pin}
          </p>
          {text && <p className="mt-1.5 max-w-md text-sm text-ink-soft">{text}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" icon={Copy} onClick={() => copyText(pin, 'Task Pin copied')}>
            Copy pin
          </Button>
        </div>
      </div>
      {invite && <InviteLink person={person} />}
    </div>
  );
}
