'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle } from 'lucide-react';

/**
 * The success burst shown when something completes — a published JD today.
 *
 * Loaded from a CDN at runtime rather than as an npm dependency, deliberately:
 * this player has no entry in `package.json`, so a plain `npm install` can
 * never remove or fail to fetch it — the browser pulls
 * `<dotlottie-wc>` straight from jsDelivr the first time this component
 * mounts, which is after a network round-trip anyway, and every subsequent
 * mount reuses the browser's cached copy of the script.
 *
 * `importFromCDN` goes through `new Function` so the bundler never sees a
 * literal `import('https://...')` — Webpack/Turbopack would otherwise try to
 * resolve that URL as a local module at build time and fail. Wrapping it this
 * way keeps the call a genuine native dynamic `import()` at runtime.
 */
const DOTLOTTIE_WC_CDN_URL =
  'https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-wc@0.9.28/dist/dotlottie-wc.js';

const importFromCDN = new Function('url', 'return import(url)') as (
  url: string,
) => Promise<unknown>;

let dotlottieWcLoadPromise: Promise<void> | null = null;

/** Exported so every Lottie in the app shares this one CDN load (the candidate
 *  LoadingScreen plays `loading.json` through it). */
export function loadDotlottieWc(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!dotlottieWcLoadPromise) {
    dotlottieWcLoadPromise = (
      customElements.get('dotlottie-wc')
        ? Promise.resolve()
        : (importFromCDN(DOTLOTTIE_WC_CDN_URL) as Promise<void>)
    );
  }
  return dotlottieWcLoadPromise;
}

const SUCCESS_ANIMATION_URL = '/animations/success.json';

const lottieDataLoads = new Map<string, Promise<string>>();

/**
 * Fetches a Lottie JSON once per page, so the player can be handed the data
 * itself rather than a `src`.
 *
 * Given only `src`, `<dotlottie-wc>` starts its own fetch as soon as it is
 * attached and aborts it when it is detached - and it reports that abort as
 * "Failed to load animation data from URL: ... AbortError". A loading screen
 * that is swapped out before the file arrives (a fast assessment load, or
 * React's dev-mode mount/unmount/mount) logged that on every such swap. With
 * `data` the player never fetches, so there is nothing to abort. A failed fetch
 * is forgotten so the next mount retries it.
 */
export function loadLottieData(url: string): Promise<string> {
  let load = lottieDataLoads.get(url);
  if (!load) {
    load = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.text();
    });
    load.catch(() => lottieDataLoads.delete(url));
    lottieDataLoads.set(url, load);
  }
  return load;
}

/**
 * What this degrades to: the tinted disc and tick that were here before the
 * animation existed.
 *
 * Used for three different cases, which is the reason it is a component rather
 * than inline markup — the loading window before the player's script arrives, a
 * viewer who has asked for reduced motion, and any environment where the CDN
 * fetch never resolves. All three should look finished, not broken.
 */
function StaticBadge() {
  return (
    <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center">
      <CheckCircle className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue" />
    </div>
  );
}

/* `prefers-reduced-motion`, read as an external store rather than with
   useState + useEffect. That pairing would set state during an effect on every
   mount — an extra render and a lint violation — where this subscribes
   directly and re-renders only when the preference actually changes.
   `getServerSnapshot` returns false so the server and the first client render
   agree; a viewer who prefers reduced motion swaps to the static badge on
   hydration rather than hydrating mismatched markup. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const subscribeToReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const getReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;
const getReducedMotionOnServer = () => false;

/** The same `prefers-reduced-motion` store, for other Lottie hosts. */
export const usePrefersReducedMotion = () =>
  useSyncExternalStore(subscribeToReducedMotion, getReducedMotion, getReducedMotionOnServer);

export interface SuccessAnimationProps {
  /**
   * Sizing for the animation box. Bigger than the badge it replaces is
   * deliberate: the animation throws particles well outside its centre, so at
   * the badge's own size the tick itself would read noticeably smaller than the
   * static one.
   */
  className?: string;
  /**
   * What to show instead of the animation — while the player's script loads, and
   * for a viewer who has asked for reduced motion.
   *
   * Defaults to the publish screen's blue disc-and-tick. A host whose
   * surroundings are not that screen must pass its own: the OTP field, for one,
   * collapses into a GREEN bar, and dropping a blue badge into it would look
   * like a rendering fault rather than a fallback.
   */
  fallback?: React.ReactNode;
  /**
   * What to show only while the player's script is still loading. Omitted, the
   * `fallback` shows then too. A host that must not flash a finished tick before
   * the animation draws its own passes an empty box of the same size here; the
   * `fallback` still covers reduced motion and a CDN that never answers.
   */
  placeholder?: React.ReactNode;
}

export default function SuccessAnimation({
  className = 'w-24 h-24 sm:w-32 sm:h-32',
  fallback,
  placeholder,
}: SuccessAnimationProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [animationData, setAnimationData] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    Promise.all([loadDotlottieWc(), loadLottieData(SUCCESS_ANIMATION_URL)])
      .then(([, data]) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        /* CDN or animation fetch failed — settle on the fallback badge below. */
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reducedMotion]);

  if (!reducedMotion && !animationData && !loadFailed && placeholder !== undefined) return <>{placeholder}</>;
  if (reducedMotion || !animationData) return <>{fallback ?? <StaticBadge />}</>;

  const DotlottieWc = 'dotlottie-wc' as unknown as React.ElementType<{
    data: string;
    autoplay?: boolean;
    class?: string;
  }>;

  return (
    <div className={className} aria-hidden>
      <DotlottieWc data={animationData} autoplay class="h-full w-full" />
    </div>
  );
}
