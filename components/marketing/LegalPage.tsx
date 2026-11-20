"use client";

import { useRef, useState, type ReactNode } from "react";
import { ScrollTrigger, useGSAP } from "@/lib/gsap";
import { DISPLAY } from "./fonts";
import { SECTION, SHELL } from "./layout";
import { RevealGroup } from "./motion";
import { MarketingPage, PageHero } from "./PageShell";

export interface LegalSection {
  title: string;
  body: string;
  /** Optional icon shown in a tile beside the section title. */
  icon?: ReactNode;
}

/** One plain-language summary card; it restates the policy, never adds to it. */
export interface LegalGlance {
  icon: ReactNode;
  title: string;
  body: string;
}

function AtAGlance({ items }: { items: LegalGlance[] }) {
  return (
    <section aria-labelledby="legal-glance" className="pb-8 sm:pb-12">
      <div className={SHELL}>
        <h2 id="legal-glance" className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
          At a glance
        </h2>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-3 sm:gap-3">
          {items.map(({ icon, title, body }) => (
            <li
              key={title}
              className="group relative overflow-hidden rounded-xl border border-slate-900/[0.07] bg-mkt-surface p-4 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-22px_rgba(8,31,92,0.45)] dark:border-white/[0.08] sm:rounded-2xl sm:p-5"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[radial-gradient(closest-side,var(--raw-rgba-7-156-196-0p14),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              {/* Phones: icon beside the heading. Wider: icon above it. */}
              <div className="flex items-center gap-2.5 sm:block">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-mkt-accent/10 text-mkt-accent sm:h-9 sm:w-9 [&_svg]:h-4 [&_svg]:w-4">
                  {icon}
                </span>
                <h3 className={`${DISPLAY} text-[15px] font-bold tracking-[-0.02em] text-mkt-ink sm:mt-3 sm:text-base`}>{title}</h3>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-1.5 sm:text-sm">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
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
  lead,
  actions,
  aside,
  glance,
  compact = false,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
  /** Hero summary; the "Last updated" date is shown beneath it. */
  lead?: ReactNode;
  actions?: ReactNode;
  /** Hero illustration beside the title on wide screens. */
  aside?: ReactNode;
  /** "At a glance" summary cards between the hero and the sections. */
  glance?: LegalGlance[];
  /** Smaller type and spacing, plus a scrollable contents row on phones. */
  compact?: boolean;
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
      <PageHero
        lines={[title]}
        lead={
          lead ? (
            <>
              {lead}
              <span className="mt-3 block text-sm font-medium text-slate-500 dark:text-slate-400">
                Last updated: {updated}
              </span>
            </>
          ) : (
            `Last updated: ${updated}`
          )
        }
        actions={actions}
        aside={aside}
        compact={compact}
      />

      {glance && <AtAGlance items={glance} />}

      <section
        className={`${SECTION} border-t border-slate-900/[0.07] dark:border-white/[0.08] ${
          compact ? "!pb-10 !pt-6 sm:!pb-16 sm:!pt-12" : "!pt-10 sm:!pt-16"
        }`}
      >
        <div ref={root} className={`${SHELL} grid grid-cols-1 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] ${compact ? "gap-4 lg:gap-16" : "gap-10 lg:gap-20"}`}>
          {/* Contents on phones/tablets: a row of chips that scrolls sideways. */}
          {compact && (
            <nav aria-label="On this page" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden">
              <ol className="flex w-max gap-2 pb-1">
                {sections.map((section, i) => (
                  <li key={section.title}>
                    <a
                      href={`#${slug(section.title)}`}
                      className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-900/10 bg-mkt-surface px-3 text-[13px] font-medium text-slate-600 transition-colors active:bg-slate-900/5 dark:border-white/10 dark:text-slate-300"
                    >
                      <span className="tabular-nums text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {/* Contents — desktop only */}
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-28">
              <p className={`${compact ? "text-[13px]" : "text-sm"} font-medium text-slate-500 dark:text-slate-400`}>On this page</p>
              <ol className="mt-4 space-y-0.5 border-l border-slate-900/10 dark:border-white/10">
                {sections.map((section, i) => (
                  <li key={section.title}>
                    <a
                      href={`#${slug(section.title)}`}
                      aria-current={i === active ? "true" : undefined}
                      className={`-ml-px block border-l-2 pl-4 transition-colors duration-300 ${compact ? "py-1 text-[13px]" : "py-1.5 text-sm"} ${
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
                className={`border-b border-slate-900/[0.07] first:pt-0 last:border-b-0 dark:border-white/[0.08] ${
                  compact ? "scroll-mt-20 py-5 sm:py-6" : "scroll-mt-24 py-6 sm:py-8"
                }`}
              >
                {section.icon ? (
                  <div className="group flex gap-3 sm:gap-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-mkt-accent/10 text-mkt-accent ring-1 ring-mkt-accent/15 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-105 sm:h-10 sm:w-10 sm:rounded-xl [&_svg]:h-4 [&_svg]:w-4 sm:[&_svg]:h-[18px] sm:[&_svg]:w-[18px]">
                      {section.icon}
                    </span>
                    <div className="min-w-0 pt-0.5 sm:pt-1">
                      <h2 className={`${DISPLAY} flex items-baseline gap-2 text-base font-bold leading-snug tracking-[-0.02em] text-mkt-ink sm:text-xl`}>
                        <span className="text-xs font-semibold tabular-nums text-slate-400 sm:text-sm">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {section.title}
                      </h2>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-2 sm:text-[15px]">
                        {withMailto(section.body)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className={`${DISPLAY} flex items-baseline gap-3 text-lg font-bold tracking-[-0.02em] text-mkt-ink sm:text-2xl`}>
                      <span className="text-sm font-semibold tabular-nums text-mkt-accent sm:text-base">{i + 1}.</span>
                      {section.title}
                    </h2>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-3 sm:text-[17px]">
                      {withMailto(section.body)}
                    </p>
                  </>
                )}
              </article>
            ))}
          </RevealGroup>
        </div>
      </section>
    </MarketingPage>
  );
}
