/**
 * TalentFlow API Client
 * Base configuration and axios instance
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';
import { encodeParam, encodePlanId } from '@/lib/utils/planEncoder';
import { forceNavigate } from '@/lib/utils/forcedNavigation';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/*
 * Identical-GET sharing. Opening a module fired the same GET from several
 * independent components at once (/usage/quota-status x3, /ai-interview/configs
 * x3, /assessments x2, the whole /scoring/all table x2 ...), each a full round
 * trip. A GET whose URL + params + token matches one still in flight, or one
 * that finished under GET_REUSE_MS ago, shares that response instead.
 *
 * Done at the adapter, so every caller still runs its own response
 * interceptors (401 refresh, subscription events) and its own
 * transformResponse — the raw body is a string here, so each caller parses
 * its own copy and nobody can mutate another caller's data. Any non-GET
 * clears the cache when it starts AND when it finishes, so a read after a
 * write never sees pre-write data. Pass `dedupe: false` in the request
 * config to opt out (e.g. a poll that must hit the server every time).
 */
declare module 'axios' {
  interface AxiosRequestConfig {
    dedupe?: boolean;
    /**
     * Non-GET only. Pass `false` for a POST that only READS (e.g. a batch
     * lookup sent as POST because of its body size), so it does not throw
     * away the shared GETs in flight. Never set it on a request that writes.
     */
    invalidatesCache?: boolean;
    /**
     * Non-GET only, narrower than `invalidatesCache`: `false` keeps the list
     * caches (listCache, and the paged lists that re-read when it clears) but
     * still clears the 1 s shared GETs. For writes that touch no listed data —
     * e.g. the header's notification bookkeeping POSTs on every hard load,
     * which otherwise made every paged list fetch its page a second time.
     */
    invalidatesLists?: boolean;
  }
}
const GET_REUSE_MS = 1000;
type SharedGet = { promise: Promise<AxiosResponse>; settledAt: number | null; raw?: unknown };
const sharedGets = new Map<string, SharedGet>();
const baseAdapter = axios.getAdapter(api.defaults.adapter);
api.defaults.adapter = (config: InternalAxiosRequestConfig) => {
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get') {
    if (config.invalidatesCache === false) return baseAdapter(config);
    sharedGets.clear();
    return baseAdapter(config).finally(() => sharedGets.clear());
  }
  if (config.dedupe === false || config.signal || (config.responseType && config.responseType !== 'json')) {
    return baseAdapter(config);
  }
  // Params sorted so `{ page, page_size }` and `{ page_size, page }` share.
  let paramsKey: string;
  if (config.params instanceof URLSearchParams) {
    paramsKey = config.params.toString();
  } else {
    const params = (config.params ?? {}) as Record<string, unknown>;
    paramsKey = JSON.stringify(Object.keys(params).sort()
      .filter((k) => params[k] !== undefined && params[k] !== null)
      .map((k) => [k, params[k]]));
  }
  const key = `${config.baseURL}|${config.url}|${paramsKey}|${config.headers?.Authorization ?? ''}`;
  const hit = sharedGets.get(key);
  if (hit && (hit.settledAt === null || Date.now() - hit.settledAt < GET_REUSE_MS)) {
    return hit.promise.then(
      // `hit.raw`, not `response.data`: axios parses the first caller's body
      // by assigning onto this same response object.
      (response) => ({
        ...response,
        config,
        data: typeof hit.raw === 'string' ? hit.raw : structuredClone(hit.raw),
      }),
      (error) => {
        throw axios.isAxiosError(error)
          ? new AxiosError(error.message, error.code, config, error.request, error.response)
          : error;
      },
    );
  }
  const entry: SharedGet = { promise: Promise.resolve(null as unknown as AxiosResponse), settledAt: null };
  entry.promise = baseAdapter(config).then((response) => {
    entry.raw = response.data;
    return response;
  });
  sharedGets.set(key, entry);
  entry.promise.then(
    () => { entry.settledAt = Date.now(); },
    () => { if (sharedGets.get(key) === entry) sharedGets.delete(key); },
  );
  return entry.promise;
};

