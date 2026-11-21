"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP, withMotion } from "@/lib/gsap";
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Library, MessagesSquare, Mic, Play, ShieldCheck } from "lucide-react";
import { IconButton } from '@/components/ui/icon-button';

/* ------------------------------------------------------------------ *
 * Previews — each module shows the artefact it actually produces,
 * drawn in the same panel language as the hero match list. Every
 * preview is sample data and is labelled as such.
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
    <div className="flex flex-col rounded-[20px] lg:h-full border border-slate-900/[0.08] bg-mkt-surface p-4 shadow-[0_30px_60px_-36px_rgba(15,60,153,0.35)] dark:border-white/10 sm:p-6">
      <p className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 text-xs font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 rounded-full bg-mkt-cyan/10 px-2 py-0.5 text-[11px] font-semibold text-mkt-cyan-ink">
          Sample
        </span>
      </p>
      <div className="flex-1 py-3 sm:py-4">{children}</div>
      <p className="border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
        {footer}
      </p>
    </div>
  );
}

const VERDICT_TONE = {
  "Exact Match": "bg-mkt-cyan/12 text-mkt-cyan-ink",
  "Partial Match": "bg-mkt-amber/12 text-mkt-amber-ink",
  "No Match": "bg-slate-900/[0.06] text-slate-600 dark:bg-white/10 dark:text-slate-300",
} as const;

function ScoringPreview() {
  const criteria: { label: string; verdict: keyof typeof VERDICT_TONE; reason: string }[] = [
    { label: "Must-have skills", verdict: "Exact Match", reason: "Java, Spring Boot and SQL used in recent roles" },
    { label: "Experience", verdict: "Exact Match", reason: "7 years against the 5 to 8 asked for" },
    { label: "Nice-to-have skills", verdict: "Partial Match", reason: "Kafka in two projects, no Docker mentioned" },
    { label: "Industry", verdict: "No Match", reason: "Retail background, the role asks for banking" },
  ];

  return (
    <PreviewFrame
      label="Ananya Rao · Senior Java Developer"
      footer="Strengths and gaps in plain words · export to Excel, CSV or PDF"
    >
      <ul className="space-y-3">
        {criteria.map((row) => (
          <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
            <span className="text-sm font-medium text-mkt-ink">{row.label}</span>
            <span
              className={`row-span-2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_TONE[row.verdict]}`}
            >
              {row.verdict}
            </span>
            <span className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{row.reason}</span>
          </li>
        ))}
      </ul>
    </PreviewFrame>
  );
}

function AssessmentPreview() {
  const rounds = ["Technical", "Coding", "HR"];
  const checks = ["Identity check", "Full-screen mode", "Camera and screen recording"];

  return (
    <PreviewFrame
      label="Senior Java Developer · AI Assessment"
      footer="Fresh questions for every candidate, at the same difficulty and on the same topics"
    >
      <ul className="flex flex-wrap gap-1.5" aria-label="Rounds">
        {rounds.map((round) => (
          <li
            key={round}
            className="inline-flex items-center gap-1 rounded-full bg-mkt-accent/10 px-2.5 py-1 text-xs font-semibold text-mkt-accent"
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            {round}
          </li>
        ))}
      </ul>

      {/* The coding round's editor, in miniature. */}
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-900/[0.08] dark:border-white/10">
        <div className="flex items-center justify-between gap-2 border-b border-slate-900/[0.06] bg-slate-900/[0.03] px-3 py-1.5 text-[11px] text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400">
          <span className="font-semibold">Coding round · Python</span>
          <span className="inline-flex items-center gap-1 font-semibold text-mkt-accent">
            <Play aria-hidden="true" className="h-3 w-3" /> Run
          </span>
        </div>
        <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 sm:text-xs">
          {"def top_k(scores, k):\n    return sorted(scores, reverse=True)[:k]"}
        </pre>
      </div>

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-3" aria-label="Proctoring">
        {checks.map((check) => (
          <li key={check} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-mkt-cyan" />
            {check}
          </li>
        ))}
      </ul>

      <dl className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Recommendation</dt>
          <dd className="mt-0.5 text-sm font-semibold text-mkt-ink">Strong Yes</dd>
        </div>
        <div className="text-right">
          <dt className="text-xs text-slate-500 dark:text-slate-400">Scale</dt>
          <dd className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">Strong Yes to Strong No</dd>
        </div>
      </dl>
    </PreviewFrame>
  );
}

