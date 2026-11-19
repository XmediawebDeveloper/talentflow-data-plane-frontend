"use client";

import {
  ArrowDownRight,
  AudioLines,
  ClipboardCheck,
  Database,
  FileText,
  Gauge,
  ListChecks,
  ScanSearch,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Cta, TrialCta } from "@/components/marketing/Cta";
import { FeatureShowcase } from "@/components/marketing/FeatureShowcase";
import { DashboardTilt } from "@/components/marketing/DashboardTilt";
import { DISPLAY } from "@/components/marketing/fonts";
import { H2, LEAD, SECTION, SHELL } from "@/components/marketing/layout";
import { RevealGroup, RevealHeading } from "@/components/marketing/motion";
import { MarketingPage, PageHero } from "@/components/marketing/PageShell";
import { InterviewSection } from "@/components/marketing/features/InterviewSection";
import {
  AssessmentMock,
  JdMock,
  QuestionBankMock,
  ResumeDbMock,
  ScoringMock,
  TalentMatchMock,
} from "@/components/marketing/features/ModuleMocks";
import { ModuleSection } from "@/components/marketing/features/ModuleSection";
import { AdminSection, ClosingCta } from "@/components/marketing/features/PlatformSections";

/** The modules, by v2 name, each linking to its section below. */
const MODULES: { icon: LucideIcon; group: string; title: string; description: string; href: string }[] = [
  {
    icon: FileText,
    group: "Recruitment",
    title: "Job Descriptions",
    description: "Create, publish and manage JDs.",
    href: "#job-descriptions",
  },
  {
    icon: Database,
    group: "Recruitment",
    title: "Resume Database",
    description: "Store, organise and search all resumes.",
    href: "#resume-database",
  },
  {
    icon: ScanSearch,
    group: "Recruitment",
    title: "AI Talent Match",
    description: "Instantly find the best-fit resumes for a job.",
    href: "#ai-talent-match",
  },
  {
    icon: Gauge,
    group: "Recruitment",
    title: "Resume Scoring",
    description: "Detailed AI score for every resume against a JD.",
    href: "#resume-scoring",
  },
  {
    icon: ClipboardCheck,
    group: "Evaluation",
    title: "AI Assessments",
    description: "Proctored tests: Technical, Coding and HR rounds.",
    href: "#ai-assessments",
  },
  {
    icon: AudioLines,
    group: "Evaluation",
    title: "AI Interviews",
    description: "Voice interview with Bina, our AI interviewer.",
    href: "#ai-interviews",
  },
  {
    icon: ListChecks,
    group: "Shared",
    title: "HR Question Bank",
    description: "Your own HR questions, used in tests and interviews.",
    href: "#hr-question-bank",
  },
  {
    icon: ShieldCheck,
    group: "Admin",
    title: "Admin & Security",
    description: "Roles, teams, audit trail, security and more. Run your hiring team safely in one place.",
    href: "#admin",
  },
];

