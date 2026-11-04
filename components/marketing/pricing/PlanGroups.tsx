"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Building2, Gift, LayoutGrid, Rocket, TrendingUp, type LucideIcon } from "lucide-react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { DISPLAY } from "../fonts";
import { PLAN_RAIL, PLAN_RAIL_ITEM, PlanCard, SwipeHint } from "../PlanCard";
import type { MarketingPlan } from "../plans";

/* ------------------------------------------------------------------ *
 * Plan types
 *
 * Plans arrive from the API with a tier (STARTER / PROFESSIONAL /
 * ENTERPRISE …) and a trial flag. Each tier becomes a tab; a featured
 * plan stays in its own tier and is marked by PlanCard's Recommended label.
 * ------------------------------------------------------------------ */

type GroupId = string;

interface GroupMeta {
  label: string;
  blurb: string;
  icon: LucideIcon;
  /** Icon tile + count badge colours. */
  tone: string;
}

const TIER_META: Record<string, GroupMeta> = {
  trial: {
    label: "Free Trial",
    blurb: "Try the platform before you pick a plan.",
    icon: Gift,
    tone: "bg-mkt-amber/15 text-mkt-amber-ink",
  },
  STARTER: {
    label: "Starter",
    blurb: "Get going with the essentials.",
    icon: Rocket,
    tone: "bg-mkt-cyan/15 text-mkt-cyan-ink",
  },
  PROFESSIONAL: {
    label: "Professional",
    blurb: "More room as your hiring grows.",
    icon: TrendingUp,
    tone: "bg-mkt-accent-solid/10 text-mkt-accent",
  },
  ENTERPRISE: {
    label: "Enterprise",
    blurb: "For large hiring teams, with API access.",
    icon: Building2,
    tone: "bg-slate-900/[0.07] text-mkt-ink dark:bg-white/10",
  },
};

const TIER_ORDER = ["STARTER", "PROFESSIONAL", "ENTERPRISE"];

function metaFor(tier: string): GroupMeta {
  return (
    TIER_META[tier] ?? {
      label: tier.charAt(0) + tier.slice(1).toLowerCase(),
      blurb: "More ways to buy TalentFlow.",
      icon: LayoutGrid,
      tone: "bg-slate-900/[0.07] text-mkt-ink dark:bg-white/10",
    }
  );
}

const tierOf = (plan: MarketingPlan) => (plan.isTrial ? "trial" : (plan.tier || "OTHER").toUpperCase());

/** One fixed column grid for every tier, so every card is the same width
 *  and rows fill from the left, whatever the number of plans. */
const GRID_COLS = "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

const plural = (n: number) => `${n} ${n === 1 ? "plan" : "plans"}`;

/* ------------------------------------------------------------------ */

