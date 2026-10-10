/**
 * My profile (/profile): the photo, name and job title up top on a navy
 * band, what I have in Karo (contacts, organizations, how long I've been here), my
 * Task Pin, my contact details (how people see me and how I sign in), and
 * the way to Settings and the password.
 *
 * The photo: pick a file (or drop one on the photo), frame it in the crop
 * dialog, and a 512 px JPEG goes up to PUT /api/me/photo. The new photo shows
 * at once, with a ring turning until the server has it; then the session's
 * user is replaced and every list that shows people reads again.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AtSign, BriefcaseBusiness, Camera, ChevronRight, KeyRound, LogOut, Mail, Phone, Settings, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiUrl } from '../api';
import { isSuperAdmin, useSession, useTz } from '../session';
import { Avatar, Button, Card, Input, PinCard, useConfirm } from '../ui';
import { PhotoCropDialog, loadImage } from './PhotoCropDialog';
import { signOutEverywhere } from '../signOut';

const MAX_PICK_BYTES = 25 * 1024 * 1024;

// The band behind the photo: navy with a glow of the accent, the same in both themes.
const BAND = {
  backgroundColor: '#032d60',
  backgroundImage:
    'radial-gradient(120% 150% at 100% 0%, rgb(var(--brand) / 0.5) 0%, rgb(var(--brand) / 0) 55%), ' +
    'radial-gradient(80% 120% at 0% 100%, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0) 60%)',
};
const GRAIN = { backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1.3px)', backgroundSize: '16px 16px' };

/** Every list that shows people (their photo, their name) reads again. */
function refreshPeople(qc) {
  for (const queryKey of [['tasks'], ['task'], ['contacts'], ['teams'], ['team'], ['people'], ['platform'], ['calendar']]) {
    qc.invalidateQueries({ queryKey });
  }
}

/** Resolves once the browser has the image (or gives up after a few seconds). */
function preload(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    setTimeout(done, 8000);
    img.src = url;
  });
}

function memberSince(date, tz) {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: tz }).format(new Date(date));
  } catch {
    return new Date(date).getFullYear();
  }
}

