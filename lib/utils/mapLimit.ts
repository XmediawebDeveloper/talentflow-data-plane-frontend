/**
 * `Promise.all(items.map(fn))` with at most `limit` calls in flight, results in
 * the original order.
 *
 * The cross-item tabs (every interview's / assessment's invitations) ask for one
 * thing per item. Fired all at once they fill the browser's handful of
 * connections to the API, so a tab click made meanwhile queues behind them.
 * Capping the fan-out keeps the line moving for everything else.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
