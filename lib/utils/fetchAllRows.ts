/**
 * Every row of a paged list endpoint, in one round trip.
 *
 * Lists that need the whole table used to probe with `page_size: 1` to learn
 * `total`, then ask again with `page_size: total` — two serial round trips on
 * every module open (Resume Scoring did it four times over). None of these
 * endpoints cap `page_size`, so ask for a page larger than any tenant's table
 * up front. If a table ever outgrows it, the remaining pages are fetched in
 * parallel rather than silently truncated.
 */
export const ALL_ROWS_PAGE_SIZE = 10000;

export async function fetchAllRows<R extends { items?: unknown[]; total?: number }>(
  fetchPage: (pageSize: number, page: number) => Promise<R>,
): Promise<R> {
  const first = await fetchPage(ALL_ROWS_PAGE_SIZE, 1);
  const items = first.items || [];
  const total = first.total ?? items.length;
  if (items.length < ALL_ROWS_PAGE_SIZE || items.length >= total) return first;
  const pages = Math.ceil(total / ALL_ROWS_PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => fetchPage(ALL_ROWS_PAGE_SIZE, i + 2)),
  );
  return { ...first, items: [...items, ...rest.flatMap(r => r.items || [])] };
}
