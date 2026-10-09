/**
 * Which app each person is on, from the devices they are signed in on: the
 * newest phone they use (its KARO version), else the web, else nothing.
 * "Latest" is the newest published Android build (/app/release.json).
 *
 *   On the latest    a phone on that build (or newer)
 *   Out of date      a phone on an older build: ask them to update
 *   Web only         signed in on the web, no phone
 *   Never reported   an older app that does not say its version, or not
 *                    signed in anywhere lately
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Smartphone } from 'lucide-react';
import { api } from '../../api';
import { formatDate, formatDateTime, timeAgo } from '../../format';
import { pinOf } from '../../pin';
import { useTz } from '../../session';
import { Card, EmptyState, ErrorState, Input } from '../../ui';
import { deviceLine, freshness, ListSkeleton, OnlineDot, PersonAvatar, PlatformIcon, Stat, useDebounced, useRelease, VersionTag } from './shared';

/** Which card a person falls under. */
export function bucketOf(a, latest) {
  if (a.state === 'app') return freshness(a, latest) === 'behind' ? 'behind' : 'latest';
  if (a.state === 'web') return 'web';
  return 'never';
}

const EMPTY_TEXT = {
  latest: 'Nobody is on the newest build yet.',
  behind: 'Everyone with the app is up to date.',
  web: 'Nobody uses the web only.',
  never: 'Every phone has reported its version.',
};

export function AppVersions({ filter, onFilter, onOpenPerson }) {
  const tz = useTz();
  const release = useRelease();
  const latest = release.data;
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim().toLowerCase());
  const list = useQuery({ queryKey: ['platform', 'app-versions'], queryFn: () => api.get('/api/platform/app-versions'), refetchInterval: 60_000 });
  const accounts = list.data?.accounts || [];

  const counts = useMemo(() => {
    const c = { latest: 0, behind: 0, web: 0, never: 0 };
    for (const a of accounts) c[bucketOf(a, latest)] += 1;
    return c;
  }, [accounts, latest]);

  const rows = accounts.filter((a) => {
    if (filter && bucketOf(a, latest) !== filter) return false;
    if (!query) return true;
    return `${a.name} ${a.pin} ${a.pinDisplay} ${a.deviceName} ${a.appVersion}`.toLowerCase().includes(query);
  });
  const pick = (key) => onFilter(filter === key ? '' : key);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="On the latest" value={list.data ? counts.latest : undefined} tone={counts.latest ? 'text-emerald-700' : undefined} onClick={() => pick('latest')} active={filter === 'latest'} />
        <Stat label="Out of date" value={list.data ? counts.behind : undefined} tone={counts.behind ? 'text-amber-700' : undefined} onClick={() => pick('behind')} active={filter === 'behind'} />
        <Stat label="Web only" value={list.data ? counts.web : undefined} onClick={() => pick('web')} active={filter === 'web'} />
        <Stat label="Never reported" value={list.data ? counts.never : undefined} onClick={() => pick('never')} active={filter === 'never'} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          className="w-full sm:max-w-md"
          placeholder="Search name, pin, device or version"
          prefix={<Search className="h-4 w-4" />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search app versions"
        />
        <p className="text-xs text-ink-soft">
          {latest
            ? `Latest: KARO ${latest.versionName} (build ${latest.versionCode})${latest.publishedAt ? `, published ${formatDate(latest.publishedAt, tz)}` : ''}`
            : release.isLoading
              ? ' '
              : 'No Android build has been published yet.'}
        </p>
      </div>

      {list.data?.summary?.builds?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {list.data.summary.builds.map((b) => (
            <span key={`${b.platform}-${b.appVersion}-${b.appBuild}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs text-ink">
              <PlatformIcon platform={b.platform} className="h-3.5 w-3.5" />
              <span className="tnum font-semibold">{b.appVersion}</span>
              {b.appBuild && <span className="text-ink-faint">({b.appBuild})</span>}
              <span className="text-ink-soft">
                {b.people} {b.people === 1 ? 'person' : 'people'}
              </span>
            </span>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : list.isLoading ? (
          <ListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Smartphone} title={q ? 'No one matches' : 'No one here'} text={q ? 'Try another search.' : EMPTY_TEXT[filter] || 'People appear here once they sign in.'} />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onOpenPerson(a.id)}
                className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-well focus:bg-well focus:outline-none sm:flex-nowrap sm:px-4"
              >
                <span className="flex min-w-0 flex-1 basis-52 items-center gap-3">
                  <PersonAvatar person={a} online={a.online} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{a.name}</span>
                    <span className="block truncate font-mono text-xs tracking-wide text-ink-soft">{pinOf(a)}</span>
                  </span>
                </span>
                <span className="min-w-0 flex-1 basis-40 text-sm">
                  {a.state === 'none' ? (
                    <span className="text-ink-faint">Not signed in lately</span>
                  ) : a.state === 'unknown' ? (
                    <span className="text-ink-soft" title="This device runs an older app that does not report its version.">
                      Not reported (an older app)
                    </span>
                  ) : (
                    <VersionTag s={a} latest={latest} />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 basis-40 items-center gap-1.5 text-sm text-ink-soft">
                  {a.platform && <PlatformIcon platform={a.platform} className="h-3.5 w-3.5" />}
                  <span className="truncate">{a.state === 'none' ? '—' : deviceLine(a)}</span>
                  {a.web && a.state === 'app' && <span className="shrink-0 text-xs text-ink-faint">+ web</span>}
                </span>
                <span className="flex w-36 shrink-0 items-center gap-1.5 text-sm text-ink-soft" title={a.lastSeenAt ? formatDateTime(a.lastSeenAt, tz) : undefined}>
                  <OnlineDot online={a.online} showIdle />
                  {a.online ? 'Online now' : a.lastSeenAt ? timeAgo(a.lastSeenAt, tz) : 'Never'}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
