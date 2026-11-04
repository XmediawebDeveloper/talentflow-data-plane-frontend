"use client";

import { Check, ShieldCheck } from "lucide-react";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { DISPLAY } from "../fonts";
import { SECTION, SHELL } from "../layout";
import { Cta } from "../Cta";
import { RevealGroup, RevealHeading } from "../motion";
import { DASHBOARD_HREF, useSignedIn } from "../session";

/** v2 §9 — AI Interviews, the hero feature. */
const POINTS = [
  { title: "A real conversation.", text: "Bina speaks, listens and follows up like a human interviewer." },
  { title: "Built from your JD.", text: "The interview is planned around the role's must-have skills, nice-to-have skills and HR questions." },
  { title: "Two styles.", text: "Timed mode (structured, 30 min) or Conversational mode (adapts to the candidate)." },
  { title: "Candidates interview anytime.", text: "They get a link, practise with Bina first, then start whenever it suits them." },
];

const INTEGRITY = [
  "Face verification and voice identity checks",
  "Detection of a second person or a phone in view",
  "Tab, full-screen and screen-recording monitoring",
  "Room scan from the candidate's phone",
  "Clear Low, Medium and High risk levels",
];

/** Sample report: bar widths are illustrative, not a scale. */
const SKILLS = [
  { label: "Java", width: 88 },
  { label: "Spring Boot", width: 80 },
  { label: "Microservices", width: 72 },
  { label: "Communication", width: 84 },
];

const REPORT_EXTRAS = ["Full recording", "Transcript", "Second AI check", "PDF or Excel export"];

/** Bina's mark: a monogram with a voice waveform, never a photo. */
function BinaAvatar() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to("[data-wave]", {
          scaleY: () => gsap.utils.random(0.35, 1),
          duration: 0.45,
          ease: "sine.inOut",
          stagger: { each: 0.07, repeat: -1, yoyo: true },
        });
      });
    },
    { scope: root }
  );

  return (
    <div ref={root} className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className={`${DISPLAY} relative grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--mkt-accent-solid),var(--mkt-cyan))] text-2xl font-extrabold text-white shadow-[0_18px_40px_-16px_rgba(7,156,196,0.8)] sm:h-20 sm:w-20 sm:text-3xl`}
      >
        B
        <span className="absolute -inset-1.5 rounded-full border border-white/15" />
      </span>
      <div className="min-w-0">
        <p className={`${DISPLAY} text-lg font-bold tracking-[-0.02em] text-white sm:text-xl`}>Bina</p>
        <p className="text-sm text-white/60">Your AI interviewer</p>
        <span aria-hidden="true" className="mt-2 flex h-5 items-center gap-[3px]">
          {[0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8, 0.55, 0.95, 0.45, 0.7, 0.5].map((h, i) => (
            <span
              key={i}
              data-wave
              className="block h-full w-[3px] origin-center rounded-full bg-mkt-cyan"
              style={{ transform: `scaleY(${h})` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

function ReportCard() {
  return (
    <figure className="rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-4 text-mkt-ink shadow-[0_40px_80px_-40px_rgba(0,0,0,0.6)] dark:border-white/10 sm:p-6">
      <figcaption className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">Krish Menon · Senior Java Developer</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">AI Interview report</span>
        </span>
        <span className="shrink-0 rounded-full bg-mkt-cyan/10 px-2 py-0.5 text-[11px] font-semibold text-mkt-cyan-ink">
          Sample
        </span>
      </figcaption>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 py-4 sm:gap-6">
        <p className="text-center">
          <span className={`${DISPLAY} block text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl`}>82</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">Overall / 100</span>
        </p>
        <ul className="space-y-2" aria-label="Skill scores">
          {SKILLS.map((s) => (
            <li key={s.label} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-3 text-xs">
              <span className="truncate text-slate-600 dark:text-slate-300">{s.label}</span>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <span className="block h-full rounded-full bg-mkt-cyan" style={{ width: `${s.width}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 text-sm dark:border-white/10 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Strengths</dt>
          <dd className="mt-0.5 text-slate-700 dark:text-slate-200">Clear service design, strong Java depth</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Concerns</dt>
          <dd className="mt-0.5 text-slate-700 dark:text-slate-200">Light on container tooling</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Recommendation</dt>
          <dd className="mt-0.5 font-semibold">Move to the next round</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Risk level</dt>
          <dd className="mt-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" /> Low
            </span>
          </dd>
        </div>
      </dl>

      <ul className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4 dark:border-white/10">
        {REPORT_EXTRAS.map((x) => (
          <li
            key={x}
            className="rounded-full bg-slate-900/[0.05] px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/[0.07] dark:text-slate-300"
          >
            {x}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function BinaSection() {
  const signedIn = useSignedIn();
  return (
    <section id="ai-interviews" aria-labelledby="bina-heading" className={SECTION}>
      <div className={SHELL}>
        <RevealGroup y={40}>
          <div
            data-reveal
            className="relative overflow-hidden rounded-[20px] bg-mkt-navy p-5 text-white dark:border dark:border-white/10 dark:bg-mkt-navy-surface sm:p-10 lg:p-14"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.25),transparent)] sm:h-[34rem] sm:w-[34rem]"
            />
            <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-16">
              <div>
                <p className="text-sm font-semibold text-mkt-cyan">AI Interviews</p>
                <RevealHeading
                  id="bina-heading"
                  text="Meet Bina, your AI interviewer. Ready 24/7."
                  className={`${DISPLAY} mt-2 text-[clamp(1.6rem,4.2vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.035em] text-balance`}
                />
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/70 sm:mt-5 sm:text-lg">
                  Bina interviews candidates by voice, asks follow-up questions and gives you a complete
                  report. No scheduling. No interviewer fatigue.
                </p>
                <ul className="mt-7 space-y-3.5 sm:mt-9">
                  {POINTS.map((p) => (
                    <li key={p.title} className="flex gap-3 text-sm leading-relaxed text-white/70 sm:text-[15px]">
                      <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-mkt-cyan" />
                      <span>
                        <span className="font-semibold text-white">{p.title}</span> {p.text}
                      </span>
                    </li>
                  ))}
                </ul>
                <blockquote
                  className={`${DISPLAY} mt-8 border-l-2 border-mkt-amber pl-4 text-lg font-semibold leading-snug tracking-[-0.015em] text-white sm:text-xl`}
                >
                  Every candidate gets the same fair, structured interview, every single time.
                </blockquote>
                <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
                  <Cta href={signedIn ? DASHBOARD_HREF : "/signup"} variant="light">
                    Try an AI Interview
                  </Cta>
                  <Cta href="/demo" variant="outlineLight" arrow={null}>
                    Book a demo
                  </Cta>
                </div>
              </div>

              <div className="space-y-6">
                <BinaAvatar />
                <ReportCard />
                <div>
                  <p className="text-sm font-semibold text-white">Strong integrity checks</p>
                  <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {INTEGRITY.map((item) => (
                      <li key={item} className="flex gap-2.5 rounded-2xl bg-white/[0.06] px-3.5 py-3 text-sm leading-snug text-white/80">
                        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-mkt-cyan" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </RevealGroup>
      </div>
    </section>
  );
}
