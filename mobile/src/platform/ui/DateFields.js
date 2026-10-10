/**
 * DateField and TimeField: a day ('YYYY-MM-DD') or a time of day ('HH:mm')
 * picked with the phone's own picker. Values are plain strings, so a form
 * never holds a half-built Date. Android opens the system dialog; iOS shows
 * the picker in a sheet.
 */
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { tr } from '../../i18n';
import { Calendar, Clock, X } from '../icons';
import { colors, font, radius, space, TAP } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { FieldLabel } from './TextField';

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hmOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 'YYYY-MM-DD' → a phone-local Date at noon (safe from DST edges). */
export function dateOfYmd(ymd) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** 'HH:mm' → today at that time. */
function dateOfHm(hm) {
  const [h, m] = String(hm || '').split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

/** 'YYYY-MM-DD' → "Mon, 5 Oct" (the year when it is not this one). */
export function ymdLabel(ymd) {
  const d = dateOfYmd(ymd);
  if (!d) return '';
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${tr(DAYS[d.getDay()])}, ${d.getDate()} ${tr(MONTHS[d.getMonth()])}${year}`;
}

/** '18:00' → "6:00 PM". */
export function hmLabel(hm) {
  const [h, m] = String(hm || '').split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  return `${h % 12 || 12}:${pad(Number.isFinite(m) ? m : 0)} ${h < 12 ? 'AM' : 'PM'}`;
}

function usePicker(mode, current, commit, { minimumDate, maximumDate } = {}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);
  const show = () => {
    // The iPhone web build draws the Android dialog too (web/shims/DateTimePicker.js).
    if (Platform.OS === 'android' || Platform.OS === 'web') {
      DateTimePickerAndroid.open({
        value: current,
        mode,
        is24Hour: false,
        minimumDate: mode === 'date' ? minimumDate : undefined,
        maximumDate: mode === 'date' ? maximumDate : undefined,
        onChange: (event, picked) => {
          if (event.type === 'set' && picked) commit(picked);
        },
      });
      return;
    }
    setDraft(current);
    setOpen(true);
  };
  const sheet =
    Platform.OS === 'ios' ? (
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={mode === 'time' ? tr('Choose a time') : tr('Choose a date')}
        scroll={false}
        footer={
          <Button
            title={tr('Done')}
            onPress={() => {
              commit(draft);
              setOpen(false);
            }}
          />
        }
      >
        {open ? (
          <DateTimePicker
            value={draft}
            mode={mode}
            display={mode === 'date' ? 'inline' : 'spinner'}
            minimumDate={mode === 'date' ? minimumDate : undefined}
            maximumDate={mode === 'date' ? maximumDate : undefined}
            accentColor={colors.primary}
            onChange={(e, picked) => picked && setDraft(picked)}
          />
        ) : null}
      </BottomSheet>
    ) : null;
  return { show, sheet };
}

/**
 * @param {{ label?: string, value: string, onChange: (ymd: string) => void, placeholder?: string,
 *   clearable?: boolean, minimumDate?: Date, maximumDate?: Date, style?: any }} props
 */
export function DateField({ label, value, onChange, placeholder, clearable = false, minimumDate, maximumDate, style }) {
  const current = dateOfYmd(value) || minimumDate || new Date();
  const { show, sheet } = usePicker('date', current, (d) => onChange(ymdOf(d)), { minimumDate, maximumDate });
  const text = value ? ymdLabel(value) : placeholder || tr('Choose a date');
  return (
    <View style={style}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <View style={styles.row}>
        <Pressable
          onPress={show}
          accessibilityRole="button"
          accessibilityLabel={`${label || tr('Date')}: ${text}`}
          style={({ pressed }) => [styles.box, styles.grow, pressed && styles.pressed]}
        >
          <Calendar size={18} color={colors.textSecondary} />
          <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
            {text}
          </Text>
        </Pressable>
        {clearable && value ? (
          <Pressable
            onPress={() => onChange('')}
            accessibilityRole="button"
            accessibilityLabel={tr('Clear')}
            style={({ pressed }) => [styles.box, styles.clear, pressed && styles.pressed]}
          >
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {sheet}
    </View>
  );
}

/** @param {{ label?: string, value: string, onChange: (hm: string) => void, style?: any }} props */
export function TimeField({ label, value, onChange, placeholder, style }) {
  const current = dateOfHm(value);
  const { show, sheet } = usePicker('time', current, (d) => onChange(hmOf(d)));
  const text = value ? hmLabel(value) : placeholder || tr('Choose a time');
  return (
    <View style={style}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <Pressable
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={`${label || tr('Time')}: ${text}`}
        style={({ pressed }) => [styles.box, pressed && styles.pressed]}
      >
        <Clock size={18} color={colors.textSecondary} />
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {text}
        </Text>
      </Pressable>
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space(2) },
  grow: { flex: 1 },
  box: {
    minHeight: TAP + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(3),
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.input,
    backgroundColor: colors.card,
  },
  clear: { justifyContent: 'center', paddingHorizontal: space(3) },
  value: { flexShrink: 1, fontSize: 15, color: colors.text, fontWeight: font.medium },
  placeholder: { color: colors.textFaint, fontWeight: font.regular },
  pressed: { backgroundColor: colors.muted },
});