// Token management (security sheet "full application" #5)
//
// The refresh token is never kept by the page: it lives in an httpOnly cookie
// on this app's own host, written and read only by the /api/session routes
// (app/api/session, lib/server/sessionCookies.ts). The short-lived access token
// is held in memory only - not localStorage, not a cookie - and re-issued from
// that cookie on each page load (restoreSession). An injected script can no
// longer copy a session that outlives the page.
let accessToken: string | null = null;
// Whether this browser may still have a session cookie. Starts from a
// non-secret localStorage flag so a page load knows a refresh is worth trying.
let hasSession = false;
const SIGNED_IN_FLAG = 'tf_signed_in';
// Changes on every sign-in; lets another tab tell "signed in again" apart.
const SESSION_EPOCH_KEY = 'tf_session_epoch';
// getTokens().refreshToken stand-in: the real token is in the httpOnly cookie.
const SESSION_COOKIE_REFRESH = 'httponly-cookie';
const SESSION_HEADERS = { 'Content-Type': 'application/json', 'X-TF-Session': '1' };

// ✅ NEW: Permission version tracking for cache invalidation
let permissionVersion: number | null = null;

const readFlag = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const writeFlag = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage unavailable */ }
};

// Tokens written by the pre-#5 code. Read once to move an existing session to
// the cookie, then removed everywhere.
const takeLegacyRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  const legacy = readFlag('refreshToken') || Cookies.get('refreshToken') || null;
  writeFlag('accessToken', null);
  writeFlag('refreshToken', null);
  Cookies.remove('accessToken', { path: '/' });
  Cookies.remove('refreshToken', { path: '/' });
  return legacy;
};

// The sign-in this page belongs to (see performSessionLogout).
let pageSessionEpoch: string | null = null;

if (typeof window !== 'undefined') {
  pageSessionEpoch = readFlag(SESSION_EPOCH_KEY);
  hasSession = readFlag(SIGNED_IN_FLAG) === '1'
    || !!readFlag('refreshToken') || !!Cookies.get('refreshToken');
}

// Access tokens live 30 minutes. Renew shortly before expiry (and when a tab
// wakes up) so the many raw fetch() callers that read getAccessToken() never
// send an expired token; only axios/authFetch retry a 401 on their own.
const RENEW_BEFORE_EXPIRY_MS = 2 * 60 * 1000;
let accessTokenExpiresAt = 0;
let renewTimer: ReturnType<typeof setTimeout> | null = null;

const renewSoon = () => {
  if (!hasSession || !accessToken) return;
  refreshAccessToken(SESSION_COOKIE_REFRESH).catch(() => {
    // A 401 here means the session ended; the next request shows that.
  });
};

const scheduleRenewal = () => {
  if (typeof window === 'undefined') return;
  if (renewTimer) clearTimeout(renewTimer);
  renewTimer = null;
  if (!accessTokenExpiresAt) return;
  const delay = Math.max(10_000, accessTokenExpiresAt - Date.now() - RENEW_BEFORE_EXPIRY_MS);
  renewTimer = setTimeout(renewSoon, delay);
};

if (typeof window !== 'undefined') {
  // Timers are paused or delayed in background tabs and on sleep.
  const renewIfStale = () => {
    if (document.visibilityState !== 'visible') return;
    if (accessTokenExpiresAt && accessTokenExpiresAt - Date.now() < RENEW_BEFORE_EXPIRY_MS) renewSoon();
  };
  document.addEventListener('visibilitychange', renewIfStale);
  window.addEventListener('focus', renewIfStale);
}

const applyAccessToken = (access: string) => {
  accessToken = access;
  accessTokenExpiresAt = 0;
  try {
    // JWT segments are base64url.
    const payload = JSON.parse(atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp === 'number') accessTokenExpiresAt = payload.exp * 1000;
    if (payload.permission_version) {
      permissionVersion = payload.permission_version;
      writeFlag('permission_version', String(permissionVersion));
    }
  } catch {
    // Not a JWT we can read - the permission version just isn't tracked.
  }
  scheduleRenewal();
};

/**
 * Start (or rotate) the session: access token into memory, refresh token into
 * the httpOnly cookie. Await it before navigating away, so the next page finds
 * the cookie.
 */
