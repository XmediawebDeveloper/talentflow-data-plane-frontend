'use client';

import Image from 'next/image';
import { HelpCircle } from 'lucide-react';
import brandLogo from '@/assets/brand/talent-flow-logo-header.webp';
import { RECRUITER_BAR_ROW, RECRUITER_HEADER_H, RECRUITER_LOGO_H, ICON_INLINE } from '@/lib/constants/candidateLayout';

/**
 * The header bar on every candidate-facing assessment page.
 *
 * It was written out by hand on each screen, and drifted: the logo was `h-16`
 * on Assessment Details and `h-10` on Terms & Consent and System Check, so it
 * visibly resized as the candidate moved from one step to the next. HR
 * Questions had no logo at all — just a bare title — so the product name
 * disappeared entirely in the middle of the flow.
 *
 * ── Matched to the signed-in header ───────────────────────────────────────
 * Bar height, logo asset and logo height are `components/Header.tsx`'s,
 * copied value for value, so the product looks the same before and after
 * sign-in:
 *
 *   bar    h-14 sm:h-16 lg:h-[72px]     56 / 64 / 72px
 *   logo   h-7  sm:h-10  lg:h-12        28 / 40 / 48px
 *
 * The bar is a fixed HEIGHT with `items-center`, not vertical padding. That is
 * the difference that matters: with `py-*` the bar was as tall as whatever was
 * inside it, so it changed height when the logo did and could never line up
 * with the dashboard's. A fixed height makes the bar the constant and the
 * contents centre inside it.
 *
 * It also uses the same ASSET. The dashboard header loads
 * `assets/brand/talent-flow-logo-header.webp`, a 19KB header-sized webp; this
 * flow was loading `/logos/talent_flow_logo.png`, the 1930×411 source at
 * 457KB — 24× the bytes, on the first page a candidate ever sees, over
 * whatever connection they happen to be on. Same file now, so the two headers
 * render identically and this one stops shipping the source image.
 *
 * ── Width ─────────────────────────────────────────────────────────────────
 * Also the dashboard's: the row is capped at `max-w-[1400px]` with its
 * `px-3 sm:px-4 md:px-8` padding, and the whole candidate flow moved to that
 * same column, so the logo, the stepper and the page card share one left edge
 * — and it is the same edge a recruiter sees.
 */
export default function CandidateHeader({
  children,
  showHelp = true,
}: {
  children?: React.ReactNode;
  /** The assessment screen turns the mailto link off: opening a mail client
   *  mid-test takes focus from the proctored fullscreen window. */
  showHelp?: boolean;
}) {
  return (
    <header className={`${RECRUITER_HEADER_H} w-full bg-white border-b border-gray-200`}>
      <div className={`${RECRUITER_BAR_ROW} flex h-full items-center justify-between gap-3`}>
        <Image
          src={brandLogo}
          alt="TalentFlow"
          className={`${RECRUITER_LOGO_H} shrink-0`}
          priority
        />

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Anything a step wants beside the help link — the HR step's
              "No Timer" badge is the only caller so far. */}
          {children}
          {showHelp && (
            <a
              href="mailto:support@talentflow.com"
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors shrink-0"
            >
              <HelpCircle className={ICON_INLINE} />
              {/* The label goes on a small phone; the icon alone still reads as
                  help and the row stops competing with the logo. */}
              <span className="hidden sm:inline">Need help?</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
