'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Shield,
  Loader2,
  ChevronDown,
  ChevronRight,
  Check,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import rbacService from '@/lib/services/rbacService';
import {
  Permission,
  Role,
  RoleListItem,
  getModuleDisplayName,
  getActionDisplayName,
} from '@/lib/types/rbac';

interface EditRoleFormProps {
  roleId: number;
}

export default function EditRoleForm({ roleId }: EditRoleFormProps) {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

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
    // Validate roleId before making API calls
    if (!roleId || isNaN(roleId) || roleId <= 0) {
      console.error('Invalid role ID:', roleId);
      toast.error('Invalid role ID');
      router.push('/organization/role-management');
      return;
    }
    loadData();
  }, [roleId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [roleData, rolesData, permissionsData] = await Promise.all([
        rbacService.getRoleById(roleId),
        rbacService.getRoles(),
        rbacService.getPermissions(),
      ]);
      setRole(roleData);
      setRoles(rolesData.roles);
      setPermissions(permissionsData.permissions);
    } catch (error: any) {
      console.error('Failed to load data:', error);
      // Provide more specific error message
      if (error?.response?.status === 404) {
        toast.error('Role not found');
      } else if (error?.response?.status === 422) {
        toast.error('Invalid role ID format');
      } else {
        toast.error('Failed to load role data');
      }
      router.push('/organization/role-management');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleModule = (module: string) => {
    setExpandedModules(prev => ({
      ...prev,
      [module]: !prev[module],
    }));
  };

  const handlePermissionToggle = (permissionId: number) => {
    if (!role) return;

    const currentPermissions = role.permissions.map(p => p.id);
    const newPermissions = currentPermissions.includes(permissionId)
      ? currentPermissions.filter(id => id !== permissionId)
      : [...currentPermissions, permissionId];

    setRole({
      ...role,
      permissions: permissions.filter(p => newPermissions.includes(p.id)).map(p => ({
        id: p.id,
        code: p.code,
        name: p.name,
        module: p.module,
        action: p.action,
      })),
    });
  };

  const handleModuleToggle = (module: string) => {
    if (!role) return;

    const modulePermissions = permissions.filter(p => p.module === module);
    const modulePermissionIds = modulePermissions.map(p => p.id);
    const currentPermissions = role.permissions.map(p => p.id);
    const allSelected = modulePermissionIds.every(id => currentPermissions.includes(id));

    let newPermissions: number[];
    if (allSelected) {
      newPermissions = currentPermissions.filter(id => !modulePermissionIds.includes(id));
    } else {
      newPermissions = [...new Set([...currentPermissions, ...modulePermissionIds])];
    }

    setRole({
      ...role,
      permissions: permissions.filter(p => newPermissions.includes(p.id)).map(p => ({
        id: p.id,
        code: p.code,
        name: p.name,
        module: p.module,
        action: p.action,
      })),
    });
  };

  const handleParentRoleChange = async (parentRoleId: string) => {
    if (!role) return;

    const roleIdValue = parentRoleId ? parseInt(parentRoleId) : undefined;

    console.log('[ROLE INHERIT] Parent role selected:', roleIdValue);
    setRole({ ...role, parent_role_id: roleIdValue });

    if (roleIdValue) {
      try {
        console.log('[ROLE INHERIT] Fetching parent role permissions...');
        const parentRole = await rbacService.getRoleById(roleIdValue);
        console.log('[ROLE INHERIT] Parent role loaded:', parentRole.name, 'Permissions:', parentRole.permissions?.length || 0);

        // Pre-populate with parent role's permissions
        if (parentRole.permissions) {
          setRole(prev => ({
            ...prev!,
            parent_role_id: roleIdValue,
            permissions: parentRole.permissions || [],
          }));
          console.log('[ROLE INHERIT] ✓ Loaded', parentRole.permissions.length, 'permissions from parent role');
          toast.success(`Loaded ${parentRole.permissions.length} permissions from ${parentRole.name}`);
        }
      } catch (error) {
        console.error('[ROLE INHERIT] Failed to load parent role permissions:', error);
        toast.error('Failed to load parent role permissions');
      }
    }
  };

  const handleSubmit = async () => {
    if (!role) return;

    setIsSaving(true);
    try {
      await rbacService.updateRole(role.id, {
        name: role.name,
        description: role.description,
        priority: role.priority,
        parent_role_id: role.parent_role_id,
        permission_ids: role.permissions.map(p => p.id),
      });
      toast.success('Role updated successfully');
      router.push('/organization/role-management');
    } catch (error) {
      console.error('Failed to update role:', error);
      toast.error('Failed to update role');
    } finally {
      setIsSaving(false);
    }
  };

  const renderPermissionMatrix = () => {
    if (!role) return null;

    const selectedPermissions = role.permissions.map(p => p.id);

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
                      handleModuleToggle(module);
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
                        onChange={() => handlePermissionToggle(perm.id)}
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

  if (isLoading || !role) {
    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/organization/role-management')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Role Management
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">Edit Role</h1>
              {role.is_system && (
                <span className="px-2.5 py-1 text-xs bg-gray-100 text-gray-900 rounded-full flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  System Role
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">Modify role settings and permissions</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="space-y-6">
          {/* Name and Code */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role Name
              </label>
              <input
                type="text"
                value={role.name}
                onChange={(e) => setRole({ ...role, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                disabled={role.is_system}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role Code
              </label>
              <input
                type="text"
                value={role.code}
                disabled
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={role.description || ''}
              onChange={(e) => setRole({ ...role, description: e.target.value })}
              placeholder="Describe what this role can do..."
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
            />
          </div>

          {/* Priority and Parent Role */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={role.priority}
                onChange={(e) => setRole({ ...role, priority: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">Higher priority = more importance (0-100)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inherits From
              </label>
              <select
                value={role.parent_role_id || ''}
                onChange={(e) => handleParentRoleChange(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
              >
                <option value="">None</option>
                {roles.filter(r => r.id !== role.id).map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Automatically loads parent role's permissions</p>
            </div>
          </div>

          {/* Permissions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Permissions
            </label>
            {renderPermissionMatrix()}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => router.push('/organization/role-management')}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center gap-2 transition-colors"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </main>
  );
}
