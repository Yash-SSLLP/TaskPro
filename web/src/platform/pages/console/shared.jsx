/**
 * Pieces the console's tabs share: figures, badges, devices and app versions,
 * the published release, and an activity row.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, Bot, CheckCircle2, Globe, HelpCircle, Laptop, Monitor, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { formatDateTime, formatTime, timeAgo } from '../../format';
import { Avatar, Badge, Card, Skeleton } from '../../ui';

export const th = 'px-4 py-3 font-semibold';

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };
export const ROLE_TONE = { owner: 'brand', admin: 'blue', member: 'neutral' };

export const loginOf = (u) => u?.email || u?.phoneDisplay || u?.username || '';

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * A temporary password that is easy to read out, "kmrt-4829-xpqz": no
 * look-alikes (0/O, 1/l/I), about 60 bits of chance.
 */
export function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = '';
  while (out.length < 12) {
    for (const b of crypto.getRandomValues(new Uint8Array(24))) {
      if (b < limit && out.length < 12) out += alphabet[b % alphabet.length];
    }
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

// --------------------------------------------------------------- figures

/** A headline figure. With `onClick` it is a filter that lights up when `active`. */
export function Stat({ label, value, tone, sub, icon: Icon, onClick, active }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Card
      as={Tag}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={clsx('min-w-0 p-4 text-left', onClick && 'transition-colors hover:border-slate-300', active && 'border-brand ring-2 ring-brand/20')}
    >
      {/* Words wrap rather than cut; two lines held for every label so the
          figures line up across a row. */}
      <div className="flex items-start justify-between gap-2">
        <p className="min-h-[2.5em] text-sm leading-tight text-ink-soft">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />}
      </div>
      <p className={clsx('tnum mt-1 text-2xl font-bold', tone || 'text-ink')}>{value ?? '–'}</p>
      {sub && <p className="mt-0.5 text-xs leading-snug text-ink-faint">{sub}</p>}
    </Card>
  );
}

export function MiniStat({ label, value, tone }) {
  return (
    <div className="rounded-xl bg-well p-3">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={clsx('tnum text-lg font-bold', tone || 'text-ink')}>{value ?? 0}</p>
    </div>
  );
}

export function StatusBadge({ status }) {
  return status === 'disabled' ? <Badge tone="red">Disabled</Badge> : <Badge tone="green">Active</Badge>;
}

export function TableSkeleton({ cols }) {
  return Array.from({ length: 5 }, (_, i) => (
    <tr key={i}>
      <td className="px-4 py-3" colSpan={cols}>
        <Skeleton className="h-5" />
      </td>
    </tr>
  ));
}

export function ListSkeleton({ rows = 5 }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A small heading over a block of the drawer. */
export function SectionTitle({ children, action }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-ink">{children}</h3>
      {action}
    </div>
  );
}

// --------------------------------------------------------------- presence and devices

/** A green dot while someone is online; a grey ring otherwise (when `showIdle`). */
export function OnlineDot({ online, showIdle = false, className }) {
  if (!online && !showIdle) return null;
  return (
    <span
      className={clsx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', online ? 'bg-emerald-500 ring-2 ring-emerald-500/25' : 'border border-slate-300', className)}
      title={online ? 'Online now' : 'Not online'}
      aria-label={online ? 'Online now' : 'Not online'}
    />
  );
}

/** An avatar with the online dot on its corner. */
export function PersonAvatar({ person, size = 'sm', online }) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar person={person} size={size} />
      {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" title="Online now" />}
    </span>
  );
}

export const PLATFORM = {
  android: { label: 'Android', icon: Smartphone },
  ios: { label: 'iPhone', icon: Smartphone },
  web: { label: 'Web', icon: Monitor },
  other: { label: 'Other', icon: Laptop },
};
export const platformOf = (p) => PLATFORM[p] || PLATFORM.other;

export function PlatformIcon({ platform, className = 'h-4 w-4' }) {
  const Icon = platformOf(platform).icon;
  return <Icon className={clsx('shrink-0 text-ink-soft', className)} aria-hidden />;
}

/** "Pixel 7 · Android 14", "Chrome on Windows", or the platform's name. */
export function deviceLine(s) {
  const parts = [s?.deviceName || platformOf(s?.platform).label];
  if (s?.osVersion && !String(s.deviceName || '').includes(s.osVersion)) parts.push(s.osVersion);
  return parts.filter(Boolean).join(' · ');
}

/** When someone was last seen: "Online now" or "5 min ago". */
export const seenText = (s, tz) => (s?.online ? 'Online now' : s?.lastSeenAt ? timeAgo(s.lastSeenAt, tz) : 'Never');

// --------------------------------------------------------------- app versions

/**
 * The newest published Android build (web/public/app/release.json, served
 * beside this page), or null when nothing has been published.
 */
