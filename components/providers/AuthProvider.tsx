'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, Tenant, Permission, FeatureFlags, UserRole } from '@/lib/types/tenant';
import { authService, clearTokens } from '@/lib/services';
import { mockTenant } from '@/lib/mockData/tenantData';
import { useRouter } from 'next/navigation';
import type { User as ApiUser, FeatureFlags as ApiFeatureFlags } from '@/lib/services/authService';
import { ensureTokenCookies } from '@/lib/utils/tokenRecovery';

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

  const token = localStorage.getItem('accessToken');
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
const isStandardUserRole = (role: UserRole): boolean => role === 'standard_user';
const isTenantAdminRole = (role: UserRole): boolean => role === 'tenant_admin';
const isRecruiterRole = (role: UserRole): boolean => role === 'recruiter';

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User, tenantName?: string) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  // RBAC01-07: Extended role and permission helpers
  isTenantAdmin: boolean;
  isRecruiter: boolean;
  isViewer: boolean;
  isBillingManager: boolean;
  isStandardUser: boolean;
  isReadOnlyRole: boolean;
  hasFeature: (feature: keyof FeatureFlags) => boolean;
  hasPermission: (permission: keyof Permission) => boolean;
  canAccessBilling: boolean;
  canManageUsers: boolean;
  canModifyData: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
