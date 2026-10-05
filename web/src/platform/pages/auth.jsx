/**
 * Everything before (and just after) signing in: sign in, create your
 * account (and see your new Task Pin), forgot / reset password, and the forced
 * "choose your own password" step.
 */
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Copy, KeyRound, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { product } from '../../product/config';
import { api } from '../api';
import { useSession } from '../session';
import { copyText, pinOf, whatsappUrl } from '../pin';
import { Logo } from '../Logo';
import { Button, Input, PasswordInput } from '../ui';
import { signOutEverywhere } from '../signOut';

const HOME = '/tasks';
const homeFor = (user) => (user?.role === 'superadmin' ? '/console' : HOME);

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-brand p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/5" aria-hidden />
        <div className="relative flex items-center gap-3">
          <img src="/logo.svg" width={40} height={40} alt="" className="rounded-[22%] ring-2 ring-white/30" />
          <span className="text-xl font-bold">{product.name}</span>
        </div>
        <div className="relative">
          <h2 className="text-3xl font-bold leading-tight">{product.tagline}</h2>
          <ul className="mt-8 space-y-4">
            {(product.pitch || []).map((line) => (
              <li key={line} className="flex items-start gap-3 text-[17px] text-white/90">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-white" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">Works on your phone and computer.</p>
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo size={40} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[15px] text-ink-soft">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-8 text-center text-[15px] text-ink-soft">{footer}</div>}
          <p className="mt-6 text-center text-sm text-ink-soft">
            <Link to="/privacy" className="hover:text-ink hover:underline">
              Privacy policy
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

function FormError({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
      {children}
    </div>
  );
}

export function SignInPage() {
  const setSession = useSession((s) => s.setSession);
  const notice = useSession((s) => s.notice);
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit(async () => {
    const data = await api.post('/api/auth/login', { identifier, password });
    setSession(data);
    navigate(homeFor(data.user), { replace: true });
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={`Sign in to ${product.name}`}
      footer={
        <>
          New here?{' '}
          <Link to="/sign-up" className="font-semibold text-brand hover:underline">
            Create your account
          </Link>
        </>
      }
    >
      <form onSubmit={run} className="space-y-4" noValidate>
        {notice && !error && <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">{notice}</div>}
        <FormError>{error}</FormError>
        <Input
          label="Email, mobile or username"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoFocus
          required
        />
        <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!identifier || !password}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

/**
 * The new person's pin, shown once right after sign-up. The session is only
 * stored on "Continue": storing it earlier would swap this page for the app.
 */
function NewPinStep({ data, onContinue }) {
  const pin = pinOf(data.user);
  const first = data.user?.name?.split(' ')[0] || 'there';
  return (
    <AuthLayout title={`Welcome, ${first}!`} subtitle="Your account is ready. This is your Task Pin.">
      <div className="space-y-5">
        <div className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft via-white to-white p-5 text-center shadow-card">
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-brand">
            <KeyRound className="h-4 w-4" aria-hidden /> Your Task Pin
          </p>
          <p
            className="tnum mt-2 select-all font-mono text-4xl font-bold tracking-[0.12em] text-ink"
            aria-label={`Task Pin ${pin.split('').join(' ')}`}
          >
            {pin}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" icon={Copy} onClick={() => copyText(pin, 'Task Pin copied')}>
              Copy
            </Button>
            <Button
              variant="soft"
              icon={MessageCircle}
              onClick={() => window.open(whatsappUrl(pin), '_blank', 'noopener')}
            >
              Share on WhatsApp
            </Button>
          </div>
        </div>
        <p className="text-[15px] text-ink-soft">
          People add you as a contact, or invite you to a team, with this pin. It never changes, and you can always find it in
          Contacts and Settings.
        </p>
        <Button size="lg" className="w-full" onClick={onContinue}>
          Continue <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
        </Button>
      </div>
    </AuthLayout>
  );
}

export function SignUpPage() {
  const setSession = useSession((s) => s.setSession);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', identifier: '', password: '' });
  const [created, setCreated] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const { busy, error, run } = useSubmit(async () => {
    const data = await api.post('/api/auth/signup', {
      name: form.name.trim(),
      identifier: form.identifier.trim(),
      password: form.password,
    });
    if (pinOf(data.user)) setCreated(data);
    else {
      setSession(data);
      navigate(homeFor(data.user), { replace: true });
    }
  });

  if (created) {
    return (
      <NewPinStep
        data={created}
        onContinue={() => {
          setSession(created);
          toast.success(`Welcome to ${product.name}!`);
          navigate(HOME, { replace: true });
        }}
      />
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free to start. Takes a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/sign-in" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={run} className="space-y-4" noValidate>
        <FormError>{error}</FormError>
        <Input label="Your name" autoComplete="name" value={form.name} onChange={set('name')} autoFocus />
        <Input
          label="Email or mobile number"
          autoComplete="username"
          hint="You'll use this to sign in."
          value={form.identifier}
          onChange={set('identifier')}
        />
        <PasswordInput autoComplete="new-password" hint="At least 8 characters." value={form.password} onChange={set('password')} />
        <p className="text-sm text-ink-soft">
          By creating an account you agree to our{' '}
          <Link to="/privacy" target="_blank" className="font-medium text-brand hover:underline">
            Privacy policy
          </Link>
          .
        </p>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={busy}
          disabled={!form.name.trim() || !form.identifier.trim() || !form.password}
        >
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState('');
  const { busy, error, run } = useSubmit(async () => {
    const data = await api.post('/api/auth/forgot-password', { identifier });
    setMessage(data.message);
  });
  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="No problem. We'll help you get back in."
      footer={
        <Link to="/sign-in" className="font-semibold text-brand hover:underline">
          Back to sign in
        </Link>
      }
    >
      {message ? (
        <div className="rounded-2xl border border-line bg-white p-5 text-[15px] text-ink shadow-card">{message}</div>
      ) : (
        <form onSubmit={run} className="space-y-4" noValidate>
          <FormError>{error}</FormError>
          <Input label="Email, mobile or username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus />
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!identifier}>
            Continue
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, run, setError } = useSubmit(async () => {
    if (password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    await api.post('/api/auth/reset-password', { token: params.get('token') || '', newPassword: password });
    toast.success('Password changed. Please sign in.');
    navigate('/sign-in', { replace: true });
  });
  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={run} className="space-y-4" noValidate>
        <FormError>{error}</FormError>
        <PasswordInput label="New password" autoComplete="new-password" hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <PasswordInput label="Type it again" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Save password
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Shown right after signing in with a password somebody else chose. */
export function ForcePasswordPage() {
  const { user, setSession } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, run, setError } = useSubmit(async () => {
    if (password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    const data = await api.post('/api/auth/change-password', { newPassword: password });
    setSession({ token: data.token, user: data.user });
    const me = await api.get('/api/auth/me');
    setSession(me);
    toast.success('All set. Welcome!');
  });
  return (
    <AuthLayout
      title={`Hi ${user?.name?.split(' ')[0] || 'there'}, choose your password`}
      subtitle="A temporary password was set for you. Pick your own to keep your account private."
      footer={
        <button type="button" onClick={() => signOutEverywhere()} className="font-semibold text-brand hover:underline">
          Sign out
        </button>
      }
    >
      <form onSubmit={run} className="space-y-4" noValidate>
        <FormError>{error}</FormError>
        <PasswordInput label="New password" autoComplete="new-password" hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <PasswordInput label="Type it again" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Save and continue
        </Button>
      </form>
    </AuthLayout>
  );
}
