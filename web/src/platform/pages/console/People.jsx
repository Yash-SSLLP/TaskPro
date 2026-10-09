/**
 * Everyone on PinTask: search, filter by status, add someone, and open one
 * to see and change everything about them (PersonDrawer).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Search, UserPlus, Users } from 'lucide-react';
import { api, qs } from '../../api';
import { timeAgo } from '../../format';
import { pinOf } from '../../pin';
import { useTz } from '../../session';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Segmented } from '../../ui';
import { AddPersonModal } from './AddPersonModal';
import { loginOf, PersonAvatar, StatusBadge, TableSkeleton, th, useDebounced } from './shared';

export function People({ onOpenPerson }) {
  const tz = useTz();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const query = useDebounced(q.trim());
  const list = useQuery({
    queryKey: ['platform', 'users', query, status],
    queryFn: () => api.get(`/api/platform/users${qs({ q: query, status })}`),
    placeholderData: (prev) => prev,
  });
  const users = list.data?.users || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="min-w-0 flex-1 basis-60"
          placeholder="Search name, pin, email, mobile or username"
          prefix={<Search className="h-4 w-4" />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search people"
        />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'disabled', label: 'Disabled' },
          ]}
        />
        <Button icon={UserPlus} onClick={() => setAdding(true)}>
          Add person
        </Button>
      </div>

      <Card className="overflow-hidden">
        {list.error && <ErrorState error={list.error} onRetry={list.refetch} />}
        {list.data && users.length === 0 && (
          <EmptyState
            icon={Users}
            title={q || status ? 'No one matches' : 'No one yet'}
            text={q || status ? 'Try another search.' : 'People appear here when they sign up, or when you add them.'}
            action={
              !q &&
              !status && (
                <Button icon={UserPlus} onClick={() => setAdding(true)}>
                  Add person
                </Button>
              )
            }
          />
        )}
        {(list.isLoading || users.length > 0) && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line bg-well text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Task Pin</th>
                  <th className={th}>Login</th>
                  <th className={th}>Status</th>
                  <th className={th}>Tasks</th>
                  <th className={th}>Last seen</th>
                </tr>
              </thead>
              <tbody className={clsx('divide-y divide-line', list.isFetching && !list.isLoading && 'opacity-70')}>
                {list.isLoading && <TableSkeleton cols={6} />}
                {users.map((u) => (
                  <tr
                    key={u.id}
                    tabIndex={0}
                    onClick={() => onOpenPerson(u.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenPerson(u.id))}
                    className="cursor-pointer hover:bg-well focus:bg-well focus:outline-none"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <PersonAvatar person={u} online={u.online} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{u.name}</p>
                          {u.title && <p className="truncate text-xs text-ink-soft">{u.title}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono tracking-wide text-ink">{pinOf(u) || '—'}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-ink-soft">{loginOf(u) || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={u.status} />
                        {u.mustChangePassword && <Badge tone="amber">New password due</Badge>}
                      </div>
                    </td>
                    <td className="tnum whitespace-nowrap px-4 py-3 text-ink-soft">
                      <span title="Open (assigned to them)">{u.stats?.open ?? 0} open</span>
                      {' · '}
                      <span title="Given by them">{u.stats?.given ?? 0} given</span>
                      {' · '}
                      <span title="Overdue" className={u.stats?.overdue ? 'font-semibold text-red-600' : undefined}>
                        {u.stats?.overdue ?? 0} overdue
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                      {u.online ? <span className="font-medium text-emerald-700">Online now</span> : u.lastSeenAt ? timeAgo(u.lastSeenAt, tz) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <AddPersonModal open={adding} onClose={() => setAdding(false)} onOpenPerson={onOpenPerson} />
    </div>
  );
}
