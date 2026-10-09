/**
 * The product mark (the tile in /public/logo.svg) and wordmark. KARO's
 * wordmark is set in capitals with a little air between them.
 */
import clsx from 'clsx';
import { product } from '../product/config';

/** The name, set as a wordmark. */
export function Wordmark({ className }) {
  return <span className={clsx('font-bold tracking-[0.06em]', className)}>{product.name || ''}</span>;
}

export function Logo({ size = 32, withName = true, className, nameClassName }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <img src="/logo.svg" width={size} height={size} alt="" className="shrink-0 drop-shadow-sm" />
      {withName && <Wordmark className={clsx('text-lg text-ink', nameClassName)} />}
    </span>
  );
}
