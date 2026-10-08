/**
 * Templates: tasks worth setting again. Mine, and those shared with my teams
 * (GET /api/tasks/templates → { mine, team: [{ team, templates }] }). Using one
 * opens the assign form already filled in (GET /:id/prefill); a team template
 * can be copied into my own. Saving one from a task is SaveTemplateModal.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bookmark, Copy, Repeat, Trash2, Users, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Drawer, EmptyState, ErrorState, Input, Modal, Select, Skeleton, useConfirm } from '../../platform/ui';
import * as T from '../api';
import { FREQUENCY_LABELS } from '../lifecycle';
import { PriorityChip } from './TaskChips';

function TemplateCard({ tpl, onUse, onCopy, onRemove, busy }) {
  return (
    <div className="flex flex-col rounded-xl border border-line bg-card px-3.5 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{tpl.name}</p>
          {tpl.title && tpl.title !== tpl.name && <p className="truncate text-sm text-ink-soft">{tpl.title}</p>}
        </div>
        <PriorityChip priority={tpl.priority} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
        {tpl.category && <span>{tpl.category}</span>}
        {tpl.repeat?.frequency && tpl.repeat.frequency !== 'ONCE' && (
          <span className="inline-flex items-center gap-1">
            <Repeat className="h-3 w-3" /> {FREQUENCY_LABELS[tpl.repeat.frequency]}
          </span>
        )}
        {Number.isFinite(tpl.dueInDays) && <span>{tpl.dueInDays}-day job</span>}
        {tpl.useCount > 0 && <span>used {tpl.useCount}×</span>}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-line pt-2.5">
        <Button size="sm" icon={Zap} onClick={onUse} loading={busy}>
          Use it
        </Button>
        {onCopy && (
          <Button size="sm" variant="secondary" icon={Copy} onClick={onCopy}>
            Copy to mine
          </Button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label="Remove template">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
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
    <Drawer open={open} onClose={onClose} wide title="Templates" subtitle="Tasks worth setting again — use one to fill in the form.">
      <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
        {[
          ['mine', `Mine (${mine.length})`],
          ['team', `Shared with my teams (${teamCount})`],
        ].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={clsx('h-9 rounded-lg px-3 text-sm font-semibold', tab === k ? 'bg-card text-ink shadow-sm' : 'text-ink-soft')}>
            {label}
          </button>
        ))}
      </div>
      {q.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {q.error && <ErrorState error={q.error} onRetry={q.refetch} />}
      {q.data && tab === 'mine' && (mine.length === 0 ? (
        <EmptyState icon={Bookmark} title="No templates yet" text='Open any task and choose "Save as template" — it will be here, ready to use again.' />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {mine.map((t) => (
            <TemplateCard key={t._id} tpl={t} busy={using === t._id} onUse={() => use(t)} onRemove={() => remove(t)} />
          ))}
        </div>
      ))}
      {q.data && tab === 'team' && (teamCount === 0 ? (
        <EmptyState icon={Users} title="Nothing shared yet" text="Team owners and admins can share a template with their team when they save it." />
      ) : (
        <div className="space-y-5">
          {teams.filter((g) => g.templates?.length).map((g) => (
            <div key={g.team?.id}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <Users className="h-3.5 w-3.5" /> {g.team?.name}
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
