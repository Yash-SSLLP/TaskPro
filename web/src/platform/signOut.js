/**
 * Sign out and forget every cached screen, so the next person on this
 * computer never sees the previous person's data.
 */
import { useSession } from './session';
import { queryClient } from './queryClient';

export async function signOutEverywhere(notice = null) {
  useSession.getState().signOut(notice);
  queryClient.clear();
}
