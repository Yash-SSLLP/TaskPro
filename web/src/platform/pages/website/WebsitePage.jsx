/**
 * The public website's editor, for the Super Admin (the console's Website
 * row). The server draws the site from what is saved here (backend/src/site,
 * docs/WEBSITE.md):
 *
 *   Pages     the main pages and the /features/… and /for/… pages, built from sections
 *   Blog      posts in Markdown: drafts, scheduled and published
 *   Media     the picture library (shrunk in the browser before upload)
 *   Settings  brand, address and indexing, header, footer, socials, contact, redirects
 *
 * The tab lives in the URL (?tab=blog), as the console's does; each editor has
 * its own address (/website/pages/<id>, /website/posts/<id>, /website/posts/new).
 */
import { useState } from 'react';
import { Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCircle2, EyeOff } from 'lucide-react';
import { PageHeader, Segmented } from '../../ui';
import { BlogTab } from './BlogTab';
import { MediaTab } from './MediaTab';
import { PageEditor } from './PageEditor';
import { PagesTab } from './PagesTab';
import { PostEditor } from './PostEditor';
import { SettingsTab } from './SettingsTab';
import { liveHref, useSiteSettings, ViewLive } from './shared';

const TABS = [
  { value: 'pages', label: 'Pages' },
  { value: 'blog', label: 'Blog' },
  { value: 'media', label: 'Media' },
  { value: 'settings', label: 'Settings' },
];

/** Whether search engines may list the site, at a glance (opens Settings). */
function IndexingBadge({ effective, onOpen }) {
  if (!effective) return null;
  const on = effective.indexing && effective.indexedHost;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={clsx(
        'inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-colors',
        on ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-well text-ink-soft hover:text-ink'
      )}
      title="Address and search engines, in Settings"
    >
      {on ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
      {on ? `Indexed on ${effective.indexedHost}` : 'Hidden from search engines'}
    </button>
  );
}

function WebsiteHome() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'pages';
  const effective = useSiteSettings().data?.effective;
  // Settings stays mounted once opened, so a half-made change survives a look at another tab.
  const [settingsOpened, setSettingsOpened] = useState(tab === 'settings');
  const setTab = (value) => {
    if (value === 'settings') setSettingsOpened(true);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'pages') next.delete('tab');
        else next.set('tab', value);
        return next;
      },
      { replace: true }
    );
  };
  let host = '';
  try {
    host = effective?.siteUrl ? new URL(effective.siteUrl).host : '';
  } catch {
    /* no address yet */
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Website"
        subtitle={`The public site${host ? ` at ${host}` : ''}: its pages, blog, pictures and settings`}
        actions={
          <>
            <IndexingBadge effective={effective} onOpen={() => setTab('settings')} />
            <ViewLive href={liveHref('/')}>Open the site</ViewLive>
          </>
        }
      />
      <div className="max-w-full overflow-x-auto">
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>
      {tab === 'pages' && <PagesTab />}
      {tab === 'blog' && <BlogTab />}
      {tab === 'media' && <MediaTab />}
      {(settingsOpened || tab === 'settings') && (
        <div hidden={tab !== 'settings'}>
          <SettingsTab />
        </div>
      )}
    </div>
  );
}

/** An editor, remade for each record so one never shows another's state. */
function Keyed({ as: Editor }) {
  const { id } = useParams();
  return <Editor key={id} />;
}

export function WebsitePage() {
  return (
    <Routes>
      <Route index element={<WebsiteHome />} />
      <Route path="pages/:id" element={<Keyed as={PageEditor} />} />
      <Route path="posts/:id" element={<Keyed as={PostEditor} />} />
      <Route path="*" element={<Navigate to="/website" replace />} />
    </Routes>
  );
}
