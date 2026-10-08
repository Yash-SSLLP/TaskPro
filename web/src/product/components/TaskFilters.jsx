/**
 * The panel behind the Filter button: due date (incl. custom), category,
 * people, priority, status, the overdue / late / more-time flags, sub-tasks,
 * team, and the order. Changes apply on "Show tasks"; Escape leaves the list
 * as it was. Every filter runs on the server.
 */
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, Flag, Layers, Tag, User, Users } from 'lucide-react';
import { Button, Modal, Switch } from '../../platform/ui';
import { RANGES, STATUS_STYLES, TASK_PRIORITY, TASK_STATUS, priorityColor, statusLabel, tintStyle } from '../lifecycle';
import { PeoplePicker } from './PeoplePicker';

export const DEFAULT_FILTERS = {
  range: 'all',
  from: '',
  to: '',
  category: '',
  assignedTo: '',
  assignedBy: '',
  priority: '',
  status: '',
  overdue: '',
  late: '',
  moreTime: '',
  includeSubtasks: '',
  team: '',
  sort: 'due',
  dir: 'desc',
};

export const FALLBACK_SORTS = [
  { key: 'due', label: 'Due date', dir: 'desc' },
  { key: 'assigned', label: 'Day assigned', dir: 'desc' },
  { key: 'pending', label: 'Pending days', dir: 'asc' },
  { key: 'priority', label: 'Priority', dir: 'asc' },
  { key: 'title', label: 'Title', dir: 'asc' },
  { key: 'created', label: 'Newest first', dir: 'desc' },
];

export const split = (v) => String(v || '').split(',').filter(Boolean);
const join = (arr) => arr.filter(Boolean).join(',');

export function activeFilterCount(f = {}) {
  return (
    (f.range && f.range !== 'all' ? 1 : 0) +
    split(f.category).length +
    split(f.assignedTo).length +
    split(f.assignedBy).length +
    split(f.priority).length +
    split(f.status).length +
    (f.overdue ? 1 : 0) +
    (f.late ? 1 : 0) +
    (f.moreTime ? 1 : 0) +
    (f.includeSubtasks ? 1 : 0) +
    (f.team ? 1 : 0)
  );
}

const naturalDir = (sorts, key) => sorts.find((s) => s.key === key)?.dir || FALLBACK_SORTS.find((s) => s.key === key)?.dir || 'asc';

