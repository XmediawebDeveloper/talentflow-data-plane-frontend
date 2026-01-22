// Tenant and User Management Types

// RBAC01-07: Extended role types
export type UserRole =
  | 'tenant_admin'
  | 'recruiter'
  | 'viewer'
  | 'billing_manager'   // RBAC03
  | 'standard_user';    // RBAC04

export interface Permission {
  // Legacy permissions matching backend API
  canCreateJD: boolean;         // JD Creation
  canManageJD: boolean;         // JD Management
  canUploadResumes: boolean;    // My Resumes, Resume Upload
  canViewResumes: boolean;      // Resume Scoring, AI Talent Match
  canAccessInternalDB: boolean; // Internal Resume Database
  canCreateAssessments: boolean; // Assessments
  canViewAnalytics: boolean;    // Reports & Analytics
  canManageSettings: boolean;   // Settings (Admin only)
  canManageUsers: boolean;      // User Management (Admin only)
  // RBAC03: Billing permissions
  canViewBilling?: boolean;
  canViewInvoices?: boolean;
  canViewUsage?: boolean;
  // RBAC06: Feature flags
  canRunScoring?: boolean;
  canRunAiInterviews?: boolean;
  canRunAiMatch?: boolean;
  canBulkOperations?: boolean;
  canExport?: boolean;
  canApiAccess?: boolean;
}

// RBAC06: Feature flags for user-level assignment
export interface FeatureFlags {
  resume_upload: boolean;
  resume_database_access: boolean;
  resume_scoring: boolean;
  assessment: boolean;
  ai_interview: boolean;
  api_access: boolean;
  reporting: boolean;
  jd_create: boolean;
  jd_manage: boolean;
  ai_talent_match: boolean;
  bulk_operations: boolean;
  export_data: boolean;
}

// RBAC07: Feature dependency info
export interface FeatureDependency {
  feature: string;
  name: string;
  requires: { feature: string; name: string }[];
  required_by: { feature: string; name: string }[];
  has_dependencies: boolean;
  is_dependency: boolean;
}

// RBAC06: Feature metadata
export interface FeatureMetadata {
  code: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  available_in_plan: boolean;
  enabled_for_user?: boolean;
  can_be_assigned?: boolean;
  reason?: string;
  // RBAC07: Dependency info
  locked_by?: { code: string; name: string }[];
  can_be_disabled?: boolean;
}

// RBAC01: User limits
export interface UserLimits {
  current_users: number;
  max_users: number;
  available_slots: number;
  usage_percentage: number;
  is_at_limit: boolean;
  approaching_limit: boolean;
  plan_name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  permissions: Permission;
  phone?: string;
  avatarUrl?: string;
  isActive?: boolean;
  lastLogin?: string;
  createdAt?: string;
  // RBAC06: Feature flags
  featureFlags?: FeatureFlags;
  enabledFeatures?: string[];
  // UI control flags (for role-based UI rendering)
  can_upgrade_plan?: boolean;
  can_manage_billing?: boolean;
}

export interface PlanLimits {
  resumeUploads: number;
  jobPostings: number;
  assessments: number;
  aiInterviews: number | 'unlimited';
  storageGB: number;
  maxFileSizeMB: number;
  virusScanEnabled: boolean;
  // RBAC01: User seat limits
  maxSeats?: number;
}

export interface PlanUsage {
  resumeUploads: number;
  jobPostings: number;
  assessments: number;
  aiInterviews: number;
  storageUsedMB: number;
  // RBAC01: Current user count
  currentSeats?: number;
}

export interface Subscription {
  planId: string;
  planName: string;
  status: 'active' | 'expired' | 'suspended';
  startDate: string;
  renewalDate: string;
  limits: PlanLimits;
  usage: PlanUsage;
  // RBAC06: Plan features
  availableFeatures?: string[];
}

export interface Tenant {
  id: string;
  name: string;
  email: string;
  registrationDate: string;
  subscription: Subscription;
  isActive: boolean;
  // Tenant status for RBAC checks
  status?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
}

