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
      className={`relative flex h-full flex-col rounded-2xl border p-6 pt-8 transition-colors sm:p-7 sm:pt-9 ${
        highlighted
          ? "border-[#ED881C]/40 bg-[#FFFFFF] ring-1 ring-[#ED881C]/25 dark:bg-white/[0.05]"
          : "border-slate-200/80 bg-[#FFFFFF] hover:border-[#0F3C99]/30 dark:border-white/10 dark:bg-white/[0.03]"
      }`}
    >
      <span
        className={`font-data absolute -top-3 left-6 inline-flex items-center rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${
          highlighted ? "bg-[#ED881C] text-[#08132E]" : "bg-[#0F3C99] text-white"
        }`}
      >
        {badge}
      </span>

      <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-[#08132E] dark:text-white">
        {plan.name}
      </h3>
      {plan.description && (
        <p className="mt-2 min-h-[2.5rem] text-sm text-slate-600 dark:text-slate-400">
          {plan.description}
        </p>
      )}

      <p className="font-data mt-5 flex items-baseline gap-1.5 text-3xl font-medium tabular-nums text-[#08132E] dark:text-white">
        {price.amount}
        {price.period && (
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
            {price.period}
          </span>
        )}
      </p>
      {price.wasAmount && (
        <p className="mt-1.5 flex items-center gap-2 text-sm">
          <span className="font-data text-slate-400 line-through dark:text-slate-500">
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
        <p className="mt-2 text-sm text-[#B45B0C] dark:text-[#F0A44E]">{price.unavailableNote}</p>
      )}

      {quotas.length > 0 && (
        <dl className="mt-6 space-y-2 border-y border-slate-100 py-4 text-sm dark:border-white/10">
          {quotas.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">{row.label}</dt>
              <dd className="font-data font-medium tabular-nums text-[#08132E] dark:text-white">
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
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#079CC4]" />
                {feature}
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2.5 pl-6 text-sm font-medium text-[#0F3C99] hover:underline dark:text-[#7BA4FF]"
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
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-semibold text-[#08132E] transition-colors hover:border-[#0F3C99]/40 hover:text-[#0F3C99] dark:border-white/15 dark:text-white dark:hover:border-white/30"
        >
          Contact sales
        </Link>
      ) : (
        <Link
          href={planCheckoutHref(plan, isYearly)}
          prefetch={false}
          className={`mt-6 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors ${
            highlighted
              ? "bg-[#0F3C99] text-white hover:bg-[#0E3B98]"
              : "border border-slate-300 text-[#08132E] hover:border-[#0F3C99]/40 hover:text-[#0F3C99] dark:border-white/15 dark:text-white dark:hover:border-white/30"
          }`}
        >
          {plan.isTrial ? "Start free trial" : "Get started"}
        </Link>
      )}
    </article>
  );
}
