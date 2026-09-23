'use client';

import { Check } from 'lucide-react';
import { RECRUITER_BAR_ROW } from '@/lib/constants/candidateLayout';

/**
 * The five-step progress bar across the top of the candidate assessment flow.
 *
 * Written out by hand on each of the four screens that show it, and drifted on
 * every axis that could drift: dots were `w-8` on three screens and `w-6` on
 * the fourth, the current step was `bg-blue-600` on two, `bg-blue-500` on
 * another, the completed tick was a `<Check/>` on three and a literal "✓"
 * character on the fourth, one had no `flex-wrap` and overflowed a phone
 * sideways, and two showed no label at all below `sm` so the candidate could
 * not tell which step they were on.
 *
 * One component, so a step looks the same on the screen you came from as on
 * the screen you are going to. Colours are the flow's tokens — `brand-blue`
 * for the step you are on, `success` for the ones behind you, grey ahead —
 * rather than raw palette steps.
 */

export const ASSESSMENT_STEPS = [
  'Terms & Consent',
  'Assessment Details',
  'System Check',
  'HR Questions',
  'Assessment',
] as const;

interface CandidateStepperProps {
  /** 1-based index of the step the candidate is on. */
  current: number;
  /**
   * Steps to show. Defaults to all five; a flow without an HR round passes a
   * shorter list, and the numbering follows the list rather than being fixed.
   */
  steps?: readonly string[];
}

export default function CandidateStepper({ current, steps = ASSESSMENT_STEPS }: CandidateStepperProps) {
  return (
    <div className="w-full bg-white border-b border-gray-200">
      <div className={`${RECRUITER_BAR_ROW} py-3 sm:py-4`}>
        {/* Below `sm` the labels are hidden to keep the row on one line, so
            this states the position in words instead — otherwise the dots say
            nothing about where the candidate is. */}
        <p className="sm:hidden text-sm font-medium text-brand-blue mb-3 text-center" aria-live="polite">
          Step {current} of {steps.length}: {steps[current - 1]}
        </p>

        {/* `flex-wrap` is load-bearing: five 32px dots and four connectors do
            not fit a 360px phone, and without it the row pushed the whole page
            sideways. */}
        <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Assessment progress">
          {steps.map((label, index) => {
            const stepNumber = index + 1;
            const isCompleted = stepNumber < current;
            const isCurrent = stepNumber === current;

            return (
              <div key={label} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all shrink-0 ${
                      isCompleted
                        ? 'bg-success text-white'
                        : isCurrent
                          ? 'bg-brand-blue text-white'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : stepNumber}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      isCurrent ? 'text-gray-900' : isCompleted ? 'text-success' : 'text-gray-500'
                    }`}
                  >
                    {/* Only the current step names itself on a phone. */}
                    <span className="sm:hidden">{isCurrent ? label : ''}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </span>
                </div>

                {index < steps.length - 1 && (
                  <div
                    className={`w-6 sm:w-12 h-0.5 mx-2 shrink-0 ${isCompleted ? 'bg-success' : 'bg-gray-200'}`}
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
