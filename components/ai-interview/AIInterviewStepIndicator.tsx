'use client';

import { useCallback, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';

/**
 * The wizard pages pin both the breadcrumb and the step indicator. Hand the
 * returned ref to <PageBreadcrumb barRef> and the height to the indicator's
 * `topOffset`, so the indicator pins just below the breadcrumb's real height
 * (measured, since the bar can wrap on narrow screens) instead of under it.
 * A callback ref, so it still works when the breadcrumb mounts after a loader.
 */
export function useBreadcrumbOffset() {
  const [height, setHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const barRef = useCallback((el: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const measure = () => setHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    observerRef.current = ro;
  }, []);
  return [barRef, height] as const;
}

export const AI_INTERVIEW_STEPS = ['Select JD', 'Configure', 'Clusters', 'Preview & Publish'] as const;

export type AIInterviewStep = 1 | 2 | 3 | 4;

interface Props {
  /** 1-indexed current step. 1 = Select JD, 4 = Preview & Publish. */
  currentStep: AIInterviewStep;
  /**
   * Pixels to pin below the top of the scroll container. Pass the sticky
   * breadcrumb's measured height so the two layers stack instead of the
   * breadcrumb (z-30) covering this band.
   */
  topOffset?: number;
  /**
   * Steps the recruiter may jump to from here. Each page passes only the
   * steps its own buttons can reach, and `onStepClick` calls THOSE buttons'
   * handlers (Back / Continue / Change JD / Edit) — so a click saves the
   * draft, runs the step's checks, or raises the unsaved-changes dialog
   * exactly as the button would. Anything not listed stays plain progress.
   */
  clickableSteps?: readonly AIInterviewStep[];
  onStepClick?: (step: AIInterviewStep) => void;
  /** A save / generate is in flight: every step is inert until it lands. */
  disabled?: boolean;
}

/**
 * The wizard's progress, sticky so the recruiter always sees where in the
 * flow they are on the long Configure and Clusters pages. Steps the page
 * lists in `clickableSteps` are buttons that go there through the page's own
 * safe navigation; the rest are progress only.
 */
export function AIInterviewStepIndicator({ currentStep, topOffset = 0, clickableSteps, onStepClick, disabled = false }: Props) {
  return (
    /* The negative margins are the page card's padding (p-4 md:p-8), so the
       band spans the card edge to edge and nothing scrolls past its sides.
       It must be a DIRECT child of that card: a sticky element can only
       travel inside its parent, and wrapped in a short header <div> it stuck
       for the height of that div — a few pixels — and then scrolled away. */
    <div style={{ top: topOffset }} className="sticky z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 pb-3 sm:pb-4 mb-4 sm:mb-6 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60">
      {/* Same framed strip the JD wizard uses: soft gradient card with a
          rounded border, so both creation flows read as one component. */}
      <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-900 px-3 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          {AI_INTERVIEW_STEPS.map((label, i) => {
            const stepNum = (i + 1) as AIInterviewStep;
            const isCompleted = stepNum < currentStep;
            const isCurrent = stepNum === currentStep;
            const isLast = i === AI_INTERVIEW_STEPS.length - 1;
            const isClickable = !!onStepClick && !isCurrent && !!clickableSteps?.includes(stepNum);

            /* Circle + inline label. */
            const pillContent = (
              <>
                <div className="relative">
                  <div
                    className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full text-sm font-semibold shrink-0 transition-all duration-300 z-10 relative ${
                      isCompleted
                        // Solid dark brand blue + white tick — the same completed
                        // step as the candidate interview flow's progress bar.
                        ? 'bg-brand-blue text-white shadow-sm'
                        : isCurrent
                        ? 'bg-gradient-to-br from-brand-blue to-brand-blue-2 text-white shadow-lg shadow-brand-blue/40 ring-2 ring-brand-blue/10'
                        : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <span className="tabular-nums">{stepNum}</span>
                    )}
                  </div>
                  {isCurrent && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full bg-brand-blue/25 tf-step-pulse"
                    />
                  )}
                </div>
                <div
                  className={`hidden sm:block text-sm whitespace-nowrap font-medium transition-colors duration-300 ${
                    isCurrent
                      ? 'text-brand-blue-deep'
                      : isCompleted
                      ? 'text-gray-700'
                      : 'text-gray-400'
                  }`}
                >
                  {label}
                </div>
              </>
            );

            return (
              <div key={label} className="flex items-center gap-2 sm:gap-4">
                {/* Step pill: circle + inline label */}
                {isClickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick?.(stepNum)}
                    disabled={disabled}
                    title={`Go to ${label}`}
                    aria-label={`Go to step ${stepNum}: ${label}`}
                    className="group flex items-center gap-2.5 rounded-full pr-2 -mr-2 transition-opacity cursor-pointer [&>div:first-child>div]:transition-transform hover:[&>div:first-child>div]:scale-110 hover:[&>div:first-child>div]:ring-4 hover:[&>div:first-child>div]:ring-brand-blue/20 hover:[&>div:last-child]:text-brand-blue hover:[&>div:last-child]:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 disabled:cursor-wait disabled:opacity-60"
                  >
                    {pillContent}
                  </button>
                ) : (
                  <div className="flex items-center gap-2.5" aria-current={isCurrent ? 'step' : undefined}>{pillContent}</div>
                )}

                {/* Connector line — between steps, full color when previous is done */}
                {!isLast && (
                  <div
                    className={`w-5 sm:w-12 lg:w-24 h-0.5 rounded-full transition-colors duration-500 ${
                      isCompleted ? 'bg-brand-blue' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
