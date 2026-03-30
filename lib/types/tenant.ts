// Tenant and User Management Types

// RBAC01-07: Extended role types
export type UserRole =
  | 'tenant_admin'
  | 'recruiter'
  | 'viewer'
  | 'billing_manager'   // RBAC03
  | 'standard_user';    // RBAC04

export interface Permission {
  // Job Descriptions - Granular CRUD
  canReadJD?: boolean;          // View/List Job Descriptions
  canCreateJD: boolean;         // Create Job Descriptions
  canUpdateJD?: boolean;        // Edit Job Descriptions
  canDeleteJD?: boolean;        // Delete Job Descriptions
  canArchiveJD?: boolean;       // Archive Job Descriptions
  canDisableJD?: boolean;       // Disable/Enable Job Descriptions
  canManageJD: boolean;         // Legacy: JD Management (composite)

  // Resumes - Granular CRUD
  canViewResumes: boolean;      // View/Read Resumes
  canUploadResumes: boolean;    // Create/Upload Resumes
  canUpdateResumes?: boolean;   // Edit Resumes
  canDeleteResumes?: boolean;   // Delete Resumes

  // Resume Database - Granular CRUD
  canAccessInternalDB: boolean; // Legacy: View/Read Internal Database
  canViewInternalDB?: boolean;  // Granular: View/Read Internal Database (RBAC)
  canCreateInternalDB?: boolean;// Create records in Internal Database
  canUpdateInternalDB?: boolean;// Update records in Internal Database
  canDeleteInternalDB?: boolean;// Delete records from Internal Database

  // Assessments - Granular CRUD
  canViewAssessments?: boolean; // View/Read Assessments
  canCreateAssessments: boolean;// Create Assessments
  canUpdateAssessments?: boolean;// Edit Assessments
  canDeleteAssessments?: boolean;// Delete Assessments
  canDownloadAssessmentPDF?: boolean;// Download PDF reports for assessment results

  // Analytics & Reports
  canViewAnalytics: boolean;    // Reports & Analytics

  // Settings & Admin
  canManageSettings: boolean;   // Settings (Admin only)
  canManageUsers: boolean;      // User Management (Admin only)

  // RBAC03: Billing permissions
  canViewBilling?: boolean;
  canViewInvoices?: boolean;
  canViewUsage?: boolean;

  // Granular billing section view permissions
  canViewCurrentPlan?: boolean;
  canViewPaymentMethods?: boolean;
  canViewBillingHistory?: boolean;
  canViewRefundHistory?: boolean;
  canViewDisputeHistory?: boolean;

  // Granular settings section view permissions
  canViewGeneralSettings?: boolean;
  canViewPermissionsRoles?: boolean;
  canViewApiManagement?: boolean;
  canViewBranding?: boolean;
  canViewSecuritySettings?: boolean;

  // Granular Action Permissions — Billing
  canUpgradePlan?: boolean;
  canExportUsage?: boolean;
  canAddPaymentMethod?: boolean;
  canEditPaymentMethod?: boolean;
  canDeletePaymentMethod?: boolean;

  // Granular Action Permissions — Settings
  canManagePermissionsRoles?: boolean;
  canManageApiManagement?: boolean;
  canManageBranding?: boolean;
  canManageSecuritySettings?: boolean;

  // Teams
  canViewTeams?: boolean;
  canCreateTeams?: boolean;
  canUpdateTeams?: boolean;
  canDeleteTeams?: boolean;
  canViewTeamUsage?: boolean;

  // RBAC06: Feature flags
  canViewScoring?: boolean;      // NEW: View resume scoring page/results
  canRunScoring?: boolean;       // Run scoring operations
  canRunAiInterviews?: boolean;
  canViewAiMatch?: boolean;      // NEW: View AI talent match page/results
  canRunAiMatch?: boolean;       // Run AI match operations
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
  permissionCodes?: string[];
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
  // Tenant info
  tenantName?: string;
  // Tenant status info (for suspension/expiry display)
  tenantStatus?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'PENDING_ACTIVATION' | 'PROVISIONING' | 'DELETED';
  suspensionReason?: string;
  suspensionNotes?: string;
  suspendedAt?: string;
  tenantSubdomain?: string;
  tenantAdminEmail?: string;
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
  // Feature flags for tenant-level feature control
  features?: {
    [key: string]: boolean;
  };
}

