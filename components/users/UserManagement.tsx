'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { PageHeader } from '@/components/ui/page-header';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import { SurfaceCard, SectionHeading } from '@/components/ui/section-container';
import React, { useState, useEffect, useRef } from 'react';
import {
  CUSTOM_PERMISSION_CATEGORIES,
  type CustomPermissionAction,
  type CustomPermissionCategory,
  type CustomPermissionSubCategory,
} from '@/lib/constants/permissionCategories';
import { useRouter } from 'next/navigation';
import { ArrowLeft,
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
  KeyRound,
  Users as UsersIcon,
  UserCheck,
  UserX,
  Sparkles,
  Info,
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
import AddSeatsModal from './AddSeatsModal';
import ListPagination from '@/components/ListPagination';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuota } from '@/contexts/QuotaContext';
import { usePlanFeaturesContext } from '@/components/providers/PlanFeaturesProvider';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import OrganizationTabs from '@/components/organization/OrganizationTabs';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { formatISTDate, formatIST } from '@/lib/utils/dateUtils';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Tooltip } from '@/components/ui/tooltip';

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
  internal_db: 'Shared Database',
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
    if (cat.viewCode === code) return cat.name;
    const action = cat.actions?.find(a => a.code === code);
    if (action) return action.label;
    for (const sub of cat.subCategories || []) {
      if (sub.viewCode === code) return `View ${sub.name}`;
      const subAction = sub.actions.find(a => a.code === code);
      if (subAction) return `${subAction.label} (${sub.name})`;
    }
  }
  return code;
};

// Helper to get the category viewCode that owns a given permission code
const getCategoryViewCodeFor = (code: string): string | null => {
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    if (cat.viewCode === code) return cat.viewCode;
    if (cat.actions?.some(a => a.code === code)) return cat.viewCode ?? null;
    for (const sub of cat.subCategories || []) {
      if (sub.actions.some(a => a.code === code)) return cat.viewCode ?? null;
    }
  }
  return null;
};

// Helper to get which currently-enabled permission CODES block disabling the
// given code (same traversal as getBlockingPermissions below, but returns the
// raw codes so a cascade-disable can actually remove them from the set).
const getBlockingPermissionCodes = (code: string, currentCodes: Set<string>): string[] => {
  const blockers: string[] = [];
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    if (cat.dependencies) {
      for (const [depender, deps] of Object.entries(cat.dependencies)) {
        if (deps.includes(code) && currentCodes.has(depender)) {
          blockers.push(depender);
        }
      }
    }
  }
  return blockers;
};

// Helper to get which currently-enabled permissions block disabling the given code
const getBlockingPermissions = (code: string, currentCodes: Set<string>): string[] =>
  getBlockingPermissionCodes(code, currentCodes).map(getPermissionDisplayName);

