/**
 * Paged-list loaders that used to ask for page 1, then 2, then 3… one after
 * another. These helpers fetch page 1 alone (to learn the total), then the
 * remaining pages a few at a time, and hand the pages back in page order —
 * so the caller ends up with exactly the array the one-by-one loop built.
 */

/** How many pages are in flight at once after page 1. */
export const PAGE_FETCH_CONCURRENCY = 4;

type Settled<R> = { ok: true; value: R; error?: undefined } | { ok: false; value?: undefined; error: unknown };

/**
 * Starts `fetchPage(p)` for every `p` in `pages`, at most `concurrency` at a
 * time. Each entry settles on its own, so the caller decides which failure (if
 * any) matters. Once a page fails, or `shouldStop()` turns true, no further
 * page is started; those never-started pages settle as failed too.
 */
function startPages<R>(
  pages: number[],
  fetchPage: (page: number) => Promise<R>,
  concurrency: number,
  shouldStop?: () => boolean,
): Promise<Settled<R>>[] {
  const resolvers: Array<(s: Settled<R>) => void> = [];
  const results = pages.map(
    () => new Promise<Settled<R>>((resolve) => { resolvers.push(resolve); }),
  );
  let next = 0;
  let halted = false;
  const worker = async () => {
    while (next < pages.length) {
      const index = next++;
      if (halted || shouldStop?.()) {
        halted = true;
        resolvers[index]({ ok: false, error: new Error('Page fetch skipped') });
        continue;
      }
      try {
        resolvers[index]({ ok: true, value: await fetchPage(pages[index]) });
      } catch (error) {
        halted = true;
        resolvers[index]({ ok: false, error });
      }
    }
  };
  for (let i = 0; i < Math.min(concurrency, pages.length); i += 1) void worker();
  return results;
}

/**
 * Pages 2..`pageCount` (page 1 is the caller's), in page order. Rejects with
 * the error of the lowest-numbered page that failed — the same error a
 * one-by-one loop would have thrown first.
 */
export async function fetchRemainingPages<R>(
  pageCount: number,
  fetchPage: (page: number) => Promise<R>,
  concurrency: number = PAGE_FETCH_CONCURRENCY,
): Promise<R[]> {
  const pages = Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => i + 2);
  const out: R[] = [];
  for (const settled of startPages(pages, fetchPage, concurrency)) {
    const s = await settled;
    if (!s.ok) throw s.error;
    out.push(s.value as R);
  }
  return out;
}

type PageResponse<T> = { items?: T[] | null; total?: number | null } | null | undefined;

export interface FetchAllPagesOptions<T> {
  pageSize: number;
  /** Highest page the loop may ask for (default: no cap). */
  maxPages?: number;
  concurrency?: number;
  /** Also stop after a page for which this returns true (checked in page order). */
  stopAfter?: (items: T[]) => boolean;
  /** Checked before starting each page; true stops fetching and returns what was collected. */
  shouldStop?: () => boolean;
  /** Collected items are pushed here as they are accepted, so a caller that
   *  catches an error still holds the pages that came before the failed one. */
  into?: T[];
}

/**
 * Every item of a paged list, identical to this loop:
 *
 *   for (page = 1; page <= maxPages; page++) {
 *     res = await fetchPage(page); items = res?.items ?? [];
 *     all.push(...items);
 *     if (stopAfter?.(items) || items.length < pageSize
 *         || all.length >= (res?.total ?? all.length)) break;
 *   }
 *
 * Page 1 is fetched alone. If it carries a numeric `total`, the pages that
 * total implies are fetched in parallel, then the loop above is replayed over
 * them in page order (each page's own `total`), so pages past where the loop
 * would have stopped are discarded and a failed page only throws if the loop
 * would have reached it. If the replay runs out of prefetched pages without
 * stopping (the total grew), or page 1 has no `total`, it carries on one page
 * at a time exactly like the loop.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<PageResponse<T>>,
  options: FetchAllPagesOptions<T>,
): Promise<T[]> {
  const {
    pageSize,
    maxPages = Number.POSITIVE_INFINITY,
    concurrency = PAGE_FETCH_CONCURRENCY,
    stopAfter,
    shouldStop,
    into = [],
  } = options;
  const all = into;
  /** Adds one page; true when the loop would break after it. */
  const accept = (res: PageResponse<T>): boolean => {
    const items = res?.items ?? [];
    all.push(...items);
    return Boolean(stopAfter?.(items)) || items.length < pageSize || all.length >= (res?.total ?? all.length);
  };

  if (maxPages < 1) return all;
  const first = await fetchPage(1);
  if (accept(first)) return all;

  let page = 2;
  const total = first?.total;
  if (typeof total === 'number' && Number.isFinite(total)) {
    const lastPage = Math.min(Math.ceil(total / pageSize), maxPages);
    const pages = Array.from({ length: Math.max(0, lastPage - 1) }, (_, i) => i + 2);
    const settled = startPages(pages, fetchPage, concurrency, shouldStop);
    for (const pending of settled) {
      if (shouldStop?.()) return all;
      const s = await pending;
      if (shouldStop?.()) return all;
      if (!s.ok) throw s.error;
      page += 1;
      if (accept(s.value as PageResponse<T>)) return all;
    }
  }
  for (; page <= maxPages; page += 1) {
    if (shouldStop?.()) return all;
    if (accept(await fetchPage(page))) return all;
  }
  return all;
}
