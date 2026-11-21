"use client";

import { ClipboardCheck, FileText, ListChecks, Mic, Sparkles, Upload } from "lucide-react";
import { Cta, TrialCta } from "@/components/marketing/Cta";
import { FeatureShowcase } from "@/components/marketing/FeatureShowcase";
import { DISPLAY } from "@/components/marketing/fonts";
import { CandidateSide } from "@/components/marketing/how/CandidateSide";
import { HowHeroStage } from "@/components/marketing/how/HowHeroStage";
import { InviteWays } from "@/components/marketing/how/InviteWays";
import { UnitRules } from "@/components/marketing/how/UnitRules";
import { RevealGroup, RevealHeading } from "@/components/marketing/motion";
import { H2, LEAD, SECTION, SHELL } from "@/components/marketing/layout";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";
import { StepTimeline, type TimelineStep } from "@/components/marketing/StepTimeline";

/** The six steps, as written in the website content (v2, Section 3). */
const STEPS: TimelineStep[] = [
  {
    title: "Create the JD",
    description:
      "AI writes it, or you paste your own. Skills, experience, education, location, work mode and more are captured automatically.",
    icon: FileText,
  },
  {
    title: "Add resumes",
    description:
      "Bulk upload up to 100 at a time in PDF, DOC, DOCX, RTF or TXT. Profiles are parsed for you, and the same candidate is never stored twice.",
    icon: Upload,
  },
  {
    title: "Find the best fit",
    description:
      "AI Talent Match ranks your whole database in seconds, with a match score from 1 to 10 and an Excellent, Good, Moderate or Low fit label.",
    icon: Sparkles,
  },
  {
    title: "Score in depth",
    description:
      "Every shortlisted resume gets a clear score with reasons: Exact Match, Partial Match or No Match, plus strengths and gaps in plain words.",
    icon: ListChecks,
  },
  {
    title: "Test skills",
    description:
      "Send a proctored AI Assessment, coding round included. Technical, Coding and HR rounds are scored automatically, with a recommendation from Strong Yes to Strong No.",
    icon: ClipboardCheck,
  },
  {
    title: "AI Interview with Bina",
    description:
      "Bina interviews by voice and hands you a full report: a skill-by-skill score, an overall score out of 100, strengths, concerns and a clear recommendation.",
    icon: Mic,
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingPage>
      <PageHero
        lines={["From JD to hire,", "all with AI"]}
        lead="Six steps on one platform. AI writes your JD, finds the best resumes, scores them, tests skills and interviews candidates, so your team only meets the best."
        aside={<HowHeroStage />}
        actions={
          <>
            <TrialCta magnetic />
            <Cta href="/demo" variant="secondary" arrow="upRight">
              Book a Demo
            </Cta>
          </>
        }
      />

      {/* The process */}
      <section className={`${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <RevealHeading text="Six steps, one platform" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              From job description to final interview, every candidate is measured against the
              same JD.
            </p>
          </RevealGroup>
          <div className="mt-10 sm:mt-16">
            <StepTimeline steps={STEPS} />
          </div>
        </div>
      </section>

      {/* What each stage produces */}
      <section className={`${SECTION} border-t border-slate-900/[0.07] bg-mkt-surface dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <RevealHeading text="See what each stage produces" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              Pick a stage to see what it leaves behind for your team.
            </p>
            <div data-reveal className="mt-7 sm:mt-14">
              <FeatureShowcase />
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* Inviting */}
      <section className={`${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <InviteWays />
        </div>
      </section>

      {/* Candidate experience */}
      <section className={`${SECTION} border-t border-slate-900/[0.07] bg-mkt-surface dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <CandidateSide />
        </div>
      </section>

      {/* Units */}
      <section className={`${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <UnitRules />
        </div>
      </section>

      {/* CTA band (v2, Section 14) */}
      <section className="pb-12 sm:pb-24 lg:pb-28">
        <div className={SHELL}>
          <RevealGroup y={40}>
            <div
              data-reveal
              className="relative overflow-hidden rounded-[20px] bg-mkt-navy p-6 text-white sm:p-12 lg:p-16"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,var(--raw-rgba-7-156-196-0p28),transparent)] sm:h-[28rem] sm:w-[28rem]"
              />
              <div className="relative max-w-2xl">
                <h2 className={`${DISPLAY} text-[clamp(1.5rem,3.8vw,2.75rem)] font-bold leading-[1.08] tracking-[-0.035em] text-balance`}>
                  Ready to hire smarter?
                </h2>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/70 sm:mt-4 sm:text-lg">
                  Let AI do the heavy lifting, so your team can focus on people.
                </p>
                <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
                  <TrialCta variant="light" />
                  <Cta href="/contact" variant="outlineLight" arrow="upRight">
                    Talk to Sales
                  </Cta>
                </div>
              </div>
            </div>
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
