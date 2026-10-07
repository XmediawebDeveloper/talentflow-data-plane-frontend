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
  /** Bottom rule. Step 5 turns it off: the card under it does the separating. */
  bordered?: boolean;
}

export default function CandidateStepper({ current, steps = ASSESSMENT_STEPS, bordered = true }: CandidateStepperProps) {
  return (
    <div className={`w-full bg-white ${bordered ? 'border-b border-gray-200' : ''}`}>
      <div className={`${RECRUITER_BAR_ROW} py-3 sm:py-4`}>
        {/* Phones and tablets: the position in words, so "Step X - Name" reads
            at a glance whatever the row below has room for. */}
        <p className="xl:hidden text-sm font-medium text-brand-blue mb-3 text-center" aria-live="polite">
          Step {current} of {steps.length}: {steps[current - 1]}
        </p>

        {/* Phones and tablets: one equal-width column per step - number (or
            tick) on top, its name directly under it - joined by a line through
            the dot centres. The inline row below cannot fit five names under
            ~1100px (it wrapped even at 1024), and on a phone it showed only the current
            step's name, inline, pushing the last step onto a line of its own.
            Columns never wrap, every number keeps its name, and the row is
            exactly the screen's width. */}
        <ol
          className="xl:hidden grid"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
          aria-label="Assessment progress"
        >
          {steps.map((label, index) => {
            const stepNumber = index + 1;
            const isCompleted = stepNumber < current;
            const isCurrent = stepNumber === current;

            return (
              <li key={label} className="relative flex flex-col items-center text-center min-w-0 px-0.5">
                {/* Connector from the previous step's dot to this one, behind
                    the dots. Done once the previous step is complete. */}
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${stepNumber <= current ? 'bg-success' : 'bg-gray-200'}`}
                  />
                )}
                <div
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${
                    isCompleted
                      ? 'bg-success text-white'
                      : isCurrent
                        ? 'bg-brand-blue text-white ring-4 ring-brand-blue/15'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : stepNumber}
                </div>
                <span
                  className={`mt-1.5 text-2xs sm:text-xs leading-tight line-clamp-2 break-words ${
                    isCurrent ? 'font-semibold text-gray-900' : isCompleted ? 'font-medium text-success' : 'font-medium text-gray-500'
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Desktop (`xl` and up, where it fits on one line): the inline row, unchanged. */}
        <div className="hidden xl:flex flex-wrap items-center justify-center gap-2" aria-label="Assessment progress">
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
                    {label}
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
