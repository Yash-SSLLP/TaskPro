/**
 * Public pages anyone can open, signed in or not (the app stores link to
 * them): the privacy policy, and deleting your account.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, apiUrl } from '../api';
import { useSession } from '../session';
import { signOutEverywhere } from '../signOut';
import { Logo } from '../Logo';
import { ThemeToggle } from '../ThemeToggle';
import { PRIVACY } from '../privacy';
import { Button, Card, Input, PasswordInput } from '../ui';

export function LegalShell({ children }) {
  const signedIn = useSession((s) => !!s.token);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link to="/" aria-label="Home">
            <Logo size={32} />
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link to={signedIn ? '/' : '/sign-in'} className="text-sm font-semibold text-brand hover:underline">
              {signedIn ? 'Open the app' : 'Sign in'}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="mx-auto flex max-w-3xl flex-wrap gap-x-5 gap-y-2 px-4 pb-10 text-sm text-ink-soft sm:px-6">
        <span>
          © {new Date().getFullYear()} {PRIVACY.org}
        </span>
        <Link to="/privacy" className="hover:text-ink hover:underline">
          Privacy policy
        </Link>
        <Link to="/delete-account" className="hover:text-ink hover:underline">
          Delete your account
        </Link>
        <a href={`mailto:${PRIVACY.email}`} className="hover:text-ink hover:underline">
          {PRIVACY.email}
        </a>
      </footer>
    </div>
  );
}

function Block({ item }) {
  if (typeof item === 'string') return <p>{item}</p>;
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-soft">
      {item.list.map((li) => (
        <li key={li}>{li}</li>
      ))}
    </ul>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell>
      <article className="space-y-8 text-[15px] leading-relaxed text-ink">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Privacy policy</h1>
          <p className="mt-2 text-sm text-ink-soft">Last updated {PRIVACY.updated}</p>
        </header>
        <div className="space-y-3">
          {PRIVACY.intro.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {PRIVACY.sections.map((s, i) => (
          <section key={s.title} className="space-y-3">
            <h2 className="text-lg font-semibold">
              {i + 1}. {s.title}
            </h2>
            {s.body.map((item, j) => (
              <Block key={j} item={item} />
            ))}
          </section>
        ))}
      </article>
    </LegalShell>
  );
}

/** POST /api/auth/delete-account with a given token (the signed-out form has not stored a session). */
async function deleteWithToken(token, password) {
  const res = await fetch(apiUrl('/api/auth/delete-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Something went wrong. Please try again.');
  return data;
}

export function DeleteAccountPage() {
  const { token, user } = useSession();
  const navigate = useNavigate();
  const superAdmin = user?.role === 'superadmin';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let useToken = token;
      if (!useToken) {
        const session = await api.post('/api/auth/login', { identifier, password });
        useToken = session.token;
      }
      await deleteWithToken(useToken, password);
      if (token) await signOutEverywhere();
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <LegalShell>
        <Card className="p-6 text-center sm:p-8">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold text-ink">Your account has been deleted</h1>
          <p className="mt-2 text-[15px] text-ink-soft">Thank you for using {PRIVACY.app}. You have been signed out on every device.</p>
          <Button className="mt-6" onClick={() => navigate('/sign-in', { replace: true })}>
            Done
          </Button>
        </Card>
      </LegalShell>
    );
  }

  const ready = password && confirmText.trim().toUpperCase() === 'DELETE' && (token || identifier.trim());

  return (
    <LegalShell>
      <div className="space-y-6 text-[15px] leading-relaxed text-ink">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Delete your {PRIVACY.app} account</h1>
          <p className="mt-2 text-ink-soft">You can also do this in the app: More → Delete account.</p>
        </header>

        <Card className="space-y-3 p-5 sm:p-6">
          <h2 className="font-semibold">What happens</h2>
          <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-soft">
            <li>Your name, email, mobile number, password, Task Pin and settings are deleted straight away.</li>
            <li>Your contacts, team memberships, devices and alerts are deleted.</li>
            <li>Tasks, repeating schedules, templates and categories that only you were on are deleted, with their files and voice notes.</li>
            <li>Tasks you shared with other people stay with them, with your name shown as “Deleted user”.</li>
            <li>Teams you own pass to an admin or member, or are deleted if nobody else is in them.</li>
            <li>Backup copies are overwritten within 30 days.</li>
          </ul>
          <p className="text-ink-soft">
            Can’t sign in? Email{' '}
            <a className="font-medium text-brand hover:underline" href={`mailto:${PRIVACY.email}`}>
              {PRIVACY.email}
            </a>{' '}
            from the email address on your account and we will delete it for you. See the{' '}
            <Link to="/privacy" className="font-medium text-brand hover:underline">
              privacy policy
            </Link>{' '}
            for more.
          </p>
        </Card>

        {superAdmin ? (
          <Card className="p-5 text-ink-soft sm:p-6">The Super Admin account cannot be deleted.</Card>
        ) : (
          <Card className="p-5 sm:p-6">
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="flex items-start gap-2.5 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>This cannot be undone.{user ? ` You are signed in as ${user.name}.` : ''}</span>
              </div>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}
              {!token && (
                <Input label="Email or mobile number" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              )}
              <PasswordInput
                label={token ? 'Your password' : 'Password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input label="Type DELETE to confirm" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              <Button type="submit" variant="danger" className="w-full sm:w-auto" loading={busy} disabled={!ready}>
                Delete my account
              </Button>
            </form>
          </Card>
        )}
      </div>
    </LegalShell>
  );
}
