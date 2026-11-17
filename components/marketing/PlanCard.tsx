"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { gsap, useGSAP, withMotion } from "@/lib/gsap";
import { DISPLAY } from "./fonts";
import {
  planAvailability,
  planCheckoutHref,
  planPrice,
  planQuotaRows,
  type MarketingPlan,
} from "./plans";

const VISIBLE_FEATURES = 4;

/**
 * One plan: price, quotas, features and the signup link. Shared by the landing
 * page and the pricing page so the two always show the same thing.
 *
 * A featured plan keeps the same light surface as the others and is marked out
 * by an accent border, its "Recommended" label and the primary CTA. The price rolls when the billing period
 * changes, so the eye sees which numbers moved.
 */
export function PlanCard({
  plan,
  isYearly,
}: {
  plan: MarketingPlan;
  isYearly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const priceRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const price = planPrice(plan, isYearly);
  const quotas = planQuotaRows(plan, isYearly);
  const { hasMonthly, hasAnnual } = planAvailability(plan);
  const unavailable =
    !plan.isTrial && !price.contactSales && ((isYearly && !hasAnnual) || (!isYearly && !hasMonthly));

  const shownFeatures = expanded ? plan.features : plan.features.slice(0, VISIBLE_FEATURES);
  const hiddenCount = plan.features.length - shownFeatures.length;

  const featured = plan.featured && !plan.isTrial;
  const primaryCta = plan.isTrial || plan.featured;
  const label = plan.isTrial ? "Free trial" : plan.featured ? "Recommended" : plan.tier || null;

  useGSAP(
    () => {
      if (firstRender.current) {
        firstRender.current = false;
        return;
      }
      withMotion(() => {
        gsap.fromTo(
          priceRef.current!.children,
          { yPercent: 35, autoAlpha: 0 },
          { yPercent: 0, autoAlpha: 1, duration: 0.4, stagger: 0.04, ease: "power3.out" }
        );
      });
    },
    { dependencies: [isYearly] }
  );

  const tone = {
    card: featured
      ? "bg-mkt-surface text-mkt-ink border-mkt-accent-solid/45 ring-1 ring-mkt-accent-solid/20"
      : "bg-mkt-surface text-mkt-ink border-slate-900/[0.08] dark:border-white/10",
    title: "text-mkt-ink",
    body: "text-slate-600 dark:text-slate-400",
    muted: "text-slate-500 dark:text-slate-400",
    rule: "border-slate-900/[0.07] dark:border-white/10",
    check: "text-mkt-cyan",
    label: plan.isTrial
      ? "bg-mkt-amber/15 text-mkt-amber-ink"
      : featured
        ? "bg-mkt-accent-solid/10 text-mkt-accent"
        : "bg-slate-900/[0.05] text-slate-600 dark:bg-white/10 dark:text-slate-300",
    link: "text-mkt-accent hover:underline",
  };

  const ctaBase =
    "mt-5 inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold sm:mt-7 sm:h-11 transition-[scale,background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid focus-visible:ring-offset-2 focus-visible:ring-offset-mkt-surface active:scale-[0.98] group/cta gap-2";
  const ctaPrimary = "bg-mkt-accent-solid text-white hover:bg-mkt-accent-solid-hover";
  const ctaSecondary =
    "border border-slate-900/15 text-mkt-ink hover:border-slate-900/30 dark:border-white/15 dark:hover:border-white/30";

  return (
    <article
      className={`relative flex h-full flex-col rounded-[20px] border p-5 transition-[translate,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1.5 hover:shadow-[0_28px_56px_-30px_rgba(15,60,153,0.5)] sm:p-7 ${tone.card}`}
    >
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 className={`${DISPLAY} text-base font-bold tracking-[-0.01em] sm:text-lg ${tone.title}`}>{plan.name}</h3>
        {label && label !== plan.name && (
          <span className={`inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold first-letter:uppercase ${tone.label}`}>
            {label.toLowerCase()}
          </span>
        )}
      </div>
      {plan.description && (
        <p className={`mt-1.5 min-h-[2.5rem] text-[13px] leading-relaxed sm:mt-2 sm:text-sm ${tone.body}`}>{plan.description}</p>
      )}

      <div ref={priceRef} className="mt-4 min-h-[3.75rem] sm:mt-6 sm:min-h-[4.25rem]">
        <p className={`${DISPLAY} flex flex-wrap items-baseline gap-x-1.5 text-[1.75rem] font-extrabold sm:text-[2.1rem] leading-none tracking-[-0.03em] tabular-nums ${tone.title}`}>
          {price.amount}
          {price.period && <span className={`text-sm font-medium tracking-normal ${tone.muted}`}>{price.period}</span>}
        </p>
        {price.wasAmount ? (
          <p className="mt-2 flex items-center gap-2 text-sm">
            <span className={`tabular-nums line-through ${tone.muted}`}>{price.wasAmount}</span>
            {price.savePercent !== null && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Save {price.savePercent}%
              </span>
            )}
          </p>
        ) : price.unavailableNote ? (
          <p className="mt-2 text-sm text-mkt-amber-ink">{price.unavailableNote}</p>
        ) : null}
      </div>

      {quotas.length > 0 && (
        <dl className={`mt-4 space-y-2 border-y py-3.5 text-[13px] sm:mt-6 sm:space-y-2.5 sm:py-4 sm:text-sm ${tone.rule}`}>
          {quotas.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className={tone.muted}>{row.label}</dt>
              <dd className={`font-semibold tabular-nums ${tone.title}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {plan.features.length > 0 && (
        <div className="mt-4 sm:mt-6">
          <ul className="space-y-2 sm:space-y-2.5">
            {shownFeatures.map((feature) => (
              <li key={feature} className={`flex items-start gap-2 text-[13px] sm:gap-2.5 sm:text-sm ${tone.body}`}>
                <Check className={`mt-0.5 h-4 w-4 shrink-0 ${tone.check}`} strokeWidth={2.5} />
                {feature}
              </li>
            ))}
          </ul>
          {(hiddenCount > 0 || (expanded && plan.features.length > VISIBLE_FEATURES)) && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className={`mt-2.5 rounded pl-6 text-[13px] font-medium sm:mt-3 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid ${tone.link}`}
            >
              {expanded ? "Show fewer" : `Show ${hiddenCount} more ${hiddenCount === 1 ? "feature" : "features"}`}
            </button>
          )}
        </div>
      )}

      <div className="flex-grow" />

      {unavailable ? (
        <button
          type="button"
          disabled
          className="mt-5 h-10 w-full cursor-not-allowed sm:mt-7 sm:h-11 rounded-full bg-slate-900/[0.06] text-sm font-semibold text-slate-500 dark:bg-white/10"
        >
          Not available
        </button>
      ) : price.contactSales ? (
        <Link href="/contact" prefetch={false} className={`${ctaBase} ${ctaSecondary}`}>
          Contact sales
        </Link>
      ) : (
        <Link
          // Opens the sign-up page with this plan and billing period selected.
          href={planCheckoutHref(plan, isYearly)}
          prefetch={false}
          className={`${ctaBase} ${primaryCta ? ctaPrimary : ctaSecondary}`}
        >
          {plan.isTrial ? "Start free trial" : "Get started"}
          <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-out group-hover/cta:translate-x-1" />
        </Link>
      )}
    </article>
  );
}

/**
 * Plan list layout. On phones the cards sit in a sideways swipe rail (each
 * ~84% wide so the next one peeks in) instead of a very tall stack; from
 * `sm` up it is a normal grid. Add the grid's column classes alongside.
 */
export const PLAN_RAIL =
  "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:snap-none sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0";
export const PLAN_RAIL_ITEM = "h-full w-[84%] shrink-0 snap-start sm:w-auto";

/** Phone-only hint under the rail. */
export function SwipeHint({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:hidden">
      Swipe to compare all {count} plans
      <ArrowRight className="h-3.5 w-3.5" />
    </p>
  );
}
