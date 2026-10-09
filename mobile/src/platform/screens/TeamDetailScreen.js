/**
 * One team: who is in it (role and status), the team's tasks, and what I may
 * do here:
 *   everyone        Team tasks, leave (not the owner)
 *   invited (me)    join or decline
 *   owner / admin   invite by Task Pin (only the owner invites as admin),
 *                   remove a member or cancel an invite, rename
 *   owner           change roles, hand over ownership, delete the team
 *   Super Admin     view and delete
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { PersonCard, PinLookup } from '../components/PinLookup';
import { platformApi, platformKeys, teamsApi } from '../endpoints';
import { relativeTime } from '../format';
import { usePullRefresh } from '../hooks';
import { Crown, LayoutDashboard, LogOut, Pencil, Shield, Trash, User, UserMinus, UserPlus, Users } from '../icons';
import { normalizePin, pinOf, roleLabel, roleTone } from '../pin';
import { isSuperAdmin, useSession } from '../session';
import { colors, font, space, type } from '../theme';
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
  Section,
  Segmented,
  SkeletonList,
  TextField,
  confirm,
  toast,
} from '../ui';

const idOf = (p) => String(p?.id || p?._id || '');

export default function TeamDetailScreen({ navigation, route }) {
  const id = route.params?.id;
  const me = useSession((s) => s.user);
  const admin = isSuperAdmin(me);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: platformKeys.team(id), queryFn: () => teamsApi.get(id), enabled: !!id });
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  const [inviting, setInviting] = useState(false);
  const [inviteRole, setInviteRole] = useState('member');
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

  const join = () => run(() => teamsApi.accept(id), tr('You joined {name}.', { name: team?.name }));
  const declineInvite = async () => {
    const ok = await confirm({ title: tr('Decline the invitation to {name}?', { name: team?.name }), confirmLabel: tr('Decline'), destructive: true });
    if (!ok) return;
    if (await run(() => teamsApi.decline(id))) navigation.goBack();
  };
  const leave = async () => {
    const ok = await confirm({
      title: tr('Leave {name}?', { name: team?.name }),
      message: tr('You will no longer see the team or give its members tasks through it. Your own tasks stay.'),
      confirmLabel: tr('Leave'),
      destructive: true,
    });
    if (!ok) return;
    if (await run(() => teamsApi.removeMember(id, idOf(me)), tr('You left the team.'))) navigation.goBack();
  };
  const removeTeam = async () => {
    const ok = await confirm({
      title: tr('Delete {name}?', { name: team?.name }),
      message: tr('The team is gone for everyone. Its tasks stay, without a team.'),
      confirmLabel: tr('Delete team'),
      destructive: true,
    });
    if (!ok) return;
    const fn = admin && !isOwner ? () => platformApi.deleteTeam(id) : () => teamsApi.remove(id);
    if (await run(fn, tr('Team deleted.'))) navigation.goBack();
  };
  const saveEdit = async () => {
    if (form.name.trim().length < 2) {
      setFormError(tr('Give the team a name'));
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

  const openTasks = () => {
    if (admin) navigation.navigate('Main', { screen: 'AllTasks', params: { pile: 'all', team: id, nonce: Date.now() } });
    else navigation.navigate('Main', { screen: 'Tasks', params: { pile: manages ? 'team' : 'mine', team: id, nonce: Date.now() } });
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
        confirm: { title: tr('Hand the team to {name}?', { name: m.person?.name }), message: tr('They become the owner and you become an admin.'), confirmLabel: tr('Make owner') },
        run: () => teamsApi.transfer(id, pid),
        done: tr('{name} now owns the team.', { name: m.person?.name }),
      });
    }
    if (manages && m.role !== 'owner' && (isOwner || m.role !== 'admin' || m.status !== 'active')) {
      out.push({
        key: 'remove',
        icon: UserMinus,
        danger: true,
        label: m.status === 'active' ? tr('Remove from the team') : tr('Cancel the invitation'),
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

  const header = <Header back title={team?.name || tr('Team')} subtitle={myRole ? roleLabel(myRole) : undefined} />;

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
          <EmptyState icon={Users} title={tr('This team is not there')} message={tr('It may have been deleted, or you are no longer in it.')} actionLabel={tr('Go back')} onAction={() => navigation.goBack()} />
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
          <Users size={24} color={colors.primary} />
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
          {tr('{name} invited you to this team.', { name: mine?.invitedBy?.name || team.owner?.name || tr('Someone') })}
        </Notice>
      ) : null}

      {myRole || admin ? <Button title={tr('Team tasks')} icon={LayoutDashboard} variant="soft" onPress={openTasks} style={styles.block} /> : null}
      {manages ? (
        <Button
          title={tr('Invite by Task Pin')}
          icon={UserPlus}
          onPress={() => {
            setInviteRole('member');
            setInviting(true);
          }}
          style={styles.block}
        />
      ) : null}

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
        {myRole && !isOwner ? <ListRow icon={LogOut} title={tr('Leave the team')} danger chevron={false} onPress={leave} /> : null}
        {isOwner || admin ? <ListRow icon={Trash} title={tr('Delete the team')} danger chevron={false} onPress={removeTeam} /> : null}
      </Section>
      {isOwner ? <Text style={styles.ownerNote}>{tr('The owner cannot leave. Hand the team to someone else first.')}</Text> : null}

      <BottomSheet visible={inviting} onClose={() => setInviting(false)} title={tr('Invite by Task Pin')} subtitle={tr('They get an invitation and join once they accept.')}>
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
        <PinLookup
          autoFocus
          actionFor={({ person, relation }) => {
            if (relation === 'self') return null;
            const already = members.find((m) => idOf(m.person) === idOf(person));
            if (already) return { label: already.status === 'active' ? tr('Already in the team') : tr('Already invited'), variant: 'secondary' };
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
      </BottomSheet>

      <BottomSheet visible={editing} onClose={() => setEditing(false)} title={tr('Rename team')} footer={<Button title={tr('Save')} size="lg" onPress={saveEdit} />}>
        <TextField label={tr('Team name')} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} maxLength={80} />
        <TextField label={tr('About the team')} optional value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline maxLength={500} />
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
});
