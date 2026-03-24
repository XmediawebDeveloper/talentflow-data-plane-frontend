'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  CUSTOM_PERMISSION_CATEGORIES,
  type CustomPermissionAction,
  type CustomPermissionCategory,
  type CustomPermissionSubCategory,
} from '@/lib/constants/permissionCategories';
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
  Shield,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { handleUnauthorized } from '@/lib/services/api';
import authService from '@/lib/services/authService';
import rbacService from '@/lib/services/rbacService';
import userService from '@/lib/services/userService';
import { RoleListItem, Permission } from '@/lib/types/rbac';
import { UserRole } from '@/lib/types/tenant';
import FeaturePermissionManager from './FeaturePermissionManager';
import DependencyMatrix from './DependencyMatrix';
import { useUserLimits } from './UserLimits';
import SeatQuotaCard from './SeatQuotaCard';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuota } from '@/contexts/QuotaContext';
import { usePlanFeaturesContext } from '@/components/providers/PlanFeaturesProvider';
import { formatISTDate, formatIST } from '@/lib/utils/dateUtils';

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

// ⚠️  Permission categories are defined in ONE place:
//     lib/constants/permissionCategories.ts
// Edit that file to change permissions across all three UIs simultaneously.
// CUSTOM_PERMISSION_CATEGORIES imported from '@/lib/constants/permissionCategories'


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

// Helper to get a human-readable display name for a permission code
const getPermissionDisplayName = (code: string): string => {
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    const action = cat.actions?.find(a => a.code === code);
    if (action) return action.label;
    for (const sub of cat.subCategories || []) {
      const subAction = sub.actions.find(a => a.code === code);
      if (subAction) return `${subAction.label} (${sub.name})`;
    }
  }
  return code;
};

