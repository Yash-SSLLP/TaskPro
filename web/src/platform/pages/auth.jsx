/**
 * Everything before (and just after) signing in: sign in, create your
 * account (and see your new Task Pin), forgot / reset password, and the forced
 * "choose your own password" step.
 */
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Copy, KeyRound, MessageCircle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { product } from '../../product/config';
import { api } from '../api';
import { useSession } from '../session';
import { copyText, pinOf, whatsappUrl } from '../pin';
import { setAfterSignIn, takeInvite } from '../invite';
import { Logo, Wordmark } from '../Logo';
import { ThemeToggle } from '../ThemeToggle';
import { Button, Input, PasswordInput } from '../ui';
import { signOutEverywhere } from '../signOut';

const HOME = '/tasks';
const homeFor = (user) => (user?.role === 'superadmin' ? '/console' : HOME);

/**
 * Where to go once signed in: an invite opened before signing in, else the
 * page a link was taken to (a task from a WhatsApp reminder), else home.
 */
function nextFor(user, from) {
  const invite = takeInvite();
  if (invite && user?.role !== 'superadmin') return invite;
  if (typeof from === 'string' && from.startsWith('/') && !/^\/(sign-|forgot|reset)/.test(from) && from !== '/') return from;
  return homeFor(user);
}

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen">
      {/* Navy in both themes, lit like the logo's tile, with the mark as a watermark. */}
      <aside className="auth-hero relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden p-10 lg:flex">
        <img src="/mark.svg" alt="" aria-hidden className="pointer-events-none absolute -bottom-24 -right-28 w-[30rem] max-w-none opacity-[0.06]" />
        <div className="relative flex items-center gap-3">
          <img src="/logo.svg" width={44} height={44} alt="" className="drop-shadow" />
          <Wordmark className="text-xl text-white" />
        </div>
        <div className="relative">
          <h2 className="max-w-md text-[2.15rem] font-semibold leading-[1.15] tracking-[-0.02em] text-white">{product.tagline}</h2>
          <ul className="mt-9 space-y-4">
            {(product.pitch || []).map((line) => (
              <li key={line} className="flex items-start gap-3 text-[16px] leading-snug text-white/85">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#78b0fd]" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-[#aacbff]">Works on your phone and computer.</p>
      </aside>
      <main className="relative flex flex-1 flex-col items-center justify-center px-5 py-10">
        {/* Light or dark before signing in, as inside: the top corner, level
            with the panel's logo on a wide screen. A wrapper places it, since
            the switch draws itself `relative`. */}
        <div className="absolute right-5 top-5 sm:right-8 sm:top-8 lg:right-10 lg:top-12">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo size={40} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[15px] text-ink-soft">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-8 text-center text-[15px] text-ink-soft">{footer}</div>}
          <p className="mt-6 flex items-center justify-center gap-4 text-sm text-ink-soft">
            <Link to="/get-app" className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
              <Smartphone className="h-4 w-4" aria-hidden />
              Get the app
            </Link>
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
  const from = useLocation().state?.from;
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const formRef = useRef(null);
  const { busy, error, run } = useSubmit(async () => {
    // The fields themselves too: a browser's autofill fills them without
    // telling React until the person touches the page.
    const field = (name) => formRef.current?.querySelector(`input[autocomplete="${name}"]`)?.value || '';
    const id = (identifier || field('username')).trim();
    const pw = password || field('current-password');
    if (!id || !pw) throw new Error('Enter your email, mobile or username, and your password.');
    const data = await api.post('/api/auth/login', { identifier: id, password: pw });
    const next = nextFor(data.user, from);
    setAfterSignIn(next);
    setSession(data);
    navigate(next, { replace: true });
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
      <form ref={formRef} onSubmit={run} className="space-y-4" noValidate>
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
        <Button type="submit" size="lg" className="w-full" loading={busy}>
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
        <div className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft via-card to-card p-5 text-center shadow-card">
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
      const next = nextFor(data.user);
      setAfterSignIn(next);
      setSession(data);
      navigate(next, { replace: true });
    }
  });

  if (created) {
    return (
      <NewPinStep
        data={created}
        onContinue={() => {
          const next = nextFor(created.user);
          setAfterSignIn(next);
          setSession(created);
          toast.success(`Welcome to ${product.name}!`);
          navigate(next, { replace: true });
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
        <div className="rounded-2xl border border-line bg-card p-5 text-[15px] text-ink shadow-card">{message}</div>
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
