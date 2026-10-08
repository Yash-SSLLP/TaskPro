/**
 * Choosing people, as chips — a search box, a grouped dropdown and the chosen
 * people as removable chips (the HRMS PeoplePicker, on Task Pins).
 *
 * The list is `/api/tasks/meta` → `people`: who you may assign to, each with a
 * `relation` (self · team · contact · other) and the ids of the `teams` you
 * share. An empty box opens on Myself, then the chosen team, team-mates and
 * contacts; typing searches name and Task Pin. `onAddByPin` adds a footer
 * link for somebody who is not in the list yet.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronDown, KeyRound, Search, X } from 'lucide-react';
import { Avatar } from '../../platform/ui';
import { pinOf } from '../../platform/pin';
import { RELATION_LABEL, idOf } from '../lifecycle';

const PER_GROUP = 25;

function matches(p, q) {
  if (!q) return true;
  const pin = String(p.pin || '').toLowerCase();
  const compact = q.replace(/[\s-]/g, '');
  return `${p.name || ''} ${p.title || ''}`.toLowerCase().includes(q) || (compact.length >= 2 && pin.includes(compact));
}

export function PeoplePicker({
  label,
  hint,
  icon: Icon,
  people = [],
  value = [],
  onChange,
  placeholder = 'Choose someone…',
  disabled = false,
  /** 1 = single select (picking replaces and closes). 0 = no limit. */
  max = 0,
  /** Offer "Myself" at the top. */
  allowSelf = false,
  selfId = '',
  /** Put the members of this team first. */
  teamId = '',
  teamName = '',
  /** Footer: "Not in the list? Add by Task Pin". */
  onAddByPin,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [pos, setPos] = useState(null);
  const boxRef = useRef(null);
  const fieldRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const single = max === 1;

  const selected = useMemo(() => (Array.isArray(value) ? value : value ? [value] : []).map(String), [value]);
  const emit = (ids) => onChange?.(Array.isArray(value) ? ids : ids[0] || '');

  const byId = useMemo(() => new Map(people.map((p) => [idOf(p), p])), [people]);
  const chosen = useMemo(() => selected.map((id) => byId.get(id) || { _id: id, name: 'Someone' }), [selected, byId]);
  const me = useMemo(() => (selfId ? byId.get(String(selfId)) : people.find((p) => p.relation === 'self')) || null, [selfId, byId, people]);
  const myId = me ? idOf(me) : '';

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const picked = new Set(selected);
    const pool = people.filter((p) => !picked.has(idOf(p)) && !p.departed && p.canAssign !== false);
    const others = pool.filter((p) => idOf(p) !== myId);
    const cut = (rows) => [rows.slice(0, PER_GROUP), Math.max(0, rows.length - PER_GROUP)];
    const self = allowSelf && me && !picked.has(myId) && matches(me, q) ? [me] : [];

    if (q) return [['Myself', self, 0], ['Matches', ...cut(others.filter((p) => matches(p, q)))]].filter(([, rows]) => rows.length);

    const inTeam = teamId ? others.filter((p) => (p.teams || []).map(String).includes(String(teamId))) : [];
    const shown = new Set(inTeam.map(idOf));
    const mates = others.filter((p) => p.relation === 'team' && !shown.has(idOf(p)));
    const contacts = others.filter((p) => p.relation === 'contact' && !shown.has(idOf(p)));
    const rest = others.filter((p) => p.relation !== 'team' && p.relation !== 'contact' && !shown.has(idOf(p)));
    return [
      ['Myself', self, 0],
      [teamName ? `In ${teamName}` : 'In this team', ...cut(inTeam)],
      ['Team-mates', ...cut(mates)],
      ['Contacts', ...cut(contacts)],
      ['Everyone', ...cut(rest)],
    ].filter(([, rows]) => rows.length);
  }, [people, query, selected, allowSelf, me, myId, teamId, teamName]);

  const flat = useMemo(() => groups.flatMap(([, rows]) => rows), [groups]);
  useEffect(() => setCursor(0), [query, open]);

  const place = useCallback(() => {
    const r = fieldRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 260 && above > below;
    setPos({ left, width, maxHeight: Math.max(180, Math.min(380, up ? above : below)), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, selected.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-cursor="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  const full = max > 0 && selected.length >= max;

  const add = (id) => {
    const key = String(id);
    if (single) {
      emit([key]);
      setQuery('');
      setOpen(false);
      return;
    }
    if (full || selected.includes(key)) return;
    emit([...selected, key]);
    setQuery('');
    inputRef.current?.focus();
  };
  const remove = (id) => emit(selected.filter((v) => v !== String(id)));

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (!flat.length) return;
      setCursor((c) => (c + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length);
      return;
    }
    if (e.key === 'Enter' && open && flat[cursor]) {
      e.preventDefault();
      add(idOf(flat[cursor]));
      return;
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === 'Backspace' && !query && selected.length) remove(selected[selected.length - 1]);
  };

  let index = -1;

  return (
    <div ref={boxRef} className={clsx('relative', className)}>
      {label && (
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
          {Icon && <Icon className="h-4 w-4 text-ink-faint" aria-hidden />} {label}
        </label>
      )}
      <div
        ref={fieldRef}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={clsx(
          'flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm shadow-sm',
          open ? 'border-brand ring-2 ring-brand/30' : 'border-line',
          disabled ? 'bg-slate-50 opacity-60' : 'cursor-text bg-card'
        )}
      >
        {chosen.map((p) => (
          <span key={idOf(p)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft py-0.5 pl-0.5 pr-2 text-sm font-medium text-brand">
            <Avatar name={p.name} size="xs" />
            {idOf(p) === myId ? 'Myself' : p.name}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(idOf(p));
                }}
                className="-mr-1 rounded-full p-0.5 hover:bg-brand/15"
                aria-label={`Remove ${p.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={chosen.length ? '' : placeholder}
          disabled={disabled}
          aria-label={label || placeholder}
          className="h-8 min-w-[7rem] flex-1 border-0 bg-transparent px-1 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')} aria-hidden />
      </div>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}

      {open &&
        !disabled &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-line bg-card shadow-pop"
            style={{ left: pos.left, width: pos.width, maxHeight: pos.maxHeight, ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }) }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
              {!flat.length && (
                <p className="px-3 py-3 text-sm text-ink-soft">{query ? 'Nobody matches that.' : 'Nobody to choose from yet.'}</p>
              )}
              {groups.map(([heading, rows, extra]) => (
                <div key={heading}>
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{heading}</p>
                  {rows.map((p) => {
                    index += 1;
                    const here = index;
                    const isMe = idOf(p) === myId;
                    const blocked = full && !single;
                    return (
                      <button
                        key={idOf(p)}
                        type="button"
                        data-cursor={cursor === here ? '1' : undefined}
                        onMouseEnter={() => setCursor(here)}
                        onClick={() => add(idOf(p))}
                        disabled={blocked}
                        className={clsx('flex min-h-[44px] w-full items-center gap-2.5 px-3 py-1.5 text-left', cursor === here && 'bg-slate-50', blocked && 'cursor-not-allowed opacity-40')}
                      >
                        <Avatar name={p.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{isMe ? `Myself (${p.name})` : p.name}</span>
                          <span className="block truncate text-xs text-ink-soft">
                            <span className="font-mono">{pinOf(p)}</span>
                            {!isMe && p.relation && RELATION_LABEL[p.relation] ? ` · ${RELATION_LABEL[p.relation]}` : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {extra > 0 && <p className="px-3 pb-1 text-xs text-ink-faint">+{extra} more — keep typing to narrow it down</p>}
                </div>
              ))}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-slate-50 px-3 py-2 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1.5">
                <Search className="h-3 w-3" /> {full && !single ? `That is all ${max}.` : 'Search by name or Task Pin.'}
              </span>
              {onAddByPin && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAddByPin();
                  }}
                  className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                >
                  <KeyRound className="h-3 w-3" /> Add by Task Pin
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
