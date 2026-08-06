'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';

/**
 * The empty state for a list, in its two genuinely different flavours.
 *
 * Pages had been hand-rolling these, and most collapsed both cases into one
 * message — so a list emptied by a typo read the same as one that has no
 * records yet. Those need different words and different exits: "nothing here
 * yet, go make one" versus "your search matched nothing, clear it".
 *
 * Pass `isNarrowed` (a search or filter is active) and the component picks.
 */
export interface ListEmptyStateProps {
  icon: LucideIcon;
  /** True when a search or filter is on — switches to the "no matches" copy. */
  isNarrowed: boolean;
  /** The applied query, quoted back so the user sees what was searched. */
  query?: string;
  /** Singular noun for the rows, e.g. "assessment". Used in the default copy. */
  entityLabel: string;
  /** Heading for the genuinely-empty case, e.g. "No assessments yet". */
  emptyTitle: string;
  /** Supporting line for the genuinely-empty case. */
  emptyDescription?: string;
  /** Clears search + filters. Renders the Reset button when provided. */
  onReset?: () => void;
  /** Optional call to action for the genuinely-empty case (e.g. "Create"). */
  action?: React.ReactNode;
  className?: string;
}

export default function ListEmptyState({
  icon: Icon,
  isNarrowed,
  query,
  entityLabel,
  emptyTitle,
  emptyDescription,
  onReset,
  action,
  className,
}: ListEmptyStateProps) {
  const trimmedQuery = (query || '').trim();

  return (
    <div className={cn('py-14 px-6 text-center', className)}>
      <div className="w-14 h-14 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7 text-brand-blue" />
      </div>

      {isNarrowed ? (
        <>
          <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-1">
            No {entityLabel}s match
            {trimmedQuery && (
              <>
                {' '}
                <span className="text-brand-blue">&ldquo;{trimmedQuery}&rdquo;</span>
              </>
            )}
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Try a different search, or clear what you have narrowed by.
          </p>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
            >
              Reset search and filters
            </button>
          )}
        </>
      ) : (
        <>
          <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-1">{emptyTitle}</h3>
          {emptyDescription && (
            <p className="text-sm text-gray-500 dark:text-slate-400">{emptyDescription}</p>
          )}
          {action && <div className="mt-4 flex justify-center">{action}</div>}
        </>
      )}
    </div>
  );
}
