'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X, Camera, Mic, Monitor, Copy, Volume2, Users, Eye } from 'lucide-react';
import { ProctoringWarning, ProctoringEventType } from '@/hooks/useProctoringMonitor';

interface ProctoringWarningModalProps {
  warnings: ProctoringWarning[];
  onDismiss: (warningId: string) => void;
  autoDismissDelay?: number; // milliseconds, default 5000
}

// Icon mapping for each event type
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
};

// Severity colors
const SEVERITY_COLORS: Record<'low' | 'medium' | 'high', { bg: string; border: string; text: string; icon: string }> = {
  low: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-400',
    text: 'text-yellow-800',
    icon: 'text-yellow-500',
  },
  medium: {
    bg: 'bg-orange-50',
    border: 'border-orange-400',
    text: 'text-orange-800',
    icon: 'text-orange-500',
  },
  high: {
    bg: 'bg-red-50',
    border: 'border-red-400',
    text: 'text-red-800',
    icon: 'text-red-500',
  },
};

// Event type display names
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
};

function WarningCard({
  warning,
  onDismiss,
  autoDismissDelay,
}: {
  warning: ProctoringWarning;
  onDismiss: () => void;
  autoDismissDelay: number;
}) {
  const colors = SEVERITY_COLORS[warning.severity];

  // Use a single timeout for auto-dismiss instead of requestAnimationFrame
  // This prevents 60 re-renders per second
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissDelay);

    return () => clearTimeout(timer);
  }, [autoDismissDelay, onDismiss]);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border-l-4 ${colors.bg} ${colors.border} p-4 shadow-lg animate-slide-in`}
    >
      {/* Progress bar - using CSS animation instead of JS state updates */}
      <div
        className="absolute bottom-0 left-0 h-1 bg-current opacity-30 animate-progress-shrink"
        style={{
          animationDuration: `${autoDismissDelay}ms`,
          animationTimingFunction: 'linear',
          animationFillMode: 'forwards'
        }}
      />

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 ${colors.icon}`}>
          {EVENT_ICONS[warning.type] || <AlertTriangle className="w-6 h-6" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className={`font-semibold ${colors.text}`}>
            {EVENT_NAMES[warning.type] || 'Warning'}
          </h4>
          <p className={`text-sm mt-1 ${colors.text} opacity-90`}>
            {warning.message}
          </p>
          <p className="text-xs mt-1 opacity-60">
            {warning.timestamp.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true })}
          </p>
        </div>

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className={`flex-shrink-0 p-1 rounded hover:bg-black/5 ${colors.text}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Severity badge */}
      <div className="absolute top-2 right-10">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            warning.severity === 'high'
              ? 'bg-red-200 text-red-800'
              : warning.severity === 'medium'
              ? 'bg-orange-200 text-orange-800'
              : 'bg-yellow-200 text-yellow-800'
          }`}
        >
          {warning.severity.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

export function ProctoringWarningModal({
  warnings,
  onDismiss,
  autoDismissDelay = 5000,
}: ProctoringWarningModalProps) {
  const handleDismiss = useCallback(
    (warningId: string) => {
      onDismiss(warningId);
    },
    [onDismiss]
  );

  if (warnings.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none">
      {warnings.map((warning) => (
        <div key={warning.id} className="pointer-events-auto">
          <WarningCard
            warning={warning}
            onDismiss={() => handleDismiss(warning.id)}
            autoDismissDelay={autoDismissDelay}
          />
        </div>
      ))}

      <style jsx global>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        @keyframes progress-shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
        .animate-progress-shrink {
          animation-name: progress-shrink;
        }
      `}</style>
    </div>
  );
}

// Export a hook to manage warnings state
export function useProctoringWarnings() {
  const [warnings, setWarnings] = useState<ProctoringWarning[]>([]);

  const addWarning = useCallback((warning: ProctoringWarning) => {
    setWarnings((prev) => [...prev, warning]);
  }, []);

  const dismissWarning = useCallback((warningId: string) => {
    setWarnings((prev) => prev.filter((w) => w.id !== warningId));
  }, []);

  const clearAllWarnings = useCallback(() => {
    setWarnings([]);
  }, []);

  return {
    warnings,
    addWarning,
    dismissWarning,
    clearAllWarnings,
  };
}
