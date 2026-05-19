'use client';

import { Check } from 'lucide-react';

export const AI_INTERVIEW_STEPS = ['Select JD', 'Configure', 'Clusters', 'Preview & Publish'] as const;

interface Props {
  /** 1-indexed current step. 1 = Select JD, 4 = Preview & Publish. */
  currentStep: 1 | 2 | 3 | 4;
}

export function AIInterviewStepIndicator({ currentStep }: Props) {
  return (
    <div className="pb-6 sm:pb-8">
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-3 sm:gap-5">
          {AI_INTERVIEW_STEPS.map((label, i) => {
            const stepNum = (i + 1) as 1 | 2 | 3 | 4;
            const isCompleted = stepNum < currentStep;
            const isCurrent = stepNum === currentStep;
            const isLast = i === AI_INTERVIEW_STEPS.length - 1;
            return (
              <div key={label} className="flex items-center gap-3 sm:gap-5">
                {/* Step pill: circle + inline label */}
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <div
                      className={`flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full text-sm sm:text-base font-bold transition-all duration-300 z-10 relative ${
                        isCompleted
                          ? 'bg-gradient-to-br from-brand-cyan to-brand-cyan-2 text-white shadow-md shadow-brand-cyan/30 ring-1 ring-white/10'
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
                        ? 'text-gray-700'
                        : 'text-gray-400'
                    }`}
                  >
                    {label}
                  </div>
                </div>

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
