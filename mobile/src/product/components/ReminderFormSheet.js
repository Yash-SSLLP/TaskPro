/**
 * ReminderFormSheet: the New / Edit reminder sheet, after the HRMS app's
 * (components/ReminderFormSheet.js there) and the web calendar's form.
 *
 * The sheet owns its draft, the people search and the save; whoever opens it
 * only says what to open with, and hears back when it saved.
 *
 * WHO SEES IT: just me; specific people (whoever I may give a task to: the
 * people GET /tasks/meta lists); a team I own or run; everyone (the Super
 * Admin). The server checks the audience on every save — `aim`, from GET
 * /api/calendar, only decides which of these are worth offering.
 *
 * A reminder rings once on its day: at its time when it has one, otherwise at
 * the setter's workday start. A time typed as words on the web ("after
 * lunch") is kept as it is unless a time is picked here.
 *
 * Props:
 *   seed     null (closed) or what to open with: blankReminder(date) for a new
 *            one, reminderSeed(entry) to edit a calendar entry.
 *   aim      { teams: [{ id, name }], everyone } from GET /api/calendar.
 *   onClose()
 *   onSaved(dateYmd) after a successful save (the sheet has closed).
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { normalizePin, pinOf } from '../../platform/pin';
import { colors, font, space } from '../../platform/theme';
import { BottomSheet, Button, Chip, ChipRow, DateField, FieldLabel, Notice, TextButton, TextField, TimeField, toast } from '../../platform/ui';
import { calendarKeys, createReminder, updateReminder, useTaskMeta } from '../api';
import { SCOPE_LABELS, to24h } from '../calendar';
import { Check, Search, X } from '../icons';

const PRIORITIES = ['Low', 'Normal', 'High'];
// Rows of the people picker drawn at once. The sheet scrolls as a whole, so a
// long list is narrowed by typing rather than flicked through (as on the HRMS).
const PEOPLE_SHOWN = 25;
const NO_AIM = { users: true, teams: [], everyone: false };

// `ownAudience` is false only when the people a reminder is for were not sent
// to us (someone else's "specific people" reminder, its list empty): that
// list can then be neither shown nor safely rewritten from here.
const BLANK = {
  id: null,
  title: '',
  date: '',
  time: '',
  rawTime: '',
  notes: '',
  priority: 'Normal',
  scope: 'self',
  recipients: [],
  team: '',
  teamName: '',
  ownAudience: true,
};

/** A fresh reminder on `date` ('YYYY-MM-DD'). */
export const blankReminder = (date) => ({ ...BLANK, date });

/** The form for one reminder row of GET /api/calendar (its meta carries the reminder). */
export function reminderSeed(entry) {
  const m = entry?.meta || {};
  const recipients = (m.recipientIds || []).map(String);
  // `meta.time` is the label ("4:00 PM"): a clock time goes in the picker;
  // words typed on the web are carried as they are.
  const hm = m.timed ? to24h(m.time) : '';
  return {
    ...BLANK,
    id: m.reminderId || m.id || null,
    title: entry?.label || m.title || '',
    date: entry?.date || m.day || '',
    time: hm,
    rawTime: hm ? '' : m.time || '',
    notes: m.notes || '',
    priority: m.priority || 'Normal',
    scope: m.scope || 'self',
    recipients,
    team: m.team?.id ? String(m.team.id) : '',
    teamName: m.team?.name || '',
    ownAudience: Boolean(m.mine) || recipients.length > 0 || m.scope !== 'users',
  };
}

/** A seed as a draft, remembering the audience it opened with. */
function draftOf(seed) {
  const draft = { ...BLANK, ...seed, recipients: (seed.recipients || []).map(String) };
  draft.was = { scope: draft.scope, team: String(draft.team || ''), recipients: [...draft.recipients] };
  return draft;
}

const idOf = (p) => String(p?.id || p?._id || '');
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

function matches(p, term, pin) {
  if (!term) return true;
  const hay = `${p.name || ''} ${p.title || ''}`.toLowerCase();
  return hay.includes(term) || (pin.length >= 3 && String(p.pin || '').includes(pin));
}

