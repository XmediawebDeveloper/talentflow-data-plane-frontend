'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Users,
  Loader2,
  History,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import authService from '@/lib/services/authService';
import rbacService from '@/lib/services/rbacService';
import {
  Permission,
  RoleListItem,
  AuditLogEntry,
} from '@/lib/types/rbac';

// Mock data for fallback
const mockRoles: RoleListItem[] = [
  { id: 1, code: 'admin', name: 'Admin', description: 'Full access to all features', is_system: true, is_default: false, priority: 100, permission_count: 24, user_count: 2 },
  { id: 2, code: 'recruiter', name: 'Recruiter', description: 'Can manage JDs, resumes, and assessments', is_system: true, is_default: true, priority: 50, parent_role_id: 3, parent_role_name: 'Viewer', permission_count: 16, user_count: 5 },
  { id: 3, code: 'viewer', name: 'Viewer', description: 'Read-only access', is_system: true, is_default: false, priority: 10, permission_count: 5, user_count: 8 },
];

const mockPermissions: Permission[] = [
  { id: 1, code: 'jd:create', name: 'Create Job Description', module: 'jd', action: 'create', is_system: true },
  { id: 2, code: 'jd:read', name: 'View Job Description', module: 'jd', action: 'read', is_system: true },
  { id: 3, code: 'jd:update', name: 'Update Job Description', module: 'jd', action: 'update', is_system: true },
  { id: 4, code: 'jd:delete', name: 'Delete Job Description', module: 'jd', action: 'delete', is_system: true },
  { id: 5, code: 'resumes:create', name: 'Upload Resumes', module: 'resumes', action: 'create', is_system: true },
  { id: 6, code: 'resumes:read', name: 'View Resumes', module: 'resumes', action: 'read', is_system: true },
  { id: 7, code: 'resumes:update', name: 'Update Resumes', module: 'resumes', action: 'update', is_system: true },
  { id: 8, code: 'resumes:delete', name: 'Delete Resumes', module: 'resumes', action: 'delete', is_system: true },
  { id: 9, code: 'internal_db:read', name: 'Access Internal Database', module: 'internal_db', action: 'read', is_system: true },
  { id: 10, code: 'assessments:create', name: 'Create Assessments', module: 'assessments', action: 'create', is_system: true },
  { id: 11, code: 'assessments:read', name: 'View Assessments', module: 'assessments', action: 'read', is_system: true },
  { id: 12, code: 'assessments:update', name: 'Update Assessments', module: 'assessments', action: 'update', is_system: true },
  { id: 13, code: 'assessments:delete', name: 'Delete Assessments', module: 'assessments', action: 'delete', is_system: true },
  { id: 14, code: 'analytics:read', name: 'View Analytics', module: 'analytics', action: 'read', is_system: true },
  { id: 15, code: 'settings:read', name: 'View Settings', module: 'settings', action: 'read', is_system: true },
  { id: 16, code: 'settings:update', name: 'Update Settings', module: 'settings', action: 'update', is_system: true },
  { id: 17, code: 'users:create', name: 'Create Users', module: 'users', action: 'create', is_system: true },
  { id: 18, code: 'users:read', name: 'View Users', module: 'users', action: 'read', is_system: true },
  { id: 19, code: 'users:update', name: 'Update Users', module: 'users', action: 'update', is_system: true },
  { id: 20, code: 'users:delete', name: 'Delete Users', module: 'users', action: 'delete', is_system: true },
  { id: 21, code: 'roles:create', name: 'Create Roles', module: 'roles', action: 'create', is_system: true },
  { id: 22, code: 'roles:read', name: 'View Roles', module: 'roles', action: 'read', is_system: true },
  { id: 23, code: 'roles:update', name: 'Update Roles', module: 'roles', action: 'update', is_system: true },
  { id: 24, code: 'roles:delete', name: 'Delete Roles', module: 'roles', action: 'delete', is_system: true },
];

type TabType = 'roles' | 'audit';

