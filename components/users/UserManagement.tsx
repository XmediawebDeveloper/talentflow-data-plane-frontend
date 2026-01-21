'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Mail,
  Calendar,
  Loader2,
  UserCog,
  Check,
  Settings2,
  Link2
} from 'lucide-react';
import { toast } from 'sonner';
import authService from '@/lib/services/authService';
import rbacService from '@/lib/services/rbacService';
import userService from '@/lib/services/userService';
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
  internal_db: 'Internal Database',
  assessments: 'Assessments',
  analytics: 'Analytics',
  settings: 'Settings',
  users: 'Users',
  roles: 'Roles',
  // RBAC03: Billing Manager modules
  billing: 'Billing & Subscriptions',
  invoices: 'Invoices & Payments',
  usage: 'Usage & Quotas',
};

// Group permissions by module
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

  // Return groups in a specific order
  const moduleOrder = ['jd', 'resumes', 'internal_db', 'assessments', 'analytics', 'billing', 'invoices', 'usage', 'settings', 'users', 'roles'];
  return moduleOrder
    .filter(mod => groups[mod])
    .map(mod => groups[mod]);
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
  tenant_admin: 'Admin',
  admin: 'Admin',
  recruiter: 'Recruiter',
  viewer: 'Viewer',
  billing_manager: 'Billing',
  standard_user: 'User',
};

// Default badge colors for known roles - RBAC01-07
const defaultRoleBadgeColors: Record<string, string> = {
  tenant_admin: 'bg-gray-200 text-gray-800',
  admin: 'bg-gray-200 text-gray-800',
  recruiter: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-50 text-gray-600',
  billing_manager: 'bg-green-100 text-green-700',
  standard_user: 'bg-gray-100 text-gray-600',
};

// Get role label - use RBAC name or fallback to defaults
const getRoleLabel = (role: string, availableRoles: RoleListItem[]): string => {
  const rbacRole = availableRoles.find(r => r.code.toLowerCase() === role.toLowerCase());
  if (rbacRole) return rbacRole.name;
  return defaultRoleLabels[role.toLowerCase()] || role.charAt(0).toUpperCase() + role.slice(1);
};

