'use client';

import type { LucideIcon } from 'lucide-react';
import { Coins } from 'lucide-react';
import { cn } from './utils';

type QuotaTone = 'neutral' | 'warning' | 'danger';

interface QuotaBadgeProps {
  label: string;
  availableUnits: number | null;
  totalUnits?: number;
  isUnlimited?: boolean;
  /** Defaults to the coins mark. Units are one currency across the product, so
   *  every quota badge should carry the same icon — override only for a badge
   *  that is measuring something other than units. */
  icon?: LucideIcon;
  unitLabel?: string;
  className?: string;
}

export default function QuotaBadge({
  label,
  availableUnits,
  totalUnits,
  isUnlimited = false,
  icon: Icon = Coins,
  unitLabel = 'units',
  className,
}: QuotaBadgeProps) {
  const hasTotal = typeof totalUnits === 'number' && totalUnits > 0;
  const tone: QuotaTone = isUnlimited
    ? 'neutral'
    : availableUnits !== null && availableUnits <= 0
    ? 'danger'
    : availableUnits !== null && availableUnits <= 2
    ? 'warning'
    : 'neutral';
  // The label is no longer shown inline, so it carries the full context here —
  // including the total, which the compact "324 left" form drops.
  const tooltip = isUnlimited
    ? `${label}: Unlimited`
    : availableUnits === null
    ? label
    : hasTotal
    ? `${label}: ${availableUnits.toLocaleString()} of ${totalUnits.toLocaleString()} ${unitLabel} remaining`
    : `${label}: ${availableUnits.toLocaleString()} ${unitLabel} remaining`;

  return (
    // py-1.5 around a 24px icon tile lands at 38px total — the same height as the
    // header action buttons beside it (px-3 py-2 + text-sm + border), so the row
    // still aligns while the content gets real vertical breathing room.
    // The usage progress bar was removed earlier: it was the extra ~8px that made
    // this badge taller than every button in the same row.
    <div
      title={tooltip}
      aria-label={tooltip}
      className={cn(
      'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all',
      tone === 'danger'
        ? 'border-red-200 ring-red-100'
        : tone === 'warning'
        ? 'border-brand-orange/30 ring-brand-orange/10'
        : 'border-gray-100 dark:border-slate-700/60',
      className,
    )}>
      <div className={cn(
        'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ring-1',
        tone === 'danger'
          ? 'bg-red-50 text-red-600 ring-red-200'
          : tone === 'warning'
          ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
          : 'bg-brand-blue text-white ring-white/10 shadow-sm shadow-brand-blue/25',
      )}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      {/* Single line: "324 quota left". The label is no longer rendered — only one of
          these appears per page, so the page itself already says which quota it
          is. It is kept as the tooltip/aria text so the meaning is still
          reachable rather than lost. */}
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        {isUnlimited ? (
          <span className="text-sm font-semibold text-brand-blue leading-none">Unlimited</span>
        ) : availableUnits !== null ? (
          <>
            <span className={cn(
              'text-sm font-semibold tabular-nums leading-none tracking-tight',
              tone === 'danger'
                ? 'text-red-700'
                : tone === 'warning'
                ? 'text-brand-orange-deep'
                : 'text-brand-blue',
            )}>
              {availableUnits.toLocaleString()}
            </span>
            <span className="text-2xs text-gray-500 dark:text-slate-400 leading-none">Units Left</span>
          </>
        ) : (
          <span className="text-xs text-gray-400 dark:text-slate-500 leading-none">Loading...</span>
        )}
      </div>
    </div>
  );
}
