'use client';

import React from 'react';
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const STEP_LABELS = [
  'Consent',
  'Job Details',
  'Identity',
  'System Check',
  'Intro Video',
  'Language',
  'Practice',
];

interface PreInterviewLayoutProps {
  currentStep: number;
  totalSteps?: number;
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
  const steps = STEP_LABELS.slice(0, totalSteps);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* Progress Stepper */}
      <nav className="bg-white/80 backdrop-blur-sm px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            {steps.map((label, index) => {
              const stepNumber = index + 1;
              const isCompleted = stepNumber < currentStep;
              const isCurrent = stepNumber === currentStep;

              return (
                <React.Fragment key={label}>
                  {/* Step */}
                  <div className="flex flex-col items-center gap-2">
                    {/* Dot */}
                    <div className="relative flex items-center justify-center">
                      {isCompleted && (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-blue-600 shadow-md shadow-purple-200 sm:h-8 sm:w-8">
                          <CheckCircle className="h-4 w-4 text-white sm:h-5 sm:w-5" />
                        </div>
                      )}
                      {isCurrent && (
                        <div className="relative flex items-center justify-center">
                          <span className="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-purple-400 opacity-25 sm:h-11 sm:w-11" />
                          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-300 sm:h-10 sm:w-10">
                            <span className="text-xs font-bold text-white sm:text-sm">
                              {stepNumber}
                            </span>
                          </div>
                        </div>
                      )}
                      {!isCompleted && !isCurrent && (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-200 bg-white sm:h-8 sm:w-8">
                          <span className="text-[10px] font-medium text-gray-400 sm:text-xs">
                            {stepNumber}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Label (hidden on mobile) */}
                    <span
                      className={`hidden text-center text-[11px] leading-tight sm:block ${
                        isCurrent
                          ? 'font-semibold bg-gradient-to-r from-purple-700 to-blue-700 bg-clip-text text-transparent'
                          : isCompleted
                            ? 'font-medium text-purple-600'
                            : 'text-gray-400'
                      }`}
                    >
                      {label}
                    </span>
                  </div>

                  {/* Connector line */}
                  {index < steps.length - 1 && (
                    <div
                      className={`mx-1 h-0.5 flex-1 rounded-full sm:mx-2 ${
                        stepNumber < currentStep
                          ? 'bg-gradient-to-r from-purple-500 to-blue-500'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      {showFooter && (
        <footer className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] sm:px-6 sm:py-4">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <div>
              {shouldShowBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-400 sm:px-5 sm:text-base"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {backLabel}
                </button>
              )}
            </div>
            <div>
              {showNext && (
                <button
                  type="button"
                  onClick={onNext}
                  disabled={nextDisabled}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-purple-200 transition-all hover:from-blue-700 hover:to-purple-700 hover:shadow-lg hover:shadow-purple-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:px-6 sm:text-base"
                >
                  {nextLabel}
                  <ChevronRight className="h-4 w-4" />
                </button>
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
            className="font-medium text-purple-600 hover:text-purple-700 transition-colors"
          >
            Contact support@talentflow.com
          </a>
        </p>
      </div>
    </div>
  );
}
