'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { User, Tenant, Permission, FeatureFlags, UserRole } from '@/lib/types/tenant';
import { authService, clearTokens } from '@/lib/services';
import { handleUnauthorized, dispatchAccessRestrictedEvent, ApiError, getAccessToken, restoreSession as restoreSessionToken } from '@/lib/services/api';
import { getLoginUrl } from '@/lib/services/authService';
import { mockTenant } from '@/lib/mockData/tenantData';
import type { User as ApiUser, FeatureFlags as ApiFeatureFlags } from '@/lib/services/authService';
import { encodeParam, encodePlanId } from '@/lib/utils/planEncoder';
import { forceNavigate } from '@/lib/utils/forcedNavigation';
import { focusRefreshDue, markRefreshed } from '@/lib/utils/focusRefresh';
import { safeReturnUrl } from '@/lib/utils/safeReturnUrl';

// Helper to store/retrieve user from localStorage
const USER_STORAGE_KEY = 'talentflow_user';
const TENANT_STORAGE_KEY = 'talentflow_tenant';
const LAST_LOGIN_KEY = 'talentflow_last_login';

const saveUserToStorage = (user: User) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }
};

const getUserFromStorage = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const clearUserFromStorage = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
};

const saveTenantToStorage = (tenant: Tenant) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(tenant));
  }
};

const getTenantFromStorage = (): Tenant | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(TENANT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const clearTenantFromStorage = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TENANT_STORAGE_KEY);
  }
};

// Helper to check if token is expired
const isTokenExpired = (): boolean => {
  if (typeof window === 'undefined') return false;

  const token = getAccessToken();
  if (!token) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));

    // Check if token is expired (with 30 second buffer)
    if (payload.exp && (payload.exp * 1000) < Date.now() + 30000) {
      console.log('[AUTH] Token expired or expiring soon');
      return true;
    }
    return false;
  } catch {
    return true;
  }
};

// RBAC Helper functions
const isViewerRole = (role: UserRole): boolean => role === 'viewer';
const isBillingManagerRole = (role: UserRole): boolean => role === 'billing_manager';
const isTenantAdminRole = (role: UserRole): boolean => role === 'tenant_admin';
const isRecruiterRole = (role: UserRole): boolean => role === 'recruiter';

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True once the user's permissions come from the server, not the localStorage cache. */
  permissionsVerified: boolean;
  login: (user: User, tenantName?: string) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  // RBAC01-07: Extended role and permission helpers
  isTenantAdmin: boolean;
  isRecruiter: boolean;
  isViewer: boolean;
  isBillingManager: boolean;
  isReadOnlyRole: boolean;
  hasFeature: (feature: keyof FeatureFlags) => boolean;
  hasPermission: (permission: keyof Permission) => boolean;
  hasPermissionCode: (code: string) => boolean;
  canAccessBilling: boolean;
  canManageUsers: boolean;
  canModifyData: boolean;
  refreshUser: () => Promise<void>;
}

// Exported for components that read the user optionally (no throw outside the provider).
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Map API feature flags to frontend format
function mapApiFeatureFlagsToFeatureFlags(apiFlags?: ApiFeatureFlags): FeatureFlags | undefined {
  if (!apiFlags) return undefined;
  return {
    resume_upload: apiFlags.resume_upload,
    resume_database_access: apiFlags.resume_database_access,
    resume_scoring: apiFlags.resume_scoring,
    assessment: apiFlags.assessment,
    ai_interview: apiFlags.ai_interview,
    api_access: apiFlags.api_access,
    reporting: apiFlags.reporting,
    jd_create: apiFlags.jd_create,
    jd_manage: apiFlags.jd_manage,
    ai_talent_match: apiFlags.ai_talent_match,
    bulk_operations: apiFlags.bulk_operations,
    export_data: apiFlags.export_data,
  };
}

