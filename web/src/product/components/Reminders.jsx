/**
 * Reminders: the Stepper, the repeating-reminder builder (ReminderPattern) and
 * the per-task rule list (ReminderEditor) — the HRMS components, in Task Pro's
 * style.
 *
 * A rule is the HRMS reminder shape:
 *   { channel: 'APP'|'EMAIL', when: 'BEFORE'|'AFTER', amount, unit: 'MINUTES'|'HOURS'|'DAYS' }
 *   { channel, when: 'EVERY', pattern: 'HOURLY'|'DAILY'|'WEEKLY'|'MONTHLY', amount, unit,
 *     from?, to?, at?, weekdays?, monthlyMode?, monthDay?, nthWeek?, weekday? }
 * One repeating ("until done") rule per task; any number of before/after ones.
 */
import { useRef } from 'react';
import clsx from 'clsx';
import { Bell, Minus, Plus, Trash2 } from 'lucide-react';
import { Switch } from '../../platform/ui';
import {
  DEFAULT_REMIND_AT, DEFAULT_REMIND_WINDOW, MAX_REMIND_EVERY_HOURS, NTH_WEEKS, REMINDER_CHANNELS, REMINDER_PATTERNS,
  REMINDER_UNITS, UNIT_LABELS, WEEKDAYS, WEEKDAY_NAMES, ordinal, reminderLabel, reminderPattern, reminderWindow,
  repeatEveryMinutes, repeatingReminderText, time12,
} from '../lifecycle';

const field = 'h-9 rounded-lg border border-line bg-card px-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';

export function chipCls(on) {
  return clsx(
    'inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold transition-colors',
    on ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink-soft hover:border-slate-300 hover:text-ink'
  );
}

