/*
 * Small class tokens shared by the landing page's content sections, so the
 * cards, hairlines and eyebrows match the rest of the marketing system.
 */

/** Hairline used for every rule and card border on the marketing pages. */
export const RULE = "border-slate-900/[0.07] dark:border-white/[0.08]";

/** The standard card: rounded 20px, hairline border, lifts slightly on hover. */
export const CARD =
  "rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface dark:border-white/10 transition-[translate,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-slate-900/[0.14] hover:shadow-[0_24px_48px_-32px_rgba(15,60,153,0.45)] dark:hover:border-white/20 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** Icon tile used at the top of cards. */
export const ICON_TILE =
  "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mkt-accent/10 text-mkt-accent sm:h-10 sm:w-10";
