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
} from 'lucide-react';
import { toast } from 'sonner';
import rbacService from '@/lib/services/rbacService';
import {
  Permission,
  RoleListItem,
  getModuleDisplayName,
  getActionDisplayName,
} from '@/lib/types/rbac';

export default function CreateRoleForm() {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  // Form state
  const [formData, setFormData] = useState({
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
      console.error('Failed to load data:', error);
      toast.error('Failed to load roles and permissions');
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
    setFormData(prev => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(permissionId)
        ? prev.permission_ids.filter(id => id !== permissionId)
        : [...prev.permission_ids, permissionId],
    }));
  };

  const handleModuleToggle = (module: string) => {
    const modulePermissions = permissions.filter(p => p.module === module);
    const modulePermissionIds = modulePermissions.map(p => p.id);
    const allSelected = modulePermissionIds.every(id => formData.permission_ids.includes(id));

    if (allSelected) {
      setFormData(prev => ({
        ...prev,
        permission_ids: prev.permission_ids.filter(id => !modulePermissionIds.includes(id)),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        permission_ids: [...new Set([...prev.permission_ids, ...modulePermissionIds])],
      }));
    }
  };

  const handleParentRoleChange = async (parentRoleId: string) => {
    const roleId = parentRoleId ? parseInt(parentRoleId) : undefined;

    console.log('[ROLE INHERIT] Parent role selected:', roleId);
    setFormData(prev => ({ ...prev, parent_role_id: roleId }));

    if (roleId) {
      try {
        console.log('[ROLE INHERIT] Fetching parent role permissions...');
        const parentRole = await rbacService.getRoleById(roleId);
        console.log('[ROLE INHERIT] Parent role loaded:', parentRole.name, 'Permissions:', parentRole.permissions?.length || 0);

        // Pre-populate with parent role's permissions
        if (parentRole.permissions) {
          const permissionIds = parentRole.permissions.map(p => p.id);
          setFormData(prev => ({
            ...prev,
            permission_ids: permissionIds,
          }));
          console.log('[ROLE INHERIT] ✓ Loaded', permissionIds.length, 'permissions from parent role');
          toast.success(`Loaded ${permissionIds.length} permissions from ${parentRole.name}`);
        }
      } catch (error) {
        console.error('[ROLE INHERIT] Failed to load parent role permissions:', error);
        toast.error('Failed to load parent role permissions');
      }
    } else {
      // Clear permissions if "None" is selected
      setFormData(prev => ({
        ...prev,
        permission_ids: [],
      }));
      console.log('[ROLE INHERIT] Cleared parent role and permissions');
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.code) {
      toast.error('Please fill in role name and code');
      return;
    }

    setIsSaving(true);
    try {
      await rbacService.createRole({
        name: formData.name,
        code: formData.code.toLowerCase().replace(/\s+/g, '_'),
        description: formData.description,
        priority: formData.priority,
        parent_role_id: formData.parent_role_id,
        permission_ids: formData.permission_ids,
      });
      toast.success('Role created successfully');
      router.push('/organization/role-management');
    } catch (error) {
      console.error('Failed to create role:', error);
      toast.error('Failed to create role');
    } finally {
      setIsSaving(false);
    }
  };

  const renderPermissionMatrix = () => {
    return (
      <div className="space-y-2">
        {Object.entries(permissionsByModule).map(([module, perms]) => {
          const allSelected = perms.every(p => formData.permission_ids.includes(p.id));
          const someSelected = perms.some(p => formData.permission_ids.includes(p.id));
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
                    ({perms.filter(p => formData.permission_ids.includes(p.id)).length}/{perms.length})
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
                        checked={formData.permission_ids.includes(perm.id)}
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

  if (isLoading) {
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
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Create New Role</h1>
            <p className="text-sm text-gray-600">Define a new role with custom permissions</p>
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
                Role Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., senior_recruiter"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">Higher priority = more importance (0-100)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inherits From
              </label>
              <select
                value={formData.parent_role_id || ''}
                onChange={(e) => handleParentRoleChange(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
              >
                <option value="">None</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>{role.name}</option>
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
            Create Role
          </button>
        </div>
      </div>
    </main>
  );
}
