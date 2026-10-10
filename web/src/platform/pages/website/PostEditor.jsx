/**
 * One blog post: title and address (made from the title until changed),
 * excerpt, the Markdown body with a live preview beside it (stacked as tabs
 * on a phone), cover picture, tags, author, publish date (a future date
 * schedules it) and search details. Save · Preview · Publish · Unpublish ·
 * Delete. Saves carry the post's `version` (409 → reload), as pages do.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, CalendarClock, Eye, FileWarning, Save, Send, Trash2, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { formatDateTime, fromLocalInput, timeAgo, toLocalInput } from '../../format';
import { useTz } from '../../session';
import { useTheme } from '../../theme';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Segmented, Spinner, Switch, useConfirm } from '../../ui';
import { MediaField } from './MediaPicker';
import { MARKDOWN_HINT } from './SectionFields';
import {
  articleDoc,
  ConflictBanner,
  Counted,
  PreviewModal,
  saveFailed,
  SearchSnippet,
  siteTitle,
  SLUG,
  slugify,
  StatusBadge,
  useDebounced,
  useSiteSettings,
  useUnsavedGuard,
  ViewLive,
} from './shared';

const BLANK = {
  title: '',
  slug: '',
  excerpt: '',
  bodyMd: '',
  cover: { media: null, alt: '' },
  author: { name: '', title: '' },
  tags: [],
  publishedAt: null,
  seo: { title: '', description: '', ogImage: null, noindex: false },
};

/** A post as the form holds it: every field there, in one order. */
const formOf = (p = {}) => ({
  title: p.title || '',
  slug: p.slug || '',
  excerpt: p.excerpt || '',
  bodyMd: p.bodyMd || '',
  cover: { media: p.cover?.media || null, alt: p.cover?.alt || '' },
  author: { name: p.author?.name || '', title: p.author?.title || '' },
  tags: p.tags || [],
  publishedAt: p.publishedAt ? new Date(p.publishedAt).toISOString() : null,
  seo: { title: p.seo?.title || '', description: p.seo?.description || '', ogImage: p.seo?.ogImage || null, noindex: !!p.seo?.noindex },
});

const wordsIn = (md) => (String(md || '').match(/[\p{L}\p{N}]+/gu) || []).length;

/** Tags as chips: Enter or a comma adds one, Backspace in the empty box takes the last off. */
function TagsInput({ value, onChange, max = 12 }) {
  const [text, setText] = useState('');
  /** Add each of `words` (typed or pasted) that is new, and keep `rest` in the box. */
  const add = (words, rest = '') => {
    const next = [...value];
    for (const word of words) {
      const t = word.trim().slice(0, 40);
      if (!t) continue;
      if (!slugify(t, 40)) toast.error(`“${t}”: a tag needs a letter or a number in English letters.`);
      else if (next.length >= max) {
        toast.error(`At most ${max} tags.`);
        break;
      } else if (!next.some((v) => slugify(v, 40) === slugify(t, 40))) next.push(t);
    }
    if (next.length !== value.length) onChange(next);
    setText(rest);
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor="post-tags" className="block text-sm font-medium text-ink">
        Tags <span className="font-normal text-ink-faint">(optional)</span>
      </label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-card px-2 py-1.5 shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-2.5 pr-1 text-[13px] font-medium text-brand">
            {t}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== t))}
              className="grid h-5 w-5 place-items-center rounded-full hover:bg-brand/15"
              aria-label={`Remove the tag ${t}`}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id="post-tags"
          value={text}
          maxLength={41}
          placeholder={value.length ? '' : 'e.g. Task Pin, WhatsApp'}
          onChange={(e) => {
            const parts = e.target.value.split(',');
            const rest = parts.pop();
            if (parts.length) add(parts, rest);
            else setText(rest);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add([text]);
            } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add([text])}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>
      <p className="text-sm text-ink-soft">Press Enter or type a comma after each. Each tag gets its own page, /blog/tag/…</p>
    </div>
  );
}

