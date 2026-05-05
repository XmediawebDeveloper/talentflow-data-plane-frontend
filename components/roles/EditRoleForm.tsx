'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Shield,
  Loader2,
  Check,
  Lock,
  Layers3,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import rbacService from '@/lib/services/rbacService';
import {
  Permission,
  Role,
  RoleListItem,
} from '@/lib/types/rbac';
import {
  CUSTOM_PERMISSION_CATEGORIES,
  type CustomPermissionCategory,
  type CustomPermissionSubCategory,
} from '@/lib/constants/permissionCategories';

const getPermissionDependencies = (code: string): string[] => {
  for (const category of CUSTOM_PERMISSION_CATEGORIES) {
    if (category.dependencies && category.dependencies[code]) {
      return category.dependencies[code];
    }
  }
  return [];
};

const getAllCustomPermissionCodes = (): string[] => {
  const codes: string[] = [];
  CUSTOM_PERMISSION_CATEGORIES.forEach((category) => {
    if (category.viewCode) codes.push(category.viewCode);
    if (category.actions) {
      category.actions.forEach((action) => codes.push(action.code));
    }
    if (category.subCategories) {
      category.subCategories.forEach((sub) => {
        if (sub.viewCode) codes.push(sub.viewCode);
        sub.actions.forEach((action) => codes.push(action.code));
      });
    }
  });
  return codes;
};

const findCategoryForAction = (actionCode: string): { category: CustomPermissionCategory; subCategory?: CustomPermissionSubCategory } | null => {
  for (const category of CUSTOM_PERMISSION_CATEGORIES) {
    if (category.actions?.some((action) => action.code === actionCode)) {
      return { category };
    }
    if (category.subCategories) {
      for (const subCategory of category.subCategories) {
        if (subCategory.actions.some((action) => action.code === actionCode)) {
          return { category, subCategory };
        }
      }
    }
  }
  return null;
};

const getActionCodesForCategory = (category: CustomPermissionCategory, subCategory?: CustomPermissionSubCategory): string[] => {
  if (subCategory) {
    return subCategory.actions.map((action) => action.code);
  }
  if (category.actions) {
    return category.actions.map((action) => action.code);
  }

  const codes: string[] = [];
  category.subCategories?.forEach((sub) => {
    sub.actions.forEach((action) => codes.push(action.code));
  });
  return codes;
};

const hasAnyActionSelected = (selectedCodes: Set<string>, category: CustomPermissionCategory, subCategory?: CustomPermissionSubCategory): boolean => {
  const actionCodes = getActionCodesForCategory(category, subCategory);
  return actionCodes.some((code) => selectedCodes.has(code));
};

const fieldClassName =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500';

const getErrorStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }

  const response = (error as { response?: { status?: number } }).response;
  return response?.status;
};

