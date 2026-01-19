'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, Tenant, Permission, FeatureFlags, UserRole } from '@/lib/types/tenant';
import { authService, clearTokens } from '@/lib/services';
import { mockTenant } from '@/lib/mockData/tenantData';
import { useRouter } from 'next/navigation';
import type { User as ApiUser, FeatureFlags as ApiFeatureFlags } from '@/lib/services/authService';

// Helper to store/retrieve user from localStorage
const USER_STORAGE_KEY = 'talentflow_user';

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
  login: (user: User) => void;
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
function mapApiUserToUser(apiUser: ApiUser): User {
  return {
    id: apiUser.id,
    email: apiUser.email,
    name: apiUser.name,
    role: apiUser.role as UserRole,
    tenantId: apiUser.tenant_id,
    permissions: {
      canCreateJD: apiUser.permissions.can_create_jd,
      canManageJD: apiUser.permissions.can_manage_jd,
      canUploadResumes: apiUser.permissions.can_upload_resumes,
      canViewResumes: apiUser.permissions.can_view_resumes,
      canAccessInternalDB: apiUser.permissions.can_access_internal_db,
      canCreateAssessments: apiUser.permissions.can_create_assessments,
      canViewAnalytics: apiUser.permissions.can_view_analytics,
      canManageSettings: apiUser.permissions.can_manage_settings,
      canManageUsers: apiUser.permissions.can_manage_users,
      // RBAC03: Billing permissions
      canViewBilling: apiUser.permissions.can_view_billing,
      canViewInvoices: apiUser.permissions.can_view_invoices,
      canViewUsage: apiUser.permissions.can_view_usage,
      // RBAC06: Feature permissions
      canRunScoring: apiUser.permissions.can_run_scoring,
      canRunAiInterviews: apiUser.permissions.can_run_ai_interviews,
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

      // First, try to restore from localStorage (fast path)
      const storedUser = getUserFromStorage();
      if (storedUser && authService.isAuthenticated()) {
        console.log('[AUTH] Restored user from localStorage:', storedUser.email);
        setUser(storedUser);
        setTenant(mockTenant);
        setIsLoading(false);

        // Optionally validate with API in background (don't block UI)
        try {
          const apiUserData = await authService.getCurrentUser();
          const userData = mapApiUserToUser(apiUserData);
          setUser(userData);
          saveUserToStorage(userData);
          console.log('[AUTH] User validated with API');
        } catch (error) {
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
          const userData = mapApiUserToUser(apiUserData);
          setUser(userData);
          setTenant(mockTenant);
          saveUserToStorage(userData);
          console.log('[AUTH] Session restored successfully');
        } catch (error) {
          console.error('[AUTH] Session restore failed:', error);
          clearTokens();
          clearUserFromStorage();
        }
      } else {
        console.log('[AUTH] No token found, skipping session restore');
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const login = (userData: User) => {
    console.log('[AUTH] Login called for:', userData.email);
    setUser(userData);
    setTenant(mockTenant);
    saveUserToStorage(userData);
  };

  const logout = () => {
    console.log('[AUTH] Logout called');
    setUser(null);
    setTenant(null);
    clearTokens();
    clearUserFromStorage();
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
      setUser(userData);
      saveUserToStorage(userData);
      console.log('[AUTH] User data refreshed');
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
