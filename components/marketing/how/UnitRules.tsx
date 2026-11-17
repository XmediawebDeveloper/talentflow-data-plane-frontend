"use client";

import { ClipboardCheck, Mic, PackagePlus, Scale, type LucideIcon } from "lucide-react";
import { ArrowLink } from "../Cta";
import { DISPLAY } from "../fonts";
import { H2, LEAD } from "../layout";
import { RevealGroup, RevealHeading } from "../motion";

/** Flat rule from the product owner: one assessment or one AI interview is exactly one unit. */
const FLAT: Array<{ icon: LucideIcon; label: string; detail: string }> = [
  { icon: ClipboardCheck, label: "AI Assessment", detail: "Each candidate assessment" },
  { icon: Mic, label: "AI Interview", detail: "Each AI interview with Bina" },
];

const EXTRAS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: PackagePlus,
    title: "Top up anytime",
    body: "Add-on unit packs, no plan change needed.",
  },
  {
    icon: Scale,
    title: "Fair billing",
    body: "If units are used up by a technical problem, raise a dispute and get them refunded.",
  },
];

/** How units are counted: flat, one unit per assessment or interview. */
export function UnitRules() {
  return (
    <div>
      <RevealHeading text="How units are counted" className={H2} />
      <RevealGroup>
        <p data-reveal className={LEAD}>
          A plan plus usage units, so you only pay for what you use. Units cover resume uploads,
          resume scoring, assessments and AI interviews.
        </p>
      </RevealGroup>

      <RevealGroup stagger={0.08} y={24} className="mt-7 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4">
        {FLAT.map(({ icon: Icon, label, detail }) => (
          <div
            key={label}
            data-reveal
            className="flex items-center gap-4 rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-5 dark:border-white/10 sm:gap-5 sm:p-7"
          >
            <span
              aria-hidden="true"
              className={`${DISPLAY} grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-mkt-accent/10 text-2xl font-extrabold tracking-[-0.04em] text-mkt-accent sm:h-16 sm:w-16 sm:text-3xl`}
            >
              1
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-mkt-cyan-ink">
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                {label}
              </p>
              <p className={`${DISPLAY} mt-1 text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:text-xl`}>
                <span className="sr-only">1 unit: </span>
                {detail}
              </p>
            </div>
          </div>
        ))}
      </RevealGroup>

      <RevealGroup stagger={0.08} y={20} className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4">
        {EXTRAS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            data-reveal
            className="flex gap-4 rounded-[20px] border border-slate-900/[0.08] p-4 dark:border-white/10 sm:p-6"
          >
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mkt-accent/10 text-mkt-accent"
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h3 className={`${DISPLAY} text-base font-bold tracking-[-0.02em] text-mkt-ink sm:text-lg`}>{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{body}</p>
            </div>
          </div>
        ))}
      </RevealGroup>

      <RevealGroup y={16}>
        <div data-reveal className="mt-6 sm:mt-8">
          <ArrowLink href="/pricing">See Pricing</ArrowLink>
        </div>
      </RevealGroup>
    </div>
  );
}
