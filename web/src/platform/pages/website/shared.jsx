/**
 * Pieces the Website tabs share: the site's settings, link and slug rules
 * (the same as backend/src/site/links.js, so a form can say what is wrong
 * before saving), save errors, the unsaved-changes guard, counted fields,
 * list editors and the sandboxed preview.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ExternalLink, Monitor, Moon, Plus, RefreshCw, Smartphone, Sun, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { useTheme } from '../../theme';
import { Badge, Button, IconButton, Input, Modal, Spinner, Textarea, useConfirm } from '../../ui';

export { useDebounced } from '../console/shared';

// ---------------------------------------------------------------- the site's settings

/** GET /api/site/settings: { settings, effective: { siteUrl, siteUrlSource, indexing, indexingForced, indexedHost } }. */
export function useSiteSettings() {
  return useQuery({ queryKey: ['site', 'settings'], queryFn: () => api.get('/api/site/settings'), staleTime: 60_000 });
}

// ---------------------------------------------------------------- the server's rules

/** "Hello, World!" → "hello-world" (backend/src/site/links.js slugify). */
export function slugify(text, max = 80) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A link the site may print: "/…" (not "//"), "#…", https:, http:, mailto:, tel:. */
export function isSafeHref(href) {
  const h = String(href || '').trim();
  if (!h || h.length > 500 || /[\u0000-\u001f\u007f\s\\]/.test(h)) return false;
  if (h.startsWith('#')) return true;
  if (h.startsWith('/')) return !h.startsWith('//');
  return /^(https?:\/\/[^/]|mailto:|tel:)/i.test(h);
}

export const HREF_HINT = 'Use a link on this site (starting with /) or one starting with https://, mailto: or tel:';

/** The error to show under a link field, or ''. */
export const hrefError = (href) => (String(href || '').trim() && !isSafeHref(href) ? HREF_HINT : '');

export const isHttpsUrl = (v) => /^https:\/\/[^\s/]+\.[^\s]+$/i.test(String(v || '').trim());

// ---------------------------------------------------------------- saving

/**
 * Show why a save failed. Another save since this one was opened is a 409
 * CHANGED_ELSEWHERE: say so plainly and hand back 'conflict' so the editor
 * can offer to reload.
 */
export function saveFailed(err, what = 'this') {
  if (err?.code === 'CHANGED_ELSEWHERE') {
    toast.error(`Someone else changed ${what} — reload to see their version`);
    return 'conflict';
  }
  toast.error(err?.message || 'Could not save. Please try again.');
  return 'error';
}

/** The banner an editor shows after a 409, with its Reload button. */
export function ConflictBanner({ what = 'this page', onReload, reloading }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
      <p className="min-w-0 flex-1 basis-60">
        <span className="font-semibold">Someone else changed {what}</span> — reload to see their version. Your unsaved changes here will be lost.
      </p>
      <Button size="sm" variant="secondary" icon={RefreshCw} loading={reloading} onClick={onReload}>
        Reload
      </Button>
    </div>
  );
}

/**
 * Ask before leaving with unsaved changes: closing the tab or reloading
 * (the browser's own question), and any in-app link to another screen (ours;
 * /website?tab=… keeps the Settings form, so a tab change isn't asked about).
 * BrowserRouter has no blocker, so links are caught on their way in; the
 * browser's Back button is not.
 */
export function useUnsavedGuard(dirty) {
  const confirm = useConfirm();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const ask = useCallback(
    () =>
      confirm({
        title: 'Leave without saving?',
        text: 'Your changes on this screen have not been saved.',
        confirmLabel: 'Leave',
        cancelLabel: 'Stay',
        tone: 'warning',
      }),
    [confirm]
  );

  useEffect(() => {
    const onUnload = (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    // A link anywhere in the app (the sidebar too), before React Router sees it.
    const onClick = (e) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href]');
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      ask().then((ok) => {
        if (!ok) return;
        dirtyRef.current = false;
        a.click();
      });
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [ask]);
}

// ---------------------------------------------------------------- status

/** Draft / Published / Scheduled, and whether the draft differs from what is live. */
export function StatusBadge({ status, scheduled, changed }) {
  if (scheduled) return <Badge tone="brand">Scheduled</Badge>;
  if (status === 'published') {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Badge tone="green">Published</Badge>
        {changed && <Badge tone="amber">Draft changes</Badge>}
      </span>
    );
  }
  return <Badge tone="neutral">Draft</Badge>;
}

// ---------------------------------------------------------------- fields

