/**
 * The shared React Query cache.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: (count, err) => (err?.status && err.status < 500 ? false : count < 2),
      refetchOnWindowFocus: false,
    },
  },
});
