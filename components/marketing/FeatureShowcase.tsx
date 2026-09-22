"use client";

import { useRef, useState } from "react";
import { Sparkles, ClipboardCheck, Video, Users, Check, X } from "lucide-react";

/* ------------------------------------------------------------------ *
 * Previews — each feature shows the artefact it actually produces,
 * drawn in the same panel language as the hero shortlist.
 * ------------------------------------------------------------------ */

function PreviewFrame({
  label,
  footer,
  children,
}: {
  label: string;
  footer: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-mkt-surface p-4 shadow-[0_20px_50px_-30px_rgba(8,19,46,0.45)] dark:border-white/10 sm:p-5">
      <p className="border-b border-slate-100 pb-3 text-2xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:border-white/10 dark:text-slate-400 sm:text-2xs">
        {label}
      </p>
      <div className="flex-1 py-4">{children}</div>
      <p className="border-t border-slate-100 pt-3 text-2xs font-medium tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400 sm:text-2xs">
        {footer}
      </p>
    </div>
  );
}

function ScoringPreview() {
  const criteria = [
    { label: "Skills match", value: 94 },
    { label: "Experience", value: 88 },
    { label: "Domain fit", value: 76 },
    { label: "Location", value: 45 },
  ];

  return (
    <PreviewFrame label="Score breakdown · Ananya Rao" footer="Every score carries its reasoning">
      <ul className="space-y-3">
        {criteria.map((row) => (
          <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <span className="text-sm text-slate-600 dark:text-slate-300">{row.label}</span>
            <span className="flex items-center gap-3">
              <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10 sm:block">
                <span
                  className={`block h-full rounded-full ${
                    row.value >= 80 ? "bg-mkt-cyan" : row.value >= 60 ? "bg-mkt-amber" : "bg-slate-400"
                  }`}
                  style={{ width: `${row.value}%` }}
                />
              </span>
              <span className="w-9 text-right text-sm font-semibold tabular-nums text-mkt-ink">
                {row.value}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-mkt-cyan/10 px-2.5 py-1 text-xs font-medium text-mkt-cyan-ink">
        <Check className="h-3.5 w-3.5" />
        Strong match · shortlist
      </p>
    </PreviewFrame>
  );
}

function AssessmentPreview() {
  const options = [
    { text: "useMemo caches the rendered output", correct: false },
    { text: "useMemo caches an expensive computation", correct: true },
    { text: "useMemo replaces useState", correct: false },
  ];

  return (
    <PreviewFrame label="Question 3 of 12 · React" footer="Graded the moment it is submitted">
      <p className="text-sm font-medium text-mkt-ink">
        What does useMemo do in a React component?
      </p>
      <ul className="mt-3 space-y-2">
        {options.map((option) => (
          <li
            key={option.text}
            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${
              option.correct
                ? "border-mkt-cyan/40 bg-mkt-cyan/[0.07] text-mkt-ink"
                : "border-slate-200/80 text-slate-600 dark:border-white/10 dark:text-slate-400"
            }`}
          >
            {option.correct ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-mkt-cyan" />
            ) : (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
            )}
            {option.text}
          </li>
        ))}
      </ul>
    </PreviewFrame>
  );
}

function InterviewPreview() {
  const transcript = [
    { time: "04:12", text: "Walk me through the migration you led." },
    { time: "04:20", text: "We moved 40 services off the monolith in two quarters…" },
  ];

  return (
    <PreviewFrame label="Interview · Krish Menon" footer="Recorded, transcribed, scored">
      <ul className="space-y-3">
        {transcript.map((line) => (
          <li key={line.time} className="flex gap-3">
            <span className="pt-0.5 text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
              {line.time}
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-300">{line.text}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
        {[
          { label: "Clarity", value: "High" },
          { label: "Depth", value: "High" },
          { label: "Sentiment", value: "+0.62" },
        ].map((metric) => (
          <div key={metric.label}>
            <dt className="text-2xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {metric.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-mkt-ink">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </PreviewFrame>
  );
}

function CollaborationPreview() {
  const thread = [
    { initials: "PM", name: "Priya M.", note: "Strong on system design. Advance.", verdict: "Advance" },
    { initials: "JT", name: "Jon T.", note: "Wants to see more testing depth.", verdict: "Hold" },
  ];

  return (
    <PreviewFrame label="Hiring panel · Senior React Engineer" footer="One record, every reviewer">
      <ul className="space-y-3">
        {thread.map((entry) => (
          <li key={entry.initials} className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mkt-accent-solid/10 text-2xs font-semibold text-mkt-accent dark:bg-white/10 dark:text-slate-200">
              {entry.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-mkt-ink">{entry.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.12em] ${
                    entry.verdict === "Advance"
                      ? "bg-mkt-cyan/12 text-mkt-cyan-ink"
                      : "bg-mkt-amber/12 text-mkt-amber-ink"
                  }`}
                >
                  {entry.verdict}
                </span>
              </span>
              <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-400">
                {entry.note}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </PreviewFrame>
  );
}

/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    id: "scoring",
    stage: "Screening",
    icon: Sparkles,
    title: "AI resume scoring",
    description:
      "Every resume is ranked against the job description with 95% accuracy, so the shortlist is ready before you open the first CV.",
    Preview: ScoringPreview,
  },
  {
    id: "assessments",
    stage: "Assessment",
    icon: ClipboardCheck,
    title: "Smart assessments",
    description:
      "Build role-specific tests and quizzes that grade themselves and feed straight back into the candidate's profile.",
    Preview: AssessmentPreview,
  },
  {
    id: "interviews",
    stage: "Interview",
    icon: Video,
    title: "Video interviews",
    description:
      "Run and record interviews in the platform, with transcripts and AI-assisted signals on clarity, depth and sentiment.",
    Preview: InterviewPreview,
  },
  {
    id: "collaboration",
    stage: "Decision",
    icon: Users,
    title: "Team collaboration",
    description:
      "Hiring managers and interviewers leave verdicts on one shared record, so the decision never lives in someone's inbox.",
    Preview: CollaborationPreview,
  },
];

/**
 * The features read as the four stages of a hire. Picking a stage shows the
 * artefact that stage produces rather than another card of adjectives.
 */
export function FeatureShowcase() {
  const [activeId, setActiveId] = useState(FEATURES[0].id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activeIndex = FEATURES.findIndex((feature) => feature.id === activeId);
  const active = FEATURES[activeIndex] ?? FEATURES[0];
  const ActivePreview = active.Preview;

  const moveFocus = (direction: 1 | -1) => {
    const next = FEATURES[(activeIndex + direction + FEATURES.length) % FEATURES.length];
    setActiveId(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)] lg:gap-10">
      {/* Stage list — the section's spine. Below lg it becomes a scrolling
          strip that bleeds into the gutter, so a clipped card reads as more. */}
      <div
        role="tablist"
        aria-label="Product capabilities"
        aria-orientation="vertical"
        className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowRight") {
            event.preventDefault();
            moveFocus(1);
          }
          if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
            event.preventDefault();
            moveFocus(-1);
          }
        }}
      >
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          const selected = feature.id === activeId;

          return (
            <button
              key={feature.id}
              ref={(node) => {
                tabRefs.current[feature.id] = node;
              }}
              type="button"
              role="tab"
              id={`feature-tab-${feature.id}`}
              aria-selected={selected}
              aria-controls={`feature-panel-${feature.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(feature.id)}
              className={`group relative shrink-0 snap-start rounded-xl px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid lg:w-full lg:rounded-none lg:border-b lg:border-slate-200/80 lg:px-0 lg:py-5 lg:dark:border-white/10 ${
                selected
                  ? "bg-mkt-accent-solid/[0.06] lg:bg-transparent"
                  : "hover:bg-slate-100/70 lg:hover:bg-transparent dark:hover:bg-white/[0.04]"
              }`}
            >
              {/* Active marker: a rule that only the chosen stage carries. */}
              <span
                aria-hidden="true"
                className={`absolute left-0 top-0 hidden h-full w-[3px] rounded-full bg-mkt-amber transition-opacity lg:block ${
                  selected ? "opacity-100" : "opacity-0"
                }`}
              />
              <span className="flex items-center gap-3 lg:pl-5">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
                    selected
                      ? "bg-mkt-accent-solid text-white"
                      : "bg-mkt-accent-solid/8 text-mkt-accent dark:bg-white/10"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-2xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    {feature.stage}
                  </span>
                  <span
                    className={`block whitespace-nowrap text-base font-bold tracking-[-0.02em] lg:text-lg ${
                      selected ? "text-mkt-ink" : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {feature.title}
                  </span>
                </span>
              </span>

              {/* The description belongs to the open stage only. */}
              <span
                className={`hidden text-sm leading-relaxed text-slate-600 dark:text-slate-400 lg:block lg:pl-5 ${
                  selected ? "lg:mt-3" : "lg:h-0 lg:overflow-hidden"
                }`}
              >
                {selected ? feature.description : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Artefact panel */}
      <div
        role="tabpanel"
        id={`feature-panel-${active.id}`}
        aria-labelledby={`feature-tab-${active.id}`}
        className="min-h-[300px] sm:min-h-[320px]"
      >
        <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400 lg:hidden">
          {active.description}
        </p>
        <ActivePreview key={active.id} />
      </div>
    </div>
  );
}
