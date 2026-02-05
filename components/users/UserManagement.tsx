'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Pencil,
  Ban,
  X,
  Mail,
  Calendar,
  Loader2,
  UserCog,
  Check,
  Settings2,
  Link2,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import { handleUnauthorized } from '@/lib/services/api';
import authService from '@/lib/services/authService';
import rbacService from '@/lib/services/rbacService';
import userService from '@/lib/services/userService';
import { tenantService } from '@/lib/services/tenantService';
import { RoleListItem, Permission } from '@/lib/types/rbac';
import { UserRole } from '@/lib/types/tenant';
import FeaturePermissionManager from './FeaturePermissionManager';
import DependencyMatrix from './DependencyMatrix';
import UserLimits, { useUserLimits } from './UserLimits';
import SeatQuotaCard from './SeatQuotaCard';

// Types
interface UserPermissions {
  can_create_jd: boolean;
  can_manage_jd: boolean;
  can_upload_resumes: boolean;
  can_view_resumes: boolean;
  can_access_internal_db: boolean;
  can_create_assessments: boolean;
  can_view_analytics: boolean;
  can_manage_settings: boolean;
  can_manage_users: boolean;
}

// RBAC Permission group for display
interface PermissionGroup {
  module: string;
  moduleName: string;
  permissions: Permission[];
}

// Module display names
const MODULE_DISPLAY_NAMES: Record<string, string> = {
  jd: 'Job Descriptions',
  resumes: 'Resumes',
  my_resumes: 'My Resumes',
  internal_db: 'Internal Database',
  assessments: 'Assessments',
  candidates: 'Candidates',
  analytics: 'Analytics',
  reports: 'Reports',
  notifications: 'Notifications',
  email_templates: 'Email Templates',
  files: 'File Management',
  settings: 'Settings',
  users: 'Users',
  roles: 'Roles',
  billing: 'Billing & Subscriptions',
  invoices: 'Invoices & Payments',
  usage: 'Usage & Quotas',
  audit: 'Audit Logs',
  activity: 'Activity Logs',
  api: 'API Access',
  webhooks: 'Webhooks',
  tags: 'Tags & Labels',
  comments: 'Comments & Notes',
  import: 'Data Import',
  export: 'Data Export',
};

// ============================================================================
// CUSTOM PERMISSION CATEGORIES CONFIGURATION
// ============================================================================
// This defines the simplified permission structure for the Add/Edit User modal

interface CustomPermissionAction {
  code: string;  // Maps to backend permission code
  label: string;
  description?: string;
}

interface CustomPermissionSubCategory {
  name: string;
  viewCode?: string; // Auto-enabled when any action is selected
  actions: CustomPermissionAction[];
}

interface CustomPermissionCategory {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  isMenuToggle?: boolean;  // If true, shows as single enable/disable toggle
  viewCode?: string; // Auto-enabled when any action is selected
  subCategories?: CustomPermissionSubCategory[];
  actions?: CustomPermissionAction[];
  dependencies?: {
    // When this action is enabled, auto-enable these
    [actionCode: string]: string[];
  };
}

// Custom permission categories matching the user's requirements
// NOTE: These permission codes need to exist in the backend RBAC system
// Backend permission format: module:action (e.g., jd:create, resumes:delete)
// viewCode: When any action is selected, the view permission is auto-enabled
const CUSTOM_PERMISSION_CATEGORIES: CustomPermissionCategory[] = [
  {
    id: 'job_description',
    name: 'Job Description',
    description: 'Job description management permissions',
    viewCode: 'jd:read',
    actions: [
      { code: 'jd:create', label: 'Create' },
      { code: 'jd:update', label: 'Edit' },
      { code: 'jd:delete', label: 'Delete' },
      { code: 'jd:archive', label: 'Archive' },
      { code: 'jd:disable', label: 'Disable' },
    ],
  },
  {
    id: 'resume_scoring',
    name: 'Resume Scoring',
    description: 'Resume scoring and evaluation permissions',
    viewCode: 'resume_scoring:read',
    actions: [
      { code: 'resume_scoring:create', label: 'Score Resumes' },
      { code: 'resume_scoring:export', label: 'Export' },
      { code: 'resume_scoring:download', label: 'Download Scorecard' },
      { code: 'resume_scoring:delete', label: 'Delete' },
    ],
    // Important: If Resume Scoring is enabled, Resume Upload is auto-enabled for both My Resumes and Internal Database
    dependencies: {
      'resume_scoring:create': ['my_resumes:create', 'internal_db:create'],
    },
  },
  {
    id: 'ai_talent_match',
    name: 'AI Talent Match',
    description: 'AI-powered talent matching permissions',
    viewCode: 'ai_talent_match:read',
    actions: [
      { code: 'ai_talent_match:create', label: 'Run AI Match' },
      { code: 'ai_talent_match:apply', label: 'Apply for Job' },
      { code: 'ai_talent_match:delete', label: 'Delete' },
      { code: 'ai_talent_match:export', label: 'Export' },
    ],
  },
  {
    id: 'resume_management',
    name: 'Resume Management',
    description: 'Resume and candidate management permissions',
    subCategories: [
      {
        name: 'My Resumes',
        viewCode: 'my_resumes:read',
        actions: [
          { code: 'my_resumes:create', label: 'Resume Upload' },
          { code: 'my_resumes:delete', label: 'Delete' },
          { code: 'my_resumes:archive', label: 'Archive' },
          { code: 'my_resumes:apply_assessment', label: 'Apply to Assessment' },
        ],
      },
      {
        name: 'Internal Database',
        viewCode: 'internal_db:read',
        actions: [
          { code: 'internal_db:create', label: 'Resume Upload' },
          { code: 'internal_db:delete', label: 'Delete' },
          { code: 'internal_db:archive', label: 'Archive' },
          { code: 'internal_db:apply_assessment', label: 'Apply to Assessment' },
        ],
      },
      {
        name: 'Assessment',
        viewCode: 'assessments:read',
        actions: [
          { code: 'assessments:create', label: 'Create' },
          { code: 'assessments:update', label: 'Edit' },
          { code: 'assessments:delete', label: 'Delete' },
          { code: 'assessments:archive', label: 'Archive' },
        ],
      },
    ],
  },
  {
    id: 'subscription_billing',
    name: 'Subscription & Billing',
    description: 'Billing and subscription management',
    isMenuToggle: true,
    viewCode: 'billing:read',
    subCategories: [
      {
        name: 'Current Plan',
        actions: [
          { code: 'billing:upgrade', label: 'Upgrade' },
        ],
      },
      {
        name: 'Usage & Quotas',
        actions: [
          { code: 'usage:upgrade', label: 'Upgrade' },
          { code: 'usage:export', label: 'Export' },
        ],
      },
      {
        name: 'Payment Methods',
        actions: [
          { code: 'payment_methods:create', label: 'Add' },
          { code: 'payment_methods:update', label: 'Edit' },
          { code: 'payment_methods:delete', label: 'Delete' },
        ],
      },
      {
        name: 'Billing History',
        actions: [
          { code: 'billing_history:read', label: 'View' },
        ],
      },
      {
        name: 'Refund History',
        actions: [
          { code: 'refund_history:read', label: 'View' },
        ],
      },
      {
        name: 'Dispute History',
        actions: [
          { code: 'dispute_history:read', label: 'View' },
        ],
      },
    ],
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'System settings and configuration',
    isMenuToggle: true,
    viewCode: 'settings:read',
    subCategories: [
      {
        name: 'General Settings',
        actions: [
          { code: 'settings:general', label: 'Access' },
        ],
      },
      {
        name: 'Permissions & Roles',
        actions: [
          { code: 'settings:permissions_roles', label: 'Access' },
        ],
      },
      {
        name: 'API Management',
        actions: [
          { code: 'settings:api_management', label: 'Access' },
        ],
      },
      {
        name: 'Branding & White Label',
        actions: [
          { code: 'settings:branding', label: 'Access' },
        ],
      },
    ],
  },
  {
    id: 'support',
    name: 'Support',
    description: 'Support and security settings',
    isMenuToggle: true,
    viewCode: 'support:read',
    subCategories: [
      {
        name: 'Security Settings',
        actions: [
          { code: 'support:security_settings', label: 'Access' },
        ],
      },
    ],
  },
];

