'use client';

import { CheckCircle } from 'lucide-react';
import CandidateHeader from './CandidateHeader';
import { CloseWindowPill } from './CloseWindowPill';

// Mirrors the AI interview's completed page (CandidateAIInterviewPortal,
// step 'completed'): the candidate header, then a centred thank-you. Reached
// only after the submission finished, so closing the window is safe now.
export function CompletedScreen() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-gray-50">
      <CandidateHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full text-center">
          <div className="relative mx-auto mb-7 w-20 h-20">
            <span className="absolute inset-0 rounded-full bg-success/10 ring-8 ring-success/5" aria-hidden="true" />
            <span className="relative flex w-20 h-20 items-center justify-center">
              <CheckCircle className="w-10 h-10 text-success" />
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Thank you for attending the assessment</h1>
          <p className="mt-3 text-base text-gray-600">Your responses have been submitted successfully.</p>
          <CloseWindowPill className="mt-6" />
        </div>
      </main>
    </div>
  );
}
