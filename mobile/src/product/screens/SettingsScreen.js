/**
 * My settings: time zone, when my work day starts, whether my tasks ask for a
 * review by default, the reminders a new task gets when I set none, the daily
 * summary, and the app's language. Saved to PATCH /api/me/settings; only what
 * changed is sent.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { languageName, tr, useLang } from '../../i18n';
import { platformKeys, settingsApi } from '../../platform/endpoints';
import { LanguageSheet } from '../../platform/language';
import { useSession } from '../../platform/session';
import { colors, font, radius, space, type } from '../../platform/theme';
import { BottomSheet, Button, ListRow, Notice, Screen, Header, Section, SwitchRow, TimeField, toast } from '../../platform/ui';
import ReminderEditor from '../components/ReminderEditor';
import { Check, Clock, Languages, Search } from '../icons';

const ZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Qatar',
  'Asia/Kathmandu',
  'Asia/Dhaka',
  'Asia/Colombo',
  'Asia/Karachi',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Africa/Nairobi',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'UTC',
];

const phoneZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};

const KEYS = ['timezone', 'workdayStart', 'approvalDefault', 'defaultReminders', 'dailyDigest', 'dailyDigestAt'];

export default function SettingsScreen({ navigation }) {
  const lang = useLang();
  const setSettings = useSession((s) => s.setSettings);
  const sessionSettings = useSession((s) => s.settings);
  const q = useQuery({ queryKey: platformKeys.settings, queryFn: settingsApi.get });
  const server = q.data || sessionSettings;
  const [form, setForm] = useState(server);
  const [langOpen, setLangOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (q.data) setForm((f) => ({ ...f, ...q.data }));
  }, [q.data]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const changed = useMemo(() => KEYS.filter((k) => JSON.stringify(form?.[k]) !== JSON.stringify(server?.[k])), [form, server]);

  const save = async () => {
    if (!changed.length) {
      navigation.goBack();
      return;
    }
    if (form.dailyDigest && !form.dailyDigestAt) {
      setError(tr('Choose when the daily summary comes.'));
      return;
    }
    setError(null);
    try {
      const body = {};
      changed.forEach((k) => {
        body[k] = form[k];
      });
      const next = await settingsApi.update(body);
      setSettings(next || { ...server, ...body });
      q.refetch();
      toast.success(tr('Settings saved'));
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Screen
      header={<Header back title={tr('My settings')} />}
      scroll
      keyboard
      footer={<Button title={tr('Save')} size="lg" onPress={save} disabled={!changed.length} />}
    >
      <Section title={tr('App')}>
        <ListRow icon={Languages} title={tr('Language')} right={languageName(lang)} onPress={() => setLangOpen(true)} />
      </Section>

      <Section title={tr('Time')} footer={tr('Due dates, "today" and your daily summary follow this time zone.')}>
        <ListRow icon={Clock} title={tr('Time zone')} subtitle={form?.timezone || '—'} onPress={() => setZoneOpen(true)} />
      </Section>
      <TimeField label={tr('My work day starts at')} value={form?.workdayStart || '09:00'} onChange={set('workdayStart')} style={styles.field} />

      <Text style={styles.group}>{tr('New tasks')}</Text>
      <SwitchRow
        label={tr('Ask for a review by default')}
        description={tr('When you give someone a task, finishing it hands it back to you to approve. You can change it on each task.')}
        value={form?.approvalDefault !== false}
        onChange={set('approvalDefault')}
      />
      <Text style={styles.label}>{tr('My default reminders')}</Text>
      <Text style={styles.hint}>{tr('A task you set without reminders gets these.')}</Text>
      <View style={styles.reminders}>
        <ReminderEditor value={form?.defaultReminders || []} onChange={set('defaultReminders')} />
      </View>

      <Text style={styles.group}>{tr('Daily summary')}</Text>
      <SwitchRow
        label={tr('Send me a daily summary')}
        description={tr('One alert a day with what is due, overdue and waiting for you.')}
        value={form?.dailyDigest !== false}
        onChange={set('dailyDigest')}
      />
      {form?.dailyDigest !== false ? <TimeField label={tr('Send it at')} value={form?.dailyDigestAt || '18:00'} onChange={set('dailyDigestAt')} style={styles.field} /> : null}

      <Notice tone="danger">{error}</Notice>
      <LanguageSheet visible={langOpen} onClose={() => setLangOpen(false)} />
      <ZoneSheet
        visible={zoneOpen}
        value={form?.timezone}
        onClose={() => setZoneOpen(false)}
        onPick={(z) => {
          set('timezone')(z);
          setZoneOpen(false);
        }}
      />
    </Screen>
  );
}

function ZoneSheet({ visible, value, onClose, onPick }) {
  const [term, setTerm] = useState('');
  const mine = phoneZone();
  const all = useMemo(() => [...new Set([mine, value, ...ZONES].filter(Boolean))], [mine, value]);
  const shown = all.filter((z) => z.toLowerCase().includes(term.trim().toLowerCase().replace(/\s+/g, '_')));
  const typed = term.trim().replace(/\s+/g, '_');
  return (
    <BottomSheet visible={visible} onClose={onClose} title={tr('Time zone')}>
      <View style={styles.search}>
        <Search size={17} color={colors.textFaint} />
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder={tr('Search, e.g. Kolkata')}
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {shown.map((z) => (
        <Pressable key={z} onPress={() => onPick(z)} style={({ pressed }) => [styles.zone, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected: z === value }}>
          <View style={styles.flex}>
            <Text style={[styles.zoneText, z === value && styles.zoneOn]}>{z.replace(/_/g, ' ')}</Text>
            {z === mine ? <Text style={styles.hint}>{tr("This phone's time zone")}</Text> : null}
          </View>
          {z === value ? <Check size={18} color={colors.primary} /> : null}
        </Pressable>
      ))}
      {!shown.length && /^[A-Za-z]+\/[A-Za-z_]+/.test(typed) ? (
        <Pressable onPress={() => onPick(typed)} style={styles.zone} accessibilityRole="button">
          <Text style={styles.zoneText}>{tr('Use {zone}', { zone: typed })}</Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { marginBottom: space(5) },
  group: { ...type.overline, marginTop: space(2), marginBottom: space(2), marginLeft: space(1) },
  label: { fontSize: 15, fontWeight: font.semibold, color: colors.text, marginTop: space(1) },
  hint: { ...type.caption, marginTop: 2 },
  reminders: { marginTop: space(3), marginBottom: space(5) },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    minHeight: 46,
    paddingHorizontal: space(3),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    marginBottom: space(2),
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  zone: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(2), borderRadius: radius.input },
  zoneText: { fontSize: 15, color: colors.text },
  zoneOn: { color: colors.primary, fontWeight: font.semibold },
  pressed: { backgroundColor: colors.muted },
});