// Helper to get all permission codes from custom categories
const getAllCustomPermissionCodes = (): string[] => {
  const codes: string[] = [];
  CUSTOM_PERMISSION_CATEGORIES.forEach(category => {
    if (category.actions) {
      category.actions.forEach(action => codes.push(action.code));
    }
    if (category.subCategories) {
      category.subCategories.forEach(sub => {
        sub.actions.forEach(action => codes.push(action.code));
      });
    }
  });
  return codes;
};

// Helper to check if a permission code matches our custom categories
const findPermissionInCustomCategories = (code: string): { categoryId: string; subCategory?: string; action: CustomPermissionAction } | null => {
  for (const category of CUSTOM_PERMISSION_CATEGORIES) {
    if (category.actions) {
      const action = category.actions.find(a => a.code === code);
      if (action) return { categoryId: category.id, action };
    }
    if (category.subCategories) {
      for (const sub of category.subCategories) {
        const action = sub.actions.find(a => a.code === code);
        if (action) return { categoryId: category.id, subCategory: sub.name, action };
      }
    }
  }
  return null;
};

// Helper to get dependencies for a permission code
const getPermissionDependencies = (code: string): string[] => {
  for (const category of CUSTOM_PERMISSION_CATEGORIES) {
    if (category.dependencies && category.dependencies[code]) {
      return category.dependencies[code];
    }
  }
  return [];
};

// Group permissions by module (original function - kept for backwards compatibility)
const groupPermissionsByModule = (permissions: Permission[]): PermissionGroup[] => {
  const groups: Record<string, PermissionGroup> = {};

  permissions.forEach(perm => {
    if (!groups[perm.module]) {
      groups[perm.module] = {
        module: perm.module,
        moduleName: MODULE_DISPLAY_NAMES[perm.module] || perm.module,
        permissions: [],
      };
    }
    groups[perm.module].permissions.push(perm);
  });

  // Sort permissions within each group by action order
  const actionOrder = ['create', 'read', 'update', 'delete'];
  Object.values(groups).forEach(group => {
    group.permissions.sort((a, b) => {
      return actionOrder.indexOf(a.action) - actionOrder.indexOf(b.action);
    });
  });

  // Return groups in a specific order (core features first, admin features last)
  const moduleOrder = [
    'jd',
    'resumes',
    'my_resumes',
    'internal_db',
    'assessments',
    'candidates',
    'analytics',
    'reports',
    'notifications',
    'email_templates',
    'files',
    'tags',
    'comments',
    'import',
    'export',
    'billing',
    'invoices',
    'usage',
    'settings',
    'users',
    'roles',
    'audit',
    'activity',
    'api',
    'webhooks'
  ];
  return moduleOrder
    .filter(mod => groups[mod])
    .map(mod => groups[mod]);
};

// Map permission code to permission ID (helper for custom permission UI)
const getPermissionIdByCode = (permissions: Permission[], code: string): number | null => {
  const perm = permissions.find(p => p.code === code);
  return perm ? perm.id : null;
};

// Get all permission IDs for a custom category
const getCategoryPermissionIds = (
  permissions: Permission[],
  category: CustomPermissionCategory
): number[] => {
  const ids: number[] = [];

  if (category.actions) {
    category.actions.forEach(action => {
      const id = getPermissionIdByCode(permissions, action.code);
      if (id) ids.push(id);
    });
  }

  if (category.subCategories) {
    category.subCategories.forEach(sub => {
      sub.actions.forEach(action => {
        const id = getPermissionIdByCode(permissions, action.code);
        if (id) ids.push(id);
      });
    });
  }

  return ids;
};

interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;  // Dynamic role from RBAC
  permissions: UserPermissions;
  is_active: boolean;
  last_login?: string;
}

// Default role labels for known roles - RBAC01-07
const defaultRoleLabels: Record<string, string> = {
  tenant_admin: 'Owner',
  admin: 'Admin',
  recruiter: 'Recruiter',
  viewer: 'Viewer',
  billing_manager: 'Billing',
  standard_user: 'User',
};

// Default badge colors for known roles - RBAC01-07
const defaultRoleBadgeColors: Record<string, string> = {
  tenant_admin: 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white',
  admin: 'bg-gray-200 text-gray-800',
  recruiter: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-50 text-gray-600',
  billing_manager: 'bg-green-100 text-green-700',
  standard_user: 'bg-gray-100 text-gray-600',
};

// Color palette for custom roles - each custom role gets a distinct color
const customRoleColors = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-cyan-100 text-cyan-700',
  'bg-teal-100 text-teal-700',
  'bg-emerald-100 text-emerald-700',
  'bg-lime-100 text-lime-700',
  'bg-amber-100 text-amber-700',
  'bg-orange-100 text-orange-700',
  'bg-rose-100 text-rose-700',
  'bg-fuchsia-100 text-fuchsia-700',
];

// Simple hash function for consistent color assignment based on role code
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

// Get role label - use RBAC name or fallback to defaults
const getRoleLabel = (role: string, availableRoles: RoleListItem[]): string => {
  const rbacRole = availableRoles.find(r => r.code.toLowerCase() === role.toLowerCase());
  if (rbacRole) return rbacRole.name;
  return defaultRoleLabels[role.toLowerCase()] || role.charAt(0).toUpperCase() + role.slice(1);
};

// Get role badge color - system roles use default colors, custom roles get distinct colors from palette
const getRoleBadgeColor = (role: string, availableRoles: RoleListItem[]): string => {
  const roleCode = role.toLowerCase();

  // Check if it's a known system role with predefined color
  if (defaultRoleBadgeColors[roleCode]) {
    return defaultRoleBadgeColors[roleCode];
  }

  // For custom roles, check if it exists in availableRoles
  const customRole = availableRoles.find(r => r.code.toLowerCase() === roleCode);
  if (customRole && !customRole.is_system) {
    // Generate consistent color based on role code using hash
    const colorIndex = hashString(roleCode) % customRoleColors.length;
    return customRoleColors[colorIndex];
  }

  // Fallback for unknown roles
  return 'bg-gray-100 text-gray-700';
};