/** − value + : a number chosen in steps, worded in the middle. */
export function Stepper({ value, min, max, onChange, format, label }) {
  const set = (n) => onChange(Math.min(max, Math.max(min, n)));
  return (
    <span className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-card p-0.5" role="group" aria-label={label}>
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-slate-100 disabled:opacity-30" aria-label="Less">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="tnum min-w-[5.5rem] text-center text-xs font-semibold text-ink">{format ? format(value) : value}</span>
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-slate-100 disabled:opacity-30" aria-label="More">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** Seven day toggles. */
export function WeekdayPicker({ value = [], onChange }) {
  return (
    <div className="grid grid-cols-7 gap-1 sm:flex">
      {WEEKDAYS.map((d, i) => {
        const on = value.includes(i);
        return (
          <button
            key={i}
            type="button"
            title={WEEKDAY_NAMES[i]}
            aria-label={WEEKDAY_NAMES[i]}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort((a, b) => a - b))}
            className={clsx('h-8 min-w-0 rounded-lg border text-xs font-semibold sm:min-w-[36px]', on ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink-soft')}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};
const toHhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** A repeating rule of `pattern`, keeping what still makes sense from `prev`. */
export function repeatingRule(pattern, prev = null, hints = {}) {
  const head = { channel: prev?.channel || 'APP', when: 'EVERY', pattern };
  const at = prev?.at || DEFAULT_REMIND_AT;
  if (pattern === 'DAILY') return { ...head, unit: 'DAYS', amount: 1, at };
  if (pattern === 'WEEKLY') return { ...head, unit: 'DAYS', amount: 1, at, weekdays: hints.weekdays?.length ? [...hints.weekdays] : [1] };
  if (pattern === 'MONTHLY') {
    return {
      ...head, unit: 'DAYS', amount: 1, at,
      monthlyMode: hints.monthlyMode === 'WEEKDAY' ? 'WEEKDAY' : 'DATE',
      monthDay: hints.monthDay || new Date().getDate(),
      nthWeek: hints.nthWeek ?? 1,
      weekday: hints.weekday ?? 1,
    };
  }
  return { ...head, unit: 'HOURS', amount: 2, from: DEFAULT_REMIND_WINDOW.from, to: DEFAULT_REMIND_WINDOW.to };
}

export function hourlyTimes(rule) {
  const w = reminderWindow(rule);
  const every = repeatEveryMinutes(rule);
  const out = [];
  for (let m = minutesOf(w.from); m <= minutesOf(w.to); m += every) out.push(time12(toHhmm(m)));
  if (out.length <= 6) return out.join(', ');
  return `${out.slice(0, 3).join(', ')} … ${out[out.length - 1]}`;
}

function TimeBox({ label, value, onChange }) {
  return (
    <label className="text-xs font-medium text-ink-soft">
      {label}
      <input type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className={clsx(field, 'mt-1 block w-full')} />
    </label>
  );
}

/**
 * KEEP REMINDING UNTIL IT IS DONE — Hourly (every N hours inside a window),
 * Daily (every N days at a time), Weekly (on ticked days), Monthly (a date or
 * "the first Monday"). `value` is the rule, or null for off.
 */
export function ReminderPattern({ value, onChange, allowOff = true, hints = {}, title = 'Keep reminding until it is done' }) {
  const last = useRef(value);
  if (value) last.current = value;
  const pattern = value ? reminderPattern(value) : 'OFF';
  const set = (patch) => onChange?.({ ...value, pattern, ...patch });
  const pick = (key) => key !== pattern && onChange?.(repeatingRule(key, value, hints));
  const toggle = (on) => {
    if (!on) onChange?.(null);
    else onChange?.(last.current || repeatingRule('HOURLY', null, hints));
  };

  const hours = value?.unit === 'MINUTES'
    ? Math.max(1, Math.round((Number(value.amount) || 60) / 60))
    : Math.max(1, Math.min(MAX_REMIND_EVERY_HOURS, Math.round(Number(value?.amount) || 1)));
  const win = value ? { from: value.from || DEFAULT_REMIND_WINDOW.from, to: value.to || DEFAULT_REMIND_WINDOW.to } : DEFAULT_REMIND_WINDOW;
  const days = value?.weekdays || [];

  return (
    <div className="space-y-3">
      {allowOff && <Switch checked={Boolean(value)} onChange={toggle} label={title} />}

      {value && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 min-[380px]:grid-cols-4" role="tablist" aria-label="How often to remind">
          {REMINDER_PATTERNS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={pattern === s.key}
              onClick={() => pick(s.key)}
              className={clsx('h-8 rounded-lg text-xs font-semibold', pattern === s.key ? 'bg-card text-ink shadow-sm' : 'text-ink-soft hover:text-ink')}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {pattern === 'HOURLY' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" aria-pressed={value.unit !== 'MINUTES' && Number(value.amount) === n} onClick={() => set({ unit: 'HOURS', amount: n })} className={chipCls(value.unit !== 'MINUTES' && Number(value.amount) === n)}>
                {n === 1 ? 'Every hour' : `Every ${n} hours`}
              </button>
            ))}
            <Stepper label="Every how many hours" value={hours} min={1} max={MAX_REMIND_EVERY_HOURS} onChange={(n) => set({ unit: 'HOURS', amount: n })} format={(n) => `every ${n} hour${n === 1 ? '' : 's'}`} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <TimeBox label="From" value={win.from} onChange={(from) => set({ from, to: win.to })} />
            <TimeBox label="Until" value={win.to} onChange={(to) => set({ from: win.from, to })} />
          </div>
          {!(win.from < win.to) && <p className="text-xs font-medium text-red-600">“Until” has to be later than “From”.</p>}
        </>
      )}

      {pattern === 'DAILY' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[[1, 'Every day'], [2, 'Alternate days'], [3, 'Every 3 days']].map(([n, label]) => (
              <button key={n} type="button" aria-pressed={Number(value.amount) === n} onClick={() => set({ amount: n })} className={chipCls(Number(value.amount) === n)}>
                {label}
              </button>
            ))}
            <Stepper label="Every how many days" value={Math.max(1, Math.round(Number(value.amount) || 1))} min={1} max={31} onChange={(n) => set({ amount: n })} format={(n) => `every ${n} day${n === 1 ? '' : 's'}`} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <TimeBox label="At" value={value.at || DEFAULT_REMIND_AT} onChange={(at) => set({ at })} />
          </div>
        </>
      )}

      {pattern === 'WEEKLY' && (
        <>
          <WeekdayPicker value={days} onChange={(weekdays) => set({ weekdays })} />
          {!days.length && <p className="text-xs font-medium text-red-600">Pick at least one day — or turn it off.</p>}
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <TimeBox label="At" value={value.at || DEFAULT_REMIND_AT} onChange={(at) => set({ at })} />
          </div>
        </>
      )}

      {pattern === 'MONTHLY' && (
        <>
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {[['DATE', 'On a date'], ['WEEKDAY', 'On a weekday']].map(([k, label]) => {
              const on = (value.monthlyMode === 'WEEKDAY' ? 'WEEKDAY' : 'DATE') === k;
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => set({ monthlyMode: k })} className={clsx('h-8 rounded-lg px-3 text-xs font-semibold', on ? 'bg-card text-ink shadow-sm' : 'text-ink-soft')}>
                  {label}
                </button>
              );
            })}
          </div>
          {value.monthlyMode === 'WEEKDAY' ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              The
              <select value={value.nthWeek ?? 1} onChange={(e) => set({ nthWeek: Number(e.target.value) })} className={field} aria-label="Which one">
                {NTH_WEEKS.map((n) => <option key={n.key} value={n.key}>{n.label.toLowerCase()}</option>)}
              </select>
              <select value={value.weekday ?? 1} onChange={(e) => set({ weekday: Number(e.target.value) })} className={field} aria-label="Day of the week">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d]}</option>)}
              </select>
              of every month
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              Day of the month
              <Stepper label="Day of the month" value={value.monthDay || 1} min={1} max={31} onChange={(n) => set({ monthDay: n })} format={ordinal} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <TimeBox label="At" value={value.at || DEFAULT_REMIND_AT} onChange={(at) => set({ at })} />
          </div>
        </>
      )}

      {value && (
        <div className="flex items-start gap-3 rounded-xl bg-brand-soft/70 px-3 py-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-white">
            <Bell className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{repeatingReminderText(value)}</p>
            <p className="text-xs text-ink-soft">
              {pattern === 'HOURLY' ? `At ${hourlyTimes(value)}. ` : ''}Until it is done — it stops the moment the work is finished.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** A before/after rule as one editable line. */
function OffsetRule({ rule, onChange, onRemove }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card p-2">
      <select value={rule.channel || 'APP'} onChange={(e) => onChange({ ...rule, channel: e.target.value })} className={field} aria-label="How">
        {REMINDER_CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <input
        type="number"
        min={1}
        max={999}
        value={rule.amount}
        onChange={(e) => onChange({ ...rule, amount: Math.max(1, Number(e.target.value) || 1) })}
        className={clsx(field, 'w-20')}
        aria-label="How many"
      />
      <select value={rule.unit} onChange={(e) => onChange({ ...rule, unit: e.target.value })} className={field} aria-label="Unit">
        {REMINDER_UNITS.map((u) => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
      </select>
      <select value={rule.when} onChange={(e) => onChange({ ...rule, when: e.target.value })} className={field} aria-label="Before or after">
        <option value="BEFORE">before it is due</option>
        <option value="AFTER">after it is due</option>
      </select>
      <button type="button" onClick={onRemove} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label={`Remove the reminder ${reminderLabel(rule)}`}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * The reminders on one task (or the default set in Settings). `emptyText`
 * says what happens with none.
 */
export function ReminderEditor({ value = [], onChange, emptyText = 'No reminders of your own — your default reminders from Settings apply.' }) {
  const list = Array.isArray(value) ? value : [];
  const everyAt = list.findIndex((r) => r.when === 'EVERY');
  const replace = (i, rule) => onChange?.(list.map((r, j) => (j === i ? rule : r)));
  const remove = (i) => onChange?.(list.filter((_, j) => j !== i));

  return (
    <div className="space-y-3">
      {list.length === 0 && <p className="text-sm text-ink-soft">{emptyText}</p>}

      {list.map((r, i) =>
        r.when === 'EVERY' ? null : <OffsetRule key={i} rule={r} onChange={(next) => replace(i, next)} onRemove={() => remove(i)} />
      )}

      {everyAt >= 0 && (
        <div className="space-y-2 rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Until it is done</span>
            <div className="flex items-center gap-2">
              <select value={list[everyAt].channel || 'APP'} onChange={(e) => replace(everyAt, { ...list[everyAt], channel: e.target.value })} className={field} aria-label="How">
                {REMINDER_CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <button type="button" onClick={() => remove(everyAt)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label="Remove this reminder">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <ReminderPattern value={list[everyAt]} allowOff={false} onChange={(r) => r && replace(everyAt, r)} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange?.([...list, { channel: 'APP', when: 'BEFORE', amount: 1, unit: 'HOURS' }])}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-medium text-ink-soft hover:border-slate-300 hover:text-ink"
        >
          <Plus className="h-4 w-4" /> Before / after the deadline
        </button>
        {everyAt < 0 && (
          <button
            type="button"
            onClick={() => onChange?.([...list, repeatingRule('HOURLY')])}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-medium text-ink-soft hover:border-slate-300 hover:text-ink"
          >
            <Bell className="h-4 w-4" /> Repeat until done
          </button>
        )}
      </div>
    </div>
  );
}
