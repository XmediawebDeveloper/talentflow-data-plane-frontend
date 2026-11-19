import * as React from 'react';
import { cn } from './utils';

/**
 * The "nothing matched" illustration: a candidate card behind a magnifying
 * glass with a cross through it, on a soft blob.
 *
 * Drawn inline rather than shipped as an asset so it inherits the page's dark
 * mode — every shape carries its own `dark:` fill, which an <img> or an
 * external SVG cannot do — and so it costs no request and no layout shift.
 *
 * The palette is the reference's, not the brand ramp: the artwork's blue is a
 * light #3b82f6 that reads as an accent at this size, while `--brand-blue`
 * (#0f3c99) is a deep navy that turns the magnifier into a dark blot. Stated
 * here so the difference reads as chosen rather than as a missed token.
 *
 * `viewBox` is 440×320, the reference's own proportions; size it from the
 * caller with a width class and let the height follow.
 */
export default function EmptySearchIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 320"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={cn('h-auto w-56 sm:w-64', className)}
    >
      {/* Blob — the soft ground everything else sits on. */}
      <path
        d="M120 60C60 70 30 120 45 175c13 50 65 70 115 65 40 60 130 80 190 50 60-32 75-110 45-165-27-50-95-70-150-55-35-25-85-20-125-10Z"
        className="fill-slate-100/80 dark:fill-slate-800/50"
      />

      {/* Candidate card. */}
      <rect
        x="70"
        y="58"
        width="190"
        height="237"
        rx="14"
        className="fill-white stroke-slate-200/70 dark:fill-slate-900 dark:stroke-slate-700"
        strokeWidth="2"
      />

      {/* Avatar: a head and shoulders clipped to the circle, as the reference. */}
      <circle cx="162" cy="133" r="50" className="fill-slate-100 dark:fill-slate-800" />
      <clipPath id="empty-search-avatar">
        <circle cx="162" cy="133" r="50" />
      </clipPath>
      <g clipPath="url(#empty-search-avatar)" className="fill-slate-300 dark:fill-slate-600">
        <circle cx="162" cy="118" r="21" />
        <path d="M162 146c-25 0-45 18-45 41v16h90v-16c0-23-20-41-45-41Z" />
      </g>

      {/* The card's text lines. */}
      <g className="fill-slate-200 dark:fill-slate-700">
        <rect x="100" y="202" width="100" height="14" rx="7" />
        <rect x="100" y="229" width="100" height="14" rx="7" />
        <rect x="100" y="254" width="85" height="14" rx="7" />
      </g>

      {/* Magnifier: lens, cross, handle. The handle is drawn first so the ring
          covers where the two meet. */}
      <path
        d="M291 241 336 286"
        className="stroke-blue-600 dark:stroke-blue-500"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <circle cx="256" cy="206" r="49" className="fill-white/90 dark:fill-slate-900/90" />
      <circle
        cx="256"
        cy="206"
        r="49"
        fill="none"
        className="stroke-blue-500 dark:stroke-blue-400"
        strokeWidth="12"
      />
      <g
        className="stroke-blue-500 dark:stroke-blue-400"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M240 190 272 222" />
        <path d="M272 190 240 222" />
      </g>

      {/* Sparks and dots — the reference's confetti, kept faint. */}
      <g
        className="stroke-blue-300 dark:stroke-blue-500/60"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M312 143 319 124" />
        <path d="M328 133 342 120" />
        <path d="M335 154 354 148" />
      </g>
      <g className="fill-blue-200 dark:fill-blue-500/50">
        <circle cx="353" cy="85" r="7" />
        <circle cx="20" cy="162" r="7" />
      </g>
    </svg>
  );
}
