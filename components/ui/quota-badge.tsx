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
    // h-10 — the same height as the page's primary action beside it (Button
    // size md), so the pair lines up. It is the same SIZE as that button but
    // deliberately not the same KIND of thing: this is a read-out, so it is
    // flat (no shadow), tinted rather than solid, has no hover state, keeps the
    // default cursor, and its icon is an outline glyph rather than a filled
    // tile. The button keeps the solid fill, shadow and hover — the cues that
    // say "press me".
    <div
      role="status"
      title={tooltip}
      aria-label={tooltip}
      className={cn(
      'flex items-center gap-2 h-10 px-3 rounded-lg border cursor-default select-none',
      tone === 'danger'
        ? 'bg-red-50/60 border-red-200 dark:bg-red-950/20'
        : tone === 'warning'
        ? 'bg-brand-orange/5 border-brand-orange/30'
        : 'bg-brand-blue/[0.04] border-brand-blue/15 dark:bg-slate-900 dark:border-slate-700/60',
      className,
    )}>
      <div className={cn(
        'flex items-center justify-center flex-shrink-0',
        tone === 'danger'
          ? 'text-red-600'
          : tone === 'warning'
          ? 'text-brand-orange-deep'
          : 'text-brand-blue/80',
      )}>
        <Icon className="w-4 h-4" />
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
            <span className="tf-meta leading-none">Units Left</span>
          </>
        ) : (
          <span className="tf-hint leading-none">Loading...</span>
        )}
      </div>
    </div>
  );
}
