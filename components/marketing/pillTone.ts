/**
 * Active-pill colours for plan-type tabs and the Monthly/Yearly switch, shared by
 * the pricing page and the signup plan picker so the two always match.
 *
 * A soft tint of the brand blue that fills the primary buttons ("Start free
 * trial"), with brand-blue text: the pills sit in the button's palette while the
 * solid button stays the one strong call to action.
 */
export const ACTIVE_PILL_BG = "bg-mkt-accent-solid/10 dark:bg-mkt-accent-solid/35";

/** Sliding pill / thumb: tint plus a faint inset outline. */
export const ACTIVE_PILL = `${ACTIVE_PILL_BG} ring-1 ring-inset ring-mkt-accent-solid/20 dark:ring-mkt-accent/30`;

/** Text and icon colour of the active option. */
export const ACTIVE_PILL_TEXT = "text-mkt-accent";

/** Count chip inside the active tab. */
export const ACTIVE_PILL_COUNT = "bg-mkt-accent-solid/15 text-mkt-accent dark:bg-white/15";

/* ------------------------------------------------------------------ *
 * Tab switching motion
 *
 * The project's fluid curve, cubic-bezier(0.22, 1, 0.36, 1) (FadePresence,
 * FadeIn, the dashboard segmented toggles, the signup steps): the pill glides
 * to the new tab while the new set drifts up into place, both at once.
 * Render <style>{TAB_SWAP_CSS}</style> once next to the tabs.
 * ------------------------------------------------------------------ */

/** Class for the sliding pill. */
export const TAB_PILL_CLASS = "tf-tab-pill";
/** Class for each element that drifts in after a switch; stagger with animationDelay. */
export const TAB_SWAP_CLASS = "tf-tab-swap";

/** `backwards` holds the start frame only during the stagger delay, so the
 *  element's own hover/press transforms work once it has arrived. */
export const TAB_SWAP_CSS = `
.${TAB_PILL_CLASS} { transition: transform .45s cubic-bezier(.22,1,.36,1), width .45s cubic-bezier(.22,1,.36,1), opacity .2s ease; }
.${TAB_SWAP_CLASS} { animation: tf-tab-swap .5s cubic-bezier(.22,1,.36,1) backwards; }
@keyframes tf-tab-swap { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .${TAB_PILL_CLASS} { transition: none; }
  .${TAB_SWAP_CLASS} { animation: none; }
}`;

/** Stagger for the n-th drifting element (capped so long lists don't lag). */
export const tabSwapDelay = (index: number) => `${60 + Math.min(index, 7) * 40}ms`;

/**
 * Moves the pill under the `[aria-pressed="true"]` button in `bar`. With
 * `animate` false it jumps (first paint, resize) instead of gliding.
 */
export function placeTabPill(bar: HTMLElement, pill: HTMLElement, animate: boolean) {
  const btn = bar.querySelector<HTMLElement>('[aria-pressed="true"]');
  if (!btn) return;
  if (!animate) pill.style.transition = "none";
  pill.style.transform = `translateX(${btn.offsetLeft}px)`;
  pill.style.width = `${btn.offsetWidth}px`;
  pill.style.opacity = "1";
  if (!animate) {
    void pill.offsetWidth; // commit the jump before transitions come back
    pill.style.transition = "";
  }
  // Keep the chosen chip in view on a scrolling phone rail.
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  btn.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
}

/** Props that give BillingToggle the same colours. */
export const BILLING_TOGGLE_TONE = {
  thumbClassName: ACTIVE_PILL,
  selectedClassName: `${ACTIVE_PILL_BG} ${ACTIVE_PILL_TEXT}`,
} as const;
