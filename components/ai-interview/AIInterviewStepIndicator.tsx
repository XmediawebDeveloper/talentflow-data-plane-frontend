'use client';

import { Check } from 'lucide-react';

export const AI_INTERVIEW_STEPS = ['Select JD', 'Configure', 'Clusters', 'Preview & Publish'] as const;

export type AIInterviewStep = 1 | 2 | 3 | 4;

interface Props {
  /** 1-indexed current step. 1 = Select JD, 4 = Preview & Publish. */
  currentStep: AIInterviewStep;
}

/**
 * Progress only, never navigation. Completed steps used to be clickable
 * shortcuts back; the pages' own Back buttons are the one way to leave a step,
 * because each of them knows how to leave it safely (save the draft, or raise
 * the unsaved-changes dialog). Sticky, so the recruiter always sees where in
 * the flow they are on the long Configure and Clusters pages.
 */
export function AIInterviewStepIndicator({ currentStep }: Props) {
  return (
    /* The negative margins are the page card's padding (p-4 md:p-8), so the
       band spans the card edge to edge and nothing scrolls past its sides.
       It must be a DIRECT child of that card: a sticky element can only
       travel inside its parent, and wrapped in a short header <div> it stuck
       for the height of that div — a few pixels — and then scrolled away. */
    <div className="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 pb-3 sm:pb-4 mb-4 sm:mb-6 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60">
      {/* Same framed strip the JD wizard uses: soft gradient card with a
          rounded border, so both creation flows read as one component. */}
      <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-900 px-3 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          {AI_INTERVIEW_STEPS.map((label, i) => {
            const stepNum = (i + 1) as AIInterviewStep;
            const isCompleted = stepNum < currentStep;
            const isCurrent = stepNum === currentStep;
            const isLast = i === AI_INTERVIEW_STEPS.length - 1;

            /* Circle + inline label. */
            const pillContent = (
              <>
                <div className="relative">
                  <div
                    className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full text-sm font-semibold shrink-0 transition-all duration-300 z-10 relative ${
                      isCompleted
                        ? 'bg-gradient-to-br from-brand-cyan to-brand-cyan-2 text-white shadow-md shadow-brand-cyan/30 ring-1 ring-white/10'
                        : isCurrent
                        ? 'bg-gradient-to-br from-brand-blue to-brand-blue-2 text-white shadow-lg shadow-brand-blue/40 ring-2 ring-brand-blue/10'
                        : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" strokeWidth={3} />
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
                <div className="flex items-center gap-2.5">{pillContent}</div>

                {/* Connector line — between steps, full color when previous is done */}
                {!isLast && (
                  <div
                    className={`w-5 sm:w-12 lg:w-24 h-0.5 rounded-full transition-colors duration-500 ${
                      isCompleted ? 'bg-brand-cyan' : 'bg-gray-200'
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
