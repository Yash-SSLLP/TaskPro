/**
 * The activity log, as the HRMS audit log reads: figures at the top (click
 * one to filter), a search, the kind of activity, one person, a date range,
 * then every entry as a sentence, grouped by day, newest first, with older
 * pages on demand. An entry opens its details (and the other entries about
 * the same task, person or team).
 */
import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity as ActivityIcon, CalendarDays, Database, History, Search, Users, X } from 'lucide-react';
import { api, qs } from '../../api';
import { dayKey, dayLabel, formatDateTime } from '../../format';
import { pinOf } from '../../pin';
import { useTz } from '../../session';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, Segmented, Select, Skeleton } from '../../ui';
import { ACTIVITY_GROUPS, ActivityBadge, ActivityRow, ActorMark, ListSkeleton, platformOf, Sentence, Stat, useDebounced } from './shared';

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'custom', label: 'Pick dates' },
];

const DAY = 86400000;

/** The from/to days ("YYYY-MM-DD", in the viewer's zone) for a preset. */
function rangeDays(range, tz) {
  const today = dayKey(new Date(), tz);
  if (range === 'today') return { from: today, to: '' };
  if (range === '7d') return { from: dayKey(new Date(Date.now() - 6 * DAY), tz), to: '' };
  if (range === '30d') return { from: dayKey(new Date(Date.now() - 29 * DAY), tz), to: '' };
  return { from: '', to: '' };
}

const REASONS = {
  wrong_password: 'Wrong password',
  no_account: 'No account with that login',
  disabled: 'The account is switched off',
  invalid: 'Not an email, a mobile number or a username',
};

