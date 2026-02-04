'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Shield,
  Loader2,
  Check,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import rbacService from '@/lib/services/rbacService';
import {
  Permission,
  Role,
  RoleListItem,
} from '@/lib/types/rbac';

// ============================================================================
// CUSTOM PERMISSION CATEGORIES CONFIGURATION
// ============================================================================

interface CustomPermissionAction {
  code: string;
  label: string;
  description?: string;
}

interface CustomPermissionSubCategory {
  name: string;
  viewCode?: string; // Auto-enabled when any action is selected
  actions: CustomPermissionAction[];
}

interface CustomPermissionCategory {
  id: string;
  name: string;
  description?: string;
  isMenuToggle?: boolean;
  viewCode?: string; // Auto-enabled when any action is selected (for categories without subcategories)
  subCategories?: CustomPermissionSubCategory[];
  actions?: CustomPermissionAction[];
  dependencies?: {
    [actionCode: string]: string[];
  };
}

// Custom permission categories matching the backend database
// viewCode: When any action is selected, the view permission is auto-enabled
const CUSTOM_PERMISSION_CATEGORIES: CustomPermissionCategory[] = [
  {
    id: 'job_description',
    name: 'Job Description',
    description: 'Job description management permissions',
    viewCode: 'jd:read',
    actions: [
      { code: 'jd:create', label: 'Create' },
      { code: 'jd:update', label: 'Edit' },
      { code: 'jd:delete', label: 'Delete' },
    ],
  },
  {
    id: 'resumes',
    name: 'Resumes',
    description: 'Resume management permissions',
    viewCode: 'resumes:read',
    actions: [
      { code: 'resumes:create', label: 'Upload' },
      { code: 'resumes:update', label: 'Edit' },
      { code: 'resumes:delete', label: 'Delete' },
    ],
  },
  {
    id: 'internal_database',
    name: 'Internal Database',
    description: 'Access to internal resume database',
    actions: [
      { code: 'internal_db:read', label: 'View/Access' },
    ],
  },
  {
    id: 'assessments',
    name: 'Assessments',
    description: 'Assessment management permissions',
    viewCode: 'assessments:read',
    actions: [
      { code: 'assessments:create', label: 'Create' },
      { code: 'assessments:update', label: 'Edit' },
      { code: 'assessments:delete', label: 'Delete' },
    ],
  },
  {
    id: 'subscription_billing',
    name: 'Subscription & Billing',
    description: 'Billing and subscription management',
    isMenuToggle: true,
    viewCode: 'billing:read',
    subCategories: [
      {
        name: 'Billing Management',
        actions: [
          { code: 'billing:update', label: 'Manage' },
        ],
      },
      {
        name: 'Invoices',
        viewCode: 'invoices:read',
        actions: [
          { code: 'invoices:create', label: 'Create' },
          { code: 'invoices:update', label: 'Edit' },
        ],
      },
      {
        name: 'Usage & Quotas',
        viewCode: 'usage:read',
        actions: [
          { code: 'usage:update', label: 'Manage' },
        ],
      },
    ],
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'System settings and configuration',
    isMenuToggle: true,
    viewCode: 'settings:read',
    actions: [
      { code: 'settings:update', label: 'Manage' },
    ],
  },
  {
    id: 'user_management',
    name: 'User Management',
    description: 'User and role management',
    subCategories: [
      {
        name: 'Users',
        viewCode: 'users:read',
        actions: [
          { code: 'users:create', label: 'Create' },
          { code: 'users:update', label: 'Edit' },
          { code: 'users:delete', label: 'Delete' },
        ],
      },
      {
        name: 'Roles',
        viewCode: 'roles:read',
        actions: [
          { code: 'roles:create', label: 'Create' },
          { code: 'roles:update', label: 'Edit' },
          { code: 'roles:delete', label: 'Delete' },
        ],
      },
    ],
  },
  {
    id: 'analytics',
    name: 'Analytics & Reports',
    description: 'View analytics and reports',
    actions: [
      { code: 'analytics:read', label: 'View' },
    ],
  },
];

// Helper to get dependencies for a permission code
const getPermissionDependencies = (code: string): string[] => {
  for (const category of CUSTOM_PERMISSION_CATEGORIES) {
    if (category.dependencies && category.dependencies[code]) {
      return category.dependencies[code];
    }
  }
  return [];
};

