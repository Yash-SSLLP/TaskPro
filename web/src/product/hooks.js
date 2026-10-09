/**
 * PinTask data hooks shared by its pages.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../platform/session';
import * as T from './api';
import { idOf, setServedPalette } from './lifecycle';

/**
 * GET /api/tasks/meta — people (the assignable list), teams, categories,
 * palettes, sorts, defaults: everything the forms need, in one cached call.
 */
export function useTaskMeta() {
  const q = useQuery({
    queryKey: ['tasks', 'meta'],
    queryFn: async () => {
      const meta = await T.taskMeta();
      setServedPalette(meta);
      return meta;
    },
    staleTime: 60_000,
  });
  return q;
}

/** Who am I, as the task module sees it. */
export function useMeId() {
  const user = useSession((s) => s.user);
  const { data: meta } = useTaskMeta();
  return String(meta?.me || (meta?.people || []).find((p) => p.relation === 'self')?._id || user?.id || '');
}

/** Teams I own or administer — the ones I see tasks of (scope=team). */
export function useAdminTeams(meta) {
  return useMemo(() => (meta?.teams || []).filter((t) => t.myRole === 'owner' || t.myRole === 'admin'), [meta]);
}

/** Categories: `/meta` carries them; `/categories` is the fallback. */
export function useCategories(meta) {
  const fromMeta = meta?.categories;
  const q = useQuery({
    queryKey: ['tasks', 'categories'],
    queryFn: () => T.listCategories(),
    enabled: Boolean(meta) && !Array.isArray(fromMeta),
    staleTime: 60_000,
  });
  return Array.isArray(fromMeta) ? fromMeta : q.data?.categories || [];
}

export function useDebounced(value, ms = 300) {
  const key = JSON.stringify(value);
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(JSON.parse(key)), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return settled;
}

/** Refresh everything a change to a task can affect. */
export function useInvalidateTasks() {
  const qc = useQueryClient();
  return (id) => {
    qc.invalidateQueries({ queryKey: ['tasks'], predicate: (q) => q.queryKey[1] !== 'meta' });
    if (id) qc.invalidateQueries({ queryKey: ['task', String(id)] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

/** Is this person on the task's assignee list? */
export const isAssignee = (task, meId) => (task?.assignees || []).some((a) => idOf(a.user) === String(meId));
