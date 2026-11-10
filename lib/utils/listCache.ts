import api, { getTokens } from '@/lib/services/api';

/**
 * Short-lived, in-memory cache for the whole-list reads that several screens
 * make for the same data (AI interview configs, assessments, "my JDs").
 *
 *  - A read whose key is already in flight shares that request; a settled
 *    read is reused for `LIST_CACHE_TTL_MS`. Each caller gets its own deep
 *    copy, so no caller can change another one's rows.
 *  - `fresh: true` always asks the server, and the answer replaces the cached
 *    one (refresh buttons, re-reads after a change, polls).
 *  - A failed read is never kept.
 *
 * Staleness guards:
 *  - Scoped to the current access token: logout / login, another user, or a
 *    token refresh (which follows every permission change) starts clean.
 *  - EVERY non-GET request made through the shared `api` client clears the
 *    whole cache when it starts and again when it finishes — the same rule the
 *    client's own 1 s GET sharing uses (`invalidatesCache: false` opts a
 *    read-only POST out). The owning services also clear it explicitly in
 *    each of their mutating functions, and jdService clears it when a job's
 *    status changes in this tab or another one.
 *  - A read that was in flight when the cache was cleared is handed to the
 *    callers already waiting on it, but is not stored.
 *  - Browser only, memory only: the server never caches, a reload starts clean.
 *
 * Changes made by OTHER users can therefore appear up to the TTL later on a
 * screen that reads through this cache without `fresh`.
 */
export const LIST_CACHE_TTL_MS = 30_000;

type Entry = {
  promise: Promise<unknown>;
  /** Set once the read has succeeded. */
  value?: unknown;
  settledAt: number | null;
};

const store = new Map<string, Entry>();
let storeScope: string | null = null;
const invalidateListeners = new Set<() => void>();

function currentScope(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return getTokens().accessToken || null;
  } catch {
    return null;
  }
}

function copy<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

/**
 * What a service's whole-list read accepts. By default a read only joins an
 * identical read already in flight (what the API client's GET sharing does
 * too). `reuseRecent` also reuses a completed read for `LIST_CACHE_TTL_MS` —
 * for screens that just display the list on arrival; never for a check made
 * before a write. `fresh` always asks the server (and refreshes the cache).
 */
export type ListReadOptions = { fresh?: boolean; reuseRecent?: boolean };

/** `cachedList` options for a service read given `ListReadOptions`. */
export function listReadOptions(opts?: ListReadOptions): { fresh?: boolean; ttlMs: number } {
  return { fresh: opts?.fresh, ttlMs: opts?.reuseRecent ? LIST_CACHE_TTL_MS : 0 };
}

/** A stable key: `name` plus the params, sorted, with empty values dropped. */
export function listCacheKey(name: string, params: Record<string, unknown> = {}): string {
  const parts = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .map((k) => [k, params[k]]);
  return `${name}|${JSON.stringify(parts)}`;
}

/** Drops every entry whose key starts with `prefix` (all of them by default). */
export function invalidateListCache(prefix = ''): void {
  if (!prefix) {
    store.clear();
  } else {
    for (const key of Array.from(store.keys())) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }
  invalidateListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* a listener's failure must not stop the others */
    }
  });
}

/** Called after every invalidation, for small sibling caches that must clear with this one. */
export function onListCacheInvalidate(listener: () => void): () => void {
  invalidateListeners.add(listener);
  return () => {
    invalidateListeners.delete(listener);
  };
}

/**
 * `load()`'s answer for `key`, shared with identical reads in flight and
 * reused for `ttlMs` after it lands. `fresh` always calls `load()` and stores
 * what it returns. With no signed-in user (or on the server) it just calls
 * `load()`.
 */
export function cachedList<T>(
  key: string,
  load: () => Promise<T>,
  opts: { fresh?: boolean; ttlMs?: number } = {},
): Promise<T> {
  const scope = currentScope();
  if (!scope) return load();
  if (scope !== storeScope) {
    store.clear();
    storeScope = scope;
  }
  const ttlMs = opts.ttlMs ?? LIST_CACHE_TTL_MS;

  if (!opts.fresh) {
    const hit = store.get(key);
    if (hit) {
      if (hit.settledAt === null) return hit.promise.then(() => copy(hit.value as T));
      if (Date.now() - hit.settledAt < ttlMs) return Promise.resolve(copy(hit.value as T));
      store.delete(key);
    }
  }

  const entry: Entry = { promise: Promise.resolve(), settledAt: null };
  entry.promise = load().then(
    (value) => {
      entry.value = value;
      entry.settledAt = Date.now();
      return value;
    },
    (error) => {
      if (store.get(key) === entry) store.delete(key);
      throw error;
    },
  );
  store.set(key, entry);
  return entry.promise.then(() => copy(entry.value as T));
}

/**
 * Wraps each named method of `service` so the cache is cleared before the
 * call and again once it settles (success or failure — a failed write may
 * still have changed something on the server).
 */
export function withListCacheInvalidation<S extends object>(service: S, methods: ReadonlyArray<keyof S>): S {
  for (const name of methods) {
    const original = service[name];
    if (typeof original !== 'function') continue;
    const fn = original as unknown as (...args: unknown[]) => unknown;
    (service as Record<keyof S, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
      invalidateListCache();
      let result: unknown;
      try {
        result = fn.apply(this, args);
      } catch (error) {
        invalidateListCache();
        throw error;
      }
      if (result && typeof (result as Promise<unknown>).finally === 'function') {
        return (result as Promise<unknown>).finally(() => invalidateListCache());
      }
      invalidateListCache();
      return result;
    };
  }
  return service;
}

/* Safety net: any write through the shared API client — from any service or
   component — clears the cache when it starts and when it finishes. */
const writes = (config?: { method?: string; invalidatesCache?: boolean; invalidatesLists?: boolean }) =>
  !!config && (config.method || 'get').toLowerCase() !== 'get'
    && config.invalidatesCache !== false && config.invalidatesLists !== false;
if (typeof window !== 'undefined') {
  api.interceptors.request.use((config) => {
    if (writes(config)) invalidateListCache();
    return config;
  });
  api.interceptors.response.use(
    (response) => {
      if (writes(response.config)) invalidateListCache();
      return response;
    },
    (error) => {
      if (writes(error?.config)) invalidateListCache();
      return Promise.reject(error);
    },
  );
}
