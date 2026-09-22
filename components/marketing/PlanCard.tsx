"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import {
  planAvailability,
  planCheckoutHref,
  planPrice,
  planQuotaRows,
  type MarketingPlan,
} from "./plans";

const VISIBLE_FEATURES = 4;

/**
 * The pricing page's plan card — badge, price, quotas, features and the same
 * signup link — drawn in the landing page's palette.
 */
export function PlanCard({ plan, isYearly }: { plan: MarketingPlan; isYearly: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const price = planPrice(plan, isYearly);
  const quotas = planQuotaRows(plan, isYearly);
  const { hasMonthly, hasAnnual } = planAvailability(plan);
  const unavailable =
    !plan.isTrial && !price.contactSales && ((isYearly && !hasAnnual) || (!isYearly && !hasMonthly));

  const shownFeatures = expanded ? plan.features : plan.features.slice(0, VISIBLE_FEATURES);
  const hiddenCount = plan.features.length - shownFeatures.length;

  const badge = plan.isTrial ? "Free trial" : plan.tier || plan.name;
  const highlighted = plan.isTrial || plan.featured;

  return (
    <article
      // Amber is the hover state for every card, featured or not — a response
      // to the pointer rather than permanent decoration. The dark: twin is
      // needed because dark:border-white/10 below would otherwise hold the
      // resting colour through the hover.
      className={`relative flex h-full flex-col rounded-2xl border p-6 pt-8 transition-colors hover:border-mkt-amber dark:hover:border-mkt-amber sm:p-7 sm:pt-9 ${
        /* At rest every card shares the same neutral border; the featured one
           is marked by its badge and lift instead. */
        highlighted
          ? "border-slate-200/80 bg-mkt-surface shadow-[0_18px_44px_-26px_rgba(237,136,28,0.65)] dark:border-white/10 dark:bg-white/[0.05]"
          : "border-slate-200/80 bg-mkt-surface dark:border-white/10 dark:bg-white/[0.03]"
      }`}
    >
      <span
        className={`absolute -top-3 left-6 inline-flex items-center rounded-full px-3 py-1 text-2xs font-semibold uppercase tracking-[0.14em] ${
          highlighted ? "bg-mkt-amber text-mkt-ink" : "bg-mkt-accent-solid text-white"
        }`}
      >
        {badge}
      </span>

      <h3 className="text-xl font-bold tracking-[-0.02em] text-mkt-ink">
        {plan.name}
      </h3>
      {plan.description && (
        <p className="mt-2 min-h-[2.5rem] text-sm text-slate-600 dark:text-slate-400">
          {plan.description}
        </p>
      )}

      <p className="mt-5 flex items-baseline gap-1.5 text-3xl font-extrabold tabular-nums tracking-[-0.02em] text-mkt-ink">
        {price.amount}
        {price.period && (
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
            {price.period}
          </span>
        )}
      </p>
      {price.wasAmount && (
        <p className="mt-1.5 flex items-center gap-2 text-sm">
          <span className="tabular-nums text-slate-400 line-through dark:text-slate-500">
            {price.wasAmount}
          </span>
          {price.savePercent !== null && (
            <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
              Save {price.savePercent}%
            </span>
          )}
        </p>
      )}
      {price.unavailableNote && (
        <p className="mt-2 text-sm text-mkt-amber-ink">{price.unavailableNote}</p>
      )}

      {quotas.length > 0 && (
        <dl className="mt-6 space-y-2 border-y border-slate-100 py-4 text-sm dark:border-white/10">
          {quotas.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">{row.label}</dt>
              <dd className="font-semibold tabular-nums text-mkt-ink">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {plan.features.length > 0 && (
        <div className="mt-6">
          <ul className="space-y-2.5">
            {shownFeatures.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-mkt-cyan" />
                {feature}
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2.5 pl-6 text-sm font-medium text-mkt-accent hover:underline"
            >
              +{hiddenCount} more {hiddenCount === 1 ? "feature" : "features"}
            </button>
          )}
          {expanded && plan.features.length > VISIBLE_FEATURES && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-2.5 pl-6 text-sm font-medium text-slate-500 hover:underline dark:text-slate-400"
            >
              Show less
            </button>
          )}
        </div>
      )}

      <div className="flex-grow" />

      {unavailable ? (
        <button
          type="button"
          disabled
          className="mt-6 h-11 w-full cursor-not-allowed rounded-xl bg-slate-200 text-sm font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-500"
        >
          Not available
        </button>
      ) : price.contactSales ? (
        <Link
          href="/contact"
          prefetch={false}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-semibold text-mkt-ink transition-colors hover:border-mkt-accent/40 hover:text-mkt-accent dark:border-white/15 dark:hover:border-white/30"
        >
          Contact sales
        </Link>
      ) : (
        <Link
          href={planCheckoutHref(plan, isYearly)}
          prefetch={false}
          className={`mt-6 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors ${
            highlighted
              ? "bg-mkt-accent-solid text-white hover:bg-mkt-accent-solid-hover"
              : "border border-slate-300 text-mkt-ink hover:border-mkt-accent/40 hover:text-mkt-accent dark:border-white/15 dark:hover:border-white/30"
          }`}
        >
          {plan.isTrial ? "Start free trial" : "Get started"}
        </Link>
      )}
    </article>
  );
}
