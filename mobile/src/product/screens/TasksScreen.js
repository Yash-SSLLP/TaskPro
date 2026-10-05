/**
 * Tasks: the piles, the figures, search, filters and the cards.
 *
 *   PILES     Assigned to me · Given by me · In the loop · Team (owner/admin
 *             of a team) · All tasks (Super Admin), each with how much is
 *             open, overdue and waiting on a review.
 *   SEARCH    the task's name, or the name of whoever set it or holds it.
 *   FILTER    one sheet: due date, team, category, people, priority, status,
 *             overdue / finished late / more time asked, and the order.
 *   FIGURES   Total (open work) · Not accepted · Overdue · In progress ·
 *             Under review · More time asked; Completed beside Filter.
 *   CARDS     tinted by priority, each with a status pill (the moves the
 *             server allows), a reminder bell and swipes.
 *
 * Every filter runs on the server and the figures come back with the rows
 * (pile counters too, via `withScopes`), so a change is one request. Pages of
 * 25 load as the list scrolls; nothing collapses on a refetch.
 *
 * Route params (optional): { pile, team, assignedTo, nonce } open the screen
 * on a pile, a team or a person (Team tasks, the console).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { useRefetchOnFocus } from '../../platform/hooks';
import { colors, font, radius, space } from '../../platform/theme';
import { BottomSheet, Button, Chip, ChipRow, DateField, EmptyState, ErrorState, FAB, Header, Screen, SkeletonCards, SwitchRow, ymdLabel } from '../../platform/ui';
import { listTasks, taskKeys, useTaskMeta } from '../api';
import TaskCard from '../components/TaskCard';
import TaskPeoplePicker from '../components/TaskPeoplePicker';
import TaskStatusSheets from '../components/TaskStatusSheets';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CirclePlay,
  Clock,
  Eye,
  Hourglass,
  Layers,
  Plus,
  Search,
  SlidersHorizontal,
  SquareCheckBig,
  Users,
  X,
} from '../icons';
import {
  COMPLETED_TINT,
  GRID_TILES,
  RANGE_KEYS,
  SORT_DIR,
  SORT_KEYS,
  STATUS,
  TASK_PRIORITY,
  TILE_QUERY,
  dirLabel,
  openCount,
  priorityColor,
  priorityLabel,
  rangeLabel,
  sortLabel,
  statValue,
  statusLabel,
  swipeActionsFor,
  tileLabel,
} from '../taskStatus';

const PAGE_SIZE = 25;
const TILE_ICONS = { layers: Layers, hourglass: Hourglass, alert: CircleAlert, play: CirclePlay, eye: Eye, clock: Clock };

const DEFAULT_FILTERS = {
  range: 'all',
  from: '',
  to: '',
  team: '',
  category: [],
  assignedTo: [],
  assignedBy: [],
  priority: [],
  status: [],
  overdue: false,
  late: false,
  moreTime: false,
  sort: 'due',
  dir: 'desc',
};

function pileLabel(key) {
  return (
    {
      mine: tr('Assigned to me'),
      delegated: tr('Given by me'),
      loop: tr('In the loop'),
      team: tr('Team'),
      all: tr('All tasks'),
    }[key] || key
  );
}

export default function TasksScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const metaQ = useTaskMeta();
  const meta = metaQ.data;
  const isAdmin = Boolean(meta?.isAdmin);
  const meId = String(meta?.me || (meta?.people || []).find((p) => p.relation === 'self')?._id || '');
  const managedTeams = useMemo(() => (meta?.teams || []).filter((t) => t.myRole === 'owner' || t.myRole === 'admin'), [meta]);

  const [pile, setPile] = useState(() => route.params?.pile || 'mine');
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    team: route.params?.team || '',
    assignedTo: route.params?.assignedTo ? [String(route.params.assignedTo)] : [],
  }));
  const [tile, setTile] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [nudged, setNudged] = useState({});

  // Opened again with new params (Team tasks, the console): follow them.
  const nonce = route.params?.nonce;
  useEffect(() => {
    if (!nonce) return;
    if (route.params?.pile) setPile(route.params.pile);
    setTile('');
    setFilters((f) => ({
      ...f,
      team: route.params?.team || '',
      assignedTo: route.params?.assignedTo ? [String(route.params.assignedTo)] : [],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  // A pile this person does not have goes back to their own.
  useEffect(() => {
    if (!meta) return;
    if (pile === 'all' && !isAdmin) setPile('mine');
    if (pile === 'team' && !managedTeams.length && !isAdmin) setPile('mine');
  }, [meta, pile, isAdmin, managedTeams.length]);

  const params = useMemo(() => {
    const f = filters;
    const csv = (a) => (a || []).join(',');
    const tileQuery = TILE_QUERY[tile || 'total'];
    const statusOverride = !tile && f.status.length ? { status: csv(f.status) } : {};
    return {
      scope: pile,
      range: f.range,
      ...(f.range === 'custom' ? { from: f.from, to: f.to } : {}),
      ...(f.team ? { team: f.team } : {}),
      ...(f.category.length ? { category: csv(f.category) } : {}),
      ...(f.assignedTo.length && pile !== 'mine' ? { assignedTo: csv(f.assignedTo) } : {}),
      ...(f.assignedBy.length && pile !== 'delegated' ? { assignedBy: csv(f.assignedBy) } : {}),
      ...(f.priority.length ? { priority: csv(f.priority) } : {}),
      ...(debounced ? { q: debounced } : {}),
      ...tileQuery,
      ...statusOverride,
      ...(f.overdue ? { overdue: 'true' } : {}),
      ...(f.late ? { late: 'true' } : {}),
      ...(f.moreTime ? { moreTime: '1' } : {}),
      sort: f.sort,
      dir: f.dir,
    };
  }, [pile, filters, debounced, tile]);

  const q = useInfiniteQuery({
    queryKey: taskKeys.list(params),
    queryFn: ({ pageParam }) => listTasks({ ...params, page: pageParam, limit: PAGE_SIZE, ...(pageParam === 1 ? { withScopes: 1 } : {}) }),
    initialPageParam: 1,
    getNextPageParam: (last) => ((last?.page || 1) < (last?.pages || 1) ? (last.page || 1) + 1 : undefined),
    placeholderData: (prev) => prev,
  });
  useRefetchOnFocus(q.refetch);

  const first = q.data?.pages?.[0];
  const tasks = useMemo(() => q.data?.pages.flatMap((p) => p?.tasks || []) || null, [q.data]);
  const counters = first?.counters || {};
  const scopes = first?.scopes || null;
  const loading = !q.data && q.isPending;

  const refresh = useCallback(() => q.refetch(), [q]);
  const openTask = useCallback((t) => nav.navigate('TaskDetail', { id: t?._id || t }), [nav]);
  const editTask = useCallback((t) => nav.navigate('AssignTask', { editTaskId: t?._id || t }), [nav]);

  const people = useMemo(() => meta?.people || [], [meta]);
  const nameOf = useCallback(
    (id) => (String(id) === meId ? tr('me') : people.find((p) => String(p._id || p.id) === String(id))?.name || tr('someone')),
    [people, meId]
  );
  const teamName = useCallback((id) => (meta?.teams || []).find((t) => String(t.id) === String(id))?.name || tr('Team'), [meta]);

  /** What is narrowing the list, each removable on its own. */
  const chips = useMemo(() => {
    const f = filters;
    const out = [];
    if (f.range !== 'all') {
      const label =
        f.range === 'custom'
          ? tr('Due {from} – {to}', { from: f.from ? ymdLabel(f.from) : '…', to: f.to ? ymdLabel(f.to) : '…' })
          : tr('Due: {range}', { range: rangeLabel(f.range) });
      out.push({ key: 'range', label, clear: { range: 'all', from: '', to: '' } });
    }
    if (f.team) out.push({ key: 'team', label: tr('Team: {name}', { name: teamName(f.team) }), clear: { team: '' } });
    f.category.forEach((c) => out.push({ key: `c-${c}`, label: c, clear: { category: f.category.filter((x) => x !== c) } }));
    if (pile !== 'mine') f.assignedTo.forEach((id) => out.push({ key: `t-${id}`, label: tr('To {name}', { name: nameOf(id) }), clear: { assignedTo: f.assignedTo.filter((x) => x !== id) } }));
    if (pile !== 'delegated') f.assignedBy.forEach((id) => out.push({ key: `b-${id}`, label: tr('By {name}', { name: nameOf(id) }), clear: { assignedBy: f.assignedBy.filter((x) => x !== id) } }));
    f.priority.forEach((p) => out.push({ key: `p-${p}`, label: priorityLabel(p), clear: { priority: f.priority.filter((x) => x !== p) } }));
    if (!tile) f.status.forEach((s) => out.push({ key: `s-${s}`, label: statusLabel(s), clear: { status: f.status.filter((x) => x !== s) } }));
    if (f.overdue) out.push({ key: 'overdue', label: tr('Overdue'), clear: { overdue: false } });
    if (f.late) out.push({ key: 'late', label: tr('Finished late'), clear: { late: false } });
    if (f.moreTime) out.push({ key: 'moreTime', label: tr('More time asked'), clear: { moreTime: false } });
    return out;
  }, [filters, pile, nameOf, teamName, tile]);

  const filterCount = chips.filter((c) => c.key !== 'range').length;
  const narrowed = Boolean(debounced || tile || chips.length);

  const requireRemark = meta?.swipeRemarkRequired !== false;
  const onNudged = useCallback((id, at) => setNudged((m) => ({ ...m, [id]: at })), []);
  const anySwipe = useMemo(
    () =>
      (tasks || []).some((t) => {
        const a = swipeActionsFor(t);
        return a.left || a.right;
      }),
    [tasks]
  );

  const renderRow = useCallback(
    ({ item }) => (
      <TaskCard
        task={item}
        meId={meId}
        nudgedAt={nudged[item._id] || null}
        onNudged={onNudged}
        onOpen={() => openTask(item)}
        onStatus={() => setSheet({ task: item, stage: null, remark: false })}
        onSwipe={(key) => setSheet({ task: item, stage: key, remark: requireRemark })}
      />
    ),
    [meId, openTask, nudged, onNudged, requireRemark]
  );

  const piles = [
    'mine',
    'delegated',
    'loop',
    ...(managedTeams.length || scopes?.team ? ['team'] : []),
    ...(isAdmin ? ['all'] : []),
  ];

  let emptyTitle = tr('No open tasks');
  if (narrowed) emptyTitle = tr('Nothing matches');
  else if (pile === 'mine') emptyTitle = Number(counters.completed) > 0 ? tr('Nothing open on your plate') : tr('Nothing assigned to you');
  else if (pile === 'delegated') emptyTitle = tr('Nothing you gave is open');
  else if (pile === 'loop') emptyTitle = tr('Nothing to follow');
  const emptyMessage = narrowed
    ? tr('Try a wider due date, another figure, or clear the filters.')
    : pile === 'mine'
      ? tr('Tasks given to you, and the ones you set yourself, land here.')
      : pile === 'loop'
        ? tr('When somebody keeps you in the loop on a task, it shows up here.')
        : tr('Tap Assign task to give someone a task.');

  const header = (
    <View style={styles.headerWrap}>
      <ChipRow scroll contentStyle={styles.pileRow} style={styles.pileScroll}>
        {piles.map((key) => {
          const on = pile === key;
          const c = scopes?.[key];
          const n = c ? openCount(c) : null;
          const overdue = Number(c?.overdue) || 0;
          return (
            <Pressable
              key={key}
              onPress={() => {
                setTile('');
                setPile(key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${pileLabel(key)}${n !== null ? `, ${tr('{n} open', { n })}` : ''}`}
              style={[styles.pile, on && styles.pileOn]}
            >
              <Text style={[styles.pileLabel, on && styles.pileLabelOn]} numberOfLines={1}>
                {pileLabel(key)}
              </Text>
              <View style={styles.pileLine}>
                <Text style={[styles.pileCount, on && styles.pileLabelOn]}>{n ?? '–'}</Text>
                <Text style={styles.pileOpen} numberOfLines={1}>
                  {` ${tr('open')}`}
                  {overdue > 0 ? <Text style={styles.pileLate}>{` · ${tr('{n} late', { n: overdue })}`}</Text> : null}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ChipRow>

      <View style={styles.toolRow}>
        <View style={styles.searchRow}>
          <Search size={17} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={tr('Search task or person…')}
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel={tr('Clear the search')}>
              <X size={17} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => setFilterOpen(true)} style={[styles.toolBtn, filterCount > 0 && styles.toolBtnOn]} accessibilityRole="button" accessibilityLabel={tr('Filter')}>
          <SlidersHorizontal size={17} color={colors.text} />
          {filterCount > 0 ? (
            <View style={styles.count}>
              <Text style={styles.countText}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => setTile((t) => (t === 'completed' ? '' : 'completed'))}
          style={[styles.toolBtn, tile === 'completed' && { borderColor: COMPLETED_TINT, backgroundColor: `${COMPLETED_TINT}1A` }]}
          accessibilityRole="button"
          accessibilityState={{ selected: tile === 'completed' }}
          accessibilityLabel={`${tileLabel('completed')}: ${loading ? '' : statValue(counters, 'completed')}`}
        >
          <CircleCheck size={18} color={COMPLETED_TINT} />
          <Text style={[styles.doneCount, tile === 'completed' && { color: COMPLETED_TINT }]}>{loading ? '·' : statValue(counters, 'completed')}</Text>
        </Pressable>
      </View>

      {chips.length > 0 ? (
        <View style={styles.chipsRow}>
          {chips.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => setFilters((f) => ({ ...f, ...c.clear }))}
              style={styles.activeChip}
              accessibilityRole="button"
              accessibilityLabel={tr('Remove {label}', { label: c.label })}
            >
              <Text style={styles.activeChipText} numberOfLines={1}>
                {c.label}
              </Text>
              <X size={14} color={colors.textSecondary} />
            </Pressable>
          ))}
          {chips.length > 1 ? (
            <Pressable onPress={() => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort, dir: f.dir }))} style={styles.clearAll} accessibilityRole="button">
              <Text style={styles.clearAllText}>{tr('Clear all')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.statGrid}>
        {GRID_TILES.map((t) => {
          const on = tile === t.key || (!tile && t.key === 'total');
          const value = statValue(counters, t.key);
          const Icon = TILE_ICONS[t.icon] || Layers;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTile((cur) => (cur === t.key || t.key === 'total' ? '' : t.key))}
              style={({ pressed }) => [styles.statCard, on && { backgroundColor: `${t.tint}1A`, borderColor: t.tint }, pressed && !on && styles.statPressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${tileLabel(t.key)}: ${loading ? '' : value}`}
            >
              <View style={styles.statTop}>
                <View style={[styles.statChip, { backgroundColor: on ? t.tint : `${t.tint}1F` }]}>
                  <Icon size={14} color={on ? colors.white : t.tint} />
                </View>
                <Text style={[styles.statCount, { color: on ? t.tint : value || loading ? colors.text : colors.textFaint }]} numberOfLines={1}>
                  {loading ? '·' : value}
                </Text>
              </View>
              <Text style={[styles.statName, on && { color: t.tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {tileLabel(t.key)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {anySwipe ? <Text style={styles.swipeHint}>{tr('Swipe a task right to accept or complete it, left to decline, send back or ask for more time.')}</Text> : null}
    </View>
  );

  let body;
  if (q.isError && !tasks) body = <ErrorState error={q.error} onRetry={q.refetch} />;
  else
    body = (
      <FlatList
        data={tasks || []}
        keyExtractor={(t) => String(t._id)}
        renderItem={renderRow}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        refreshing={q.isRefetching && !q.isFetchingNextPage}
        onRefresh={refresh}
        onEndReachedThreshold={0.4}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.more} /> : null}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={loading ? <SkeletonCards count={3} height={140} /> : <EmptyState compact icon={SquareCheckBig} title={emptyTitle} message={emptyMessage} />}
      />
    );

  return (
    <Screen inTabs padded={false} header={<Header large title={pile === 'all' ? tr('All tasks') : tr('Tasks')} subtitle={pile === 'team' && filters.team ? teamName(filters.team) : undefined} />}>
      {body}
      <FAB title={tr('Assign task')} icon={Plus} onPress={() => nav.navigate('AssignTask')} />

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        meta={meta}
        pile={pile}
        value={filters}
        tileChosen={Boolean(tile)}
        onApply={(f) => {
          setFilters(f);
          setFilterOpen(false);
        }}
      />

      <TaskStatusSheets
        task={sheet?.task || null}
        initialStage={sheet?.stage || null}
        requireRemark={Boolean(sheet?.remark)}
        meta={meta}
        onClose={() => setSheet(null)}
        onChanged={refresh}
        onOpen={openTask}
        onEdit={editTask}
      />
    </Screen>
  );
}

/**
 * The Filter sheet. Changes are not live until "Show tasks". The people
 * choice swaps the sheet's content for the picker, and "Done" comes back.
 */
function FilterSheet({ visible, onClose, meta, pile, value, tileChosen, onApply }) {
  const [draft, setDraft] = useState(value);
  const [picking, setPicking] = useState(null);

  useEffect(() => {
    if (visible) {
      setDraft(value);
      setPicking(null);
    }
  }, [visible, value]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = (key, item) => set({ [key]: draft[key].includes(item) ? draft[key].filter((x) => x !== item) : [...draft[key], item] });
  const people = meta?.people || [];
  const names = (ids) => ids.map((id) => people.find((p) => String(p._id || p.id) === String(id))?.name).filter(Boolean).join(', ');
  const categories = [...new Set((meta?.categories || []).map((c) => (typeof c === 'string' ? c : c?.name)).filter(Boolean))];
  const teams = meta?.teams || [];

  if (picking) {
    return (
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title={picking === 'assignedTo' ? tr('Assigned to') : tr('Assigned by')}
        footer={<Button title={tr('Done')} onPress={() => setPicking(null)} />}
      >
        <TaskPeoplePicker
          people={people}
          value={draft[picking]}
          onChange={(ids) => set({ [picking]: ids })}
          grouped={false}
          allowSelf
          selfId={meta?.me}
          autoFocus
          maxListHeight={360}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={tr('Filter tasks')}
      footer={
        <View style={styles.footer}>
          <Button title={tr('Reset')} variant="secondary" full={false} onPress={() => setDraft({ ...DEFAULT_FILTERS, sort: draft.sort, dir: draft.dir })} />
          <Button title={tr('Show tasks')} style={styles.flex} onPress={() => onApply(draft)} />
        </View>
      }
    >
      <FilterSection title={tr('Due date')}>
        <ChipRow>
          {RANGE_KEYS.map((key) => (
            <Chip key={key} label={rangeLabel(key)} selected={draft.range === key} onPress={() => set({ range: key })} />
          ))}
        </ChipRow>
        {draft.range === 'custom' ? (
          <View style={styles.dates}>
            <DateField value={draft.from} onChange={(v) => set({ from: v })} placeholder={tr('From')} clearable />
            <DateField value={draft.to} onChange={(v) => set({ to: v })} placeholder={tr('To')} clearable />
          </View>
        ) : null}
      </FilterSection>

      {teams.length ? (
        <FilterSection title={tr('Team')}>
          <ChipRow>
            <Chip label={tr('Any team')} selected={!draft.team} onPress={() => set({ team: '' })} />
            {teams.map((t) => (
              <Chip key={t.id} label={t.name} icon={Users} selected={String(draft.team) === String(t.id)} onPress={() => set({ team: t.id })} />
            ))}
          </ChipRow>
        </FilterSection>
      ) : null}

      {categories.length ? (
        <FilterSection title={tr('Category')}>
          <ChipRow>
            {categories.map((c) => (
              <Chip key={c} label={c} selected={draft.category.includes(c)} onPress={() => toggle('category', c)} />
            ))}
          </ChipRow>
        </FilterSection>
      ) : null}

      {(
        <FilterSection title={tr('People')}>
          {pile !== 'mine' ? <DropRow label={tr('Assigned to')} value={names(draft.assignedTo) || tr('Anyone')} onPress={() => setPicking('assignedTo')} /> : null}
          {pile !== 'delegated' ? <DropRow label={tr('Assigned by')} value={names(draft.assignedBy) || tr('Anyone')} onPress={() => setPicking('assignedBy')} /> : null}
        </FilterSection>
      )}

      <FilterSection title={tr('Priority')}>
        <ChipRow>
          {TASK_PRIORITY.map((p) => {
            const c = priorityColor(p);
            return <Chip key={p} label={priorityLabel(p)} selected={draft.priority.includes(p)} color={c.solid} softColor={c.bg} onPress={() => toggle('priority', p)} />;
          })}
        </ChipRow>
      </FilterSection>

      <FilterSection title={tr('Status')} hint={tileChosen ? tr('A figure is picked above the list; it decides the status for now.') : undefined}>
        <ChipRow>
          {[STATUS.PENDING, STATUS.IN_PROGRESS, STATUS.SUBMITTED, STATUS.COMPLETED, STATUS.CANCELLED].map((s) => (
            <Chip key={s} label={statusLabel(s)} selected={draft.status.includes(s)} onPress={() => toggle('status', s)} />
          ))}
        </ChipRow>
        <SwitchRow label={tr('Overdue only')} value={draft.overdue} onChange={(v) => set({ overdue: v })} boxed={false} />
        <SwitchRow label={tr('Finished late')} value={draft.late} onChange={(v) => set({ late: v })} boxed={false} />
        <SwitchRow label={tr('More time asked')} value={draft.moreTime} onChange={(v) => set({ moreTime: v })} boxed={false} />
      </FilterSection>

      <FilterSection title={tr('Sort by')} hint={tr('Tap the one in use to turn it around.')}>
        <ChipRow>
          {SORT_KEYS.map((key) => {
            const on = draft.sort === key;
            return (
              <Chip
                key={key}
                label={sortLabel(key)}
                selected={on}
                trailingIcon={on ? (draft.dir === 'asc' ? ArrowUp : ArrowDown) : undefined}
                onPress={() => set(on ? { dir: draft.dir === 'asc' ? 'desc' : 'asc' } : { sort: key, dir: SORT_DIR[key] })}
              />
            );
          })}
        </ChipRow>
        <Text style={styles.hint}>{tr('Now: {sort}, {dir}.', { sort: sortLabel(draft.sort), dir: dirLabel(draft.sort, draft.dir).toLowerCase() })}</Text>
      </FilterSection>
    </BottomSheet>
  );
}

function FilterSection({ title, hint, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function DropRow({ label, value, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.dropRow} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.flex}>
        <Text style={styles.dropLabel}>{label}</Text>
        <Text style={styles.dropValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <ChevronDown size={17} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: space(4), paddingBottom: 110, gap: space(2.5) },
  more: { marginVertical: space(4) },
  headerWrap: { gap: space(3), marginBottom: space(1) },
  pileScroll: { marginHorizontal: -space(4) },
  pileRow: { paddingHorizontal: space(4) },
  pile: {
    minWidth: 128,
    minHeight: 58,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  pileOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pileLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: font.semibold },
  pileLabelOn: { color: colors.primary },
  pileLine: { flexDirection: 'row', alignItems: 'baseline', marginTop: 1 },
  pileCount: { color: colors.text, fontSize: 18, fontWeight: font.bold, fontVariant: ['tabular-nums'] },
  pileOpen: { flexShrink: 1, color: colors.textSecondary, fontSize: 12, fontWeight: font.medium },
  pileLate: { color: colors.danger, fontWeight: font.bold },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(3),
    minHeight: 46,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: space(2) },
  toolBtn: {
    minHeight: 46,
    minWidth: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: space(2.5),
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  toolBtnOn: { borderColor: colors.primary },
  count: { minWidth: 20, minHeight: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  countText: { color: colors.white, fontSize: 11, fontWeight: font.bold },
  doneCount: { fontSize: 14, fontWeight: font.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  activeChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: space(3),
    paddingRight: space(2),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    maxWidth: '100%',
  },
  activeChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: font.semibold, flexShrink: 1 },
  clearAll: { minHeight: 34, justifyContent: 'center', paddingHorizontal: space(2) },
  clearAllText: { color: colors.primary, fontSize: 13, fontWeight: font.bold },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  statCard: {
    flexGrow: 1,
    flexBasis: '30%',
    paddingHorizontal: space(2.5),
    paddingVertical: space(2),
    gap: 4,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  statPressed: { backgroundColor: colors.muted },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statChip: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  statCount: { flexShrink: 1, fontSize: 18, lineHeight: 22, fontWeight: font.bold, fontVariant: ['tabular-nums'] },
  statName: { fontSize: 11, lineHeight: 14, fontWeight: font.semibold, color: colors.textSecondary },
  swipeHint: { color: colors.textFaint, fontSize: 12, lineHeight: 16 },
  footer: { flexDirection: 'row', gap: space(2.5) },
  section: { paddingVertical: space(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sectionTitle: { color: colors.text, fontSize: 13, fontWeight: font.bold, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionHint: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  sectionBody: { marginTop: space(2) },
  dates: { gap: space(2), marginTop: space(2) },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: space(2) },
  dropRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    marginBottom: space(2),
    paddingHorizontal: space(3),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  dropLabel: { color: colors.textFaint, fontSize: 12, fontWeight: font.semibold },
  dropValue: { color: colors.text, fontSize: 15, fontWeight: font.medium, marginTop: 1 },
});
