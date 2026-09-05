'use client';

import { useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle } from 'lucide-react';

/**
 * The success burst shown when something completes — a published JD today.
 *
 * Loaded with `next/dynamic` and `ssr: false`, deliberately. The player pulls in
 * the Lottie renderer (~250KB) and touches canvas APIs on mount, so a static
 * import would put that weight into the bundle of whichever page imports it —
 * `JDCreation.tsx` here, which is already one of the largest client components
 * in the app — and pay for it on every step of the flow to animate the last one.
 * This way the renderer is fetched only once the success screen actually
 * mounts, which is after a network round-trip anyway.
 */
const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((m) => m.DotLottieReact),
  {
    ssr: false,
    /* Nothing while the player loads, rather than the static badge.
       `loading` is rendered by `dynamic` with no props, so it cannot see this
       component's `fallback` — it could only ever render the DEFAULT badge, and
       that badge is blue. Flashing a blue disc inside the OTP field's green bar
       for a frame would read as a bug, where an empty box for the same frame
       reads as nothing at all. The reduced-motion path below still gets the
       caller's proper fallback, because that one is chosen during render. */
    loading: () => null,
  },
);

/**
 * What this degrades to: the tinted disc and tick that were here before the
 * animation existed.
 *
 * Used for three different cases, which is the reason it is a component rather
 * than inline markup — the loading window before the renderer arrives, a
 * viewer who has asked for reduced motion, and any environment where the
 * dynamic import never resolves. All three should look finished, not broken.
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
   * What to show instead of the animation — while the player loads, and for a
   * viewer who has asked for reduced motion.
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

  if (reducedMotion) return <>{fallback ?? <StaticBadge />}</>;

  return (
    <div className={className} aria-hidden>
      <DotLottieReact
        src="/animations/success.json"
        autoplay
        /* Plays once. A tick that redraws itself every second and a half reads
           as something still in progress, which is the opposite of what this
           screen is saying. */
        loop={false}
        className="h-full w-full"
      />
    </div>
  );
}
