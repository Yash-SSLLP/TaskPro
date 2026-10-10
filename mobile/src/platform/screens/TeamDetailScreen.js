/**
 * One organization (the API's team): who is in it (role and status), its
 * tasks, and what I may do here:
 *   everyone        Organization tasks, leave (not the owner)
 *   invited (me)    join or decline
 *   owner / admin   invite people (only the owner invites as admin), remove a
 *                   member or cancel an invite, rename
 *   owner           change roles, hand over ownership, delete it
 *   Super Admin     view and delete
 *
 * INVITING, two ways in one sheet: By Task Pin (look the person up), or From
 * your connections: my contacts and the people I share another organization
 * with (GET /teams/:id/candidates), searchable, several picked at once and
 * sent together. People already in it are left out; invited ones are marked.
 * Either way they get an invitation and only join once they accept. A new
 * organization opens here with the sheet up (`invite` param).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { PersonCard, PinLookup } from '../components/PinLookup';
import { platformApi, platformKeys, teamsApi } from '../endpoints';
import { relativeTime } from '../format';
import { usePullRefresh } from '../hooks';
import { Building, Check, Crown, LayoutDashboard, LogOut, Pencil, Search, Shield, Trash, User, UserMinus, UserPlus, X } from '../icons';
import { normalizePin, pinOf, roleLabel, roleTone } from '../pin';
import { isSuperAdmin, useSession } from '../session';
import { colors, font, radius, space, type } from '../theme';
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  ListRow,
  Notice,
  Screen,
  ScrollSegmented,
  Section,
  Segmented,
  SkeletonList,
  TextField,
  confirm,
  toast,
} from '../ui';

const idOf = (p) => String(p?.id || p?._id || '');

/** Waits a moment after typing stops before searching. */
function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function TeamDetailScreen({ navigation, route }) {
  const id = route.params?.id;
  const me = useSession((s) => s.user);
  const admin = isSuperAdmin(me);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: platformKeys.team(id), queryFn: () => teamsApi.get(id), enabled: !!id });
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  const [inviting, setInviting] = useState(false);
  const [inviteRole, setInviteRole] = useState('member');
  // The invite sheet's two ways in: 'pin' (By Task Pin) or 'connections'.
  const [inviteBy, setInviteBy] = useState('pin');
  const [picked, setPicked] = useState([]);
  const [sending, setSending] = useState(false);
  const [inviteNote, setInviteNote] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [formError, setFormError] = useState(null);
  const [member, setMember] = useState(null);

  const team = q.data;
  const members = team?.members || [];
  const mine = members.find((m) => idOf(m.person) === idOf(me));
  const myRole = team?.myRole || (mine?.status === 'active' ? mine.role : null);
  const invitedMe = mine?.status === 'invited';
  const isOwner = myRole === 'owner';
  const manages = myRole === 'owner' || myRole === 'admin';
  const active = members.filter((m) => m.status === 'active');
  const invited = members.filter((m) => m.status !== 'active');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: platformKeys.teams });
    qc.invalidateQueries({ queryKey: ['platform'] });
    qc.invalidateQueries({ queryKey: ['taskMeta'] });
  };
  const run = async (fn, done) => {
    try {
      const t = await fn();
      if (t && typeof t === 'object' && t.id) qc.setQueryData(platformKeys.team(id), t);
      else q.refetch();
      refresh();
      if (done) toast.success(done);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  };

  const openInvite = () => {
    setInviteRole('member');
    setInviteBy('pin');
    setPicked([]);
    setInviteNote(null);
    setInviting(true);
  };

  // Just created (TeamsScreen): straight on to inviting people, once.
  const askedInvite = route.params?.invite;
  const inviteOpened = useRef(false);
  useEffect(() => {
    if (!askedInvite || inviteOpened.current || !manages) return;
    inviteOpened.current = true;
    openInvite();
    navigation.setParams({ invite: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedInvite, manages]);

  /** From your connections: invite everyone picked, as one request. */
  const sendPicked = async () => {
    if (!picked.length || sending) return;
    setSending(true);
    setInviteNote(null);
    try {
      const res = await teamsApi.inviteMany(id, picked, isOwner ? inviteRole : undefined);
      if (res?.team) qc.setQueryData(platformKeys.team(id), res.team);
      else q.refetch();
      refresh();
      qc.invalidateQueries({ queryKey: ['teams', 'candidates', id] });
      setPicked([]);
      const sent = res?.invited || [];
      const skipped = res?.skipped || [];
      let text = '';
      if (sent.length === 1) text = tr('Invited {name}. They join once they accept.', { name: sent[0].name });
      else if (sent.length) text = tr('Invited {n} people. They join once they accept.', { n: sent.length });
      const left = skipped.map((p) => p.name).filter(Boolean);
      setInviteNote({
        tone: sent.length ? 'success' : 'danger',
        text: [text, skipped.length ? tr('Not invited: {names}.', { names: left.length === skipped.length ? left.join(', ') : skipped.length }) : ''].filter(Boolean).join(' '),
      });
    } catch (e) {
      setInviteNote({ tone: 'danger', text: e.message });
    } finally {
      setSending(false);
    }
  };

  const join = () => run(() => teamsApi.accept(id), tr('You joined {name}.', { name: team?.name }));
  const declineInvite = async () => {
    const ok = await confirm({ title: tr('Decline the invitation to {name}?', { name: team?.name }), confirmLabel: tr('Decline'), destructive: true });
    if (!ok) return;
    if (await run(() => teamsApi.decline(id))) navigation.goBack();
  };
  const leave = async () => {
    const ok = await confirm({
      title: tr('Leave {name}?', { name: team?.name }),
      message: tr('You will no longer see the organization or give its members tasks through it. Your own tasks stay.'),
      confirmLabel: tr('Leave'),
      destructive: true,
    });
    if (!ok) return;
    if (await run(() => teamsApi.removeMember(id, idOf(me)), tr('You left the organization.'))) navigation.goBack();
  };
  const removeTeam = async () => {
    const ok = await confirm({
      title: tr('Delete {name}?', { name: team?.name }),
      message: tr('The organization is gone for everyone. Its tasks stay, under General.'),
      confirmLabel: tr('Delete organization'),
      destructive: true,
    });
    if (!ok) return;
    const fn = admin && !isOwner ? () => platformApi.deleteTeam(id) : () => teamsApi.remove(id);
    if (await run(fn, tr('Organization deleted.'))) navigation.goBack();
  };
  const saveEdit = async () => {
    if (form.name.trim().length < 2) {
      setFormError(tr('Give the organization a name'));
      return;
    }
    setFormError(null);
    try {
      const t = await teamsApi.update(id, { name: form.name.trim(), description: form.description.trim() });
      if (t) qc.setQueryData(platformKeys.team(id), t);
      refresh();
      setEditing(false);
      toast.success(tr('Saved'));
    } catch (e) {
      setFormError(e.message);
    }
  };

  // Tasks on this organization's tab (the Super Admin, who has no tabs: its chip).
  const openTasks = () => {
    const at = { team: id, teamName: team?.name || '', nonce: Date.now() };
    if (admin) navigation.navigate('Main', { screen: 'AllTasks', params: { pile: 'all', ...at } });
    else navigation.navigate('Main', { screen: 'Tasks', params: { pile: manages ? 'team' : 'mine', ...at } });
  };

  const memberActions = (m) => {
    if (!m) return [];
    const pid = idOf(m.person);
    const out = [];
    if (pid === idOf(me)) return out;
    if (m.status === 'active' && isOwner && m.role !== 'owner') {
      out.push(
        m.role === 'admin'
          ? { key: 'member', icon: User, label: tr('Make a member'), run: () => teamsApi.setRole(id, pid, 'member'), done: tr('{name} is now a member.', { name: m.person?.name }) }
          : { key: 'admin', icon: Shield, label: tr('Make an admin'), run: () => teamsApi.setRole(id, pid, 'admin'), done: tr('{name} is now an admin.', { name: m.person?.name }) }
      );
      out.push({
        key: 'owner',
        icon: Crown,
        label: tr('Make owner'),
        confirm: { title: tr('Hand the organization to {name}?', { name: m.person?.name }), message: tr('They become the owner and you become an admin.'), confirmLabel: tr('Make owner') },
        run: () => teamsApi.transfer(id, pid),
        done: tr('{name} now owns the organization.', { name: m.person?.name }),
      });
    }
    if (manages && m.role !== 'owner' && (isOwner || m.role !== 'admin' || m.status !== 'active')) {
      out.push({
        key: 'remove',
        icon: UserMinus,
        danger: true,
        label: m.status === 'active' ? tr('Remove from the organization') : tr('Cancel the invitation'),
        confirm: m.status === 'active' ? { title: tr('Remove {name}?', { name: m.person?.name }), message: tr('Their tasks stay.'), confirmLabel: tr('Remove'), destructive: true } : null,
        run: () => teamsApi.removeMember(id, pid),
        done: m.status === 'active' ? tr('Removed.') : tr('Invitation cancelled.'),
      });
    }
    return out;
  };

  const doMemberAction = async (a) => {
    setMember(null);
    // Let the sheet close before a dialog opens over the screen.
    await new Promise((r) => setTimeout(r, 300));
    if (a.confirm) {
      const ok = await confirm(a.confirm);
      if (!ok) return;
    }
    await run(a.run, a.done);
  };

  const header = <Header back title={team?.name || tr('Organization')} subtitle={myRole ? roleLabel(myRole) : undefined} />;

  if (q.isPending) {
    return (
      <Screen header={header}>
        <SkeletonList rows={5} avatar />
      </Screen>
    );
  }
  if (q.isError || !team) {
    return (
      <Screen header={header}>
        {q.error?.status === 404 ? (
          <EmptyState icon={Building} title={tr('This organization is not there')} message={tr('It may have been deleted, or you are no longer in it.')} actionLabel={tr('Go back')} onAction={() => navigation.goBack()} />
        ) : (
          <ErrorState error={q.error} onRetry={q.refetch} />
        )}
      </Screen>
    );
  }

  return (
    <Screen header={header} scroll refreshing={refreshing} onRefresh={onRefresh}>
      <Card style={styles.head}>
        <View style={styles.headIcon}>
          <Building size={24} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.name}>{team.name}</Text>
          {team.description ? <Text style={styles.desc}>{team.description}</Text> : null}
          <Text style={styles.meta}>
            {tr('Owner: {name}', { name: team.owner?.name || '—' })} · {active.length === 1 ? tr('1 member') : tr('{n} members', { n: active.length })}
          </Text>
        </View>
        {manages ? (
          <IconButton
            icon={Pencil}
            label={tr('Rename')}
            onPress={() => {
              setForm({ name: team.name || '', description: team.description || '' });
              setFormError(null);
              setEditing(true);
            }}
          />
        ) : null}
      </Card>

      {invitedMe ? (
        <Notice
          tone="info"
          action={
            <View style={styles.inviteRow}>
              <Button title={tr('Join')} size="sm" full={false} onPress={join} />
              <Button title={tr('Decline')} size="sm" variant="secondary" full={false} onPress={declineInvite} />
            </View>
          }
        >
          {tr('{name} invited you to this organization.', { name: mine?.invitedBy?.name || team.owner?.name || tr('Someone') })}
        </Notice>
      ) : null}

      {myRole || admin ? <Button title={tr('Organization tasks')} icon={LayoutDashboard} variant="soft" onPress={openTasks} style={styles.block} /> : null}
      {manages ? <Button title={tr('Invite people')} icon={UserPlus} onPress={openInvite} style={styles.block} /> : null}

      <Section title={tr('Members ({n})', { n: active.length })}>
        {active.map((m) => {
          const acts = memberActions(m);
          return (
            <ListRow
              key={idOf(m.person)}
              left={<Avatar person={m.person} size={40} />}
              title={idOf(m.person) === idOf(me) ? tr('{name} (you)', { name: m.person?.name }) : m.person?.name}
              subtitle={[pinOf(m.person), m.joinedAt ? tr('joined {when}', { when: relativeTime(m.joinedAt) }) : ''].filter(Boolean).join(' · ')}
              right={<Badge label={roleLabel(m.role)} tone={roleTone(m.role)} style={styles.badge} />}
              onPress={acts.length ? () => setMember(m) : undefined}
            />
          );
        })}
      </Section>

      {invited.length ? (
        <Section title={tr('Invited ({n})', { n: invited.length })} footer={tr('They join once they accept.')}>
          {invited.map((m) => {
            const acts = memberActions(m);
            return (
              <ListRow
                key={idOf(m.person)}
                left={<Avatar person={m.person} size={40} dimmed />}
                title={m.person?.name}
                subtitle={tr('Invited by {name} · {when}', { name: m.invitedBy?.name || '—', when: relativeTime(m.invitedAt) })}
                right={<Badge label={roleLabel(m.role)} tone="neutral" style={styles.badge} />}
                onPress={acts.length ? () => setMember(m) : undefined}
              />
            );
          })}
        </Section>
      ) : null}

      <Section>
        {myRole && !isOwner ? <ListRow icon={LogOut} title={tr('Leave organization')} danger chevron={false} onPress={leave} /> : null}
        {isOwner || admin ? <ListRow icon={Trash} title={tr('Delete organization')} danger chevron={false} onPress={removeTeam} /> : null}
      </Section>
      {isOwner ? <Text style={styles.ownerNote}>{tr('The owner cannot leave. Hand the organization to someone else first.')}</Text> : null}

      <BottomSheet
        visible={inviting}
        onClose={() => setInviting(false)}
        title={tr('Invite people')}
        subtitle={tr('They get an invitation and join once they accept.')}
        footer={
          inviteBy === 'connections' ? (
            <Button
              title={picked.length ? (picked.length === 1 ? tr('Invite 1 person') : tr('Invite {n} people', { n: picked.length })) : tr('Pick people to invite')}
              icon={UserPlus}
              size="lg"
              disabled={!picked.length}
              loading={sending}
              onPress={sendPicked}
            />
          ) : null
        }
      >
        {/* Sized to its words (they run long in some languages), sideways if they do not fit. */}
        <ScrollSegmented
          style={styles.block}
          options={[
            { value: 'pin', label: tr('By Task Pin') },
            { value: 'connections', label: tr('From your connections') },
          ]}
          value={inviteBy}
          onChange={(v) => {
            setInviteBy(v);
            setInviteNote(null);
          }}
        />
        {isOwner ? (
          <Segmented
            style={styles.block}
            options={[
              { value: 'member', label: tr('As a member') },
              { value: 'admin', label: tr('As an admin') },
            ]}
            value={inviteRole}
            onChange={setInviteRole}
          />
        ) : null}
        {inviteBy === 'pin' ? (
          <PinLookup
            autoFocus
            actionFor={({ person, relation }) => {
              if (relation === 'self') return null;
              const already = members.find((m) => idOf(m.person) === idOf(person));
              if (already) return { label: already.status === 'active' ? tr('Already in the organization') : tr('Already invited'), variant: 'secondary' };
              return {
                label: tr('Invite {name}', { name: person.name }),
                icon: UserPlus,
                onPress: async () => {
                  const t = await teamsApi.invite(id, normalizePin(person.pin), isOwner ? inviteRole : undefined);
                  if (t) qc.setQueryData(platformKeys.team(id), t);
                  else q.refetch();
                  refresh();
                  return tr('Invited {name}. They join once they accept.', { name: person.name });
                },
              };
            }}
          />
        ) : (
          <>
            <Notice tone={inviteNote?.tone}>{inviteNote?.text}</Notice>
            <ConnectionsPicker teamId={id} value={picked} onChange={setPicked} />
          </>
        )}
      </BottomSheet>

      <BottomSheet visible={editing} onClose={() => setEditing(false)} title={tr('Rename organization')} footer={<Button title={tr('Save')} size="lg" onPress={saveEdit} />}>
        <TextField label={tr('Organization name')} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} maxLength={80} />
        <TextField label={tr('About the organization')} optional value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline maxLength={500} />
        <Notice tone="danger">{formError}</Notice>
      </BottomSheet>

      <BottomSheet visible={!!member} onClose={() => setMember(null)} title={member?.person?.name}>
        {member ? (
          <View>
            <PersonCard person={member.person} badge={{ label: roleLabel(member.role), tone: roleTone(member.role) }} style={styles.block} />
            {memberActions(member).map((a) => (
              <ListRow key={a.key} icon={a.icon} title={a.label} danger={a.danger} chevron={false} onPress={() => doMemberAction(a)} />
            ))}
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

/**
 * From your connections: the people I could invite (my contacts and the
 * people in my other organizations), searched on the server by name or Task
 * Pin, ticked one by one. Anyone already in it is left out; anyone already
 * invited shows "Invited" and cannot be ticked again.
 */
function ConnectionsPicker({ teamId, value, onChange }) {
  const [term, setTerm] = useState('');
  const qText = useDebounced(term.trim());
  const q = useQuery({
    queryKey: platformKeys.teamCandidates(teamId, qText),
    queryFn: () => teamsApi.candidates(teamId, qText),
    placeholderData: (prev) => prev,
  });
  const people = useMemo(() => (q.data || []).filter((p) => p.membership !== 'active'), [q.data]);
  const picked = useMemo(() => new Set(value.map(String)), [value]);
  // `onChange` is a state setter: an updater, so two quick taps both count.
  const toggle = (pid) => onChange((cur) => (cur.includes(pid) ? cur.filter((v) => v !== pid) : [...cur, pid]));

  let body;
  if (q.isPending) body = <SkeletonList rows={4} avatar />;
  else if (q.isError) body = <ErrorState compact error={q.error} onRetry={q.refetch} />;
  else if (!people.length)
    body = (
      <Text style={styles.empty}>
        {qText ? tr('Nobody matches. Try another name or a Task Pin.') : tr('Nobody to invite yet. Your contacts and the people in your other organizations show here.')}
      </Text>
    );
  else
    body = people.map((p) => {
      const pid = idOf(p);
      const already = p.membership === 'invited';
      const on = picked.has(pid);
      return (
        <Pressable
          key={pid}
          onPress={already ? undefined : () => toggle(pid)}
          disabled={already}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: on, disabled: already }}
          aria-checked={on}
          accessibilityLabel={already ? `${p.name}, ${tr('Invited')}` : p.name}
          style={({ pressed }) => [styles.pickRow, pressed && styles.pickPressed]}
        >
          <Avatar person={p} size={36} dimmed={already} />
          <View style={styles.flex}>
            <Text style={styles.pickName} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={styles.pickSub} numberOfLines={1}>
              {[p.title, pinOf(p)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {already ? (
            <Badge label={tr('Invited')} tone="neutral" style={styles.badge} />
          ) : (
            <View style={[styles.box, on && styles.boxOn]}>{on ? <Check size={14} color={colors.onPrimary} strokeWidth={3} /> : null}</View>
          )}
        </Pressable>
      );
    });

  return (
    <View style={styles.pickWrap}>
      <View style={styles.searchRow}>
        <Search size={17} color={colors.textFaint} />
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder={tr('Search name or Task Pin…')}
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={tr('Search')}
        />
        {term ? (
          <Pressable onPress={() => setTerm('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('Clear the search')}>
            <X size={17} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3), marginBottom: space(4) },
  headIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 19, fontWeight: font.bold, color: colors.text },
  desc: { ...type.small, marginTop: 2, lineHeight: 20 },
  meta: { ...type.caption, marginTop: space(1.5) },
  inviteRow: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
  block: { marginBottom: space(3) },
  badge: { alignSelf: 'center' },
  ownerNote: { ...type.caption, textAlign: 'center', marginTop: -space(3), marginBottom: space(4) },

  // From your connections: the task picker's framed list (TaskPeoplePicker).
  pickWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.input, backgroundColor: colors.card },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    minHeight: 48,
    paddingHorizontal: space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    borderTopLeftRadius: radius.input,
    borderTopRightRadius: radius.input,
    backgroundColor: colors.muted,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: space(2) },
  pickRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickPressed: { backgroundColor: colors.muted },
  pickName: { color: colors.text, fontSize: 14, fontWeight: font.semibold },
  pickSub: { color: colors.textFaint, fontSize: 11.5, marginTop: 2 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  empty: { ...type.small, color: colors.textSecondary, padding: space(4), textAlign: 'center' },
});
