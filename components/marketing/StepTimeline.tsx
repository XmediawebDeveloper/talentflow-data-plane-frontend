"use client";

import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { DISPLAY } from "./fonts";

export interface TimelineStep {
  title: string;
  description: string;
  icon: LucideIcon;
}

/**
 * A process told in order. Desktop: a sticky panel on the left tracks the
 * step being read while the cards scroll past on the right. Phones: one
 * column with a line that fills as you go.
 */
export function StepTimeline({ steps }: { steps: TimelineStep[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const items = gsap.utils.toArray<HTMLElement>("[data-step]", root.current);

      // Which step is being read: the one crossing the middle of the screen.
      items.forEach((el, i) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top 60%",
          end: "bottom 60%",
          onToggle: (self) => {
            if (self.isActive) setActive(i);
          },
        });
      });

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          "[data-fill]",
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: "none",
            scrollTrigger: { trigger: "[data-list]", start: "top 60%", end: "bottom 60%", scrub: 0.5 },
          }
        );
        items.forEach((el) => {
          gsap.fromTo(
            el.querySelector("[data-card]"),
            { y: 36, autoAlpha: 0.25 },
            {
              y: 0,
              autoAlpha: 1,
              ease: "power2.out",
              scrollTrigger: { trigger: el, start: "top 90%", end: "top 60%", scrub: 0.5 },
            }
          );
        });
      });
    },
    { scope: root }
  );

  const progress = (active + 1) / steps.length;

  return (
    <div ref={root} className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
      {/* Sticky progress panel — desktop only */}
      <aside aria-hidden="true" className="hidden lg:block">
        <div className="sticky top-28">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Step {active + 1} of {steps.length}
          </p>
          <p
            key={active}
            className={`${DISPLAY} mt-2 animate-in fade-in slide-in-from-bottom-2 text-4xl font-bold leading-tight tracking-[-0.03em] text-mkt-ink duration-500`}
          >
            {steps[active].title}
          </p>
          <div className="mt-6 h-1 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
            <div
              className="h-full origin-left rounded-full bg-gradient-to-r from-mkt-accent to-mkt-cyan transition-transform duration-500 ease-out"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <ol className="mt-6 space-y-1">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors duration-300 ${
                  i === active
                    ? "bg-mkt-surface font-semibold text-mkt-ink shadow-sm"
                    : i < active
                      ? "text-slate-600 dark:text-slate-300"
                      : "text-slate-400 dark:text-slate-500"
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-300 ${
                    i <= active ? "bg-mkt-accent-solid text-white" : "bg-slate-900/[0.06] dark:bg-white/10"
                  }`}
                >
                  {i + 1}
                </span>
                {step.title}
              </li>
            ))}
          </ol>
        </div>
      </aside>

      {/* The steps */}
      <ol data-list className="relative space-y-4 pl-12 sm:space-y-6 sm:pl-16">
        <span aria-hidden="true" className="absolute bottom-8 left-[19px] top-8 w-px bg-slate-900/10 dark:bg-white/10 sm:left-[27px]">
          <span data-fill className="block h-full w-full origin-top bg-gradient-to-b from-mkt-accent to-mkt-cyan" />
        </span>
        {steps.map((step, i) => {
          const Icon = step.icon;
          const reached = i <= active;
          return (
            <li key={step.title} data-step className="relative">
              <span
                aria-hidden="true"
                className={`absolute -left-12 top-6 grid h-10 w-10 place-items-center rounded-full border transition-[background-color,border-color,color] duration-500 sm:-left-16 sm:top-8 sm:h-14 sm:w-14 ${
                  reached
                    ? "border-transparent bg-mkt-accent-solid text-white shadow-[0_10px_24px_-10px_rgba(15,60,153,0.6)]"
                    : "border-slate-900/10 bg-mkt-canvas text-slate-400 dark:border-white/15"
                }`}
              >
                <Icon className="h-[18px] w-[18px] sm:h-6 sm:w-6" />
              </span>
              <div
                data-card
                className={`rounded-[20px] border bg-mkt-surface p-5 transition-[border-color,box-shadow] duration-500 sm:p-8 ${
                  i === active
                    ? "border-mkt-accent/30 shadow-[0_28px_56px_-32px_rgba(15,60,153,0.45)]"
                    : "border-slate-900/[0.08] dark:border-white/10"
                }`}
              >
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">Step {i + 1}</p>
                <h3 className={`${DISPLAY} mt-1 text-xl font-bold tracking-[-0.025em] text-mkt-ink sm:text-3xl`}>
                  {step.title}
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-3 sm:text-lg">
                  {step.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
