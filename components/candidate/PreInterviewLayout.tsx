'use client';

import React from 'react';
import Image from 'next/image';
import { CheckCircle, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gray-50 !bg-gray-50 [color-scheme:light]">
      {/* Header with logo */}
      <header className="w-full bg-white border-b border-gray-200">
        <div className="w-full px-6 lg:px-12 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/logos/talent_flow_logo.png"
                alt="TalentFlow"
                width={200}
                height={70}
                className="h-16 w-auto"
                priority
                unoptimized
              />
            </div>
            <a
              href="mailto:support@talentflow.com"
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              Need help?
            </a>
          </div>
        </div>
      </header>

      {/* Progress Stepper */}
      <nav className="bg-white/90 backdrop-blur-sm border-b border-gray-200 px-4 py-4 sm:px-8 sm:py-5 !bg-white/90 !border-gray-200">
        <div className="w-full max-w-6xl mx-auto">
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
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 shadow-sm sm:h-8 sm:w-8">
                          <CheckCircle className="h-4 w-4 text-white sm:h-5 sm:w-5" />
                        </div>
                      )}
                      {isCurrent && (
                        <div className="relative flex items-center justify-center">
                          <span className="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-gray-400 opacity-20 sm:h-11 sm:w-11" />
                          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 shadow-md shadow-gray-300 sm:h-10 sm:w-10">
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
                    {/* Label (hidden on mobile) */}
                    <span
                      className={`hidden text-center text-2xs leading-tight sm:block ${
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
                      className={`mx-1 h-0.5 flex-1 rounded-full sm:mx-2 ${
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
        </div>
      </nav>

      {/* Content */}
      <main className="flex flex-1 flex-col">
        <div className="w-full max-w-6xl mx-auto flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      {showFooter && (
        <footer className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] sm:px-6 sm:py-4">
          <div className="w-full max-w-6xl mx-auto flex items-center justify-between">
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
