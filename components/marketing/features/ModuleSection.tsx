"use client";

import { Check, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Cta } from "../Cta";
import { H2, LEAD, SECTION, SHELL } from "../layout";
import { RevealGroup, RevealHeading } from "../motion";
import { DASHBOARD_HREF, useSignedIn } from "../session";

/** A point: bold lead-in plus the rest of the sentence. */
export type Point = { title: string; body?: ReactNode };

/**
 * Module call to action with its own label (e.g. "Upload Resumes"). Goes to
 * sign-up, or straight to the dashboard for a visitor who is signed in.
 */
export function ModuleCta({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const signedIn = useSignedIn();
  return (
    <Cta href={signedIn ? DASHBOARD_HREF : "/signup"} variant={variant}>
      {label}
    </Cta>
  );
}

/** Checklist of points, shared by the module sections. */
export function PointList({ points, className = "" }: { points: Point[]; className?: string }) {
  return (
    <ul className={`space-y-3 sm:space-y-3.5 ${className}`}>
      {points.map((point) => (
        <li
          key={point.title}
          data-reveal
          className="flex gap-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300"
        >
          <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-mkt-cyan/12 text-mkt-cyan-ink">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          <span className="min-w-0">
            {point.body ? (
              <>
                <strong className="font-semibold text-mkt-ink">{point.title}</strong> {point.body}
              </>
            ) : (
              point.title
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Eyebrow: module name beside its icon. */
export function Eyebrow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-sm font-semibold text-mkt-accent">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-mkt-accent-solid/[0.08] dark:bg-white/10">
        <Icon className="h-4 w-4" />
      </span>
      {children}
    </p>
  );
}

/**
 * One module: copy (eyebrow, heading, lead, points, CTA) beside an
 * illustrative mock. `flip` puts the mock on the left on wide screens, and
 * `surface` switches the band to the alternate background.
 */
export function ModuleSection({
  id,
  eyebrow,
  icon,
  title,
  lead,
  points,
  mock,
  cta,
  flip = false,
  surface = false,
  footnote,
}: {
  id: string;
  eyebrow: string;
  icon: LucideIcon;
  title: string;
  lead?: ReactNode;
  points: Point[];
  mock: ReactNode;
  /** Button label; omit for no button. */
  cta?: string;
  flip?: boolean;
  surface?: boolean;
  footnote?: ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08] ${surface ? "bg-mkt-surface" : ""}`}
    >
      <div
        className={`${SHELL} grid grid-cols-1 items-center gap-8 sm:gap-12 lg:grid-cols-2 lg:gap-16 xl:gap-20`}
      >
        <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
          <Eyebrow icon={icon}>{eyebrow}</Eyebrow>
          <RevealHeading id={headingId} text={title} className={`${H2} mt-4 sm:mt-5`} />
          <RevealGroup stagger={0.07}>
            {lead && (
              <p data-reveal className={LEAD}>
                {lead}
              </p>
            )}
            <PointList points={points} className="mt-6 sm:mt-8" />
            {(cta || footnote) && (
              <div data-reveal className="mt-7 flex flex-col gap-4 sm:mt-9 sm:flex-row sm:items-center sm:gap-5">
                {cta && <ModuleCta label={cta} />}
                {footnote && <p className="text-sm text-slate-500 dark:text-slate-400">{footnote}</p>}
              </div>
            )}
          </RevealGroup>
        </div>
        <RevealGroup y={40} className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>
          <div data-reveal className="mx-auto w-full max-w-[560px]">
            {mock}
          </div>
        </RevealGroup>
      </div>
    </section>
  );
}
