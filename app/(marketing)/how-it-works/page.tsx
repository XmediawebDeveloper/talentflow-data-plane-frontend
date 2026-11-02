"use client";

import { CheckCircle, ClipboardCheck, Play, Search, Upload, Video } from "lucide-react";
import { Cta, TrialCta } from "@/components/marketing/Cta";
import { FeatureShowcase } from "@/components/marketing/FeatureShowcase";
import { RevealGroup, RevealHeading } from "@/components/marketing/motion";
import { H2, LEAD, SECTION, SHELL } from "@/components/marketing/layout";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";
import { StepTimeline, type TimelineStep } from "@/components/marketing/StepTimeline";

const STEPS: TimelineStep[] = [
  {
    title: "Upload resumes",
    description:
      "Bulk upload resumes in any format. Our AI automatically parses and extracts key information.",
    icon: Upload,
  },
  {
    title: "AI screening",
    description:
      "Our AI analyzes each resume against your job requirements and ranks candidates automatically.",
    icon: Search,
  },
  {
    title: "Assessments",
    description: "Send customized skill assessments to shortlisted candidates with automatic grading.",
    icon: ClipboardCheck,
  },
  {
    title: "Video interviews",
    description: "Conduct AI-powered video interviews with sentiment analysis and transcription.",
    icon: Video,
  },
  {
    title: "Hire",
    description:
      "Make data-driven hiring decisions with comprehensive candidate insights and reports.",
    icon: CheckCircle,
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingPage>
      <PageHero
        lines={["From resume to hire", "in five steps"]}
        lead="Our streamlined process helps you find the best candidates faster than ever."
        actions={
          <>
            <TrialCta magnetic />
            <Cta href="/demo" variant="secondary" icon={Play} arrow={null}>
              Watch the demo
            </Cta>
          </>
        }
      />

      {/* The process */}
      <section className={`${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <RevealHeading text="One pipeline, start to finish" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              Every candidate moves through the same five stages, so nothing is lost between tools
              or inboxes.
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
              Pick a stage to see the artefact it leaves behind for your team.
            </p>
            <div data-reveal className="mt-7 sm:mt-14">
              <FeatureShowcase />
            </div>
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
