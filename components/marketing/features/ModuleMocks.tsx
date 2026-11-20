import {
  Camera,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Folder,
  History,
  Maximize,
  MonitorCheck,
  MousePointerClick,
  Play,
  ScanFace,
  ScanSearch,
  Search,
  Send,
  UploadCloud,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { DISPLAY } from "../fonts";

/*
 * Lightweight, illustrative product mocks for the features page. Plain JSX and
 * Tailwind only. Every mock is decorative (aria-hidden): the copy beside it
 * states the same facts in text, and the sample data is clearly generic.
 */

export const LABEL = "text-2xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400";
const CHIP = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium";
const NEUTRAL = "bg-slate-900/[0.05] text-slate-700 dark:bg-white/[0.07] dark:text-slate-200";
const OUTLINE = "rounded-full border border-slate-900/10 px-2.5 py-1 text-2xs font-medium text-slate-600 dark:border-white/15 dark:text-slate-300";
const TONE = {
  good: "bg-mkt-cyan/12 text-mkt-cyan-ink",
  mid: "bg-mkt-accent-solid/10 text-mkt-accent dark:bg-white/10",
  warn: "bg-mkt-amber/12 text-mkt-amber-ink",
  bad: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
} as const;

/** Shared frame: card, window header and the "Sample" tag. */
export function MockFrame({
  title,
  icon,
  onSurface = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  /** The band behind is `bg-mkt-surface`: use the canvas colour so the card still reads. */
  onSurface?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={`relative w-full min-w-0 overflow-hidden rounded-[20px] border border-slate-900/[0.08] shadow-[0_30px_60px_-36px_rgba(15,60,153,0.35)] dark:border-white/10 dark:shadow-[0_30px_60px_-36px_rgba(0,0,0,0.6)] ${
        onSurface ? "bg-mkt-canvas" : "bg-mkt-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-900/[0.07] px-4 py-3 dark:border-white/[0.08] sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 gap-1">
            <span className="h-2 w-2 rounded-full bg-slate-900/15 dark:bg-white/15" />
            <span className="h-2 w-2 rounded-full bg-slate-900/15 dark:bg-white/15" />
            <span className="h-2 w-2 rounded-full bg-slate-900/15 dark:bg-white/15" />
          </span>
          <span className="ml-1 flex min-w-0 items-center gap-1.5 truncate text-xs font-semibold text-mkt-ink">
            {icon}
            <span className="truncate">{title}</span>
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-slate-900/10 px-2 py-0.5 text-2xs font-medium text-slate-500 dark:border-white/15 dark:text-slate-400">
          Sample
        </span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Job Descriptions
 * ------------------------------------------------------------------ */

const JD_FIELDS = [
  ["Experience", "5–8 years"],
  ["Education", "B.Tech or equal"],
  ["Industry", "Fintech"],
  ["Location", "Bengaluru"],
  ["Work mode", "Hybrid"],
  ["Employment", "Full-time"],
];

export function JdMock({ onSurface }: { onSurface?: boolean }) {
  return (
    <MockFrame title="Job description" icon={<FileText className="h-3.5 w-3.5 text-mkt-accent" />} onSurface={onSurface}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-mkt-ink">Senior Backend Developer</p>
        <span className="flex shrink-0 rounded-full bg-slate-900/[0.05] p-0.5 text-2xs font-semibold dark:bg-white/[0.07]">
          <span className="rounded-full px-2.5 py-1 text-slate-500 dark:text-slate-400">Draft</span>
          <span className="rounded-full bg-mkt-accent-solid px-2.5 py-1 text-white">Published</span>
        </span>
      </div>

      <p className={`${LABEL} mt-4`}>Must-have skills</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["Java", "Spring Boot", "Microservices", "SQL"].map((skill) => (
          <span key={skill} className={`${CHIP} ${TONE.good}`}>
            <Check className="h-3 w-3" />
            {skill}
          </span>
        ))}
      </div>
      <p className={`${LABEL} mt-3.5`}>Nice-to-have skills</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["Kafka", "AWS", "Docker"].map((skill) => (
          <span key={skill} className={`${CHIP} ${NEUTRAL}`}>
            {skill}
          </span>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {JD_FIELDS.map(([term, value]) => (
          <div key={term} className="min-w-0 rounded-xl border border-slate-900/[0.07] px-3 py-2 dark:border-white/[0.08]">
            <dt className="text-2xs text-slate-500 dark:text-slate-400">{term}</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold text-mkt-ink">{value}</dd>
          </div>
        ))}
        <div className="col-span-2 min-w-0 rounded-xl border border-slate-900/[0.07] px-3 py-2 dark:border-white/[0.08] sm:col-span-3">
          <dt className="text-2xs text-slate-500 dark:text-slate-400">Salary</dt>
          <dd className="mt-0.5 truncate text-sm font-semibold text-mkt-ink">₹18–24 LPA</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/[0.07] pt-4 dark:border-white/[0.08]">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <History className="h-3.5 w-3.5 text-mkt-accent" />
          <span className="font-semibold text-mkt-ink">v3</span> current · v2 · v1
          <span className="font-semibold text-mkt-accent">Compare</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {["PDF", "Word", "Text"].map((format) => (
            <span key={format} className={`${OUTLINE} inline-flex items-center gap-1`}>
              <Download className="h-2.5 w-2.5" />
              {format}
            </span>
          ))}
        </span>
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ *
 * Resume Database
 * ------------------------------------------------------------------ */

export function ResumeDbMock({ onSurface }: { onSurface?: boolean }) {
  return (
    <MockFrame title="Resume Database" icon={<FileText className="h-3.5 w-3.5 text-mkt-accent" />} onSurface={onSurface}>
      <div className="rounded-xl border border-dashed border-mkt-accent/35 bg-mkt-accent-solid/[0.03] p-3 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-mkt-ink">
            <UploadCloud className="h-4 w-4 shrink-0 text-mkt-accent" />
            <span className="truncate">Bulk upload</span>
          </span>
          <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">64 / 100 files</span>
        </div>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-900/[0.06] dark:bg-white/10">
          <span className="block h-full w-[64%] rounded-full bg-mkt-cyan" />
        </span>
        <span className="mt-2 flex flex-wrap gap-1">
          {["PDF", "DOC", "DOCX", "RTF", "TXT"].map((type) => (
            <span key={type} className="rounded bg-slate-900/[0.05] px-1.5 py-0.5 text-2xs font-semibold text-slate-600 dark:bg-white/[0.07] dark:text-slate-300">
              {type}
            </span>
          ))}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-[8.5rem_minmax(0,1fr)]">
        <ul className="flex flex-wrap gap-1.5 min-[420px]:flex-col min-[420px]:gap-1">
          {[
            ["All resumes", true],
            ["Backend", false],
            ["Campus 2026", false],
            ["Archive", false],
          ].map(([name, active]) => (
            <li
              key={name as string}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${
                active ? "bg-mkt-accent-solid/[0.08] font-semibold text-mkt-ink dark:bg-white/[0.07]" : "text-slate-600 dark:text-slate-400"
              }`}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{name as string}</span>
            </li>
          ))}
        </ul>

        <div className="min-w-0">
          <div className="flex items-center gap-2 rounded-lg border border-slate-900/[0.08] px-2.5 py-1.5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Name, skill, job title, location…</span>
          </div>
          <div className="mt-2.5 rounded-xl border border-slate-900/[0.07] p-3 dark:border-white/[0.08]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-mkt-ink">Candidate A</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${TONE.mid}`}>Auto-parsed</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
              {[
                ["Experience", "6 years"],
                ["Notice period", "30 days"],
                ["Education", "B.E."],
                ["Links", "GitHub"],
              ].map(([term, value]) => (
                <div key={term} className="min-w-0">
                  <dt className="text-slate-500 dark:text-slate-400">{term}</dt>
                  <dd className="truncate font-semibold text-mkt-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex flex-wrap gap-1">
              {["Java", "Spring Boot", "SQL"].map((skill) => (
                <span key={skill} className={`rounded-full px-2 py-0.5 text-2xs font-medium ${NEUTRAL}`}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-mkt-amber/30 bg-mkt-amber/[0.06] px-3 py-2">
            <Copy className="h-3.5 w-3.5 shrink-0 text-mkt-amber-ink" />
            <span className="min-w-0 text-2xs leading-snug text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-mkt-amber-ink">Duplicate found.</span> Already stored, new version
              tracked.
            </span>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ *
 * AI Talent Match
 * ------------------------------------------------------------------ */

const FIT = {
  Excellent: TONE.good,
  Good: TONE.mid,
  Moderate: TONE.warn,
  Low: TONE.bad,
} as const;

const MATCHES: { name: string; score: number; fit: keyof typeof FIT; state?: "shortlisted" | "rejected" }[] = [
  { name: "Candidate A", score: 9, fit: "Excellent", state: "shortlisted" },
  { name: "Candidate B", score: 8, fit: "Good", state: "shortlisted" },
  { name: "Candidate C", score: 6, fit: "Moderate" },
  { name: "Candidate D", score: 3, fit: "Low", state: "rejected" },
];

export function TalentMatchMock({ onSurface }: { onSurface?: boolean }) {
  return (
    <MockFrame
      title="AI Talent Match · Senior Backend Developer"
      icon={<ScanSearch className="h-3.5 w-3.5 text-mkt-accent" />}
      onSurface={onSurface}
    >
      <ol className="space-y-2">
        {MATCHES.map((row, i) => (
          <li
            key={row.name}
            className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2.5 ${
              row.state === "shortlisted"
                ? "border-mkt-cyan/35 bg-mkt-cyan/[0.05]"
                : "border-slate-900/[0.07] dark:border-white/[0.08]"
            } ${row.state === "rejected" ? "opacity-60" : ""}`}
          >
            <span className="text-xs font-semibold tabular-nums text-slate-400">{i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-mkt-ink">{row.name}</span>
              <span className="mt-1 flex gap-0.5">
                {Array.from({ length: 10 }, (_, d) => (
                  <span
                    key={d}
                    className={`h-1.5 flex-1 rounded-full ${
                      d < row.score ? "bg-mkt-cyan" : "bg-slate-900/[0.07] dark:bg-white/10"
                    }`}
                  />
                ))}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums text-mkt-ink">
                {row.score}
                <span className="text-2xs font-medium text-slate-400">/10</span>
              </span>
              <span className={`hidden rounded-full px-2 py-0.5 text-2xs font-semibold min-[400px]:inline ${FIT[row.fit]}`}>
                {row.fit}
              </span>
              <span className="flex gap-1">
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full ${
                    row.state === "shortlisted" ? "bg-mkt-cyan text-white" : "border border-slate-900/10 text-slate-400 dark:border-white/15"
                  }`}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full ${
                    row.state === "rejected" ? "bg-rose-500 text-white" : "border border-slate-900/10 text-slate-400 dark:border-white/15"
                  }`}
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                </span>
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/[0.07] pt-4 dark:border-white/[0.08]">
        <span className="text-xs text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-mkt-ink">2</span> shortlisted
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mkt-ink px-3 py-1.5 text-xs font-semibold text-mkt-canvas">
          Send to Scoring
          <Send className="h-3 w-3" />
        </span>
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ *
 * Resume Scoring
 * ------------------------------------------------------------------ */

