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
      canViewJD: hasPermission('canCreateJD') || hasPermission('canManageJD') || hasFeature('jd_create') || hasFeature('jd_manage'),
      canViewResumes: hasPermission('canUploadResumes') || hasPermission('canViewResumes') || hasFeature('resume_upload'),
      canViewScoring: hasPermission('canViewResumes') || hasFeature('resume_scoring'),
      canViewAIMatch: hasFeature('ai_talent_match') || hasPermission('canViewResumes'),
      canViewAssessments: hasPermission('canCreateAssessments') || hasFeature('assessment'),
      canViewReports: hasPermission('canViewAnalytics') || hasFeature('reporting'),
      canViewSettings: hasPermission('canManageSettings'),
      canViewUserManagement: hasPermission('canManageUsers'),
      canViewBilling: hasPermission('canViewBilling') ?? false,
      canViewInternalDB: hasPermission('canAccessInternalDB') || hasFeature('resume_database_access'),
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
