// Web only (metro.config.js): `@react-native-community/datetimepicker` for
// the iPhone web build.
//
// The package has no web version. The app opens it the Android way,
// DateTimePickerAndroid.open({ value, mode, onChange }) (ui/DateFields.js),
// so this keeps that contract and draws the Android dialog: a month calendar
// for dates and, for times, the iPhone's own time wheel in the same frame.
// DateTimePickerHost (mounted by WebHosts) renders whichever is open.
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native-web';
import { create } from 'zustand';
import { colors, font } from '../../theme';
import { ChevronLeft, ChevronRight } from '../../icons';

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const p2 = (n) => String(n).padStart(2, '0');
const event = (type, date) => ({ type, nativeEvent: { timestamp: date ? date.getTime() : undefined, utcOffset: 0 } });

const usePicker = create(() => ({ params: null }));

export const DateTimePickerAndroid = {
  open: (params) => usePicker.setState({ params: { ...params, id: Date.now() } }),
  dismiss: () => {
    const { params } = usePicker.getState();
    usePicker.setState({ params: null });
    params?.onChange?.(event('dismissed'), undefined);
  },
};

function Dialog({ value, mode = 'date', minimumDate, maximumDate, onChange }) {
  const start = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  const [picked, setPicked] = useState(start);
  const [view, setView] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const [time, setTime] = useState(`${p2(start.getHours())}:${p2(start.getMinutes())}`);

  const min = minimumDate ? dayOnly(minimumDate) : null;
  const max = maximumDate ? dayOnly(maximumDate) : null;
  const allowed = (d) => (!min || d >= min) && (!max || d <= max);

  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < view.getDay(); i += 1) out.push(null);
    const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= count; d += 1) out.push(new Date(view.getFullYear(), view.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [view]);

  const cancel = () => onChange?.(event('dismissed'), undefined);
  const ok = () => {
    let out;
    if (mode === 'time') {
      const [h, m] = (time || '00:00').split(':').map(Number);
      out = new Date(start);
      out.setHours(h || 0, m || 0, 0, 0);
    } else {
      out = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), start.getHours(), start.getMinutes(), start.getSeconds());
    }
    onChange?.(event('set', out), out);
  };
  const shift = (n) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={cancel}>
        <Pressable style={[styles.card, { backgroundColor: colors.card }]} onPress={() => {}}>
          <View style={[styles.head, { backgroundColor: colors.primary }]}>
            {mode === 'time' ? (
              <Text style={[styles.headBig, { color: colors.onPrimary }]}>Select time</Text>
            ) : (
              <>
                <Text style={[styles.headYear, { color: colors.onPrimary }]}>{picked.getFullYear()}</Text>
                <Text style={[styles.headBig, { color: colors.onPrimary }]}>
                  {`${DAYS[picked.getDay()]}, ${MONTHS[picked.getMonth()].slice(0, 3)} ${picked.getDate()}`}
                </Text>
              </>
            )}
          </View>

          {mode === 'time' ? (
            <View style={styles.timeBody}>
              {React.createElement('input', {
                type: 'time',
                value: time,
                onChange: (e) => setTime(e.target.value),
                style: {
                  fontSize: 30,
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: `1px solid ${colors.borderStrong}`,
                  color: colors.text,
                  background: colors.muted,
                  fontFamily: 'inherit',
                  minWidth: 180,
                  textAlign: 'center',
                },
              })}
            </View>
          ) : (
            <View style={styles.body}>
              <View style={styles.nav}>
                <Pressable onPress={() => shift(-1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Previous month">
                  <ChevronLeft size={20} color={colors.text} />
                </Pressable>
                <Text style={[styles.month, { color: colors.text }]}>{`${MONTHS[view.getMonth()]} ${view.getFullYear()}`}</Text>
                <Pressable onPress={() => shift(1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Next month">
                  <ChevronRight size={20} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.row}>
                {WEEK.map((w, i) => (
                  <Text key={`${w}${i}`} style={[styles.week, { color: colors.textSecondary }]}>
                    {w}
                  </Text>
                ))}
              </View>
              <View style={styles.grid}>
                {cells.map((d, i) => {
                  if (!d) return <View key={`e${i}`} style={styles.cell} />;
                  const on = sameDay(d, picked);
                  const today = sameDay(d, new Date());
                  const can = allowed(d);
                  return (
                    <Pressable key={d.getTime()} disabled={!can} onPress={() => setPicked(d)} style={styles.cell} accessibilityRole="button">
                      <View style={[styles.dot, on && { backgroundColor: colors.primary }, !on && today && { borderWidth: 1, borderColor: colors.primary }]}>
                        <Text style={[styles.dayText, { color: on ? colors.onPrimary : can ? colors.text : colors.textFaint }]}>{d.getDate()}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable onPress={cancel} style={styles.action} accessibilityRole="button">
              <Text style={[styles.actionText, { color: colors.primary }]}>CANCEL</Text>
            </Pressable>
            <Pressable onPress={ok} style={styles.action} accessibilityRole="button">
              <Text style={[styles.actionText, { color: colors.primary }]}>OK</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Mount once near the root (WebHosts does). */
export function DateTimePickerHost() {
  const params = usePicker((s) => s.params);
  if (!params) return null;
  const done = (e, date) => {
    usePicker.setState({ params: null });
    params.onChange?.(e, date);
  };
  return <Dialog key={params.id} {...params} onChange={done} />;
}

/** The component form, as mounted on iOS: shown while rendered. */
export default function DateTimePicker(props) {
  return <Dialog {...props} />;
}

// Plain objects, not StyleSheet.create: this module may load before the theme.
const styles = {
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 340, borderRadius: 8, overflow: 'hidden' },
  head: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14 },
  headYear: { fontSize: 15, fontWeight: font.semibold, opacity: 0.8 },
  headBig: { fontSize: 30, fontWeight: font.semibold, marginTop: 4 },
  body: { paddingHorizontal: 10, paddingTop: 6 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 15, fontWeight: font.semibold },
  row: { flexDirection: 'row' },
  week: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontWeight: font.semibold, paddingVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14, fontWeight: font.medium },
  timeBody: { paddingVertical: 28, alignItems: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', padding: 8 },
  action: { minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  actionText: { fontSize: 14, fontWeight: font.bold, letterSpacing: 0.5 },
};
