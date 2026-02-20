'use client';

import { Shield, Users, Check, X, Edit2, Save, Plus, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { handleUnauthorized } from '@/lib/services/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface Permission {
  id: number;
  code: string;
  name: string;
  description?: string;
  module: string;
  action: string;
  is_system: boolean;
}

interface RolePermission {
  id: number;
  code: string;
  name: string;
  module: string;
  action: string;
}

interface Role {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_default: boolean;
  priority: number;
  parent_role_id: number | null;
  parent_role_name: string | null;
  permissions: RolePermission[];
  permission_count?: number;
  user_count: number;
  created_at: string;
  updated_at: string;
}

export default function PermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPermissionIds, setEditedPermissionIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch roles and permissions on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setError('Not authenticated. Please log in.');
        setLoading(false);
        return;
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Fetch roles and permissions in parallel
      const [rolesRes, permissionsRes] = await Promise.all([
        fetch(`${API_URL}/rbac/roles`, { headers }),
        fetch(`${API_URL}/rbac/permissions`, { headers }),
      ]);

      if (!rolesRes.ok) {
        throw new Error(`Failed to fetch roles: ${rolesRes.status}`);
      }
      if (!permissionsRes.ok) {
        throw new Error(`Failed to fetch permissions: ${permissionsRes.status}`);
      }

      const rolesData = await rolesRes.json();
      const permissionsData = await permissionsRes.json();

      const rolesList = rolesData.roles || [];
      const permissionsList = permissionsData.permissions || [];

      setRoles(rolesList);
      setPermissions(permissionsList);

      // Select first non-system role by default, or first role
      if (rolesList.length > 0) {
        const defaultRole = rolesList.find((r: Role) => !r.is_system) || rolesList[0];
        await fetchRoleDetails(defaultRole.id, headers);
      }
    } catch (err) {
      console.error('[Permissions] Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoleDetails = async (roleId: number, headers?: Record<string, string>) => {
    try {
      const token = localStorage.getItem('accessToken');
      const reqHeaders = headers || {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const res = await fetch(`${API_URL}/rbac/roles/${roleId}`, { headers: reqHeaders });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch role details: ${res.status}`);
      }

      const roleData = await res.json();
      setSelectedRole(roleData);
      setIsEditing(false);
    } catch (err) {
      console.error('[Permissions] Error fetching role details:', err);
    }
  };

  const handleSelectRole = async (role: Role) => {
    setIsEditing(false);
    await fetchRoleDetails(role.id);
  };

  const startEditing = () => {
    if (selectedRole) {
      setEditedPermissionIds(selectedRole.permissions.map(p => p.id));
      setIsEditing(true);
    }
  };

  const togglePermission = (permissionId: number) => {
    setEditedPermissionIds(prev =>
      prev.includes(permissionId)
        ? prev.filter(id => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const saveChanges = async () => {
    if (!selectedRole) return;

    setSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(`${API_URL}/rbac/roles/${selectedRole.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          permission_ids: editedPermissionIds,
        }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to save: ${res.status}`);
      }

      const updatedRole = await res.json();
      setSelectedRole(updatedRole);

      // Update role in list
      setRoles(prev => prev.map(r => r.id === updatedRole.id ? { ...r, permission_count: updatedRole.permissions.length } : r));

      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('[Permissions] Error saving:', err);
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Group permissions by module
  const permissionsByModule = permissions.reduce((acc, p) => {
    if (!acc[p.module]) {
      acc[p.module] = [];
    }
    acc[p.module].push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

  const moduleDisplayNames: Record<string, string> = {
    jd: 'Job Descriptions',
    resumes: 'Resumes',
    users: 'User Management',
    assessments: 'Assessments',
    analytics: 'Analytics',
    settings: 'Settings',
    billing: 'Billing',
    internal_db: 'Internal Database',
    ai_interview: 'AI Interview',
  };

  if (loading) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <span className="ml-3 text-gray-600">Loading permissions...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Permissions & Roles</h1>
                <p className="text-sm text-gray-600">Manage user roles and their permissions</p>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Roles List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Roles</h2>
            <div className="space-y-3">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleSelectRole(role)}
                  className={`w-full p-4 rounded-lg text-left transition-colors ${
                    selectedRole?.id === role.id
                      ? 'bg-gray-100 border-gray-300 border-2'
                      : 'hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{role.name}</p>
                    {(role.is_system || role.code === 'recruiter') && (
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">System</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{role.description || 'No description'}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-400">
                    <span>{role.permission_count || role.permissions?.length || 0} permissions</span>
                    <span>{role.user_count} users</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Permissions Grid */}
          <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {selectedRole ? (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{selectedRole.name} Permissions</h2>
                    <p className="text-sm text-gray-500">{selectedRole.description || 'No description'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!selectedRole.is_system && !isEditing && selectedRole.code !== 'recruiter' && (
                      <button
                        onClick={startEditing}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                    )}
                    {isEditing && (
                      <>
                        <button
                          onClick={() => setIsEditing(false)}
                          disabled={saving}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveChanges}
                          disabled={saving}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </>
                    )}
                    {saveSuccess && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg">
                        <Check className="w-4 h-4" />
                        Saved!
                      </div>
                    )}
                  </div>
                </div>

                {(selectedRole.is_system || selectedRole.code === 'recruiter') && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    System roles cannot be edited. They have predefined permissions.
                  </div>
                )}

                <div className="space-y-6 max-h-[600px] overflow-y-auto">
                  {Object.entries(permissionsByModule).map(([module, modulePermissions]) => (
                    <div key={module} className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-medium text-gray-900 mb-3">
                        {moduleDisplayNames[module] || module.charAt(0).toUpperCase() + module.slice(1)}
                      </h3>
                      <div className="space-y-2">
                        {modulePermissions.map((permission) => {
                          const hasPermission = isEditing
                            ? editedPermissionIds.includes(permission.id)
                            : selectedRole.permissions.some(p => p.id === permission.id);

                          return (
                            <div
                              key={permission.id}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                hasPermission ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{permission.name}</p>
                                <p className="text-xs text-gray-500">{permission.code}</p>
                              </div>
                              {isEditing && !selectedRole.is_system && selectedRole.code !== 'recruiter' ? (
                                <button
                                  onClick={() => togglePermission(permission.id)}
                                  className={`w-10 h-6 rounded-full transition-colors ${
                                    hasPermission ? 'bg-green-600' : 'bg-gray-300'
                                  }`}
                                >
                                  <div
                                    className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${
                                      hasPermission ? 'translate-x-4' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              ) : (
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  hasPermission ? 'bg-green-100' : 'bg-gray-200'
                                }`}>
                                  {hasPermission ? (
                                    <Check className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <X className="w-4 h-4 text-gray-400" />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                Select a role to view its permissions
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
