"use client";

import { Check, ClipboardCheck, Mic, type LucideIcon } from "lucide-react";
import { DISPLAY } from "../fonts";
import { H2, LEAD } from "../layout";
import { RevealGroup, RevealHeading } from "../motion";

const SIDES: Array<{ icon: LucideIcon; eyebrow: string; title: string; points: string[] }> = [
  {
    icon: ClipboardCheck,
    eyebrow: "AI Assessments",
    title: "Secure by design",
    points: [
      "Identity check and system check",
      "Full-screen mode",
      "Tab and copy-paste monitoring",
      "Camera and screen recording",
      "Built-in code editor with run and submit, in 13 languages",
    ],
  },
  {
    icon: Mic,
    eyebrow: "AI Interview with Bina",
    title: "Interview anytime",
    points: [
      "Candidates get a link and practise with Bina first",
      "They start whenever it suits them",
      "Face verification and voice identity checks",
      "Tab, full-screen and screen-recording monitoring",
      "Clear Low, Medium and High risk levels",
    ],
  },
];

/** What the candidate goes through, and what keeps results honest. */
export function CandidateSide() {
  return (
    <div>
      <RevealHeading text="The candidate’s side" className={H2} />
      <RevealGroup>
        <p data-reveal className={LEAD}>
          Every candidate gets the same fair, structured process, with integrity checks built in.
        </p>
      </RevealGroup>

      <RevealGroup stagger={0.1} y={24} className="mt-7 grid grid-cols-1 gap-3 sm:mt-12 sm:gap-4 md:grid-cols-2">
        {SIDES.map(({ icon: Icon, eyebrow, title, points }) => (
          <section
            key={eyebrow}
            data-reveal
            aria-label={eyebrow}
            className="rounded-[20px] border border-slate-900/[0.08] bg-mkt-canvas p-5 dark:border-white/10 sm:p-7"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mkt-accent/10 text-mkt-accent"
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-mkt-cyan-ink">{eyebrow}</p>
            </div>
            <h3 className={`${DISPLAY} mt-4 text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:text-xl`}>{title}</h3>
            <ul className="mt-3 space-y-2.5">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[15px]">
                  <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-mkt-cyan" strokeWidth={2.5} />
                  {point}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </RevealGroup>
    </div>
  );
}