const permissionLabels: Record<keyof UserPermissions, string> = {
  can_create_jd: 'Create JD',
  can_manage_jd: 'Manage JD',
  can_upload_resumes: 'Upload Resumes',
  can_view_resumes: 'View Resumes',
  can_access_internal_db: 'Internal DB',
  can_create_assessments: 'Create Assessments',
  can_view_analytics: 'View Analytics',
  can_manage_settings: 'Manage Settings',
  can_manage_users: 'Manage Users',
};

const defaultPermissions: UserPermissions = {
  can_create_jd: false,
  can_manage_jd: false,
  can_upload_resumes: false,
  can_view_resumes: true,
  can_access_internal_db: false,
  can_create_assessments: false,
  can_view_analytics: false,
  can_manage_settings: false,
  can_manage_users: false,
};

// Mock users for fallback
const mockUsers: ApiUser[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@acme.com',
    role: 'tenant_admin',
    permissions: {
      can_create_jd: true,
      can_manage_jd: true,
      can_upload_resumes: true,
      can_view_resumes: true,
      can_access_internal_db: true,
      can_create_assessments: true,
      can_view_analytics: true,
      can_manage_settings: true,
      can_manage_users: true,
    },
    is_active: true,
    last_login: '2025-12-18T10:30:00Z',
  },
  {
    id: '2',
    name: 'John Anderson',
    email: 'john.anderson@acme.com',
    role: 'recruiter',
    permissions: {
      can_create_jd: true,
      can_manage_jd: true,
      can_upload_resumes: true,
      can_view_resumes: true,
      can_access_internal_db: true,
      can_create_assessments: true,
      can_view_analytics: true,
      can_manage_settings: false,
      can_manage_users: false,
    },
    is_active: true,
    last_login: '2025-12-17T14:20:00Z',
  },
  {
    id: '3',
    name: 'Lisa Thompson',
    email: 'lisa.thompson@acme.com',
    role: 'viewer',
    permissions: {
      can_create_jd: false,
      can_manage_jd: false,
      can_upload_resumes: false,
      can_view_resumes: true,
      can_access_internal_db: false,
      can_create_assessments: false,
      can_view_analytics: true,
      can_manage_settings: false,
      can_manage_users: false,
    },
    is_active: true,
    last_login: '2025-12-16T09:15:00Z',
  },
  {
    id: '4',
    name: 'Michael Chen',
    email: 'michael.chen@acme.com',
    role: 'recruiter',
    permissions: {
      can_create_jd: true,
      can_manage_jd: false,
      can_upload_resumes: true,
      can_view_resumes: true,
      can_access_internal_db: true,
      can_create_assessments: true,
      can_view_analytics: false,
      can_manage_settings: false,
      can_manage_users: false,
    },
    is_active: false,
    last_login: '2025-12-10T16:45:00Z',
  },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function UserManagement() {
  const router = useRouter();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<RoleListItem[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [editSelectedRoleId, setEditSelectedRoleId] = useState<number | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<number>>(new Set());
  const [editSelectedPermissionIds, setEditSelectedPermissionIds] = useState<Set<number>>(new Set());
  const [editOriginalPermissionIds, setEditOriginalPermissionIds] = useState<Set<number>>(new Set());

  // Track selected permission codes (for custom permission UI)
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState<Set<string>>(new Set());
  const [editSelectedPermissionCodes, setEditSelectedPermissionCodes] = useState<Set<string>>(new Set());
  const [editOriginalRoleId, setEditOriginalRoleId] = useState<number | null>(null);

  // RBAC06-07: Feature permission states
  const [featurePermissionUser, setFeaturePermissionUser] = useState<ApiUser | null>(null);
  const [isDependencyMatrixOpen, setIsDependencyMatrixOpen] = useState(false);

  // RBAC01: User limits hook
  const { limits, isAtLimit, canAddUsers, refresh: refreshLimits } = useUserLimits();

  // Refresh trigger for SeatQuotaCard
  const [seatQuotaRefreshTrigger, setSeatQuotaRefreshTrigger] = useState(0);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [showPassword, setShowPassword] = useState(false); // Toggle password visibility
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'viewer',
    permissions: { ...defaultPermissions },
  });

  // Tenant email domain (locked part of email)
  const [tenantEmailDomain, setTenantEmailDomain] = useState<string>('');
  const [emailUsername, setEmailUsername] = useState<string>(''); // Just the username part before @
  const [editEmailUsername, setEditEmailUsername] = useState<string>(''); // Username part for edit modal
  const [showAtBlockedMessage, setShowAtBlockedMessage] = useState(false);

  // Email validation states
  const [emailCheckResult, setEmailCheckResult] = useState<{
    error: string | null;
    available: boolean;
  }>({
    error: null,
    available: true,
  });
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const emailCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Current user state (for hiding Edit/Delete buttons on self)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Prevent duplicate fetches in development mode
  const hasFetched = useRef(false);

  // Permission guard - check if user has access to User Management
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const currentUser = await authService.getCurrentUser();

        // Store current user ID for hiding Edit/Delete buttons on self
        setCurrentUserId(currentUser.id);

        // Check if user has permission to access User Management
        const hasPermission = currentUser.role === 'tenant_admin' || currentUser.permissions?.can_manage_users;

        if (!hasPermission) {
          toast.error('You do not have permission to access User Management');
          router.push('/dashboard');
          return;
        }
      } catch (error) {
        console.error('Permission check failed:', error);
        router.push('/dashboard');
      }
    };

    checkPermission();
  }, [router]);

  // Fetch tenant email domain on mount
  useEffect(() => {
    const fetchTenantDomain = async () => {
      try {
        const domain = await tenantService.getTenantEmailDomain();
        setTenantEmailDomain(domain);
      } catch (error) {
        console.error('Failed to fetch tenant domain:', error);
        toast.error('Failed to load organization email domain');
      }
    };

    fetchTenantDomain();
  }, []);

  // Load users, roles, and permissions
  // Auto-sync with Admin API first to ensure accurate counts
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const initializeUsers = async () => {
      // Auto-sync with Admin API first to reconcile any count mismatches
      try {
        const syncResult = await userService.syncUsers();
        if (syncResult.synced) {
          console.log(`[USER-SYNC] Tenant ${syncResult.tenant_id}: Local=${syncResult.local_count}, Admin=${syncResult.admin_count}, Synced=${syncResult.synced_users || 0} users`);
        } else if (syncResult.error === 'USER_LIMIT_EXCEEDED' && syncResult.upgrade_required) {
          console.warn(`[USER-SYNC] Plan limit exceeded: ${syncResult.message}`);
          toast.warning(
            `User count mismatch: You have ${syncResult.local_count} users but your plan allows ${syncResult.max_seats}. Please upgrade your plan.`,
            { duration: 8000 }
          );
        }
      } catch (error) {
        console.warn('Failed to sync users with Admin API:', error);
        // Continue loading users even if sync fails
      }

      // Then load users and related data
      loadUsers();
      loadRoles();
      loadAllPermissions();
    };

    initializeUsers();
  }, []);


  const loadAllPermissions = async () => {
    try {
      const data = await rbacService.getPermissions();
      setAllPermissions(data.permissions);
    } catch (error) {
      console.warn('Failed to load permissions:', error);
    }
  };

  const loadRoles = async () => {
    try {
      const data = await rbacService.getRoles();
      setAvailableRoles(data.roles);
    } catch (error) {
      console.warn('Failed to load roles, using defaults:', error);
      // Fallback to mock roles
      setAvailableRoles([
        { id: 1, code: 'admin', name: 'Admin', description: 'Full access', is_system: true, is_default: false, priority: 100, permission_count: 24, user_count: 2 },
        { id: 2, code: 'recruiter', name: 'Recruiter', description: 'Recruitment tasks', is_system: true, is_default: true, priority: 50, permission_count: 16, user_count: 5 },
        { id: 3, code: 'viewer', name: 'Viewer', description: 'Read-only access', is_system: true, is_default: false, priority: 10, permission_count: 5, user_count: 8 },
      ]);
    }
  };

  const selectRole = async (roleId: number, isEdit: boolean = false) => {
    setIsLoadingPermissions(true);

    try {
      // Fetch full role details including permissions
      const roleDetails = await rbacService.getRoleById(roleId);

      // Get permission IDs and codes from the role
      const permissionIds = new Set<number>(
        roleDetails.permissions?.map(p => p.id) || []
      );
      const permissionCodes = new Set<string>(
        roleDetails.permissions?.map(p => p.code) || []
      );

      console.log(`[DEBUG] Loaded ${permissionIds.size} permissions for role ${roleId}`);
      console.log(`[DEBUG] Permission codes:`, Array.from(permissionCodes));

      if (isEdit) {
        setEditSelectedRoleId(roleId);
        setEditSelectedPermissionIds(permissionIds);
        setEditSelectedPermissionCodes(permissionCodes);
      } else {
        setSelectedRoleId(roleId);
        setSelectedPermissionIds(permissionIds);
        setSelectedPermissionCodes(permissionCodes);
      }
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      // Clear permissions on error
      if (isEdit) {
        setEditSelectedRoleId(roleId);
        setEditSelectedPermissionIds(new Set());
        setEditSelectedPermissionCodes(new Set());
      } else {
        setSelectedRoleId(roleId);
        setSelectedPermissionIds(new Set());
        setSelectedPermissionCodes(new Set());
      }
    } finally {
      setIsLoadingPermissions(false);
    }
  };

  // Toggle permission selection for create modal
  const togglePermission = (permissionId: number) => {
    setSelectedPermissionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
  };

  // Toggle permission selection for edit modal
  const toggleEditPermission = (permissionId: number) => {
    setEditSelectedPermissionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
  };

  // Select/Deselect all permissions for create modal
  const handleSelectAllPermissions = () => {
    const allPermissionIds = allPermissions.map(p => p.id);
    const allSelected = allPermissionIds.every(id => selectedPermissionIds.has(id));

    if (allSelected) {
      // Deselect all
      setSelectedPermissionIds(new Set());
    } else {
      // Select all
      setSelectedPermissionIds(new Set(allPermissionIds));
    }
  };

  // Select/Deselect all permissions for edit modal
  const handleSelectAllEditPermissions = () => {
    const allPermissionIds = allPermissions.map(p => p.id);
    const allSelected = allPermissionIds.every(id => editSelectedPermissionIds.has(id));

    if (allSelected) {
      // Deselect all
      setEditSelectedPermissionIds(new Set());
    } else {
      // Select all
      setEditSelectedPermissionIds(new Set(allPermissionIds));
    }
  };

  // Select/Deselect all permissions in a module for create modal
  const handleSelectModulePermissions = (modulePermissions: Permission[]) => {
    const modulePermissionIds = modulePermissions.map(p => p.id);
    const allSelected = modulePermissionIds.every(id => selectedPermissionIds.has(id));

    setSelectedPermissionIds(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        // Deselect all in this module
        modulePermissionIds.forEach(id => newSet.delete(id));
      } else {
        // Select all in this module
        modulePermissionIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  // Select/Deselect all permissions in a module for edit modal
  const handleSelectEditModulePermissions = (modulePermissions: Permission[]) => {
    const modulePermissionIds = modulePermissions.map(p => p.id);
    const allSelected = modulePermissionIds.every(id => editSelectedPermissionIds.has(id));

    setEditSelectedPermissionIds(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        // Deselect all in this module
        modulePermissionIds.forEach(id => newSet.delete(id));
      } else {
        // Select all in this module
        modulePermissionIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  // Email validation with debounce (500ms)
  const checkEmailAvailability = async (username: string) => {
    // Clear previous timeout
    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current);
    }

    // Reset validation state
    setEmailCheckResult({ error: null, available: true });

    // Skip validation if username is empty or domain not loaded
    if (!username || !tenantEmailDomain) {
      return;
    }

    // Construct full email
    const fullEmail = `${username}@${tenantEmailDomain}`;

    // Set loading state
    setIsCheckingEmail(true);

    // Debounce - wait 500ms after user stops typing
    emailCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await userService.checkEmailAvailability(fullEmail);

        // Update validation result
        setEmailCheckResult({
          error: result.error,
          available: result.available,
        });
      } catch (error) {
        console.error('Error checking email:', error);
        // Show error to user
        setEmailCheckResult({
          error: 'Failed to validate email. Please try again.',
          available: false,
        });
      } finally {
        setIsCheckingEmail(false);
      }
    }, 500);
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/users`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        // Check for permission denied (403 Forbidden)
        if (response.status === 403) {
          throw new Error('Permission Denied: You do not have access to view users');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to fetch users');
      }

      const data = await response.json();
      const mappedUsers: ApiUser[] = (data.users || data).map((user: any) => ({
        id: user.id.toString(),
        name: user.name || user.full_name,
        email: user.email,
        role: user.role || 'viewer',
        permissions: user.permissions || defaultPermissions,
        is_active: user.is_active ?? true,
        last_login: user.last_login_at,
      }));
      setUsers(mappedUsers);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast.error(error.message || 'Failed to load users');
      setUsers([]); // Show empty state instead of mock data
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRoleChange = (role: string) => {
    let permissions = { ...defaultPermissions };
    if (role === 'tenant_admin') {
      permissions = {
        can_create_jd: true,
        can_manage_jd: true,
        can_upload_resumes: true,
        can_view_resumes: true,
        can_access_internal_db: true,
        can_create_assessments: true,
        can_view_analytics: true,
        can_manage_settings: true,
        can_manage_users: true,
      };
    } else if (role === 'recruiter') {
      permissions = {
        can_create_jd: true,
        can_manage_jd: true,
        can_upload_resumes: true,
        can_view_resumes: true,
        can_access_internal_db: true,
        can_create_assessments: true,
        can_view_analytics: true,
        can_manage_settings: false,
        can_manage_users: false,
      };
    }
    setNewUser({ ...newUser, role, permissions });
  };

  const handleCreateUser = async () => {
    // Validate username instead of email
    if (!newUser.name || !emailUsername || !newUser.password) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!tenantEmailDomain) {
      toast.error('Organization email domain not loaded. Please refresh the page.');
      return;
    }

    if (!selectedRoleId) {
      toast.error('Please select a role');
      return;
    }

    if (newUser.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    // Check email domain validation
    if (!emailCheckResult.available) {
      toast.error(emailCheckResult.error || 'Email domain validation failed');
      return;
    }

    // Construct full email from username + domain
    const fullEmail = `${emailUsername}@${tenantEmailDomain}`;

    const selectedRole = availableRoles.find(r => r.id === selectedRoleId);
    const roleCode = selectedRole?.code || 'viewer';

    setIsSaving(true);
    try {
      // Log selected permission codes for debugging
      console.log('[CREATE USER] Selected permission codes:', Array.from(selectedPermissionCodes));
      console.log('[CREATE USER] Mapped permission IDs:', Array.from(selectedPermissionIds));

      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          name: newUser.name,
          email: fullEmail, // Use constructed full email
          password: newUser.password,
          role: roleCode,
          role_id: selectedRoleId,
          permission_ids: Array.from(selectedPermissionIds),
          permission_codes: Array.from(selectedPermissionCodes), // Also send codes for future backend support
        }),
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle user limit exceeded error
        if (errorData.detail?.error === 'USER_LIMIT_EXCEEDED') {
          toast.error(errorData.detail.message || 'User limit exceeded. Please upgrade your plan.');
          return;
        }

        // Handle Pydantic validation errors (array format)
        if (Array.isArray(errorData.detail)) {
          const validationError = errorData.detail[0];
          if (validationError?.msg) {
            // Show user-friendly error message
            if (validationError.msg.includes('email')) {
              toast.error('Invalid email format. Please check the username.');
            } else {
              toast.error(validationError.msg);
            }
          } else {
            toast.error('Validation error. Please check all fields.');
          }
          return;
        }

        // Handle other error formats
        if (typeof errorData.detail === 'string') {
          toast.error(errorData.detail);
        } else if (errorData.detail?.message) {
          toast.error(errorData.detail.message);
        } else {
          toast.error('Failed to create user. Please try again.');
        }
        return;
      }

      toast.success('User created successfully');
      resetCreateModal();
      refreshLimits(); // Refresh user limits count
      setSeatQuotaRefreshTrigger(prev => prev + 1); // Refresh SeatQuotaCard
      loadUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(error.message || 'Failed to create user');
    } finally {
      setIsSaving(false);
    }
  };

  const resetCreateModal = () => {
    setNewUser({
      name: '',
      email: '',
      password: '',
      role: 'viewer',
      permissions: { ...defaultPermissions },
    });
    setEmailUsername(''); // Reset email username
    setEmailCheckResult({ error: null, available: true }); // Reset validation
    setSelectedRoleId(null);
    setSelectedPermissionIds(new Set());
    setSelectedPermissionCodes(new Set()); // Reset permission codes
    setShowPassword(false); // Hide password when modal closes
    setIsCreateModalOpen(false);
    // Clear email validation state
    setEmailCheckResult({ error: null, available: true });
    setIsCheckingEmail(false);
    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current);
    }
  };

  const openEditModal = async (user: ApiUser) => {
    console.log('[EDIT USER] Opening edit modal for:', user.email);
    console.log('[EDIT USER] allPermissions loaded?', allPermissions.length > 0, 'Count:', allPermissions.length);
    setEditingUser(user);

    // Find the role ID based on user's current role
    const matchingRole = availableRoles.find(r => r.code.toLowerCase() === user.role.toLowerCase());
    setEditSelectedRoleId(matchingRole?.id || null);

    // Fetch fresh user data with permission_ids
    try {
      const freshUserData = await userService.getUser(user.id);

      // Use permission_ids directly from backend response
      const currentPermissionIds = new Set<number>();

      // Backend now returns permission_ids array - use it directly!
      if (freshUserData.permission_ids && Array.isArray(freshUserData.permission_ids)) {
        freshUserData.permission_ids.forEach((id: number) => {
          currentPermissionIds.add(id);
        });
        console.log('[EDIT USER] Loaded permission IDs from backend:', Array.from(currentPermissionIds));
      } else {
        // Fallback: Map user's current permissions (boolean fields) to permission IDs if permission_ids not available
        console.log('[EDIT USER] permission_ids not available, falling back to boolean mapping');
        console.log('[EDIT USER] allPermissions array length:', allPermissions.length);
        console.log('[EDIT USER] freshUserData.permissions:', freshUserData.permissions);
        allPermissions.forEach(perm => {
        // Map permission code to user's boolean permission fields
        // This requires checking various permission patterns
        let hasPermission = false;

        // Job Descriptions
        if (perm.code === 'jd:create' && freshUserData.permissions.can_create_jd) hasPermission = true;
        if (perm.code === 'jd:read' && (freshUserData.permissions.can_manage_jd || freshUserData.permissions.can_view_jd)) hasPermission = true;
        if (perm.code === 'jd:update' && (freshUserData.permissions.can_manage_jd || freshUserData.permissions.can_update_jd)) hasPermission = true;
        if (perm.code === 'jd:delete' && (freshUserData.permissions.can_manage_jd || freshUserData.permissions.can_delete_jd)) hasPermission = true;

        // Resumes
        if (perm.code === 'resumes:create' && (freshUserData.permissions.can_upload_resumes || freshUserData.permissions.can_create_resumes)) hasPermission = true;
        if (perm.code === 'resumes:read' && (freshUserData.permissions.can_view_resumes || freshUserData.permissions.can_view_resumes_granular)) hasPermission = true;
        if (perm.code === 'resumes:update' && (freshUserData.permissions.can_upload_resumes || freshUserData.permissions.can_update_resumes)) hasPermission = true;
        if (perm.code === 'resumes:delete' && freshUserData.permissions.can_delete_resumes) hasPermission = true;

        // Internal Database
        if (perm.code === 'internal_db:read' && (freshUserData.permissions.can_access_internal_db || freshUserData.permissions.can_view_internal_db)) hasPermission = true;
        if (perm.code === 'internal_db:create' && freshUserData.permissions.can_create_internal_db) hasPermission = true;
        if (perm.code === 'internal_db:update' && freshUserData.permissions.can_update_internal_db) hasPermission = true;
        if (perm.code === 'internal_db:delete' && freshUserData.permissions.can_delete_internal_db) hasPermission = true;

        // Assessments
        if (perm.code === 'assessments:create' && freshUserData.permissions.can_create_assessments) hasPermission = true;
        if (perm.code === 'assessments:read' && freshUserData.permissions.can_view_assessments) hasPermission = true;
        if (perm.code === 'assessments:update' && freshUserData.permissions.can_update_assessments) hasPermission = true;
        if (perm.code === 'assessments:delete' && freshUserData.permissions.can_delete_assessments) hasPermission = true;

        // Analytics
        if (perm.code === 'analytics:read' && (freshUserData.permissions.can_view_analytics || freshUserData.permissions.can_view_analytics_granular)) hasPermission = true;
        if (perm.code === 'analytics:export' && freshUserData.permissions.can_export_analytics) hasPermission = true;

        // Settings
        if (perm.code === 'settings:read' && freshUserData.permissions.can_view_settings) hasPermission = true;
        if (perm.code === 'settings:update' && (freshUserData.permissions.can_manage_settings || freshUserData.permissions.can_update_settings)) hasPermission = true;
        if (perm.code === 'settings:delete' && freshUserData.permissions.can_delete_settings) hasPermission = true;

        // Users
        if (perm.code === 'users:read' && freshUserData.permissions.can_view_users) hasPermission = true;
        if (perm.code === 'users:create' && freshUserData.permissions.can_create_users) hasPermission = true;
        if (perm.code === 'users:update' && (freshUserData.permissions.can_manage_users || freshUserData.permissions.can_update_users)) hasPermission = true;
        if (perm.code === 'users:delete' && freshUserData.permissions.can_delete_users) hasPermission = true;

        // Roles
        if (perm.code === 'roles:read' && freshUserData.permissions.can_view_roles) hasPermission = true;
        if (perm.code === 'roles:create' && freshUserData.permissions.can_create_roles) hasPermission = true;
        if (perm.code === 'roles:update' && freshUserData.permissions.can_update_roles) hasPermission = true;
        if (perm.code === 'roles:delete' && freshUserData.permissions.can_delete_roles) hasPermission = true;

        // Billing
        if (perm.code === 'billing:read' && (freshUserData.permissions.can_view_billing || freshUserData.permissions.can_view_billing_granular)) hasPermission = true;
        if (perm.code === 'billing:update' && freshUserData.permissions.can_update_billing) hasPermission = true;
        if (perm.code === 'billing:manage' && freshUserData.permissions.can_manage_billing) hasPermission = true;

        // Invoices
        if (perm.code === 'invoices:read' && (freshUserData.permissions.can_view_invoices || freshUserData.permissions.can_view_invoices_granular)) hasPermission = true;
        if (perm.code === 'invoices:create' && freshUserData.permissions.can_create_invoices) hasPermission = true;
        if (perm.code === 'invoices:update' && freshUserData.permissions.can_update_invoices) hasPermission = true;
        if (perm.code === 'invoices:delete' && freshUserData.permissions.can_delete_invoices) hasPermission = true;

        // Usage
        if (perm.code === 'usage:read' && (freshUserData.permissions.can_view_usage || freshUserData.permissions.can_view_usage_granular)) hasPermission = true;
        if (perm.code === 'usage:manage' && freshUserData.permissions.can_manage_usage) hasPermission = true;

        if (hasPermission) {
          currentPermissionIds.add(perm.id);
          console.log('[EDIT USER] ✓ Matched permission:', perm.code, 'ID:', perm.id);
        }
      });
        console.log('[EDIT USER] Fallback mapping complete. Total permissions found:', currentPermissionIds.size);
      }  // Close the else block

      // Set the user's CURRENT permissions (not role defaults)
      setEditSelectedPermissionIds(currentPermissionIds);
      // Store original permissions for comparison later
      setEditOriginalPermissionIds(new Set(currentPermissionIds));
      setEditOriginalRoleId(matchingRole?.id || null);

      // Also initialize permission codes based on permission IDs
      const currentPermissionCodes = new Set<string>();
      currentPermissionIds.forEach(id => {
        const perm = allPermissions.find(p => p.id === id);
        if (perm) {
          currentPermissionCodes.add(perm.code);
        }
      });
      setEditSelectedPermissionCodes(currentPermissionCodes);

      console.log(`[EDIT USER] Pre-selected ${currentPermissionIds.size} permissions for user ${user.email}`);
      console.log(`[EDIT USER] Permission codes:`, Array.from(currentPermissionCodes));
    } catch (error) {
      console.error('Error fetching user permissions for edit:', error);
      // Fallback to empty permissions if fetch fails
      setEditSelectedPermissionIds(new Set());
      setEditOriginalPermissionIds(new Set());
    }

    // Parse email to extract username part for editing
    if (user.email && user.email.includes('@')) {
      const username = user.email.split('@')[0];
      setEditEmailUsername(username);
    } else {
      setEditEmailUsername('');
    }
  };

  const resetEditModal = () => {
    setEditingUser(null);
    setEditSelectedRoleId(null);
    setEditSelectedPermissionIds(new Set());
    setEditOriginalPermissionIds(new Set());
    setEditSelectedPermissionCodes(new Set()); // Reset permission codes
    setEditOriginalRoleId(null);
    setEditEmailUsername('');
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this user?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/users/${id}/deactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle last admin deactivation blocked
        if (errorData.detail?.error === 'LAST_ADMIN_DEACTIVATION_BLOCKED') {
          toast.error(errorData.detail.message || 'Cannot deactivate the last admin user');
        } else {
          toast.error(errorData.detail?.message || errorData.detail || 'Failed to deactivate user');
        }
        return;
      }

      toast.success('User deactivated successfully');
      refreshLimits(); // Refresh user limits count
      setSeatQuotaRefreshTrigger(prev => prev + 1); // Refresh SeatQuotaCard
      loadUsers();
    } catch (error: any) {
      console.error('Error deactivating user:', error);
      toast.error(error.message || 'Failed to deactivate user');
    }
  };

  const handleToggleActive = async (user: ApiUser) => {
    try {
      const endpoint = user.is_active ? 'deactivate' : 'activate';
      const response = await fetch(`${API_URL}/users/${user.id}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle specific errors
        if (errorData.detail?.error === 'USER_LIMIT_EXCEEDED') {
          toast.error(errorData.detail.message || 'User limit exceeded. Please upgrade your plan.');
        } else if (errorData.detail?.error === 'LAST_ADMIN_DEACTIVATION_BLOCKED') {
          toast.error(errorData.detail.message || 'Cannot deactivate the last admin user');
        } else {
          toast.error(errorData.detail?.message || errorData.detail || 'Failed to update user status');
        }
        return;
      }

      toast.success(user.is_active ? 'User deactivated' : 'User activated');
      refreshLimits(); // Refresh user limits count
      setSeatQuotaRefreshTrigger(prev => prev + 1); // Refresh SeatQuotaCard
      loadUsers();
    } catch (error: any) {
      console.error('Error toggling user status:', error);
      toast.error(error.message || 'Failed to update user status');
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    if (!editSelectedRoleId) {
      toast.error('Please select a role');
      return;
    }

    const selectedRole = availableRoles.find(r => r.id === editSelectedRoleId);
    const roleCode = selectedRole?.code || editingUser.role;

    // Check if role has changed
    const roleChanged = editSelectedRoleId !== editOriginalRoleId;

    // Check if permissions have changed
    const permissionsChanged =
      editSelectedPermissionIds.size !== editOriginalPermissionIds.size ||
      ![...editSelectedPermissionIds].every(id => editOriginalPermissionIds.has(id));

    // Reconstruct full email from username + domain
    const fullEmail = editEmailUsername && tenantEmailDomain
      ? `${editEmailUsername}@${tenantEmailDomain}`
      : editingUser.email;

    // Build request body
    const requestBody: any = {
      name: editingUser.name,
      email: fullEmail,
      role: roleCode,
      role_id: editSelectedRoleId,
    };

    // Only include permission_ids if they were explicitly changed
    // Backend logic:
    // - If permission_ids provided → use those
    // - If role changed and no permission_ids → use new role defaults
    // - If role NOT changed and no permission_ids → preserve existing
    if (permissionsChanged) {
      requestBody.permission_ids = Array.from(editSelectedPermissionIds);
      requestBody.permission_codes = Array.from(editSelectedPermissionCodes); // Also send codes for future backend support
      console.log('[EDIT USER] Permissions changed, sending updated permission_ids');
      console.log('[EDIT USER] Selected permission codes:', Array.from(editSelectedPermissionCodes));
    } else if (roleChanged) {
      // Role changed but permissions weren't explicitly modified
      // Don't send permission_ids - backend will apply new role defaults
      console.log('[EDIT USER] Role changed, backend will apply new role defaults');
    } else {
      // Neither role nor permissions changed
      // Don't send permission_ids - backend will preserve existing
      console.log('[EDIT USER] No changes to role or permissions, backend will preserve existing');
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(requestBody),
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.detail?.error === 'LAST_ADMIN_ROLE_CHANGE_BLOCKED') {
          toast.error(errorData.detail.message || 'Cannot change role of the last admin user');
        } else {
          toast.error(errorData.detail?.message || errorData.detail || 'Failed to update user');
        }
        return;
      }

      toast.success('User updated successfully');
      resetEditModal();
      loadUsers();
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast.error(error.message || 'Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr || dateStr === '-') return '-';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
              <UserCog className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
              <p className="text-sm text-gray-600">Manage users and their permissions</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* RBAC07: Dependency Matrix button */}
            <button
              onClick={() => setIsDependencyMatrixOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              title="View Feature Dependencies"
            >
              <Link2 className="w-5 h-5" />
              Dependencies
            </button>
            {/* RBAC01: Check user limits before showing Add User button */}
            <button
              onClick={() => {
                if (isAtLimit) {
                  toast.error('User limit reached. Please upgrade your plan or deactivate existing users.');
                  return;
                }
                setIsCreateModalOpen(true);
              }}
              disabled={isAtLimit}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors shadow-md ${
                isAtLimit
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-gray-800 text-white hover:bg-gray-700'
              }`}
            >
              <Plus className="w-5 h-5" />
              Add User
            </button>
          </div>
        </div>

        {/* RBAC01: User Limits - always visible */}
        <div className="mt-6 space-y-4">
          <UserLimits compact refreshTrigger={seatQuotaRefreshTrigger} />
          {/* Addon card - only shows when quota exhausted */}
          <SeatQuotaCard
            onRefresh={() => { loadUsers(); refreshLimits(); }}
            compact
            refreshTrigger={seatQuotaRefreshTrigger}
          />
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
          />
        </div>
      </div>

      {/* Stats Cards - Dynamic based on available roles */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Total Users</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">{users.length}</p>
        </div>
        {availableRoles.slice(0, 3).map((role, index) => (
          <div key={role.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <p className="text-sm text-gray-600">{role.name}s</p>
            <p className={`text-3xl font-semibold mt-1 ${
              index === 0 ? 'text-gray-800' : index === 1 ? 'text-gray-700' : 'text-gray-600'
            }`}>
              {users.filter(u => u.role.toLowerCase() === role.code.toLowerCase() ||
                (role.code.toLowerCase() === 'admin' && u.role.toLowerCase() === 'tenant_admin')).length}
            </p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-gray-700 animate-spin" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Permissions
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        user.role.toLowerCase() === 'tenant_admin' || user.role.toLowerCase() === 'admin'
                          ? 'bg-gray-800'
                          : user.role.toLowerCase() === 'recruiter'
                          ? 'bg-gray-700'
                          : 'bg-gray-600'
                      }`}>
                        <span className="text-white text-sm font-medium">
                          {(user.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{user.name || user.email || 'Unknown'}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role, availableRoles)}`}>
                      {getRoleLabel(user.role, availableRoles)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {Object.entries(user.permissions)
                        .filter(([, value]) => value)
                        .slice(0, 3)
                        .map(([key]) => (
                          <span
                            key={key}
                            className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                          >
                            {permissionLabels[key as keyof UserPermissions]}
                          </span>
                        ))}
                      {Object.values(user.permissions).filter(v => v).length > 3 && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                          +{Object.values(user.permissions).filter(v => v).length - 3} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(user)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                        user.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {formatDate(user.last_login)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {/* RBAC06: Feature Permissions button - Hide ONLY for tenant admins (Super Admin with all permissions) */}
                      {user.role.toLowerCase() !== 'tenant_admin' && (
                        <button
                          onClick={() => setFeaturePermissionUser(user)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Feature Permissions"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Hide Edit button ONLY for tenant admins and current user */}
                      {user.role.toLowerCase() !== 'tenant_admin' && user.id !== currentUserId && (
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit User"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      {/* Hide Deactivate button ONLY for tenant admins and current user */}
                      {user.role.toLowerCase() !== 'tenant_admin' && user.id !== currentUserId && (
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Deactivate User"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!isLoading && filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <UserCog className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No users found</p>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Create New User</h2>
              <button
                onClick={resetCreateModal}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Enter full name"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>

                {/* Email input with locked domain */}
                <div className="relative flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-gray-600 overflow-hidden">
                  {/* Username input */}
                  <input
                    type="text"
                    value={emailUsername}
                    onChange={(e) => {
                      let value = e.target.value;
                      const hadAtSymbol = value.includes('@');

                      // Remove @ symbol if user tries to type it
                      value = value.replace(/@/g, '');

                      // Show brief message if @ was blocked
                      if (hadAtSymbol && value !== e.target.value) {
                        setShowAtBlockedMessage(true);
                        setTimeout(() => setShowAtBlockedMessage(false), 2000);
                      }

                      setEmailUsername(value);
                      checkEmailAvailability(value);
                    }}
                    placeholder="username"
                    className="flex-1 px-4 py-2.5 border-0 focus:outline-none focus:ring-0"
                  />

                  {/* @ symbol and locked domain */}
                  <div className="flex items-center px-4 py-2.5 bg-gray-100 text-gray-600 font-medium border-l border-gray-300">
                    <span className="text-gray-900">@</span>
                    <span className="ml-1">
                      {tenantEmailDomain || 'loading...'}
                    </span>
                  </div>
                </div>

                {/* Preview of full email */}
                {emailUsername && tenantEmailDomain && (
                  <div className="mt-1 text-xs text-gray-500">
                    Full email: <span className="font-medium">{emailUsername}@{tenantEmailDomain}</span>
                  </div>
                )}

                {/* @ symbol blocked message */}
                {showAtBlockedMessage && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-700">
                      ℹ️ Just type the username. Domain is added automatically.
                    </p>
                  </div>
                )}

                {/* Email validation feedback */}
                {isCheckingEmail && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Validating email...</span>
                  </div>
                )}

                {emailCheckResult.error && (
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-red-800 font-medium">
                          {emailCheckResult.error}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Min. 6 characters"
                    className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role <span className="text-red-500">*</span>
                </label>
                {/* Role Selection Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {availableRoles.map(role => {
                    const isSelected = selectedRoleId === role.id;
                    const isSystemRole = role.is_system;

                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => selectRole(role.id)}
                        className={`relative p-3 rounded-lg border-2 text-left transition-all ${
                          isSelected
                            ? 'border-gray-800 bg-gray-50 ring-1 ring-gray-800'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`font-medium truncate ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                              {role.name}
                            </span>
                            {isSystemRole && (
                              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                System
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{role.description}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
                {availableRoles.length === 0 && (
                  <div className="text-center py-4 text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg">
                    No roles available. Create roles in Role Management first.
                  </div>
                )}
              </div>

              {/* Role Permissions - Read-only display of what the selected role has */}
              {selectedRoleId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Role Permissions
                    </label>
                    <span className="text-xs text-gray-500">
                      {selectedPermissionCodes.size} permissions assigned
                    </span>
                  </div>
                  {isLoadingPermissions ? (
                    <div className="flex items-center justify-center py-3 border border-gray-200 rounded-lg bg-gray-50">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                      <span className="ml-2 text-sm text-gray-500">Loading...</span>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                      {CUSTOM_PERMISSION_CATEGORIES.map(category => {
                        // Check if any permission in this category is selected
                        const hasAnyPermission = () => {
                          if (category.actions) {
                            if (category.actions.some(a => selectedPermissionCodes.has(a.code))) return true;
                          }
                          if (category.subCategories) {
                            for (const sub of category.subCategories) {
                              if (sub.actions.some(a => selectedPermissionCodes.has(a.code))) return true;
                            }
                          }
                          return false;
                        };

                        // Only show categories that have at least one permission
                        if (!hasAnyPermission()) return null;

                        // Collect all selected actions for this category
                        const selectedActions: string[] = [];
                        if (category.actions) {
                          category.actions.filter(a => selectedPermissionCodes.has(a.code)).forEach(a => selectedActions.push(a.label));
                        }
                        if (category.subCategories) {
                          category.subCategories.forEach(sub => {
                            sub.actions.filter(a => selectedPermissionCodes.has(a.code)).forEach(a => {
                              selectedActions.push(`${sub.name}: ${a.label}`);
                            });
                          });
                        }

                        return (
                          <div key={category.id} className="flex items-start gap-2">
                            <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded flex items-center justify-center mt-0.5">
                              <Check className="w-3 h-3 text-green-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900">
                                {category.name}
                                {category.isMenuToggle && (
                                  <span className="ml-2 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                    Menu Access
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {selectedActions.join(' • ')}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Show message if no custom permissions found */}
                      {selectedPermissionCodes.size === 0 && (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          No permissions assigned to this role yet.
                          <br />
                          <span className="text-xs">Configure permissions in Role Management.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={resetCreateModal}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={isSaving || !emailCheckResult.available || isCheckingEmail}
                className="px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Edit User</h2>
              <button
                onClick={resetEditModal}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                {/* Email input with locked domain */}
                <div className="relative flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-gray-600 overflow-hidden">
                  {/* Username input */}
                  <input
                    type="text"
                    value={editEmailUsername}
                    onChange={(e) => {
                      let value = e.target.value;
                      // Remove @ symbol if user tries to type it
                      value = value.replace(/@/g, '');
                      setEditEmailUsername(value);
                    }}
                    placeholder="username"
                    className="flex-1 px-4 py-2.5 border-0 focus:outline-none focus:ring-0"
                  />

                  {/* @ symbol and locked domain */}
                  <div className="flex items-center px-4 py-2.5 bg-gray-100 text-gray-600 font-medium border-l border-gray-300">
                    <span className="text-gray-900">@</span>
                    <span className="ml-1">
                      {tenantEmailDomain || 'loading...'}
                    </span>
                  </div>
                </div>

                {/* Preview of full email */}
                {editEmailUsername && tenantEmailDomain && (
                  <div className="mt-1 text-xs text-gray-500">
                    Full email: <span className="font-medium">{editEmailUsername}@{tenantEmailDomain}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role <span className="text-red-500">*</span>
                </label>
                {/* Role Selection Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {availableRoles.map(role => {
                    const isSelected = editSelectedRoleId === role.id;
                    const isSystemRole = role.is_system;

                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => selectRole(role.id, true)}
                        className={`relative p-3 rounded-lg border-2 text-left transition-all ${
                          isSelected
                            ? 'border-gray-800 bg-gray-50 ring-1 ring-gray-800'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                            {role.name}
                          </span>
                          {isSelected && (
                            <div className="w-5 h-5 bg-gray-800 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{role.description}</p>
                        )}
                        {isSystemRole && (
                          <span className="absolute top-1 right-1 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            System
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Role Permissions - Read-only display of what the selected role has */}
              {editSelectedRoleId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Role Permissions
                    </label>
                    <span className="text-xs text-gray-500">
                      {editSelectedPermissionCodes.size} permissions assigned
                    </span>
                  </div>
                  {isLoadingPermissions ? (
                    <div className="flex items-center justify-center py-3 border border-gray-200 rounded-lg bg-gray-50">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                      <span className="ml-2 text-sm text-gray-500">Loading...</span>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                      {CUSTOM_PERMISSION_CATEGORIES.map(category => {
                        // Check if any permission in this category is selected
                        const hasAnyPermission = () => {
                          if (category.actions) {
                            if (category.actions.some(a => editSelectedPermissionCodes.has(a.code))) return true;
                          }
                          if (category.subCategories) {
                            for (const sub of category.subCategories) {
                              if (sub.actions.some(a => editSelectedPermissionCodes.has(a.code))) return true;
                            }
                          }
                          return false;
                        };

                        // Only show categories that have at least one permission
                        if (!hasAnyPermission()) return null;

                        // Collect all selected actions for this category
                        const selectedActions: string[] = [];
                        if (category.actions) {
                          category.actions.filter(a => editSelectedPermissionCodes.has(a.code)).forEach(a => selectedActions.push(a.label));
                        }
                        if (category.subCategories) {
                          category.subCategories.forEach(sub => {
                            sub.actions.filter(a => editSelectedPermissionCodes.has(a.code)).forEach(a => {
                              selectedActions.push(`${sub.name}: ${a.label}`);
                            });
                          });
                        }

                        return (
                          <div key={category.id} className="flex items-start gap-2">
                            <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded flex items-center justify-center mt-0.5">
                              <Check className="w-3 h-3 text-green-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900">
                                {category.name}
                                {category.isMenuToggle && (
                                  <span className="ml-2 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                    Menu Access
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {selectedActions.join(' • ')}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Show message if no custom permissions found */}
                      {editSelectedPermissionCodes.size === 0 && (
                        <div className="text-center py-3 text-gray-500 text-sm">
                          No permissions assigned to this role.
                          <span className="block text-xs mt-1">Configure in Role Management.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={resetEditModal}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateUser}
                disabled={isSaving}
                className="px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RBAC06: Feature Permission Manager Modal */}
      {featurePermissionUser && (
        <FeaturePermissionManager
          userId={featurePermissionUser.id}
          userName={featurePermissionUser.name}
          userRole={featurePermissionUser.role as UserRole}
          isOpen={true}
          onClose={() => setFeaturePermissionUser(null)}
          onUpdate={() => loadUsers()}
        />
      )}

      {/* RBAC07: Dependency Matrix Modal */}
      <DependencyMatrix
        isOpen={isDependencyMatrixOpen}
        onClose={() => setIsDependencyMatrixOpen(false)}
      />
    </main>
  );
}
