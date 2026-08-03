"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Play,
  Shield,
  CheckCircle2,
  Star,
  Video,
  X,
  Upload,
  Search,
  Send,
  Users,
} from "lucide-react";
import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { displayFont, dataFont } from "./fonts";
import { FeatureShowcase } from "./FeatureShowcase";
import { PlanCard } from "./PlanCard";
import { fetchMarketingPlans, type MarketingPlan } from "./plans";

const TRIAL_LINK =`https://${process.env.NEXT_PUBLIC_BASE_DOMAIN}/signup?plan=free_trial`;

/* ------------------------------------------------------------------ *
 * Motion helpers
 * ------------------------------------------------------------------ */

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false
  );
}

/** Fires once when the element first scrolls into view. */
function useInView<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, inView };
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(!reduced);
  const shown = reduced || inView;

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-[opacity,transform] duration-700 ease-out ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Counts to `target` once `active` turns true. */
function useCountUp(target: number, active: boolean, delay = 0) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduced || !active) return;
    let frame = 0;
    let startTime = 0;
    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        if (!startTime) startTime = now;
        const progress = Math.min(1, (now - startTime) / 900);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(target * eased));
        if (progress < 1) frame = window.requestAnimationFrame(step);
      };
      frame = window.requestAnimationFrame(step);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [target, active, delay, reduced]);

  return reduced ? target : value;
}

/* ------------------------------------------------------------------ *
 * Shared section furniture
 * ------------------------------------------------------------------ */

/** One measure for every section: gutters grow with the viewport, and the
 *  column widens past 1200px only on genuinely large displays. */
const SHELL =
  "container mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 xl:max-w-[1320px] 2xl:max-w-[1480px]";

