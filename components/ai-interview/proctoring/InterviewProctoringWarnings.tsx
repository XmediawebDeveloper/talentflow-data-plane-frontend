'use client';

/**
 * InterviewProctoringWarnings — Self-contained warning toast system for AI interviews.
 *
 * Forked from components/candidate/ProctoringWarningModal.tsx.
 * Uses InterviewEventBus (not shared ProctoringEventBus).
 * Positioned at bottom of viewport (interview context).
 *
 * Render isolation: the toast container is mounted into document.body via
 * a Portal so re-renders triggered by InterviewUI (timer ticks, transcript
 * updates, TalkingHead amplitude reads — many times per second) do NOT
 * cascade into the toast tree. Without this, a re-render of the parent
 * interview UI re-runs the warnings consumer's reconciliation pass even
 * though no toast props changed.
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, Camera, Mic, Monitor, Copy, Volume2, Users, Eye, Maximize2, UserX, ScanEye, ShieldAlert, AudioLines, Smartphone, PackageX, PictureInPicture2 } from 'lucide-react';
import { InterviewEventBus, ProctoringEvent, ProctoringEventType } from './InterviewEventBus';

interface WarningItem {
  id: string;
  type: ProctoringEventType;
  message: string;
  severity: 'minor' | 'moderate' | 'severe';
  timestamp: Date;
  /** Held warning (looking away / multiple faces): no auto-dismiss, removed on release. */
  holdKey?: string;
}

const AUTO_DISMISS_MS = 2000;
// Hard cap on simultaneously-visible toasts. When the cap is reached and a
// new violation fires, the OLDEST toast is evicted so the newest stays in
// view. Without this, rapid-fire violations stack indefinitely and each
// pushed toast triggers a re-render of the entire warnings container.
const MAX_VISIBLE_WARNINGS = 2;

// Icon mapping
const EVENT_ICONS: Record<ProctoringEventType, React.ReactNode> = {
  tab_switch: <Monitor className="w-6 h-6" />,
  copy_attempt: <Copy className="w-6 h-6" />,
  paste_attempt: <Copy className="w-6 h-6" />,
  voice_detected: <Volume2 className="w-6 h-6" />,
  multiple_voices: <Users className="w-6 h-6" />,
  camera_disabled: <Camera className="w-6 h-6" />,
  microphone_disabled: <Mic className="w-6 h-6" />,
  microphone_switched: <Mic className="w-6 h-6" />,
  camera_obstructed: <Eye className="w-6 h-6" />,
  screenshot_attempt: <Monitor className="w-6 h-6" />,
  screen_recording_attempt: <Monitor className="w-6 h-6" />,
  window_blur: <Monitor className="w-6 h-6" />,
  fullscreen_exit: <Maximize2 className="w-6 h-6" />,
  face_missing: <UserX className="w-6 h-6" />,
  multiple_faces: <Users className="w-6 h-6" />,
  gaze_away: <ScanEye className="w-6 h-6" />,
  face_mismatch: <ShieldAlert className="w-6 h-6" />,
  face_identity_changed: <ShieldAlert className="w-6 h-6" />,
  voice_mismatch: <AudioLines className="w-6 h-6" />,
  voice_identity_changed: <AudioLines className="w-6 h-6" />,
  screen_share_stopped: <Monitor className="w-6 h-6" />,
  picture_in_picture_detected: <PictureInPicture2 className="w-6 h-6" />,
  background_noise: <AudioLines className="w-6 h-6" />,
  phone_detected: <Smartphone className="w-6 h-6" />,
  unauthorized_object: <PackageX className="w-6 h-6" />,
  // Never rendered (backend-only), but the Record must stay exhaustive.
  object_detection_unavailable: <ShieldAlert className="w-6 h-6" />,
};