export default function ReminderFormSheet({ seed, aim, onClose, onSaved }) {
  const qc = useQueryClient();
  const metaQ = useTaskMeta();
  const [opened, setOpened] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // A new seed starts a new draft in the same render, so the sheet never opens
  // on the last one. A null seed closes the sheet but leaves the draft on
  // screen while it slides away.
  if (seed && seed !== opened) {
    setOpened(seed);
    setForm(draftOf(seed));
    setError('');
    setSearch('');
  }

  const people = useMemo(() => (metaQ.data?.people || []).filter((p) => p.relation !== 'self'), [metaQ.data]);
  const peopleReady = Boolean(metaQ.data);
  const offered = useMemo(() => new Set(people.map(idOf)), [people]);
  const recipients = form?.recipients;

  // Somebody no longer among my contacts and team-mates (or switched off) is
  // left out of the count, the chips and what a save sends, the way the HRMS
  // leaves out people who have left.
  const picked = useMemo(() => (recipients || []).filter((id) => !peopleReady || offered.has(id)), [recipients, peopleReady, offered]);
  // Picked people first, as chips: a search that no longer matches a choice
  // must never make it look un-picked.
  const chosen = useMemo(() => people.filter((p) => (recipients || []).includes(idOf(p))), [people, recipients]);
  const found = useMemo(() => {
    const term = search.trim().toLowerCase();
    const pin = normalizePin(search);
    return term ? people.filter((p) => matches(p, term, pin)) : people;
  }, [people, search]);

  const a = aim || NO_AIM;
  const teams = useMemo(() => {
    const list = (a.teams || []).map((t) => ({ id: String(t.id), name: t.name }));
    // The team a reminder is already for stays offered, even when I could not
    // aim a new one at it (the Super Admin, or someone no longer its admin).
    if (form?.team && !list.some((t) => t.id === String(form.team))) list.push({ id: String(form.team), name: form.teamName || '—' });
    return list;
  }, [a.teams, form?.team, form?.teamName]);

  const scopes = form
    ? [
        'self',
        // Offered only when we hold the list: "specific people" with nobody
        // behind it would be a choice with nothing in it.
        ...(form.ownAudience ? ['users'] : []),
        ...(teams.length ? ['team'] : []),
        ...(a.everyone || form.scope === 'everyone' ? ['everyone'] : []),
      ]
    : [];

  const set = (patch) => {
    setError('');
    setForm((f) => ({ ...f, ...patch }));
  };
  const toggle = (id) => {
    setError('');
    setForm((f) => ({ ...f, recipients: f.recipients.includes(id) ? f.recipients.filter((x) => x !== id) : [...f.recipients, id] }));
  };
  const pickScope = (scope) => {
    setError('');
    setForm((f) => {
      // One team to choose from is the team: no second tap for it.
      const only = scope === 'team' && !f.team && teams.length === 1 ? teams[0] : null;
      return { ...f, scope, ...(only ? { team: only.id, teamName: only.name } : {}) };
    });
  };

  const close = () => {
    if (!saving) onClose?.();
  };

  const save = async () => {
    if (!form || saving) return;
    const title = form.title.trim();
    if (!title || !form.date) {
      setError(tr('A title and a date are required.'));
      return;
    }
    if (form.scope === 'users' && form.ownAudience && !picked.length) {
      setError(tr('Pick at least one person, or change who sees this reminder.'));
      return;
    }
    if (form.scope === 'team' && !form.team) {
      setError(tr('Pick an organization, or change who sees this reminder.'));
      return;
    }
    const body = { title, date: form.date, time: form.time || form.rawTime || '', notes: form.notes.trim(), priority: form.priority };
    // A new reminder always says who it is for; an edit only when the audience
    // was changed here. The server re-checks an audience it is sent and keeps
    // one left out as it is — so fixing a reminder's words never fails over a
    // contact removed since, and a list we were never sent (somebody else's
    // "specific people" reminder) is never sent back empty: the HRMS's
    // ownAudience rule.
    const was = form.was || {};
    const moved =
      !form.id ||
      form.scope !== was.scope ||
      (form.scope === 'team' && String(form.team) !== was.team) ||
      (form.scope === 'users' && !sameSet(form.recipients, was.recipients || []));
    if (moved) {
      body.scope = form.scope;
      if (form.scope === 'team') body.team = form.team;
      if (form.scope === 'users' && form.ownAudience) body.recipients = picked;
    }
    setSaving(true);
    setError('');
    try {
      const res = form.id ? await updateReminder(form.id, body) : await createReminder(body);
      const told = Number(res?.notified) || 0;
      qc.invalidateQueries({ queryKey: calendarKeys.all });
      onClose?.();
      onSaved?.(form.date);
      if (form.id) toast.success(tr('Reminder saved.'));
      else if (!told) toast.success(tr('Reminder added.'));
      else toast.success(told === 1 ? tr('Reminder added. 1 person was told.') : tr('Reminder added. {n} people were told.', { n: told }));
    } catch (e) {
      // Inline, not a toast: a toast cannot draw over an open sheet everywhere.
      setError(e.message || tr('Could not save the reminder.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={Boolean(seed && form)}
      onClose={close}
      title={form?.id ? tr('Edit reminder') : tr('New reminder')}
      subtitle={tr('It rings on the day: at its time, or at your workday start.')}
      footer={
        <>
          {error ? (
            <Notice tone="danger" style={styles.error}>
              {error}
            </Notice>
          ) : null}
          <Button title={form?.id ? tr('Save changes') : tr('Add reminder')} icon={Check} size="lg" loading={saving} onPress={save} />
        </>
      }
    >
      {form ? (
        <>
          <TextField
            label={tr('Title')}
            value={form.title}
            onChangeText={(v) => set({ title: v })}
            placeholder={tr('What is this about?')}
            maxLength={200}
          />

          <View style={styles.when}>
            <View style={styles.whenCol}>
              <View style={styles.labelRow}>
                <FieldLabel>{tr('Date')}</FieldLabel>
              </View>
              <DateField value={form.date} onChange={(v) => set({ date: v })} />
            </View>
            <View style={styles.whenCol}>
              <View style={styles.labelRow}>
                <View style={styles.shrink}>
                  <FieldLabel optional>{tr('Time')}</FieldLabel>
                </View>
                {form.time || form.rawTime ? (
                  <Pressable onPress={() => set({ time: '', rawTime: '' })} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('Clear')}>
                    <Text style={styles.clear}>{tr('Clear')}</Text>
                  </Pressable>
                ) : null}
              </View>
              {/* Words typed on the web ("after lunch") show as the field's
                  placeholder and are saved untouched unless a time is picked. */}
              <TimeField value={form.time} placeholder={form.rawTime || undefined} onChange={(v) => set({ time: v, rawTime: '' })} />
            </View>
          </View>

          <View style={styles.group}>
            <FieldLabel>{tr('Priority')}</FieldLabel>
            <ChipRow>
              {PRIORITIES.map((p) => (
                <Chip key={p} label={tr(p)} selected={form.priority === p} onPress={() => set({ priority: p })} />
              ))}
            </ChipRow>
          </View>

          <View style={styles.group}>
            <FieldLabel>{tr('Who sees it')}</FieldLabel>
            {form.scope === 'users' && !form.ownAudience ? (
              // Someone else's "specific people" reminder, its list not ours to
              // see: saving keeps their people; changing it is a deliberate step.
              <Notice
                tone="neutral"
                style={styles.notice}
                action={<TextButton title={tr('Change audience instead')} align="left" onPress={() => set({ scope: 'self' })} />}
              >
                {tr('Sent to specific people chosen by whoever set it. Saving here keeps them as they are.')}
              </Notice>
            ) : (
              <ChipRow>
                {scopes.map((s) => (
                  <Chip key={s} label={tr(SCOPE_LABELS[s])} selected={form.scope === s} onPress={() => pickScope(s)} />
                ))}
              </ChipRow>
            )}
          </View>

          {form.scope === 'users' && form.ownAudience ? (
            <View style={styles.group}>
              <FieldLabel>{tr('People ({n} selected)', { n: picked.length })}</FieldLabel>
              {chosen.length ? (
                <View style={styles.pickedWrap}>
                  {chosen.map((p) => (
                    <Pressable
                      key={`picked-${idOf(p)}`}
                      onPress={() => toggle(idOf(p))}
                      style={({ pressed }) => [styles.picked, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={tr('Remove {name}', { name: p.name })}
                    >
                      <Text style={styles.pickedText} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <X size={13} color={colors.textSecondary} strokeWidth={2.5} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <TextField
                value={search}
                onChangeText={setSearch}
                placeholder={tr('Search name or Task Pin…')}
                autoCorrect={false}
                autoCapitalize="none"
                left={<Search size={18} color={colors.textSecondary} style={styles.searchIcon} />}
                style={styles.search}
                accessibilityLabel={tr('Search name or Task Pin…')}
              />
              {!peopleReady ? (
                <Text style={styles.hint}>{metaQ.isError ? metaQ.error?.message || tr("Couldn't load this") : tr('Loading people…')}</Text>
              ) : !people.length ? (
                <Text style={styles.hint}>{tr('Add people by their Task Pin under Contacts first.')}</Text>
              ) : !found.length ? (
                <Text style={styles.hint}>{tr('No matching people.')}</Text>
              ) : null}
              {found.slice(0, PEOPLE_SHOWN).map((p) => {
                const id = idOf(p);
                const on = form.recipients.includes(id);
                const line = [p.title, pinOf(p)].filter(Boolean).join(' · ');
                return (
                  <Pressable
                    key={id}
                    onPress={() => toggle(id)}
                    style={({ pressed }) => [styles.person, pressed && styles.pressed]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={p.name}
                  >
                    <View style={[styles.box, on && styles.boxOn]}>{on ? <Check size={14} color={colors.onPrimary} strokeWidth={3} /> : null}</View>
                    <View style={styles.personText}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      {line ? (
                        <Text style={styles.personSub} numberOfLines={1}>
                          {line}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {found.length > PEOPLE_SHOWN ? <Text style={styles.hint}>{tr('Showing the first {n} — search to narrow it down.', { n: PEOPLE_SHOWN })}</Text> : null}
            </View>
          ) : null}

          {form.scope === 'team' ? (
            <View style={styles.group}>
              <FieldLabel>{tr('Organization')}</FieldLabel>
              <ChipRow>
                {teams.map((t) => (
                  <Chip key={t.id} label={t.name} selected={String(form.team) === t.id} onPress={() => set({ team: t.id, teamName: t.name })} />
                ))}
              </ChipRow>
            </View>
          ) : null}

          <TextField
            label={tr('Notes')}
            optional
            value={form.notes}
            onChangeText={(v) => set({ notes: v })}
            placeholder={tr('Anything worth remembering')}
            multiline
            maxLength={2000}
          />
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  error: { marginBottom: 0 },
  when: { flexDirection: 'row', gap: space(3), marginBottom: space(4) },
  whenCol: { flex: 1, minWidth: 0 },
  // The same label row in both columns, so the two boxes line up whether or
  // not "Clear" is showing.
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  shrink: { flexShrink: 1 },
  clear: { fontSize: 13, fontWeight: font.semibold, color: colors.primary, marginBottom: space(1.5) },
  group: { marginBottom: space(4) },
  notice: { marginBottom: 0 },
  pickedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space(2) },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pickedText: { fontSize: 12, fontWeight: '700', color: colors.text, flexShrink: 1 },
  search: { marginBottom: space(1) },
  searchIcon: { marginRight: space(2) },
  hint: { fontSize: 13, color: colors.textSecondary, paddingVertical: space(2) },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    minHeight: 52,
    paddingVertical: space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  // A filled box when picked: lucide has no filled checkbox glyph.
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  personText: { flex: 1, minWidth: 0 },
  personName: { fontSize: 15, fontWeight: font.medium, color: colors.text },
  personSub: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  pressed: { opacity: 0.7 },
});
