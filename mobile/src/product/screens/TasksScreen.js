/**
 * Tasks: the piles, the figures, search, filters and the cards.
 *
 *   PILES     Assigned to me · Assigned by me · In the loop · Team (owner/admin
 *             of a team) · All tasks (Super Admin), each with how much is
 *             open and late (or waiting on a review).
 *   SEARCH    the task's name, or the name of whoever set it or holds it.
 *   FILTER    one sheet: due date, team, category, people, completed tasks,
 *             priority, status (overdue / finished late / more time asked),
 *             and the order.
 *   FIGURES   Total (open work) · Not accepted · Overdue · In progress ·
 *             Under review · More time asked.
 *   CARDS     tinted by priority, each with a status pill (the moves the
 *             server allows), a reminder bell and swipes.
 *
 * Every filter runs on the server and the figures come back with the rows
 * (pile counters too, via `withScopes`), so a change is one request. Pages of
 * 25 load as the list scrolls; nothing collapses on a refetch.
 *
 * THE HRMS SCREEN (2026-10-08, "check the UI of HRMS task, need same as
 * that"):
 *   HEADER TOOLS   Search and Filter are icons in the bar; Search turns the
 *                  title into a search box with the keyboard already up. The
 *                  row of search box · Filter · Completed under the piles is
 *                  gone, and so is the always-on swipe hint.
 *   COMPACT        the piles are ONE ROW OF SLIM CHIPS (an icon and the open
 *                  count, a red dot when some are late, and the chosen one's
 *                  name) and the figures ONE STRIP OF PILLS that scrolls
 *                  sideways, so three or more cards show without scrolling
 *                  (as the web on a phone). No word on them is ever cut: what
 *                  would not fit is an icon, and a screen reader hears it all.
 *   COMPLETED      Filter → "Completed tasks" (Hide · Show in Total · Only
 *                  completed) instead of a button beside Filter.
 *   ASSIGNED TO    in the Filter on every pile, Assigned to me included (the
 *                  tasks I share with those people).
 *   SWIPES         every open card swipes (components/TaskSwipe): a side with
 *                  no move of its own opens the status menu, a task I set
 *                  nobody has taken on yet swipes right to Edit, and Accept
 *                  happens at once. FIRST USE: until the first real swipe (or
 *                  the ✕), a tip sits above the cards and the first card that
 *                  swipes peeks each way, once a launch.
 *
 * Route params (optional): { pile, team, assignedTo, nonce } open the screen
 * on a pile, a team or a person (Team tasks, the console).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { usePullRefresh, useRefetchOnFocus } from '../../platform/hooks';
import { colors, radius, space } from '../../platform/theme';
import {
  BottomSheet,
  Button,
  Chip,
  ChipRow,
  DateField,
  EmptyState,
  ErrorState,
  FAB,
  Header,
  HeaderIcon,
  Screen,
  SkeletonCards,
  SwitchRow,
  toast,
  ymdLabel,
} from '../../platform/ui';
import { acceptTask, listTasks, taskKeys, useTaskMeta } from '../api';
import TaskCard from '../components/TaskCard';
import TaskPeoplePicker from '../components/TaskPeoplePicker';
import TaskStatusSheets from '../components/TaskStatusSheets';
import { SwipeHint, useSwipeHint } from '../components/TaskSwipe';
import { ArrowDown, ArrowUp, CheckCheck, ChevronDown, Eye, Inbox, Layers, Plus, Search, Send, SlidersHorizontal, Users, X } from '../icons';
import {
  CLOSED_KEYS,
  GRID_TILES,
  RANGE_KEYS,
  SORT_DIR,
  SORT_KEYS,
  STATUS,
  TASK_PRIORITY,
  TILE_QUERY,
  closedLabel,
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
  tileTint,
  totalQuery,
  totalValue,
} from '../taskStatus';

const PAGE_SIZE = 25;
/** Each pile's icon: work coming in, work sent out, watching, a team, everything. */
const PILE_ICONS = { mine: Inbox, delegated: Send, loop: Eye, team: Users, all: Layers };
/** The list's gutter; the figure strip (and a pile row too long for the screen) bleeds through it to the edges. */
const STRIP_PAD = space(3);
/** The space between the rows above the cards. */
const HEAD_GAP = 10;
/** Up to this many piles share the row; more scroll sideways. */
const PILES_IN_A_ROW = 3;
/** The first-use peek goes to a card near the top: one of this many. */
const PEEK_WITHIN = 6;