function mapApiUserToUser(apiUser: ApiUser): User {
  return {
    id: apiUser.id,
    email: apiUser.email,
    name: apiUser.name,
    role: apiUser.role as UserRole,
    tenantId: apiUser.tenant_id,
    // These permissions come DIRECTLY from the backend API response
    // No role-based defaults are applied here
    permissions: {
      // Job Descriptions - Granular CRUD
      canReadJD: apiUser.permissions.can_view_jd, // Backend maps jd:read → can_view_jd
      canCreateJD: apiUser.permissions.can_create_jd,
      canUpdateJD: apiUser.permissions.can_update_jd,
      canDeleteJD: apiUser.permissions.can_delete_jd,
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
      // Analytics & Reports
      canViewAnalytics: apiUser.permissions.can_view_analytics,
      // Settings & Admin
      canManageSettings: apiUser.permissions.can_manage_settings,
      canManageUsers: apiUser.permissions.can_manage_users,
      // RBAC03: Billing permissions
      canViewBilling: apiUser.permissions.can_view_billing,
      canViewInvoices: apiUser.permissions.can_view_invoices,
      canViewUsage: apiUser.permissions.can_view_usage,
      // RBAC06: Feature permissions
      canViewScoring: apiUser.permissions.can_view_scoring,
      canRunScoring: apiUser.permissions.can_run_scoring,
      canRunAiInterviews: apiUser.permissions.can_run_ai_interviews,
      canViewAiMatch: apiUser.permissions.can_view_ai_match,
      canRunAiMatch: apiUser.permissions.can_run_ai_match,
      canBulkOperations: apiUser.permissions.can_bulk_operations,
      canExport: apiUser.permissions.can_export,
      canApiAccess: apiUser.permissions.can_api_access,
    },
    phone: apiUser.phone,
    avatarUrl: apiUser.avatar_url,
    isActive: apiUser.is_active,
    lastLogin: apiUser.last_login,
    createdAt: apiUser.created_at,
    // RBAC06: Feature flags
    featureFlags: mapApiFeatureFlagsToFeatureFlags(apiUser.feature_flags),
    enabledFeatures: apiUser.enabled_features,
    // Tenant status info (for suspension/expiry display)
    tenantStatus: apiUser.tenant_status,
    suspensionReason: apiUser.suspension_reason,
    suspensionNotes: apiUser.suspension_notes,
    suspendedAt: apiUser.suspended_at,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = !!user;

  // RBAC01-07: Role-based helpers
  const isTenantAdmin = user ? isTenantAdminRole(user.role) : false;
  const isRecruiter = user ? isRecruiterRole(user.role) : false;
  const isViewer = user ? isViewerRole(user.role) : false;
  const isBillingManager = user ? isBillingManagerRole(user.role) : false;
  const isStandardUser = user ? isStandardUserRole(user.role) : false;

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
    return user.permissions[permission] ?? false;
  }, [user]);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      console.log('[AUTH] Restoring session...');
      console.log('[AUTH] Has token:', authService.isAuthenticated());

      // ✅ HARD REFRESH DETECTION: Clear user cache on hard refresh
      // This ensures permissions are always fresh from API after Ctrl+Shift+R
      if (typeof window !== 'undefined' && typeof performance !== 'undefined') {
        const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const isHardRefresh = perfData && perfData.type === 'reload';

        if (isHardRefresh) {
          console.log('[AUTH] 🔄 Hard refresh detected - clearing user cache');
          clearUserFromStorage();
          localStorage.removeItem('permission_version');
        }
      }

      // Ensure cookies are synced with localStorage (cross-browser token recovery)
      // This fixes token loss in Firefox, Safari, iOS Safari, Arc, Brave, etc.
      const recovered = ensureTokenCookies();
      if (recovered) {
        console.log('[AUTH] Tokens recovered from localStorage to cookies');
      }

      // First, try to restore from localStorage (fast path)
      const storedUser = getUserFromStorage();
      const storedTenant = getTenantFromStorage();
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

        // ❌ REMOVED: Permission version polling (was calling deleted /permission-version endpoint)
        // Permission updates now use event-driven approach via refreshUser() which dispatches 'permissions-updated' event
        // On hard refresh, user data is loaded from localStorage - permission updates happen via backend save + refreshUser()

        console.log('[AUTH] Restored user from localStorage:', storedUser.email);
        setUser(storedUser);
        // Use stored tenant if available, otherwise use mock as fallback
        setTenant(storedTenant || mockTenant);
        setIsLoading(false);

        // Optionally validate with API in background (don't block UI)
        try {
          const apiUserData = await authService.getCurrentUser();
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
          console.log('[AUTH] User validated with API');
        } catch (error: unknown) {
          // Check if this is a subscription inactive error (403)
          // The modal event is already dispatched by axios interceptor
          const axiosError = error as { response?: { status?: number; data?: { detail?: { error_code?: string } } } };
          if (axiosError?.response?.status === 403 &&
              axiosError?.response?.data?.detail?.error_code === 'SUBSCRIPTION_INACTIVE') {
            // Check if user is on subscription page - they need to stay logged in to renew
            const isOnSubscriptionPage = typeof window !== 'undefined' &&
              window.location.pathname.includes('/subscription/current-plan');

            if (isOnSubscriptionPage) {
              console.warn('[AUTH] Subscription inactive but on subscription page, keeping session for renewal');
              // Keep the user logged in so they can renew
              return;
            }

            console.warn('[AUTH] Subscription inactive, clearing session');
            clearTokens();
            clearUserFromStorage();
            clearTenantFromStorage();
            setUser(null);
            setTenant(null);
            // Don't redirect - let the modal handle it
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
          const apiUserData = await authService.getCurrentUser();
          console.log('[AUTH] Got user data:', apiUserData);
          console.log('[AUTH] API Permissions:', apiUserData.permissions);
          console.log('[AUTH] 🔍 API has can_view_scoring:', apiUserData.permissions.can_view_scoring);
          console.log('[AUTH] 🔍 API has can_view_ai_match:', apiUserData.permissions.can_view_ai_match);
          const userData = mapApiUserToUser(apiUserData);
          console.log('[AUTH] Mapped Permissions:', userData.permissions);
          console.log('[AUTH] 🔍 Mapped has canViewScoring:', userData.permissions.canViewScoring);
          console.log('[AUTH] 🔍 Mapped has canViewAiMatch:', userData.permissions.canViewAiMatch);
          setUser(userData);
          setTenant(mockTenant);
          saveUserToStorage(userData);
          console.log('[AUTH] ✅ Session restored with fresh permissions from API');
        } catch (error) {
          console.error('[AUTH] Session restore failed:', error);
          clearTokens();
          clearUserFromStorage();
          clearTenantFromStorage();
        }
      } else {
        console.log('[AUTH] No token found, skipping session restore');
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  // ✅ PERMISSION CACHE FIX: Listen for permission updates from API interceptor
  // When permissions are edited in admin panel, the api.ts interceptor detects version change
  // and dispatches 'permissions-updated' event. This listener catches it and refreshes user data.
  useEffect(() => {
    const handlePermissionsUpdated = async () => {
      console.log('[AUTH] Permissions updated event received - refreshing user data');
      try {
        // Fetch fresh user data with new permissions
        const apiUserData = await authService.getCurrentUser();
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
        console.log('[AUTH] User data refreshed with new permissions:', userData.permissions);

        // Optionally show toast notification (if you have a toast library)
        // toast.success('Your permissions have been updated.');
      } catch (error) {
        console.error('[AUTH] Failed to refresh user after permission update:', error);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('permissions-updated', handlePermissionsUpdated);
      console.log('[AUTH] Permission update listener registered');
      return () => {
        window.removeEventListener('permissions-updated', handlePermissionsUpdated);
        console.log('[AUTH] Permission update listener cleaned up');
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

    const checkPermissions = async () => {
      // Skip if tab is not visible
      if (typeof document !== 'undefined' && document.hidden) {
        console.debug('[AUTH] Skipping poll - tab not visible');
        return;
      }

      // Check if user has been inactive for > 30 minutes
      const inactiveTime = Date.now() - lastActivityTime;
      if (inactiveTime > 30 * 60 * 1000) {
        console.log('[AUTH] Stopping polling - user inactive for 30+ minutes');
        if (intervalId) clearInterval(intervalId);
        return;
      }

      // Use exponential backoff for idle users (inactive > 5 minutes)
      if (inactiveTime > 5 * 60 * 1000) {
        consecutiveIdleChecks++;
        if (consecutiveIdleChecks > 3 && pollInterval < 10000) {
          pollInterval = Math.min(pollInterval * 2, 10000); // Max 10 seconds
          console.log(`[AUTH] User idle, increasing poll interval to ${pollInterval/1000}s`);
          restartPolling();
        }
      }

      // Permission updates are now handled instantly via WebSocket push (permissions_updated event).
      // This polling loop is kept only for activity tracking / idle detection.
      // See: useNotificationWebSocket → onPermissionsUpdated → refreshUser()
    };

    const restartPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(checkPermissions, pollInterval);
    };

    // Start polling
    restartPolling();
    console.log(`[AUTH] 🔄 Smart polling started (${pollInterval/1000}s interval)`);

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', updateActivity);
        window.removeEventListener('keydown', updateActivity);
        window.removeEventListener('click', updateActivity);
        window.removeEventListener('scroll', updateActivity);
      }
      console.log('[AUTH] Smart polling stopped');
    };
  }, [user]); // Re-run if user changes (login/logout)

  const login = (userData: User, tenantName?: string) => {
    console.log('[AUTH] Login called for:', userData.email, 'tenant:', tenantName);

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
    }

    setUser(userData);

    // Create tenant object from login response
    const tenantData: Tenant = {
      ...mockTenant, // Use mock as base for structure
      id: userData.tenantId,
      name: tenantName || mockTenant.name,
    };
    setTenant(tenantData);
    saveUserToStorage(userData);
    saveTenantToStorage(tenantData);

    // ✅ PERMISSION CACHE FIX: Clear permission version on login to force fresh check
    if (typeof window !== 'undefined') {
      localStorage.removeItem('permission_version');
      console.log('[AUTH] Permission version cache cleared on login');
    }
  };

  const logout = async () => {
    console.log('[AUTH] Logout called');

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
      // Note: Keep LAST_LOGIN_KEY so it persists for next login by the same user
      console.log('[AUTH] Permission version cache cleared on logout');
    }

    router.push('/login');
  };

  const updateUser = (userData: User) => {
    setUser(userData);
    saveUserToStorage(userData);
  };

  // Refresh user data from API (useful after permission changes)
  const refreshUser = useCallback(async () => {
    if (!authService.isAuthenticated()) return;
    try {
      console.log('[AUTH] Refreshing user data...');
      const apiUserData = await authService.getCurrentUser();
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

      // ✅ Dispatch event to notify UI components (like Sidebar) to re-render
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('permissions-updated'));
        console.log('[AUTH] Dispatched permissions-updated event after refresh');
      }
    } catch (error) {
      console.error('[AUTH] Failed to refresh user:', error);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        isAuthenticated,
        isLoading,
        login,
        logout,
        updateUser,
        // RBAC01-07: Extended role and permission helpers
        isTenantAdmin,
        isRecruiter,
        isViewer,
        isBillingManager,
        isStandardUser,
        isReadOnlyRole,
        hasFeature,
        hasPermission,
        canAccessBilling,
        canManageUsers,
        canModifyData,
        refreshUser,
      }}
    >
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
