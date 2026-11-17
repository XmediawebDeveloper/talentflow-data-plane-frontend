"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Phone (<640px) plan-card swipe deck, shared by the landing and pricing pages.
 * Put `data-swipe-rail` on the scrolling rail (inside the element holding
 * `wrapRef`) and wrap each card's content in `data-swipe-face`. As a card
 * leaves the centre it folds back (rotateY), shrinks and fades like an
 * accordion leaf. sm+ keeps the plain grid (inline transforms are cleared).
 */
export const SWIPE_RAIL = "max-sm:gap-1 max-sm:px-[8%] max-sm:py-2 max-sm:overscroll-x-contain";
export const SWIPE_ITEM = "max-sm:snap-center";

export function useSwipeDeck(count: number) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  // The rail is the `data-swipe-rail` element, else the wrapper's first child.
  const rail = () =>
    wrapRef.current?.querySelector<HTMLElement>("[data-swipe-rail]") ??
    (wrapRef.current?.firstElementChild as HTMLElement | null) ?? null;

  useLayoutEffect(() => {
    const el = rail();
    if (!el) return;
    let raf = 0;
    let phone = false;
    let lastBest = -1;
    // Layout is measured once (and on resize), never per scroll frame.
    let faces: HTMLElement[] = [];
    let centres: number[] = [];
    let width = 1;
    const measure = () => {
      phone = window.matchMedia("(max-width: 639px)").matches;
      faces = Array.from(el.querySelectorAll<HTMLElement>("[data-swipe-face]"));
      centres = faces.map((f) => f.parentElement!.offsetLeft + f.parentElement!.offsetWidth / 2);
      width = faces[0]?.parentElement?.offsetWidth || 1;
      faces.forEach((f) => {
        f.style.transformOrigin = "50% 50%"; // fixed origin: no jump as a card crosses the centre
        f.style.backfaceVisibility = "hidden";
        if (!phone) f.style.transform = f.style.opacity = "";
      });
    };
    const paint = () => {
      raf = 0;
      if (!phone) return;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < faces.length; i++) {
        const d = (centres[i] - mid) / width; // cards from centre
        const a = Math.abs(d);
        if (a < bestD) { bestD = a; best = i; }
        if (a > 2.5) continue; // far off-screen: leave as is
        const c = Math.max(-1, Math.min(1, d));
        const ac = Math.abs(c);
        faces[i].style.transform = `perspective(900px) translate3d(${(-c * 4).toFixed(2)}%,0,0) rotateY(${(-c * 16).toFixed(2)}deg) scale(${(1 - ac * 0.08).toFixed(4)})`;
        faces[i].style.opacity = (1 - ac * 0.4).toFixed(3);
      }
      // Only re-render React when the centred card actually changes.
      if (best !== lastBest) { lastBest = best; setCurrent(best); }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onResize = () => { measure(); schedule(); };
    measure();
    paint();
    el.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
    };
  }, [count]);

  const goTo = useCallback((i: number) => {
    const el = rail();
    const item = el?.children[i] as HTMLElement | undefined;
    if (el && item) el.scrollTo({ left: item.offsetLeft - (el.clientWidth - item.offsetWidth) / 2, behavior: "smooth" });
  }, []);

  return { wrapRef, current, goTo };
}

/** Phone-only dots under the deck; the current one stretches into a bar. */
export function SwipeDots({ labels, current, goTo }: { labels: string[]; current: number; goTo: (i: number) => void }) {
  if (labels.length < 2) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-1.5 sm:hidden" role="group" aria-label="Plans">
      {labels.map((label, i) => (
        <button
          key={`${label}-${i}`}
          type="button"
          aria-label={`Show ${label}`}
          aria-current={i === current}
          onClick={() => goTo(i)}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current ? "w-5 bg-mkt-accent-solid" : "w-1.5 bg-slate-900/20 dark:bg-white/25"
          }`}
        />
      ))}
    </div>
  );
}
