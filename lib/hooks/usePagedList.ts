'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedList, listCacheKey, onListCacheInvalidate, LIST_CACHE_TTL_MS } from '@/lib/utils/listCache';
import { showErrorToast } from '@/lib/utils/errorToast';

/**
 * The standard landing for a list module: the stat cards and ONE page of rows,
 * fetched in parallel, both for the same filters.
 *
 *   GET /<module>/stats?<filters>                     -> card counts
 *   GET /<module>?page&page_size&sort&<filters>       -> { items, total }
 *
 * Card click / filter / sort / search / page change = a new `query`, which
 * re-runs both calls. The server builds both from one filter function, so a
 * card's count always equals the list's `total`.
 *
 *  - Results are cached per (name, query) through `listCache`: going back to a
 *    filter already seen paints immediately, then refreshes in the background.
 *    Any write through the shared api client clears that cache, and the hook
 *    re-reads the current view when it does.
 *  - A response for a query the user has since left is dropped.
 *  - The previous rows stay on screen while the next page loads (no blank flash).
 *  - The next page is prefetched once the current one lands.
 *
 * `query` must be JSON-serialisable; it is the cache key. Search text should be
 * debounced by the caller (useDebounce, ~300 ms) before it goes in here.
 */

export interface PagedResult<T> {
  items: T[];
  total: number;
}

/** Any plain object with page + page_size; no index signature required. */
export interface PagedListQuery {
  page: number;
  page_size: number;
}

export interface UsePagedListOptions<T, S, Q extends PagedListQuery> {
  /** Cache namespace, e.g. 'resumes'. */
  name: string;
  query: Q;
  fetchPage: (query: Q) => Promise<PagedResult<T>>;
  /** Stats ignore paging/sort: receives the query without page, page_size, sort_*. */
  fetchStats?: (filters: Omit<Q, 'page' | 'page_size'>) => Promise<S>;
  enabled?: boolean;
  /** Prefetch page+1 after the current page lands (default true). */
  prefetchNext?: boolean;
  /** For callers that render no error state of their own: when the page
   *  fails, show an error toast with this title and a Retry (= refresh).
   *  Without it a failed load just looks like an empty list. */
  errorToast?: string;
}

export interface UsePagedListResult<T, S> {
  items: T[];
  total: number;
  stats: S | null;
  /** True only while there is nothing to show yet (first load). */
  loading: boolean;
  /** True while any request for the current query is in flight. */
  refreshing: boolean;
  error: unknown;
  /** Re-read from the server, bypassing the cache. */
  refresh: () => void;
}

const SORT_KEYS = new Set(['page', 'page_size', 'sort_by', 'sort_dir', 'sort_order']);

function statsFilters<Q extends PagedListQuery>(query: Q): Omit<Q, 'page' | 'page_size'> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(query as object)) if (!SORT_KEYS.has(k)) out[k] = v;
  return out as Omit<Q, 'page' | 'page_size'>;
}

export function usePagedList<T, S = unknown, Q extends PagedListQuery = PagedListQuery>(
  opts: UsePagedListOptions<T, S, Q>,
): UsePagedListResult<T, S> {
  const { name, query, fetchPage, fetchStats, enabled = true, prefetchNext = true, errorToast } = opts;
  const errorToastRef = useRef(errorToast);
  errorToastRef.current = errorToast;
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<S | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Latest fetchers without making them effect dependencies (callers pass inline lambdas).
  const fetchPageRef = useRef(fetchPage);
  const fetchStatsRef = useRef(fetchStats);
  fetchPageRef.current = fetchPage;
  fetchStatsRef.current = fetchStats;

  const seqRef = useRef(0);
  const freshRef = useRef(false);
  const queryKey = JSON.stringify(query);
  const statsKey = JSON.stringify(statsFilters(query));

  useEffect(() => {
    if (!enabled) return;
    const seq = ++seqRef.current;
    const fresh = freshRef.current;
    freshRef.current = false;
    const q = JSON.parse(queryKey) as Q;
    const cacheOpts = { fresh, ttlMs: LIST_CACHE_TTL_MS };
    setRefreshing(true);
    setError(null);

    const pageP = cachedList(listCacheKey(`${name}:page`, q as unknown as Record<string, unknown>), () => fetchPageRef.current(q), cacheOpts);
    const statsFn = fetchStatsRef.current;
    const statsP = statsFn
      ? cachedList(listCacheKey(`${name}:stats`, JSON.parse(statsKey)), () => statsFn(JSON.parse(statsKey)), cacheOpts)
      : Promise.resolve(null as S | null);

    pageP.then(
      (res) => {
        if (seq !== seqRef.current) return;
        setItems(res.items || []);
        setTotal(res.total ?? (res.items || []).length);
        setLoaded(true);
        if (prefetchNext && q.page * q.page_size < (res.total ?? 0)) {
          const next = { ...q, page: q.page + 1 } as Q;
          cachedList(listCacheKey(`${name}:page`, next as unknown as Record<string, unknown>), () => fetchPageRef.current(next), { ttlMs: LIST_CACHE_TTL_MS })
            .catch(() => { /* prefetch is best-effort */ });
        }
      },
      (err) => {
        if (seq !== seqRef.current) return;
        setError(err);
        setLoaded(true);
        if (errorToastRef.current) {
          showErrorToast(err, errorToastRef.current, {
            id: `paged-list-${name}`,
            retry: () => { freshRef.current = true; setReloadTick((t) => t + 1); },
          });
        }
      },
    );
    statsP.then(
      (s) => { if (seq === seqRef.current) setStats(s); },
      (err) => { if (seq === seqRef.current) console.warn(`[usePagedList:${name}] stats failed`, err); },
    );
    Promise.allSettled([pageP, statsP]).then(() => {
      if (seq === seqRef.current) setRefreshing(false);
    });
  }, [name, queryKey, statsKey, enabled, prefetchNext, reloadTick]);

  // A write anywhere cleared the cache: re-read what is on screen. A write
  // clears it when it starts AND when it ends, so coalesce into one re-read.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onListCacheInvalidate(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setReloadTick((t) => t + 1), 250);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);
  // Drop late responses after unmount.
  useEffect(() => () => { seqRef.current += 1; }, []);

  const refresh = useCallback(() => {
    freshRef.current = true;
    setReloadTick((t) => t + 1);
  }, []);

  return { items, total, stats, loading: enabled && !loaded, refreshing, error, refresh };
}
