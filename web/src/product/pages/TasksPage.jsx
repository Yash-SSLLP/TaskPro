/**
 * Tasks, laid out as the HRMS's page is (pages/Tasks.jsx there):
 *
 *   THE PILES       Assigned to me · Assigned by me · In the loop (·
 *                   Organization tasks for an organization's owner/admins ·
 *                   All tasks for the Super Admin), each wearing its own figures.
 *   THE TABS        All · General · each organization I am in, in my order
 *                   (the first is where Tasks opens), each with its open count.
 *   SEARCH · FILTER one box that finds a task by its name, code or a person,
 *                   one button for the rest, and Completed beside them.
 *   THE FIGURES     Total · Not Accepted Yet · Overdue · In Progress · Under
 *                   Review · More Time Asked, one bar; every figure a filter.
 *   THE ROWS        each with its status dropdown (and a swipe on a touch
 *                   screen).
 * One way to give a task: the floating button. Report sits in the header, with
 * Excel. Every filter runs on the server; the figures come back with the rows.
 *
 * URL: ?scope=mine|delegated|loop|team|all  &org=all|general|<id> (an old
 *      &team=<id> means the same)
 *      ?assign=1|<personId>  &onBehalfOf=<id>  (opens the form)  ?assignedTo=<id>
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Download, Filter, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../platform/api';
import { isSuperAdmin, useSession } from '../../platform/session';
import { Chip, ErrorState, PageHeader, Skeleton } from '../../platform/ui';
import * as T from '../api';
import { useAdminTeams, useCategories, useInvalidateTasks, useMeId, useOrgTabs, useTaskMeta } from '../hooks';
import { PILES, RANGES, STAT_BAR, TASK_PRIORITY, orgTabLabel, statQueryFor, statValue, statusLabel } from '../lifecycle';
import { AssignTaskModal } from '../components/AssignTaskModal';
import { DEFAULT_FILTERS, TaskFilters, activeFilterCount, split } from '../components/TaskFilters';
import { TaskPileCards, TaskStatBar } from '../components/TaskOverview';
import { TaskRow } from '../components/TaskRow';
import { TaskModal } from '../components/TaskModal';
import { EmptyTasks } from '../components/TaskChips';
import { useTaskActions } from '../components/TaskActions';

const PAGE_SIZE = 50;
/** Completed's colour, for the button beside Filter. */
const COMPLETED = STAT_BAR.find((s) => s.key === 'completed');
/** The header's outline buttons, as the HRMS's: the icon on a phone, the label too from sm up. */
const HEAD_BTN = 'inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-line bg-card px-3.5 text-sm font-medium text-ink-soft transition hover:border-slate-300 hover:text-brand';
const OBJECT_ID = /^[a-f\d]{24}$/i;

function useDebouncedText(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value.trim()), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The organization tabs, one sideways-scrolling row of chips: each with its
 * open count (`/api/tasks?withOrgs=1` → orgs[key]), red while something in it
 * is overdue (the chosen one, in its brand fill, keeps a red count).
 */
function OrgTabs({ tabs, value, counts, onPick }) {
  return (
    <div role="tablist" aria-label="Organizations" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const c = counts?.[t.key];
        const on = value === t.key;
        const late = Number(c?.overdue) > 0;
        return (
          <Chip key={t.key} role="tab" aria-selected={on} aria-pressed={undefined} active={on} warn={late} onClick={() => onPick(t.key)}>
            {orgTabLabel(t)}
            {c && <span className={clsx('tnum font-semibold', on && late && 'rounded-full bg-red-50 px-1.5 text-red-700')}>{statValue(c, 'total')}</span>}
            {late && <span className="sr-only">, some overdue</span>}
          </Chip>
        );
      })}
    </div>
  );
}

