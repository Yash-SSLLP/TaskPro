/**
 * Settings: my profile, my Task Pin, my password, and my preferences (time
 * zone, work day, approvals, default reminders, daily summary, language).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LogOut, Monitor, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';
import { isSuperAdmin, useSession, useSettings } from '../session';
import { signOutEverywhere } from '../signOut';
import { Button, Card, Input, PageHeader, PasswordInput, PinCard, Select, Skeleton, Switch } from '../ui';
import { ReminderEditor } from '../../product/components/Reminders';
import { AndroidAppDetails } from './mobileApp';
import { setThemeMode, useTheme } from '../theme';

export function Section({ title, description, children }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function ProfileSection() {
  const { user, updateUser } = useSession();
  const [form, setForm] = useState({ name: user.name || '', title: user.title || '', email: user.email || '', phone: user.phoneDisplay || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: form.name.trim(), title: form.title.trim() };
      if (form.email.trim() !== (user.email || '')) body.email = form.email.trim();
      if (form.phone.trim() !== (user.phoneDisplay || '')) body.phone = form.phone.trim();
      const data = await api.patch('/api/auth/profile', body);
      updateUser(data.user);
      setForm({ name: data.user.name || '', title: data.user.title || '', email: data.user.email || '', phone: data.user.phoneDisplay || '' });
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="My profile" description="How people see you, and how you sign in.">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" autoComplete="name" value={form.name} onChange={set('name')} />
        <Input label="Job title" optional placeholder="e.g. Accounts" value={form.title} onChange={set('title')} />
        <Input label="Email" optional type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        <Input label="Mobile number" optional type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        {user.username && <Input label="Username" value={user.username} disabled hint="You can also sign in with this." />}
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} disabled={!form.name.trim()}>
            Save profile
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const setSession = useSession((s) => s.setSession);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next });
      setSession({ token: data.token, user: data.user });
      setCurrent('');
      setNext('');
      toast.success('Password changed. Other devices were signed out.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Password">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <PasswordInput label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordInput label="New password" autoComplete="new-password" hint="At least 8 characters." value={next} onChange={(e) => setNext(e.target.value)} />
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" loading={busy} disabled={!current || !next}>
            Change password
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ------------------------------------------------------------ preferences

const COMMON_ZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Colombo', 'Asia/Riyadh',
  'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC',
];

function timeZones(current) {
  let all = [];
  try {
    all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch {
    all = [];
  }
  const list = all.length ? [...all] : [...COMMON_ZONES];
  if (!list.includes('UTC')) list.push('UTC');
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'kn', label: 'ಕನ್ನಡ' },
  { value: 'ta', label: 'தமிழ்' },
  { value: 'te', label: 'తెలుగు' },
  { value: 'ml', label: 'മലയാളം' },
];

const PREF_KEYS = ['timezone', 'workdayStart', 'approvalDefault', 'defaultReminders', 'dailyDigest', 'dailyDigestAt', 'lang'];

const pick = (s) => Object.fromEntries(PREF_KEYS.map((k) => [k, s[k]]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function PreferencesSection() {
  const qc = useQueryClient();
  const updateSettings = useSession((s) => s.updateSettings);
  const stored = useSettings();
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/api/me/settings') });
  const server = useMemo(() => pick({ ...stored, ...(query.data?.settings || {}) }), [stored, query.data]);
  const [form, setForm] = useState(server);
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(false);

  // Take the server's copy when it arrives, unless the person already started editing.
  useEffect(() => {
    if (query.data?.settings && !dirtyRef.current) setForm(pick({ ...stored, ...query.data.settings }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const set = (k, v) => {
    dirtyRef.current = true;
    setForm((f) => ({ ...f, [k]: v }));
  };
  const zones = useMemo(() => timeZones(form.timezone), [form.timezone]);
  const changed = PREF_KEYS.filter((k) => !same(form[k], server[k]));

  const save = async () => {
    if (!changed.length) return;
    setBusy(true);
    try {
      const body = Object.fromEntries(changed.map((k) => [k, form[k]]));
      const data = await api.patch('/api/me/settings', body);
      updateSettings(data.settings);
      qc.setQueryData(['settings'], data);
      qc.invalidateQueries({ queryKey: ['tasks', 'meta'] });
      dirtyRef.current = false;
      setForm(pick({ ...stored, ...data.settings }));
      toast.success('Preferences saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Preferences" description="How Task Pro works for you. Others don't see these.">
      {query.isLoading && !query.data ? (
        <div className="space-y-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Time zone" hint="Due dates, reminders and your daily summary use it." value={form.timezone || ''} onChange={(e) => set('timezone', e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
            <Input
              label="Work day starts at"
              type="time"
              value={form.workdayStart || ''}
              onChange={(e) => set('workdayStart', e.target.value)}
            />
          </div>

          <div className="border-t border-line pt-5">
            <Switch
              checked={!!form.approvalDefault}
              onChange={(v) => set('approvalDefault', v)}
              label="I'll check it before it's done"
              description="New tasks you give others ask you to approve them before they count as done"
            />
          </div>

          <div className="border-t border-line pt-5">
            <p className="text-[15px] font-medium text-ink">Default reminders</p>
            <p className="mb-3 mt-0.5 text-sm text-ink-soft">Added to every new task you create without reminders of its own.</p>
            <ReminderEditor
              value={form.defaultReminders || []}
              onChange={(list) => set('defaultReminders', list)}
              emptyText="No default reminders — new tasks have none unless you add them."
            />
          </div>

          <div className="space-y-4 border-t border-line pt-5">
            <Switch
              checked={!!form.dailyDigest}
              onChange={(v) => set('dailyDigest', v)}
              label="Daily summary"
              description="One alert a day with what's due and what's late."
            />
            {form.dailyDigest && (
              <Input className="max-w-[200px]" label="Send it at" type="time" value={form.dailyDigestAt || ''} onChange={(e) => set('dailyDigestAt', e.target.value)} />
            )}
          </div>

          <div className="border-t border-line pt-5">
            <Select className="max-w-xs" label="Language" hint="The mobile app uses this." value={form.lang || 'en'} onChange={(e) => set('lang', e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button onClick={save} loading={busy} disabled={!changed.length}>
              Save preferences
            </Button>
            {changed.length > 0 && (
              <button
                type="button"
                className="text-sm font-medium text-ink-soft hover:text-ink"
                onClick={() => {
                  dirtyRef.current = false;
                  setForm(server);
                }}
              >
                Undo changes
              </button>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** Light / dark, kept on this device. */