function Section({ icon: Icon, title, hint, children }) {
  return (
    <section className="py-4 first:pt-1">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        <Icon className="h-3.5 w-3.5 text-ink-faint" /> {title}
      </h3>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Pill({ on, onClick, children, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={style}
      className={clsx('inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition', style ? '' : on ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink-soft hover:border-slate-300')}
    >
      {children}
    </button>
  );
}

export function TaskFilters({ open, onClose, meta, categories = [], scope = 'mine', value = DEFAULT_FILTERS, onApply }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft({ ...DEFAULT_FILTERS, ...value });
  }, [open, value]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleIn = (key, item) => {
    const cur = split(draft[key]);
    set({ [key]: join(cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item]) });
  };
  const people = meta?.people || [];
  const sorts = (meta?.sorts?.length ? meta.sorts : FALLBACK_SORTS).filter((s) => s.key !== 'points');
  const dir = draft.dir || naturalDir(sorts, draft.sort);
  const count = useMemo(() => activeFilterCount(draft), [draft]);
  const teams = meta?.teams || [];

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Filter tasks"
      subtitle={count ? `${count} filter${count === 1 ? '' : 's'} set` : 'Nothing narrowed down yet'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => setDraft({ ...DEFAULT_FILTERS })}>
            Reset
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply?.(draft);
              onClose?.();
            }}
          >
            Show tasks
          </Button>
        </>
      }
    >
      <div className="divide-y divide-line">
        <Section icon={CalendarDays} title="Due date" hint="Today, this week and this month keep unfinished work in view.">
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map(([key, label]) => (
              <Pill key={key} on={draft.range === key} onClick={() => set({ range: key })}>
                {label}
              </Pill>
            ))}
          </div>
          {draft.range === 'custom' && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs font-medium text-ink-soft">
                From
                <input type="date" value={draft.from} onChange={(e) => set({ from: e.target.value })} className="mt-1 block h-10 w-full rounded-xl border border-line px-3 text-sm" />
              </label>
              <label className="text-xs font-medium text-ink-soft">
                To
                <input type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => set({ to: e.target.value })} className="mt-1 block h-10 w-full rounded-xl border border-line px-3 text-sm" />
              </label>
            </div>
          )}
        </Section>

        <Section icon={Layers} title="Status">
          <div className="flex flex-wrap gap-1.5">
            {TASK_STATUS.map((s) => {
              const on = split(draft.status).includes(s);
              return (
                <button key={s} type="button" aria-pressed={on} onClick={() => toggleIn('status', s)} className={clsx('inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold', STATUS_STYLES[s], on ? 'ring-2 ring-brand ring-offset-1' : 'opacity-80 hover:opacity-100')}>
                  {statusLabel(s)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Switch checked={draft.overdue === 'true'} onChange={(v) => set({ overdue: v ? 'true' : '' })} label="Overdue only" />
            <Switch checked={draft.late === '1'} onChange={(v) => set({ late: v ? '1' : '' })} label="Finished late" />
            <Switch checked={draft.moreTime === '1'} onChange={(v) => set({ moreTime: v ? '1' : '' })} label="More time asked" />
            <Switch checked={draft.includeSubtasks === '1'} onChange={(v) => set({ includeSubtasks: v ? '1' : '' })} label="Include sub-tasks" description="Show the pieces of split tasks too" />
          </div>
        </Section>

        <Section icon={Flag} title="Priority">
          <div className="flex flex-wrap gap-1.5">
            {TASK_PRIORITY.map((p) => {
              const colour = priorityColor(p);
              const on = split(draft.priority).includes(p);
              return (
                <Pill key={p} on={on} onClick={() => toggleIn('priority', p)} style={on ? { backgroundColor: colour.solid, borderColor: colour.solid, color: '#fff' } : tintStyle(colour)}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: on ? '#fff' : colour.solid }} />
                  {p}
                </Pill>
              );
            })}
          </div>
        </Section>

        {categories.length > 0 && (
          <Section icon={Tag} title="Category">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <Pill key={c._id || c.name} on={split(draft.category).includes(c.name)} onClick={() => toggleIn('category', c.name)}>
                  {c.name}
                </Pill>
              ))}
            </div>
          </Section>
        )}

        <Section icon={User} title="People" hint="Search by name or Task Pin.">
          <div className="grid gap-3">
            {scope !== 'mine' && <PeoplePicker label="Assigned to" people={people} value={split(draft.assignedTo)} onChange={(ids) => set({ assignedTo: join(ids) })} allowSelf selfId={meta?.me} placeholder="Anyone" />}
            {scope !== 'delegated' && <PeoplePicker label="Given by" people={people} value={split(draft.assignedBy)} onChange={(ids) => set({ assignedBy: join(ids) })} allowSelf selfId={meta?.me} placeholder="Anyone" />}
          </div>
        </Section>

        {teams.length > 0 && scope !== 'team' && (
          <Section icon={Users} title="Team">
            <div className="flex flex-wrap gap-1.5">
              <Pill on={!draft.team} onClick={() => set({ team: '' })}>
                Any
              </Pill>
              {teams.map((t) => (
                <Pill key={t.id} on={draft.team === String(t.id)} onClick={() => set({ team: String(t.id) })}>
                  {t.name}
                </Pill>
              ))}
            </div>
          </Section>
        )}

        <Section icon={ArrowUpDown} title="Sort by">
          <div className="flex items-center gap-2">
            <select value={draft.sort} onChange={(e) => set({ sort: e.target.value, dir: naturalDir(sorts, e.target.value) })} aria-label="Sort by" className="h-10 flex-1 rounded-xl border border-line bg-card px-3 text-sm">
              {sorts.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => set({ dir: dir === 'desc' ? 'asc' : 'desc' })} aria-label="Reverse the order" title={dir === 'desc' ? 'Descending' : 'Ascending'} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-ink-soft hover:border-slate-400">
              {dir === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </Section>
      </div>
    </Modal>
  );
}
