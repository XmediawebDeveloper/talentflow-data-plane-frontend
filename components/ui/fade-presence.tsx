'use client';

import React, { useEffect, useState } from 'react';

export interface FadePresenceProps {
  children: React.ReactNode;
  /** Mount and fade in when true; fade out and unmount when false. */
  show: boolean;
  /** Pixels below its resting place the block enters from and exits to. */
  distance?: number;
  /** Seconds each fade takes. */
  duration?: number;
  /** CSS timing function. */
  easing?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Shows and hides a block with a fade: on `show` it fades in rising up from
 * `distance` px below, and when `show` turns false it fades out sinking back
 * down, then unmounts so it stops taking space.
 *
 *   <FadePresence show={isRecording}>…</FadePresence>
 *
 * For an entrance-only fade, use FadeIn. Users with reduced motion see the
 * block appear and disappear without the transition.
 */
export default function FadePresence({
  children,
  show,
  distance = 12,
  duration = 0.3,
  easing = 'cubic-bezier(0.22, 1, 0.36, 1)',
  className = '',
  style,
}: FadePresenceProps) {
  /* `show` changes are tracked during render (React's "adjust state when a
     prop changes" pattern) so the exit starts in the same render, not one
     effect later. */
  const [prevShow, setPrevShow] = useState(show);
  const [leaving, setLeaving] = useState(false);
  const [entered, setEntered] = useState(false);
  const [reduced, setReduced] = useState(false);
  if (show !== prevShow) {
    setPrevShow(show);
    setLeaving(!show);
    if (show) setEntered(false);
  }

  /* Entering: paint the hidden start state for one frame, then flip it so
     the browser has a "from" to transition out of. */
  useEffect(() => {
    if (!show) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        setEntered(true);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [show]);

  /* Leaving: unmount once the fade-out has played. */
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(false), reduced ? 0 : duration * 1000);
    return () => clearTimeout(t);
  }, [leaving, duration, reduced]);

  if (!show && !leaving) return null;
  const visible = show && entered;

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : `translateY(${distance}px)`,
        transition: reduced ? 'none' : `opacity ${duration}s ${easing}, transform ${duration}s ${easing}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
