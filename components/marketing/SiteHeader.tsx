"use client";

import { Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { gsap, useGSAP, withMotion } from "@/lib/gsap";
import { Cta } from "./Cta";
import { DASHBOARD_HREF, useSignedIn } from "./session";
import { display, DISPLAY } from "./fonts";

const TRIAL_LINK = `https://${process.env.NEXT_PUBLIC_BASE_DOMAIN}/signup?plan=free_trial`;

// Nav items always point at a section of the landing page: `#features` on "/"
// itself, `/#features` from any other page. The pages with the same names
// (/about, /faq …) are reached from buttons, the footer and in-page links.
// `href` is that page, used only to mark the item current while you're on it.
const NAV_ITEMS: Array<{ label: string; href: string; section: string }> = [
  { label: "Features", href: "/features", section: "features" },
  { label: "How it works", href: "/how-it-works", section: "how-it-works" },
  { label: "Pricing", href: "/pricing", section: "pricing" },
  { label: "FAQ", href: "/faq", section: "faq" },
  { label: "About", href: "/about", section: "about" },
];

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const noopSubscribe = () => () => {};

/** Org-specific login (subdomain or ?org=) hides the header entirely. */
function readIsOrgLogin() {
  const host = window.location.hostname;
  const parts = host.split(".");
  const isIPAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
  const subdomain =
    !isIPAddress &&
    ((parts.length >= 3 && !["www", "app"].includes(parts[0])) || host.endsWith(".localhost"));
  return subdomain || !!new URLSearchParams(window.location.search).get("org");
}

/**
 * Header for the redesigned landing and pricing pages. Same links, auth and
 * org-login rules as the classic header; new chrome: translucent until the
 * page scrolls, a sliding marker under the current section, and a full-width
 * sheet on small screens.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const { resolvedTheme, setTheme } = useTheme();

  // Browser-only facts, read on the client and `false` during SSR. Re-read on
  // every render, so a route change picks up a new session or ?org= param.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const isOrgLogin = useSyncExternalStore(noopSubscribe, readIsOrgLogin, () => false);
  const isLoggedIn = useSignedIn();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const navRef = useRef<HTMLElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Always pinned to the top; it only turns translucent with a soft shadow
  // once the page has scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reading-progress hairline along the header's bottom edge.
  const progressRef = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        progressRef.current,
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
        }
      );
    });
  });

  // Track the section in view on the landing page.
  useEffect(() => {
    if (!isLanding) return;
    const sections = NAV_ITEMS.map((item) =>
      item.section ? document.getElementById(item.section) : null
    ).filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    sections.forEach((section) => observer.observe(section));
    // Above the first section nothing is current.
    const onTop = () => {
      if (window.scrollY < 200) setActiveSection(null);
    };
    window.addEventListener("scroll", onTop, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onTop);
    };
  }, [isLanding]);

  // Close the sheet when the viewport grows past it. (Links close it on click.)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => query.matches && setMenuOpen(false);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // On the landing page the item for the section in view is current; on an
  // inner page, the item that shares its name (About on /about).
  const currentKey = (item: (typeof NAV_ITEMS)[number]) =>
    isLanding ? activeSection === item.section : pathname === item.href;

  const sectionHref = (item: (typeof NAV_ITEMS)[number]) =>
    isLanding ? `#${item.section}` : `/#${item.section}`;

  // Slide the marker pill to a link (or hide it when there is none). The pill
  // follows the pointer across the nav and settles back on the current item.
  const moveMarker = (target: HTMLElement | null) => {
    const marker = markerRef.current;
    if (!marker) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.killTweensOf(marker);
    if (!target) {
      gsap.to(marker, { autoAlpha: 0, duration: reduce ? 0 : 0.2, ease: "power2.out" });
      return;
    }
    const wasHidden = gsap.getProperty(marker, "autoAlpha") === 0;
    const to = { x: target.offsetLeft, width: target.offsetWidth };
    if (wasHidden || reduce) {
      // Fade in where it is; no slide in from wherever it was last.
      gsap.set(marker, to);
      gsap.to(marker, { autoAlpha: 1, duration: reduce ? 0 : 0.2, ease: "power2.out" });
    } else {
      // Glide between items.
      gsap.to(marker, { ...to, autoAlpha: 1, duration: 0.35, ease: "power3.out" });
    }
  };

  const activeLink = () => navRef.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? null;

  useIsoLayoutEffect(() => {
    moveMarker(activeLink());
  },[activeSection, pathname, mounted]);

  // Sheet links arrive in sequence so the menu reads top-down.
  useGSAP(
    () => {
      if (!menuOpen || !sheetRef.current) return;
      withMotion(() => {
        gsap.from(sheetRef.current!.querySelectorAll("[data-sheet-item]"), {
          y: 12,
          autoAlpha: 0,
          duration: 0.35,
          stagger: 0.04,
        });
      });
    },
    { dependencies: [menuOpen] }
  );

  if (isOrgLogin) return null;

  const themeButton = (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-mkt-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid dark:text-slate-400 dark:hover:bg-white/10"
      // Theme is only known in the browser; until mounted, render the same
      // neutral label the server did so hydration matches (like the icon below).
      aria-label={!mounted ? "Toggle theme" : resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {mounted ? (
        resolvedTheme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />
      ) : (
        <span className="h-[18px] w-[18px]" />
      )}
    </button>
  );

  return (
    <header
      className={`${display.variable} sticky top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300 ${
        scrolled || menuOpen
          ? "border-b border-slate-900/[0.07] bg-mkt-canvas/85 shadow-[0_1px_0_rgba(8,19,46,0.02),0_8px_24px_-20px_rgba(8,19,46,0.4)] backdrop-blur-xl dark:border-white/[0.08]"
          : "border-b border-transparent bg-mkt-canvas"
      }`}
    >
      <span
        ref={progressRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-[2px] origin-left scale-x-0 bg-gradient-to-r from-mkt-accent to-mkt-cyan motion-reduce:hidden"
      />
      <div className="mx-auto flex h-14 w-full max-w-[1200px] xl:max-w-[1320px] 2xl:max-w-[1480px] items-center justify-between gap-6 px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link href="/" onClick={() => setMenuOpen(false)} className="flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid">
          <img src="/logos/talent_flow_logo.png" alt="TalentFlow" className="h-7 w-auto sm:h-9" />
        </Link>

        <nav
          ref={navRef}
          aria-label="Main"
          className="relative hidden items-center lg:flex"
          onMouseLeave={() => moveMarker(activeLink())}
        >
          <span
            ref={markerRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-full rounded-full bg-slate-900/[0.05] opacity-0 dark:bg-white/[0.08]"
          />
          {NAV_ITEMS.map((item) => {
            const active = currentKey(item);
            return (
              <Link
                key={item.href}
                href={sectionHref(item)}
                prefetch={false}
                aria-current={active ? "true" : undefined}
                onMouseEnter={(e) => moveMarker(e.currentTarget)}
                onFocus={(e) => moveMarker(e.currentTarget)}
                onBlur={() => moveMarker(activeLink())}
                className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid ${
                  active ? "text-mkt-ink" : "text-slate-500 hover:text-mkt-ink dark:text-slate-400"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-1.5 lg:flex">
          {themeButton}
          {isLoggedIn ? (
            // Signed in: sign-up links would only bounce to the dashboard
            // (proxy.ts), so offer the dashboard itself.
            <Cta href={DASHBOARD_HREF} size="sm" className="ml-1">
              Go to dashboard
            </Cta>
          ) : (
            <>
              <Link
                href="/signup"
                prefetch={false}
                className="rounded-full px-4 py-2 text-sm font-medium text-mkt-ink transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid dark:hover:bg-white/10"
              >
                Sign up
              </Link>
              <Cta href={TRIAL_LINK} external size="sm" className="ml-1">
                Start free trial
              </Cta>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          {themeButton}
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-mkt-ink transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid dark:hover:bg-white/10"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="site-menu"
          ref={sheetRef}
          className="h-[calc(100dvh-3.5rem)] overflow-y-auto sm:h-[calc(100dvh-4rem)] border-t border-slate-900/[0.07] bg-mkt-canvas px-4 pb-8 pt-4 dark:border-white/[0.08] sm:px-6 lg:hidden"
        >
          <nav aria-label="Main" className="flex flex-col">
            {NAV_ITEMS.map((item) => {
              const active = currentKey(item);
              return (
                <Link
                  key={item.href}
                  data-sheet-item
                  href={sectionHref(item)}
                  prefetch={false}
                  aria-current={active ? "true" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`${DISPLAY} flex items-center justify-between border-b border-slate-900/[0.07] py-3.5 text-xl font-semibold sm:py-4 sm:text-2xl tracking-[-0.02em] dark:border-white/[0.08] ${
                    active ? "text-mkt-accent" : "text-mkt-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {isLoggedIn ? (
            <div data-sheet-item className="mt-6 grid sm:mt-8">
              <Link
                href={DASHBOARD_HREF}
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-full bg-mkt-ink text-[15px] font-semibold text-mkt-canvas sm:h-12 sm:text-base"
              >
                Go to dashboard
              </Link>
            </div>
          ) : (
            <div data-sheet-item className="mt-6 grid gap-2.5 sm:mt-8 sm:gap-3">
              <Link
                href={TRIAL_LINK}
                prefetch={false}
                className="inline-flex h-11 items-center justify-center rounded-full bg-mkt-ink text-[15px] font-semibold sm:h-12 sm:text-base text-mkt-canvas"
              >
                Start free trial
              </Link>
              <Link
                href="/signup"
                prefetch={false}
                className="inline-flex h-11 items-center justify-center rounded-full border border-slate-900/15 text-[15px] font-semibold sm:h-12 sm:text-base text-mkt-ink dark:border-white/15"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
