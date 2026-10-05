/**
 * Contacts, BBM style, by Task Pin: my pin (copy, share), add someone by
 * their pin (see who it is, then send a request), requests to me (accept or
 * decline), requests I sent (cancel), and my contacts (search, give a task,
 * remove). Contacts are the people I can give tasks to outside my teams.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { PinCard } from '../components/PinCard';
import { PinLookup } from '../components/PinLookup';
import { contactsApi, platformKeys } from '../endpoints';
import { relativeTime } from '../format';
import { useContacts, usePullRefresh, useRefetchOnFocus } from '../hooks';
import { BookUser, Check, Search, Send, UserPlus, UserX, X } from '../icons';
import { normalizePin, pinOf } from '../pin';
import { useSession } from '../session';
import { colors, font, radius, space, type } from '../theme';
import { Avatar, BottomSheet, Button, Card, EmptyState, ErrorState, Header, IconButton, ListRow, Screen, Section, SkeletonList, confirm, toast } from '../ui';

function PersonRow({ person, sub, right, onPress }) {
  return <ListRow left={<Avatar name={person?.name} size={40} />} title={person?.name || '—'} subtitle={sub} right={right} onPress={onPress} chevron={false} />;
}

export default function ContactsScreen({ navigation }) {
  const user = useSession((s) => s.user);
  const qc = useQueryClient();
  const q = useContacts();
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  useRefetchOnFocus(q.refetch);
  const [term, setTerm] = useState('');
  const [chosen, setChosen] = useState(null);

  const data = q.data || { contacts: [], incoming: [], outgoing: [] };
  const contacts = useMemo(() => {
    const t = term.trim().toLowerCase();
    const pin = normalizePin(term);
    return (data.contacts || [])
      .filter((c) => !t || String(c.person?.name || '').toLowerCase().includes(t) || (pin.length >= 3 && String(c.person?.pin || '').includes(pin)))
      .sort((a, b) => String(a.person?.name || '').localeCompare(String(b.person?.name || '')));
  }, [data.contacts, term]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: platformKeys.contacts });
    qc.invalidateQueries({ queryKey: ['taskMeta'] });
  };

  const accept = async (r) => {
    try {
      await contactsApi.accept(r.id);
      toast.success(tr('{name} is now a contact.', { name: r.person?.name }));
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const decline = async (r) => {
    const ok = await confirm({ title: tr('Decline this request?'), message: tr('{name} will not be added. They are not told you declined.', { name: r.person?.name }), confirmLabel: tr('Decline'), destructive: true });
    if (!ok) return;
    try {
      await contactsApi.decline(r.id);
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const cancel = async (r) => {
    const ok = await confirm({ title: tr('Cancel this request?'), confirmLabel: tr('Cancel request'), cancelLabel: tr('Keep it'), destructive: true });
    if (!ok) return;
    try {
      await contactsApi.remove(r.id);
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const remove = async (c) => {
    setChosen(null);
    await new Promise((r) => setTimeout(r, 300));
    const ok = await confirm({
      title: tr('Remove {name}?', { name: c.person?.name }),
      message: tr('You can no longer give each other tasks, unless you share a team. Tasks you already have stay.'),
      confirmLabel: tr('Remove'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await contactsApi.remove(c.id);
      toast.success(tr('Removed.'));
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <Screen header={<Header back title={tr('Contacts')} />} scroll refreshing={refreshing} onRefresh={onRefresh}>
      <PinCard user={user} compact style={styles.pin} />

      <Card style={styles.add}>
        <Text style={styles.addTitle}>{tr('Add someone by their Task Pin')}</Text>
        <Text style={styles.addHint}>{tr('Ask them for their pin. They get a request and can accept it.')}</Text>
        <PinLookup
          style={styles.lookup}
          actionFor={({ person, relation }) => {
            if (relation === 'self') return null;
            if (relation === 'contact') return { label: tr('Already in your contacts'), variant: 'secondary' };
            if (relation === 'outgoing') return { label: tr('Request already sent'), variant: 'secondary' };
            return {
              label: relation === 'incoming' ? tr('Accept their request') : tr('Send contact request'),
              icon: relation === 'incoming' ? Check : Send,
              onPress: async () => {
                const res = await contactsApi.add(normalizePin(person.pin));
                refresh();
                return res?.status === 'accepted'
                  ? tr('{name} is now a contact.', { name: person.name })
                  : tr('Request sent to {name}. They will see it in their alerts.', { name: person.name });
              },
            };
          }}
        />
      </Card>

      {q.isPending ? <SkeletonList rows={3} avatar /> : null}
      {q.isError ? <ErrorState compact error={q.error} onRetry={q.refetch} /> : null}

      {data.incoming?.length ? (
        <Section title={tr('Asking to add you')}>
          {data.incoming.map((r) => (
            <PersonRow
              key={r.id}
              person={r.person}
              sub={[pinOf(r.person), relativeTime(r.at)].filter(Boolean).join(' · ')}
              right={
                <View style={styles.actions}>
                  <IconButton icon={X} label={tr('Decline')} color={colors.danger} onPress={() => decline(r)} />
                  <Button title={tr('Accept')} size="sm" full={false} onPress={() => accept(r)} />
                </View>
              }
            />
          ))}
        </Section>
      ) : null}

      {data.outgoing?.length ? (
        <Section title={tr('Requests you sent')}>
          {data.outgoing.map((r) => (
            <PersonRow
              key={r.id}
              person={r.person}
              sub={tr('Waiting for them to accept · {when}', { when: relativeTime(r.at) })}
              right={<Button title={tr('Cancel')} size="sm" variant="secondary" full={false} onPress={() => cancel(r)} />}
            />
          ))}
        </Section>
      ) : null}

      {!q.isPending && !q.isError ? (
        <View>
          <Text style={styles.listTitle}>{tr('My contacts ({n})', { n: data.contacts?.length || 0 })}</Text>
          {(data.contacts || []).length > 6 ? (
            <View style={styles.search}>
              <Search size={17} color={colors.textFaint} />
              <TextInput value={term} onChangeText={setTerm} placeholder={tr('Search name or Task Pin…')} placeholderTextColor={colors.textFaint} style={styles.searchInput} autoCorrect={false} />
            </View>
          ) : null}
          {contacts.length ? (
            <Section>
              {contacts.map((c) => (
                <ListRow
                  key={c.id}
                  left={<Avatar name={c.person?.name} size={40} />}
                  title={c.person?.name}
                  subtitle={[c.person?.title, pinOf(c.person)].filter(Boolean).join(' · ')}
                  onPress={() => setChosen(c)}
                />
              ))}
            </Section>
          ) : (
            <EmptyState
              compact
              icon={BookUser}
              title={term ? tr('Nobody matches') : tr('No contacts yet')}
              message={term ? tr('Try another name or a Task Pin.') : tr('Add people by their Task Pin. Once they accept, you can give each other tasks.')}
            />
          )}
        </View>
      ) : null}

      <BottomSheet visible={!!chosen} onClose={() => setChosen(null)} title={chosen?.person?.name} subtitle={chosen ? [chosen.person?.title, pinOf(chosen.person)].filter(Boolean).join(' · ') : undefined}>
        {chosen ? (
          <View>
            <Text style={styles.since}>{chosen.since ? tr('Contact since {when}', { when: relativeTime(chosen.since) }) : ''}</Text>
            <ListRow
              icon={UserPlus}
              iconColor={colors.primary}
              title={tr('Give a task')}
              chevron={false}
              onPress={() => {
                const id = chosen.person?.id;
                setChosen(null);
                setTimeout(() => navigation.navigate('AssignTask', { assignees: id ? [id] : [] }), 300);
              }}
            />
            <ListRow icon={UserX} title={tr('Remove contact')} danger chevron={false} onPress={() => remove(chosen)} />
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pin: { marginBottom: space(4) },
  add: { marginBottom: space(5) },
  addTitle: { fontSize: 16, fontWeight: font.semibold, color: colors.text },
  addHint: { ...type.caption, marginTop: 2 },
  lookup: { marginTop: space(3) },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  listTitle: { ...type.overline, marginBottom: space(2), marginLeft: space(1) },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    minHeight: 46,
    paddingHorizontal: space(3),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: space(3),
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  since: { ...type.caption, marginBottom: space(2) },
});
