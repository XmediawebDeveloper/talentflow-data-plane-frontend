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

  // Detect network status changes
  useEffect(() => {
    const handleOnline = () => {
      console.log('[NETWORK] Connection restored');
      setIsOnline(true);
      setLastOnlineTime(new Date());
    };

    const handleOffline = () => {
      console.log('[NETWORK] Connection lost');
      setIsOnline(false);
    };

    // Check initial state
    setIsOnline(navigator.onLine);

    // Listen for network changes
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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
