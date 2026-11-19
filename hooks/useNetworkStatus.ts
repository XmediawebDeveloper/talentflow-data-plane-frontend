'use client';

import { useState, useEffect, useCallback } from 'react';

/** Why connectivity is considered lost — the two cases read very differently
 *  to a candidate mid-assessment, so they must not share one message.
 *    'browser' — the device itself is offline (navigator.onLine / offline event).
 *    'server'  — the device is online but our server could not be reached, which
 *                is what a backend restart or deploy looks like from here.
 *    null      — reachable. */
export type OfflineReason = 'browser' | 'server' | null;

interface NetworkStatusHook {
  isOnline: boolean;
  offlineReason: OfflineReason;
  isSlowConnection: boolean;
  connectionType: string;
  lastOnlineTime: Date | null;
  retryPendingRequests: () => Promise<void>;
}

/* How long a connectivity probe may take before it counts as a failure.
   Was 1500ms, which the assessment page could miss on its own: it runs face
   detection on the main thread, and a stalled main thread delays the fetch's
   own callbacks past the deadline even on a perfect connection. */
const PROBE_TIMEOUT_MS = 4000;
/* Consecutive failed probes before declaring the server unreachable. A single
   miss is not evidence — one slow probe during a server restart, a CPU spike or
   a GC pause used to be enough to tell a candidate their internet was down. */
const PROBE_FAILURES_BEFORE_OFFLINE = 2;
const PROBE_INTERVAL_MS = 2000;

/**
 * Hook for monitoring network connectivity and connection quality.
 * Detects online/offline status, slow connections, and provides retry capabilities.
 */
export function useNetworkStatus(): NetworkStatusHook {
  /* Split deliberately: the DEVICE being offline and OUR SERVER being
     unreachable are different facts with different messages, and only the
     first is the candidate's problem. `isOnline` stays the AND of the two so
     every existing consumer keeps its old meaning. */
  const [browserOnline, setBrowserOnline] = useState(true);
  const [serverReachable, setServerReachable] = useState(true);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [connectionType, setConnectionType] = useState('unknown');
  const [lastOnlineTime, setLastOnlineTime] = useState<Date | null>(null);
  /* Offline overall if EITHER is false; the device's own state is reported
     first because "you are offline" is only true when it actually is. */
  const isOnline = browserOnline && serverReachable;
  const offlineReason: OfflineReason = !browserOnline
    ? 'browser'
    : (!serverReachable ? 'server' : null);
  const [pendingRetries, setPendingRetries] = useState<(() => Promise<void>)[]>([]);

  // Detect network status changes via browser events (fast path)
  useEffect(() => {
    const handleOnline = () => {
      console.log('[NETWORK] Connection restored (browser event)');
      setBrowserOnline(true);
      setLastOnlineTime(new Date());
    };

    const handleOffline = () => {
      console.log('[NETWORK] Connection lost (browser event)');
      setBrowserOnline(false);
    };

    // Check initial state
    setBrowserOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Active connectivity polling — browser online/offline events only fire when the
  // OS network interface goes up/down (e.g. airplane mode). They do NOT fire for
  // WiFi-connected-but-no-internet, ISP drops, or VPN disconnects. Polling a real
  // HTTP request is the only reliable way to detect those cases.
  useEffect(() => {
    /* Shadow the current state in closure vars so the poll callback can compare
       without stale-closure issues (state setters are always stable). */
    let localReachable = true;
    let consecutiveFailures = 0;
    /* One probe at a time. The interval is shorter than the timeout, so without
       this a slow probe would overlap the next and a single stall could stack
       up several "failures" that are really one event. */
    let probeInFlight = false;

    const checkConnectivity = async () => {
      if (probeInFlight) return;
      probeInFlight = true;
      try {
        // Use a HEAD request to a tiny resource; cache:no-store forces a real round-trip.
        await fetch('/favicon.ico', {
          method: 'HEAD',
          cache: 'no-store',
          // AbortSignal.timeout is widely supported in modern browsers
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        consecutiveFailures = 0;
        if (!localReachable) {
          localReachable = true;
          setServerReachable(true);
          setLastOnlineTime(new Date());
          console.log('[NETWORK] Server reachable again (active poll)');
        }
      } catch {
        consecutiveFailures += 1;
        /* Recovery is immediate but failure has to be repeated — the expensive
           direction to get wrong is telling a candidate mid-assessment that
           their connection dropped when it did not. */
        if (localReachable && consecutiveFailures >= PROBE_FAILURES_BEFORE_OFFLINE) {
          localReachable = false;
          setServerReachable(false);
          console.log(`[NETWORK] Server unreachable after ${consecutiveFailures} consecutive probes`);
        }
      } finally {
        probeInFlight = false;
      }
    };

    const pollInterval = setInterval(checkConnectivity, PROBE_INTERVAL_MS);
    return () => clearInterval(pollInterval);
  }, []);

  // Detect connection type and speed
  useEffect(() => {
    // @ts-ignore - NetworkInformation API not fully typed
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    if (connection) {
      const updateConnectionInfo = () => {
        const effectiveType = connection.effectiveType || 'unknown';
        setConnectionType(effectiveType);

        // Consider 2g or slow-2g as slow connection
        setIsSlowConnection(effectiveType === '2g' || effectiveType === 'slow-2g');

        console.log('[NETWORK] Connection type:', effectiveType);
      };

      updateConnectionInfo();

      connection.addEventListener('change', updateConnectionInfo);

      return () => {
        connection.removeEventListener('change', updateConnectionInfo);
      };
    }
  }, []);

  // Retry pending requests when connection is restored
  const retryPendingRequests = useCallback(async () => {
    if (!isOnline || pendingRetries.length === 0) return;

    console.log(`[NETWORK] Retrying ${pendingRetries.length} pending requests...`);

    const retries = [...pendingRetries];
    setPendingRetries([]);

    for (const retry of retries) {
      try {
        await retry();
      } catch (error) {
        console.error('[NETWORK] Retry failed:', error);
        // Re-queue failed retry
        setPendingRetries(prev => [...prev, retry]);
      }
    }
  }, [isOnline, pendingRetries]);

  // Auto-retry when connection is restored
  useEffect(() => {
    if (isOnline && pendingRetries.length > 0) {
      const timer = setTimeout(() => {
        retryPendingRequests();
      }, 1000); // Wait 1 second after connection restore

      return () => clearTimeout(timer);
    }
  }, [isOnline, pendingRetries, retryPendingRequests]);

  return {
    isOnline,
    offlineReason,
    isSlowConnection,
    connectionType,
    lastOnlineTime,
    retryPendingRequests,
  };
}
