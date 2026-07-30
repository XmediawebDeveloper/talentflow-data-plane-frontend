'use client';

import type { LucideIcon } from 'lucide-react';
import { Zap } from 'lucide-react';
import { cn } from './utils';

type QuotaTone = 'neutral' | 'warning' | 'danger';

interface QuotaBadgeProps {
  label: string;
  availableUnits: number | null;
  totalUnits?: number;
  isUnlimited?: boolean;
  icon?: LucideIcon;
  unitLabel?: string;
  className?: string;
}

export default function QuotaBadge({
  label,
  availableUnits,
  totalUnits,
  isUnlimited = false,
  icon: Icon = Zap,
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
  const usedPct = hasTotal && availableUnits !== null
    ? Math.min(100, Math.round((Math.max(0, totalUnits - availableUnits) / totalUnits) * 100))
    : 0;

  return (
    <div className={cn(
      'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all',
      tone === 'danger'
        ? 'border-red-200 ring-red-100'
        : tone === 'warning'
        ? 'border-brand-orange/30 ring-brand-orange/10'
        : 'border-gray-100 dark:border-slate-700/60',
      className,
    )}>
      <div className={cn(
        'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ring-1',
        tone === 'danger'
          ? 'bg-red-50 text-red-600 ring-red-200'
          : tone === 'warning'
          ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
          : 'bg-brand-blue text-white ring-white/10 shadow-sm shadow-brand-blue/25',
      )}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex flex-col min-w-[88px]">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-slate-500 font-semibold leading-none">
          {label}
        </span>
        {isUnlimited ? (
          <span className="text-xs font-semibold text-brand-blue mt-0.5">Unlimited</span>
        ) : availableUnits !== null ? (
          <>
            <div className="flex items-baseline gap-1 mt-0.5">
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
              {hasTotal ? (
                <span className="text-[10px] text-gray-400 dark:text-slate-500">/ {totalUnits.toLocaleString()}</span>
              ) : (
                <span className="text-[10px] text-gray-400 dark:text-slate-500">{unitLabel}</span>
              )}
            </div>
            {hasTotal && (
              <div className="mt-1 h-0.5 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    tone === 'danger'
                      ? 'bg-red-500'
                      : tone === 'warning'
                      ? 'bg-brand-orange'
                      : 'bg-gradient-to-r from-brand-blue to-brand-cyan',
                  )}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Loading...</span>
        )}
      </div>
    </div>
  );
}
