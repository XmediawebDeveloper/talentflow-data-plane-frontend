"use client";

import { Award, Clock, Globe2, Layers, Lock, Scale } from "lucide-react";
import { DISPLAY } from "../fonts";
import { H2, LEAD, SECTION, SHELL } from "../layout";
import { ArrowLink } from "../Cta";
import { RevealGroup, RevealHeading } from "../motion";
import { CARD, ICON_TILE, RULE } from "./shared";

/** v2 §13 — Why TalentFlow, and who it's for. Doubles as the #about anchor. */
const CARDS = [
  { icon: Clock, title: "Save time", text: "Cut screening from days to hours." },
  { icon: Award, title: "Hire better", text: "Scores with reasons, not gut feeling." },
  { icon: Scale, title: "Be fair", text: "Same structure and scoring for every candidate." },
  { icon: Globe2, title: "Any industry", text: "IT, healthcare, finance, retail, manufacturing and more." },
  { icon: Lock, title: "Stay secure", text: "Roles, 2FA, audit trail and proctoring." },
  { icon: Layers, title: "All in one", text: "JD to interview on one platform." },
];

const AUDIENCE = [
  { who: "Recruiters", text: "screen more candidates with less effort." },
  { who: "Hiring managers", text: "get clear reports and decide with confidence." },
  { who: "Admins and leaders", text: "control access, usage and spending." },
];

export function WhySection() {
  return (
    <section id="about" aria-labelledby="why-heading" className={SECTION}>
      <div className={SHELL}>
        <RevealHeading id="why-heading" text="Why TalentFlow" className={H2} />
        <RevealGroup>
          <p data-reveal className={LEAD}>
            Hundreds of resumes. Top picks in seconds.
          </p>
        </RevealGroup>

        <RevealGroup
          as="ul"
          className="mt-8 grid grid-cols-1 gap-4 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5"
          stagger={0.06}
        >
          {CARDS.map(({ icon: Icon, title, text }) => (
            <li key={title} data-reveal className={`${CARD} flex gap-4 p-5 sm:p-6`}>
              <span aria-hidden="true" className={ICON_TILE}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h3 className={`${DISPLAY} text-base font-bold tracking-[-0.02em] text-mkt-ink sm:text-lg`}>{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{text}</p>
              </div>
            </li>
          ))}
        </RevealGroup>

        <div className={`mt-10 grid grid-cols-1 gap-6 border-t pt-8 sm:mt-14 sm:pt-10 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] lg:gap-12 ${RULE}`}>
          <h3 className={`${DISPLAY} text-xl font-bold tracking-[-0.025em] text-mkt-ink sm:text-2xl`}>Who it&apos;s for</h3>
          <RevealGroup as="ul" className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-8" stagger={0.08}>
            {AUDIENCE.map((a) => (
              <li key={a.who} data-reveal className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[15px]">
                <span className="font-semibold text-mkt-ink">{a.who}</span> {a.text}
              </li>
            ))}
          </RevealGroup>
        </div>

        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 sm:mt-10">
          <ArrowLink href="/about">More about TalentFlow</ArrowLink>
          <ArrowLink href="/contact">Contact us</ArrowLink>
        </div>
      </div>
    </section>
  );
}
