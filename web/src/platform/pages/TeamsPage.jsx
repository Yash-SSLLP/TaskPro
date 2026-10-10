/**
 * Organizations (teams in the code and the API): the ones I'm in, invites
 * waiting for me, and one organization's page (members, invites by Task Pin or
 * from my connections, roles, leaving, transferring and deleting).
 *
 * Roles: the owner does everything; admins invite members, remove people
 * (never the owner) and see the organization's tasks; members just belong.
 * The Super Admin can look at any organization and delete it.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft, Check, ChevronRight, Crown, ListChecks, LogOut, Mail, MoreVertical, Pencil, Plus, Search, Shield, Trash2, UserMinus,
  UserPlus, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, qs } from '../api';
import { formatDate, timeAgo } from '../format';
import { isSuperAdmin, useSession, useTz } from '../session';
import {
  Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, PersonLine, PinLookup, Segmented, Select, Skeleton,
  Textarea, finePointer, useConfirm,
} from '../ui';

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const ROLE_TONE = { owner: 'brand', admin: 'blue', member: 'neutral' };
const ROLE_ORDER = { owner: 0, admin: 1, member: 2 };

export function RoleBadge({ role }) {
  if (!role) return null;
  return (
    <Badge tone={ROLE_TONE[role] || 'neutral'}>
      {role === 'owner' && <Crown className="h-3 w-3" aria-hidden />}
      {role === 'admin' && <Shield className="h-3 w-3" aria-hidden />}
      {ROLE_LABEL[role] || role}
    </Badge>
  );
}

function useTeamRefresh() {
  const qc = useQueryClient();
  return (id) => {
    qc.invalidateQueries({ queryKey: ['teams'] });
    if (id) qc.invalidateQueries({ queryKey: ['team', id] });
    qc.invalidateQueries({ queryKey: ['tasks', 'meta'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['platform'] });
  };
}

/** Name + description form, for a new organization and for editing one. */
function TeamFormModal({ open, onClose, title, initial, submitLabel, onSubmit }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(initial?.name || '');
      setDescription(initial?.description || '');
    }
  }, [open, initial?.name, initial?.description]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!name.trim()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="Organization name" placeholder="e.g. Sharma Traders, Site B crew" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus={finePointer()} />
        <Textarea label="Description" optional rows={3} placeholder="What this organization works on" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ list

