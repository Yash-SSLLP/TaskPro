/**
 * Tasks: the piles (Mine · Given by me · In the loop · Team · All tasks), a
 * search box and the Filter panel, the stat bar (every figure a filter), and
 * the rows — each with its status dropdown (and a swipe on touch screens) — or
 * the board. Templates, Dashboard, Recurring and Excel export sit in the
 * header. Every filter runs on the server; the figures come back with the rows.
 *
 * URL: ?scope=mine|delegated|loop|team|all  &team=<id>  &view=board
 *      ?assign=1|<personId>  &onBehalfOf=<id>  (opens the form)  ?assignedTo=<id>
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BarChart3, Bookmark, ChevronLeft, ChevronRight, Download, Filter, KanbanSquare, List, Plus, Repeat, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { isSuperAdmin, useSession } from '../../platform/session';
import { Button, ErrorState, PageHeader, Segmented, Skeleton } from '../../platform/ui';
import * as T from '../api';
import { useAdminTeams, useCategories, useInvalidateTasks, useMeId, useTaskMeta } from '../hooks';
import { PILES, RANGES, TASK_PRIORITY, statQueryFor, statValue, statusLabel, swipeActionsFor } from '../lifecycle';
import { AssignTaskModal } from '../components/AssignTaskModal';
import { DEFAULT_FILTERS, TaskFilters, activeFilterCount, split } from '../components/TaskFilters';
import { TaskPileCards, TaskStatBar } from '../components/TaskOverview';
import { TaskRow } from '../components/TaskRow';
import { TaskBoard } from '../components/TaskBoard';
import { TaskModal } from '../components/TaskModal';
import { TemplatesDrawer } from '../components/TaskTemplates';
import { EmptyTasks } from '../components/TaskChips';
import { useTaskActions } from '../components/TaskActions';

const PAGE_SIZE = 50;

function useDebouncedText(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value.trim()), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Pager({ page, pages, total, onPage }) {
  if (pages <= 1) return total ? <p className="pt-1 text-xs text-ink-faint">{total} task{total === 1 ? '' : 's'}</p> : null;
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-ink-soft">
      <span>
        {total} task{total === 1 ? '' : 's'} · page {page} of {pages}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-ink-faint">…</span>}
            <button type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} className={clsx('tnum h-9 min-w-[36px] rounded-xl border px-2 text-sm font-semibold', n === page ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink hover:border-slate-300')}>
              {n}
            </button>
          </span>
        ))}
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card disabled:opacity-40" aria-label="Next page">
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
  const invalidate = useInvalidateTasks();
  const isAdmin = Boolean(meta?.isAdmin) || superAdmin;

  // ===== Which pile =====
  const piles = useMemo(
    () => PILES.filter((p) => (p.adminOnly ? isAdmin : p.teamOnly ? adminTeams.length > 0 && !superAdmin : !superAdmin)),
    [isAdmin, adminTeams.length, superAdmin]
  );
  const wanted = search.get('scope');
  const pile = piles.some((p) => p.key === wanted) ? wanted : wanted === 'team' && !meta ? 'team' : superAdmin ? 'all' : 'mine';
  const teamParam = search.get('team') || '';
  const view = search.get('view') === 'board' ? 'board' : 'list';

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

  // ===== Filters, search, figure, page =====
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS, assignedTo: search.get('assignedTo') || '', team: pile !== 'team' ? teamParam : '' }));
  const [text, setText] = useState('');
  const q = useDebouncedText(text);
  const [stat, setStat] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => setPage(1), [pile, teamParam, filters, q, stat]);

  // ===== Dialogs =====
  const [assign, setAssign] = useState(null); // { prefill, presetAssignees, presetOnBehalf }
  const [templatesOpen, setTemplatesOpen] = useState(false);
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
      ...(pile === 'team' && teamParam ? { team: teamParam } : {}),
      ...(pile !== 'team' && f.team ? { team: f.team } : {}),
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
  }, [filters, stat, pile, teamParam, q]);

  const list = useQuery({
    queryKey: ['tasks', 'list', params, page],
    queryFn: () => T.listTasks({ ...params, page, limit: PAGE_SIZE, withScopes: 1 }),
    enabled: view === 'list',
    placeholderData: (prev) => prev,
  });
  const tasks = list.data?.tasks || [];
  const counters = list.data?.counters || {};
  const scopes = list.data?.scopes || null;

  const onChanged = useCallback((id) => invalidate(id), [invalidate]);
  const actions = useTaskActions({ meta, onChanged, onEdit: (task) => setOpenTask({ id: task._id, edit: true }) });
  const anySwipe = tasks.some((t) => {
    const a = swipeActionsFor(t);
    return a.left || a.right;
  });

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
    if (f.team && pile !== 'team') out.push({ key: 'team', label: `Team: ${(meta?.teams || []).find((t) => String(t.id) === f.team)?.name || 'one team'}`, clear: { team: '' } });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pile, meta, meId]);
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
    setParam({ scope: key, team: key === 'team' ? teamParam : null });
  };
  const selectedTeam = adminTeams.find((t) => String(t.id) === teamParam);

  return (
    <div className="pb-16 lg:pb-0">
      <PageHeader
        title={superAdmin ? 'All tasks' : 'Tasks'}
        subtitle={superAdmin ? 'Every task on Task Pro — open, edit, remove, or give one on someone’s behalf.' : 'Give work out, and know where it has got to.'}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={Bookmark} onClick={() => setTemplatesOpen(true)}>
              <span className="hidden sm:inline">Templates</span>
            </Button>
            <Button variant="secondary" size="sm" icon={BarChart3} to="/dashboard">
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <Button variant="secondary" size="sm" icon={Repeat} to="/recurring" className="hidden sm:inline-flex">
              Recurring
            </Button>
            <Button variant="secondary" size="sm" icon={Download} loading={exporting} onClick={doExport} title="Download these tasks as Excel">
              <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button size="sm" icon={Plus} onClick={openAssign} className="hidden lg:inline-flex">
              Give a task
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        {piles.length > 1 && <TaskPileCards piles={piles} active={pile} onPick={pickPile} scopes={scopes} />}

        {pile === 'team' && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-2 shadow-card">
            <span className="px-2 text-sm font-medium text-ink-soft">Team</span>
            <Segmented
              className="max-w-full overflow-x-auto"
              value={teamParam}
              onChange={(v) => setParam({ team: v || null })}
              options={[{ value: '', label: 'All my teams' }, ...adminTeams.map((t) => ({ value: String(t.id), label: t.name }))]}
            />
            {selectedTeam && (
              <Link to={`/teams/${selectedTeam.id}`} className="ml-auto px-2 text-sm font-semibold text-brand hover:underline">
                Team page
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30 sm:max-w-md">
            <Search className="h-4 w-4 shrink-0 text-ink-faint" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search a task, code or person…" aria-label="Search tasks" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint" />
            {text && (
              <button type="button" onClick={() => setText('')} className="text-ink-faint hover:text-ink" aria-label="Clear the search">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className={clsx('inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold shadow-sm', filterCount ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-card text-ink hover:border-slate-300')}
          >
            <Filter className="h-4 w-4" /> Filter
            {filterCount > 0 && <span className="tnum grid h-5 min-w-[20px] place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{filterCount}</span>}
          </button>
          <Segmented
            value={view}
            onChange={(v) => setParam({ view: v === 'board' ? 'board' : null })}
            options={[
              { value: 'list', label: <span className="inline-flex items-center gap-1.5"><List className="h-4 w-4" /><span className="hidden sm:inline">List</span></span> },
              { value: 'board', label: <span className="inline-flex items-center gap-1.5"><KanbanSquare className="h-4 w-4" /><span className="hidden sm:inline">Board</span></span> },
            ]}
          />
        </div>

        {chips.length > 0 && (
          <div className="-mt-1 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <span key={c.key} className="inline-flex h-7 items-center gap-1 rounded-lg border border-line bg-card pl-2.5 pr-1 text-xs font-medium text-ink-soft">
                {c.label}
                <button type="button" onClick={() => setFilters((f) => ({ ...f, ...c.clear }))} className="grid h-5 w-5 place-items-center rounded-md text-ink-faint hover:bg-slate-100 hover:text-ink" aria-label={`Remove ${c.label}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {chips.length > 1 && (
              <button type="button" onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort, dir: f.dir }))} className="px-2 text-xs font-semibold text-ink-soft hover:text-brand">
                Clear all
              </button>
            )}
          </div>
        )}

        {view === 'list' && <TaskStatBar counters={counters} active={stat} onPick={setStat} loading={list.isLoading} />}

        {view === 'list' && anySwipe && <p className="-mt-1 hidden text-[11px] text-ink-faint [@media(pointer:coarse)]:block">Swipe a task right to accept or complete it, left to decline, send back or ask for more time.</p>}

        {view === 'board' ? (
          <TaskBoard
            params={(() => {
              const { status, ...rest } = params; // the board makes its own columns
              return rest.overdue === 'false' ? { ...rest, overdue: undefined } : rest;
            })()}
            onOpen={(t) => setOpenTask({ id: t._id })}
            onAction={actions.run}
          />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : list.isLoading ? (
          <div className="space-y-2.5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[84px] rounded-2xl" />)}</div>
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

        {view === 'list' && !list.isLoading && <Pager page={list.data?.page || page} pages={list.data?.pages || 1} total={list.data?.total || 0} onPage={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
      </div>

      {/* The phone's way in: a floating button over the bottom tabs. */}
      {createPortal(
        <button type="button" onClick={openAssign} className="fixed bottom-20 right-4 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-pop hover:bg-brand-dark lg:hidden">
          <Plus className="h-5 w-5" /> Give a task
        </button>,
        document.body
      )}

      <AssignTaskModal
        open={Boolean(assign)}
        onClose={() => setAssign(null)}
        onCreated={() => invalidate()}
        meta={meta}
        prefill={assign?.prefill || null}
        presetAssignees={assign?.presetAssignees || null}
        presetOnBehalf={assign?.presetOnBehalf || ''}
      />
      <TaskFilters open={filtersOpen} onClose={() => setFiltersOpen(false)} meta={meta} categories={categories} scope={pile} value={filters} onApply={setFilters} />
      <TemplatesDrawer open={templatesOpen} onClose={() => setTemplatesOpen(false)} onUse={(prefill) => setAssign({ prefill })} />
      <TaskModal taskId={openTask?.id || null} open={Boolean(openTask)} onClose={() => setOpenTask(null)} onChanged={() => invalidate()} initialEdit={Boolean(openTask?.edit)} />
      {actions.element}
    </div>
  );
}

