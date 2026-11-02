import { DISPLAY } from "./fonts";

/*
 * Shared layout classes for the redesigned marketing pages, so every inner
 * page lines up with the landing page, header and footer.
 *
 * Kept in a plain module (no "use client") on purpose: a server page that
 * imports a constant from a client module receives a client reference, not
 * the string, and the class names silently disappear.
 */

export const SHELL =
  "mx-auto w-full max-w-[1200px] xl:max-w-[1320px] 2xl:max-w-[1480px] px-4 sm:px-6 lg:px-8";
export const SECTION = "scroll-mt-16 py-12 sm:py-24 lg:py-28";
export const H2 = `${DISPLAY} text-[clamp(1.6rem,4.2vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.035em] text-mkt-ink text-balance`;
export const LEAD =
  "mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-5 sm:text-lg";
