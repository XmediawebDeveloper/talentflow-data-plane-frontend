'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Find the element that actually scrolls this page's content.
 *
 * Subtlety that bit us across the app: the dashboard layout nests several
 * `flex-1` boxes, and `overflow-x: hidden` on any of them forces the *computed*
 * `overflow-y` to `auto` there too (see the house rule above `.tf-table-shell`
 * in globals.css — that accident is why every page shell now says
 * `overflow-x-clip`). So more than one ancestor can report `overflow-y: auto`
 * while only ONE is height-constrained enough that its content overflows and it
 * truly scrolls (usually the dashboard layout's own `flex-1 overflow-y-auto`).
 * The shells no longer add to that count, but the boxes that are genuinely
 * vertical scrollers — dialog bodies, the layout's scroll area — still nest, so
 * the walk keeps its rule: start at the element itself and return the first
 * candidate that is BOTH scrollable AND actually overflowing. Checking
 * overflow-y alone picks a non-scrolling box whose scrollTop is permanently 0.
 */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || null;
}

/**
 * Persist + restore a list page's scroll position across route navigation
 * (drilling into a detail page and coming back). sessionStorage-backed, so it
 * survives the remount within the tab session and clears when the tab closes.
 *
 * Usage:
 *   const rootRef = useScrollRestoration('job-openings', !loading);
 *   return <div ref={rootRef} className="...">…</div>;
 *
 * @param key   Unique per module (namespaces the storage entry).
 * @param ready Becomes true once the list content (and the root) is actually
 *              mounted — typically `!loading`. Detection needs the real,
 *              overflowing DOM to be present.
 * @param deps  Extra values that change the page height enough to require
 *              re-detecting the scroll container (e.g. a cards<->list toggle).
 */
export function useScrollRestoration<T extends HTMLElement = HTMLDivElement>(
  key: string,
  ready: boolean,
  deps: unknown[] = [],
): RefObject<T | null> {
  const rootRef = useRef<T>(null);
  const restoredRef = useRef(false);
  const storageKey = `listScroll:${key}`;

  useEffect(() => {
    if (!ready) return;
    const scroller = getScrollParent(rootRef.current);
    if (!scroller) return;

    // Restore once per mount — double rAF so the list has laid out to full
    // height first, then a couple of short retries in case rows are still
    // settling (otherwise scrollTop clamps to a shorter interim height).
    if (!restoredRef.current) {
      // Done after the FIRST ready pass, whether or not anything was saved.
      // Marking it only when saved > 0 let a later pass (a cards → list
      // switch re-runs this effect via `deps`) "restore" the offset the user
      // had just scrolled to — yanking the page back on top of in-page
      // scrolling such as jump-to-list on a stat-card click.
      restoredRef.current = true;
      let saved = 0;
      try { saved = Number(sessionStorage.getItem(storageKey) || '0'); } catch { /* ignore */ }
      if (saved > 0) {
        const apply = () => { scroller.scrollTop = saved; };
        requestAnimationFrame(() => requestAnimationFrame(apply));
        setTimeout(apply, 120);
        setTimeout(apply, 300);
      }
    }

    // Track (throttled to one write per frame).
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // If the list content isn't currently mounted (e.g. a data refresh
        // swapped in a loader), don't clobber the saved offset.
        if (!rootRef.current) return;
        try { sessionStorage.setItem(storageKey, String(scroller.scrollTop)); } catch { /* ignore */ }
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...deps]);

  return rootRef;
}

/**
 * Persist an arbitrary JSON-serialisable view-state snapshot (active tab,
 * filters, search text, pagination, two-step view, …) and restore it once on
 * mount, so returning from a detail page lands the user exactly where they
 * left off instead of on a reset list.
 *
 * Usage:
 *   useListStatePersistence('job-openings',
 *     { activeFilter, search, page },
 *     (s) => {
 *       if (s.activeFilter) setActiveFilter(s.activeFilter);
 *       if (typeof s.search === 'string') setSearch(s.search);
 *       if (typeof s.page === 'number') setPage(s.page);
 *     });
 *
 * `restore` should defensively apply only recognised fields (guard types) so a
 * stale snapshot can't push an invalid value into state.
 */
export function useListStatePersistence<T extends Record<string, unknown>>(
  key: string,
  snapshot: T,
  restore: (saved: Partial<T>) => void,
): void {
  const storageKey = `listState:${key}`;
  const skipRef = useRef(true);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  // Restore once on mount. Declared BEFORE the persist effect so, on the mount
  // commit, restore's setState calls are queued before persist first fires.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) restoreRef.current(JSON.parse(raw));
    } catch { /* ignore malformed / unavailable storage */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist whenever the snapshot changes. Skip the first pass so the
  // mount-time write (with default state) can't clobber the saved snapshot
  // before restore has applied.
  const serialized = safeStringify(snapshot);
  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    if (serialized == null) return;
    try { sessionStorage.setItem(storageKey, serialized); } catch { /* ignore */ }
  }, [serialized, storageKey]);
}

function safeStringify(value: unknown): string | null {
  try { return JSON.stringify(value); } catch { return null; }
}
