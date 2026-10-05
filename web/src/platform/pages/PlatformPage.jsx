/**
 * The Super Admin console (inside the app layout): platform numbers, every
 * person (disable / enable, reset a password, see or give their tasks) and
 * every team.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Copy, ExternalLink, KeyRound, ListChecks, Search, Send, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, qs } from '../api';
import { formatDate, formatDateTime, timeAgo } from '../format';
import { copyText, pinOf } from '../pin';
import { useTz } from '../session';
import { Avatar, Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, Segmented, Skeleton, useConfirm } from '../ui';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'people', label: 'People' },
  { value: 'teams', label: 'Teams' },
];

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const ROLE_TONE = { owner: 'brand', admin: 'blue', member: 'neutral' };

const loginOf = (u) => u?.email || u?.phoneDisplay || u?.username || '';

/** A temporary password: 10 characters with no look-alikes (0/O, 1/l/I). */
export function tempPassword(length = 10) {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = '';
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Stat({ label, value, tone }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className={clsx('tnum mt-1 text-2xl font-bold', tone || 'text-ink')}>{value ?? '–'}</p>
    </Card>
  );
}

function MiniStat({ label, value, tone }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={clsx('tnum text-lg font-bold', tone || 'text-ink')}>{value ?? 0}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  return status === 'disabled' ? <Badge tone="red">Disabled</Badge> : <Badge tone="green">Active</Badge>;
}

function TableSkeleton({ cols }) {
  return Array.from({ length: 5 }, (_, i) => (
    <tr key={i}>
      <td className="px-4 py-3" colSpan={cols}>
        <Skeleton className="h-5" />
      </td>
    </tr>
  ));
}

const th = 'px-4 py-3 font-semibold';

// --------------------------------------------------------------- overview

