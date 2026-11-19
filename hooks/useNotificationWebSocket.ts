/**
 * WebSocket Hook for Real-Time Notifications
 *
 * Connects to the backend WebSocket for instant notification updates.
 * Falls back to polling if WebSocket connection fails.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { dispatchAccessRestrictedEvent, getAccessToken } from '@/lib/services/api';

// Server close code for "this account was deactivated" (app/routers/websocket.py).
// Distinct from the generic auth failure so we can stop reconnecting.
const WS_CLOSE_ACCOUNT_INACTIVE = 4403;

interface WebSocketMessage {
  type: 'new_notification' | 'notification_count' | 'connected' | 'pong' | 'permissions_updated' | 'plan_change_pending' | 'company_profile_updated' | 'access_restricted' | 'plan_updated';
  data?: any;
}

interface UseNotificationWebSocketProps {
  token: string | null;
  onNewNotification?: (notification: any) => void;
  onCountUpdate?: (count: number) => void;
  onPermissionsUpdated?: () => void;
  enabled?: boolean;
}

interface UseNotificationWebSocketReturn {
  isConnected: boolean;
  connectionError: string | null;
  reconnect: () => void;
}

// Auto-detect WebSocket protocol based on page protocol (ws:// for http://, wss:// for https://)
const getWebSocketBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  // Auto-detect: use wss:// for https://, ws:// for http://
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//localhost:8000`;
  }
  return 'ws://localhost:8000';
};

const WS_BASE_URL = getWebSocketBaseUrl();
const RECONNECT_DELAY = 3000; // 3 seconds
const PING_INTERVAL = 20000; // 20 seconds — keep alive inside typical 30–60s proxy timeouts
const MAX_RECONNECT_ATTEMPTS = 10;
const RECOVERY_DELAY = 60000; // 60 seconds before resetting attempts after exhaustion

export function useNotificationWebSocket({
  token,
  onNewNotification,
  onCountUpdate,
  onPermissionsUpdated,
  enabled = true,
}: UseNotificationWebSocketProps): UseNotificationWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);
  const isCleaningUpRef = useRef(false);
  // Notification ids already handled (see the new_notification case).
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  // Store callbacks in refs to avoid dependency issues
  const onNewNotificationRef = useRef(onNewNotification);
  const onCountUpdateRef = useRef(onCountUpdate);
  const onPermissionsUpdatedRef = useRef(onPermissionsUpdated);

  useEffect(() => {
    onNewNotificationRef.current = onNewNotification;
  }, [onNewNotification]);

  useEffect(() => {
    onCountUpdateRef.current = onCountUpdate;
  }, [onCountUpdate]);

  useEffect(() => {
    onPermissionsUpdatedRef.current = onPermissionsUpdated;
  }, [onPermissionsUpdated]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setConnectionError(null);
    isConnectingRef.current = false;
    // Will trigger reconnection via the main effect
  }, []);

  // Main connection effect
  useEffect(() => {
    console.log('[WebSocket] Effect triggered — token:', token ? '✅ present' : '❌ missing', '| enabled:', enabled);

    if (!token || !enabled) {
      console.log('[WebSocket] Skipping connection — token or enabled is falsy');
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connecting/connected — readyState:', wsRef.current?.readyState, '| isConnecting:', isConnectingRef.current);
      return;
    }

    isConnectingRef.current = true;
    isCleaningUpRef.current = false;

    const connect = () => {
      if (isCleaningUpRef.current) {
        return;
      }

      // Prevent multiple simultaneous connections
      if (wsRef.current?.readyState === WebSocket.CONNECTING ||
          wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('[WebSocket] Already connecting or connected, skipping');
        return;
      }

      // Always read the freshest token from localStorage at connection time.
      // The token prop (wsToken state) only changes on identity change (login/logout),
      // but the underlying JWT may have been silently refreshed by the API interceptor
      // between disconnect and reconnect.  Using the live localStorage value ensures
      // reconnections never fail due to a stale token.
      const liveToken =
        (typeof window !== 'undefined' && getAccessToken()) || token;

      if (!liveToken) {
        console.log('[WebSocket] No token available for connection, skipping');
        return;
      }

      // Mark as connecting to prevent duplicate attempts
      isConnectingRef.current = true;

      try {
        const wsUrl = `${WS_BASE_URL}/api/v1/ws/notifications?token=${encodeURIComponent(liveToken)}`;
        console.log('[WebSocket] Attempting connection to:', wsUrl.replace(liveToken, '***TOKEN***'));
        console.log('[WebSocket] WS_BASE_URL:', WS_BASE_URL);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        console.log('[WebSocket] WebSocket object created — initial readyState:', ws.readyState, '(0=CONNECTING)');

        ws.onopen = () => {
          if (isCleaningUpRef.current) {
            console.log('[WebSocket] onopen fired but cleanup in progress — closing');
            ws.close();
            return;
          }
          console.log('[WebSocket] ✅ Connected successfully — readyState:', ws.readyState, '(1=OPEN)');
          setIsConnected(true);
          setConnectionError(null);
          isConnectingRef.current = false;

          // If this is a reconnect (not the initial connect), refresh permissions immediately.
          // Any permissions_updated push sent while the socket was down was never received,
          // so we pull the latest permissions now to avoid stale state.
          if (reconnectAttemptsRef.current > 0 && onPermissionsUpdatedRef.current) {
            console.log('[WebSocket] Reconnected after drop — refreshing permissions to catch missed pushes');
            onPermissionsUpdatedRef.current();
          }

          reconnectAttemptsRef.current = 0;

          // Start ping/pong for keepalive
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, PING_INTERVAL);
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            console.log('[WebSocket] Received:', message.type);

            switch (message.type) {
              case 'new_notification': {
                /* The server sends each notification straight to this socket
                   when it holds it AND relays it over Redis for the other
                   workers — so the same one can arrive twice. Act on it once
                   (two toasts, badge +2 otherwise). */
                const id = message.data?.id ? String(message.data.id) : null;
                if (id) {
                  if (seenNotificationIdsRef.current.has(id)) break;
                  seenNotificationIdsRef.current.add(id);
                  if (seenNotificationIdsRef.current.size > 200) {
                    const oldest = seenNotificationIdsRef.current.values().next().value;
                    if (oldest !== undefined) seenNotificationIdsRef.current.delete(oldest);
                  }
                }
                if (onNewNotificationRef.current && message.data) {
                  onNewNotificationRef.current(message.data);
                }
                break;
              }

              case 'notification_count':
                if (onCountUpdateRef.current && message.data?.unread_count !== undefined) {
                  onCountUpdateRef.current(message.data.unread_count);
                }
                break;

              case 'connected':
                console.log('[WebSocket] Connection confirmed:', message.data?.message);
                break;

              case 'pong':
                // Keepalive response, no action needed
                break;

              case 'permissions_updated':
                console.log('[WebSocket] Permissions updated - triggering refresh');
                if (onPermissionsUpdatedRef.current) {
                  onPermissionsUpdatedRef.current();
                }
                break;

              case 'access_restricted':
                // Admin deactivated this account — block the app immediately.
                console.log('[WebSocket] Access restricted - account deactivated');
                dispatchAccessRestrictedEvent(message.data || {});
                break;

              case 'plan_change_pending':
                console.log('[WebSocket] Plan change pending - dispatching event');
                window.dispatchEvent(new CustomEvent('plan-change-pending', { detail: message.data }));
                break;

              case 'plan_updated':
                // A plan bought directly from the company was activated by the Control Plane.
                console.log('[WebSocket] Plan updated - dispatching event');
                window.dispatchEvent(new CustomEvent('plan-updated', { detail: message.data }));
                break;

              case 'company_profile_updated':
                console.log('[WebSocket] Company profile updated by admin - dispatching event');
                window.dispatchEvent(new CustomEvent('company-profile-updated'));
                break;
            }
          } catch (e) {
            console.error('[WebSocket] Error parsing message:', e);
          }
        };

        ws.onerror = () => {
          /* warn, not error: a failed attempt is routine (expired token at
             connect time, transient drop) and self-heals via the reconnect in
             onclose — console.error here made Next.js dev raise its overlay on
             every retry. The browser's error event carries no information
             (always logs as {}), so don't log it; onclose reports the close
             code and reason, which is the actual diagnostic. */
          console.warn('[WebSocket] Connection attempt failed — readyState:', ws.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED); see the close event for the code/reason');
          setConnectionError('WebSocket connection error');
          // Note: onclose will be called after onerror, so state cleanup happens there
        };

        ws.onclose = (event) => {
          console.log('[WebSocket] 🔌 Closed — code:', event.code, '| reason:', event.reason || '(no reason)', '| wasClean:', event.wasClean);
          setIsConnected(false);
          isConnectingRef.current = false;

          // Clean up ping interval
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }

          // Clear the old WebSocket reference
          wsRef.current = null;

          // Don't reconnect if we're cleaning up
          if (isCleaningUpRef.current) {
            return;
          }

          // Account deactivated — the socket can never be reopened, so raise the
          // Access Restricted modal and stop retrying instead of hammering the
          // endpoint every few seconds.
          if (event.code === WS_CLOSE_ACCOUNT_INACTIVE) {
            console.log('[WebSocket] Closed: account deactivated — not reconnecting');
            dispatchAccessRestrictedEvent();
            return;
          }

          // Attempt reconnection if not intentionally closed
          if (event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            // Use longer delay for server restart (1012) or service unavailable (1013)
            const delay = (event.code === 1012 || event.code === 1013)
              ? RECONNECT_DELAY * 2
              : RECONNECT_DELAY;
            console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);

            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          } else if (event.code !== 1000 && reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.log(`[WebSocket] Max reconnect attempts reached. Will retry in ${RECOVERY_DELAY / 1000}s...`);
            setConnectionError('Connection lost. Retrying in 60 seconds...');
            // Schedule a recovery attempt after a longer delay instead of giving up permanently
            recoveryTimeoutRef.current = setTimeout(() => {
              if (!isCleaningUpRef.current) {
                console.log('[WebSocket] Recovery attempt — resetting reconnect counter and reconnecting');
                reconnectAttemptsRef.current = 0;
                setConnectionError(null);
                connect();
              }
            }, RECOVERY_DELAY);
          }
        };
      } catch (error) {
        console.error('[WebSocket] Failed to create connection:', error);
        setConnectionError('Failed to create WebSocket connection');
        isConnectingRef.current = false;
      }
    };

    connect();

    // Cleanup function
    return () => {
      console.log('[WebSocket] Cleanup triggered');
      isCleaningUpRef.current = true;

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (recoveryTimeoutRef.current) {
        clearTimeout(recoveryTimeoutRef.current);
        recoveryTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      isConnectingRef.current = false;
    };
  }, [token, enabled]); // Only depend on token and enabled

  return {
    isConnected,
    connectionError,
    reconnect,
  };
}

export default useNotificationWebSocket;