const VERDICT = {
  "Exact Match": TONE.good,
  "Partial Match": TONE.warn,
  "No Match": TONE.bad,
} as const;

const CRITERIA: { name: string; verdict: keyof typeof VERDICT; reason: string }[] = [
  { name: "Job title", verdict: "Exact Match", reason: "Backend Developer for 4 years" },
  { name: "Experience", verdict: "Exact Match", reason: "6 years, within the 5–8 range" },
  { name: "Must-have skills", verdict: "Partial Match", reason: "3 of 4 found, Microservices missing" },
  { name: "Industry", verdict: "Exact Match", reason: "Two fintech roles" },
  { name: "Location", verdict: "No Match", reason: "Based in Pune, not Bengaluru" },
  { name: "Job stability", verdict: "Exact Match", reason: "Average tenure over 2 years" },
];

export function ScoringMock({ onSurface }: { onSurface?: boolean }) {
  return (
    <MockFrame title="Resume Scoring · Candidate A" onSurface={onSurface}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className={LABEL}>Overall score</span>
          <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">Senior Backend Developer</span>
        </span>
        <span className={`${DISPLAY} text-3xl font-bold tabular-nums tracking-[-0.03em] text-mkt-ink`}>84</span>
      </div>
      <ul className="mt-4 divide-y divide-slate-900/[0.06] dark:divide-white/[0.07]">
        {CRITERIA.map((row) => (
          <li key={row.name} className="flex items-start justify-between gap-3 py-2 first:pt-0">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-mkt-ink">{row.name}</span>
              <span className="block truncate text-2xs text-slate-500 dark:text-slate-400">{row.reason}</span>
            </span>
            <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${VERDICT[row.verdict]}`}>
              {row.verdict}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-slate-900/[0.04] p-3 text-2xs leading-relaxed dark:bg-white/[0.05] min-[420px]:grid-cols-2">
        <p className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-mkt-cyan-ink">Strengths:</span> strong Java and SQL, fintech projects.
        </p>
        <p className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-mkt-amber-ink">Gaps:</span> no microservices work listed.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap gap-1.5">
          {["Excel", "CSV", "PDF"].map((format) => (
            <span key={format} className={OUTLINE}>
              {format}
            </span>
          ))}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mkt-ink px-3 py-1.5 text-xs font-semibold text-mkt-canvas">
          Invite to assessment
          <Send className="h-3 w-3" />
        </span>
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ *
 * AI Assessments
 * ------------------------------------------------------------------ */

const PROCTORING = [
  { icon: ScanFace, label: "Identity" },
  { icon: MonitorCheck, label: "System" },
  { icon: Maximize, label: "Full-screen" },
  { icon: MousePointerClick, label: "Tab & paste" },
  { icon: Camera, label: "Camera & screen" },
];

const FUNNEL = [
  ["Sent", 100],
  ["Opened", 82],
  ["Started", 64],
  ["Completed", 58],
] as const;

export function AssessmentMock({ onSurface }: { onSurface?: boolean }) {
  return (
    <MockFrame title="AI Assessment · Senior Backend Developer" onSurface={onSurface}>
      <div className="flex rounded-full bg-slate-900/[0.05] p-0.5 text-xs font-semibold dark:bg-white/[0.07]">
        {["Technical", "Coding", "HR"].map((round) => (
          <span
            key={round}
            className={`flex-1 rounded-full py-1.5 text-center ${
              round === "Coding" ? "bg-mkt-accent-solid text-white" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {round}
          </span>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-900/[0.08] bg-[var(--raw-0b1530)] dark:border-white/10">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-2xs font-semibold text-white">
            Python
            <ChevronDown className="h-2.5 w-2.5" />
            <span className="font-normal text-white/55">· 13 languages</span>
          </span>
          <span className="flex gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-2xs font-semibold text-white">
              <Play className="h-2.5 w-2.5" />
              Run
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-mkt-cyan px-2 py-0.5 text-2xs font-semibold text-[var(--raw-08132e)]">
              <Send className="h-2.5 w-2.5" />
              Submit
            </span>
          </span>
        </div>
        <pre className="overflow-hidden px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-300">
          <span className="text-[var(--raw-7ba4ff)]">def</span> top_k(nums, k):
          {"\n"}    <span className="text-[var(--raw-7ba4ff)]">return</span> sorted(nums)[-k:]
        </pre>
      </div>

      <p className={`${LABEL} mt-4`}>Proctoring</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {PROCTORING.map(({ icon: Icon, label }) => (
          <li key={label} className={`${CHIP} ${TONE.good} py-0.5 text-2xs`}>
            <Icon className="h-3 w-3" />
            {label}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-900/[0.07] pt-4 dark:border-white/[0.08] min-[420px]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className={LABEL}>Invites</p>
          <ul className="mt-2 space-y-1.5">
            {FUNNEL.map(([stage, value]) => (
              <li key={stage} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-2xs">
                <span className="text-slate-600 dark:text-slate-300">{stage}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-slate-900/[0.06] dark:bg-white/10">
                  <span className="block h-full rounded-full bg-mkt-accent-solid" style={{ width: `${value}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className={LABEL}>Recommendation</p>
          <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${TONE.good}`}>Strong Yes</span>
          <span className="mt-1.5 block text-2xs text-slate-500 dark:text-slate-400">Strong Yes → Strong No</span>
        </div>
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ *
 * HR Question Bank
 * ------------------------------------------------------------------ */

const HR_QUESTIONS: { q: string; type: "Text" | "Yes/No" }[] = [
  { q: "Why are you looking for a change right now?", type: "Text" },
  { q: "Are you open to working from our office three days a week?", type: "Yes/No" },
  { q: "Tell us about a time you handled a difficult teammate.", type: "Text" },
  { q: "Can you join within 30 days?", type: "Yes/No" },
];

export function QuestionBankMock({ onSurface }: { onSurface?: boolean }) {
  return (
    <MockFrame title="HR Question Bank" onSurface={onSurface}>
      <ul className="space-y-2">
        {HR_QUESTIONS.map(({ q, type }) => (
          <li
            key={q}
            className="flex items-start justify-between gap-3 rounded-xl border border-slate-900/[0.07] px-3 py-2.5 dark:border-white/[0.08]"
          >
            <span className="min-w-0 text-sm leading-snug text-mkt-ink">{q}</span>
            <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${type === "Text" ? TONE.mid : TONE.warn}`}>
              {type}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-900/[0.07] pt-4 text-2xs dark:border-white/[0.08]">
        <span className="text-slate-500 dark:text-slate-400">Used in</span>
        {["AI Assessments", "AI Interviews"].map((module) => (
          <span key={module} className={`${CHIP} ${TONE.good} py-0.5 text-2xs`}>
            <Check className="h-3 w-3" />
            {module}
          </span>
        ))}
      </div>
    </MockFrame>
  );
}