/** A small titled block in the page's own voice: an accent overline, then the heading. */
function Block({ overline, title, description, children, className }) {
  return (
    <Card className={clsx('p-5 sm:p-7', className)}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">{overline}</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function Fact({ label, value, to }) {
  const body = (
    <>
      <span className="tnum block truncate text-[17px] font-semibold tracking-tight text-ink sm:text-lg">{value}</span>
      <span className="mt-0.5 block truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</span>
    </>
  );
  const cls = 'flex min-w-0 flex-col items-center px-2 py-3.5 text-center sm:items-start sm:px-5 sm:text-left';
  return to ? (
    <Link to={to} className={clsx(cls, 'transition-colors hover:bg-card')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ---------------------------------------------------------------- the photo and name

function Hero({ onAddTitle }) {
  const user = useSession((s) => s.user);
  const updateUser = useSession((s) => s.updateUser);
  const tz = useTz();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const admin = isSuperAdmin(user);
  const fileRef = useRef(null);
  const [cropping, setCropping] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  // The counts come from the same cache as the sidebar's badges.
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api.get('/api/contacts'), enabled: !admin, staleTime: 30_000 });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api.get('/api/teams'), enabled: !admin, staleTime: 30_000 });

  // Object URLs are let go when the page closes.
  const urls = useRef(new Set());
  useEffect(() => {
    const held = urls.current;
    return () => held.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const hold = (u) => {
    urls.current.add(u);
    return u;
  };
  const letGo = (u) => {
    if (!u) return;
    URL.revokeObjectURL(u);
    urls.current.delete(u);
  };

  const pick = () => fileRef.current?.click();

  const choose = async (file) => {
    if (!file || busy) return;
    if (file.type && !file.type.startsWith('image/')) {
      toast.error('Choose a photo: a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_PICK_BYTES) {
      toast.error('That photo is larger than 25 MB. Choose a smaller one.');
      return;
    }
    try {
      const image = await loadImage(file);
      hold(image.url);
      setCropping(image);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const closeCrop = () => {
    letGo(cropping?.url);
    setCropping(null);
  };

  const upload = async (blob) => {
    closeCrop();
    const local = hold(URL.createObjectURL(blob));
    setPreview(local);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('photo', blob, 'photo.jpg');
      // api.send passes a FormData through as multipart.
      const data = await api.send('PUT', '/api/me/photo', form);
      // Swap to the server's copy once it is loaded, so the photo doesn't blink.
      if (data.user?.photoUrl) await preload(apiUrl(data.user.photoUrl));
      updateUser(data.user);
      refreshPeople(qc);
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setPreview(null);
      letGo(local);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Remove your photo?', text: 'People will see your initials instead.', confirmLabel: 'Remove photo' });
    if (!ok) return;
    setBusy(true);
    try {
      const data = await api.del('/api/me/photo');
      updateUser(data.user);
      refreshPeople(qc);
      toast.success('Photo removed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const hasPhoto = Boolean(user.photoUrl);
  const dropProps = {
    onDragOver: (e) => {
      if (busy || ![...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e) => {
      e.preventDefault();
      setOver(false);
      choose(e.dataTransfer?.files?.[0]);
    },
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-card shadow-card">
      <div className="relative h-28 sm:h-36" style={BAND}>
        <div className="absolute inset-0" style={GRAIN} aria-hidden />
        <p className="absolute left-5 top-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70 sm:left-8 sm:top-5">My profile</p>
        {admin && (
          <span className="absolute right-5 top-3.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/15 sm:right-8 sm:top-4">
            Super Admin
          </span>
        )}
      </div>

      <div className="px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="-mt-14 flex flex-col items-center gap-4 text-center sm:-mt-16 sm:flex-row sm:items-end sm:gap-6 sm:text-left">
          <div className="relative shrink-0" {...dropProps}>
            <Avatar
              person={user}
              src={preview}
              size="2xl"
              className={clsx('shadow-pop ring-4 transition-shadow', over ? 'ring-brand' : 'ring-card')}
            />
            {busy && (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/35" role="status">
                <svg className="absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)] animate-spin" viewBox="0 0 100 100" aria-hidden>
                  <circle cx="50" cy="50" r="48" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="72 230" className="stroke-brand" />
                </svg>
                <span className="sr-only">Saving your photo</span>
              </span>
            )}
            <button
              type="button"
              onClick={pick}
              disabled={busy}
              className="absolute bottom-0.5 right-0.5 grid h-10 w-10 place-items-center rounded-full bg-brand text-on-brand shadow-pop ring-4 ring-card transition-colors hover:bg-brand-dark disabled:opacity-60 sm:bottom-1 sm:right-1"
              aria-label={hasPhoto ? 'Change photo' : 'Add a photo'}
              title={hasPhoto ? 'Change photo' : 'Add a photo'}
            >
              <Camera className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          {/* sm:mt-16 keeps a long, wrapping name below the band. */}
          <div className="min-w-0 flex-1 sm:mt-16 sm:pb-1">
            <h1 className="break-words text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[30px]">{user.name}</h1>
            {user.title ? (
              <p className="mt-1 text-[15px] text-ink-soft">{user.title}</p>
            ) : (
              <button type="button" onClick={onAddTitle} className="mt-1 text-[15px] font-medium text-brand hover:underline">
                Add your job title
              </button>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2 sm:mt-16 sm:pb-1">
            <Button variant="secondary" icon={Camera} onClick={pick} disabled={busy}>
              {hasPhoto ? 'Change photo' : 'Add a photo'}
            </Button>
            {hasPhoto && (
              <Button variant="ghost" icon={Trash2} onClick={remove} disabled={busy}>
                Remove
              </Button>
            )}
          </div>
        </div>

        <div className={clsx('mt-6 grid divide-x divide-line overflow-hidden rounded-2xl border border-line bg-well', admin ? 'grid-cols-2' : 'grid-cols-3')}>
          {admin ? (
            <Fact label="Role" value="Super Admin" />
          ) : (
            <>
              <Fact label="Contacts" value={contacts.data ? contacts.data.contacts?.length || 0 : '—'} to="/contacts" />
              <Fact label="Organizations" value={teams.data ? teams.data.teams?.length || 0 : '—'} to="/teams" />
            </>
          )}
          <Fact label="Member since" value={memberSince(user.createdAt, tz)} />
        </div>
      </div>

      {cropping && <PhotoCropDialog key={cropping.url} image={cropping} onCancel={closeCrop} onSave={upload} />}
    </section>
  );
}

// ---------------------------------------------------------------- contact details

const fromUser = (u) => ({ name: u.name || '', title: u.title || '', email: u.email || '', phone: u.phoneDisplay || '' });

function DetailsBlock({ titleRef }) {
  const user = useSession((s) => s.user);
  const updateUser = useSession((s) => s.updateUser);
  const qc = useQueryClient();
  const [form, setForm] = useState(() => fromUser(user));
  const [busy, setBusy] = useState(false);
  const editing = useRef(false);

  // A change made elsewhere (another tab, the session refresh) shows here unless I'm typing.
  useEffect(() => {
    if (!editing.current) setForm(fromUser(user));
  }, [user]);

  const saved = fromUser(user);
  const changed = Object.keys(saved).some((k) => form[k].trim() !== saved[k]);
  const set = (k) => (e) => {
    editing.current = true;
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: form.name.trim(), title: form.title.trim() };
      if (form.email.trim() !== (user.email || '')) body.email = form.email.trim();
      if (form.phone.trim() !== (user.phoneDisplay || '')) body.phone = form.phone.trim();
      const data = await api.patch('/api/auth/profile', body);
      editing.current = false;
      updateUser(data.user);
      setForm(fromUser(data.user));
      refreshPeople(qc);
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const icon = (Icon) => <Icon className="h-4 w-4" aria-hidden />;

  return (
    <Block overline="Details" title="How people see you, and how you sign in" description="Your name and job title show next to your photo on tasks, contacts and organizations.">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" autoComplete="name" prefix={icon(UserRound)} value={form.name} onChange={set('name')} />
        <Input ref={titleRef} label="Job title" optional placeholder="e.g. Accounts" prefix={icon(BriefcaseBusiness)} value={form.title} onChange={set('title')} />
        <Input label="Email" optional type="email" autoComplete="email" prefix={icon(Mail)} value={form.email} onChange={set('email')} />
        <Input label="Mobile number" optional type="tel" autoComplete="tel" prefix={icon(Phone)} value={form.phone} onChange={set('phone')} />
        {user.username && <Input label="Username" prefix={icon(AtSign)} value={user.username} disabled hint="You can also sign in with this." />}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={busy} disabled={!form.name.trim() || !changed}>
            Save changes
          </Button>
          {changed && !busy && (
            <button
              type="button"
              className="text-sm font-medium text-ink-soft hover:text-ink"
              onClick={() => {
                editing.current = false;
                setForm(fromUser(user));
              }}
            >
              Undo changes
            </button>
          )}
        </div>
      </form>
    </Block>
  );
}

// ---------------------------------------------------------------- account

function LinkRow({ to, icon: Icon, title, text }) {
  return (
    <Link to={to} className="group flex items-center gap-3.5 rounded-xl px-2 py-3 transition-colors hover:bg-well">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-well text-ink-soft transition-colors group-hover:bg-card group-hover:text-brand">
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-sm text-ink-soft">{text}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
    </Link>
  );
}

/** Sign out of this browser (the folded sidebar sends people here for it). */
function SignOutRow() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => signOutEverywhere().then(() => navigate('/sign-in'))}
      className="group flex w-full items-center gap-3.5 rounded-xl px-2 py-3 text-left transition-colors hover:bg-well"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-well text-ink-soft transition-colors group-hover:bg-card group-hover:text-brand">
        <LogOut className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">Sign out</span>
        <span className="block truncate text-sm text-ink-soft">On this browser</span>
      </span>
    </button>
  );
}

export function ProfilePage() {
  const user = useSession((s) => s.user);
  const titleRef = useRef(null);
  const addTitle = () => {
    titleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    titleRef.current?.focus({ preventScroll: true });
  };
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Hero onAddTitle={addTitle} />
      {!isSuperAdmin(user) && <PinCard person={user} />}
      <DetailsBlock titleRef={titleRef} />
      <Block overline="Account" title="Settings and security">
        <div className="-mx-2 -my-1 divide-y divide-line">
          <LinkRow to="/settings" icon={Settings} title="Settings" text="Time zone, reminders, daily summary, language and appearance" />
          <LinkRow to="/settings#password" icon={KeyRound} title="Change password" text="Signs you out on your other devices" />
          <SignOutRow />
        </div>
      </Block>
    </div>
  );
}
