"use client";

import {
  AudioLines,
  Download,
  Fingerprint,
  MonitorX,
  ScanFace,
  ShieldCheck,
  Smartphone,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { DISPLAY } from "../fonts";
import { H2, LEAD, SECTION, SHELL } from "../layout";
import { RevealGroup, RevealHeading } from "../motion";
import { LABEL, MockFrame } from "./ModuleMocks";
import { Eyebrow, ModuleCta, PointList, type Point } from "./ModuleSection";

const POINTS: Point[] = [
  { title: "A real conversation.", body: "Bina speaks, listens and follows up like a human interviewer." },
  {
    title: "Built from your JD.",
    body: "AI plans the interview around the role's must-have skills, nice-to-have skills and HR questions.",
  },
  {
    title: "Two styles.",
    body: "Timed mode (structured, 30 min) or Conversational mode (adapts to the candidate).",
  },
  {
    title: "Candidates interview anytime.",
    body: "They get a link, practise with Bina first, then start whenever it suits them.",
  },
  { title: "Full recording", body: "with a complete transcript." },
  { title: "Double-checked results.", body: "A second AI checks every evaluation against the transcript." },
  { title: "Export", body: "to PDF or Excel." },
];

const INTEGRITY: { icon: LucideIcon; text: string }[] = [
  { icon: ScanFace, text: "Face verification and voice identity checks." },
  { icon: UsersRound, text: "Detection of a second person or a phone in view." },
  { icon: MonitorX, text: "Tab, full-screen and screen-recording monitoring." },
  { icon: Smartphone, text: "Room scan from the candidate's phone." },
];

const RISK = [
  { level: "Low", tone: "bg-mkt-cyan/12 text-mkt-cyan-ink" },
  { level: "Medium", tone: "bg-mkt-amber/12 text-mkt-amber-ink" },
  { level: "High", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
];

/** Waveform bar heights (percent), drawn left to right. */
const WAVE = [30, 55, 80, 45, 95, 60, 35, 70, 100, 50, 75, 40, 85, 55, 30, 65, 45, 25];

/** Bina mid-interview: an abstract monogram avatar, never a photo. */
function BinaMock() {
  return (
    <MockFrame title="AI Interview · Senior Backend Developer" icon={<AudioLines className="h-3.5 w-3.5 text-mkt-accent" />} onSurface>
      <div className="flex flex-col items-center rounded-2xl bg-[radial-gradient(120%_90%_at_50%_0%,var(--raw-rgba-7-156-196-0p12),transparent)] px-3 pb-4 pt-6 text-center">
        <span className="relative grid h-24 w-24 place-items-center sm:h-28 sm:w-28">
          <span className="absolute inset-0 rounded-full border border-mkt-cyan/25 motion-safe:animate-pulse" />
          <span className="absolute inset-2.5 rounded-full border border-mkt-accent/25" />
          <span
            className={`${DISPLAY} relative grid h-16 w-16 place-items-center rounded-full bg-[linear-gradient(140deg,var(--mkt-cyan),var(--mkt-accent-solid))] text-2xl font-extrabold text-white shadow-[0_16px_32px_-14px_rgba(15,60,153,0.7)] sm:h-20 sm:w-20 sm:text-3xl`}
          >
            B
          </span>
        </span>
        <p className={`${DISPLAY} mt-3 text-base font-bold text-mkt-ink`}>Bina</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">AI interviewer · speaking</p>
        <div className="mt-3 flex h-8 w-full max-w-[240px] items-center justify-center gap-[3px]">
          {WAVE.map((h, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-mkt-accent-solid/70 motion-safe:animate-pulse"
              style={{ height: `${h}%`, animationDelay: `${(i % 6) * 120}ms` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-slate-900/[0.04] px-3 py-2.5 text-xs leading-relaxed text-slate-700 dark:bg-white/[0.05] dark:text-slate-300">
        <span className="font-semibold text-mkt-ink">Follow-up:</span> You mentioned Kafka. How did you keep messages
        in order across services?
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="flex rounded-full bg-slate-900/[0.05] p-0.5 text-2xs font-semibold dark:bg-white/[0.07]">
          <span className="rounded-full bg-mkt-accent-solid px-2.5 py-1 text-white">Timed · 30 min</span>
          <span className="rounded-full px-2.5 py-1 text-slate-500 dark:text-slate-400">Conversational</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-slate-500 dark:text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          Recording · transcript on
        </span>
      </div>
    </MockFrame>
  );
}

const SKILLS = [
  ["Java", 88],
  ["Spring Boot", 80],
  ["Microservices", 62],
  ["Communication", 84],
] as const;

/** The report a hiring manager gets after the interview. */
function ReportMock() {
  const overall = 81;
  return (
    <MockFrame title="Interview report · Candidate A" onSurface>
      <div className="flex items-center gap-4">
        <span
          className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--mkt-cyan) ${overall * 3.6}deg, color-mix(in srgb, var(--mkt-ink) 8%, transparent) 0deg)`,
          }}
        >
          <span className="grid h-[66px] w-[66px] place-items-center rounded-full bg-mkt-canvas">
            <span className="text-center leading-none">
              <span className={`${DISPLAY} block text-2xl font-bold tabular-nums text-mkt-ink`}>{overall}</span>
              <span className="text-2xs text-slate-500 dark:text-slate-400">/ 100</span>
            </span>
          </span>
        </span>
        <span className="min-w-0">
          <span className={LABEL}>Overall score</span>
          <span className="mt-1 block text-sm font-semibold text-mkt-ink">Recommended for the next round</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-mkt-cyan/12 px-2 py-0.5 text-2xs font-semibold text-mkt-cyan-ink">
              Risk: Low
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-mkt-accent-solid/10 px-2 py-0.5 text-2xs font-semibold text-mkt-accent dark:bg-white/10">
              <ShieldCheck className="h-3 w-3" />
              Double-checked by a second AI
            </span>
          </span>
        </span>
      </div>

      <p className={`${LABEL} mt-5`}>Skill by skill</p>
      <ul className="mt-2.5 space-y-2">
        {SKILLS.map(([skill, value]) => (
          <li key={skill} className="grid grid-cols-[minmax(0,6.5rem)_1fr_2rem] items-center gap-3">
            <span className="truncate text-sm text-mkt-ink">{skill}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-slate-900/[0.06] dark:bg-white/10">
              <span className="block h-full rounded-full bg-mkt-accent-solid" style={{ width: `${value}%` }} />
            </span>
            <span className="text-right text-xs font-semibold tabular-nums text-mkt-ink">{value}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-xl border border-slate-900/[0.07] p-3 text-2xs leading-relaxed dark:border-white/[0.08]">
        <p className="flex items-center justify-between gap-2">
          <span className="font-semibold text-mkt-ink">Q4 · Message ordering in Kafka</span>
          <span className="font-semibold tabular-nums text-mkt-cyan-ink">8 / 10</span>
        </p>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Reason: explained partition keys clearly with a real example; missed consumer retries.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 text-2xs min-[420px]:grid-cols-2">
        <p className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-mkt-cyan-ink">Strengths:</span> clear system design thinking.
        </p>
        <p className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-mkt-amber-ink">Concerns:</span> limited hands-on cloud work.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-900/[0.07] pt-4 dark:border-white/[0.08]">
        {["PDF", "Excel"].map((format) => (
          <span
            key={format}
            className="inline-flex items-center gap-1 rounded-full border border-slate-900/10 px-2.5 py-1 text-2xs font-medium text-slate-600 dark:border-white/15 dark:text-slate-300"
          >
            <Download className="h-2.5 w-2.5" />
            Export {format}
          </span>
        ))}
      </div>
    </MockFrame>
  );
}

/**
 * AI Interviews, the hero feature: the biggest block on the page, with Bina,
 * the integrity checks and a sample report card.
 */
export function InterviewSection() {
  return (
    <section
      id="ai-interviews"
      aria-labelledby="ai-interviews-title"
      className={`${SECTION} relative overflow-hidden border-t border-slate-900/[0.07] bg-mkt-surface dark:border-white/[0.08]`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,var(--raw-rgba-7-156-196-0p1),transparent)]"
      />
      <div className={`${SHELL} relative`}>
        <div className="max-w-3xl">
          <Eyebrow icon={AudioLines}>AI Interviews</Eyebrow>
          <RevealHeading
            id="ai-interviews-title"
            text="Meet Bina, your AI interviewer. Ready 24/7."
            className={`${H2} mt-4 sm:mt-5`}
          />
          <RevealGroup>
            <p data-reveal className={`${LEAD} max-w-2xl`}>
              Bina interviews candidates by voice, asks follow-up questions and gives you a complete report. No
              scheduling. No interviewer fatigue.
            </p>
          </RevealGroup>
        </div>

        <div className="mt-8 grid grid-cols-1 items-center gap-8 sm:mt-14 sm:gap-12 lg:grid-cols-2 lg:gap-16">
          <RevealGroup stagger={0.06} className="min-w-0">
            <PointList points={POINTS} />
          </RevealGroup>
          <RevealGroup y={40} className="min-w-0">
            <div data-reveal className="mx-auto w-full max-w-[520px]">
              <BinaMock />
            </div>
          </RevealGroup>
        </div>

        <div className="mt-10 grid grid-cols-1 items-start gap-8 sm:mt-16 sm:gap-12 lg:grid-cols-2 lg:gap-16">
          <RevealGroup y={40} className="min-w-0 lg:order-2">
            <div data-reveal className="mx-auto w-full max-w-[520px]">
              <ReportMock />
            </div>
          </RevealGroup>

          <RevealGroup stagger={0.08} className="min-w-0 lg:order-1">
            <div
              data-reveal
              className="rounded-[20px] border border-slate-900/[0.08] bg-mkt-canvas p-5 dark:border-white/10 sm:p-7"
            >
              <h3 className={`${DISPLAY} flex items-center gap-2.5 text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:text-xl`}>
                <Fingerprint className="h-5 w-5 text-mkt-accent" />
                Strong integrity checks
              </h3>
              <ul className="mt-5 space-y-3">
                {INTEGRITY.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex gap-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                    <Icon className="mt-1 h-4 w-4 shrink-0 text-mkt-accent" />
                    {text}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-900/[0.07] pt-5 dark:border-white/[0.08]">
                <span className="text-sm text-slate-600 dark:text-slate-400">Clear risk levels:</span>
                {RISK.map(({ level, tone }) => (
                  <span key={level} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
                    {level}
                  </span>
                ))}
              </div>
            </div>

            <figure data-reveal className="mt-8 border-l-2 border-mkt-cyan pl-5">
              <blockquote className={`${DISPLAY} text-xl font-semibold leading-snug tracking-[-0.02em] text-mkt-ink sm:text-2xl`}>
                &ldquo;Every candidate gets the same fair, structured interview, every single time.&rdquo;
              </blockquote>
            </figure>

            <div data-reveal className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              <ModuleCta label="Try an AI Interview" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Units: each AI interview uses 1 unit.</p>
            </div>
          </RevealGroup>
        </div>
      </div>
    </section>
  );
}
