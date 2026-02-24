'use client';

/**
 * InterviewProctoringWarnings — Self-contained warning toast system for AI interviews.
 *
 * Forked from components/candidate/ProctoringWarningModal.tsx.
 * Uses InterviewEventBus (not shared ProctoringEventBus).
 * Positioned at bottom of viewport (interview context).
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { AlertTriangle, X, Camera, Mic, Monitor, Copy, Volume2, Users, Eye, Maximize2, UserX, ScanEye } from 'lucide-react';
import { InterviewEventBus, ProctoringEvent, ProctoringEventType } from './InterviewEventBus';

interface WarningItem {
  id: string;
  type: ProctoringEventType;
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
}

const AUTO_DISMISS_MS = 2000;

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
};

const SEVERITY_COLORS: Record<'low' | 'medium' | 'high', { bg: string; border: string; text: string; icon: string }> = {
  low: { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-800', icon: 'text-yellow-500' },
  medium: { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-800', icon: 'text-orange-500' },
  high: { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-800', icon: 'text-red-500' },
};

// Individual warning card — memoized to prevent re-renders of siblings
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
        <button onClick={onDismiss} className={`flex-shrink-0 p-1 rounded hover:bg-black/5 ${colors.text}`}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="absolute top-2 right-10">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          warning.severity === 'high' ? 'bg-red-200 text-red-800' :
          warning.severity === 'medium' ? 'bg-orange-200 text-orange-800' :
          'bg-yellow-200 text-yellow-800'
        }`}>
          {warning.severity.toUpperCase()}
        </span>
      </div>
    </div>
  );
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
      setWarnings(prev => [...prev, {
        id: event.id,
        type: event.type,
        message: event.message,
        severity: event.severity,
        timestamp: event.timestamp,
      }]);
    });

    return () => { unsubscribe(); };
  }, []);

  const dismissWarning = useCallback((id: string) => {
    setWarnings(prev => prev.filter(w => w.id !== id));
  }, []);

  if (warnings.length === 0) return null;

  return (
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
}
