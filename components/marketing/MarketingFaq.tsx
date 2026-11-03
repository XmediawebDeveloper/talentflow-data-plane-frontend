"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import { Cta } from "./Cta";
import { RevealGroup, RevealHeading } from "./motion";
import { DISPLAY } from "./fonts";

/**
 * Questions people ask before they sign up. Every answer restates only what
 * the product and the pricing data already say — no new promises.
 */
function faqItems(trialDays: number | null) {
  const trial = trialDays ? `${trialDays} ${trialDays === 1 ? "day" : "days"}` : "a limited period";
  return [
    {
      q: "How does the free trial work?",
      a: `You get ${trial} on the trial plan with its own quotas for users, jobs and AI usage. No credit card is needed to start, and you can pick a paid plan whenever you're ready.`,
    },
    {
      q: "What do the plan limits cover?",
      a: "Each plan sets how many users and jobs you can have, plus how many resumes you can store and score, assessments you can send and AI interviews you can run. Every plan card lists its own numbers.",
    },
    {
      q: "Can I pay monthly or yearly?",
      a: "Where a plan is sold both ways, use the Monthly / Yearly switch to compare. Yearly prices show the saving against twelve monthly payments on each card.",
    },
    {
      q: "What if I run out of credits before my plan renews?",
      a: "Buy an add-on. Add-ons top up specific units, such as resume scores or AI interviews, without changing your plan.",
    },
    {
      q: "Does TalentFlow work for recruitment agencies?",
      a: "Yes. TalentFlow is built for agencies, in-house hiring teams and freelance recruiters, and there are plans for each.",
    },
    {
      q: "We need more than the largest plan offers.",
      a: "Talk to us about a Custom plan. It's sized to your team, with every feature from the paid plans.",
    },
  ];
}

export function MarketingFaq({
  trialDays = null,
  items: customItems,
  title = "Questions, answered",
  lead = "Can’t find what you need? Ask our team directly.",
}: {
  trialDays?: number | null;
  /** Replaces the default pricing questions (the /faq page has its own). */
  items?: Array<{ q: string; a: string }>;
  title?: string;
  lead?: string;
}) {
  const items = customItems ?? faqItems(trialDays);

  return (
    <div className="grid grid-cols-1 gap-7 sm:gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-16">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <RevealHeading
          text={title}
          className={`${DISPLAY} text-[clamp(1.6rem,4vw,2.5rem)] font-bold leading-[1.08] tracking-[-0.03em] text-mkt-ink`}
        />
        <RevealGroup>
          <p data-reveal className="mt-3 max-w-sm text-[15px] leading-relaxed sm:mt-4 sm:text-base text-slate-600 dark:text-slate-400">
            {lead}
          </p>
          <div data-reveal className="mt-4 sm:mt-6">
            <Cta href="/contact" variant="secondary" size="sm" arrow="upRight">
              Contact us
            </Cta>
          </div>
        </RevealGroup>
      </div>

      <RevealGroup stagger={0.07} y={20}>
        <Accordion.Root type="single" collapsible className="border-t border-slate-900/[0.08] dark:border-white/10">
          {items.map((item, index) => (
            <Accordion.Item
              key={item.q}
              value={`faq-${index}`}
              data-reveal
              className="group/item relative border-b border-slate-900/[0.08] dark:border-white/10"
            >
              {/* Hover / open rule that grows along the item's top edge. */}
              <span
                aria-hidden="true"
                className="absolute -top-px left-0 h-px w-full origin-left scale-x-0 bg-mkt-accent transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/item:scale-x-100 group-data-[state=open]/item:scale-x-100"
              />
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid sm:gap-6 sm:py-6">
                  <span className={`${DISPLAY} text-sm font-semibold tracking-[-0.01em] text-mkt-ink transition-transform duration-300 ease-out group-hover:translate-x-1 sm:text-lg`}>
                    {item.q}
                  </span>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-900/10 sm:h-8 sm:w-8 text-slate-500 transition-[transform,background-color,color,border-color] duration-300 group-hover:border-slate-900/25 group-hover:text-mkt-ink group-data-[state=open]:rotate-[135deg] group-data-[state=open]:border-transparent group-data-[state=open]:bg-mkt-ink group-data-[state=open]:text-mkt-canvas dark:border-white/15">
                    <Plus className="h-4 w-4" />
                  </span>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <p className="max-w-2xl pb-4 pr-9 text-sm leading-relaxed sm:pb-6 sm:text-[15px] text-slate-600 dark:text-slate-400 sm:pr-12">
                  {item.a}
                </p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </RevealGroup>
    </div>
  );
}
