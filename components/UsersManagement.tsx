import { useState, useEffect } from 'react';
import { UserCog, Plus, Search, Edit2, Trash2, X, Mail, Calendar, Loader2 } from 'lucide-react';
import { User, UserRole } from '@/lib/types/tenant';
import { userService, ApiUser, UserPermissions } from '../services/userService';
import { toast } from 'sonner';

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

export default function UsersManagement({ currentUser, tenantId }: UsersManagementProps) {
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

  const handleRoleChange = (role: UserRole) => {
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

      // Update permissions if they differ from role defaults
      await userService.updateUser(createdUser.id, {
        can_create_jd: newUser.permissions.can_create_jd,
        can_manage_jd: newUser.permissions.can_manage_jd,
        can_upload_resumes: newUser.permissions.can_upload_resumes,
        can_view_resumes: newUser.permissions.can_view_resumes,
        can_access_internal_db: newUser.permissions.can_access_internal_db,
        can_create_assessments: newUser.permissions.can_create_assessments,
        can_view_analytics: newUser.permissions.can_view_analytics,
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
    if (!confirm('Are you sure you want to deactivate this user?')) {
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
                  {(Object.entries(permissionLabels) as [keyof UserPermissions, string][]).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                    >
                      <input
                        type="checkbox"
                        checked={newUser.permissions[key]}
                        onChange={(e) => setNewUser({
                          ...newUser,
                          permissions: {
                            ...newUser.permissions,
                            [key]: e.target.checked
                          }
                        })}
                        className="w-4 h-4 text-gray-800 rounded focus:ring-gray-600"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
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
                  {(Object.entries(permissionLabels) as [keyof UserPermissions, string][]).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                    >
                      <input
                        type="checkbox"
                        checked={editingUser.permissions[key]}
                        onChange={(e) => setEditingUser({
                          ...editingUser,
                          permissions: {
                            ...editingUser.permissions,
                            [key]: e.target.checked
                          }
                        })}
                        className="w-4 h-4 text-gray-800 rounded focus:ring-gray-600"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
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
