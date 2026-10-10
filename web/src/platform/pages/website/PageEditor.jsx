/**
 * One page of the website: its sections (add, ↑/↓, hide, delete, open to
 * edit), its title and search details, and Save draft · Preview · Publish.
 *
 * The editor changes a copy of the draft. Save draft sends it with the page's
 * `version`, so two people editing at once can't overwrite each other: the
 * second save gets 409 CHANGED_ELSEWHERE and is asked to reload. Visitors only
 * ever see what was last published.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Eye, EyeOff, FileWarning, Globe2, Plus, Save, Send, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { formatDateTime, timeAgo } from '../../format';
import { useTz } from '../../session';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, Modal, PageHeader, Spinner, Switch, useConfirm } from '../../ui';
import { MediaField } from './MediaPicker';
import { SectionFields } from './SectionFields';
import { newSection, SECTION_TYPES, sectionSummary } from './sections';
import {
  ConflictBanner,
  Counted,
  HREF_HINT,
  isSafeHref,
  liveHref,
  Panel,
  PreviewModal,
  saveFailed,
  SearchSnippet,
  siteTitle,
  StatusBadge,
  useSiteSettings,
  useUnsavedGuard,
  ViewLive,
} from './shared';

// The home page and the privacy policy always stay published (app stores link to /privacy).
const ALWAYS_PUBLISHED = ['/', '/privacy'];
const PAGE_PATH = /^\/(features|for)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The draft as the editor holds it: every field there, in the server's order. */
const clean = (d = {}) => ({
  title: d.title || '',
  seo: { title: '', description: '', ogImage: null, noindex: false, ...(d.seo || {}) },
  sections: d.sections || [],
});

/** The first section with a link the server would refuse, or -1. */
function badLinkAt(sections) {
  const bad = (v, depth = 0) => {
    if (!v || typeof v !== 'object' || depth > 6) return false;
    if (Array.isArray(v)) return v.some((x) => bad(x, depth + 1));
    return Object.entries(v).some(([k, x]) => (k === 'href' && typeof x === 'string' && x.trim() && !isSafeHref(x)) || bad(x, depth + 1));
  };
  return sections.findIndex((s) => bad(s.props));
}

