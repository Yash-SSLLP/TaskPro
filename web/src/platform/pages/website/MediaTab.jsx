/**
 * The website's picture library: upload (or drop) pictures, which the browser
 * shrinks to WebP first; describe each one (alt text); copy its address or a
 * Markdown line for a post; delete one.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Copy, FileCode2, ImagePlus, Images, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiUrl } from '../../api';
import { copyText } from '../../pin';
import { formatDateTime } from '../../format';
import { useTz } from '../../session';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, Skeleton, Textarea, useConfirm } from '../../ui';
import { MediaThumb, UploadButton, useUpload } from './MediaPicker';
import { useMediaLibrary } from './media';
import { formatBytes, saveFailed, useSiteSettings } from './shared';

/** A picture's public address: on the site URL when one is set, else here. */
function publicUrl(m, effective) {
  const site = effective?.siteUrlSource && effective.siteUrlSource !== 'request' ? effective.siteUrl : '';
  return site ? new URL(m.url, site).href : new URL(apiUrl(m.url), window.location.origin).href;
}

/** One picture: big, its details, its alt text, copy and delete. */
function MediaDrawer({ media, onClose }) {
  const tz = useTz();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const effective = useSiteSettings().data?.effective;
  const [alt, setAlt] = useState(media.alt || '');
  const [version, setVersion] = useState(media.version);
  const [savedAlt, setSavedAlt] = useState(media.alt || '');

  const save = useMutation({
    mutationFn: () => api.patch(`/api/site/media/${media.id}`, { version, alt: alt.trim() }),
    onSuccess: (res) => {
      setVersion(res.media.version);
      setSavedAlt(res.media.alt);
      setAlt(res.media.alt);
      qc.invalidateQueries({ queryKey: ['site', 'media'] });
      toast.success('Alt text saved');
    },
    // Changed elsewhere: fetch the library again; the newer copy shows here (below).
    onError: (err) => saveFailed(err, 'this picture') === 'conflict' && qc.invalidateQueries({ queryKey: ['site', 'media'] }),
  });
  // A newer copy than the one opened (someone else's save): show theirs.
  useEffect(() => {
    if (media.version === version) return;
    setVersion(media.version);
    setAlt(media.alt || '');
    setSavedAlt(media.alt || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.version]);
  const remove = useMutation({
    mutationFn: () => api.del(`/api/site/media/${media.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site', 'media'] });
      toast.success(`${media.name} is deleted`);
      onClose();
    },
    // 409: the server keeps a picture that is still in use.
    onError: (err) => toast.error(err.status === 409 ? err.message || 'This picture is still used on the site. Take it off those pages first.' : err.message),
  });
  const askRemove = async () => {
    const ok = await confirm({
      title: `Delete ${media.name}?`,
      text: 'The picture is deleted from the library and from the site.',
      details: ['A page or post still using it shows without it.', 'Copies people saved of its address stop working.'],
      confirmLabel: 'Delete picture',
    });
    if (ok) remove.mutate();
  };
  const markdown = `![${(alt || media.alt || '').replace(/[[\]]/g, '')}](${media.url})`;

  return (
    <Drawer
      open
      onClose={onClose}
      wide
      title={media.name}
      subtitle={[media.width && media.height ? `${media.width} × ${media.height}` : '', formatBytes(media.size), media.mime].filter(Boolean).join(' · ')}
      footer={
        <>
          <Button variant="danger-soft" icon={Trash2} loading={remove.isPending} onClick={askRemove} className="mr-auto">
            Delete
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button loading={save.isPending} disabled={alt.trim() === savedAlt} onClick={() => save.mutate()}>
            Save alt text
          </Button>
        </>
      }
    >
      <div className="space-y-5 pt-2">
        <a href={apiUrl(media.url)} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl border border-line bg-well" title="Open the full picture">
          <img src={apiUrl(media.url)} alt={savedAlt} className="mx-auto max-h-[46vh] w-auto object-contain" />
        </a>
        <Textarea
          label="Alt text"
          rows={2}
          maxLength={200}
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          hint="What the picture shows, in a sentence, for people who can’t see it (and for Google). Pages use it unless they give their own."
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Use it</p>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-well px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{publicUrl(media, effective)}</code>
            <Button size="sm" variant="secondary" icon={Copy} onClick={() => copyText(publicUrl(media, effective), 'Address copied')}>
              Copy address
            </Button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-well px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{markdown}</code>
            <Button size="sm" variant="secondary" icon={FileCode2} onClick={() => copyText(markdown, 'Markdown copied: paste it into a post')}>
              Copy Markdown
            </Button>
          </div>
          <p className="text-xs text-ink-faint">In a post or a Text section, paste the Markdown line. Pictures from other websites are not shown on the site.</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-ink-soft">Uploaded</dt>
            <dd className="text-ink">{formatDateTime(media.createdAt, tz)}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Small copy</dt>
            <dd className="text-ink">{media.thumbUrl ? 'Yes, for cards and phones' : 'No (the picture is small)'}</dd>
          </div>
        </dl>
      </div>
    </Drawer>
  );
}

export function MediaTab() {
  const lib = useMediaLibrary();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [over, setOver] = useState(false);
  const uploader = useUpload();
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = lib.data || [];
    return needle ? all.filter((m) => `${m.name} ${m.alt}`.toLowerCase().includes(needle)) : all;
  }, [lib.data, q]);
  const open = openId ? (lib.data || []).find((m) => m.id === openId) : null;
  const missingAlt = (lib.data || []).filter((m) => !m.alt).length;

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => {
        if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer?.files?.length) return;
        e.preventDefault();
        setOver(false);
        uploader.upload(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="min-w-0 flex-1 basis-60"
          placeholder="Search by name or alt text"
          prefix={<Search className="h-4 w-4" />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search pictures"
        />
        <UploadButton multiple label="Upload pictures" upload={uploader} />
      </div>
      <div
        className={clsx(
          'flex items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 text-sm transition-colors',
          over ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-soft'
        )}
      >
        <ImagePlus className="h-5 w-5 shrink-0" aria-hidden />
        <p>
          {over ? 'Drop to upload' : 'Drop pictures here, or upload them.'} JPEG, PNG or WebP; each is shrunk to at most 1600 px (plus a 640 px copy) before it is sent. No SVG.
        </p>
      </div>
      {missingAlt > 0 && (
        <p className="text-sm text-amber-700">
          {missingAlt} picture{missingAlt === 1 ? ' has' : 's have'} no alt text yet. Open one to describe it.
        </p>
      )}

      {lib.error && (
        <Card>
          <ErrorState error={lib.error} onRetry={lib.refetch} />
        </Card>
      )}
      {lib.isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-2xl" />
          ))}
        </div>
      )}
      {lib.data && items.length === 0 && (
        <Card>
          <EmptyState
            icon={Images}
            title={q ? 'No picture matches' : 'No pictures yet'}
            text={q ? 'Try another word.' : 'Upload pictures for page heroes, blog covers and share images.'}
            action={!q && <UploadButton multiple label="Upload pictures" upload={uploader} />}
          />
        </Card>
      )}
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setOpenId(m.id)}
                className="group block w-full overflow-hidden rounded-2xl border border-line bg-card text-left shadow-card transition-colors hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <MediaThumb media={m} alt={m.alt} className="aspect-[4/3] w-full" />
                <span className="block space-y-1 p-2.5">
                  <span className="block truncate text-[13px] font-semibold text-ink">{m.name}</span>
                  <span className="tnum block truncate text-xs text-ink-faint">
                    {m.width && m.height ? `${m.width} × ${m.height} · ` : ''}
                    {formatBytes(m.size)}
                  </span>
                  {m.alt ? <span className="line-clamp-2 block text-xs text-ink-soft">{m.alt}</span> : <Badge tone="amber">No alt text</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <MediaDrawer key={open.id} media={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
