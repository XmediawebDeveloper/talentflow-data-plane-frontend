'use client';

import React from 'react';
import { CheckCircle } from 'lucide-react';

// Ripple behind the ACTIVE step's number — two brand-blue rings expanding
// out of the circle, staggered so one is always visible.
const STEP_RIPPLE_CSS = `
@keyframes tf-step-ripple {
  0%   { transform: scale(1);   opacity: 0.55; }
  100% { transform: scale(2.1); opacity: 0; }
}
.tf-step-ripple {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: var(--brand-blue);
  pointer-events: none;
  animation: tf-step-ripple 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.tf-step-ripple--late { animation-delay: 0.9s; }
@media (prefers-reduced-motion: reduce) {
  .tf-step-ripple { animation: none; opacity: 0; }
}
`;

/** The numbered circle; `active` adds the ripple rings behind it. */
function StepCircle({ active, className, children }: { active: boolean; className: string; children: React.ReactNode }) {
  return (
    <span className="relative flex h-7 w-7 flex-shrink-0">
      {active && (
        <>
          <span aria-hidden className="tf-step-ripple" />
          <span aria-hidden className="tf-step-ripple tf-step-ripple--late" />
        </>
      )}
      <span className={`relative flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${className}`}>
        {children}
      </span>
    </span>
  );
}

/**
 * The compact in-step progress card used inside a portal step that has its
 * own sub-pages (Identity: Candidate Details → Live Photo Capture; System
 * Check: Browser Check → System Checks). Rendered FIRST on every sub-page so
 * it stays put while the content below it swaps.
 *
 * `activeIndex` is the current sub-page; steps before it show a tick. With
 * `allComplete`, every step shows a tick and nothing ripples.
 */
export default function SubStepProgress({
  steps,
  activeIndex,
  allComplete = false,
}: {
  steps: readonly string[];
  activeIndex: number;
  allComplete?: boolean;
}) {
  return (
    <div className="w-full max-w-xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-sm px-3 sm:px-5 py-3 flex items-center gap-2 sm:gap-4">
      <style>{STEP_RIPPLE_CSS}</style>
      {steps.map((label, idx) => {
        const done = allComplete || idx < activeIndex;
        const active = !allComplete && idx === activeIndex;
        const reached = done || active;
        return (
          <React.Fragment key={label}>
            {idx > 0 && (
              <div className={`h-0.5 flex-1 min-w-4 rounded-full transition-colors ${idx <= activeIndex || allComplete ? 'bg-brand-blue' : 'bg-gray-200'}`} />
            )}
            <div className="flex items-center gap-2 min-w-0">
              <StepCircle
                active={active}
                className={reached ? 'bg-brand-blue text-white' : 'bg-white border-2 border-gray-300 text-gray-400'}
              >
                {done ? <CheckCircle className="w-4 h-4" /> : idx + 1}
              </StepCircle>
              {/* Wraps on narrow phones (two long labels don't fit one
                  line at 320px); one line from sm. */}
              <span className={`text-sm font-semibold leading-tight whitespace-normal sm:whitespace-nowrap ${
                active ? 'text-gray-900' : done ? 'text-gray-500' : 'text-gray-400'
              }`}>
                {label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
