"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowUp, ArrowUpRight } from "lucide-react";
import { gsap, useGSAP } from "@/lib/gsap";
import { Cta } from "./Cta";
import { display, DISPLAY } from "./fonts";
import { RevealGroup, RevealHeading } from "./motion";
import { DASHBOARD_HREF, useSignedIn } from "./session";

const TRIAL_LINK = `https://${process.env.NEXT_PUBLIC_BASE_DOMAIN}/signup?plan=free_trial`;

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Request a demo", href: "/demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
    ],
  },
];

const WORDMARK = "TalentFlow";

/** A footer link: brightens on hover while a small arrow slides in. */
function FooterLink({ label, href }: { label: string; href: string }) {
  const className =
    "group inline-flex items-center gap-1 rounded text-sm text-white/60 sm:text-[15px] transition-colors duration-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50";
  const inner = (
    <>
      <span className="transition-transform duration-300 ease-out group-hover:translate-x-0.5">{label}</span>
      <ArrowUpRight className="h-3.5 w-3.5 -translate-x-1 translate-y-0.5 opacity-0 transition-[opacity,translate] duration-300 ease-out group-hover:translate-x-0.5 group-hover:translate-y-0 group-hover:opacity-100" />
    </>
  );
  return (
    <Link href={href} prefetch={false} className={className}>
      {inner}
    </Link>
  );
}

/**
 * Footer for the redesigned landing and pricing pages: the closing pitch,
 * site links, and a wordmark that rises out of the bottom edge.
 */
export function SiteFooter() {
  const root = useRef<HTMLElement>(null);
  const signedIn = useSignedIn();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-letter]", {
          yPercent: 100,
          duration: 1.1,
          ease: "power4.out",
          stagger: 0.045,
          scrollTrigger: { trigger: "[data-wordmark]", start: "top 95%", once: true },
        });
        gsap.to("[data-footer-glow]", {
          xPercent: 20,
          yPercent: -10,
          duration: 10,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
      });
    },
    { scope: root }
  );

  const backToTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <footer
      ref={root}
      className={`${display.variable} relative isolate overflow-hidden bg-mkt-navy text-white`}
    >
      <div
        data-footer-glow
        aria-hidden="true"
        className="pointer-events-none absolute -left-48 -top-48 -z-10 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.22),transparent)]"
      />

      <div className="mx-auto w-full max-w-[1200px] xl:max-w-[1320px] 2xl:max-w-[1480px] px-4 sm:px-6 lg:px-8">
        {/* Closing pitch + links */}
        <div className="grid grid-cols-1 gap-10 pb-10 pt-12 sm:gap-14 sm:pb-14 sm:pt-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20 lg:pb-20">
          <div>
            <RevealHeading
              text="Ready to hire smarter?"
              className={`${DISPLAY} max-w-xl text-[clamp(1.75rem,4.6vw,3.5rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-balance`}
            />
            <RevealGroup stagger={0.1}>
              <p data-reveal className="mt-3 max-w-md text-[15px] leading-relaxed text-white/65 sm:mt-5 sm:text-lg">
                Let AI do the heavy lifting, so your team can focus on people.
              </p>
              <div data-reveal className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
                <Cta
                  href={signedIn ? DASHBOARD_HREF : TRIAL_LINK}
                  external={!signedIn}
                  variant="light"
                  magnetic
                  className="w-full sm:w-auto"
                >
                  {signedIn ? "Go to dashboard" : "Start free trial"}
                </Cta>
                <Cta href="/contact" variant="outlineLight" arrow="upRight" className="w-full sm:w-auto">
                  Talk to Sales
                </Cta>
              </div>
            </RevealGroup>
          </div>

          <RevealGroup
            stagger={0.08}
            className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 sm:gap-y-10 lg:pt-3"
          >
            {COLUMNS.map((column) => (
              <nav key={column.title} data-reveal aria-label={column.title}>
                <h2 className="text-sm font-semibold text-white/40">{column.title}</h2>
                <ul className="mt-3.5 space-y-2.5 sm:mt-5 sm:space-y-3.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <FooterLink {...link} />
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </RevealGroup>
        </div>

        {/* Brand row */}
        <div className="flex flex-col gap-6 border-t border-white/10 py-6 sm:py-8 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <Link
              href="/"
              prefetch={false}
              className="inline-flex shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {/* The colour logo disappears on navy; shown as a white mark here. */}
              <img src="/logos/talent_flow_logo.png" alt="TalentFlow" className="h-7 w-auto brightness-0 invert sm:h-8" />
            </Link>
            <p className="max-w-sm text-[13px] text-white/50 sm:text-sm">
              From JD to hire, all with AI. Any industry, any role.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={backToTop}
              className="group inline-flex h-10 items-center gap-2 rounded-full border border-white/15 pl-4 pr-3 text-sm font-semibold text-white/80 transition-[border-color,color] duration-300 hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Back to top
              <span className="relative grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-white/10">
                {/* Two arrows: one leaves through the top as the next arrives. */}
                <ArrowUp className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:-translate-y-6" />
                <ArrowUp className="absolute h-3.5 w-3.5 translate-y-6 transition-transform duration-300 ease-out group-hover:translate-y-0" />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Wordmark rising out of the bottom edge. */}
      <div data-wordmark aria-hidden="true" className="relative select-none overflow-hidden">
        <p
          className={`${DISPLAY} flex justify-center whitespace-nowrap px-2 text-[18vw] font-extrabold leading-[0.95] tracking-[-0.06em] xl:text-[17rem]`}
        >
          {WORDMARK.split("").map((letter, i) => (
            <span key={i} className="-mb-[0.12em] inline-block overflow-hidden pt-[0.06em]">
              <span
                data-letter
                className="inline-block bg-gradient-to-b from-white/[0.16] to-white/0 bg-clip-text text-transparent transition-[translate,--tw-gradient-from] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[6%] hover:from-mkt-cyan/60"
              >
                {letter}
              </span>
            </span>
          ))}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-[1200px] xl:max-w-[1320px] 2xl:max-w-[1480px] flex-col gap-2 px-4 pb-6 pt-3 text-xs text-white/40 sm:pb-8 sm:pt-4 sm:text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>&copy; 2026 BusinessIntegra. All rights reserved.</p>
      </div>
    </footer>
  );
}
