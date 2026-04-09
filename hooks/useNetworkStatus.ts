'use client';

import { useState, useEffect, useCallback } from 'react';

interface NetworkStatusHook {
  isOnline: boolean;
  isSlowConnection: boolean;
  connectionType: string;
  lastOnlineTime: Date | null;
  retryPendingRequests: () => Promise<void>;
}

/**
 * Hook for monitoring network connectivity and connection quality.
 * Detects online/offline status, slow connections, and provides retry capabilities.
 */
export function useNetworkStatus(): NetworkStatusHook {
  const [isOnline, setIsOnline] = useState(true);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [connectionType, setConnectionType] = useState('unknown');
  const [lastOnlineTime, setLastOnlineTime] = useState<Date | null>(null);
  const [pendingRetries, setPendingRetries] = useState<(() => Promise<void>)[]>([]);

  // Detect network status changes via browser events (fast path)
  useEffect(() => {
    const handleOnline = () => {
      console.log('[NETWORK] Connection restored (browser event)');
      setIsOnline(true);
      setLastOnlineTime(new Date());
    };

    const handleOffline = () => {
      console.log('[NETWORK] Connection lost (browser event)');
      setIsOnline(false);
    };

    // Check initial state
    setIsOnline(navigator.onLine);

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
    // Shadow the current online state in a closure var so the poll callback
    // can compare without stale-closure issues (state setters are always stable).
    let localIsOnline = navigator.onLine;

    const checkConnectivity = async () => {
      try {
        // Use a HEAD request to a tiny resource; cache:no-store forces a real round-trip.
        await fetch('/favicon.ico', {
          method: 'HEAD',
          cache: 'no-store',
          // AbortSignal.timeout is widely supported in modern browsers
          signal: AbortSignal.timeout(1500),
        });
        if (!localIsOnline) {
          localIsOnline = true;
          setIsOnline(true);
          setLastOnlineTime(new Date());
          console.log('[NETWORK] Connectivity restored (active poll)');
        }
      } catch {
        if (localIsOnline) {
          localIsOnline = false;
          setIsOnline(false);
          console.log('[NETWORK] Connectivity lost (active poll)');
        }
      }
    };

    const pollInterval = setInterval(checkConnectivity, 2000);
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
    isSlowConnection,
    connectionType,
    lastOnlineTime,
    retryPendingRequests,
  };
}
