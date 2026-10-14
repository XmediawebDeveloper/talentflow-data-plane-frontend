/**
 * Scroll helpers for the candidate pre-interview steps.
 *
 * PreInterviewLayout pins the header + stepper and publishes their live height
 * as `--tf-sticky-h` (and as <html>'s scroll-padding-top), so a plain
 * `scrollIntoView` already stops below the pinned block. These helpers add the
 * two things every step's auto-scroll needs on top of that: respect for
 * reduced motion, and NOT moving the page when the target is already on
 * screen — an auto-scroll should only ever bring something hidden into view.
 */

/** 'auto' for viewers who asked for reduced motion, otherwise 'smooth'. */
export function candidateScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** Height of the pinned header + stepper (0 when it isn't pinned). */
export function stickyOffset(): number {
  if (typeof window === 'undefined') return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue('--tf-sticky-h');
  return parseFloat(v) || 0;
}

/**
 * True when the whole element sits between the pinned block and the bottom of
 * the viewport, AND inside every scrolling/clipping ancestor. The second part
 * matters for a sticky side panel with its own scroll (the consent panels): a
 * button cut off by the panel's bottom edge is still "in the viewport", but
 * the candidate cannot see it.
 */
export function isFullyVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.top < stickyOffset() || r.bottom > window.innerHeight) return false;
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const overflowY = getComputedStyle(a).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') {
      const ar = a.getBoundingClientRect();
      if (r.top < ar.top - 1 || r.bottom > ar.bottom + 1) return false;
    }
  }
  return true;
}

/**
 * Scroll `el` into view only if part of it is hidden (under the pinned block
 * or below the fold). `block` as for scrollIntoView: 'nearest' for buttons and
 * footers, 'center' for errors, 'start' for sections.
 */
export function revealIfHidden(el: Element | null | undefined, block: ScrollLogicalPosition = 'nearest'): void {
  if (!el || isFullyVisible(el)) return;
  el.scrollIntoView({ behavior: candidateScrollBehavior(), block });
}

/** Same as revealIfHidden, but after the next paint (for targets that a state change is about to mount or move). */
export function revealAfterPaint(getEl: () => Element | null | undefined, block: ScrollLogicalPosition = 'nearest'): void {
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() => revealIfHidden(getEl(), block));
}
