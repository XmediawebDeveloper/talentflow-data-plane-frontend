'use client';

import { useEffect } from 'react';
import { useQuota } from '@/contexts/QuotaContext';

/**
 * Shared quota data (QuotaContext) for a page that used to call
 * `/usage/quota-status` itself on mount.
 *
 * QuotaContext only refetches on its own mount and on the units-consumed
 * event, so it can hold data from much earlier in the session (e.g. before a
 * job was published elsewhere). To keep the old "fresh on page open"
 * guarantee, this forces one refresh through the context on mount — unless
 * the context fetched within `maxAgeMs`, or its first fetch (started at app
 * load) is still in flight. That removes only the duplicate call, never the
 * freshness.
 *
 * `refreshKey` re-runs the check (e.g. the user id).
 */
export function useFreshQuota(maxAgeMs = 5000, refreshKey?: unknown) {
  const quota = useQuota();
  const { quotaData, loading, error, lastFetchTime, refetch } = quota;

  useEffect(() => {
    const initialFetchInFlight = loading && !quotaData && !error;
    if (initialFetchInFlight) return;
    if (lastFetchTime && Date.now() - lastFetchTime < maxAgeMs) return;
    void refetch();
    // Mount / refreshKey only: later context updates must not trigger refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return quota;
}