// Map API user response (snake_case) to frontend User type (camelCase)
// IMPORTANT: Permissions come DIRECTLY from backend API
// - tenant_admin: Backend should return ALL permissions as true (bypass)
// - All other roles: Backend returns ONLY explicitly assigned permissions
// Frontend does NOT add role defaults - it uses EXACTLY what backend sends
export function mapApiUserToUser(apiUser: ApiUser): User {
  return {
    id: apiUser.id,
    // Human-readable id ("US-008"). Display only — nothing is gated on it, so
    // carrying it across cannot change behaviour, unlike `is_tenant_admin`
    // below, which is deliberately left unmapped for exactly that reason.
    userDisplayId: apiUser.user_display_id,
    email: apiUser.email,
    name: apiUser.name,
    role: apiUser.role as UserRole,
    roleDisplay: apiUser.role_display,
    tenantId: apiUser.tenant_id,
    // These permissions come DIRECTLY from the backend API response
    // No role-based defaults are applied here
    permissions: {
      // Job Descriptions - Granular CRUD
      canReadJD: apiUser.permissions.can_view_jd, // Backend maps jd:read → can_view_jd
      canCreateJD: apiUser.permissions.can_create_jd,
      canUpdateJD: apiUser.permissions.can_update_jd,
      canDeleteJD: apiUser.permissions.can_delete_jd,
      canArchiveJD: apiUser.permissions.can_archive_jd,
      canDisableJD: apiUser.permissions.can_disable_jd,
      canManageJD: apiUser.permissions.can_manage_jd,
      // Resumes - Granular CRUD
      canViewResumes: apiUser.permissions.can_view_resumes,
      canUploadResumes: apiUser.permissions.can_upload_resumes,
      canUpdateResumes: apiUser.permissions.can_update_resumes,
      canDeleteResumes: apiUser.permissions.can_delete_resumes,
      // Resume Database - Granular CRUD
      canAccessInternalDB: apiUser.permissions.can_access_internal_db,
      canViewInternalDB: apiUser.permissions.can_view_internal_db,
      canCreateInternalDB: apiUser.permissions.can_create_internal_db,
      canUpdateInternalDB: apiUser.permissions.can_update_internal_db,
      canDeleteInternalDB: apiUser.permissions.can_delete_internal_db,
      // Assessments - Granular CRUD
      canViewAssessments: apiUser.permissions.can_view_assessments,
      canCreateAssessments: apiUser.permissions.can_create_assessments,
      canUpdateAssessments: apiUser.permissions.can_update_assessments,
      canDeleteAssessments: apiUser.permissions.can_delete_assessments,
      canDownloadAssessmentPDF: apiUser.permissions.can_download_assessment_pdf,
      canViewHRQuestionBank: apiUser.permissions.can_view_hr_question_bank,
      canCreateHRQuestionBank: apiUser.permissions.can_create_hr_question_bank,
      canUpdateHRQuestionBank: apiUser.permissions.can_update_hr_question_bank,
      canDeleteHRQuestionBank: apiUser.permissions.can_delete_hr_question_bank,
      // Analytics & Reports
      // Accept either the legacy bundle column OR the granular column —
      // granting analytics:read writes only the granular column, and the
      // sidebar/route-guard reads canViewAnalytics; without this fallback the
      // user can't see Analytics despite having the permission.
      canViewAnalytics: apiUser.permissions.can_view_analytics || (apiUser.permissions as any).can_view_analytics_granular,
      // Settings & Admin — same legacy/granular fallback pattern
      canManageSettings: apiUser.permissions.can_manage_settings || (apiUser.permissions as any).can_view_settings || (apiUser.permissions as any).can_update_settings,
      canManageUsers: apiUser.permissions.can_manage_users || (apiUser.permissions as any).can_view_users,
      // Granular Users permissions — the Users table's per-row action icons
      // (Edit/Reset Password/Force Password Change/Disable toggle) each read
      // one of these individually; without them here they silently stayed
      // hidden for every non-tenant-admin user regardless of what was granted.
      canViewUsers: (apiUser.permissions as any).can_view_users,
      canCreateUsers: (apiUser.permissions as any).can_create_users,
      canUpdateUsers: (apiUser.permissions as any).can_update_users,
      canDeleteUsers: (apiUser.permissions as any).can_delete_users,
      canDisableUsers: (apiUser.permissions as any).can_disable_users,
      canResetUserPassword: (apiUser.permissions as any).can_reset_user_password,
      canForcePasswordChange: (apiUser.permissions as any).can_force_password_change,
      canAssignRoles: (apiUser.permissions as any).can_assign_roles,
      // RBAC03: Billing permissions — granular cascade writes *_granular only;
      // sidebar items "Usage & Quotas" / "Unit Disputes" read canViewUsage,
      // and "View Subscription & Billing" reads canViewBilling.
      canViewBilling: apiUser.permissions.can_view_billing || (apiUser.permissions as any).can_view_billing_granular,
      canViewInvoices: apiUser.permissions.can_view_invoices || (apiUser.permissions as any).can_view_invoices_granular,
      canViewUsage: apiUser.permissions.can_view_usage || (apiUser.permissions as any).can_view_usage_granular,
      // Granular billing section view permissions
      canViewCurrentPlan: apiUser.permissions.can_view_current_plan,
      canViewPaymentMethods: apiUser.permissions.can_view_payment_methods,
      canViewBillingHistory: apiUser.permissions.can_view_billing_history,
      canViewRefundHistory: apiUser.permissions.can_view_refund_history,
      canViewDisputeHistory: apiUser.permissions.can_view_dispute_history,
      // Granular settings section view permissions
      canViewGeneralSettings: apiUser.permissions.can_view_general_settings,
      canViewPermissionsRoles: apiUser.permissions.can_view_permissions_roles,
      canViewRoles: apiUser.permissions.can_view_roles,
      canViewApiManagement: apiUser.permissions.can_view_api_management,
      canViewBranding: apiUser.permissions.can_view_branding,
      canViewSecuritySettings: apiUser.permissions.can_view_security_settings,
      canViewSupport: (apiUser.permissions as any).can_view_support,
      // Granular Action Permissions — Billing
      canUpgradePlan: apiUser.permissions.can_upgrade_plan,
      canExportUsage: apiUser.permissions.can_export_usage,
      canAddPaymentMethod: apiUser.permissions.can_add_payment_method,
      canEditPaymentMethod: apiUser.permissions.can_edit_payment_method,
      canDeletePaymentMethod: apiUser.permissions.can_delete_payment_method,
      // Granular Action Permissions — Settings
      canManagePermissionsRoles: apiUser.permissions.can_manage_permissions_roles,
      canManageApiManagement: apiUser.permissions.can_manage_api_management,
      canManageBranding: apiUser.permissions.can_manage_branding,
      canManageSecuritySettings: apiUser.permissions.can_manage_security_settings,
      // Teams
      canViewTeams: apiUser.permissions.can_view_teams,
      canCreateTeams: apiUser.permissions.can_create_teams,
      canUpdateTeams: apiUser.permissions.can_update_teams,
      canDeleteTeams: apiUser.permissions.can_delete_teams,
      canViewTeamUsage: apiUser.permissions.can_view_team_usage,
      // RBAC06: Feature permissions
      canViewScoring: apiUser.permissions.can_view_scoring,
      canRunScoring: apiUser.permissions.can_run_scoring,
      canViewAIInterviews: apiUser.permissions.can_view_ai_interviews,
      canCreateAIInterviews: apiUser.permissions.can_create_ai_interviews,
      canUpdateAIInterviews: apiUser.permissions.can_update_ai_interviews,
      canShareAIInterviews: apiUser.permissions.can_share_ai_interviews,
      canInviteAIInterviews: apiUser.permissions.can_invite_ai_interviews,
      canPublishAIInterviews: apiUser.permissions.can_publish_ai_interviews,
      canArchiveAIInterviews: apiUser.permissions.can_archive_ai_interviews,
      canDeleteAIInterviews: apiUser.permissions.can_delete_ai_interviews,
      canRunAiInterviews: apiUser.permissions.can_run_ai_interviews,
      canViewAiMatch: apiUser.permissions.can_view_ai_match,
      canRunAiMatch: apiUser.permissions.can_run_ai_match,
      canBulkOperations: apiUser.permissions.can_bulk_operations,
      canExport: apiUser.permissions.can_export,
      canApiAccess: apiUser.permissions.can_api_access,
    },
    permissionCodes: apiUser.permission_codes || [],
    phone: apiUser.phone,
    avatarUrl: apiUser.avatar_url,
    isActive: apiUser.is_active,
    lastLogin: apiUser.last_login,
    createdAt: apiUser.created_at,
    // RBAC06: Feature flags
    featureFlags: mapApiFeatureFlagsToFeatureFlags(apiUser.feature_flags),
    enabledFeatures: apiUser.enabled_features,
    // Tenant info
    tenantName: apiUser.tenant_name,
    // Tenant status info (for suspension/expiry display)
    tenantStatus: apiUser.tenant_status,
    suspensionReason: apiUser.suspension_reason,
    suspensionNotes: apiUser.suspension_notes,
    suspendedAt: apiUser.suspended_at,
    tenantSubdomain: apiUser.tenant_subdomain,
    tenantAdminEmail: apiUser.tenant_admin_email,
  };
}

