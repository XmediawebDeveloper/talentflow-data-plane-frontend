'use client';

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * Two nav glyphs drawn to match the product's own reference art, where the
 * nearest lucide icon said the wrong thing: `FileSearch` reads as "search a
 * document" rather than "score a candidate", and `BrainCircuit` reads as
 * "AI" in the abstract rather than "match a person to a role".
 *
 * They take lucide's own props and defaults — 24px box, `currentColor`
 * stroke, 2px width, round caps — so they drop into any `LucideIcon` slot and
 * inherit whatever size and colour the surrounding chip sets. Colour comes
 * from the caller (the brand palette in globals.css), never from here.
 *
 * Both are drawn out to roughly the 2–22 extents lucide's own icons use. A
 * composite mark reads smaller than a single shape at the same box size, so
 * anything tidier than this sat visibly short of its neighbours in the sidebar.
 */
const BASE_PROPS = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** A résumé — person, detail lines — with a star: the page has been rated. */
export const ResumeScoringIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, strokeWidth = 2, className, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      {...BASE_PROPS}
      {...props}
    >
      {/* Sheet, left open at the lower right so the star sits over the corner */}
      <path d="M14.8 2H5.6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4.8" />
      <path d="M14.8 2 20.4 7.6v3" />
      {/* Candidate */}
      <circle cx="9.6" cy="8.2" r="2" />
      <path d="M6.6 13a3 3 0 0 1 6 0" />
      {/* Detail lines */}
      <path d="M6.8 16.6h5.2" />
      <path d="M6.8 19.6h3" />
      {/* Score */}
      <path d="M17.6 12l1.12 3.46h3.64l-2.94 2.13 1.12 3.46-2.94-2.14-2.94 2.14 1.12-3.46-2.93-2.13h3.63z" />
    </svg>
  ),
);
ResumeScoringIcon.displayName = 'ResumeScoringIcon';

/** A person beside a struck target: the candidate matched to the role. */
export const TalentMatchIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, strokeWidth = 2, className, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      {...BASE_PROPS}
      {...props}
    >
      {/* Candidate. Sized so the shoulder line clears the target's outer ring
          by more than a stroke width — any larger and the two marks merge. */}
      <circle cx="6.6" cy="6.2" r="2.8" />
      <path d="M2.2 17.6a4.4 4.4 0 0 1 8.8 0" />
      {/* Target */}
      <circle cx="17.2" cy="15.2" r="5.6" />
      <circle cx="17.2" cy="15.2" r="2.4" />
      {/* Arrow into the bullseye */}
      <path d="m17.2 15.2 4.7-5.2" />
      <path d="M18.7 9.9H22v3.3" />
    </svg>
  ),
);
TalentMatchIcon.displayName = 'TalentMatchIcon';
