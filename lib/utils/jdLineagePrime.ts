import type { JDLineageVersion } from '@/lib/services/jdService';
import { onListCacheInvalidate } from '@/lib/utils/listCache';

/**
 * Job lineages / version counts that arrived INSIDE another response — the
 * `include=lineages,version_counts` extras of GET /assessments — held briefly
 * so the separate GET /jd/lineages and GET /jd/version-counts reads that used
 * to follow every page can be answered without a round trip.
 *
 * Short-lived and conservative: entries expire after PRIME_TTL_MS, every write
 * through the shared api client clears them (listCache invalidation, the same
 * signal the list caches use), and a `fresh` read never consults them. An id
 * that is not primed is simply fetched as before.
 */
const PRIME_TTL_MS = 30_000;

type Entry<T> = { value: T; at: number };
let lineages = new Map<string, Entry<JDLineageVersion[]>>();
let versionCounts = new Map<string, Entry<{ total: number; active: number }>>();

onListCacheInvalidate(() => {
  lineages = new Map();
  versionCounts = new Map();
});

export function primeLineages(map: Record<string, JDLineageVersion[]> | null | undefined): void {
  if (!map) return;
  const at = Date.now();
  for (const [id, value] of Object.entries(map)) lineages.set(id, { value, at });
}

export function primeVersionCounts(map: Record<string, { total: number; active: number }> | null | undefined): void {
  if (!map) return;
  const at = Date.now();
  for (const [id, value] of Object.entries(map)) versionCounts.set(id, { value, at });
}

function split<T>(store: Map<string, Entry<T>>, ids: string[]): { hit: Record<string, T>; missing: string[] } {
  const now = Date.now();
  const hit: Record<string, T> = {};
  const missing: string[] = [];
  for (const id of ids) {
    const entry = store.get(id);
    if (entry && now - entry.at < PRIME_TTL_MS) hit[id] = structuredClone(entry.value);
    else missing.push(id);
  }
  return { hit, missing };
}

/** Primed lineages for these ids, and the ids still to fetch. */
export const takePrimedLineages = (ids: string[]) => split(lineages, ids);
/** Primed version counts for these ids, and the ids still to fetch. */
export const takePrimedVersionCounts = (ids: string[]) => split(versionCounts, ids);
