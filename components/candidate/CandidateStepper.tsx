'use client';

import { createContext, useContext } from 'react';
import { CheckCircle } from 'lucide-react';
import { RECRUITER_BAR_ROW } from '@/lib/constants/candidateLayout';

/**
 * The four-step progress bar across the top of the candidate assessment flow.
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
 *
 * Styled like the recruiter's AI Interview step indicator
 * (components/ai-interview/AIInterviewStepIndicator.tsx): completed steps are
 * solid brand blue with a white tick, the current step a brand-blue gradient
 * with a soft glow and pulse, and the connectors turn blue behind you.
 */

const DOT_COMPLETED = 'bg-brand-blue text-white shadow-sm';
const DOT_CURRENT = 'bg-gradient-to-br from-brand-blue to-brand-blue-2 text-white shadow-lg shadow-brand-blue/40 ring-2 ring-brand-blue/10';
const DOT_UPCOMING = 'bg-gray-100 text-gray-400 ring-1 ring-gray-200';

/** The current step's pulse, the same keyframes the AI interview uses. */
function CurrentPulse() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full bg-brand-blue/25 tf-step-pulse"
    />
  );
}

/* Terms & Consent and Assessment Details were two steps; they are one screen
   now, "Job & Consent" (JobConsentScreen). */
export const ASSESSMENT_STEPS = [
  'Job & Consent',
  'System Check',
  'HR Questions',
  'Assessment',
] as const;

/**
 * Whether this attempt has an HR Questions step. Provided ONCE by the portal
 * (CandidateAssessmentPortal) from the same check that decides whether the HR
 * screen is shown at all, so every screen draws the same list. Before this,
 * Terms & Consent hard-coded a four-step list without HR while every later
 * screen drew all five — "Assessment" was step 4 on the first screen and
 * jumped to step 5 when HR Questions suddenly appeared. Defaults to true so a
 * stepper rendered outside the portal keeps the full list.
 */
const CandidateHrStepContext = createContext<boolean>(true);
export const CandidateHrStepProvider = CandidateHrStepContext.Provider;

interface CandidateStepperProps {
  /**
   * 1-based position of the step the candidate is on, counted in the FULL
   * four-step list (1 = Job & Consent … 4 = Assessment). When the attempt
   * has no HR step the stepper drops it and renumbers, so callers never need
   * to know whether HR is on.
   */
  current: number;
  /**
   * An explicit list, for a flow that is not the assessment's four steps.
   * When given, `current` indexes this list as-is and the HR context is not
   * consulted.
   */
  steps?: readonly string[];
  /** Bottom rule. The Assessment step turns it off: the card under it does the separating. */
  bordered?: boolean;
  /** Accessible name of the progress list. The AI interview passes its own. */
  label?: string;
}

export default function CandidateStepper({ current: currentProp, steps: stepsProp, bordered = true, label: ariaLabel = 'Assessment progress' }: CandidateStepperProps) {
  const hasHrStep = useContext(CandidateHrStepContext);
  const steps: readonly string[] = stepsProp
    ?? (hasHrStep ? ASSESSMENT_STEPS : ASSESSMENT_STEPS.filter((step) => step !== 'HR Questions'));
  const current = stepsProp
    ? currentProp
    : steps.indexOf(ASSESSMENT_STEPS[currentProp - 1]) + 1;
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
          aria-label={ariaLabel}
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
                    className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${stepNumber <= current ? 'bg-brand-blue' : 'bg-gray-200'}`}
                  />
                )}
                <div className="relative z-10 shrink-0">
                  <div
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                      isCompleted ? DOT_COMPLETED : isCurrent ? DOT_CURRENT : DOT_UPCOMING
                    }`}
                  >
                    {isCompleted ? <CheckCircle className="w-4 h-4" /> : <span className="tabular-nums">{stepNumber}</span>}
                  </div>
                  {isCurrent && <CurrentPulse />}
                </div>
                <span
                  className={`mt-1.5 text-xs leading-tight line-clamp-2 break-words ${
                    isCurrent ? 'font-semibold text-brand-blue' : isCompleted ? 'font-medium text-gray-700' : 'font-medium text-gray-400'
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Desktop (`xl` and up, where it fits on one line): the inline row, unchanged. */}
        <div className="hidden xl:flex flex-wrap items-center justify-center gap-2" aria-label={ariaLabel}>
          {steps.map((label, index) => {
            const stepNumber = index + 1;
            const isCompleted = stepNumber < current;
            const isCurrent = stepNumber === current;

            return (
              <div key={label} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div className="relative shrink-0">
                    <div
                      aria-current={isCurrent ? 'step' : undefined}
                      className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                        isCompleted ? DOT_COMPLETED : isCurrent ? DOT_CURRENT : DOT_UPCOMING
                      }`}
                    >
                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : <span className="tabular-nums">{stepNumber}</span>}
                    </div>
                    {isCurrent && <CurrentPulse />}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      isCurrent ? 'text-brand-blue font-semibold' : isCompleted ? 'text-gray-700' : 'text-gray-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>

                {index < steps.length - 1 && (
                  <div
                    className={`${
                      /* Longer lists (the AI interview's six or seven steps)
                         keep short connectors until 2xl, so the row stays on
                         one line on a 1280px laptop. */
                      steps.length > 5 ? 'w-6 2xl:w-12' : 'w-6 sm:w-12'
                    } h-0.5 mx-2 shrink-0 ${isCompleted ? 'bg-brand-blue' : 'bg-gray-200'}`}
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
