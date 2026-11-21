"use client";

import {
  Briefcase,
  ClipboardCheck,
  Clock,
  Globe2,
  Layers,
  LineChart,
  Scale,
  ShieldCheck,
  Target,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Cta, TrialCta } from "@/components/marketing/Cta";
import { DISPLAY } from "@/components/marketing/fonts";
import { H2, LEAD, SECTION, SHELL } from "@/components/marketing/layout";
import { RevealGroup, RevealHeading } from "@/components/marketing/motion";

const CARD =
  "rounded-[20px] border border-slate-900/[0.07] bg-mkt-surface p-5 dark:border-white/[0.08] sm:p-7";
const CARD_ON_SURFACE =
  "rounded-[20px] border border-slate-900/[0.07] bg-mkt-canvas p-5 dark:border-white/[0.08] sm:p-7";
const ICON_TILE =
  "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mkt-accent/10 text-mkt-accent";
const H3 = `${DISPLAY} text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:text-xl`;
const BODY = "text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[15px]";

/* ------------------------------------------------------------------ *
 * Why TalentFlow (six cards)
 * ------------------------------------------------------------------ */

const REASONS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Clock, title: "Save time", body: "Cut screening from days to hours." },
  { icon: Target, title: "Hire better", body: "Scores with reasons, not gut feeling." },
  { icon: Scale, title: "Be fair", body: "Same structure and scoring for every candidate." },
  {
    icon: Globe2,
    title: "Any industry",
    body: "IT, healthcare, finance, retail, manufacturing and more.",
  },
  { icon: ShieldCheck, title: "Stay secure", body: "Roles, 2FA, audit trail and proctoring." },
  { icon: Layers, title: "All in one", body: "JD to interview on one platform." },
];

export function AboutWhy() {
  return (
    <section
      aria-labelledby="about-why"
      className={`${SECTION} border-y border-slate-900/[0.07] bg-mkt-surface dark:border-white/[0.08]`}
    >
      <div className={SHELL}>
        <div className="max-w-2xl">
          <RevealHeading id="about-why" text="Why TalentFlow" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              Screen less. Hire better.
            </p>
          </RevealGroup>
        </div>
        <RevealGroup
          as="ul"
          stagger={0.07}
          className="mt-8 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
        >
          {REASONS.map(({ icon: Icon, title, body }) => (
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
 * Who it's for
 * ------------------------------------------------------------------ */

const AUDIENCES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Briefcase,
    title: "Recruiters",
    body: "Screen more candidates with less effort.",
  },
  {
    icon: Users,
    title: "Hiring managers",
    body: "Get clear reports and decide with confidence.",
  },
  {
    icon: UserCog,
    title: "Admins and leaders",
    body: "Control access, usage and spending.",
  },
];

export function AboutAudiences() {
  return (
    <section aria-labelledby="about-audiences" className={SECTION}>
      <div className={SHELL}>
        <div className="max-w-2xl">
          <RevealHeading id="about-audiences" text="Who it's for" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              One platform for everyone in the hiring loop, in any industry and for any role.
            </p>
          </RevealGroup>
        </div>
        <RevealGroup
          as="ul"
          stagger={0.08}
          className="mt-8 grid grid-cols-1 gap-3 sm:mt-12 sm:gap-4 md:grid-cols-3"
        >
          {AUDIENCES.map(({ icon: Icon, title, body }) => (
            <li key={title} data-reveal className={`${CARD} flex flex-col gap-4`}>
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
 * What we stand for
 * ------------------------------------------------------------------ */

const VALUES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: ClipboardCheck,
    title: "Fair interviews. Every candidate. Every time.",
    body: "Every candidate gets the same fair, structured interview, built from your JD.",
  },
  {
    icon: LineChart,
    title: "Scores with reasons",
    body: "Every score comes with a written reason, so you know exactly why a candidate fits, or why they don't.",
  },
  {
    icon: Globe2,
    title: "Any industry, any role",
    body: "TalentFlow works for IT, healthcare, finance, retail, manufacturing and more.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by design",
    body: "Role-based access, two-factor authentication, an audit trail of every action, and proctored assessments and interviews.",
  },
];

export function AboutValues() {
  return (
    <section
      aria-labelledby="about-values"
      className={`${SECTION} border-y border-slate-900/[0.07] bg-mkt-surface dark:border-white/[0.08]`}
    >
      <div className={`${SHELL} grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <RevealHeading id="about-values" text="What we stand for" className={H2} />
        </div>
        <RevealGroup as="ul" stagger={0.07} className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {VALUES.map(({ icon: Icon, title, body }) => (
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
 * Closing band
 * ------------------------------------------------------------------ */

export function AboutCta() {
  return (
    <section aria-labelledby="about-cta" className={SECTION}>
      <div className={SHELL}>
        <RevealGroup y={40}>
          <div
            data-reveal
            className="relative grid grid-cols-1 gap-6 overflow-hidden rounded-[20px] bg-mkt-navy p-6 text-white sm:p-10 lg:grid-cols-[minmax(0,1.3fr)_auto] lg:items-end lg:gap-14 lg:p-14"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,var(--raw-rgba-7-156-196-0p28),transparent)]"
            />
            <div className="relative max-w-xl">
              <h2
                id="about-cta"
                className={`${DISPLAY} text-[clamp(1.5rem,3.4vw,2.5rem)] font-bold leading-[1.1] tracking-[-0.03em]`}
              >
                Ready to hire smarter?
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-white/70 sm:text-base">
                Let AI do the heavy lifting, so your team can focus on people.
              </p>
            </div>
            <div className="relative flex flex-col gap-2.5 sm:flex-row sm:gap-3">
              <TrialCta variant="light" magnetic />
              <Cta href="/contact" variant="outlineLight" arrow={null}>
                Talk to Sales
              </Cta>
            </div>
          </div>
        </RevealGroup>
      </div>
    </section>
  );
}
