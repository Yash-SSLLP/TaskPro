/**
 * The website's settings, one form saved together: the brand, the site's
 * address and whether search engines may index it, the header and footer,
 * social profiles, contact details, the announcement bar, the blog's heading
 * and the box at the end of each post, the 404 page's words, search defaults,
 * Google's verification code and redirects.
 *
 * Each save sends the settings' `version`: if someone else saved since this
 * form was opened, the answer is 409 and the form offers to reload.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { Button, Card, ErrorState, Input, Select, Spinner, Switch, Textarea, useConfirm } from '../../ui';
import { MediaField } from './MediaPicker';
import { ConflictBanner, Counted, hrefError, isHttpsUrl, isSafeHref, LinkFields, ListEditor, Panel, saveFailed, useSiteSettings, useUnsavedGuard } from './shared';

const PLANNED_URL = 'https://www.karoindia.in';

const link = (l = {}) => ({ label: l.label || '', href: l.href || '' });

/** The settings as the form holds them: every field there, in one order. */
function formOf(s = {}) {
  return {
    brandName: s.brandName || '',
    tagline: s.tagline || '',
    siteUrl: s.siteUrl || '',
    indexing: !!s.indexing,
    seo: {
      titleTemplate: s.seo?.titleTemplate || '',
      defaultDescription: s.seo?.defaultDescription || '',
      defaultOgImage: s.seo?.defaultOgImage || null,
      googleSiteVerification: s.seo?.googleSiteVerification || '',
    },
    nav: (s.nav || []).map(link),
    headerCta: { login: link(s.headerCta?.login), register: link(s.headerCta?.register) },
    footer: { columns: (s.footer?.columns || []).map((c) => ({ title: c.title || '', links: (c.links || []).map(link) })), note: s.footer?.note || '' },
    socials: Object.fromEntries(['instagram', 'youtube', 'linkedin', 'x', 'facebook', 'whatsapp'].map((k) => [k, s.socials?.[k] || ''])),
    contact: { email: s.contact?.email || '', phone: s.contact?.phone || '', whatsapp: s.contact?.whatsapp || '', address: s.contact?.address || '' },
    announcement: { enabled: !!s.announcement?.enabled, text: s.announcement?.text || '', href: s.announcement?.href || '' },
    blog: {
      title: s.blog?.title || '',
      description: s.blog?.description || '',
      cta: {
        title: s.blog?.cta?.title || '',
        text: s.blog?.cta?.text || '',
        primary: link(s.blog?.cta?.primary),
        secondary: link(s.blog?.cta?.secondary),
      },
    },
    notFound: { title: s.notFound?.title || '', text: s.notFound?.text || '' },
    redirects: (s.redirects || []).map((r) => ({ from: r.from || '', to: r.to || '', status: r.status === 302 ? 302 : 301 })),
  };
}

const SOCIALS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://www.instagram.com/…' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://www.youtube.com/@…' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://www.linkedin.com/company/…' },
  { key: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/…' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://www.facebook.com/…' },
];

const isSiteUrl = (v) => !v || /^https:\/\/[^\s/]+\.[^\s]+$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(v);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
// Only the website's own addresses reach the server (vercel.json; backend/src/site/links.js SITE_PATH), pictures aside.
const SITE_PATH = /^\/(?:$|(?:features|for|about|contact|privacy|terms|blog|rss\.xml|sitemap\.xml|robots\.txt|llms\.txt)(?:\/|$))/;
const isRedirectFrom = (v) => /^\/[a-z0-9\-._~/%]*$/i.test(v) && !v.endsWith('/') && !v.includes('//') && SITE_PATH.test(v.toLowerCase());

