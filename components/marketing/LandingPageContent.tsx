"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Play,
  Shield,
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

/* ------------------------------------------------------------------ *
 * Shared section furniture
 * ------------------------------------------------------------------ */

/** One measure for every section: gutters grow with the viewport, and the
 *  column widens past 1200px only on genuinely large displays. */
const SHELL =
  "container mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 xl:max-w-[1320px] 2xl:max-w-[1480px]";

/** Vertical rhythm, shared so sections can't drift apart. */
const SECTION_Y = "py-10 sm:py-14 2xl:py-20";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    // Semibold: at 11px, uppercase and widely tracked, Inter needs the extra
    // weight to hold the line the mono face used to hold on its own.
    <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] text-mkt-accent">
      {children}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
  nowrap = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: string;
  align?: "left" | "center";
  /** Wraps on small screens, then holds to one line from lg up, where the
   *  column is finally wide enough for the full title at text-5xl. */
  nowrap?: boolean;
}) {
  // The measure has to lift at lg so the one-line title isn't clipped by it,
  // but it stays on while the title is still wrapping.
  const measure = nowrap ? "max-w-2xl lg:max-w-none" : "max-w-2xl 2xl:max-w-3xl";

  return (
    <div className={`${align === "center" ? `text-center mx-auto ${measure}` : measure}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        className={`mt-3 text-3xl sm:text-4xl md:text-5xl 2xl:text-6xl font-extrabold tracking-[-0.035em] text-mkt-ink text-balance ${
          nowrap ? "lg:whitespace-nowrap" : ""
        }`}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={`mt-4 text-base sm:text-lg 2xl:text-xl text-slate-600 dark:text-slate-400 leading-relaxed ${
            nowrap ? `lg:max-w-2xl 2xl:max-w-3xl ${align === "center" ? "mx-auto" : ""}` : ""
          }`}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

/**
 * Billing period — a segmented control rather than a switch. Both periods stay
 * visible and labelled, so the unselected state never has to be inferred, and
 * the yearly saving is priced into the control itself.
 */
function BillingToggle({
  isYearly,
  onChange,
  savePercent,
}: {
  isYearly: boolean;
  onChange: (yearly: boolean) => void;
  savePercent: number;
}) {
  const options = [
    { label: "Monthly", yearly: false },
    { label: "Yearly", yearly: true },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-mkt-surface p-1 shadow-sm dark:border-white/10 dark:bg-white/[0.05]"
    >
      {options.map((option) => {
        const selected = option.yearly === isYearly;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.yearly)}
            className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid focus-visible:ring-offset-2 dark:focus-visible:ring-offset-mkt-navy ${
              selected
                ? "bg-mkt-accent-solid text-white"
                : "text-slate-600 hover:text-mkt-ink dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {option.label}
            {option.yearly && savePercent > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  selected
                    ? "bg-mkt-amber text-mkt-ink"
                    : "bg-mkt-amber/15 text-mkt-amber-ink"
                }`}
              >
                Save {savePercent}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * Static content
 * ------------------------------------------------------------------ */

/** Each label names what its number counts — "Satisfaction" and the like left
 *  the reader to guess what 98% referred to. */
const STATS = [
  { value: "2,500+", label: "Recruiting teams" },
  { value: "5M+", label: "Resumes screened" },
  { value: "40%", label: "Faster time to hire" },
  { value: "98%", label: "Would recommend" },
];

const STEPS = [
  {
    title: "Sign up",
    description: "Two minutes, no credit card, no sales call.",
  },
  {
    title: "Add the role",
    description: "Paste a job description. TalentFlow pulls out the skills, seniority and must-haves.",
  },
  {
    title: "Open the shortlist",
    description: "Candidates arrive ranked and scored. Book interviews the same day.",
  },
];

/** One row of plans on the landing page — the rest sit behind the explore card. */
const VISIBLE_PLANS = 4;

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

  const visiblePlans = plans.slice(0, VISIBLE_PLANS);
  const hiddenPlanCount = plans.length - visiblePlans.length;

  // The badge on the yearly tab quotes the best real discount on offer, so it
  // can never promise a saving no plan actually gives.
  const annualSavePercent = plans.reduce(
    (best, plan) => Math.max(best, Math.round(plan.discountPercentage ?? 0)),
    0
  );

  return (
    // One typeface for the whole page: Inter, inherited from <body>. Hierarchy
    // is carried by weight, tracking and case instead of a second family.
    <div className="bg-mkt-canvas text-mkt-ink">
      {/* ---------------------------------------------------------- Hero */}
      <section id="home" className="relative scroll-mt-16 overflow-hidden sm:scroll-mt-20">
        {/* The hero band is its own positioning context so the artwork can't
            reach past it. When the layers were pinned to the whole <section>
            they also spanned the stat band below, which pushed the image's
            centre line down and hid the candidate cards along its bottom edge
            behind that band. */}
        <div className="relative xl:min-h-[680px]">
          {/* Colour wash + dot field, both decorative. Gone from xl up in light
              mode, where the artwork takes over — the wash tinted the photograph
              and read as a haze laid over it.
              Two elements rather than one with `xl:hidden dark:xl:block`: a
              stacked responsive+dark pair leaves which rule wins up to variant
              sort order. `hidden` twice can't conflict, and `hidden dark:block`
              is the pairing Tailwind guarantees. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_15%_0%,rgba(15,60,153,0.10),transparent_65%),radial-gradient(45%_40%_at_85%_10%,rgba(7,156,196,0.10),transparent_60%)] xl:hidden dark:hidden"
          />
          {/* Dark mode shows no artwork, so it keeps its wash at every width. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(60%_50%_at_15%_0%,rgba(76,123,232,0.18),transparent_65%),radial-gradient(45%_40%_at_85%_10%,rgba(7,156,196,0.14),transparent_60%)] dark:block"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:radial-gradient(var(--mkt-accent)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(65%_55%_at_50%_0%,black,transparent)] xl:hidden"
          />
          {/* Hero artwork at its natural size — no background-size, so it is
              never scaled or distorted. Anchored top-right: right because that's
              where the subject sits, top so the 680px image starts flush with
              the band and its lower edge stays inside it. The left ~60% of the
              image is deliberately empty, and that emptiness is where the copy
              goes. Only from xl up: below that the image is wider than the
              viewport and the subject would be pushed off-screen. Light mode
              only — the artwork is white-on-white, so dark mode keeps the
              gradients above instead. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden bg-white bg-[url('/marketing/hero-bg.png')] bg-right-top bg-no-repeat opacity-100 xl:block dark:opacity-0"
          />
          {/* Padding below xl, where there is no artwork and the copy would
              otherwise sit flush under the header. From xl the band is exactly
              the artwork's 680px and the padding goes, so the image starts at
              the top edge and the copy centres against it. */}
          <div className={`${SHELL} relative py-12 text-left sm:py-16 lg:py-20 xl:flex xl:min-h-[680px] xl:items-center xl:py-0`}>
          {/* Left-aligned in a capped column. From xl the artwork owns the right
              half, so the column is held back to clear the subject; below that
              the image is hidden and the column runs to its natural measure. */}
          {/* The artwork is 1920px wide and unscaled, so its subject always
              occupies a fixed ~770px at the right edge. What's left for the
              copy is therefore viewport-width minus that, which is why the
              column tightens at xl and only opens up again at 2xl. */}
          <div className="max-w-2xl lg:max-w-4xl xl:max-w-[30rem] 2xl:max-w-[46rem]">
            {/* Two imperatives rather than a category claim: the old headline
                ("Hire smarter with AI-powered recruiting") named the market,
                not what the product does for the reader. */}
            {/* Steps back down at xl, where the artwork appears and the column
                narrows — the headline has to sit beside the subject rather than
                run under it, then opens up again at 2xl once there is room. */}
            <h1 className="text-[1.75rem] font-extrabold leading-[1.02] tracking-[-0.045em] text-balance min-[400px]:text-[2.35rem] min-[400px]:leading-[0.98] sm:text-[3.1rem] md:text-[3.95rem] lg:text-[4.6rem] xl:text-[3rem] 2xl:text-[4.2rem]">
              {/* No `whitespace-nowrap`: at 3.95rem the line is ~620px, which
                  is wider than the usable width between 640 and ~700px, and the
                  section clips its overflow — so the sentence lost its tail
                  rather than wrapping. Left-aligned, that clipping is on the
                  right edge and very visible. */}
              <span className="block text-mkt-ink">Screen every applicant.</span>
              {/* The payoff line carries the accent and a soft underglow — the
                  page's one flourish, and it needs no box to hold it. */}
              <span className="relative mt-1 block text-mkt-accent">
                Shortlist in minutes.
                {/* Runs from the left edge now the hero is left-aligned — a
                    symmetrical fade read as off-centre against flush type. */}
                <span
                  aria-hidden="true"
                  className="absolute -bottom-2 left-0 h-px w-2/3 bg-gradient-to-r from-mkt-amber to-transparent"
                />
              </span>
            </h1>

            <p className="mt-8 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg 2xl:text-xl">
              Resume screening, assessments and AI interviews run as one pass, so
              the shortlist is ready before your first call. Teams get back{" "}
              <span className="font-semibold text-mkt-ink">
                15+ hours a week
              </span>
              .
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-start">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-mkt-accent-solid px-6 text-sm font-semibold text-white shadow-lg shadow-mkt-accent-solid/25 transition-colors hover:bg-mkt-accent-solid-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-amber focus-visible:ring-offset-2 dark:focus-visible:ring-offset-mkt-navy sm:text-base"
              >
                {/* Same words as the other trial buttons — one action, one name. */}
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setDemoModalOpen(true)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-mkt-surface px-6 text-sm font-semibold text-mkt-ink transition-colors hover:border-mkt-accent/40 hover:text-mkt-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-white/30 sm:text-base"
              >
                <Play className="h-4 w-4" />
                Watch demo
              </button>
            </div>

            {/* One quiet line where a three-item checklist used to sit. The
                same reassurance, without competing with the headline. */}
            <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
              {trialDays}-day free trial · no credit card
            </p>
            </div>
          </div>
        </div>
        {/* /hero band */}

        {/* Stat band — the page's proof line, set as data rather than cards. */}
        <div className="border-y border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]">
          <div className={SHELL}>
            <dl className="grid grid-cols-2 divide-slate-200/80 md:grid-cols-4 md:divide-x dark:divide-white/10">
              {STATS.map((stat) => (
                <div key={stat.label} className="px-2 py-4 text-center md:py-5 2xl:py-7">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block text-2xl font-extrabold tabular-nums tracking-[-0.02em] text-mkt-ink sm:text-3xl">
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
              title="Every stage, one system"
              lead="Screen, assess, interview and decide without exporting a spreadsheet or switching tools."
              nowrap
            />
          </Reveal>

          <Reveal delay={80}>
            <div className="mt-7 sm:mt-9">
              <FeatureShowcase />
            </div>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------- How it works */}
      <section
        id="how-it-works"
        className={`scroll-mt-16 border-y border-slate-200/80 bg-mkt-surface dark:border-white/10 dark:bg-white/[0.02] sm:scroll-mt-20 ${SECTION_Y}`}
      >
        <div className={SHELL}>
          <Reveal>
            <SectionHeading
              eyebrow="How it works"
              title="Three steps to your first shortlist"
              lead="Most teams run their first AI match within an hour of signing up."
              nowrap
            />
          </Reveal>

          <div className="relative mt-7 sm:mt-9">
            <ol className="grid gap-6 sm:grid-cols-3 sm:gap-6">
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
                    <span className="relative z-10 inline-grid h-10 w-10 place-items-center rounded-full border border-slate-300 bg-mkt-canvas text-sm font-semibold tabular-nums text-mkt-accent dark:border-white/15 dark:bg-mkt-surface">
    ing                  {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-4 text-xl font-bold tracking-[-0.02em] text-mkt-ink">
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
            {/* The one-line title needs the full measure, so the link only moves
                alongside it once there is room for both. */}
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <SectionHeading
                eyebrow="Pricing"
                title="Pay for the pipeline you run"
                lead={`Start on a ${trialDays}-day free trial. Move up when your pipeline outgrows it.`}
                nowrap
              />
              <Link
                href="/pricing"
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-mkt-accent hover:underline"
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
                <div className="mt-6 flex justify-end sm:mt-7">
                  <BillingToggle
                    isYearly={isYearly}
                    onChange={setIsYearly}
                    savePercent={annualSavePercent}
                  />
                </div>
              </Reveal>

              {/* The landing page shows one clean row; the rest of the catalogue
                  lives on the pricing page behind the card below. */}
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visiblePlans.map((plan, index) => (
                  <Reveal key={plan.id} delay={index * 80} className="h-full">
                    <PlanCard plan={plan} isYearly={isYearly} />
                  </Reveal>
                ))}

                {hiddenPlanCount > 0 && (
                  <Reveal delay={VISIBLE_PLANS * 80} className="col-span-full">
                    <Link
                      href="/pricing"
                      className="group flex flex-col items-start gap-4 rounded-2xl border border-dashed border-slate-300 bg-mkt-surface p-6 transition-colors hover:border-mkt-amber hover:bg-mkt-amber/[0.04] dark:border-white/15 dark:bg-white/[0.03] dark:hover:bg-mkt-amber/[0.06] sm:flex-row sm:items-center sm:justify-between sm:p-7"
                    >
                      <div>
                        <p className="text-lg font-bold tracking-[-0.02em] text-mkt-ink">
                          {hiddenPlanCount} more {hiddenPlanCount === 1 ? "plan" : "plans"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          Full quotas, side-by-side features and enterprise options.
                        </p>
                      </div>
                      <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-mkt-ink transition-colors group-hover:border-mkt-amber group-hover:text-mkt-amber-ink dark:border-white/15 dark:group-hover:text-mkt-amber-ink">
                        See all plans
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </Link>
                  </Reveal>
                )}
              </div>
            </>
          ) : (
            <Reveal>
              <div className="mt-7 rounded-2xl border border-slate-200/80 bg-mkt-surface p-8 text-center dark:border-white/10 dark:bg-white/[0.03] sm:mt-9 sm:p-10">
                <p className="text-base text-slate-600 dark:text-slate-300">
                  {plansFailed
                    ? "Plan details live on the pricing page."
                    : "Loading plans…"}
                </p>
                <Link
                  href="/pricing"
                  className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-mkt-accent-solid px-6 text-sm font-semibold text-white transition-colors hover:bg-mkt-accent-solid-hover"
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
        className={`scroll-mt-16 border-y border-slate-200/80 bg-mkt-surface dark:border-white/10 dark:bg-white/[0.02] sm:scroll-mt-20 ${SECTION_Y}`}
      >
        <div className={SHELL}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-12">
            <Reveal>
              <SectionHeading
                eyebrow="About"
                title="Built by people who were drowning in resumes"
              />
              <div className="mt-5 space-y-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
                <p>
                  TalentFlow began as a spreadsheet. Our founders were hiring managers at
                  fast-growing tech companies, where every open role meant hundreds of
                  resumes read by hand, interviews chased over email, and good candidates
                  lost in the gaps.
                </p>
                <p>
                  So they built the system they wanted: one that does the sorting, scoring
                  and scheduling, and leaves the judgement to people.
                </p>
                <p>
                  Today it processes millions of resumes a year for teams from ten-person
                  startups to Fortune 500 enterprises.
                </p>
              </div>
              <Link
                href="/about"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-mkt-accent hover:underline"
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
                    className="bg-mkt-surface p-6 dark:bg-mkt-surface sm:p-8"
                  >
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      {figure.label}
                    </dt>
                    <dd className="mt-2 text-2xl font-extrabold tabular-nums tracking-[-0.02em] text-mkt-ink sm:text-3xl">
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
      <section className={`relative overflow-hidden bg-mkt-navy text-white ${SECTION_Y}`}>
        <div className={`${SHELL} relative text-center`}>
          <Reveal>
            <h2 className="mx-auto max-w-3xl text-3xl font-extrabold tracking-[-0.035em] sm:text-5xl">
              Your next hire is already in the pile.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/75 sm:text-lg">
              2,500+ recruiting teams use TalentFlow to find them faster.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={TRIAL_LINK}
                prefetch={false}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-mkt-surface px-7 text-sm font-semibold text-mkt-ink transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-amber focus-visible:ring-offset-2 focus-visible:ring-offset-mkt-navy dark:bg-mkt-amber dark:text-mkt-navy dark:hover:bg-mkt-amber-ink dark:focus-visible:ring-white sm:w-auto sm:text-base"
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
            <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-mkt-navy/90 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setDemoModalOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-mkt-navy-surface text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                  Product demo
                </p>
                <h3 className="mt-1 text-lg font-bold tracking-[-0.02em]">
                  One role, start to finish
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
                Follow one role from bulk upload to a ranked shortlist and a booked
                interview.
              </p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Upload, text: "Bulk upload and parsing" },
                  { icon: Search, text: "Candidate scoring and ranking" },
                  { icon: Send, text: "Assessments sent automatically" },
                  { icon: Video, text: "Video interview analysis" },
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
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-mkt-surface px-6 text-sm font-semibold text-mkt-ink transition-colors hover:bg-slate-100"
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
