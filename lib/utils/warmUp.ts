/**
 * Background "warm-up": once a page has drawn its own content, load the data of
 * its other tabs one after another so a click on any of them finds it ready.
 *
 * Steps run in order, lightest first, one at a time, after a short pause — so
 * the page's own requests and the user's first clicks are never queued behind
 * them. A failed step is skipped (the tab simply loads normally when opened).
 * Returns a cancel function for the effect cleanup.
 */
export function startWarmUp(steps: Array<() => Promise<unknown>>, delayMs = 1200): () => void {
  let cancelled = false;
  const timer = window.setTimeout(async () => {
    for (const step of steps) {
      if (cancelled) return;
      try {
        await step();
      } catch {
        /* the tab loads on its own when opened */
      }
    }
  }, delayMs);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
