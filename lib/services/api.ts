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

export const setTokens = (access: string, refresh: string) => {
  accessToken = access;
  refreshToken = refresh;

  if (typeof window !== 'undefined') {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
    Cookies.set('accessToken', access, { expires: 7 });
    Cookies.set('refreshToken', refresh, { expires: 30 });
  }
};

export const getTokens = () => {
  if (!accessToken && typeof window !== 'undefined') {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
  }
  return { accessToken, refreshToken };
};

export const clearTokens = () => {
  accessToken = null;
  refreshToken = null;

  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');
  }
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
