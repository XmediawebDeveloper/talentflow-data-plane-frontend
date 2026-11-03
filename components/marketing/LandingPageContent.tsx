"use client";

import { ChevronRight } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { BillingToggle } from "./BillingToggle";
import { ArrowLink, Cta, TrialCta } from "./Cta";
import { FeatureShowcase } from "./FeatureShowcase";
import { BinaSection } from "./landing/BinaSection";
import { JdSection } from "./landing/JdSection";
import { TalentPoolSection } from "./landing/TalentPoolSection";
import { TeamsSection } from "./landing/TeamsSection";
import { UsagePoints } from "./landing/UsagePoints";
import { WhySection } from "./landing/WhySection";
import { RULE } from "./landing/shared";
import { display, DISPLAY } from "./fonts";
import { H2, LEAD, SECTION, SHELL } from "./layout";
import { MarketingFaq } from "./MarketingFaq";
import { FAQ_CATEGORIES } from "./faq/faqData";
import { MotionNoScript, PRE, RevealGroup, RevealHeading, Typewriter } from "./motion";
import { PLAN_RAIL, PLAN_RAIL_ITEM, PlanCard, SwipeHint } from "./PlanCard";
import { fetchMarketingPlans, type MarketingPlan } from "./plans";
import { DASHBOARD_HREF, useSignedIn } from "./session";
import { ShortlistDemo } from "./ShortlistDemo";

/* ------------------------------------------------------------------ *
 * Content (v2 website copy)
 * ------------------------------------------------------------------ */

/** v2 §1 design hint: the whole hire as one strip. */
const FLOW = ["JD", "Talent Match", "Scoring", "Assessment", "AI Interview", "Hire"];

/** v2 §2 — The Problem. */
const PROBLEMS = [
  "Hundreds of resumes, but only a handful really fit.",
  "Hours lost on screening calls that go nowhere.",
  "Every interviewer judges candidates differently.",
];

/** v2 §3 — How It Works. */
const STEPS = [
  { title: "Create the JD.", description: "AI writes it, or you paste your own." },
  { title: "Add resumes.", description: "Bulk upload up to 100 at a time." },
  { title: "Find the best fit.", description: "AI Talent Match ranks your whole database in seconds." },
  { title: "Score in depth.", description: "Every shortlisted resume gets a clear score with reasons." },
  { title: "Test skills.", description: "Send a proctored AI Assessment, coding round included." },
  { title: "AI Interview.", description: "Bina interviews by voice and hands you a full report." },
];

const FAQ_QUESTION_COUNT = FAQ_CATEGORIES.reduce((n, c) => n + c.items.length, 0);

/** One row of plans on the landing page; the rest live on /pricing. */
const VISIBLE_PLANS = 4;

/* ------------------------------------------------------------------ *
 * How it works — the track fills as the reader scrolls through it.
 * Vertical below lg, one horizontal row of six from lg.
 * ------------------------------------------------------------------ */

