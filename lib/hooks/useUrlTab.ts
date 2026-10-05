'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

/** Fired after `useUrlTab` rewrites the URL — `replaceState` has no event. */
const URL_TAB_EVENT = 'tf:url-tab';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(URL_TAB_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(URL_TAB_EVENT, onChange);
  };
}
const getSearch = () => window.location.search;
// Server render and hydration see no param, i.e. the default tab.
const getServerSearch = () => '';

/**
 * A detail page's open tab, kept in the URL (`?<param>=<tab>`) so a refresh,
 * a shared link or Back / Forward reopens the same tab. The default tab
 * leaves the param off, so ordinary links stay clean.
 *
 * Written with `history.replaceState` (AssessmentDetailsView's `?tab=` does
 * the same): not a navigation, no history entry. Read from `location` rather
 * than `useSearchParams`, so hosts need no Suspense boundary — this also runs
 * inside dialogs on statically rendered pages.
 *
 * `enabled: false` keeps the tab in local state only — for a view embedded in
 * a page whose URL it doesn't own.
 */
export function useUrlTab<T extends string>(
  param: string,
  allowed: readonly T[],
  fallback: T,
  enabled = true,
): [T, (tab: T) => void] {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const [localTab, setLocalTab] = useState<T>(fallback);

  const fromUrl = new URLSearchParams(search).get(param);
  const urlTab = fromUrl && (allowed as readonly string[]).includes(fromUrl) ? (fromUrl as T) : fallback;
  const tab = enabled ? urlTab : localTab;

  const setTab = useCallback((next: T) => {
    if (!enabled) {
      setLocalTab(next);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (next === fallback) params.delete(param);
    else params.set(param, next);
    const qs = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    window.dispatchEvent(new Event(URL_TAB_EVENT));
  }, [enabled, fallback, param]);

  return [tab, setTab];
}
