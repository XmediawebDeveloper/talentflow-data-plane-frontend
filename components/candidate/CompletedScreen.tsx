'use client';

import { CheckCircle, Clock, FileText, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

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
    <div className="min-h-[100dvh] bg-gradient-to-br from-green-50 to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Success Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Success Icon */}
          <div className="w-20 h-20 bg-success-subtle rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-success" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Assessment Completed!
          </h1>

          {/* Subtitle */}
          <p className="text-gray-600 mb-6">
            {candidateName ? `Thank you, ${candidateName}!` : 'Thank you!'} Your assessment has been submitted successfully.
          </p>

          {/* Info Box */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <div className="space-y-4">
              {assessmentTitle && (
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Assessment</p>
                    <p className="text-sm font-medium text-gray-900">{assessmentTitle}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">What happens next?</p>
                  <p className="text-sm font-medium text-gray-900">Your responses are being evaluated</p>
                </div>
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="text-sm text-gray-500 space-y-2 mb-6">
            <p>
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
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Powered by TalentFlow AI Assessment Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
