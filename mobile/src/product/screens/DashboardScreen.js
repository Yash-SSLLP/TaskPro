/**
 * Dashboard: "how is it going?", count-based.
 *
 *   My report      my own row
 *   Given by me    what I handed out, per person
 *   People         per person, for teams where I'm owner/admin (or everyone, Super Admin)
 *   Category       per category
 *   Trend          per day or month
 *
 * Each row: total, done (in time / delayed), open, overdue, in review, and
 * two shares: completion % (done of what was given) and on-time % (in time of
 * what was done). Below: the overdue report, which tasks and how late.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { usePullRefresh } from '../../platform/hooks';
import { useIsSuperAdmin } from '../../platform/session';
import { colors, font, radius, space, theme, type } from '../../platform/theme';
import { Card, Chip, ChipRow, DateField, EmptyState, ErrorState, Header, Screen, Segmented, SkeletonCards } from '../../platform/ui';
import { dashboard, overdueReport, taskKeys, useTaskMeta } from '../api';
import { Building, ChartColumn, CircleAlert } from '../icons';
import { DARK_HUES, dayLabel, monthShort, priorityColor, rangeLabel } from '../taskStatus';

const RANGES = ['week', 'month', 'all', 'custom'];

/**
 * A row's bar, between in time (success) and overdue (danger): pale tints in
 * light; in dark the status violet, with green and sky dimmed toward the card.
 */
const BAR = theme.dark
  ? { delayed: '#2B8B61', inReview: DARK_HUES.violet.ink, open: '#397C9A' }
  : { delayed: '#86efac', inReview: '#a78bfa', open: '#93c5fd' };

function rowLabel(r, view) {
  if (view === 'mine') return tr('You');
  const p = r.person;
  if (p && typeof p === 'object') return p.name || '—';
  const c = r.category;
  if (c && typeof c === 'object') return c.name || tr('Uncategorised');
  if (typeof c === 'string') return c || tr('Uncategorised');
  if (r.bucket) {
    const parts = String(r.bucket).split('-').map(Number);
    if (parts.length === 2) return `${monthShort(parts[1])} ${parts[0]}`;
    if (parts.length === 3) return dayLabel(new Date(parts[0], parts[1] - 1, parts[2]));
    return String(r.bucket);
  }
  return r.label || r.name || '—';
}

const pctOf = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

