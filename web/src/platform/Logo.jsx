/**
 * The product mark (the tile in /public/logo.svg) and wordmark. PinTask's
 * wordmark carries one touch of the accent: the dot of its "i" is the red of
 * the check in the mark.
 */
import clsx from 'clsx';
import { product } from '../product/config';

/** The name, set as a wordmark. Falls back to plain text for other products. */
export function Wordmark({ className }) {
  const name = product.name || '';
  const at = name === 'PinTask' ? 1 : -1;
  if (at < 0) return <span className={clsx('font-bold tracking-tight', className)}>{name}</span>;
  return (
    <span className={clsx('font-semibold tracking-[-0.02em]', className)} aria-label={name}>
      <span aria-hidden>
        {name.slice(0, at)}
        <span className="relative inline-block leading-none">
          {/* A dotless i, with the dot laid on in the accent where Inter puts
              its own (centred 0.69em above the baseline, measured against Inter
              with line-height 1 on this box). */}
          {'ı'}
          <span className="absolute left-1/2 top-[0.056em] h-[0.17em] w-[0.17em] -translate-x-1/2 rounded-full bg-brand-accent" />
        </span>
        {name.slice(at + 1)}
      </span>
    </span>
  );
}

export function Logo({ size = 32, withName = true, className, nameClassName }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <img src="/logo.svg" width={size} height={size} alt="" className="shrink-0 drop-shadow-sm" />
      {withName && <Wordmark className={clsx('text-lg text-ink', nameClassName)} />}
    </span>
  );
}
