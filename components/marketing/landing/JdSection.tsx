"use client";

import { Eye, History, ListChecks, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";
import { DISPLAY } from "../fonts";
import { H2, LEAD, SECTION, SHELL } from "../layout";
import { ArrowLink, Cta } from "../Cta";
import { RevealGroup, RevealHeading } from "../motion";
import { DASHBOARD_HREF, useSignedIn } from "../session";
import { ICON_TILE, RULE } from "./shared";

const POINTS = [
  {
    icon: WandSparkles,
    title: "AI-written or manual",
    text: "Generate a full JD with AI, or write and paste your own.",
  },
  {
    icon: ListChecks,
    title: "Smart extraction",
    text: "Must-have and nice-to-have skills, experience, education, certifications, industry, location, work mode, employment type and salary are captured automatically. Similar skills are grouped, with no duplicates.",
  },
  {
    icon: History,
    title: "Versions you can trust",
    text: "Every version is saved and you can compare them. Draft, publish, republish, archive or disable any job, and download it as PDF, Word or text.",
  },
  {
    icon: Eye,
    title: "One job, one view",
    text: "Scored resumes, talent matches, assessment results and interview results for the job, in one place.",
  },
];

const VIEW = ["Scored resumes", "Talent matches", "Assessment results", "Interview results"];

function Chip({ children, tone }: { children: ReactNode; tone: "must" | "nice" | "plain" }) {
  const tones = {
    must: "bg-mkt-accent/10 text-mkt-accent",
    nice: "bg-mkt-amber/10 text-mkt-amber-ink",
    plain: "bg-slate-900/[0.05] text-slate-700 dark:bg-white/[0.07] dark:text-slate-200",
  };
  return (
    <li className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </li>
  );
}

const DETAILS = [
  { label: "Experience", value: "5–8 years" },
  { label: "Work mode", value: "Hybrid" },
  { label: "Location", value: "Pune" },
  { label: "Employment", value: "Full-time" },
];

/** A worked example of what extraction produces from a short prompt. */
function ExtractionPreview() {
  return (
    <figure className="rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-4 shadow-[0_30px_60px_-36px_rgba(15,60,153,0.35)] dark:border-white/10 sm:p-6">
      <figcaption className="sr-only">Sample of the details TalentFlow captures from a job description</figcaption>
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-mkt-cyan/10 px-2 py-0.5 text-[11px] font-semibold text-mkt-cyan-ink">Sample</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Version 3 · Published</span>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-900/[0.08] bg-mkt-canvas px-3 py-2.5 dark:border-white/10">
        <WandSparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-mkt-accent" />
        <p className="min-w-0 truncate text-sm text-mkt-ink">Senior Java Developer, banking, hybrid in Pune</p>
      </div>

      <dl className="mt-4 space-y-4 text-sm">
        <div>
          <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">Must-have skills</dt>
          <dd>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {["Java", "Spring Boot", "Microservices", "SQL"].map((s) => (
                <Chip key={s} tone="must">
                  {s}
                </Chip>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nice-to-have skills</dt>
          <dd>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {["Kafka", "Docker", "Payments"].map((s) => (
                <Chip key={s} tone="nice">
                  {s}
                </Chip>
              ))}
            </ul>
          </dd>
        </div>
        <div className={`grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4 ${RULE}`}>
          {DETAILS.map((d) => (
            <div key={d.label}>
              <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{d.label}</dt>
              <dd className="mt-1.5">
                <ul className="flex flex-wrap gap-1.5">
                  <Chip tone="plain">{d.value}</Chip>
                </ul>
              </dd>
            </div>
          ))}
        </div>
      </dl>

      <div className={`mt-4 border-t pt-4 ${RULE}`}>
        <p className="text-xs text-slate-500 dark:text-slate-400">One job, one view</p>
        <ul className="mt-2 grid grid-cols-2 gap-1.5">
          {VIEW.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-slate-900/[0.08] bg-mkt-canvas px-2.5 py-1.5 text-xs font-medium text-mkt-ink dark:border-white/10"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

/** v2 §4 — Job Descriptions. */
export function JdSection() {
  const signedIn = useSignedIn();
  return (
    <section aria-labelledby="jd-heading" className={SECTION}>
      <div className={`${SHELL} grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-20`}>
        <div>
          <p className="text-sm font-semibold text-mkt-accent">Job Descriptions</p>
          <RevealHeading id="jd-heading" text="A complete JD in minutes, not hours." className={`${H2} mt-2`} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              Tell AI about the role, or paste your existing JD. TalentFlow organises it all.
            </p>
          </RevealGroup>
          <RevealGroup as="ul" className="mt-7 space-y-5 sm:mt-10 sm:space-y-6" stagger={0.1}>
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} data-reveal className="flex gap-4">
                <span aria-hidden="true" className={ICON_TILE}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <h3 className={`${DISPLAY} text-base font-bold tracking-[-0.02em] text-mkt-ink sm:text-lg`}>{title}</h3>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[15px]">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </RevealGroup>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4 sm:mt-10">
            <Cta href={signedIn ? DASHBOARD_HREF : "/signup"} variant="secondary" size="sm">
              Create your first JD
            </Cta>
            <ArrowLink href="/features">See every module</ArrowLink>
          </div>
        </div>

        <RevealGroup y={40}>
          <div data-reveal className="mx-auto w-full max-w-lg lg:max-w-none">
            <ExtractionPreview />
          </div>
        </RevealGroup>
      </div>
    </section>
  );
}
