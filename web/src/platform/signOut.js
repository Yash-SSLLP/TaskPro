/**
 * Sign out and forget every cached screen, so the next person on this
 * computer never sees the previous person's data. The server is told too
 * (best effort, never waited on), so this device's session ends there.
 */
import { endSession } from './api';
import { useSession } from './session';
import { queryClient } from './queryClient';

export async function signOutEverywhere(notice = null) {
  endSession(useSession.getState().token);
  useSession.getState().signOut(notice);
  queryClient.clear();
}
