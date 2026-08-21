'use client';

/**
 * ScreenRecordingBlockedModal — the popup the candidate sees the moment a
 * screen-recording attempt is refused.
 *
 * Self-contained: it subscribes to ScreenRecordingGuard directly, so the
 * patched capture APIs can raise it without any prop threading through
 * InterviewUI. Rendered through a Portal into document.body for the same reason
 * InterviewProctoringWarnings is — the interview tree re-renders many times a
 * second and must not drag this subtree along with it.
 *
 * This is a popup, not a pause: by the time it appears the capture call has
 * already been rejected, so there is nothing for the candidate to undo. The
 * separate top banner in CandidateAIInterviewPortal covers the other case — an
 * OS-level recorder (OBS / Game Bar / QuickTime) that no browser API can refuse
 * — and that one deliberately does NOT block the screen, because the candidate
 * has to be able to reach the recorder to close it.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MonitorX, ShieldAlert } from 'lucide-react';
import {
  onScreenRecordingBlocked,
  type ScreenRecordingBlockedDetail,
} from './ScreenRecordingGuard';

export function ScreenRecordingBlockedModal() {
  const [visible, setVisible] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lastSource, setLastSource] = useState<string | null>(null);
  // False when the attempt could only be OBSERVED (an OS recording hotkey the
  // page cannot cancel) — the copy has to tell the candidate to stop it
  // themselves rather than claim we already did.
  const [wasBlocked, setWasBlocked] = useState(true);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => { setPortalReady(true); }, []);

  useEffect(() => {
    return onScreenRecordingBlocked((detail: ScreenRecordingBlockedDetail) => {
      setLastSource(detail.source);
      setWasBlocked(detail.blocked);
      // Re-arming on every attempt (rather than ignoring repeats while open)
      // keeps the count honest for a candidate who keeps clicking record.
      setAttempts((n) => n + 1);
      setVisible(true);
    });
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  // Enter acknowledges the popup. Escape deliberately does NOT: the interview
  // runs fullscreen and Escape is the browser's own exit-fullscreen key, which
  // the page cannot suppress — wiring dismissal to it would train candidates to
  // press the one key that scores them a fullscreen_exit violation.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [visible, dismiss]);

  if (!visible || !portalReady || typeof document === 'undefined') return null;

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="screen-recording-blocked-title"
      aria-describedby="screen-recording-blocked-body"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-red-500" />
        <div className="p-7 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <MonitorX className="h-8 w-8 text-red-600" />
          </div>
          <h2 id="screen-recording-blocked-title" className="mb-2 text-xl font-bold text-gray-900">
            Screen Recording Not Allowed
          </h2>
          <p id="screen-recording-blocked-body" className="mb-2 text-sm text-gray-600">
            {wasBlocked
              ? 'Screen recording is not permitted during this interview. The recording was blocked and did not start.'
              : 'Screen recording is not permitted during this interview. Stop the recording and close the recorder now to continue.'}
          </p>
          <p className="mb-5 text-sm font-medium text-red-600">
            This attempt has been recorded as a proctoring violation.
          </p>

          {attempts > 1 && (
            <div className="mb-5 flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                {attempts} recording attempts blocked in this session. Repeated attempts may
                end the interview.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={dismiss}
            autoFocus
            className="w-full rounded-xl bg-red-600 py-3 font-semibold text-white transition-all hover:bg-red-700"
          >
            I Understand
          </button>

          {lastSource && (
            <p className="mt-4 text-[11px] text-gray-400">Blocked via {lastSource}</p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
