/**
 * The blog's posts, last changed first: filter by status (draft, scheduled,
 * published), search the title or address, narrow to one tag; write a new one.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Newspaper, PenSquare, Pencil, Search, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, qs } from '../../api';
import { formatDateTime, timeAgo } from '../../format';
import { useTz } from '../../session';
import { Button, Card, EmptyState, ErrorState, IconButton, Input, Segmented, useConfirm } from '../../ui';
import { ListSkeleton } from '../console/shared';
import { MediaThumb } from './MediaPicker';
import { useMediaLibrary } from './media';
import { StatusBadge, useDebounced, ViewLive } from './shared';

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
];

export function BlogTab() {
  const tz = useTz();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const tagQ = useDebounced(tag.trim());
  const list = useQuery({
    queryKey: ['site', 'posts', { status, search, tagQ, page }],
    queryFn: () => api.get(`/api/site/posts${qs({ status, q: search, tag: tagQ, page })}`),
    placeholderData: (prev) => prev,
  });
  const media = useMediaLibrary().data || [];
  const posts = list.data?.posts || [];
  const filtered = !!(status || search || tagQ);

  const remove = useMutation({
    mutationFn: (p) => api.del(`/api/site/posts/${p.id}`),
    onSuccess: (_, p) => {
      qc.invalidateQueries({ queryKey: ['site', 'posts'] });
      toast.success(`“${p.title}” is deleted`);
    },
    onError: (e) => toast.error(e.message),
  });
  const askRemove = async (p) => {
    const ok = await confirm({
      title: `Delete “${p.title}”?`,
      text: p.status === 'published' ? `Visitors who open /blog/${p.slug} get “page not found”.` : 'The draft is deleted.',
      confirmLabel: 'Delete post',
    });
    if (ok) remove.mutate(p);
  };

  const when = (p) => {
    if (p.scheduled) return `Appears ${formatDateTime(p.publishedAt, tz)}`;
    if (p.status === 'published' && p.publishedAt) return `Published ${formatDateTime(p.publishedAt, tz)}`;
    return `Changed ${timeAgo(p.updatedAt, tz)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="min-w-0 flex-1 basis-56"
          placeholder="Search title or address"
          prefix={<Search className="h-4 w-4" />}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          aria-label="Search posts"
        />
        <Input
          className="w-full sm:w-44"
          placeholder="Tag"
          prefix={<Tag className="h-4 w-4" />}
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setPage(1);
          }}
          aria-label="Only posts with this tag"
        />
        <Button icon={PenSquare} to="/website/posts/new">
          New post
        </Button>
      </div>
      <div className="max-w-full overflow-x-auto">
        <Segmented
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={STATUSES}
        />
      </div>

      <Card className="overflow-hidden">
        {list.error && <ErrorState error={list.error} onRetry={list.refetch} />}
        {list.isLoading && <ListSkeleton rows={4} />}
        {list.data && posts.length === 0 && (
          <EmptyState
            icon={Newspaper}
            title={filtered ? 'No post matches' : 'No posts yet'}
            text={filtered ? 'Try another search, tag or status.' : 'Write the first one: it stays a draft until you publish it.'}
            action={
              !filtered && (
                <Button icon={PenSquare} to="/website/posts/new">
                  New post
                </Button>
              )
            }
          />
        )}
        {posts.length > 0 && (
          <ul className={clsx('divide-y divide-line', list.isFetching && !list.isLoading && 'opacity-70')}>
            {posts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
                <MediaThumb media={media.find((m) => m.id === p.cover?.media)} className="hidden h-12 w-16 shrink-0 rounded-lg sm:block" />
                <Link to={`/website/posts/${p.id}`} className="group min-w-0 flex-1 basis-full focus:outline-none sm:basis-auto">
                  <span className="block truncate font-semibold text-ink group-hover:text-brand group-hover:underline group-focus-visible:underline">{p.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
                    <span className="font-mono">/blog/{p.slug}</span>
                    <span aria-hidden>·</span>
                    <span>{when(p)}</span>
                    {p.tags?.slice(0, 4).map((t) => (
                      <span key={t} className="rounded-full bg-well px-2 py-px text-[11px] font-medium text-ink-soft">
                        {t}
                      </span>
                    ))}
                  </span>
                </Link>
                <StatusBadge status={p.status} scheduled={p.scheduled} />
                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="sm" variant="secondary" icon={Pencil} to={`/website/posts/${p.id}`}>
                    Edit
                  </Button>
                  {p.status === 'published' && !p.scheduled && <ViewLive size="sm" href={p.url} />}
                  <IconButton icon={Trash2} label={`Delete “${p.title}”`} className="h-8 w-8 hover:text-red-600" onClick={() => askRemove(p)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {list.data?.pages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm text-ink-soft">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
            Newer
          </Button>
          <span>
            Page {list.data.page} of {list.data.pages} · {list.data.total} posts
          </span>
          <Button size="sm" variant="secondary" disabled={page >= list.data.pages} onClick={() => setPage((n) => n + 1)}>
            Older
          </Button>
        </div>
      )}
    </div>
  );
}