// Permission helper functions - Updated for RBAC01-07
export const getPermissionsForRole = (role: UserRole): Permission => {
  switch (role) {
    case 'tenant_admin':
      // RBAC02: Tenant Admin has ALL permissions
      return {
        canCreateJD: true,
        canManageJD: true,
        canUploadResumes: true,
        canViewResumes: true,
        canAccessInternalDB: true,
        canCreateAssessments: true,
        canViewAnalytics: true,
        canManageSettings: true,
        canManageUsers: true,
        canViewBilling: true,
        canViewInvoices: true,
        canViewUsage: true,
        canRunScoring: true,
        canRunAiInterviews: true,
        canRunAiMatch: true,
        canBulkOperations: true,
        canExport: true,
        canApiAccess: true,
      };
    case 'recruiter':
      // Recruiter gets operational permissions
      return {
        canCreateJD: true,
        canManageJD: true,
        canUploadResumes: true,
        canViewResumes: true,
        canAccessInternalDB: true,
        canCreateAssessments: true,
        canViewAnalytics: true,
        canManageSettings: false,
        canManageUsers: false,
        canViewBilling: false,
        canRunScoring: true,
        canRunAiInterviews: true,
        canRunAiMatch: true,
        canBulkOperations: true,
        canExport: true,
      };
    case 'viewer':
      // RBAC05: Viewer has read-only access - no permission expansion allowed
      return {
        canCreateJD: false,
        canManageJD: false,
        canUploadResumes: false,
        canViewResumes: true,
        canAccessInternalDB: false,
        canCreateAssessments: false,
        canViewAnalytics: true,
        canManageSettings: false,
        canManageUsers: false,
        canViewBilling: false,
        canExport: false, // Viewers cannot export
      };
    case 'billing_manager':
      // RBAC03: Billing Manager - read-only billing access, no operational capabilities
      return {
        canCreateJD: false,
        canManageJD: false,
        canUploadResumes: false,
        canViewResumes: false,
        canAccessInternalDB: false,
        canCreateAssessments: false,
        canViewAnalytics: true, // Can view usage analytics
        canManageSettings: false,
        canManageUsers: false,
        canViewBilling: true,
        canViewInvoices: true,
        canViewUsage: true,
      };
    case 'standard_user':
      // RBAC04: Standard User - ZERO implicit permissions, all must be explicitly granted
      return {
        canCreateJD: false,
        canManageJD: false,
        canUploadResumes: false,
        canViewResumes: false,
        canAccessInternalDB: false,
        canCreateAssessments: false,
        canViewAnalytics: false,
        canManageSettings: false,
        canManageUsers: false,
        canViewBilling: false,
      };
    default:
      // Default: no permissions
      return {
        canCreateJD: false,
        canManageJD: false,
        canUploadResumes: false,
        canViewResumes: false,
        canAccessInternalDB: false,
        canCreateAssessments: false,
        canViewAnalytics: false,
        canManageSettings: false,
        canManageUsers: false,
      };
  }
};

// RBAC: Role metadata for UI
export const ROLE_METADATA: Record<UserRole, { name: string; description: string; isAdmin: boolean; isReadOnly?: boolean; permissionExpansionBlocked?: boolean }> = {
  tenant_admin: {
    name: 'Tenant Admin',
    description: 'Full access to all tenant features and settings',
    isAdmin: true,
  },
  recruiter: {
    name: 'Recruiter',
    description: 'Standard recruiter with access to JD, resumes, and assessments',
    isAdmin: false,
  },
  viewer: {
    name: 'Viewer',
    description: 'Read-only access to reports and dashboards. No permission expansion allowed.',
    isAdmin: false,
    isReadOnly: true,
    permissionExpansionBlocked: true,
  },
  billing_manager: {
    name: 'Billing Manager',
    description: 'Read-only access to billing and subscription information',
    isAdmin: false,
  },
  standard_user: {
    name: 'Standard User',
    description: 'Default role with no permissions. All access must be explicitly granted.',
    isAdmin: false,
  },
};

