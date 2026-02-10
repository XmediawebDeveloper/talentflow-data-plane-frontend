import { useState, useEffect } from 'react';
import { UserCog, Plus, Search, Edit2, Trash2, X, Mail, Calendar, Loader2 } from 'lucide-react';
import { User, UserRole } from '@/lib/types/tenant';
import { userService, ApiUser, UserPermissions } from '../services/userService';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';

interface UsersManagementProps {
  currentUser?: User;
  tenantId?: string;
}

const roleLabels: Record<UserRole, string> = {
  tenant_admin: 'Owner',
  recruiter: 'Recruiter',
  viewer: 'Viewer',
};

const roleBadgeColors: Record<UserRole, string> = {
  tenant_admin: 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white',
  recruiter: 'bg-gray-100 text-gray-900',
  viewer: 'bg-gray-100 text-gray-700',
};

// ✅ GRANULAR PERMISSION LABELS: Removed all "manage" labels, using only granular CRUD
const permissionLabels: Record<keyof UserPermissions, string> = {
  // JD Permissions
  can_view_jd: 'View JD',
  can_create_jd: 'Create JD',
  can_update_jd: 'Update JD',
  can_delete_jd: 'Delete JD',

  // Resume Permissions
  can_view_resumes: 'View Resumes',
  can_create_resumes: 'Create Resumes',
  can_update_resumes: 'Update Resumes',
  can_delete_resumes: 'Delete Resumes',
  can_upload_resumes: 'Upload Resumes',

  // Assessment Permissions
  can_view_assessments: 'View Assessments',
  can_create_assessments: 'Create Assessments',
  can_update_assessments: 'Update Assessments',
  can_delete_assessments: 'Delete Assessments',

  // Internal DB Permissions
  can_view_internal_db: 'View Internal DB',
  can_create_internal_db: 'Create Internal DB',
  can_update_internal_db: 'Update Internal DB',
  can_delete_internal_db: 'Delete Internal DB',
  can_access_internal_db: 'Access Internal DB',

  // Analytics Permissions
  can_view_analytics: 'View Analytics',
  can_export_analytics: 'Export Analytics',

  // Settings Permissions
  can_view_settings: 'View Settings',
  can_update_settings: 'Update Settings',

  // User Management Permissions
  can_view_users: 'View Users',
  can_create_users: 'Create Users',
  can_update_users: 'Update Users',
  can_delete_users: 'Delete Users',

  // Role Management Permissions
  can_view_roles: 'View Roles',
  can_create_roles: 'Create Roles',
  can_update_roles: 'Update Roles',
  can_delete_roles: 'Delete Roles',

  // Billing Permissions
  can_view_billing: 'View Billing',
  can_update_billing: 'Update Billing',
  can_view_invoices: 'View Invoices',
  can_view_usage: 'View Usage',

  // Feature Permissions
  can_run_scoring: 'Run Scoring',
  can_run_ai_interviews: 'AI Interviews',
  can_run_ai_match: 'AI Match',
  can_bulk_operations: 'Bulk Operations',
  can_export: 'Export Data',
  can_api_access: 'API Access',

  // Dashboard & Support
  can_view_dashboard: 'View Dashboard',
  can_view_support: 'View Support',
};

// ✅ GRANULAR PERMISSIONS: 4 default permissions for ANY role with no permissions
// View-only access to JD, Resumes, Dashboard, and Support
const DEFAULT_MINIMUM_PERMISSIONS: Array<keyof UserPermissions> = [
  'can_view_jd',          // View JD only (not create/update/delete)
  'can_view_resumes',     // View resumes only (not create/update/delete)
  'can_view_dashboard',   // View dashboard
  'can_view_support',     // View support
];

// For recruiters, enforce the same 4 minimum permissions
const RECRUITER_REQUIRED_PERMISSIONS: Array<keyof UserPermissions> = DEFAULT_MINIMUM_PERMISSIONS;