export default function DashboardScreen() {
  const nav = useNavigation();
  const meta = useTaskMeta().data;
  const superAdmin = useIsSuperAdmin();
  const isAdmin = superAdmin || Boolean(meta?.isAdmin);
  const managed = (meta?.teams || []).filter((t) => t.myRole === 'owner' || t.myRole === 'admin');
  const views = [
    ...(isAdmin ? [] : [{ value: 'mine', label: tr('Mine') }]),
    { value: 'delegated', label: tr('Given') },
    ...(isAdmin || managed.length ? [{ value: 'people', label: tr('People') }] : []),
    { value: 'category', label: tr('Category') },
    { value: 'trend', label: tr('Trend') },
  ];
  const [view, setView] = useState(isAdmin ? 'people' : 'mine');
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [team, setTeam] = useState('');
  const [grain, setGrain] = useState('day');

  const params = useMemo(
    () => ({
      view,
      range,
      ...(range === 'custom' ? { from, to } : {}),
      ...(team ? { team } : {}),
      ...(view === 'trend' ? { grain } : {}),
    }),
    [view, range, from, to, team, grain]
  );
  const overdueParams = useMemo(() => {
    const { view: _v, grain: _g, ...rest } = params;
    return rest;
  }, [params]);

  const q = useQuery({ queryKey: taskKeys.dashboard(params), queryFn: () => dashboard(params), placeholderData: (prev) => prev });
  const od = useQuery({ queryKey: taskKeys.overdue(overdueParams), queryFn: () => overdueReport(overdueParams), placeholderData: (prev) => prev });
  const { refreshing, onRefresh } = usePullRefresh(() => Promise.all([q.refetch(), od.refetch()]));
  const rows = useMemo(() => q.data?.rows || [], [q.data]);
  const overdue = od.data?.rows || [];

  const totals = useMemo(() => {
    const t = { total: 0, completed: 0, inTime: 0, open: 0, overdue: 0 };
    rows.forEach((r) => {
      t.total += Number(r.total) || 0;
      t.completed += Number(r.completed) || 0;
      t.inTime += Number(r.inTime) || 0;
      t.open += Number(r.open ?? r.notDone) || 0;
      t.overdue += Number(r.overdue) || 0;
    });
    return t;
  }, [rows]);

  return (
    <Screen header={<Header back title={tr('Dashboard')} />} scroll refreshing={refreshing} onRefresh={onRefresh} contentStyle={styles.content}>
      <Segmented options={views} value={view} onChange={setView} />
      <ChipRow>
        {RANGES.map((k) => (
          <Chip key={k} label={rangeLabel(k)} selected={range === k} onPress={() => setRange(k)} />
        ))}
      </ChipRow>
      {range === 'custom' ? (
        <View style={styles.dates}>
          <DateField style={styles.flex} value={from} onChange={setFrom} placeholder={tr('From')} clearable />
          <DateField style={styles.flex} value={to} onChange={setTo} placeholder={tr('To')} clearable />
        </View>
      ) : null}
      {(meta?.teams || []).length ? (
        <ChipRow scroll style={styles.teamScroll}>
          <Chip label={tr('All organizations')} selected={!team} onPress={() => setTeam('')} />
          {(meta?.teams || []).map((t) => (
            <Chip key={t.id} label={t.name} icon={Building} selected={String(team) === String(t.id)} onPress={() => setTeam(t.id)} />
          ))}
        </ChipRow>
      ) : null}
      {view === 'trend' ? (
        <Segmented
          options={[
            { value: 'day', label: tr('By day') },
            { value: 'month', label: tr('By month') },
          ]}
          value={grain}
          onChange={setGrain}
        />
      ) : null}

      <View style={styles.summary}>
        <Figure label={tr('Given')} value={totals.total} />
        <Figure label={tr('Done')} value={totals.completed} tint={colors.success} />
        <Figure label={tr('Open')} value={totals.open} />
        <Figure label={tr('Overdue')} value={totals.overdue} tint={totals.overdue ? colors.danger : undefined} />
      </View>
      <View style={styles.summary}>
        <Figure label={tr('Completion')} value={`${pctOf(totals.completed, totals.total)}%`} />
        <Figure label={tr('On time')} value={`${pctOf(totals.inTime, totals.completed)}%`} />
      </View>

      {q.isPending ? (
        <SkeletonCards count={3} height={110} />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={q.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState compact icon={ChartColumn} title={tr('Nothing to count yet')} message={tr('Try a wider date range.')} />
      ) : (
        rows.map((r, i) => <ScoreRow key={`${rowLabel(r, view)}-${i}`} row={r} label={rowLabel(r, view)} />)
      )}

      <Text style={styles.sectionTitle}>{tr('Overdue report')}</Text>
      {od.isPending ? (
        <SkeletonCards count={2} height={64} />
      ) : overdue.length === 0 ? (
        <Text style={styles.none}>{tr('Nothing overdue. Well done.')}</Text>
      ) : (
        overdue.map((t) => (
          <Pressable key={t._id} onPress={() => nav.navigate('TaskDetail', { id: t._id })} style={({ pressed }) => [styles.odRow, pressed && styles.pressed]} accessibilityRole="button">
            <View style={[styles.odRail, { backgroundColor: priorityColor(t.priority).solid }]} />
            <View style={styles.flex}>
              <Text style={styles.odTitle} numberOfLines={2}>
                {t.title}
              </Text>
              <Text style={styles.odMeta} numberOfLines={1}>
                {[t.code, t.who || t.createdByName].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={styles.odLate}>
              <CircleAlert size={14} color={colors.danger} />
              <Text style={styles.odLateText}>{Number(t.daysLate) === 1 ? tr('1 day late') : tr('{n} days late', { n: Number(t.daysLate) || 0 })}</Text>
            </View>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

function Figure({ label, value, tint }) {
  return (
    <View style={styles.figure}>
      <Text style={[styles.figureValue, tint && { color: tint }]}>{value}</Text>
      <Text style={styles.figureLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ScoreRow({ row: r, label }) {
  const total = Number(r.total) || 0;
  const completed = Number(r.completed) || 0;
  const completion = r.completionPct ?? pctOf(completed, total - (Number(r.cancelled) || 0));
  const onTime = r.onTimePct ?? pctOf(Number(r.inTime) || 0, completed);
  const open = Number(r.open ?? r.notDone) || 0;
  return (
    <Card style={styles.row}>
      <View style={styles.rowHead}>
        <View style={[styles.score, { backgroundColor: completion >= 80 ? colors.successSoft : completion >= 50 ? colors.warningSoft : colors.dangerSoft }]}>
          <Text style={[styles.scoreText, { color: completion >= 80 ? colors.success : completion >= 50 ? colors.warning : colors.danger }]}>{completion}%</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.rowSub}>{tr('{done} of {total} done · {pct}% on time', { done: completed, total, pct: onTime })}</Text>
        </View>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barPart, { flex: Number(r.inTime) || 0, backgroundColor: colors.success }]} />
        <View style={[styles.barPart, { flex: Number(r.delayed) || 0, backgroundColor: BAR.delayed }]} />
        <View style={[styles.barPart, { flex: Number(r.inReview) || 0, backgroundColor: BAR.inReview }]} />
        <View style={[styles.barPart, { flex: Math.max(0, open - (Number(r.overdue) || 0) - (Number(r.inReview) || 0)), backgroundColor: BAR.open }]} />
        <View style={[styles.barPart, { flex: Number(r.overdue) || 0, backgroundColor: colors.danger }]} />
      </View>
      <View style={styles.counts}>
        <Count label={tr('In time')} value={r.inTime} />
        <Count label={tr('Delayed')} value={r.delayed} />
        <Count label={tr('Open')} value={open} />
        <Count label={tr('Overdue')} value={r.overdue} danger />
        <Count label={tr('In review')} value={r.inReview} />
      </View>
    </Card>
  );
}

function Count({ label, value, danger }) {
  const n = Number(value) || 0;
  return (
    <View style={styles.count}>
      <Text style={[styles.countValue, danger && n > 0 && { color: colors.danger }]}>{n}</Text>
      <Text style={styles.countLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: space(3), paddingBottom: space(10) },
  dates: { flexDirection: 'row', gap: space(2) },
  teamScroll: { marginHorizontal: -space(4) },
  summary: { flexDirection: 'row', gap: space(2) },
  figure: { flex: 1, padding: space(3), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  figureValue: { fontSize: 20, fontWeight: font.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  figureLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: font.medium, marginTop: 2 },
  row: { gap: space(3) },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  score: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontSize: 15, fontWeight: font.bold },
  rowTitle: { fontSize: 16, fontWeight: font.semibold, color: colors.text },
  rowSub: { ...type.caption, marginTop: 2 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.muted },
  barPart: { height: 8 },
  counts: { flexDirection: 'row', gap: space(1) },
  count: { flex: 1, alignItems: 'center' },
  countValue: { fontSize: 15, fontWeight: font.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  countLabel: { fontSize: 11, color: colors.textSecondary },
  sectionTitle: { ...type.overline, marginTop: space(4) },
  none: { ...type.small, paddingVertical: space(2) },
  odRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  pressed: { opacity: 0.85 },
  odRail: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  odTitle: { fontSize: 15, fontWeight: font.medium, color: colors.text },
  odMeta: { ...type.caption, marginTop: 2 },
  odLate: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  odLateText: { fontSize: 12, fontWeight: font.bold, color: colors.danger },
});
