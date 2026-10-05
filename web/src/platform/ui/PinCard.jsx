/**
 * The Task Pin, big: the card on the Contacts page, after sign-up, and in
 * Settings. Copy and Share (WhatsApp / the phone's share sheet).
 */
import clsx from 'clsx';
import { Copy, KeyRound, Share2 } from 'lucide-react';
import { copyText, pinOf, sharePin } from '../pin';
import { Button } from './Button';

export function PinCard({ person, title = 'My Task Pin', text = 'Share it so people can add you as a contact or invite you to a team.', className, compact = false }) {
  const pin = pinOf(person);
  if (!pin) return null;
  return (
    <div className={clsx('overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft via-white to-white shadow-card', className)}>
      <div className={clsx('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', compact ? 'p-4' : 'p-5 sm:p-6')}>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand">
            <KeyRound className="h-4 w-4" aria-hidden /> {title}
          </p>
          <p
            className={clsx('tnum mt-1 select-all font-mono font-bold tracking-[0.12em] text-ink', compact ? 'text-2xl' : 'text-3xl sm:text-4xl')}
            aria-label={`Task Pin ${pin.split('').join(' ')}`}
          >
            {pin}
          </p>
          {text && <p className="mt-1.5 max-w-md text-sm text-ink-soft">{text}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" icon={Copy} onClick={() => copyText(pin, 'Task Pin copied')}>
            Copy
          </Button>
          <Button icon={Share2} onClick={() => sharePin(pin)}>
            Share
          </Button>
        </div>
      </div>
    </div>
  );
}
