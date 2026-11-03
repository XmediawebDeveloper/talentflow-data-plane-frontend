'use client';

import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CandidateHeader from './CandidateHeader';
import CandidateStepper from './CandidateStepper';
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
    <div className="flex min-h-[100dvh] flex-col bg-gray-50">
      {/* Header + progress stepper, pinned together to the top while the
          step scrolls. The header is the shared candidate header (the
          dashboard's bar height, logo asset and size). */}
      {/* Unpinned on very short screens (landscape phones), where the
          block would cover close to half the viewport. */}
      <div ref={stickyRef} className="sticky top-0 z-40 [@media(max-height:480px)]:static">
      <CandidateHeader />

      {/* Progress stepper — the assessment flow's centred stepper
          (CandidateStepper), so both candidate flows show their steps the
          same way. Its height is measured above, like the bar it replaced. */}
      <CandidateStepper current={currentStep} steps={steps} label="Interview progress" />
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
          <div className="w-full max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
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
      <div className="bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-center">
        <p className="tf-hint sm:text-sm">
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