function AppearanceSection() {
  const mode = useTheme((s) => s.mode);
  return (
    <Section title="Appearance" description="How Task Pro looks on this device. System follows your computer or phone.">
      <div className="inline-flex rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Appearance">
        {THEME_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={mode === o.value}
            onClick={() => setThemeMode(o.value)}
            className={
              'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ' +
              (mode === o.value ? 'bg-card text-ink shadow-sm' : 'text-ink-soft hover:text-ink')
            }
          >
            <o.icon className="h-4 w-4" aria-hidden />
            {o.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

export function SettingsPage() {
  const user = useSession((s) => s.user);
  const navigate = useNavigate();
  const superAdmin = isSuperAdmin(user);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" />
      <ProfileSection />
      {!superAdmin && <PinCard person={user} compact />}
      <PasswordSection />
      <PreferencesSection />
      <AppearanceSection />
      <Section title="Android app" description="Task Pro on your phone, with reminders and alerts.">
        <AndroidAppDetails />
      </Section>
      <Section title="Privacy and your account" description="How we handle your information, and how to leave.">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" icon={ShieldCheck} to="/privacy">
            Privacy policy
          </Button>
          {!superAdmin && (
            <Button variant="danger-soft" icon={Trash2} to="/delete-account">
              Delete account
            </Button>
          )}
        </div>
      </Section>
      <div className="flex justify-center pt-2 lg:hidden">
        <Button variant="ghost" icon={LogOut} onClick={() => signOutEverywhere().then(() => navigate('/sign-in'))}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