/** A card with a heading over a group of fields. */
export function Panel({ title, description, actions, children, className, id }) {
  return (
    <section id={id} className={clsx('rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5', className)} aria-labelledby={id ? `${id}-h` : undefined}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h2 id={id ? `${id}-h` : undefined} className="text-[15px] font-semibold text-ink">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/**
 * A text field that counts: `ideal` is what search results show (the count
 * turns amber past it), `max` what the server keeps.
 */
export function Counted({ label, value, onChange, ideal, max, multiline = false, rows = 3, hint, optional, placeholder, error }) {
  const n = String(value || '').length;
  const over = n > ideal;
  const Field = multiline ? Textarea : Input;
  return (
    <div className="relative">
      <Field
        label={label}
        optional={optional}
        value={value || ''}
        maxLength={max}
        rows={multiline ? rows : undefined}
        placeholder={placeholder}
        error={error}
        hint={over ? `Longer than search results usually show (about ${ideal} characters).` : hint}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={clsx('tnum pointer-events-none absolute right-0 top-0.5 text-xs font-semibold', over ? 'text-amber-700' : 'text-ink-faint')} aria-hidden>
        {n}/{ideal}
      </span>
    </div>
  );
}

/** A link: its words and where it goes. */
export function LinkFields({ label, value, onChange, labelMax = 60, hrefPlaceholder = '/sign-up' }) {
  const v = value || {};
  return (
    <fieldset className="min-w-0">
      {label && <legend className="mb-1.5 text-sm font-medium text-ink">{label}</legend>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label={`${label || 'Link'}: words`} placeholder="Words on the button" maxLength={labelMax} value={v.label || ''} onChange={(e) => onChange({ ...v, label: e.target.value })} />
        <Input
          aria-label={`${label || 'Link'}: address`}
          placeholder={hrefPlaceholder}
          maxLength={500}
          value={v.href || ''}
          error={hrefError(v.href)}
          onChange={(e) => onChange({ ...v, href: e.target.value })}
        />
      </div>
    </fieldset>
  );
}

const move = (list, from, to) => {
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
};

/**
 * A list a person adds to, removes from and puts in order (↑/↓, no drag).
 * `renderItem(item, set, index)` draws one row's fields.
 */
export function ListEditor({ items = [], onChange, max = 20, itemLabel = 'Item', addLabel, newItem, renderItem, empty, compact = false }) {
  const list = items || [];
  const set = (i, value) => onChange(list.map((it, j) => (j === i ? value : it)));
  return (
    <div className="space-y-2">
      {list.length === 0 && empty && <p className="rounded-xl border border-dashed border-line px-3 py-3 text-sm text-ink-faint">{empty}</p>}
      {list.map((item, i) => (
        <fieldset key={i} className={clsx('min-w-0 rounded-xl border border-line bg-well/60', compact ? 'p-2' : 'p-3')}>
          <legend className="sr-only">
            {itemLabel} {i + 1}
          </legend>
          <div className={clsx('flex items-center justify-between gap-2', compact ? 'mb-1' : 'mb-2')}>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft" aria-hidden>
              {itemLabel} {i + 1}
            </span>
            <div className="-mr-1 flex items-center">
              <IconButton icon={ArrowUp} label={`Move ${itemLabel.toLowerCase()} ${i + 1} up`} className="h-8 w-8" disabled={i === 0} onClick={() => onChange(move(list, i, i - 1))} />
              <IconButton
                icon={ArrowDown}
                label={`Move ${itemLabel.toLowerCase()} ${i + 1} down`}
                className="h-8 w-8"
                disabled={i === list.length - 1}
                onClick={() => onChange(move(list, i, i + 1))}
              />
              <IconButton
                icon={Trash2}
                label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}
                className="h-8 w-8 hover:text-red-600"
                onClick={() => onChange(list.filter((_, j) => j !== i))}
              />
            </div>
          </div>
          {renderItem(item, (value) => set(i, value), i)}
        </fieldset>
      ))}
      {list.length < max ? (
        <Button size="sm" variant="soft" icon={Plus} onClick={() => onChange([...list, typeof newItem === 'function' ? newItem() : newItem])}>
          {addLabel || `Add ${itemLabel.toLowerCase()}`}
        </Button>
      ) : (
        <p className="text-xs text-ink-faint">
          That is the most there can be ({max}).
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- previews

/** The site's own look for a bit of rendered Markdown, for a sandboxed <iframe srcdoc>: no scripts, our styles only. */
export function articleDoc({ title = '', excerpt = '', bodyHtml = '', dark = false }) {
  const origin = window.location.origin;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<!doctype html><html lang="en-IN"${dark ? ' class="dark"' : ''}><head><meta charset="utf-8"><base href="${origin}/">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${origin} https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src ${origin} data:">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap"><link rel="stylesheet" href="/site/site.css"></head>
<body><article class="post"><header class="post-head"><div class="wrap wrap-narrow">${title ? `<h1>${esc(title)}</h1>` : ''}${excerpt ? `<p class="lead">${esc(excerpt)}</p>` : ''}</div></header>
<div class="wrap wrap-narrow post-body"><div class="prose">${bodyHtml}</div></div></article></body></html>`;
}

/** Put the preview in the dark theme (the site reads html.dark). */
const darken = (html, dark) => (dark ? String(html).replace(/<html\b([^>]*)>/i, (m, attrs) => (/class=/.test(attrs) ? m : `<html${attrs} class="dark">`)) : html);

/**
 * The page as visitors would see it, from POST /api/site/preview, in an
 * <iframe sandbox=""> (no scripts, its own origin): desktop or phone width,
 * light or dark. The page loads its stylesheet and pictures from this
 * address. (On a localhost dev server, Chromium refuses a sandboxed frame's
 * requests to localhost, so the preview shows without its styles there; on
 * the real site it is styled.)
 */
export function PreviewModal({ open, onClose, html, loading, error, title = 'Preview', path }) {
  const scheme = useTheme((s) => s.scheme);
  const [width, setWidth] = useState('desktop');
  const [dark, setDark] = useState(scheme === 'dark');
  useEffect(() => {
    if (open) setDark(scheme === 'dark');
  }, [open, scheme]);
  // On a phone only the icon shows, so each button names itself (`name`: what pressing it turns on).
  const toggle = (on, icon, text, onClick, name = text) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={name}
      title={name}
      className={clsx('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors', on ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-well hover:text-ink')}
    >
      {icon}
      <span className="hidden sm:inline" aria-hidden>
        {text}
      </span>
    </button>
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      compact
      title={title}
      subtitle={path ? `${path} · not saved, not on the site, never indexed` : 'Not saved, not on the site, never indexed'}
      bodyClassName="bg-well p-0"
      actions={
        <div className="mr-1 flex items-center gap-0.5" role="group" aria-label="Preview size and theme">
          {toggle(width === 'desktop', <Monitor className="h-4 w-4" aria-hidden />, 'Desktop', () => setWidth('desktop'))}
          {toggle(width === 'phone', <Smartphone className="h-4 w-4" aria-hidden />, 'Phone', () => setWidth('phone'))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {toggle(dark, dark ? <Moon className="h-4 w-4" aria-hidden /> : <Sun className="h-4 w-4" aria-hidden />, dark ? 'Dark' : 'Light', () => setDark((d) => !d), 'Dark theme')}
        </div>
      }
    >
      <div className="flex min-h-[60vh] justify-center p-2 sm:p-4">
        {loading ? (
          <Spinner label="Drawing the preview" />
        ) : error ? (
          <p className="self-center px-6 text-center text-sm text-red-700">{error}</p>
        ) : (
          <iframe
            title={`${title}: ${path || 'preview'}`}
            sandbox=""
            srcDoc={darken(html || '', dark)}
            className={clsx(
              'h-[72vh] rounded-xl border border-line bg-card shadow-card transition-[width]',
              width === 'phone' ? 'w-[390px] max-w-full' : 'w-full'
            )}
          />
        )}
      </div>
    </Modal>
  );
}

/** "%s · Karo" around a title, as the site writes <title> (backend/src/site/render/layout.js fullTitle). */
export function siteTitle(settings, title) {
  const brand = settings?.brandName || 'Karo';
  const text = String(title || '').trim();
  if (!text) return brand;
  if (text.toLowerCase().includes(brand.toLowerCase())) return text;
  const template = settings?.seo?.titleTemplate || `%s · ${brand}`;
  return template.includes('%s') ? template.replace('%s', () => text) : `${text} · ${brand}`;
}

/** How a page may look in Google's results. */
export function SearchSnippet({ title, url, description }) {
  return (
    <div className="rounded-xl border border-line bg-well/60 p-3">
      <p className="sr-only">How it may look in search results:</p>
      <p className="truncate text-xs text-ink-soft">{url}</p>
      <p className="mt-0.5 line-clamp-2 text-[15px] font-medium leading-snug text-brand">{title}</p>
      <p className="mt-0.5 line-clamp-3 text-[13px] leading-snug text-ink-soft">{description || <span className="italic text-ink-faint">The site’s default description</span>}</p>
    </div>
  );
}

/** A site address to open from the console: the home page needs ?home=1, or boot.js sends a signed-in visitor back to the app. */
export const liveHref = (path) => (path === '/' ? '/?home=1' : path);

/** "View live" for a published address (opens the site in a new tab). */
export function ViewLive({ href, size = 'md', children = 'View live' }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={clsx(
        'inline-flex select-none items-center justify-center gap-1.5 border border-line bg-card font-semibold text-ink shadow-sm transition-colors hover:border-slate-300 hover:bg-well',
        size === 'sm' ? 'h-8 rounded-lg px-2.5 text-[13px]' : 'h-9 rounded-xl px-3.5 text-sm'
      )}
    >
      <ExternalLink className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
      {children}
    </a>
  );
}

/** "1.2 MB" */
export function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
