'use client';

import React, { useEffect, useState } from 'react';

export type FadeFrom = 'none' | 'up' | 'down' | 'left' | 'right';

export interface FadeInProps {
  children: React.ReactNode;
  /**
   * Direction the block drifts in from as it fades. `up` starts below and
   * rises into place, `down` starts above. `none` is a plain fade.
   */
  from?: FadeFrom;
  /** Pixels the block travels while fading in. Ignored when `from` is `none`. */
  distance?: number;
  /** Seconds before the fade starts. The block stays hidden until then. */
  delay?: number;
  /** Seconds the fade takes. */
  duration?: number;
  /** CSS timing function. */
  easing?: string;
  className?: string;
  style?: React.CSSProperties;
}

const OFFSET: Record<FadeFrom, [number, number]> = {
  none: [0, 0],
  up: [0, 1],
  down: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

/**
 * Fade-in entrance, with an optional drift into place.
 *
 *   <FadeIn from="up" distance={16} delay={0.85}>…</FadeIn>
 *
 * Pairs with FlipIn: set `delay` to when the flips finish so this block
 * arrives last. Runs as an inline CSS transition. The block mounts hidden, and
 * on the next frame the transition starts, so it needs nothing from
 * globals.css. Users with reduced motion see the block straight away. Renders
 * a plain div, so pass layout classes through `className`.
 */
export default function FadeIn({
  children,
  from = 'up',
  distance = 16,
  delay = 0,
  duration = 0.5,
  easing = 'cubic-bezier(0.22, 1, 0.36, 1)',
  className = '',
  style,
}: FadeInProps) {
  const [shown, setShown] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    /* Two frames: the first paints the hidden start state, the second flips
       it, so the browser has a "from" to transition out of. Reduced motion is
       read in the same callback, so both updates land in one render and the
       block simply appears. */
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        setShown(true);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  const [x, y] = OFFSET[from];
  const visible = shown;

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate(0, 0)' : `translate(${x * distance}px, ${y * distance}px)`,
        transition: reduced
          ? 'none'
          : `opacity ${duration}s ${easing} ${delay}s, transform ${duration}s ${easing} ${delay}s`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
