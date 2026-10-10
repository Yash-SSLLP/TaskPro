/**
 * Karo data hooks shared by its pages.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../platform/api';
import { isSuperAdmin, useSession, useSettings } from '../platform/session';
import * as T from './api';
import { idOf, orderOrgTabs, setServedPalette } from './lifecycle';

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

/** Organizations (teams) I own or run — the ones I see tasks of (scope=team). */
export function useAdminTeams(meta) {
  return useMemo(() => (meta?.teams || []).filter((t) => t.myRole === 'owner' || t.myRole === 'admin'), [meta]);
}

// The latest order save: an older answer landing late must not undo a newer move.
let orderSaves = 0;
// Saves still waiting for an answer, and the order the server last confirmed:
// what a failed save puts back (never another save's unconfirmed order).
let orderPending = 0;
let orderConfirmed = [];

/**
 * The Tasks screen's organization tabs, in my order (`tabs`), whether the strip
 * shows at all (`shown`: not for the Super Admin, nor somebody in no
 * organization), the saved order (`saved`) and `saveOrder(keys)`: PATCH
 * /api/me/settings { orgTabs }, shown at once through the session's settings
 * and put back if the save fails. `[]` is the default order.
 */
export function useOrgTabs(meta) {
  const user = useSession((s) => s.user);
  const saved = useSettings().orgTabs;
  const tabs = useMemo(() => orderOrgTabs(meta?.orgTabs || [], saved), [meta, saved]);
  const shown = !isSuperAdmin(user) && tabs.some((t) => t.name);
  const saveOrder = useCallback(async (keys) => {
    const { settings, updateSettings } = useSession.getState();
    // With nothing in flight, the order on screen is the server's.
    if (!orderPending) orderConfirmed = settings?.orgTabs || [];
    const mine = ++orderSaves;
    orderPending += 1;
    updateSettings({ ...settings, orgTabs: keys });
    try {
      const data = await api.patch('/api/me/settings', { orgTabs: keys });
      orderConfirmed = data.settings?.orgTabs || [];
      if (mine === orderSaves) updateSettings(data.settings);
    } catch (err) {
      if (mine === orderSaves) updateSettings({ ...useSession.getState().settings, orgTabs: orderConfirmed });
      toast.error(err.message || 'Could not save the order of the tabs.');
    } finally {
      orderPending -= 1;
    }
  }, []);
  return { tabs, shown, saved: saved || [], saveOrder };
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
