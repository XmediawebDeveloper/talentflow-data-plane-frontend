'use client';

import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Lightbulb, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import InviteStatusChip, { type InviteStatusKind } from '@/components/ui/invite-status-chip';
import { IconButton } from '@/components/ui/icon-button';

/**
 * The Invite Status Tracking popups' first-time-user aids, shared by the
 * Assessment and AI Interview trackers (their `guided` prop): a hint that the
 * count cards filter the list, a "what do the statuses mean" legend, and how
 * fresh the list is. They only
 * ADD to the tracker — every control it already has stays where it is.
 */

/* ── Status meanings ─────────────────────────────────────────────────── */
export const STATUS_HELP: Partial<Record<InviteStatusKind, string>> = {
  invited: 'The invite was sent. The candidate has not opened it yet.',
  read: 'The candidate opened the invite email but has not started.',
  link_created: 'A link was created and no email has been sent yet.',
  system_check: 'The candidate accepted consent and is checking camera and microphone.',
  in_progress: 'The candidate is taking it right now.',
  completed: 'Finished. "(Auto)" means it was submitted when the time ran out.',
  terminated: 'Ended early — the candidate left, or was stopped by proctoring.',
  cancelled: 'The session was cancelled before it finished.',
  expired: 'The link passed its deadline before the candidate finished. You can resend it.',
  revoked: 'You cancelled the link. The candidate can no longer open it.',
  invite_failed: 'The email could not be sent. Check the address and resend.',
  bounced: 'The email bounced. Change the address and resend.',
};

export function StatusLegend({ kinds }: { kinds: InviteStatusKind[] }) {
  /* Kept inside the Track popup: the popup's panel is the collision boundary,
     so the legend flips / shifts to stay within it (and scrolls if it is
     taller than the room there) instead of spilling over its edge. */
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [boundary, setBoundary] = useState<Element | null>(null);
  return (
    <Popover onOpenChange={(open) => { if (open) setBoundary(triggerRef.current?.closest('.tf-tracker-panel') ?? null); }}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
        >
          <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
          What do the statuses mean?
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionBoundary={boundary ?? undefined}
        className="w-[min(24rem,calc(100vw-1.5rem))] p-3"
      >
        <p className="tf-caption mb-2">Invite statuses</p>
        <ul className="space-y-2">
          {kinds.map((kind) => (
            <li key={kind} className="flex items-start gap-2">
              <span className="shrink-0 w-[7.5rem]"><InviteStatusChip kind={kind} /></span>
              <span className="tf-meta">{STATUS_HELP[kind]}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/* ── Card filter hint ────────────────────────────────────────────────── */
/** Above the count cards: what clicking one does — or, once one is picked,
 *  which one is filtering the list, with a way back to all. */
export function StatCardsHint({ activeLabel, onClear }: { activeLabel: string | null; onClear: () => void }) {
  if (activeLabel) {
    return (
      <div className="flex flex-wrap items-center gap-2 tf-meta">
        <span>Showing only</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 pl-2.5 pr-1 py-0.5 text-xs font-medium">
          {activeLabel}
          <IconButton bare label="Show all candidates" tooltip="Show all" type="button" onClick={onClear} className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-blue/15">
            <X className="w-3 h-3" />
          </IconButton>
        </span>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-1.5 tf-meta">
      <Lightbulb className="w-3.5 h-3.5 text-brand-orange shrink-0" aria-hidden="true" />
      Tip: click a card to show only those candidates.
    </p>
  );
}

/* ── Freshness ───────────────────────────────────────────────────────── */
/** "Updated just now / 12s ago / 3 min ago", ticking on its own. */
export function UpdatedAgo({ at }: { at: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);
  if (!at) return null;
  const s = Math.max(0, Math.round((now - at) / 1000));
  const text = s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
  return <span className="tf-meta whitespace-nowrap" aria-live="off">Updated {text}</span>;
}
