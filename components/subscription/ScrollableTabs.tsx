"use client";

/**
 * Horizontally scrollable row with an ALWAYS-VISIBLE custom scrollbar.
 *
 * Why not a native scrollbar: on touch devices native scrollbars are overlay
 * style and fade out when idle, and mobile browsers largely ignore
 * `::-webkit-scrollbar` styling — so there is no reliable CSS way to keep a
 * native bar visible at rest on phones/tablets. To guarantee the "there's more,
 * scroll →" affordance is ALWAYS shown, we hide the native bar and render our
 * own track + thumb: a real DOM element that can't be auto-hidden. The thumb
 * tracks scroll position, is draggable, and the row still scrolls by swipe.
 */

import { useRef, useState, useEffect, useCallback } from "react";

export function ScrollableTabs({
  children,
  className = "",
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startLeft: number } | null>(null);
  const [thumb, setThumb] = useState({ widthPct: 0, leftPct: 0, scrollable: false });

  const sync = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    const scrollable = scrollWidth - clientWidth > 1;
    setThumb({
      // Clamp so the thumb never visually exceeds the track at the ends.
      widthPct: scrollable ? Math.max((clientWidth / scrollWidth) * 100, 12) : 0,
      leftPct: scrollable ? (scrollLeft / scrollWidth) * 100 : 0,
      scrollable,
    });
  }, []);

  useEffect(() => {
    sync();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [sync]);

  // Drag the thumb → scroll the row (mouse / stylus).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = scrollRef.current;
      const track = trackRef.current;
      if (!dragRef.current || !el || !track) return;
      const dx = e.clientX - dragRef.current.startX;
      const ratio = el.scrollWidth / track.clientWidth;
      el.scrollLeft = dragRef.current.startLeft + dx * ratio;
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const onThumbDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startLeft: el.scrollLeft };
  };

  return (
    <div className={className}>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto tf-hide-native-scrollbar"
        aria-label={ariaLabel}
      >
        {children}
      </div>
      {thumb.scrollable && (
        <div
          ref={trackRef}
          className="relative mt-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-slate-700/70"
          aria-hidden="true"
        >
          <div
            onPointerDown={onThumbDown}
            className="absolute top-0 h-full cursor-grab touch-none rounded-full bg-gray-400 transition-[left,width] duration-75 active:cursor-grabbing dark:bg-slate-500"
            style={{ width: `${thumb.widthPct}%`, left: `${thumb.leftPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default ScrollableTabs;