// Backend-driven active check. If /auth/me reports the account is no longer
// active, fire the global Access Restricted modal and return false so callers
// bail out before applying the (now invalid) user to app state. This is the
// proactive path (WebSocket permission push, tab-visibility refresh, session
// restore); the axios interceptor covers the reactive path (rejected requests).
function isAccountActive(apiUser: ApiUser): boolean {
  if (apiUser && apiUser.is_active === false) {
    dispatchAccessRestrictedEvent({ name: apiUser.name, email: apiUser.email });
    return false;
  }
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // False while the user restored from localStorage still carries cached
  // (possibly stale) permissions; true once /auth/me has answered or a fresh
  // login supplied them. See the restoreSession effect below.
  const [permissionsVerified, setPermissionsVerified] = useState(false);

  const isAuthenticated = !!user;

  /* ---- Backfill the human-readable user id ("US-008") ------------------------
     `mapApiUserToUser` copies it straight off `/auth/me` whenever that endpoint
     returns `user_display_id`, and then this does nothing at all.

     It exists because that field was only ever guaranteed on the USER-MANAGEMENT
     records — it is what the Users list and the Audit Trail render — and the
     auth payload is not certain to carry it. Rather than leave the signed-in
     user as the one person in the product who cannot see their own id, fetch
     the record by id and take it from there.

     Runs at most once per signed-in user: the ref records who has been asked
     for, so a re-render, a `refreshUser()`, or a token refresh cannot fire it
     again. It fails silently — `/users/{id}` may be closed to non-admins, and a
     missing badge is not worth a console error or a toast on every load. */
  const displayIdFetchedForRef = useRef<string | null>(null);
  useEffect(() => {
    // Wait for /auth/me (restoreSession) to answer first: it normally carries
    // user_display_id, so a cached user missing it no longer costs an extra
    // /users/{id} on every hard load.
    if (!permissionsVerified) return;
    if (!user?.id || user.userDisplayId) return;
    if (displayIdFetchedForRef.current === user.id) return;
    displayIdFetchedForRef.current = user.id;
    /* Some accounts (e.g. the tenant owner) have no display id at all, so the
       ref above only spared re-renders — every hard load asked again. A "none"
       answer is remembered for the tab session. */
    const missKey = `displayIdMiss:${user.id}`;
    try { if (sessionStorage.getItem(missKey)) return; } catch { /* storage unavailable */ }

    let cancelled = false;
    (async () => {
      try {
        const { userService } = await import('@/lib/services/userService');
        const record = await userService.getUser(user.id, { silent: true });
        if (!record?.user_display_id) {
          try { sessionStorage.setItem(missKey, '1'); } catch { /* storage unavailable */ }
        }
        if (cancelled || !record?.user_display_id) return;
        /* Patched onto whatever the user object is by the time this lands, not
           onto the one captured when the fetch started — `refreshUser` may have
           replaced it in between, and rewriting the stale copy would undo it. */
        setUser(prev => (prev && prev.id === user.id
          ? { ...prev, userDisplayId: record.user_display_id }
          : prev));
      } catch {
        /* No id badge. Nothing else depends on it. */
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, user?.userDisplayId, permissionsVerified]);

  // RBAC01-07: Role-based helpers
  const isTenantAdmin = user ? isTenantAdminRole(user.role) : false;
  const isRecruiter = user ? isRecruiterRole(user.role) : false;
  const isViewer = user ? isViewerRole(user.role) : false;
  const isBillingManager = user ? isBillingManagerRole(user.role) : false;

  // RBAC05: Viewer is read-only
  const isReadOnlyRole = isViewer;

  // RBAC03: Billing access (tenant_admin or billing_manager)
  const canAccessBilling = isTenantAdmin || isBillingManager;

  // User management (tenant_admin only)
  const canManageUsers = user?.permissions?.canManageUsers ?? false;

  // Can modify data (not viewer, not suspended tenant)
  const canModifyData = !isReadOnlyRole && isAuthenticated;

  // RBAC06: Check if user has a specific feature enabled
  const hasFeature = useCallback((feature: keyof FeatureFlags): boolean => {
    if (!user) return false;
    // Tenant admin has all features
    if (isTenantAdminRole(user.role)) return true;
    // Viewer has no feature expansion
    if (isViewerRole(user.role)) return false;
    // Check feature flags
    if (user.featureFlags) {
      return user.featureFlags[feature] ?? false;
    }
    // Check enabled features list
    if (user.enabledFeatures) {
      return user.enabledFeatures.includes(feature);
    }
    return false;
  }, [user]);

  // Check if user has a specific permission
  const hasPermission = useCallback((permission: keyof Permission): boolean => {
    if (!user || !user.permissions) return false;
    // tenant_admin bypasses all permission checks — no restrictions
    if (isTenantAdminRole(user.role)) return true;
    return user.permissions[permission] ?? false;
  }, [user]);

  // Check if user has a specific raw permission code (e.g. 'my_resumes:ai_match')
  const hasPermissionCode = useCallback((code: string): boolean => {
    if (!user) return false;
    if (isTenantAdminRole(user.role)) return true;
    return (user.permissionCodes ?? []).includes(code);
  }, [user]);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {

      // HARD REFRESH: force fresh permissions WITHOUT dropping the cached user.
      //
      // We intentionally do NOT clearUserFromStorage() here. Clearing it made the
      // block below skip its synchronous fast-path (which restores the cached user
      // and flips isLoading=false immediately) and instead fall to the slow path
      // that awaits /auth/me — so isLoading stayed true for the whole round-trip and
      // the layout's auth-loading skeleton was shown in full before the page's own
      // skeleton, i.e. TWO skeletons on every refresh.
      //
      // Freshness is already guaranteed: the fast path below re-validates against
      // /auth/me in the background and setUser()s the latest permissions (~300ms),
      // so the only thing clearing bought us was the double skeleton. We still drop
      // permission_version so the interceptor treats the next response as a fresh
      // baseline.
      if (typeof window !== 'undefined' && typeof performance !== 'undefined') {
        const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const isHardRefresh = perfData && perfData.type === 'reload';

        if (isHardRefresh) {
          localStorage.removeItem('permission_version');
        }
      }

      // The access token lives in memory only (sheet #5): get one for this page
      // from the httpOnly session cookie before anything calls the API. A
      // session that was revoked or expired comes back false and clears the
      // "signed in" flag, so the checks below treat the user as signed out.
      await restoreSessionToken();

      // First, try to restore from localStorage (fast path)
      const storedUser = getUserFromStorage();
      const storedTenant = getTenantFromStorage();
      // Fast flag check — no API call needed.
      // Set by Login.tsx when must_reset_password=true; cleared by SetPassword.tsx after success.
      if (
        typeof window !== 'undefined' &&
        localStorage.getItem('pending_password_reset') === 'true' &&
        !window.location.pathname.startsWith('/set-password')
      ) {
        console.log('[AUTH] pending_password_reset flag set — redirecting to /set-password');
        // Keep isLoading=true so the skeleton shows during redirect instead of a blank flash.
        window.location.href = '/set-password';
        return;
      }

      if (storedUser && authService.isAuthenticated()) {
        // Check if token is expired before restoring session
        if (isTokenExpired()) {
          console.log('[AUTH] Token expired, clearing session');
          clearTokens();
          clearUserFromStorage();
          clearTenantFromStorage();
          setIsLoading(false);
          return;
        }

        // Permission version is now tracked via response headers (x-permission-version)
        // and handled by the axios interceptor in api.ts - no polling needed
        // ❌ REMOVED: Permission version polling (was calling deleted /permission-version endpoint)
        // Permission updates now use event-driven approach via refreshUser() which dispatches 'permissions-updated' event
        // On hard refresh, user data is loaded from localStorage - permission updates happen via backend save + refreshUser()

        setUser(storedUser);
        // Use stored tenant if available, otherwise build a minimal tenant from stored user
        setTenant(storedTenant || {
          ...mockTenant,
          id: storedUser.tenantId,
          name: storedUser.tenantName || 'My Organization',
        });
        setIsLoading(false);

        // Validate with API in background and refresh tenant name
        try {
          markRefreshed('auth-me');
          const apiUserData = await authService.getCurrentUser();

          // Account deactivated while this session was cached → block via modal.
          if (!isAccountActive(apiUserData)) return;

          // Catch existing sessions that have must_reset_password=true in DB but no local flag.
          // (e.g. user was invited before this flag was introduced, or flag was cleared by browser)
          if (apiUserData.must_reset_password && typeof window !== 'undefined' && !window.location.pathname.startsWith('/set-password')) {
            console.log('[AUTH] must_reset_password=true from API — redirecting to /set-password');
            localStorage.setItem('pending_password_reset', 'true');
            // Reset auth state so the dashboard doesn't remain visible while navigating away.
            setUser(null);
            setIsLoading(true);
            window.location.href = '/set-password';
            return;
          }

          // If tenant has pending payment, redirect to payment page (same logic as Login.tsx)
          if (apiUserData.pending_payment && apiUserData.pending_payment_redirect) {
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/complete-payment')) {
              console.log('[AUTH] Tenant has pending payment, redirecting from session restore');
              try {
                const url = new URL(apiUserData.pending_payment_redirect, window.location.origin);
                const rawTenantId = url.searchParams.get('tenant_id');
                const rawPlanId = url.searchParams.get('plan_id');
                if (rawTenantId && rawPlanId) {
                  window.location.href = `/complete-payment?t=${encodeURIComponent(encodeParam(rawTenantId))}&p=${encodeURIComponent(encodePlanId(rawPlanId))}`;
                  return;
                }
              } catch {
                // Backend-supplied: same-site paths only (security sheet N4).
                window.location.href = safeReturnUrl(apiUserData.pending_payment_redirect, '/complete-payment');
                return;
              }
            }
            return;
          }

          const userData = mapApiUserToUser(apiUserData);
          // Preserve lastLogin and createdAt from cached user if API doesn't return them
          if (!userData.lastLogin && storedUser.lastLogin) {
            userData.lastLogin = storedUser.lastLogin;
          }
          if (!userData.createdAt && storedUser.createdAt) {
            userData.createdAt = storedUser.createdAt;
          }
          setUser(userData);
          saveUserToStorage(userData);
          // Update tenant name from API response (fixes stale name after hard refresh)
          if (userData.tenantName) {
            setTenant(prev => {
              const updated = prev ? { ...prev, name: userData.tenantName! } : { ...mockTenant, id: userData.tenantId, name: userData.tenantName! };
              saveTenantToStorage(updated);
              return updated;
            });
          }
          // Mirror tenantSubdomain to talentflow_subdomain so getLoginUrl() has it
          // even if talentflow_user is cleared before getLoginUrl() is called
          if (userData.tenantSubdomain && typeof window !== 'undefined') {
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (isLocalhost) localStorage.setItem('talentflow_subdomain', userData.tenantSubdomain);
          }
        } catch (error: unknown) {
          // Check if this is a subscription inactive error (403)
          // handleApiError throws ApiError with .status property, not AxiosError with .response
          const apiError = error as { status?: number; message?: string };
          const isSubscriptionInactive = apiError?.status === 403 &&
            (apiError?.message?.includes('inactive') || apiError?.message?.includes('SUBSCRIPTION'));

          if (isSubscriptionInactive) {
            // Check if user is on subscription page - they need to stay logged in to renew
            const isOnSubscriptionPage = typeof window !== 'undefined' &&
              window.location.pathname.includes('/subscription/current-plan');

            if (isOnSubscriptionPage) {
              console.warn('[AUTH] Subscription inactive but on subscription page, keeping session for renewal');
              return;
            }

            console.warn('[AUTH] Subscription inactive, keeping session for modal handling');
            // Don't clear tokens - let the SUBSCRIPTION_INACTIVE event modal handle it
            // The axios interceptor already dispatched the event
            return;
          }
          console.warn('[AUTH] API validation failed, using cached user:', error);
          // Keep using cached user - don't clear tokens for temporary API issues
        }
        return;
      }

      // Fallback: Try to fetch from API
      if (authService.isAuthenticated()) {
        try {
          console.log('[AUTH] Fetching current user from API...');
          markRefreshed('auth-me');
          const apiUserData = await authService.getCurrentUser();
          console.log('[AUTH] Got user data:', apiUserData);

          // Account deactivated → block via modal instead of restoring the session.
          if (!isAccountActive(apiUserData)) {
            setIsLoading(false);
            return;
          }

          // must_reset_password guard — catches users with no cached data (first-ever session restore)
          if (apiUserData.must_reset_password && typeof window !== 'undefined' && !window.location.pathname.startsWith('/set-password')) {
            console.log('[AUTH] must_reset_password=true — redirecting to /set-password');
            localStorage.setItem('pending_password_reset', 'true');
            // isLoading is still true here — keep it that way so skeleton shows during redirect.
            window.location.href = '/set-password';
            return;
          }

          // If tenant has pending payment, redirect to payment page (same logic as Login.tsx)
          if (apiUserData.pending_payment && apiUserData.pending_payment_redirect) {
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/complete-payment')) {
              console.log('[AUTH] Tenant has pending payment, redirecting from session restore');
              try {
                const url = new URL(apiUserData.pending_payment_redirect, window.location.origin);
                const rawTenantId = url.searchParams.get('tenant_id');
                const rawPlanId = url.searchParams.get('plan_id');
                if (rawTenantId && rawPlanId) {
                  window.location.href = `/complete-payment?t=${encodeURIComponent(encodeParam(rawTenantId))}&p=${encodeURIComponent(encodePlanId(rawPlanId))}`;
                  setIsLoading(false);
                  return;
                }
              } catch {
                // Backend-supplied: same-site paths only (security sheet N4).
                window.location.href = safeReturnUrl(apiUserData.pending_payment_redirect, '/complete-payment');
                setIsLoading(false);
                return;
              }
            }
            setIsLoading(false);
            return;
          }

          const userData = mapApiUserToUser(apiUserData);
          setUser(userData);
          const freshTenant = {
            ...mockTenant,
            id: userData.tenantId,
            name: userData.tenantName || 'My Organization',
          };
          setTenant(freshTenant);
          saveTenantToStorage(freshTenant);
          saveUserToStorage(userData);
          console.log('[AUTH] Session restored with fresh permissions from API');
        } catch (error: unknown) {
          console.error('[AUTH] Session restore failed:', error);
          // Only clear tokens for actual auth failures (401), not temporary errors
          const apiError = error as { status?: number };
          if (apiError?.status === 401) {
            console.log('[AUTH] Token invalid (401), showing session-expired modal');
            // Don't clear tokens here — performSessionLogout() (called when the
            // user clicks OK on the modal) will do the cleanup and redirect.
            // Clearing here would let the dashboard layout's not-authenticated
            // effect race the modal and redirect to /login first.
            handleUnauthorized();
          } else {
            console.warn('[AUTH] Keeping tokens - error may be temporary:', apiError?.status);
            // Don't clear tokens for 403, 500, network errors, etc.
            // Let the user stay on the page and let specific error handlers deal with it
          }
        }
      }
      setIsLoading(false);
    };

    // permissionsVerified flips once the session restore is over — i.e. the
    // cached user's permissions have been re-validated against /auth/me (or
    // that attempt failed and the cache is all we'll get). Until then the
    // permissions on screen may be a stale localStorage copy.
    restoreSession().finally(() => setPermissionsVerified(true));
  }, []);

  // ✅ PERMISSION CACHE FIX: Listen for permission updates from API interceptor
  // When permissions are edited in admin panel, the api.ts interceptor detects version change
  // and dispatches 'permissions-updated' event. This listener catches it and refreshes user data.
  useEffect(() => {
    const handlePermissionsUpdated = async () => {
      try {
        // Fetch fresh user data with new permissions
        const apiUserData = await authService.getCurrentUser();

        // Admin deactivated this user → block via modal, don't apply new state.
        if (!isAccountActive(apiUserData)) return;

        // Admin forced a password reset → bounce to /set-password immediately
        // (no manual reload needed). Mirrors the page-load guard.
        if (apiUserData.must_reset_password && typeof window !== 'undefined' && !window.location.pathname.startsWith('/set-password')) {
          console.log('[AUTH] must_reset_password=true on permissions-updated — redirecting to /set-password');
          localStorage.setItem('pending_password_reset', 'true');
          setUser(null);
          setIsLoading(true);
          window.location.href = '/set-password';
          return;
        }

        const userData = mapApiUserToUser(apiUserData);
        // Preserve lastLogin and createdAt from current user if API doesn't return them
        const currentUser = getUserFromStorage();
        if (!userData.lastLogin && currentUser?.lastLogin) {
          userData.lastLogin = currentUser.lastLogin;
        }
        if (!userData.createdAt && currentUser?.createdAt) {
          userData.createdAt = currentUser.createdAt;
        }
        setUser(userData);
        saveUserToStorage(userData);

        // Optionally show toast notification (if you have a toast library)
        // toast.success('Your permissions have been updated.');
      } catch (error) {
        console.error('[AUTH] Failed to refresh user after permission update:', error);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('permissions-updated', handlePermissionsUpdated);
      return () => {
        window.removeEventListener('permissions-updated', handlePermissionsUpdated);
      };
    }
  }, []); // Empty deps - only register once on mount

  // ✅ SMART POLLING: Periodic permission version check with optimizations
  // Checks if permission version changed on server with smart intervals
  // Optimizations:
  // - Only polls when tab is visible
  // - Only polls when user is active (interacted in last 5 minutes)
  // - Uses exponential backoff when idle
  // - Stops polling after 30 minutes of inactivity
  useEffect(() => {
    if (!user) return;

    let pollInterval = 5000; // Start with 5 seconds
    let intervalId: NodeJS.Timeout | null = null;
    let lastActivityTime = Date.now();
    let consecutiveIdleChecks = 0;

    // Update last activity time on user interaction
    const updateActivity = () => {
      lastActivityTime = Date.now();
      consecutiveIdleChecks = 0;
      // Reset to fast polling when user becomes active again
      if (pollInterval > 5000) {
        pollInterval = 5000;
        restartPolling();
      }
    };

    // Track user activity
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', updateActivity);
      window.addEventListener('keydown', updateActivity);
      window.addEventListener('click', updateActivity);
      window.addEventListener('scroll', updateActivity);
    }

    // Activity tracking loop — no API calls, purely local idle detection
    const checkActivity = () => {
      if (typeof document !== 'undefined' && document.hidden) return;

      const inactiveTime = Date.now() - lastActivityTime;
      if (inactiveTime > 30 * 60 * 1000) {
        console.log('[AUTH] Stopping activity tracking - user inactive for 30+ minutes');
        if (intervalId) clearInterval(intervalId);
        return;
      }

      // Use exponential backoff for idle users (inactive > 5 minutes)
      if (inactiveTime > 5 * 60 * 1000) {
        consecutiveIdleChecks++;
        if (consecutiveIdleChecks > 3 && pollInterval < 10000) {
          pollInterval = Math.min(pollInterval * 2, 10000); // Max 10 seconds
          restartPolling();
        }
      }
    };

    const restartPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(checkActivity, pollInterval);
    };

    // Permission updates are pushed instantly via WebSocket (permissions_updated event).
    // See: Header.tsx → useNotificationWebSocket → onPermissionsUpdated → refreshUser()
    // On reconnect after a drop, the WebSocket hook also calls refreshUser() automatically.
    restartPolling();

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', updateActivity);
        window.removeEventListener('keydown', updateActivity);
        window.removeEventListener('click', updateActivity);
        window.removeEventListener('scroll', updateActivity);
      }
    };
  }, [user]); // Re-run if user changes (login/logout)

  const login = useCallback((userData: User, tenantName?: string) => {
    console.log('[AUTH] Login called for tenant:', tenantName);
    // A fresh login hands us server-issued permissions — nothing stale to wait on.
    setPermissionsVerified(true);

    // Track last login time client-side:
    // Read the PREVIOUS login timestamp and set it as lastLogin (so user sees "Last login: X ago")
    // Then save the CURRENT timestamp for the next login
    if (typeof window !== 'undefined') {
      const previousLogin = localStorage.getItem(LAST_LOGIN_KEY);
      if (previousLogin) {
        userData.lastLogin = previousLogin;
      }
      // Save current login time for next session
      localStorage.setItem(LAST_LOGIN_KEY, new Date().toISOString());

      // Store subdomain for later use by getLoginUrl() at logout time.
      // We capture it NOW because: at login the ?org= param is still in the URL,
      // but after navigating to /dashboard the URL no longer carries ?org= and
      // the tf-subdomain cookie gets cleared by middleware.
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        // Prefer ?org= from URL, fall back to tenant_subdomain from the API login response
        const org = new URLSearchParams(window.location.search).get('org') || userData.tenantSubdomain;
        if (org) {
          localStorage.setItem('talentflow_subdomain', org);
          console.log('[AUTH] Stored subdomain for logout redirect:', org);
        }
      }
    }

    // Store tenant name on user for localStorage persistence across refreshes
    if (tenantName) {
      userData.tenantName = tenantName;
    }
    setUser(userData);

    // Create tenant object from login response
    const tenantData: Tenant = {
      ...mockTenant, // Use mock as base for structure
      id: userData.tenantId,
      name: tenantName || 'My Organization',
    };
    setTenant(tenantData);
    saveUserToStorage(userData);
    saveTenantToStorage(tenantData);

    // ✅ PERMISSION CACHE FIX: Clear permission version on login to force fresh check
    if (typeof window !== 'undefined') {
      localStorage.removeItem('permission_version');
      console.log('[AUTH] Permission version cache cleared on login');
    }
  }, []);

  const logout = useCallback(async () => {
    console.log('[AUTH] Logout called');

    // Ensure talentflow_subdomain is always fresh from live React state before getLoginUrl() reads it.
    // This handles stale localStorage sessions where talentflow_subdomain was never stored.
    if (typeof window !== 'undefined') {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const subdomain = user?.tenantSubdomain;
      if (isLocalhost && subdomain) {
        localStorage.setItem('talentflow_subdomain', subdomain);
      }
    }

    // Capture login URL before clearing storage (subdomain lives in tenant storage)
    const loginUrl = getLoginUrl();

    // Call backend logout API so the event is recorded in activity logs
    try {
      await authService.logout();
      console.log('[AUTH] Backend logout successful');
    } catch (error) {
      console.warn('[AUTH] Backend logout failed (continuing with local cleanup):', error);
    }

    setUser(null);
    setTenant(null);
    clearTokens();
    clearUserFromStorage();
    clearTenantFromStorage();

    // ✅ PERMISSION CACHE FIX: Clear permission version on logout
    if (typeof window !== 'undefined') {
      localStorage.removeItem('permission_version');
      localStorage.removeItem('talentflow_subdomain');
      // Note: Keep LAST_LOGIN_KEY so it persists for next login by the same user
      console.log('[AUTH] Permission version cache cleared on logout');
    }

    // Always hard-navigate (full reload) rather than a soft router.push. A soft
    // client-side transition keeps the document alive, and password managers then
    // re-autofill the login inputs without firing React onChange — leaving the
    // controlled email/password state empty and causing the next login to POST an
    // empty email (backend 422). A full reload re-mounts the form cleanly, matching
    // the working first-load behaviour. (On *.BASE_DOMAIN subdomains loginUrl is an
    // absolute https:// URL; on custom/vanity domains it's a relative "/login" —
    // both are handled correctly by window.location.href.) Forced, so a page's
    // unsaved-changes prompt doesn't stand between the user and the sign-out.
    forceNavigate(loginUrl);
  }, [user]);

  const updateUser = useCallback((userData: User) => {
    setUser(userData);
    saveUserToStorage(userData);
  }, []);

  // Refresh user data from API (useful after permission changes)
  const refreshUser = useCallback(async () => {
    if (!authService.isAuthenticated()) return;
    try {
      console.log('[AUTH] refreshUser() called — fetching latest user from API...');
      markRefreshed('auth-me');
      const apiUserData = await authService.getCurrentUser();

      // Admin deactivated this user (e.g. pushed via WebSocket) → block via modal.
      if (!isAccountActive(apiUserData)) return;

      // Enforce admin-initiated forced password reset WITHOUT a manual page reload.
      // force-password-change / reset-password set must_reset_password=true on the
      // server + push a permissions_updated nudge → refreshUser(). Bounce to
      // /set-password here so the user can't keep using their session.
      if (apiUserData.must_reset_password && typeof window !== 'undefined' && !window.location.pathname.startsWith('/set-password')) {
        console.log('[AUTH] must_reset_password=true on refresh — redirecting to /set-password');
        localStorage.setItem('pending_password_reset', 'true');
        setUser(null);
        setIsLoading(true);
        window.location.href = '/set-password';
        return;
      }

      const userData = mapApiUserToUser(apiUserData);
      // Preserve lastLogin and createdAt from current user if API doesn't return them
      const currentUser = getUserFromStorage();
      if (!userData.lastLogin && currentUser?.lastLogin) {
        userData.lastLogin = currentUser.lastLogin;
      }
      if (!userData.createdAt && currentUser?.createdAt) {
        userData.createdAt = currentUser.createdAt;
      }
      setUser(userData);
      saveUserToStorage(userData);
      console.log('[AUTH] User data refreshed');
      // NOTE: Do NOT dispatch 'permissions-updated' here — that event is reserved for the
      // API interceptor (version-mismatch detection). Dispatching it here creates a feedback
      // loop: handlePermissionsUpdated catches it, makes a second API call, and calls setUser()
      // again, causing a double Header re-render that can update wsToken and trigger an
      // unnecessary WebSocket reconnect.
      // The Sidebar and other components re-render naturally because setUser() above changes
      // the AuthContext user, which propagates through props automatically.
    } catch (error) {
      // No HTTP status = the request never got a response (offline, laptop just woke,
      // Wi-Fi switching, staging API restarting). refreshUser() fires on tab-visible
      // and WS reconnect — exactly those moments — and the cached user is still valid,
      // so this is a skipped refresh, not a failure. console.error would raise the
      // Next.js dev overlay for it; warn instead and let the next trigger retry.
      if (error instanceof ApiError && error.status === undefined) {
        console.warn('[AUTH] refreshUser skipped — API unreachable:', error.message);
        return;
      }
      console.error('[AUTH] Failed to refresh user:', error);
    }
  }, []);

  // Refresh permissions when tab becomes visible again (e.g. admin changed role in another tab)
  useEffect(() => {
    if (!user) return;
    // At most once a minute: permission changes are pushed over the WebSocket
    // (onPermissionsUpdated → refreshUser) and the API interceptor catches a
    // version bump, so this only backs up a missed push.
    const handleVisibilityChange = () => {
      if (!document.hidden && focusRefreshDue('auth-me')) refreshUser();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, refreshUser]);

  // Memoized so useAuth consumers re-render only when a value below changes,
  // not on every AuthProvider render. Every function listed is a useCallback.
  const contextValue = useMemo<AuthContextType>(() => ({
    user,
    tenant,
    isAuthenticated,
    isLoading,
    permissionsVerified,
    login,
    logout,
    updateUser,
    // RBAC01-07: Extended role and permission helpers
    isTenantAdmin,
    isRecruiter,
    isViewer,
    isBillingManager,
    isReadOnlyRole,
    hasFeature,
    hasPermission,
    hasPermissionCode,
    canAccessBilling,
    canManageUsers,
    canModifyData,
    refreshUser,
  }), [
    user,
    tenant,
    isAuthenticated,
    isLoading,
    permissionsVerified,
    login,
    logout,
    updateUser,
    isTenantAdmin,
    isRecruiter,
    isViewer,
    isBillingManager,
    isReadOnlyRole,
    hasFeature,
    hasPermission,
    hasPermissionCode,
    canAccessBilling,
    canManageUsers,
    canModifyData,
    refreshUser,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