/** What "no filter" is. The screen opens on it; Reset goes back to it. */
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
  // Filter → Completed tasks: '' hidden (Total is the open work), 'with'
  // shown in Total too, 'only' them alone (taskStatus.totalQuery).
  closed: '',
  sort: 'due',
  dir: 'desc',
};

function pileLabel(key) {
  return (
    {
      mine: tr('Assigned to me'),
      delegated: tr('Assigned by me'),
      loop: tr('In the loop'),
      team: tr('Team'),
      all: tr('All tasks'),
    }[key] || key
  );
}

/** A pile's name on its chip (the full name is what a screen reader hears). */
function pileShort(key) {
  return (
    {
      mine: tr('To me'),
      delegated: tr('By me'),
      loop: tr('In loop'),
      team: tr('Team'),
      all: tr('All'),
    }[key] || pileLabel(key)
  );
}

/** A figure's name on its pill (the full name is what a screen reader hears). */
function figureShort(key) {
  return (
    {
      total: tr('Total'),
      pending: tr('Not accepted'),
      overdue: tr('Overdue'),
      inProgress: tr('In progress'),
      inReview: tr('In review'),
      moreTime: tr('More time'),
    }[key] || tileLabel(key)
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
  // SEARCH lives in the bar: an icon until tapped, then the title becomes the box.
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  /**
   * The sheet over the list: `{ task, stage, remark }`. From the status pill
   * `stage` is null (the menu); from a swipe it is the move itself and
   * `remark` makes the box mandatory (meta.swipeRemarkRequired).
   */
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
    // Which states: a figure picked wins, then the Status chips, then Total,
    // which is the open work plus whatever Filter → Completed tasks adds.
    let states;
    if (tile) states = TILE_QUERY[tile];
    else if (f.status.length) states = { status: csv(f.status) };
    else states = totalQuery(f.closed);
    return {
      scope: pile,
      range: f.range,
      ...(f.range === 'custom' ? { from: f.from, to: f.to } : {}),
      ...(f.team ? { team: f.team } : {}),
      ...(f.category.length ? { category: csv(f.category) } : {}),
      // "Assigned to" on EVERY pile: on Assigned to me it finds the tasks I
      // share with those people. The side of a pile that is always the reader
      // is not a filter, so "Assigned by" stays off Assigned by me.
      ...(f.assignedTo.length ? { assignedTo: csv(f.assignedTo) } : {}),
      ...(f.assignedBy.length && pile !== 'delegated' ? { assignedBy: csv(f.assignedBy) } : {}),
      ...(f.priority.length ? { priority: csv(f.priority) } : {}),
      ...(debounced ? { q: debounced } : {}),
      ...states,
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
  const refetch = q.refetch;
  useRefetchOnFocus(refetch);
  // The pull indicator only while the person is pulling, never for a quiet refetch.
  const { refreshing, onRefresh } = usePullRefresh(refetch);

  const first = q.data?.pages?.[0];
  const tasks = useMemo(() => q.data?.pages.flatMap((p) => p?.tasks || []) || null, [q.data]);
  const counters = first?.counters || {};
  const scopes = first?.scopes || null;
  const loading = !q.data && q.isPending;

  const refresh = useCallback(() => refetch(), [refetch]);
  const openTask = useCallback((t) => nav.navigate('TaskDetail', { id: t?._id || t }), [nav]);
  // The assign form in edit mode, which re-checks `can.canEdit` itself on load.
  const editTask = useCallback((t) => nav.navigate('AssignTask', { editTaskId: t?._id || t }), [nav]);

  const people = useMemo(() => meta?.people || [], [meta]);
  const nameOf = useCallback(
    (id) => (String(id) === meId ? tr('me') : people.find((p) => String(p._id || p.id) === String(id))?.name || tr('someone')),
    [people, meId]
  );
  const teamName = useCallback((id) => (meta?.teams || []).find((t) => String(t.id) === String(id))?.name || tr('Team'), [meta]);

  const pickPile = useCallback((key) => {
    setTile('');
    setPile(key);
  }, []);
  const pickTile = useCallback((key) => setTile((cur) => (cur === key || key === 'total' ? '' : key)), []);

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
    f.assignedTo.forEach((id) => out.push({ key: `t-${id}`, label: tr('To {name}', { name: nameOf(id) }), clear: { assignedTo: f.assignedTo.filter((x) => x !== id) } }));
    if (pile !== 'delegated') f.assignedBy.forEach((id) => out.push({ key: `b-${id}`, label: tr('By {name}', { name: nameOf(id) }), clear: { assignedBy: f.assignedBy.filter((x) => x !== id) } }));
    f.priority.forEach((p) => out.push({ key: `p-${p}`, label: priorityLabel(p), clear: { priority: f.priority.filter((x) => x !== p) } }));
    if (f.closed) out.push({ key: 'closed', label: f.closed === 'only' ? tr('Only completed') : tr('Completed shown'), clear: { closed: '' } });
    if (!tile) f.status.forEach((s) => out.push({ key: `s-${s}`, label: statusLabel(s), clear: { status: f.status.filter((x) => x !== s) } }));
    if (f.overdue) out.push({ key: 'overdue', label: tr('Overdue'), clear: { overdue: false } });
    if (f.late) out.push({ key: 'late', label: tr('Finished late'), clear: { late: false } });
    if (f.moreTime) out.push({ key: 'moreTime', label: tr('More time asked'), clear: { moreTime: false } });
    return out;
  }, [filters, pile, nameOf, teamName, tile]);

  // The badge on Filter: every chip but the due date, which is a window, not a filter.
  const filterCount = chips.filter((c) => c.key !== 'range').length;
  // Narrowed BY THE READER: a figure, a search or any chip.
  const narrowed = Boolean(debounced || tile || chips.length);

  const closeSearch = useCallback(() => {
    setSearch('');
    setSearchOpen(false);
  }, []);

  // Back closes the search box before it leaves the screen.
  useFocusEffect(
    useCallback(() => {
      if (!searchOpen) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        closeSearch();
        return true;
      });
      return () => sub.remove();
    }, [searchOpen, closeSearch])
  );

  const requireRemark = meta?.swipeRemarkRequired !== false;
  // Tasks being accepted from a swipe right now, so a second pull on the same
  // card before the first answer cannot send it twice.
  const accepting = useRef(new Set());
  // A swipe (or the same move from a screen reader's actions on the card):
  // 'menu' (a side with no move of its own) opens the status menu, exactly as
  // the pill does; 'edit' opens the assign form; ACCEPT ASKS FOR NOTHING, it
  // happens at once, as from the status menu. Any other move opens its
  // remark sheet.
  const onSwipe = useCallback(
    async (task, key) => {
      if (key === 'edit') {
        editTask(task);
        return;
      }
      if (key === 'accept') {
        if (accepting.current.has(task._id)) return;
        accepting.current.add(task._id);
        try {
          await acceptTask(task._id);
          toast.success(tr('Accepted — it is in progress now.'));
          refresh();
        } catch (e) {
          toast.error(e?.message || tr('Could not accept that task.'));
        } finally {
          accepting.current.delete(task._id);
        }
        return;
      }
      setSheet(key === 'menu' ? { task, stage: null, remark: false } : { task, stage: key, remark: requireRemark });
    },
    [requireRemark, editTask, refresh]
  );
  const onNudged = useCallback((id, at) => setNudged((m) => ({ ...m, [id]: at })), []);

  // FIRST USE: until the first real swipe (or the tip's ✕), a tip above the
  // cards while any of them swipes, and the first card near the top that
  // swipes peeks each way. Nothing is worked out once the swipe is learned.
  const hint = useSwipeHint();
  const swipeable = useMemo(() => {
    if (!hint.visible || !tasks) return null;
    const moves = (t) => {
      const s = swipeActionsFor(t);
      return Boolean(s.left || s.right);
    };
    return { any: tasks.some(moves), peekId: tasks.slice(0, PEEK_WITHIN).find(moves)?._id || null };
  }, [hint.visible, tasks]);
  const peekId = hint.show ? swipeable?.peekId || null : null;

  const renderRow = useCallback(
    ({ item }) => (
      <TaskCard
        task={item}
        meId={meId}
        nudgedAt={nudged[item._id] || null}
        onNudged={onNudged}
        onOpen={() => openTask(item)}
        onStatus={() => setSheet({ task: item, stage: null, remark: false })}
        onSwipe={(key) => onSwipe(item, key)}
        peek={item._id === peekId}
      />
    ),
    [meId, openTask, nudged, onNudged, onSwipe, peekId]
  );

  const piles = useMemo(
    () => ['mine', 'delegated', 'loop', ...(managedTeams.length || scopes?.team ? ['team'] : []), ...(isAdmin ? ['all'] : [])],
    [managedTeams.length, scopes?.team, isAdmin]
  );

  const completedCount = Number(counters.completed) || 0;
  let emptyTitle = tr('No open tasks');
  if (narrowed) emptyTitle = tr('Nothing matches');
  else if (pile === 'mine') emptyTitle = completedCount > 0 ? tr('Nothing open on your plate') : tr('Nothing assigned to you');
  else if (pile === 'delegated') emptyTitle = tr('Nothing you assigned is open');
  else if (pile === 'loop') emptyTitle = tr('Nothing to follow');
  let emptyMessage;
  if (narrowed) emptyMessage = tr('Try a wider due date, another figure, or clear the filters.');
  // Total lists open work only: say where the finished ones went.
  else if (completedCount > 0 && !filters.closed) emptyMessage = tr('Finished tasks: Filter → Completed tasks.');
  else if (pile === 'mine') emptyMessage = tr('Tasks given to you, and the ones you set yourself, land here.');
  else if (pile === 'loop') emptyMessage = tr('When somebody keeps you in the loop on a task, it shows up here.');
  else emptyMessage = tr('Tap Assign task to give someone a task.');

  // ── The bar: the title (or the search box) and the two tools ──
  const topBar = (
    <Header
      surface
      title={pile === 'all' ? tr('All tasks') : tr('Tasks')}
      subtitle={pile === 'team' && filters.team ? teamName(filters.team) : undefined}
      titleSlot={searchOpen ? <NavSearch initial={search} onChange={setSearch} onClose={closeSearch} /> : undefined}
      right={
        searchOpen ? null : (
          <View style={styles.navTools}>
            <HeaderIcon icon={Search} label={tr('Search')} onPress={() => setSearchOpen(true)} dot={Boolean(search)} />
            <HeaderIcon icon={SlidersHorizontal} label={tr('Filter')} onPress={() => setFilterOpen(true)} count={filterCount} />
          </View>
        )
      }
    />
  );

  // ── Piles · chips · figures (· the first-use tip), scrolling WITH the rows ──
  const listHeader = (
    <View style={styles.headerWrap}>
      <PileChips piles={piles} pile={pile} scopes={scopes} onPile={pickPile} />

      {chips.length > 0 ? (
        <View style={styles.chipsRow}>
          {chips.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => setFilters((f) => ({ ...f, ...c.clear }))}
              style={styles.activeChip}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={tr('Remove {label}', { label: c.label })}
            >
              <Text style={styles.activeChipText} numberOfLines={1}>
                {c.label}
              </Text>
              <X size={14} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          ))}
          {chips.length > 1 ? (
            <Pressable
              onPress={() => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort, dir: f.dir }))}
              style={styles.clearAll}
              hitSlop={4}
              accessibilityRole="button"
            >
              <Text style={styles.clearAllText}>{tr('Clear all')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* The six figures, one strip of pills that scrolls sideways, edge to
          edge; each is a filter. Selecting one only changes colours: the
          border's width is on the base style. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.figureStrip}
        keyboardShouldPersistTaps="handled"
      >
        {GRID_TILES.map((t) => {
          const on = tile === t.key || (!tile && t.key === 'total');
          const tint = tileTint(t);
          const value = t.key === 'total' ? totalValue(counters, filters.closed) : statValue(counters, t.key);
          return (
            <Pressable
              key={t.key}
              onPress={() => pickTile(t.key)}
              style={({ pressed }) => [styles.figure, on && { backgroundColor: `${tint}1A`, borderColor: tint }, pressed && !on && styles.figurePressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${tileLabel(t.key)}: ${loading ? '' : value}`}
            >
              <View style={[styles.figureDot, { backgroundColor: tint }]} />
              <Text style={[styles.figureCount, { color: on ? tint : value || loading ? colors.text : colors.textFaint }]} maxFontSizeMultiplier={1.2}>
                {loading ? '·' : value}
              </Text>
              {/* Never cut: the pill is as wide as its words. */}
              <Text style={[styles.figureName, on && { color: tint }]} maxFontSizeMultiplier={1.2}>
                {figureShort(t.key)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {hint.visible && swipeable?.any ? <SwipeHint gap={HEAD_GAP} /> : null}
    </View>
  );

  let body;
  if (q.isError && !tasks) body = <ErrorState error={q.error} onRetry={refetch} />;
  else
    body = (
      <FlatList
        data={tasks || []}
        keyExtractor={(t) => String(t._id)}
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} progressBackgroundColor={colors.card} />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        ListFooterComponent={
          q.isFetchingNextPage ? (
            <View style={styles.more}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          loading ? <SkeletonCards count={3} height={140} /> : <EmptyState compact icon={CheckCheck} title={emptyTitle} message={emptyMessage} />
        }
      />
    );

  return (
    <Screen inTabs padded={false} header={topBar} style={styles.screenTop} contentStyle={styles.screenBody}>
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
 * The search box that replaces the title. It keeps its own text so typing
 * never rebuilds the bar around it; the screen hears every change and
 * debounces it. ✕ clears the words first, then closes.
 */
function NavSearch({ initial, onChange, onClose }) {
  const [text, setText] = useState(initial || '');
  const ref = useRef(null);
  // autoFocus alone can lose the race with the bar's own layout on Android.
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={styles.navSearch}>
      <Search size={17} color={colors.textFaint} />
      <TextInput
        ref={ref}
        value={text}
        onChangeText={(v) => {
          setText(v);
          onChange(v);
        }}
        placeholder={tr('Search task or person…')}
        placeholderTextColor={colors.textFaint}
        style={styles.navSearchInput}
        returnKeyType="search"
        autoCorrect={false}
        autoFocus
        accessibilityLabel={tr('Search')}
      />
      <Pressable
        onPress={() => {
          if (text) {
            setText('');
            onChange('');
          } else onClose();
        }}
        onLongPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={text ? tr('Clear the search') : tr('Close')}
      >
        <X size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

/**
 * The piles, ONE ROW OF SLIM CHIPS (as the web on a phone): up to three
 * share the row; more scroll sideways, edge to edge, with the chosen one
 * brought into view (opened on All tasks, or sent to a pile by a link), at
 * once the first time and smoothly after that.
 */
function PileChips({ piles, pile, scopes, onPile }) {
  const fit = piles.length <= PILES_IN_A_ROW;
  const ref = useRef(null);
  // Where each chip sits in the scrolling row, how much of it shows, where
  // it is scrolled to, and whether the chosen chip has been brought in yet.
  const spots = useRef({});
  const viewW = useRef(0);
  const offset = useRef(0);
  const placed = useRef(false);

  const bringIn = useCallback(
    (animated) => {
      const spot = spots.current[pile];
      if (fit || !spot || !viewW.current) return;
      placed.current = true;
      const from = spot.x - STRIP_PAD;
      const to = spot.x + spot.w + STRIP_PAD - viewW.current;
      if (from < offset.current) ref.current?.scrollTo({ x: Math.max(0, from), animated });
      else if (to > offset.current) ref.current?.scrollTo({ x: to, animated });
    },
    [fit, pile]
  );

  useEffect(() => {
    if (placed.current) bringIn(true);
  }, [bringIn]);

  const chips = piles.map((key) => (
    <PileChip
      key={key}
      pileKey={key}
      on={pile === key}
      c={scopes?.[key]}
      fill={fit}
      onPress={() => onPile(key)}
      onLayout={
        fit
          ? undefined
          : (e) => {
              spots.current[key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
              if (key === pile && !placed.current) bringIn(false);
            }
      }
    />
  ));

  if (fit) return <View style={styles.pileRow}>{chips}</View>;
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bleed}
      contentContainerStyle={styles.pileScroll}
      onLayout={(e) => {
        viewW.current = e.nativeEvent.layout.width;
        if (!placed.current) bringIn(false);
      }}
      scrollEventThrottle={32}
      onScroll={(e) => {
        offset.current = e.nativeEvent.contentOffset.x;
      }}
      keyboardShouldPersistTaps="handled"
    >
      {chips}
    </ScrollView>
  );
}

/**
 * One pile: its icon and a bubble with how many are open, and a red dot at
 * the corner while some are late. Only the chosen pile also shows its name,
 * and always whole: its chip takes the room the name needs and a larger
 * share of what is left (1.8 to the others' 1). No name is ever cut. The
 * same border in both states. A screen reader hears the full name and both
 * figures.
 */
function PileChip({ pileKey, on, c, fill, onPress, onLayout }) {
  const Icon = PILE_ICONS[pileKey] || Layers;
  const overdue = Number(c?.overdue) || 0;
  const n = c ? openCount(c) : null;
  let a11y = pileLabel(pileKey);
  if (n !== null) a11y += `, ${tr('{n} open', { n })}`;
  if (overdue) a11y += `, ${tr('{n} late', { n: overdue })}`;
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      style={({ pressed }) => [
        styles.pile,
        on ? styles.pileOn : styles.pileOff,
        fill ? (on ? styles.pileGrowOn : styles.pileGrow) : styles.pileLoose,
        pressed && !on && styles.pilePressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={a11y}
    >
      <Icon size={16} color={on ? colors.primary : colors.textSecondary} strokeWidth={2.25} />
      {on ? (
        <Text style={styles.pileLabel} maxFontSizeMultiplier={1.2}>
          {pileShort(pileKey)}
        </Text>
      ) : null}
      <View style={[styles.pileCount, on && styles.pileCountOn]}>
        <Text style={[styles.pileCountText, on && styles.pileCountTextOn]} maxFontSizeMultiplier={1.2}>
          {n ?? '–'}
        </Text>
      </View>
      {overdue > 0 ? <View style={styles.pileLate} /> : null}
    </Pressable>
  );
}

/**
 * The Filter sheet. Changes are not live until "Show tasks". The people
 * choice swaps the sheet's content for the picker, and "Done" comes back:
 * one sheet, its content swapped, never a modal on top of another.
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
        footer={<Button title={tr('Done')} size="lg" onPress={() => setPicking(null)} />}
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
          {/* Everything back to how the screen opens, the order included. */}
          <Button title={tr('Reset')} variant="secondary" size="lg" full={false} onPress={() => setDraft(DEFAULT_FILTERS)} />
          <Button title={tr('Show tasks')} size="lg" style={styles.flex} onPress={() => onApply(draft)} />
        </View>
      }
    >
      <FilterSection title={tr('Due date')}>
        <ChipRow style={styles.chipWrap}>
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
          <ChipRow style={styles.chipWrap}>
            <Chip label={tr('Any team')} selected={!draft.team} onPress={() => set({ team: '' })} />
            {teams.map((t) => (
              <Chip key={t.id} label={t.name} icon={Users} selected={String(draft.team) === String(t.id)} onPress={() => set({ team: t.id })} />
            ))}
          </ChipRow>
        </FilterSection>
      ) : null}

      {categories.length ? (
        <FilterSection title={tr('Category')}>
          <ChipRow style={styles.chipWrap}>
            {categories.map((c) => (
              <Chip key={c} label={c} selected={draft.category.includes(c)} onPress={() => toggle('category', c)} />
            ))}
          </ChipRow>
        </FilterSection>
      ) : null}

      <FilterSection title={tr('People')}>
        {/* On every pile: on Assigned to me, the tasks you share with them. */}
        <DropRow label={tr('Assigned to')} value={names(draft.assignedTo) || tr('Anyone')} onPress={() => setPicking('assignedTo')} />
        {pile !== 'delegated' ? <DropRow label={tr('Assigned by')} value={names(draft.assignedBy) || tr('Anyone')} onPress={() => setPicking('assignedBy')} /> : null}
      </FilterSection>

      {/* Where the Completed button went. */}
      <FilterSection title={tr('Completed tasks')}>
        <ChipRow style={styles.chipWrap}>
          {CLOSED_KEYS.map((key) => (
            <Chip key={key || 'hide'} label={closedLabel(key)} selected={(draft.closed || '') === key} onPress={() => set({ closed: key })} />
          ))}
        </ChipRow>
      </FilterSection>

      <FilterSection title={tr('Priority')}>
        <ChipRow style={styles.chipWrap}>
          {TASK_PRIORITY.map((p) => {
            const c = priorityColor(p);
            return <Chip key={p} label={priorityLabel(p)} selected={draft.priority.includes(p)} color={c.solid} dot={c.solid} onPress={() => toggle('priority', p)} />;
          })}
        </ChipRow>
      </FilterSection>

      <FilterSection title={tr('Status')} hint={tileChosen ? tr('A figure is picked above the list; it decides the status for now.') : undefined}>
        <ChipRow style={styles.chipWrap}>
          {[STATUS.PENDING, STATUS.IN_PROGRESS, STATUS.SUBMITTED, STATUS.COMPLETED, STATUS.CANCELLED].map((s) => (
            <Chip key={s} label={statusLabel(s)} selected={draft.status.includes(s)} onPress={() => toggle('status', s)} />
          ))}
        </ChipRow>
        <SwitchRow label={tr('Overdue only')} value={draft.overdue} onChange={(v) => set({ overdue: v })} boxed={false} />
        <SwitchRow label={tr('Finished late')} value={draft.late} onChange={(v) => set({ late: v })} boxed={false} />
        <SwitchRow label={tr('More time asked')} value={draft.moreTime} onChange={(v) => set({ moreTime: v })} boxed={false} />
      </FilterSection>

      <FilterSection title={tr('Sort by')} hint={tr('Tap the one in use to turn it around.')}>
        <ChipRow style={styles.chipWrap}>
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

/** A dropdown-looking row: tapping it opens the searchable picker. */
function DropRow({ label, value, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dropRow, pressed && styles.dropRowPressed]} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
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
  // The bar is the card colour, and so is the strip above it under the clock;
  // the list below sits on the page's grey.
  screenTop: { backgroundColor: colors.card },
  screenBody: { backgroundColor: colors.bg },
  navTools: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: space(1) },
  navSearch: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(3),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  navSearchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 6 },

  list: { padding: STRIP_PAD, paddingBottom: 110, gap: 10 },
  more: { alignItems: 'center', justifyContent: 'center', padding: space(6) },
  headerWrap: { gap: HEAD_GAP },
  // A sideways strip that runs to the screen's edges through the list's gutter.
  bleed: { marginHorizontal: -STRIP_PAD, flexGrow: 0 },

  // ── Piles: one row of slim chips ──
  pileRow: { flexDirection: 'row', gap: 8 },
  pileScroll: { paddingHorizontal: STRIP_PAD, gap: 8 },
  pile: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  // The chosen chip: icon · name · count, the count at the right end.
  pileOn: { paddingLeft: 10, paddingRight: 6, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  // The others: icon · count, in the middle.
  pileOff: { justifyContent: 'center', paddingHorizontal: 8 },
  // Sharing the row (three or fewer): each from the room it needs, the chosen one growing most.
  pileGrow: { flexGrow: 1 },
  pileGrowOn: { flexGrow: 1.8 },
  // Scrolling (more than three): each as wide as it needs, never thinner than this.
  pileLoose: { minWidth: 64 },
  pilePressed: { opacity: 0.85 },
  // Never cut: the name sets the chip's width, not the other way round.
  pileLabel: { flexGrow: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  pileCount: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  pileCountOn: { backgroundColor: colors.primary },
  pileCountText: { color: colors.text, fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pileCountTextOn: { color: colors.onPrimary },
  pileLate: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.dangerFill },

  // ── What is narrowing the list ──
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  activeChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: `${colors.primary}55`,
    backgroundColor: colors.primarySoft,
    maxWidth: '100%',
  },
  activeChipText: { color: colors.text, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  clearAll: { minHeight: 34, justifyContent: 'center', paddingHorizontal: space(2) },
  clearAllText: { color: colors.primary, fontSize: 12, fontWeight: '800' },

  // ── Figures: one strip of pills ──
  figureStrip: { paddingHorizontal: STRIP_PAD, gap: 6 },
  figure: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  figurePressed: { backgroundColor: colors.muted },
  figureDot: { width: 6, height: 6, borderRadius: 3 },
  figureCount: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  figureName: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },

  // ── Filter sheet ──
  footer: { flexDirection: 'row', gap: 10 },
  section: { paddingVertical: space(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sectionTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1 },
  sectionHint: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  sectionBody: { marginTop: space(2) },
  chipWrap: { gap: 6 },
  dates: { gap: space(2), marginTop: space(2) },
  hint: { color: colors.textFaint, fontSize: 11, marginTop: 6 },
  dropRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: space(2),
    paddingHorizontal: space(3.5),
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  dropRowPressed: { backgroundColor: colors.muted },
  dropLabel: { color: colors.textFaint, fontSize: 11, fontWeight: '700' },
  dropValue: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 1 },
});
