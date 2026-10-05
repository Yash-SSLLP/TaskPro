/**
 * Alerts: what happened that concerns me. Opening one marks it read and goes
 * to the screen it is about.
 */
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, CheckCheck, CheckSquare, Info, Trash2, UserPlus, Users } from 'lucide-react';
import { api, qs } from '../api';
import { timeAgo } from '../format';
import { useTz } from '../session';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../ui';

const KIND_ICON = { task: CheckSquare, contact: UserPlus, team: Users, info: Info };
const KIND_TONE = {
  task: 'bg-brand-soft text-brand',
  contact: 'bg-emerald-50 text-emerald-700',
  team: 'bg-blue-50 text-blue-700',
  info: 'bg-slate-100 text-slate-600',
};

function KindIcon({ kind }) {
  const Icon = KIND_ICON[kind] || Info;
  return (
    <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', KIND_TONE[kind] || KIND_TONE.info)} aria-hidden>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

export function AlertsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tz = useTz();
  const query = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => api.get(`/api/notifications${qs({ before: pageParam })}`),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.hasMore ? last.notifications.at(-1)?.createdAt : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.notifications) || [];
  const unread = query.data?.pages[0]?.unread || 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  const markAll = useMutation({ mutationFn: () => api.post('/api/notifications/read', { all: true }), onSuccess: refresh });
  const clearRead = useMutation({ mutationFn: () => api.del('/api/notifications'), onSuccess: refresh });

  const open = (n) => {
    if (!n.read) api.post('/api/notifications/read', { ids: [n.id] }).then(refresh).catch(() => {});
    if (n.link) navigate(n.link);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Alerts"
        subtitle={unread ? `${unread} unread` : 'You are all caught up'}
        actions={
          items.length > 0 && (
            <>
              {unread > 0 && (
                <Button variant="secondary" size="sm" icon={CheckCheck} loading={markAll.isPending} onClick={() => markAll.mutate()}>
                  Mark all read
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={Trash2} loading={clearRead.isPending} onClick={() => clearRead.mutate()}>
                Clear read
              </Button>
            </>
          )
        }
      />
      <Card className="divide-y divide-line overflow-hidden">
        {query.isLoading &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        {query.error && <ErrorState error={query.error} onRetry={query.refetch} />}
        {query.data && items.length === 0 && <EmptyState icon={Bell} title="No alerts" text="When something needs your attention, it shows up here." />}
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => open(n)}
            className={clsx('flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-slate-50', !n.read && 'bg-brand-soft/40')}
          >
            <span className={clsx('mt-4 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand')} aria-hidden />
            <KindIcon kind={n.kind} />
            <div className="min-w-0 flex-1">
              <p className={clsx('text-[15px]', n.read ? 'text-ink' : 'font-semibold text-ink')}>{n.title}</p>
              {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{n.body}</p>}
              <p className="mt-1 text-xs text-ink-faint">{timeAgo(n.createdAt, tz)}</p>
            </div>
          </button>
        ))}
      </Card>
      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            Show older
          </Button>
        </div>
      )}
    </div>
  );
}
