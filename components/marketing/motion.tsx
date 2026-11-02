"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

/* ------------------------------------------------------------------ *
 * Shared motion for the marketing pages. Every piece:
 *  - renders its final content in the HTML (crawlers, no-JS, screen readers),
 *  - skips animation entirely under prefers-reduced-motion,
 *  - is cleaned up by useGSAP on unmount.
 *
 * Elements that must not flash before their entrance carry `data-pre`: they
 * start `invisible` (visible again under reduced motion, or without JS via
 * <MotionNoScript/>), and GSAP reveals them.
 * ------------------------------------------------------------------ */

export const PRE = "invisible motion-reduce:visible";

/** Shows every `data-pre` element when JavaScript is off. Render once per page. */
export function MotionNoScript() {
  return (
    <noscript>
      <style>{"[data-pre]{visibility:visible!important}"}</style>
    </noscript>
  );
}

const MOTION_OK = "(prefers-reduced-motion: no-preference)";

/* ------------------------------------------------------------------ *
 * Typewriter headline
 * ------------------------------------------------------------------ */

/**
 * Types `lines` out character by character with a caret. Every character is
 * in the DOM from the start (hidden), so the layout never jumps and the full
 * sentence is readable by assistive tech via the sr-only copy.
 */
export function Typewriter({
  lines,
  as = "h1",
  className = "",
  speed = 0.038,
  delay = 0.2,
  loop = false,
  onDone,
}: {
  lines: string[];
  as?: "h1" | "h2" | "p";
  className?: string;
  /** Seconds per character. */
  speed?: number;
  delay?: number;
  /** Type, hold, delete and type again, for as long as it's on screen. */
  loop?: boolean;
  onDone?: () => void;
}) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current!;
      const chars = gsap.utils.toArray<HTMLElement>("[data-char]", el);
      const caret = el.querySelector<HTMLElement>("[data-caret]")!;

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const place = (char: HTMLElement | null) => {
          if (!char) return;
          gsap.set(caret, {
            x: char.offsetLeft + char.offsetWidth + 2,
            y: char.offsetTop + char.offsetHeight * 0.14,
            height: char.offsetHeight * 0.74,
          });
        };

        // Caret parked just before the first character.
        const placeStart = () => {
          place(chars[0]);
          gsap.set(caret, { x: (chars[0]?.offsetLeft ?? 0) - 2 });
        };

        gsap.set(chars, { autoAlpha: 0 });
        gsap.set(caret, { autoAlpha: 1 });
        placeStart();

        const tl = gsap.timeline({
          delay,
          repeat: loop ? -1 : 0,
          repeatDelay: 0.4,
          onComplete: onDone,
        });
        tl.call(placeStart, [], 0);
        tl.set(caret, { autoAlpha: 1 }, 0);

        // Type.
        chars.forEach((char, i) => {
          // A slightly longer beat after sentence ends reads as a typist.
          const prev = chars[i - 1]?.textContent ?? "";
          const pause = prev === "." ? speed * 6 : 0;
          tl.set(char, { autoAlpha: 1 }, `>${speed + pause}`);
          tl.call(place, [char], "<");
        });

        // Hold with a blinking caret (ends visible).
        tl.to(caret, { autoAlpha: 0, duration: 0.01, repeat: loop ? 13 : 5, yoyo: true, repeatDelay: 0.4 }, ">0.15");

        if (loop) {
          // Backspace, faster than typing, then go round again.
          for (let i = chars.length - 1; i >= 0; i--) {
            tl.set(chars[i], { autoAlpha: 0 }, `>${speed * 0.45}`);
            if (i > 0) tl.call(place, [chars[i - 1]], "<");
            else tl.call(placeStart, [], "<");
          }
          tl.to({}, { duration: 0.8 });
        } else {
          tl.to(caret, { autoAlpha: 0, duration: 0.3 });
        }

        // A loop only runs while the headline is on screen.
        if (loop) {
          ScrollTrigger.create({
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            onToggle: (self) => (self.isActive ? tl.resume() : tl.pause()),
          });
        }

        // Re-place the caret if the line wraps differently after a resize.
        const onResize = () => {
          const lastShown = [...chars].reverse().find((c) => gsap.getProperty(c, "autoAlpha") === 1);
          place(lastShown ?? null);
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
      });

      // No motion: nothing hidden, call through straight away.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        onDone?.();
      });
    },
    { scope: root }
  );

  const text = lines.join(" ");

  const Tag = as as ElementType;
  return (
    <Tag ref={root} className={`relative ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {lines.map((line, li) => (
          <span key={li} className="block">
            {line.split(" ").map((word, wi, words) => (
              <span key={wi}>
                {/* Words never break mid-way; spaces between them can wrap. */}
                <span className="inline-block whitespace-nowrap">
                  {word.split("").map((ch, ci) => (
                    <span key={ci} data-char data-pre className={PRE}>
                      {ch}
                    </span>
                  ))}
                </span>
                {wi < words.length - 1 && " "}
              </span>
            ))}
          </span>
        ))}
      </span>
      <span
        data-caret
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 w-[0.08em] rounded-full bg-mkt-cyan"
      />
    </Tag>
  );
}

/* ------------------------------------------------------------------ *
 * Count-up numbers
 * ------------------------------------------------------------------ */

/** Splits "2,500+" into prefix "", number 2500, suffix "+" (keeps separators). */
function parseFigure(value: string) {
  const match = value.match(/^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const raw = match[2];
  return {
    prefix: match[1],
    target: Number(raw.replace(/,/g, "")),
    decimals: raw.includes(".") ? raw.split(".")[1].length : 0,
    grouped: raw.includes(","),
    suffix: match[3],
  };
}

/**
 * A figure that counts up from zero the first time it scrolls into view.
 * Renders the final value in HTML; reserves its width so nothing shifts.
 */
export function CountUp({ value, duration = 1.6 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    const el = ref.current!;
    const parsed = parseFigure(value);
    if (!parsed) return;

    const format = (n: number) => {
      const fixed = n.toFixed(parsed.decimals);
      const shown = parsed.grouped ? Number(fixed).toLocaleString("en-US", { minimumFractionDigits: parsed.decimals }) : fixed;
      return `${parsed.prefix}${shown}${parsed.suffix}`;
    };

    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const counter = { n: 0 };
      el.textContent = format(0);
      gsap.to(counter, {
        n: parsed.target,
        duration,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top bottom", once: true },
        onUpdate: () => {
          el.textContent = format(counter.n);
        },
      });
      return () => {
        el.textContent = value;
      };
    });
  }, { dependencies: [value] });

  return (
    // The invisible final value holds the width while the visible one counts.
    <span className="relative inline-grid tabular-nums">
      <span className="invisible col-start-1 row-start-1" aria-hidden="true">
        {value}
      </span>
      <span ref={ref} className="col-start-1 row-start-1">
        {value}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Headings that rise in word by word
 * ------------------------------------------------------------------ */

export function RevealHeading({
  as = "h2",
  text,
  className = "",
  id,
}: {
  as?: "h2" | "h3" | "p";
  text: string;
  className?: string;
  id?: string;
}) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(root.current!.querySelectorAll("[data-word]"), {
          yPercent: 110,
          rotate: 2,
          duration: 0.9,
          ease: "power4.out",
          stagger: 0.06,
          scrollTrigger: { trigger: root.current, start: "top 88%", once: true },
        });
      });
    },
    { scope: root }
  );

  const Tag = as as ElementType;
  return (
    <Tag ref={root} id={id} className={className} aria-label={text}>
    {text.split(" ").map((word, i, words) => (
      <span key={i} aria-hidden="true">
        {/* The mask: padding keeps descenders from being clipped. */}
        <span className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
          <span data-word className="inline-block">
            {word}
          </span>
        </span>
        {i < words.length - 1 && " "}
      </span>
    ))}
    </Tag>
  );
}

/* ------------------------------------------------------------------ *
 * Staggered entrances
 * ------------------------------------------------------------------ */

/**
 * Children marked `data-reveal` rise in, one after another, when the group
 * scrolls into view. `immediate` plays on mount (for above-the-fold content).
 */
export function RevealGroup({
  children,
  className = "",
  stagger = 0.08,
  y = 28,
  immediate = false,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  y?: number;
  immediate?: boolean;
  delay?: number;
  as?: "div" | "ul" | "ol" | "dl" | "section";
}) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const items = root.current!.querySelectorAll<HTMLElement>("[data-reveal]");
      if (!items.length) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          items,
          { y, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.8,
            ease: "power3.out",
            stagger,
            delay,
            clearProps: "transform",
            scrollTrigger: immediate ? undefined : { trigger: root.current, start: "top 85%", once: true },
          }
        );
      });
    },
    { scope: root }
  );

  const Tag = as as ElementType;
  return (
    <Tag ref={root} className={className}>
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------ *
 * Magnetic pull for primary buttons (fine pointers only)
 * ------------------------------------------------------------------ */

export function useMagnetic<T extends HTMLElement>(strength = 0.3) {
  const ref = useRef<T>(null);

  useGSAP(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add(`${MOTION_OK} and (hover: hover) and (pointer: fine)`, () => {
      const toX = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
      const toY = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
      const move = (event: PointerEvent) => {
        const rect = el.getBoundingClientRect();
        toX((event.clientX - (rect.left + rect.width / 2)) * strength);
        toY((event.clientY - (rect.top + rect.height / 2)) * strength);
      };
      const leave = () => {
        toX(0);
        toY(0);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      return () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", leave);
        gsap.set(el, { x: 0, y: 0 });
      };
    });
  });

  return ref;
}

/** Recalculate trigger positions once late content (fonts, plans) settles. */
export function refreshScrollTriggers() {
  ScrollTrigger.refresh();
}

/* ------------------------------------------------------------------ *
 * Static page title (inner pages). The typing headline is reserved for the
 * landing page; everywhere else the title is simply there.
 * ------------------------------------------------------------------ */

export function PageTitle({ lines, className = "" }: { lines: string[]; className?: string }) {
  return (
    <h1 className={className}>
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </h1>
  );
}
