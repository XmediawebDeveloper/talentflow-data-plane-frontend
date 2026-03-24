/**
 * usePermissions Hook - RBAC01-07
 * Provides comprehensive permission and feature flag checking
 */

import { useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import {
  Permission,
  FeatureFlags,
  UserRole,
  PERMISSION_DEPENDENCIES,
  getFeatureDependencies,
  getDependentFeatures,
  isReadOnlyRole,
  isPermissionExpansionBlocked,
} from '@/lib/types/tenant';

// Feature flag type for type-safe feature checking
export type FeatureFlagKey = keyof FeatureFlags;

// Permission key type
export type PermissionKey = keyof Permission;

// Role-based access interface
export interface RoleAccess {
  role: UserRole | null;
  isTenantAdmin: boolean;
  isRecruiter: boolean;
  isViewer: boolean;
  isBillingManager: boolean;
  isStandardUser: boolean;
  isReadOnly: boolean;
  permissionExpansionBlocked: boolean;
}

// Feature access interface
export interface FeatureAccess {
  hasFeature: (feature: FeatureFlagKey) => boolean;
  hasAllFeatures: (features: FeatureFlagKey[]) => boolean;
  hasAnyFeature: (features: FeatureFlagKey[]) => boolean;
  enabledFeatures: string[];
  featureFlags: FeatureFlags | undefined;
}

// Permission access interface
export interface PermissionAccess {
  hasPermission: (permission: PermissionKey) => boolean;
  hasAllPermissions: (permissions: PermissionKey[]) => boolean;
  hasAnyPermission: (permissions: PermissionKey[]) => boolean;
  permissions: Permission | undefined;
}

// Dependency access interface
export interface DependencyAccess {
  getFeatureDependencies: (feature: FeatureFlagKey) => string[];
  getDependentFeatures: (feature: FeatureFlagKey) => string[];
  canEnableFeature: (feature: FeatureFlagKey) => { allowed: boolean; missingDeps: string[] };
  canDisableFeature: (feature: FeatureFlagKey) => { allowed: boolean; blockedBy: string[] };
}

// Menu visibility helpers
export interface MenuVisibility {
  canViewDashboard: boolean;
  canViewJD: boolean;
  canViewResumes: boolean;
  canViewScoring: boolean;
  canViewAIMatch: boolean;
  canViewAssessments: boolean;
  canViewReports: boolean;
  canViewSettings: boolean;
  canViewUserManagement: boolean;
  canViewBilling: boolean;
  canViewInternalDB: boolean;
}

export interface UsePermissionsReturn extends RoleAccess, FeatureAccess, PermissionAccess, DependencyAccess {
  menuVisibility: MenuVisibility;
  canModifyData: boolean;
  canAccessBilling: boolean;
  isAuthenticated: boolean;
  userId: string | null;
}

export function usePermissions(): UsePermissionsReturn {
  const {
    user,
    isAuthenticated,
    isTenantAdmin,
    isRecruiter,
    isViewer,
    isBillingManager,
    isStandardUser,
    isReadOnlyRole: isReadOnly,
    hasFeature: authHasFeature,
    hasPermission: authHasPermission,
    canAccessBilling,
    canModifyData,
  } = useAuth();

  // Role access
  const roleAccess: RoleAccess = useMemo(() => ({
    role: user?.role ?? null,
    isTenantAdmin,
    isRecruiter,
    isViewer,
    isBillingManager,
    isStandardUser,
    isReadOnly,
    permissionExpansionBlocked: user ? isPermissionExpansionBlocked(user.role) : false,
  }), [user, isTenantAdmin, isRecruiter, isViewer, isBillingManager, isStandardUser, isReadOnly]);

  // Feature access
  const hasFeature = useCallback((feature: FeatureFlagKey): boolean => {
    return authHasFeature(feature);
  }, [authHasFeature]);

  const hasAllFeatures = useCallback((features: FeatureFlagKey[]): boolean => {
    return features.every(f => authHasFeature(f));
  }, [authHasFeature]);

  const hasAnyFeature = useCallback((features: FeatureFlagKey[]): boolean => {
    return features.some(f => authHasFeature(f));
  }, [authHasFeature]);

  const featureAccess: FeatureAccess = useMemo(() => ({
    hasFeature,
    hasAllFeatures,
    hasAnyFeature,
    enabledFeatures: user?.enabledFeatures ?? [],
    featureFlags: user?.featureFlags,
  }), [hasFeature, hasAllFeatures, hasAnyFeature, user?.enabledFeatures, user?.featureFlags]);

  // Permission access
  const hasPermission = useCallback((permission: PermissionKey): boolean => {
    return authHasPermission(permission);
  }, [authHasPermission]);

  const hasAllPermissions = useCallback((permissions: PermissionKey[]): boolean => {
    return permissions.every(p => authHasPermission(p));
  }, [authHasPermission]);

  const hasAnyPermission = useCallback((permissions: PermissionKey[]): boolean => {
    return permissions.some(p => authHasPermission(p));
  }, [authHasPermission]);

  const permissionAccess: PermissionAccess = useMemo(() => ({
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    permissions: user?.permissions,
  }), [hasPermission, hasAllPermissions, hasAnyPermission, user?.permissions]);

  // Dependency access
  const getFeatureDeps = useCallback((feature: FeatureFlagKey): string[] => {
    return getFeatureDependencies(feature);
  }, []);

  const getDepFeatures = useCallback((feature: FeatureFlagKey): string[] => {
    return getDependentFeatures(feature);
  }, []);

  const canEnableFeature = useCallback((feature: FeatureFlagKey): { allowed: boolean; missingDeps: string[] } => {
    const deps = getFeatureDependencies(feature);
    const enabledFeatures = user?.enabledFeatures ?? [];
    const missingDeps = deps.filter(d => !enabledFeatures.includes(d));
    return {
      allowed: missingDeps.length === 0,
      missingDeps,
    };
  }, [user?.enabledFeatures]);

  const canDisableFeature = useCallback((feature: FeatureFlagKey): { allowed: boolean; blockedBy: string[] } => {
    const dependents = getDependentFeatures(feature);
    const enabledFeatures = user?.enabledFeatures ?? [];
    const blockedBy = dependents.filter(d => enabledFeatures.includes(d));
    return {
      allowed: blockedBy.length === 0,
      blockedBy,
    };
  }, [user?.enabledFeatures]);

  const dependencyAccess: DependencyAccess = useMemo(() => ({
    getFeatureDependencies: getFeatureDeps,
    getDependentFeatures: getDepFeatures,
    canEnableFeature,
    canDisableFeature,
  }), [getFeatureDeps, getDepFeatures, canEnableFeature, canDisableFeature]);

  // Menu visibility based on role and permissions
  const menuVisibility: MenuVisibility = useMemo(() => {
    // Tenant admin sees everything
    if (isTenantAdmin) {
      return {
        canViewDashboard: true,
        canViewJD: true,
        canViewResumes: true,
        canViewScoring: true,
        canViewAIMatch: true,
        canViewAssessments: true,
        canViewReports: true,
        canViewSettings: true,
        canViewUserManagement: true,
        canViewBilling: true,
        canViewInternalDB: true,
      };
    }

    // Billing manager only sees billing-related
    if (isBillingManager) {
      return {
        canViewDashboard: true,
        canViewJD: false,
        canViewResumes: false,
        canViewScoring: false,
        canViewAIMatch: false,
        canViewAssessments: false,
        canViewReports: true, // Usage reports
        canViewSettings: false,
        canViewUserManagement: false,
        canViewBilling: true,
        canViewInternalDB: false,
      };
    }

    // Viewer sees read-only views
    if (isViewer) {
      return {
        canViewDashboard: true,
        canViewJD: false,
        canViewResumes: false,
        canViewScoring: false,
        canViewAIMatch: false,
        canViewAssessments: false,
        canViewReports: true, // Read-only reports
        canViewSettings: false,
        canViewUserManagement: false,
        canViewBilling: false,
        canViewInternalDB: false,
      };
    }

    // Standard user and recruiter - based on permissions and feature flags
    return {
      canViewDashboard: true,
      canViewJD: hasPermission('canReadJD') || hasPermission('canManageJD'),
      canViewResumes: hasPermission('canUploadResumes') || hasPermission('canViewResumes'),
      canViewScoring: hasPermission('canViewScoring') || hasPermission('canRunScoring'),
      canViewAIMatch: hasPermission('canViewAiMatch') || hasPermission('canRunAiMatch'),
      canViewAssessments: hasPermission('canViewAssessments') || hasPermission('canCreateAssessments'),
      canViewReports: hasPermission('canViewAnalytics'),
      canViewSettings: hasPermission('canManageSettings'),
      canViewUserManagement: hasPermission('canManageUsers'),
      canViewBilling: hasPermission('canViewBilling') ?? false,
      canViewInternalDB: hasPermission('canAccessInternalDB') || hasPermission('canViewInternalDB'),
    };
  }, [
    isTenantAdmin,
    isBillingManager,
    isViewer,
    hasPermission,
    hasFeature
  ]);

  return {
    // Role access
    ...roleAccess,
    // Feature access
    ...featureAccess,
    // Permission access
    ...permissionAccess,
    // Dependency access
    ...dependencyAccess,
    // Menu visibility
    menuVisibility,
    // Convenience props
    canModifyData,
    canAccessBilling,
    isAuthenticated,
    userId: user?.id ?? null,
  };
}

export default usePermissions;

/**
 * useModulePermissions - Get granular CRUD permissions for a specific module
 *
 * Usage:
 * const jdPerms = useModulePermissions('jd');
 * {jdPerms.canCreate && <Button>Create JD</Button>}
 * {jdPerms.canUpdate && <Button>Edit</Button>}
 * {jdPerms.canDelete && <Button>Delete</Button>}
 */

export type ModuleType = 'jd' | 'resume' | 'assessment' | 'internal_db';

export interface ModuleCRUDPermissions {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canDisable: boolean;
  hasAnyAccess: boolean; // True if ANY permission is granted
}

export function useModulePermissions(module: ModuleType): ModuleCRUDPermissions {
  const { user, isTenantAdmin } = useAuth();

  /**
   * PERMISSION LOGIC:
   * 1. tenant_admin → Full access to everything (bypass)
   * 2. All other roles → ONLY check explicitly assigned permissions
   *    - Permissions come from backend API (user.permissions)
   *    - NO role-based defaults applied
   *    - Missing permission = access denied
   */

  // tenant_admin bypasses all checks - has full access
  if (isTenantAdmin) {
    return {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canArchive: true,
      canDisable: true,
      hasAnyAccess: true,
    };
  }

  // For all other roles, check ONLY explicitly assigned permissions
  if (!user || !user.permissions) {
    return {
      canRead: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canArchive: false,
      canDisable: false,
      hasAnyAccess: false,
    };
  }

  // Get permissions DIRECTLY from backend API response
  const perms = user.permissions;
  let result: ModuleCRUDPermissions;

  // Map module to specific permissions
  switch (module) {
    case 'jd':
      result = {
        canRead: perms.canReadJD ?? false,
        canCreate: perms.canCreateJD ?? false,
        canUpdate: perms.canUpdateJD ?? false,
        canDelete: perms.canDeleteJD ?? false,
        canArchive: perms.canArchiveJD ?? false,
        canDisable: perms.canDisableJD ?? false,
        hasAnyAccess: false,
      };
      break;

    case 'resume':
      result = {
        canRead: perms.canViewResumes ?? false,
        canCreate: perms.canUploadResumes ?? false,
        canUpdate: perms.canUpdateResumes ?? false,
        canDelete: perms.canDeleteResumes ?? false,
        canArchive: false,
        canDisable: false,
        hasAnyAccess: false,
      };
      break;

    case 'assessment':
      result = {
        canRead: perms.canViewAssessments ?? false,
        canCreate: perms.canCreateAssessments ?? false,
        canUpdate: perms.canUpdateAssessments ?? false,
        canDelete: perms.canDeleteAssessments ?? false,
        canArchive: false,
        canDisable: false,
        hasAnyAccess: false,
      };
      break;

    case 'internal_db':
      result = {
        canRead: perms.canAccessInternalDB ?? false,
        canCreate: false, // Internal DB doesn't have create (resumes are uploaded elsewhere)
        canUpdate: perms.canUpdateInternalDB ?? false,
        canDelete: perms.canDeleteInternalDB ?? false,
        canArchive: false,
        canDisable: false,
        hasAnyAccess: false,
      };
      break;

    default:
      result = {
        canRead: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canArchive: false,
        canDisable: false,
        hasAnyAccess: false,
      };
  }

  // Calculate hasAnyAccess
  result.hasAnyAccess = result.canRead || result.canCreate || result.canUpdate || result.canDelete || result.canArchive || result.canDisable;

  return result;
}