function InterviewPreview() {
  const transcript = [
    { speaker: "Bina", text: "Walk me through a Java service you designed." },
    { speaker: "Krish", text: "I built a payments service on Spring Boot and ran it in containers…" },
    { speaker: "Bina", text: "You mentioned containers. How did you set up Docker for it?" },
  ];

  return (
    <PreviewFrame label="Krish Menon · AI Interview with Bina" footer="Full recording and transcript · checked by a second AI">
      <ul className="space-y-2.5">
        {transcript.map((line, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                line.speaker === "Bina"
                  ? "bg-mkt-accent-solid text-white"
                  : "bg-slate-900/[0.06] text-slate-600 dark:bg-white/10 dark:text-slate-300"
              }`}
            >
              {line.speaker === "Bina" ? <Mic aria-hidden="true" className="h-3 w-3" /> : <span aria-hidden="true">KM</span>}
              <span className="sr-only">{line.speaker}:</span>
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-300">{line.text}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
        {[
          { label: "Overall", value: "82/100" },
          { label: "Mode", value: "Timed" },
          { label: "Risk level", value: "Low" },
        ].map((metric) => (
          <div key={metric.label}>
            <dt className="text-xs text-slate-500 dark:text-slate-400">{metric.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-mkt-ink">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </PreviewFrame>
  );
}

function QuestionBankPreview() {
  const questions = [
    { text: "Are you open to working from our Pune office?", type: "Yes/No" },
    { text: "Why are you looking for a new role?", type: "Text" },
    { text: "Are you comfortable with rotational shifts?", type: "Yes/No" },
  ];

  return (
    <PreviewFrame label="HR Question Bank · your company's questions" footer="Used in both AI Assessments and AI Interviews">
      <ul className="space-y-2.5">
        {questions.map((q) => (
          <li
            key={q.text}
            className="flex items-start justify-between gap-3 rounded-lg border border-slate-200/80 px-3 py-2.5 dark:border-white/10"
          >
            <span className="text-sm text-mkt-ink">{q.text}</span>
            <span className="shrink-0 rounded-full bg-slate-900/[0.05] px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
              {q.type}
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
    icon: FileText,
    title: "Resume Scoring",
    description:
      "One clear score with real reasons. Job title, experience, skills, education, industry, location and job stability are each judged an Exact, Partial or No Match.",
    Preview: ScoringPreview,
  },
  {
    id: "assessments",
    stage: "Skills test",
    icon: ClipboardCheck,
    title: "AI Assessments",
    description:
      "Proctored Technical, Coding and HR rounds built from your JD, with a code editor for 13 languages and a recommendation from Strong Yes to Strong No.",
    Preview: AssessmentPreview,
  },
  {
    id: "interviews",
    stage: "Interview",
    icon: MessagesSquare,
    title: "AI Interviews",
    description:
      "Bina interviews by voice, asks follow-up questions and hands you a report with an overall score out of 100 and a Low, Medium or High risk level.",
    Preview: InterviewPreview,
  },
  {
    id: "questions",
    stage: "Shared",
    icon: Library,
    title: "HR Question Bank",
    description:
      "Save your company's own HR questions once, with text or Yes/No answers, and use them in AI Assessments and AI Interviews.",
    Preview: QuestionBankPreview,
  },
];

/**
 * The evaluation modules, in the order a candidate meets them. Picking one
 * shows the artefact it produces rather than another card of adjectives.
 */
export function FeatureShowcase() {
  const [activeId, setActiveId] = useState(FEATURES[0].id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const listRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // Mobile strip: which ends still have tabs hidden past them.
  const syncEdges = () => {
    const el = listRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useEffect(() => {
    syncEdges();
    window.addEventListener("resize", syncEdges);
    return () => window.removeEventListener("resize", syncEdges);
  }, []);

  const centredFor = useRef(activeId);
  // Keep the chosen tab centred in the strip (horizontal only — no page jump).
  useEffect(() => {
    if (centredFor.current === activeId) return; // only on a real switch (also StrictMode-safe)
    centredFor.current = activeId;
    const el = listRef.current;
    const tab = tabRefs.current[activeId];
    if (!el || !tab || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [activeId]);

  // End buttons: smooth-scroll the strip by ~60% of its width.
  const scrollTabs = (dir: 1 | -1) => {
    const el = listRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: "smooth" });
  };

  // The artefact assembles itself: panel rises and its rows arrive in order.
  // First time on scroll-in, then on every switch.
  useGSAP(
    () => {
      const panel = panelRef.current!;
      const first = firstRender.current;
      firstRender.current = false;
      withMotion(() => {
        const tl = gsap.timeline({
          scrollTrigger: first ? { trigger: panel, start: "top 80%", once: true } : undefined,
        });
        if (!first) tl.fromTo(panel, { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: "power3.out" });
        tl.fromTo(
          panel.querySelectorAll("li, dl > div"),
          { y: 10, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.06, ease: "power3.out" },
          first ? 0 : 0.1
        );
      });
    },
    { dependencies: [activeId] }
  );

  const activeIndex = FEATURES.findIndex((feature) => feature.id === activeId);
  const active = FEATURES[activeIndex] ?? FEATURES[0];
  const ActivePreview = active.Preview;

  const moveFocus = (direction: 1 | -1) => {
    const next = FEATURES[(activeIndex + direction + FEATURES.length) % FEATURES.length];
    setActiveId(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)] lg:gap-10">
      {/* Module list — the section's spine. Below lg it becomes a scrolling
          strip that bleeds into the gutter, so a clipped card reads as more. */}
      <div className="relative min-w-0">
      {/* Minimal scroll buttons at both ends (below lg), shown only when tabs are hidden that way. */}
      {(["left", "right"] as const).map((side) =>
        edges[side] ? (
          <IconButton bare label={side === "left" ? "Scroll tabs left" : "Scroll tabs right"}
            key={side}
            type="button"
            onClick={() => scrollTabs(side === "left" ? -1 : 1)}
            className={`absolute top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-slate-900/10 bg-mkt-surface/45 text-mkt-accent shadow-md backdrop-blur transition-[opacity,transform] duration-200 active:scale-90 dark:border-white/10 lg:hidden ${
              side === "left" ? "left-0" : "right-0"
            }`}
          >
            {side === "left" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </IconButton>
        ) : null
      )}
      <div
        ref={listRef}
        onScroll={syncEdges}
        // Room for the end buttons so they never cover a tab (inline beats the global mobile tablist padding).
        style={edges.left || edges.right ? { paddingInline: 34, scrollPaddingInline: 34 } : undefined}
        role="tablist"
        aria-label="Product modules"
        aria-orientation="vertical"
        className="relative mx-auto flex w-fit max-w-full snap-x snap-mandatory gap-2 overflow-x-auto pb-1 lg:w-auto lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0"
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
              className={`group relative shrink-0 snap-start rounded-xl px-3 py-2.5 text-left sm:px-4 sm:py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid lg:w-full lg:rounded-none lg:border-b lg:border-slate-200/80 lg:px-0 lg:py-5 lg:dark:border-white/10 ${
                selected
                  ? "bg-mkt-accent-solid/[0.06] lg:bg-transparent"
                  : "hover:bg-slate-100/70 lg:hover:bg-transparent dark:hover:bg-white/[0.04]"
              }`}
            >
              {/* Active marker: a rule that only the chosen module carries. */}
              <span
                aria-hidden="true"
                className={`absolute left-0 top-0 hidden h-full w-[3px] rounded-full bg-mkt-amber transition-opacity lg:block ${
                  selected ? "opacity-100" : "opacity-0"
                }`}
              />
              <span className="flex items-center gap-1.5 sm:gap-3 lg:pl-5">
                <span
                  className={`grid h-6 w-6 shrink-0 sm:h-9 sm:w-9 place-items-center rounded-lg transition-[background-color,color,scale] duration-300 group-hover:scale-110 ${
                    selected
                      ? "bg-mkt-accent-solid text-white"
                      : "bg-mkt-accent-solid/8 text-mkt-accent dark:bg-white/10"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="hidden text-xs font-medium lg:block text-slate-500 dark:text-slate-400">
                    {feature.stage}
                  </span>
                  <span
                    className={`block whitespace-nowrap text-[13px] font-bold sm:text-base tracking-[-0.02em] lg:text-lg ${
                      selected ? "text-mkt-ink" : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {feature.title}
                  </span>
                </span>
              </span>

              {/* The description belongs to the open module only. */}
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
      </div>

      {/* Artefact panel */}
      <div
        role="tabpanel"
        id={`feature-panel-${active.id}`}
        aria-labelledby={`feature-tab-${active.id}`}
        ref={panelRef}
        className="min-h-[260px] sm:min-h-[320px]"
      >
        <p className="mb-3 text-[13px] leading-relaxed sm:mb-4 sm:text-sm text-slate-600 dark:text-slate-400 lg:hidden">
          {active.description}
        </p>
        <ActivePreview key={active.id} />
      </div>
    </div>
  );
}
