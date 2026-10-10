/**
 * The Super Admin console (inside the app layout), as the HRMS admin pages
 * are: everything about everyone.
 *
 *   Overview      people, who is online, the app, tasks
 *   People        everyone; add a person; open one for everything about them
 *   Online        who is signed in where, right now / today / 7 days
 *   App versions  which Karo build each person is on
 *   Activity      the log: sign-ins, task moves, changes, admin actions
 *   Teams         every organization
 *
 * The tab, the open person and the filters live in the URL
 * (?tab=activity&user=<id>, ?person=<id>, ?tab=versions&show=behind), so a
 * view can be linked and Back works. The tabs live in ./console/.
 */
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Segmented } from '../ui';
import { Activity } from './console/Activity';
import { AppVersions } from './console/AppVersions';
import { Online } from './console/Online';
import { Overview } from './console/Overview';
import { People } from './console/People';
import { PersonDrawer } from './console/PersonDrawer';
import { Teams } from './console/Teams';

export { tempPassword } from './console/shared';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'people', label: 'People' },
  { value: 'online', label: 'Online' },
  { value: 'versions', label: 'App versions' },
  { value: 'activity', label: 'Activity' },
  { value: 'teams', label: 'Organizations' },
];

const SHOW = ['latest', 'behind', 'web', 'never'];

export function PlatformPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview';
  const person = params.get('person') || '';
  const user = params.get('user') || '';
  const show = SHOW.includes(params.get('show')) ? params.get('show') : '';

  /** Change some of the URL's values ('' removes one). */
  const update = (changes, { push = false } = {}) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: !push }
    );

  const setTab = (value, filter) => {
    const changes = { tab: value === 'overview' ? '' : value };
    if (value === 'versions') changes.show = filter || '';
    if (value !== 'activity') changes.user = '';
    update(changes);
  };
  const openPerson = (id) => update({ person: id }, { push: true });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Console" subtitle="Everyone on Karo: who is signed in, on which device, and everything they do" />
      <div className="max-w-full overflow-x-auto">
        <Segmented value={tab} onChange={(v) => setTab(v)} options={TABS} />
      </div>
      {tab === 'overview' && <Overview onTab={setTab} />}
      {tab === 'people' && <People onOpenPerson={openPerson} />}
      {tab === 'online' && <Online onOpenPerson={openPerson} />}
      {tab === 'versions' && <AppVersions filter={show} onFilter={(v) => update({ show: v })} onOpenPerson={openPerson} />}
      {tab === 'activity' && <Activity user={user} onUser={(id) => update({ user: id })} onOpenPerson={openPerson} />}
      {tab === 'teams' && <Teams />}
      {person && (
        <PersonDrawer
          key={person}
          id={person}
          onClose={() => update({ person: '' })}
          onSeeActivity={(u) => update({ tab: 'activity', user: u.id, person: '' })}
        />
      )}
    </div>
  );
}