/** The body: Markdown on the left, the site's own rendering of it on the right (tabs on a phone). */
function BodyEditor({ value, onChange, title, excerpt }) {
  const [tab, setTab] = useState('write');
  const scheme = useTheme((s) => s.scheme);
  const md = useDebounced(value, 400);
  const rendered = useQuery({
    queryKey: ['site', 'markdown', md],
    queryFn: () => api.post('/api/site/render-markdown', { md }),
    placeholderData: (prev) => prev,
    staleTime: Infinity,
  });
  const words = wordsIn(value);
  const doc = useMemo(() => articleDoc({ title, excerpt, bodyHtml: rendered.data?.html || '', dark: scheme === 'dark' }), [rendered.data, title, excerpt, scheme]);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">
            <label htmlFor="post-body">Body</label>
          </h2>
          <p className="tnum text-xs text-ink-faint">
            {words.toLocaleString('en-IN')} words · about {Math.max(1, Math.ceil(words / 200))} min read
          </p>
        </div>
        <Segmented
          className="lg:hidden"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
        />
      </div>
      <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-line">
        <div className={clsx('p-3', tab !== 'write' && 'hidden lg:block')}>
          <textarea
            id="post-body"
            value={value}
            maxLength={150000}
            onChange={(e) => onChange(e.target.value)}
            spellCheck
            aria-describedby="post-body-hint"
            placeholder={'# A heading\n\nA paragraph with **bold** words and a [link](https://…).\n\n- A list\n- of points'}
            className="block h-[62vh] min-h-[320px] w-full resize-y rounded-xl border border-line bg-card px-3 py-2.5 font-mono text-[13.5px] leading-relaxed text-ink shadow-sm placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <p id="post-body-hint" className="mt-1.5 text-sm text-ink-soft">
            {MARKDOWN_HINT} The table of contents lists the # headings.
          </p>
        </div>
        <div className={clsx('bg-well p-3', tab !== 'preview' && 'hidden lg:block')}>
          <div className="relative">
            <iframe
              title="How the post’s body will look"
              sandbox=""
              srcDoc={doc}
              className="block h-[62vh] min-h-[320px] w-full rounded-xl border border-line bg-card"
            />
            {rendered.isFetching && <span className="absolute right-3 top-3 rounded-full bg-card px-2 py-0.5 text-xs text-ink-faint shadow-sm">Updating…</span>}
          </div>
          {rendered.error && <p className="mt-1.5 text-sm text-red-700">{rendered.error.message}</p>}
        </div>
      </div>
    </Card>
  );
}

