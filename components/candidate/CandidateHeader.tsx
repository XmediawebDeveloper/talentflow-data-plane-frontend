'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, Copy, HelpCircle, Mail } from 'lucide-react';
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
const SUPPORT_EMAIL = 'support@talentflow.com';

/**
 * "Need help?" that stays on the page: a small panel with the support address
 * and a copy button. For the proctored question screen, where the usual mailto
 * link would open a mail client and take focus from the fullscreen window.
 */
function HelpPopover() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard blocked — the address is on screen to read instead. */
    }
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Need help?"
        className="flex items-center justify-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors -m-2 p-2 min-h-10 min-w-10 sm:m-0 sm:p-0 sm:min-h-0 sm:min-w-0"
      >
        <HelpCircle className={ICON_INLINE} />
        <span className="hidden sm:inline">Need help?</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Contact support" className="absolute right-0 top-full mt-3 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-gray-200 bg-white shadow-lg p-3 z-50">
          <p className="tf-cell-name">Need help?</p>
          <p className="mt-0.5 tf-meta">
            Copy the address and email our support team. Opening a mail app now would take you out of the assessment window.
          </p>
          <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-gray-50 ring-1 ring-gray-100 px-2.5 py-2">
            <Mail className="w-4 h-4 shrink-0 text-brand-blue" />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{SUPPORT_EMAIL}</span>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-blue hover:bg-brand-blue/10 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CandidateHeader({
  children,
  showHelp = true,
  helpPopover = false,
  sticky = false,
}: {
  children?: React.ReactNode;
  /** Turns the help link off entirely. */
  showHelp?: boolean;
  /** Help as an in-page popover instead of a mailto link — for the proctored
   *  question screen, where opening a mail client mid-test would take focus
   *  from the fullscreen window. */
  helpPopover?: boolean;
  /** Pin the bar to the top of the viewport while the page scrolls (the AI
   *  interview's pre-interview steps). Off by default, so the assessment
   *  screens keep their scrolling header. */
  sticky?: boolean;
}) {
  return (
    <header className={`${RECRUITER_HEADER_H} w-full bg-white border-b border-gray-200 ${sticky ? 'sticky top-0 z-40' : ''}`}>
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
          {showHelp && helpPopover && <HelpPopover />}
          {showHelp && !helpPopover && (
            <a
              href="mailto:support@talentflow.com"
              aria-label="Need help? Email support"
              // On phones the link is the bare icon: pad it out to a 40px tap
              // target (negative margin keeps the row's alignment unchanged).
              className="flex items-center justify-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors shrink-0 -m-2 p-2 min-h-10 min-w-10 sm:m-0 sm:p-0 sm:min-h-0 sm:min-w-0"
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
