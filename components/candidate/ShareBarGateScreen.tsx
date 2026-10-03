'use client';

/**
 * ShareBarGateScreen — pre-start gate for the assessment screen recording.
 *
 * Copied in behaviour from the AI interview's `hide_share_bar` step: the
 * candidate has just shared their ENTIRE screen; Chrome shows an
 * "…is sharing your screen" bar that must be collapsed with its Hide button.
 * Continue grabs one whole-monitor frame (with this card hidden and the page
 * background forced white) and the backend vision check confirms the bar is
 * hidden, no Picture-in-Picture window floats, no screen recorder or other
 * application is visible, and this assessment is the shared content. The gate
 * is HARD: it re-prompts until the check passes.
 */

import { forwardRef } from 'react';
import { Loader2, Monitor, ShieldCheck, EyeOff, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShareBarGateScreenProps {
  onContinue: () => void;
  checking: boolean;
  error: string | null;
  /** Ref to the outer page wrapper — its background is set to white during capture. */
  pageRef: React.RefObject<HTMLDivElement | null>;
}

export const ShareBarGateScreen = forwardRef<HTMLDivElement, ShareBarGateScreenProps>(
  function ShareBarGateScreen({ onContinue, checking, error, pageRef }, cardRef) {
    return (
      <div ref={pageRef} className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-4">
        <div ref={cardRef} className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 md:p-10">
          <div className="w-16 h-16 bg-brand-blue/10 text-brand-blue rounded-full flex items-center justify-center mx-auto mb-5">
            <EyeOff className="w-8 h-8" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 text-center">
            Hide the screen-sharing bar
          </h1>
          <p className="text-gray-600 mb-6 text-center">
            Your entire screen is now being shared for this assessment. Your browser shows a bar
            that says <span className="font-medium">&ldquo;… is sharing your screen&rdquo;</span>.
            Click <span className="font-semibold">Hide</span> on that bar, close every other
            application, window and tab, then press Continue.
          </p>

          <div className="rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-4 mb-6">
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <Monitor className="w-4 h-4 text-brand-blue mt-0.5 shrink-0" />
                <span>Keep sharing your <strong>entire screen</strong> for the whole assessment. Stopping the share is recorded and blocks the assessment until you share again.</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-blue mt-0.5 shrink-0" />
                <span>Only this assessment tab may be open. Screen-recording tools, floating video windows and other apps must be closed.</span>
              </li>
            </ul>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive-subtle text-destructive text-sm p-3 mb-5" role="alert">
              {error}
            </div>
          )}

          {/* Wait note — read just BEFORE the click. The capture blanks this page
              for a few seconds; text can't be shown on the blank itself (it would
              land in the screenshot), so the candidate is told up front. */}
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 leading-snug">
              <span className="font-semibold">After you click Continue, your screen will go blank for a few seconds</span> while
              we check it. This is normal. Please <span className="font-semibold">don&rsquo;t click again or refresh the page</span> &mdash;
              the assessment will continue automatically.
            </p>
          </div>

          <Button onClick={onContinue} disabled={checking} className="w-full h-12 text-base" size="lg">
            {checking ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Verifying your screen…</span>
            ) : (
              'Continue'
            )}
          </Button>
          <p className="text-xs text-gray-500 text-center mt-3">
            We take one picture of your screen to verify the bar is hidden. It is stored with your assessment record.
          </p>
        </div>
      </div>
    );
  },
);