export function useRelease() {
  return useQuery({
    queryKey: ['app-release'],
    queryFn: async () => {
      try {
        const res = await fetch(`/app/release.json?t=${Date.now()}`, { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        const r = await res.json();
        const versionCode = Number(r?.versionCode) || 0;
        return versionCode ? { versionName: String(r.versionName || ''), versionCode, publishedAt: r.publishedAt || null } : null;
      } catch {
        return null;
      }
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** -1, 0 or 1 for two dotted versions ("1.0.10" > "1.0.9"). */
export function compareVersions(a, b) {
  const x = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  }
  return 0;
}

/**
 * Where an app build stands against the latest release: 'latest', 'behind',
 * or null when it cannot be told (no release, no version, the web).
 */
export function freshness(s, latest) {
  if (!latest || !s || (s.platform !== 'android' && s.platform !== 'ios')) return null;
  const build = Number(s.appBuild) || 0;
  if (s.platform === 'android' && build) return build >= latest.versionCode ? 'latest' : 'behind';
  if (s.appVersion && latest.versionName) return compareVersions(s.appVersion, latest.versionName) >= 0 ? 'latest' : 'behind';
  return null;
}

/** "PinTask 1.0.3 (4)" with a badge saying whether it is the latest. */
export function VersionTag({ s, latest, compact = false }) {
  const phone = s?.platform === 'android' || s?.platform === 'ios';
  if (!phone) {
    return s?.platform === 'web' ? (
      <span className="inline-flex items-center gap-1 text-ink-soft">
        <Globe className="h-3.5 w-3.5" aria-hidden />
        Web{s.appVersion ? ` ${s.appVersion}` : ''}
      </span>
    ) : (
      <span className="text-ink-faint">—</span>
    );
  }
  if (!s.appVersion) {
    return (
      <span className="inline-flex items-center gap-1 text-ink-soft" title="This phone runs an older app that does not report its version.">
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
        Not reported
      </span>
    );
  }
  const state = freshness(s, latest);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="tnum font-medium text-ink">
        {s.appVersion}
        {s.appBuild && <span className="ml-1 text-xs font-normal text-ink-faint">({s.appBuild})</span>}
      </span>
      {state === 'behind' && (
        <Badge tone="amber">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {compact ? 'Old' : 'Out of date'}
        </Badge>
      )}
      {state === 'latest' && !compact && (
        <Badge tone="green">
          <CheckCircle2 className="h-3 w-3" aria-hidden />
          Latest
        </Badge>
      )}
    </span>
  );
}

/** Push notifications on someone's phone, in words. */
export const PUSH_TEXT = {
  granted: 'Allowed on their phone',
  denied: 'Turned off on their phone',
  undetermined: 'Not asked yet on their phone',
};

// --------------------------------------------------------------- activity

export const ACTIVITY_GROUPS = [
  { value: '', label: 'Everything' },
  { value: 'auth', label: 'Sign-ins' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'people', label: 'People' },
  { value: 'admin', label: 'Admin' },
];

const TONE = { good: 'green', bad: 'red', wait: 'amber', info: 'blue', neutral: 'neutral' };

export function ActivityBadge({ badge }) {
  if (!badge?.text) return null;
  return <Badge tone={TONE[badge.tone] || 'neutral'}>{badge.text}</Badge>;
}

/** The sentence, with whoever did it in bold. */
export function Sentence({ item, className }) {
  const s = item?.summary || '';
  const who = item?.actorLabel || '';
  if (who && s.startsWith(who)) {
    return (
      <p className={clsx('break-words text-sm text-ink', className)}>
        <span className="font-semibold">{who}</span>
        {s.slice(who.length)}
      </p>
    );
  }
  return <p className={clsx('break-words text-sm text-ink', className)}>{s}</p>;
}

/** The round mark at the start of a row: the person, the system, or "someone". */
export function ActorMark({ item, size = 'sm' }) {
  if (item?.actorName) return <Avatar person={{ name: item.actorName, photoUrl: item.actorPhotoUrl }} size={size} />;
  const Icon = item?.meta?.system ? Bot : item?.action === 'auth.login_failed' ? ShieldCheck : UserRound;
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-well text-ink-soft', size === 'sm' ? 'h-8 w-8' : 'h-10 w-10')} aria-hidden>
      <Icon className="h-4 w-4" />
    </span>
  );
}

/** One line of the log: who, what, when, from where, and its badge. */
export function ActivityRow({ item, tz, onOpen, showDate = false }) {
  const where = item.platform ? platformOf(item.platform).label : '';
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-well focus:bg-well focus:outline-none">
      <ActorMark item={item} />
      <div className="min-w-0 flex-1">
        <Sentence item={item} />
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-faint">
          <span title={formatDateTime(item.at, tz)}>{showDate ? formatDateTime(item.at, tz) : formatTime(item.at, tz)}</span>
          {where && (
            <span className="inline-flex items-center gap-1">
              <PlatformIcon platform={item.platform} className="h-3 w-3" />
              {where}
            </span>
          )}
        </p>
      </div>
      <span className="shrink-0 pt-0.5">
        <ActivityBadge badge={item.badge} />
      </span>
    </button>
  );
}
