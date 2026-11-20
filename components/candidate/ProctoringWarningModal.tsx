'use client';

/**
 * ProctoringWarningModal — Self-contained warning toast system.
 *
 * Subscribes to ProctoringEventBus internally → has its OWN state.
 * Parent (InterviewUI) never re-renders when warnings appear/disappear.
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { AlertTriangle, X, Camera, Mic, Monitor, Copy, Volume2, Users, Eye, Maximize2, UserX, ScanEye, MousePointer, Smartphone, PackageX } from 'lucide-react';
import { ProctoringEventBus, ProctoringEvent, ProctoringEventType } from '@/lib/ProctoringEventBus';
import { IconButton } from '@/components/ui/icon-button';

interface WarningItem {
  id: string;
  type: ProctoringEventType;
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
  /** Held warning (face not detected / looking away / multiple faces): no auto-dismiss, removed on release. */
  holdKey?: string;
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
  camera_frozen: <Camera className="w-6 h-6" />,
  screenshot_attempt: <Monitor className="w-6 h-6" />,
  screen_recording_attempt: <Monitor className="w-6 h-6" />,
  window_blur: <Monitor className="w-6 h-6" />,
  mouse_movement: <MousePointer className="w-6 h-6" />,
  fullscreen_exit: <Maximize2 className="w-6 h-6" />,
  face_missing: <UserX className="w-6 h-6" />,
  multiple_faces: <Users className="w-6 h-6" />,
  gaze_away: <ScanEye className="w-6 h-6" />,
  identity_mismatch: <UserX className="w-6 h-6" />,
  assessment_terminated: <UserX className="w-6 h-6" />,
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
  camera_frozen: 'Camera Feed Frozen',
  screenshot_attempt: 'Screenshot Attempt Detected',
  screen_recording_attempt: 'Screen Recording Detected',
  window_blur: 'Assessment Window Lost Focus',
  mouse_movement: 'Mouse Movement Detected',
  fullscreen_exit: 'Fullscreen Exited',
  face_missing: 'Face Not Detected',
  multiple_faces: 'Multiple Faces Detected',
  gaze_away: 'Looking Away Detected',
  identity_mismatch: 'Identity Mismatch Detected',
  assessment_terminated: 'Assessment Terminated',
  phone_detected: 'Mobile Phone Detected',
  unauthorized_object: 'Unauthorised Item Detected',
};

const SEVERITY_COLORS: Record<'low' | 'medium' | 'high', { bg: string; border: string; text: string; icon: string }> = {
  low: { bg: 'bg-warning-subtle', border: 'border-warning', text: 'text-warning-strong', icon: 'text-warning' },
  medium: { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-800', icon: 'text-orange-500' },
  high: { bg: 'bg-destructive-subtle', border: 'border-destructive', text: 'text-destructive-strong', icon: 'text-destructive' },
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
  // (Without this, every new warning causes parent re-render → new onDismiss
  //  function → useEffect restarts → timer resets infinitely)
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const held = !!warning.holdKey;
  useEffect(() => {
    if (held) return; // held until the condition clears (ProctoringEventBus.release)
    const timer = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [held]); // runs only on mount (held never changes for a card)

  return (
    <div className={`relative overflow-hidden rounded-lg border-l-4 ${colors.bg} ${colors.border} p-4 shadow-lg animate-slide-in`}>
      {!held && (
        <div
          className="absolute bottom-0 left-0 h-1 bg-current opacity-30 animate-progress-shrink"
          style={{
            animationDuration: `${AUTO_DISMISS_MS}ms`,
            animationTimingFunction: 'linear',
            animationFillMode: 'forwards',
          }}
        />
      )}
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
        {!held && (
          <IconButton bare label="Close" onClick={onDismiss} className={`flex-shrink-0 p-1 rounded hover:bg-black/5 ${colors.text}`}>
            <X className="w-4 h-4" />
          </IconButton>
        )}
      </div>
      <div className="absolute top-2 right-10">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          warning.severity === 'high' ? 'bg-destructive-subtle text-destructive-strong' :
          warning.severity === 'medium' ? 'bg-orange-200 text-orange-800' :
          'bg-warning-subtle text-warning-strong'
        }`}>
          {warning.severity.toUpperCase()}
        </span>
      </div>
    </div>
  );
});

/**
 * Self-contained proctoring warning overlay.
 * Subscribes to ProctoringEventBus — NO props needed from parent.
 * Parent never re-renders when warnings change.
 */
export function ProctoringWarningModal() {
  const [warnings, setWarnings] = useState<WarningItem[]>([]);
  const pendingWarningsRef = useRef<WarningItem[]>([]);

  const appendWarnings = useCallback((items: WarningItem[]) => {
    if (items.length === 0) return;
    setWarnings(prev => [...prev, ...items]);
  }, []);

  const flushPendingWarnings = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.hidden || !document.hasFocus()) return;
    if (pendingWarningsRef.current.length === 0) return;
    const queued = [...pendingWarningsRef.current];
    pendingWarningsRef.current = [];
    appendWarnings(queued);
  }, [appendWarnings]);

  // Subscribe to event bus on mount
  useEffect(() => {
    const unsubscribe = ProctoringEventBus.subscribe((event: ProctoringEvent) => {
      const warning: WarningItem = {
        id: event.id,
        type: event.type,
        message: event.message,
        severity: event.severity,
        timestamp: event.timestamp,
        holdKey: event.holdKey,
      };

      if (typeof document !== 'undefined' && (document.hidden || !document.hasFocus())) {
        pendingWarningsRef.current.push(warning);
        return;
      }

      appendWarnings([warning]);
    });

    // Held warnings come down when their condition clears — including ones
    // still queued while the window was unfocused.
    const unsubscribeRelease = ProctoringEventBus.subscribeRelease((holdKey) => {
      pendingWarningsRef.current = pendingWarningsRef.current.filter(w => w.holdKey !== holdKey);
      setWarnings(prev => prev.filter(w => w.holdKey !== holdKey));
    });

    const handleVisibilityOrFocus = () => {
      flushPendingWarnings();
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      unsubscribe();
      unsubscribeRelease();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [appendWarnings, flushPendingWarnings]);

  const dismissWarning = useCallback((id: string) => {
    setWarnings(prev => prev.filter(w => w.id !== id));
  }, []);

  if (warnings.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-md w-[calc(100%-2rem)] pointer-events-none">
      {warnings.map((warning) => (
        <div key={warning.id} className="pointer-events-auto">
          <WarningCard
            warning={warning}
            onDismiss={() => dismissWarning(warning.id)}
          />
        </div>
      ))}
      <style jsx global>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
        @keyframes progress-shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
        .animate-progress-shrink { animation-name: progress-shrink; }
      `}</style>
    </div>
  );
}

// Legacy hook — kept for backward compatibility with assessment module
export function useProctoringWarnings() {
  const [warnings, setWarnings] = useState<WarningItem[]>([]);

  const addWarning = useCallback((warning: WarningItem) => {
    setWarnings(prev => [...prev, warning]);
  }, []);

  const dismissWarning = useCallback((warningId: string) => {
    setWarnings(prev => prev.filter(w => w.id !== warningId));
  }, []);

  const clearAllWarnings = useCallback(() => {
    setWarnings([]);
  }, []);

  return { warnings, addWarning, dismissWarning, clearAllWarnings };
}
