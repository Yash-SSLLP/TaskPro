/**
 * The one person picker the task module uses: Assign, Keep in the loop,
 * Delegate, Transfer, On behalf of, and the filters all pick people through
 * this, so all of them show the same people in the same order.
 *
 * The list is `meta.people` (GET /tasks/meta): the people I may give tasks
 * to. Before anybody types it shows
 *   Myself         when the caller allows it (an empty choice means "me")
 *   Organization members   active members of organizations I'm in
 *   Contacts       people I added by Task Pin
 *   Everyone else  the Super Admin only
 * Typing searches names and Task Pins.
 *
 * "Add someone by Task Pin" (`allowAddByPin`): somebody not in the list yet
 * is found by pin and sent a contact request. They can be given tasks once
 * they accept; if they had already asked me, they are added at once and
 * picked.
 *
 * Drawn as the HRMS app's picker (2026-10-08): a framed list under a muted
 * search row, 14pt names in semibold over a small grey line.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { tr, trParts } from '../../i18n';
import { PinLookup } from '../../platform/components/PinLookup';
import { contactsApi, platformKeys } from '../../platform/endpoints';
import { normalizePin, pinOf } from '../../platform/pin';
import { colors, font, radius, space } from '../../platform/theme';
import { Avatar, useKeyboardVisible, useVisibleHeight } from '../../platform/ui';
import { taskKeys } from '../api';
import { Check, ChevronDown, ChevronUp, Search, UserPlus, X } from '../icons';

const MAX_ROWS = 40;
const FOCUS_DELAY_MS = 280;
// While the keyboard is up a framed list gives way to it, so the search box,
// a few rows and the sheet's button above the keyboard all still show: what
// is left of the screen less about this much for the title, search row and
// footer, but never under two rows.
const KEYBOARD_CHROME = 300;
const MIN_LIST = 120;

const idOf = (p) => String(p?._id || p?.id || '');

function matches(p, term) {
  if (!term) return true;
  const pin = normalizePin(term);
  const hay = `${p.name || ''} ${p.title || ''}`.toLowerCase();
  return hay.includes(term) || (pin.length >= 3 && String(p.pin || '').includes(pin));
}

export function personLine(p) {
  return [p?.title, pinOf(p)].filter(Boolean).join(' · ');
}

/**
 * @param {{
 *   people: object[], value: string[], onChange: (ids: string[]) => void,
 *   max?: number, grouped?: boolean, allowSelf?: boolean, selfId?: string, exclude?: string[],
 *   placeholder?: string, autoFocus?: boolean, maxListHeight?: number, allowAddByPin?: boolean,
 * }} props
 */
