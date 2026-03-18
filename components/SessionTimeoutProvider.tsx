'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { clearTokens, getTokens } from '@/lib/services/api';
import { getLoginUrl } from '@/lib/services/authService';
import { userSettingsApi } from '@/lib/services/settingsService';
import { toast } from 'sonner';

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

        const settings = await userSettingsApi.getSettings();
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
    if (loginUrl.startsWith('http')) {
      window.location.href = loginUrl;
    } else {
      router.push(loginUrl);
    }
  }, [router]);

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

  return (
    <SessionTimeoutContext.Provider
      value={{
        resetTimer,
        timeoutMinutes,
        isWarningVisible,
        remainingSeconds,
      }}
    >
      {children}

      {/* Inactivity Warning Modal */}
      {isWarningVisible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in duration-200">
            <div className="text-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Session Expiring Soon
              </h3>

              <p className="text-gray-600 mb-4">
                Your session will expire in <span className="font-bold text-red-600">{remainingSeconds}</span> seconds due to inactivity.
              </p>

              <p className="text-sm text-gray-500 mb-6">
                Click the button below to continue your session.
              </p>

              <button
                onClick={continueSession}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Continue Session
              </button>
            </div>
          </div>
        </div>
      )}
    </SessionTimeoutContext.Provider>
  );
}
