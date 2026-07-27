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
import { AlertTriangle, X, Camera, Mic, Monitor, Copy, Volume2, Users, Eye, Maximize2, UserX, ScanEye, ShieldAlert, AudioLines, Smartphone, PackageX } from 'lucide-react';
import { InterviewEventBus, ProctoringEvent, ProctoringEventType } from './InterviewEventBus';

interface WarningItem {
  id: string;
  type: ProctoringEventType;
  message: string;
  severity: 'minor' | 'moderate' | 'severe';
  timestamp: Date;
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
  background_noise: <AudioLines className="w-6 h-6" />,
  phone_detected: <Smartphone className="w-6 h-6" />,
  unauthorized_object: <PackageX className="w-6 h-6" />,
};

const EVENT_NAMES: Record<ProctoringEventType, string> = {
  tab_switch: 'Tab Switch Detected',
  copy_attempt: 'Copy Attempt Blocked',
  paste_attempt: 'Paste Attempt Blocked',
  voice_detected: 'Voice Activity Detected',
  multiple_voices: 'Multiple Voices Detected',
  camera_disabled: 'Camera Disabled',
  microphone_disabled: 'Microphone Disabled',
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
  background_noise: 'Background Noise Detected',
  phone_detected: 'Mobile Phone Detected',
  unauthorized_object: 'Unauthorised Item Detected',
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

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []); // Empty deps — runs only on mount

  return (
    <div className={`relative overflow-hidden rounded-lg border-l-4 ${colors.bg} ${colors.border} p-4 shadow-lg animate-interview-slide-in`}>
      <div
        className="absolute bottom-0 left-0 h-1 bg-current opacity-30 animate-interview-progress-shrink"
        style={{
          animationDuration: `${AUTO_DISMISS_MS}ms`,
          animationTimingFunction: 'linear',
          animationFillMode: 'forwards',
        }}
      />
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${colors.icon}`}>
          {EVENT_ICONS[warning.type] || <AlertTriangle className="w-6 h-6" />}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`font-semibold ${colors.text}`}>
            {EVENT_NAMES[warning.type] || 'Warning'}
          </h4>
          <p className={`text-sm mt-1 ${colors.text} opacity-90`}>
            {warning.message}
          </p>
          <p className="text-xs mt-1 opacity-60">
            {warning.timestamp.toLocaleTimeString('en-US', { hour12: true })}
          </p>
        </div>
        <button onClick={onDismiss} className={`flex-shrink-0 p-1 rounded hover:bg-black/5 ${colors.text}`} aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="absolute top-2 right-10">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          warning.severity === 'severe'   ? 'bg-red-200 text-red-800' :
          warning.severity === 'moderate' ? 'bg-orange-200 text-orange-800' :
          'bg-yellow-200 text-yellow-800'
        }`}>
          {warning.severity.charAt(0).toUpperCase() + warning.severity.slice(1)}
        </span>
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
      setWarnings(prev => {
        const next: WarningItem = {
          id: event.id,
          type: event.type,
          message: event.message,
          severity: event.severity,
          timestamp: event.timestamp,
        };
        const combined = [...prev, next];
        // Hard-cap: drop oldest when over the limit. Keeps the render tree
        // small + bounded so a flood of violations doesn't compound into a
        // re-render storm.
        if (combined.length > MAX_VISIBLE_WARNINGS) {
          return combined.slice(combined.length - MAX_VISIBLE_WARNINGS);
        }
        return combined;
      });
    });

    return () => { unsubscribe(); };
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
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none">
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
