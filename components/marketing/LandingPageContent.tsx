"use client";

import { Play, Search, Send, Upload, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { BillingToggle } from "./BillingToggle";
import { ArrowLink, Cta } from "./Cta";
import { FeatureShowcase } from "./FeatureShowcase";
import { display, DISPLAY } from "./fonts";
import { MarketingFaq } from "./MarketingFaq";
import { CountUp, MotionNoScript, PRE, RevealGroup, RevealHeading, Typewriter } from "./motion";
import { PLAN_RAIL, PLAN_RAIL_ITEM, PlanCard, SwipeHint } from "./PlanCard";
import { fetchMarketingPlans, type MarketingPlan } from "./plans";
import { DASHBOARD_HREF, useSignedIn } from "./session";
import { ShortlistDemo } from "./ShortlistDemo";

const TRIAL_LINK = `https://${process.env.NEXT_PUBLIC_BASE_DOMAIN}/signup?plan=free_trial`;

/* ------------------------------------------------------------------ *
 * Layout system — one measure, one vertical rhythm, shared with the
 * header and footer so every edge lines up.
 * ------------------------------------------------------------------ */

const SHELL = "mx-auto w-full max-w-[1200px] xl:max-w-[1320px] 2xl:max-w-[1480px] px-4 sm:px-6 lg:px-8";
const SECTION = "scroll-mt-16 py-12 sm:py-24 lg:py-28";
const H2 = `${DISPLAY} text-[clamp(1.6rem,4.2vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.035em] text-mkt-ink text-balance`;
const LEAD = "mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-5 sm:text-lg";

/* ------------------------------------------------------------------ *
 * Content
 * ------------------------------------------------------------------ */

/** Each label names what its number counts. */
const STATS = [
  { value: "2,500+", label: "Recruiting teams" },
  { value: "5M+", label: "Resumes screened" },
  { value: "40%", label: "Faster time to hire" },
  { value: "98%", label: "Would recommend" },
];

const STEPS = [
  {
    title: "Sign up",
    description: "Two minutes, no credit card and no sales call.",
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

/** One row of plans on the landing page; the rest live on /pricing. */
const VISIBLE_PLANS = 4;

const ABOUT_FIGURES = [
  { value: "2020", label: "Founded", count: false },
  { value: "50+", label: "Countries", count: true },
  { value: "100+", label: "Team members", count: true },
  { value: "5M+", label: "Resumes a year", count: true },
];

/* ------------------------------------------------------------------ *
 * How it works — the track fills as the reader scrolls through it.
 * ------------------------------------------------------------------ */

function Steps() {
  const root = useRef<HTMLOListElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { wide: "(min-width: 768px)", motion: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          // Without motion the finished state is the CSS default.
          if (!context.conditions?.motion) return;
          const wide = context.conditions.wide;

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: root.current,
              start: wide ? "top 75%" : "top 70%",
              end: wide ? "bottom 55%" : "bottom 60%",
              scrub: 0.6,
            },
          });

          tl.fromTo(
            wide ? "[data-track='x']" : "[data-track='y']",
            wide ? { scaleX: 0 } : { scaleY: 0 },
            wide ? { scaleX: 1, duration: 1 } : { scaleY: 1, duration: 1 },
            0
          );
          gsap.utils.toArray<HTMLElement>("[data-step]", root.current).forEach((step, i, all) => {
            const at = all.length > 1 ? i / (all.length - 1) : 0;
            tl.fromTo(
              step.querySelector("[data-dot]"),
              { scale: 0 },
              { scale: 1, duration: 0.08, ease: "back.out(3)" },
              Math.max(0, at - 0.04)
            );
            tl.fromTo(
              step.querySelector("[data-copy]"),
              { opacity: 0.4, y: 12 },
              { opacity: 1, y: 0, duration: 0.14 },
              Math.max(0, at - 0.08)
            );
          });
        }
      );
    },
    { scope: root }
  );

  return (
    <ol ref={root} className="relative mt-8 grid gap-7 pl-9 sm:mt-16 sm:gap-10 sm:pl-10 md:grid-cols-3 md:gap-8 md:pl-0">
      {/* Track: vertical on phones, horizontal from md. */}
      <span aria-hidden="true" className="absolute bottom-2 left-[11px] top-2 w-px bg-slate-900/10 dark:bg-white/10 md:hidden">
        <span data-track="y" className="block h-full w-full origin-top bg-mkt-accent" />
      </span>
      <span aria-hidden="true" className="absolute left-3 right-[calc(33.333%-2.083rem)] top-[11px] hidden h-px bg-slate-900/10 dark:bg-white/10 md:block">
        <span data-track="x" className="block h-full w-full origin-left bg-mkt-accent" />
      </span>

      {STEPS.map((step, index) => (
        <li key={step.title} data-step className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-10 top-0 grid h-6 w-6 place-items-center rounded-full border border-slate-900/15 bg-mkt-canvas dark:border-white/20 md:static"
          >
            <span data-dot className="h-2.5 w-2.5 rounded-full bg-mkt-accent" />
          </span>
          <div data-copy className="md:mt-7">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Step {index + 1}</p>
            <h3 className={`${DISPLAY} mt-1 text-lg font-bold tracking-[-0.025em] text-mkt-ink sm:text-2xl`}>{step.title}</h3>
            <p className="mt-1.5 max-w-xs text-sm sm:mt-2 sm:text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
              {step.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export function LandingPageContent() {
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [trialDays, setTrialDays] = useState<number | null>(null);
  const [plans, setPlans] = useState<MarketingPlan[]>([]);
  const [plansFailed, setPlansFailed] = useState(false);
  // Annual is the pricing page default, so the landing page opens the same way.
  const [isYearly, setIsYearly] = useState(true);
  const closeDemoRef = useRef<HTMLButtonElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Menu items on this route are anchors; scroll to them smoothly unless the
  // visitor asked for less motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    root.classList.add("scroll-smooth");
    return () => root.classList.remove("scroll-smooth");
  }, []);

  // Plans and the trial length come from the same loader the pricing page's
  // data matches, so the two pages can never disagree.
  useEffect(() => {
    const controller = new AbortController();
    fetchMarketingPlans(controller.signal)
      .then(({ plans: loaded, trialDays: days }) => {
        setPlans(loaded);
        setPlansFailed(loaded.length === 0);
        if (days) setTrialDays(days);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setPlansFailed(true);
      });
    return () => controller.abort();
  }, []);

  // Plans change the page height after load; re-measure every scroll trigger.
  useEffect(() => {
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [plans.length, plansFailed]);

  // Demo dialog: Escape closes it, focus starts on the close button.
  useEffect(() => {
    if (!demoModalOpen) return;
    closeDemoRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setDemoModalOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demoModalOpen]);

  // Hero ambience: the glow drifts slowly; on desktop the demo panel floats
  // up a touch as the hero scrolls away.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to("[data-glow]", {
          xPercent: -18,
          yPercent: 14,
          scale: 1.15,
          duration: 9,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
      });
      mm.add("(prefers-reduced-motion: no-preference) and (min-width: 1024px)", () => {
        gsap.to("[data-parallax]", {
          y: -60,
          ease: "none",
          scrollTrigger: { trigger: heroRef.current, start: "top top", end: "bottom top", scrub: true },
        });
      });
    },
    { scope: heroRef }
  );

  // The demo dialog opens with a short scale-in.
  useGSAP(
    () => {
      if (!demoModalOpen || !dialogRef.current) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline();
        tl.from(dialogRef.current, { autoAlpha: 0, duration: 0.25 })
          .from("[data-dialog-panel]", { y: 24, scale: 0.96, duration: 0.45, ease: "power3.out" }, 0)
          .from("[data-dialog-item]", { y: 12, autoAlpha: 0, stagger: 0.05, duration: 0.35 }, 0.15);
      });
    },
    { dependencies: [demoModalOpen], scope: dialogRef }
  );

  const visiblePlans = plans.slice(0, VISIBLE_PLANS);
  const hiddenPlanCount = plans.length - visiblePlans.length;
  const annualSavePercent = plans.reduce(
    (best, plan) => Math.max(best, Math.round(plan.discountPercentage ?? 0)),
    0
  );
  const signedIn = useSignedIn();
  const trialLabel = trialDays ? `${trialDays}-day free trial` : "Free trial";

  return (
    <div className={`${display.variable} overflow-x-clip bg-mkt-canvas text-mkt-ink`}>
      <MotionNoScript />

      {/* ---------------------------------------------------------- Hero */}
      <section id="home" ref={heroRef} className="relative overflow-hidden">
        <div
          data-glow
          aria-hidden="true"
          className="pointer-events-none absolute -right-48 -top-48 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.16),transparent)] dark:bg-[radial-gradient(closest-side,rgba(76,123,232,0.2),transparent)] sm:h-[680px] sm:w-[680px]"
        />
        <div className={`${SHELL} relative grid grid-cols-1 items-center gap-10 pb-10 pt-7 sm:gap-14 sm:pb-24 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:pb-28 lg:pt-20`}>
          <div className="max-w-2xl">
            <Typewriter
              lines={["Screen every applicant.", "Shortlist in minutes."]}
              loop
              className={`${DISPLAY} text-[clamp(2rem,6.4vw,4.75rem)] font-extrabold leading-[1] tracking-[-0.045em] text-mkt-ink`}
            />

            <RevealGroup immediate delay={0.55} stagger={0.12}>
              <p
                data-reveal
                data-pre
                className={`${PRE} mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 sm:mt-7 sm:text-xl`}
              >
                Resume screening, assessments and AI interviews run as one pass, so the shortlist
                is ready before your first call. Teams get back 15+ hours a week.
              </p>
              <div data-reveal data-pre className={`${PRE} mt-6 flex flex-col gap-2.5 sm:mt-9 sm:flex-row sm:gap-3`}>
                <Cta href={signedIn ? DASHBOARD_HREF : "/signup"} magnetic>
                  {signedIn ? "Go to dashboard" : "Start free trial"}
                </Cta>
                <Cta variant="secondary" icon={Play} arrow={null} onClick={() => setDemoModalOpen(true)}>
                  Watch the demo
                </Cta>
              </div>
              <p data-reveal data-pre className={`${PRE} mt-3.5 text-xs text-slate-500 sm:mt-5 sm:text-sm dark:text-slate-400`}>
                {signedIn ? "You're signed in." : `${trialLabel}. No credit card required.`}
              </p>
            </RevealGroup>
          </div>

          <div data-parallax className="mx-auto w-full max-w-lg lg:max-w-none">
            <ShortlistDemo />
          </div>
        </div>

        {/* Proof line, set as data. Numbers count up as it comes into view. */}
        <div className="border-y border-slate-900/[0.07] dark:border-white/[0.08]">
          <dl className={`${SHELL} grid grid-cols-2 md:grid-cols-4`}>
            {STATS.map((stat, i) => (
              <div
                key={stat.label}
                className={`border-slate-900/[0.07] py-4 dark:border-white/[0.08] sm:py-8 ${
                  i % 2 === 1 ? "border-l pl-5 sm:pl-8" : ""
                } ${i < 2 ? "border-b md:border-b-0" : ""} ${i === 2 ? "md:border-l md:pl-8" : ""}`}
              >
                <dt className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">{stat.label}</dt>
                <dd className={`${DISPLAY} mt-0.5 text-2xl font-bold tracking-[-0.03em] text-mkt-ink sm:text-4xl`}>
                  <CountUp value={stat.value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------ Features */}
      <section id="features" className={SECTION}>
        <div className={SHELL}>
          <RevealHeading text="Every stage of the hire, in one place" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              Screen, assess, interview and decide without exporting a spreadsheet or switching tools.
            </p>
            <div data-reveal className="mt-7 sm:mt-14">
              <FeatureShowcase />
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* -------------------------------------------------- How it works */}
      <section
        id="how-it-works"
        className={`${SECTION} border-y border-slate-900/[0.07] bg-mkt-surface dark:border-white/[0.08]`}
      >
        <div className={SHELL}>
          <RevealHeading text="Your first shortlist in three steps" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              Most teams run their first AI match within an hour of signing up.
            </p>
          </RevealGroup>
          <Steps />
        </div>
      </section>

      {/* ------------------------------------------------------- Pricing */}
      <section id="pricing" className={SECTION}>
        <div className={SHELL}>
          <div className="flex flex-col gap-5 sm:gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <RevealHeading text="Pay for the pipeline you run" className={H2} />
              <RevealGroup>
                <p data-reveal className={LEAD}>
                  Start on the {trialLabel.toLowerCase()}. Move up when your hiring outgrows it.
                </p>
              </RevealGroup>
            </div>
            {plans.length > 0 && (
              <div className="shrink-0">
                <BillingToggle isYearly={isYearly} onChange={setIsYearly} savePercent={annualSavePercent} />
              </div>
            )}
          </div>

          {plans.length > 0 ? (
            <>
              <RevealGroup className={`mt-7 sm:mt-12 ${PLAN_RAIL} sm:grid-cols-2 xl:grid-cols-4`} stagger={0.1} y={40}>
                {visiblePlans.map((plan) => (
                  <div key={plan.id} data-reveal className={PLAN_RAIL_ITEM}>
                    <PlanCard plan={plan} isYearly={isYearly} />
                  </div>
                ))}
              </RevealGroup>
              <SwipeHint count={visiblePlans.length} />
              <div className="mt-5 flex flex-col items-start justify-between gap-2 sm:mt-8 sm:gap-3 sm:flex-row sm:items-center">
                <p className="text-sm text-slate-600 sm:text-[15px] dark:text-slate-400">
                  {hiddenPlanCount > 0
                    ? `${hiddenPlanCount} more ${hiddenPlanCount === 1 ? "plan" : "plans"}, add-ons and a Custom plan for large teams.`
                    : "Add-ons and a Custom plan for large teams."}
                </p>
                <ArrowLink href="/pricing">Compare all plans</ArrowLink>
              </div>
            </>
          ) : (
            <div className="mt-10 rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-6 dark:border-white/10 sm:mt-12 sm:p-10">
              {plansFailed ? (
                <>
                  <p className="text-base text-slate-600 dark:text-slate-300">
                    Plans couldn&apos;t load here. The pricing page lists every plan.
                  </p>
                  <Cta href="/pricing" className="mt-6">
                    View pricing
                  </Cta>
                </>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading plans">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-72 animate-pulse rounded-2xl bg-slate-900/[0.04] dark:bg-white/[0.05]" />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ----------------------------------------------------------- FAQ */}
      <section id="faq" className={`${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08]`}>
        <div className={SHELL}>
          <MarketingFaq trialDays={trialDays} />
        </div>
      </section>

      {/* --------------------------------------------------------- About */}
      <section
        id="about"
        className={`${SECTION} border-y border-slate-900/[0.07] bg-mkt-surface dark:border-white/[0.08]`}
      >
        <div className={`${SHELL} grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-20`}>
          <div>
            <RevealHeading text="Built by people who were drowning in resumes" className={H2} />
            <RevealGroup className="mt-4 max-w-xl space-y-3 text-[15px] leading-relaxed sm:mt-6 sm:space-y-4 text-slate-600 dark:text-slate-400 sm:text-[17px]">
              <p data-reveal>
                TalentFlow began as a spreadsheet. Our founders were hiring managers at fast-growing
                tech companies, where every open role meant hundreds of resumes read by hand,
                interviews chased over email, and good candidates lost in the gaps.
              </p>
              <p data-reveal>
                So they built the system they wanted: one that does the sorting, scoring and
                scheduling, and leaves the judgement to people.
              </p>
              <p data-reveal>
                Today it processes millions of resumes a year for teams from ten-person startups to
                Fortune 500 enterprises.
              </p>
              <div data-reveal className="pt-3">
                <ArrowLink href="/about">Read our story</ArrowLink>
              </div>
            </RevealGroup>
          </div>

          <RevealGroup
            as="dl"
            stagger={0.1}
            className="grid grid-cols-2 self-start border-l border-t border-slate-900/[0.08] dark:border-white/10"
          >
            {ABOUT_FIGURES.map((figure) => (
              <div
                key={figure.label}
                data-reveal
                className="group border-b border-r border-slate-900/[0.08] p-4 transition-colors duration-300 hover:bg-mkt-canvas dark:border-white/10 sm:p-8"
              >
                <dt className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">{figure.label}</dt>
                <dd className={`${DISPLAY} mt-1.5 text-2xl font-bold tracking-[-0.03em] text-mkt-ink sm:text-4xl`}>
                  {figure.count ? <CountUp value={figure.value} /> : figure.value}
                </dd>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ---------------------------------------------------- Demo modal */}
      {demoModalOpen && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-title"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-mkt-navy/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setDemoModalOpen(false)}
        >
          <div
            data-dialog-panel
            className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] border border-white/10 bg-mkt-navy-surface text-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-[22px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-6 sm:px-8 sm:pt-8">
              <div>
                <h3 id="demo-title" className={`${DISPLAY} text-xl font-bold tracking-[-0.025em] sm:text-2xl`}>
                  One role, start to finish
                </h3>
                <p className="mt-2 text-[15px] text-white/70">
                  Follow one role from bulk upload to a ranked shortlist and a booked interview.
                </p>
              </div>
              <button
                ref={closeDemoRef}
                type="button"
                onClick={() => setDemoModalOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-[background-color,transform] duration-300 hover:rotate-90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                aria-label="Close demo"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-6 pt-4 sm:px-8 sm:pb-8">
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {[
                  { icon: Upload, text: "Bulk upload and parsing" },
                  { icon: Search, text: "Candidate scoring and ranking" },
                  { icon: Send, text: "Assessments sent automatically" },
                  { icon: Video, text: "Video interview analysis" },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} data-dialog-item className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3.5">
                    <Icon className="h-4 w-4 shrink-0 text-mkt-cyan" />
                    <span className="text-sm">{text}</span>
                  </li>
                ))}
              </ul>

              <div data-dialog-item className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Cta
                  href={signedIn ? DASHBOARD_HREF : TRIAL_LINK}
                  external={!signedIn}
                  variant="light"
                  size="sm"
                  className="h-11"
                >
                  {signedIn ? "Go to dashboard" : "Start free trial"}
                </Cta>
                <Cta href="/contact" variant="outlineLight" size="sm" arrow={null} className="h-11">
                  Schedule a live demo
                </Cta>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