/** Shown only when there is a second page: the count, then ‹ Page x of y ›. */
function Pager({ page, pages, total, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-1 text-xs text-ink-soft">
      <span>
        {total} task{total === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card transition hover:border-slate-300 disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tnum">
          Page {page} of {pages}
        </span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card transition hover:border-slate-300 disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function TasksPage() {
  const user = useSession((s) => s.user);
  const superAdmin = isSuperAdmin(user);
  const [search, setSearch] = useSearchParams();
  const { data: meta } = useTaskMeta();
  const meId = useMeId();
  const categories = useCategories(meta);
  const adminTeams = useAdminTeams(meta);
  const orgTabs = useOrgTabs(meta);
  const invalidate = useInvalidateTasks();
  const isAdmin = Boolean(meta?.isAdmin) || superAdmin;

  // ===== Which organization tab =====
  // ?org= (an old link's ?team=<id> means the same); absent, or an organization
  // I am no longer in, the first tab. No strip, no tab — except the Super
  // Admin's link to one organization's tasks (the console's).
  const orgParam = search.get('org') || search.get('team') || '';
  const org = superAdmin
    ? OBJECT_ID.test(orgParam)
      ? orgParam
      : 'all'
    : !meta
      ? orgParam || orgTabs.saved[0] || 'all'
      : !orgTabs.shown
        ? 'all'
        : orgTabs.tabs.some((t) => t.key === orgParam)
          ? orgParam
          : orgTabs.tabs[0].key;
  const orgTab = orgTabs.tabs.find((t) => t.key === org);

  // ===== Which pile =====
  // The Organization pile: on All, or on an organization I own or run; never on General.
  const orgPile = org === 'all' || orgTab?.myRole === 'owner' || orgTab?.myRole === 'admin';
  const piles = useMemo(
    () => PILES.filter((p) => (p.adminOnly ? isAdmin : p.teamOnly ? adminTeams.length > 0 && !superAdmin && orgPile : !superAdmin)),
    [isAdmin, adminTeams.length, superAdmin, orgPile]
  );
  const wanted = search.get('scope');
  const pile = piles.some((p) => p.key === wanted) ? wanted : wanted === 'team' && !meta ? 'team' : superAdmin ? 'all' : 'mine';

  const setParam = useCallback(
    (patch) => {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearch]
  );

  // An old link (?team=<id>) is rewritten as ?org=<id>; it already reads as one.
  useEffect(() => {
    const legacy = search.get('team');
    if (legacy) setParam({ team: null, org: search.get('org') || legacy });
  }, [search, setParam]);

  // ===== Filters, search, figure, page =====
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS, assignedTo: search.get('assignedTo') || '' }));
  const [text, setText] = useState('');
  const q = useDebouncedText(text);
  const [stat, setStat] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => setPage(1), [pile, org, filters, q, stat]);

  // ===== Dialogs =====
  const [assign, setAssign] = useState(null); // { presetAssignees, presetOnBehalf }
  const [openTask, setOpenTask] = useState(null); // { id, edit }
  const [nudged, setNudged] = useState({});
  const [exporting, setExporting] = useState(false);

  // Links that open the form: ?assign=1 | ?assign=<personId> [&onBehalfOf=<id>]
  useEffect(() => {
    const a = search.get('assign');
    if (!a) return;
    const behalf = search.get('onBehalfOf') || '';
    setAssign({ presetAssignees: a !== '1' ? [a] : null, presetOnBehalf: behalf });
    setParam({ assign: null, onBehalfOf: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const params = useMemo(() => {
    const f = filters;
    const statQuery = { ...statQueryFor(stat) };
    if (f.status) {
      statQuery.status = f.status;
      if (statQuery.overdue === 'false') delete statQuery.overdue;
    }
    if (f.overdue) statQuery.overdue = 'true';
    if (f.moreTime) statQuery.moreTime = '1';
    return {
      scope: pile,
      ...(org !== 'all' ? { org } : {}),
      range: f.range,
      ...(f.range === 'custom' ? { from: f.from, to: f.to } : {}),
      ...(f.category ? { category: f.category } : {}),
      ...(f.assignedTo && pile !== 'mine' ? { assignedTo: f.assignedTo } : {}),
      ...(f.assignedBy && pile !== 'delegated' ? { assignedBy: f.assignedBy } : {}),
      ...(f.priority ? { priority: f.priority } : {}),
      ...(f.late ? { late: '1' } : {}),
      ...(f.includeSubtasks ? { includeSubtasks: '1' } : {}),
      ...(q ? { q } : {}),
      ...statQuery,
      sort: f.sort,
      ...(f.dir ? { dir: f.dir } : {}),
    };
  }, [filters, stat, pile, org, q]);

  const list = useQuery({
    queryKey: ['tasks', 'list', params, page],
    queryFn: () => T.listTasks({ ...params, page, limit: PAGE_SIZE, withScopes: 1, ...(page === 1 && !superAdmin ? { withOrgs: 1 } : {}) }),
    placeholderData: (prev) => prev,
  });
  const tasks = list.data?.tasks || [];
  const counters = list.data?.counters || {};
  const scopes = list.data?.scopes || null;
  // The tabs' figures come with page 1; a later page keeps the last ones.
  const [orgCounts, setOrgCounts] = useState(null);
  useEffect(() => {
    if (list.data?.orgs) setOrgCounts(list.data.orgs);
  }, [list.data]);

  // The Super Admin's one organization (no strip): its name for the chip.
  const linkedOrg = useQuery({
    queryKey: ['platform', 'team', org],
    queryFn: () => api.get(`/api/platform/teams/${org}`),
    enabled: superAdmin && org !== 'all',
    staleTime: 60_000,
  });

  const onChanged = useCallback((id) => invalidate(id), [invalidate]);
  const actions = useTaskActions({ meta, onChanged, onEdit: (task) => setOpenTask({ id: task._id, edit: true }) });

  // ===== Chips for what narrows the list =====
  const people = meta?.people || [];
  const nameOf = (id) => (String(id) === meId ? 'me' : people.find((p) => String(p._id) === String(id))?.name || 'someone');
  const chips = useMemo(() => {
    const out = [];
    const f = filters;
    if (f.range && f.range !== 'all') out.push({ key: 'range', label: f.range === 'custom' ? `Due ${f.from || '…'} – ${f.to || '…'}` : `Due: ${RANGES.find(([k]) => k === f.range)?.[1]}`, clear: { range: 'all', from: '', to: '' } });
    split(f.status).forEach((s) => out.push({ key: `s-${s}`, label: statusLabel(s), clear: { status: split(f.status).filter((x) => x !== s).join(',') } }));
    split(f.category).forEach((c) => out.push({ key: `c-${c}`, label: c, clear: { category: split(f.category).filter((x) => x !== c).join(',') } }));
    if (pile !== 'mine') split(f.assignedTo).forEach((id) => out.push({ key: `t-${id}`, label: `To ${nameOf(id)}`, clear: { assignedTo: split(f.assignedTo).filter((x) => x !== id).join(',') } }));
    if (pile !== 'delegated') split(f.assignedBy).forEach((id) => out.push({ key: `b-${id}`, label: `By ${nameOf(id)}`, clear: { assignedBy: split(f.assignedBy).filter((x) => x !== id).join(',') } }));
    split(f.priority).filter((p) => TASK_PRIORITY.includes(p)).forEach((p) => out.push({ key: `p-${p}`, label: p, clear: { priority: split(f.priority).filter((x) => x !== p).join(',') } }));
    if (f.overdue) out.push({ key: 'overdue', label: 'Overdue', clear: { overdue: '' } });
    if (f.late) out.push({ key: 'late', label: 'Finished late', clear: { late: '' } });
    if (f.moreTime) out.push({ key: 'moreTime', label: 'More time asked', clear: { moreTime: '' } });
    if (f.includeSubtasks) out.push({ key: 'sub', label: 'With sub-tasks', clear: { includeSubtasks: '' } });
    // The Super Admin has no tabs: a link's organization shows here instead.
    if (superAdmin && org !== 'all') out.push({ key: 'org', label: `Organization: ${linkedOrg.data?.team?.name || (linkedOrg.error ? 'not found' : '…')}`, param: { org: null } });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pile, meta, meId, superAdmin, org, linkedOrg.data, linkedOrg.error]);
  const filterCount = activeFilterCount({ ...filters, assignedTo: pile === 'mine' ? '' : filters.assignedTo, assignedBy: pile === 'delegated' ? '' : filters.assignedBy });
  const narrowed = Boolean(q || stat || chips.length);

  const doExport = async () => {
    setExporting(true);
    try {
      await T.exportTasks(params);
    } catch (err) {
      toast.error(err.message || 'Could not export the tasks.');
    } finally {
      setExporting(false);
    }
  };

  const openAssign = () => setAssign({});
  const pickPile = (key) => {
    setStat('');
    setParam({ scope: key });
  };
  const pickOrg = (key) => {
    setStat('');
    // A tab with no Organization pile (General, or one I am only in) moves off it
    // for good, as on the phone: another tab later does not bring it back.
    const role = orgTabs.tabs.find((t) => t.key === key)?.myRole;
    const keepsPile = key === 'all' || role === 'owner' || role === 'admin';
    setParam({ org: key, ...(search.get('scope') === 'team' && !keepsPile ? { scope: null } : {}) });
  };
  // A new order keeps this screen on its tab; the first tab is where Tasks opens next time.
  const reorderTabs = (keys) => {
    if (!search.get('org')) setParam({ org });
    orgTabs.saveOrder(keys);
  };
  const clearChips = () => {
    setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort, dir: f.dir }));
    if (superAdmin && org !== 'all') setParam({ org: null });
  };
  const completedOn = stat === 'completed';

  return (
    <div className="pb-20">
      <PageHeader
        title={superAdmin ? 'All tasks' : 'Tasks'}
        actions={
          <>
            <Link to="/dashboard" className={HEAD_BTN} title="Report — who is on top of their work">
              <BarChart3 className="h-[15px] w-[15px]" /> <span className="hidden sm:inline">Report</span>
            </Link>
            <button type="button" onClick={doExport} disabled={exporting} className={clsx(HEAD_BTN, 'disabled:opacity-60')} title="Download these tasks as Excel">
              <Download className="h-[15px] w-[15px]" /> <span className="hidden sm:inline">{exporting ? 'Exporting…' : 'Excel'}</span>
            </button>
          </>
        }
      />

      <div className="space-y-4">
        {piles.length > 1 && <TaskPileCards piles={piles} active={pile} onPick={pickPile} scopes={scopes} />}

        {orgTabs.shown && <OrgTabs tabs={orgTabs.tabs} value={org} counts={orgCounts} onPick={pickOrg} />}

        {/* ── Search · Filter · Completed ───────────────────────── */}
        <div className="flex items-center gap-2">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 shadow-sm transition focus-within:border-slate-300 sm:max-w-md">
            <Search className="h-[15px] w-[15px] shrink-0 text-ink-faint" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search task or person…"aria-label="Search tasks or people" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint" />
            {text && (
              <button type="button" onClick={() => setText('')} className="shrink-0 text-ink-faint transition-colors hover:text-ink" aria-label="Clear the search">
                <X className="h-[15px] w-[15px]" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className={clsx('ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold shadow-sm transition', filterCount ? 'border-brand text-brand' : 'border-line text-ink-soft hover:border-slate-300')}
          >
            <Filter className="h-[15px] w-[15px]" /> Filter
            {filterCount > 0 && <span className="tnum grid h-5 min-w-[20px] place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-on-brand">{filterCount}</span>}
          </button>
          {/* Completed (the HRMS's, 2026-09-29): the finished work, one click; again for Total. */}
          <button
            type="button"
            onClick={() => setStat((s) => (s === 'completed' ? '' : 'completed'))}
            aria-pressed={completedOn}
            title="Show completed tasks only"
            aria-label={`Completed: ${list.isLoading ? 'loading' : statValue(counters, 'completed')}`}
            style={completedOn ? { borderColor: COMPLETED.colour, color: COMPLETED.colour, backgroundColor: `color-mix(in srgb, ${COMPLETED.colour} 8%, rgb(var(--card)))` } : undefined}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line bg-card px-3.5 text-sm font-semibold text-ink-soft shadow-sm transition hover:border-slate-300"
          >
            <CheckCircle2 className="h-[15px] w-[15px]" style={{ color: COMPLETED.colour }} />
            <span className="hidden sm:inline">Completed</span>
            <span className="tnum">{list.isLoading ? '·' : statValue(counters, 'completed')}</span>
          </button>
        </div>

        {/* What is narrowing the list — each one removable, so a filter never hides work without saying so. */}
        {chips.length > 0 && (
          <div className="-mt-1 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <span key={c.key} className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-line bg-card py-0.5 pl-2.5 pr-1 text-xs font-medium text-ink-soft">
                {c.label}
                <button type="button" onClick={() => (c.param ? setParam(c.param) : setFilters((f) => ({ ...f, ...c.clear })))} className="grid h-6 w-6 place-items-center rounded-md text-ink-faint transition hover:bg-well hover:text-ink" aria-label={`Remove ${c.label}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {chips.length > 1 && (
              <button type="button" onClick={clearChips} className="min-h-[28px] px-2 text-xs font-medium text-ink-soft transition hover:text-brand">
                Clear all
              </button>
            )}
          </div>
        )}

        <TaskStatBar counters={counters} active={completedOn ? '' : stat} onPick={setStat} loading={list.isLoading} />

        {list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : list.isLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px] rounded-2xl" />)}</div>
        ) : tasks.length === 0 ? (
          <EmptyTasks scope={pile} filtered={narrowed} onAssign={narrowed || superAdmin ? undefined : openAssign} completedHint={!stat && statValue(counters, 'completed') > 0} />
        ) : (
          <div className={clsx('space-y-2.5 transition-opacity', list.isFetching && list.isPlaceholderData && 'opacity-60')}>
            {tasks.map((task) => (
              <TaskRow
                key={task._id}
                task={task}
                meId={meId}
                onOpen={(t) => setOpenTask({ id: t._id })}
                onAction={actions.run}
                onSwipe={actions.swipe}
                nudgedAt={nudged[task._id] || null}
                onNudged={(id, at) => setNudged((m) => ({ ...m, [id]: at }))}
                cooldownMin={meta?.nudgeCooldownMin}
              />
            ))}
          </div>
        )}

        {!list.isLoading && (
          <Pager
            page={list.data?.page || page}
            pages={list.data?.pages || 1}
            total={list.data?.total || 0}
            onPage={(n) => {
              setPage(n);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </div>

      {/* ONE way to give a task: the floating button (above the bottom tabs on a
          phone). Portalled: a transformed ancestor would capture position:fixed. */}
      {createPortal(
        <button
          type="button"
          onClick={openAssign}
          className="fixed bottom-20 right-4 z-30 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand shadow-pop transition hover:bg-brand-dark lg:bottom-6 lg:right-6"
        >
          <Plus className="h-[18px] w-[18px]" /> Assign task
        </button>,
        document.body
      )}

      <AssignTaskModal
        open={Boolean(assign)}
        onClose={() => setAssign(null)}
        onCreated={() => invalidate()}
        meta={meta}
        presetAssignees={assign?.presetAssignees || null}
        presetOnBehalf={assign?.presetOnBehalf || ''}
        presetTeam={orgTab?.name ? org : ''}
      />
      <TaskFilters
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        meta={meta}
        categories={categories}
        scope={pile}
        value={filters}
        onApply={setFilters}
        tabs={orgTabs.shown ? orgTabs.tabs : null}
        tabsReordered={orgTabs.saved.length > 0}
        onTabOrder={reorderTabs}
      />
      <TaskModal taskId={openTask?.id || null} open={Boolean(openTask)} onClose={() => setOpenTask(null)} onChanged={() => invalidate()} initialEdit={Boolean(openTask?.edit)} />
      {actions.element}
    </div>
  );
}