export const setTokens = (access: string, refresh?: string | null): Promise<void> => {
  applyAccessToken(access);
  if (typeof window === 'undefined') return Promise.resolve();
  hasSession = true;
  takeLegacyRefreshToken();
  writeFlag(SIGNED_IN_FLAG, '1');
  if (!refresh) return Promise.resolve();
  pageSessionEpoch = `${Date.now()}`;
  writeFlag(SESSION_EPOCH_KEY, pageSessionEpoch);
  return fetch('/api/session', {
    method: 'POST',
    headers: SESSION_HEADERS,
    body: JSON.stringify({ refresh_token: refresh }),
    credentials: 'same-origin',
    keepalive: true,   // survives a navigation that starts right after login
  }).then((res) => {
    if (!res.ok) console.warn('[AUTH] Could not save the session cookie:', res.status);
  }).catch((err) => {
    console.warn('[AUTH] Could not save the session cookie:', err);
  });
};

export const getTokens = () => {
  return { accessToken, refreshToken: hasSession ? SESSION_COOKIE_REFRESH : null };
};

/** The in-memory access token (null before restoreSession on a fresh page). */
export const getAccessToken = (): string | null => accessToken;

/** True when this browser has (or may have) a signed-in session. Non-secret. */
export const hasStoredSession = (): boolean => hasSession;

let restoreInFlight: Promise<boolean> | null = null;

/**
 * Get an access token for this page from the session cookie. Safe to call many
 * times; resolves true when the page has a usable access token. A legacy
 * localStorage session is moved to the cookie first, so nobody is signed out
 * by the switch.
 */
export const restoreSession = (): Promise<boolean> => {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (accessToken) return Promise.resolve(true);
  if (!hasSession) return Promise.resolve(false);
  if (!restoreInFlight) {
    restoreInFlight = (async () => {
      const legacy = takeLegacyRefreshToken();
      if (legacy) await setTokens('', legacy);
      try {
        await refreshAccessToken(SESSION_COOKIE_REFRESH);
        return true;
      } catch {
        return false;
      }
    })().finally(() => { restoreInFlight = null; });
  }
  return restoreInFlight;
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
  hasSession = false;
  accessTokenExpiresAt = 0;
  scheduleRenewal();  // cancels a pending renewal

  if (typeof window !== 'undefined') {
    takeLegacyRefreshToken();
    writeFlag(SIGNED_IN_FLAG, null);
    // Drop the httpOnly session cookie (only the server can).
    void fetch('/api/session', {
      method: 'DELETE', headers: SESSION_HEADERS, credentials: 'same-origin', keepalive: true,
    }).catch(() => { /* cookie expires on its own; the backend session is already revoked */ });

    // Drop unsent support-ticket drafts (saved per user by SupportCenter) so the
    // next person on this browser never sees them.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tf-support-ticket-draft:')) localStorage.removeItem(key);
      }
    } catch {
      // Storage unavailable — nothing to clean up.
    }
  }

  // Clear permission version using dedicated function
  clearPermissionVersion();
};

// Custom event for session expired - shows the global modal
// Tokens are NOT cleared here. They are cleared only when the user clicks "OK"
// in the modal (via performSessionLogout below). This keeps the user on the
// page (frozen behind the modal) until they explicitly acknowledge.
export const SESSION_EXPIRED_EVENT = 'session-expired';

// Internal guard: prevent multiple modal dispatches if many requests fail at once
let sessionExpiredDispatched = false;

const computeLoginUrl = (): string => {
  const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'talentflow.data.mo.vc';
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  let loginUrl = '/login';
  try {
    if (isLocalhost) {
      const storedUser = localStorage.getItem('talentflow_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user?.tenantSubdomain) loginUrl = `/login?org=${user.tenantSubdomain}`;
      }
      if (loginUrl === '/login') {
        const sub = localStorage.getItem('talentflow_subdomain');
        if (sub) loginUrl = `/login?org=${sub}`;
      }
    } else if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
      const subdomain = hostname.slice(0, -(BASE_DOMAIN.length + 1));
      if (subdomain) loginUrl = `https://${subdomain}.${BASE_DOMAIN}/login`;
    }
  } catch {}
  return loginUrl;
};

