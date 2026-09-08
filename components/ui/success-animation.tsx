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

function loadDotlottieWc(): Promise<void> {
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
}

export default function SuccessAnimation({
  className = 'w-24 h-24 sm:w-32 sm:h-32',
  fallback,
}: SuccessAnimationProps) {
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    getReducedMotionOnServer,
  );
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    loadDotlottieWc()
      .then(() => {
        if (!cancelled) setPlayerReady(true);
      })
      .catch(() => {
        /* CDN fetch failed — stay on the fallback badge below. */
      });
    return () => {
      cancelled = true;
    };
  }, [reducedMotion]);

  if (reducedMotion || !playerReady) return <>{fallback ?? <StaticBadge />}</>;

  const DotlottieWc = 'dotlottie-wc' as unknown as React.ElementType<{
    src: string;
    autoplay?: boolean;
    class?: string;
  }>;

  return (
    <div className={className} aria-hidden>
      <DotlottieWc src="/animations/success.json" autoplay class="h-full w-full" />
    </div>
  );
}