// RBAC06: Feature flag metadata
export const FEATURE_METADATA: Record<string, { name: string; description: string; category: string }> = {
  resume_upload: { name: 'Resume Upload', description: 'Upload and parse resumes', category: 'Resume Management' },
  resume_database_access: { name: 'Resume Database Access', description: 'Access internal resume database', category: 'Resume Management' },
  resume_scoring: { name: 'Resume Scoring', description: 'AI-powered resume scoring against job descriptions', category: 'AI Features' },
  assessment: { name: 'Assessment', description: 'Create and manage candidate assessments', category: 'Assessment' },
  ai_interview: { name: 'AI Interview', description: 'Conduct AI-powered interviews', category: 'AI Features' },
  api_access: { name: 'API Access', description: 'Access platform via API', category: 'Integration' },
  reporting: { name: 'Reporting', description: 'View reports and analytics', category: 'Analytics' },
  jd_create: { name: 'Create Job Descriptions', description: 'Create new job descriptions', category: 'Job Descriptions' },
  jd_manage: { name: 'Manage Job Descriptions', description: 'Edit and manage job descriptions', category: 'Job Descriptions' },
  ai_talent_match: { name: 'AI Talent Match', description: 'AI-powered candidate matching', category: 'AI Features' },
  bulk_operations: { name: 'Bulk Operations', description: 'Perform bulk actions on resumes and candidates', category: 'Operations' },
  export_data: { name: 'Export Data', description: 'Export data to Excel, CSV, PDF', category: 'Operations' },
};

// RBAC07: Permission dependency matrix
export const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  resume_scoring: ['resume_upload', 'resume_database_access'],
  ai_talent_match: ['resume_database_access'],
  ai_interview: ['assessment'],
  bulk_operations: ['resume_database_access'],
  export_data: ['reporting'],
  assessment: ['resume_database_access'],
  jd_manage: ['jd_create'],
};

// Check if tenant subscription is active
export const isSubscriptionActive = (subscription: Subscription): boolean => {
  return subscription.status === 'active';
};

// Check if units are available
export const hasAvailableUnits = (
  type: 'resumeUploads' | 'jobPostings' | 'assessments' | 'aiInterviews',
  subscription: Subscription
): boolean => {
  const { limits, usage } = subscription;

  if (type === 'aiInterviews' && limits.aiInterviews === 'unlimited') {
    return true;
  }

  const limit = limits[type];
  const used = usage[type];

  if (typeof limit === 'number' && typeof used === 'number') {
    return used < limit;
  }

  return false;
};

// Get remaining units
export const getRemainingUnits = (
  type: 'resumeUploads' | 'jobPostings' | 'assessments' | 'aiInterviews',
  subscription: Subscription
): number | 'unlimited' => {
  const { limits, usage } = subscription;

  if (type === 'aiInterviews' && limits.aiInterviews === 'unlimited') {
    return 'unlimited';
  }

  const limit = limits[type];
  const used = usage[type];

  if (typeof limit === 'number' && typeof used === 'number') {
    return Math.max(0, limit - used);
  }

  return 0;
};

// RBAC01: Check user seat availability
export const hasAvailableSeats = (subscription: Subscription): boolean => {
  const { limits, usage } = subscription;
  if (!limits.maxSeats) return true;
  return (usage.currentSeats || 0) < limits.maxSeats;
};

// RBAC05: Check if role is read-only
export const isReadOnlyRole = (role: UserRole): boolean => {
  return role === 'viewer';
};

// RBAC05: Check if permission expansion is blocked for role
export const isPermissionExpansionBlocked = (role: UserRole): boolean => {
  return role === 'viewer';
};

// RBAC07: Get dependencies for a feature
export const getFeatureDependencies = (feature: string): string[] => {
  return PERMISSION_DEPENDENCIES[feature] || [];
};

// RBAC07: Get features that depend on this feature
export const getDependentFeatures = (feature: string): string[] => {
  return Object.entries(PERMISSION_DEPENDENCIES)
    .filter(([, deps]) => deps.includes(feature))
    .map(([parent]) => parent);
};