function Steps() {
  const root = useRef<HTMLOListElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { wide: "(min-width: 1024px)", motion: "(prefers-reduced-motion: no-preference)" },
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
    <ol ref={root} className="relative mt-8 grid gap-6 pl-9 sm:mt-16 sm:gap-8 sm:pl-10 lg:grid-cols-6 lg:gap-6 lg:pl-0">
      {/* Track: vertical below lg, horizontal from lg. */}
      <span aria-hidden="true" className="absolute bottom-2 left-[11px] top-2 w-px bg-slate-900/10 dark:bg-white/10 lg:hidden">
        <span data-track="y" className="block h-full w-full origin-top bg-mkt-accent" />
      </span>
      <span aria-hidden="true" className="absolute left-3 right-[calc(16.667%-2rem)] top-[11px] hidden h-px bg-slate-900/10 dark:bg-white/10 lg:block">
        <span data-track="x" className="block h-full w-full origin-left bg-mkt-accent" />
      </span>

      {STEPS.map((step, index) => (
        <li key={step.title} data-step className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-10 top-0 grid h-6 w-6 place-items-center rounded-full border border-slate-900/15 bg-mkt-canvas dark:border-white/20 lg:static"
          >
            <span data-dot className="h-2.5 w-2.5 rounded-full bg-mkt-accent" />
          </span>
          <div data-copy className="lg:mt-7">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Step {index + 1}</p>
            <h3 className={`${DISPLAY} mt-1 text-lg font-bold tracking-[-0.025em] text-mkt-ink sm:text-xl`}>{step.title}</h3>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-2 sm:text-[15px]">
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
  const [trialDays, setTrialDays] = useState<number | null>(null);
  const [plans, setPlans] = useState<MarketingPlan[]>([]);
  const [plansFailed, setPlansFailed] = useState(false);
  // Annual is the pricing page default, so the landing page opens the same way.
  const [isYearly, setIsYearly] = useState(true);
  const heroRef = useRef<HTMLElement>(null);

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

  const visiblePlans = plans.slice(0, VISIBLE_PLANS);
  const hiddenPlanCount = plans.length - visiblePlans.length;
  const annualSavePercent = plans.reduce(
    (best, plan) => Math.max(best, Math.round(plan.discountPercentage ?? 0)),
    0
  );
  const signedIn = useSignedIn();
  const startHref = signedIn ? DASHBOARD_HREF : "/signup";

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
              lines={["Hire the right people.", "Faster. With AI."]}
              className={`${DISPLAY} text-[clamp(2rem,6.4vw,4.75rem)] font-extrabold leading-[1] tracking-[-0.045em] text-mkt-ink`}
            />

            <RevealGroup immediate delay={0.55} stagger={0.12}>
              <p
                data-reveal
                data-pre
                className={`${PRE} mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 sm:mt-7 sm:text-xl`}
              >
                From job description to final interview on one platform. AI writes your JD, finds the
                best resumes, scores them, tests skills and interviews candidates, so your team only
                meets the best.
              </p>
              <div data-reveal data-pre className={`${PRE} mt-6 flex flex-col gap-2.5 sm:mt-9 sm:flex-row sm:gap-3`}>
                <Cta href={startHref} magnetic>
                  {signedIn ? "Go to dashboard" : "Start free trial"}
                </Cta>
                <Cta href="/demo" variant="secondary">
                  Book a demo
                </Cta>
              </div>
              <p data-reveal data-pre className={`${PRE} mt-3.5 text-xs text-slate-500 sm:mt-5 sm:text-sm dark:text-slate-400`}>
                Any industry · Any role · Pay only for what you use
              </p>
              <ol
                data-reveal
                data-pre
                aria-label="From JD to hire"
                className={`${PRE} mt-6 flex flex-wrap items-center gap-x-1 gap-y-2 sm:mt-9`}
              >
                {FLOW.map((stage, i) => (
                  <Fragment key={stage}>
                    <li
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold sm:px-3 sm:text-[13px] ${
                        i === FLOW.length - 1
                          ? "border-transparent bg-mkt-accent-solid text-white"
                          : i === 4
                            ? "border-mkt-accent/30 bg-mkt-accent/10 text-mkt-accent"
                            : "border-slate-900/10 bg-mkt-surface text-slate-700 dark:border-white/10 dark:text-slate-200"
                      }`}
                    >
                      {stage}
                    </li>
                    {i < FLOW.length - 1 && (
                      <li aria-hidden="true" className="text-slate-400 dark:text-slate-500">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </li>
                    )}
                  </Fragment>
                ))}
              </ol>
            </RevealGroup>
          </div>

          <div data-parallax className="mx-auto w-full max-w-lg lg:max-w-none">
            <ShortlistDemo />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- The problem */}
      <section aria-labelledby="problem-heading" className={`border-y ${RULE}`}>
        <div className={`${SHELL} grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,2.15fr)]`}>
          <div className="py-6 sm:py-10 lg:pr-10">
            <h2
              id="problem-heading"
              className={`${DISPLAY} text-2xl font-bold leading-[1.1] tracking-[-0.03em] text-mkt-ink sm:text-3xl`}
            >
              Hiring shouldn&apos;t take weeks.
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 sm:text-[15px]">
              TalentFlow fixes all three, with AI at every step.
            </p>
          </div>
          <RevealGroup as="ol" className="grid grid-cols-1 sm:grid-cols-3" stagger={0.1}>
            {PROBLEMS.map((problem, i) => (
              <li
                key={problem}
                data-reveal
                className={`border-t py-5 sm:border-l sm:px-6 sm:py-10 lg:border-t-0 lg:px-8 ${RULE} ${
                  i === 0 ? "sm:border-l-0 lg:border-l" : ""
                }`}
              >
                <span className={`${DISPLAY} text-sm font-bold tabular-nums text-mkt-accent`}>0{i + 1}</span>
                <p className="mt-1.5 text-[15px] leading-relaxed text-mkt-ink sm:text-base">{problem}</p>
              </li>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* -------------------------------------------------- How it works */}
      <section id="how-it-works" className={`${SECTION} border-b ${RULE} bg-mkt-surface`}>
        <div className={SHELL}>
          <RevealHeading text="From JD to hire, all with AI" className={H2} />
          <RevealGroup>
            <p data-reveal className={LEAD}>
              Six steps, one platform. AI does the heavy lifting at every one.
            </p>
          </RevealGroup>
          <Steps />
          <RevealGroup>
            <div data-reveal className="mt-8 flex flex-wrap items-center gap-3 sm:mt-12">
              <Cta href="/how-it-works" variant="secondary" size="sm">
                See how it works
              </Cta>
            </div>
          </RevealGroup>
        </div>
      </section>

      {/* ------------------------------------------------------ Features */}
      <div id="features" className="scroll-mt-16">
        <JdSection />
        <TalentPoolSection />

        <section aria-labelledby="modules-heading" className={SECTION}>
          <div className={SHELL}>
            <RevealHeading id="modules-heading" text="Screen less. Hire better." className={H2} />
            <RevealGroup>
              <p data-reveal className={LEAD}>
                Know exactly why a candidate fits, or why they don&apos;t. Then test real skills and
                interview, without leaving TalentFlow.
              </p>
              <div data-reveal className="mt-7 sm:mt-14">
                <FeatureShowcase />
              </div>
              <div data-reveal className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 sm:mt-10">
                <Cta href={startHref} variant="secondary" size="sm">
                  Score resumes now
                </Cta>
                <ArrowLink href="/features">Explore every feature</ArrowLink>
                <ArrowLink href="/demo">Book a demo</ArrowLink>
              </div>
            </RevealGroup>
          </div>
        </section>

        <BinaSection />
      </div>

      {/* ------------------------------------------------------- Pricing */}
      <section id="pricing" className={`${SECTION} border-t ${RULE}`}>
        <div className={SHELL}>
          <div className="flex flex-col gap-5 sm:gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <RevealHeading text="Start small. Grow when you're ready." className={H2} />
              <RevealGroup>
                <p data-reveal className={LEAD}>
                  Simple plans plus usage units, so you only pay for what you use.
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
                    ? `${hiddenPlanCount} more ${hiddenPlanCount === 1 ? "plan" : "plans"}, add-on unit packs and a Custom plan.`
                    : "Add-on unit packs and a Custom plan as you grow."}
                </p>
                <ArrowLink href="/pricing">See pricing</ArrowLink>
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
                    See pricing
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

          <UsagePoints />
        </div>
      </section>

      {/* ------------------------------------------------ Built for teams */}
      <div className={`border-y ${RULE} bg-mkt-surface`}>
        <TeamsSection />
      </div>

      {/* ------------------------------------- Why TalentFlow (#about) */}
      <WhySection />

      {/* ----------------------------------------------------------- FAQ */}
      <section id="faq" className={`${SECTION} border-t ${RULE}`}>
        <div className={SHELL}>
          <MarketingFaq trialDays={trialDays} />
          <div className="mt-8 flex justify-end sm:mt-10">
            <ArrowLink href="/faq">Browse all {FAQ_QUESTION_COUNT} questions</ArrowLink>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ Final CTA */}
      <section aria-labelledby="final-cta-heading" className="pb-12 sm:pb-24 lg:pb-28">
        <div className={SHELL}>
          <RevealGroup y={40}>
            <div data-reveal className="relative overflow-hidden rounded-[20px] bg-mkt-navy p-6 text-white dark:border dark:border-white/10 dark:bg-mkt-navy-surface sm:p-12 lg:p-16">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.28),transparent)] sm:h-[28rem] sm:w-[28rem]"
              />
              <div className="relative max-w-2xl">
                <h2
                  id="final-cta-heading"
                  className={`${DISPLAY} text-[clamp(1.5rem,3.8vw,2.75rem)] font-bold leading-[1.08] tracking-[-0.035em] text-balance`}
                >
                  Ready to hire smarter?
                </h2>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/70 sm:mt-4 sm:text-lg">
                  Let AI do the heavy lifting, so your team can focus on people.
                </p>
                <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
                  <TrialCta variant="light" />
                  <Cta href="/contact" variant="outlineLight" arrow="upRight">
                    Talk to sales
                  </Cta>
                </div>
              </div>
            </div>
          </RevealGroup>
        </div>
      </section>
    </div>
  );
}