export default function RoleManagement() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('roles');
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Permission guard - check if user has access to Role Management
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const currentUser = await authService.getCurrentUser();

        // Check if user has permission to access Role Management
        const hasPermission = currentUser.role === 'tenant_admin' || currentUser.permissions?.can_manage_users;

        if (!hasPermission) {
          toast.error('You do not have permission to access Role Management');
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

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rolesData, permissionsData] = await Promise.all([
        rbacService.getRoles(),
        rbacService.getPermissions(),
      ]);
      setRoles(rolesData.roles);
      setPermissions(permissionsData.permissions);
    } catch (error) {
      console.warn('API unavailable, using mock data:', error);
      setRoles(mockRoles);
      setPermissions(mockPermissions);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const data = await rbacService.getAuditLogs({ page: 1, page_size: 50 });
      setAuditLogs(data.logs);
    } catch (error) {
      console.warn('Failed to load audit logs:', error);
      setAuditLogs([]);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab]);

  const filteredRoles = roles.filter(role =>
    role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    role.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteRole = async (roleId: number) => {
    const role = roles.find(r => r.id === roleId);
    if (role?.is_system) {
      toast.error('System roles cannot be deleted');
      return;
    }

    if (!confirm('Are you sure you want to delete this role? Users with this role will lose their permissions.')) {
      return;
    }

    try {
      await rbacService.deleteRole(roleId);
      toast.success('Role deleted successfully');
      loadData();
    } catch (error) {
      console.warn('API unavailable, simulating delete:', error);
      setRoles(prev => prev.filter(r => r.id !== roleId));
      toast.success('Role deleted (offline mode)');
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const getAuditActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      role_create: 'Role Created',
      role_created: 'Role Created',
      role_update: 'Role Updated',
      role_updated: 'Role Updated',
      role_delete: 'Role Deleted',
      role_deleted: 'Role Deleted',
      user_role_change: 'User Roles Changed',
      user_roles_updated: 'User Roles Changed',
      permission_update: 'Permission Updated',
    };
    return labels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatAuditChanges = (action: string, changes: Record<string, unknown> | undefined) => {
    if (!changes) return null;

    // For role_create - show role info
    if (action === 'role_create' || action === 'role_created') {
      const roleName = changes.role_name as string;
      const permCount = (changes.permissions as number[])?.length || 0;
      return (
        <div className="space-y-1">
          <div className="text-sm text-gray-700">
            <span className="font-medium">Role:</span> {roleName}
          </div>
          {permCount > 0 && (
            <div className="text-xs text-gray-500">
              {permCount} permission{permCount !== 1 ? 's' : ''} assigned
            </div>
          )}
        </div>
      );
    }

    // For role_delete - show deleted role info
    if (action === 'role_delete' || action === 'role_deleted') {
      const roleName = changes.role_name as string;
      const roleCode = changes.role_code as string;
      return (
        <div className="space-y-1">
          <div className="text-sm text-gray-700">
            <span className="font-medium">Deleted:</span> {roleName}
          </div>
          {roleCode && (
            <div className="text-xs text-gray-500">Code: {roleCode}</div>
          )}
        </div>
      );
    }

    // For role_update - show what changed
    if (action === 'role_update' || action === 'role_updated') {
      const changesData = changes.changes as Record<string, { from: unknown; to: unknown }> | undefined;
      if (!changesData) {
        return <span className="text-sm text-gray-500">Settings updated</span>;
      }

      return (
        <div className="space-y-1">
          {Object.entries(changesData).map(([field, change]) => {
            if (field === 'permissions') {
              const fromCount = Array.isArray(change.from) ? change.from.length : 0;
              const toCount = Array.isArray(change.to) ? change.to.length : 0;
              return (
                <div key={field} className="text-xs text-gray-600">
                  <span className="font-medium">Permissions:</span> {fromCount} → {toCount}
                </div>
              );
            }
            return (
              <div key={field} className="text-xs text-gray-600">
                <span className="font-medium capitalize">{field.replace(/_/g, ' ')}:</span>{' '}
                <span className="text-gray-400">{String(change.from || '—')}</span>
                <span className="mx-1">→</span>
                <span className="text-gray-700">{String(change.to || '—')}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // For user_role_change - show role changes
    if (action === 'user_role_change' || action === 'user_roles_updated') {
      const oldRoles = changes.old_roles as string[] | undefined;
      const newRoles = changes.new_roles as string[] | undefined;
      return (
        <div className="space-y-1">
          {oldRoles && oldRoles.length > 0 && (
            <div className="text-xs text-gray-500">
              <span className="font-medium">From:</span> {oldRoles.join(', ') || 'None'}
            </div>
          )}
          {newRoles && (
            <div className="text-xs text-gray-700">
              <span className="font-medium">To:</span> {newRoles.join(', ') || 'None'}
            </div>
          )}
        </div>
      );
    }

    // Default: show summary
    return (
      <span className="text-xs text-gray-500">
        {Object.keys(changes).length} field{Object.keys(changes).length !== 1 ? 's' : ''} modified
      </span>
    );
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Role Management</h1>
              <p className="text-sm text-gray-600">Manage roles and permissions for your organization</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/organization/role-management/create')}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Create Role
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'roles'
              ? 'border-gray-800 text-gray-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Roles
          </div>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-gray-800 text-gray-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Audit Log
          </div>
        </button>
      </div>

      {activeTab === 'roles' && (
        <>
          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search roles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
              />
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="text-sm text-gray-600">Total Roles</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{roles.length}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="text-sm text-gray-600">System Roles</p>
              <p className="text-3xl font-semibold text-gray-800 mt-1">
                {roles.filter(r => r.is_system).length}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="text-sm text-gray-600">Custom Roles</p>
              <p className="text-3xl font-semibold text-gray-800 mt-1">
                {roles.filter(r => !r.is_system).length}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="text-sm text-gray-600">Total Permissions</p>
              <p className="text-3xl font-semibold text-green-600 mt-1">{permissions.length}</p>
            </div>
          </div>

          {/* Roles Table */}
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
                      Role
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Inherits From
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Permissions
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Users
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredRoles.map((role) => (
                    <tr key={role.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            role.is_system
                              ? 'bg-gradient-to-br from-gray-800 to-gray-900'
                              : 'bg-gradient-to-br from-gray-800 to-gray-900'
                          }`}>
                            <Shield className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                              {role.name}
                              {role.is_default && (
                                <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                                  Default
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">{role.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                          role.is_system
                            ? 'bg-gray-100 text-gray-900'
                            : 'bg-gray-100 text-gray-900'
                        }`}>
                          {role.is_system ? 'System' : 'Custom'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {role.parent_role_name ? (
                          <span className="text-sm text-gray-600">{role.parent_role_name}</span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-900">
                          {role.permission_count}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600">{role.user_count}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">{role.priority}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              console.log('[ROLE EDIT] Attempting to edit role:', { id: role.id, name: role.name, code: role.code });
                              if (!role.id || role.id <= 0) {
                                console.error('[ROLE EDIT] Invalid role ID:', role.id, 'Full role object:', role);
                                toast.error(`Invalid role ID: ${role.id}`);
                                return;
                              }
                              console.log('[ROLE EDIT] Navigating to edit page with ID:', role.id);
                              router.push(`/organization/role-management/edit/${role.id}`);
                            }}
                            className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {!role.is_system && (
                            <button
                              onClick={() => handleDeleteRole(role.id)}
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {role.is_system && (
                            <div className="p-2 text-gray-300">
                              <Lock className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!isLoading && filteredRoles.length === 0 && (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No roles found</p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entity
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performed By
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Changes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      log.action.includes('created')
                        ? 'bg-green-100 text-green-700'
                        : log.action.includes('deleted')
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      {getAuditActionLabel(log.action)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{log.entity_name || log.entity_id}</div>
                    <div className="text-xs text-gray-500">{log.entity_type}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">
                      {log.performed_by_name || log.performed_by}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">{formatDate(log.performed_at)}</div>
                  </td>
                  <td className="px-6 py-4">
                    {formatAuditChanges(log.action, log.changes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {auditLogs.length === 0 && (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No audit logs found</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
