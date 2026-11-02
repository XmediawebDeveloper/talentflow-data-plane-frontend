"use client";

import { BarChart3, Clock, FileText, Globe, Shield, Sparkles, Users, Video, Zap } from "lucide-react";
import { Cta, TrialCta } from "@/components/marketing/Cta";
import { FeatureShowcase } from "@/components/marketing/FeatureShowcase";
import { DashboardTilt } from "@/components/marketing/DashboardTilt";
import { DISPLAY } from "@/components/marketing/fonts";
import { H2, LEAD, SECTION, SHELL } from "@/components/marketing/layout";
import { RevealGroup, RevealHeading } from "@/components/marketing/motion";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI resume scoring",
    description:
      "Automatically rank and score candidates based on job requirements with 95% accuracy. Our AI analyzes skills, experience, and cultural fit.",
  },
  {
    icon: Video,
    title: "Video interviews",
    description:
      "Conduct asynchronous or live video interviews with AI-powered sentiment analysis, transcription, and candidate insights.",
  },
  {
    icon: BarChart3,
    title: "Advanced analytics",
    description:
      "Get real-time insights into your hiring pipeline with customizable dashboards, reports, and predictive analytics.",
  },
  {
    icon: FileText,
    title: "Smart assessments",
    description:
      "Create custom skills tests and assessments with automatic grading, plagiarism detection, and detailed reports.",
  },
  {
    icon: Users,
    title: "Team collaboration",
    description:
      "Work together seamlessly with hiring managers, interviewers, and recruiters. Share feedback and make decisions faster.",
  },
  {
    icon: Shield,
    title: "Enterprise security",
    description: "SOC 2 Type II certified with bank-level encryption, SSO support, and GDPR compliance built-in.",
  },
  {
    icon: Zap,
    title: "API & integrations",
    description:
      "Connect with your existing tools. Integrate with ATS systems, HRIS platforms, calendars, and more.",
  },
  {
    icon: Clock,
    title: "Automated workflows",
    description:
      "Set up custom workflows to automate candidate communication, interview scheduling, and task assignments.",
  },
  {
    icon: Globe,
    title: "Global hiring",
    description:
      "Hire talent from anywhere in the world with multi-language support, timezone management, and localized compliance.",
  },
];

export default function FeaturesPage() {
  return (
    <MarketingPage>
      <PageHero
        lines={["Powerful tools for", "modern recruiting"]}
        lead="Everything you need to find, evaluate, and hire the best talent. All in one platform."
        aside={<DashboardTilt />}
        actions={
          <>
            <TrialCta magnetic />
            <Cta href="/demo" variant="secondary" arrow={null}>
              Request a demo
            </Cta>
          </>
        }
      />

      {/* The four stages, interactive */}
      <section className={`${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <RevealHeading text="The core of every hire" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              Pick a stage to see what it produces for your team.
            </p>
            <div data-reveal className="mt-7 sm:mt-14">
              <FeatureShowcase />
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* Everything else */}
      <section className={`${SECTION} border-t border-slate-900/[0.07] bg-mkt-surface dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <RevealHeading text="Everything in the platform" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              Nine capabilities, one login. Here&apos;s what your team gets.
            </p>
          </RevealGroup>
          <RevealGroup
            as="ul"
            stagger={0.06}
            y={30}
            className="mt-8 grid grid-cols-1 gap-3 sm:mt-14 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
          >
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li
                key={title}
                data-reveal
                className="group relative overflow-hidden rounded-[20px] border border-slate-900/[0.08] bg-mkt-canvas p-5 transition-[translate,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-mkt-accent/30 hover:shadow-[0_28px_56px_-32px_rgba(15,60,153,0.45)] dark:border-white/10 sm:p-7"
              >
                {/* Corner glow that blooms on hover */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.18),transparent)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                />
                <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-mkt-accent-solid/[0.08] text-mkt-accent transition-[background-color,color,scale,rotate] duration-500 group-hover:-rotate-6 group-hover:scale-110 group-hover:bg-mkt-accent-solid group-hover:text-white dark:bg-white/10 sm:h-12 sm:w-12">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <h3 className={`${DISPLAY} relative mt-4 text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:mt-6 sm:text-xl`}>
                  {title}
                </h3>
                <p className="relative mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-2 sm:text-[15px]">
                  {description}
                </p>
              </li>
            ))}
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