function Overview() {
  const { data, error, refetch } = useQuery({ queryKey: ['platform', 'overview'], queryFn: () => api.get('/api/platform/overview') });
  if (error)
    return (
      <Card>
        <ErrorState error={error} onRetry={refetch} />
      </Card>
    );
  const t = data?.tasks || {};
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">People</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="People" value={data?.users} />
          <Stat label="Active this week" value={data?.activeWeek} />
          <Stat label="New this week" value={data?.newWeek} />
          <Stat label="Disabled" value={data?.disabled} tone={data?.disabled ? 'text-red-600' : undefined} />
          <Stat label="Teams" value={data?.teams} />
        </div>
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Tasks</h2>
          <Button size="sm" variant="soft" icon={ListChecks} to="/tasks?scope=all">
            Open all tasks
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Total" value={data && t.total} />
          <Stat label="Open" value={data && t.open} />
          <Stat label="Overdue" value={data && t.overdue} tone={t.overdue ? 'text-red-600' : undefined} />
          <Stat label="In review" value={data && t.inReview} tone={t.inReview ? 'text-amber-600' : undefined} />
          <Stat label="Completed" value={data && t.completed} tone={t.completed ? 'text-emerald-700' : undefined} />
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------- people

function PersonDrawer({ id, onClose }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const tz = useTz();
  const [temp, setTemp] = useState('');
  const { data, error, refetch } = useQuery({ queryKey: ['platform', 'user', id], queryFn: () => api.get(`/api/platform/users/${id}`) });
  const user = data?.user;
  const stats = data?.stats || {};

  const toggle = useMutation({
    mutationFn: (status) => api.patch(`/api/platform/users/${id}`, { status }),
    onSuccess: (res, status) => {
      if (res?.user) qc.setQueryData(['platform', 'user', id], (old) => (old ? { ...old, user: res.user } : old));
      qc.invalidateQueries({ queryKey: ['platform'] });
      toast.success(status === 'disabled' ? `${user?.name} is disabled` : `${user?.name} can sign in again`);
    },
    onError: (e) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: (password) => api.post(`/api/platform/users/${id}/password`, { password }).then(() => password),
    onSuccess: (password) => {
      setTemp(password);
      toast.success('Temporary password set');
    },
    onError: (e) => toast.error(e.message),
  });

  const disable = async () => {
    const ok = await confirm({
      title: `Disable ${user.name}?`,
      text: "They are signed out and can't sign in until you enable them. Nothing is deleted.",
      confirmLabel: 'Disable',
      tone: 'danger',
    });
    if (ok) toggle.mutate('disabled');
  };

  const resetPassword = async () => {
    const ok = await confirm({
      title: `Reset ${user.name}'s password?`,
      text: 'A temporary password is set and shown to you once. Their current password stops working.',
      confirmLabel: 'Reset password',
      tone: 'primary',
    });
    if (ok) reset.mutate(tempPassword());
  };

  return (
    <Drawer open onClose={onClose} title={user?.name || 'Person'} subtitle={user && (user.title || (user.role === 'superadmin' ? 'Super Admin' : undefined))}>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !user ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0">
              <p className="font-mono text-lg font-bold tracking-[0.1em] text-ink">{pinOf(user) || '—'}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <StatusBadge status={user.status} />
                {user.role === 'superadmin' && <Badge tone="brand">Super Admin</Badge>}
                {user.mustChangePassword && <Badge tone="amber">Must change password</Badge>}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ['Email', user.email],
              ['Mobile', user.phoneDisplay || user.phone],
              ['Username', user.username],
              ['Joined', user.createdAt && formatDate(user.createdAt, tz)],
              ['Last seen', user.lastSeenAt ? formatDateTime(user.lastSeenAt, tz) : 'Never'],
              ['Contacts', data.contacts ?? 0],
            ]
              .filter(([, v]) => v !== undefined && v !== null && v !== '')
              .map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-ink-soft">{k}</dt>
                  <dd className="truncate font-medium text-ink">{v}</dd>
                </div>
              ))}
          </dl>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Open" value={stats.open} />
            <MiniStat label="Given" value={stats.given} />
            <MiniStat label="Overdue" value={stats.overdue} tone={stats.overdue ? 'text-red-600' : undefined} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" icon={ListChecks} to={`/tasks?scope=all&assignedTo=${user.id}`}>
              Their tasks
            </Button>
            <Button size="sm" variant="secondary" icon={Send} to={`/tasks?scope=all&assign=1&onBehalfOf=${user.id}`}>
              Give a task on their behalf
            </Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Teams ({data.teams?.length || 0})</h3>
            {data.teams?.length ? (
              <div className="divide-y divide-line rounded-xl border border-line">
                {data.teams.map((t) => (
                  <Link key={t.id} to={`/teams/${t.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50">
                    <span className="truncate text-sm font-medium text-ink">{t.name}</span>
                    <Badge tone={ROLE_TONE[t.role] || 'neutral'}>{ROLE_LABEL[t.role] || t.role}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Not in any team.</p>
            )}
          </div>

          {user.role !== 'superadmin' && (
            <div className="space-y-3 rounded-xl border border-line p-4">
              <h3 className="text-sm font-semibold text-ink">Account</h3>
              {temp && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">Temporary password</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="tnum min-w-0 flex-1 select-all break-all font-mono text-lg font-bold tracking-wider text-ink">{temp}</code>
                    <Button size="sm" variant="secondary" icon={Copy} onClick={() => copyText(temp, 'Password copied')}>
                      Copy
                    </Button>
                  </div>
                  <p className="mt-1.5 text-xs text-amber-800">They must choose a new one when they sign in. It isn't shown again.</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={KeyRound} loading={reset.isPending} onClick={resetPassword}>
                  Reset password
                </Button>
                {user.status === 'disabled' ? (
                  <Button size="sm" variant="soft" icon={UserCheck} loading={toggle.isPending} onClick={() => toggle.mutate('active')}>
                    Enable
                  </Button>
                ) : (
                  <Button size="sm" variant="danger-soft" icon={UserX} loading={toggle.isPending} onClick={disable}>
                    Disable
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function People() {
  const tz = useTz();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
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
      </div>

      <Card className="overflow-hidden">
        {list.error && <ErrorState error={list.error} onRetry={list.refetch} />}
        {list.data && users.length === 0 && (
          <EmptyState icon={Users} title={q || status ? 'No one matches' : 'No one yet'} text={q || status ? 'Try another search.' : 'People appear here when they sign up.'} />
        )}
        {(list.isLoading || users.length > 0) && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-ink-soft">
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
                    onClick={() => setOpen(u.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(u.id))}
                    className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">
                            {u.name}
                            {u.role === 'superadmin' && <Badge tone="brand" className="ml-1.5">Super Admin</Badge>}
                          </p>
                          {u.title && <p className="truncate text-xs text-ink-soft">{u.title}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono tracking-wide text-ink">{pinOf(u) || '—'}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-ink-soft">{loginOf(u) || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.status} />
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
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{u.lastSeenAt ? timeAgo(u.lastSeenAt, tz) : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <PersonDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ teams

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
      toast.success('Team deleted');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const del = async () => {
    const ok = await confirm({
      title: `Delete ${team.name}?`,
      text: 'Its tasks stay, just no longer filed under a team. Everyone is removed from it. This cannot be undone.',
      confirmLabel: 'Delete team',
      tone: 'danger',
    });
    if (ok) remove.mutate();
  };

  const members = team?.members || [];
  return (
    <Drawer
      open
      onClose={onClose}
      title={team?.name || 'Team'}
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
              Open team page
            </Button>
            <Button size="sm" variant="secondary" icon={ListChecks} to={`/tasks?scope=all&team=${team.id}`}>
              Team's tasks
            </Button>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Members ({members.length})</h3>
            <div className="divide-y divide-line rounded-xl border border-line">
              {members.length === 0 && <p className="p-3 text-sm text-ink-soft">No members.</p>}
              {members.map((m) => (
                <div key={m.person?.id} className="flex items-center gap-3 p-3">
                  <Avatar name={m.person?.name} size="sm" />
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
          <div className="rounded-xl border border-red-100 p-4">
            <p className="text-sm text-ink-soft">Deleting a team keeps its tasks; they are just no longer filed under it.</p>
            <Button className="mt-3" size="sm" variant="danger-soft" icon={Trash2} loading={remove.isPending} onClick={del}>
              Delete team
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Teams() {
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
        placeholder="Search teams"
        prefix={<Search className="h-4 w-4" />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search teams"
      />
      <Card className="overflow-hidden">
        {list.error && <ErrorState error={list.error} onRetry={list.refetch} />}
        {list.data && teams.length === 0 && (
          <EmptyState icon={Users} title={q ? 'No team matches' : 'No teams yet'} text={q ? 'Try another search.' : 'Teams appear here when people create them.'} />
        )}
        {(list.isLoading || teams.length > 0) && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className={th}>Team</th>
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
                    className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
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

// ------------------------------------------------------------------- page

export function PlatformPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = (value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'overview') next.delete('tab');
        else next.set('tab', value);
        return next;
      },
      { replace: true }
    );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Console" subtitle="Everyone on Task Pro, their teams and their tasks" />
      <div className="max-w-full overflow-x-auto">
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'people' && <People />}
      {tab === 'teams' && <Teams />}
    </div>
  );
}
