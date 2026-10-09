/**
 * Contacts: my Task Pin, adding people by theirs, requests both ways, and the
 * people I'm connected with (the ones I can give tasks to).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, Search, Send, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';
import { timeAgo } from '../format';
import { pinOf } from '../pin';
import { useSession, useTz } from '../session';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, PersonLine, PinCard, PinLookup, Skeleton, WhatsAppIcon, useConfirm } from '../ui';

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['contacts'] });
    qc.invalidateQueries({ queryKey: ['people'] });
    qc.invalidateQueries({ queryKey: ['tasks', 'meta'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

function SectionTitle({ title, count, children }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        {title}
        {count > 0 && <Badge tone="neutral">{count}</Badge>}
      </h2>
      {children}
    </div>
  );
}

function RowsSkeleton({ rows = 3 }) {
  return Array.from({ length: rows }, (_, i) => (
    <div key={i} className="flex items-center gap-3 p-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  ));
}

function AddByPin({ incoming }) {
  const refresh = useRefresh();
  const send = useMutation({
    mutationFn: (pin) => api.post('/api/contacts', { pin }),
    onSuccess: (data) => {
      toast.success(data?.status === 'accepted' ? "You're now contacts" : 'Request sent');
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });
  const accept = useMutation({
    mutationFn: (id) => api.post(`/api/contacts/${id}/accept`),
    onSuccess: () => {
      toast.success("You're now contacts");
      refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle title="Add by Task Pin" />
      <PinLookup
        label="Their Task Pin"
        hint="Ask them for their 8-character pin. They'll get a request to accept."
        action={({ person, relation, pin, reset }) => {
          if (relation === 'none')
            return (
              <Button icon={Send} loading={send.isPending} onClick={() => send.mutate(pin, { onSuccess: reset })}>
                Send request
              </Button>
            );
          if (relation === 'incoming') {
            const req = incoming.find((r) => r.person?.id === person.id);
            return (
              <Button
                icon={Check}
                loading={accept.isPending || send.isPending}
                onClick={() =>
                  // Without the request id at hand, sending a request accepts theirs.
                  req ? accept.mutate(req.id, { onSuccess: reset }) : send.mutate(pin, { onSuccess: reset })
                }
              >
                Accept
              </Button>
            );
          }
          if (relation === 'contact')
            return (
              <p className="text-sm text-ink-soft">
                {person.name} is already in your contacts.{' '}
                <Link to={`/tasks?assign=${person.id}`} className="font-semibold text-brand hover:underline">
                  Assign a task
                </Link>
              </p>
            );
          if (relation === 'outgoing') return <p className="text-sm text-ink-soft">Waiting for them to accept.</p>;
          if (relation === 'self') return <p className="text-sm text-ink-soft">That's your own pin. Share it with others so they can add you.</p>;
          return null;
        }}
      />
    </Card>
  );
}

function Requests({ incoming, outgoing, tz }) {
  const refresh = useRefresh();
  const [busyId, setBusyId] = useState(null);
  const act = useMutation({
    mutationFn: ({ id, kind }) => (kind === 'cancel' ? api.del(`/api/contacts/${id}`) : api.post(`/api/contacts/${id}/${kind}`)),
    onMutate: ({ id, kind }) => setBusyId(`${kind}:${id}`),
    onSuccess: (_, { kind }) => {
      toast.success({ accept: "You're now contacts", decline: 'Request declined', cancel: 'Request cancelled' }[kind]);
      refresh();
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setBusyId(null),
  });
  const busy = (kind, id) => busyId === `${kind}:${id}`;

  if (!incoming.length && !outgoing.length) return null;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {incoming.length > 0 && (
        <div className={outgoing.length ? '' : 'lg:col-span-2'}>
          <SectionTitle title="Asking to add you" count={incoming.length} />
          <Card className="divide-y divide-line overflow-hidden border-amber-200">
            {incoming.map((r) => (
              <div key={r.id} className="space-y-3 p-4 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
                <div className="min-w-0 flex-1">
                  <PersonLine person={r.person} sub={r.at ? timeAgo(r.at, tz) : undefined} />
                </div>
                <div className="flex shrink-0 gap-2 pl-[52px] sm:pl-0">
                  <Button size="sm" icon={Check} loading={busy('accept', r.id)} onClick={() => act.mutate({ id: r.id, kind: 'accept' })}>
                    Accept
                  </Button>
                  <Button size="sm" variant="secondary" icon={X} loading={busy('decline', r.id)} onClick={() => act.mutate({ id: r.id, kind: 'decline' })}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
      {outgoing.length > 0 && (
        <div className={incoming.length ? '' : 'lg:col-span-2'}>
          <SectionTitle title="Requests you sent" count={outgoing.length} />
          <Card className="divide-y divide-line overflow-hidden">
            {outgoing.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <PersonLine person={r.person} sub={r.at ? `sent ${timeAgo(r.at, tz)}` : undefined} />
                </div>
                <Button size="sm" variant="ghost" loading={busy('cancel', r.id)} onClick={() => act.mutate({ id: r.id, kind: 'cancel' })}>
                  Cancel
                </Button>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

function ContactList({ contacts, loading, tz }) {
  const refresh = useRefresh();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [removing, setRemoving] = useState(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const bare = needle.replace(/[\s-]/g, '');
    if (!needle) return contacts;
    return contacts.filter(({ person: p }) => {
      const name = (p?.name || '').toLowerCase();
      const title = (p?.title || '').toLowerCase();
      const pin = (p?.pin || pinOf(p)).toLowerCase().replace(/-/g, '');
      return name.includes(needle) || title.includes(needle) || (bare && pin.includes(bare));
    });
  }, [contacts, q]);

  const remove = async (c) => {
    const ok = await confirm({
      title: `Remove ${c.person?.name}?`,
      text: "You won't be able to give each other new tasks unless you share a team. Tasks you already have stay as they are.",
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    setRemoving(c.id);
    try {
      await api.del(`/api/contacts/${c.id}`);
      toast.success('Contact removed');
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemoving(null);
    }
  };

  const whatsappOff = async (c) => {
    const ok = await confirm({
      title: `Stop WhatsApp with ${c.person?.name}?`,
      text: "Neither of you will see the other's mobile number on tasks, or a WhatsApp button. To switch it on again, send them a new WhatsApp invite link.",
      confirmLabel: 'Switch off',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await api.patch(`/api/contacts/${c.id}`, { whatsapp: false });
      toast.success('WhatsApp switched off');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <SectionTitle title="My contacts" count={contacts.length}>
        {contacts.length > 0 && (
          <Input
            className="w-full sm:w-64"
            placeholder="Search name, pin or title"
            prefix={<Search className="h-4 w-4" />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search contacts"
          />
        )}
      </SectionTitle>
      <Card className="divide-y divide-line overflow-hidden">
        {loading && <RowsSkeleton />}
        {!loading && contacts.length === 0 && (
          <EmptyState
            icon={Users}
            title="No contacts yet"
            text="Add someone by their Task Pin, or share yours. Once they accept, you can give each other tasks."
          />
        )}
        {!loading && contacts.length > 0 && shown.length === 0 && (
          <p className="px-4 py-8 text-center text-[15px] text-ink-soft">No contact matches "{q}".</p>
        )}
        {shown.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
            <div className="min-w-0 flex-1 basis-56">
              <PersonLine person={c.person} sub={c.since ? `since ${timeAgo(c.since, tz)}` : undefined} />
            </div>
            <div className="flex shrink-0 items-center gap-1 pl-[52px] sm:pl-0">
              {c.whatsapp && (
                <button
                  type="button"
                  onClick={() => whatsappOff(c)}
                  title="You can WhatsApp each other about tasks. Click to switch off."
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-[#25D366]/20"
                >
                  <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp on
                </button>
              )}
              <Button size="sm" variant="soft" to={`/tasks?assign=${c.person?.id}`}>
                Assign task
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={UserMinus}
                loading={removing === c.id}
                onClick={() => remove(c)}
                aria-label={`Remove ${c.person?.name}`}
                title="Remove contact"
              >
                <span className="hidden sm:inline">Remove</span>
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function ContactsPage() {
  const user = useSession((s) => s.user);
  const tz = useTz();
  const query = useQuery({ queryKey: ['contacts'], queryFn: () => api.get('/api/contacts') });
  const contacts = query.data?.contacts || [];
  const incoming = query.data?.incoming || [];
  const outgoing = query.data?.outgoing || [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Contacts"
        subtitle={
          query.data
            ? `${contacts.length} contact${contacts.length === 1 ? '' : 's'}${incoming.length ? ` · ${incoming.length} asking to add you` : ''}`
            : 'People you can give tasks to'
        }
        actions={
          incoming.length > 0 && (
            <Badge tone="amber">
              <UserPlus className="h-3.5 w-3.5" aria-hidden /> {incoming.length} new request{incoming.length === 1 ? '' : 's'}
            </Badge>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <PinCard person={user} className="h-full" />
        <AddByPin incoming={incoming} />
      </div>

      {query.error ? (
        <Card>
          <ErrorState error={query.error} onRetry={query.refetch} />
        </Card>
      ) : (
        <>
          <Requests incoming={incoming} outgoing={outgoing} tz={tz} />
          <ContactList contacts={contacts} loading={query.isLoading} tz={tz} />
        </>
      )}
    </div>
  );
}
