'use client';

import { Loader2 } from 'lucide-react';

/**
 * Shared full-page loader for every step of the AI interview config flow.
 *
 * A single navigation chains several loading screens back to back — e.g.
 * "AI Interview → Create" on Job Details renders the dispatcher's loader, then
 * the route's Suspense fallback, then the page's own fetch loader. When those
 * boxes differ in height the spinner lands at a different vertical centre each
 * time and the transition reads as a shake, so they all render through here.
 *
 * Height is pinned to `min-h-[calc(100dvh-7rem)]` — the same min-height the
 * content cards use — rather than `flex-1`, which would resolve differently
 * depending on whether a given route wraps its page in a flex column. No
 * overflow class either: a toggling scrollbar shifts the centre horizontally.
 */
export default function AIInterviewFlowLoader({
  message = 'Loading…',
}: {
  message?: string;
}) {
  return (
    <div className="w-full min-h-[calc(100dvh-7rem)] flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
        <p className="text-sm text-gray-500 dark:text-slate-500">{message}</p>
      </div>
    </div>
  );
}
