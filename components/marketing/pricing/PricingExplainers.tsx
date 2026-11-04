"use client";

import {
  CalendarRange,
  ClipboardCheck,
  FileSearch,
  KeyRound,
  Layers,
  MessagesSquare,
  PlusCircle,
  Scale,
  Sparkles,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { DISPLAY } from "@/components/marketing/fonts";
import { H2, LEAD, SECTION, SHELL } from "@/components/marketing/layout";
import { RevealGroup, RevealHeading } from "@/components/marketing/motion";

/*
 * Explainer sections for the pricing page. Copy speaks in mechanisms only:
 * prices, trial length and unit quantities come from the live plan data above.
 */

const BAND = "border-y border-slate-900/[0.07] bg-mkt-surface dark:border-white/[0.08]";
const CARD = "rounded-[20px] border border-slate-900/[0.07] bg-mkt-surface p-5 dark:border-white/[0.08] sm:p-7";
const CARD_ON_SURFACE =
  "rounded-[20px] border border-slate-900/[0.07] bg-mkt-canvas p-5 dark:border-white/[0.08] sm:p-7";
const ICON_TILE = "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mkt-accent/10 text-mkt-accent";
const H3 = `${DISPLAY} text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:text-xl`;
const BODY = "text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[15px]";

function SectionIntro({ id, title, lead }: { id: string; title: string; lead: string }) {
  return (
    <div className="max-w-2xl">
      <RevealHeading id={id} text={title} className={H2} />
      <RevealGroup>
        <p data-reveal className={LEAD}>
          {lead}
        </p>
      </RevealGroup>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * How usage units work
 * ------------------------------------------------------------------ */

const UNIT_TYPES: Array<{ icon: LucideIcon; title: string; body: string; measure: string }> = [
  {
    icon: Upload,
    title: "Resume uploads",
    body: "Add resumes to your Resume Database, one at a time or up to 100 at once.",
    measure: "Uses units from your plan",
  },
  {
    icon: FileSearch,
    title: "Resume Scoring",
    body: "A detailed AI score for one resume against one JD, with a reason for every criterion.",
    measure: "1 unit per score",
  },
  {
    icon: ClipboardCheck,
    title: "AI Assessments",
    body: "One candidate taking one proctored assessment: Technical, Coding or HR.",
    measure: "1 unit per assessment",
  },
  {
    icon: MessagesSquare,
    title: "AI Interviews",
    body: "One candidate taking one voice interview with Bina, our AI interviewer.",
    measure: "1 unit per interview",
  },
];

export function UnitsSection() {
  return (
    <section aria-labelledby="pricing-units" className={SECTION}>
      <div className={SHELL}>
        <SectionIntro
          id="pricing-units"
          title="How usage units work"
          lead="Every plan includes usage units, so you only pay for what you use. Units cover resume uploads, resume scoring, assessments and AI interviews."
        />

        <RevealGroup
          as="ul"
          stagger={0.08}
          className="mt-8 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4"
        >
          {UNIT_TYPES.map(({ icon: Icon, title, body, measure }) => (
            <li key={title} data-reveal className={`${CARD} flex flex-col`}>
              <div className="flex items-center gap-3">
                <span className={ICON_TILE} aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className={H3}>{title}</h3>
              </div>
              <p className={`mt-3 ${BODY}`}>{body}</p>
              <div className="mt-auto pt-5">
                <p
                  className={`${DISPLAY} border-t border-slate-900/[0.07] pt-4 text-sm font-bold text-mkt-ink dark:border-white/[0.08] sm:text-[15px]`}
                >
                  {measure}
                </p>
              </div>
            </li>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Plans and billing at a glance
 * ------------------------------------------------------------------ */

const ESSENTIALS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Sparkles,
    title: "Free Trial",
    body: "Try the platform before you choose a plan.",
  },
  {
    icon: Layers,
    title: "Plans as you grow",
    body: "Starter, Professional, Enterprise and Custom. Each plan card above lists its own limits.",
  },
  {
    icon: PlusCircle,
    title: "Top up anytime",
    body: "Add-on unit packs top up your units, with no plan change needed.",
  },
  {
    icon: Scale,
    title: "Fair billing",
    body: "If units are used up by a technical problem, raise a dispute and get them refunded.",
  },
  {
    icon: CalendarRange,
    title: "Monthly or annual",
    body: "Choose the billing period that suits you with the toggle above.",
  },
  {
    icon: KeyRound,
    title: "API access",
    body: "Secure API keys on Enterprise plans.",
  },
];

export function PlanEssentialsSection() {
  return (
    <section aria-labelledby="pricing-essentials" className={`${SECTION} ${BAND}`}>
      <div className={SHELL}>
        <SectionIntro
          id="pricing-essentials"
          title="Simple plans plus usage units"
          lead="Start small and grow when you're ready. Here's how plans and billing work."
        />
        <RevealGroup
          as="ul"
          stagger={0.07}
          className="mt-8 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
        >
          {ESSENTIALS.map(({ icon: Icon, title, body }) => (
            <li key={title} data-reveal className={`${CARD_ON_SURFACE} flex flex-col gap-4`}>
              <span className={ICON_TILE} aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className={H3}>{title}</h3>
                <p className={`mt-2 ${BODY}`}>{body}</p>
              </div>
            </li>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Pricing FAQ (passed to the shared MarketingFaq)
 * ------------------------------------------------------------------ */

export function pricingFaqItems(trialDays: number | null): Array<{ q: string; a: string }> {
  const trial = trialDays ? ` of ${trialDays} ${trialDays === 1 ? "day" : "days"}` : "";
  return [
    {
      q: "Can I try it before I pay?",
      a: `Yes. Start with a free trial${trial}. The Free Trial card above shows what it includes, and you can pick a plan whenever you're ready.`,
    },
    {
      q: "How is pricing calculated?",
      a: "A plan plus usage units. Your plan includes units, and you can top up anytime with add-on packs.",
    },
    {
      q: "What uses units?",
      a: "Resume uploads, resume scoring, assessments and AI interviews.",
    },
    {
      q: "How many units does an assessment or AI interview use?",
      a: "One. Each candidate assessment uses 1 unit and each AI interview uses 1 unit.",
    },
    {
      q: "What if we need more units?",
      a: "Top up anytime with an add-on unit pack. No plan change needed.",
    },
    {
      q: "What if units are used up by a technical problem?",
      a: "Raise a dispute from your account. If units were used up by a technical problem, they're refunded.",
    },
    {
      q: "Can we pay monthly or annually?",
      a: "Yes, both. Use the billing toggle above to compare monthly and annual prices for each plan.",
    },
    {
      q: "Is there API access?",
      a: "Yes. Secure API keys are available on Enterprise plans.",
    },
  ];
}
