'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, X, ArrowRight, Info } from 'lucide-react';
import { clearTokens, getTokens } from '@/lib/services/api';
import { getLoginUrl } from '@/lib/services/authService';
import { userSettingsApi } from '@/lib/services/settingsService';
import { takeBootstrapPart } from '@/lib/services/shellBootstrap';
import { toast } from 'sonner';
import { forceNavigate } from '@/lib/utils/forcedNavigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface SessionTimeoutContextType {
  resetTimer: () => void;
  timeoutMinutes: number;
  isWarningVisible: boolean;
  remainingSeconds: number;
}

const SessionTimeoutContext = createContext<SessionTimeoutContextType | null>(null);

export const useSessionTimeout = () => {
  const context = useContext(SessionTimeoutContext);
  if (!context) {
    throw new Error('useSessionTimeout must be used within SessionTimeoutProvider');
  }
  return context;
};

interface SessionTimeoutProviderProps {
  children: React.ReactNode;
  skipSettingsLoad?: boolean;  // Skip loading settings when subscription expired
}

const WARNING_SECONDS = 60; // Show warning 60 seconds before logout

export function SessionTimeoutProvider({ children, skipSettingsLoad = false }: SessionTimeoutProviderProps) {
  const router = useRouter();
  const [timeoutMinutes, setTimeoutMinutes] = useState(30); // Default 30 minutes
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(WARNING_SECONDS);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const loggingOutRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());

  // FIX: Use a ref for warning visibility so resetTimer doesn't need it as a dependency.
  // Without this, isWarningVisible in resetTimer's deps caused resetTimer to get a new
  // reference every time the warning showed, which re-ran the activity useEffect and
  // immediately dismissed the warning via resetTimer() — making the timer never fire.
  const isWarningVisibleRef = useRef(false);

  // Keep a ref to timeoutMinutes so handleLogout can read the current value
  // without being listed as a dep (which would cause showWarning/resetTimer to recreate too).
  const timeoutMinutesRef = useRef(timeoutMinutes);
  useEffect(() => {
    timeoutMinutesRef.current = timeoutMinutes;
  }, [timeoutMinutes]);

  // Load timeout setting from user settings
  useEffect(() => {
    // Skip if subscription expired (no need for timeout settings in renewal flow)
    if (skipSettingsLoad) {
      console.log('[SessionTimeout] Skipping settings load - subscription expired');
      return;
    }

    const loadTimeoutSetting = async () => {
      try {
        const { accessToken } = getTokens();
        if (!accessToken) return;

        // First load: the app-shell /bootstrap response, if it carried this part.
        const boot = await takeBootstrapPart<Awaited<ReturnType<typeof userSettingsApi.getSettings>>>('user_settings');
        const settings = boot.hit ? boot.data : await userSettingsApi.getSettings();
        if (settings?.session_timeout_minutes) {
          setTimeoutMinutes(settings.session_timeout_minutes);
        }
      } catch (error) {
        console.error('Failed to load session timeout setting:', error);
      }
    };

    loadTimeoutSetting();
  }, [skipSettingsLoad]);

  // Logout function — calls backend /auth/logout so the inactivity event is
  // recorded in audit logs with full inactivity metadata.
  const handleLogout = useCallback(async () => {
    // Once only. The countdown interval used to keep calling this every second
    // after reaching 0 (and the warning timeout called it again), so each call
    // re-attempted the redirect — re-raising a page's "Leave site?" prompt over
    // and over. Stop both timers and ignore any repeat.
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (warningTimeoutRef.current) { clearTimeout(warningTimeoutRef.current); warningTimeoutRef.current = null; }
    console.log('[SessionTimeout] Auto-logout due to inactivity');

    const inactiveSeconds = Math.floor((Date.now() - lastActivityRef.current) / 1000);

    try {
      const { accessToken } = getTokens();
      if (accessToken) {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            logout_type: 'inactivity',
            inactive_duration_seconds: inactiveSeconds,
            configured_timeout_minutes: timeoutMinutesRef.current,
          }),
        });
      }
    } catch (error) {
      console.warn('[SessionTimeout] Failed to log inactivity logout to backend:', error);
    }

    const loginUrl = getLoginUrl();
    clearTokens();
    localStorage.removeItem('user');
    sessionStorage.clear();
    toast.error('Session expired due to inactivity. Please log in again.');
    // Use hard redirect (not router.push) so the full page reloads and all
    // React state is cleared — router.push leaves the current page mounted
    // and the user stays on the page with no operations allowed. Forced, so a
    // page's unsaved-changes prompt doesn't block the sign-out.
    forceNavigate(loginUrl);
  }, []);

  // Show warning before logout
  const showWarning = useCallback(() => {
    isWarningVisibleRef.current = true;
    setIsWarningVisible(true);
    setRemainingSeconds(WARNING_SECONDS);

    // Start countdown
    countdownRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto logout after warning period
    warningTimeoutRef.current = setTimeout(() => {
      handleLogout();
    }, WARNING_SECONDS * 1000);
  }, [handleLogout]);

  // Reset the inactivity timer.
  // FIX: reads isWarningVisibleRef.current (ref) instead of isWarningVisible (state)
  // so this callback does NOT need isWarningVisible in its dependency array.
  // Previously, having isWarningVisible as a dep caused this callback to be recreated
  // every time the warning appeared, which re-triggered the activity useEffect and
  // immediately dismissed the warning.
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    // Hide warning if visible (using ref to avoid stale closure)
    if (isWarningVisibleRef.current) {
      isWarningVisibleRef.current = false;
      setIsWarningVisible(false);
      setRemainingSeconds(WARNING_SECONDS);
    }

    // Don't set timer if timeout is 0 (disabled)
    if (timeoutMinutes <= 0) return;

    // Set new timer (timeout minus warning period)
    const timeoutMs = (timeoutMinutes * 60 - WARNING_SECONDS) * 1000;
    if (timeoutMs > 0) {
      timeoutRef.current = setTimeout(() => {
        showWarning();
      }, timeoutMs);
    }
  }, [timeoutMinutes, showWarning]); // isWarningVisible intentionally removed

  // Continue session (dismiss warning)
  const continueSession = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  // Set up activity listeners
  useEffect(() => {
    const { accessToken } = getTokens();
    if (!accessToken) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    // Throttle activity updates to avoid too many timer resets
    let throttleTimeout: NodeJS.Timeout | null = null;
    const handleActivity = () => {
      if (throttleTimeout) return;

      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;
        resetTimer();
      }, 1000); // Throttle to once per second
    };

    // Add event listeners
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Initial timer start
    resetTimer();

    // Cleanup
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [resetTimer]);

  // Reset timer when timeout setting changes
  useEffect(() => {
    resetTimer();
  }, [timeoutMinutes, resetTimer]);

  // Memoized so consumers re-render only when one of these actually changes.
  // remainingSeconds is part of the value, so the countdown still propagates
  // every tick while the warning is shown (it stays fixed otherwise).
  const contextValue = useMemo<SessionTimeoutContextType>(
    () => ({ resetTimer, timeoutMinutes, isWarningVisible, remainingSeconds }),
    [resetTimer, timeoutMinutes, isWarningVisible, remainingSeconds],
  );

  return (
    <SessionTimeoutContext.Provider value={contextValue}>
      {children}

      {/* Inactivity Warning Modal */}
      {isWarningVisible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop — no onClick handler, cannot be dismissed by clicking outside */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-warning-title"
            aria-describedby="session-warning-desc"
            className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-md mx-4 max-h-[90dvh] overflow-y-auto animate-in fade-in zoom-in duration-200 tf-round-edges"
          >
            {/* Close — treated the same as Continue Session: dismissing it is the
                user proving they're present, not an escape hatch from the timer. */}
            <button
              onClick={continueSession}
              aria-label="Continue session"
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>

            <div className="px-6 sm:px-8 pt-8 pb-6 text-center">
              <div className="relative w-20 h-20 mx-auto mb-5">
                {/* Radiating accent lines around the clock */}
                <span className="absolute top-1 left-1 w-3 h-0.5 bg-amber-300 dark:bg-amber-500/50 rounded-full rotate-45" />
                <span className="absolute top-1 right-1 w-3 h-0.5 bg-amber-300 dark:bg-amber-500/50 rounded-full -rotate-45" />
                <span className="absolute bottom-1 left-1 w-3 h-0.5 bg-amber-300 dark:bg-amber-500/50 rounded-full -rotate-45" />
                <span className="absolute bottom-1 right-1 w-3 h-0.5 bg-amber-300 dark:bg-amber-500/50 rounded-full rotate-45" />
                <div className="absolute inset-0 m-auto w-16 h-16 bg-amber-100 dark:bg-amber-500/10 rounded-full flex items-center justify-center">
                  <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" strokeWidth={2} />
                </div>
              </div>

              <h3 id="session-warning-title" className="text-2xl font-bold text-gray-900 dark:text-slate-50 mb-3">
                Session Expiring Soon
              </h3>

              <p id="session-warning-desc" className="text-gray-700 dark:text-slate-300 leading-relaxed">
                Your session will expire in{' '}
                <span className="font-bold text-red-600 dark:text-red-400">{remainingSeconds} seconds</span> due to inactivity.
              </p>

              <p className="tf-body-muted mt-3">
                Click the button below to continue your session and stay signed in.
              </p>

              <button
                onClick={continueSession}
                autoFocus
                className="tf-btn tf-btn-primary mt-6 w-full flex px-4 py-3.5 text-sm font-semibold bg-brand-blue hover:bg-brand-blue-2 rounded-xl shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors whitespace-normal"
              >
                Continue Session
                <ArrowRight className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            {/* Footer */}
            <div className="px-6 sm:px-8 pb-6 pt-5 border-t border-gray-100 dark:border-slate-700/60 flex items-start gap-2.5 text-left">
              <Info className="w-4 h-4 text-brand-blue dark:text-brand-blue shrink-0 mt-0.5" strokeWidth={2} />
              <p className="tf-meta leading-relaxed">
                For <span className="font-medium text-gray-700 dark:text-slate-300">security</span> reasons, your{' '}
                <span className="font-medium text-gray-700 dark:text-slate-300">session</span> will be automatically signed out after the timer ends.
              </p>
            </div>
          </div>
        </div>
      )}
    </SessionTimeoutContext.Provider>
  );
}
