/**
 * Who is signed in, device by device: online now (a request in the last two
 * minutes: both apps check in every minute while they are open), today, or
 * in the last 7 days. Refreshed every 10 seconds while the page is in view.
 * Any device can be signed out; so can a person, everywhere.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { LogOut, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { formatDateTime } from '../../format';
import { pinOf } from '../../pin';
import { useTz } from '../../session';
import { Badge, Button, Card, EmptyState, ErrorState, Segmented, useConfirm } from '../../ui';
import { deviceLine, ListSkeleton, OnlineDot, PersonAvatar, PlatformIcon, seenText, useRelease, VersionTag } from './shared';

const WINDOWS = (counts) => [
  { value: 'online', label: `Online now${counts ? ` · ${counts.online}` : ''}` },
  { value: 'today', label: `Today${counts ? ` · ${counts.today}` : ''}` },
  { value: '7d', label: `7 days${counts ? ` · ${counts.week}` : ''}` },
];

export function Online({ onOpenPerson }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const tz = useTz();
  const release = useRelease().data;
  const [win, setWin] = useState('online');
  const list = useQuery({
    queryKey: ['platform', 'sessions', win],
    queryFn: () => api.get(`/api/platform/sessions?window=${win}`),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });
  const rows = list.data?.sessions || [];

  const revoke = useMutation({
    mutationFn: (s) => api.post(`/api/platform/sessions/${encodeURIComponent(s.sid)}/revoke`),
    onSuccess: (_, s) => {
      qc.invalidateQueries({ queryKey: ['platform'] });
      toast.success(`${s.user.name} is signed out on that device`);
    },
    onError: (e) => toast.error(e.message),
  });
  const everywhere = useMutation({
    mutationFn: (s) => api.post(`/api/platform/users/${s.user.id}/sign-out`),
    onSuccess: (_, s) => {
      qc.invalidateQueries({ queryKey: ['platform'] });
      toast.success(`${s.user.name} is signed out everywhere`);
    },
    onError: (e) => toast.error(e.message),
  });

  const signOut = async (s) => {
    const ok = await confirm({
      title: `Sign ${s.user.name} out on ${deviceLine(s)}?`,
      text: 'That device goes back to the sign-in screen the next time it talks to KARO. Their other devices stay signed in.',
      confirmLabel: 'Sign out',
      tone: 'warning',
    });
    if (ok) revoke.mutate(s);
  };
  const signOutAll = async (s) => {
    const ok = await confirm({
      title: `Sign ${s.user.name} out everywhere?`,
      text: 'Every device they are signed in on goes back to the sign-in screen. Nothing else about the account changes.',
      confirmLabel: 'Sign out everywhere',
      tone: 'warning',
    });
    if (ok) everywhere.mutate(s);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto">
          <Segmented value={win} onChange={setWin} options={WINDOWS(list.data?.counts)} />
        </div>
        <p className="text-xs text-ink-soft">
          {list.data ? `${list.data.people} ${list.data.people === 1 ? 'person' : 'people'} on ${rows.length} device${rows.length === 1 ? '' : 's'}` : ' '}
          {' · '}updates every 10 seconds
        </p>
      </div>

      <Card className="overflow-hidden">
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : list.isLoading ? (
          <ListSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wifi}
            title={win === 'online' ? 'Nobody is online right now' : 'Nobody was signed in then'}
            text={win === 'online' ? 'Someone counts as online for two minutes after the app last checked in.' : 'Try a wider window.'}
          />
        ) : (
          <div className={clsx('divide-y divide-line', list.isFetching && !list.isLoading && 'opacity-95')}>
            {rows.map((s) => (
              <div key={s.sid} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:px-4">
                <button
                  type="button"
                  disabled={s.user.role === 'superadmin'}
                  onClick={() => onOpenPerson(s.user.id)}
                  className="flex min-w-0 flex-1 basis-56 items-center gap-3 rounded-lg text-left enabled:hover:opacity-80"
                >
                  <PersonAvatar person={s.user} online={s.online} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-semibold text-ink">{s.user.name}</span>
                      {s.user.role === 'superadmin' && <Badge tone="brand">Super Admin</Badge>}
                      {s.current && <Badge tone="blue">This device</Badge>}
                    </span>
                    <span className="block truncate font-mono text-xs tracking-wide text-ink-soft">{pinOf(s.user) || ' '}</span>
                  </span>
                </button>
                <div className="flex min-w-0 flex-1 basis-56 items-start gap-2">
                  <PlatformIcon platform={s.platform} className="mt-0.5 h-4 w-4" />
                  <div className="min-w-0 text-sm">
                    <p className="truncate text-ink">{deviceLine(s)}</p>
                    <div className="text-xs">
                      <VersionTag s={s} latest={release} compact />
                    </div>
                  </div>
                </div>
                <div className="flex min-w-[8rem] items-center gap-1.5 text-sm text-ink-soft" title={s.lastSeenAt ? formatDateTime(s.lastSeenAt, tz) : undefined}>
                  <OnlineDot online={s.online} showIdle />
                  {seenText(s, tz)}
                </div>
                {!s.current && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" icon={LogOut} onClick={() => signOut(s)}>
                      Sign out
                    </Button>
                    {s.user.role !== 'superadmin' && (
                      <Button size="sm" variant="ghost" onClick={() => signOutAll(s)}>
                        Everywhere
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
