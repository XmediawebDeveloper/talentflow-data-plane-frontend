"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import { Cta } from "./Cta";
import { RevealGroup, RevealHeading } from "./motion";
import { DISPLAY } from "./fonts";

/**
 * The six FAQs from the website content (v2, Section 14). The trial length is
 * only mentioned when it comes from the pricing API — never hard-coded.
 */
function faqItems(trialDays: number | null) {
  const trial = trialDays ? ` of ${trialDays} ${trialDays === 1 ? "day" : "days"}` : "";
  return [
    {
      q: "Can I try it free?",
      a: `Yes. Start with a free trial${trial}.`,
    },
    {
      q: "Which file types can I upload?",
      a: "PDF, DOC, DOCX, RTF and TXT, up to 3 MB each and 100 at a time.",
    },
    {
      q: "Is the AI interview a live call?",
      a: "No. Candidates talk with Bina, our AI interviewer, whenever it suits them. You review the recording and report later.",
    },
    {
      q: "Can candidates cheat?",
      a: "Assessments and interviews include identity checks, recording and proctoring, and every violation is flagged with a risk level.",
    },
    {
      q: "Does it work outside IT?",
      a: "Yes. TalentFlow works for any industry and any role.",
    },
    {
      q: "How is pricing calculated?",
      a: "A plan plus usage units. Top up anytime.",
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
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-900/10 sm:h-8 sm:w-8 text-slate-500 transition-[background-color,color,border-color,scale] duration-300 ease-out group-hover:scale-105 group-hover:border-slate-900/25 group-hover:text-mkt-ink group-data-[state=open]:border-transparent group-data-[state=open]:bg-mkt-ink group-data-[state=open]:text-mkt-canvas dark:border-white/15">
                    {/* + turns into × with a slight overshoot, so the state change reads as motion. */}
                    <Plus className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-data-[state=open]:rotate-[135deg] motion-reduce:transition-none" />
                  </span>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none">
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