export default function FeaturesPage() {
  return (
    <MarketingPage>
      <PageHero
        lines={["From JD to hire,", "all with AI."]}
        lead="From job description to final interview on one platform. AI writes your JD, finds the best resumes, scores them, tests skills and interviews candidates, so your team only meets the best."
        aside={<DashboardTilt />}
        actions={
          <>
            <TrialCta magnetic />
            <Cta href="/demo" variant="secondary" arrow={null}>
              Book a Demo
            </Cta>
          </>
        }
      />

      {/* The stages, interactive */}
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

      {/* Module index */}
      <section className={`${SECTION} border-t border-slate-900/[0.07] bg-mkt-surface dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <RevealHeading text="Everything from JD to hire" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              Recruitment, evaluation and admin on one platform. Pick a module to jump to it.
            </p>
          </RevealGroup>
          <RevealGroup
            as="ul"
            stagger={0.05}
            y={30}
            className="mt-8 grid grid-cols-1 gap-3 sm:mt-14 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4"
          >
            {MODULES.map(({ icon: Icon, group, title, description, href }) => (
              <li key={title} data-reveal className="min-w-0">
                <a
                  href={href}
                  className="group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-slate-900/[0.08] bg-mkt-canvas p-5 transition-[translate,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-mkt-accent/30 hover:shadow-[0_28px_56px_-32px_rgba(15,60,153,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid dark:border-white/10 sm:p-6"
                >
                  {/* Corner glow that blooms on hover */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.18),transparent)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  />
                  <span className="relative flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-mkt-accent-solid/[0.08] text-mkt-accent transition-[background-color,color,scale,rotate] duration-500 group-hover:-rotate-6 group-hover:scale-110 group-hover:bg-mkt-accent-solid group-hover:text-white dark:bg-white/10">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      {group}
                    </span>
                  </span>
                  <span className={`${DISPLAY} relative mt-4 text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:mt-5`}>
                    {title}
                  </span>
                  <span className="relative mt-1.5 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {description}
                  </span>
                  <ArrowDownRight
                    aria-hidden="true"
                    className="relative mt-4 h-4 w-4 text-mkt-accent transition-transform duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
                  />
                </a>
              </li>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Module by module (v2 §4–§10) */}
      <ModuleSection
        id="job-descriptions"
        eyebrow="Job Descriptions"
        icon={FileText}
        title="A complete JD in minutes, not hours."
        lead="Tell AI about the role, or paste your existing JD. TalentFlow organises it all."
        points={[
          { title: "AI-written or manual.", body: "Generate a full JD with AI, or write and paste your own." },
          {
            title: "Smart extraction.",
            body: "Must-have skills, nice-to-have skills, experience, education, certifications, industry, location, work mode, employment type and salary are all captured automatically.",
          },
          { title: "Clean skill lists.", body: "Similar skills are grouped, with no duplicates." },
          {
            title: "Versions you can trust.",
            body: "Edit safely. Every version is saved and you can compare them.",
          },
          { title: "Full control.", body: "Draft, publish, republish, archive or disable any job. Download anytime as PDF, Word or text." },
          {
            title: "One job, one view.",
            body: "See scored resumes, talent matches, assessment results and interview results for the job in one place.",
          },
        ]}
        cta="Create Your First JD"
        mock={<JdMock />}
      />

      <ModuleSection
        id="resume-database"
        eyebrow="Resume Database"
        icon={Database}
        title="All your resumes. Organised. Searchable. Ready."
        lead="Your private talent pool that gets more valuable with every hire."
        points={[
          { title: "Bulk upload.", body: "Up to 100 resumes at once in PDF, DOC, DOCX, RTF or TXT." },
          {
            title: "Duplicate detection.",
            body: "The same candidate is never stored twice. New versions are tracked.",
          },
          {
            title: "Auto-parsed profiles.",
            body: "Skills, experience, education, projects, certifications, links and notice period are pulled out for you.",
          },
          {
            title: "Find anyone fast.",
            body: "Search by name, skill, job title, experience or location, and filter by date, company and more.",
          },
          { title: "Folders and archive.", body: "Organise resumes your way. Download as ZIP." },
          {
            title: "Full candidate history.",
            body: "See every score, test and interview for a candidate on one card.",
          },
        ]}
        cta="Upload Resumes"
        footnote="Resume uploads use usage units."
        mock={<ResumeDbMock onSurface />}
        flip
        surface
      />

      <ModuleSection
        id="ai-talent-match"
        eyebrow="AI Talent Match"
        icon={ScanSearch}
        title="Your best candidates, found in seconds."
        lead="Pick a job. AI searches your whole resume database and ranks the best fits first."
        points={[
          { title: "Instant ranking.", body: "Every candidate gets a match score from 1 to 10." },
          { title: "Clear labels.", body: "Excellent, Good, Moderate or Low fit at a glance." },
          { title: "Shortlist or reject", body: "with one click." },
          { title: "Send to Scoring.", body: "Move your shortlist straight into detailed Resume Scoring." },
        ]}
        cta="Find My Top Candidates"
        mock={<TalentMatchMock />}
      />

      <ModuleSection
        id="resume-scoring"
        eyebrow="Resume Scoring"
        icon={Gauge}
        title="One clear score. Real reasons."
        lead="Know exactly why a candidate fits, or why they don't."
        points={[
          {
            title: "Criteria-by-criteria scoring.",
            body: "Job title, experience, must-have skills, nice-to-have skills, education, industry, location and job stability are each scored with a written reason.",
          },
          { title: "Clear verdicts.", body: "Exact Match, Partial Match or No Match." },
          { title: "Strengths and gaps.", body: "An AI summary of each candidate in plain words." },
          {
            title: "Score one or hundreds.",
            body: "Single, bulk and background scoring, with live progress.",
          },
          { title: "Share-ready reports.", body: "Export to Excel or CSV, or download PDF scorecards." },
          {
            title: "One click to next step.",
            body: "Invite shortlisted candidates to an assessment or AI interview.",
          },
        ]}
        cta="Score Resumes Now"
        footnote="Units: each resume score uses 1 unit."
        mock={<ScoringMock onSurface />}
        flip
        surface
      />

      <ModuleSection
        id="ai-assessments"
        eyebrow="AI Assessments"
        icon={ClipboardCheck}
        title="Test real skills, not just resumes."
        lead="Proctored online tests built from your JD and scored automatically."
        points={[
          { title: "Three rounds.", body: "Technical, Coding and HR." },
          {
            title: "Unique for every candidate.",
            body: "AI writes fresh questions for each person, at the same difficulty and covering the same topics. Easy to share, hard to cheat.",
          },
          {
            title: "Real coding tests.",
            body: "A built-in code editor with run and submit, supporting 13 languages including Python, Java, JavaScript, C++, Go and more.",
          },
          { title: "Your HR questions.", body: "Add questions from your HR Question Bank." },
          {
            title: "Secure by design.",
            body: "Identity check, system check, full-screen mode, tab and copy-paste monitoring, plus camera and screen recording.",
          },
          {
            title: "Easy invites.",
            body: "Send by email, in bulk, or with a shareable link. Track sent, opened, started and completed.",
          },
          {
            title: "Instant results.",
            body: "Scores, AI insights and a clear hiring recommendation from Strong Yes to Strong No.",
          },
        ]}
        cta="Create an Assessment"
        footnote="Units: each candidate assessment uses 1 unit."
        mock={<AssessmentMock />}
      />

      <InterviewSection />

      <ModuleSection
        id="hr-question-bank"
        eyebrow="HR Question Bank"
        icon={ListChecks}
        title="Your questions. Asked every time."
        points={[
          { title: "Save your company's own HR questions once." },
          { title: "Use them in both AI Assessments and AI Interviews." },
          { title: "Choose text answers or Yes/No answers." },
        ]}
        mock={<QuestionBankMock />}
        flip
      />

      <AdminSection />
      <ClosingCta />
    </MarketingPage>
  );
}
