"use client";

import { CopyCheck, ScanText, Search, Sparkles, Upload } from "lucide-react";
import { DISPLAY } from "../fonts";
import { H2, LEAD, SECTION, SHELL } from "../layout";
import { ArrowLink, Cta } from "../Cta";
import { RevealGroup, RevealHeading } from "../motion";
import { DASHBOARD_HREF, useSignedIn } from "../session";
import { CARD, ICON_TILE, RULE } from "./shared";

/** v2 §5 — Resume Database. */
const FACTS = [
  {
    icon: Upload,
    title: "Bulk upload",
    text: "Up to 100 resumes at once in PDF, DOC, DOCX, RTF or TXT.",
  },
  {
    icon: CopyCheck,
    title: "Duplicate detection",
    text: "The same candidate is never stored twice. New versions are tracked.",
  },
  {
    icon: ScanText,
    title: "Auto-parsed profiles",
    text: "Skills, experience, education, projects, certifications, links and notice period are pulled out for you.",
  },
  {
    icon: Search,
    title: "Find anyone fast",
    text: "Search by name, skill, job title, experience or location, and filter by date, company and more.",
  },
];

/** v2 §6 — AI Talent Match. */
const MATCH_POINTS = [
  { title: "Instant ranking.", text: "Every candidate gets a match score from 1 to 10." },
  { title: "Shortlist or reject", text: "with one click." },
  { title: "Send to Scoring.", text: "Move your shortlist straight into detailed Resume Scoring." },
];

const FIT_LABELS = [
  { label: "Excellent", tone: "bg-mkt-cyan/12 text-mkt-cyan-ink" },
  { label: "Good", tone: "bg-mkt-accent/10 text-mkt-accent" },
  { label: "Moderate", tone: "bg-mkt-amber/15 text-mkt-amber-ink" },
  { label: "Low", tone: "bg-slate-900/[0.06] text-slate-600 dark:bg-white/10 dark:text-slate-300" },
];

function TalentMatchCard({ href }: { href: string }) {
  return (
    <div className={`${CARD} flex h-full flex-col p-5 sm:p-7`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={ICON_TILE}>
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <h3 className={`${DISPLAY} text-lg font-bold tracking-[-0.025em] text-mkt-ink sm:text-xl`}>AI Talent Match</h3>
      </div>
      <p className={`${DISPLAY} mt-4 text-base font-bold tracking-[-0.02em] text-mkt-ink sm:text-lg`}>
        Your best candidates, found in seconds.
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[15px]">
        Pick a job. AI searches your whole resume database and ranks the best fits first.
      </p>

      <ul className={`mt-5 space-y-2.5 border-t pt-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400 ${RULE}`}>
        {MATCH_POINTS.map((p) => (
          <li key={p.title}>
            <span className="font-semibold text-mkt-ink">{p.title}</span> {p.text}
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Clear labels at a glance</p>
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Fit labels">
          {FIT_LABELS.map((fit) => (
            <li key={fit.label} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${fit.tone}`}>
              {fit.label} fit
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-auto pt-6">
        <ArrowLink href={href}>Find my top candidates</ArrowLink>
      </p>
    </div>
  );
}

export function TalentPoolSection() {
  const signedIn = useSignedIn();
  const start = signedIn ? DASHBOARD_HREF : "/signup";
  return (
    <section aria-labelledby="talent-pool-heading" className={`${SECTION} border-y ${RULE} bg-mkt-surface`}>
      <div className={SHELL}>
        <p className="text-sm font-semibold text-mkt-accent">Resume Database</p>
        <RevealHeading
          id="talent-pool-heading"
          text="All your resumes. Organised. Searchable. Ready."
          className={`${H2} mt-2`}
        />
        <RevealGroup>
          <p data-reveal className={LEAD}>
            Your private talent pool that gets more valuable with every hire.
          </p>
        </RevealGroup>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-5">
          <div>
            <RevealGroup as="ul" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5" stagger={0.08}>
              {FACTS.map(({ icon: Icon, title, text }) => (
                <li key={title} data-reveal className={`${CARD} p-5 sm:p-6`}>
                  <span aria-hidden="true" className={ICON_TILE}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <h3 className={`${DISPLAY} mt-4 text-base font-bold tracking-[-0.02em] text-mkt-ink sm:text-lg`}>{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{text}</p>
                </li>
              ))}
            </RevealGroup>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-mkt-ink">Folders and archive.</span> Organise resumes your way
              and download them as ZIP.{" "}
              <span className="font-semibold text-mkt-ink">Full candidate history.</span> Every score, test and
              interview for a candidate on one card.
            </p>
          </div>

          <RevealGroup y={40}>
            <div data-reveal className="h-full">
              <TalentMatchCard href={start} />
            </div>
          </RevealGroup>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4 sm:mt-10">
          <Cta href={start} variant="secondary" size="sm">
            Upload resumes
          </Cta>
          <ArrowLink href="/features">Explore the Resume Database and AI Talent Match</ArrowLink>
        </div>
      </div>
    </section>
  );
}