// Helper to get all permission codes from custom categories (including view codes)
const getAllCustomPermissionCodes = (): string[] => {
  const codes: string[] = [];
  CUSTOM_PERMISSION_CATEGORIES.forEach(category => {
    if (category.viewCode) codes.push(category.viewCode);
    if (category.actions) {
      category.actions.forEach(action => codes.push(action.code));
    }
    if (category.subCategories) {
      category.subCategories.forEach(sub => {
        if (sub.viewCode) codes.push(sub.viewCode);
        sub.actions.forEach(action => codes.push(action.code));
      });
    }
  });
  return codes;
};

// Helper to find which category/subcategory an action belongs to
const findCategoryForAction = (actionCode: string): { category: CustomPermissionCategory; subCategory?: CustomPermissionSubCategory } | null => {
  for (const category of CUSTOM_PERMISSION_CATEGORIES) {
    if (category.actions?.some(a => a.code === actionCode)) {
      return { category };
    }
    if (category.subCategories) {
      for (const sub of category.subCategories) {
        if (sub.actions.some(a => a.code === actionCode)) {
          return { category, subCategory: sub };
        }
      }
    }
  }
  return null;
};

// Helper to get all action codes for a category or subcategory (excluding view codes)
const getActionCodesForCategory = (category: CustomPermissionCategory, subCategory?: CustomPermissionSubCategory): string[] => {
  if (subCategory) {
    return subCategory.actions.map(a => a.code);
  }
  if (category.actions) {
    return category.actions.map(a => a.code);
  }
  // For categories with only subcategories, get all subcategory actions
  const codes: string[] = [];
  category.subCategories?.forEach(sub => {
    sub.actions.forEach(a => codes.push(a.code));
  });
  return codes;
};

