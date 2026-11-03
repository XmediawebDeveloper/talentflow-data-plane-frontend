"use client";

import { CalendarRange, Layers, PackagePlus, Scale } from "lucide-react";
import { DISPLAY } from "../fonts";
import { RevealGroup } from "../motion";
import { ICON_TILE, RULE } from "./shared";

/**
 * v2 §12 usage points plus the owner's flat-unit rule. Sits inside the
 * pricing section, under the live plans.
 */
const COVERED: { activity: string; cost?: string }[] = [
  { activity: "Resume uploads" },
  { activity: "Resume scoring", cost: "1 unit per score" },
  { activity: "AI Assessments", cost: "1 unit per candidate" },
  { activity: "AI Interviews", cost: "1 unit per candidate" },
];

const POINTS = [
  {
    icon: Layers,
    title: "Plans as you grow",
    text: "Start on the Free Trial, then move to Starter, Professional, Enterprise or Custom.",
  },
  {
    icon: PackagePlus,
    title: "Top up anytime",
    text: "Add-on unit packs, no plan change needed.",
  },
  {
    icon: Scale,
    title: "Fair billing",
    text: "If units are used up by a technical problem, raise a dispute and get them refunded.",
  },
  {
    icon: CalendarRange,
    title: "Monthly or annual",
    text: "Choose the billing cycle that suits you.",
  },
];

export function UsagePoints() {
  return (
    <div className={`mt-10 grid grid-cols-1 gap-8 border-t pt-10 sm:mt-14 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16 ${RULE}`}>
      <div>
        <h3 className={`${DISPLAY} text-xl font-bold tracking-[-0.025em] text-mkt-ink sm:text-2xl`}>
          Usage units, simply counted
        </h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[15px]">
          Usage units cover resume uploads, resume scoring, assessments and AI interviews.
        </p>
        <ul className={`mt-5 overflow-hidden rounded-[20px] border bg-mkt-surface ${RULE}`}>
          {COVERED.map((row) => (
            <li
              key={row.activity}
              className={`flex items-center justify-between gap-3 border-b px-4 py-3.5 last:border-b-0 sm:px-5 ${RULE}`}
            >
              <span className={`${DISPLAY} text-sm font-bold tracking-[-0.015em] text-mkt-ink sm:text-base`}>
                {row.activity}
              </span>
              {row.cost && (
                <span className="rounded-full bg-mkt-accent/10 px-2.5 py-1 text-xs font-bold text-mkt-accent">
                  {row.cost}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <RevealGroup as="ul" className="grid grid-cols-1 content-start gap-6 sm:grid-cols-2 sm:gap-8" stagger={0.08}>
        {POINTS.map(({ icon: Icon, title, text }) => (
          <li key={title} data-reveal className="flex gap-4">
            <span aria-hidden="true" className={ICON_TILE}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h4 className={`${DISPLAY} text-base font-bold tracking-[-0.02em] text-mkt-ink`}>{title}</h4>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{text}</p>
            </div>
          </li>
        ))}
      </RevealGroup>
    </div>
  );
}
