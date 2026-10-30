'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { assessmentService } from '@/lib/services/assessmentService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { InviteKind } from './inviteVersions';

export type InviteQuotaStats = { total_quota: number; consumed: number; pending: number; available: number };

/** Unlimited plans report a very large quota. */
export const isUnlimitedQuota = (s: InviteQuotaStats | null) => !!s && s.total_quota >= 999999;

/**
 * The invite popup's units, in its header (AS units for assessments, AIU for
 * AI interviews): available of total with a thin bar; consumed and held-by-
 * pending sit in its tooltip. Read once per opening. `onStats` hands the
 * numbers to the popup so Send is held back when they run short.
 */
export default function InviteQuotaBar({ kind, onStats }: { kind: InviteKind; onStats?: (s: InviteQuotaStats | null) => void }) {
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
  }, [kind]);

  const shell = 'flex flex-col gap-1 min-w-0 w-full sm:w-56 rounded-lg border px-3 py-2';
  if (loading) {
    return (
      <div className={`${shell} border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400`}>
        <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking units…</span>
      </div>
    );
  }
  if (!stats) return null;
  if (isUnlimitedQuota(stats)) {
    return (
      <div className={`${shell} border-gray-200 dark:border-slate-700`}>
        <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{noun} units · Unlimited</span>
      </div>
    );
  }

  const { total_quota, consumed, pending, available } = stats;
  const out = available <= 0;
  const low = !out && available <= 3;
  const pct = (n: number) => (total_quota > 0 ? Math.min(100, (n / total_quota) * 100) : 0);
  const detail = `Total ${total_quota.toLocaleString()} · Used ${consumed.toLocaleString()}${pending > 0 ? ` · Held by open invitations ${pending.toLocaleString()} (freed when an invite expires or is revoked)` : ''}`;

  return (
    <div
      title={detail}
      className={`${shell} ${out ? 'border-destructive-line bg-destructive-subtle' : low ? 'border-warning-line bg-warning-subtle' : 'border-gray-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40'}`}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-gray-600 dark:text-slate-400 truncate">{noun} units</span>
        <span className={`tabular-nums font-semibold ${out ? 'text-destructive' : low ? 'text-warning-strong' : 'text-gray-900 dark:text-slate-50'}`}>
          {available.toLocaleString()}
          <span className="font-normal text-gray-500 dark:text-slate-400"> / {total_quota.toLocaleString()} left</span>
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-slate-700" role="img" aria-label={detail}>
        <div className={`h-full ${out ? 'bg-destructive' : low ? 'bg-brand-orange' : 'bg-brand-blue'}`} style={{ width: `${pct(consumed)}%` }} />
        <div className="h-full bg-brand-cyan/70" style={{ width: `${pct(pending)}%` }} />
      </div>
    </div>
  );
}