// ✅ GRANULAR PERMISSIONS: Permission dependencies (auto-enable related permissions)
const PERMISSION_DEPENDENCIES: Record<keyof UserPermissions, Array<keyof UserPermissions>> = {
  // Resume dependencies
  can_upload_resumes: ['can_view_resumes'],           // Upload requires view
  can_create_resumes: ['can_view_resumes'],           // Create requires view
  can_update_resumes: ['can_view_resumes'],           // Update requires view
  can_delete_resumes: ['can_view_resumes'],           // Delete requires view
  can_access_internal_db: ['can_view_resumes'],       // Internal DB requires resume view

  // Assessment dependencies
  can_create_assessments: ['can_view_assessments'],   // Create requires view
  can_update_assessments: ['can_view_assessments'],   // Update requires view
  can_delete_assessments: ['can_view_assessments'],   // Delete requires view

  // JD dependencies
  can_create_jd: ['can_view_jd'],                     // Create requires view
  can_update_jd: ['can_view_jd'],                     // Update requires view
  can_delete_jd: ['can_view_jd'],                     // Delete requires view

  // User management dependencies
  can_create_users: ['can_view_users'],               // Create requires view
  can_update_users: ['can_view_users'],               // Update requires view
  can_delete_users: ['can_view_users'],               // Delete requires view

  // Role management dependencies
  can_create_roles: ['can_view_roles'],               // Create requires view
  can_update_roles: ['can_view_roles'],               // Update requires view
  can_delete_roles: ['can_view_roles'],               // Delete requires view

  // Settings dependencies
  can_update_settings: ['can_view_settings'],         // Update requires view

  // Internal DB dependencies
  can_create_internal_db: ['can_view_internal_db'],   // Create requires view
  can_update_internal_db: ['can_view_internal_db'],   // Update requires view
  can_delete_internal_db: ['can_view_internal_db'],   // Delete requires view

  // Billing dependencies
  can_update_billing: ['can_view_billing'],           // Update requires view

  // Default (no dependencies)
  can_view_resumes: [],
  can_view_jd: [],
  can_view_assessments: [],
  can_view_analytics: [],
  can_view_dashboard: [],
  can_view_support: [],
  can_view_settings: [],
  can_view_users: [],
  can_view_roles: [],
  can_view_billing: [],
  can_view_invoices: [],
  can_view_usage: [],
  can_view_internal_db: [],
  can_export_analytics: [],
  can_run_scoring: [],
  can_run_ai_interviews: [],
  can_run_ai_match: [],
  can_bulk_operations: [],
  can_export: [],
  can_api_access: [],
};

// ✅ GRANULAR PERMISSIONS: Default permissions with 4 minimum view-only permissions enabled
const defaultPermissions: UserPermissions = {
  // JD Permissions (view only by default)
  can_view_jd: true,
  can_create_jd: false,
  can_update_jd: false,
  can_delete_jd: false,

  // Resume Permissions (view only by default)
  can_view_resumes: true,
  can_create_resumes: false,
  can_update_resumes: false,
  can_delete_resumes: false,
  can_upload_resumes: false,

  // Assessment Permissions
  can_view_assessments: false,
  can_create_assessments: false,
  can_update_assessments: false,
  can_delete_assessments: false,

  // Internal DB Permissions
  can_view_internal_db: false,
  can_create_internal_db: false,
  can_update_internal_db: false,
  can_delete_internal_db: false,
  can_access_internal_db: false,

  // Analytics Permissions
  can_view_analytics: false,
  can_export_analytics: false,

  // Settings Permissions
  can_view_settings: false,
  can_update_settings: false,

  // User Management Permissions
  can_view_users: false,
  can_create_users: false,
  can_update_users: false,
  can_delete_users: false,

  // Role Management Permissions
  can_view_roles: false,
  can_create_roles: false,
  can_update_roles: false,
  can_delete_roles: false,

  // Billing Permissions
  can_view_billing: false,
  can_update_billing: false,
  can_view_invoices: false,
  can_view_usage: false,

  // Feature Permissions
  can_run_scoring: false,
  can_run_ai_interviews: false,
  can_run_ai_match: false,
  can_bulk_operations: false,
  can_export: false,
  can_api_access: false,

  // Dashboard & Support (default enabled for all)
  can_view_dashboard: true,
  can_view_support: true,
};

