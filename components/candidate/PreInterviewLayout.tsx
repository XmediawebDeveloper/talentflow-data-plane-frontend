'use client';

import React, { useEffect, useRef } from 'react';
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CandidateHeader from './CandidateHeader';
import { CANDIDATE_CONTAINER } from '@/lib/constants/candidateLayout';

const STEP_LABELS = [
  'Job Details & Consent',
  'Identity',
  'System Check',
  'Intro Video',
  'Language',
  'Practice',
  'Interview',
];

interface PreInterviewLayoutProps {
  currentStep: number;
  totalSteps?: number;
  stepLabels?: string[];
  position?: string;
  duration?: number;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  showNext?: boolean;
  showFooter?: boolean;
}

export default function PreInterviewLayout({
  currentStep,
  totalSteps = 7,
  stepLabels,
  position,
  duration,
  children,
  onBack,
  onNext,
  nextLabel = 'Continue',
  backLabel = 'Go Back',
  nextDisabled = false,
  showBack,
  showNext = true,
  showFooter = true,
}: PreInterviewLayoutProps) {
  const shouldShowBack = showBack !== undefined ? showBack : currentStep > 1;
  const steps = stepLabels ?? STEP_LABELS.slice(0, totalSteps);

  // The pinned header + stepper's live height, published as --tf-sticky-h on
  // <html>, and as <html>'s scroll-padding-top (+16px). It changes with the
  // breakpoint and the viewport height, so it is measured, not hard-coded.
  // scroll-padding makes every scrollIntoView and every native focus scroll
  // (Tab, .focus()) stop just below the pinned block, so the steps' scroll
  // targets need no per-element scroll-margin. On very short screens the
  // block stops being sticky (see the wrapper) and the offset drops to 0.
  // Set only while a pre-interview step is mounted, so no other page changes.
  const stickyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => {
      const pinned = getComputedStyle(el).position === 'sticky';
      const h = pinned ? el.offsetHeight : 0;
      root.style.setProperty('--tf-sticky-h', `${h}px`);
      root.style.scrollPaddingTop = `${h + 16}px`;
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener('resize', publish);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--tf-sticky-h');
      root.style.scrollPaddingTop = '';
    };
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gray-50 !bg-gray-50 [color-scheme:light]">
      {/* Header + progress stepper, pinned together to the top while the
          step scrolls. The header is the shared candidate header (the
          dashboard's bar height, logo asset and size). */}
      {/* Unpinned on very short screens (landscape phones), where the
          block would cover close to half the viewport. */}
      <div ref={stickyRef} className="sticky top-0 z-40 [@media(max-height:480px)]:static">
      <CandidateHeader />

      {/* Progress Stepper */}
      {/* Tighter on short screens (≤760px tall: small laptops) so the pinned
          block doesn't eat the page. Same column as the header row, so the
          logo, the dots and the page content share one left edge. */}
      <nav className="bg-white/90 backdrop-blur-sm border-b border-gray-200 py-3 sm:py-4 lg:py-5 [@media(max-height:760px)]:py-2 !bg-white/90 !border-gray-200">
        <div className={CANDIDATE_CONTAINER}>
          <div className="flex items-center justify-between">
            {steps.map((label, index) => {
              const stepNumber = index + 1;
              const isCompleted = stepNumber < currentStep;
              const isCurrent = stepNumber === currentStep;

              return (
                <React.Fragment key={label}>
                  {/* Step */}
                  <div className="flex flex-col items-center gap-2 [@media(max-height:760px)]:gap-1">
                    {/* Dot */}
                    <div className="relative flex items-center justify-center">
                      {isCompleted && (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-blue shadow-sm sm:h-8 sm:w-8">
                          <CheckCircle className="h-4 w-4 text-white sm:h-5 sm:w-5" />
                        </div>
                      )}
                      {isCurrent && (
                        <div className="relative flex items-center justify-center">
                          <span className="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-brand-blue opacity-20 sm:h-11 sm:w-11" />
                          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand-blue shadow-md shadow-brand-blue/30 sm:h-10 sm:w-10">
                            <span className="text-xs font-bold text-white sm:text-sm">
                              {stepNumber}
                            </span>
                          </div>
                        </div>
                      )}
                      {!isCompleted && !isCurrent && (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-200 bg-white sm:h-8 sm:w-8">
                          <span className="text-2xs font-medium text-gray-400 sm:text-xs">
                            {stepNumber}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Label — from md (below it there isn't room for 5–7
                        labels; the caption under the row names the current
                        step instead). Capped and balanced so long labels
                        wrap evenly instead of squeezing the connectors. */}
                    <span
                      className={`hidden md:block max-w-[7rem] text-balance text-center text-2xs leading-tight [@media(max-height:600px)]:hidden ${
                        isCurrent
                          ? 'font-semibold text-gray-900'
                          : isCompleted
                            ? 'font-medium text-gray-700'
                            : 'text-gray-400'
                      }`}
                    >
                      {label}
                    </span>
                  </div>

                  {/* Connector line */}
                  {index < steps.length - 1 && (
                    <div
                      className={`mx-0.5 min-w-3 h-0.5 flex-1 rounded-full sm:mx-2 ${
                        stepNumber < currentStep
                          ? 'bg-gray-700'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          {/* Phones and small tablets: the labels are hidden, so name the
              current step under the dots. */}
          {steps[currentStep - 1] && (
            <p className="mt-2 text-center text-xs font-medium text-gray-700 md:hidden [@media(max-height:600px)]:hidden">
              Step {currentStep} of {steps.length} · {steps[currentStep - 1]}
            </p>
          )}
        </div>
      </nav>
      </div>

      {/* Content */}
      <main className="flex flex-1 flex-col">
        <div className={`${CANDIDATE_CONTAINER} flex-1 py-5 sm:py-8`}>
          {children}
        </div>
      </main>

      {/* Footer */}
      {showFooter && (
        <footer className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] sm:px-6 sm:py-4">
          <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
            <div>
              {shouldShowBack && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={onBack}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {backLabel}
                </Button>
              )}
            </div>
            <div>
              {showNext && (
                <Button
                  variant="primary"
                  type="button"
                  onClick={onNext}
                  disabled={nextDisabled}
                >
                  {nextLabel}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </footer>
      )}

      {/* Help text */}
      <div className="bg-white/60 px-4 py-3 text-center">
        <p className="text-xs text-gray-400 sm:text-sm">
          Need help?{' '}
          <a
            href="mailto:support@talentflow.com"
            className="font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Contact support@talentflow.com
          </a>
        </p>
      </div>
    </div>
  );
}
