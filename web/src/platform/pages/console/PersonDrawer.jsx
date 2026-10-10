/**
 * One person, in full, for the Super Admin: who they are, their figures and
 * teams, every device they are signed in on (sign one out, or all of them),
 * their notification settings (the daily summary and default reminders can
 * be changed here), what they did lately, and the account switches: disable,
 * reset the password, delete for good.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy, KeyRound, ListChecks, LogOut, Plus, Send, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { formatDate, formatDateTime, timeAgo } from '../../format';
import { copyText, pinOf } from '../../pin';
import { useTz } from '../../session';
import { Badge, Button, Drawer, ErrorState, Input, Select, Skeleton, Switch, useConfirm, usePrompt } from '../../ui';
import {
  ActivityRow, deviceLine, MiniStat, OnlineDot, PersonAvatar, PlatformIcon, PUSH_TEXT, ROLE_LABEL, ROLE_TONE, SectionTitle,
  seenText, StatusBadge, tempPassword, useRelease, VersionTag,
} from './shared';
import { ActivityDetail } from './Activity';

const LANGS = { en: 'English', hi: 'Hindi', kn: 'Kannada', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam' };
const UNITS = { MINUTES: ['minute', 'minutes'], HOURS: ['hour', 'hours'], DAYS: ['day', 'days'] };
const PATTERNS = { HOURLY: 'Every hour', DAILY: 'Every day', WEEKLY: 'Every week', MONTHLY: 'Every month' };

/** "1 day before", "2 hours after", "Every day at 09:00". */
export function reminderText(r) {
  if (!r) return '';
  if (r.when === 'EVERY') return `${PATTERNS[r.pattern] || 'Repeats'}${r.at ? ` at ${r.at}` : ''}`;
  const [one, many] = UNITS[r.unit] || UNITS.DAYS;
  return `${r.amount} ${r.amount === 1 ? one : many} ${r.when === 'AFTER' ? 'after' : 'before'} it is due`;
}

const sameRules = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

