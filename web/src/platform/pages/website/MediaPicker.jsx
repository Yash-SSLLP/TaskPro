/**
 * Choosing a picture from the website's library, or uploading one on the
 * spot: the thumbnail, the upload button (shrinks, then sends; media.js), the
 * field an editor shows (picture, Change, Remove) and its picker dialog.
 */
import { useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ImageIcon, Images, Search, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiUrl } from '../../api';
import { Button, EmptyState, ErrorState, IconButton, Input, Modal, Spinner } from '../../ui';
import { uploadPicture, useMediaLibrary } from './media';

/** A picture's small copy, or a placeholder. */
export function MediaThumb({ media, className, alt = '' }) {
  if (!media) {
    return (
      <span className={clsx('grid place-items-center bg-well text-ink-faint', className)} aria-hidden>
        <ImageIcon className="h-5 w-5" />
      </span>
    );
  }
  return <img src={apiUrl(media.thumbUrl || media.url)} alt={alt} loading="lazy" decoding="async" draggable={false} className={clsx('bg-well object-cover', className)} />;
}

/** Shrink and upload pictures one by one, a toast for each; `busy` counts what is left. */
export function useUpload(onUploaded) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(0);
  const upload = async (files) => {
    const list = [...(files || [])];
    if (!list.length) return [];
    setBusy(list.length);
    const done = [];
    for (const file of list) {
      try {
        const media = await uploadPicture(file);
        done.push(media);
        toast.success(`${media.name} uploaded`);
      } catch (err) {
        toast.error(list.length > 1 ? `${file.name}: ${err.message}` : err.message);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (done.length) {
      await qc.invalidateQueries({ queryKey: ['site', 'media'] });
      onUploaded?.(done);
    }
    return done;
  };
  return { busy, upload };
}

/** A button that opens the file chooser and uploads what is picked. */
export function UploadButton({ onUploaded, multiple = false, label = 'Upload', variant = 'primary', size = 'md', upload: shared }) {
  const input = useRef(null);
  const own = useUpload(onUploaded);
  const { busy, upload } = shared || own;
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = '';
        }}
      />
      <Button variant={variant} size={size} icon={Upload} loading={busy > 0} onClick={() => input.current?.click()}>
        {busy > 0 ? `Uploading${busy > 1 ? ` ${busy}` : ''}…` : label}
      </Button>
    </>
  );
}

/** The library as a grid to pick from; uploading here picks the new picture. */
function MediaPickerModal({ open, onClose, value, onPick }) {
  const lib = useMediaLibrary();
  const [q, setQ] = useState('');
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = lib.data || [];
    return needle ? all.filter((m) => `${m.name} ${m.alt}`.toLowerCase().includes(needle)) : all;
  }, [lib.data, q]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Choose a picture"
      subtitle="From the website's library, or upload a new one"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <UploadButton label="Upload a new picture" onUploaded={(done) => onPick(done[0])} />
        </>
      }
    >
      <Input
        placeholder="Search by name or alt text"
        prefix={<Search className="h-4 w-4" />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search pictures"
        className="mb-3"
      />
      {lib.isLoading && <Spinner />}
      {lib.error && <ErrorState error={lib.error} onRetry={lib.refetch} />}
      {lib.data && items.length === 0 && (
        <EmptyState icon={Images} title={q ? 'No picture matches' : 'No pictures yet'} text={q ? 'Try another word.' : 'Upload one to use it here.'} className="py-8" />
      )}
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {items.map((m) => {
            const on = m.id === value;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onPick(m)}
                  aria-pressed={on}
                  className={clsx(
                    'group relative block w-full overflow-hidden rounded-xl border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                    on ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-slate-300'
                  )}
                >
                  <MediaThumb media={m} className="aspect-[4/3] w-full" />
                  <span className="block truncate px-2 py-1.5 text-xs font-medium text-ink">{m.alt || m.name}</span>
                  {on && (
                    <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-brand text-on-brand" aria-hidden>
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

/**
 * A picture field: the chosen picture with Change and Remove. `onChange(id,
 * media)` gets the media id (null when removed) and the picture itself.
 */
export function MediaField({ label, value, onChange, hint, optional }) {
  const lib = useMediaLibrary();
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const media = value ? lib.data?.find((m) => m.id === value) || null : null;
  return (
    <div className="space-y-1.5" role="group" aria-labelledby={label ? labelId : undefined}>
      {label && (
        <p id={labelId} className="text-sm font-medium text-ink">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-faint">(optional)</span>}
        </p>
      )}
      <div className="flex items-center gap-3 rounded-xl border border-line bg-card p-2 shadow-sm">
        <MediaThumb media={media} alt={media?.alt || ''} className="h-14 w-20 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          {!value ? (
            <p className="text-sm text-ink-faint">No picture chosen</p>
          ) : media ? (
            <>
              <p className="truncate text-sm font-medium text-ink">{media.name}</p>
              <p className="tnum text-xs text-ink-faint">{media.width && media.height ? `${media.width} × ${media.height}` : media.mime}</p>
            </>
          ) : lib.isLoading ? (
            <p className="text-sm text-ink-faint">Loading…</p>
          ) : (
            <p className="text-sm text-amber-700">This picture is no longer in the library.</p>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          {value ? 'Change' : 'Choose'}
        </Button>
        {value && <IconButton icon={X} label={`Remove ${label ? label.toLowerCase() : 'the picture'}`} className="h-8 w-8" onClick={() => onChange(null, null)} />}
      </div>
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
      <MediaPickerModal
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        onPick={(m) => {
          onChange(m.id, m);
          setOpen(false);
        }}
      />
    </div>
  );
}
