'use client';

import { useEffect, useState } from 'react';
import { Check, FileText, Layers, Loader2, Share2, Sparkles } from 'lucide-react';

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

const CARDS = [
  {
    icon: FileText,
    title: 'Analyzing Skills',
    body: 'Understanding skill context',
    tile: 'bg-brand-blue/10 ring-brand-blue/15 text-brand-blue',
  },
  {
    icon: Share2,
    title: 'Finding Patterns',
    body: 'Grouping similar skills',
    tile: 'bg-brand-cyan/10 ring-brand-cyan/15 text-brand-cyan',
  },
  {
    icon: Layers,
    title: 'Creating Clusters',
    body: 'Optimizing for interview coverage',
    tile: 'bg-advice-positive-bg ring-advice-positive/20 text-advice-positive',
  },
  {
    icon: Sparkles,
    title: 'Preparing Results',
    body: 'Almost there…',
    tile: 'bg-brand-orange/10 ring-brand-orange/15 text-brand-orange-deep',
  },
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
      className="pt-8 pb-20 sm:pt-10 tf-loader-center scroll-mt-24"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto w-full max-w-3xl px-2 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-blue/5 ring-1 ring-brand-blue/10 flex items-center justify-center mx-auto">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        </div>

        <h2 className="mt-5 text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">
          AI is analyzing skills and generating clusters…
        </h2>
        <p className="mt-2 text-sm text-gray-500 max-w-xl mx-auto">
          This may take a few moments. We&apos;re using AI to group similar skills and create the
          best clusters for focused interview coverage.
        </p>

        {/* Stage rail */}
        <div className="mt-6 flex items-start justify-center">
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
                    className={`text-2xs sm:text-xs leading-tight transition-colors duration-500 ${
                      done || current ? 'text-brand-blue font-medium' : 'text-gray-400'
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

        {/* What each part of the run is doing */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-left">
          {CARDS.map((card, i) => (
            <div
              key={card.title}
              className={`rounded-xl border p-3 transition-colors duration-500 ${
                i === stage
                  ? 'border-brand-blue/30 bg-brand-blue/[0.03] ring-1 ring-brand-blue/10'
                  : 'border-gray-100 bg-white ring-1 ring-black/[0.02]'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg ring-1 flex items-center justify-center ${card.tile}`}>
                <card.icon className="w-4 h-4" />
              </div>
              <p className="mt-2 text-xs font-semibold text-gray-900">{card.title}</p>
              <p className="text-2xs text-gray-500 leading-snug">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