function NotificationSettings({ id, n, onSaved }) {
  const [digest, setDigest] = useState(n.dailyDigest);
  const [at, setAt] = useState(n.dailyDigestAt);
  const [rules, setRules] = useState(n.defaultReminders || []);
  const [draft, setDraft] = useState({ amount: '1', unit: 'DAYS', when: 'BEFORE' });
  // Follow the server only when its values really change (a refetch brings new arrays every time).
  const serverRules = JSON.stringify(n.defaultReminders || []);
  useEffect(() => {
    setDigest(n.dailyDigest);
    setAt(n.dailyDigestAt);
    setRules(JSON.parse(serverRules));
  }, [n.dailyDigest, n.dailyDigestAt, serverRules]);

  const dirty = digest !== n.dailyDigest || at !== n.dailyDigestAt || !sameRules(rules, n.defaultReminders);
  const save = useMutation({
    mutationFn: () => api.patch(`/api/platform/users/${id}/settings`, { dailyDigest: digest, dailyDigestAt: at, defaultReminders: rules }),
    onSuccess: (res) => {
      onSaved(res.notifications);
      toast.success('Notification settings saved');
    },
    onError: (e) => toast.error(e.message),
  });

  const addRule = () => {
    const amount = Math.round(Number(draft.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000) return toast.error('Use a number from 1 to 1000.');
    if (rules.length >= 5) return toast.error('Five default reminders at most.');
    setRules((list) => [...list, { channel: 'APP', when: draft.when, amount, unit: draft.unit }]);
  };

  return (
    <div className="space-y-4 rounded-xl border border-line p-4">
      <Switch checked={digest} onChange={setDigest} label="Daily summary" description="An evening alert with their open, overdue and in-review tasks." />
      {digest && (
        <Input label="Sent at" type="time" value={at} onChange={(e) => setAt(e.target.value)} className="max-w-[10rem]" />
      )}
      <div>
        <p className="text-[15px] font-medium text-ink">Default reminders</p>
        <p className="mt-0.5 text-sm text-ink-soft">Added to a task they set without reminders of its own.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rules.length === 0 && <span className="text-sm text-ink-faint">None</span>}
          {rules.map((r, i) => (
            <span key={`${i}-${reminderText(r)}`} className="inline-flex items-center gap-1 rounded-full bg-well py-1 pl-3 pr-1 text-[13px] text-ink">
              {reminderText(r)}
              <button
                type="button"
                onClick={() => setRules((list) => list.filter((_, j) => j !== i))}
                className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-slate-200 hover:text-ink"
                aria-label={`Remove ${reminderText(r)}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        {rules.length < 5 && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Input
              label="Remind"
              type="number"
              min={1}
              max={1000}
              value={draft.amount}
              onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
              className="w-20"
            />
            <Select aria-label="Unit" value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} className="w-32">
              <option value="MINUTES">minutes</option>
              <option value="HOURS">hours</option>
              <option value="DAYS">days</option>
            </Select>
            <Select aria-label="Before or after" value={draft.when} onChange={(e) => setDraft((d) => ({ ...d, when: e.target.value }))} className="w-40">
              <option value="BEFORE">before it is due</option>
              <option value="AFTER">after it is due</option>
            </Select>
            <Button variant="secondary" icon={Plus} onClick={addRule}>
              Add
            </Button>
          </div>
        )}
      </div>
      {dirty && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
          <Button
            variant="secondary"
            onClick={() => {
              setDigest(n.dailyDigest);
              setAt(n.dailyDigestAt);
              setRules(n.defaultReminders || []);
            }}
          >
            Undo
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save settings
          </Button>
        </div>
      )}
    </div>
  );
}

export function PersonDrawer({ id, onClose, onSeeActivity }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const tz = useTz();
  const release = useRelease().data;
  const [temp, setTemp] = useState('');
  const [openEntry, setOpenEntry] = useState(null);
  const key = ['platform', 'user', id];
  const { data, error, refetch } = useQuery({ queryKey: key, queryFn: () => api.get(`/api/platform/users/${id}`), refetchInterval: 30_000 });
  const user = data?.user;
  const stats = data?.stats || {};
  const sessions = data?.sessions || [];
  const n = data?.notifications;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['platform'] });
  };

  const toggle = useMutation({
    mutationFn: (status) => api.patch(`/api/platform/users/${id}`, { status }),
    onSuccess: (res, status) => {
      if (res?.user) qc.setQueryData(key, (old) => (old ? { ...old, user: { ...old.user, ...res.user } } : old));
      refresh();
      toast.success(status === 'disabled' ? `${user?.name} is disabled` : `${user?.name} can sign in again`);
    },
    onError: (e) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: (password) => api.post(`/api/platform/users/${id}/password`, { password }).then(() => password),
    onSuccess: (password) => {
      setTemp(password);
      refresh();
      toast.success('Temporary password set');
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeOne = useMutation({
    mutationFn: (sid) => api.post(`/api/platform/sessions/${encodeURIComponent(sid)}/revoke`),
    onSuccess: () => {
      refresh();
      toast.success('Signed out on that device');
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeAll = useMutation({
    mutationFn: () => api.post(`/api/platform/users/${id}/sign-out`),
    onSuccess: (res) => {
      refresh();
      toast.success(res?.signedOut ? `${user?.name} is signed out everywhere` : 'They were not signed in anywhere');
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/platform/users/${id}`, { confirm: 'DELETE' }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: key });
      refresh();
      toast.success(`${user?.name}'s account is deleted`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const disable = async () => {
    const ok = await confirm({
      title: `Disable ${user.name}?`,
      text: "They are signed out on every device and can't sign in until you enable them. Nothing is deleted.",
      confirmLabel: 'Disable',
      tone: 'danger',
    });
    if (ok) toggle.mutate('disabled');
  };

  const resetPassword = async () => {
    const ok = await confirm({
      title: `Reset ${user.name}'s password?`,
      text: 'A temporary password is set and shown to you once. Their current password stops working and they are signed out everywhere.',
      confirmLabel: 'Reset password',
      tone: 'primary',
    });
    if (ok) reset.mutate(tempPassword());
  };

  const signOutDevice = async (s) => {
    const ok = await confirm({
      title: `Sign ${user.name} out on ${deviceLine(s)}?`,
      text: 'That device goes back to the sign-in screen the next time it opens Karo. Their other devices stay signed in.',
      confirmLabel: 'Sign out',
      tone: 'warning',
    });
    if (ok) revokeOne.mutate(s.sid);
  };

  const signOutAll = async () => {
    const ok = await confirm({
      title: `Sign ${user.name} out everywhere?`,
      text: 'Every device they are signed in on goes back to the sign-in screen. Their password and their data stay as they are, and they can sign straight back in.',
      confirmLabel: 'Sign out everywhere',
      tone: 'warning',
    });
    if (ok) revokeAll.mutate();
  };

  const del = async () => {
    const typed = await prompt({
      title: `Delete ${user.name}'s account for good?`,
      text: 'This cannot be undone. Gone at once:',
      details: [
        'Their logins, Task Pin, profile and settings',
        'Their contacts, and their place in every organization (organizations they own pass to an admin or member)',
        'Their devices, alerts and reminders',
        'Tasks nobody else is on, with their files',
        'Work shared with others stays with them, showing "Deleted user"',
      ],
      label: 'Type DELETE to confirm',
      placeholder: 'DELETE',
      rows: 1,
      required: true,
      requiredText: 'Type DELETE to confirm.',
      confirmLabel: 'Delete for good',
      tone: 'danger',
    });
    if (typed === null) return;
    if (typed.trim() !== 'DELETE') {
      toast.error('Nothing was deleted. Type DELETE (in capitals) to confirm.');
      return;
    }
    remove.mutate();
  };

  const subtitle = user && [user.title, pinOf(user)].filter(Boolean).join(' · ');

  return (
    <Drawer open onClose={onClose} title={user?.name || 'Person'} subtitle={subtitle || undefined} wide>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !user ? (
        <div className="space-y-3 pt-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          {/* Who */}
          <div className="flex items-center gap-3">
            <PersonAvatar person={user} size="lg" online={data.online} />
            <div className="min-w-0">
              <p className="font-mono text-lg font-bold tracking-[0.1em] text-ink">{pinOf(user) || '—'}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={user.status} />
                {user.mustChangePassword && <Badge tone="amber">Must choose a new password</Badge>}
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                  <OnlineDot online={data.online} showIdle />
                  {data.online ? 'Online now' : user.lastSeenAt ? `Seen ${timeAgo(user.lastSeenAt, tz)}` : 'Never seen'}
                </span>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ['Email', user.email],
              ['Mobile', user.phoneDisplay || user.phone],
              ['Username', user.username],
              ['Joined', user.createdAt && formatDate(user.createdAt, tz)],
              ['Last sign-in', data.lastLoginAt ? formatDateTime(data.lastLoginAt, tz) : 'Never'],
              ['Contacts', data.contacts ?? 0],
            ]
              .filter(([, v]) => v !== undefined && v !== null && v !== '')
              .map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-ink-soft">{k}</dt>
                  <dd className="truncate font-medium text-ink">{v}</dd>
                </div>
              ))}
          </dl>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Open" value={stats.open} />
            <MiniStat label="Given" value={stats.given} />
            <MiniStat label="Overdue" value={stats.overdue} tone={stats.overdue ? 'text-red-600' : undefined} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" icon={ListChecks} to={`/tasks?scope=all&assignedTo=${user.id}`}>
              Their tasks
            </Button>
            <Button size="sm" variant="secondary" icon={Send} to={`/tasks?scope=all&assign=1&onBehalfOf=${user.id}`}>
              Assign a task on their behalf
            </Button>
          </div>

          <div>
            <SectionTitle>Organizations ({data.teams?.length || 0})</SectionTitle>
            {data.teams?.length ? (
              <div className="divide-y divide-line rounded-xl border border-line">
                {data.teams.map((t) => (
                  <Link key={t.id} to={`/teams/${t.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-well">
                    <span className="truncate text-sm font-medium text-ink">{t.name}</span>
                    <Badge tone={ROLE_TONE[t.role] || 'neutral'}>{ROLE_LABEL[t.role] || t.role}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Not in any organization.</p>
            )}
          </div>

          {/* Devices */}
          <div>
            <SectionTitle
              action={
                sessions.length > 0 && (
                  <Button size="sm" variant="danger-soft" icon={LogOut} loading={revokeAll.isPending} onClick={signOutAll}>
                    Sign out everywhere
                  </Button>
                )
              }
            >
              Sign-in and devices ({sessions.length})
            </SectionTitle>
            {sessions.length ? (
              <div className="divide-y divide-line rounded-xl border border-line">
                {sessions.map((s) => (
                  <div key={s.sid} className="flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-well">
                      <PlatformIcon platform={s.platform} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{deviceLine(s)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                        <VersionTag s={s} latest={release} />
                        <span className="inline-flex items-center gap-1.5">
                          <OnlineDot online={s.online} />
                          {seenText(s, tz)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-faint">
                        {s.legacy ? 'Signed in before devices were tracked' : `Signed in ${s.createdAt ? formatDateTime(s.createdAt, tz) : ''}`}
                        {s.ip ? ` · ${s.ip}` : ''}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" icon={LogOut} loading={revokeOne.isPending && revokeOne.variables === s.sid} onClick={() => signOutDevice(s)}>
                      Sign out
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Not signed in anywhere.</p>
            )}
          </div>

          {/* Notifications */}
          {n && (
            <div>
              <SectionTitle>Notifications</SectionTitle>
              <NotificationSettings id={id} n={n} onSaved={(next) => qc.setQueryData(key, (old) => (old ? { ...old, notifications: next } : old))} />
              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  ['Push on their phone', PUSH_TEXT[n.pushPermission] || 'No phone has said yet'],
                  ['Phones registered for push', n.devices || 'None'],
                  ['Time zone', n.timezone],
                  ['Work day starts', n.workdayStart],
                  ['App language', LANGS[n.lang] || n.lang],
                  ['Checks work before it closes', n.approvalDefault ? 'Yes, by default' : 'No'],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-ink-soft">{k}</dt>
                    <dd className="truncate font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Activity */}
          <div>
            <SectionTitle
              action={
                <Button size="sm" variant="ghost" onClick={() => onSeeActivity?.(user)}>
                  See all
                </Button>
              }
            >
              Recent activity
            </SectionTitle>
            {data.recent?.length ? (
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {data.recent.map((item) => (
                  <ActivityRow key={item.id} item={item} tz={tz} showDate onOpen={() => setOpenEntry(item.id)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Nothing yet.</p>
            )}
          </div>

          {/* The account */}
          <div className="space-y-3 rounded-xl border border-red-200 p-4">
            <h3 className="text-sm font-semibold text-ink">Account</h3>
            {temp && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">Temporary password</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="tnum min-w-0 flex-1 select-all break-all font-mono text-lg font-bold tracking-wider text-ink">{temp}</code>
                  <Button size="sm" variant="secondary" icon={Copy} onClick={() => copyText(temp, 'Password copied')}>
                    Copy
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-amber-800">They must choose a new one when they sign in. It isn't shown again.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={KeyRound} loading={reset.isPending} onClick={resetPassword}>
                Reset password
              </Button>
              {user.status === 'disabled' ? (
                <Button size="sm" variant="soft" icon={UserCheck} loading={toggle.isPending} onClick={() => toggle.mutate('active')}>
                  Enable
                </Button>
              ) : (
                <Button size="sm" variant="danger-soft" icon={UserX} loading={toggle.isPending} onClick={disable}>
                  Disable
                </Button>
              )}
              <Button size="sm" variant="danger" icon={Trash2} loading={remove.isPending} onClick={del}>
                Delete permanently
              </Button>
            </div>
          </div>
        </div>
      )}
      {openEntry && <ActivityDetail id={openEntry} onClose={() => setOpenEntry(null)} />}
    </Drawer>
  );
}