// Show the session-expired modal (once per page load). Only for a session that
// is really gone — the refresh token was missing or refused.
const showSessionExpired = () => {
  if (typeof window === 'undefined') return;
  if (sessionExpiredDispatched) return;
  // Signed-out pages have no session to expire; a stray background 401 there
  // must not raise the modal (its "Log In Again" would just reload the page).
  if (/^\/(login|signup|reset-password|set-password)(\/|$)/.test(window.location.pathname)) return;
  sessionExpiredDispatched = true;
  console.log('[API] Session cannot be refreshed - dispatching session-expired event');
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
};

// Handle a 401 from a raw fetch call. A 401 usually only means the short-lived
// access token ran out, so try the refresh token first (the axios interceptor
// does the same) and show the modal only when that fails. Without this, every
// page that uses fetch() raised "Session Expired" again each time the access
// token lapsed, though the session was still valid.
// The actual logout happens only when the user clicks OK on the modal.
export const handleUnauthorized = () => {
  if (typeof window === 'undefined') return;
  if (sessionExpiredDispatched) return;
  const { refreshToken: currentRefreshToken } = getTokens();
  if (!currentRefreshToken) {
    showSessionExpired();
    return;
  }
  refreshAccessToken(currentRefreshToken).catch(showSessionExpired);
};