export default function TaskPeoplePicker({
  people = [],
  value = [],
  onChange,
  max = 0,
  grouped = true,
  allowSelf = false,
  selfId = '',
  exclude = [],
  placeholder,
  autoFocus = false,
  maxListHeight = 0,
  allowAddByPin = false,
}) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);
  const qc = useQueryClient();
  const keyboardUp = useKeyboardVisible();
  const visibleHeight = useVisibleHeight();
  const listHeight = keyboardUp && maxListHeight ? Math.min(maxListHeight, Math.max(MIN_LIST, visibleHeight - KEYBOARD_CHROME)) : maxListHeight;

  useEffect(() => {
    if (!autoFocus) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoFocus]);

  const selected = useMemo(() => new Set((value || []).map(String)), [value]);
  const hidden = useMemo(() => new Set((exclude || []).map(String)), [exclude]);

  const me = useMemo(
    () => (people || []).find((p) => (selfId ? idOf(p) === String(selfId) : p.relation === 'self')) || null,
    [people, selfId]
  );
  const myId = me ? idOf(me) : String(selfId || '');

  const pool = useMemo(
    () => (people || []).filter((p) => !p.departed && !hidden.has(idOf(p)) && idOf(p) !== myId),
    [people, hidden, myId]
  );

  const sections = useMemo(() => {
    const term = q.trim().toLowerCase();
    const cut = (rows) => ({ rows: rows.slice(0, MAX_ROWS), more: Math.max(0, rows.length - MAX_ROWS) });
    const self = allowSelf && me && !hidden.has(myId) && matches(me, term) ? [me] : [];
    const head = self.length ? [{ key: 'self', title: tr('Myself'), rows: self, more: 0 }] : [];
    const hits = pool.filter((p) => matches(p, term));
    if (!grouped) return [...head, { key: 'all', title: term ? tr('Matches') : tr('Everyone'), ...cut(hits) }].filter((s) => s.rows.length);
    const team = hits.filter((p) => p.relation === 'team');
    const contacts = hits.filter((p) => p.relation === 'contact');
    const others = hits.filter((p) => p.relation !== 'team' && p.relation !== 'contact');
    return [
      ...head,
      { key: 'team', title: tr('Organization members'), ...cut(team) },
      { key: 'contacts', title: tr('Contacts'), ...cut(contacts) },
      { key: 'others', title: tr('Everyone else'), ...cut(others) },
    ].filter((s) => s.rows.length);
  }, [pool, q, grouped, allowSelf, me, myId, hidden]);

  const toggle = (id) => {
    const key = String(id);
    if (max === 1) {
      onChange?.(selected.has(key) ? [] : [key]);
      return;
    }
    const next = selected.has(key) ? (value || []).filter((v) => String(v) !== key) : [...(value || []), key];
    if (max && next.length > max) return;
    onChange?.(next.map(String));
  };

  const empty = !sections.some((sec) => sec.rows.length);

  const list = (
    <>
      {empty ? (
        <Text style={styles.empty}>
          {q ? tr('Nobody matches. Try another name or a Task Pin.') : tr('Nobody to show yet. Add people by their Task Pin.')}
        </Text>
      ) : (
        sections.map((sec) => (
          <View key={sec.key}>
            {grouped || sec.key === 'self' ? <Text style={styles.sectionTitle}>{sec.title}</Text> : null}
            {sec.rows.map((p) => {
              const id = idOf(p);
              const on = selected.has(id);
              const isMe = id === myId;
              return (
                <Pressable
                  key={id}
                  onPress={() => toggle(id)}
                  accessibilityRole={max === 1 ? 'radio' : 'checkbox'}
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={isMe ? tr('Myself') : p.name}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  {isMe && p.photoUrl ? (
                    <View style={styles.meRing}>
                      <Avatar person={p} size={32} />
                    </View>
                  ) : isMe ? (
                    <View style={styles.meAvatar}>
                      <Text style={styles.meText}>{tr('Me')}</Text>
                    </View>
                  ) : (
                    <Avatar person={p} size={36} />
                  )}
                  <View style={styles.texts}>
                    <Text style={styles.name} numberOfLines={1}>
                      {isMe ? tr('Myself ({name})', { name: p.name }) : p.name}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {isMe ? tr('Give it to yourself') : personLine(p)}
                    </Text>
                  </View>
                  <View style={[styles.box, max === 1 && styles.boxRound, on && styles.boxOn]}>
                    {on ? <Check size={14} color={colors.onPrimary} strokeWidth={3} /> : null}
                  </View>
                </Pressable>
              );
            })}
            {sec.more > 0 ? <Text style={styles.more}>{trParts('+{more} more — keep typing to narrow it down.', { more: sec.more })}</Text> : null}
          </View>
        ))
      )}
    </>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <Search size={17} color={colors.textFaint} />
        <TextInput
          ref={inputRef}
          value={q}
          onChangeText={setQ}
          placeholder={placeholder || tr('Search name or Task Pin…')}
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel={tr('Clear the search')}>
            <X size={17} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      {listHeight ? (
        <ScrollView style={{ maxHeight: listHeight }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {list}
        </ScrollView>
      ) : (
        list
      )}

      {allowAddByPin ? (
        <View style={styles.addWrap}>
          <Pressable
            onPress={() => setAdding((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: adding }}
            style={({ pressed }) => [styles.addRow, pressed && styles.rowPressed]}
          >
            <UserPlus size={18} color={colors.primary} />
            <Text style={styles.addText}>{tr('Add someone by Task Pin')}</Text>
            {adding ? <ChevronUp size={18} color={colors.textFaint} /> : <ChevronDown size={18} color={colors.textFaint} />}
          </Pressable>
          {adding ? (
            <PinLookup
              style={styles.lookup}
              autoFocus
              actionFor={({ person, relation }) => {
                const pid = idOf(person);
                const inList = (people || []).some((p) => idOf(p) === pid);
                if (relation === 'self') return null;
                if (inList) {
                  return {
                    label: selected.has(pid) ? tr('Already picked') : tr('Pick {name}', { name: person.name }),
                    onPress: selected.has(pid)
                      ? undefined
                      : async () => {
                          toggle(pid);
                          return tr('{name} is picked.', { name: person.name });
                        },
                  };
                }
                if (relation === 'outgoing') return { label: tr('Request already sent'), variant: 'secondary' };
                return {
                  label: relation === 'incoming' ? tr('Accept and add {name}', { name: person.name }) : tr('Send contact request'),
                  icon: UserPlus,
                  onPress: async () => {
                    const res = await contactsApi.add(normalizePin(person.pin));
                    qc.invalidateQueries({ queryKey: platformKeys.contacts });
                    if (res?.status === 'accepted') {
                      await qc.invalidateQueries({ queryKey: taskKeys.meta });
                      return tr('{name} is now a contact. Pick them from the list.', { name: person.name });
                    }
                    return tr('Request sent. You can give {name} tasks once they accept.', { name: person.name });
                  },
                };
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    minHeight: 48,
    paddingHorizontal: space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.muted,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: space(2) },
  sectionTitle: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: font.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: space(3),
    paddingTop: space(3),
    paddingBottom: space(1),
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.muted },
  meAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  // My own photo, ringed in the accent where the "Me" circle would be.
  meRing: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  meText: { color: colors.onPrimary, fontSize: 12, fontWeight: '800' },
  texts: { flex: 1 },
  name: { color: colors.text, fontSize: 14, fontWeight: font.semibold },
  sub: { color: colors.textFaint, fontSize: 11.5, marginTop: 2 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxRound: { borderRadius: 11 },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  empty: { color: colors.textFaint, fontSize: 12.5, padding: space(4), textAlign: 'center' },
  more: { color: colors.textFaint, fontSize: 11.5, paddingHorizontal: space(3), paddingVertical: space(2) },
  addWrap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  addRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(3) },
  addText: { flex: 1, color: colors.primary, fontSize: 14, fontWeight: font.bold },
  lookup: { paddingHorizontal: space(3), paddingBottom: space(1) },
});
