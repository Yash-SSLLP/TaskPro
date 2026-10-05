/**
 * KEEP REMINDING UNTIL IT IS DONE: one repeating reminder rule (`when:
 * 'EVERY'`), in the Repeats block's own shapes.
 *
 *   ( on / off )   Hourly · Daily · Weekly · Monthly
 *
 * Hourly goes every N hours on the clock inside a window (9 AM – 9 PM unless
 * moved); the others go once on their day, at a time. Every shape stops the
 * moment the work is done. `hourlyOnly` hides the shape segments (both task
 * forms use it, as the HRMS app does); a rule saved in another shape still
 * shows its own controls.
 *
 * Also here: what a schedule starts with (remindersFor), how saved reminders
 * split for the form (splitReminders), and a new rule of a shape (repeatingRule).
 */
import React, { useRef } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, font, radius, space } from '../../platform/theme';
import { Chip, ChipRow, Segmented, TimeField } from '../../platform/ui';
import { BellRing } from '../icons';
import {
  DEFAULT_REMIND_AT,
  DEFAULT_REMIND_WINDOW,
  MAX_REMIND_EVERY_HOURS,
  NTH_WEEK_KEYS,
  REMINDER_PATTERNS,
  nthLabel,
  ordinal,
  reminderPattern,
  reminderPatternLabel,
  reminderWindow,
  repeatEveryMinutes,
  repeatingReminderText,
  time12,
  weekdayLetter,
  weekdayName,
  weekdayShort,
} from '../taskStatus';
import Stepper from './Stepper';

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** A rule of `pattern`, keeping what still makes sense from `prev`. */
export function repeatingRule(pattern, prev = null, hints = {}) {
  const head = { channel: prev?.channel || 'APP', when: 'EVERY', pattern };
  const at = prev?.at || DEFAULT_REMIND_AT;
  if (pattern === 'DAILY') return { ...head, unit: 'DAYS', amount: 1, at };
  if (pattern === 'WEEKLY') return { ...head, unit: 'DAYS', amount: 1, at, weekdays: hints.weekdays?.length ? [...hints.weekdays] : [1] };
  if (pattern === 'MONTHLY') {
    return {
      ...head,
      unit: 'DAYS',
      amount: 1,
      at,
      monthlyMode: hints.monthlyMode === 'WEEKDAY' ? 'WEEKDAY' : 'DATE',
      monthDay: hints.monthDay || new Date().getDate(),
      nthWeek: hints.nthWeek ?? 1,
      weekday: hints.weekday ?? 1,
    };
  }
  return { ...head, unit: 'HOURS', amount: 2, from: DEFAULT_REMIND_WINDOW.from, to: DEFAULT_REMIND_WINDOW.to };
}

/** What a schedule is chased with until somebody chooses: every two hours, 9 AM – 9 PM, until done. */
export const remindersFor = () => ({ every: repeatingRule('HOURLY') });

/** A schedule's saved reminders: the one repeating rule, and every other rule kept as it is. */
export function splitReminders(list = []) {
  const every = list.find((r) => r.when === 'EVERY') || null;
  return {
    every: every ? { ...every, pattern: reminderPattern(every) } : null,
    otherReminders: list.filter((r) => r.when !== 'EVERY'),
  };
}

/** The clock times an hourly rule goes at: "9:00 AM, 11:00 AM … 9:00 PM". */
export function hourlyTimes(rule, notBefore = null) {
  const w = reminderWindow(rule);
  const every = repeatEveryMinutes(rule);
  const floor = notBefore ? minutesOf(notBefore) : 0;
  const out = [];
  for (let m = minutesOf(w.from); m <= minutesOf(w.to); m += every) {
    if (m >= floor) out.push(time12(hhmm(m)));
  }
  if (out.length <= 6) return out.join(', ');
  return `${out.slice(0, 3).join(', ')} … ${out[out.length - 1]}`;
}