// Helper to get which currently-enabled permissions block disabling the given code
const getBlockingPermissions = (code: string, currentCodes: Set<string>): string[] => {
  const blockers: string[] = [];
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    if (cat.dependencies) {
      for (const [depender, deps] of Object.entries(cat.dependencies)) {
        if (deps.includes(code) && currentCodes.has(depender)) {
          blockers.push(getPermissionDisplayName(depender));
        }
      }
    }
  }
  return blockers;
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
  const { user: currentUser, refreshUser } = useAuth();
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
  const [editOriginalPermissionCodes, setEditOriginalPermissionCodes] = useState<Set<string>>(new Set());

  // RBAC06-07: Feature permission states
  const [featurePermissionUser, setFeaturePermissionUser] = useState<ApiUser | null>(null);
  const [isDependencyMatrixOpen, setIsDependencyMatrixOpen] = useState(false);

  // RBAC01: User limits hook
  const { limits, isAtLimit, canAddUsers, refresh: refreshLimits } = useUserLimits();
  const { quotaData } = useQuota();
  const isTrial = quotaData?.is_trial ?? false;

  // Plan feature flags from /quota-status (via PlanFeaturesProvider)
  const { hasPlanFeature } = usePlanFeaturesContext();

  // Refresh trigger for SeatQuotaCard
  const [seatQuotaRefreshTrigger, setSeatQuotaRefreshTrigger] = useState(0);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  // View role permissions popup (same as RoleManagement view modal)
  const [viewingRolePopup, setViewingRolePopup] = useState<RoleListItem | null>(null);
  const [viewingRolePopupPermissions, setViewingRolePopupPermissions] = useState<Permission[]>([]);
  const [isViewingRolePopupLoading, setIsViewingRolePopupLoading] = useState(false);

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'viewer',
    permissions: { ...defaultPermissions },
  });


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

  // Component lifecycle tracking
  useEffect(() => {
    console.log('[COMPONENT LIFECYCLE] UserManagement component mounted');
    return () => {
      console.log('[COMPONENT LIFECYCLE] UserManagement component unmounting');
    };
  }, []);

  // Track allPermissions state changes
  useEffect(() => {
    console.log('[STATE CHANGE] allPermissions changed. New count:', allPermissions.length);
    if (allPermissions.length > 0) {
      console.log('[STATE CHANGE] First 3 permissions:', allPermissions.slice(0, 3));
    } else {
      console.warn('[STATE CHANGE] ⚠️  allPermissions is EMPTY!');
    }
  }, [allPermissions]);

  const loadAllPermissions = async (): Promise<Permission[]> => {
    console.log('[LOAD PERMISSIONS] Starting to load permissions...');
    try {
      const data = await rbacService.getPermissions();
      console.log('[LOAD PERMISSIONS] Received data:', data);
      console.log('[LOAD PERMISSIONS] Permissions count:', data.permissions?.length || 0);
      if (data.permissions && data.permissions.length > 0) {
        console.log('[LOAD PERMISSIONS] First 3 permissions:', data.permissions.slice(0, 3));
      }
      setAllPermissions(data.permissions);
      console.log('[LOAD PERMISSIONS] ✓ allPermissions state updated successfully');
      return data.permissions;
    } catch (error) {
      console.error('[LOAD PERMISSIONS] ✗ Failed to load permissions:', error);
      return [];
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

  const handleViewRolePopup = async (role: RoleListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setViewingRolePopup(role);
    setIsViewingRolePopupLoading(true);
    setViewingRolePopupPermissions([]);
    try {
      const details = await rbacService.getRoleById(role.id);
      setViewingRolePopupPermissions(details.permissions || []);
    } catch {
      setViewingRolePopupPermissions([]);
    } finally {
      setIsViewingRolePopupLoading(false);
    }
  };

  // Toggle permission selection for create modal
  const togglePermission = (permissionId: number) => {
    setSelectedPermissionIds(prev => {
      const newSet = new Set(prev);
      const toggledPermission = allPermissions.find(p => p.id === permissionId);

      if (!toggledPermission) return newSet;

      const isEnabling = !newSet.has(permissionId);

      if (isEnabling) {
        newSet.add(permissionId);
      } else {
        newSet.delete(permissionId);
      }

      // CASCADING LOGIC: If toggling a view permission (parent), toggle all related actions (children)
      // Find which category this permission belongs to
      for (const category of CUSTOM_PERMISSION_CATEGORIES) {
        // Check if this is a top-level viewCode
        if (category.viewCode === toggledPermission.code) {
          // Get all related action permissions
          const relatedCodes = new Set<string>();

          if (category.actions) {
            category.actions.forEach(action => relatedCodes.add(action.code));
          }

          if (category.subCategories) {
            category.subCategories.forEach(sub => {
              sub.actions?.forEach(action => relatedCodes.add(action.code));
            });
          }

          // SPECIAL CASE: If toggling Assessments, also toggle "Apply for Assessment" in other categories
          if (toggledPermission.code === 'assessments:read') {
            relatedCodes.add('my_resumes:apply_assessment');
            relatedCodes.add('internal_db:apply_assessment');
          }

          // Toggle all related permissions
          allPermissions.forEach(perm => {
            if (relatedCodes.has(perm.code)) {
              if (isEnabling) {
                newSet.add(perm.id);
              } else {
                newSet.delete(perm.id);
              }
            }
          });

          console.log(`[CASCADING] ${isEnabling ? 'Enabled' : 'Disabled'} ${toggledPermission.code} and ${relatedCodes.size} related permissions`);
          break;
        }

        // Check if this is a subcategory viewCode
        if (category.subCategories) {
          for (const sub of category.subCategories) {
            if (sub.viewCode === toggledPermission.code) {
              // Get all actions in this subcategory
              const relatedCodes = new Set<string>();
              sub.actions?.forEach(action => relatedCodes.add(action.code));

              // SPECIAL CASE: If toggling Assessments, also toggle "Apply for Assessment" in other categories
              if (toggledPermission.code === 'assessments:read') {
                relatedCodes.add('my_resumes:apply_assessment');
                relatedCodes.add('internal_db:apply_assessment');
                console.log('[CASCADING] Added cross-category: my_resumes:apply_assessment, internal_db:apply_assessment');
              }

              // Toggle all related permissions
              const toggledPermissions: string[] = [];
              allPermissions.forEach(perm => {
                if (relatedCodes.has(perm.code)) {
                  if (isEnabling) {
                    newSet.add(perm.id);
                  } else {
                    newSet.delete(perm.id);
                  }
                  toggledPermissions.push(perm.code);
                }
              });

              console.log(`[CASCADING] ${isEnabling ? 'Enabled' : 'Disabled'} ${toggledPermission.code}`);
              console.log(`[CASCADING] Related codes to toggle:`, Array.from(relatedCodes));
              console.log(`[CASCADING] Actually toggled ${toggledPermissions.length} permissions:`, toggledPermissions);
              break;
            }
          }
        }
      }

      return newSet;
    });
  };

  // Toggle permission selection for edit modal
  const toggleEditPermission = (permissionId: number) => {
    setEditSelectedPermissionIds(prev => {
      const newSet = new Set(prev);
      const toggledPermission = allPermissions.find(p => p.id === permissionId);

      if (!toggledPermission) return newSet;

      const isEnabling = !newSet.has(permissionId);

      if (isEnabling) {
        newSet.add(permissionId);
      } else {
        newSet.delete(permissionId);
      }

      // CASCADING LOGIC: If toggling a view permission (parent), toggle all related actions (children)
      // Find which category this permission belongs to
      for (const category of CUSTOM_PERMISSION_CATEGORIES) {
        // Check if this is a top-level viewCode
        if (category.viewCode === toggledPermission.code) {
          // Get all related action permissions
          const relatedCodes = new Set<string>();

          if (category.actions) {
            category.actions.forEach(action => relatedCodes.add(action.code));
          }

          if (category.subCategories) {
            category.subCategories.forEach(sub => {
              sub.actions?.forEach(action => relatedCodes.add(action.code));
            });
          }

          // SPECIAL CASE: If toggling Assessments, also toggle "Apply for Assessment" in other categories
          if (toggledPermission.code === 'assessments:read') {
            relatedCodes.add('my_resumes:apply_assessment');
            relatedCodes.add('internal_db:apply_assessment');
          }

          // Toggle all related permissions
          allPermissions.forEach(perm => {
            if (relatedCodes.has(perm.code)) {
              if (isEnabling) {
                newSet.add(perm.id);
              } else {
                newSet.delete(perm.id);
              }
            }
          });

          console.log(`[CASCADING EDIT] ${isEnabling ? 'Enabled' : 'Disabled'} ${toggledPermission.code} and ${relatedCodes.size} related permissions`);
          break;
        }

        // Check if this is a subcategory viewCode
        if (category.subCategories) {
          for (const sub of category.subCategories) {
            if (sub.viewCode === toggledPermission.code) {
              // Get all actions in this subcategory
              const relatedCodes = new Set<string>();
              sub.actions?.forEach(action => relatedCodes.add(action.code));

              // SPECIAL CASE: If toggling Assessments, also toggle "Apply for Assessment" in other categories
              if (toggledPermission.code === 'assessments:read') {
                relatedCodes.add('my_resumes:apply_assessment');
                relatedCodes.add('internal_db:apply_assessment');
                console.log('[CASCADING EDIT] Added cross-category: my_resumes:apply_assessment, internal_db:apply_assessment');
              }

              // Toggle all related permissions
              const toggledPermissions: string[] = [];
              allPermissions.forEach(perm => {
                if (relatedCodes.has(perm.code)) {
                  if (isEnabling) {
                    newSet.add(perm.id);
                  } else {
                    newSet.delete(perm.id);
                  }
                  toggledPermissions.push(perm.code);
                }
              });

              console.log(`[CASCADING EDIT] ${isEnabling ? 'Enabled' : 'Disabled'} ${toggledPermission.code}`);
              console.log(`[CASCADING EDIT] Related codes to toggle:`, Array.from(relatedCodes));
              console.log(`[CASCADING EDIT] Actually toggled ${toggledPermissions.length} permissions:`, toggledPermissions);
              break;
            }
          }
        }
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
  const checkEmailAvailability = async (email: string) => {
    // Clear previous timeout
    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current);
    }

    // Reset validation state
    setEmailCheckResult({ error: null, available: true });

    // Skip validation if email is empty or not a valid-looking email
    if (!email || !email.includes('@')) {
      return;
    }

    // Set loading state
    setIsCheckingEmail(true);

    // Debounce - wait 500ms after user stops typing
    emailCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await userService.checkEmailAvailability(email);

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
      console.log('[LOAD USERS] Raw data from API:', data.users?.slice(0, 2) || data.slice(0, 2));
      const mappedUsers: ApiUser[] = (data.users || data).map((user: any) => ({
        id: user.id.toString(),
        user_display_id: user.user_display_id,
        name: user.name || user.full_name,
        email: user.email,
        role: user.role || 'viewer',
        permissions: user.permissions || defaultPermissions,
        is_active: user.is_active ?? true,
        last_login: user.last_login,
      }));

      // DEBUG: Log loaded users
      console.log('[LOAD USERS] Loaded', mappedUsers.length, 'users');
      console.log('[LOAD USERS] User IDs:', mappedUsers.map(u => `${u.email}: ${u.id}`).join(', '));

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
    if (!newUser.name || !newUser.email) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!newUser.email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!selectedRoleId) {
      toast.error('Please select a role');
      return;
    }

    // Check email validation
    if (!emailCheckResult.available) {
      toast.error(emailCheckResult.error || 'Email validation failed');
      return;
    }

    const selectedRole = availableRoles.find(r => r.id === selectedRoleId);
    const roleCode = selectedRole?.code || 'viewer';

    setIsSaving(true);
    try {
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
          email: newUser.email,
          // No password — backend generates a temp password and emails the user
          role: roleCode,
          role_id: selectedRoleId,
          permission_ids: Array.from(selectedPermissionIds),
          permission_codes: Array.from(selectedPermissionCodes),
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

      toast.success('User created! An invite email has been sent with their login details.');
      resetCreateModal();
      refreshLimits(); // Refresh user limits count
      setSeatQuotaRefreshTrigger(prev => prev + 1); // Refresh SeatQuotaCard
      // Small delay to let backend finish RBAC sync before re-fetching
      setTimeout(() => { loadUsers(); refreshUser(); }, 300);
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
      role: 'viewer',
      permissions: { ...defaultPermissions },
    });
    setEmailCheckResult({ error: null, available: true }); // Reset validation
    setSelectedRoleId(null);
    setSelectedPermissionIds(new Set());
    setSelectedPermissionCodes(new Set()); // Reset permission codes
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

      // Ensure permissions are loaded before mapping — handles race condition when user
      // opens edit modal before loadAllPermissions() has finished on mount.
      const permissionsForMapping = allPermissions.length > 0 ? allPermissions : await loadAllPermissions();

      // Use permission_ids directly from backend response
      const currentPermissionIds = new Set<number>();

      // Backend now returns permission_ids array - use it directly!
      if (freshUserData.permission_ids && Array.isArray(freshUserData.permission_ids) && freshUserData.permission_ids.length > 0) {
        // User has explicit custom permissions - use them
        freshUserData.permission_ids.forEach((id: number) => {
          currentPermissionIds.add(id);
        });
        console.log('[EDIT USER] Loaded custom permission IDs from backend:', Array.from(currentPermissionIds));
      } else if (Array.isArray(freshUserData.permission_ids) && freshUserData.permission_ids.length === 0) {
        // Empty array: user has no custom permissions (e.g. newly invited user)
        // Fall back to role default permissions so the modal shows what they actually have
        const roleIdForDefaults = matchingRole?.id;
        if (roleIdForDefaults) {
          try {
            const rolePerms = await userService.getRolePermissions(roleIdForDefaults);
            rolePerms.permission_codes.forEach(code => {
              const perm = permissionsForMapping.find(p => p.code === code);
              if (perm) {
                currentPermissionIds.add(perm.id);
              }
            });
            console.log('[EDIT USER] Loaded role default permissions (user has no custom permissions):', Array.from(currentPermissionIds));
          } catch (e) {
            console.warn('[EDIT USER] Failed to load role defaults:', e);
          }
        } else {
          console.log('[EDIT USER] No role ID available, showing empty permissions');
        }
      } else {
        // Fallback: Map user's current permissions (boolean fields) to permission IDs if permission_ids not available
        console.log('[EDIT USER] permission_ids not available, falling back to boolean mapping');
        console.log('[EDIT USER] permissionsForMapping array length:', permissionsForMapping.length);
        console.log('[EDIT USER] freshUserData.permissions:', freshUserData.permissions);
        permissionsForMapping.forEach(perm => {
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

        // ✅ FIX: Scoring permissions
        if (perm.code === 'scoring:read' && freshUserData.permissions.can_view_scoring) hasPermission = true;
        if (perm.code === 'scoring:score' && freshUserData.permissions.can_run_scoring) hasPermission = true;

        // ✅ FIX: AI Match permissions
        if (perm.code === 'ai_match:read' && freshUserData.permissions.can_view_ai_match) hasPermission = true;
        if (perm.code === 'ai_match:run' && freshUserData.permissions.can_run_ai_match) hasPermission = true;

        // ✅ FIX: Other feature permissions
        if (perm.code === 'ai_interviews:run' && freshUserData.permissions.can_run_ai_interviews) hasPermission = true;
        if (perm.code === 'bulk_operations:execute' && freshUserData.permissions.can_bulk_operations) hasPermission = true;
        if (perm.code === 'export:execute' && freshUserData.permissions.can_export) hasPermission = true;
        if (perm.code === 'api:access' && freshUserData.permissions.can_api_access) hasPermission = true;
        if (perm.code === 'teams:view' && freshUserData.permissions.can_view_teams) hasPermission = true;

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
        const perm = permissionsForMapping.find(p => p.id === id);
        if (perm) {
          currentPermissionCodes.add(perm.code);
        }
      });
      setEditSelectedPermissionCodes(currentPermissionCodes);
      setEditOriginalPermissionCodes(new Set(currentPermissionCodes));

      console.log(`[EDIT USER] Pre-selected ${currentPermissionIds.size} permissions for user ${user.email}`);
      console.log(`[EDIT USER] Permission codes:`, Array.from(currentPermissionCodes));
    } catch (error) {
      console.error('Error fetching user permissions for edit:', error);
      // Fallback to empty permissions if fetch fails
      setEditSelectedPermissionIds(new Set());
      setEditOriginalPermissionIds(new Set());
    }

  };

  const resetEditModal = () => {
    setEditingUser(null);
    setEditSelectedRoleId(null);
    setEditSelectedPermissionIds(new Set());
    setEditOriginalPermissionIds(new Set());
    setEditSelectedPermissionCodes(new Set());
    setEditOriginalPermissionCodes(new Set()); // ⚠️ FIX: was missing — stale original codes caused incorrect permissionsChanged detection
    setEditOriginalRoleId(null);
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
    console.log('[UPDATE USER] Function called');
    console.log('[UPDATE USER] allPermissions state at function start:', {
      count: allPermissions.length,
      isArray: Array.isArray(allPermissions),
      isEmpty: allPermissions.length === 0
    });

    if (!editingUser) {
      console.error('[UPDATE USER] editingUser is null/undefined!');
      toast.error('No user selected for editing. Please try again.');
      return;
    }

    if (!editingUser.id) {
      console.error('[UPDATE USER] editingUser.id is missing!', editingUser);
      toast.error('Invalid user data. Please close and reopen the edit dialog.');
      return;
    }

    // Verify the user still exists in the list before attempting update
    // Use toString() comparison to guard against numeric vs string id type mismatch
    const userStillExists = users.some(u => u.id.toString() === editingUser.id.toString());
    if (!userStillExists) {
      console.error('[UPDATE USER] User no longer exists in the current list!', {
        editingUserId: editingUser.id,
        editingUserEmail: editingUser.email,
        currentUserIds: users.map(u => u.id)
      });
      toast.error('This user no longer exists or has been removed. Refreshing list...');
      resetEditModal();
      loadUsers();
      return;
    }

    if (!editSelectedRoleId) {
      toast.error('Please select a role');
      return;
    }

    const selectedRole = availableRoles.find(r => r.id === editSelectedRoleId);
    const roleCode = selectedRole?.code || editingUser.role;

    // Check if role has changed
    const roleChanged = editSelectedRoleId !== editOriginalRoleId;

    // Check if permissions have changed (compare codes - single source of truth)
    const permissionsChanged =
      editSelectedPermissionCodes.size !== editOriginalPermissionCodes.size ||
      ![...editSelectedPermissionCodes].every(code => editOriginalPermissionCodes.has(code));

    // Derive permission IDs from codes at save time (avoids stale dual-state bugs)
    const derivedPermissionIds: number[] = [];

    // DEBUG: Check if allPermissions is loaded
    if (allPermissions.length === 0) {
      console.error('[UPDATE USER CRITICAL] allPermissions is EMPTY! Cannot derive permission IDs');
      console.error('[UPDATE USER CRITICAL] This will cause permissions to NOT be saved!');
      toast.error('Permission system not loaded. Please refresh the page and try again.');
      setIsSaving(false);
      return;
    }

    console.log('[UPDATE USER] Deriving permission IDs from codes...');
    console.log('[UPDATE USER] allPermissions count:', allPermissions.length);
    console.log('[UPDATE USER] editSelectedPermissionCodes:', Array.from(editSelectedPermissionCodes));

    editSelectedPermissionCodes.forEach(code => {
      const perm = allPermissions.find(p => p.code === code);
      if (perm) {
        derivedPermissionIds.push(perm.id);
        console.log(`[UPDATE USER] ✓ ${code} → ID ${perm.id}`);
      } else {
        console.warn(`[UPDATE USER] ✗ ${code} → NOT FOUND in allPermissions!`);
      }
    });

    console.log('[UPDATE USER] Final derivedPermissionIds:', derivedPermissionIds);

    const fullEmail = editingUser.email;

    // Build request body
    const requestBody: any = {
      name: editingUser.name,
      email: fullEmail,
      role: roleCode,
      role_id: editSelectedRoleId,
    };

    // ALWAYS send permission_ids to ensure custom permissions are respected
    // This prevents the backend from applying role defaults when role changes
    requestBody.permission_ids = derivedPermissionIds;
    requestBody.permission_codes = Array.from(editSelectedPermissionCodes);

    if (permissionsChanged) {
      console.log('[EDIT USER] Permissions changed, sending updated permission_ids:', derivedPermissionIds);
    } else if (roleChanged) {
      console.log('[EDIT USER] Role changed, sending current permission_ids to preserve custom permissions:', derivedPermissionIds);
    } else {
      console.log('[EDIT USER] No changes detected, but sending current permission_ids to ensure consistency:', derivedPermissionIds);
    }

    // DEBUG LOGGING
    console.log('='.repeat(80));
    console.log('[UPDATE USER] Starting user update...');
    console.log('[UPDATE USER] User ID:', editingUser.id);
    console.log('[UPDATE USER] User Email:', editingUser.email);
    console.log('[UPDATE USER] API URL:', `${API_URL}/users/${editingUser.id}`);
    console.log('[UPDATE USER] Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('[UPDATE USER] Token exists:', !!localStorage.getItem('accessToken'));
    console.log('='.repeat(80));

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

        // DEBUG: Log error details
        console.error('='.repeat(80));
        console.error('[UPDATE USER ERROR] Update failed!');
        console.error('[UPDATE USER ERROR] Status:', response.status);
        console.error('[UPDATE USER ERROR] Status Text:', response.statusText);
        console.error('[UPDATE USER ERROR] Error Data:', JSON.stringify(errorData, null, 2));
        console.error('[UPDATE USER ERROR] User ID that failed:', editingUser.id);
        console.error('[UPDATE USER ERROR] User Email that failed:', editingUser.email);
        console.error('='.repeat(80));

        if (errorData.detail?.error === 'LAST_ADMIN_ROLE_CHANGE_BLOCKED') {
          toast.error(errorData.detail.message || 'Cannot change role of the last admin user');
        } else {
          toast.error(errorData.detail?.message || errorData.detail || 'Failed to update user');
        }
        return;
      }

      // ✅ CRITICAL FIX: Parse response and update user in state immediately
      const updatedUserData = await response.json();
      console.log('[UPDATE USER] ✅ Response received:', updatedUserData);
      console.log('[UPDATE USER] ✅ Updated role:', updatedUserData.role);

      // Update the user in local state immediately (don't wait for loadUsers)
      setUsers(prevUsers => {
        const updated = prevUsers.map(user =>
          user.id === editingUser.id
            ? {
                ...user,
                ...updatedUserData,
                id: user.id, // ⚠️ PRESERVE string id — API returns numeric id which would cause type mismatch in userStillExists check
                role: updatedUserData.role, // Explicitly update role
                name: updatedUserData.name,
                email: updatedUserData.email,
                permissions: updatedUserData.permissions,
                permission_ids: updatedUserData.permission_ids,
              }
            : user
        );
        console.log('[UPDATE USER] 🔄 State updated, user role is now:', updated.find(u => u.id === editingUser.id)?.role);
        return updated;
      });

      toast.success('User updated successfully');

      resetEditModal();

      // Refresh current user's session unconditionally — handles WebSocket failures
      // where the permission-updated push never reached the affected user's browser.
      // Small delay lets the backend finish RBAC sync before we re-fetch.
      setTimeout(async () => {
        await refreshUser();
        loadUsers();
      }, 300);
    } catch (error: any) {
      console.error('Error updating user:', error);

      // Handle 404 - user not found (deleted or wrong tenant)
      if (error.response?.status === 404) {
        toast.error('User not found. The user may have been deleted or belongs to a different organization. Refreshing list...');
        resetEditModal();
        loadUsers(); // Refresh the list to remove stale data
      } else {
        toast.error(error.message || 'Failed to update user');
      }
    } finally {
      setIsSaving(false);
    }
  };


  // Returns false if a permission category or sub-category is for a feature not in the tenant's plan
  const isCategoryVisible = (categoryId: string, subCategoryName?: string): boolean => {
    // Sub-category gating (Subscription & Billing / Settings sub-categories)
    if (subCategoryName) {
      if (subCategoryName === 'API Management') return hasPlanFeature('api_access');
      return true;
    }
    // Top-level category gating
    if (categoryId === 'resume_scoring') return hasPlanFeature('resume_scoring');
    if (categoryId === 'ai_talent_match') return hasPlanFeature('ai_talent_match');
    if (categoryId === 'my_resumes') return hasPlanFeature('resume_upload');
    if (categoryId === 'internal_database') return hasPlanFeature('resume_upload');
    if (categoryId === 'assessments') return hasPlanFeature('assessment');
    if (categoryId === 'ai_interviews') return hasPlanFeature('ai_interview');
    if (categoryId === 'teams') return hasPlanFeature('teams');
    return true;
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
              <UserCog className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Users</h1>
              <p className="text-sm text-gray-600">Manage users and their permissions</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* RBAC07: Dependency Matrix button */}
            <button
              onClick={() => setIsDependencyMatrixOpen(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base"
              title="View Feature Dependencies"
            >
              <Link2 className="w-5 h-5" />
              Dependencies
            </button>
            {/* RBAC01: Check user limits before showing Add User button */}
            <button
              onClick={() => {
                if (isAtLimit) {
                  if (isTrial) {
                    toast.error('User limit reached. Add-on seat purchases are only available for paid subscriptions. Please upgrade your plan.');
                  } else {
                    toast.error('User limit reached. Purchase additional seats or deactivate existing users to add more.');
                  }
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

        {/* Addon card - only shows when quota exhausted, hidden for trial users */}
        {!isTrial && (
          <div className="mt-4 sm:mt-6">
            <SeatQuotaCard
              onRefresh={() => { loadUsers(); refreshLimits(); }}
              compact
              refreshTrigger={seatQuotaRefreshTrigger}
            />
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="mb-4 sm:mb-6">
        <div className="relative max-w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent placeholder-gray-400 transition-colors"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
        {/* Total Users card with quota breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
          <p className="text-xs sm:text-sm text-gray-600">Total Users</p>
          <div className="flex items-baseline gap-1 mt-1">
            <p className="text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-900">
              {limits?.current_users ?? users.length}
            </p>
            <span className="text-sm text-gray-400">
              / {limits?.max_users === -1 ? '∞' : (limits?.max_users ?? '—')}
            </span>
          </div>
          {/* Progress bar */}
          {limits && limits.max_users > 0 && (
            <div className="mt-2">
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isAtLimit
                      ? 'bg-gradient-to-r from-red-400 to-red-600'
                      : limits.approaching_limit
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                        : 'bg-gradient-to-r from-gray-400 to-gray-600'
                  }`}
                  style={{ width: `${Math.min(limits.usage_percentage, 100)}%` }}
                />
              </div>
              {/* Plan Limit / Add-ons breakdown */}
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-gray-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                    Plan Limit
                  </span>
                  <span className="font-semibold text-gray-700">
                    {(() => {
                      const sl = quotaData?.quotas?.max_seats?.subscription?.limit;
                      return sl === 'unlimited' || sl === -1 ? '∞' : (sl ?? limits.max_users);
                    })()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-gray-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                    Add-ons
                  </span>
                  {(quotaData?.quotas?.max_seats?.addon?.total_purchased ?? 0) > 0 ? (
                    <span className="font-semibold text-gray-700">
                      {quotaData?.quotas?.max_seats?.addon?.total_purchased}
                    </span>
                  ) : (
                    <span className="text-gray-400 italic text-[10px]">None purchased</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
          <p className="text-xs sm:text-sm text-gray-600">Active Users</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-semibold text-green-600 mt-1">
            {users.filter(u => u.is_active).length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6">
          <p className="text-xs sm:text-sm text-gray-600">Inactive Users</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-semibold text-red-500 mt-1">
            {users.filter(u => !u.is_active).length}
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 sm:py-12">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-gray-700 animate-spin" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell whitespace-nowrap">
                  User ID
                </th>
                <th className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Permissions
                </th>
                <th className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Last Login
                </th>
                <th className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 hidden sm:table-cell">
                    {user.user_display_id ? (
                      <span className="px-2 py-0.5 text-[10px] sm:text-xs font-mono font-medium bg-gray-100 text-gray-700 rounded">
                        {user.user_display_id}
                      </span>
                    ) : (
                      <span className="text-[10px] sm:text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        user.role.toLowerCase() === 'tenant_admin' || user.role.toLowerCase() === 'admin'
                          ? 'bg-gray-800'
                          : user.role.toLowerCase() === 'recruiter'
                          ? 'bg-gray-700'
                          : 'bg-gray-600'
                      }`}>
                        <span className="text-white text-xs sm:text-sm font-medium">
                          {(user.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-medium text-gray-900 truncate">{user.name || user.email || 'Unknown'}</div>
                        <div className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
                    <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full ${getRoleBadgeColor(user.role, availableRoles)}`}>
                      {getRoleLabel(user.role, availableRoles)}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 hidden md:table-cell">
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
                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
                    {/* Toggle Switch for Active/Inactive */}
                    {user.role.toLowerCase() !== 'tenant_admin' && user.id !== currentUserId ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleActive(user)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                            user.is_active ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          title={user.is_active ? 'Active - Click to deactivate' : 'Inactive - Click to activate'}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              user.is_active ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className={`text-xs font-medium ${user.is_active ? 'text-green-700' : 'text-gray-500'}`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ) : (
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                        user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 hidden lg:table-cell">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {formatIST(user.last_login)}
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
                    <div className="flex items-center justify-center gap-1 sm:gap-2">
                      {/* Feature Permissions button - HIDDEN for now as requested */}
                      {/* {user.role.toLowerCase() !== 'tenant_admin' && (
                        <button
                          onClick={() => setFeaturePermissionUser(user)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Feature Permissions"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                      )} */}

                      {/* Edit button - Disabled when user is inactive */}
                      {user.role.toLowerCase() !== 'tenant_admin' && user.id !== currentUserId && (
                        <button
                          onClick={() => user.is_active && openEditModal(user)}
                          disabled={!user.is_active}
                          className={`p-2 rounded-lg transition-colors ${
                            user.is_active
                              ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer'
                              : 'text-gray-300 cursor-not-allowed'
                          }`}
                          title={user.is_active ? 'Edit User' : 'Cannot edit inactive user'}
                        >
                          <Pencil className="w-4 h-4" />
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
          <div className="text-center py-8 sm:py-12">
            <UserCog className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-3 sm:mb-4" />
            <p className="text-sm sm:text-base text-gray-500">No users found</p>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Create New User</h2>
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

                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewUser({ ...newUser, email: value });
                    checkEmailAvailability(value);
                  }}
                  placeholder="user@example.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                />

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
              {/* Password is auto-generated — user receives invite email */}
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>A temporary password will be auto-generated and emailed to the user. They will be asked to set a new password on first login.</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role <span className="text-red-500">*</span>
                </label>
                {/* Role Selection Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableRoles.map(role => {
                    const isSelected = selectedRoleId === role.id;
                    const isSystemRole = role.is_system;

                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => selectRole(role.id)}
                        className={`relative p-2.5 sm:p-3 rounded-lg border-2 text-left transition-all ${
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
                        <button
                          type="button"
                          onClick={(e) => handleViewRolePopup(role, e)}
                          className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View Permissions
                        </button>
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

              {/* Role Permissions section removed — use "View Permissions" on each role card */}
              {false && selectedRoleId && (
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
                        // Hide categories for features not in the tenant's plan
                        if (!isCategoryVisible(category.id)) return null;

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

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-4 sm:mt-6">
              <button
                onClick={resetCreateModal}
                className="px-4 py-2 sm:py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm sm:text-base"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={isSaving || !emailCheckResult.available || isCheckingEmail}
                className="px-4 py-2 sm:py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal - Redesigned */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Edit User</h2>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate">{editingUser.email}</p>
              </div>
              <button
                onClick={resetEditModal}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body - Scrollable */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
              {/* User Details Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Name</label>
                  <input
                    type="text"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input
                    type="email"
                    value={editingUser.email}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent transition-shadow"
                  />
                </div>
              </div>

              {/* Role Selection - Compact Pills */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Role</label>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map(role => {
                    const isSelected = editSelectedRoleId === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => {
                          if (editSelectedRoleId === role.id) return;
                          selectRole(role.id, true);
                        }}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-gray-900 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {role.name}
                        {isSelected && <Check className="w-3.5 h-3.5 ml-1.5 inline" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Permissions Section */}
              {editSelectedRoleId && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Permissions</label>
                    <span className="text-xs text-gray-400">
                      {editSelectedPermissionCodes.size} active
                    </span>
                  </div>

                  {isLoadingPermissions ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                      <span className="ml-2 text-sm text-gray-400">Loading permissions...</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {CUSTOM_PERMISSION_CATEGORIES.map(category => {
                        // Hide categories for features not in the tenant's plan
                        if (!isCategoryVisible(category.id)) return null;

                        // Pure codes-only toggle — no dual-state sync needed
                        const toggleCode = (code: string) => {
                          if (editSelectedPermissionCodes.has(code)) {
                            // Disabling — block if another enabled permission depends on this one
                            const blockers = getBlockingPermissions(code, editSelectedPermissionCodes);
                            if (blockers.length > 0) {
                              toast.warning(
                                `Cannot disable "${getPermissionDisplayName(code)}" — it's required by ${blockers.join(', ')}. Disable that permission first.`
                              );
                              return;
                            }
                            setEditSelectedPermissionCodes(prev => {
                              const next = new Set(prev);
                              next.delete(code);
                              // Auto-remove viewCode if no actions remain in category
                              if (category.viewCode) {
                                const allActions = [
                                  ...(category.actions || []),
                                  ...(category.subCategories?.flatMap(s => s.actions) || []),
                                ];
                                if (!allActions.some(a => a.code !== code && next.has(a.code))) {
                                  next.delete(category.viewCode);
                                  // Also remove sub-category viewCodes
                                  category.subCategories?.forEach(s => {
                                    if (s.viewCode) next.delete(s.viewCode);
                                  });
                                }
                              }
                              return next;
                            });
                          } else {
                            // Enabling — collect deps not yet enabled so we can notify
                            const deps = getPermissionDependencies(code);
                            const newlyEnabled = deps.filter(dep => !editSelectedPermissionCodes.has(dep));
                            setEditSelectedPermissionCodes(prev => {
                              const next = new Set(prev);
                              next.add(code);
                              // Auto-enable viewCode
                              if (category.viewCode) next.add(category.viewCode);
                              // Handle dependencies
                              deps.forEach(dep => next.add(dep));
                              return next;
                            });
                            // Notify admin which dependencies were auto-enabled
                            if (newlyEnabled.length > 0) {
                              const depLabels = newlyEnabled.map(d => getPermissionDisplayName(d)).join(' and ');
                              toast.info(`"${depLabels}" auto-enabled — required for "${getPermissionDisplayName(code)}"`);
                            }
                          }
                        };

                        const isCategoryActive = category.viewCode
                          ? editSelectedPermissionCodes.has(category.viewCode) ||
                            (category.actions?.some(a => editSelectedPermissionCodes.has(a.code)) ?? false) ||
                            (category.subCategories?.some(s => s.actions.some(a => editSelectedPermissionCodes.has(a.code))) ?? false)
                          : true;

                        const toggleCategory = () => {
                          setEditSelectedPermissionCodes(prev => {
                            const next = new Set(prev);
                            if (isCategoryActive) {
                              // Remove all codes in this category
                              if (category.viewCode) next.delete(category.viewCode);
                              category.actions?.forEach(a => next.delete(a.code));
                              category.subCategories?.forEach(s => {
                                if (s.viewCode) next.delete(s.viewCode);
                                s.actions.forEach(a => next.delete(a.code));
                              });
                            } else {
                              // Enable viewCode only (user picks individual actions)
                              if (category.viewCode) next.add(category.viewCode);
                            }
                            return next;
                          });
                        };

                        // Badge color + letter derived from permission code action segment
                        const getActionBadge = (code: string) => {
                          const action = code.split(':').pop() || '';
                          if (action === 'read') return { cls: 'bg-blue-100 text-blue-600', letter: 'R' };
                          if (action === 'create') return { cls: 'bg-green-100 text-green-600', letter: 'C' };
                          if (action === 'update') return { cls: 'bg-yellow-100 text-yellow-600', letter: 'U' };
                          if (action === 'delete') return { cls: 'bg-red-100 text-red-600', letter: 'D' };
                          return { cls: 'bg-purple-100 text-purple-600', letter: (action[0] || 'A').toUpperCase() };
                        };

                        const allCodes = [
                          ...(category.viewCode ? [category.viewCode] : []),
                          ...(category.actions?.map(a => a.code) || []),
                          ...(category.subCategories?.flatMap(s => [
                            ...(s.viewCode ? [s.viewCode] : []),
                            ...s.actions.map(a => a.code),
                          ]) || []),
                        ];
                        const selectedCount = allCodes.filter(c => editSelectedPermissionCodes.has(c)).length;

                        return (
                          <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
                            {/* Module Header */}
                            <div
                              className="bg-gray-100 px-3 sm:px-4 py-2 border-b border-gray-200 flex items-center justify-between select-none"
                              onClick={category.viewCode ? toggleCategory : undefined}
                              style={category.viewCode ? { cursor: 'pointer' } : undefined}
                            >
                              <div className="flex items-center gap-3">
                                {category.viewCode && (
                                  <div className={`w-8 h-[18px] rounded-full relative transition-colors flex-shrink-0 ${isCategoryActive ? 'bg-gray-900' : 'bg-gray-300'}`}>
                                    <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${isCategoryActive ? 'left-[17px]' : 'left-[2px]'}`} />
                                  </div>
                                )}
                                <h4 className={`font-semibold capitalize text-xs sm:text-sm ${isCategoryActive ? 'text-gray-900' : 'text-gray-400'}`}>
                                  {category.name} ({allCodes.length})
                                </h4>
                                {category.isMenuToggle && isCategoryActive && (
                                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">
                                    Menu
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-gray-500">{selectedCount} selected</span>
                            </div>

                            {/* Permission Cards Grid */}
                            <div className="p-2 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                              {/* View card */}
                              {category.viewCode && (() => {
                                const badge = getActionBadge(category.viewCode);
                                const isOn = editSelectedPermissionCodes.has(category.viewCode);
                                return (
                                  <div
                                    key={category.viewCode}
                                    onClick={() => toggleCode(category.viewCode!)}
                                    className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-all select-none ${isOn ? 'bg-gray-50 border-gray-200' : 'bg-gray-50/50 border-gray-100 opacity-40 hover:opacity-70 hover:border-gray-200'}`}
                                  >
                                    <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0 ${badge.cls}`}>
                                      <span className="text-[10px] sm:text-xs font-bold">{badge.letter}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-xs sm:text-sm text-gray-900">View {category.name}</div>
                                    </div>
                                  </div>
                                );
                              })()}
                              {/* Direct action cards */}
                              {category.actions?.map(action => {
                                const badge = getActionBadge(action.code);
                                const isOn = editSelectedPermissionCodes.has(action.code);
                                return (
                                  <div
                                    key={action.code}
                                    onClick={() => toggleCode(action.code)}
                                    className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-all select-none ${isOn ? 'bg-gray-50 border-gray-200' : 'bg-gray-50/50 border-gray-100 opacity-40 hover:opacity-70 hover:border-gray-200'}`}
                                  >
                                    <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0 ${badge.cls}`}>
                                      <span className="text-[10px] sm:text-xs font-bold">{badge.letter}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-xs sm:text-sm text-gray-900">{action.label}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Sub-categories */}
                            {category.subCategories?.map(sub => {
                              if (!isCategoryVisible(category.id, sub.name)) return null;

                              const isSubActive = sub.viewCode
                                ? editSelectedPermissionCodes.has(sub.viewCode) || sub.actions.some(a => editSelectedPermissionCodes.has(a.code))
                                : sub.actions.some(a => editSelectedPermissionCodes.has(a.code));

                              const toggleSub = () => {
                                setEditSelectedPermissionCodes(prev => {
                                  const next = new Set(prev);
                                  if (isSubActive) {
                                    if (sub.viewCode) next.delete(sub.viewCode);
                                    sub.actions.forEach(a => next.delete(a.code));
                                    if (category.viewCode) {
                                      const anyOtherSub = category.subCategories?.some(s =>
                                        s !== sub && (
                                          (s.viewCode && next.has(s.viewCode)) ||
                                          s.actions.some(a => next.has(a.code))
                                        )
                                      );
                                      const anyDirectAction = category.actions?.some(a => next.has(a.code));
                                      if (!anyOtherSub && !anyDirectAction) {
                                        next.delete(category.viewCode);
                                      }
                                    }
                                  } else {
                                    if (sub.viewCode) {
                                      next.add(sub.viewCode);
                                    } else {
                                      sub.actions.forEach(a => next.add(a.code));
                                    }
                                    if (category.viewCode) next.add(category.viewCode);
                                  }
                                  return next;
                                });
                              };

                              const subAllCodes = [
                                ...(sub.viewCode ? [sub.viewCode] : []),
                                ...sub.actions.map(a => a.code),
                              ];
                              const subSelectedCount = subAllCodes.filter(c => editSelectedPermissionCodes.has(c)).length;

                              return (
                                <div key={sub.name} className="border-t border-gray-100">
                                  {/* Sub-category header */}
                                  <div
                                    className="px-3 sm:px-4 py-1.5 bg-gray-50 flex items-center justify-between cursor-pointer select-none"
                                    onClick={toggleSub}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={`w-6 h-[14px] rounded-full relative transition-colors flex-shrink-0 ${isSubActive ? 'bg-gray-700' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white shadow-sm transition-transform ${isSubActive ? 'left-[13px]' : 'left-[2px]'}`} />
                                      </div>
                                      <span className={`text-xs font-medium ${isSubActive ? 'text-gray-700' : 'text-gray-400'}`}>
                                        {sub.name} ({subAllCodes.length})
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-gray-400">{subSelectedCount} selected</span>
                                  </div>
                                  {/* Sub-category cards */}
                                  <div className="p-2 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                                    {sub.viewCode && (() => {
                                      const badge = getActionBadge(sub.viewCode);
                                      const isOn = editSelectedPermissionCodes.has(sub.viewCode);
                                      return (
                                        <div
                                          key={sub.viewCode}
                                          onClick={() => {
                                            if (editSelectedPermissionCodes.has(sub.viewCode!)) {
                                              const blockers = getBlockingPermissions(sub.viewCode!, editSelectedPermissionCodes);
                                              if (blockers.length > 0) {
                                                toast.warning(`Cannot disable "${getPermissionDisplayName(sub.viewCode!)}" — it's required by ${blockers.join(', ')}. Disable that permission first.`);
                                                return;
                                              }
                                              setEditSelectedPermissionCodes(prev => { const next = new Set(prev); next.delete(sub.viewCode!); return next; });
                                            } else {
                                              setEditSelectedPermissionCodes(prev => { const next = new Set(prev); next.add(sub.viewCode!); if (category.viewCode) next.add(category.viewCode); return next; });
                                            }
                                          }}
                                          className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-all select-none ${isOn ? 'bg-gray-50 border-gray-200' : 'bg-gray-50/50 border-gray-100 opacity-40 hover:opacity-70 hover:border-gray-200'}`}
                                        >
                                          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0 ${badge.cls}`}>
                                            <span className="text-[10px] sm:text-xs font-bold">{badge.letter}</span>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-xs sm:text-sm text-gray-900">View {sub.name}</div>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                    {sub.actions.map(action => {
                                      const badge = getActionBadge(action.code);
                                      const isOn = editSelectedPermissionCodes.has(action.code);
                                      return (
                                        <div
                                          key={action.code}
                                          onClick={() => {
                                            if (editSelectedPermissionCodes.has(action.code)) {
                                              const blockers = getBlockingPermissions(action.code, editSelectedPermissionCodes);
                                              if (blockers.length > 0) {
                                                toast.warning(`Cannot disable "${getPermissionDisplayName(action.code)}" — it's required by ${blockers.join(', ')}. Disable that permission first.`);
                                                return;
                                              }
                                              setEditSelectedPermissionCodes(prev => {
                                                const next = new Set(prev);
                                                next.delete(action.code);
                                                if (sub.viewCode && !sub.actions.some(a => a.code !== action.code && next.has(a.code))) {
                                                  next.delete(sub.viewCode);
                                                }
                                                if (category.viewCode) {
                                                  const anyLeft = [
                                                    ...(category.actions || []),
                                                    ...(category.subCategories?.flatMap(s => s.actions) || []),
                                                  ].some(a => a.code !== action.code && next.has(a.code));
                                                  if (!anyLeft) next.delete(category.viewCode);
                                                }
                                                return next;
                                              });
                                            } else {
                                              const deps = getPermissionDependencies(action.code);
                                              const newlyEnabled = deps.filter(dep => !editSelectedPermissionCodes.has(dep));
                                              setEditSelectedPermissionCodes(prev => {
                                                const next = new Set(prev);
                                                next.add(action.code);
                                                if (sub.viewCode) next.add(sub.viewCode);
                                                if (category.viewCode) next.add(category.viewCode);
                                                deps.forEach(dep => next.add(dep));
                                                return next;
                                              });
                                              if (newlyEnabled.length > 0) {
                                                const depLabels = newlyEnabled.map(d => getPermissionDisplayName(d)).join(' and ');
                                                toast.info(`"${depLabels}" auto-enabled — required for "${getPermissionDisplayName(action.code)}"`);
                                              }
                                            }
                                          }}
                                          className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-all select-none ${isOn ? 'bg-gray-50 border-gray-200' : 'bg-gray-50/50 border-gray-100 opacity-40 hover:opacity-70 hover:border-gray-200'}`}
                                        >
                                          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0 ${badge.cls}`}>
                                            <span className="text-[10px] sm:text-xs font-bold">{badge.letter}</span>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-xs sm:text-sm text-gray-900">{action.label}</div>
                                            <div className="text-[10px] sm:text-xs text-gray-500 font-mono truncate">{action.code}</div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              <span className="text-[10px] sm:text-xs text-gray-400 hidden sm:inline">
                {editSelectedPermissionCodes.size !== editOriginalPermissionCodes.size ||
                 ![...editSelectedPermissionCodes].every(c => editOriginalPermissionCodes.has(c))
                  ? 'Unsaved changes'
                  : ''}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={resetEditModal}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateUser}
                  disabled={isSaving}
                  className="px-4 sm:px-5 py-1.5 sm:py-2 bg-gray-900 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save
                </button>
              </div>
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
          onUpdate={() => setTimeout(async () => { await refreshUser(); loadUsers(); }, 300)}
        />
      )}

      {/* RBAC07: Dependency Matrix Modal */}
      <DependencyMatrix
        isOpen={isDependencyMatrixOpen}
        onClose={() => setIsDependencyMatrixOpen(false)}
      />

      {/* View Role Permissions Popup */}
      {viewingRolePopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-xl font-bold text-white truncate">{viewingRolePopup.name}</h2>
                  <p className="text-blue-100 text-xs sm:text-sm truncate">{viewingRolePopup.description}</p>
                </div>
              </div>
              <button
                onClick={() => { setViewingRolePopup(null); setViewingRolePopupPermissions([]); }}
                className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
            </div>

            {/* Body */}
            <div className="p-3 sm:p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide mb-0.5 sm:mb-1">Role Code</div>
                  <div className="font-medium text-gray-900 text-xs sm:text-base truncate">{viewingRolePopup.code}</div>
                </div>
                <div>
                  <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide mb-0.5 sm:mb-1">Users</div>
                  <div className="font-medium text-gray-900 text-xs sm:text-base">{viewingRolePopup.user_count}</div>
                </div>
                <div>
                  <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide mb-0.5 sm:mb-1">Permissions</div>
                  <div className="font-medium text-gray-900 text-xs sm:text-base">{viewingRolePopupPermissions.length}</div>
                </div>
              </div>

              <h3 className="text-xs sm:text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 sm:mb-4">
                Allocated Permissions ({viewingRolePopupPermissions.length})
              </h3>

              {isViewingRolePopupLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : viewingRolePopupPermissions.length === 0 ? (
                <div className="text-center py-10 sm:py-12">
                  <Shield className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No permissions allocated</p>
                </div>
              ) : (
                <div className="space-y-4 sm:space-y-6">
                  {Object.entries(
                    viewingRolePopupPermissions.reduce((acc, perm) => {
                      const module = perm.module || 'other';
                      if (!acc[module]) acc[module] = [];
                      acc[module].push(perm);
                      return acc;
                    }, {} as Record<string, Permission[]>)
                  ).map(([module, perms]) => (
                    <div key={module} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-100 px-3 sm:px-4 py-2 border-b border-gray-200">
                        <h4 className="font-semibold text-gray-900 capitalize text-xs sm:text-sm">
                          {module.replace(/_/g, ' ')} ({perms.length})
                        </h4>
                      </div>
                      <div className="p-2 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                        {perms.map((perm) => (
                          <div
                            key={perm.id}
                            className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-50 rounded-lg border border-gray-200"
                          >
                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0 ${
                              perm.action === 'read'   ? 'bg-blue-100 text-blue-600' :
                              perm.action === 'create' ? 'bg-green-100 text-green-600' :
                              perm.action === 'update' ? 'bg-yellow-100 text-yellow-600' :
                              perm.action === 'delete' ? 'bg-red-100 text-red-600' :
                              'bg-purple-100 text-purple-600'
                            }`}>
                              <span className="text-[10px] sm:text-xs font-bold uppercase">{perm.action[0]}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-xs sm:text-sm text-gray-900">{perm.name}</div>
                              <div className="text-[10px] sm:text-xs text-gray-500 font-mono truncate">{perm.code}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 border-t border-gray-200">
              <div className="text-sm text-gray-500">
                {viewingRolePopup.is_system && (
                  <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-gray-200 text-gray-700 rounded-full text-[10px] sm:text-xs font-medium">
                    <Lock className="w-3 h-3" />
                    System Role (Read-Only)
                  </span>
                )}
              </div>
              <button
                onClick={() => { setViewingRolePopup(null); setViewingRolePopupPermissions([]); }}
                className="w-full sm:w-auto px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-xs sm:text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
