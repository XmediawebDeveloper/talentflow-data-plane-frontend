import { Tenant, User, getPermissionsForRole } from '../types/tenant';

// Mock Tenant Data
export const mockTenant: Tenant = {
  id: 'tenant-001',
  name: 'TechRecruit Solutions',
  email: 'admin@techrecruit.com',
  registrationDate: '2024-01-15T00:00:00Z',
  subscription: {
    planId: 'plan-pro',
    planName: 'Agency Pro Plan',
    status: 'active',
    startDate: '2025-01-15T00:00:00Z',
    renewalDate: '2026-01-15T00:00:00Z',
    limits: {
      resumeUploads: 2450,
      jobPostings: 100,
      assessments: 500,
      aiInterviews: 'unlimited',
      storageGB: 50, // 50 GB storage limit
      maxFileSizeMB: 10, // 10 MB max file size
      virusScanEnabled: true, // Virus scanning enabled
    },
    usage: {
      resumeUploads: 1593,
      jobPostings: 42,
      assessments: 140,
      aiInterviews: 87,
      storageUsedMB: 12800, // ~12.5 GB used (out of 50 GB)
    },
  },
  isActive: true,
};

// Mock Users with different roles
export const mockUsers: User[] = [
  {
    id: 'user-001',
    email: 'admin@demo.com',
    name: 'Sarah Admin',
    role: 'tenant_admin',
    tenantId: 'tenant-001',
    permissions: getPermissionsForRole('tenant_admin'), // Has ALL permissions
  },
  {
    id: 'user-002',
    email: 'demo@talentflow.com',
    name: 'John Recruiter',
    role: 'recruiter',
    tenantId: 'tenant-001',
    // Custom permissions assigned by admin
    permissions: {
      canCreateJD: true,          // Can create JDs
      canManageJD: true,          // Can manage JDs
      canUploadResumes: true,     // Can upload resumes
      canViewResumes: true,       // Can score resumes & AI Match
      canAccessInternalDB: true,  // Can access database
      canCreateAssessments: true, // Can create assessments
      canViewAnalytics: true,     // Can view reports
      canManageSettings: false,   // No settings access
      canManageUsers: false,      // No user management
    },
  },
  {
    id: 'user-003',
    email: 'viewer@talentflow.com',
    name: 'Emma Viewer',
    role: 'viewer',
    tenantId: 'tenant-001',
    permissions: getPermissionsForRole('viewer'), // Read-only access
  },
];

// Mock inactive tenant (for testing)
export const mockInactiveTenant: Tenant = {
  id: 'tenant-002',
  name: 'Inactive Tenant',
  email: 'inactive@example.com',
  registrationDate: '2023-01-01T00:00:00Z',
  subscription: {
    planId: 'plan-basic',
    planName: 'Basic Plan',
    status: 'expired',
    startDate: '2024-01-01T00:00:00Z',
    renewalDate: '2025-01-01T00:00:00Z',
    limits: {
      resumeUploads: 500,
      jobPostings: 20,
      assessments: 100,
      aiInterviews: 50,
      storageGB: 10, // 10 GB storage limit
      maxFileSizeMB: 5, // 5 MB max file size
      virusScanEnabled: false, // Virus scanning disabled
    },
    usage: {
      resumeUploads: 450,
      jobPostings: 18,
      assessments: 95,
      aiInterviews: 42,
      storageUsedMB: 8500, // 8.5 GB used
    },
  },
  isActive: false,
};

// Mock tenant with no available units
export const mockTenantNoUnits: Tenant = {
  id: 'tenant-003',
  name: 'Depleted Units Tenant',
  email: 'depleted@example.com',
  registrationDate: '2024-06-01T00:00:00Z',
  subscription: {
    planId: 'plan-starter',
    planName: 'Starter Plan',
    status: 'active',
    startDate: '2025-01-01T00:00:00Z',
    renewalDate: '2026-01-01T00:00:00Z',
    limits: {
      resumeUploads: 100,
      jobPostings: 10,
      assessments: 50,
      aiInterviews: 20,
      storageGB: 5, // 5 GB storage limit
      maxFileSizeMB: 5, // 5 MB max file size
      virusScanEnabled: false, // Virus scanning disabled (basic plan)
    },
    usage: {
      resumeUploads: 100,
      jobPostings: 10, // All units used!
      assessments: 50, // All units used!
      aiInterviews: 20,
      storageUsedMB: 4800, // 4.8 GB used (almost at limit)
    },
  },
  isActive: true,
};

// Helper function to get user by email
export const getUserByEmail = (email: string): User | null => {
  return mockUsers.find(user => user.email === email) || null;
};

// Helper function to get tenant for user
export const getTenantForUser = (userId: string): Tenant | null => {
  const user = mockUsers.find(u => u.id === userId);
  if (!user) return null;
  
  // For demo purposes, return mockTenant for all users
  // In real app, this would look up tenant by tenantId
  return mockTenant;
};