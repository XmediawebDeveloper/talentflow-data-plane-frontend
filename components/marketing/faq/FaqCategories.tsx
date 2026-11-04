"use client";

import { useEffect, useRef, useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import {
  ClipboardCheck,
  FileSearch,
  Mic,
  Plus,
  Rocket,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Cta } from "../Cta";
import { DISPLAY } from "../fonts";
import { RevealGroup } from "../motion";
import { FAQ_CATEGORIES, type FaqCategoryId } from "./faqData";

const ICONS: Record<FaqCategoryId, LucideIcon> = {
  "getting-started": Rocket,
  "resumes-matching": FileSearch,
  assessments: ClipboardCheck,
  "ai-interviews": Mic,
  "teams-security": ShieldCheck,
  "plans-units": Wallet,
};

/**
 * The FAQ, grouped. A category nav stays in reach — a chip rail under the
 * header on phones, a side list on desktop — and each group is its own
 * accordion, styled exactly like <MarketingFaq/>.
 */
export function FaqCategories() {
  const [active, setActive] = useState<FaqCategoryId>(FAQ_CATEGORIES[0].id);
  const rail = useRef<HTMLUListElement>(null);

  // On phones the chips scroll sideways: keep the current one in view.
  useEffect(() => {
    const list = rail.current;
    const chip = list?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (!list || !chip || list.scrollWidth <= list.clientWidth) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({
      left: chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [active]);

  // Highlight the category being read: the last one whose top has passed
  // the upper third of the viewport.
  useEffect(() => {
    const sections = FAQ_CATEGORIES.map((c) => document.getElementById(c.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        });
        const first = FAQ_CATEGORIES.find((c) => visible.has(c.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1.45fr)] lg:gap-16">
      {/* Category nav */}
      <nav
        aria-label="FAQ categories"
        className="sticky top-14 z-20 -mx-4 border-b border-slate-900/[0.07] bg-mkt-canvas/90 px-4 py-2.5 backdrop-blur-md dark:border-white/[0.08] sm:top-16 sm:-mx-6 sm:px-6 lg:top-28 lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
      >
        <ul ref={rail} className="relative -my-1 flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
          {FAQ_CATEGORIES.map((category) => {
            const Icon = ICONS[category.id];
            const current = category.id === active;
            return (
              <li key={category.id} data-chip={category.id} className="shrink-0">
                <a
                  href={`#${category.id}`}
                  aria-current={current ? "true" : undefined}
                  onClick={() => setActive(category.id)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid lg:rounded-lg lg:border-transparent lg:px-3 lg:py-2 lg:text-[15px] ${
                    current
                      ? "border-transparent bg-mkt-ink text-mkt-canvas lg:bg-mkt-surface lg:font-semibold lg:text-mkt-ink lg:shadow-sm"
                      : "border-slate-900/10 text-slate-600 hover:border-slate-900/25 hover:text-mkt-ink dark:border-white/15 dark:text-slate-300 lg:hover:bg-slate-900/[0.04] dark:lg:hover:bg-white/[0.05]"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {category.title}
                  <span
                    className={`hidden text-xs tabular-nums lg:ml-auto lg:inline ${
                      current ? "text-slate-500 dark:text-slate-400" : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    <span className="sr-only">, </span>
                    {category.items.length}
                    <span className="sr-only"> questions</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>

        {/* Contact path, always beside the questions on desktop */}
        <div className="mt-8 hidden rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-5 dark:border-white/10 lg:block">
          <p className={`${DISPLAY} text-base font-bold tracking-[-0.02em] text-mkt-ink`}>
            Can&apos;t find your answer?
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Ask our team directly.
          </p>
          <Cta href="/contact" variant="secondary" size="sm" arrow="upRight" className="mt-4">
            Contact us
          </Cta>
        </div>
      </nav>

      {/* Categories */}
      <div className="space-y-12 sm:space-y-16">
        {FAQ_CATEGORIES.map((category) => {
          const Icon = ICONS[category.id];
          const headingId = `${category.id}-heading`;
          return (
            <section
              key={category.id}
              id={category.id}
              aria-labelledby={headingId}
              className="scroll-mt-32 sm:scroll-mt-36 lg:scroll-mt-28"
            >
              <h2
                id={headingId}
                className={`${DISPLAY} flex items-center gap-3 text-[clamp(1.25rem,3vw,1.75rem)] font-bold leading-tight tracking-[-0.03em] text-mkt-ink`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mkt-accent/10 text-mkt-accent sm:h-10 sm:w-10"
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {category.title}
              </h2>

              <RevealGroup stagger={0.07} y={20} className="mt-4 sm:mt-6">
                <Accordion.Root
                  type="single"
                  collapsible
                  className="border-t border-slate-900/[0.08] dark:border-white/10"
                >
                  {category.items.map((item, index) => (
                    <Accordion.Item
                      key={item.q}
                      value={`${category.id}-${index}`}
                      data-reveal
                      className="group/item relative border-b border-slate-900/[0.08] dark:border-white/10"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute -top-px left-0 h-px w-full origin-left scale-x-0 bg-mkt-accent transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/item:scale-x-100 group-data-[state=open]/item:scale-x-100 motion-reduce:transition-none"
                      />
                      {/* Radix renders the header as an h3, under the category h2. */}
                      <Accordion.Header>
                          <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid sm:gap-6 sm:py-6">
                            <span
                              className={`${DISPLAY} text-sm font-semibold tracking-[-0.01em] text-mkt-ink transition-transform duration-300 ease-out group-hover:translate-x-1 motion-reduce:transition-none sm:text-lg`}
                            >
                              {item.q}
                            </span>
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-900/10 text-slate-500 transition-[background-color,color,border-color,scale] duration-300 ease-out group-hover:scale-105 group-hover:border-slate-900/25 group-hover:text-mkt-ink group-data-[state=open]:border-transparent group-data-[state=open]:bg-mkt-ink group-data-[state=open]:text-mkt-canvas dark:border-white/15 sm:h-8 sm:w-8">
                              <Plus
                                aria-hidden="true"
                                className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-data-[state=open]:rotate-[135deg] motion-reduce:transition-none"
                              />
                            </span>
                          </Accordion.Trigger>
                      </Accordion.Header>
                      <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none">
                        <p className="max-w-2xl pb-4 pr-9 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:pb-6 sm:pr-12 sm:text-[15px]">
                          {item.a}
                        </p>
                      </Accordion.Content>
                    </Accordion.Item>
                  ))}
                </Accordion.Root>
              </RevealGroup>
            </section>
          );
        })}
      </div>
    </div>
  );
}
