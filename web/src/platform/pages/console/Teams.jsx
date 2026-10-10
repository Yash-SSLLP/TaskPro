/**
 * Every organization (team): search, open one to see its members, or delete it.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ExternalLink, ListChecks, Search, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, qs } from '../../api';
import { formatDate } from '../../format';
import { pinOf } from '../../pin';
import { useTz } from '../../session';
import { Avatar, Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, Skeleton, useConfirm } from '../../ui';
import { ROLE_LABEL, ROLE_TONE, TableSkeleton, th, useDebounced } from './shared';

function TeamDrawer({ id, onClose }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const tz = useTz();
  const { data, error, refetch } = useQuery({ queryKey: ['platform', 'team', id], queryFn: () => api.get(`/api/platform/teams/${id}`) });
  const team = data?.team;
  const remove = useMutation({
    mutationFn: () => api.del(`/api/platform/teams/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.removeQueries({ queryKey: ['team', id] });
      toast.success('Organization deleted');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const del = async () => {
    const ok = await confirm({
      title: `Delete ${team.name}?`,
      text: 'Its tasks stay, just no longer filed under an organization. Everyone is removed from it. This cannot be undone.',
      confirmLabel: 'Delete organization',
      tone: 'danger',
    });
    if (ok) remove.mutate();
  };

  const members = team?.members || [];
  return (
    <Drawer
      open
      onClose={onClose}
      title={team?.name || 'Organization'}
      subtitle={team && `Created ${team.createdAt ? formatDate(team.createdAt, tz) : ''}${team.owner ? ` · Owner ${team.owner.name}` : ''}`}
    >
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !team ? (
        <div className="space-y-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-6">
          {team.description && <p className="whitespace-pre-line text-[15px] text-ink-soft">{team.description}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" icon={ExternalLink} to={`/teams/${team.id}`}>
              Open organization page
            </Button>
            <Button size="sm" variant="secondary" icon={ListChecks} to={`/tasks?scope=all&team=${team.id}`}>
              Organization's tasks
            </Button>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Members ({members.length})</h3>
            <div className="divide-y divide-line rounded-xl border border-line">
              {members.length === 0 && <p className="p-3 text-sm text-ink-soft">No members.</p>}
              {members.map((m) => (
                <div key={m.person?.id} className="flex items-center gap-3 p-3">
                  <Avatar person={m.person} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{m.person?.name}</p>
                    <p className="truncate font-mono text-xs tracking-wide text-ink-soft">{pinOf(m.person)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {m.status === 'invited' && <Badge tone="amber">Invited</Badge>}
                    <Badge tone={ROLE_TONE[m.role] || 'neutral'}>{ROLE_LABEL[m.role] || m.role}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-red-200 p-4">
            <p className="text-sm text-ink-soft">Deleting an organization keeps its tasks; they are just no longer filed under it.</p>
            <Button className="mt-3" size="sm" variant="danger-soft" icon={Trash2} loading={remove.isPending} onClick={del}>
              Delete organization
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function Teams() {
  const tz = useTz();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const query = useDebounced(q.trim());
  const list = useQuery({
    queryKey: ['platform', 'teams', query],
    queryFn: () => api.get(`/api/platform/teams${qs({ q: query })}`),
    placeholderData: (prev) => prev,
  });
  const teams = list.data?.teams || [];

  return (
    <div className="space-y-4">
      <Input
        className="w-full sm:max-w-md"
        placeholder="Search organizations"
        prefix={<Search className="h-4 w-4" />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search organizations"
      />
      <Card className="overflow-hidden">
        {list.error && <ErrorState error={list.error} onRetry={list.refetch} />}
        {list.data && teams.length === 0 && (
          <EmptyState icon={Users} title={q ? 'No organization matches' : 'No organizations yet'} text={q ? 'Try another search.' : 'Organizations appear here when people create them.'} />
        )}
        {(list.isLoading || teams.length > 0) && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-well text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className={th}>Organization</th>
                  <th className={th}>Owner</th>
                  <th className={clsx(th, 'text-right')}>Members</th>
                  <th className={th}>Created</th>
                </tr>
              </thead>
              <tbody className={clsx('divide-y divide-line', list.isFetching && !list.isLoading && 'opacity-70')}>
                {list.isLoading && <TableSkeleton cols={4} />}
                {teams.map((t) => (
                  <tr
                    key={t.id}
                    tabIndex={0}
                    onClick={() => setOpen(t.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(t.id))}
                    className="cursor-pointer hover:bg-well focus:bg-well focus:outline-none"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{t.name}</p>
                      {t.description && <p className="max-w-[280px] truncate text-xs text-ink-soft">{t.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{t.owner?.name || '—'}</p>
                      <p className="font-mono text-xs tracking-wide text-ink-soft">{pinOf(t.owner)}</p>
                    </td>
                    <td className="tnum px-4 py-3 text-right">{t.memberCount ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{t.createdAt ? formatDate(t.createdAt, tz) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <TeamDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