export default function ReminderPatternPicker({ value, onChange, hints = {}, title, allowOff = true, hourlyOnly = false }) {
  const last = useRef(value);
  if (value) last.current = value;
  const pattern = value ? reminderPattern(value) : 'OFF';
  const set = (patch) => onChange?.({ ...value, pattern, ...patch });
  const pick = (key) => {
    if (key === pattern) return;
    onChange?.(repeatingRule(key, value, hints));
  };
  const toggle = (on) => {
    if (!on) {
      onChange?.(null);
      return;
    }
    const prev = last.current;
    onChange?.(prev && (!hourlyOnly || reminderPattern(prev) === 'HOURLY') ? prev : repeatingRule('HOURLY', prev, hints));
  };

  const hours =
    value?.unit === 'MINUTES'
      ? Math.max(1, Math.round((Number(value.amount) || 60) / 60))
      : Math.max(1, Math.min(MAX_REMIND_EVERY_HOURS, Math.round(Number(value?.amount) || 1)));
  const win = value ? { from: value.from || DEFAULT_REMIND_WINDOW.from, to: value.to || DEFAULT_REMIND_WINDOW.to } : DEFAULT_REMIND_WINDOW;
  const badWindow = pattern === 'HOURLY' && !(win.from < win.to);
  const days = value?.weekdays || [];
  const times = pattern === 'HOURLY' ? hourlyTimes(value, hints.firstBeatAfter) : '';

  return (
    <View>
      {allowOff ? (
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title || tr('Keep reminding until it is done')}</Text>
          <Switch
            value={Boolean(value)}
            onValueChange={toggle}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            thumbColor={colors.white}
            accessibilityLabel={value ? tr('Stop the repeating reminder') : tr('Keep reminding until it is done')}
          />
        </View>
      ) : null}

      {value && !hourlyOnly ? (
        <Segmented
          style={allowOff ? styles.top : null}
          options={REMINDER_PATTERNS.map((k) => ({ value: k, label: reminderPatternLabel(k) }))}
          value={pattern}
          onChange={pick}
        />
      ) : null}

      {pattern === 'HOURLY' ? (
        <>
          <Text style={styles.subLabel}>{tr('How often')}</Text>
          <ChipRow>
            {[
              [1, tr('Every hour')],
              [2, tr('Every 2 hours')],
              [3, tr('Every 3 hours')],
            ].map(([n, label]) => (
              <Chip key={n} label={label} selected={value.unit !== 'MINUTES' && Number(value.amount) === n} onPress={() => set({ unit: 'HOURS', amount: n })} />
            ))}
          </ChipRow>
          <Stepper
            label={tr('Every')}
            value={hours}
            min={1}
            max={MAX_REMIND_EVERY_HOURS}
            onChange={(n) => set({ unit: 'HOURS', amount: n })}
            format={(n) => (n === 1 ? tr('1 hour') : tr('{n} hours', { n }))}
          />
          <View style={styles.twoCol}>
            <TimeField style={styles.col} label={tr('From')} value={win.from} onChange={(from) => set({ from, to: win.to })} />
            <TimeField style={styles.col} label={tr('Until')} value={win.to} onChange={(to) => set({ from: win.from, to })} />
          </View>
          {badWindow ? <Text style={styles.error}>{tr('“Until” has to be later than “From” — otherwise it goes between 9:00 AM and 9:00 PM.')}</Text> : null}
        </>
      ) : null}

      {pattern === 'DAILY' ? (
        <>
          <Text style={styles.subLabel}>{tr('How often')}</Text>
          <ChipRow>
            {[
              [1, tr('Every day')],
              [2, tr('Alternate days')],
              [3, tr('Every 3 days')],
            ].map(([n, label]) => (
              <Chip key={n} label={label} selected={Number(value.amount) === n} onPress={() => set({ amount: n })} />
            ))}
          </ChipRow>
          <Stepper
            label={tr('Every')}
            value={Math.max(1, Math.round(Number(value.amount) || 1))}
            min={1}
            max={31}
            onChange={(n) => set({ amount: n })}
            format={(n) => (n === 1 ? tr('1 day') : tr('{n} days', { n }))}
          />
        </>
      ) : null}

      {pattern === 'WEEKLY' ? (
        <>
          <Text style={styles.subLabel}>{tr('On these days')}</Text>
          <View style={styles.dayRow}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const on = days.includes(i);
              return (
                <Chip
                  key={i}
                  label={weekdayLetter(i)}
                  accessibilityLabel={weekdayName(i)}
                  selected={on}
                  onPress={() => set({ weekdays: on ? days.filter((x) => x !== i) : [...days, i].sort((a, b) => a - b) })}
                  style={styles.dayChip}
                />
              );
            })}
          </View>
          {!days.length ? <Text style={styles.error}>{tr('Pick at least one day — or turn it off.')}</Text> : null}
        </>
      ) : null}

      {pattern === 'MONTHLY' ? (
        <>
          <Segmented
            style={styles.top}
            options={[
              { value: 'DATE', label: tr('On a date') },
              { value: 'WEEKDAY', label: tr('On a weekday') },
            ]}
            value={value.monthlyMode === 'WEEKDAY' ? 'WEEKDAY' : 'DATE'}
            onChange={(k) => set({ monthlyMode: k })}
          />
          {value.monthlyMode === 'WEEKDAY' ? (
            <>
              <Text style={styles.subLabel}>{tr('Which one')}</Text>
              <ChipRow>
                {NTH_WEEK_KEYS.map((n) => (
                  <Chip key={n} label={nthLabel(n)} selected={(value.nthWeek ?? 1) === n} onPress={() => set({ nthWeek: n })} />
                ))}
              </ChipRow>
              <Text style={styles.subLabel}>{tr('Day')}</Text>
              <ChipRow>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <Chip key={d} label={weekdayShort(d)} selected={(value.weekday ?? 1) === d} onPress={() => set({ weekday: d })} />
                ))}
              </ChipRow>
            </>
          ) : (
            <>
              <Stepper
                label={tr('Day of the month')}
                value={value.monthDay || 1}
                min={1}
                max={31}
                onChange={(n) => set({ monthDay: n })}
                format={(n) => ordinal(n)}
              />
              {(value.monthDay || 1) > 28 ? <Text style={styles.hint}>{tr('In a shorter month it goes on the last day.')}</Text> : null}
            </>
          )}
        </>
      ) : null}

      {pattern === 'DAILY' || pattern === 'WEEKLY' || pattern === 'MONTHLY' ? (
        <TimeField style={styles.topField} label={tr('At')} value={value.at || DEFAULT_REMIND_AT} onChange={(at) => set({ at })} />
      ) : null}

      {value ? (
        <View style={styles.preview}>
          <View style={styles.previewIcon}>
            <BellRing size={15} color={colors.white} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.previewTitle}>{repeatingReminderText(value)}</Text>
            <Text style={styles.previewHint}>
              {times ? `${tr('At {times}.', { times })} ` : ''}
              {tr('Until it is done — it stops the moment they mark it done.')}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.hint, styles.topField]}>{tr('No repeating reminder — nobody is chased on a timer.')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) },
  title: { flex: 1, color: colors.text, fontSize: 15, fontWeight: font.semibold },
  top: { marginTop: space(3) },
  topField: { marginTop: space(3) },
  subLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: font.semibold, marginTop: space(3), marginBottom: space(2) },
  twoCol: { flexDirection: 'row', gap: space(2.5), marginTop: space(3) },
  col: { flex: 1 },
  dayRow: { flexDirection: 'row', gap: space(1), flexWrap: 'wrap' },
  dayChip: { minWidth: 40, justifyContent: 'center', paddingHorizontal: space(2) },
  preview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(2.5),
    marginTop: space(4),
    padding: space(3),
    borderRadius: radius.input,
    backgroundColor: colors.primarySoft,
  },
  previewIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  previewTitle: { color: colors.text, fontSize: 14, fontWeight: font.bold },
  previewHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  hint: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: space(1.5) },
  error: { color: colors.danger, fontSize: 12, fontWeight: font.semibold, lineHeight: 17, marginTop: space(1.5) },
});