// Get role badge color - use defaults for known roles, gray for custom
const getRoleBadgeColor = (role: string): string => {
  return defaultRoleBadgeColors[role.toLowerCase()] || 'bg-blue-100 text-blue-700';
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

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

  // RBAC06-07: Feature permission states
  const [featurePermissionUser, setFeaturePermissionUser] = useState<ApiUser | null>(null);
  const [isDependencyMatrixOpen, setIsDependencyMatrixOpen] = useState(false);

  // RBAC01: User limits hook
  const { limits, isAtLimit, canAddUsers, refresh: refreshLimits } = useUserLimits();

  // Refresh trigger for SeatQuotaCard
  const [seatQuotaRefreshTrigger, setSeatQuotaRefreshTrigger] = useState(0);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [editRoleDropdownOpen, setEditRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const editRoleDropdownRef = useRef<HTMLDivElement>(null);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'viewer',
    permissions: { ...defaultPermissions },
  });

  // Prevent duplicate fetches in development mode
  const hasFetched = useRef(false);

  // Permission guard - check if user has access to User Management
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const currentUser = await authService.getCurrentUser();

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
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadUsers();
    loadRoles();
    loadAllPermissions();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setRoleDropdownOpen(false);
      }
      if (editRoleDropdownRef.current && !editRoleDropdownRef.current.contains(event.target as Node)) {
        setEditRoleDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

      // Get permission IDs from the role
      const permissionIds = new Set<number>(
        roleDetails.permissions?.map(p => p.id) || []
      );

      console.log(`[DEBUG] Loaded ${permissionIds.size} permissions for role ${roleId}`);

      if (isEdit) {
        setEditSelectedRoleId(roleId);
        setEditSelectedPermissionIds(permissionIds);
      } else {
        setSelectedRoleId(roleId);
        setSelectedPermissionIds(permissionIds);
      }
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      // Clear permissions on error
      if (isEdit) {
        setEditSelectedRoleId(roleId);
        setEditSelectedPermissionIds(new Set());
      } else {
        setSelectedRoleId(roleId);
        setSelectedPermissionIds(new Set());
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

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/users`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (!response.ok) {
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
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error('Please fill in all required fields');
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

    const selectedRole = availableRoles.find(r => r.id === selectedRoleId);
    const roleCode = selectedRole?.code || 'viewer';

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          name: newUser.name,
          email: newUser.email,
          password: newUser.password,
          role: roleCode,
          role_id: selectedRoleId,
          permission_ids: Array.from(selectedPermissionIds),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle user limit exceeded error
        if (errorData.detail?.error === 'USER_LIMIT_EXCEEDED') {
          toast.error(errorData.detail.message || 'User limit exceeded. Please upgrade your plan.');
        } else {
          toast.error(errorData.detail?.message || errorData.detail || 'Failed to create user');
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
    setSelectedRoleId(null);
    setSelectedPermissionIds(new Set());
    setRoleDropdownOpen(false);
    setIsCreateModalOpen(false);
  };

  const openEditModal = async (user: ApiUser) => {
    setEditingUser(user);
    // Find the role ID based on user's current role and load its permissions
    const matchingRole = availableRoles.find(r => r.code.toLowerCase() === user.role.toLowerCase());
    if (matchingRole) {
      await selectRole(matchingRole.id, true);
    } else {
      setEditSelectedRoleId(null);
      setEditSelectedPermissionIds(new Set());
    }
  };

  const resetEditModal = () => {
    setEditingUser(null);
    setEditSelectedRoleId(null);
    setEditSelectedPermissionIds(new Set());
    setEditRoleDropdownOpen(false);
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

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          name: editingUser.name,
          role: roleCode,
          role_id: editSelectedRoleId,
          permission_ids: Array.from(editSelectedPermissionIds),
        }),
      });

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
          <UserLimits compact onAddSeatsClick={() => {}} />
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
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
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
                      {/* RBAC06: Feature Permissions button */}
                      <button
                        onClick={() => setFeaturePermissionUser(user)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Feature Permissions"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit User"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="user@company.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Min. 6 characters"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <div ref={roleDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-left flex items-center justify-between"
                  >
                    <span className={selectedRoleId ? 'text-gray-900' : 'text-gray-500'}>
                      {selectedRoleId
                        ? availableRoles.find(r => r.id === selectedRoleId)?.name || 'Select a role...'
                        : 'Select a role...'}
                    </span>
                    <svg className={`w-5 h-5 text-gray-400 transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {roleDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {availableRoles.map(role => (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => {
                            selectRole(role.id);
                            setRoleDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                            selectedRoleId === role.id ? 'bg-gray-50' : ''
                          }`}
                        >
                          <div className="font-medium text-gray-900">{role.name}</div>
                          {role.description && (
                            <div className="text-sm text-gray-500 mt-0.5">{role.description}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Permissions - Only show after role is selected */}
              {selectedRoleId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Permissions <span className="text-xs text-gray-500">(Pre-filled based on role, customize as needed)</span>
                  </label>
                  {isLoadingPermissions ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                      <span className="ml-2 text-sm text-gray-500">Loading permissions...</span>
                    </div>
                  ) : allPermissions.length > 0 ? (
                    <div className="space-y-4 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                      {groupPermissionsByModule(allPermissions).map(group => (
                        <div key={group.module} className="space-y-2">
                          <div className="text-sm font-medium text-gray-800 border-b border-gray-100 pb-1">
                            {group.moduleName}
                          </div>
                          <div className="grid grid-cols-2 gap-2 pl-2">
                            {group.permissions.map(perm => (
                              <label
                                key={perm.id}
                                className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPermissionIds.has(perm.id)}
                                  onChange={() => togglePermission(perm.id)}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{perm.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 border border-gray-200 rounded-lg bg-gray-50">
                      <p className="text-sm text-gray-500">No permissions available</p>
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
                disabled={isSaving}
                className="px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
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
                <input
                  type="email"
                  value={editingUser.email}
                  disabled
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <div ref={editRoleDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setEditRoleDropdownOpen(!editRoleDropdownOpen)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-left flex items-center justify-between"
                  >
                    <span className={editSelectedRoleId ? 'text-gray-900' : 'text-gray-500'}>
                      {editSelectedRoleId
                        ? availableRoles.find(r => r.id === editSelectedRoleId)?.name || 'Select a role...'
                        : 'Select a role...'}
                    </span>
                    <svg className={`w-5 h-5 text-gray-400 transition-transform ${editRoleDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {editRoleDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {availableRoles.map(role => (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => {
                            selectRole(role.id, true);
                            setEditRoleDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                            editSelectedRoleId === role.id ? 'bg-gray-50' : ''
                          }`}
                        >
                          <div className="font-medium text-gray-900">{role.name}</div>
                          {role.description && (
                            <div className="text-sm text-gray-500 mt-0.5">{role.description}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Permissions - Only show after role is selected */}
              {editSelectedRoleId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Permissions <span className="text-xs text-gray-500">(Pre-filled based on role, customize as needed)</span>
                  </label>
                  {isLoadingPermissions ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                      <span className="ml-2 text-sm text-gray-500">Loading permissions...</span>
                    </div>
                  ) : allPermissions.length > 0 ? (
                    <div className="space-y-4 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                      {groupPermissionsByModule(allPermissions).map(group => (
                        <div key={group.module} className="space-y-2">
                          <div className="text-sm font-medium text-gray-800 border-b border-gray-100 pb-1">
                            {group.moduleName}
                          </div>
                          <div className="grid grid-cols-2 gap-2 pl-2">
                            {group.permissions.map(perm => (
                              <label
                                key={perm.id}
                                className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={editSelectedPermissionIds.has(perm.id)}
                                  onChange={() => toggleEditPermission(perm.id)}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{perm.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 border border-gray-200 rounded-lg bg-gray-50">
                      <p className="text-sm text-gray-500">No permissions available</p>
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
