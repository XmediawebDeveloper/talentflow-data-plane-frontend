/**
 * WebSocket Hook for Real-Time Notifications
 *
 * Connects to the backend WebSocket for instant notification updates.
 * Falls back to polling if WebSocket connection fails.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  type: 'new_notification' | 'notification_count' | 'connected' | 'pong' | 'permissions_updated';
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
    return `${protocol}//localhost:8001`;
  }
  return 'ws://localhost:8001';
};

const WS_BASE_URL = getWebSocketBaseUrl();
const RECONNECT_DELAY = 3000; // 3 seconds
const PING_INTERVAL = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 5;

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
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);
  const isCleaningUpRef = useRef(false);

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

      // Mark as connecting to prevent duplicate attempts
      isConnectingRef.current = true;

      try {
        const wsUrl = `${WS_BASE_URL}/api/v1/ws/notifications?token=${encodeURIComponent(token)}`;
        console.log('[WebSocket] Attempting connection to:', wsUrl.replace(token, '***TOKEN***'));
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
          reconnectAttemptsRef.current = 0;
          isConnectingRef.current = false;

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
              case 'new_notification':
                if (onNewNotificationRef.current && message.data) {
                  onNewNotificationRef.current(message.data);
                }
                break;

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
            }
          } catch (e) {
            console.error('[WebSocket] Error parsing message:', e);
          }
        };

        ws.onerror = (error) => {
          console.error('[WebSocket] ❌ Error event fired:', error);
          console.error('[WebSocket] readyState at error:', ws.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)');
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
          } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            setConnectionError('Max reconnection attempts reached. Falling back to polling.');
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