/** The "Add a section" picker: every type, with what it is for. */
function AddSectionModal({ open, onClose, onAdd }) {
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Add a section" subtitle="It goes in after the section you are on, or at the end">
      <ul className="grid gap-2 sm:grid-cols-2">
        {Object.entries(SECTION_TYPES).map(([type, t]) => (
          <li key={type}>
            <button
              type="button"
              onClick={() => onAdd(type)}
              className="flex h-full w-full items-start gap-3 rounded-xl border border-line bg-card p-3 text-left transition-colors hover:border-brand/50 hover:bg-brand-soft/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden>
                <t.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{t.label}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">{t.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** One section in the list: its row (↑ ↓ hide delete open) and, open, its form. */
function SectionCard({ section, index, count, open, first, onToggle, onMove, onHide, onRemove, onChange, headRef }) {
  const t = SECTION_TYPES[section.type] || { label: section.type, icon: Globe2, fields: [] };
  const summary = sectionSummary(section);
  const formId = `section-form-${section.id}`;
  return (
    <Card className={clsx('overflow-hidden', open && 'ring-1 ring-brand/25', section.hidden && 'bg-well/40')}>
      <div className="flex items-center gap-2 py-2 pl-2 pr-1.5 sm:gap-3 sm:pl-3">
        <button
          ref={headRef}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? formId : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <span className="tnum hidden w-5 shrink-0 text-center text-xs font-semibold text-ink-faint sm:block" aria-hidden>
            {index + 1}
          </span>
          <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', section.hidden ? 'bg-well text-ink-faint' : 'bg-brand-soft text-brand')} aria-hidden>
            <t.icon className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={clsx('text-sm font-semibold', section.hidden ? 'text-ink-soft' : 'text-ink')}>{t.label}</span>
              {section.hidden && <Badge tone="neutral">Hidden</Badge>}
              {first && section.type === 'hero' && <Badge tone="brand">Page heading</Badge>}
            </span>
            <span className={clsx('block truncate text-[13px]', summary ? 'text-ink-soft' : 'italic text-ink-faint')}>{summary || 'Empty'}</span>
          </span>
          <ChevronDown className={clsx('hidden h-4 w-4 shrink-0 text-ink-faint transition-transform sm:block', open && 'rotate-180')} aria-hidden />
        </button>
        <div className="flex shrink-0 items-center">
          <IconButton icon={ArrowUp} label={`Move ${t.label} up`} className="h-8 w-8" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon={ArrowDown} label={`Move ${t.label} down`} className="h-8 w-8" disabled={index === count - 1} onClick={() => onMove(1)} />
          <IconButton
            icon={section.hidden ? EyeOff : Eye}
            label={section.hidden ? `Show ${t.label} on the page` : `Hide ${t.label} from the page`}
            aria-pressed={section.hidden}
            className={clsx('h-8 w-8', section.hidden && 'text-amber-700')}
            onClick={onHide}
          />
          <IconButton icon={Trash2} label={`Delete ${t.label}`} className="h-8 w-8 hover:text-red-600" onClick={onRemove} />
        </div>
      </div>
      {open && (
        <div id={formId} className="border-t border-line px-3 py-4 sm:px-5">
          <p className="mb-4 text-[13px] text-ink-soft">{t.description}</p>
          <SectionFields fields={t.fields} values={section.props || {}} onChange={onChange} />
        </div>
      )}
    </Card>
  );
}

export function PageEditor() {
  const { id } = useParams();
  const tz = useTz();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const site = useSiteSettings().data;
  const settings = site?.settings;
  const query = useQuery({ queryKey: ['site', 'page', id], queryFn: () => api.get(`/api/site/pages/${id}`), staleTime: 0 });

  // The page as last loaded or saved (the cache's copy at first, refreshed below).
  const [server, setServer] = useState(() => qc.getQueryData(['site', 'page', id])?.page || null);
  const [draft, setDraft] = useState(() => (server ? clean(server.draft) : null)); // { title, seo, sections } being edited
  const [path, setPath] = useState(() => server?.path || '');
  const [openIds, setOpenIds] = useState(() => new Set());
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState('');
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState({ open: false });
  const heads = useRef(new Map());
  const focusId = useRef(null);

  const savedJson = useMemo(() => (server ? JSON.stringify(clean(server.draft)) : ''), [server]);
  const dirty = !!server && !!draft && (JSON.stringify(draft) !== savedJson || path !== server.path);
  // Closing the tab or following a link with unsaved changes asks first.
  useUnsavedGuard(dirty);

  const take = (page) => {
    setServer(page);
    setDraft(clean(page.draft));
    setPath(page.path);
    setConflict(false);
  };
  // The server's copy when it arrives, and a newer one while nothing here is changed.
  useEffect(() => {
    const fresh = query.data?.page;
    if (fresh && (!server || (fresh.version !== server.version && !dirty))) take(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  // A new section's row takes focus, and opens in view.
  useEffect(() => {
    if (!focusId.current) return;
    const el = heads.current.get(focusId.current);
    focusId.current = null;
    el?.focus();
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  if (query.error) {
    return (
      <div className="mx-auto max-w-6xl">
        <BackLink />
        <Card className="mt-3">
          {query.error.status === 404 ? (
            <EmptyState icon={FileWarning} title="Page not found" text="It may have been deleted." action={<Button to="/website">Back to pages</Button>} />
          ) : (
            <ErrorState error={query.error} onRetry={query.refetch} />
          )}
        </Card>
      </div>
    );
  }
  if (!server || !draft) return <Spinner label="Loading the page" />;

  const sections = draft.sections;
  const setSections = (next) => setDraft((d) => ({ ...d, sections: typeof next === 'function' ? next(d.sections) : next }));
  const setSeo = (patch) => setDraft((d) => ({ ...d, seo: { ...d.seo, ...patch } }));
  const toggleOpen = (sid) =>
    setOpenIds((s) => {
      const next = new Set(s);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  const moveSection = (i, by) =>
    setSections((list) => {
      const next = [...list];
      const [it] = next.splice(i, 1);
      next.splice(i + by, 0, it);
      return next;
    });
  const removeSection = async (i) => {
    const s = sections[i];
    const label = SECTION_TYPES[s.type]?.label || s.type;
    const ok = await confirm({
      title: `Delete the ${label} section?`,
      text: sectionSummary(s) || undefined,
      details: ['It goes from the draft now; visitors still see it until you publish.', 'To keep it but not show it, hide it instead.'],
      confirmLabel: 'Delete section',
    });
    if (ok) setSections((list) => list.filter((x) => x.id !== s.id));
  };
  const addSection = (type) => {
    const s = newSection(type);
    // After the last open section, else at the end.
    const after = sections.reduce((at, x, i) => (openIds.has(x.id) ? i : at), -1);
    setSections((list) => {
      const next = [...list];
      next.splice(after >= 0 ? after + 1 : next.length, 0, s);
      return next;
    });
    setOpenIds((o) => new Set(o).add(s.id));
    focusId.current = s.id;
    setAdding(false);
  };

  // ------------------------------------------------------------ saving

  const pathOk = server.system || PAGE_PATH.test(path);

  /** PATCH the draft (and a moved address); the saved page, or null after an error toast. */
  const persist = async () => {
    const at = badLinkAt(sections);
    if (at >= 0) {
      const s = sections[at];
      toast.error(`Section ${at + 1} (${SECTION_TYPES[s.type]?.label || s.type}) has a link that won’t work. ${HREF_HINT}.`);
      setOpenIds((o) => new Set(o).add(s.id));
      return null;
    }
    if (!pathOk) {
      toast.error('The address is /features/<name> or /for/<name>: lowercase letters, numbers and dashes.');
      return null;
    }
    const sent = draft;
    try {
      const body = { version: server.version, draft: sent };
      if (!server.system && path !== server.path) body.path = path;
      const { page } = await api.patch(`/api/site/pages/${id}`, body);
      setServer(page);
      setPath(page.path);
      setDraft((cur) => (cur === sent ? clean(page.draft) : cur));
      qc.setQueryData(['site', 'page', id], { page });
      qc.invalidateQueries({ queryKey: ['site', 'pages'] });
      return page;
    } catch (err) {
      if (saveFailed(err, 'this page') === 'conflict') setConflict(true);
      return null;
    }
  };

  const run = async (kind, fn) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy('');
    }
  };

  const saveDraft = () =>
    run('save', async () => {
      if (await persist()) toast.success('Draft saved. Publish it when you want visitors to see it.');
    });

  const publish = () =>
    run('publish', async () => {
      const page = dirty ? await persist() : server;
      if (!page) return;
      try {
        const res = await api.post(`/api/site/pages/${id}/publish`, { version: page.version });
        setServer(res.page);
        qc.setQueryData(['site', 'page', id], res);
        qc.invalidateQueries({ queryKey: ['site', 'pages'] });
        toast.success(`Published. Visitors see ${res.page.path} now (within a minute).`);
      } catch (err) {
        if (saveFailed(err, 'this page') === 'conflict') setConflict(true);
      }
    });

  const unpublish = async () => {
    const ok = await confirm({
      title: `Take ${server.path} off the site?`,
      text: 'Visitors get “page not found” until you publish it again. The draft stays here.',
      confirmLabel: 'Unpublish',
      tone: 'warning',
    });
    if (!ok) return;
    await run('unpublish', async () => {
      try {
        const res = await api.post(`/api/site/pages/${id}/unpublish`, { version: server.version });
        setServer(res.page);
        qc.setQueryData(['site', 'page', id], res);
        qc.invalidateQueries({ queryKey: ['site', 'pages'] });
        toast.success(`${res.page.path} is off the site`);
      } catch (err) {
        if (saveFailed(err, 'this page') === 'conflict') setConflict(true);
      }
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${server.path}?`,
      text: 'The page and its draft are deleted. Visitors who open the address get “page not found”.',
      details: ['Add a redirect in Settings if other pages or people link to it.'],
      confirmLabel: 'Delete page',
    });
    if (!ok) return;
    await run('delete', async () => {
      try {
        await api.del(`/api/site/pages/${id}`);
        qc.invalidateQueries({ queryKey: ['site', 'pages'] });
        qc.removeQueries({ queryKey: ['site', 'page', id] });
        toast.success(`${server.path} is deleted`);
        navigate('/website', { replace: true });
      } catch (err) {
        toast.error(err.message);
      }
    });
  };

  const reload = async () => {
    setBusy('reload');
    const res = await query.refetch();
    setBusy('');
    if (res.data?.page) {
      take(res.data.page);
      toast.success('Loaded the latest version');
    }
  };

  const openPreview = async () => {
    setPreview({ open: true, loading: true });
    try {
      const { html } = await api.post('/api/site/preview', { kind: 'page', data: draft, path: server.path });
      setPreview({ open: true, html });
    } catch (err) {
      setPreview({ open: true, error: err.message });
    }
  };

  const published = server.status === 'published';
  const firstHero = sections.find((s) => !s.hidden)?.type === 'hero';
  const titleShown = siteTitle(settings, draft.seo.title || draft.title);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        back={<BackLink />}
        title={draft.title || server.path}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px]">{server.path}</span>
            <StatusBadge status={server.status} changed={published && server.changed} />
            {dirty && (
              <Badge tone="amber">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                Unsaved changes
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            {published && <ViewLive href={liveHref(server.path)} />}
            <Button variant="secondary" icon={Eye} onClick={openPreview}>
              Preview
            </Button>
            <Button variant="secondary" icon={Save} loading={busy === 'save'} disabled={!!busy || !dirty} onClick={saveDraft}>
              Save draft
            </Button>
            <Button icon={Send} loading={busy === 'publish'} disabled={!!busy || (published && !server.changed && !dirty)} onClick={publish}>
              {!published ? 'Publish' : server.changed || dirty ? 'Publish changes' : 'Published'}
            </Button>
          </>
        }
      />

      {conflict && <ConflictBanner what="this page" onReload={reload} reloading={busy === 'reload'} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section aria-labelledby="sections-h" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="sections-h" className="text-[15px] font-semibold text-ink">
                Sections
              </h2>
              <p className="text-sm text-ink-soft">
                Top to bottom, as visitors see them. {firstHero ? 'The first section’s heading is the page’s main heading.' : 'The page title is shown as the main heading, since the page doesn’t open with a hero.'}
              </p>
            </div>
            {sections.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpenIds(openIds.size ? new Set() : new Set(sections.map((s) => s.id)))}
              >
                {openIds.size ? 'Close all' : 'Open all'}
              </Button>
            )}
          </div>
          {sections.length === 0 && (
            <Card>
              <EmptyState icon={Plus} title="No sections yet" text="Add a hero to open the page, then the sections you need." className="py-10" />
            </Card>
          )}
          {sections.map((s, i) => (
            <SectionCard
              key={s.id}
              section={s}
              index={i}
              count={sections.length}
              first={i === 0}
              open={openIds.has(s.id)}
              headRef={(el) => (el ? heads.current.set(s.id, el) : heads.current.delete(s.id))}
              onToggle={() => toggleOpen(s.id)}
              onMove={(by) => moveSection(i, by)}
              onHide={() => setSections((list) => list.map((x) => (x.id === s.id ? { ...x, hidden: !x.hidden } : x)))}
              onRemove={() => removeSection(i)}
              onChange={(props) => setSections((list) => list.map((x) => (x.id === s.id ? { ...x, props } : x)))}
            />
          ))}
          <button
            type="button"
            onClick={() => (sections.length >= 40 ? toast.error('A page has at most 40 sections.') : setAdding(true))}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-4 text-sm font-semibold text-ink-soft transition-colors hover:border-brand/50 hover:bg-brand-soft/30 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add a section
          </button>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <Panel title="Page">
            <Input label="Title" maxLength={140} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} hint="Names the page in this list, in breadcrumbs, and in search results when the search title is empty." />
            {server.system ? (
              <div>
                <p className="text-sm font-medium text-ink">Address</p>
                <p className="mt-1 font-mono text-sm text-ink-soft">{server.path}</p>
                <p className="mt-1 text-xs text-ink-faint">One of the site’s main pages: it stays at this address.</p>
              </div>
            ) : (
              <Input
                label="Address"
                inputClassName="font-mono text-[14px]"
                maxLength={120}
                value={path}
                onChange={(e) => setPath(e.target.value.toLowerCase().trim())}
                error={pathOk ? '' : 'Use /features/<name> or /for/<name>: lowercase letters, numbers and dashes.'}
                hint={path !== server.path ? 'Moving a published page breaks saved links: add a redirect from the old address in Settings.' : undefined}
              />
            )}
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">On the site</dt>
                <dd className="text-right text-ink">{published ? `Since ${formatDateTime(server.publishedAt, tz)}` : 'No (draft)'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Last saved</dt>
                <dd className="text-right text-ink" title={formatDateTime(server.updatedAt, tz)}>
                  {timeAgo(server.updatedAt, tz)}
                </dd>
              </div>
              {published && server.changed && <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[13px] text-amber-800">The saved draft differs from what visitors see. Publish to update the site.</p>}
            </dl>
            {(published && !ALWAYS_PUBLISHED.includes(server.path)) || !server.system ? (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                {published && !ALWAYS_PUBLISHED.includes(server.path) && (
                  <Button size="sm" variant="secondary" icon={Undo2} loading={busy === 'unpublish'} disabled={!!busy} onClick={unpublish}>
                    Unpublish
                  </Button>
                )}
                {!server.system && (
                  <Button size="sm" variant="danger-soft" icon={Trash2} loading={busy === 'delete'} disabled={!!busy} onClick={remove}>
                    Delete page
                  </Button>
                )}
              </div>
            ) : null}
          </Panel>

          <Panel title="Search and sharing" description="What Google and WhatsApp show for this page.">
            <SearchSnippet
              title={titleShown}
              url={`${(site?.effective?.siteUrl || window.location.origin).replace(/\/+$/, '')}${server.path === '/' ? '' : server.path}`}
              description={draft.seo.description || settings?.seo?.defaultDescription}
            />
            <Counted label="Search title" optional ideal={60} max={120} value={draft.seo.title} onChange={(v) => setSeo({ title: v })} hint="Empty = the page title. The site adds “ · Karo” unless it’s there already." />
            <Counted
              label="Description"
              optional
              multiline
              ideal={155}
              max={320}
              value={draft.seo.description}
              onChange={(v) => setSeo({ description: v })}
              hint="One or two sentences on what the page offers. Empty = the site’s default."
            />
            <MediaField label="Share picture" optional value={draft.seo.ogImage} onChange={(mid) => setSeo({ ogImage: mid })} hint="Shown when the link is shared; 1200 × 630 works best. Empty = the site’s default." />
            <Switch label="Hide from search engines" description="Adds noindex to this page only." checked={draft.seo.noindex} onChange={(v) => setSeo({ noindex: v })} />
          </Panel>
        </aside>
      </div>

      {dirty && (
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
          <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card/95 px-4 py-2.5 shadow-pop backdrop-blur">
            <span className="text-sm font-medium text-ink">Unsaved changes</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy}
                onClick={async () => {
                  if (await confirm({ title: 'Discard your changes?', text: 'The draft goes back to how it was last saved.', confirmLabel: 'Discard', tone: 'warning' })) take(server);
                }}
              >
                Discard
              </Button>
              <Button size="sm" variant="secondary" icon={Eye} onClick={openPreview}>
                Preview
              </Button>
              <Button size="sm" icon={Save} loading={busy === 'save'} disabled={!!busy} onClick={saveDraft}>
                Save draft
              </Button>
            </div>
          </div>
        </div>
      )}

      <AddSectionModal open={adding} onClose={() => setAdding(false)} onAdd={addSection} />
      <PreviewModal
        open={preview.open}
        onClose={() => setPreview({ open: false })}
        html={preview.html}
        loading={preview.loading}
        error={preview.error}
        title={`Preview: ${draft.title || server.path}`}
        path={server.path}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/website" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-brand">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Pages
    </Link>
  );
}