const EVENT_NAMES: Record<ProctoringEventType, string> = {
  tab_switch: 'Tab Switch Detected',
  copy_attempt: 'Copy Attempt Blocked',
  paste_attempt: 'Paste Attempt Blocked',
  voice_detected: 'Voice Activity Detected',
  multiple_voices: 'Multiple Voices Detected',
  camera_disabled: 'Camera Disabled',
  microphone_disabled: 'Microphone Disabled',
  microphone_switched: 'Microphone Device Changed',
  camera_obstructed: 'Camera Obstructed',
  screenshot_attempt: 'Screenshot Attempt Blocked',
  screen_recording_attempt: 'Screen Recording Detected',
  window_blur: 'Window Focus Lost',
  fullscreen_exit: 'Fullscreen Exited',
  face_missing: 'Face Not Detected',
  multiple_faces: 'Multiple Faces Detected',
  gaze_away: 'Looking Away Detected',
  face_mismatch: 'Face Verification Warning',
  face_identity_changed: 'Identity Changed',
  voice_mismatch: 'Voice Verification Warning',
  voice_identity_changed: 'Speaker Changed',
  screen_share_stopped: 'Screen Sharing Stopped',
  picture_in_picture_detected: 'Picture-in-Picture Detected',
  background_noise: 'Background Noise Detected',
  phone_detected: 'Mobile Phone Detected',
  unauthorized_object: 'Unauthorised Item Detected',
  object_detection_unavailable: 'Object Detection Unavailable',
};

