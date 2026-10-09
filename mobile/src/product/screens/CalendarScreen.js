/**
 * Calendar: the month as a grid, after the HRMS app's calendar (screens/
 * CalendarScreen.js there), with the chosen day's entries listed under it.
 *
 * What is on it (GET /api/calendar?month=YYYY-MM): my open tasks on the day
 * they are due (overdue in red), tasks finished on the day they were
 * finished, and the reminders I can see — mine, and ones set for me.
 * Reminders are added, edited and deleted right here (/api/reminders; the
 * form is components/ReminderFormSheet): for myself, for people I can give
 * work to, for a team I run, or (the Super Admin) for everyone.
 *
 * The kinds, colours and order are the web's (product/calendar.js). The key
 * is a row of filter chips, each with the month's count, that swipes
 * sideways; a day cell carries up to three dots, then "+N". Tapping an entry
 * opens it in full: a task can be opened from there, and a reminder edited
 * or deleted by whoever set it (or the Super Admin).
 *
 * Route params (optional): { date: 'YYYY-MM-DD', nonce } open that month on
 * that day — the link a reminder's alert carries (config.routeForLink).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { tr, trCount } from '../../i18n';
import { zoned } from '../../platform/format';
import { usePullRefresh, useRefetchOnFocus } from '../../platform/hooks';
import { useSettings } from '../../platform/session';
import { colors, font, space } from '../../platform/theme';
import { BottomSheet, Button, confirm, EmptyState, ErrorState, Header, Screen, SkeletonList, toast } from '../../platform/ui';
import { calendarKeys, deleteReminder, useCalendarMonth } from '../api';
import {
  KIND_ORDER,
  KINDS,
  daysIn,
  dayKeyOf,
  detailRows,
  entrySubtitle,
  isReminder,
  kindMeta,
  kindOf,
  longDate,
  monthGrid,
  parseDay,
  ymKey,
} from '../calendar';
import ReminderFormSheet, { blankReminder, reminderSeed } from '../components/ReminderFormSheet';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Pencil, Plus, Trash } from '../icons';
import { monthName, weekdayLetter } from '../taskStatus';

// Dots a day cell carries before the rest collapse into "+N" (the web's cut):
// the count is what tells a day of eight from a day of three.
const MAX_DOTS = 3;
// Lines the month's roll-up lists before "+N more".
const ROLLUP_ROWS = 12;
// Two sheets (React Native Modals) changing places in one frame leave Android
// showing neither, so the second waits for the first to finish closing.
const HANDOVER_MS = 250;
const WEEK = [0, 1, 2, 3, 4, 5, 6];

const entryKey = (e, i) => `${e.type}-${e.meta?.reminderId || e.meta?.taskId || ''}-${i}`;

export default function CalendarScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const qc = useQueryClient();
  const { timezone } = useSettings();
  // Today as the server counts days: in my own time zone (Settings).
  const now = zoned(new Date(), timezone);
  const today = { y: now.year, m: now.month + 1, d: now.day };

  const askedDate = route.params?.date;
  const nonce = route.params?.nonce;
  const [view, setView] = useState(() => {
    const at = parseDay(askedDate);
    return at ? { y: at.y, m: at.m } : { y: today.y, m: today.m };
  });
  const [selected, setSelected] = useState(() => parseDay(askedDate)?.d || today.d);
  const [filter, setFilter] = useState('all'); // 'all' | a KINDS key
  const [rollup, setRollup] = useState(false);
  // The entry in the detail sheet stays set while the sheet slides away.
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // The reminder form's seed; null = closed (components/ReminderFormSheet).
  const [formSeed, setFormSeed] = useState(null);

  // Opened from an alert, or opened again with another day: go to it, with
  // nothing filtered out, so the entry the alert is about is in view.
  useEffect(() => {
    const at = parseDay(askedDate);
    if (!at) return;
    setView({ y: at.y, m: at.m });
    setSelected(at.d);
    setFilter('all');
  }, [askedDate, nonce]);

  const q = useCalendarMonth(ymKey(view.y, view.m));
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  useRefetchOnFocus(q.refetch);
  const loaded = Boolean(q.data);
  const aim = q.data?.aim;

  const events = useMemo(() => (q.data?.events || []).map((e) => ({ ...e, kind: kindOf(e) })), [q.data]);

  // Per-kind totals: the web prints these beside its key; here they ride on
  // the filter chips, the same information in the space there is.
  const counts = useMemo(() => {
    const c = {};
    for (const e of events) c[e.kind] = (c[e.kind] || 0) + 1;
    return c;
  }, [events]);
  // Chips only for the kinds this month holds: one that can only empty the
  // screen is a dead end.
  const chipKinds = useMemo(() => KIND_ORDER.filter((k) => counts[k]), [counts]);
  // A filter on a kind the shown month has none of is read back as "All"
  // rather than stored as gone: its chip has disappeared, and a month of one
  // kind has no chips at all, so nothing would be left to clear it with.
  const activeFilter = chipKinds.includes(filter) ? filter : 'all';
  const shown = useMemo(() => (activeFilter === 'all' ? events : events.filter((e) => e.kind === activeFilter)), [events, activeFilter]);

  // Day → its entries, in the key's order, so whatever survives the dot cut
  // is the day's most telling entry (overdue first, finished last).
  const byDay = useMemo(() => {
    const map = {};
    for (const e of shown) (map[e.day] = map[e.day] || []).push(e);
    for (const d of Object.keys(map)) map[d].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    return map;
  }, [shown]);

  const cells = useMemo(() => monthGrid(view.y, view.m), [view.y, view.m]);
  const weeks = useMemo(() => Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7)), [cells]);
  const day = Math.min(selected, daysIn(view.y, view.m));
  const isToday = (d) => view.y === today.y && view.m === today.m && d === today.d;
  const dayEntries = byDay[day] || [];

  // Step the month, moving the selection with it: today when the new month
  // holds it, otherwise the 1st — a day is always chosen.
  const shift = (dir) => {
    let m = view.m + dir;
    let y = view.y;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setView({ y, m });
    setSelected(y === today.y && m === today.m ? today.d : 1);
  };

  const goToday = () => {
    setView({ y: today.y, m: today.m });
    setSelected(today.d);
  };

  const showDetail = (e) => {
    setDetail(e);
    setDetailOpen(true);
  };
  const hideDetail = () => setDetailOpen(false);

  // ---- Reminders ----
  const openNew = () => setFormSeed(blankReminder(dayKeyOf(view.y, view.m, day)));
  const openEdit = (e) => setFormSeed(reminderSeed(e));

  // Saved: it may have moved to another month or day — follow it there, and
  // drop a filter that would hide it.
  const onSaved = (date) => {
    const at = parseDay(date);
    if (at) {
      if (at.y !== view.y || at.m !== view.m) setView({ y: at.y, m: at.m });
      setSelected(at.d);
    }
    if (!isReminder(filter)) setFilter('all');
  };

  const askDelete = async (e) => {
    const id = e.meta?.reminderId;
    if (!id) return;
    const ok = await confirm({
      title: tr('Delete this reminder?'),
      message: tr('“{title}” is removed for everyone it was set for.', { title: e.label }),
      confirmLabel: tr('Delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteReminder(id);
      toast.success(tr('Reminder deleted.'));
      qc.invalidateQueries({ queryKey: calendarKeys.all });
    } catch (err) {
      toast.error(err.message);
    }
  };

  // From the detail sheet to the editor or the confirm dialog: the sheet
  // closes first (see HANDOVER_MS).
  const handOver = (next) => {
    hideDetail();
    setTimeout(next, HANDOVER_MS);
  };

  const openTask = (e) => {
    hideDetail();
    nav.navigate('TaskDetail', { id: e.meta.taskId });
  };

  // ---- The detail sheet's actions, by kind ----
  let detailFooter = null;
  if (detail && isReminder(detail.kind) && detail.meta?.canEdit) {
    detailFooter = (
      <View style={styles.sheetActions}>
        <Button title={tr('Edit')} icon={Pencil} variant="secondary" size="lg" style={styles.flex} onPress={() => handOver(() => openEdit(detail))} />
        <Button title={tr('Delete')} icon={Trash} variant="danger" size="lg" style={styles.flex} onPress={() => handOver(() => askDelete(detail))} />
      </View>
    );
  } else if (detail && !isReminder(detail.kind) && detail.meta?.taskId) {
    detailFooter = <Button title={tr('Open task')} icon={ExternalLink} size="lg" onPress={() => openTask(detail)} />;
  }
  const rows = detail ? detailRows(detail) : [];
  const detailDay = detail ? parseDay(detail.date) || { y: view.y, m: view.m, d: detail.day } : null;

  // ---- The chosen day's list ----
  let dayList;
  if (!loaded && q.isError) dayList = <ErrorState compact error={q.error} onRetry={q.refetch} />;
  else if (!loaded) dayList = <SkeletonList rows={2} style={styles.skeleton} />;
  else if (!dayEntries.length) {
    dayList = (
      <EmptyState
        compact
        icon={CalendarDays}
        title={tr('Nothing on this day')}
        message={
          activeFilter === 'all'
            ? tr('Pick another date to see what is on.')
            : tr('No {what} on this day — tap "All" to see everything.', { what: tr(KINDS[activeFilter].chip).toLowerCase() })
        }
      />
    );
  } else {
    dayList = (
      <View style={styles.entries}>
        {dayEntries.map((e, i) => (
          <EntryRow
            key={entryKey(e, i)}
            entry={e}
            onPress={() => showDetail(e)}
            onEdit={() => openEdit(e)}
            onDelete={() => askDelete(e)}
          />
        ))}
      </View>
    );
  }

  return (
    <Screen inTabs padded={false} header={<Header large title={tr('Calendar')} />}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
      >
        {/* The month, and the way to the next and last */}
        <View style={styles.monthBar}>
          <RoundButton icon={ChevronLeft} label={tr('Previous month')} onPress={() => shift(-1)} />
          <View style={styles.monthLabel}>
            <Text style={styles.monthTitle}>{monthName(view.m)}</Text>
            <Text style={styles.monthYear}>{view.y}</Text>
          </View>
          <RoundButton icon={ChevronRight} label={tr('Next month')} onPress={() => shift(1)} />
        </View>

        {/* The key, as filters: ONE row that swipes sideways (as on the HRMS). */}
        {chipKinds.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipStrip} contentContainerStyle={styles.chips}>
            <FilterChip label={tr('All')} count={events.length} active={activeFilter === 'all'} onPress={() => setFilter('all')} />
            {chipKinds.map((k) => (
              <FilterChip
                key={k}
                label={tr(KINDS[k].chip)}
                count={counts[k]}
                color={KINDS[k].color}
                active={activeFilter === k}
                onPress={() => setFilter(activeFilter === k ? 'all' : k)}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* The month grid, Sunday first like the web. One row per week: a
            single wrapping row of percentage-wide, square cells made Yoga
            reserve a week too many, an empty band under the last one. */}
        <View style={styles.grid}>
          <View style={styles.week}>
            {WEEK.map((i) => (
              <Text key={`dow-${i}`} style={styles.dow}>
                {weekdayLetter(i)}
              </Text>
            ))}
          </View>
          {weeks.map((row, w) => (
            <View key={`week-${w}`} style={styles.week}>
              {row.map((c, j) => {
                const i = w * 7 + j;
                if (!c.inMonth) {
                  return (
                    <View key={`cell-${i}`} style={styles.cell} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                      <Text style={[styles.cellNum, styles.cellNumOut]}>{c.day}</Text>
                      <View style={styles.dots} />
                    </View>
                  );
                }
                const entries = byDay[c.day] || [];
                const picked = c.day === day;
                const todayCell = isToday(c.day);
                return (
                  <Pressable
                    key={`cell-${i}`}
                    onPress={() => setSelected(c.day)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: picked }}
                    accessibilityLabel={`${monthName(view.m)} ${c.day}${entries.length ? `, ${trCount(entries.length, '1 entry', '{n} entries')}` : ''}`}
                    style={({ pressed }) => [styles.cell, picked && styles.cellPicked, todayCell && styles.cellToday, pressed && styles.pressed]}
                  >
                    <Text style={[styles.cellNum, todayCell && styles.cellNumToday]}>{c.day}</Text>
                    {/* One dot per entry, not per kind: two reminders are two things to know about. */}
                    <View style={styles.dots}>
                      {entries.slice(0, MAX_DOTS).map((e, di) => (
                        <View key={`dot-${di}`} style={[styles.dot, { backgroundColor: todayCell ? colors.onPrimary : kindMeta(e.kind).color }]} />
                      ))}
                      {entries.length > MAX_DOTS ? <Text style={[styles.dotMore, todayCell && styles.onPrimary]}>{`+${entries.length - MAX_DOTS}`}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* The chosen day */}
        <View style={styles.dayHead}>
          <View style={styles.dayTitleRow}>
            <Text style={styles.dayTitle} numberOfLines={1}>
              {`${monthName(view.m)} ${day}, ${view.y}`}
            </Text>
            {isToday(day) ? (
              <View style={styles.dayRel}>
                <Text style={styles.dayRelText}>{tr('Today')}</Text>
              </View>
            ) : null}
            {dayEntries.length ? (
              <View style={styles.dayCount}>
                <Text style={styles.dayCountText}>{dayEntries.length}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.dayActions}>
            {!isToday(day) ? (
              <Pressable onPress={goToday} accessibilityRole="button" hitSlop={4} style={({ pressed }) => [styles.todayBtn, pressed && styles.pressed]}>
                <Text style={styles.todayLink}>{tr('Go to today')}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={openNew}
              accessibilityRole="button"
              accessibilityLabel={tr('New reminder')}
              style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            >
              <Plus size={16} color={colors.onPrimary} strokeWidth={2.5} />
              <Text style={styles.addBtnText}>{tr('Reminder')}</Text>
            </Pressable>
          </View>
        </View>

        {dayList}

        {/* The month at a glance (the web's "This month"). A line opens its
            entry and moves the grid to its day — the way to a date that is
            not on screen. */}
        {loaded && shown.length ? (
          <View style={styles.rollup}>
            <Pressable
              onPress={() => setRollup((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: rollup }}
              style={({ pressed }) => [styles.rollupHead, pressed && styles.pressed]}
            >
              <Text style={styles.rollupTitle}>{trCount(shown.length, 'This month · 1 entry', 'This month · {n} entries')}</Text>
              {rollup ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
            </Pressable>
            {rollup ? (
              <>
                {shown.slice(0, ROLLUP_ROWS).map((e, i) => (
                  <Pressable
                    key={`roll-${entryKey(e, i)}`}
                    onPress={() => {
                      setSelected(e.day);
                      showDetail(e);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.rollupRow, pressed && styles.pressed]}
                  >
                    <View style={[styles.chipDot, { backgroundColor: kindMeta(e.kind).color }]} />
                    <Text style={[styles.rollupText, e.kind === 'done' && styles.doneText]} numberOfLines={1}>
                      {`${e.day} · ${e.label}`}
                    </Text>
                  </Pressable>
                ))}
                {shown.length > ROLLUP_ROWS ? (
                  <Text style={styles.rollupMore}>{tr('+{n} more this month — tap a day above to see it.', { n: shown.length - ROLLUP_ROWS })}</Text>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* One entry, in full: the row can only carry a line and a half. */}
      <BottomSheet visible={detailOpen} onClose={hideDetail} title={detail ? tr(kindMeta(detail.kind).label) : ''} footer={detailFooter}>
        {detail ? (
          <>
            <View style={styles.detailHead}>
              <KindTile kind={detail.kind} />
              <View style={styles.flex}>
                <Text style={[styles.detailTitle, detail.kind === 'done' && styles.doneText]}>{detail.label}</Text>
                <Text style={styles.detailDate}>{longDate(detailDay.y, detailDay.m, detailDay.d)}</Text>
              </View>
            </View>
            {rows.map(([k, v]) => (
              <View key={k} style={styles.detailRow}>
                <Text style={styles.detailKey}>{tr(k)}</Text>
                <Text style={styles.detailVal}>{v}</Text>
              </View>
            ))}
            {!rows.length ? <Text style={styles.detailNone}>{tr('No further details.')}</Text> : null}
          </>
        ) : null}
      </BottomSheet>

      <ReminderFormSheet seed={formSeed} aim={aim} onClose={() => setFormSeed(null)} onSaved={onSaved} />
    </Screen>
  );
}

/** One entry of the chosen day: the kind's tile, the title, and who and when. */
function EntryRow({ entry, onPress, onEdit, onDelete }) {
  const k = kindMeta(entry.kind);
  const m = entry.meta || {};
  // Only whoever set a reminder (or the Super Admin) may change it; the server says so in canEdit.
  const editable = isReminder(entry.kind) && m.canEdit;
  const sub = entrySubtitle(entry);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.label}. ${sub}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowEdge, { backgroundColor: k.color }]} />
      <KindTile kind={entry.kind} />
      <View style={styles.rowTexts}>
        {/* A finished task reads as struck through, as on the web. */}
        <Text style={[styles.rowTitle, entry.kind === 'done' && styles.doneText]} numberOfLines={2}>
          {entry.label}
        </Text>
        <Text style={styles.rowSub} numberOfLines={2}>
          {sub}
        </Text>
        {isReminder(entry.kind) && m.notes ? (
          <Text style={styles.rowNotes} numberOfLines={2}>
            {m.notes}
          </Text>
        ) : null}
      </View>
      {editable ? (
        <View style={styles.rowActions}>
          <SquareButton icon={Pencil} label={tr('Edit')} onPress={onEdit} />
          <SquareButton icon={Trash} label={tr('Delete')} color={colors.danger} onPress={onDelete} />
        </View>
      ) : (
        <ChevronRight size={16} color={colors.textFaint} />
      )}
    </Pressable>
  );
}

/** The kind's icon on a tile of its own colour. */
function KindTile({ kind }) {
  const k = kindMeta(kind);
  return (
    <View style={[styles.tile, { backgroundColor: `${k.color}1a`, borderColor: `${k.color}33` }]}>
      <k.icon size={18} color={k.color} strokeWidth={2} />
    </View>
  );
}

/**
 * One filter chip: the kind's dot, its name and the month's count. Every chip
 * is bold, picked or not — bolding only the picked one re-measured it and
 * shuffled the strip sideways on each tap; the pick is the fill and border.
 */
function FilterChip({ label, count, color, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={count ? `${label}, ${count}` : label}
      style={({ pressed }) => [styles.chip, active && styles.chipOn, pressed && styles.pressed]}
    >
      {color ? <View style={[styles.chipDot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
      {count ? (
        <View style={[styles.chipCount, active && styles.chipCountOn]}>
          <Text style={styles.chipCountText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Previous / next month: a round, primary-tinted button. */
function RoundButton({ icon: Icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
      <Icon size={18} color={colors.primary} strokeWidth={2.5} />
    </Pressable>
  );
}

/** Edit / Delete on a reminder row. */
function SquareButton({ icon: Icon, label, color = colors.textSecondary, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => [styles.square, pressed && styles.pressed]}>
      <Icon size={17} color={color} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.7 },
  onPrimary: { color: colors.onPrimary },
  // Room under the last card for the tab bar's raised bubble.
  content: { paddingBottom: 48 },

  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(5),
    paddingVertical: space(3),
  },
  monthLabel: { alignItems: 'center' },
  monthTitle: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  monthYear: { fontSize: 12.5, fontWeight: font.semibold, color: colors.textSecondary, marginTop: 1 },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: `${colors.primary}1a`,
    borderColor: `${colors.primary}33`,
  },

  chipStrip: { flexGrow: 0, marginBottom: space(3) },
  chips: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), gap: space(2) },
  // minHeight + padding, never a fixed height, so a large system font grows the chip with its label.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },
  chipTextOn: { color: colors.text },
  chipCount: { minWidth: 20, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.muted, alignItems: 'center' },
  chipCountOn: { backgroundColor: colors.card },
  chipCountText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },

  grid: {
    marginHorizontal: space(4),
    paddingHorizontal: space(2),
    paddingVertical: space(2.5),
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  week: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: font.bold, color: colors.textFaint, paddingBottom: 4 },
  // The border is on EVERY cell, transparent until picked: adding it only to
  // the picked one grew that cell, and with it its whole row, so choosing a
  // day moved the rows apart. Reserved here, picking only ever repaints.
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellPicked: { borderColor: colors.primary },
  cellToday: { backgroundColor: colors.primary },
  cellNum: { fontSize: 13, color: colors.text, fontWeight: font.semibold },
  cellNumOut: { color: colors.textFaint, fontWeight: font.regular },
  cellNumToday: { color: colors.onPrimary, fontWeight: '800' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 9, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotMore: { fontSize: 8, lineHeight: 9, fontWeight: '800', color: colors.textSecondary },

  dayHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(4),
    paddingTop: space(4),
    paddingBottom: space(2),
  },
  dayTitleRow: { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: space(2) },
  dayTitle: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: colors.textSecondary, flexShrink: 1 },
  dayRel: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.primarySoft },
  dayRelText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.primary },
  dayCount: {
    marginLeft: 'auto',
    minWidth: 22,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.border,
  },
  dayCountText: { fontSize: 10.5, fontWeight: '800', color: colors.textSecondary },
  dayActions: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  todayBtn: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' },
  todayLink: { fontSize: 12, fontWeight: font.bold, color: colors.primary },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  addBtnText: { fontSize: 12, fontWeight: '800', color: colors.onPrimary },

  skeleton: { marginHorizontal: space(4) },
  entries: { paddingHorizontal: space(4), gap: space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(3),
    paddingHorizontal: space(3.5),
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowPressed: { backgroundColor: colors.muted },
  // The kind's colour down the leading edge.
  rowEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  rowTexts: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: font.bold, color: colors.text },
  rowSub: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  rowNotes: { fontSize: 12.5, color: colors.textFaint, marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  doneText: { textDecorationLine: 'line-through', color: colors.textFaint },
  tile: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  square: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },

  rollup: {
    marginHorizontal: space(4),
    marginTop: space(4),
    paddingHorizontal: space(3),
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rollupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingVertical: space(3) },
  rollupTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  rollupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    minHeight: 40,
    paddingVertical: space(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rollupText: { flex: 1, fontSize: 13, color: colors.text },
  rollupMore: { fontSize: 13, color: colors.textSecondary, paddingVertical: space(2) },

  detailHead: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(3) },
  detailTitle: { fontSize: 17, fontWeight: font.bold, color: colors.text },
  detailDate: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  detailRow: { flexDirection: 'row', gap: space(3), paddingVertical: space(1) },
  detailKey: { width: 92, fontSize: 12.5, fontWeight: font.semibold, color: colors.textFaint },
  detailVal: { flex: 1, fontSize: 13.5, color: colors.text },
  detailNone: { fontSize: 13, color: colors.textSecondary, paddingVertical: space(2) },
  sheetActions: { flexDirection: 'row', gap: space(2) },
});