export function PostEditor() {
  const { id } = useParams();
  const isNew = id === 'new';
  const tz = useTz();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const site = useSiteSettings().data;
  const query = useQuery({ queryKey: ['site', 'post', id], queryFn: () => api.get(`/api/site/posts/${id}`), enabled: !isNew, staleTime: 0 });

  // The post as last loaded or saved (null while new; the cache's copy at first, refreshed below).
  const [server, setServer] = useState(() => (isNew ? null : qc.getQueryData(['site', 'post', id])?.post || null));
  const [form, setForm] = useState(() => (isNew ? BLANK : server ? formOf(server) : null));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState({ open: false });
  const [tried, setTried] = useState(false);

  const savedJson = useMemo(() => JSON.stringify(server ? formOf(server) : BLANK), [server]);
  const dirty = !!form && JSON.stringify(form) !== savedJson;
  useUnsavedGuard(dirty);

  const take = (post) => {
    setServer(post);
    setForm(formOf(post));
    setSlugTouched(true);
    setConflict(false);
  };
  // The server's copy when it arrives, and a newer one while nothing here is changed.
  useEffect(() => {
    const fresh = query.data?.post;
    if (fresh && (!server || (fresh.version !== server.version && !dirty))) take(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  if (query.error) {
    return (
      <div className="mx-auto max-w-6xl">
        <BackLink />
        <Card className="mt-3">
          {query.error.status === 404 ? (
            <EmptyState icon={FileWarning} title="Post not found" text="It may have been deleted." action={<Button to="/website?tab=blog">Back to the blog</Button>} />
          ) : (
            <ErrorState error={query.error} onRetry={query.refetch} />
          )}
        </Card>
      </div>
    );
  }
  if (!form) return <Spinner label="Loading the post" />;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setTitle = (title) => setForm((f) => ({ ...f, title, ...(slugTouched ? {} : { slug: slugify(title, 80) }) }));
  const base = (site?.effective?.siteUrl || window.location.origin).replace(/\/+$/, '');
  const slugError = form.slug && !SLUG.test(form.slug) ? 'Lowercase letters and numbers, with single dashes between words.' : '';
  const altError = tried && form.cover.media && !form.cover.alt.trim() ? 'Describe the cover picture for people who can’t see it.' : '';
  const titleError = tried && !form.title.trim() ? 'Give the post a title.' : '';
  const when = form.publishedAt ? new Date(form.publishedAt) : null;
  const future = !!when && when > new Date();
  const published = server?.status === 'published';

  /** The body every save sends. A published post keeps its date when the box is emptied (no date would hide it). */
  const bodyOf = (f) => {
    const body = { ...f, title: f.title.trim() };
    if (!body.slug) delete body.slug;
    if (!body.publishedAt && published) delete body.publishedAt;
    return body;
  };

  /** Save (create the first time); the saved post, or null after an error toast. */
  const persist = async () => {
    setTried(true);
    const problem = !form.title.trim()
      ? 'Give the post a title.'
      : slugError
        ? `The address: ${slugError}`
        : form.cover.media && !form.cover.alt.trim()
          ? 'Describe the cover picture (its alt text) before saving.'
          : '';
    if (problem) {
      toast.error(problem);
      return null;
    }
    const sent = form;
    try {
      if (!server) {
        const { post } = await api.post('/api/site/posts', bodyOf(sent));
        qc.setQueryData(['site', 'post', post.id], { post });
        qc.invalidateQueries({ queryKey: ['site', 'posts'] });
        setServer(post);
        setForm(formOf(post));
        return post;
      }
      const { post } = await api.patch(`/api/site/posts/${server.id}`, { version: server.version, ...bodyOf(sent) });
      setServer(post);
      setForm((cur) => (cur === sent ? formOf(post) : cur));
      qc.setQueryData(['site', 'post', post.id], { post });
      qc.invalidateQueries({ queryKey: ['site', 'posts'] });
      return post;
    } catch (err) {
      if (saveFailed(err, 'this post') === 'conflict') setConflict(true);
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

  // A new post's editor moves to the post's own address once it is saved.
  const settle = (post) => isNew && post && navigate(`/website/posts/${post.id}`, { replace: true });

  const save = () =>
    run('save', async () => {
      const post = await persist();
      if (post) toast.success(post.status === 'published' ? 'Saved. Visitors see the change within a minute.' : 'Draft saved');
      settle(post);
    });

  const publish = () =>
    run('publish', async () => {
      const post = dirty || !server ? await persist() : server;
      if (!post) return;
      try {
        const res = await api.post(`/api/site/posts/${post.id}/publish`, { version: post.version, ...(form.publishedAt ? { publishedAt: form.publishedAt } : {}) });
        setServer(res.post);
        setForm(formOf(res.post));
        qc.setQueryData(['site', 'post', res.post.id], res);
        qc.invalidateQueries({ queryKey: ['site', 'posts'] });
        toast.success(res.post.scheduled ? `Scheduled: it appears ${formatDateTime(res.post.publishedAt, tz)}` : 'Published. It’s on the blog now (within a minute).');
      } catch (err) {
        if (saveFailed(err, 'this post') === 'conflict') setConflict(true);
      }
      settle(post);
    });

  const unpublish = async () => {
    const ok = await confirm({
      title: 'Take this post off the blog?',
      text: `Visitors who open /blog/${server.slug} get “page not found” until you publish it again.`,
      confirmLabel: 'Unpublish',
      tone: 'warning',
    });
    if (!ok) return;
    await run('unpublish', async () => {
      try {
        const res = await api.post(`/api/site/posts/${server.id}/unpublish`, { version: server.version });
        setServer(res.post);
        qc.setQueryData(['site', 'post', res.post.id], res);
        qc.invalidateQueries({ queryKey: ['site', 'posts'] });
        toast.success('The post is a draft again');
      } catch (err) {
        if (saveFailed(err, 'this post') === 'conflict') setConflict(true);
      }
    });
  };

  const remove = async () => {
    const ok = await confirm({ title: `Delete “${server.title}”?`, text: 'The post is deleted for good.', confirmLabel: 'Delete post' });
    if (!ok) return;
    await run('delete', async () => {
      try {
        await api.del(`/api/site/posts/${server.id}`);
        qc.invalidateQueries({ queryKey: ['site', 'posts'] });
        qc.removeQueries({ queryKey: ['site', 'post', server.id] });
        toast.success('The post is deleted');
        navigate('/website?tab=blog', { replace: true });
      } catch (err) {
        toast.error(err.message);
      }
    });
  };

  const reload = async () => {
    setBusy('reload');
    const res = await query.refetch();
    setBusy('');
    if (res.data?.post) {
      take(res.data.post);
      toast.success('Loaded the latest version');
    }
  };

  const openPreview = async () => {
    if (!form.title.trim()) return toast.error('Give the post a title to preview it.');
    setPreview({ open: true, loading: true });
    try {
      const { html } = await api.post('/api/site/preview', { kind: 'post', data: bodyOf(form) });
      setPreview({ open: true, html });
    } catch (err) {
      setPreview({ open: true, error: err.message });
    }
  };

  const status = server ? <StatusBadge status={server.status} scheduled={server.scheduled} /> : <Badge tone="neutral">New</Badge>;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        back={<BackLink />}
        title={form.title || 'New post'}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {status}
            {server && <span>Saved {timeAgo(server.updatedAt, tz)}</span>}
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
            {published && !server.scheduled && <ViewLive href={server.url} />}
            <Button variant="secondary" icon={Eye} onClick={openPreview}>
              Preview
            </Button>
            <Button variant="secondary" icon={Save} loading={busy === 'save'} disabled={!!busy || (!dirty && !!server)} onClick={save}>
              {server ? 'Save' : 'Save draft'}
            </Button>
            {!published && (
              <Button icon={future ? CalendarClock : Send} loading={busy === 'publish'} disabled={!!busy} onClick={publish}>
                {future ? 'Schedule' : 'Publish'}
              </Button>
            )}
          </>
        }
      />

      {conflict && <ConflictBanner what="this post" onReload={reload} reloading={busy === 'reload'} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Card className="space-y-4 p-4 sm:p-5">
            <Input label="Title" maxLength={140} value={form.title} onChange={(e) => setTitle(e.target.value)} error={titleError} placeholder="How to give tasks to your staff" />
            <Input
              label="Address"
              inputClassName="font-mono text-[14px]"
              maxLength={100}
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') });
              }}
              onBlur={() => {
                if (form.slug) return;
                setSlugTouched(false);
                set({ slug: slugify(form.title, 80) });
              }}
              error={slugError}
              hint={
                <>
                  <span className="break-all font-mono text-[13px] text-ink">
                    {base}/blog/{form.slug || '…'}
                  </span>
                  <br />
                  {!slugTouched
                    ? 'Made from the title until you change it.'
                    : published
                      ? 'Changing it keeps the old address working: it sends visitors here.'
                      : 'Lowercase letters, numbers and dashes.'}
                </>
              }
            />
            <Counted label="Excerpt" optional multiline rows={2} ideal={155} max={320} value={form.excerpt} onChange={(v) => set({ excerpt: v })} hint="A sentence or two for the blog list, the post’s intro, and search results." />
          </Card>

          <BodyEditor value={form.bodyMd} onChange={(bodyMd) => set({ bodyMd })} title={form.title} excerpt={form.excerpt} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="text-[15px] font-semibold text-ink">Publishing</h2>
            <Input
              type="datetime-local"
              label="Publish date"
              optional
              value={form.publishedAt ? toLocalInput(form.publishedAt, tz) : ''}
              onChange={(e) => set({ publishedAt: e.target.value ? fromLocalInput(e.target.value, tz)?.toISOString() || null : null })}
              hint={
                future
                  ? published
                    ? `Scheduled: it appears by itself ${formatDateTime(when, tz)}.`
                    : `A future date schedules it: once you publish, it appears by itself ${formatDateTime(when, tz)}.`
                  : 'Empty = the moment you publish. A future date schedules the post.'
              }
            />
            {form.publishedAt && !published && (
              <button type="button" className="-mt-2 text-sm font-medium text-brand hover:underline" onClick={() => set({ publishedAt: null })}>
                Clear the date
              </button>
            )}
            {published && <p className="rounded-lg bg-well px-3 py-2 text-[13px] text-ink-soft">{server.scheduled ? 'Scheduled' : 'On the blog'}: saving changes what visitors see.</p>}
            {server && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                {published && (
                  <Button size="sm" variant="secondary" icon={Undo2} loading={busy === 'unpublish'} disabled={!!busy} onClick={unpublish}>
                    Unpublish
                  </Button>
                )}
                <Button size="sm" variant="danger-soft" icon={Trash2} loading={busy === 'delete'} disabled={!!busy} onClick={remove}>
                  Delete post
                </Button>
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="text-[15px] font-semibold text-ink">Cover and author</h2>
            <MediaField
              label="Cover picture"
              optional
              value={form.cover.media}
              onChange={(media, m) => set({ cover: { media, alt: media ? form.cover.alt || m?.alt || '' : '' } })}
            />
            {form.cover.media && (
              <Input
                label="Cover alt text"
                maxLength={200}
                value={form.cover.alt}
                onChange={(e) => set({ cover: { ...form.cover, alt: e.target.value } })}
                error={altError}
                hint="What the picture shows, for people who can’t see it. Needed."
              />
            )}
            <TagsInput value={form.tags} onChange={(tags) => set({ tags })} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Input label="Author" optional maxLength={80} value={form.author.name} onChange={(e) => set({ author: { ...form.author, name: e.target.value } })} hint="Empty = Karo." />
              <Input label="Author’s role" optional maxLength={80} value={form.author.title} onChange={(e) => set({ author: { ...form.author, title: e.target.value } })} />
            </div>
          </Card>

          <Card className="space-y-4 p-4 sm:p-5">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Search and sharing</h2>
              <p className="mt-0.5 text-sm text-ink-soft">What Google and WhatsApp show for this post.</p>
            </div>
            <SearchSnippet
              title={siteTitle(site?.settings, form.seo.title || form.title)}
              url={`${base}/blog/${form.slug || '…'}`}
              description={form.seo.description || form.excerpt}
            />
            <Counted label="Search title" optional ideal={60} max={120} value={form.seo.title} onChange={(v) => set({ seo: { ...form.seo, title: v } })} hint="Empty = the post’s title." />
            <Counted
              label="Description"
              optional
              multiline
              ideal={155}
              max={320}
              value={form.seo.description}
              onChange={(v) => set({ seo: { ...form.seo, description: v } })}
              hint="Empty = the excerpt."
            />
            <MediaField label="Share picture" optional value={form.seo.ogImage} onChange={(mid) => set({ seo: { ...form.seo, ogImage: mid } })} hint="Empty = the cover picture." />
            <Switch label="Hide from search engines" description="Adds noindex to this post only." checked={form.seo.noindex} onChange={(v) => set({ seo: { ...form.seo, noindex: v } })} />
          </Card>
        </aside>
      </div>

      <PreviewModal
        open={preview.open}
        onClose={() => setPreview({ open: false })}
        html={preview.html}
        loading={preview.loading}
        error={preview.error}
        title={`Preview: ${form.title}`}
        path={`/blog/${form.slug || slugify(form.title) || 'preview'}`}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/website?tab=blog" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-brand">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Blog
    </Link>
  );
}
