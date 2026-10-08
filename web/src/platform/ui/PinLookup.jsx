/**
 * "Add by Task Pin": a forgiving pin box that looks the person up as soon as
 * all eight characters are in (GET /api/people/lookup?pin=) and shows who it
 * is, how they relate to you, and whatever action the caller offers.
 *
 *   <PinLookup action={({ person, relation, reset }) => <Button …/>} />
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { KeyRound, Loader2 } from 'lucide-react';
import { api, qs } from '../api';
import { cleanPin, formatPin, isFullPin, pinOf } from '../pin';
import { Avatar } from './bits';

export const RELATION_TEXT = {
  self: "That's you",
  contact: 'Already in your contacts',
  incoming: 'Has asked to add you',
  outgoing: 'Request already sent',
  none: 'Not a contact yet',
};

export const RELATION_TONE = {
  self: 'bg-slate-100 text-slate-600',
  contact: 'bg-emerald-50 text-emerald-700',
  incoming: 'bg-amber-50 text-amber-800',
  outgoing: 'bg-blue-50 text-blue-700',
  none: 'bg-slate-100 text-slate-600',
};

/** Look a pin up. Returns the react-query result (`data` = { person, relation }). */
export function usePinLookup(pin) {
  const clean = cleanPin(pin);
  return useQuery({
    queryKey: ['people', 'lookup', clean],
    queryFn: () => api.get(`/api/people/lookup${qs({ pin: clean })}`),
    enabled: isFullPin(clean),
    staleTime: 10_000,
    retry: false,
  });
}

export function PersonLine({ person, right, sub, size = 'md', you = false }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={person?.name} size={size === 'sm' ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">
          {person?.name}
          {you && <span className="ml-1 font-normal text-ink-faint">(you)</span>}
        </p>
        <p className="truncate text-sm text-ink-soft">
          <span className="font-mono tracking-wide">{pinOf(person)}</span>
          {person?.title ? ` · ${person.title}` : ''}
          {sub ? ` · ${sub}` : ''}
        </p>
      </div>
      {right}
    </div>
  );
}

export function PinLookup({ label = 'Add by Task Pin', hint, action, autoFocus, className }) {
  const [pin, setPin] = useState('');
  const lookup = usePinLookup(pin);
  const full = isFullPin(pin);

  const reset = () => setPin('');
  const notFound = full && lookup.error?.status === 404;

  return (
    <div className={clsx('space-y-3', className)}>
      <div className="space-y-1.5">
        {label && <label className="block text-sm font-medium text-ink" htmlFor="pin-lookup">{label}</label>}
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            id="pin-lookup"
            value={formatPin(pin)}
            onChange={(e) => setPin(cleanPin(e.target.value))}
            placeholder="e.g. 7KQ4-M9XA"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus={autoFocus}
            inputMode="text"
            className="tnum block h-11 w-full rounded-xl border border-line bg-card pl-10 pr-10 font-mono text-[16px] uppercase tracking-[0.15em] text-ink shadow-sm placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {lookup.isFetching && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-faint" aria-hidden />}
        </div>
        {hint && !full && <p className="text-sm text-ink-soft">{hint}</p>}
      </div>

      {notFound && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">No one has that Task Pin. Check it and try again.</p>}
      {full && lookup.error && !notFound && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{lookup.error.message}</p>}

      {full && lookup.data?.person && (
        <div className="rounded-xl border border-line bg-slate-50/70 p-3">
          <PersonLine
            person={lookup.data.person}
            right={
              <span className={clsx('hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold sm:inline-flex', RELATION_TONE[lookup.data.relation])}>
                {RELATION_TEXT[lookup.data.relation] || ''}
              </span>
            }
          />
          <p className={clsx('mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold sm:hidden', RELATION_TONE[lookup.data.relation])}>
            {RELATION_TEXT[lookup.data.relation] || ''}
          </p>
          {action && <div className="mt-3 flex flex-wrap gap-2">{action({ person: lookup.data.person, relation: lookup.data.relation, pin: cleanPin(pin), reset, refetch: lookup.refetch })}</div>}
        </div>
      )}
    </div>
  );
}
