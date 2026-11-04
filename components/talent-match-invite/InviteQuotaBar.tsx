'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { assessmentService } from '@/lib/services/assessmentService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { InviteKind } from './inviteVersions';

export type InviteQuotaStats = { total_quota: number; consumed: number; pending: number; available: number };

/** Unlimited plans report a very large quota. */
export const isUnlimitedQuota = (s: InviteQuotaStats | null) => !!s && s.total_quota >= 999999;

/**
 * The invite popup's units, in its header (AS units for assessments, AIU for
 * AI interviews): available of total, a thin bar (used, then held by open
 * invitations) and how much is free; under it the total, what attended
 * candidates consumed and what pending invitations hold (phones: the first
 * line only). Read once per opening, and again whenever `refreshKey`
 * changes (a Copy Link used a unit). `onStats` hands the numbers to the
 * popup so Send is held back when they run short. `action` (the popup's
 * Add-ons) sits beside the figures, on every limited plan.
 */
export default function InviteQuotaBar({ kind, onStats, refreshKey = 0, action }: {
  kind: InviteKind;
  onStats?: (s: InviteQuotaStats | null) => void;
  refreshKey?: number;
  action?: ReactNode;
}) {
  const [stats, setStats] = useState<InviteQuotaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const noun = kind === 'interview' ? 'AI interview' : 'Assessment';

  useEffect(() => {
    let cancelled = false;
    const load = kind === 'interview' ? aiInterviewService.getInvitationStats() : assessmentService.getInvitationStats();
    void load
      .then((s) => { if (!cancelled) { setStats(s); onStats?.(s); } })
      .catch(() => { if (!cancelled) onStats?.(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, refreshKey]);

  const shell = 'flex flex-col gap-1 min-w-0 w-full sm:w-auto sm:max-w-[32.5rem] sm:flex-1 rounded-lg border px-3 py-2';
  if (loading) {
    return (
      <div className={`${shell} border-info-line bg-info-subtle text-xs font-medium text-info-strong`}>
        <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking units…</span>
      </div>
    );
  }
  if (!stats) return null;
  if (isUnlimitedQuota(stats)) {
    return (
      <div className={`${shell} border-info-line bg-info-subtle`}>
        <span className="tf-caption font-semibold text-info-strong">{noun} units · Unlimited</span>
      </div>
    );
  }

  const { total_quota, consumed, pending, available } = stats;
  const out = available <= 0;
  const low = !out && available <= 3;
  const pct = (n: number) => (total_quota > 0 ? Math.min(100, (n / total_quota) * 100) : 0);
  const free = Math.max(0, Math.round(pct(available)));
  const used = Math.round(pct(consumed + pending));

  return (
    <div className={`${shell} ${out ? 'border-destructive-line bg-destructive-subtle' : low ? 'border-warning-line bg-warning-subtle' : 'border-info-line bg-info-subtle'}`}>
      {/* The figures, and Add-ons beside them on the same line — never a row of its own. */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          {/* Units, available / total, the bar and % free — one line. */}
          <div className="flex flex-nowrap items-center gap-x-3 min-w-0">
            <span className="min-w-0 truncate text-2xs font-bold uppercase tracking-wider text-info-strong whitespace-nowrap">{noun} units</span>
            <span className={`shrink-0 text-sm tabular-nums font-semibold whitespace-nowrap ${out ? 'text-destructive' : low ? 'text-warning-strong' : 'text-foreground'}`}>
              {available.toLocaleString()}
              <span className="font-medium text-foreground"> / {total_quota.toLocaleString()} available</span>
            </span>
            <div className="flex h-1.5 flex-1 min-w-8 overflow-hidden rounded-full bg-card" role="img" aria-label={`${used}% of units used`}>
              <div className={`h-full ${out ? 'bg-destructive' : low ? 'bg-brand-orange' : 'bg-brand-blue'}`} style={{ width: `${pct(consumed)}%` }} />
              <div className="h-full bg-brand-cyan/70" style={{ width: `${pct(pending)}%` }} />
            </div>
            <span
              title={out ? `Sending is paused until ${noun} units are added.` : undefined}
              className={`shrink-0 inline-flex items-center px-1.5 py-px rounded-full text-2xs font-semibold border whitespace-nowrap ${
                out ? 'border-destructive-line bg-card text-destructive' : low ? 'border-warning-line bg-card text-warning-strong' : 'border-success-line bg-success-subtle text-success-strong'
              }`}
            >
              {out ? 'No units left' : `${free}% free`}
            </span>
          </div>
          {/* The totals, then what pending invitations hold — a line each. */}
          <p className="flex flex-col gap-y-0.5 tf-micro-hint leading-4 font-medium text-foreground tabular-nums">
            <span>Total {total_quota.toLocaleString()} · Attended (consumed) {consumed.toLocaleString()} · Pending invitations (held) {pending.toLocaleString()}</span>
            {pending > 0 && (
              <span className="inline-flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
                {pending.toLocaleString()} {pending === 1 ? 'unit' : 'units'} held by active invitations, freed when an invite expires or you revoke it.
              </span>
            )}
          </p>
        </div>
        {action && <span className="shrink-0">{action}</span>}
      </div>
    </div>
  );
}
