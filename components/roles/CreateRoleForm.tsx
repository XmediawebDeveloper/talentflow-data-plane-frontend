'use client';

import { MODAL_FOOTER_BUTTON_CLASS, MODAL_FOOTER_ROW_CLASS } from '@/components/ui/app-modal';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Shield,
  Check,
  Sparkles,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import rbacService from '@/lib/services/rbacService';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Permission,
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

/** The reverse of getPermissionDependencies: every action code that declares
 *  `code` as one of ITS dependencies. Used to block unchecking a permission
 *  that something else currently selected still relies on — mirrors
 *  getBlockingPermissions in components/users/UserManagement.tsx, so the
 *  per-role and per-user permission editors enforce the same rule the same
 *  way instead of one silently allowing an inconsistent combination. */
const getPermissionsDependingOn = (code: string): string[] => {
  const dependents: string[] = [];
  CUSTOM_PERMISSION_CATEGORIES.forEach((category) => {
    if (!category.dependencies) return;
    Object.entries(category.dependencies).forEach(([action, deps]) => {
      if (deps.includes(code)) dependents.push(action);
    });
  });
  return dependents;
};

const getPermissionDisplayName = (code: string): string => {
  for (const category of CUSTOM_PERMISSION_CATEGORIES) {
    if (category.viewCode === code) return category.name;
    const action = category.actions?.find((a) => a.code === code);
    if (action) return `${action.label} (${category.name})`;
    for (const sub of category.subCategories || []) {
      if (sub.viewCode === code) return `View ${sub.name}`;
      const subAction = sub.actions.find((a) => a.code === code);
      if (subAction) return `${subAction.label} (${sub.name})`;
    }
  }
  return code;
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
  'w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10';

// Same field, in its invalid state — a full replacement rather than extra classes
// appended to `fieldClassName`, so the red border/ring can't lose a Tailwind
// specificity tie against the gray/blue ones it replaces.
const fieldErrorClassName =
  'w-full rounded-lg border border-destructive-line bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-destructive-line focus:ring-4 focus:ring-destructive-line';

const getErrorDetail = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }

  const response = (error as { response?: { data?: { detail?: string } } }).response;
  return response?.data?.detail;
};

interface CreateRoleFormProps {
  /** When rendered inside a side panel/modal instead of as a full page. */
  embedded?: boolean;
  /** Called after a successful create (panel host closes + refreshes). */
  onSuccess?: () => void;
  /** Called on cancel/back (panel host closes). Falls back to route nav. */
  onCancel?: () => void;
}

