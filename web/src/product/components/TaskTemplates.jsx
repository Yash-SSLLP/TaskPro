/**
 * Templates: tasks worth setting again. Mine, and those shared with my teams
 * (GET /api/tasks/templates → { mine, team: [{ team, templates }] }). Using one
 * opens the assign form already filled in (GET /:id/prefill); a team template
 * can be copied into my own. Saving one from a task is SaveTemplateModal.
 *
 * The cards are the HRMS's: a hairline box, the name, a quiet line of facts,
 * and a small "Use it" / Copy / remove row.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bookmark, Copy, Loader2, Repeat, Trash2, User, Users, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Drawer, ErrorState, Input, Modal, Select, Skeleton, useConfirm } from '../../platform/ui';
import * as T from '../api';
import { FREQUENCY_LABELS } from '../lifecycle';
import { PriorityChip } from './TaskChips';

function TemplateCard({ tpl, onUse, onCopy, onRemove, busy }) {
  return (
    <div className="flex flex-col rounded-xl border border-line bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{tpl.name}</p>
          {tpl.title && tpl.title !== tpl.name && <p className="truncate text-xs text-ink-soft">{tpl.title}</p>}
        </div>
        <PriorityChip priority={tpl.priority} className="shrink-0" />
      </div>
      {/* flex-1: the action row sits on the card's foot, level with its neighbour's. */}
      <div className="mt-1.5 flex flex-1 flex-wrap content-start items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
        {tpl.category && <span>{tpl.category}</span>}
        {tpl.repeat?.frequency && tpl.repeat.frequency !== 'ONCE' && (
          <span className="inline-flex items-center gap-1">
            <Repeat className="h-2.5 w-2.5" /> {FREQUENCY_LABELS[tpl.repeat.frequency]}
          </span>
        )}
        {Number.isFinite(tpl.dueInDays) && <span>{tpl.dueInDays}-day job</span>}
        {tpl.useCount > 0 && <span>used {tpl.useCount}×</span>}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-line pt-2">
        <button type="button" onClick={onUse} disabled={busy} className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-brand px-3 text-xs font-medium text-on-brand transition hover:bg-brand-dark disabled:opacity-60">
          {busy ? <Loader2 className="h-[11px] w-[11px] animate-spin" /> : <Zap className="h-[11px] w-[11px]" />} Use it
        </button>
        {onCopy && (
          <button type="button" onClick={onCopy} title="Save a copy of my own" className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-ink-soft transition hover:border-slate-300 hover:text-brand">
            <Copy className="h-[11px] w-[11px]" /> Copy
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} title="Remove" aria-label="Remove template" className="ml-auto grid min-h-[30px] min-w-[30px] place-items-center rounded-lg border border-line text-ink-faint transition hover:border-red-300 hover:text-red-600">
            <Trash2 className="h-[11px] w-[11px]" />
          </button>
        )}
      </div>
    </div>
  );
}

function Empty({ title, body }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {body && <p className="mt-1 text-xs text-ink-soft">{body}</p>}
    </div>
  );
}

export function TemplatesDrawer({ open, onClose, onUse }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState('mine');
  const [using, setUsing] = useState('');
  const q = useQuery({ queryKey: ['tasks', 'templates'], queryFn: T.listTemplates, enabled: open });
  const refresh = () => qc.invalidateQueries({ queryKey: ['tasks', 'templates'] });

  const copy = useMutation({
    mutationFn: (id) => T.copyTemplate(id),
    onSuccess: () => {
      toast.success('Copied into your templates.');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const use = async (tpl) => {
    setUsing(tpl._id);
    try {
      const { prefill } = await T.templatePrefill(tpl._id);
      onUse?.(prefill);
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Could not open that template.');
    } finally {
      setUsing('');
    }
  };

  const remove = async (tpl) => {
    if (!(await confirm({ title: 'Remove this template?', text: `"${tpl.name}" will no longer be offered. Tasks already set from it are untouched.`, confirmLabel: 'Remove' }))) return;
    try {
      await T.deleteTemplate(tpl._id);
      toast.success('Removed.');
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const mine = q.data?.mine || q.data?.templates || [];
  const teams = q.data?.team || [];
  const teamCount = teams.reduce((n, g) => n + (g.templates?.length || 0), 0);

  return (
    <Drawer open={open} onClose={onClose} wide title="Templates">
      <div className="mb-4 flex flex-wrap gap-1.5 pt-2" role="tablist">
        {[
          ['mine', `Mine (${mine.length})`, User],
          ['team', `Shared with my teams (${teamCount})`, Users],
        ].map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={clsx('inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition', tab === k ? 'border-brand bg-well text-brand' : 'border-line text-ink-soft hover:border-slate-300')}
          >
            <Icon className="h-[13px] w-[13px]" /> {label}
          </button>
        ))}
      </div>
      {q.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>}
      {q.error && <ErrorState error={q.error} onRetry={q.refetch} />}
      {q.data && tab === 'mine' && (mine.length === 0 ? (
        <Empty title="No templates yet" body='Open a task and choose "Save as template".' />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {mine.map((t) => (
            <TemplateCard key={t._id} tpl={t} busy={using === t._id} onUse={() => use(t)} onRemove={() => remove(t)} />
          ))}
        </div>
      ))}
      {q.data && tab === 'team' && (teamCount === 0 ? (
        <Empty title="Nothing shared yet" />
      ) : (
        <div className="space-y-5">
          {teams.filter((g) => g.templates?.length).map((g) => (
            <div key={g.team?.id}>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                <Users className="h-3 w-3" /> {g.team?.name}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.templates.map((t) => (
                  <TemplateCard key={t._id} tpl={t} busy={using === t._id} onUse={() => use(t)} onCopy={() => copy.mutate(t._id)} onRemove={t.can?.delete ? () => remove(t) : undefined} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </Drawer>
  );
}

/** "Save as template" from a task: a name, and optionally a team to share it with. */
export function SaveTemplateModal({ open, onClose, task, meta }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const [busy, setBusy] = useState(false);
  const adminTeams = (meta?.teams || []).filter((t) => t.myRole === 'owner' || t.myRole === 'admin');
  if (!open || !task) return null;

  const save = async () => {
    setBusy(true);
    try {
      await T.createTemplate({ fromTask: task._id, name: (name || task.title).trim(), ...(team ? { team } : {}) });
      toast.success(team ? 'Saved and shared with the team.' : 'Saved to your templates.');
      qc.invalidateQueries({ queryKey: ['tasks', 'templates'] });
      onClose?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Save as template"
      subtitle="Its title, details, priority, category, links, reminders and people are kept."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Bookmark} loading={busy} onClick={save}>
            Save template
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Template name" placeholder={task.title} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        {adminTeams.length > 0 && (
          <Select label="Share with a team" optional value={team} onChange={(e) => setTeam(e.target.value)} hint="Everyone in the team can use it.">
            <option value="">Just me</option>
            {adminTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
      </div>
    </Modal>
  );
}