const getErrorDetail = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }

  const response = (error as { response?: { data?: { detail?: string } } }).response;
  return response?.data?.detail;
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
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!roleId || isNaN(roleId) || roleId <= 0) {
      toast.error('Invalid role ID');
      router.push('/organization/role-management');
      return;
    }
    const run = async () => {
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

        if (roleData.permissions) {
          setSelectedPermissionCodes(new Set(roleData.permissions.map((permission) => permission.code)));
        }
      } catch (error: unknown) {
        console.error('Failed to load role data:', error);
        const status = getErrorStatus(error);
        if (status === 404) {
          toast.error('Role not found');
        } else if (status === 422) {
          toast.error('Invalid role ID format');
        } else {
          toast.error('Failed to load role data');
        }
        router.push('/organization/role-management');
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, [roleId, router]);

  const getPermissionIdByCode = (code: string): number | null => {
    const permission = permissions.find((item) => item.code === code);
    return permission ? permission.id : null;
  };

  const getSelectedPermissionIds = (): number[] => {
    const ids: number[] = [];
    const missingCodes: string[] = [];

    selectedPermissionCodes.forEach((code) => {
      const id = getPermissionIdByCode(code);
      if (id) {
        ids.push(id);
      } else {
        missingCodes.push(code);
      }
    });

    if (missingCodes.length > 0) {
      toast.error(`Warning: ${missingCodes.length} permissions not found in backend: ${missingCodes.join(', ')}`);
    }

    return ids;
  };

  const handlePermissionToggle = (code: string) => {
    const dependencies = getPermissionDependencies(code);
    const found = findCategoryForAction(code);

    setSelectedPermissionCodes((prev) => {
      const next = new Set(prev);
      const isSelected = next.has(code);

      if (!isSelected) {
        next.add(code);
        dependencies.forEach((dependencyCode) => {
          next.add(dependencyCode);
          const dependencyCategory = findCategoryForAction(dependencyCode);
          if (dependencyCategory) {
            const dependencyViewCode = dependencyCategory.subCategory?.viewCode || dependencyCategory.category.viewCode;
            if (dependencyViewCode) next.add(dependencyViewCode);
          }
        });

        if (found) {
          const viewCode = found.subCategory?.viewCode || found.category.viewCode;
          if (viewCode) next.add(viewCode);
        }
      } else {
        next.delete(code);
        if (found) {
          const viewCode = found.subCategory?.viewCode || found.category.viewCode;
          if (viewCode) {
            const stillHasActions = hasAnyActionSelected(next, found.category, found.subCategory);
            if (!stillHasActions) next.delete(viewCode);
          }
        }
      }

      return next;
    });
  };

  const handleSelectAll = () => {
    const allCodes = getAllCustomPermissionCodes();
    const allSelected = allCodes.every((code) => selectedPermissionCodes.has(code));
    setSelectedPermissionCodes(allSelected ? new Set() : new Set(allCodes));
  };

  const handleParentRoleChange = async (parentRoleId: string) => {
    if (!role) return;

    const nextParentRoleId = parentRoleId ? parseInt(parentRoleId, 10) : undefined;
    setRole({ ...role, parent_role_id: nextParentRoleId });

    if (nextParentRoleId) {
      try {
        const parentRole = await rbacService.getRoleById(nextParentRoleId);
        if (parentRole.permissions) {
          const codes = new Set(parentRole.permissions.map((permission) => permission.code));
          setSelectedPermissionCodes(codes);
          toast.success(`Loaded ${codes.size} permissions from ${parentRole.name}`);
        }
      } catch (error) {
        console.error('Failed to load parent role permissions:', error);
        toast.error('Failed to load parent role permissions');
      }
    }
  };

  const handleSubmit = async () => {
    if (!role) return;

    const payload = {
      name: role.name,
      description: role.description,
      priority: role.priority,
      parent_role_id: role.parent_role_id,
      permission_ids: getSelectedPermissionIds(),
      permission_codes: Array.from(selectedPermissionCodes),
    };

    setIsSaving(true);
    try {
      await rbacService.updateRole(role.id, payload);
      toast.success('Role updated successfully');
      router.push('/organization/role-management');
    } catch (error: unknown) {
      console.error('Failed to update role:', error);
      toast.error(getErrorDetail(error) || 'Failed to update role');
    } finally {
      setIsSaving(false);
    }
  };

  const renderPermissionPill = (
    code: string,
    label: string,
    isSelected: boolean,
    hasDependencies: boolean,
    onClick: () => void
  ) => (
    <button
      key={code}
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
        isSelected
          ? 'border-brand-blue bg-gradient-to-r from-brand-blue to-brand-blue-2 text-white shadow-md shadow-brand-blue/20'
          : 'border-gray-200 bg-white text-gray-700 hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue'
      }`}
    >
      <span>{label}</span>
      {hasDependencies && (
        <span className={`text-[11px] ${isSelected ? 'text-white/80' : 'text-gray-400'}`} title="Auto-enables dependencies">
          *
        </span>
      )}
    </button>
  );

  const renderPermissionCategories = () => {
    const allCodes = getAllCustomPermissionCodes();
    const allSelected = allCodes.every((code) => selectedPermissionCodes.has(code));
    const someSelected = selectedPermissionCodes.size > 0 && !allSelected;

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-100 bg-gradient-to-r from-brand-blue/[0.04] via-brand-cyan/[0.03] to-transparent p-4 ring-1 ring-black/[0.02]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Permission Library</h3>
              <p className="text-xs text-gray-500">
                {selectedPermissionCodes.size} of {allCodes.length} permissions selected
              </p>
            </div>
            <button
              type="button"
              onClick={handleSelectAll}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                allSelected
                  ? 'border-brand-blue bg-gradient-to-r from-brand-blue to-brand-blue-2 text-white shadow-md shadow-brand-blue/20'
                  : someSelected
                  ? 'border-brand-cyan/30 bg-brand-cyan/10 text-brand-blue'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue'
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${allSelected || someSelected ? 'border-white/50 bg-white/20' : 'border-gray-300 bg-white'}`}>
                {(allSelected || someSelected) && <Check className="h-3 w-3" />}
              </span>
              Select all permissions
            </button>
          </div>
        </div>

        {CUSTOM_PERMISSION_CATEGORIES.map((category) => (
          <section
            key={category.id}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-black/[0.02]"
          >
            <div className="flex flex-col gap-3 border-b border-gray-100 bg-gradient-to-r from-brand-blue/[0.04] to-transparent px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{category.name}</h3>
                  {category.isMenuToggle && (
                    <span className="inline-flex items-center rounded-full bg-brand-orange/10 px-2.5 py-1 text-[11px] font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
                      Menu toggle
                    </span>
                  )}
                </div>
                {category.description && (
                  <p className="mt-1 text-xs text-gray-500">{category.description}</p>
                )}
              </div>
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              {category.actions && (
                <div className="flex flex-wrap gap-2">
                  {category.viewCode && selectedPermissionCodes.has(category.viewCode) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-1 text-[11px] font-medium text-brand-teal ring-1 ring-brand-teal/15">
                      <Check className="h-3 w-3" />
                      View enabled
                    </span>
                  )}
                  {category.actions.map((action) =>
                    renderPermissionPill(
                      action.code,
                      action.label,
                      selectedPermissionCodes.has(action.code),
                      getPermissionDependencies(action.code).length > 0,
                      () => handlePermissionToggle(action.code)
                    )
                  )}
                </div>
              )}

              {category.subCategories && (
                <div className="space-y-4">
                  {category.subCategories.map((subCategory) => (
                    <div key={subCategory.name} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                          {subCategory.name}
                        </span>
                        {subCategory.viewCode && selectedPermissionCodes.has(subCategory.viewCode) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-1 text-[11px] font-medium text-brand-teal ring-1 ring-brand-teal/15">
                            <Check className="h-3 w-3" />
                            View enabled
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {subCategory.actions.map((action) =>
                          renderPermissionPill(
                            action.code,
                            action.label,
                            selectedPermissionCodes.has(action.code),
                            getPermissionDependencies(action.code).length > 0,
                            () => handlePermissionToggle(action.code)
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ))}

        <div className="rounded-2xl border border-brand-blue/15 bg-brand-blue/[0.04] p-4 text-sm text-gray-600">
          <span className="font-semibold text-gray-900">View permission</span> remains coupled to selected action scopes so the role stays internally consistent.
        </div>

        {selectedPermissionCodes.size > 0 && (
          <div className="rounded-2xl border border-brand-teal/15 bg-brand-teal/[0.06] p-4">
            <div className="mb-3 text-sm font-semibold text-gray-900">
              Selected permissions ({selectedPermissionCodes.size})
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from(selectedPermissionCodes)
                .sort()
                .map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-teal ring-1 ring-brand-teal/15"
                  >
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
      <main className="flex-1 bg-slate-50">
        <div className="flex h-full min-h-[60vh] items-center justify-center p-8">
          <div className="flex items-center gap-3 text-gray-600">
            <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
            <span className="font-medium">Loading role editor...</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-slate-50">
      <div className="p-4 md:p-8">
        <button
          onClick={() => router.push('/organization/role-management')}
          className="mb-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-white hover:text-brand-blue"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Role Management
        </button>

        <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Layers3 className="h-3.5 w-3.5 text-brand-orange" />
                Existing access profile
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Edit Role</h1>
                    {role.is_system && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/15">
                        <Lock className="h-3 w-3" />
                        System role
                      </span>
                    )}
                  </div>
                  <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">
                    Update role details and permission coverage while preserving the same design system and workflow cues used across the dashboard.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm text-white/85 sm:min-w-[260px]">
              <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="text-xs text-white/65">Assigned users</div>
                <div className="mt-1 font-semibold">{role.user_count || 0}</div>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="text-xs text-white/65">Selected permissions</div>
                <div className="mt-1 font-semibold">{selectedPermissionCodes.size}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <div className="border-b border-gray-100 bg-gradient-to-r from-brand-blue/[0.04] via-brand-cyan/[0.03] to-transparent px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-gray-900">Role Details</h2>
              <p className="text-sm text-gray-500">Adjust metadata, inheritance, and permissions without leaving the current workflow.</p>
            </div>

            <div className="space-y-8 p-5 sm:p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Role Name</span>
                  <input
                    type="text"
                    value={role.name}
                    onChange={(e) => setRole({ ...role, name: e.target.value })}
                    className={fieldClassName}
                    disabled={role.is_system}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Role Code</span>
                  <input type="text" value={role.code} className={fieldClassName} disabled />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Description</span>
                <textarea
                  value={role.description || ''}
                  onChange={(e) => setRole({ ...role, description: e.target.value })}
                  placeholder="Describe what this role is responsible for and where it should be used."
                  rows={4}
                  className={`${fieldClassName} resize-y`}
                />
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Priority</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={role.priority}
                    onChange={(e) => setRole({ ...role, priority: parseInt(e.target.value, 10) || 0 })}
                    className={fieldClassName}
                  />
                  <span className="mt-2 block text-xs text-gray-500">Higher priority roles take precedence in overlap scenarios.</span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Inherits From</span>
                  <select
                    value={role.parent_role_id || ''}
                    onChange={(e) => handleParentRoleChange(e.target.value)}
                    className={fieldClassName}
                  >
                    <option value="">None</option>
                    {roles
                      .filter((roleOption) => roleOption.id !== role.id)
                      .map((roleOption) => (
                        <option key={roleOption.id} value={roleOption.id}>
                          {roleOption.name}
                        </option>
                      ))}
                  </select>
                  <span className="mt-2 block text-xs text-gray-500">Selecting a parent role replaces the current permission set with inherited permissions.</span>
                </label>
              </div>

              <div>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Permissions</h3>
                  <p className="text-sm text-gray-500">Update the role’s access surface and review the selected scopes before saving.</p>
                </div>
                {renderPermissionCategories()}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                onClick={() => router.push('/organization/role-management')}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-blue to-brand-blue-2 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-70"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                Save Changes
              </button>
            </div>
          </section>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-orange/15 to-brand-orange-deep/10 ring-1 ring-brand-orange/15 shadow-sm shadow-brand-orange/10">
                  <Sparkles className="h-5 w-5 text-brand-orange-deep" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Role Snapshot</h3>
                  <p className="mt-1 text-sm text-gray-500">A compact view of the current role configuration.</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Role Name</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{role.name}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Role Code</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{role.code}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Inheritance</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {roles.find((roleOption) => roleOption.id === role.parent_role_id)?.name || 'Independent'}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Selected Permissions</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{selectedPermissionCodes.size}</div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
              <h3 className="text-base font-semibold text-gray-900">Guidance</h3>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <div className="rounded-xl bg-brand-blue/[0.04] px-4 py-3 ring-1 ring-brand-blue/10">
                  System roles can still be reviewed and tuned, but key identity fields stay protected.
                </div>
                <div className="rounded-xl bg-brand-cyan/[0.05] px-4 py-3 ring-1 ring-brand-cyan/10">
                  Review inherited permission changes carefully before saving, especially when re-parenting a role.
                </div>
                <div className="rounded-xl bg-brand-orange/[0.06] px-4 py-3 ring-1 ring-brand-orange/10">
                  Keep permission scope tight so the role remains readable to admins and auditors.
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
