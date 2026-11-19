'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import type { AnimationItem } from 'lottie-web';

/**
 * AI-recruitment illustration for the login page's left column: the
 * "AI Review Robot" Lottie (public/marketing/ai-review-robot.json) — the robot
 * and its platform build in, then four candidate cards fan out around it.
 *
 * - Plays once and holds on its last frame (the finished scene), never loops.
 *   Reduced-motion users get that finished frame straight away.
 * - One file, two themes. The animation was drawn on its own dark navy panel;
 *   both themes drop that panel so the art sits on the page itself, and light
 *   mode turns the outline-only cards into white cards with a soft border (their
 *   white outline and light text lines would vanish on a light page). See
 *   `themed` below.
 * - The JSON (≈340 KB) is fetched from /public and the SVG-only "light" player
 *   is loaded on demand, so neither lands in any other page's bundle.
 * - The box keeps the animation's 535×365 aspect ratio before anything loads,
 *   so the column never shifts. Sizing lives in authTheme.ts (.tf-hero-art).
 */

const SRC = '/marketing/ai-review-robot.json';

/* Lottie's JSON is loosely typed; only the bits `themed` touches are named. */
type LottieShape = { ty: string; nm?: string; it?: LottieShape[]; c?: { a: number; k: number[] }; o?: { a: number; k: number } };
type LottieLayer = { nm?: string; shapes?: LottieShape[] };
type LottieData = { layers: LottieLayer[] } & Record<string, unknown>;

let dataPromise: Promise<LottieData> | null = null;
/** Fetched once per page load; a failed fetch can be retried on the next mount. */
function loadData(): Promise<LottieData> {
  dataPromise ??= fetch(SRC)
    .then((res) => {
      if (!res.ok) throw new Error(`Hero animation: ${res.status}`);
      return res.json() as Promise<LottieData>;
    })
    .catch((err) => {
      dataPromise = null;
      throw err;
    });
  return dataPromise;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(1);

/** A copy of the animation adjusted for the page theme it sits on. */
function themed(base: LottieData, theme: 'light' | 'dark'): LottieData {
  const data: LottieData = structuredClone(base);
  for (const layer of data.layers) {
    if (!layer.shapes) continue;

    // Both themes: no navy panel or frame — the page is the surface. The faint
    // connector curves and their node stay; they read on either background.
    if (layer.nm === 'background') {
      layer.shapes = layer.shapes.filter((g) => g.nm !== 'fill' && g.nm !== 'frame');
      continue;
    }

    if (theme === 'dark' || !/^card-\d/.test(layer.nm ?? '')) continue;

    // Light theme, candidate cards: drawn as a 70%-white outline over the dark
    // panel. Give each a white face with a soft slate border, and lighten its
    // drop shadow, which was tuned for the dark panel.
    for (const group of layer.shapes) {
      if (group.ty !== 'gr' || !group.it) continue;
      if (group.nm === 'panel') {
        const stroke = group.it.find((s) => s.ty === 'st');
        if (stroke?.c && stroke.o) {
          stroke.c = { a: 0, k: rgb('#d5ddea') };
          stroke.o = { a: 0, k: 100 };
          // Same shape filled white, placed after the stroke so it paints beneath it.
          group.it.splice(group.it.indexOf(stroke) + 1, 0, { ty: 'fl', nm: 'face', c: { a: 0, k: rgb('#ffffff') }, o: { a: 0, k: 100 }, r: 1 } as unknown as LottieShape);
        }
      } else if (group.nm === 'shadow') {
        const fill = group.it.find((s) => s.ty === 'fl');
        if (fill?.o) fill.o = { a: 0, k: 12 };
      }
    }
  }
  return data;
}

export default function AuthHeroArt() {
  const containerRef = useRef<HTMLDivElement>(null);
  // Remembered across a theme switch, so the scene doesn't restart: a switch
  // mid-play continues from the same frame, and after it ends it stays ended.
  const frameRef = useRef(0);
  const finishedRef = useRef(false);
  const { resolvedTheme } = useTheme();
  // Unknown until next-themes has read the stored preference (after mount).
  const theme = resolvedTheme === 'dark' ? 'dark' : resolvedTheme === 'light' ? 'light' : null;

  useEffect(() => {
    const container = containerRef.current;
    if (!theme || !container) return;
    let anim: AnimationItem | null = null;
    let cancelled = false;

    Promise.all([import('lottie-web/build/player/lottie_light'), loadData()])
      .then(([{ default: lottie }, base]) => {
        if (cancelled) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        anim = lottie.loadAnimation({
          container,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          animationData: themed(base, theme),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
        });
        const a = anim;
        a.addEventListener('DOMLoaded', () => {
          if (reduceMotion || finishedRef.current) a.goToAndStop(a.totalFrames - 1, true);
          else if (frameRef.current > 0) a.goToAndPlay(frameRef.current, true);
          else a.play();
        });
        a.addEventListener('enterFrame', () => { frameRef.current = a.currentFrame; });
        a.addEventListener('complete', () => { finishedRef.current = true; });
      })
      .catch((err) => {
        // Decorative only — the login form works without it.
        console.warn('[AuthHeroArt] animation unavailable:', err);
      });

    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [theme]);

  return (
    <div className="tf-hero-art" aria-hidden="true">
      <div ref={containerRef} className="tf-hero-lottie" />
    </div>
  );
}