/** One entry in full, with the others about the same thing. */
export function ActivityDetail({ id, onClose, onOpenPerson }) {
  const tz = useTz();
  const [current, setCurrent] = useState(id);
  const { data, error, refetch } = useQuery({ queryKey: ['platform', 'activity', 'one', current], queryFn: () => api.get(`/api/platform/activity/${current}`) });
  const e = data?.entry;
  const m = e?.meta || {};
  const changes = Array.isArray(m.changes) ? m.changes.filter((c) => c && typeof c === 'object') : [];
  const taskChanges = Array.isArray(m.changes) ? m.changes.filter((c) => typeof c === 'string') : [];
  const device = [m.deviceName, m.appVersion && `PinTask ${m.appVersion}${m.appBuild ? ` (${m.appBuild})` : ''}`, m.osVersion].filter(Boolean).join(' · ');
  const canOpen = (p) => p && p.role === 'user' && !p.deleted && onOpenPerson;

  return (
    <Drawer open onClose={onClose} title="Activity" subtitle={e ? formatDateTime(e.at, tz) : undefined} wide>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !e ? (
        <div className="space-y-3 pt-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          <div className="flex items-start gap-3">
            <ActorMark item={e} size="md" />
            <div className="min-w-0 flex-1">
              <Sentence item={e} className="text-[15px]" />
              <div className="mt-2">
                <ActivityBadge badge={e.badge} />
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-ink-soft">Who</dt>
              <dd className="font-medium text-ink">
                {data.actor ? (
                  <>
                    {data.actor.name}
                    {pinOf(data.actor) && <span className="ml-1.5 font-mono text-xs text-ink-soft">{pinOf(data.actor)}</span>}
                    {data.actor.role === 'superadmin' && (
                      <Badge tone="brand" className="ml-1.5">
                        Super Admin
                      </Badge>
                    )}
                    {canOpen(data.actor) && (
                      <button type="button" onClick={() => onOpenPerson(data.actor.id)} className="ml-2 text-xs font-semibold text-brand hover:underline">
                        Open
                      </button>
                    )}
                  </>
                ) : (
                  e.actorLabel
                )}
              </dd>
            </div>
            {e.target?.label && (
              <div className="min-w-0">
                <dt className="text-ink-soft">{{ task: 'Task', user: 'Person', team: 'Team' }[e.target.kind] || 'About'}</dt>
                <dd className="break-words font-medium text-ink">
                  {e.target.kind === 'task' ? (
                    <Link to={`/tasks/${e.target.id}`} className="text-brand hover:underline">
                      {e.target.label}
                    </Link>
                  ) : (
                    e.target.label
                  )}
                  {canOpen(data.subject) && data.subject.id !== data.actor?.id && (
                    <button type="button" onClick={() => onOpenPerson(data.subject.id)} className="ml-2 text-xs font-semibold text-brand hover:underline">
                      Open
                    </button>
                  )}
                </dd>
              </div>
            )}
            {(e.platform || e.ip) && (
              <div className="min-w-0">
                <dt className="text-ink-soft">From</dt>
                <dd className="font-medium text-ink">{[e.platform && platformOf(e.platform).label, e.ip].filter(Boolean).join(' · ')}</dd>
              </div>
            )}
            {device && (
              <div className="min-w-0">
                <dt className="text-ink-soft">Device</dt>
                <dd className="font-medium text-ink">{device}</dd>
              </div>
            )}
            {m.identifier && (
              <div className="min-w-0">
                <dt className="text-ink-soft">Login typed</dt>
                <dd className="break-all font-medium text-ink">{m.identifier}</dd>
              </div>
            )}
            {m.reason && (
              <div className="min-w-0">
                <dt className="text-ink-soft">Why it failed</dt>
                <dd className="font-medium text-ink">{REASONS[m.reason] || m.reason}</dd>
              </div>
            )}
            {m.person?.name && (
              <div className="min-w-0">
                <dt className="text-ink-soft">Person</dt>
                <dd className="font-medium text-ink">{m.person.name}</dd>
              </div>
            )}
          </dl>

          {changes.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">What changed</h3>
              <div className="divide-y divide-line rounded-xl border border-line">
                {changes.map((c, i) => (
                  <div key={i} className="grid grid-cols-1 gap-1 p-3 text-sm sm:grid-cols-[9rem_1fr]">
                    <span className="text-ink-soft">{c.label || c.field}</span>
                    <span className="min-w-0 break-words text-ink">
                      <span className="text-ink-soft line-through decoration-ink-faint">{c.before || '—'}</span>
                      <span className="mx-1.5 text-ink-faint">→</span>
                      <span className="font-medium">{c.after || '—'}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {taskChanges.length > 0 && <p className="text-sm text-ink-soft">Changed: {taskChanges.join(', ')}</p>}
          {m.note && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Note</h3>
              <p className="whitespace-pre-line rounded-xl bg-well p-3 text-sm text-ink">{m.note}</p>
            </div>
          )}

          {data.related?.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">More about {e.target?.label ? `“${e.target.label}”` : 'this'}</h3>
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {data.related.map((r) => (
                  <ActivityRow key={r.id} item={r} tz={tz} showDate onOpen={() => setCurrent(r.id)} />
                ))}
              </div>
            </div>
          )}
          <p className="font-mono text-[11px] text-ink-faint">{e.action}</p>
        </div>
      )}
    </Drawer>
  );
}

export function Activity({ user, onUser, onOpenPerson }) {
  const tz = useTz();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [range, setRange] = useState('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [open, setOpen] = useState(null);
  const query = useDebounced(q.trim());
  const days = range === 'custom' ? custom : rangeDays(range, tz);
  const filters = { q: query, group, user: user || '', from: days.from, to: days.to };
  const filtered = Boolean(query || group || user || days.from || days.to);

  const stats = useQuery({ queryKey: ['platform', 'activity', 'stats'], queryFn: () => api.get('/api/platform/activity/stats'), refetchInterval: 30_000 });
  const people = useQuery({ queryKey: ['platform', 'users', '', ''], queryFn: () => api.get('/api/platform/users'), staleTime: 60_000 });
  const list = useInfiniteQuery({
    queryKey: ['platform', 'activity', 'list', filters],
    queryFn: ({ pageParam }) => api.get(`/api/platform/activity${qs({ ...filters, before: pageParam, limit: 50 })}`),
    initialPageParam: '',
    getNextPageParam: (last) => last?.next || undefined,
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });

  const items = useMemo(() => (list.data?.pages || []).flatMap((p) => p.items || []), [list.data]);
  const groups = useMemo(() => {
    const out = [];
    for (const it of items) {
      const key = dayKey(it.at, tz);
      if (!out.length || out[out.length - 1].key !== key) out.push({ key, at: it.at, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [items, tz]);

  const s = stats.data;
  const everyone = (people.data?.users || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const chosen = everyone.find((p) => p.id === user);
  const clear = () => {
    setQ('');
    setGroup('');
    setRange('all');
    setCustom({ from: '', to: '' });
    onUser('');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Today" icon={ActivityIcon} value={s?.today} sub="since midnight" onClick={() => setRange(range === 'today' ? 'all' : 'today')} active={range === 'today'} />
        <Stat label="Last 7 days" icon={CalendarDays} value={s?.week} sub="entries" onClick={() => setRange(range === '7d' ? 'all' : '7d')} active={range === '7d'} />
        <Stat label="People" icon={Users} value={s?.people} sub="active in 7 days" />
        <Stat label="Kept" icon={Database} value={s?.total} sub="entries (180 days)" onClick={clear} active={!filtered} />
      </div>

      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="min-w-0 flex-1 basis-60"
            placeholder="Search a person, task, team or login"
            prefix={<Search className="h-4 w-4" />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the activity log"
          />
          <Select className="min-w-0 flex-1 basis-48 sm:max-w-xs" aria-label="Person" value={user || ''} onChange={(e) => onUser(e.target.value)}>
            <option value="">Everyone</option>
            {user && !chosen && <option value={user}>The chosen person</option>}
            {everyone.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {pinOf(p) ? ` (${pinOf(p)})` : ''}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="max-w-full overflow-x-auto">
            <Segmented value={group} onChange={setGroup} options={ACTIVITY_GROUPS} />
          </div>
          <div className="max-w-full overflow-x-auto">
            <Segmented value={range} onChange={setRange} options={RANGES} />
          </div>
          {filtered && (
            <Button size="sm" variant="ghost" icon={X} onClick={clear}>
              Clear filters
            </Button>
          )}
        </div>
        {range === 'custom' && (
          <div className="flex flex-wrap items-end gap-2">
            <Input label="From" type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="w-44" />
            <Input label="To" type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="w-44" />
          </div>
        )}
      </Card>

      {list.error ? (
        <Card>
          <ErrorState error={list.error} onRetry={list.refetch} />
        </Card>
      ) : list.isLoading ? (
        <Card className="overflow-hidden">
          <ListSkeleton rows={6} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={History}
            title={filtered ? 'Nothing matches these filters' : 'Nothing recorded yet'}
            text={filtered ? 'Try another search or a wider date range.' : 'Sign-ins, task moves and changes appear here as they happen.'}
            action={
              filtered && (
                <Button variant="secondary" icon={X} onClick={clear}>
                  Clear filters
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className={list.isFetching && !list.isFetchingNextPage ? 'space-y-4 opacity-90' : 'space-y-4'}>
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <h3 className="text-sm font-semibold text-ink">{dayLabel(g.at, tz)}</h3>
                <span className="text-xs text-ink-faint">
                  {g.items.length} entr{g.items.length === 1 ? 'y' : 'ies'}
                </span>
              </div>
              <Card className="divide-y divide-line overflow-hidden">
                {g.items.map((it) => (
                  <ActivityRow key={it.id} item={it} tz={tz} onOpen={() => setOpen(it.id)} />
                ))}
              </Card>
            </section>
          ))}
          <div className="flex justify-center">
            {list.hasNextPage ? (
              <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                Load older
              </Button>
            ) : (
              <p className="text-xs text-ink-faint">That is everything{filtered ? ' that matches' : ''}.</p>
            )}
          </div>
        </div>
      )}

      {open && (
        <ActivityDetail
          id={open}
          onClose={() => setOpen(null)}
          onOpenPerson={(id) => {
            setOpen(null);
            onOpenPerson(id);
          }}
        />
      )}
    </div>
  );
}
