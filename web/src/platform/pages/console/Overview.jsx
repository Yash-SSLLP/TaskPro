/**
 * The console's first tab: people (and who is online right now), teams,
 * tasks, and how many people are on the newest app.
 */
import { useQuery } from '@tanstack/react-query';
import { Activity, ListChecks, Smartphone, Wifi } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, ErrorState } from '../../ui';
import { freshness, Stat, useRelease } from './shared';

export function Overview({ onTab }) {
  const { data, error, refetch } = useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: () => api.get('/api/platform/overview'),
    refetchInterval: 30_000,
  });
  const release = useRelease().data;
  if (error)
    return (
      <Card>
        <ErrorState error={error} onRetry={refetch} />
      </Card>
    );
  const t = data?.tasks || {};
  const app = data?.app || {};
  const latest = release && app.builds ? app.builds.filter((b) => freshness(b, release) === 'latest').reduce((n, b) => n + b.people, 0) : null;
  const behind = release && app.builds ? app.builds.filter((b) => freshness(b, release) === 'behind').reduce((n, b) => n + b.people, 0) : null;

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">People</h2>
          <Button size="sm" variant="soft" icon={Activity} onClick={() => onTab('activity')}>
            Activity log
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat
            label="Online now"
            icon={Wifi}
            value={data?.online}
            tone={data?.online ? 'text-emerald-700' : undefined}
            sub={data ? `${data.onlineDevices || 0} device${data.onlineDevices === 1 ? '' : 's'}` : undefined}
            onClick={() => onTab('online')}
          />
          <Stat label="People" value={data?.users} onClick={() => onTab('people')} />
          <Stat label="Active this week" value={data?.activeWeek} />
          <Stat label="New this week" value={data?.newWeek} />
          <Stat label="Disabled" value={data?.disabled} tone={data?.disabled ? 'text-red-600' : undefined} />
          <Stat label="Teams" value={data?.teams} onClick={() => onTab('teams')} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">The app</h2>
          {release && <p className="text-xs text-ink-soft">Latest release: PinTask {release.versionName} (build {release.versionCode})</p>}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="On the latest" icon={Smartphone} value={latest ?? (data ? app.app : undefined)} tone={latest ? 'text-emerald-700' : undefined} onClick={() => onTab('versions', 'latest')} />
          <Stat label="Out of date" value={behind ?? '–'} tone={behind ? 'text-amber-700' : undefined} onClick={() => onTab('versions', 'behind')} />
          <Stat label="Web only" value={data && app.web} onClick={() => onTab('versions', 'web')} />
          <Stat label="Never reported" value={data && (app.unknown || 0) + (app.none || 0)} sub="Older app, or not signed in" onClick={() => onTab('versions', 'never')} />
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