const SEVERITY_COLORS: Record<'minor' | 'moderate' | 'severe', { bg: string; border: string; text: string; icon: string }> = {
  minor:    { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-800', icon: 'text-yellow-500' },
  moderate: { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-800', icon: 'text-orange-500' },
  severe:   { bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-800',    icon: 'text-red-500'    },
};

// Individual warning card — memoized to prevent re-renders of siblings.
// Custom equality check compares ONLY the warning object's id; the onDismiss
// closure is recreated on every parent render which would otherwise break
// the default referential equality memo and re-render every card on every
// parent state change.
const WarningCard = memo(function WarningCard({
  warning,
  onDismiss,
}: {
  warning: WarningItem;
  onDismiss: () => void;
}) {
  const colors = SEVERITY_COLORS[warning.severity];

  // Store onDismiss in a ref so the timer only starts ONCE on mount
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const held = !!warning.holdKey;
  useEffect(() => {
    if (held) return; // held until the condition clears (InterviewEventBus.release)
    const timer = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [held]);

  return (
    // Compact card: icon + title + severity on one line, message under it,
    // so it covers as little of the chat as possible.
    <div className={`relative overflow-hidden rounded-lg border-l-4 ${colors.bg} ${colors.border} px-3 py-2.5 shadow-lg animate-interview-slide-in`}>
      {!held && (
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-current opacity-30 animate-interview-progress-shrink"
          style={{
            animationDuration: `${AUTO_DISMISS_MS}ms`,
            animationTimingFunction: 'linear',
            animationFillMode: 'forwards',
          }}
        />
      )}
      <div className="flex items-start gap-2.5">
        <div className={`flex-shrink-0 mt-0.5 ${colors.icon} [&_svg]:w-5 [&_svg]:h-5`}>
          {EVENT_ICONS[warning.type] || <AlertTriangle className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className={`text-sm font-semibold leading-tight truncate ${colors.text}`}>
              {EVENT_NAMES[warning.type] || 'Warning'}
            </h4>
            <span className={`flex-shrink-0 text-2xs px-1.5 py-0.5 rounded-full font-medium ${
              warning.severity === 'severe'   ? 'bg-red-200 text-red-800' :
              warning.severity === 'moderate' ? 'bg-orange-200 text-orange-800' :
              'bg-yellow-200 text-yellow-800'
            }`}>
              {warning.severity.charAt(0).toUpperCase() + warning.severity.slice(1)}
            </span>
            <span className="ml-auto flex-shrink-0 text-2xs opacity-60">
              {warning.timestamp.toLocaleTimeString('en-US', { hour12: true })}
            </span>
          </div>
          <p className={`text-xs mt-0.5 leading-snug ${colors.text} opacity-90`}>
            {warning.message}
          </p>
        </div>
        {!held && (
          <button onClick={onDismiss} className={`flex-shrink-0 p-1 -mr-1 -mt-0.5 rounded hover:bg-black/5 ${colors.text}`} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // Custom prop-equality: skip re-render unless the underlying warning's id
  // changed. onDismiss is re-created on each parent render and would defeat
  // the default referential check.
  return prev.warning.id === next.warning.id;
});

/**
 * Self-contained interview proctoring warning overlay.
 * Subscribes to InterviewEventBus — NO props needed from parent.
 * Positioned at bottom of viewport for interview context.
 */
export function InterviewProctoringWarnings() {
  const [warnings, setWarnings] = useState<WarningItem[]>([]);

  // Subscribe to interview event bus on mount
  useEffect(() => {
    const unsubscribe = InterviewEventBus.subscribe((event: ProctoringEvent) => {
      // screen_recording_attempt is NOT a toast — it has a dedicated popup.
      // Both of the surfaces that can raise it own their own, stronger UI:
      //   • an in-page attempt the browser refused (getDisplayMedia, or an
      //     extension's desktop getUserMedia) raises ScreenRecordingBlockedModal
      //     synchronously from inside the patched API, and
      //   • an OS-level recorder seen by the portal's vision watch raises the
      //     top banner there, which also pauses the interview.
      // A toast on top of either would just be a duplicate accusation that
      // auto-dismisses in 2s. The event still reaches the backend for the
      // recruiter's timeline; this only skips the toast.
      if (event.type === 'screen_recording_attempt') {
        return;
      }
      setWarnings(prev => {
        const next: WarningItem = {
          id: event.id,
          type: event.type,
          message: event.message,
          severity: event.severity,
          timestamp: event.timestamp,
          holdKey: event.holdKey,
        };
        const combined = [...prev, next];
        // Hard-cap: drop oldest when over the limit. Keeps the render tree
        // small + bounded so a flood of violations doesn't compound into a
        // re-render storm.
        if (combined.length > MAX_VISIBLE_WARNINGS) {
          // Held warnings are never dropped (they must stay until their
          // condition clears); trim only the auto-dismissing ones, always
          // leaving room for at least the newest of those.
          const held = combined.filter(w => w.holdKey);
          const normal = combined.filter(w => !w.holdKey);
          const room = Math.max(MAX_VISIBLE_WARNINGS - held.length, 1);
          const keep = new Set([...held, ...normal.slice(-room)]);
          return combined.filter(w => keep.has(w));
        }
        return combined;
      });
    });

    // Held warnings come down when their condition clears.
    const unsubscribeRelease = InterviewEventBus.subscribeRelease((holdKey) => {
      setWarnings(prev => prev.filter(w => w.holdKey !== holdKey));
    });

    return () => { unsubscribe(); unsubscribeRelease(); };
  }, []);

  const dismissWarning = useCallback((id: string) => {
    setWarnings(prev => prev.filter(w => w.id !== id));
  }, []);

  // Track whether we've mounted client-side (Portal cannot run during SSR
  // because document is undefined). Only mount the Portal after first effect.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);

  if (warnings.length === 0 || !portalReady || typeof document === 'undefined') {
    return null;
  }

  const overlay = (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none">
      {warnings.map((warning) => (
        <div key={warning.id} className="pointer-events-auto">
          <WarningCard
            warning={warning}
            onDismiss={() => dismissWarning(warning.id)}
          />
        </div>
      ))}
      <style jsx global>{`
        @keyframes interview-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-interview-slide-in { animation: interview-slide-in 0.3s ease-out; }
        @keyframes interview-progress-shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
        .animate-interview-progress-shrink { animation-name: interview-progress-shrink; }
      `}</style>
    </div>
  );

  // Portal to document.body so toast renders are siblings of the React root,
  // not children of InterviewUI. Cuts the re-render cascade.
  return createPortal(overlay, document.body);
}
