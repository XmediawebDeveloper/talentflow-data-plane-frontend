'use client';

import { CheckCircle, Clock, FileText, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import SuccessAnimation from '@/components/ui/success-animation';

interface CompletedScreenProps {
  assessmentTitle?: string;
  candidateName?: string;
}

// Detect the candidate's OS so the manual-close shortcut hint matches.
const getCloseShortcut = (): string => {
  if (typeof navigator === 'undefined') return 'Ctrl + W';
  const ua = navigator.userAgent.toLowerCase();
  return /mac|iphone|ipad|ipod/.test(ua) ? '⌘ + W' : 'Ctrl + W';
};

export function CompletedScreen({ assessmentTitle, candidateName }: CompletedScreenProps) {
  // `window.close()` only succeeds if the page was opened by a script
  // (e.g., window.open). Candidates arrive from an email link or the
  // address bar, so the call is silently blocked by every modern browser
  // and the button appears dead. We attempt the close, then check after a
  // short delay whether we're still alive — if so, surface a clear
  // fallback message instead of leaving the candidate stuck.
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [shortcut] = useState(getCloseShortcut);

  const handleClose = () => {
    try {
      window.close();
    } catch {
      /* swallow — we'll fall through to the fallback below */
    }
    // If after 300ms the tab is still alive, the browser blocked the
    // close. Switch the UI to tell the candidate exactly how to close.
    setTimeout(() => {
      if (!window.closed) {
        setCloseBlocked(true);
      }
    }, 300);
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Success Card */}
        <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-8 text-center">
          {/* The completed tick: `SuccessAnimation`, the same component the
              recruiter's "Assessment Published!" screen plays. Nothing is shown
              while its script loads — an empty box of the animation's size holds
              the space — so the tick only ever appears drawn by the animation.
              The green disc stays as the fallback for reduced motion or a CDN
              that never answers, where no animation will run at all. */}
          <div className="flex justify-center mb-4 sm:mb-5">
            <SuccessAnimation
              placeholder={<div className="w-24 h-24 sm:w-32 sm:h-32" aria-hidden />}
              fallback={
                <div className="w-20 h-20 bg-success-subtle rounded-full flex items-center justify-center">
                  <CheckCircle className="w-12 h-12 text-success" />
                </div>
              }
            />
          </div>

          {/* Title */}
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Assessment Completed!
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-gray-600 mb-5 sm:mb-6">
            {candidateName ? `Thank you, ${candidateName}!` : 'Thank you!'} Your assessment has been submitted successfully.
          </p>

          {/* Info Box — the assessment and what happens next, split by a rule. */}
          <div className="bg-info-subtle/40 rounded-xl px-4 sm:px-5 mb-3 text-left divide-y divide-info-line/70">
            {assessmentTitle && (
              <div className="flex items-center gap-3 sm:gap-4 py-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Assessment</p>
                  <p className="text-sm sm:text-base font-medium text-gray-900 break-words">{assessmentTitle}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 sm:gap-4 py-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-cyan/10 text-brand-cyan flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-wide">What happens next?</p>
                <p className="text-sm sm:text-base font-medium text-gray-900">Your responses are being evaluated</p>
              </div>
            </div>
          </div>

          {/* Message — its own small panel, as in the reference. */}
          <div className="bg-info-subtle/40 rounded-xl px-4 sm:px-5 py-3.5 mb-5 sm:mb-6 flex items-center gap-3 sm:gap-4 text-left">
            <div className="w-10 h-10 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <p className="text-sm text-gray-600">
              The hiring team will review your results and contact you with next steps.
            </p>
          </div>

          {/* Close Button */}
          {closeBlocked ? (
            <div className="rounded-xl border border-warning-line bg-warning-subtle px-4 py-3 text-left">
              <p className="text-sm font-medium text-warning-strong mb-1">
                Your browser blocked the auto-close.
              </p>
              <p className="text-xs text-warning-strong">
                Please close this tab manually — press{' '}
                <kbd className="px-1.5 py-0.5 bg-white border border-warning-line rounded text-2xs font-mono">
                  {shortcut}
                </kbd>{' '}
                or click the ✕ on the tab. Your assessment has been submitted and your responses are saved.
              </p>
            </div>
          ) : (
            <Button
              variant="primary"
              onClick={handleClose}
              className="w-full"
            >
              <X className="w-4 h-4" />
              Close Window
            </Button>
          )}

          {/* Footer */}
          <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-border">
            <p className="text-xs text-gray-400">
              Powered by TalentFlow AI Assessment Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
