/**
 * TalentFlow API Client
 * Base configuration and axios instance
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
let accessToken: string | null = null;
let refreshToken: string | null = null;

// ✅ NEW: Permission version tracking for cache invalidation
let permissionVersion: number | null = null;

export const setTokens = (access: string, refresh: string) => {
  accessToken = access;
  refreshToken = refresh;

  if (typeof window !== 'undefined') {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);

    // ✅ NEW: Extract and store permission version from JWT
    try {
      const payload = JSON.parse(atob(access.split('.')[1]));
      if (payload.permission_version) {
        permissionVersion = payload.permission_version;
        localStorage.setItem('permission_version', String(permissionVersion));
        console.log('[AUTH] Stored permission version:', permissionVersion);
      }
    } catch (e) {
      console.log('[AUTH] Could not extract permission version from token');
    }

    // Detect browser for optimal cookie settings
    const getBrowserInfo = () => {
      if (typeof navigator === 'undefined') return { name: 'unknown', isIOS: false };

      const ua = navigator.userAgent.toLowerCase();
      return {
        name: ua.includes('firefox') ? 'firefox'
            : ua.includes('safari') && !ua.includes('chrome') ? 'safari'
            : ua.includes('arc') ? 'arc'
            : ua.includes('chrome') ? 'chrome'
            : 'other',
        isIOS: /iphone|ipad|ipod/.test(ua),
        platform: navigator.platform
      };
    };

    const browser = getBrowserInfo();

    // Use universal cookie settings that work across all browsers
    // Use 'lax' for better compatibility - 'strict' can be too restrictive in Firefox
    const cookieOptions: Cookies.CookieAttributes = {
      path: '/',
      sameSite: 'lax',  // 'lax' provides good security while maintaining compatibility
      secure: window.location.protocol === 'https:',
      // Add domain for cross-subdomain support if needed
      // domain: window.location.hostname.replace(/^[^.]+\./g, '') // e.g., .example.com
    };

    // Set cookies
    Cookies.set('accessToken', access, { ...cookieOptions, expires: 7 });
    Cookies.set('refreshToken', refresh, { ...cookieOptions, expires: 30 });

    // Verify cookies were set (all privacy browsers can silently fail)
    const verifyAccess = Cookies.get('accessToken');
    if (!verifyAccess) {
      console.warn(`[AUTH] ${browser.name} cookie set failed - relying on localStorage`, {
        browser: browser.name,
        isIOS: browser.isIOS,
        secure: cookieOptions.secure,
        protocol: window.location.protocol
      });
    } else {
      console.log('[AUTH] Cookies set successfully', {
        browser: browser.name,
        isIOS: browser.isIOS
      });
    }

    // iOS Safari has unique cookie limitations in web views
    if (browser.isIOS && browser.name === 'safari') {
      // iOS Safari in standalone/web view mode may not persist cookies
      // Ensure localStorage is the source of truth
      console.log('[AUTH] iOS Safari detected - localStorage will be primary storage');
    }
  }
};

export const getTokens = () => {
  if (!accessToken && typeof window !== 'undefined') {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
    // ✅ NEW: Restore permission version from storage
    const storedVersion = localStorage.getItem('permission_version');
    if (storedVersion) {
      permissionVersion = parseInt(storedVersion, 10);
    }
  }
  return { accessToken, refreshToken };
};

// ✅ NEW: Permission version helper functions
// These must be defined before clearTokens() since it uses clearPermissionVersion()

// Get current permission version from localStorage
export const getPermissionVersion = (): number | null => {
  if (permissionVersion === null && typeof window !== 'undefined') {
    const storedVersion = localStorage.getItem('permission_version');
    if (storedVersion) {
      permissionVersion = parseInt(storedVersion, 10);
    }
  }
  return permissionVersion;
};

// Set permission version in memory and localStorage
export const setPermissionVersion = (version: number): void => {
  permissionVersion = version;
  if (typeof window !== 'undefined') {
    localStorage.setItem('permission_version', String(version));
    console.log('[AUTH] Permission version updated:', version);
  }
};

// Clear permission version from memory and localStorage
export const clearPermissionVersion = (): void => {
  permissionVersion = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('permission_version');
    console.log('[AUTH] Permission version cleared');
  }
};

export const clearTokens = () => {
  accessToken = null;
  refreshToken = null;

  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');

    // Remove cookies with the same path used when setting them
    Cookies.remove('accessToken', { path: '/' });
    Cookies.remove('refreshToken', { path: '/' });
  }

  // Clear permission version using dedicated function
  clearPermissionVersion();
};

// Handle 401 Unauthorized - clear tokens and redirect to login
// Can be called from any component using fetch directly
export const handleUnauthorized = () => {
  console.log('[API] 401 Unauthorized - logging out user');
  clearTokens();
  if (typeof window !== 'undefined') {
    // Clear any other auth-related storage
    localStorage.removeItem('user');
    sessionStorage.clear();
    // Redirect to login
    window.location.href = '/login';
  }
};

// Helper to check response and handle 401 automatically
// Use this when making fetch calls outside of the axios instance
export const checkResponseAuth = async (response: Response): Promise<Response> => {
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('Session expired. Please log in again.');
  }
  return response;
};

// Authenticated fetch wrapper - handles 401 automatically
// Use this instead of native fetch for authenticated API calls
export const authFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const { accessToken } = getTokens();

  const headers = {
    'Content-Type': 'application/json',
    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 - logout and redirect
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('Session expired. Please log in again.');
  }

  return response;
};

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = getTokens();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Custom event for subscription inactive errors
export const SUBSCRIPTION_INACTIVE_EVENT = 'subscription-inactive';

// Custom event for payment pending errors
export const PAYMENT_PENDING_EVENT = 'payment-pending';

export interface SubscriptionInactiveDetail {
  error_code: string;
  message: string;
  status: string;
  action_required: string;
  support_email: string;
  reason?: string;
  suspended_at?: string;
  expired_at?: string;
}

export interface PaymentPendingDetail {
  error_code: string;
  message: string;
  status: string;
  action_required: string;
  redirect_to: string;
  tenant_id: string;
  plan_id: number;
  plan_name: string | null;
  support_email: string;
}

// Dispatch subscription inactive event for global handling
const dispatchSubscriptionInactiveEvent = (detail: SubscriptionInactiveDetail) => {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent(SUBSCRIPTION_INACTIVE_EVENT, { detail });
    window.dispatchEvent(event);
  }
};

// Dispatch payment pending event for global handling
const dispatchPaymentPendingEvent = (detail: PaymentPendingDetail) => {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent(PAYMENT_PENDING_EVENT, { detail });
    window.dispatchEvent(event);
  }
};

// Custom event for units consumed - triggers header quota refresh
export const UNITS_CONSUMED_EVENT = 'unitsConsumed';

// Dispatch units consumed event to refresh quota display in header
export const dispatchUnitsConsumed = () => {
  if (typeof window !== 'undefined') {
    console.log('[API] Dispatching unitsConsumed event');
    window.dispatchEvent(new CustomEvent(UNITS_CONSUMED_EVENT));
  }
};

// ✅ NEW: Permission version check interceptor - runs BEFORE error handling
// This checks if permissions have changed on the server and triggers a token refresh
api.interceptors.response.use(
  async (response) => {
    // Check if server sent a permission version header
    const serverVersion = response.headers['x-permission-version'];
    if (serverVersion) {
      const serverVersionNum = parseInt(serverVersion, 10);
      const currentVersion = getPermissionVersion();

      if (currentVersion !== null && serverVersionNum > currentVersion) {
        console.log(`[AUTH] Permission version changed: ${currentVersion} → ${serverVersionNum}`);
        console.log('[AUTH] Refreshing token to get updated permissions...');

        // Trigger token refresh to get updated permissions
        try {
          const { refreshToken: currentRefreshToken } = getTokens();
          if (currentRefreshToken) {
            const refreshResponse = await axios.post(`${API_BASE_URL}/auth/refresh`, {
              refresh_token: currentRefreshToken,
            });

            const { access_token, refresh_token } = refreshResponse.data;
            setTokens(access_token, refresh_token);

            console.log('[AUTH] Token refreshed successfully with new permissions');

            // Dispatch event to notify components to re-fetch data
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('permissions-updated'));
            }
          }
        } catch (refreshError) {
          console.error('[AUTH] Failed to refresh token for permission update:', refreshError);
        }
      }
    }

    return response;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh and subscription errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle PAYMENT_PENDING error (402 Payment Required)
    if (error.response?.status === 402) {
      const detail = error.response.data as { detail?: PaymentPendingDetail };
      if (detail?.detail?.error_code === 'PAYMENT_PENDING') {
        console.log('[API] Payment pending detected, redirecting to payment page...');
        // Dispatch event for global UI handling
        dispatchPaymentPendingEvent(detail.detail);
        // Redirect to payment completion page (only if not already on that page)
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/complete-payment')) {
          const { tenant_id, plan_id } = detail.detail;
          window.location.href = `/complete-payment?tenant_id=${tenant_id}&plan_id=${plan_id}`;
        }
        return Promise.reject(error);
      }
    }

    // Handle SUBSCRIPTION_INACTIVE error (403 with specific error_code)
    if (error.response?.status === 403) {
      const detail = error.response.data as { detail?: SubscriptionInactiveDetail };
      if (detail?.detail?.error_code === 'SUBSCRIPTION_INACTIVE') {
        // Skip modal dispatch if user is already on the subscription page (where they can renew)
        const isOnSubscriptionPage = typeof window !== 'undefined' &&
          window.location.pathname.includes('/subscription/current-plan');

        if (!isOnSubscriptionPage) {
          // Dispatch event for global UI handling
          dispatchSubscriptionInactiveEvent(detail.detail);
        }
        // Don't reject - let the event handler show the modal
        return Promise.reject(error);
      }
    }

    // If 401 and not already retrying, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Skip token refresh/logout for auth endpoints (login, signup, forgot-password, etc.)
      // These endpoints return 401 for invalid credentials, not expired sessions
      const isAuthEndpoint = originalRequest.url?.includes('/auth/login') ||
                             originalRequest.url?.includes('/auth/signup') ||
                             originalRequest.url?.includes('/auth/forgot-password') ||
                             originalRequest.url?.includes('/auth/reset-password') ||
                             originalRequest.url?.includes('/auth/verify-2fa-login') ||
                             originalRequest.url?.includes('/signup/');

      if (isAuthEndpoint) {
        // For auth endpoints, just reject the error without redirecting
        // Let the component handle the error display
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        const { refreshToken } = getTokens();
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { access_token, refresh_token } = response.data;
          setTokens(access_token, refresh_token);

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } else {
          // No refresh token available - logout immediately
          handleUnauthorized();
        }
      } catch (refreshError) {
        // Token refresh failed - logout immediately
        handleUnauthorized();
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// Custom error class that preserves HTTP status code
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Error handler helper that preserves status code
// Now throws ApiError instead of returning a string
export const handleApiError = (error: unknown): never => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;

    let message: string;
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail[0]?.msg || 'Validation error';
    } else if (detail && typeof detail === 'object') {
      // Handle object detail (e.g., quota errors with error_code)
      if (detail.error_code === 'QUOTA_EXCEEDED') {
        message = detail.message || 'OpenAI API quota exceeded. Please try again later or contact support.';
      } else if (detail.message) {
        message = detail.message;
      } else {
        message = error.message;
      }
    } else {
      message = error.message;
    }

    // Check for permission denied (403)
    if (status === 403) {
      message = `Permission Denied: ${message}`;
    }

    throw new ApiError(message, status);
  }
  throw new ApiError('An unexpected error occurred');
};