/** Vertical rhythm, shared so sections can't drift apart. */
const SECTION_Y = "py-16 sm:py-24 2xl:py-32";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-data text-[11px] sm:text-xs uppercase tracking-[0.22em] text-[#0F3C99] dark:text-[#7BA4FF]">
      {children}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "text-center max-w-2xl 2xl:max-w-3xl mx-auto" : "max-w-2xl 2xl:max-w-3xl"}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-display mt-3 text-3xl sm:text-4xl md:text-5xl 2xl:text-6xl font-bold tracking-[-0.03em] text-[#08132E] dark:text-white text-balance">
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-base sm:text-lg 2xl:text-xl text-slate-600 dark:text-slate-400 leading-relaxed">
          {lead}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Hero signature — the screening lane
 * ------------------------------------------------------------------ */

const SHORTLIST = [
  { initials: "AR", name: "Ananya Rao", role: "Senior React Engineer · 8 yrs", score: 94 },
  { initials: "KM", name: "Krish Menon", role: "Frontend Lead · 7 yrs", score: 91 },
  { initials: "DS", name: "Diego Santos", role: "Full-stack Engineer · 6 yrs", score: 87 },
  { initials: "LW", name: "Lena Weber", role: "React Native Engineer · 5 yrs", score: 82 },
  { initials: "TN", name: "Tomas Nowak", role: "UI Engineer · 4 yrs", score: 78 },
];

function ShortlistRow({
  candidate,
  index,
  active,
}: {
  candidate: (typeof SHORTLIST)[number];
  index: number;
  active: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const score = useCountUp(candidate.score, active, 280 + index * 110);
  const top = index === 0;

  return (
    <li
      style={{ transitionDelay: `${index * 110}ms` }}
      className={`flex items-center gap-3 sm:gap-4 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 transition-[opacity,transform] duration-500 ease-out ${
        active || reduced ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
      } ${
        top
          ? "bg-[#ED881C]/10 ring-1 ring-[#ED881C]/30 dark:bg-[#ED881C]/[0.14]"
          : "bg-slate-50/80 dark:bg-white/[0.04]"
      }`}
    >
      <span className="font-data text-xs tabular-nums text-slate-400 dark:text-slate-500 w-5">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span
        className={`grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-full text-xs font-semibold ${
          top
            ? "bg-[#ED881C] text-white"
            : "bg-[#0F3C99]/10 text-[#0F3C99] dark:bg-white/10 dark:text-slate-200"
        }`}
      >
        {candidate.initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[#08132E] dark:text-white">
          {candidate.name}
        </span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
          {candidate.role}
        </span>
      </span>
      <span className="flex items-center gap-2 sm:gap-3">
        <span
          aria-hidden="true"
          className="hidden sm:block h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
        >
          <span
            className={`block h-full rounded-full transition-[width] duration-700 ease-out ${
              top ? "bg-[#ED881C]" : "bg-[#079CC4]"
            }`}
            style={{ width: `${active || reduced ? candidate.score : 0}%` }}
          />
        </span>
        <span
          className={`font-data text-sm sm:text-base font-medium tabular-nums ${
            top ? "text-[#B45B0C] dark:text-[#F0A44E]" : "text-[#08132E] dark:text-white"
          }`}
        >
          {score}
          <span className="text-[0.7em] text-slate-400 dark:text-slate-500">%</span>
        </span>
      </span>
    </li>
  );
}

function ScreeningPanel() {
  const reduced = usePrefersReducedMotion();
  const [started, setStarted] = useState(false);
  const active = reduced || started;
  const screened = useCountUp(1284, active, 120);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => setStarted(true), 260);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-3 sm:-inset-4 rounded-[28px] bg-gradient-to-br from-[#0F3C99]/10 via-[#079CC4]/10 to-transparent blur-xl"
      />
      <div className="relative rounded-2xl border border-slate-200/80 bg-white/95 p-4 sm:p-5 shadow-[0_24px_60px_-24px_rgba(8,19,46,0.35)] backdrop-blur dark:border-white/10 dark:bg-[#0C1732]/95">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
          <span className="font-data text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Screening · Senior React Engineer
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-[#079CC4]/10 px-2 py-1 font-data text-[10px] font-medium uppercase tracking-wider text-[#0A7A99] dark:text-[#5CC8E6]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#079CC4] motion-safe:animate-pulse" />
            Live
          </span>
        </div>

        <ul className="mt-3 space-y-1.5 sm:space-y-2">
          {SHORTLIST.map((candidate, index) => (
            <ShortlistRow
              key={candidate.name}
              candidate={candidate}
              index={index}
              active={active}
            />
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 font-data text-[11px] sm:text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
          <span className="tabular-nums">
            {screened.toLocaleString()} resumes screened
          </span>
          <span className="tabular-nums text-[#08132E] dark:text-white">
            12 shortlisted · 3m 40s
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Static content
 * ------------------------------------------------------------------ */

const STATS = [
  { value: "2,500+", label: "Active customers" },
  { value: "5M+", label: "Resumes processed" },
  { value: "40%", label: "Faster hiring" },
  { value: "98%", label: "Satisfaction" },
];

const STEPS = [
  {
    title: "Create your account",
    description: "Sign up in under two minutes. No credit card required.",
  },
  {
    title: "Post your jobs",
    description: "Add a job description and the AI parses the requirements for you.",
  },
  {
    title: "Start hiring",
    description: "Ranked candidates arrive with scores. Schedule interviews the same day.",
  },
];

const ABOUT_FIGURES = [
  { value: "2020", label: "Founded" },
  { value: "50+", label: "Countries" },
  { value: "100+", label: "Team members" },
  { value: "5M+", label: "Resumes a year" },
];


/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export function LandingPageContent() {
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [trialDays, setTrialDays] = useState<number>(14);
  const [plans, setPlans] = useState<MarketingPlan[]>([]);
  const [plansFailed, setPlansFailed] = useState(false);
  // Annual is the pricing page default, so the landing page opens the same way.
  const [isYearly, setIsYearly] = useState(true);
  const reducedMotion = usePrefersReducedMotion();

  // Menu items on this route are anchors, so the page itself owns the scrolling
  // behaviour — but never animate it for people who asked for less motion.
  useEffect(() => {
    if (reducedMotion) return;
    const root = document.documentElement;
    root.classList.add("scroll-smooth");
    return () => root.classList.remove("scroll-smooth");
  }, [reducedMotion]);

  // Plans and the trial length come from the same endpoints the full pricing
  // page reads, through one shared loader, so the two can never disagree.
  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const { plans: loaded, trialDays: days } = await fetchMarketingPlans(controller.signal);
        setPlans(loaded);
        setPlansFailed(loaded.length === 0);
        if (days) setTrialDays(days);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setPlansFailed(true);
      }
    };

    load();
    return () => controller.abort();
  }, []);



  return (
    <div
      className={`${displayFont.variable} ${dataFont.variable} bg-[#F7F8FB] text-[#08132E] dark:bg-[#08132E] dark:text-white`}
    >
      {/* ---------------------------------------------------------- Hero */}
      <section id="home" className="relative scroll-mt-16 overflow-hidden sm:scroll-mt-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_15%_0%,rgba(15,60,153,0.10),transparent_65%),radial-gradient(45%_40%_at_85%_10%,rgba(7,156,196,0.10),transparent_60%)] dark:bg-[radial-gradient(60%_50%_at_15%_0%,rgba(76,123,232,0.18),transparent_65%),radial-gradient(45%_40%_at_85%_10%,rgba(7,156,196,0.14),transparent_60%)]"
        />
        <div className={`${SHELL} relative py-14 sm:py-20 lg:py-28 2xl:py-36`}>
          {/* grid-cols-1 keeps the single-column track from sizing to the
              widest child — without it the hero overflows on 320px screens. */}
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 2xl:gap-20">
            <div>
              {/* Arbitrary hex rather than bg-white: globals.css repaints the
                  literal .bg-white / .bg-white\/80 classes in dark mode. */}
              <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-[#FFFFFF]/80 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.05]">
                <span className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3 w-3 fill-[#ED881C] text-[#ED881C]" />
                  ))}
                </span>
                <span className="font-data text-[11px] tracking-wide text-slate-600 dark:text-slate-300">
                  4.9/5 from 2,500+ recruitment teams
                </span>
              </div>

              <h1 className="font-display mt-6 text-[2.1rem] font-bold leading-[1.02] tracking-[-0.04em] min-[400px]:text-[2.6rem] min-[400px]:leading-[0.98] sm:text-6xl lg:text-7xl">
                <span className="block text-[#08132E] dark:text-white">Hire smarter with</span>
                <span className="block text-[#0F3C99] dark:text-[#7BA4FF]">
                  AI-powered recruiting
                </span>
              </h1>

              <p className="mt-6 max-w-xl 2xl:max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg 2xl:text-xl">
                Intelligent resume screening, automated assessments and AI-assisted
                interviews in one place. Recruiting teams save{" "}
                <span className="font-semibold text-[#08132E] dark:text-white">
                  15+ hours every week
                </span>
                .
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0F3C99] px-6 text-sm font-semibold text-white shadow-lg shadow-[#0F3C99]/25 transition-colors hover:bg-[#0E3B98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED881C] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#08132E] sm:text-base"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setDemoModalOpen(true)}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-[#FFFFFF] px-6 text-sm font-semibold text-[#08132E] transition-colors hover:border-[#0F3C99]/40 hover:text-[#0F3C99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3C99] dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:border-white/30 sm:text-base"
                >
                  <Play className="h-4 w-4" />
                  Watch demo
                </button>
              </div>

              <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#079CC4]" />
                  {trialDays}-day free trial
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#079CC4]" />
                  No credit card required
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#079CC4]" />
                  Setup in 5 minutes
                </li>
              </ul>
            </div>

            <ScreeningPanel />
          </div>
        </div>

        {/* Stat band — the page's proof line, set as data rather than cards. */}
        <div className="border-y border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]">
          <div className={SHELL}>
            <dl className="grid grid-cols-2 divide-slate-200/80 md:grid-cols-4 md:divide-x dark:divide-white/10">
              {STATS.map((stat) => (
                <div key={stat.label} className="px-2 py-6 text-center md:py-8 2xl:py-10">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="font-data block text-2xl font-medium tabular-nums text-[#08132E] dark:text-white sm:text-3xl">
                      {stat.value}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
                      {stat.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ Features */}
      <section id="features" className={`scroll-mt-16 sm:scroll-mt-20 ${SECTION_Y}`}>
        <div className={SHELL}>
          <Reveal>
            <SectionHeading
              eyebrow="Features"
              title="Everything you need to hire better"
              lead="AI-powered tools for every step of recruitment — from the first resume to the signed offer."
            />
          </Reveal>

          <Reveal delay={80}>
            <div className="mt-10 sm:mt-14">
              <FeatureShowcase />
            </div>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------- How it works */}
      <section
        id="how-it-works"
        className={`scroll-mt-16 border-y border-slate-200/80 bg-[#FFFFFF] dark:border-white/10 dark:bg-white/[0.02] sm:scroll-mt-20 ${SECTION_Y}`}
      >
        <div className={SHELL}>
          <Reveal>
            <SectionHeading
              eyebrow="How it works"
              title="Three steps to your first shortlist"
              lead="Most teams run their first AI match within an hour of signing up."
            />
          </Reveal>

          <div className="relative mt-10 sm:mt-14">
            <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((step, index) => (
                <li key={step.title} className="relative">
                  {/* The rule links one step to the next — it stops at the last. */}
                  {index < STEPS.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-12 -right-6 top-5 hidden border-t border-dashed border-slate-300 dark:border-white/15 sm:block"
                    />
                  )}
                  <Reveal delay={index * 100}>
                    <span className="font-data relative z-10 inline-grid h-10 w-10 place-items-center rounded-full border border-slate-300 bg-[#F7F8FB] text-sm font-medium tabular-nums text-[#0F3C99] dark:border-white/15 dark:bg-[#0C1732] dark:text-[#7BA4FF]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display mt-5 text-xl font-bold tracking-[-0.02em] text-[#08132E] dark:text-white">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {step.description}
                    </p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- Pricing */}
      <section id="pricing" className={`scroll-mt-16 sm:scroll-mt-20 ${SECTION_Y}`}>
        <div className={SHELL}>
          <Reveal>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading
                eyebrow="Pricing"
                title="Plans that scale with your hiring"
                lead={`Start on a ${trialDays}-day free trial. Move to a paid plan when your pipeline outgrows it.`}
              />
              <Link
                href="/pricing"
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-[#0F3C99] hover:underline dark:text-[#7BA4FF]"
              >
                Compare every plan
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>

          {plans.length > 0 ? (
            <>
              {/* Billing period — the price, quotas and signup link all follow it. */}
              <Reveal>
                <div className="mt-8 flex items-center justify-center gap-3 sm:mt-10">
                  <span
                    className={`text-sm ${
                      !isYearly
                        ? "font-medium text-[#08132E] dark:text-white"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    Monthly
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isYearly}
                    aria-label="Bill yearly"
                    onClick={() => setIsYearly(!isYearly)}
                    className={`relative h-7 w-12 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F3C99] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#08132E] ${
                      isYearly ? "bg-[#0F3C99]" : "bg-slate-300 dark:bg-white/20"
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        isYearly ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-sm ${
                      isYearly
                        ? "font-medium text-[#08132E] dark:text-white"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    Yearly
                  </span>
                </div>
              </Reveal>

              <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {plans.map((plan, index) => (
                  <Reveal key={plan.id} delay={index * 80} className="h-full">
                    <PlanCard plan={plan} isYearly={isYearly} />
                  </Reveal>
                ))}
              </div>
            </>
          ) : (
            <Reveal>
              <div className="mt-10 rounded-2xl border border-slate-200/80 bg-[#FFFFFF] p-8 text-center dark:border-white/10 dark:bg-white/[0.03] sm:mt-14 sm:p-10">
                <p className="text-base text-slate-600 dark:text-slate-300">
                  {plansFailed
                    ? "Plan details live on the pricing page."
                    : "Loading plans…"}
                </p>
                <Link
                  href="/pricing"
                  className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0F3C99] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0E3B98]"
                >
                  View pricing
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------- About */}
      <section
        id="about"
        className={`scroll-mt-16 border-y border-slate-200/80 bg-[#FFFFFF] dark:border-white/10 dark:bg-white/[0.02] sm:scroll-mt-20 ${SECTION_Y}`}
      >
        <div className={SHELL}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-16">
            <Reveal>
              <SectionHeading
                eyebrow="About"
                title="We're on a mission to transform hiring"
              />
              <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-600 dark:text-slate-400">
                <p>
                  TalentFlow started when our founders experienced the challenges of
                  modern recruitment firsthand. As hiring managers at growing tech
                  companies, they spent countless hours sifting through resumes,
                  coordinating interviews and managing candidate pipelines.
                </p>
                <p>
                  They knew there had to be a better way, so they built TalentFlow — an
                  AI-powered platform that automates the tedious parts of recruiting while
                  keeping the human element at its core.
                </p>
                <p>
                  Today TalentFlow helps thousands of companies find and hire the best
                  talent, processing millions of resumes a year for teams that range from
                  startups to Fortune 500 enterprises.
                </p>
              </div>
              <Link
                href="/about"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0F3C99] hover:underline dark:text-[#7BA4FF]"
              >
                Read our story
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Reveal>

            <Reveal delay={120}>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200/80 dark:border-white/10 dark:bg-white/10">
                {ABOUT_FIGURES.map((figure) => (
                  <div
                    key={figure.label}
                    className="bg-[#FFFFFF] p-6 dark:bg-[#0C1732] sm:p-8"
                  >
                    <dt className="font-data text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      {figure.label}
                    </dt>
                    <dd className="font-data mt-2 text-2xl font-medium tabular-nums text-[#08132E] dark:text-white sm:text-3xl">
                      {figure.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- Final CTA */}
      <section className={`relative overflow-hidden bg-[#08132E] text-white ${SECTION_Y}`}>
        <div className={`${SHELL} relative text-center`}>
          <Reveal>
            <h2 className="font-display mx-auto max-w-3xl text-3xl font-bold tracking-[-0.03em] sm:text-5xl">
              Ready to transform your hiring?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base text-white/75 sm:text-lg">
              Join 2,500+ companies using TalentFlow to build great teams faster.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={TRIAL_LINK}
                prefetch={false}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FFFFFF] px-7 text-sm font-semibold text-[#08132E] transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED881C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08132E] dark:bg-[#ED881C] dark:text-[#08132E] dark:hover:bg-[#F0A44E] dark:focus-visible:ring-white sm:w-auto sm:text-base"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/25 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto sm:text-base"
              >
                View pricing
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-data text-xs uppercase tracking-[0.16em] text-white/60">
              <li className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                SOC 2 certified
              </li>
              <li className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                2,500+ customers
              </li>
              <li className="flex items-center gap-2">
                <Star className="h-4 w-4 fill-current" />
                4.9/5 rating
              </li>
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------- Demo modal */}
      {demoModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="TalentFlow product demo"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#08132E]/90 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setDemoModalOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#0C1732] text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="font-data text-[11px] uppercase tracking-[0.18em] text-white/60">
                  Product demo
                </p>
                <h3 className="font-display mt-1 text-lg font-bold tracking-[-0.02em]">
                  See TalentFlow end to end
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDemoModalOpen(false)}
                className="rounded-lg p-2 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                aria-label="Close demo"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-6 sm:px-8 sm:py-8">
              <p className="text-sm text-white/70">
                Watch how TalentFlow moves a role from resume upload to hiring decision.
              </p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Upload, text: "Bulk resume upload and parsing" },
                  { icon: Search, text: "AI-powered candidate scoring" },
                  { icon: Send, text: "Automated assessment delivery" },
                  { icon: Video, text: "AI video interview analysis" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <li
                      key={item.text}
                      className="flex items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-3"
                    >
                      <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm">{item.text}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={TRIAL_LINK}
                  prefetch={false}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FFFFFF] px-6 text-sm font-semibold text-[#08132E] transition-colors hover:bg-slate-100"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/contact"
                  prefetch={false}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/25 px-6 text-sm font-semibold transition-colors hover:bg-white/10"
                >
                  Schedule a live demo
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
