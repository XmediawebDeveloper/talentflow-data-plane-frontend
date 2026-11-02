"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Monthly / Yearly as a segmented control: both periods stay visible and
 * labelled, and a thumb slides to the chosen one.
 */
export function BillingToggle({
  isYearly,
  onChange,
  savePercent,
  disabled = false,
}: {
  isYearly: boolean;
  onChange: (yearly: boolean) => void;
  /** Best real saving on offer; the badge is hidden when 0. */
  savePercent: number;
  disabled?: boolean;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useIsoLayoutEffect(() => {
    const group = groupRef.current;
    const thumb = thumbRef.current;
    if (!group || !thumb) return;

    const place = (animate: boolean) => {
      const active = group.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!active) return;
      const target = { x: active.offsetLeft, width: active.offsetWidth };
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!animate || reduce) gsap.set(thumb, target);
      else gsap.to(thumb, { ...target, duration: 0.45, ease: "power3.out" });
    };

    place(placed.current);
    placed.current = true;
    group.dataset.ready = "";

    // The label widths settle once the display font loads.
    const observer = new ResizeObserver(() => place(false));
    observer.observe(group);
    return () => observer.disconnect();
  }, [isYearly]);

  const options = [
    { label: "Monthly", yearly: false },
    { label: "Yearly", yearly: true },
  ];

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Billing period"
      className={`group relative inline-flex items-center rounded-full border border-slate-900/[0.08] bg-mkt-surface p-1 dark:border-white/10 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <span
        ref={thumbRef}
        aria-hidden="true"
        className="absolute left-0 top-1 h-[calc(100%-0.5rem)] rounded-full bg-mkt-ink"
      />
      {options.map((option) => {
        const selected = option.yearly === isYearly;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.yearly)}
            className={`relative z-10 inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mkt-accent-solid disabled:cursor-not-allowed ${
              selected
                // Until the thumb is placed, the chosen option paints its own fill.
                ? "bg-mkt-ink text-mkt-canvas group-data-[ready]:bg-transparent"
                : "text-slate-600 hover:text-mkt-ink dark:text-slate-400"
            }`}
          >
            {option.label}
            {option.yearly && savePercent > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-colors duration-300 ${
                  selected ? "bg-mkt-amber text-mkt-navy" : "bg-mkt-amber/15 text-mkt-amber-ink"
                }`}
              >
                Save {savePercent}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