export default function UsersManagement({ currentUser, tenantId }: UsersManagementProps) {
  const dialog = useGlobalDialog();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'viewer' as UserRole,
    permissions: { ...defaultPermissions },
  });

  // Load users from API
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await userService.listUsers();
      setUsers(data);
    } catch (error: any) {
      console.error('Failed to load users:', error);
      toast.error(error.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ✅ PERMISSION FIX: Check if a permission is required for a role
  const isPermissionRequired = (
    permission: keyof UserPermissions,
    role: UserRole
  ): boolean => {
    if (role === 'recruiter') {
      return RECRUITER_REQUIRED_PERMISSIONS.includes(permission);
    }
    return false;
  };

  // ✅ PERMISSION FIX: Handle permission toggle with dependency management
  const handlePermissionToggle = (
    permission: keyof UserPermissions,
    currentPermissions: UserPermissions,
    role: UserRole,
    onUpdate: (permissions: UserPermissions) => void
  ) => {
    // Check if permission is required for role
    if (isPermissionRequired(permission, role)) {
      toast.error('This permission is required for recruiters and cannot be disabled');
      return;
    }

    const newPermissions = { ...currentPermissions };
    const isEnabling = !newPermissions[permission];

    if (isEnabling) {
      // Enable the permission
      newPermissions[permission] = true;

      // Auto-enable dependencies
      const dependencies = PERMISSION_DEPENDENCIES[permission] || [];
      const autoEnabled: string[] = [];

      dependencies.forEach(dep => {
        if (!newPermissions[dep]) {
          newPermissions[dep] = true;
          autoEnabled.push(permissionLabels[dep]);
        }
      });

      if (autoEnabled.length > 0) {
        toast.success(
          `Auto-enabled dependent permissions: ${autoEnabled.join(', ')}`,
          { duration: 4000 }
        );
      }
    } else {
      // Disabling - check if other permissions depend on this
      const dependents = Object.entries(PERMISSION_DEPENDENCIES)
        .filter(([, deps]) => deps.includes(permission))
        .map(([perm]) => perm as keyof UserPermissions);

      const enabledDependents = dependents.filter(
        dep => newPermissions[dep]
      );

      if (enabledDependents.length > 0) {
        const dependentNames = enabledDependents
          .map(dep => permissionLabels[dep])
          .join(', ');

        toast.error(
          `Cannot disable. Required by: ${dependentNames}`,
          { duration: 4000 }
        );
        return; // Don't allow disabling
      }

      newPermissions[permission] = false;
    }

    onUpdate(newPermissions);
  };

  const handleRoleChange = (role: UserRole) => {
    let permissions = { ...defaultPermissions };

    if (role === 'tenant_admin') {
      // ✅ GRANULAR PERMISSIONS: Admin gets all permissions enabled
      permissions = {
        // JD Permissions
        can_view_jd: true,
        can_create_jd: true,
        can_update_jd: true,
        can_delete_jd: true,

        // Resume Permissions
        can_view_resumes: true,
        can_create_resumes: true,
        can_update_resumes: true,
        can_delete_resumes: true,
        can_upload_resumes: true,

        // Assessment Permissions
        can_view_assessments: true,
        can_create_assessments: true,
        can_update_assessments: true,
        can_delete_assessments: true,

        // Internal DB Permissions
        can_view_internal_db: true,
        can_create_internal_db: true,
        can_update_internal_db: true,
        can_delete_internal_db: true,
        can_access_internal_db: true,

        // Analytics Permissions
        can_view_analytics: true,
        can_export_analytics: true,

        // Settings Permissions
        can_view_settings: true,
        can_update_settings: true,

        // User Management Permissions
        can_view_users: true,
        can_create_users: true,
        can_update_users: true,
        can_delete_users: true,

        // Role Management Permissions
        can_view_roles: true,
        can_create_roles: true,
        can_update_roles: true,
        can_delete_roles: true,

        // Billing Permissions
        can_view_billing: true,
        can_update_billing: true,
        can_view_invoices: true,
        can_view_usage: true,

        // Feature Permissions
        can_run_scoring: true,
        can_run_ai_interviews: true,
        can_run_ai_match: true,
        can_bulk_operations: true,
        can_export: true,
        can_api_access: true,

        // Dashboard & Support
        can_view_dashboard: true,
        can_view_support: true,
      };
    } else if (role === 'recruiter') {
      // ✅ GRANULAR PERMISSIONS: Recruiters get 4 minimum view-only permissions
      // All other permissions are optional (admin can enable if needed)
      permissions = {
        ...defaultPermissions,  // Start with 4 minimum permissions (view JD, view resumes, view dashboard, view support)
      };
    }

    setNewUser({ ...newUser, role, permissions });
  };

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (newUser.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsSaving(true);
    try {
      const createdUser = await userService.createUser({
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
      });

      // ✅ GRANULAR PERMISSIONS: Update all granular permissions
      await userService.updateUser(createdUser.id, {
        // JD Permissions
        can_view_jd: newUser.permissions.can_view_jd,
        can_create_jd: newUser.permissions.can_create_jd,
        can_update_jd: newUser.permissions.can_update_jd,
        can_delete_jd: newUser.permissions.can_delete_jd,

        // Resume Permissions
        can_view_resumes: newUser.permissions.can_view_resumes,
        can_create_resumes: newUser.permissions.can_create_resumes,
        can_update_resumes: newUser.permissions.can_update_resumes,
        can_delete_resumes: newUser.permissions.can_delete_resumes,
        can_upload_resumes: newUser.permissions.can_upload_resumes,

        // Assessment Permissions
        can_view_assessments: newUser.permissions.can_view_assessments,
        can_create_assessments: newUser.permissions.can_create_assessments,
        can_update_assessments: newUser.permissions.can_update_assessments,
        can_delete_assessments: newUser.permissions.can_delete_assessments,

        // Internal DB Permissions
        can_view_internal_db: newUser.permissions.can_view_internal_db,
        can_access_internal_db: newUser.permissions.can_access_internal_db,

        // Analytics Permissions
        can_view_analytics: newUser.permissions.can_view_analytics,

        // Settings Permissions (keeping legacy fields for compatibility)
        can_view_settings: newUser.permissions.can_view_settings,
        can_update_settings: newUser.permissions.can_update_settings,
      });

      toast.success('User created successfully');
      setNewUser({
        name: '',
        email: '',
        password: '',
        role: 'viewer',
        permissions: { ...defaultPermissions },
      });
      setIsCreateModalOpen(false);
      loadUsers();
    } catch (error: any) {
      console.error('Failed to create user:', error);
      toast.error(error.message || 'Failed to create user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!await dialog.confirm({ title: 'Deactivate User', message: 'Are you sure you want to deactivate this user?', variant: 'warning', confirmText: 'Deactivate' })) {
      return;
    }

    try {
      await userService.deactivateUser(id);
      toast.success('User deactivated successfully');
      loadUsers();
    } catch (error: any) {
      console.error('Failed to deactivate user:', error);
      toast.error(error.message || 'Failed to deactivate user');
    }
  };

  const handleToggleActive = async (user: ApiUser) => {
    try {
      if (user.is_active) {
        await userService.deactivateUser(user.id);
        toast.success('User deactivated');
      } else {
        await userService.activateUser(user.id);
        toast.success('User activated');
      }
      loadUsers();
    } catch (error: any) {
      console.error('Failed to toggle user status:', error);
      toast.error(error.message || 'Failed to update user status');
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    setIsSaving(true);
    try {
      await userService.updateUser(editingUser.id, {
        name: editingUser.name,
        role: editingUser.role,
        can_create_jd: editingUser.permissions.can_create_jd,
        can_manage_jd: editingUser.permissions.can_manage_jd,
        can_upload_resumes: editingUser.permissions.can_upload_resumes,
        can_view_resumes: editingUser.permissions.can_view_resumes,
        can_access_internal_db: editingUser.permissions.can_access_internal_db,
        can_create_assessments: editingUser.permissions.can_create_assessments,
        can_view_analytics: editingUser.permissions.can_view_analytics,
      });
      toast.success('User updated successfully');
      setEditingUser(null);
      loadUsers();
    } catch (error: any) {
      console.error('Failed to update user:', error);
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
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
              <UserCog className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
              <p className="text-sm text-gray-600">Manage users and their permissions</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Add User
          </button>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Total Users</p>
          <p className="text-3xl font-semibold text-gray-900 mt-1">{users.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Admins</p>
          <p className="text-3xl font-semibold text-gray-800 mt-1">
            {users.filter(u => u.role === 'tenant_admin').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Recruiters</p>
          <p className="text-3xl font-semibold text-gray-800 mt-1">
            {users.filter(u => u.role === 'recruiter').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Viewers</p>
          <p className="text-3xl font-semibold text-gray-600 mt-1">
            {users.filter(u => u.role === 'viewer').length}
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-gray-800 animate-spin" />
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
                        user.role === 'tenant_admin'
                          ? 'bg-gradient-to-br from-gray-800 to-gray-900'
                          : user.role === 'recruiter'
                          ? 'bg-gradient-to-br from-gray-800 to-gray-900'
                          : 'bg-gradient-to-br from-gray-500 to-gray-600'
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
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${roleBadgeColors[user.role]}`}>
                      {roleLabels[user.role]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {Object.entries(user.permissions)
                        .filter(([_, value]) => value)
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
                      <button
                        onClick={() => setEditingUser(user)}
                        className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        disabled={user.id === currentUser?.id}
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
                onClick={() => setIsCreateModalOpen(false)}
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
                  Role
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                >
                  <option value="viewer">Viewer</option>
                  <option value="recruiter">Recruiter</option>
                  <option value="tenant_admin">Admin</option>
                </select>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Permissions
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.entries(permissionLabels) as [keyof UserPermissions, string][]).map(([key, label]) => {
                    const isRequired = isPermissionRequired(key, newUser.role);
                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-2 p-3 bg-gray-50 rounded-lg ${
                          isRequired ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:bg-gray-100'
                        }`}
                        title={isRequired ? 'This permission is required for recruiters' : ''}
                      >
                        <input
                          type="checkbox"
                          checked={newUser.permissions[key]}
                          onChange={() => handlePermissionToggle(
                            key,
                            newUser.permissions,
                            newUser.role,
                            (updatedPermissions) => setNewUser({
                              ...newUser,
                              permissions: updatedPermissions
                            })
                          )}
                          disabled={isRequired}
                          className={`w-4 h-4 text-gray-800 rounded focus:ring-gray-600 ${
                            isRequired ? 'cursor-not-allowed' : ''
                          }`}
                        />
                        <span className="text-sm text-gray-700 flex-1">{label}</span>
                        {isRequired && (
                          <span className="text-xs text-gray-500 italic">
                            (Required)
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={isSaving}
                className="px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center gap-2"
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
                onClick={() => setEditingUser(null)}
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
                  Role
                </label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                >
                  <option value="viewer">Viewer</option>
                  <option value="recruiter">Recruiter</option>
                  <option value="tenant_admin">Admin</option>
                </select>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Permissions
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.entries(permissionLabels) as [keyof UserPermissions, string][]).map(([key, label]) => {
                    const isRequired = isPermissionRequired(key, editingUser.role);
                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-2 p-3 bg-gray-50 rounded-lg ${
                          isRequired ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:bg-gray-100'
                        }`}
                        title={isRequired ? 'This permission is required for recruiters' : ''}
                      >
                        <input
                          type="checkbox"
                          checked={editingUser.permissions[key]}
                          onChange={() => handlePermissionToggle(
                            key,
                            editingUser.permissions,
                            editingUser.role,
                            (updatedPermissions) => setEditingUser({
                              ...editingUser,
                              permissions: updatedPermissions
                            })
                          )}
                          disabled={isRequired}
                          className={`w-4 h-4 text-gray-800 rounded focus:ring-gray-600 ${
                            isRequired ? 'cursor-not-allowed' : ''
                          }`}
                        />
                        <span className="text-sm text-gray-700 flex-1">{label}</span>
                        {isRequired && (
                          <span className="text-xs text-gray-500 italic">
                            (Required)
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateUser}
                disabled={isSaving}
                className="px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
