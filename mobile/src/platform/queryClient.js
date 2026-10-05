/**
 * The React Query cache: lists stay cached between screens, refresh when the
 * app comes back to the foreground, and retry only failures worth retrying.
 */
import { AppState, Platform } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';

focusManager.setEventListener((handleFocus) => {
  if (Platform.OS === 'web') return undefined;
  const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
  return () => sub.remove();
});

const retryable = (err) => !err?.status || err.status >= 500;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (count, err) => retryable(err) && count < 2,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
