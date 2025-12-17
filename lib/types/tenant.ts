// Tenant and User Management Types

export type UserRole = 'tenant_admin' | 'recruiter' | 'viewer';

export interface Permission {
  // Permissions matching backend API
  canCreateJD: boolean;         // JD Creation
  canManageJD: boolean;         // JD Management
  canUploadResumes: boolean;    // My Resumes, Resume Upload
  canViewResumes: boolean;      // Resume Scoring, AI Talent Match
  canAccessInternalDB: boolean; // Internal Resume Database
  canCreateAssessments: boolean; // Assessments
  canViewAnalytics: boolean;    // Reports & Analytics
  canManageSettings: boolean;   // Settings (Admin only)
  canManageUsers: boolean;      // User Management (Admin only)
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
}

export interface PlanLimits {
  resumeUploads: number;
  jobPostings: number;
  assessments: number;
  aiInterviews: number | 'unlimited';
  storageGB: number; // Storage limit in GB
  maxFileSizeMB: number; // Maximum file size per resume in MB
  virusScanEnabled: boolean; // Whether virus/malware scanning is enabled
}

export interface PlanUsage {
  resumeUploads: number;
  jobPostings: number;
  assessments: number;
  aiInterviews: number;
  storageUsedMB: number; // Current storage used in MB
}

export interface Subscription {
  planId: string;
  planName: string;
  status: 'active' | 'expired' | 'suspended';
  startDate: string;
  renewalDate: string;
  limits: PlanLimits;
  usage: PlanUsage;
}

export interface Tenant {
  id: string;
  name: string;
  email: string;
  registrationDate: string;
  subscription: Subscription;
  isActive: boolean;
}

// Permission helper functions
export const getPermissionsForRole = (role: UserRole): Permission => {
  switch (role) {
    case 'tenant_admin':
      // Tenant Admin has ALL permissions
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
      };
    case 'recruiter':
      // Recruiter gets default permissions (can be customized by admin)
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
      };
    case 'viewer':
      // Viewer has read-only access
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
      };
    default:
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