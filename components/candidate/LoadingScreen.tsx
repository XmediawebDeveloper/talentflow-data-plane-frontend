'use client';

import { useEffect, useState } from 'react';
import { loadDotlottieWc, loadLottieData, usePrefersReducedMotion } from '@/components/ui/success-animation';

interface LoadingScreenProps {
  message: string;
  subMessage?: string;
  /** Optional stage labels shown under the text ("Setting up", …). The screen
   *  has no real progress signal, so the active stage advances on a timer and
   *  holds on the last one until the host swaps this screen out. */
  steps?: string[];
}

/** How long each stage stays active before the next one lights up. */
const STEP_ADVANCE_MS = 5000;

const LOADING_ANIMATION_URL = '/animations/loading.json';

/**
 * `loading.json` is drawn on a 16:9 canvas, and its three dots only ever move
 * within the middle quarter of it (measured across a full playback: x 39–62%,
 * y 21–56%). So the player is rendered larger than the disc and centred on that
 * region, and the disc clips the empty canvas around it.
 */
const LOTTIE_BOX = { width: 368, height: 207 };
const LOTTIE_FOCUS = 'translate(-50.25%, -40%)';

/** What shows while the player's script loads, and for reduced motion: the same
 *  three dots, still. */
function StaticDots() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      <span className="w-2.5 h-2.5 rounded-full bg-brand-blue" />
      <span className="w-2.5 h-2.5 rounded-full bg-brand-blue/60" />
      <span className="w-2.5 h-2.5 rounded-full bg-brand-blue/30" />
    </div>
  );
}

function LoadingAnimation() {
  const reducedMotion = usePrefersReducedMotion();
  const [animationData, setAnimationData] = useState<string | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    // The player gets the JSON itself (see loadLottieData): given a `src` it
    // fetches on its own and logs an AbortError whenever this screen is
    // swapped out before that fetch finishes.
    Promise.all([loadDotlottieWc(), loadLottieData(LOADING_ANIMATION_URL)])
      .then(([, data]) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        /* CDN or animation fetch failed — stay on the static dots. */
      });
    return () => {
      cancelled = true;
    };
  }, [reducedMotion]);

  if (reducedMotion || !animationData) return <StaticDots />;

  const DotlottieWc = 'dotlottie-wc' as unknown as React.ElementType<{
    data: string;
    autoplay?: boolean;
    loop?: boolean;
    class?: string;
    style?: React.CSSProperties;
  }>;

  return (
    <div className="absolute left-1/2 top-1/2" style={{ ...LOTTIE_BOX, transform: LOTTIE_FOCUS }} aria-hidden>
      <DotlottieWc data={animationData} autoplay loop class="block h-full w-full" />
    </div>
  );
}

function LoadingSteps({ steps }: { steps: string[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (active >= steps.length - 1) return;
    const t = setTimeout(() => setActive((i) => i + 1), STEP_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [active, steps.length]);

  return (
    <ol className="mt-8 flex items-start justify-center max-w-full overflow-x-auto" aria-label="Progress">
      {steps.map((label, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <li key={label} className="flex items-start">
            {i > 0 && (
              <span
                aria-hidden
                className={`mt-[11px] h-px w-10 sm:w-16 transition-colors duration-500 ${
                  i <= active ? 'bg-brand-blue/40' : 'bg-gray-200'
                }`}
              />
            )}
            <div className="flex flex-col items-center w-20 sm:w-24" aria-current={current ? 'step' : undefined}>
              <span className="w-6 h-6 flex items-center justify-center">
                <span
                  className={`rounded-full transition-all duration-500 ${
                    current
                      ? 'w-3 h-3 bg-brand-blue ring-[6px] ring-brand-blue/15'
                      : done
                        ? 'w-2.5 h-2.5 bg-brand-blue'
                        : 'w-2.5 h-2.5 bg-gray-300'
                  }`}
                />
              </span>
              <span
                className={`mt-2 text-xs sm:text-sm transition-colors duration-500 ${
                  current ? 'font-medium text-gray-900' : 'text-gray-500'
                }`}
              >
                {label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LoadingScreen({ message, subMessage, steps }: LoadingScreenProps) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center px-4" role="status" aria-live="polite">
      <div className="text-center max-w-lg">
        {/* The animation on its own — this box only crops the Lottie's empty
            16:9 canvas down to where its dots move. */}
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 mx-auto mb-6 overflow-hidden flex items-center justify-center">
          <LoadingAnimation />
        </div>

        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">{message}</h2>
        {subMessage && (
          <p className="mt-2 text-sm sm:text-base text-gray-600 max-w-md mx-auto">{subMessage}</p>
        )}

        {steps && steps.length > 0 && <LoadingSteps steps={steps} />}
      </div>
    </div>
  );
}