function Invites({ invites, tz }) {
  const navigate = useNavigate();
  const refresh = useTeamRefresh();
  const [busy, setBusy] = useState(null);

  const answer = async (inv, kind) => {
    setBusy(`${kind}:${inv.team.id}`);
    try {
      await api.post(`/api/teams/${inv.team.id}/${kind}`);
      refresh(inv.team.id);
      if (kind === 'accept') {
        toast.success(`You joined ${inv.team.name}`);
        navigate(`/teams/${inv.team.id}`);
      } else toast.success('Invite declined');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (!invites.length) return null;
  return (
    <Card className="overflow-hidden border-amber-200">
      <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/70 px-4 py-3">
        <Mail className="h-4 w-4 text-amber-700" aria-hidden />
        <h2 className="text-sm font-semibold text-amber-900">
          {invites.length === 1 ? 'You have an organization invite' : `You have ${invites.length} organization invites`}
        </h2>
      </div>
      <div className="divide-y divide-line">
        {invites.map((inv) => (
          <div key={inv.team.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{inv.team.name}</p>
              <p className="truncate text-sm text-ink-soft">
                Invited by {inv.invitedBy?.name || 'someone'}
                {inv.at ? ` · ${timeAgo(inv.at, tz)}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" icon={Check} loading={busy === `accept:${inv.team.id}`} onClick={() => answer(inv, 'accept')}>
                Accept
              </Button>
              <Button size="sm" variant="secondary" icon={X} loading={busy === `decline:${inv.team.id}`} onClick={() => answer(inv, 'decline')}>
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TeamCard({ team }) {
  return (
    <Link
      to={`/teams/${team.id}`}
      className="group flex flex-col rounded-2xl border border-line bg-card p-5 shadow-card transition-colors hover:border-brand/40"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Users className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink group-hover:text-brand">{team.name}</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {team.memberCount ?? 0} member{team.memberCount === 1 ? '' : 's'}
            {team.owner?.name ? ` · Owner ${team.owner.name}` : ''}
          </p>
        </div>
        <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-ink-faint group-hover:text-brand" aria-hidden />
      </div>
      {team.description && <p className="mt-3 line-clamp-2 text-sm text-ink-soft">{team.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <RoleBadge role={team.myRole} />
      </div>
    </Link>
  );
}

export function TeamsPage() {
  const navigate = useNavigate();
  const tz = useTz();
  const qc = useQueryClient();
  const refresh = useTeamRefresh();
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ['teams'], queryFn: () => api.get('/api/teams') });
  const teams = query.data?.teams || [];
  const invites = query.data?.invites || [];

  const create = async (body) => {
    const data = await api.post('/api/teams', body);
    qc.setQueryData(['team', data.team.id], data);
    refresh(data.team.id);
    toast.success('Organization created. Invite people by their Task Pin or from your connections.');
    setCreating(false);
    navigate(`/teams/${data.team.id}`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Organizations"
        subtitle="Groups of people who give each other tasks"
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            New organization
          </Button>
        }
      />

      <Invites invites={invites} tz={tz} />

      {query.error && (
        <Card>
          <ErrorState error={query.error} onRetry={query.refetch} />
        </Card>
      )}
      {query.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="space-y-3 p-5">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </Card>
          ))}
        </div>
      )}
      {query.data && teams.length === 0 && (
        <Card>
          <EmptyState
            icon={Users}
            title="No organizations yet"
            text="Create one for your shop, office or project, then invite people by their Task Pin or from your contacts. Its members can give each other tasks."
            action={
              <Button icon={Plus} onClick={() => setCreating(true)}>
                Create organization
              </Button>
            }
          />
        </Card>
      )}
      {teams.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((t) => (
            <TeamCard key={t.id} team={t} />
          ))}
        </div>
      )}

      <TeamFormModal open={creating} onClose={() => setCreating(false)} title="New organization" submitLabel="Create organization" onSubmit={create} />
    </div>
  );
}

// ---------------------------------------------------------------- detail

/** A small "⋮" menu of actions for one member. */
function RowMenu({ items, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-slate-100 hover:text-ink"
      >
        <MoreVertical className="h-5 w-5" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-pop">
          {items.map(({ label: text, icon: Icon, onClick, danger }) => (
            <button
              key={text}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onClick();
              }}
              className={clsx(
                'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium',
                danger ? 'text-red-700 hover:bg-red-50' : 'text-ink hover:bg-slate-50'
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function memberSub(m, tz) {
  if (m.status === 'invited') {
    const by = m.invitedBy?.name ? `invited by ${m.invitedBy.name}` : 'invited';
    return m.invitedAt ? `${by} ${timeAgo(m.invitedAt, tz)}` : by;
  }
  return m.joinedAt ? `joined ${formatDate(m.joinedAt, tz)}` : undefined;
}

/** The owner invites as a member or as an admin; an admin invites members. */
function RoleSelect({ value, onChange }) {
  return (
    <Select className="w-40" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Role">
      <option value="member">As member</option>
      <option value="admin">As admin</option>
    </Select>
  );
}

function InviteByPin({ team, isOwner, onInvited }) {
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const members = team.members || [];

  const invite = async (pin, reset) => {
    setBusy(true);
    try {
      const data = await api.post(`/api/teams/${team.id}/members`, { pin, role: isOwner ? role : 'member' });
      onInvited(data);
      toast.success('Invite sent');
      setRole('member');
      reset();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PinLookup
      className="mt-4"
      label="Their Task Pin"
      action={({ person, relation, pin, reset }) => {
        if (relation === 'self') return <p className="text-sm text-ink-soft">That's you.</p>;
        const already = members.find((m) => m.person?.id === person.id);
        if (already)
          return (
            <p className="text-sm text-ink-soft">
              {already.status === 'invited' ? `${person.name} is already invited.` : `${person.name} is already in this organization.`}
            </p>
          );
        return (
          <div className="flex w-full flex-wrap items-end gap-2">
            {isOwner && <RoleSelect value={role} onChange={setRole} />}
            <Button icon={UserPlus} loading={busy} onClick={() => invite(pin, reset)}>
              Invite
            </Button>
          </div>
        );
      }}
    />
  );
}

const SKIPPED_WHY = { already: 'already in or invited', 'not-connected': 'not connected to you' };

/**
 * Pick people I am already connected with (GET /:id/candidates: my contacts
 * and the people I share another organization with) and invite them in one go
 * (POST /:id/members { userIds, role }). People already in are not offered;
 * those already invited show as Invited.
 */
function InviteFromConnections({ team, isOwner, onInvited }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const query = useQuery({
    queryKey: ['team', team.id, 'candidates', q],
    queryFn: () => api.get(`/api/teams/${team.id}/candidates${qs({ q })}`),
    placeholderData: (prev) => prev,
  });
  const people = (query.data?.people || []).filter((p) => p.membership !== 'active');
  const toggle = (id) => setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const invite = async () => {
    setBusy(true);
    try {
      const data = await api.post(`/api/teams/${team.id}/members`, { userIds: picked, role: isOwner ? role : 'member' });
      onInvited(data);
      const invited = data.invited || [];
      const skipped = data.skipped || [];
      const sent = invited.length === 1 ? `Invite sent to ${invited[0].name}` : `${invited.length} invites sent`;
      const why = [...new Set(skipped.map((s) => SKIPPED_WHY[s.reason] || s.reason))].join(', ');
      const left = skipped.length ? `${skipped.length} skipped (${why})` : '';
      if (invited.length) toast.success(left ? `${sent}. ${left}.` : sent);
      else toast.error(`No invites sent. ${left}.`);
      setPicked([]);
      setRole('member');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 transition focus-within:border-slate-300">
        <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search a name or Task Pin…"
          aria-label="Search your connections"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </label>
      <div className={clsx('max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line', query.isFetching && query.isPlaceholderData && 'opacity-60')}>
        {query.error ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : query.isLoading ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))
        ) : people.length === 0 ? (
          <p className="px-3 py-3 text-sm text-ink-soft">{q ? 'Nobody matches that.' : 'No one to add yet. Your contacts, and the people in your other organizations, show here.'}</p>
        ) : (
          people.map((p) => {
            const invited = p.membership === 'invited';
            return (
              <label key={p.id} className={clsx('flex items-center gap-3 px-3 py-2.5', invited ? 'opacity-70' : 'cursor-pointer hover:bg-well')}>
                <input
                  type="checkbox"
                  checked={invited || picked.includes(p.id)}
                  disabled={invited}
                  onChange={() => toggle(p.id)}
                  aria-label={p.name}
                  className="h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
                />
                <div className="min-w-0 flex-1">
                  <PersonLine person={p} size="sm" right={invited ? <Badge tone="amber">Invited</Badge> : p.contact ? <Badge>Contact</Badge> : null} />
                </div>
              </label>
            );
          })
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isOwner && <RoleSelect value={role} onChange={setRole} />}
        <Button icon={UserPlus} loading={busy} disabled={!picked.length} onClick={invite}>
          {picked.length ? `Invite ${picked.length}` : 'Invite'}
        </Button>
        {picked.length > 0 && (
          <button type="button" onClick={() => setPicked([])} className="px-1 text-sm font-medium text-ink-soft hover:text-ink">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

const INVITE_MODES = [
  { value: 'pin', label: 'By Task Pin' },
  { value: 'connections', label: 'From your connections' },
];

/** Invite people: by their Task Pin, or picked from the people I am connected with. They join once they accept. */
function InvitePanel({ team, isOwner, onInvited }) {
  const [mode, setMode] = useState('pin');
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <UserPlus className="h-4 w-4 text-brand" aria-hidden /> Invite people
        </h2>
        <Segmented className="max-w-full overflow-x-auto" value={mode} onChange={setMode} options={INVITE_MODES} />
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {mode === 'pin'
          ? "They get an invite to accept. They don't need to be your contact."
          : 'Your contacts, and people you share another organization with. They get an invite to accept.'}
      </p>
      {mode === 'pin' ? <InviteByPin team={team} isOwner={isOwner} onInvited={onInvited} /> : <InviteFromConnections team={team} isOwner={isOwner} onInvited={onInvited} />}
    </Card>
  );
}

export function TeamDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const tz = useTz();
  const me = useSession((s) => s.user);
  const superAdmin = isSuperAdmin(me);
  const refresh = useTeamRefresh();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null);

  const query = useQuery({ queryKey: ['team', id], queryFn: () => api.get(`/api/teams/${id}`) });
  const team = query.data?.team;
  const members = [...(team?.members || [])].sort(
    (a, b) =>
      (a.status === 'invited') - (b.status === 'invited') ||
      (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
      String(a.person?.name || '').localeCompare(String(b.person?.name || ''))
  );
  const mine = members.find((m) => m.person?.id === me?.id);
  const invitedMe = mine?.status === 'invited';
  const active = mine?.status === 'active';
  const myRole = active ? team?.myRole || mine?.role : null;
  const isOwner = myRole === 'owner';
  const canManage = isOwner || myRole === 'admin';
  const activeCount = members.filter((m) => m.status === 'active').length;
  const invitedCount = members.length - activeCount;
  const backTo = superAdmin ? '/console?tab=teams' : '/teams';

  const setTeam = (data) => {
    if (data?.team) qc.setQueryData(['team', id], data);
    refresh(id);
  };

  const run = async (key, fn, done) => {
    setBusy(key);
    try {
      const data = await fn();
      if (data?.team) setTeam(data);
      else refresh(id);
      if (done) toast.success(done);
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const changeRole = (m, role) =>
    run(`role:${m.person.id}`, () => api.patch(`/api/teams/${id}/members/${m.person.id}`, { role }), `${m.person.name} is now ${role === 'admin' ? 'an admin' : 'a member'}`);

  const removeMember = async (m) => {
    const invited = m.status === 'invited';
    const ok = await confirm({
      title: invited ? `Cancel ${m.person.name}'s invite?` : `Remove ${m.person.name} from ${team.name}?`,
      text: invited
        ? 'The invite disappears for them.'
        : "Their tasks stay as they are. They can't be given tasks through this organization unless they're invited again.",
      confirmLabel: invited ? 'Cancel invite' : 'Remove',
      cancelLabel: invited ? 'Keep invite' : undefined,
      tone: 'danger',
    });
    if (ok) run(`remove:${m.person.id}`, () => api.del(`/api/teams/${id}/members/${m.person.id}`), invited ? 'Invite cancelled' : `${m.person.name} removed`);
  };

  const makeOwner = async (m) => {
    const ok = await confirm({
      title: `Make ${m.person.name} the owner?`,
      text: `${m.person.name} becomes the owner of ${team.name}. You become an admin.`,
      confirmLabel: 'Make owner',
      tone: 'primary',
    });
    if (ok) run(`owner:${m.person.id}`, () => api.post(`/api/teams/${id}/transfer`, { userId: m.person.id }), `${m.person.name} is now the owner`);
  };

  const leave = async () => {
    const ok = await confirm({
      title: `Leave ${team.name}?`,
      text: 'Your tasks stay as they are. To come back, someone has to invite you again.',
      confirmLabel: 'Leave organization',
      tone: 'danger',
    });
    if (!ok) return;
    if (await run('leave', () => api.del(`/api/teams/${id}/members/${me.id}`), `You left ${team.name}`)) {
      qc.removeQueries({ queryKey: ['team', id] });
      navigate('/teams');
    }
  };

  const deleteTeam = async () => {
    const ok = await confirm({
      title: `Delete ${team.name}?`,
      text: 'Its tasks stay, just no longer filed under an organization. Everyone is removed from it. This cannot be undone.',
      confirmLabel: 'Delete organization',
      tone: 'danger',
    });
    if (!ok) return;
    if (await run('delete', () => api.del(`/api/teams/${id}`), 'Organization deleted')) {
      qc.removeQueries({ queryKey: ['team', id] });
      navigate(backTo);
    }
  };

  const answerInvite = async (kind) => {
    if (kind === 'accept') {
      await run('accept', () => api.post(`/api/teams/${id}/accept`), `You joined ${team.name}`);
    } else if (await run('decline', () => api.post(`/api/teams/${id}/decline`), 'Invite declined')) {
      qc.removeQueries({ queryKey: ['team', id] });
      navigate('/teams');
    }
  };

  const save = async (body) => {
    const data = await api.patch(`/api/teams/${id}`, body);
    setTeam(data);
    toast.success('Organization saved');
    setEditing(false);
  };

  const back = (
    <Link to={backTo} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-brand">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {superAdmin ? 'Console' : 'Organizations'}
    </Link>
  );

  if (query.error) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Organization" back={back} />
        <Card>
          {query.error.status === 404 || query.error.status === 403 ? (
            <EmptyState icon={Users} title="Organization not found" text="It may have been deleted, or you're no longer in it." action={<Button to={backTo}>Back</Button>} />
          ) : (
            <ErrorState error={query.error} onRetry={query.refetch} />
          )}
        </Card>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-1/2" />
        <Card className="space-y-4 p-5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  const memberMenu = (m) => {
    if (superAdmin && !active) return [];
    if (m.person?.id === me?.id || m.role === 'owner') return [];
    const items = [];
    const isActive = m.status === 'active';
    if (isOwner && isActive) {
      if (m.role === 'member') items.push({ label: 'Make admin', icon: Shield, onClick: () => changeRole(m, 'admin') });
      if (m.role === 'admin') items.push({ label: 'Make member', icon: Users, onClick: () => changeRole(m, 'member') });
      items.push({ label: 'Make owner', icon: Crown, onClick: () => makeOwner(m) });
    }
    if (canManage) {
      items.push(
        isActive
          ? { label: 'Remove from organization', icon: UserMinus, onClick: () => removeMember(m), danger: true }
          : { label: 'Cancel invite', icon: X, onClick: () => removeMember(m), danger: true }
      );
    }
    return items;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        back={back}
        title={team.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              {activeCount} member{activeCount === 1 ? '' : 's'}
              {invitedCount > 0 ? ` · ${invitedCount} invited` : ''}
            </span>
            {myRole && <RoleBadge role={myRole} />}
            {superAdmin && !active && <Badge tone="amber">Viewing as Super Admin</Badge>}
          </span>
        }
        actions={
          <>
            {(canManage || superAdmin) && (
              <Button variant="soft" icon={ListChecks} to={`/tasks?scope=${superAdmin ? 'all' : 'team'}&org=${team.id}`}>
                Organization tasks
              </Button>
            )}
            {canManage && (
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </>
        }
      />

      {team.description && <p className="-mt-2 whitespace-pre-line text-[15px] text-ink-soft">{team.description}</p>}

      {invitedMe && (
        <Card className="border-amber-200 bg-amber-50/60 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-amber-900">You're invited to join {team.name}</p>
              <p className="mt-0.5 text-sm text-amber-800">
                {mine.invitedBy?.name ? `${mine.invitedBy.name} invited you` : 'You were invited'}
                {mine.role === 'admin' ? ' as an admin' : ''}. Its members can give each other tasks.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button icon={Check} loading={busy === 'accept'} onClick={() => answerInvite('accept')}>
                Accept
              </Button>
              <Button variant="secondary" icon={X} loading={busy === 'decline'} onClick={() => answerInvite('decline')}>
                Decline
              </Button>
            </div>
          </div>
        </Card>
      )}

      {canManage && <InvitePanel team={team} isOwner={isOwner} onInvited={setTeam} />}

      <div>
        <h2 className="mb-3 text-base font-semibold text-ink">Members</h2>
        <Card className="divide-y divide-line">
          {members.length === 0 && <p className="p-5 text-[15px] text-ink-soft">No one is in this organization yet.</p>}
          {members.map((m) => {
            const isMe = m.person?.id === me?.id;
            const rowBusy = busy && busy.endsWith(`:${m.person?.id}`);
            return (
              <div key={m.person?.id} className={clsx('flex items-center gap-2 p-4', rowBusy && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <PersonLine
                    person={m.person}
                    you={isMe}
                    sub={memberSub(m, tz)}
                    right={
                      <div className="hidden shrink-0 flex-wrap justify-end gap-1.5 sm:flex">
                        {m.status === 'invited' && <Badge tone="amber">Invited</Badge>}
                        <RoleBadge role={m.role} />
                      </div>
                    }
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-[52px] sm:hidden">
                    {m.status === 'invited' && <Badge tone="amber">Invited</Badge>}
                    <RoleBadge role={m.role} />
                  </div>
                </div>
                <RowMenu label={`Actions for ${m.person?.name}`} items={memberMenu(m)} />
              </div>
            );
          })}
        </Card>
      </div>

      {(active || superAdmin) && (
        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink">{isOwner || superAdmin ? 'Delete organization' : 'Leave organization'}</h2>
          {isOwner || superAdmin ? (
            <>
              <p className="mt-0.5 text-sm text-ink-soft">
                Its tasks stay, just no longer filed under an organization.
                {isOwner && ' To leave instead, make someone else the owner first.'}
              </p>
              <Button className="mt-4" variant="danger-soft" icon={Trash2} loading={busy === 'delete'} onClick={deleteTeam}>
                Delete organization
              </Button>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-sm text-ink-soft">Your tasks stay as they are.</p>
              <Button className="mt-4" variant="danger-soft" icon={LogOut} loading={busy === 'leave'} onClick={leave}>
                Leave organization
              </Button>
            </>
          )}
        </Card>
      )}

      <TeamFormModal open={editing} onClose={() => setEditing(false)} title="Edit organization" initial={team} submitLabel="Save" onSubmit={save} />
    </div>
  );
}