// Permission helper functions - Updated for RBAC01-07
export const getPermissionsForRole = (role: UserRole): Permission => {
  switch (role) {
    case 'tenant_admin':
      // RBAC02: Owner has ALL permissions (full CRUD on everything)
      return {
        // Job Descriptions - Full CRUD
        canReadJD: true,
        canCreateJD: true,
        canUpdateJD: true,
        canDeleteJD: true,
        canManageJD: true,
        // Resumes - Full CRUD
        canViewResumes: true,
        canUploadResumes: true,
        canUpdateResumes: true,
        canDeleteResumes: true,
        // Resume Database - Full CRUD
        canAccessInternalDB: true,
        canUpdateInternalDB: true,
        canDeleteInternalDB: true,
        // Assessments - Full CRUD
        canViewAssessments: true,
        canCreateAssessments: true,
        canUpdateAssessments: true,
        canDeleteAssessments: true,
        canDownloadAssessmentPDF: true,
        // Analytics & Admin
        canViewAnalytics: true,
        canManageSettings: true,
        canManageUsers: true,
        // Billing
        canViewBilling: true,
        canViewInvoices: true,
        canViewUsage: true,
        // Features
        canRunScoring: true,
        canRunAiInterviews: true,
        canRunAiMatch: true,
        canBulkOperations: true,
        canExport: true,
        canApiAccess: true,
      };
    case 'recruiter':
      // Recruiter gets operational permissions (Full CRUD on recruitment modules)
      return {
        // Job Descriptions - Full CRUD
        canReadJD: true,
        canCreateJD: true,
        canUpdateJD: true,
        canDeleteJD: true,
        canManageJD: true,
        // Resumes - Full CRUD
        canViewResumes: true,
        canUploadResumes: true,
        canUpdateResumes: true,
        canDeleteResumes: true,
        // Resume Database - Full CRUD
        canAccessInternalDB: true,
        canUpdateInternalDB: true,
        canDeleteInternalDB: true,
        // Assessments - Full CRUD
        canViewAssessments: true,
        canCreateAssessments: true,
        canUpdateAssessments: true,
        canDeleteAssessments: true,
        canDownloadAssessmentPDF: true,
        // Analytics & Admin
        canViewAnalytics: true,
        canManageSettings: false,
        canManageUsers: false,
        // Billing
        canViewBilling: false,
        // Features
        canRunScoring: true,
        canRunAiInterviews: true,
        canRunAiMatch: true,
        canBulkOperations: true,
        canExport: true,
      };
    case 'viewer':
      // RBAC05: Viewer has read-only access - no permission expansion allowed
      return {
        // Job Descriptions - Read only
        canReadJD: true,
        canCreateJD: false,
        canUpdateJD: false,
        canDeleteJD: false,
        canManageJD: false,
        // Resumes - Read only
        canViewResumes: true,
        canUploadResumes: false,
        canUpdateResumes: false,
        canDeleteResumes: false,
        // Resume Database - No access
        canAccessInternalDB: false,
        canUpdateInternalDB: false,
        canDeleteInternalDB: false,
        // Assessments - Read only
        canViewAssessments: true,
        canCreateAssessments: false,
        canUpdateAssessments: false,
        canDeleteAssessments: false,
        canDownloadAssessmentPDF: false,
        // Analytics & Admin
        canViewAnalytics: true,
        canManageSettings: false,
        canManageUsers: false,
        // Billing
        canViewBilling: false,
        // Features
        canExport: false,
      };
    case 'billing_manager':
      // RBAC03: Billing Manager - read-only billing access, no operational capabilities
      return {
        // No JD access
        canReadJD: false,
        canCreateJD: false,
        canUpdateJD: false,
        canDeleteJD: false,
        canManageJD: false,
        // No Resume access
        canViewResumes: false,
        canUploadResumes: false,
        canUpdateResumes: false,
        canDeleteResumes: false,
        // No Resume Database access
        canAccessInternalDB: false,
        canUpdateInternalDB: false,
        canDeleteInternalDB: false,
        // No Assessment access
        canViewAssessments: false,
        canCreateAssessments: false,
        canUpdateAssessments: false,
        canDeleteAssessments: false,
        // Analytics & Admin
        canViewAnalytics: true,
        canManageSettings: false,
        canManageUsers: false,
        // Billing - Full access
        canViewBilling: true,
        canViewInvoices: true,
        canViewUsage: true,
      };
    case 'standard_user':
      // RBAC04: Standard User - ZERO implicit permissions, all must be explicitly granted
      return {
        canReadJD: false,
        canCreateJD: false,
        canUpdateJD: false,
        canDeleteJD: false,
        canManageJD: false,
        canViewResumes: false,
        canUploadResumes: false,
        canUpdateResumes: false,
        canDeleteResumes: false,
        canAccessInternalDB: false,
        canUpdateInternalDB: false,
        canDeleteInternalDB: false,
        canViewAssessments: false,
        canCreateAssessments: false,
        canUpdateAssessments: false,
        canDeleteAssessments: false,
        canViewAnalytics: false,
        canManageSettings: false,
        canManageUsers: false,
        canViewBilling: false,
      };
    default:
      // Default: no permissions
      return {
        canReadJD: false,
        canCreateJD: false,
        canUpdateJD: false,
        canDeleteJD: false,
        canManageJD: false,
        canViewResumes: false,
        canUploadResumes: false,
        canUpdateResumes: false,
        canDeleteResumes: false,
        canAccessInternalDB: false,
        canUpdateInternalDB: false,
        canDeleteInternalDB: false,
        canViewAssessments: false,
        canCreateAssessments: false,
        canUpdateAssessments: false,
        canDeleteAssessments: false,
        canViewAnalytics: false,
        canManageSettings: false,
        canManageUsers: false,
      };
  }
};

// RBAC: Role metadata for UI
export const ROLE_METADATA: Record<UserRole, { name: string; description: string; isAdmin: boolean; isReadOnly?: boolean; permissionExpansionBlocked?: boolean }> = {
  tenant_admin: {
    name: 'Owner',
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
