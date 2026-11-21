'use client';

import * as React from 'react';
import Image from 'next/image';
import { Search, type LucideIcon } from 'lucide-react';
import { cn } from './utils';
import EmptySearchIllustration from './empty-search-illustration';

/**
 * A candidate list that a search or filter narrowed to nothing. Every Job
 * Details results tab (AI Talent Match, Scored Resumes, Assessment, AI
 * Interview) shows this one, so "no matches" looks the same whichever tab
 * you're on.
 */
export function NoMatchingCandidates({ query, className }: { query?: string; className?: string }) {
  return (
    <ListEmptyState
      icon={Search}
      isNarrowed
      query={query}
      entityLabel="candidate"
      emptyTitle=""
      narrowedIllustration={NO_MATCHES_ILLUSTRATION}
      className={className}
    />
  );
}

/** The magnifier art, sized for a results-tab empty state. */
export const NO_MATCHES_ILLUSTRATION = <EmptySearchIllustration className="w-52 sm:w-60" />;

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
  /** No longer rendered — the "Reset search and filters" button was removed;
   *  the toolbar's own search/filter controls clear the list. Kept so callers
   *  still compile. */
  onReset?: () => void;
  /** Optional call to action for the genuinely-empty case (e.g. "Create"). */
  action?: React.ReactNode;
  className?: string;
  /** Swaps the plain icon-in-circle for a larger illustration in the
   *  genuinely-empty (not narrowed) case only — the "no matches" case stays
   *  the plain icon since that's a generic, list-agnostic concept. Mirrors
   *  TabEmptyState's imageSrc so the two empty states can share one asset. */
  imageSrc?: string;
  imageAlt?: string;
  /** An inline illustration for the genuinely-empty case, in place of
   *  `imageSrc` (see `components/ui/illustrated-empty-state`). */
  illustration?: React.ReactNode;
  /** The same for the narrowed ("No … match") case. */
  narrowedIllustration?: React.ReactNode;
}

export default function ListEmptyState({
  icon: Icon,
  isNarrowed,
  query,
  entityLabel,
  emptyTitle,
  emptyDescription,
  action,
  className,
  imageSrc,
  imageAlt,
  illustration,
  narrowedIllustration,
}: ListEmptyStateProps) {
  const trimmedQuery = (query || '').trim();
  const shownIllustration = isNarrowed ? narrowedIllustration : illustration;
  /* With an illustration, the heading and text take the illustrated empty
     states' bolder style, so every illustrated card reads the same. */
  const titleClass = shownIllustration
    ? 'mb-1.5 text-base sm:text-lg font-bold tracking-tight text-[var(--raw-0f1e3d)] dark:text-slate-50'
    : 'tf-section-title mb-1';
  const bodyClass = shownIllustration
    ? 'mx-auto max-w-md text-sm sm:text-base leading-relaxed text-[var(--raw-0f1e3d)]/80 dark:text-slate-300'
    : 'tf-body-muted';

  return (
    <div className={cn('py-14 px-6 text-center', className)}>
      {shownIllustration ? (
        <div className="mb-4 flex justify-center">{shownIllustration}</div>
      ) : !isNarrowed && imageSrc ? (
        <Image
          src={imageSrc}
          alt={imageAlt || ''}
          width={144}
          height={144}
          className="mb-4 h-32 w-32 object-contain mx-auto sm:h-36 sm:w-36"
        />
      ) : (
        <div className="w-14 h-14 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
          <Icon className="w-7 h-7 text-brand-blue" />
        </div>
      )}

      {isNarrowed ? (
        <>
          <h3 className={titleClass}>
            No {entityLabel}s match
            {trimmedQuery && (
              <>
                {' '}
                <span className="text-brand-blue">&ldquo;{trimmedQuery}&rdquo;</span>
              </>
            )}
          </h3>
          <p className={bodyClass}>
            Try a different search, or clear what you have narrowed by.
          </p>
        </>
      ) : (
        <>
          <h3 className={titleClass}>{emptyTitle}</h3>
          {emptyDescription && (
            <p className={bodyClass}>{emptyDescription}</p>
          )}
          {action && <div className="mt-4 flex justify-center">{action}</div>}
        </>
      )}
    </div>
  );
}
