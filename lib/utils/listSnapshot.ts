import { getTokens } from '@/lib/services/api';

/**
 * Stale-while-revalidate memory for the big list tables (All Interviews, All
 * Assessments, ...).
 *
 * Those tables load their whole set before drawing anything, and each tab is a
 * fresh component, so every tab click or return from a details page started
 * from a skeleton. A table now remembers the rows it last loaded: the next
 * mount draws them at once and fetches again in the background, swapping the
 * fresh rows in when they land. Nothing is ever shown INSTEAD of a refresh.
 *
 * Safety:
 *  - Keyed by the signed-in user and tenant (read from the access token), so a
 *    second user in the same tab can never see the first one's rows. A token
 *    that cannot be read means no caching at all.
 *  - Memory only: a reload or a new tab starts clean.
 *  - Expires after MAX_AGE_MS, and is wiped on logout (`clearTokens`).
 */
const MAX_AGE_MS = 10 * 60 * 1000;

type Entry = { rows: unknown; at: number };
const store = new Map<string, Entry>();

function identity(): string | null {
  try {
    const { accessToken } = getTokens();
    if (!accessToken) return null;
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const who = payload.sub ?? payload.user_id ?? payload.id;
    if (!who) return null;
    return `${who}|${payload.tenant_id ?? payload.tid ?? payload.tenant ?? ''}`;
  } catch {
    return null;
  }
}

export function readListSnapshot<T>(name: string): T | null {
  const who = identity();
  if (!who) return null;
  const hit = store.get(`${who}|${name}`);
  if (!hit) return null;
  if (Date.now() - hit.at > MAX_AGE_MS) {
    store.delete(`${who}|${name}`);
    return null;
  }
  return hit.rows as T;
}

export function writeListSnapshot<T>(name: string, rows: T): void {
  const who = identity();
  if (!who) return;
  store.set(`${who}|${name}`, { rows, at: Date.now() });
}

export function clearListSnapshots(): void {
  store.clear();
}

/** Dev-only timing note, so a load's "first rows" and "complete" times can be read from the console. */
export function perfNote(label: string, startedAt: number): void {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console
  console.info(`[perf] ${label}: ${Math.round(performance.now() - startedAt)} ms`);
}