// Transitive closure: starting from `codes`, keep pulling in whatever else
// currently depends on something already queued for removal, so cascading a
// disable never leaves an enabled permission depending on a code that just
// got turned off.
const computeCascadeRemovals = (codes: string[], currentCodes: Set<string>): Set<string> => {
  const removal = new Set(codes);
  let changed = true;
  while (changed) {
    changed = false;
    for (const code of Array.from(removal)) {
      for (const blocker of getBlockingPermissionCodes(code, currentCodes)) {
        if (!removal.has(blocker)) {
          removal.add(blocker);
          changed = true;
        }
      }
    }
  }
  return removal;
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
  user_display_id?: string;
  name: string;
  email: string;
  role: string;  // Dynamic role from RBAC
  permissions: UserPermissions;
  is_active: boolean;
  last_login?: string;
  created_at?: string;
  permission_ids?: number[];
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
  tenant_admin: 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25',
  admin: 'bg-brand-blue/10 text-brand-blue',
  recruiter: 'bg-brand-cyan/10 text-brand-cyan',
  viewer: 'bg-gray-100 text-gray-600',
  billing_manager: 'bg-success-subtle text-success',
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
  'bg-success-subtle text-success',
  'bg-lime-100 text-lime-700',
  'bg-warning-subtle text-warning',
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
  can_access_internal_db: 'Shared Database',
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
  const dialog = useGlobalDialog();

  // Shared by every permission toggle below: instead of silently blocking a
  // disable when other enabled permissions depend on it, ask the admin to
  // confirm cascading the disable to those dependents too. Returns the full
  // set of codes to remove (the requested ones plus every dependent pulled
  // in transitively) on "Yes", or null if the admin chose "No" (no changes).
  const confirmCascadeDisable = async (
    label: string,
    codesBeingDisabled: string[],
    currentCodes: Set<string>
  ): Promise<Set<string> | null> => {
    const blockerCodes = [
      ...new Set(codesBeingDisabled.flatMap(c => getBlockingPermissionCodes(c, currentCodes))),
    ];
    if (blockerCodes.length === 0) return new Set(codesBeingDisabled);

    const blockerNames = [...new Set(blockerCodes.map(getPermissionDisplayName))];
    const confirmed = await dialog.confirm({
      title: `Disable "${label}"?`,
      message: `"${label}" is required by ${blockerNames.join(', ')}. Disabling it will also turn off: ${blockerNames.join(', ')}.`,
      variant: 'warning',
      confirmText: 'Yes, Disable All',
      cancelText: 'No',
    });
    if (!confirmed) return null;
    return computeCascadeRemovals(codesBeingDisabled, currentCodes);
  };

  // Granular action gates. Tenant admins always pass; delegated admins pass when
  // they hold the matching users:* permission. Accept both snake_case (API) and
  // camelCase (AuthProvider) shapes for resilience.
  const _isTenantAdmin = currentUser?.role === 'tenant_admin';
  const _perms: any = currentUser?.permissions || {};
  const canDisableUser = _isTenantAdmin || !!_perms.can_disable_users || !!_perms.canDisableUsers;
  const canUpdateUser = _isTenantAdmin || !!_perms.can_update_users || !!_perms.canUpdateUsers;
  const canCreateUser = _isTenantAdmin || !!_perms.can_create_users || !!_perms.canCreateUsers;
  const canResetPassword = _isTenantAdmin || !!_perms.can_reset_user_password || !!_perms.canResetUserPassword;
  const canForcePwChange = _isTenantAdmin || !!_perms.can_force_password_change || !!_perms.canForcePasswordChange;
  const canAssignRole = _isTenantAdmin || !!_perms.can_assign_roles || !!_perms.canAssignRoles;
  const [users, setUsers] = useState<ApiUser[]>([]);
  // Tenant-wide active/inactive counts from a dedicated fast COUNT query
  // (GET /users/count), used by the Active/Inactive stat cards below instead
  // of `users.filter(...)` — `users` only ever holds the current page of
  // `GET /users` (default page_size=20), so filtering it undercounts any
  // tenant with more users than one page. `null` until that call resolves,
  // during which the cards fall back to the old (possibly-undercounted but
  // available) client tally rather than showing nothing.
  const [userCounts, setUserCounts] = useState<{ active_users: number; inactive_users: number; total_users: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  // Drill-in pattern: cards-first overview, switch to list+search when a stat
  // card is clicked. `statusFilter` carries the card that was clicked so the
  // list is pre-filtered.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const listSectionRef = useRef<HTMLDivElement | null>(null);
  const [listScrollRequest, setListScrollRequest] = useState(0);
  const openListView = (filter: 'all' | 'active' | 'inactive') => {
    try {
      window.sessionStorage.removeItem('listScroll:org-user-management');
    } catch {
      /* Ignore unavailable sessionStorage. */
    }
    setStatusFilter(filter);
    setPageView('list');
    setCurrentPage(1);
    setListScrollRequest((request) => request + 1);
  };
  const isOverviewCardActive = (filter: typeof statusFilter) => pageView === 'list' && statusFilter === filter;
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
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
  const [editSelectedPermissionCodes, _setEditSelectedPermissionCodes] = useState<Set<string>>(new Set());
  // Backend (app/config/mandatory_permissions.py) always re-adds these 2 view-only
  // codes to permission_ids on save regardless of what the client sends — every
  // role, including admin, keeps baseline read access to the Analytics dashboard
  // and Support. jd:read / my_resumes:read used to be in that baseline too, which
  // silently overrode an Owner's choice to fully disable Job Descriptions / My
  // Resumes — that's now fixed server-side, so those two are Owner-controlled
  // like any other permission and must NOT be forced on here.
  const MANDATORY_PERMISSION_CODES = new Set(['analytics:read', 'support:read']);
  const setEditSelectedPermissionCodes = (updater: React.SetStateAction<Set<string>>) => {
    _setEditSelectedPermissionCodes(prev => {
      const base = typeof updater === 'function' ? (updater as (p: Set<string>) => Set<string>)(prev) : updater;
      const next = new Set(base);
      MANDATORY_PERMISSION_CODES.forEach(c => next.add(c));
      return next;
    });
  };
  const [editOriginalRoleId, setEditOriginalRoleId] = useState<number | null>(null);
  const [editOriginalPermissionCodes, setEditOriginalPermissionCodes] = useState<Set<string>>(new Set());
  const selectRoleRequestIdRef = useRef(0);

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
  const [showAddSeatsModal, setShowAddSeatsModal] = useState(false);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  // View role permissions popup (same as RoleManagement view modal)
  const [viewingRolePopup, setViewingRolePopup] = useState<RoleListItem | null>(null);
  const [viewingRolePopupPermissions, setViewingRolePopupPermissions] = useState<Permission[]>([]);
  const [isViewingRolePopupLoading, setIsViewingRolePopupLoading] = useState(false);

  // Reset Password modal — offers BOTH "email a temp password" and "set directly".
  const [resetPwUser, setResetPwUser] = useState<ApiUser | null>(null);
  const [resetPwMode, setResetPwMode] = useState<'choose' | 'direct'>('choose');
  const [directPw, setDirectPw] = useState('');
  const [directPwConfirm, setDirectPwConfirm] = useState('');
  const [directPwForceChange, setDirectPwForceChange] = useState(false); // default OFF
  const [directPwShow, setDirectPwShow] = useState(false);
  const [resetPwSubmitting, setResetPwSubmitting] = useState(false);

  const closeResetPwModal = () => {
    setResetPwUser(null);
    setResetPwMode('choose');
    setDirectPw('');
    setDirectPwConfirm('');
    setDirectPwForceChange(false);
    setDirectPwShow(false);
    setResetPwSubmitting(false);
  };

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

  // Persist scroll + view state so returning to User Management lands the user
  // where they left off. Re-detect the scroll container when the two-step view
  // flips (cards overview vs. list). currentPage is intentionally not persisted:
  // the existing `setCurrentPage(1)` effect on [searchQuery] resets it on mount,
  // so a restored page would be immediately clobbered.
  const rootRef = useScrollRestoration<HTMLElement>('org-user-management', !isLoading, [pageView]);
  useListStatePersistence(
    'org-user-management',
    { statusFilter, searchQuery, itemsPerPage },
    (s) => {
      if (s.statusFilter === 'all' || s.statusFilter === 'active' || s.statusFilter === 'inactive') {
        setStatusFilter(s.statusFilter as typeof statusFilter);
      }
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  useEffect(() => {
    if (listScrollRequest === 0 || pageView !== 'list') return;

    let nestedFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      nestedFrame = window.requestAnimationFrame(() => {
        listSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (nestedFrame) window.cancelAnimationFrame(nestedFrame);
    };
  }, [listScrollRequest, pageView, statusFilter]);

  // Permission guard - check if user has access to User Management
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const currentUser = await authService.getCurrentUser();

        // Store current user ID for hiding Edit/Delete buttons on self
        setCurrentUserId(currentUser.id);

        // Check if user has permission to access User Management. Mirrors the
        // canManageUsers mapping in AuthProvider (which the route guard/menu use):
        // view-only users (can_view_users) are allowed to land on this page too,
        // just with reduced capabilities gated further down (canDisableUser, etc).
        const hasPermission =
          currentUser.role === 'tenant_admin' ||
          !!currentUser.permissions?.can_manage_users ||
          !!(currentUser.permissions as any)?.can_view_users;

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
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    // These don't depend on the Admin API sync below in any way — each
    // fetches straight from this tenant's own DB — so they fire immediately
    // instead of waiting on it. They're what the Users/Active/Inactive count
    // cards actually read; the sync result itself is never rendered anywhere.
    loadUsers(); // also refreshes userCounts (see loadUsers)
    loadRoles();
    loadAllPermissions();

    // Reconciles this tenant's user count against the external Admin API
    // (two possible remote round trips, each up to 10s) and only ever
    // produces a toast warning on a plan-limit mismatch — it used to be
    // awaited BEFORE the three loads above even started, so the count cards
    // sat on a blank/loading state for as long as that remote call took, for
    // a side effect they don't display. Run concurrently instead.
    const syncWithAdminApi = async () => {
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
      }
    };

    syncWithAdminApi();
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
      // Expected for view-only users: GET /rbac/permissions requires the
      // admin-level "roles:read" RBAC permission, not just users:read. Mirrors
      // the console.warn fallback in loadRoles() below (same endpoint gating),
      // so a view-only user's page doesn't trip Next's console.error overlay.
      console.warn('[LOAD PERMISSIONS] Failed to load permissions (likely lacks roles:read):', error);
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
    if (isEdit) {
      // Switching an EXISTING user's assigned role must not discard whatever
      // permission customizations are currently shown in the editor — this
      // used to fetch the clicked role's raw default template and overwrite
      // editSelectedPermissionCodes/Ids with it, silently wiping out the
      // user's real saved permission overrides (or edits made earlier in the
      // same session) out from under the admin. Role assignment and
      // permission overrides are edited independently in this modal: the
      // permissions checklist keeps whatever it already shows, and role only
      // changes the `role`/`role_id` columns that get saved.
      setEditSelectedRoleId(roleId);
      return;
    }

    const requestId = ++selectRoleRequestIdRef.current;
    setIsLoadingPermissions(true);

    try {
      // Fetch full role details including permissions — create-user flow
      // only: starting a brand-new user from a role's default template is
      // the correct behavior there (there is no existing customization to
      // discard).
      const roleDetails = await rbacService.getRoleById(roleId);

      // A newer role selection started after this one — discard this stale response.
      if (requestId !== selectRoleRequestIdRef.current) return;

      // Get permission IDs and codes from the role
      const permissionIds = new Set<number>(
        roleDetails.permissions?.map(p => p.id) || []
      );
      const permissionCodes = new Set<string>(
        roleDetails.permissions?.map(p => p.code) || []
      );

      console.log(`[DEBUG] Loaded ${permissionIds.size} permissions for role ${roleId}`);
      console.log(`[DEBUG] Permission codes:`, Array.from(permissionCodes));

      setSelectedRoleId(roleId);
      setSelectedPermissionIds(permissionIds);
      setSelectedPermissionCodes(permissionCodes);
    } catch (error) {
      if (requestId !== selectRoleRequestIdRef.current) return;
      console.error('Error fetching role permissions:', error);
      // Clear permissions on error
      setSelectedRoleId(roleId);
      setSelectedPermissionIds(new Set());
      setSelectedPermissionCodes(new Set());
    } finally {
      if (requestId === selectRoleRequestIdRef.current) {
        setIsLoadingPermissions(false);
      }
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

  // Select/Deselect all permissions for edit modal.
  // NOTE: the actual checkbox/category UI and the save payload are both driven
  // by `editSelectedPermissionCodes` (see toggleCategory / requestBody.permission_codes
  // below) — not `editSelectedPermissionIds`, which nothing else reads. Toggling
  // `editSelectedPermissionIds` here was a no-op that looked like it did nothing.
  const getAllCustomPermissionCodes = (): string[] =>
    CUSTOM_PERMISSION_CATEGORIES.flatMap(category => [
      ...(category.viewCode ? [category.viewCode] : []),
      ...(category.actions?.map(a => a.code) || []),
      ...(category.subCategories?.flatMap(s => [
        ...(s.viewCode ? [s.viewCode] : []),
        ...s.actions.map(a => a.code),
      ]) || []),
    ]);

  const handleSelectAllEditPermissions = () => {
    const allCodes = getAllCustomPermissionCodes();
    const allSelected = allCodes.every(code => editSelectedPermissionCodes.has(code));

    if (allSelected) {
      // Deselect all
      setEditSelectedPermissionCodes(new Set());
    } else {
      // Select all
      setEditSelectedPermissionCodes(new Set(allCodes));
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
    // Keep the Active / Inactive / Total count cards in sync on every reload —
    // mount, manual refresh, and after mutations (activate/deactivate/delete/
    // create) that call loadUsers(). Previously userCounts loaded only once on
    // mount, so toggling a user's status left the Inactive/Active cards stale
    // until a manual page refresh. Fired in parallel and independent of the
    // list fetch so it still updates even if the list request fails.
    userService.getUserCounts().then(setUserCounts).catch((error) => {
      console.warn('Failed to load user counts:', error);
    });
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
        created_at: user.created_at,
        permission_ids: Array.isArray(user.permission_ids) ? user.permission_ids : undefined,
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

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && user.is_active) ||
      (statusFilter === 'inactive' && !user.is_active);
    return matchesSearch && matchesStatus;
  });

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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

      // RBAC02 AC3: surface any dependency the backend force-enabled on top of
      // what was selected (e.g. granting Resume Scoring also enables Resume
      // Upload + Resume Database Access) — see handleUpdateUser for details.
      try {
        const createdUserData = await response.json();
        if (Array.isArray(createdUserData.dependency_notices)) {
          createdUserData.dependency_notices.forEach((notice: string) => {
            toast.warning(notice);
          });
        }
      } catch {
        // Response body already consumed or not JSON — nothing to surface.
      }

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

    // Guard the permissions panel with a loading state so it doesn't render
    // with whatever was left over from the last time this modal was open
    // (all toggles off / 0 selected) before flipping to the real values a
    // moment later once the fetch below resolves.
    setIsLoadingPermissions(true);

    // Fetch fresh user data with permission_ids
    try {
      const freshUserData = await userService.getUser(user.id);

      // Ensure permissions are loaded before mapping.
      // Always refresh once here so newly backfilled tenant permissions
      // (for example ai_interview:* / hr_question_bank:*) are visible
      // immediately after a save without requiring a full page reload.
      const permissionsForMapping = await loadAllPermissions();

      // Use permission_ids directly from backend response
      const currentPermissionIds = new Set<number>();

      // Backend now returns permission_ids array - use it directly!
      if (freshUserData.permission_ids && Array.isArray(freshUserData.permission_ids) && freshUserData.permission_ids.length > 0) {
        // User has explicit custom permissions - use them
        freshUserData.permission_ids.forEach((id: number) => {
          currentPermissionIds.add(id);
        });
        console.log('[EDIT USER] Loaded custom permission IDs from backend:', Array.from(currentPermissionIds));

        const unresolvedIds = freshUserData.permission_ids.filter(
          (id: number) => !permissionsForMapping.some(p => p.id === id)
        );
        if (unresolvedIds.length > 0) {
          console.warn('[EDIT USER] Some permission IDs are still missing from RBAC permission metadata:', unresolvedIds);
        }
      } else if (Array.isArray(freshUserData.permission_ids) && freshUserData.permission_ids.length === 0) {
        // Empty array: either user has no custom permissions (new user) or GET query failed.
        // Prefer the list-cached permission_ids (from loadUsers) if available — these are
        // more accurate because loadUsers ran after the last save. Only fall back to role
        // defaults when the list also has no data (truly new user with no saved permissions).
        const listPermIds = user.permission_ids;
        if (listPermIds && listPermIds.length > 0) {
          listPermIds.forEach((id: number) => currentPermissionIds.add(id));
          console.log('[EDIT USER] GET returned empty — using list-cached permission_ids:', Array.from(currentPermissionIds));
        } else {
          // Truly new user: no saved permissions anywhere, fall back to role defaults
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
        if (perm.code === 'users:disable' && (freshUserData.permissions.can_disable_users || freshUserData.permissions.can_manage_users)) hasPermission = true;
        if (perm.code === 'users:reset_password' && freshUserData.permissions.can_reset_user_password) hasPermission = true;
        if (perm.code === 'users:force_password_change' && freshUserData.permissions.can_force_password_change) hasPermission = true;
        if (perm.code === 'users:assign_role' && (freshUserData.permissions.can_assign_roles || freshUserData.permissions.can_manage_users)) hasPermission = true;

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
        if (perm.code === 'teams:create' && freshUserData.permissions.can_create_teams) hasPermission = true;
        if (perm.code === 'teams:update' && freshUserData.permissions.can_update_teams) hasPermission = true;
        if (perm.code === 'teams:delete' && freshUserData.permissions.can_delete_teams) hasPermission = true;
        if (perm.code === 'teams:view_reports' && freshUserData.permissions.can_view_team_usage) hasPermission = true;
        if (perm.code === 'teams:export' && freshUserData.permissions.can_export) hasPermission = true;

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
      // Only include codes that are recognized in CUSTOM_PERMISSION_CATEGORIES to prevent
      // legacy/unmapped codes from persisting silently through saves.
      const recognizedCodes = new Set<string>();
      CUSTOM_PERMISSION_CATEGORIES.forEach(cat => {
        if (cat.viewCode) recognizedCodes.add(cat.viewCode);
        cat.actions?.forEach(a => recognizedCodes.add(a.code));
        cat.subCategories?.forEach(sub => {
          if (sub.viewCode) recognizedCodes.add(sub.viewCode);
          sub.actions?.forEach(a => recognizedCodes.add(a.code));
        });
      });
      const currentPermissionCodes = new Set<string>();
      currentPermissionIds.forEach(id => {
        const perm = permissionsForMapping.find(p => p.id === id);
        if (perm && recognizedCodes.has(perm.code)) {
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
    } finally {
      setIsLoadingPermissions(false);
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
    if (!await dialog.confirm({
      title: 'Deactivate User',
      message: 'Are you sure you want to deactivate this user?',
      variant: 'warning',
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
    })) {
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
    // Pre-check: if activating and already at limit, show clear message
    if (!user.is_active && isAtLimit) {
      toast.error('User limit exceeded. Please upgrade your plan to activate more users.');
      return;
    }

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
      const isNetworkError = error.message === 'Failed to fetch' || error.name === 'TypeError';
      toast.error(isNetworkError ? 'Unable to update user status. Please check your connection and try again.' : (error.message || 'Failed to update user status'));
    }
  };

  // Email-a-temp-password flow: rotates a temp password, emails it to the user,
  // and forces a change on next login. No password is ever shown to the admin.
  const handleResetPasswordEmail = async (user: ApiUser) => {
    setResetPwSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (response.status === 401) { handleUnauthorized(); return; }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.detail?.message || errorData.detail || 'Failed to reset password');
        return;
      }
      toast.success(`Temporary password emailed to ${user.email}`);
      closeResetPwModal();
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setResetPwSubmitting(false);
    }
  };

  // Direct-set flow: admin types a new password; it applies immediately (no email,
  // no OTP). force-change-on-next-login defaults OFF. Admin hands it over out-of-band.
  const handleSetPasswordDirect = async (user: ApiUser) => {
    if (directPw.length < 8) { toast.error('Password must be at least 8 characters long'); return; }
    if (!/[A-Z]/.test(directPw)) { toast.error('Password must contain an uppercase letter'); return; }
    if (!/[a-z]/.test(directPw)) { toast.error('Password must contain a lowercase letter'); return; }
    if (!/[0-9]/.test(directPw)) { toast.error('Password must contain a number'); return; }
    if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(directPw)) { toast.error('Password must contain a special character'); return; }
    if (directPw !== directPwConfirm) { toast.error('Passwords do not match'); return; }

    setResetPwSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/users/${user.id}/set-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          new_password: directPw,
          require_change_on_next_login: directPwForceChange,
        }),
      });
      if (response.status === 401) { handleUnauthorized(); return; }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.detail?.message || errorData.detail || 'Failed to set password');
        return;
      }
      toast.success(`Password updated for ${user.email}`);
      closeResetPwModal();
    } catch (error: any) {
      console.error('Error setting password:', error);
      toast.error(error.message || 'Failed to set password');
    } finally {
      setResetPwSubmitting(false);
    }
  };

  // Force the user to change their password on next login (no rotation, no email).
  const handleForcePasswordChange = async (user: ApiUser) => {
    if (!await dialog.confirm({
      title: 'Force Password Change',
      message: `Require ${user.email} to change their password on next login? Their active sessions will be signed out immediately.`,
      variant: 'warning',
      confirmText: 'Force Change',
      cancelText: 'Cancel',
    })) {
      return;
    }
    try {
      const response = await fetch(`${API_URL}/users/${user.id}/force-password-change`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (response.status === 401) { handleUnauthorized(); return; }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.detail?.message || errorData.detail || 'Failed to force password change');
        return;
      }
      toast.success('User will be required to change their password on next login');
    } catch (error: any) {
      console.error('Error forcing password change:', error);
      toast.error(error.message || 'Failed to force password change');
    }
  };

  const handleDeactivateExcessUsers = async (countToDeactivate: number) => {
    if (!await dialog.confirm({
      title: 'User Limit Exceeded',
      message: `This will deactivate the last created ${countToDeactivate} user(s) to bring your account back within the plan limit.`,
      variant: 'warning',
      confirmText: 'Deactivate Users',
      cancelText: 'Cancel',
    })) return;

    // Exclude owners and the currently logged-in user from auto-deactivation
    const eligible = users.filter(u =>
      u.is_active &&
      u.role !== 'tenant_admin' &&
      u.email !== currentUser?.email
    );

    // Sort descending by numeric part of user_display_id so the most recently created
    // users are deactivated first (e.g. US-004 is newer than US-003).
    const sorted = [...eligible].sort((a, b) => {
      const numA = parseInt(a.user_display_id?.replace(/\D/g, '') || '0', 10);
      const numB = parseInt(b.user_display_id?.replace(/\D/g, '') || '0', 10);
      return numB - numA;
    });

    const toDeactivate = sorted.slice(0, countToDeactivate);

    if (toDeactivate.length === 0) {
      toast.error('No eligible users to deactivate automatically. Please deactivate users manually.');
      return;
    }

    const loadingId = 'deactivate-excess';
    toast.loading(`Deactivating ${toDeactivate.length} user(s)...`, { id: loadingId });

    let succeeded = 0;
    let failed = 0;

    for (const u of toDeactivate) {
      try {
        const res = await fetch(`${API_URL}/users/${u.id}/deactivate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
        });
        if (res.ok) {
          succeeded++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    toast.dismiss(loadingId);
    if (succeeded > 0) toast.success(`${succeeded} user(s) deactivated successfully`);
    if (failed > 0) toast.error(`${failed} user(s) could not be deactivated`);

    loadUsers();
    refreshLimits();
    setSeatQuotaRefreshTrigger(prev => prev + 1);
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

      // RBAC02 AC3: the backend force-keeps a dependency enabled (e.g. Resume
      // Database Access while Resume Scoring is on) even if this save tried to
      // turn it off — without this, that reversal would be invisible, since
      // this grid's own getBlockingPermissions warning doesn't know about the
      // legacy feature-level booleans the backend enforces separately.
      if (Array.isArray(updatedUserData.dependency_notices)) {
        updatedUserData.dependency_notices.forEach((notice: string) => {
          toast.warning(notice);
        });
      }

      // Refresh permission catalog too, because backend may have backfilled
      // missing tenant permission rows while saving.
      await loadAllPermissions();

      resetEditModal();

      // Refresh current user's session unconditionally — handles WebSocket failures
      // where the permission-updated push never reached the affected user's browser.
      // Small delay lets the backend finish RBAC sync before we re-fetch.
      setTimeout(() => {
        Promise.all([refreshUser(), loadUsers()]);
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


  /** A permission category whose feature is not in the plan: shown, greyed,
   *  non-interactive, with the plan-locked hover — never hidden. */
  const renderPlanLockedCategory = (key: string, name: string) => (
    <div
      key={key}
      aria-disabled="true"
      title={PLAN_LOCKED_MESSAGE}
      className="flex items-center gap-2 p-2 sm:p-3 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/50 opacity-60 cursor-not-allowed select-none"
    >
      <Lock className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
      <span className="text-sm font-medium text-gray-500 dark:text-slate-400 flex-1 min-w-0 truncate">{name}</span>
      <span className="text-2xs font-medium text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded whitespace-nowrap">Not in plan</span>
    </div>
  );

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
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users' }]} />

      {/* Shared organization tab bar — Users is the first tab */}
      <OrganizationTabs />

      {/* Active tab + its data enclosed together in one bordered panel that
          connects to the tab bar's baseline (-mt-5 cancels the tab bar's mb-5). */}
      <div className="-mt-5 rounded-b-xl border border-t-0 border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 sm:p-5">
      {/* Header */}
      <PageHeader
        icon={<UserCog className="h-5 w-5" />}
        title="User Management"
        description="Invite teammates, assign roles and fine-tune permissions"
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* RBAC07: Dependency Matrix button */}
            <Button
              variant="secondary"
              onClick={() => setIsDependencyMatrixOpen(true)}
              icon={<Link2 className="w-4 h-4" />}
              aria-label="View Feature Dependencies" title="View Feature Dependencies"
            >
              Dependencies
            </Button>
            {/* RBAC01: Check user limits before showing Add User button — also requires users:create */}
            {canCreateUser && (
              <Button
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  if (isAtLimit) {
                    if (isTrial) {
                      toast.error('User limit reached. Add-on seat purchases are only available for paid subscriptions. Please upgrade your plan.');
                    } else {
                      setShowAddSeatsModal(true);
                    }
                    return;
                  }
                  setIsCreateModalOpen(true);
                }}
              >
                {isAtLimit && !isTrial ? 'Buy More Seats' : 'Invite User'}
              </Button>
            )}
          </div>
        }
      />

      {/* Addon card - only shows when quota exhausted, hidden for trial users */}
      {!isTrial && (
        <div className="mb-5">
          <SeatQuotaCard
            onRefresh={() => { loadUsers(); refreshLimits(); }}
            onDeactivateExcess={handleDeactivateExcessUsers}
            compact
            refreshTrigger={seatQuotaRefreshTrigger}
          />
        </div>
      )}

      {/* Stats Cards — clickable; clicking drills into the users list filtered by status.
          Uniform neutral tone + identical structure so all three are the same height. */}
      <StatsCardGrid columns={3}>
        <StatsCard
          label="Total Users"
          value={
            <span className="flex items-baseline gap-1">
              {limits?.current_users ?? userCounts?.total_users ?? users.length}
              <span className="text-sm font-normal text-gray-400 dark:text-slate-500">
                / {limits?.max_users === -1 ? '∞' : (limits?.max_users ?? '—')}
              </span>
            </span>
          }
          icon={UsersIcon}
          tone="neutral"
          sparkVariant={0}
          onClick={() => openListView('all')}
          active={isOverviewCardActive('all')}
          showClickArrow
        />
        <StatsCard
          label="Active Users"
          value={userCounts ? userCounts.active_users : users.filter(u => u.is_active).length}
          icon={UserCheck}
          tone="neutral"
          sparkVariant={1}
          onClick={() => openListView('active')}
          active={isOverviewCardActive('active')}
          showClickArrow
        />
        <StatsCard
          label="Inactive Users"
          value={userCounts ? userCounts.inactive_users : users.filter(u => !u.is_active).length}
          icon={UserX}
          tone="neutral"
          sparkVariant={2}
          onClick={() => openListView('inactive')}
          active={isOverviewCardActive('inactive')}
          showClickArrow
        />
      </StatsCardGrid>

      {/* Seat quota detail — relocated out of the Total card so the three stat
          cards stay uniform height; no data dropped. */}
      {limits && limits.max_users > 0 && (
        <div className="mb-5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Seat usage</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">{Math.min(limits.usage_percentage, 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isAtLimit
                  ? 'bg-destructive'
                  : limits.approaching_limit
                    ? 'bg-brand-orange'
                    : 'bg-gradient-to-r from-brand-blue to-brand-cyan'
              }`}
              style={{ width: `${Math.min(limits.usage_percentage, 100)}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-blue flex-shrink-0" />
              <span className="text-gray-500 dark:text-slate-500">Plan Limit</span>
              <span className="font-semibold text-gray-700 dark:text-slate-300">
                {(() => {
                  const sl = quotaData?.quotas?.max_seats?.subscription?.limit;
                  return sl === 'unlimited' || sl === -1 ? '∞' : (sl ?? limits.max_users);
                })()}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan flex-shrink-0" />
              <span className="text-gray-500 dark:text-slate-500">Add-ons</span>
              {(quotaData?.quotas?.max_seats?.addon?.total_purchased ?? 0) > 0 ? (
                <span className="font-semibold text-gray-700 dark:text-slate-300">
                  {quotaData?.quotas?.max_seats?.addon?.total_purchased}
                </span>
              ) : (
                <span className="text-gray-400 dark:text-slate-500 italic">None purchased</span>
              )}
            </div>
          </div>
        </div>
      )}

      {pageView === 'list' && (
      <>
      <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />

      {/* Toolbar — search left, result count right */}
      <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
          <Input
            type="text"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-slate-400">
          {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
        </span>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 tf-round-edges">
        {isLoading ? (
          /* Neutral skeleton matching the users table columns: User ID, User,
             Role, Permissions, Status, Created At, Last Login, Actions.
             Column count per breakpoint mirrors the real <thead> below: User ID
             hides below sm, Permissions below md, Created At/Last Login below lg —
             otherwise the skeleton shows 8 cramped columns on a phone while the
             real table only ever shows 4. */
          <div className="tf-table-shell">
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-6 py-4">
              <div className="hidden sm:block"><Skeleton className="h-3 w-16" /></div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-12" />
              <div className="hidden md:block"><Skeleton className="h-3 w-24" /></div>
              <Skeleton className="h-3 w-14" />
              <div className="hidden lg:block"><Skeleton className="h-3 w-20" /></div>
              <div className="hidden lg:block"><Skeleton className="h-3 w-20" /></div>
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {Array.from({ length: 8 }).map((_, r) => (
                <div key={r} className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 items-center gap-4 px-6 py-4">
                  <div className="hidden sm:block"><Skeleton className="h-5 w-16 rounded" /></div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <div className="hidden md:block">
                    <div className="flex flex-wrap gap-1">
                      <Skeleton className="h-5 w-14 rounded" />
                      <Skeleton className="h-5 w-10 rounded" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <div className="hidden lg:block"><Skeleton className="h-4 w-20" /></div>
                  <div className="hidden lg:block"><Skeleton className="h-4 w-20" /></div>
                  <div className="flex items-center justify-center gap-1">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="tf-table-shell">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell whitespace-nowrap">
                    User ID
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">
                    Permissions
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                    Created At
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-left text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                    Last Login
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-center text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider tf-sticky-col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-brand-blue/5 transition-colors">
                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 hidden sm:table-cell">
                      {user.user_display_id ? (
                        <span className="px-2 py-0.5 text-2xs sm:text-xs font-mono font-semibold bg-brand-blue/5 text-brand-blue rounded ring-1 ring-brand-blue/15">
                          {user.user_display_id}
                        </span>
                      ) : (
                        <span className="text-2xs sm:text-xs text-gray-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ring-1 ring-white/10 shadow-sm ${
                          user.role.toLowerCase() === 'tenant_admin' || user.role.toLowerCase() === 'admin'
                            ? 'bg-brand-blue shadow-brand-blue/25'
                            : user.role.toLowerCase() === 'recruiter'
                            ? 'bg-gradient-to-br from-brand-cyan to-brand-blue shadow-brand-cyan/20'
                            : 'bg-gradient-to-br from-slate-500 to-slate-600'
                        }`}>
                          <span className="text-white text-xs sm:text-sm font-semibold">
                            {(user.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 truncate">{user.name || user.email || 'Unknown'}</div>
                          <div className="text-2xs sm:text-xs text-gray-500 dark:text-slate-500 flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{user.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
                      <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-2xs sm:text-xs font-semibold rounded-full ring-1 ring-inset ring-black/5 ${getRoleBadgeColor(user.role, availableRoles)}`}>
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
                              className="px-2 py-0.5 text-xs font-medium bg-brand-blue/5 text-brand-blue rounded ring-1 ring-brand-blue/15"
                            >
                              {permissionLabels[key as keyof UserPermissions]}
                            </span>
                          ))}
                        {Object.values(user.permissions).filter(v => v).length > 3 && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-brand-cyan/5 text-brand-cyan rounded ring-1 ring-brand-cyan/15">
                            +{Object.values(user.permissions).filter(v => v).length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
                      {/* Toggle Switch for Active/Inactive — requires users:disable */}
                      {user.role.toLowerCase() !== 'tenant_admin' && user.id !== currentUserId && canDisableUser ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleActive(user)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:ring-offset-2 ring-1 ring-inset ${
                              user.is_active
                                ? 'bg-success ring-success-line shadow-sm'
                                : 'bg-gray-300 ring-black/5'
                            }`}
                            title={user.is_active ? 'Active - Click to deactivate' : 'Inactive - Click to activate'}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                user.is_active ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <span className={`text-xs font-semibold ${user.is_active ? 'text-success' : 'text-gray-500 dark:text-slate-500'}`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      ) : (
                        <Badge variant={user.is_active ? 'success' : 'destructive'}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-500">
                        <Calendar className="w-4 h-4 text-brand-cyan" />
                        {formatIST(user.created_at)}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-500">
                        <Calendar className="w-4 h-4 text-brand-cyan" />
                        {formatIST(user.last_login)}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 tf-sticky-col">
                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                        {/* Feature Permissions button - HIDDEN for now as requested */}
                        {/* {user.role.toLowerCase() !== 'tenant_admin' && (
                          <button
                            onClick={() => setFeaturePermissionUser(user)}
                            className="p-2 text-gray-500 dark:text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            aria-label="Feature Permissions" title="Feature Permissions"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                        )} */}
  
                        {/* Edit button - requires users:update, disabled when user is inactive.
                            Icon stays visible (never removed from the DOM) when the permission
                            is off, matching the is_active disabled treatment right below it —
                            and reacts live to a permission change because canUpdateUser is
                            derived from currentUser?.permissions on every render. */}
                        {user.role.toLowerCase() !== 'tenant_admin' && user.id !== currentUserId && (
                          <Tooltip content={!canUpdateUser ? 'You do not have permission to edit users' : user.is_active ? 'Edit User' : 'Cannot edit inactive user'}>
                            <button
                              onClick={() => canUpdateUser && user.is_active && openEditModal(user)}
                              disabled={!canUpdateUser || !user.is_active}
                              aria-label="Edit user"
                              className={`p-2 rounded-lg transition-all ${
                                canUpdateUser && user.is_active
                                  ? 'text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/10 cursor-pointer'
                                  : 'text-gray-300 dark:text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        )}

                        {/* Reset Password — requires users:reset_password. Icon stays visible; see Edit button above. */}
                        {user.role.toLowerCase() !== 'tenant_admin' && user.id !== currentUserId && (
                          <Tooltip content={!canResetPassword ? 'You do not have permission to reset passwords' : user.is_active ? 'Reset Password' : 'Cannot reset password for inactive user'}>
                            <button
                              onClick={() => { if (canResetPassword && user.is_active) { setResetPwMode('choose'); setResetPwUser(user); } }}
                              disabled={!canResetPassword || !user.is_active}
                              aria-label="Reset password"
                              className={`p-2 rounded-lg transition-all ${
                                canResetPassword && user.is_active
                                  ? 'text-gray-500 dark:text-slate-500 hover:text-warning hover:bg-warning-subtle cursor-pointer'
                                  : 'text-gray-300 dark:text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        )}

                        {/* Force Password Change — requires users:force_password_change. Icon stays visible; see Edit button above. */}
                        {user.role.toLowerCase() !== 'tenant_admin' && user.id !== currentUserId && (
                          <Tooltip content={!canForcePwChange ? 'You do not have permission to force a password change' : user.is_active ? 'Force password change on next login' : 'Cannot update inactive user'}>
                            <button
                              onClick={() => canForcePwChange && user.is_active && handleForcePasswordChange(user)}
                              disabled={!canForcePwChange || !user.is_active}
                              aria-label="Force password change"
                              className={`p-2 rounded-lg transition-all ${
                                canForcePwChange && user.is_active
                                  ? 'text-gray-500 dark:text-slate-500 hover:text-brand-orange hover:bg-brand-orange/10 cursor-pointer'
                                  : 'text-gray-300 dark:text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              <Lock className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && filteredUsers.length === 0 && (
          <EmptyState
            icon={UserCog}
            title="No users found"
            description="Try adjusting your search, or invite a new teammate to get started."
          />
        )}
      </div>

      {/* Pagination */}
      {!isLoading && filteredUsers.length > 0 && (
        <ListPagination
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalItems={filteredUsers.length}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
          itemLabel="users"
        />
      )}
      </>
      )}
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
            {/* Header strip */}
            <div className="bg-brand-blue px-4 sm:px-6 py-4 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm flex-shrink-0">
                  <Plus className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-white truncate">Invite New User</h2>
                  <p className="text-xs text-white/80 mt-0.5 truncate">Create an account and send an invite email</p>
                </div>
              </div>
              <Button
                variant="secondary"
                tone="onColor"
                size="sm"
                onClick={resetCreateModal}
                className="px-2 flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4 px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1">
              <div>
                <Label className="mb-1.5">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <Label className="mb-1.5">
                  Email <span className="text-destructive">*</span>
                </Label>

                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewUser({ ...newUser, email: value });
                    checkEmailAvailability(value);
                  }}
                  placeholder="user@example.com"
                />

                {/* Email validation feedback */}
                {isCheckingEmail && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-500 dark:text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
                    <span>Validating email...</span>
                  </div>
                )}

                {emailCheckResult.error && (
                  <div className="mt-2 p-3 bg-destructive-subtle border border-destructive-line rounded-lg ring-1 ring-destructive-line">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-destructive-strong font-medium">
                          {emailCheckResult.error}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Password is auto-generated — user receives invite email */}
              <div className="flex items-start gap-2.5 p-3 bg-gradient-to-r from-brand-blue/5 to-brand-cyan/5 border border-brand-blue/20 rounded-lg text-sm text-brand-blue ring-1 ring-brand-blue/10">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-blue" />
                <span className="text-xs sm:text-sm">A temporary password will be auto-generated and emailed to the user. They will be asked to set a new password on first login.</span>
              </div>
              <div>
                <Label className="mb-2">
                  Role <span className="text-destructive">*</span>
                </Label>
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
                        className={`relative p-2.5 sm:p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'border-brand-blue bg-brand-blue/5 ring-2 ring-brand-blue/30 shadow-sm'
                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`font-semibold truncate text-sm ${isSelected ? 'text-brand-blue' : 'text-gray-800 dark:text-slate-100'}`}>
                              {role.name}
                            </span>
                            {isSystemRole && (
                              <span className="text-2xs font-medium text-brand-cyan bg-brand-cyan/10 ring-1 ring-brand-cyan/20 px-1.5 py-0.5 rounded flex-shrink-0">
                                System
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 bg-brand-blue rounded-full flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-xs text-gray-500 dark:text-slate-500 mt-1 line-clamp-1">{role.description}</p>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleViewRolePopup(role, e)}
                          className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-cyan hover:text-brand-blue transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View Permissions
                        </button>
                      </button>
                    );
                  })}
                </div>
                {availableRoles.length === 0 && (
                  <div className="text-center py-6 px-4 text-gray-500 dark:text-slate-500 text-sm border border-dashed border-gray-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    No roles available. Create roles in Role Management first.
                  </div>
                )}
              </div>

              {/* Role Permissions section removed — use "View Permissions" on each role card */}
              {false && selectedRoleId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                      Role Permissions
                    </label>
                    <span className="text-xs text-gray-500 dark:text-slate-500">
                      {selectedPermissionCodes.size} permissions assigned
                    </span>
                  </div>
                  {isLoadingPermissions ? (
                    <div className="flex items-center justify-center py-3 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800/50">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500 dark:text-slate-500" />
                      <span className="ml-2 text-sm text-gray-500 dark:text-slate-500">Loading...</span>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-lg p-3 bg-gray-50 dark:bg-slate-800/50">
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

                        // Feature not in the plan: shown greyed with the plan hover, not hidden.
                        if (!isCategoryVisible(category.id)) return renderPlanLockedCategory(category.id, category.name);

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
                            <div className="flex-shrink-0 w-5 h-5 bg-success-subtle rounded flex items-center justify-center mt-0.5">
                              <Check className="w-3 h-3 text-success" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-slate-50">
                                {category.name}
                                {category.isMenuToggle && (
                                  <span className="ml-2 text-xs text-success bg-success-subtle px-1.5 py-0.5 rounded">
                                    Menu Access
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                                {selectedActions.join(' • ')}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Show message if no custom permissions found */}
                      {selectedPermissionCodes.size === 0 && (
                        <div className="text-center py-4 text-gray-500 dark:text-slate-500 text-sm">
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

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
              <Button
                variant="primary"
                onClick={handleCreateUser}
                disabled={isSaving || !emailCheckResult.available || isCheckingEmail}
                icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              >
                Create User
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal - Redesigned */}
      {editingUser && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
            {/* Header */}
            <div className="bg-brand-blue flex items-center justify-between px-4 sm:px-6 py-4 gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm flex-shrink-0">
                  <Pencil className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-white truncate">Edit User</h2>
                  <p className="text-xs text-white/80 mt-0.5 truncate">{editingUser.email}</p>
                </div>
              </div>
              <Button
                variant="secondary"
                tone="onColor"
                size="sm"
                onClick={resetEditModal}
                className="px-2 flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Body - Scrollable */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
              {/* User Details Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Name</label>
                  <Input
                    type="text"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">Email</label>
                  <Input
                    type="email"
                    value={editingUser.email}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              {/* Role Selection - Compact Pills */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-2">Role</label>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map(role => {
                    const isSelected = editSelectedRoleId === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => selectRole(role.id, true)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ring-1 ${
                          isSelected
                            ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-white/10'
                            : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 ring-gray-200 dark:ring-slate-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:ring-brand-blue/30'
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
                    <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-brand-blue" />
                      Permissions
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllEditPermissions}
                        className="text-2xs font-medium text-brand-blue hover:underline"
                      >
                        {getAllCustomPermissionCodes().every(code => editSelectedPermissionCodes.has(code))
                          ? 'Deselect all'
                          : 'Select all'}
                      </button>
                      <span className="text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-2 py-0.5 rounded-full">
                        {editSelectedPermissionCodes.size} active
                      </span>
                    </div>
                  </div>

                  {isLoadingPermissions ? (
                    <div className="space-y-4">
                      {Array.from({ length: 3 }).map((_, ci) => (
                        <div key={ci} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                          {/* Module Header */}
                          <div className="px-3 sm:px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Skeleton className="w-8 h-[18px] rounded-full flex-shrink-0" />
                              <Skeleton className="h-4 w-32" />
                            </div>
                            <Skeleton className="h-3 w-16" />
                          </div>
                          {/* Permission Cards Grid */}
                          <div className="p-2 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                            {Array.from({ length: 4 }).map((_, pi) => (
                              <div key={pi} className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border border-gray-100 dark:border-slate-800">
                                <Skeleton className="w-6 h-6 sm:w-8 sm:h-8 rounded flex-shrink-0" />
                                <Skeleton className="h-4 flex-1" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {CUSTOM_PERMISSION_CATEGORIES.map(category => {
                        // Feature not in the plan: shown greyed with the plan hover, not hidden.
                        if (!isCategoryVisible(category.id)) return renderPlanLockedCategory(category.id, category.name);

                        // Pure codes-only toggle — no dual-state sync needed
                        const toggleCode = async (code: string) => {
                          if (editSelectedPermissionCodes.has(code)) {
                            // Disabling — confirm cascading to any dependents instead of blocking
                            const removal = await confirmCascadeDisable(
                              getPermissionDisplayName(code),
                              [code],
                              editSelectedPermissionCodes
                            );
                            if (!removal) return;
                            setEditSelectedPermissionCodes(prev => {
                              const next = new Set(prev);
                              removal.forEach(c => next.delete(c));
                              // Auto-remove viewCode if no actions remain in category
                              if (category.viewCode) {
                                const allActions = [
                                  ...(category.actions || []),
                                  ...(category.subCategories?.flatMap(s => s.actions) || []),
                                ];
                                if (!allActions.some(a => !removal.has(a.code) && next.has(a.code))) {
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
                              // Handle dependencies — also enable each dep's category viewCode
                              deps.forEach(dep => {
                                next.add(dep);
                                const depViewCode = getCategoryViewCodeFor(dep);
                                if (depViewCode) next.add(depViewCode);
                              });
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

                        const toggleCategory = async (e?: React.MouseEvent) => {
                          const allCategoryCodes = [
                            ...(category.viewCode ? [category.viewCode] : []),
                            ...(category.actions?.map(a => a.code) || []),
                            ...(category.subCategories?.flatMap(s => [
                              ...(s.viewCode ? [s.viewCode] : []),
                              ...s.actions.map(a => a.code),
                            ]) || []),
                          ];
                          let cascadeRemoval: Set<string> | null = null;
                          if (isCategoryActive) {
                            // Confirm cascading to any dependents instead of blocking
                            cascadeRemoval = await confirmCascadeDisable(
                              category.name,
                              allCategoryCodes,
                              editSelectedPermissionCodes
                            );
                            if (!cascadeRemoval) return;
                          }
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
                              // Cascade-remove whatever else depended on this category
                              cascadeRemoval!.forEach(c => next.delete(c));
                            } else {
                              // Enable all codes in this category
                              if (category.viewCode) next.add(category.viewCode);
                              category.actions?.forEach(a => next.add(a.code));
                              category.subCategories?.forEach(s => {
                                if (s.viewCode) next.add(s.viewCode);
                                s.actions.forEach(a => next.add(a.code));
                              });
                              // Auto-enable dependencies for every code in this category
                              allCategoryCodes.forEach(c => {
                                getPermissionDependencies(c).forEach(dep => {
                                  next.add(dep);
                                  const depViewCode = getCategoryViewCodeFor(dep);
                                  if (depViewCode) next.add(depViewCode);
                                });
                              });
                            }
                            return next;
                          });
                        };

                        // Badge color + letter derived from permission code action segment
                        const getActionBadge = (code: string) => {
                          const action = code.split(':').pop() || '';
                          if (action === 'read') return { cls: 'bg-brand-blue/10 text-brand-blue', letter: 'R' };
                          if (action === 'create') return { cls: 'bg-success-subtle text-success', letter: 'C' };
                          if (action === 'update') return { cls: 'bg-warning-subtle text-warning', letter: 'U' };
                          if (action === 'delete') return { cls: 'bg-destructive-subtle text-destructive', letter: 'D' };
                          return { cls: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300', letter: (action[0] || 'A').toUpperCase() };
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
                          <div key={category.id} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                            {/* Module Header */}
                            <div
                              className={`px-3 sm:px-4 py-2.5 border-b flex items-center justify-between select-none transition-colors ${
                                isCategoryActive
                                  ? 'bg-gradient-to-r from-brand-blue/5 to-brand-cyan/5 border-brand-blue/15'
                                  : 'bg-slate-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700'
                              }`}
                              onClick={category.viewCode ? toggleCategory : undefined}
                              style={category.viewCode ? { cursor: 'pointer' } : undefined}
                            >
                              <div className="flex items-center gap-3">
                                {category.viewCode && (
                                  <div className={`w-8 h-[18px] rounded-full relative transition-colors flex-shrink-0 ring-1 ring-inset ${isCategoryActive ? 'bg-brand-blue ring-white/20' : 'bg-gray-300 ring-black/5'}`}>
                                    <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${isCategoryActive ? 'left-[17px]' : 'left-[2px]'}`} />
                                  </div>
                                )}
                                <h4 className={`font-semibold capitalize text-xs sm:text-sm ${isCategoryActive ? 'text-brand-blue' : 'text-gray-500 dark:text-slate-500'}`}>
                                  {category.name} ({allCodes.length})
                                </h4>
                                {category.isMenuToggle && isCategoryActive && (
                                  <span className="text-2xs text-brand-orange bg-brand-orange/10 ring-1 ring-brand-orange/20 px-1.5 py-0.5 rounded-full font-medium">
                                    Menu
                                  </span>
                                )}
                              </div>
                              <span className="text-2xs font-medium text-gray-500 dark:text-slate-500">{selectedCount} selected</span>
                            </div>

                            {/* Permission Cards Grid */}
                            <div className="p-2 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                              {/* View card */}
                              {category.viewCode && (() => {
                                const badge = getActionBadge(category.viewCode);
                                const isMandatory = MANDATORY_PERMISSION_CODES.has(category.viewCode);
                                const isOn = isMandatory || editSelectedPermissionCodes.has(category.viewCode);
                                return (
                                  <div
                                    key={category.viewCode}
                                    onClick={isMandatory
                                      ? () => toast.info(`"View ${category.name}" is a baseline permission every account keeps — it can't be disabled.`)
                                      : () => toggleCode(category.viewCode!)}
                                    title={isMandatory ? 'Baseline permission — always enabled for every account' : undefined}
                                    className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-all select-none ${isMandatory ? 'cursor-default' : 'cursor-pointer'} ${isOn ? 'bg-brand-blue/5 border-brand-blue/30 ring-1 ring-brand-blue/20 shadow-sm' : 'bg-slate-50/50 dark:bg-slate-800/50 border-gray-100 dark:border-slate-700/60 opacity-50 hover:opacity-90 hover:border-brand-blue/30 hover:bg-brand-blue/5'}`}
                                  >
                                    <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0 ${badge.cls}`}>
                                      <span className="text-2xs sm:text-xs font-bold">{badge.letter}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-slate-50">
                                        View {category.name}
                                        {isMandatory && (
                                          <span className="ml-1.5 text-2xs font-normal text-gray-500 dark:text-slate-500 italic">(always on)</span>
                                        )}
                                      </div>
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
                                    className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-all select-none ${isOn ? 'bg-brand-blue/5 border-brand-blue/30 ring-1 ring-brand-blue/20 shadow-sm' : 'bg-slate-50/50 dark:bg-slate-800/50 border-gray-100 dark:border-slate-700/60 opacity-50 hover:opacity-90 hover:border-brand-blue/30 hover:bg-brand-blue/5'}`}
                                  >
                                    <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0 ${badge.cls}`}>
                                      <span className="text-2xs sm:text-xs font-bold">{badge.letter}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-slate-50">{action.label}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Sub-categories */}
                            {category.subCategories?.map(sub => {
                              if (!isCategoryVisible(category.id, sub.name)) return renderPlanLockedCategory(`${category.id}:${sub.name}`, sub.name);

                              const isSubActive = sub.viewCode
                                ? editSelectedPermissionCodes.has(sub.viewCode) || sub.actions.some(a => editSelectedPermissionCodes.has(a.code))
                                : sub.actions.some(a => editSelectedPermissionCodes.has(a.code));

                              const toggleSub = async () => {
                                const subAllCodesForToggle = [
                                  ...(sub.viewCode ? [sub.viewCode] : []),
                                  ...sub.actions.map(a => a.code),
                                ];
                                let cascadeRemoval: Set<string> | null = null;
                                if (isSubActive) {
                                  // Confirm cascading to any dependents instead of blocking
                                  cascadeRemoval = await confirmCascadeDisable(
                                    sub.name,
                                    subAllCodesForToggle,
                                    editSelectedPermissionCodes
                                  );
                                  if (!cascadeRemoval) return;
                                }
                                setEditSelectedPermissionCodes(prev => {
                                  const next = new Set(prev);
                                  if (isSubActive) {
                                    if (sub.viewCode) next.delete(sub.viewCode);
                                    sub.actions.forEach(a => next.delete(a.code));
                                    cascadeRemoval!.forEach(c => next.delete(c));
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
                                    // Auto-enable dependencies for every code in this sub-category
                                    subAllCodesForToggle.forEach(c => {
                                      getPermissionDependencies(c).forEach(dep => {
                                        next.add(dep);
                                        const depViewCode = getCategoryViewCodeFor(dep);
                                        if (depViewCode) next.add(depViewCode);
                                      });
                                    });
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
                                <div key={sub.name} className="border-t border-gray-100 dark:border-slate-700/60">
                                  {/* Sub-category header */}
                                  <div
                                    className={`px-3 sm:px-4 py-2 flex items-center justify-between cursor-pointer select-none transition-colors ${isSubActive ? 'bg-brand-cyan/5' : 'bg-slate-50 dark:bg-slate-800/50'}`}
                                    onClick={toggleSub}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={`w-6 h-[14px] rounded-full relative transition-colors flex-shrink-0 ring-1 ring-inset ${isSubActive ? 'bg-gradient-to-r from-brand-cyan to-brand-blue ring-white/20' : 'bg-gray-300 ring-black/5'}`}>
                                        <div className={`absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white shadow-sm transition-transform ${isSubActive ? 'left-[13px]' : 'left-[2px]'}`} />
                                      </div>
                                      <span className={`text-xs font-semibold ${isSubActive ? 'text-brand-cyan' : 'text-gray-500 dark:text-slate-500'}`}>
                                        {sub.name} ({subAllCodes.length})
                                      </span>
                                    </div>
                                    <span className="text-2xs font-medium text-gray-500 dark:text-slate-500">{subSelectedCount} selected</span>
                                  </div>
                                  {/* Sub-category cards */}
                                  <div className="p-2 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                                    {sub.viewCode && (() => {
                                      const badge = getActionBadge(sub.viewCode);
                                      const isOn = editSelectedPermissionCodes.has(sub.viewCode);
                                      return (
                                        <div
                                          key={sub.viewCode}
                                          onClick={async () => {
                                            if (editSelectedPermissionCodes.has(sub.viewCode!)) {
                                              const removal = await confirmCascadeDisable(
                                                getPermissionDisplayName(sub.viewCode!),
                                                [sub.viewCode!],
                                                editSelectedPermissionCodes
                                              );
                                              if (!removal) return;
                                              setEditSelectedPermissionCodes(prev => { const next = new Set(prev); removal.forEach(c => next.delete(c)); return next; });
                                            } else {
                                              setEditSelectedPermissionCodes(prev => { const next = new Set(prev); next.add(sub.viewCode!); if (category.viewCode) next.add(category.viewCode); return next; });
                                            }
                                          }}
                                          className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-all select-none ${isOn ? 'bg-brand-cyan/5 border-brand-cyan/30 ring-1 ring-brand-cyan/20 shadow-sm' : 'bg-slate-50/50 dark:bg-slate-800/50 border-gray-100 dark:border-slate-700/60 opacity-50 hover:opacity-90 hover:border-brand-cyan/30 hover:bg-brand-cyan/5'}`}
                                        >
                                          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0 ${badge.cls}`}>
                                            <span className="text-2xs sm:text-xs font-bold">{badge.letter}</span>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-slate-50">View {sub.name}</div>
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
                                          onClick={async () => {
                                            if (editSelectedPermissionCodes.has(action.code)) {
                                              const removal = await confirmCascadeDisable(
                                                getPermissionDisplayName(action.code),
                                                [action.code],
                                                editSelectedPermissionCodes
                                              );
                                              if (!removal) return;
                                              setEditSelectedPermissionCodes(prev => {
                                                const next = new Set(prev);
                                                removal.forEach(c => next.delete(c));
                                                if (sub.viewCode && !sub.actions.some(a => !removal.has(a.code) && next.has(a.code))) {
                                                  next.delete(sub.viewCode);
                                                }
                                                if (category.viewCode) {
                                                  const anyLeft = [
                                                    ...(category.actions || []),
                                                    ...(category.subCategories?.flatMap(s => s.actions) || []),
                                                  ].some(a => !removal.has(a.code) && next.has(a.code));
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
                                                // Also enable each dep's category viewCode
                                                deps.forEach(dep => {
                                                  next.add(dep);
                                                  const depViewCode = getCategoryViewCodeFor(dep);
                                                  if (depViewCode) next.add(depViewCode);
                                                });
                                                return next;
                                              });
                                              if (newlyEnabled.length > 0) {
                                                const depLabels = newlyEnabled.map(d => getPermissionDisplayName(d)).join(' and ');
                                                toast.info(`"${depLabels}" auto-enabled — required for "${getPermissionDisplayName(action.code)}"`);
                                              }
                                            }
                                          }}
                                          className={`flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-all select-none ${isOn ? 'bg-brand-cyan/5 border-brand-cyan/30 ring-1 ring-brand-cyan/20 shadow-sm' : 'bg-slate-50/50 dark:bg-slate-800/50 border-gray-100 dark:border-slate-700/60 opacity-50 hover:opacity-90 hover:border-brand-cyan/30 hover:bg-brand-cyan/5'}`}
                                        >
                                          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0 ${badge.cls}`}>
                                            <span className="text-2xs sm:text-xs font-bold">{badge.letter}</span>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-slate-50">{action.label}</div>
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
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
              <span className="text-2xs sm:text-xs font-medium text-brand-orange hidden sm:inline-flex items-center gap-1.5">
                {editSelectedPermissionCodes.size !== editOriginalPermissionCodes.size ||
                 ![...editSelectedPermissionCodes].every(c => editOriginalPermissionCodes.has(c)) ? (
                  <>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-orange" />
                    Unsaved changes
                  </>
                ) : ''}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={handleUpdateUser}
                  disabled={isSaving}
                  icon={isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                >
                  Save Changes
                </Button>
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

      {/* Reset Password Modal — choose: email a temp password OR set one directly */}
      {resetPwUser && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md ring-1 ring-black/5 max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-brand-orange text-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm flex-shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">Reset Password</p>
                  <p className="text-xs text-white/80 truncate">{resetPwUser.email}</p>
                </div>
              </div>
              <Button variant="secondary" tone="onColor" size="sm" onClick={closeResetPwModal} className="px-2 flex-shrink-0" aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4">
              {resetPwMode === 'choose' ? (
                <>
                  <button
                    onClick={() => handleResetPasswordEmail(resetPwUser)}
                    disabled={resetPwSubmitting}
                    className="w-full text-left p-4 rounded-xl ring-1 ring-gray-200 dark:ring-slate-600 hover:ring-warning-line hover:bg-warning-subtle/50 dark:hover:bg-slate-700/50 transition-all disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-warning flex-shrink-0" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-slate-50 text-sm">Email a temporary password</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Sends a temp password to the user and forces a reset on next login. You never see it.</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setResetPwMode('direct')}
                    disabled={resetPwSubmitting}
                    className="w-full text-left p-4 rounded-xl ring-1 ring-gray-200 dark:ring-slate-600 hover:ring-brand-blue/50 hover:bg-brand-blue/5 transition-all disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <KeyRound className="w-5 h-5 text-brand-blue flex-shrink-0" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-slate-50 text-sm">Set a password directly</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">You type a new password and hand it to the user. No email, no OTP.</p>
                      </div>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">New password</label>
                    <div className="relative">
                      <Input
                        type={directPwShow ? 'text' : 'password'}
                        value={directPw}
                        onChange={(e) => setDirectPw(e.target.value)}
                        autoComplete="new-password"
                        className="pr-10"
                        placeholder="Min 8 chars, upper, lower, number, special"
                      />
                      <button type="button" onClick={() => setDirectPwShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600" aria-label="Toggle visibility">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Confirm password</label>
                    <Input
                      type={directPwShow ? 'text' : 'password'}
                      value={directPwConfirm}
                      onChange={(e) => setDirectPwConfirm(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Re-enter password"
                    />
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={directPwForceChange}
                      onCheckedChange={(v) => setDirectPwForceChange(!!v)}
                      className="mt-0.5"
                    />
                    <span className="text-xs text-gray-600 dark:text-slate-400">Require the user to change this password on next login</span>
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setResetPwMode('choose')}
                      disabled={resetPwSubmitting}
                      icon={<ArrowLeft className="w-4 h-4" />}
                    >
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSetPasswordDirect(resetPwUser)}
                      disabled={resetPwSubmitting}
                      className="flex-1"
                      icon={resetPwSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                    >
                      Set Password
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RBAC07: Dependency Matrix Modal */}
      <DependencyMatrix
        isOpen={isDependencyMatrixOpen}
        onClose={() => setIsDependencyMatrixOpen(false)}
      />

      {/* Add Seats Modal - opens when user limit is exhausted */}
      <AddSeatsModal
        isOpen={showAddSeatsModal}
        onClose={() => setShowAddSeatsModal(false)}
        currentSeats={limits?.current_users ?? users.length}
        maxSeats={limits?.max_users ?? 0}
        planName={limits?.plan_name ?? ''}
        onSuccess={() => {
          setShowAddSeatsModal(false);
          setSeatQuotaRefreshTrigger(t => t + 1);
          loadUsers();
          refreshLimits();
        }}
      />

      {/* View Role Permissions Popup */}
      {viewingRolePopup && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-4xl w-full max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
            {/* Header */}
            <div className="bg-brand-blue px-4 sm:px-6 py-4 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm flex-shrink-0">
                  <Eye className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-xl font-bold text-white truncate">{viewingRolePopup.name}</h2>
                  <p className="text-white/80 text-xs sm:text-sm truncate">{viewingRolePopup.description}</p>
                </div>
              </div>
              <Button
                variant="secondary"
                tone="onColor"
                size="sm"
                onClick={() => { setViewingRolePopup(null); setViewingRolePopupPermissions([]); }}
                className="px-2 flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </div>

            {/* Body */}
            <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-slate-50/30 dark:bg-slate-800/30">
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6 p-3 sm:p-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm">
                <div>
                  <div className="text-2xs sm:text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wide mb-0.5 sm:mb-1">Role Code</div>
                  <div className="font-semibold text-brand-blue text-xs sm:text-base truncate">{viewingRolePopup.code}</div>
                </div>
                <div>
                  <div className="text-2xs sm:text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wide mb-0.5 sm:mb-1">Users</div>
                  <div className="font-bold text-gray-900 dark:text-slate-50 text-xs sm:text-base">{viewingRolePopup.user_count}</div>
                </div>
                <div>
                  <div className="text-2xs sm:text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wide mb-0.5 sm:mb-1">Permissions</div>
                  <div className="font-bold text-gray-900 dark:text-slate-50 text-xs sm:text-base">{viewingRolePopupPermissions.length}</div>
                </div>
              </div>

              <h3 className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide mb-3 sm:mb-4 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-brand-blue" />
                Allocated Permissions ({viewingRolePopupPermissions.length})
              </h3>

              {isViewingRolePopupLoading ? (
                <div className="space-y-4 sm:space-y-6">
                  {Array.from({ length: 2 }).map((_, mi) => (
                    <div key={mi} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                      <div className="bg-slate-50 dark:bg-slate-800/50 px-3 sm:px-4 py-2.5 border-b border-gray-200 dark:border-slate-700">
                        <Skeleton className="h-4 w-28" />
                      </div>
                      <div className="p-2 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                        {Array.from({ length: 4 }).map((_, pi) => (
                          <div key={pi} className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                            <Skeleton className="w-6 h-6 sm:w-8 sm:h-8 rounded flex-shrink-0" />
                            <Skeleton className="h-4 flex-1 mt-1" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : viewingRolePopupPermissions.length === 0 ? (
                <div className="text-center py-10 sm:py-12">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/20 mb-3">
                    <Shield className="w-7 h-7 text-brand-blue" />
                  </div>
                  <p className="text-gray-700 dark:text-slate-300 font-semibold text-sm">No permissions allocated</p>
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
                    <div key={module} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                      <div className="bg-gradient-to-r from-brand-blue/5 to-brand-cyan/5 px-3 sm:px-4 py-2.5 border-b border-brand-blue/15">
                        <h4 className="font-semibold text-brand-blue capitalize text-xs sm:text-sm">
                          {module.replace(/_/g, ' ')} ({perms.length})
                        </h4>
                      </div>
                      <div className="p-2 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                        {perms.map((perm) => (
                          <div
                            key={perm.id}
                            className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-all"
                          >
                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0 ${
                              perm.action === 'read'   ? 'bg-brand-blue/10 text-brand-blue' :
                              perm.action === 'create' ? 'bg-success-subtle text-success' :
                              perm.action === 'update' ? 'bg-warning-subtle text-warning' :
                              perm.action === 'delete' ? 'bg-destructive-subtle text-destructive' :
                              'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              <span className="text-2xs sm:text-xs font-bold uppercase">{perm.action[0]}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-slate-50">{perm.name}</div>
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
            <div className="bg-slate-50/50 dark:bg-slate-800/50 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 border-t border-gray-200 dark:border-slate-700 shrink-0">
              <div className="text-sm text-gray-500 dark:text-slate-500">
                {viewingRolePopup.is_system && (
                  <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 rounded-full text-2xs sm:text-xs font-semibold">
                    <Lock className="w-3 h-3" />
                    System Role (Read-Only)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
      </div>
    </main>
  );
}
