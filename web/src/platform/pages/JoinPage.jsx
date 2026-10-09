/**
 * /join/<pin>?w=<sig>: where an invite link lands, signed in or not.
 *
 * Says who invited you (and whether you'd WhatsApp each other), then:
 *   signed in   → "Add <name>" makes you contacts at once
 *   signed out  → create an account or sign in; the invite waits and opens
 *                 again afterwards (invite.js)
 *   on Android  → open it in the app, or download the app with the invite
 *                 copied, so the app can pick it up after installing
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LogIn, Smartphone, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { product } from '../../product/config';
import { api } from '../api';
import { useSession } from '../session';
import { cleanPin, formatPin } from '../pin';
import { rememberInvite } from '../invite';
import { Avatar, Button, ErrorState, Skeleton, WhatsAppIcon } from '../ui';
import { LegalShell } from './legal';
import { useRelease } from './mobileApp';

const ANDROID_PACKAGE = 'in.salestracker.taskpro';
const APP_SCHEME = 'taskpro';
const isAndroid = () => /Android/i.test(navigator.userAgent || '');

/** An Android intent that opens the app, or the download page when it isn't installed. */
function appIntent(pathAndQuery) {
  const fallback = encodeURIComponent(`${window.location.origin}/get-app`);
  return `intent://${pathAndQuery.replace(/^\/+/, '')}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

/** Download the APK; the invite goes on the clipboard first for the app to find. */
function AppButtons({ inviteUrl, pathAndQuery }) {
  const { data: release } = useRelease();
  const android = isAndroid();
  const download = release ? `/app/${encodeURIComponent(release.fileName)}` : '/get-app';

  const copyInvite = () => {
    navigator.clipboard?.writeText(inviteUrl).catch(() => {});
    toast.info(`Invite copied. Open ${product.name} after installing and it joins you up.`);
  };

  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Smartphone className="h-4 w-4 text-brand" aria-hidden /> {product.name} on your phone
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {android ? 'Already have the app? Open this invite in it. New? Download it; the invite comes along.' : 'Get the Android app, or carry on in the browser.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {android && (
          <a
            href={appIntent(pathAndQuery)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-dark"
          >
            <Smartphone className="h-4 w-4" aria-hidden /> Open in the app
          </a>
        )}
        <a
          href={download}
          download={release?.fileName}
          onClick={copyInvite}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-well"
        >
          <Download className="h-4 w-4" aria-hidden /> {release ? `Download the app (v${release.versionName})` : 'Get the Android app'}
        </a>
      </div>
    </div>
  );
}

export function JoinPage() {
  const { pin: rawPin } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const signedIn = useSession((s) => !!s.token && !!s.user);
  const [busy, setBusy] = useState(false);

  const pin = cleanPin(rawPin);
  const w = new URLSearchParams(location.search).get('w') || '';
  const pathAndQuery = `/join/${formatPin(pin)}${w ? `?w=${encodeURIComponent(w)}` : ''}`;
  const inviteUrl = `${window.location.origin}${pathAndQuery}`;

  const q = useQuery({
    queryKey: ['invite', pin, w],
    queryFn: () => api.get(`/api/contacts/invite/${pin}${w ? `?w=${encodeURIComponent(w)}` : ''}`),
    enabled: pin.length === 8,
    retry: false,
  });
  const inviter = q.data?.inviter;
  const whatsapp = !!q.data?.whatsapp;
  const first = inviter?.name?.split(' ')[0] || 'them';
  const own = signedIn && inviter && inviter.id === user?.id;

  useEffect(() => {
    document.title = inviter ? `${inviter.name} invited you · ${product.name}` : product.name;
  }, [inviter]);

  const join = async () => {
    setBusy(true);
    try {
      const res = await api.post('/api/contacts/join', { pin, ...(w ? { w } : {}) });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(res.status === 'already' ? `You and ${first} are already contacts${res.contact?.whatsapp ? ', with WhatsApp on' : ''}.` : `${inviter.name} is now your contact.`);
      navigate('/contacts', { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const goAuth = (to) => {
    rememberInvite(pathAndQuery);
    navigate(to);
  };

  let body;
  if (pin.length !== 8) {
    body = <ErrorState error={{ message: 'This invite link is not complete. Ask for it again.' }} />;
  } else if (q.isLoading) {
    body = <Skeleton className="h-56" />;
  } else if (q.error) {
    body = <ErrorState error={q.error} onRetry={q.refetch} />;
  } else {
    body = (
      <div className="space-y-5">
        <div className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft via-card to-card p-6 text-center shadow-card">
          <Avatar person={inviter} size="xl" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
            {own ? 'This is your own invite link' : `${inviter.name} invited you to ${product.name}`}
          </h1>
          {inviter.title && <p className="mt-0.5 text-sm text-ink-soft">{inviter.title}</p>}
          <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-soft">
            {own ? 'Send it to someone so they can join you.' : `Give each other tasks, follow them up and get reminders. Task Pin ${inviter.pinDisplay}.`}
          </p>

          {whatsapp && !own && (
            <div className="mx-auto mt-4 flex max-w-md items-start gap-2.5 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-3 text-left text-sm text-ink">
              <WhatsAppIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                You'll also be able to <strong>WhatsApp each other about tasks</strong>: {first} sees your mobile number on tasks you share, and
                you see theirs. Either of you can switch it off in Contacts.
              </span>
            </div>
          )}

          {!own && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {signedIn ? (
                <Button size="lg" icon={UserPlus} loading={busy} onClick={join}>
                  Add {first} as a contact
                </Button>
              ) : (
                <>
                  <Button size="lg" icon={UserPlus} onClick={() => goAuth('/sign-up')}>
                    Create your account
                  </Button>
                  <Button size="lg" variant="secondary" icon={LogIn} onClick={() => goAuth('/sign-in')}>
                    I have an account
                  </Button>
                </>
              )}
            </div>
          )}
          {signedIn && whatsapp && !own && !user?.phone && (
            <p className="mt-3 text-sm text-ink-soft">
              Add your mobile number in{' '}
              <Link to="/profile" className="font-semibold text-brand hover:underline">
                Profile
              </Link>{' '}
              so {first} can WhatsApp you.
            </p>
          )}
        </div>
        {!own && <AppButtons inviteUrl={inviteUrl} pathAndQuery={pathAndQuery} />}
      </div>
    );
  }

  return (
    <LegalShell>
      <div className="mx-auto max-w-xl">{body}</div>
    </LegalShell>
  );
}
