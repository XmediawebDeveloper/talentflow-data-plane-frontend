'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

/**
 * The wait while the cluster generator runs.
 *
 * A bare spinner over an empty page said only "something is happening", on a
 * call that regularly takes half a minute — long enough for a recruiter to
 * wonder whether it had hung. This says what is being done and roughly how far
 * along it is.
 *
 * The stages advance on a timer, not on progress events: the endpoint is a
 * single request that returns the finished clusters, so there is nothing to
 * subscribe to. The rail is therefore an honest description of the work in
 * order, not a measured percentage — it never claims to be finished, holding
 * on the last stage until the response actually lands.
 */
const STAGES = [
  { key: 'reading', label: 'Reading Skills' },
  { key: 'analyzing', label: 'Analyzing with AI' },
  { key: 'grouping', label: 'Grouping into Clusters' },
  { key: 'finalizing', label: 'Finalizing Results' },
] as const;

/** How long each stage is shown before the rail moves on. */
const STAGE_MS = 6000;

/** The element the Clusters page scrolls to when generation starts. */
export const CLUSTER_GENERATING_ID = 'ai-interview-cluster-generating';

export default function ClusterGeneratingState() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // Holds on the last stage: the run is over when the caller unmounts this,
    // so "Finalizing Results" must not tick past into a finished-looking rail.
    const timer = setInterval(() => {
      setStage(current => (current >= STAGES.length - 1 ? current : current + 1));
    }, STAGE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      id={CLUSTER_GENERATING_ID}
      /* `pb-20` clears the page's fixed footer bar; `scroll-mt-24` keeps the
         heading clear of the sticky page chrome when scrolled to. */
      className="pt-12 pb-20 sm:pt-16 tf-loader-center scroll-mt-24"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto w-full max-w-3xl px-2 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-blue/5 ring-1 ring-brand-blue/10 flex items-center justify-center mx-auto">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        </div>

        <h2 className="mt-5 tf-section-title sm:text-xl tracking-tight">
          AI is analyzing skills and generating clusters…
        </h2>
        <p className="mt-2 tf-body-muted max-w-xl mx-auto">
          This may take a few moments. We&apos;re using AI to group similar skills and create the
          best clusters for focused interview coverage.
        </p>

        {/* Stage rail */}
        <div className="mt-8 flex items-start justify-center">
          {STAGES.map((s, i) => {
            const done = i < stage;
            const current = i === stage;
            const isLast = i === STAGES.length - 1;
            return (
              <div key={s.key} className="flex items-start">
                <div className="flex flex-col items-center gap-2 w-16 sm:w-32">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-500 ${
                      done || current
                        ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/30'
                        : 'bg-slate-200 text-transparent'
                    }`}
                  >
                    {done ? (
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    ) : current ? (
                      <span className="w-2 h-2 rounded-full bg-white tf-step-pulse-dot" />
                    ) : null}
                  </span>
                  <span
                    className={`text-xs leading-tight transition-colors duration-500 ${
                      done || current ? 'text-brand-blue font-medium' : 'text-gray-500'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {!isLast && (
                  <div className="mt-3.5 h-0.5 w-2 sm:w-12 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                    <div
                      className={`h-full bg-brand-blue rounded-full transition-all duration-700 ${
                        done ? 'w-full' : 'w-0'
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
