/**
 * The Android app: where anyone gets it, and which build is current.
 *
 * The newest APK and a release.json beside it are static files in
 * web/public/app, staged by `npm run publish` in mobile/: the same files the
 * app's own updater reads. /get-app is public on purpose, so its link can be
 * sent to someone who hasn't signed in yet.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Download, Share } from 'lucide-react';
import { product } from '../../product/config';
import { IPHONE_APP_PATH } from '../iphoneApp';
import { copyText } from '../pin';
import { Button, Skeleton } from '../ui';
import { LegalShell } from './legal';

export const GET_APP_PATH = '/get-app';

/** The published build, or null when there is none. */
export function useRelease() {
  return useQuery({
    queryKey: ['app-release'],
    queryFn: async () => {
      const res = await fetch(`/app/release.json?t=${Date.now()}`, { headers: { Accept: 'application/json' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`The server returned ${res.status}.`);
      // With nothing published the site answers with its own page, not JSON.
      const release = await res.json().catch(() => null);
      return release?.fileName ? release : null;
    },
    staleTime: 5 * 60_000,
  });
}

const sizeLabel = (n) => (n ? `${(n / 1048576).toFixed(1)} MB` : '');
const dateLabel = (s) => (s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** A QR code for the download, drawn in the browser (the library loads only here). */
function QrCode({ value }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(value, { width: 320, margin: 1 }))
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [value]);
  if (!src) return <div className="h-36 w-36 shrink-0 rounded-xl bg-slate-100" aria-hidden />;
  return <img src={src} alt="QR code to download the Android app" width={144} height={144} className="h-36 w-36 shrink-0 rounded-xl border border-line" />;
}

/** Version, QR code, download button, and the link to share. */
export function AndroidAppDetails() {
  const { data: release, isLoading, error } = useRelease();
  if (isLoading) return <Skeleton className="h-36" />;
  if (error) return <p className="text-sm text-red-700">Couldn't load the app version. {error.message}</p>;
  if (!release) return <p className="text-sm text-ink-soft">No Android build has been published yet.</p>;

  const downloadUrl = `${window.location.origin}/app/${encodeURIComponent(release.fileName)}`;
  const shareUrl = `${window.location.origin}${GET_APP_PATH}`;
  const facts = [`build ${release.versionCode}`, sizeLabel(release.size), dateLabel(release.publishedAt) && `published ${dateLabel(release.publishedAt)}`];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5">
        {/* Scanned from a computer screen; no use on the phone that is already here. */}
        <div className="hidden sm:block">
          <QrCode value={downloadUrl} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Latest version</p>
          <p className="tnum mt-1 text-2xl font-bold text-ink">v{release.versionName}</p>
          <p className="mt-0.5 text-sm text-ink-soft">{facts.filter(Boolean).join(' · ')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* A plain link, not a fetch: the browser streams the file to disk with its own progress. */}
            <a
              href={downloadUrl}
              download={release.fileName}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-brand px-3.5 text-sm font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-dark"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download APK
            </a>
            <span className="text-sm text-ink-soft">Android only</span>
          </div>
        </div>
      </div>

      {release.notes && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">What's new</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{release.notes}</p>
        </div>
      )}

      <div className="border-t border-line pt-4">
        <p className="text-sm font-semibold text-ink">Send it to a phone</p>
        <div className="mt-2 flex gap-2">
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-slate-50 px-3 font-mono text-sm text-ink"
            aria-label="Link to the app download page"
          />
          <Button variant="secondary" size="sm" icon={Copy} className="h-10" onClick={() => copyText(shareUrl, 'Link copied')}>
            Copy
          </Button>
        </div>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
          <li>Scan the code, or open the link on the Android phone, and let the download finish.</li>
          <li>Open the downloaded file. Android asks whether to allow installs from your browser: allow it.</li>
          <li>Tap Install, then sign in with your {product.name} account.</li>
        </ol>
        <p className="mt-3 text-sm text-ink-soft">Once installed, the app offers new versions itself (More → App updates).</p>
      </div>
    </div>
  );
}

/**
 * The iPhone app: the Android app's screens, served by this site at /iphone/
 * and added to the home screen from Safari (see ../iphoneApp.js).
 */
export function IphoneAppDetails() {
  const url = `${window.location.origin}${IPHONE_APP_PATH}`;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">iPhone</p>
        <p className="mt-1 text-sm text-ink-soft">The same app as Android, added from Safari. Nothing to download.</p>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-slate-50 px-3 font-mono text-sm text-ink"
          aria-label="Link to the iPhone app"
        />
        <Button variant="secondary" size="sm" icon={Copy} className="h-10" onClick={() => copyText(url, 'Link copied')}>
          Copy
        </Button>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
        <li>
          Open the link on the iPhone in <strong className="text-ink">Safari</strong>.
        </li>
        <li>
          Tap <Share className="inline h-4 w-4 align-[-3px]" aria-label="Share" /> then <strong className="text-ink">Add to Home Screen</strong>,
          with <strong className="text-ink">Open as Web App</strong> on.
        </li>
        <li>Open {product.name} from the home screen and sign in. Allow notifications when it asks.</li>
      </ol>
    </div>
  );
}

/** The public page: /get-app. */
export function GetAppPage() {
  return (
    <LegalShell>
      <h1 className="text-3xl font-bold tracking-tight text-ink">Get {product.name} on your phone</h1>
      <p className="mt-2 text-[15px] text-ink-soft">Your tasks, reminders and alerts on Android and iPhone.</p>
      <div className="mt-8 rounded-2xl border border-line bg-card p-5 shadow-card sm:p-6">
        <AndroidAppDetails />
      </div>
      <div className="mt-5 rounded-2xl border border-line bg-card p-5 shadow-card sm:p-6">
        <IphoneAppDetails />
      </div>
    </LegalShell>
  );
}
