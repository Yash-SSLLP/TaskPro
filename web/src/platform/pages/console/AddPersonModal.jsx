/**
 * Add a person: the account is made exactly as sign-up makes it (a Task Pin,
 * the welcome task), with a temporary password they must change the first
 * time they sign in. The password is shown once, to copy or share.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, RefreshCw, Share2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { copyText, pinOf } from '../../pin';
import { Button, Input, Modal } from '../../ui';
import { loginOf, tempPassword } from './shared';

const EMPTY = { name: '', email: '', phone: '', username: '', title: '' };

/** The message to hand the new person. */
function welcomeText(user, password) {
  const where = typeof window !== 'undefined' ? window.location.origin : '';
  return [
    `Your Karo account is ready, ${user.name.split(' ')[0]}.`,
    `Sign in with ${loginOf(user)} and this temporary password: ${password}`,
    'You will choose your own password straight away.',
    pinOf(user) ? `Your Task Pin is ${pinOf(user)}.` : '',
    where ? `Open ${where}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function AddPersonModal({ open, onClose, onOpenPerson }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [password, setPassword] = useState(() => tempPassword());
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (error) setError('');
  };

  const close = () => {
    setForm(EMPTY);
    setPassword(tempPassword());
    setError('');
    setDone(null);
    onClose();
  };

  const add = useMutation({
    mutationFn: (body) => api.post('/api/platform/users', body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['platform'] });
      setDone(res);
      toast.success(`${res.user.name} is added`);
    },
    onError: (e) => setError(e.message),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Enter their name.');
    if (!form.email.trim() && !form.phone.trim() && !form.username.trim()) return setError('Give them an email, a mobile number or a username to sign in with.');
    if (password && password.length < 8) return setError('The temporary password needs at least 8 characters.');
    const body = Object.fromEntries(Object.entries({ ...form, password }).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    add.mutate(body);
  };

  const share = async () => {
    const text = welcomeText(done.user, done.temporaryPassword);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    copyText(text, 'Message copied. Paste it to them.');
  };

  if (done) {
    const u = done.user;
    return (
      <Modal
        open={open}
        onClose={close}
        title={`${u.name} is added`}
        subtitle="Their temporary password is shown only now."
        footer={
          <>
            <Button variant="secondary" onClick={() => (onOpenPerson?.(u.id), close())}>
              Open their page
            </Button>
            <Button onClick={close}>Done</Button>
          </>
        }
      >
        <div className="space-y-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-soft">Signs in with</dt>
              <dd className="break-all font-medium text-ink">{loginOf(u)}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Task Pin</dt>
              <dd className="font-mono font-bold tracking-[0.1em] text-ink">{pinOf(u) || '—'}</dd>
            </div>
          </dl>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">Temporary password</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="tnum min-w-0 flex-1 select-all break-all font-mono text-lg font-bold tracking-wider text-ink">{done.temporaryPassword}</code>
              <Button size="sm" variant="secondary" icon={Copy} onClick={() => copyText(done.temporaryPassword, 'Password copied')}>
                Copy
              </Button>
              <Button size="sm" variant="secondary" icon={Share2} onClick={share}>
                Share
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-amber-800">They must choose their own password the first time they sign in. It isn't shown again.</p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a person"
      subtitle="They get a Task Pin and a welcome task, as if they had signed up."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="add-person" icon={UserPlus} loading={add.isPending}>
            Add person
          </Button>
        </>
      }
    >
      <form id="add-person" onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Name" value={form.name} onChange={set('name')} maxLength={80} autoComplete="off" required />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Email" optional type="email" value={form.email} onChange={set('email')} autoComplete="off" />
          <Input label="Mobile number" optional type="tel" value={form.phone} onChange={set('phone')} autoComplete="off" />
          <Input label="Username" optional value={form.username} onChange={set('username')} autoComplete="off" hint="For staff with no email or mobile." />
          <Input label="Job title" optional value={form.title} onChange={set('title')} maxLength={60} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Input
            label="Temporary password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            prefix={<KeyRound className="h-4 w-4" />}
            inputClassName="font-mono tracking-wide"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setPassword(tempPassword())}>
              Generate
            </Button>
            <Button size="sm" variant="secondary" icon={Copy} disabled={!password} onClick={() => copyText(password, 'Password copied')}>
              Copy
            </Button>
          </div>
          <p className="text-sm text-ink-soft">They must choose a new password the first time they sign in. Leave it empty and one is made for you.</p>
        </div>
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
