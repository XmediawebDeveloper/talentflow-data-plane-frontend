'use client';

import { Check } from 'lucide-react';

export const AI_INTERVIEW_STEPS = ['Select JD', 'Configure', 'Clusters', 'Preview & Publish'] as const;

export type AIInterviewStep = 1 | 2 | 3 | 4;

interface Props {
  /** 1-indexed current step. 1 = Select JD, 4 = Preview & Publish. */
  currentStep: AIInterviewStep;
  /**
   * Makes already-completed steps clickable so the recruiter can jump back
   * without walking the Back buttons one page at a time. Only fires for steps
   * BEFORE `currentStep` — jumping forward would skip each step's validation
   * and save, so later steps stay inert.
   *
   * The owning page supplies this because only it knows how to leave safely
   * (save the draft first, or raise its unsaved-changes dialog).
   */
  onStepClick?: (step: AIInterviewStep) => void;
}

export function AIInterviewStepIndicator({ currentStep, onStepClick }: Props) {
  return (
    <div className="pb-6 sm:pb-8">
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-3 sm:gap-5">
          {AI_INTERVIEW_STEPS.map((label, i) => {
            const stepNum = (i + 1) as AIInterviewStep;
            const isCompleted = stepNum < currentStep;
            const isCurrent = stepNum === currentStep;
            const isLast = i === AI_INTERVIEW_STEPS.length - 1;
            const isClickable = !!onStepClick && isCompleted;

            /* Circle + inline label — identical markup whether or not the step
               is clickable, so the indicator looks the same in both modes. */
            const pillContent = (
              <>
                <div className="relative">
                  <div
                    className={`flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full text-sm sm:text-base font-bold transition-all duration-300 z-10 relative ${
                      isCompleted
                        ? `bg-gradient-to-br from-brand-cyan to-brand-cyan-2 text-white shadow-md shadow-brand-cyan/30 ring-1 ring-white/10${
                            isClickable ? ' group-hover:shadow-lg group-hover:shadow-brand-cyan/40 group-hover:ring-2 group-hover:ring-brand-cyan/30' : ''
                          }`
                        : isCurrent
                        ? 'bg-gradient-to-br from-brand-blue to-brand-blue-2 text-white shadow-lg shadow-brand-blue/40 ring-4 ring-brand-blue/10'
                        : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={3} />
                    ) : (
                      <span className="tabular-nums">{stepNum}</span>
                    )}
                  </div>
                  {isCurrent && (
                    <span
                      className="absolute inset-0 rounded-full bg-brand-blue/20 animate-ping"
                      style={{ animationDuration: '2.4s' }}
                    />
                  )}
                </div>
                <div
                  className={`hidden sm:block text-sm lg:text-base whitespace-nowrap font-semibold tracking-tight transition-colors duration-300 ${
                    isCurrent
                      ? 'text-brand-blue-deep'
                      : isCompleted
                      ? `text-gray-700${isClickable ? ' group-hover:text-brand-cyan group-hover:underline underline-offset-4' : ''}`
                      : 'text-gray-400'
                  }`}
                >
                  {label}
                </div>
              </>
            );

            return (
              <div key={label} className="flex items-center gap-3 sm:gap-5">
                {/* Step pill: circle + inline label */}
                {isClickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(stepNum)}
                    title={`Back to ${label}`}
                    aria-label={`Back to step ${stepNum}: ${label}`}
                    className="group flex items-center gap-2.5 rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/40 focus-visible:ring-offset-2"
                  >
                    {pillContent}
                  </button>
                ) : (
                  <div className="flex items-center gap-2.5">{pillContent}</div>
                )}

                {/* Connector line — between steps, full color when previous is done */}
                {!isLast && (
                  <div
                    className={`w-10 sm:w-20 lg:w-28 h-0.5 rounded-full transition-colors duration-500 ${
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
