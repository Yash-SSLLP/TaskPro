/**
 * Recurring: the SCHEDULES, not tasks. Each occurrence is an ordinary task
 * that lands in the doer's Tasks when it is due to appear (9 AM on its day; a
 * monthly or yearly one two days early) and is worked there like any other.
 *
 * Each schedule: its pattern in words, who it is for, the next one, the
 * reminders and what it has raised so far. Pause / resume (nothing missed is
 * back-filled), Run now, edit, stop. Whoever may see everyone's (team
 * admins, the Super Admin) can switch to "Everyone's".
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { usePullRefresh, useRefetchOnFocus } from '../../platform/hooks';
import { useIsSuperAdmin } from '../../platform/session';
import { colors, font, radius, space } from '../../platform/theme';
import { EmptyState, ErrorState, FAB, Header, Screen, Segmented, SkeletonCards, confirm, toast } from '../../platform/ui';
import { deleteRecurring, invalidateTasks, listRecurring, runRecurring, taskKeys, updateRecurring, useTaskMeta } from '../api';
import { BellRing, Calendar, CircleStop, Plus, Repeat, User, Zap } from '../icons';
import { clockOf, dayLabel, idOf, patternLabel, personName, priorityColor, priorityLabel, reminderLabel, statusLabel } from '../taskStatus';

function whenText(d) {
  if (!d) return '';
  const when = new Date(d);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(when) - startOf(new Date())) / 86400000);
  const time = clockOf(when);
  if (days === 0) return tr('Today, {time}', { time });
  if (days === 1) return tr('Tomorrow, {time}', { time });
  return `${dayLabel(when)}, ${time}`;
}

export default function RecurringScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const qc = useQueryClient();
  const meta = useTaskMeta().data;
  const stacked = route.name !== 'Recurring';
  const meId = String(meta?.me || '');
  const superAdmin = useIsSuperAdmin();
  const [scope, setScope] = useState(superAdmin ? 'all' : 'mine');
  const [busy, setBusy] = useState('');

  const q = useQuery({
    queryKey: taskKeys.recurring(scope),
    queryFn: () => listRecurring(scope === 'all' ? {} : { scope: 'mine' }),
  });
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  useRefetchOnFocus(q.refetch);
  const rows = useMemo(() => q.data?.schedules || [], [q.data]);
  const canSeeAll = Boolean(q.data?.canSeeAll);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.isActive).length;
    const raised = rows.reduce((n, r) => n + (Number(r.stats?.raised) || 0), 0);
    const open = rows.reduce((n, r) => n + (Number(r.stats?.open) || 0), 0);
    return { active, paused: rows.length - active, raised, open };
  }, [rows]);

  const toggle = async (row) => {
    setBusy(row._id);
    try {
      const res = await updateRecurring(row._id, { isActive: !row.isActive });
      const on = res?.schedule ? res.schedule.isActive : !row.isActive;
      toast.success(on ? tr('Resumed. It picks up from the next one — nothing missed is sent.') : tr('Paused. No more will be raised until you resume it.'));
      qc.invalidateQueries({ queryKey: ['tasks', 'recurring'] });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const runNow = async (row) => {
    const ok = await confirm({
      title: tr('Raise it now?'),
      message: tr('Whatever is due now is put in their Tasks straight away.'),
      confirmLabel: tr('Run now'),
    });
    if (!ok) return;
    setBusy(row._id);
    try {
      const res = await runRecurring(row._id);
      const n = Number(res?.raised) || 0;
      toast.success(n ? (n === 1 ? tr('1 task raised.') : tr('{n} tasks raised.', { n })) : tr('Nothing was due to raise right now.'));
      invalidateTasks(qc);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const stop = async (row) => {
    const ok = await confirm({
      title: tr('Stop this recurring task?'),
      message: tr('No more will be raised. The ones already in people’s lists stay, and so does their history.'),
      confirmLabel: tr('Stop it'),
      cancelLabel: tr('Keep it'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteRecurring(row._id);
      toast.success(tr('Stopped.'));
      qc.invalidateQueries({ queryKey: ['tasks', 'recurring'] });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const renderRow = ({ item: r }) => {
    const pc = priorityColor(r.priority);
    const who = r.who || (r.assignees || []).map(personName).filter(Boolean).join(', ');
    const byMe = Boolean(meId) && idOf(r.createdBy) === meId;
    const onlyMe = byMe && (r.assignees || []).length === 1 && idOf(r.assignees[0]) === meId;
    const setBy = byMe ? tr('you') : r.createdByName || personName(r.createdBy) || '—';
    const reminders = r.reminderLabels || (r.reminders || []).map(reminderLabel);
    return (
      <Pressable
        onPress={() => nav.navigate('AssignTask', { scheduleId: r._id })}
        style={({ pressed }) => [styles.card, !r.isActive && styles.cardOff, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${r.title}. ${r.patternLabel || patternLabel(r)}`}
      >
        <View style={styles.top}>
          <View style={[styles.icon, { backgroundColor: r.isActive ? colors.primarySoft : colors.muted }]}>
            <Repeat size={18} color={r.isActive ? colors.primary : colors.textFaint} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={2}>
              {r.title}
            </Text>
            <Text style={styles.pattern} numberOfLines={1}>
              {patternLabel(r)}
            </Text>
          </View>
          <Switch
            value={Boolean(r.isActive)}
            onValueChange={() => toggle(r)}
            disabled={busy === r._id}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            thumbColor={colors.white}
            accessibilityLabel={r.isActive ? tr('Pause it') : tr('Resume it')}
          />
        </View>

        <View style={styles.lines}>
          <Line icon={User} text={onlyMe ? tr('Your own task') : tr('By {by} → To {to}', { by: setBy, to: who || '—' })} />
          {r.isActive && r.next ? (
            <Line
              icon={Calendar}
              text={tr('Next: due {when}', { when: whenText(r.next.dueAt) })}
              sub={r.next.appearAt && new Date(r.next.appearAt) > new Date() ? tr('appears {when}', { when: whenText(r.next.appearAt) }) : ''}
            />
          ) : (
            <Line icon={Calendar} muted text={r.isActive ? tr('Nothing more to raise — it has ended.') : tr('Paused — nothing is being raised.')} />
          )}
          {reminders.length ? <Line icon={BellRing} text={reminders.join(' · ')} /> : null}
        </View>

        <View style={styles.foot}>
          <View style={styles.tags}>
            <View style={styles.tag}>
              <View style={[styles.dot, { backgroundColor: pc.solid }]} />
              <Text style={styles.tagText}>{priorityLabel(r.priority)}</Text>
            </View>
            {r.routine ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{tr('Mark done only')}</Text>
              </View>
            ) : null}
            {r.stats?.raised ? (
              <Text style={styles.stats}>{tr('{raised} raised · {open} open · {done} done', { raised: r.stats.raised, open: r.stats.open || 0, done: r.stats.done || 0 })}</Text>
            ) : null}
          </View>
          {r.isActive ? (
            <Pressable onPress={() => runNow(r)} hitSlop={6} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel={tr('Run now')}>
              <Zap size={17} color={colors.primary} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => stop(r)} hitSlop={6} style={[styles.roundBtn, styles.stopBtn]} accessibilityRole="button" accessibilityLabel={tr('Stop it')}>
            <CircleStop size={17} color={colors.danger} />
          </Pressable>
        </View>
        {r.stats?.last ? (
          <Text style={styles.last} numberOfLines={1}>
            {tr('Latest: {code} · {status}', { code: r.stats.last.code || tr('task'), status: statusLabel(r.stats.last.status) })}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const header = (
    <View style={styles.headerWrap}>
      <Text style={styles.intro}>{tr('Set it up once — each time it comes round, it lands in their Tasks on its own. Daily ones are only marked done.')}</Text>
      {rows.length ? (
        <View style={styles.statRow}>
          <Stat label={tr('Active')} value={stats.active} />
          <Stat label={tr('Paused')} value={stats.paused} />
          <Stat label={tr('Raised')} value={stats.raised} />
          <Stat label={tr('Open')} value={stats.open} />
        </View>
      ) : null}
      {canSeeAll ? (
        <Segmented
          options={[
            { value: 'mine', label: tr('Mine') },
            { value: 'all', label: tr('Everyone’s') },
          ]}
          value={scope}
          onChange={setScope}
        />
      ) : null}
    </View>
  );

  let body;
  if (q.isPending) body = <SkeletonCards count={3} height={150} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={q.refetch} />;
  else
    body = (
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r._id)}
        renderItem={renderRow}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <EmptyState
            compact
            icon={Repeat}
            title={tr('No recurring tasks yet')}
            message={tr('Set one up once — the daily cash count, Friday’s report, the month-end stock take — and each one lands in their Tasks when it comes round.')}
          />
        }
      />
    );

  return (
    <Screen inTabs={!stacked} padded={false} header={<Header large={!stacked} back={stacked} title={tr('Recurring')} />}>
      {body}
      <FAB title={tr('New recurring task')} icon={Plus} onPress={() => nav.navigate('AssignTask', { recurring: true })} />
    </Screen>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Line({ icon: Icon, text, sub, muted }) {
  return (
    <View style={styles.line}>
      <Icon size={14} color={colors.textFaint} style={styles.lineIcon} />
      <Text style={[styles.lineText, muted && styles.lineMuted]} numberOfLines={2}>
        {text}
        {sub ? <Text style={styles.lineSub}>{`  ·  ${sub}`}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { paddingHorizontal: space(4), paddingBottom: 110, gap: space(2.5) },
  headerWrap: { gap: space(3), marginBottom: space(1) },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  statRow: { flexDirection: 'row', gap: space(2) },
  stat: { flex: 1, paddingVertical: space(2), borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: font.bold, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, fontWeight: font.semibold, color: colors.textSecondary },
  card: { padding: space(3), gap: space(2.5), borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  cardOff: { backgroundColor: colors.muted },
  pressed: { opacity: 0.9 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space(2.5) },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: font.semibold },
  pattern: { color: colors.textSecondary, fontSize: 13, fontWeight: font.medium, marginTop: 2 },
  lines: { gap: 5 },
  line: { flexDirection: 'row', gap: space(2) },
  lineIcon: { marginTop: 2 },
  lineText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  lineMuted: { color: colors.textFaint },
  lineSub: { color: colors.textFaint },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24, paddingHorizontal: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  tagText: { color: colors.textSecondary, fontSize: 11, fontWeight: font.semibold },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stats: { color: colors.textFaint, fontSize: 12, fontWeight: font.medium },
  roundBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primarySoft },
  stopBtn: { borderColor: colors.dangerSoft },
  last: { color: colors.textFaint, fontSize: 12 },
});
