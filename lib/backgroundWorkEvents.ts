'use client';

import { useEffect, useRef } from 'react';
import { invalidateListCache } from '@/lib/utils/listCache';

/**
 * "Background work moved" — fired when work that runs on the server after the
 * page asked for it (bulk invite sends, resume scoring) lands more results:
 * an invite send's `sent` count went up or it finished, a scoring run scored
 * more resumes or finished.
 *
 * Pages that show counts fed by that work (Invitations Sent, Assessed,
 * Scored…) listen with `useBackgroundWorkRefresh` and re-read quietly, so a
 * send of 5 to JD-222 v2 shows 5 more on every screen as it happens instead of
 * after a reload. The page's own "after send" refresh runs when the send is
 * only *queued* — this is what catches it actually going out.
 */
export const BACKGROUND_WORK_EVENT = 'tf:background-work-changed';

export interface BackgroundWorkDetail {
  kind: 'invite' | 'scoring';
  /** The JD the work belongs to, when known. */
  jdId?: string;
  /** The run finished with this change. */
  finished?: boolean;
}

export function emitBackgroundWork(detail: BackgroundWorkDetail) {
  if (typeof window === 'undefined') return;
  // Lists read through the shared cache must not answer with the old rows.
  invalidateListCache();
  window.dispatchEvent(new CustomEvent<BackgroundWorkDetail>(BACKGROUND_WORK_EVENT, { detail }));
}

/**
 * Calls `refresh` after background work of the given kinds moves — debounced,
 * so a send ticking every couple of seconds re-reads the page at most once per
 * `debounceMs`, and always once more when the run finishes. `refresh` is read
 * fresh each time (no need to memoise it).
 */
export function useBackgroundWorkRefresh(
  refresh: (detail: BackgroundWorkDetail) => void,
  kinds: ReadonlyArray<BackgroundWorkDetail['kind']> = ['invite', 'scoring'],
  debounceMs = 1500,
) {
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });
  const kindsKey = kinds.join(',');

  useEffect(() => {
    const wanted = new Set(kindsKey.split(','));
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last: BackgroundWorkDetail | null = null;
    const onWork = (e: Event) => {
      const detail = (e as CustomEvent<BackgroundWorkDetail>).detail;
      if (!detail || !wanted.has(detail.kind)) return;
      last = detail;
      if (timer) clearTimeout(timer);
      // A finished run refreshes promptly; progress is batched.
      timer = setTimeout(() => {
        timer = null;
        if (last) refreshRef.current(last);
      }, detail.finished ? 300 : debounceMs);
    };
    window.addEventListener(BACKGROUND_WORK_EVENT, onWork);
    return () => {
      window.removeEventListener(BACKGROUND_WORK_EVENT, onWork);
      if (timer) clearTimeout(timer);
    };
  }, [kindsKey, debounceMs]);
}