export default function CreateRoleForm({ embedded = false, onSuccess, onCancel }: CreateRoleFormProps = {}) {
  const router = useRouter();
  const handleClose = onCancel ?? (() => router.push('/organization/role-management'));
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    priority: 50,
    parent_role_id: undefined as number | undefined,
  });
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState<Set<string>>(new Set());
  // Which required fields the user has left, so an error shows the moment a
  // field is touched (and updates live as they keep typing) instead of only
  // after Create is pressed.
  const [touched, setTouched] = useState<{ name?: boolean; code?: boolean }>({});

  // Derived per-field errors — recomputed every render, so once a field is
  // touched its message tracks the current value in real time.
  const fieldErrors = {
    name: !formData.name.trim() ? 'Role name is required' : '',
    code: !formData.code.trim() ? 'Role code is required' : '',
  };
  const showError = (field: 'name' | 'code') => (touched[field] ? fieldErrors[field] : '');

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
    const isSelected = selectedPermissionCodes.has(code);

    if (isSelected) {
      // Disabling — block if another still-enabled permission requires this
      // one, the same guard components/users/UserManagement.tsx already
      // applies to per-user overrides, so both editors refuse the same
      // inconsistent combination instead of only one of them catching it.
      const blockers = getPermissionsDependingOn(code).filter((dependent) => selectedPermissionCodes.has(dependent));
      if (blockers.length > 0) {
        toast.warning(
          `Cannot disable "${getPermissionDisplayName(code)}" — it's required by ${blockers.map(getPermissionDisplayName).join(', ')}. Disable that permission first.`,
        );
        return;
      }
    }

    setSelectedPermissionCodes((prev) => {
      const next = new Set(prev);

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

  const getAllCodesForCategory = (category: CustomPermissionCategory): string[] => {
    const codes: string[] = [];
    if (category.viewCode) codes.push(category.viewCode);
    if (category.actions) {
      category.actions.forEach((action) => codes.push(action.code));
    }
    if (category.subCategories) {
      category.subCategories.forEach((subCategory) => {
        if (subCategory.viewCode) codes.push(subCategory.viewCode);
        subCategory.actions.forEach((action) => codes.push(action.code));
      });
    }
    return codes;
  };

  const handleSelectAllCategory = (category: CustomPermissionCategory) => {
    const categoryCodes = getAllCodesForCategory(category);
    const allSelected = categoryCodes.every((code) => selectedPermissionCodes.has(code));

    setSelectedPermissionCodes((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        categoryCodes.forEach((code) => next.delete(code));
      } else {
        categoryCodes.forEach((code) => next.add(code));
        categoryCodes.forEach((code) => {
          const dependencies = getPermissionDependencies(code);
          dependencies.forEach((dependencyCode) => {
            next.add(dependencyCode);
            const dependencyCategory = findCategoryForAction(dependencyCode);
            if (dependencyCategory) {
              const dependencyViewCode = dependencyCategory.subCategory?.viewCode || dependencyCategory.category.viewCode;
              if (dependencyViewCode) next.add(dependencyViewCode);
            }
          });
        });
      }
      return next;
    });
  };

  const isCategoryAllSelected = (category: CustomPermissionCategory): boolean => {
    const categoryCodes = getAllCodesForCategory(category);
    return categoryCodes.length > 0 && categoryCodes.every((code) => selectedPermissionCodes.has(code));
  };

  const isCategorySomeSelected = (category: CustomPermissionCategory): boolean => {
    const categoryCodes = getAllCodesForCategory(category);
    const selectedCount = categoryCodes.filter((code) => selectedPermissionCodes.has(code)).length;
    return selectedCount > 0 && selectedCount < categoryCodes.length;
  };

  const handleParentRoleChange = async (parentRoleId: string) => {
    const roleId = parentRoleId ? parseInt(parentRoleId, 10) : undefined;
    setFormData((prev) => ({ ...prev, parent_role_id: roleId }));

    if (roleId) {
      try {
        const parentRole = await rbacService.getRoleById(roleId);
        if (parentRole.permissions) {
          const codes = new Set(parentRole.permissions.map((permission) => permission.code));
          setSelectedPermissionCodes(codes);
          toast.success(`Loaded ${codes.size} permissions from ${parentRole.name}`);
        }
      } catch (error) {
        console.error('Failed to load parent role permissions:', error);
        toast.error('Failed to load parent role permissions');
      }
    } else {
      setSelectedPermissionCodes(new Set());
    }
  };

  const handleSubmit = async () => {
    if (fieldErrors.name || fieldErrors.code) {
      // Reveal the inline messages for anything still invalid, then stop.
      setTouched({ name: true, code: true });
      return;
    }

    const permissionIds = getSelectedPermissionIds();
    const payload = {
      name: formData.name,
      code: formData.code.toLowerCase().replace(/\s+/g, '_'),
      description: formData.description,
      priority: formData.priority,
      parent_role_id: formData.parent_role_id,
      permission_ids: permissionIds,
      permission_codes: Array.from(selectedPermissionCodes),
    };

    setIsSaving(true);
    try {
      await rbacService.createRole(payload);
      toast.success('Role created successfully');
      if (onSuccess) { onSuccess(); } else { router.push('/organization/role-management'); }
    } catch (error: unknown) {
      console.error('Failed to create role:', error);
      toast.error(getErrorDetail(error) || 'Failed to create role');
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
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
        isSelected
          ? 'border-brand-blue bg-brand-blue text-white shadow-md shadow-brand-blue/20'
          : 'border-gray-200 bg-white text-gray-700 hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue'
      }`}
    >
      <span>{label}</span>
      {hasDependencies && (
        <span className={`text-2xs ${isSelected ? 'text-white/80' : 'text-gray-400'}`} title="Auto-enables dependencies">
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
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 ring-1 ring-black/[0.02]">
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
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                allSelected
                  ? 'border-brand-blue bg-brand-blue text-white shadow-md shadow-brand-blue/20'
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

        {CUSTOM_PERMISSION_CATEGORIES.map((category) => {
          const categoryAllSelected = isCategoryAllSelected(category);
          const categorySomeSelected = isCategorySomeSelected(category);
          const categoryCodes = getAllCodesForCategory(category);
          const categorySelectedCount = categoryCodes.filter((code) => selectedPermissionCodes.has(code)).length;

          return (
            <section
              key={category.id}
              className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm ring-1 ring-black/[0.02]"
            >
              <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectAllCategory(category)}
                    className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                      categoryAllSelected
                        ? 'border-brand-blue bg-brand-blue text-white'
                        : categorySomeSelected
                        ? 'border-brand-cyan bg-brand-cyan text-white'
                        : 'border-gray-300 bg-white hover:border-brand-blue/40'
                    }`}
                    aria-label={`Select all permissions for ${category.name}`}
                  >
                    {(categoryAllSelected || categorySomeSelected) && <Check className="h-3 w-3" />}
                  </button>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{category.name}</h3>
                      {category.isMenuToggle && (
                        <span className="inline-flex items-center rounded-full bg-brand-orange/10 px-2.5 py-1 text-2xs font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
                          Menu toggle
                        </span>
                      )}
                    </div>
                    {category.description && (
                      <p className="mt-1 text-xs text-gray-500">{category.description}</p>
                    )}
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full bg-gray-50 px-3 py-1.5 text-xs text-gray-500 ring-1 ring-gray-200">
                  {categorySelectedCount}/{categoryCodes.length} selected
                </span>
              </div>

              <div className="space-y-5 p-4 sm:p-5">
                {category.actions && (
                  <div className="flex flex-wrap gap-2">
                    {category.viewCode &&
                      renderPermissionPill(
                        category.viewCode,
                        'View',
                        selectedPermissionCodes.has(category.viewCode),
                        false,
                        () => {
                          const viewCode = category.viewCode!;
                          setSelectedPermissionCodes((prev) => {
                            const next = new Set(prev);
                            if (next.has(viewCode)) {
                              const hasActions = (category.actions || []).some((action) => next.has(action.code));
                              if (!hasActions) next.delete(viewCode);
                            } else {
                              next.add(viewCode);
                            }
                            return next;
                          });
                        }
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
                      <div key={subCategory.name} className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                            {subCategory.name}
                          </span>
                          {subCategory.viewCode && selectedPermissionCodes.has(subCategory.viewCode) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-1 text-2xs font-medium text-brand-teal ring-1 ring-brand-teal/15">
                              <Check className="h-3 w-3" />
                              View enabled
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {subCategory.viewCode &&
                            renderPermissionPill(
                              subCategory.viewCode,
                              'View',
                              selectedPermissionCodes.has(subCategory.viewCode),
                              false,
                              () => {
                                const viewCode = subCategory.viewCode!;
                                setSelectedPermissionCodes((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(viewCode)) {
                                    const hasActions = subCategory.actions.some((action) => next.has(action.code));
                                    if (!hasActions) next.delete(viewCode);
                                  } else {
                                    next.add(viewCode);
                                  }
                                  return next;
                                });
                              }
                            )}
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
          );
        })}

        <div className="rounded-xl border border-brand-blue/15 bg-brand-blue/[0.04] p-4 text-sm text-gray-600">
          <span className="font-semibold text-gray-900">View permission</span> is automatically enabled when any action in the same category is selected.
        </div>

        {selectedPermissionCodes.size > 0 && (
          <div className="rounded-xl border border-brand-teal/15 bg-brand-teal/[0.06] p-4">
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

  if (isLoading) {
    // Skeleton mirroring the role builder: gradient hero, the Role Details form
    // card (Name/Code, Description, Priority/Inherits, Permissions) and the
    // right-hand summary sidebar.
    return (
      <main className={embedded ? '' : 'flex-1 overflow-x-clip bg-slate-50'}>
        <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-[1400px]'}>
          <div className={embedded ? 'w-full' : 'p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl'}>
            <div className="mb-5 flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-80 max-w-full" />
              </div>
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-xl border border-gray-100 bg-white">
                <div className="border-b border-gray-100 bg-gray-50 px-5 py-4 space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3.5 w-72 max-w-full" />
                </div>
                <div className="space-y-6 p-5 sm:p-6">
                  <div className="grid gap-5 md:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="space-y-2"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-11 w-full rounded-lg" /></div>
                    ))}
                  </div>
                  <div className="space-y-2"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-24 w-full rounded-lg" /></div>
                  <div className="grid gap-5 md:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="space-y-2"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-11 w-full rounded-lg" /></div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-32" />
                    {Array.from({ length: 3 }).map((_, i) => (<Skeleton key={i} className="h-16 w-full rounded-xl" />))}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-5 space-y-4 xl:sticky xl:top-6 xl:self-start">
                <Skeleton className="h-5 w-32" />
                {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-14 w-full rounded-xl" />))}
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={embedded ? '' : 'flex-1 overflow-x-clip bg-slate-50'}>
      <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-[1400px]'}>
      <div className={embedded ? 'w-full' : 'p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl'}>
        {!embedded && (
          <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Role Management', href: '/organization/role-management' }, { label: 'Create Role' }]} />
        )}
        {!embedded && (
          <button
            onClick={handleClose}
            className="mb-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-white hover:text-brand-blue"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Role Management
          </button>
        )}

        <PageHeader
          icon={<Shield className="h-5 w-5" />}
          title="Create New Role"
          description="Define a role that fits your dashboard's access model, including inheritance, operational priority, and detailed feature permissions."
          actions={
            <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
              <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                <div className="text-xs text-gray-500">Available roles</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{roles.length}</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                <div className="text-xs text-gray-500">Selected permissions</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{selectedPermissionCodes.size}</div>
              </div>
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-gray-900">Role Details</h2>
              <p className="text-sm text-gray-500">Start with the role identity, then configure the access surface below.</p>
            </div>

            <div className="space-y-8 p-5 sm:p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">
                    Role Name <span className="text-brand-orange">*</span>
                  </span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                    placeholder="e.g. Senior Recruiter"
                    aria-invalid={!!showError('name')}
                    className={showError('name') ? fieldErrorClassName : fieldClassName}
                  />
                  {showError('name') && (
                    <span className="mt-1.5 block text-xs font-medium text-destructive">{fieldErrors.name}</span>
                  )}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">
                    Role Code <span className="text-brand-orange">*</span>
                  </span>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    onBlur={() => setTouched((prev) => ({ ...prev, code: true }))}
                    placeholder="e.g. senior_recruiter"
                    aria-invalid={!!showError('code')}
                    className={showError('code') ? fieldErrorClassName : fieldClassName}
                  />
                  {showError('code') && (
                    <span className="mt-1.5 block text-xs font-medium text-destructive">{fieldErrors.code}</span>
                  )}
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Description</span>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value, 10) || 0 })}
                    className={fieldClassName}
                  />
                  <span className="mt-2 block text-xs text-gray-500">Higher priority roles take precedence in overlap scenarios.</span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Inherits From</span>
                  <select
                    value={formData.parent_role_id || ''}
                    onChange={(e) => handleParentRoleChange(e.target.value)}
                    className={fieldClassName}
                  >
                    <option value="">None</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 block text-xs text-gray-500">Selecting a parent role preloads its permissions into this role.</span>
                </label>
              </div>

              <div>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Permissions</h3>
                  <p className="text-sm text-gray-500">Choose only what this role needs. View access will be carried automatically where required.</p>
                </div>
                {renderPermissionCategories()}
              </div>
            </div>

            <div className="border-t border-gray-100 px-5 py-4 sm:px-6">
              <div className={MODAL_FOOTER_ROW_CLASS}>
              <Button variant="secondary" size="md" onClick={handleClose} disabled={isSaving} className={MODAL_FOOTER_BUTTON_CLASS}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                className={MODAL_FOOTER_BUTTON_CLASS}
                onClick={handleSubmit}
                disabled={isSaving}
                icon={isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
              >
                Create Role
              </Button>
              </div>
            </div>
          </section>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 shadow-sm shadow-brand-orange/10">
                  <Sparkles className="h-5 w-5 text-brand-orange-deep" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Role Summary</h3>
                  <p className="mt-1 text-sm text-gray-500">A quick read of what will be created.</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Role Name</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{formData.name || 'Untitled role'}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Role Code</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{formData.code || 'not-set'}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Inheritance</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {roles.find((role) => role.id === formData.parent_role_id)?.name || 'Independent'}
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
                  Use inheritance when the new role is a small variation of an existing access pattern.
                </div>
                <div className="rounded-xl bg-brand-cyan/[0.05] px-4 py-3 ring-1 ring-brand-cyan/10">
                  Keep permission scope minimal so the role remains easy to audit and explain.
                </div>
                <div className="rounded-xl bg-brand-orange/[0.06] px-4 py-3 ring-1 ring-brand-orange/10">
                  Prefer clear names and codes that match how the team already refers to access levels.
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
      </div>
    </main>
  );
}
