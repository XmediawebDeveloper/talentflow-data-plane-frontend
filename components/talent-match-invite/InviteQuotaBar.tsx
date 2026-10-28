'use client';

import { useEffect, useState } from 'react';
import { Bot, ClipboardList, Info, Loader2, ShieldAlert } from 'lucide-react';
import { assessmentService } from '@/lib/services/assessmentService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { InviteKind } from './inviteVersions';

type Stats = { total_quota: number; consumed: number; pending: number; available: number };

/**
 * The invite popup's unit card (AS units for assessments, AIU for AI
 * interviews): available / total, consumed and held-by-pending, low / out
 * tones. Read once per opening. `onStats` hands the numbers to the popup so
 * Send can be held back when the quota is out.
 */
export default function InviteQuotaBar({ kind, onStats }: { kind: InviteKind; onStats?: (s: Stats | null) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const noun = kind === 'interview' ? 'AI interview' : 'assessment';

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

  const panel = (tone: 'ok' | 'low' | 'out') =>
    `p-3 sm:p-4 rounded-xl border ring-1 ring-black/[0.02] ${
      tone === 'out'
        ? 'bg-destructive-subtle border-destructive-line'
        : tone === 'low'
          ? 'bg-warning-subtle border-warning-line'
          : 'bg-gradient-to-r from-brand-blue/[0.07] via-brand-cyan/[0.05] to-white dark:from-brand-blue/10 dark:via-brand-cyan/5 dark:to-slate-900 border-brand-blue/15'
    }`;
  const KindIcon = kind === 'interview' ? Bot : ClipboardList;
  const tile = (tone: 'ok' | 'low' | 'out') => (
    <div className={`flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg ring-1 max-sm:hidden flex items-center justify-center ${
      tone === 'out' ? 'bg-destructive/10 ring-destructive/20' : tone === 'low' ? 'bg-brand-orange/10 ring-brand-orange/20' : 'bg-brand-blue/10 ring-brand-blue/15'
    }`}>
      {tone === 'out'
        ? <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
        : <KindIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${tone === 'low' ? 'text-brand-orange-deep' : 'text-brand-blue'}`} />}
    </div>
  );

  if (loading) {
    return (
      <div className={`${panel('ok')} flex items-center gap-3 text-sm text-gray-500 dark:text-slate-400`}>
        {tile('ok')}
        <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Checking {noun} quota...</span>
      </div>
    );
  }
  if (!stats) return null;

  const { total_quota, consumed, pending, available } = stats;
  if (total_quota >= 999999) {
    return (
      <div className={`${panel('ok')} flex items-center gap-3`}>
        {tile('ok')}
        <span className="text-sm font-medium text-gray-900 dark:text-slate-50">Unlimited {noun} units</span>
      </div>
    );
  }
  const out = available <= 0;
  const low = !out && available <= 3;
  const tone = out ? 'out' : low ? 'low' : 'ok';
  const pct = (n: number) => (total_quota > 0 ? Math.min(100, (n / total_quota) * 100) : 0);
  const freePercent = total_quota > 0 ? (available / total_quota) * 100 : 0;

  return (
    <div className={panel(tone)}>
      <div className="flex items-start gap-3">
        {tile(tone)}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 mb-2">
            <span className="text-sm font-medium text-gray-900 dark:text-slate-50">
              {out ? `No ${noun} units available` : low ? `Only ${available} unit${available !== 1 ? 's' : ''} available` : `${available.toLocaleString()} ${noun} unit${available !== 1 ? 's' : ''} available`}
            </span>
            <span className="text-sm font-medium text-gray-700 dark:text-slate-200 tabular-nums">
              {available.toLocaleString()} / {total_quota.toLocaleString()} available
            </span>
          </div>
          <div className="w-full flex bg-brand-blue/15 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
            <div className={`h-full transition-all duration-300 ${tone === 'out' ? 'bg-red-600' : tone === 'low' ? 'bg-brand-orange' : 'bg-brand-blue'}`} style={{ width: `${pct(consumed)}%` }} />
            <div className="h-full bg-brand-cyan/70 transition-all duration-300" style={{ width: `${pct(pending)}%` }} />
          </div>
          <div className="flex items-start justify-between gap-2 mt-1.5 max-sm:flex-col-reverse max-sm:gap-1.5">
            <div className="min-w-0 text-xs text-gray-600 dark:text-slate-400 max-sm:w-full">
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums">
                <span>Total: {total_quota}</span>
                <span>Attended (consumed): {consumed}</span>
                {pending > 0 && <span>Pending invitations (held): {pending}</span>}
              </div>
              {pending > 0 && (
                <p className="mt-1.5 inline-flex max-sm:flex items-start sm:items-center gap-1.5 rounded-lg sm:rounded-full bg-brand-cyan/10 ring-1 ring-brand-cyan/25 px-2.5 py-1 sm:py-0.5 text-brand-blue dark:text-slate-200">
                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5 sm:mt-0" />
                  <span><span className="font-semibold">Note:</span> {pending} unit{pending > 1 ? 's' : ''} held by active invitations — freed when an invite expires or you revoke it.</span>
                </p>
              )}
            </div>
            {tone === 'out' ? (
              <span className="flex-shrink-0 text-xs font-medium text-red-700 bg-red-50 ring-1 ring-red-200 rounded-full px-2 py-0.5">Quota exhausted</span>
            ) : tone === 'low' ? (
              <span className="flex-shrink-0 text-xs font-medium text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20 rounded-full px-2 py-0.5">Low quota</span>
            ) : (
              <span className="flex-shrink-0 text-xs font-medium text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-full px-2 py-0.5 tabular-nums">{freePercent.toFixed(0)}% free</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
