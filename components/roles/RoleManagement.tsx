'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Shield,
  Users,
  ChevronDown,
  ChevronRight,
  Loader2,
  History,
  Lock,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import rbacService from '@/lib/services/rbacService';
import {
  Permission,
  Role,
  RoleListItem,
  AuditLogEntry,
  PERMISSION_MODULES,
  getModuleDisplayName,
  getActionDisplayName,
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
  const [activeTab, setActiveTab] = useState<TabType>('roles');
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  // New role form state
  const [newRole, setNewRole] = useState({
    name: '',
    code: '',
    description: '',
    priority: 50,
    parent_role_id: undefined as number | undefined,
    permission_ids: [] as number[],
  });

  // Group permissions by module
  const permissionsByModule = permissions.reduce((acc, perm) => {
    if (!acc[perm.module]) {
      acc[perm.module] = [];
    }
    acc[perm.module].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

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

  const toggleModule = (module: string) => {
    setExpandedModules(prev => ({
      ...prev,
      [module]: !prev[module],
    }));
  };

  const handlePermissionToggle = (permissionId: number, isEditing: boolean = false) => {
    if (isEditing && editingRole) {
      const currentPermissions = editingRole.permissions.map(p => p.id);
      const newPermissions = currentPermissions.includes(permissionId)
        ? currentPermissions.filter(id => id !== permissionId)
        : [...currentPermissions, permissionId];

      setEditingRole({
        ...editingRole,
        permissions: permissions.filter(p => newPermissions.includes(p.id)).map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          module: p.module,
          action: p.action,
        })),
      });
    } else {
      setNewRole(prev => ({
        ...prev,
        permission_ids: prev.permission_ids.includes(permissionId)
          ? prev.permission_ids.filter(id => id !== permissionId)
          : [...prev.permission_ids, permissionId],
      }));
    }
  };

  const handleModuleToggle = (module: string, isEditing: boolean = false) => {
    const modulePermissions = permissions.filter(p => p.module === module);
    const modulePermissionIds = modulePermissions.map(p => p.id);

    if (isEditing && editingRole) {
      const currentPermissions = editingRole.permissions.map(p => p.id);
      const allSelected = modulePermissionIds.every(id => currentPermissions.includes(id));

      let newPermissions: number[];
      if (allSelected) {
        newPermissions = currentPermissions.filter(id => !modulePermissionIds.includes(id));
      } else {
        newPermissions = [...new Set([...currentPermissions, ...modulePermissionIds])];
      }

      setEditingRole({
        ...editingRole,
        permissions: permissions.filter(p => newPermissions.includes(p.id)).map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          module: p.module,
          action: p.action,
        })),
      });
    } else {
      const allSelected = modulePermissionIds.every(id => newRole.permission_ids.includes(id));
      if (allSelected) {
        setNewRole(prev => ({
          ...prev,
          permission_ids: prev.permission_ids.filter(id => !modulePermissionIds.includes(id)),
        }));
      } else {
        setNewRole(prev => ({
          ...prev,
          permission_ids: [...new Set([...prev.permission_ids, ...modulePermissionIds])],
        }));
      }
    }
  };

  const handleCreateRole = async () => {
    if (!newRole.name || !newRole.code) {
      toast.error('Please fill in role name and code');
      return;
    }

    setIsSaving(true);
    try {
      await rbacService.createRole({
        name: newRole.name,
        code: newRole.code.toLowerCase().replace(/\s+/g, '_'),
        description: newRole.description,
        priority: newRole.priority,
        parent_role_id: newRole.parent_role_id,
        permission_ids: newRole.permission_ids,
      });
      toast.success('Role created successfully');
      setNewRole({
        name: '',
        code: '',
        description: '',
        priority: 50,
        parent_role_id: undefined,
        permission_ids: [],
      });
      setIsCreateModalOpen(false);
      loadData();
    } catch (error) {
      console.warn('API unavailable, simulating create:', error);
      const newMockRole: RoleListItem = {
        id: Date.now(),
        code: newRole.code.toLowerCase().replace(/\s+/g, '_'),
        name: newRole.name,
        description: newRole.description,
        is_system: false,
        is_default: false,
        priority: newRole.priority,
        parent_role_id: newRole.parent_role_id,
        permission_count: newRole.permission_ids.length,
        user_count: 0,
      };
      setRoles(prev => [...prev, newMockRole]);
      toast.success('Role created (offline mode)');
      setNewRole({
        name: '',
        code: '',
        description: '',
        priority: 50,
        parent_role_id: undefined,
        permission_ids: [],
      });
      setIsCreateModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRole = async (roleId: number) => {
    try {
      const role = await rbacService.getRoleById(roleId);
      setEditingRole(role);
    } catch (error) {
      console.warn('API unavailable:', error);
      // Create mock role data
      const listItem = roles.find(r => r.id === roleId);
      if (listItem) {
        setEditingRole({
          ...listItem,
          tenant_id: undefined,
          permissions: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole) return;

    setIsSaving(true);
    try {
      await rbacService.updateRole(editingRole.id, {
        name: editingRole.name,
        description: editingRole.description,
        priority: editingRole.priority,
        parent_role_id: editingRole.parent_role_id,
        permission_ids: editingRole.permissions.map(p => p.id),
      });
      toast.success('Role updated successfully');
      setEditingRole(null);
      loadData();
    } catch (error) {
      console.warn('API unavailable, simulating update:', error);
      setRoles(prev => prev.map(r =>
        r.id === editingRole.id
          ? {
              ...r,
              name: editingRole.name,
              description: editingRole.description,
              priority: editingRole.priority,
              parent_role_id: editingRole.parent_role_id,
              permission_count: editingRole.permissions.length,
            }
          : r
      ));
      toast.success('Role updated (offline mode)');
      setEditingRole(null);
    } finally {
      setIsSaving(false);
    }
  };

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
      role_created: 'Role Created',
      role_updated: 'Role Updated',
      role_deleted: 'Role Deleted',
      user_roles_updated: 'User Roles Changed',
    };
    return labels[action] || action;
  };

  const renderPermissionMatrix = (isEditing: boolean = false) => {
    const selectedPermissions = isEditing && editingRole
      ? editingRole.permissions.map(p => p.id)
      : newRole.permission_ids;

    return (
      <div className="space-y-2">
        {Object.entries(permissionsByModule).map(([module, perms]) => {
          const allSelected = perms.every(p => selectedPermissions.includes(p.id));
          const someSelected = perms.some(p => selectedPermissions.includes(p.id));
          const isExpanded = expandedModules[module] !== false;

          return (
            <div key={module} className="border border-gray-200 rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => toggleModule(module)}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleModuleToggle(module, isEditing);
                    }}
                    className={`w-5 h-5 rounded flex items-center justify-center border-2 ${
                      allSelected
                        ? 'bg-gray-800 border-gray-800'
                        : someSelected
                        ? 'bg-gray-200 border-gray-800'
                        : 'border-gray-300'
                    }`}
                  >
                    {(allSelected || someSelected) && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <span className="font-medium text-gray-900">
                    {getModuleDisplayName(module)}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({perms.filter(p => selectedPermissions.includes(p.id)).length}/{perms.length})
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                )}
              </div>

              {isExpanded && (
                <div className="p-4 bg-white grid grid-cols-2 gap-2">
                  {perms.map(perm => (
                    <label
                      key={perm.id}
                      className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(perm.id)}
                        onChange={() => handlePermissionToggle(perm.id, isEditing)}
                        className="w-4 h-4 text-gray-800 rounded focus:ring-gray-600"
                      />
                      <span className="text-sm text-gray-700">
                        {getActionDisplayName(perm.action)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
            onClick={() => setIsCreateModalOpen(true)}
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
                            onClick={() => handleEditRole(role.id)}
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
                    {log.changes && (
                      <pre className="text-xs text-gray-500 max-w-xs truncate">
                        {JSON.stringify(log.changes, null, 2)}
                      </pre>
                    )}
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

      {/* Create Role Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Create New Role</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newRole.name}
                    onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                    placeholder="e.g., Senior Recruiter"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newRole.code}
                    onChange={(e) => setNewRole({ ...newRole, code: e.target.value })}
                    placeholder="e.g., senior_recruiter"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newRole.description}
                  onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                  placeholder="Describe what this role can do..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newRole.priority}
                    onChange={(e) => setNewRole({ ...newRole, priority: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">Higher priority = more importance (0-100)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Inherits From
                  </label>
                  <select
                    value={newRole.parent_role_id || ''}
                    onChange={(e) => setNewRole({ ...newRole, parent_role_id: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                  >
                    <option value="">None</option>
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Permissions
                </label>
                {renderPermissionMatrix(false)}
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
                onClick={handleCreateRole}
                disabled={isSaving}
                className="px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingRole && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-900">Edit Role</h2>
                {editingRole.is_system && (
                  <span className="px-2.5 py-1 text-xs bg-gray-100 text-gray-900 rounded-full flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    System Role
                  </span>
                )}
              </div>
              <button
                onClick={() => setEditingRole(null)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role Name
                  </label>
                  <input
                    type="text"
                    value={editingRole.name}
                    onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                    disabled={editingRole.is_system}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role Code
                  </label>
                  <input
                    type="text"
                    value={editingRole.code}
                    disabled
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editingRole.description || ''}
                  onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editingRole.priority}
                    onChange={(e) => setEditingRole({ ...editingRole, priority: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Inherits From
                  </label>
                  <select
                    value={editingRole.parent_role_id || ''}
                    onChange={(e) => setEditingRole({ ...editingRole, parent_role_id: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                  >
                    <option value="">None</option>
                    {roles.filter(r => r.id !== editingRole.id).map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Permissions
                </label>
                {renderPermissionMatrix(true)}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingRole(null)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRole}
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