// Helper to check if any action in a category/subcategory is selected
const hasAnyActionSelected = (selectedCodes: Set<string>, category: CustomPermissionCategory, subCategory?: CustomPermissionSubCategory): boolean => {
  const actionCodes = getActionCodesForCategory(category, subCategory);
  return actionCodes.some(code => selectedCodes.has(code));
};

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

  // Selected permission codes (using Set for easier management)
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState<Set<string>>(new Set());

  // Load data
  useEffect(() => {
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
      console.log('[LOAD DATA] Role loaded:', roleData.name);
      console.log('[LOAD DATA] Role permissions:', roleData.permissions?.length || 0);
      console.log('[LOAD DATA] Role permission codes:', roleData.permissions?.map((p: any) => p.code));
      console.log('[LOAD DATA] Backend permissions available:', permissionsData.permissions.map((p: Permission) => `${p.code} (id:${p.id})`));

      setRole(roleData);
      setRoles(rolesData.roles);
      setPermissions(permissionsData.permissions);

      // Initialize selected permission codes from role's permissions
      if (roleData.permissions) {
        const codes = new Set(roleData.permissions.map(p => p.code));
        setSelectedPermissionCodes(codes);
        console.log('[LOAD DATA] Loaded permission codes:', Array.from(codes));
      }
    } catch (error: any) {
      console.error('Failed to load data:', error);
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

  // Get permission ID by code from backend permissions
  const getPermissionIdByCode = (code: string): number | null => {
    const perm = permissions.find(p => p.code === code);
    return perm ? perm.id : null;
  };

  // Convert selected permission codes to IDs for backend
  const getSelectedPermissionIds = (): number[] => {
    const ids: number[] = [];
    const missingCodes: string[] = [];
    selectedPermissionCodes.forEach(code => {
      const id = getPermissionIdByCode(code);
      if (id) {
        ids.push(id);
        console.log(`[PERMISSION ID] ${code} -> ID ${id}`);
      } else {
        missingCodes.push(code);
        console.warn(`[PERMISSION ID] ${code} -> NOT FOUND IN BACKEND!`);
      }
    });
    if (missingCodes.length > 0) {
      console.error('[PERMISSION ID] These codes are NOT in backend:', missingCodes);
      toast.error(`Warning: ${missingCodes.length} permissions not found in backend: ${missingCodes.join(', ')}`);
    }
    return ids;
  };

  // Handle permission toggle with dependency and view code handling
  const handlePermissionToggle = (code: string) => {
    const deps = getPermissionDependencies(code);
    const found = findCategoryForAction(code);

    console.log(`[PERMISSION TOGGLE] Code: ${code}, Dependencies: ${deps.join(', ') || 'none'}`);

    setSelectedPermissionCodes(prev => {
      const newSet = new Set(prev);
      const isCurrentlySelected = newSet.has(code);

      if (!isCurrentlySelected) {
        // Enabling: add this permission and its dependencies
        newSet.add(code);
        deps.forEach(depCode => {
          newSet.add(depCode);
          console.log(`[PERMISSION TOGGLE] Auto-added dependency: ${depCode}`);
          // Also add view code for dependency's category
          const depFound = findCategoryForAction(depCode);
          if (depFound) {
            const depViewCode = depFound.subCategory?.viewCode || depFound.category.viewCode;
            if (depViewCode) {
              newSet.add(depViewCode);
              console.log(`[PERMISSION TOGGLE] Auto-added view code for dependency: ${depViewCode}`);
            }
          }
        });

        // Auto-add view code for this action's category/subcategory
        if (found) {
          const viewCode = found.subCategory?.viewCode || found.category.viewCode;
          if (viewCode) {
            newSet.add(viewCode);
            console.log(`[PERMISSION TOGGLE] Auto-added view code: ${viewCode}`);
          }
        }
      } else {
        // Disabling: remove this permission
        newSet.delete(code);

        // Check if we should also remove the view code (no other actions selected)
        if (found) {
          const viewCode = found.subCategory?.viewCode || found.category.viewCode;
          if (viewCode) {
            // Check if any other action in the same category/subcategory is still selected
            const stillHasActions = hasAnyActionSelected(newSet, found.category, found.subCategory);
            if (!stillHasActions) {
              newSet.delete(viewCode);
              console.log(`[PERMISSION TOGGLE] Auto-removed view code: ${viewCode}`);
            }
          }
        }
      }

      console.log(`[PERMISSION TOGGLE] Selected codes:`, Array.from(newSet));
      return newSet;
    });
  };

  // Handle select all permissions
  const handleSelectAll = () => {
    const allCodes = getAllCustomPermissionCodes();
    const allSelected = allCodes.every(code => selectedPermissionCodes.has(code));

    if (allSelected) {
      setSelectedPermissionCodes(new Set());
    } else {
      setSelectedPermissionCodes(new Set(allCodes));
    }
  };

  // Handle parent role change - inherit permissions
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

        // Pre-populate with parent role's permissions (by code)
        if (parentRole.permissions) {
          const codes = new Set(parentRole.permissions.map(p => p.code));
          setSelectedPermissionCodes(codes);
          console.log('[ROLE INHERIT] Loaded', codes.size, 'permissions from parent role');
          toast.success(`Loaded ${codes.size} permissions from ${parentRole.name}`);
        }
      } catch (error) {
        console.error('[ROLE INHERIT] Failed to load parent role permissions:', error);
        toast.error('Failed to load parent role permissions');
      }
    }
  };

  const handleSubmit = async () => {
    if (!role) return;

    const permissionIds = getSelectedPermissionIds();

    const payload = {
      name: role.name,
      description: role.description,
      priority: role.priority,
      parent_role_id: role.parent_role_id,
      permission_ids: permissionIds,
      permission_codes: Array.from(selectedPermissionCodes),
    };

    console.log('[UPDATE ROLE] Submitting payload:', payload);
    console.log('[UPDATE ROLE] Permission codes:', Array.from(selectedPermissionCodes));
    console.log('[UPDATE ROLE] Permission IDs:', permissionIds);

    setIsSaving(true);
    try {
      const result = await rbacService.updateRole(role.id, payload);
      console.log('[UPDATE ROLE] Success! Updated role:', result);
      toast.success('Role updated successfully');
      router.push('/organization/role-management');
    } catch (error: any) {
      console.error('[UPDATE ROLE] Failed:', error);
      console.error('[UPDATE ROLE] Error response:', error?.response?.data);
      toast.error(error?.response?.data?.detail || 'Failed to update role');
    } finally {
      setIsSaving(false);
    }
  };

  const renderPermissionCategories = () => {
    const allCodes = getAllCustomPermissionCodes();
    const allSelected = allCodes.every(code => selectedPermissionCodes.has(code));
    const someSelected = selectedPermissionCodes.size > 0 && !allSelected;

    return (
      <div className="space-y-4">
        {/* Select All Option */}
        <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-50">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSelectAll}
                className={`w-5 h-5 rounded flex items-center justify-center border-2 ${
                  allSelected
                    ? 'bg-gray-800 border-gray-800'
                    : someSelected
                    ? 'bg-gray-400 border-gray-800'
                    : 'border-gray-300'
                }`}
              >
                {(allSelected || someSelected) && <Check className="w-3 h-3 text-white" />}
              </button>
              <span className="font-semibold text-gray-900">
                Select All Permissions
              </span>
              <span className="text-xs text-gray-500">
                ({selectedPermissionCodes.size}/{allCodes.length} selected)
              </span>
            </div>
          </div>
        </div>

        {/* Permission Categories */}
        {CUSTOM_PERMISSION_CATEGORIES.map(category => (
          <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Category Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="text-sm font-semibold text-gray-900">
                {category.name}
              </div>
              {category.isMenuToggle && (
                <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                  Menu Enable/Disable
                </span>
              )}
              {category.description && (
                <span className="text-xs text-gray-500">- {category.description}</span>
              )}
            </div>

            <div className="p-4 bg-white">
              {/* Direct Actions (no subcategories) */}
              {category.actions && (
                <div className="flex flex-wrap gap-2 items-center">
                  {/* View badge - shown when any action is selected */}
                  {category.viewCode && selectedPermissionCodes.has(category.viewCode) && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 border border-green-200">
                      <Check className="w-3.5 h-3.5" />
                      <span className="text-sm font-medium">View</span>
                    </div>
                  )}
                  {category.actions.map(action => {
                    const isSelected = selectedPermissionCodes.has(action.code);
                    const hasDeps = getPermissionDependencies(action.code).length > 0;

                    return (
                      <button
                        key={action.code}
                        type="button"
                        onClick={() => handlePermissionToggle(action.code)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                          isSelected
                            ? 'bg-gray-800 text-white border-gray-800'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-sm">{action.label}</span>
                        {hasDeps && (
                          <span className="text-xs opacity-75" title="Auto-enables Resume Upload">*</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Subcategories */}
              {category.subCategories && (
                <div className="space-y-4">
                  {category.subCategories.map(subCategory => {
                    const subViewCode = subCategory.viewCode || category.viewCode;
                    const hasViewEnabled = subViewCode && selectedPermissionCodes.has(subViewCode);

                    return (
                    <div key={subCategory.name} className="space-y-2">
                      <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                        {subCategory.name}
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        {/* View badge - shown when any action in this subcategory is selected */}
                        {subCategory.viewCode && selectedPermissionCodes.has(subCategory.viewCode) && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 border border-green-200">
                            <Check className="w-3.5 h-3.5" />
                            <span className="text-sm font-medium">View</span>
                          </div>
                        )}
                        {subCategory.actions.map(action => {
                          const isSelected = selectedPermissionCodes.has(action.code);
                          const hasDeps = getPermissionDependencies(action.code).length > 0;

                          return (
                            <button
                              key={action.code}
                              type="button"
                              onClick={() => handlePermissionToggle(action.code)}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                                isSelected
                                  ? 'bg-gray-800 text-white border-gray-800'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <span className="text-sm">{action.label}</span>
                              {hasDeps && (
                                <span className="text-xs opacity-75" title="Auto-enables dependencies">*</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Note about auto-enabled permissions */}
        <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
          <div><strong>View Permission:</strong> Automatically enabled when you select any action (Create, Edit, Delete, etc.) for a category.</div>
        </div>

        {/* Summary of selected permissions */}
        {selectedPermissionCodes.size > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-sm font-medium text-green-800 mb-2">
              Permissions to be saved ({selectedPermissionCodes.size}):
            </div>
            <div className="flex flex-wrap gap-1">
              {Array.from(selectedPermissionCodes).sort().map(code => (
                <span key={code} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
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
            {renderPermissionCategories()}
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
