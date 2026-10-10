/**
 * The website's pages: the six main ones (always there) and the feature and
 * use-case pages under /features/… and /for/…. Open one to edit it; add a new
 * one; delete one that isn't a main page.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, FileText, Lock, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { timeAgo } from '../../format';
import { useTz } from '../../session';
import { Button, Card, EmptyState, ErrorState, finePointer, IconButton, Input, Modal, Segmented, useConfirm } from '../../ui';
import { ListSkeleton } from '../console/shared';
import { liveHref, slugify, StatusBadge, ViewLive } from './shared';

function usePages() {
  return useQuery({ queryKey: ['site', 'pages'], queryFn: () => api.get('/api/site/pages') });
}

/** New page: where it lives (/features/… or /for/…) and its title. */
function NewPageModal({ open, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [area, setArea] = useState('features');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const shownSlug = touched ? slug : slugify(title, 60);
  const path = `/${area}/${shownSlug}`;
  const create = useMutation({
    mutationFn: () => api.post('/api/site/pages', { path, title: title.trim() }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['site', 'pages'] });
      toast.success(`${res.page.path} is created as a draft`);
      onClose();
      navigate(`/website/pages/${res.page.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const ready = title.trim() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shownSlug);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New page"
      subtitle="It starts as a draft with a heading and a closing call to action"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-page" loading={create.isPending} disabled={!ready}>
            Create page
          </Button>
        </>
      }
    >
      <form
        id="new-page"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) create.mutate();
        }}
      >
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink" id="new-page-area">
            Kind of page
          </p>
          <Segmented
            value={area}
            onChange={setArea}
            options={[
              { value: 'features', label: 'A feature (/features/…)' },
              { value: 'for', label: 'Who it’s for (/for/…)' },
            ]}
            className="max-w-full overflow-x-auto"
          />
        </div>
        <Input label="Title" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recurring tasks" autoFocus={finePointer()} />
        <Input
          label="Address"
          maxLength={60}
          inputClassName="font-mono text-[14px]"
          value={shownSlug}
          onChange={(e) => {
            setTouched(true);
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
          }}
          hint={`The page will be at ${path}. Choose with care: changing it later breaks links people have saved.`}
          error={shownSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shownSlug) ? 'Use lowercase letters and numbers, with single dashes between words.' : ''}
        />
      </form>
    </Modal>
  );
}

export function PagesTab() {
  const tz = useTz();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const pages = usePages();
  const [adding, setAdding] = useState(false);
  const list = pages.data?.pages || [];

  const remove = useMutation({
    mutationFn: (p) => api.del(`/api/site/pages/${p.id}`),
    onSuccess: (_, p) => {
      qc.invalidateQueries({ queryKey: ['site', 'pages'] });
      toast.success(`${p.path} is deleted`);
    },
    onError: (e) => toast.error(e.message),
  });
  const askRemove = async (p) => {
    const ok = await confirm({
      title: `Delete ${p.path}?`,
      text: 'The page and its draft are deleted. Visitors who open the address get “page not found”.',
      details: ['Add a redirect in Settings if other pages or people link to it.'],
      confirmLabel: 'Delete page',
    });
    if (ok) remove.mutate(p);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-64 text-sm text-ink-soft">
          Each page is built from sections. Edit a draft, preview it, then publish it for visitors.
        </p>
        <Button icon={FilePlus2} onClick={() => setAdding(true)}>
          New page
        </Button>
      </div>
      <Card className="overflow-hidden">
        {pages.error && <ErrorState error={pages.error} onRetry={pages.refetch} />}
        {pages.isLoading && <ListSkeleton rows={6} />}
        {pages.data && list.length === 0 && (
          <EmptyState icon={FileText} title="No pages yet" text="The site’s main pages are written when the server starts." />
        )}
        {list.length > 0 && (
          <ul className="divide-y divide-line">
            <li className="hidden grid-cols-[minmax(0,1fr)_150px_130px_auto] gap-4 bg-well px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft md:grid" aria-hidden>
              <span>Page</span>
              <span>Status</span>
              <span>Changed</span>
              <span className="w-[200px] text-right">Actions</span>
            </li>
            {list.map((p) => (
              <li key={p.id} className="grid gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_150px_130px_auto] md:items-center">
                <div className="min-w-0">
                  <Link to={`/website/pages/${p.id}`} className="group block min-w-0 focus:outline-none">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-[13px] font-semibold text-brand group-hover:underline group-focus-visible:underline">{p.path}</span>
                      {p.system && <Lock className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-label="Main page: can't be deleted or moved" />}
                    </span>
                    <span className="block truncate text-sm text-ink">{p.title || 'Untitled'}</span>
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:block">
                  <StatusBadge status={p.status} changed={p.status === 'published' && p.changed} />
                  <span className="text-xs text-ink-faint md:hidden">Changed {timeAgo(p.updatedAt, tz)}</span>
                </div>
                <span className="hidden text-sm text-ink-soft md:block" title={p.updatedAt}>
                  {timeAgo(p.updatedAt, tz)}
                </span>
                <div className="flex items-center gap-1.5 md:w-[200px] md:justify-end">
                  <Button size="sm" variant="secondary" icon={Pencil} to={`/website/pages/${p.id}`}>
                    Edit
                  </Button>
                  {p.status === 'published' && <ViewLive size="sm" href={liveHref(p.path)} />}
                  {!p.system && (
                    <IconButton icon={Trash2} label={`Delete ${p.path}`} className="h-8 w-8 hover:text-red-600" onClick={() => askRemove(p)} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {adding && <NewPageModal open onClose={() => setAdding(false)} />}
    </div>
  );
}
