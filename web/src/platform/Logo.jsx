/**
 * The product mark (the tile in /public/logo.svg) and wordmark.
 */
import clsx from 'clsx';
import { product } from '../product/config';

export function Logo({ size = 32, withName = true, className, nameClassName }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <img src="/logo.svg" width={size} height={size} alt="" className="shrink-0 rounded-[22%]" />
      {withName && <span className={clsx('text-lg font-bold tracking-tight text-ink', nameClassName)}>{product.name}</span>}
    </span>
  );
}