/** What is wrong, by field path ('' = nothing). */
function check(f) {
  const e = {};
  if (!f.brandName.trim()) e.brandName = 'The brand name is needed.';
  if (!isSiteUrl(f.siteUrl.trim())) e.siteUrl = 'Use the full address starting with https://, e.g. https://www.karoindia.in';
  if (f.seo.titleTemplate && !f.seo.titleTemplate.includes('%s')) e.titleTemplate = 'Put %s where the page title goes, e.g. “%s · Karo”.';
  if (!/^[A-Za-z0-9_-]*$/.test(f.seo.googleSiteVerification)) e.googleSiteVerification = 'Paste only the code (letters, numbers, - and _).';
  f.nav.forEach((n, i) => {
    if (!n.label.trim() || !n.href.trim() || !isSafeHref(n.href)) e[`nav.${i}`] = 'Each menu link needs words and a working address.';
  });
  for (const s of SOCIALS) if (f.socials[s.key] && !isHttpsUrl(f.socials[s.key])) e[`socials.${s.key}`] = 'Use the full address, starting with https://';
  const wa = f.socials.whatsapp.trim();
  if (wa && !/^https:\/\//i.test(wa) && !/^\+?[\d\s-]{8,20}$/.test(wa)) e['socials.whatsapp'] = 'Use a wa.me link (https://wa.me/91…) or a phone number.';
  if (f.contact.email && !isEmail(f.contact.email.trim())) e['contact.email'] = 'That email address does not look right.';
  for (const [k, v] of [
    ['announcement.href', f.announcement.href],
    ['headerCta.login', f.headerCta.login.href],
    ['headerCta.register', f.headerCta.register.href],
    ['blog.cta.primary', f.blog.cta.primary.href],
    ['blog.cta.secondary', f.blog.cta.secondary.href],
  ])
    if (hrefError(v)) e[k] = hrefError(v);
  f.footer.columns.forEach((c, i) => c.links.forEach((l, j) => hrefError(l.href) && (e[`footer.${i}.${j}`] = hrefError(l.href))));
  f.redirects.forEach((r, i) => {
    if (!isRedirectFrom(r.from.trim())) e[`redirects.${i}.from`] = 'A website address such as /features/old-name or /blog/old-post (no trailing slash).';
    if (!isSafeHref(r.to)) e[`redirects.${i}.to`] = 'A page on this site (starting with /) or an https:// address.';
    else if (r.from.trim().toLowerCase() === r.to.trim().toLowerCase()) e[`redirects.${i}.to`] = 'A redirect cannot point at itself.';
  });
  return e;
}

/** The site's address and indexing, in plain words. */
function IndexingStatus({ effective, changed }) {
  if (!effective) return null;
  const host = effective.indexedHost;
  const tone = effective.indexing && host ? 'good' : effective.indexing ? 'warn' : 'off';
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : Info;
  const source = { settings: 'the Site URL above', env: 'SITE_URL on the server', request: 'this address, since no Site URL is set' }[effective.siteUrlSource] || '';
  return (
    <div
      className={clsx(
        'space-y-2 rounded-xl border px-3.5 py-3 text-sm',
        tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-line bg-well text-ink-soft'
      )}
      role="status"
    >
      <p className="flex items-start gap-2 font-medium">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {tone === 'good' && `Search engines may index the site on ${host}. Every other address (like taskpro-self.vercel.app) still says noindex.`}
          {tone === 'warn' && 'Indexing is on, but it needs a Site URL: until one is set, every page says noindex.'}
          {tone === 'off' && 'Search engines are asked not to index the site: every page says noindex and robots.txt says Disallow.'}
        </span>
      </p>
      <p className="pl-6">
        Canonical address: <span className="break-all font-mono text-[13px]">{effective.siteUrl || '—'}</span>
        {source && <span className="text-[13px] opacity-80"> (from {source})</span>}
      </p>
      {effective.indexingForced && <p className="pl-6">SITE_INDEXING=on is set on the server, so indexing stays on whatever the switch says.</p>}
      {changed && <p className="pl-6 font-medium">Save to apply your change.</p>}
    </div>
  );
}

const SECTIONS = [
  ['site-brand', 'Brand'],
  ['site-address', 'Address and search'],
  ['site-header', 'Header'],
  ['site-footer', 'Footer'],
  ['site-social', 'Social profiles'],
  ['site-contact', 'Contact'],
  ['site-announce', 'Announcement'],
  ['site-blog', 'Blog'],
  ['site-notfound', 'Page not found'],
  ['site-seo', 'Search defaults'],
  ['site-redirects', 'Redirects'],
];

export function SettingsTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const query = useSiteSettings();
  const [server, setServer] = useState(null); // { settings, effective } as last loaded or saved
  const [form, setForm] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState('');
  const [tried, setTried] = useState(false);

  const savedJson = useMemo(() => (server ? JSON.stringify(formOf(server.settings)) : ''), [server]);
  const dirty = !!server && !!form && JSON.stringify(form) !== savedJson;
  useUnsavedGuard(dirty);

  const take = (data) => {
    setServer(data);
    setForm(formOf(data.settings));
    setConflict(false);
    setTried(false);
  };
  useEffect(() => {
    const fresh = query.data;
    if (fresh && (!server || (fresh.settings.version !== server.settings.version && !dirty))) take(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  if (query.error)
    return (
      <Card>
        <ErrorState error={query.error} onRetry={query.refetch} />
      </Card>
    );
  if (!form) return <Spinner label="Loading the settings" />;

  const errors = check(form);
  const shown = (key) => errors[key] || '';
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setIn = (key, patch) => setForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }));
  const setCta = (patch) => setForm((f) => ({ ...f, blog: { ...f.blog, cta: { ...f.blog.cta, ...patch } } }));

  const save = async () => {
    setTried(true);
    const bad = Object.keys(errors);
    if (bad.length) {
      toast.error(bad.length === 1 ? Object.values(errors)[0] : `${bad.length} fields need a look: they are marked in red.`);
      return;
    }
    setBusy('save');
    const sent = form;
    try {
      const res = await api.send('PUT', '/api/site/settings', { version: server.settings.version, ...sent, siteUrl: sent.siteUrl.trim() });
      qc.setQueryData(['site', 'settings'], res);
      setServer(res);
      setForm((cur) => (cur === sent ? formOf(res.settings) : cur));
      toast.success('Website settings saved. The site shows them within a minute.');
    } catch (err) {
      if (saveFailed(err, 'the website settings') === 'conflict') setConflict(true);
    } finally {
      setBusy('');
    }
  };

  const reload = async () => {
    setBusy('reload');
    const res = await query.refetch();
    setBusy('');
    if (res.data) {
      take(res.data);
      toast.success('Loaded the latest settings');
    }
  };

  const go = (id) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el?.querySelector('input,textarea,select,button')?.focus({ preventScroll: true });
  };

  const addressChanged = form.siteUrl.trim() !== (server.settings.siteUrl || '') || form.indexing !== !!server.settings.indexing;

  return (
    <div className="space-y-4">
      {conflict && <ConflictBanner what="the website settings" onReload={reload} reloading={busy === 'reload'} />}
      <div className="grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-20 lg:block">
          <ul className="space-y-0.5">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <button type="button" onClick={() => go(id)} className="w-full rounded-lg px-3 py-1.5 text-left text-sm font-medium text-ink-soft hover:bg-well hover:text-ink">
                  {label}
                </button>
              </li>
            ))}
          </ul>
          <Button className="mt-4 w-full" icon={Save} loading={busy === 'save'} disabled={!dirty || !!busy} onClick={save}>
            Save settings
          </Button>
        </nav>

        <div className="min-w-0 space-y-4 [&>section]:scroll-mt-24">
          <Panel id="site-brand" title="Brand" description="The name in the header, the footer and every page title.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Brand name" maxLength={60} value={form.brandName} onChange={(e) => set('brandName', e.target.value)} error={shown('brandName')} />
              <Input label="Tagline" optional maxLength={200} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} hint="A line under the name in the footer." />
            </div>
          </Panel>

          <Panel id="site-address" title="Address and search engines" description="Where the site lives, and whether Google and others may list it.">
            <Input
              label="Site URL"
              optional
              type="url"
              inputMode="url"
              placeholder={PLANNED_URL}
              maxLength={200}
              value={form.siteUrl}
              onChange={(e) => set('siteUrl', e.target.value)}
              error={shown('siteUrl')}
              hint="Every canonical link, the sitemap and share links use it. Empty = SITE_URL on the server, else whatever address a page is opened on."
            />
            <Switch
              label="Let search engines index the site"
              description="Only on the Site URL’s own address: indexing needs a Site URL, so preview and vercel.app addresses always stay out of search."
              checked={form.indexing}
              onChange={(v) => set('indexing', v)}
            />
            <IndexingStatus effective={server.effective} changed={addressChanged} />
            <p className="flex items-start gap-2 text-[13px] text-ink-soft">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
              <span>
                <span className="font-mono">www.karoindia.in</span> is planned. Once it is connected in Vercel, set the Site URL to{' '}
                <button type="button" className="font-mono font-medium text-brand hover:underline" onClick={() => set('siteUrl', PLANNED_URL)}>
                  {PLANNED_URL}
                </button>
                , switch indexing on, then add the site in Google Search Console.
              </span>
            </p>
          </Panel>

          <Panel id="site-header" title="Header" description="The menu at the top of every page, and its two buttons.">
            <div role="group" aria-labelledby="nav-h">
              <p id="nav-h" className="mb-2 text-sm font-medium text-ink">
                Menu links
              </p>
              <ListEditor
                items={form.nav}
                onChange={(v) => set('nav', v)}
                max={10}
                itemLabel="Link"
                compact
                newItem={() => ({ label: '', href: '' })}
                empty="No menu links: the header shows only the buttons."
                renderItem={(item, setItem, i) => (
                  <>
                    <LinkFields label={`Menu link ${i + 1}`} labelMax={40} value={item} onChange={setItem} hrefPlaceholder="/features" />
                    {tried && errors[`nav.${i}`] && <p className="mt-1 text-sm text-red-600">{errors[`nav.${i}`]}</p>}
                  </>
                )}
              />
            </div>
            <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <LinkFields label="Log in button" value={form.headerCta.login} onChange={(v) => setIn('headerCta', { login: v })} hrefPlaceholder="/sign-in" />
              <LinkFields label="Register button" value={form.headerCta.register} onChange={(v) => setIn('headerCta', { register: v })} hrefPlaceholder="/sign-up" />
            </div>
            <p className="text-[13px] text-ink-soft">The Register button hides itself while sign-up is turned off on the server. Signed-in visitors see “Open Karo” instead of both.</p>
          </Panel>

          <Panel id="site-footer" title="Footer" description="Columns of links at the bottom of every page. Keep Privacy policy, Terms and Delete account in one of them.">
            <ListEditor
              items={form.footer.columns}
              onChange={(v) => setIn('footer', { columns: v })}
              max={6}
              itemLabel="Column"
              newItem={() => ({ title: '', links: [{ label: '', href: '' }] })}
              renderItem={(col, setCol, i) => (
                <div className="space-y-3">
                  <Input label="Column heading" maxLength={60} value={col.title} onChange={(e) => setCol({ ...col, title: e.target.value })} />
                  <ListEditor
                    items={col.links}
                    onChange={(links) => setCol({ ...col, links })}
                    max={12}
                    itemLabel="Link"
                    compact
                    newItem={() => ({ label: '', href: '' })}
                    renderItem={(l, setL, j) => <LinkFields label={`Column ${i + 1}, link ${j + 1}`} value={l} onChange={setL} hrefPlaceholder="/privacy" />}
                  />
                </div>
              )}
            />
            <Textarea label="Footer note" optional rows={2} maxLength={300} value={form.footer.note} onChange={(e) => setIn('footer', { note: e.target.value })} hint="A line above “© Karo · Made in India”." />
          </Panel>

          <Panel id="site-social" title="Social profiles" description="Icons in the footer, Instagram first, and the links Google ties to Karo. Only filled ones show.">
            <div className="grid gap-4 sm:grid-cols-2">
              {SOCIALS.map((s) => (
                <Input
                  key={s.key}
                  label={s.label}
                  optional
                  type="url"
                  inputMode="url"
                  maxLength={300}
                  placeholder={s.placeholder}
                  value={form.socials[s.key]}
                  onChange={(e) => setIn('socials', { [s.key]: e.target.value.trim() })}
                  error={shown(`socials.${s.key}`)}
                />
              ))}
              <Input
                label="WhatsApp"
                optional
                maxLength={300}
                placeholder="https://wa.me/91… or +91 …"
                value={form.socials.whatsapp}
                onChange={(e) => setIn('socials', { whatsapp: e.target.value })}
                error={shown('socials.whatsapp')}
              />
            </div>
          </Panel>

          <Panel id="site-contact" title="Contact" description="Shown on the Contact page and in the footer.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Email" optional type="email" maxLength={200} value={form.contact.email} onChange={(e) => setIn('contact', { email: e.target.value })} error={shown('contact.email')} />
              <Input label="Phone" optional type="tel" maxLength={40} value={form.contact.phone} onChange={(e) => setIn('contact', { phone: e.target.value })} />
              <Input label="WhatsApp number" optional type="tel" maxLength={40} value={form.contact.whatsapp} onChange={(e) => setIn('contact', { whatsapp: e.target.value })} />
              <Textarea label="Address" optional rows={2} maxLength={300} value={form.contact.address} onChange={(e) => setIn('contact', { address: e.target.value })} />
            </div>
          </Panel>

          <Panel id="site-announce" title="Announcement bar" description="A thin bar above the header on every page. Visitors can close it.">
            <Switch label="Show the announcement bar" checked={form.announcement.enabled} onChange={(v) => setIn('announcement', { enabled: v })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Text" maxLength={200} value={form.announcement.text} onChange={(e) => setIn('announcement', { text: e.target.value })} hint={form.announcement.enabled && !form.announcement.text.trim() ? 'The bar shows only with some text.' : undefined} />
              <Input label="Link" optional maxLength={500} placeholder="/blog/…" value={form.announcement.href} onChange={(e) => setIn('announcement', { href: e.target.value })} error={shown('announcement.href')} />
            </div>
          </Panel>

          <Panel id="site-blog" title="Blog" description="The heading and introduction of /blog, and the box at the end of every post.">
            <Input label="Blog title" maxLength={120} value={form.blog.title} onChange={(e) => setIn('blog', { title: e.target.value })} />
            <Counted label="Blog description" optional multiline rows={2} ideal={155} max={320} value={form.blog.description} onChange={(v) => setIn('blog', { description: v })} />
            <div role="group" aria-labelledby="settings-post-cta-h" className="space-y-4 border-t border-line pt-4">
              <p id="settings-post-cta-h" className="text-sm font-medium text-ink">
                Box at the end of every post
              </p>
              <Input label="Heading" optional maxLength={160} placeholder={`Give your next task in ${form.brandName || 'Karo'}`} value={form.blog.cta.title} onChange={(e) => setCta({ title: e.target.value })} />
              <Textarea label="Text" optional rows={2} maxLength={500} placeholder="Free for you and everyone you work with. Set up in a minute, on Android, iPhone or the web." value={form.blog.cta.text} onChange={(e) => setCta({ text: e.target.value })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <LinkFields label="Main button" value={form.blog.cta.primary} onChange={(v) => setCta({ primary: v })} hrefPlaceholder="/sign-up" />
                <LinkFields label="Second button" value={form.blog.cta.secondary} onChange={(v) => setCta({ secondary: v })} hrefPlaceholder="/get-app" />
              </div>
              <p className="text-[13px] text-ink-soft">Empty fields show the words in grey. The Register button hides itself while sign-up is turned off.</p>
            </div>
          </Panel>

          <Panel id="site-notfound" title="Page not found" description="What a visitor sees on an address that doesn’t exist (the 404 page), above links to Home, Features, the blog and Log in.">
            <Input label="Heading" optional maxLength={160} placeholder="We could not find that page" value={form.notFound.title} onChange={(e) => setIn('notFound', { title: e.target.value })} />
            <Textarea label="Text" optional rows={2} maxLength={500} placeholder="The link may be old, or the page may have moved. These are a good place to start:" value={form.notFound.text} onChange={(e) => setIn('notFound', { text: e.target.value })} />
          </Panel>

          <Panel id="site-seo" title="Search defaults" description="Used where a page doesn’t set its own.">
            <Input
              label="Title pattern"
              maxLength={80}
              placeholder="%s · Karo"
              value={form.seo.titleTemplate}
              onChange={(e) => setIn('seo', { titleTemplate: e.target.value })}
              error={shown('titleTemplate')}
              hint="%s is the page title. A title that already has the brand name is used as it is."
            />
            <Counted
              label="Default description"
              optional
              multiline
              rows={3}
              ideal={155}
              max={320}
              value={form.seo.defaultDescription}
              onChange={(v) => setIn('seo', { defaultDescription: v })}
            />
            <MediaField
              label="Default share picture"
              optional
              value={form.seo.defaultOgImage}
              onChange={(id) => setIn('seo', { defaultOgImage: id })}
              hint="Shown when a page without its own picture is shared. 1200 × 630 works best. Empty = Karo’s built-in picture."
            />
            <Input
              label="Google site verification"
              optional
              maxLength={200}
              placeholder="The code from Search Console’s HTML tag"
              value={form.seo.googleSiteVerification}
              onChange={(e) => {
                // A pasted <meta … content="CODE"> keeps just the code.
                const v = e.target.value;
                const m = /content=["']([^"']+)["']/i.exec(v);
                setIn('seo', { googleSiteVerification: (m ? m[1] : v).trim() });
              }}
              error={shown('googleSiteVerification')}
              hint="Search Console → Add property → HTML tag. Paste the tag or just its code. Verifying by DNS is better once the domain is yours."
            />
          </Panel>

          <Panel id="site-redirects" title="Redirects" description="Send an old address to a new one, before any page is looked up. 301 is permanent (search engines move to the new address); 302 is for now.">
            <ListEditor
              items={form.redirects}
              onChange={(v) => set('redirects', v)}
              max={200}
              itemLabel="Redirect"
              compact
              newItem={() => ({ from: '', to: '', status: 301 })}
              empty="No redirects."
              renderItem={(r, setR, i) => (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px]">
                  <Input
                    aria-label={`Redirect ${i + 1}: from`}
                    placeholder="/features/old-name"
                    inputClassName="font-mono text-[13.5px]"
                    maxLength={300}
                    value={r.from}
                    onChange={(e) => setR({ ...r, from: e.target.value.trim() })}
                    error={r.from || tried ? errors[`redirects.${i}.from`] : ''}
                  />
                  <Input
                    aria-label={`Redirect ${i + 1}: to`}
                    placeholder="/features/new-name"
                    inputClassName="font-mono text-[13.5px]"
                    maxLength={500}
                    value={r.to}
                    onChange={(e) => setR({ ...r, to: e.target.value.trim() })}
                    error={r.to || tried ? errors[`redirects.${i}.to`] : ''}
                  />
                  <Select aria-label={`Redirect ${i + 1}: kind`} value={String(r.status)} onChange={(e) => setR({ ...r, status: Number(e.target.value) })}>
                    <option value="301">301 permanent</option>
                    <option value="302">302 for now</option>
                  </Select>
                </div>
              )}
            />
          </Panel>
        </div>
      </div>

      <div className={clsx('sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 lg:bottom-4', !dirty && 'hidden')}>
        <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card/95 px-4 py-2.5 shadow-pop backdrop-blur">
          <span className="text-sm font-medium text-ink">Unsaved changes</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={async () => {
                if (await confirm({ title: 'Discard your changes?', text: 'The settings go back to how they were last saved.', confirmLabel: 'Discard', tone: 'warning' })) take(server);
              }}
            >
              Discard
            </Button>
            <Button size="sm" icon={Save} loading={busy === 'save'} disabled={!!busy} onClick={save}>
              Save settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