function GroupHeader({ meta, count }: { meta: GroupMeta; count: number }) {
  const Icon = meta.icon;
  return (
    <div data-group-head className="flex items-center gap-3 sm:gap-4">
      <span data-group-icon aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-12 sm:w-12 ${meta.tone}`}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
      <div className="min-w-0">
        <h3 className={`${DISPLAY} flex flex-wrap items-baseline gap-x-2.5 text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:text-2xl`}>
          {meta.label}
          <span className="text-xs font-semibold tracking-normal text-slate-500 dark:text-slate-400 sm:text-sm">{plural(count)}</span>
        </h3>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 sm:text-[15px]">{meta.blurb}</p>
      </div>
      <span aria-hidden="true" data-group-rule className="ml-2 hidden h-px flex-1 origin-left bg-slate-900/[0.08] dark:bg-white/10 sm:block" />
    </div>
  );
}

function CardGrid({ plans, isYearly }: { plans: MarketingPlan[]; isYearly: boolean }) {
  return (
    <>
      <div className={`mt-5 sm:mt-7 ${PLAN_RAIL} ${GRID_COLS}`}>
        {plans.map((plan) => (
          <div key={plan.id} data-plan-card className={`${PLAN_RAIL_ITEM} [transform-style:preserve-3d]`}>
            <PlanCard plan={plan} isYearly={isYearly} />
          </div>
        ))}
      </div>
      <SwipeHint count={plans.length} />
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Plans separated by type: a sticky switcher shows one tier at a time.
 * Opens on the tier holding the recommended plan, else the first tier.
 */
export function PlanGroups({ plans, isYearly }: { plans: MarketingPlan[]; isYearly: boolean }) {
  const groups = useMemo(() => {
    const byTier = new Map<string, MarketingPlan[]>();
    for (const plan of plans) {
      const key = tierOf(plan);
      byTier.set(key, [...(byTier.get(key) ?? []), plan]);
    }
    const order = [
      "trial",
      ...TIER_ORDER,
      ...[...byTier.keys()].filter((k) => k !== "trial" && !TIER_ORDER.includes(k)),
    ];
    const tiers = order.filter((k) => byTier.has(k)).map((k) => ({ id: k, meta: metaFor(k), plans: byTier.get(k)! }));
    return tiers;
  }, [plans]);

  const tabs = groups.map((t) => ({ id: t.id, label: t.meta.label, count: t.plans.length, icon: t.meta.icon }));

  const defaultTab =
    groups.find((t) => t.plans.some((p) => p.featured && !p.isTrial))?.id ?? groups[0]?.id ?? "";
  const [picked, setActive] = useState<GroupId | null>(null);
  // Fall back if the picked tier disappears after a refetch.
  const active = picked && groups.some((t) => t.id === picked) ? picked : defaultTab;
  const rootRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const switching = useRef(false);
  const firstRun = useRef(true);

  const reduceMotion = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Sliding pill behind the active type. */
  useLayoutEffect(() => {
    const bar = tabsRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;
    const place = (animate: boolean) => {
      const btn = bar.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!btn) return;
      const to = { x: btn.offsetLeft, width: btn.offsetWidth, autoAlpha: 1 };
      if (!animate || reduceMotion()) gsap.set(pill, to);
      else gsap.to(pill, { ...to, duration: 0.6, ease: "elastic.out(1, 0.8)" });
      // Keep the chosen chip in view on the phone rail.
      btn.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
    };
    place(!firstRun.current);
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, tabs.length]);

  /* Enter animations: on first view the groups build as they scroll in;
     after a switch, the new set rises in at once. */
  useGSAP(
    () => {
      const root = contentRef.current;
      if (!root || reduceMotion()) {
        firstRun.current = false;
        return;
      }
      const cards = gsap.utils.toArray<HTMLElement>("[data-plan-card]", root);
      const heads = gsap.utils.toArray<HTMLElement>("[data-group-head]", root);
      const icons = gsap.utils.toArray<HTMLElement>("[data-group-icon]", root);
      const rules = gsap.utils.toArray<HTMLElement>("[data-group-rule]", root);
      const cardFrom = { y: 56, autoAlpha: 0, rotateX: -10, scale: 0.96, transformPerspective: 1000, transformOrigin: "50% 0%" };
      const cardTo = { y: 0, autoAlpha: 1, rotateX: 0, scale: 1, duration: 0.8, ease: "power3.out", stagger: 0.07 };

      if (firstRun.current) {
        firstRun.current = false;
        gsap.set(cards, cardFrom);
        ScrollTrigger.batch(cards, { start: "top 92%", once: true, onEnter: (batch) => gsap.to(batch, cardTo) });
        heads.forEach((head) =>
          gsap.from(head, { y: 24, autoAlpha: 0, duration: 0.6, scrollTrigger: { trigger: head, start: "top 90%", once: true } })
        );
        icons.forEach((icon) =>
          gsap.from(icon, {
            scale: 0.4,
            rotate: -25,
            duration: 0.7,
            ease: "back.out(2.2)",
            scrollTrigger: { trigger: icon, start: "top 90%", once: true },
          })
        );
        rules.forEach((rule) =>
          gsap.from(rule, { scaleX: 0, duration: 1, ease: "power3.inOut", scrollTrigger: { trigger: rule, start: "top 90%", once: true } })
        );
      } else {
        const tl = gsap.timeline();
        tl.from(heads, { y: 20, autoAlpha: 0, duration: 0.45, stagger: 0.08 })
          .from(icons, { scale: 0.4, rotate: -25, duration: 0.6, ease: "back.out(2.2)", stagger: 0.08 }, 0)
          .from(rules, { scaleX: 0, duration: 0.8, ease: "power3.inOut" }, 0.1)
          .fromTo(cards, cardFrom, { ...cardTo, stagger: 0.05, duration: 0.65 }, 0.08);
        ScrollTrigger.refresh();
      }
    },
    { scope: contentRef, dependencies: [active], revertOnUpdate: true }
  );

  /* Switching: the current set drops away, then the next one rises in. */
  const select = (id: GroupId) => {
    if (id === active || switching.current) return;
    const root = contentRef.current;
    const section = rootRef.current;
    // If the reader is deep in a long list, bring the switcher back into view.
    if (section && section.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 80, behavior: reduceMotion() ? "auto" : "smooth" });
    }
    if (!root || reduceMotion()) {
      setActive(id);
      return;
    }
    switching.current = true;
    gsap.to(root.querySelectorAll("[data-plan-card], [data-group-head]"), {
      y: -14,
      autoAlpha: 0,
      scale: 0.98,
      duration: 0.22,
      ease: "power2.in",
      stagger: 0.015,
      onComplete: () => {
        switching.current = false;
        setActive(id);
      },
    });
  };

  const visibleTiers = groups.filter((t) => t.id === active);
  const shownCount = visibleTiers.reduce((n, t) => n + t.plans.length, 0);

  return (
    <div ref={rootRef}>
      {/* Type switcher — sticks under the header while the list scrolls. */}
      <div className="sticky top-14 z-20 -mx-4 mb-6 bg-mkt-canvas/85 px-4 py-3 backdrop-blur-xl sm:top-16 sm:mx-0 sm:mb-10 sm:rounded-full sm:px-0 sm:py-2 sm:bg-transparent sm:backdrop-blur-none">
        <div
          ref={tabsRef}
          role="group"
          aria-label="Plan type"
          className="relative flex gap-1 overflow-x-auto rounded-full border border-slate-900/[0.08] bg-mkt-surface p-1 [scrollbar-width:none] dark:border-white/10 max-sm:[mask-image:linear-gradient(to_right,#000_82%,transparent)] sm:inline-flex sm:max-w-full sm:shadow-[0_12px_32px_-24px_rgba(8,19,46,0.45)] [&::-webkit-scrollbar]:hidden"
        >
          <span
            ref={pillRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-1 h-[calc(100%-0.5rem)] rounded-full bg-mkt-ink opacity-0 shadow-[0_8px_20px_-10px_rgba(8,19,46,0.6)]"
          />
          {tabs.map(({ id, label, count, icon: Icon }) => {
            const on = active === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => select(id)}
                className={`group relative z-10 inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid sm:px-4 ${
                  on ? "text-mkt-canvas" : "text-slate-600 hover:text-mkt-ink dark:text-slate-300"
                }`}
              >
                <Icon
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-rotate-12 group-hover:scale-110"
                />
                {label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums leading-none transition-colors duration-300 ${
                    on ? "bg-white/20 text-mkt-canvas dark:bg-slate-900/20" : "bg-slate-900/[0.06] text-slate-500 dark:bg-white/10 dark:text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Showing {plural(shownCount)}
      </p>

      <div ref={contentRef} className="space-y-14 sm:space-y-20">
        {visibleTiers.map((tier) => (
          <section key={tier.id} aria-label={`${tier.meta.label} plans`}>
            <GroupHeader meta={tier.meta} count={tier.plans.length} />
            <CardGrid plans={tier.plans} isYearly={isYearly} />
          </section>
        ))}
      </div>
    </div>
  );
}
