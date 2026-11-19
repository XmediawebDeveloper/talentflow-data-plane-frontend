"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { display, DISPLAY } from "./fonts";
import { SHELL } from "./layout";
import { MotionNoScript, PageTitle, PRE, RevealGroup } from "./motion";

/** Page root: display font, canvas colour, and the no-JS fallback for entrances. */
export function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div className={`${display.variable} overflow-x-clip bg-mkt-canvas text-mkt-ink`}>
      <MotionNoScript />
      {children}
    </div>
  );
}

/**
 * Inner-page hero: the title types itself out, then the lead and any actions
 * rise in. A soft glow drifts behind, as on the landing page.
 */
export function PageHero({
  lines,
  lead,
  actions,
  aside,
  compact = false,
}: {
  /** Title, one entry per line. */
  lines: string[];
  lead: ReactNode;
  actions?: ReactNode;
  /** Optional content beside the title on wide screens. */
  aside?: ReactNode;
  /** Smaller title, lead and spacing. */
  compact?: boolean;
}) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to("[data-glow]", {
          xPercent: -18,
          yPercent: 14,
          scale: 1.15,
          duration: 9,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
      });
    },
    { scope: root }
  );

  return (
    <section ref={root} className="relative overflow-hidden">
      <div
        data-glow
        aria-hidden="true"
        className="pointer-events-none absolute -right-48 -top-48 h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.14),transparent)] dark:bg-[radial-gradient(closest-side,rgba(76,123,232,0.18),transparent)] sm:h-[620px] sm:w-[620px]"
      />
      <div
        className={`${SHELL} relative grid grid-cols-1 gap-8 ${
          compact ? "pb-8 pt-7 sm:pb-12 sm:pt-14 lg:pb-14 lg:pt-16" : "pb-10 pt-9 sm:pb-16 sm:pt-20 lg:pb-20 lg:pt-24"
        } ${
          aside
            ? "items-center gap-12 sm:gap-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14"
            : "items-end lg:gap-16"
        }`}
      >
        <div className="max-w-3xl">
          <PageTitle
            lines={lines}
            className={`${DISPLAY} ${
              compact ? "text-[clamp(1.75rem,4.8vw,3.5rem)]" : "text-[clamp(2rem,6vw,4.5rem)]"
            } font-extrabold leading-[1] tracking-[-0.045em] text-mkt-ink ${
              // Beside a banner the column is half-width: scale the title to it.
              aside ? (compact ? "lg:text-[clamp(2rem,3vw,3.25rem)]" : "lg:text-[clamp(2.4rem,3.7vw,4rem)]") : ""
            }`}
          />
          <RevealGroup immediate delay={0.15} stagger={0.12}>
            <p
              data-reveal
              data-pre
              className={`${PRE} mt-4 max-w-xl leading-relaxed text-slate-600 dark:text-slate-300 ${
                compact ? "text-sm sm:mt-5 sm:text-[17px]" : "text-[15px] sm:mt-6 sm:text-xl"
              }`}
            >
              {lead}
            </p>
            {actions && (
              <div
                data-reveal
                data-pre
                className={`${PRE} mt-6 flex flex-col gap-2.5 sm:flex-row sm:gap-3 ${compact ? "sm:mt-7" : "sm:mt-9"}`}
              >
                {actions}
              </div>
            )}
          </RevealGroup>
        </div>
        {/* The aside brings its own entrance (e.g. the 3D dashboard), so no wrapper fade. */}
        {aside && <div className="order-first lg:order-none lg:pl-4">{aside}</div>}
      </div>
    </section>
  );
}