// Called by the SessionExpiredModal when the user clicks "OK".
// Performs the real cleanup and redirects to the login page.
export const performSessionLogout = () => {
  if (typeof window === 'undefined') return;
  // The user already signed in again in another tab: this tab only holds the
  // old token. Clearing here would wipe the NEW session and raise the modal
  // in that tab too — a loop. Reload onto the new session instead.
  const epoch = readFlag(SESSION_EPOCH_KEY);
  if (epoch && epoch !== pageSessionEpoch) {
    forceNavigate(window.location.href);
    return;
  }
  const loginUrl = computeLoginUrl();
  clearTokens();
  localStorage.removeItem('user');
  sessionStorage.clear();
  forceNavigate(loginUrl);   // forced — skips pages' unsaved-changes prompt
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
  if (!getAccessToken() && hasSession) await restoreSession();
  const { accessToken } = getTokens();

  const headers = {
    'Content-Type': 'application/json',
    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
    ...options.headers,
  };

  const isWrite = (options.method || 'GET').toUpperCase() !== 'GET';
  if (isWrite) sharedGets.clear();
  let response = await fetch(url, {
    ...options,
    headers,
  });
  if (isWrite) sharedGets.clear();

  // 401 — the access token may just have lapsed: refresh it and retry once.
  const { refreshToken: currentRefreshToken } = getTokens();
  if (response.status === 401 && currentRefreshToken) {
    try {
      const fresh = await refreshAccessToken(currentRefreshToken);
      response = await fetch(url, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${fresh}` },
      });
    } catch {
      // Refresh refused — fall through to the session-expired modal.
    }
  }

  // Still 401 - the session is gone
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('Session expired. Please log in again.');
  }

  return response;
};

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Fresh page: the access token is re-issued from the session cookie first.
    if (!getAccessToken() && hasSession) await restoreSession();
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

// Custom event for a user account deactivated/restricted WHILE logged in.
// Fired when a protected request is rejected because the account is now inactive,
// or when a background /auth/me refresh reports is_active=false. The global
// AccessRestrictedModal listens for this and blocks the app until sign-out.
export const ACCESS_RESTRICTED_EVENT = 'access-restricted';

export interface AccessRestrictedDetail {
  name?: string;
  email?: string;
  message?: string;
}

let accessRestrictedDispatched = false;

export const dispatchAccessRestrictedEvent = (detail: AccessRestrictedDetail = {}) => {
  if (typeof window === 'undefined') return;
  if (accessRestrictedDispatched) return;
  accessRestrictedDispatched = true;
  // The account is gone, not the session — make sure a parallel fetch/authFetch 401
  // can't stack the generic "Session expired" modal on top of this one.
  sessionExpiredDispatched = true;
  window.dispatchEvent(new CustomEvent(ACCESS_RESTRICTED_EVENT, { detail }));
};

// Backend signals for an inactive USER ACCOUNT — distinct from (a) a normal
// expired/invalid session, (b) a generic permission-denied 403, and (c) a
// tenant subscription/plan suspension. Enforcement lives in the data-plane API
// at app/services/auth.py (login) + the protected-route dependency; a
// deactivated user is set is_active=false via app/routers/users.py.
//
// The exact backend error_code is owned by that service (not in this repo), so
// we match a generous set of known codes AND an account-scoped phrase. The
// phrase tokens mirror the ones the QA smoke suite already treats as proof of a
// deactivated account (see e2e/smoke-tier3-signin.spec.ts:
//   /deactivat|suspend|disabled|not active|contact your/i) but are anchored to
// account/user/access wording so they can't match "subscription is inactive"
// or "Permission denied: jd:create".
const ACCOUNT_INACTIVE_ERROR_CODES = [
  'USER_INACTIVE', 'ACCOUNT_INACTIVE', 'INACTIVE_USER', 'INACTIVE_ACCOUNT',
  'USER_DEACTIVATED', 'ACCOUNT_DEACTIVATED', 'USER_DISABLED', 'ACCOUNT_DISABLED',
  'ACCESS_RESTRICTED', 'ACCOUNT_RESTRICTED', 'USER_RESTRICTED',
];

// Codes that must NEVER be treated as an account restriction — they own their
// own handling/modals further down this interceptor.
const NON_ACCOUNT_ERROR_CODES = ['SUBSCRIPTION_INACTIVE', 'PAYMENT_PENDING', 'QUOTA_EXCEEDED'];

// Account-scoped phrases. Each requires account/user/access context so a bare
// "inactive" (subscription) or "disabled" (feature) can't false-match.
const ACCOUNT_INACTIVE_KEYWORDS = [
  'account is inactive', 'account is deactivated', 'account is disabled', 'account is restricted',
  'account is not active', 'account is no longer active',
  'account has been deactivated', 'account has been restricted', 'account has been disabled',
  'account has been suspended', 'account deactivated', 'account restricted', 'account disabled',
  'user is inactive', 'user is deactivated', 'user is disabled', 'user is not active',
  'user account is inactive', 'user account is deactivated', 'user has been deactivated',
  'inactive user', 'deactivated user', 'access has been restricted', 'access is restricted',
];

// Returns true only when a 401/403 error body specifically indicates the
// logged-in user's OWN account was deactivated/restricted.
export const isAccountRestrictedResponse = (error: AxiosError): boolean => {
  const status = error.response?.status;
  if (status !== 401 && status !== 403) return false;

  const data: any = error.response?.data;
  const d: any = data?.detail;

  // error_code / error_type can appear under detail (FastAPI convention) or at
  // the top level depending on the endpoint — check both.
  const code = String(
    (d && typeof d === 'object' && (d.error_code || d.code)) || data?.error_code || data?.code || ''
  ).toUpperCase();
  const type = String(
    (d && typeof d === 'object' && d.error_type) || data?.error_type || ''
  ).toUpperCase();

  // Explicitly yield to subscription/plan/payment flows regardless of message text.
  if (NON_ACCOUNT_ERROR_CODES.includes(code) || type === 'SUSPENDED') return false;

  if (code && ACCOUNT_INACTIVE_ERROR_CODES.includes(code)) return true;

  const rawMsg =
    (typeof d === 'string' ? d : (d?.message || d?.error)) ||
    data?.message || data?.error || '';
  const msg = String(rawMsg).toLowerCase();
  return ACCOUNT_INACTIVE_KEYWORDS.some((k) => msg.includes(k));
};

// Pulls the affected user's identity off an account-restricted 401/403 so the
// modal can name the account. The data-plane sends these under `detail` for
// USER_INACTIVE (app/dependencies.py); anything missing falls back to the
// modal's own localStorage lookup.
export const readAccountRestrictedDetail = (error: AxiosError): AccessRestrictedDetail => {
  const data: any = error.response?.data;
  const d: any = data?.detail;
  const src = (d && typeof d === 'object') ? d : data;
  if (!src || typeof src !== 'object') return {};
  return {
    name: src.name || src.full_name || undefined,
    email: src.email || undefined,
    message: typeof src.message === 'string' ? src.message : undefined,
  };
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

// Custom event for plan change pending (403 SUSPENDED or WebSocket push)
export const PLAN_CHANGE_PENDING_EVENT = 'plan-change-pending';

export interface PlanChangePendingDetail {
  notification_id?: string;
  change_type?: string;
  deadline?: string;
  message?: string;
}

export const dispatchPlanChangePendingEvent = (detail: PlanChangePendingDetail) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PLAN_CHANGE_PENDING_EVENT, { detail }));
  }
};

// Single in-flight token refresh. Every caller that needs a refresh (parallel
// 401s, the permission-version check below) awaits the same POST /auth/refresh
// instead of each firing its own — refresh tokens rotate, so concurrent calls
// with the same refresh token would otherwise race. Cleared once it settles
// (success or failure) so a later expiry starts a fresh refresh.
let refreshInFlight: Promise<string> | null = null;

// The refresh token is in the httpOnly cookie, so the refresh goes through this
// app's /api/session/refresh route (it calls the backend's /auth/refresh). The
// argument is kept for older callers and ignored.
const refreshAccessToken = (_currentRefreshToken?: string): Promise<string> => {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/session/refresh', {
      method: 'POST', headers: SESSION_HEADERS, credentials: 'same-origin', cache: 'no-store',
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.access_token) {
          if (res.status === 401) {
            // The session is gone (logged out, revoked, expired).
            hasSession = false;
            writeFlag(SIGNED_IN_FLAG, null);
          }
          throw Object.assign(new Error(data?.detail || 'Session refresh failed'), { status: res.status });
        }
        applyAccessToken(data.access_token);
        hasSession = true;
        return data.access_token as string;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
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
            await refreshAccessToken(currentRefreshToken);

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

    // ✅ Check if quota-status response has expired trial/plan dates
    // The app-shell /bootstrap response carries the same quota-status body
    // (parts.quota_status.data) — run the same expiry check on it.
    const bootstrapQuotaPart = response.config.url?.includes('/bootstrap')
      ? response.data?.parts?.quota_status
      : undefined;
    const bootstrapQuota = bootstrapQuotaPart?.status === 200 ? bootstrapQuotaPart.data : undefined;
    if (response.config.url?.includes('/usage/quota-status') || bootstrapQuota) {
      const quotaData = bootstrapQuota
        ? (bootstrapQuota.data || bootstrapQuota)
        : (response.data?.data || response.data);
      if (!quotaData) {
        return response; // No data to check
      }

      const now = new Date();

      // Check trial expiry
      if (quotaData.trial_end_date) {
        const trialEndDate = new Date(quotaData.trial_end_date);
        if (trialEndDate < now) {
          console.log('[API] Trial has expired by date:', quotaData.trial_end_date);
          dispatchSubscriptionInactiveEvent({
            error_code: 'SUBSCRIPTION_INACTIVE',
            message: 'Your trial has expired. Please upgrade to continue.',
            status: 'EXPIRED',
            expired_at: quotaData.trial_end_date,
            action_required: 'upgrade_plan',
            support_email: 'support@talentflow.com',
          });
        }
      }

      // Check plan expiry (if no trial date)
      if (!quotaData.trial_end_date && quotaData.plan_expiry_date) {
        const planExpiryDate = new Date(quotaData.plan_expiry_date);
        if (planExpiryDate < now) {
          console.log('[API] Plan has expired by date:', quotaData.plan_expiry_date);
          dispatchSubscriptionInactiveEvent({
            error_code: 'SUBSCRIPTION_INACTIVE',
            message: 'Your subscription has expired. Please renew to continue.',
            status: 'EXPIRED',
            expired_at: quotaData.plan_expiry_date,
            action_required: 'renew_subscription',
            support_email: 'support@talentflow.com',
          });
        }
      }

      // Check billing period end (fallback, paid plans only — for a trial the
      // billing period is the monthly usage cycle, not the trial window)
      const isTrialQuota = quotaData.is_trial === true || quotaData.is_trial === 'true' || quotaData.quota_source === 'FREE_TRIAL';
      if (!isTrialQuota && !quotaData.trial_end_date && !quotaData.plan_expiry_date && quotaData.billing_period?.end) {
        const billingEndDate = new Date(quotaData.billing_period.end);
        if (billingEndDate < now) {
          console.log('[API] Billing period has expired:', quotaData.billing_period.end);
          dispatchSubscriptionInactiveEvent({
            error_code: 'SUBSCRIPTION_INACTIVE',
            message: 'Your subscription has expired. Please renew to continue.',
            status: 'EXPIRED',
            expired_at: quotaData.billing_period.end,
            action_required: 'renew_subscription',
            support_email: 'support@talentflow.com',
          });
        }
      }
    }

    return response;
  },
  (error) => Promise.reject(error)
);

// Guard flag: prevent multiple simultaneous PAYMENT_PENDING redirects firing from concurrent 402 errors
// Exported so layout.tsx listener uses the SAME guard — prevents duplicate hard reloads
let paymentRedirectInProgress = false;

// plan_id is `string | number` because PaymentPendingDetail.plan_id is a number and
// both call sites pass it straight through. encodePlanId() below already accepts
// either, so this only corrects the declared type - no conversion is added.
export const redirectToPaymentPage = (tenant_id: string, plan_id: string | number) => {
  if (!paymentRedirectInProgress && typeof window !== 'undefined' && !window.location.pathname.includes('/complete-payment')) {
    paymentRedirectInProgress = true;
    const t = encodeParam(tenant_id);
    const p = encodePlanId(plan_id);
    window.location.href = `/complete-payment?t=${encodeURIComponent(t)}&p=${encodeURIComponent(p)}`;
  }
};

// Response interceptor - handle token refresh and subscription errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Account deactivated/restricted WHILE logged in — a protected request now
    // rejects this user's session (401/403 with an account-inactive signal).
    // Show the global Access Restricted modal and stop here so we don't attempt a
    // token refresh (the account is gone, not the token). The /login endpoint
    // handles its own restriction UI, so skip it here.
    if (
      (error.response?.status === 403 || error.response?.status === 401) &&
      isAccountRestrictedResponse(error)
    ) {
      const url = originalRequest?.url || '';
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/verify-2fa-login');
      if (!isAuthEndpoint) {
        dispatchAccessRestrictedEvent(readAccountRestrictedDetail(error));
        return Promise.reject(error);
      }
    }

    // Handle PAYMENT_PENDING error (402 Payment Required)
    if (error.response?.status === 402) {
      const detail = error.response.data as { detail?: PaymentPendingDetail };
      if (detail?.detail?.error_code === 'PAYMENT_PENDING') {
        console.log('[API] Payment pending detected, redirecting to payment page...');
        // Dispatch event for global UI handling
        dispatchPaymentPendingEvent(detail.detail);
        // Use shared redirect function — if layout listener already fired this (synchronously,
        // during dispatchPaymentPendingEvent above), the guard is already set and this is a no-op
        redirectToPaymentPage(detail.detail.tenant_id, detail.detail.plan_id);
        return Promise.reject(error);
      }
    }

    // Handle SUBSCRIPTION_INACTIVE error (403 with specific error_code)
    if (error.response?.status === 403) {
      const detail = error.response.data as { detail?: SubscriptionInactiveDetail & { error_type?: string } };

      // Check if suspension is due to plan changes (SUSPENDED error_type)
      if (detail?.detail?.error_type === 'SUSPENDED') {
        dispatchPlanChangePendingEvent({ message: detail?.detail?.message });
        return Promise.reject(error);
      }

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

    // Inactivity timeout: the backend keeps 401ing this session until the user
    // logs in again, and a token refresh does not help (/auth/refresh is exempt
    // from the check, so it succeeds and the retry 401s again). Show the modal
    // instead of refreshing - otherwise nothing ever raises it and the app sits
    // on its cached user with every request failing.
    if (error.response?.status === 401) {
      const detail = (error.response.data as { detail?: unknown } | undefined)?.detail;
      if (detail === 'Session expired due to inactivity' || originalRequest._retry) {
        showSessionExpired();
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
          // Shared with any refresh already in flight (see refreshAccessToken).
          const access_token = await refreshAccessToken(refreshToken);

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } else {
          // No refresh token available - logout immediately
          showSessionExpired();
        }
      } catch (refreshError) {
        // Token refresh failed - logout immediately
        showSessionExpired();
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
      } else if (detail.error) {
        message = detail.error;
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
