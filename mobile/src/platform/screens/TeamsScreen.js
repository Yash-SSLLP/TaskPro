/**
 * Teams: invitations to me (accept or decline), my teams (my role, how many
 * members) and "New team". Members of a team can give each other tasks; its
 * owner and admins see the team's tasks.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { teamsApi, platformKeys } from '../endpoints';
import { relativeTime } from '../format';
import { usePullRefresh, useRefetchOnFocus, useTeams } from '../hooks';
import { Plus, Users, X } from '../icons';
import { roleLabel, roleTone } from '../pin';
import { colors, space, type } from '../theme';
import { Badge, BottomSheet, Button, EmptyState, ErrorState, Header, IconButton, ListRow, Notice, Screen, Section, SkeletonList, TextField, confirm, toast } from '../ui';

export default function TeamsScreen({ navigation }) {
  const qc = useQueryClient();
  const q = useTeams();
  const { refreshing, onRefresh } = usePullRefresh(q.refetch);
  useRefetchOnFocus(q.refetch);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState(null);

  const teams = q.data?.teams || [];
  const invites = q.data?.invites || [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: platformKeys.teams });
    qc.invalidateQueries({ queryKey: ['taskMeta'] });
  };

  const accept = async (inv) => {
    try {
      await teamsApi.accept(inv.team.id);
      toast.success(tr('You joined {name}.', { name: inv.team.name }));
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const decline = async (inv) => {
    const ok = await confirm({ title: tr('Decline the invitation to {name}?', { name: inv.team.name }), confirmLabel: tr('Decline'), destructive: true });
    if (!ok) return;
    try {
      await teamsApi.decline(inv.team.id);
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const create = async () => {
    if (form.name.trim().length < 2) {
      setError(tr('Give the team a name'));
      return;
    }
    setError(null);
    try {
      const team = await teamsApi.create({ name: form.name.trim(), description: form.description.trim() });
      setCreating(false);
      setForm({ name: '', description: '' });
      refresh();
      toast.success(tr('Team created. Invite people by their Task Pin.'));
      if (team?.id) navigation.navigate('TeamDetail', { id: team.id });
    } catch (e) {
      setError(e.message);
    }
  };

  let body = null;
  if (q.isPending) body = <SkeletonList rows={4} avatar />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={q.refetch} />;
  else
    body = (
      <>
        {invites.length ? (
          <Section title={tr('Invitations')}>
            {invites.map((inv) => (
              <ListRow
                key={inv.team.id}
                icon={Users}
                iconColor={colors.primary}
                title={inv.team.name}
                subtitle={tr('From {name} · {when}', { name: inv.invitedBy?.name || '—', when: relativeTime(inv.at) })}
                onPress={() => navigation.navigate('TeamDetail', { id: inv.team.id })}
                chevron={false}
                right={
                  <View style={styles.actions}>
                    <IconButton icon={X} label={tr('Decline')} color={colors.danger} onPress={() => decline(inv)} />
                    <Button title={tr('Join')} size="sm" full={false} onPress={() => accept(inv)} />
                  </View>
                }
              />
            ))}
          </Section>
        ) : null}

        {teams.length ? <Button title={tr('New team')} icon={Plus} variant="soft" onPress={() => setCreating(true)} style={styles.newTeam} /> : null}
        {teams.length ? (
          <Section title={tr('My teams')}>
            {teams.map((t) => (
              <ListRow
                key={t.id}
                icon={Users}
                title={t.name}
                subtitle={t.memberCount === 1 ? tr('1 member') : tr('{n} members', { n: t.memberCount || 0 })}
                right={t.myRole ? <Badge label={roleLabel(t.myRole)} tone={roleTone(t.myRole)} style={styles.badge} /> : null}
                onPress={() => navigation.navigate('TeamDetail', { id: t.id })}
              />
            ))}
          </Section>
        ) : (
          <EmptyState
            icon={Users}
            title={tr('No teams yet')}
            message={tr('Create a team for the people you work with. Everyone in it can give each other tasks.')}
            actionLabel={tr('New team')}
            actionIcon={Plus}
            onAction={() => setCreating(true)}
          />
        )}
      </>
    );

  return (
    <Screen header={<Header back title={tr('Teams')} />} scroll refreshing={refreshing} onRefresh={onRefresh} contentStyle={styles.content}>
      {body}
      <Text style={styles.note}>{tr('Owners and admins invite people and see the team’s tasks. Members give each other tasks.')}</Text>
      <BottomSheet
        visible={creating}
        onClose={() => setCreating(false)}
        title={tr('New team')}
        footer={<Button title={tr('Create team')} size="lg" onPress={create} />}
      >
        <TextField label={tr('Team name')} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder={tr('e.g. Sales, Shop floor, Family')} autoFocus maxLength={80} />
        <TextField label={tr('About the team')} optional value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline maxLength={500} />
        <Notice tone="danger">{error}</Notice>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space(10) },
  newTeam: { marginBottom: space(5) },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  badge: { alignSelf: 'center' },
  note: { ...type.caption, textAlign: 'center', marginTop: space(2) },
});
