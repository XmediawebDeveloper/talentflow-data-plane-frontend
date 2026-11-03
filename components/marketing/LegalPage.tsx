"use client";

import { useRef, useState } from "react";
import { ScrollTrigger, useGSAP } from "@/lib/gsap";
import { DISPLAY } from "./fonts";
import { SECTION, SHELL } from "./layout";
import { RevealGroup } from "./motion";
import { MarketingPage, PageHero } from "./PageShell";

export interface LegalSection {
  title: string;
  body: string;
}

/** Turns a plain email address inside policy text into a mailto link. */
function withMailto(text: string) {
  // Domain labels joined by single dots, so a sentence's closing full stop
  // stays outside the link.
  const parts = text.split(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g);
  return parts.map((part, i) =>
    /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/.test(part) ? (
      <a key={i} href={`mailto:${part}`} className="font-medium text-mkt-accent underline-offset-4 hover:underline">
        {part}
      </a>
    ) : (
      part
    )
  );
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Privacy / Terms layout: numbered sections (the order matters in a legal
 * document) with a sticky contents list on wide screens that follows along.
 */
export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      root.current!.querySelectorAll<HTMLElement>("[data-legal]").forEach((el, i) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top 40%",
          end: "bottom 40%",
          onToggle: (self) => {
            if (self.isActive) setActive(i);
          },
        });
      });
    },
    { scope: root }
  );

  return (
    <MarketingPage>
      <PageHero lines={[title]} lead={`Last updated: ${updated}`} />

      <section className={`${SECTION} border-t border-slate-900/[0.07] !pt-10 dark:border-white/[0.08] sm:!pt-16`}>
        <div ref={root} className={`${SHELL} grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] lg:gap-20`}>
          {/* Contents — desktop only */}
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-28">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">On this page</p>
              <ol className="mt-4 space-y-0.5 border-l border-slate-900/10 dark:border-white/10">
                {sections.map((section, i) => (
                  <li key={section.title}>
                    <a
                      href={`#${slug(section.title)}`}
                      aria-current={i === active ? "true" : undefined}
                      className={`-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors duration-300 ${
                        i === active
                          ? "border-mkt-accent font-semibold text-mkt-ink"
                          : "border-transparent text-slate-500 hover:border-slate-900/25 hover:text-mkt-ink dark:text-slate-400"
                      }`}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <RevealGroup stagger={0.05} y={18} className="max-w-3xl">
            {sections.map((section, i) => (
              <article
                key={section.title}
                id={slug(section.title)}
                data-legal
                data-reveal
                className="scroll-mt-24 border-b border-slate-900/[0.07] py-6 first:pt-0 last:border-b-0 dark:border-white/[0.08] sm:py-8"
              >
                <h2 className={`${DISPLAY} flex items-baseline gap-3 text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:text-2xl`}>
                  <span className="text-sm font-semibold tabular-nums text-mkt-accent sm:text-base">{i + 1}.</span>
                  {section.title}
                </h2>
                <p className="mt-2.5 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-3 sm:text-[17px]">
                  {withMailto(section.body)}
                </p>
              </article>
            ))}
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
