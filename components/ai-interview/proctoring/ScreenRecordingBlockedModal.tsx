'use client';

/**
 * ScreenRecordingBlockedModal — the popup the candidate sees the moment a
 * screen-recording attempt is refused or detected.
 *
 * Self-contained: it subscribes to ScreenRecordingGuard's attempt bus directly,
 * so the patched capture APIs, the hotkey watch and the device watch can all
 * raise it without any prop threading, from ANY step of the portal — before the
 * interview starts and after. Rendered through a Portal into document.body for
 * the same reason InterviewProctoringWarnings is: the portal tree re-renders
 * many times a second and must not drag this subtree along with it.
 *
 * Two things it deliberately does NOT do:
 *
 *  • It never fires on a confidence:'low' signal. Those (a bare F9, recorder
 *    software merely being installed) are logged and escalate the vision watch;
 *    accusing a candidate over a stray function key is worse than the miss.
 *  • It never claims a recording was stopped when it was not. The copy is driven
 *    by `enforcement`: 'blocked' means the capture was refused and no frame
 *    exists; 'detected' means the OS started it and the candidate has to stop it
 *    themselves — for which the interview is meanwhile paused and blanked.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MonitorX, ShieldAlert } from 'lucide-react';
import {
  onScreenRecordingAttempt,
  type ScreenRecordingAttempt,
} from './ScreenRecordingGuard';
import { ModalA11y } from '@/components/ui/modal-a11y';

export function ScreenRecordingBlockedModal() {
  const [current, setCurrent] = useState<ScreenRecordingAttempt | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => { setPortalReady(true); }, []);

  useEffect(() => {
    return onScreenRecordingAttempt((attempt) => {
      if (attempt.confidence !== 'high') return;
      // Re-arming on every attempt (rather than ignoring repeats while open)
      // keeps the count honest for a candidate who keeps pressing record.
      setAttemptCount((n) => n + 1);
      setCurrent(attempt);
    });
  }, []);

  const dismiss = useCallback(() => setCurrent(null), []);

  // Enter acknowledges the popup. Escape deliberately does NOT: the interview
  // runs fullscreen and Escape is the browser's own exit-fullscreen key, which
  // the page cannot suppress — and in production, leaving fullscreen terminates
  // the interview. Wiring dismissal to Escape would train candidates to press
  // the one key that ends their session.
  useEffect(() => {
    if (!current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [current, dismiss]);

  if (!current || !portalReady || typeof document === 'undefined') return null;

  const wasBlocked = current.enforcement === 'blocked';

  const modal = (
    <ModalA11y closeOnEscape={false}><div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="screen-recording-blocked-title"
      aria-describedby="screen-recording-blocked-body"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-red-500" />
        <div className="p-7 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/15">
            <MonitorX className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 id="screen-recording-blocked-title" className="mb-2 text-xl font-bold text-gray-900">
            Screen Recording Not Allowed
          </h2>
          <p id="screen-recording-blocked-body" className="mb-2 tf-body-secondary">
            Screen recording is not allowed during the interview.{' '}
            {wasBlocked
              ? 'The recording was blocked and did not start.'
              : 'Stop the recording and close the recorder now — your interview stays paused and hidden until you do.'}
          </p>
          <p className="mb-5 text-sm font-medium text-red-600 dark:text-red-400">
            This attempt has been recorded as a proctoring violation.
          </p>

          {attemptCount > 1 && (
            <div className="mb-5 flex items-center justify-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                {attemptCount} recording attempts detected in this session. Repeated attempts
                may end the interview.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={dismiss}
            autoFocus
            className="tf-btn tf-btn-destructive w-full rounded-xl bg-red-600 py-3 font-semibold hover:bg-red-700 whitespace-normal shadow-none gap-0"
          >
            I Understand
          </button>

          <p className="mt-4 tf-micro-hint">
            {wasBlocked ? 'Blocked' : 'Detected'}: {current.source}
          </p>
        </div>
      </div>
    </div></ModalA11y>
  );

  return createPortal(modal, document.body);
}
