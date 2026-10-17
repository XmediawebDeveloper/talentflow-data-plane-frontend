'use client';

import { MODAL_FOOTER_BUTTON_CLASS, MODAL_FOOTER_ROW_CLASS } from '@/components/ui/app-modal';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Shield,
  Loader2,
  Check,
  Lock,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermissionChangeDialog } from '@/components/roles/PermissionChangeDialog';
import {
  getAllCatalogCodes,
  getNeeds,
  isEntryPointLocked,
  labelOf,
  planTurnOff,
  planTurnOn,
  withRequired,
  withoutOrphanEntryPoints,
} from '@/lib/permissions/permissionRules';
import rbacService from '@/lib/services/rbacService';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Permission,
  Role,
  RoleListItem,
} from '@/lib/types/rbac';
import {
  CUSTOM_PERMISSION_CATEGORIES,
  getMainPermission,
  type CustomPermissionCategory,
  type CustomPermissionSubCategory,
} from '@/lib/constants/permissionCategories';

/** Codes loaded into the editor (existing role / "Copy permissions from"): the
 *  catalogue part is completed with what it needs and stripped of entry points
 *  whose main is off, so the form never shows an entry point it can't use.
 *  Codes with no tile (legacy) are kept untouched so a save doesn't drop them. */
const normalizeRoleCodes = (codes: Iterable<string>): Set<string> => {
  const catalog = new Set(getAllCatalogCodes());
  const all = Array.from(codes);
  const fromCatalog = withoutOrphanEntryPoints(withRequired(all.filter((c) => catalog.has(c))));
  return new Set([...fromCatalog, ...all.filter((c) => !catalog.has(c))]);
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

// Same field, in its invalid state — a full replacement rather than extra classes
// appended to `fieldClassName`, so the red border/ring can't lose a Tailwind
// specificity tie against the gray/blue ones it replaces.
const fieldErrorClassName =
  'w-full rounded-xl border border-destructive-line bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-destructive-line focus:ring-4 focus:ring-destructive-line disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500';

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
  /** When rendered inside a side panel/modal instead of as a full page. */
  embedded?: boolean;
  /** Called after a successful update (panel host closes + refreshes). */
  onSuccess?: () => void;
  /** Called on cancel/back or unrecoverable load error (panel host closes). */
  onCancel?: () => void;
}

export default function EditRoleForm({ roleId, embedded = false, onSuccess, onCancel }: EditRoleFormProps) {
  const router = useRouter();
  const handleClose = onCancel ?? (() => router.push('/organization/role-management'));
  const [role, setRole] = useState<Role | null>(null);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState<Set<string>>(new Set());
  // Compact confirm popup for cascading permission changes (shared with Edit User).
  const { ask, dialog } = usePermissionChangeDialog();
  // Set once the editable Role Name field is left, so its error shows the
  // moment it's touched (and updates live as they type) rather than only after
  // Save. Role Code is immutable here, so only the name needs validating.
  const [nameTouched, setNameTouched] = useState(false);

  // Derived required-name error — only for editable roles (a system role's name
  // is locked). Recomputed each render so a touched field tracks its value live.
  const nameError = role && !role.is_system && !role.name.trim() ? 'Role name is required' : '';
  const showNameError = nameTouched ? nameError : '';

  useEffect(() => {
    if (!roleId || isNaN(roleId) || roleId <= 0) {
      toast.error('Invalid role ID');
      handleClose();
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
          setSelectedPermissionCodes(normalizeRoleCodes(roleData.permissions.map((permission) => permission.code)));
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
        handleClose();
      } finally {
        setIsLoading(false);
      }
    };

    void run();
    // handleClose is intentionally omitted: it closes over the stable setEditingRole
    // (via onCancel) and re-adding the inline onCancel would re-run this loader every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Same rules as Edit User (lib/permissions/permissionRules.ts): needs are
  // turned on with a permission, a main offers its entry points, turning off
  // cascades with a confirm, and entry points are locked while their main is off.
  const applyTurnOn = async (codes: string[], label: string) => {
    const plan = planTurnOn(codes, selectedPermissionCodes);
    if (codes.length === 1 && plan.skippedLocked.includes(codes[0])) {
      const main = getMainPermission(codes[0]);
      toast.info(`Turn on "${labelOf(main ?? '')}" first — "${labelOf(codes[0])}" can only be used while it is on.`);
      return;
    }
    const entryCount = plan.offeredEntryPoints.reduce((n, g) => n + g.entries.length, 0);
    const needAsk = entryCount > 0 || (codes.length > 1 && plan.skippedLocked.length > 0);
    if (!needAsk) {
      setSelectedPermissionCodes(plan.only);
      if (plan.autoRequired.length > 0) {
        toast.info(`Also turned on: ${plan.autoRequired.map(labelOf).join(', ')} — needed by "${label}"`);
      }
      return;
    }
    const summary =
      entryCount === 0
        ? 'Some permissions here can only be turned on after their main permission in another section.'
        : plan.offeredEntryPoints.length === 1
          ? `"${labelOf(plan.offeredEntryPoints[0].main)}" can also be started from ${entryCount} other section${entryCount === 1 ? '' : 's'}. Turn those on too?`
          : `${plan.offeredEntryPoints.length} of these permissions can also be started from other sections (${entryCount} places). Turn those on too?`;
    const choice = await ask({
      title: `Turn on "${label}"?`,
      tone: 'on',
      summary,
      details: [
        { heading: 'Can also be started from', items: plan.offeredEntryPoints.flatMap((g) => g.entries.map(labelOf)) },
        { heading: 'Also turned on (needed)', items: plan.autoRequired.map(labelOf) },
        { heading: 'Not turned on (their main permission is off)', items: plan.skippedLocked.map(labelOf) },
      ],
      actions:
        entryCount === 0
          ? [{ id: 'only', label: 'Turn on' }]
          : [
              { id: 'only', label: 'Only this', variant: 'secondary' },
              { id: 'all', label: 'Turn on all' },
            ],
    });
    if (!choice) return;
    setSelectedPermissionCodes(choice === 'all' ? plan.all : plan.only);
  };

  const applyTurnOff = async (codes: string[], label: string) => {
    const plan = planTurnOff(codes, selectedPermissionCodes);
    let next = plan.next;
    // A section's View goes with its last action (as before) — but only when
    // nothing else still needs that View.
    codes.forEach((code) => {
      const found = findCategoryForAction(code);
      if (!found) return;
      const viewCode = found.subCategory?.viewCode || found.category.viewCode;
      if (!viewCode || !next.has(viewCode) || hasAnyActionSelected(next, found.category, found.subCategory)) return;
      const trial = planTurnOff([viewCode], next);
      if (trial.entryPointsOff.length === 0 && trial.dependentsOff.length === 0) next = trial.next;
    });
    const extra = plan.entryPointsOff.length + plan.dependentsOff.length;
    if (extra === 0) {
      setSelectedPermissionCodes(next);
      return;
    }
    const parts: string[] = [];
    if (plan.entryPointsOff.length) {
      parts.push(`${plan.entryPointsOff.length} entry point${plan.entryPointsOff.length === 1 ? '' : 's'} in other sections`);
    }
    if (plan.dependentsOff.length) {
      parts.push(`${plan.dependentsOff.length} other permission${plan.dependentsOff.length === 1 ? '' : 's'} that need${plan.dependentsOff.length === 1 ? 's' : ''} it`);
    }
    const choice = await ask({
      title: `Turn off "${label}"?`,
      tone: 'off',
      summary: `This will also turn off ${parts.join(' and ')}.`,
      details: [
        { heading: 'Entry points in other sections', items: plan.entryPointsOff.map(labelOf) },
        { heading: 'Also turned off (they need it)', items: plan.dependentsOff.map(labelOf) },
      ],
      actions: [{ id: 'off', label: 'Turn off', variant: 'destructive' }],
    });
    if (choice !== 'off') return;
    setSelectedPermissionCodes(next);
  };

  const handlePermissionToggle = (code: string) => {
    if (selectedPermissionCodes.has(code)) {
      void applyTurnOff([code], labelOf(code));
    } else {
      void applyTurnOn([code], labelOf(code));
    }
  };

  const handleSelectAll = () => {
    const allCodes = getAllCustomPermissionCodes();
    const allSelected = allCodes.every((code) => selectedPermissionCodes.has(code));
    setSelectedPermissionCodes(allSelected ? new Set() : withRequired(allCodes));
  };

  const handleParentRoleChange = async (parentRoleId: string) => {
    if (!role) return;

    const nextParentRoleId = parentRoleId ? parseInt(parentRoleId, 10) : undefined;
    setRole({ ...role, parent_role_id: nextParentRoleId });

    if (nextParentRoleId) {
      try {
        const parentRole = await rbacService.getRoleById(nextParentRoleId);
        if (parentRole.permissions) {
          const codes = normalizeRoleCodes(parentRole.permissions.map((permission) => permission.code));
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
    if (nameError) {
      // Reveal the inline message and stop instead of letting the backend reject it.
      setNameTouched(true);
      return;
    }

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
      if (onSuccess) { onSuccess(); } else { router.push('/organization/role-management'); }
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
  ) => {
    // Entry point whose main permission is off: greyed out with a lock; clicking
    // explains which main to turn on first (handled by applyTurnOn).
    const mainCode = getMainPermission(code);
    const locked = !isSelected && isEntryPointLocked(code, selectedPermissionCodes);
    if (locked) {
      return (
        <button
          key={code}
          type="button"
          onClick={onClick}
          aria-disabled
          title={`Turn on "${labelOf(mainCode ?? '')}" first`}
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-400"
        >
          <Lock className="h-3.5 w-3.5" />
          <span>{label}</span>
        </button>
      );
    }
    return (
    <button
      key={code}
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
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
  };

  const renderPermissionCategories = () => {
    const allCodes = getAllCustomPermissionCodes();
    const allSelected = allCodes.every((code) => selectedPermissionCodes.has(code));
    const someSelected = selectedPermissionCodes.size > 0 && !allSelected;

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 ring-1 ring-black/[0.02]">
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

        {CUSTOM_PERMISSION_CATEGORIES.map((category) => (
          <section
            key={category.id}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-black/[0.02]"
          >
            <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
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

            <div className="space-y-5 p-4 sm:p-5">
              {category.actions && (
                <div className="flex flex-wrap gap-2">
                  {category.viewCode && selectedPermissionCodes.has(category.viewCode) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-1 text-2xs font-medium text-brand-teal ring-1 ring-brand-teal/15">
                      <Check className="h-3 w-3" />
                      View enabled
                    </span>
                  )}
                  {category.actions.map((action) =>
                    renderPermissionPill(
                      action.code,
                      action.label,
                      selectedPermissionCodes.has(action.code),
                      getNeeds(action.code).length > 0,
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
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-1 text-2xs font-medium text-brand-teal ring-1 ring-brand-teal/15">
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
                            getNeeds(action.code).length > 0,
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
    // Skeleton mirroring the role editor: gradient hero, the Role Details form
    // card (Name/Code, Description, Copy permissions from, Permissions) and the
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
      {dialog}
      <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-[1400px]'}>
      <div className={embedded ? 'w-full' : 'p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl'}>
        {!embedded && (
          <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Role Management', href: '/organization/role-management' }, { label: 'Edit Role' }]} />
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
          title="Edit Role"
          description="Update role details and permission coverage while preserving the same design system and workflow cues used across the dashboard."
          actions={
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {role.is_system && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange/10 px-2.5 py-1 text-2xs font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
                  <Lock className="h-3 w-3" />
                  System role
                </span>
              )}
              <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
                <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                  <div className="text-xs text-gray-500">Assigned users</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{role.user_count || 0}</div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                  <div className="text-xs text-gray-500">Selected permissions</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{selectedPermissionCodes.size}</div>
                </div>
              </div>
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
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
                    onChange={(e) => setRole({ ...role, name: e.target.value.toUpperCase() })}
                    onBlur={() => setNameTouched(true)}
                    aria-invalid={!!showNameError}
                    className={showNameError ? fieldErrorClassName : fieldClassName}
                    disabled={role.is_system}
                  />
                  {showNameError && (
                    <span className="mt-1.5 block text-xs font-medium text-destructive">{nameError}</span>
                  )}
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
                  <span className="mb-2 block text-sm font-medium text-gray-700">Copy permissions from</span>
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
                  <span className="mt-2 block text-xs text-gray-500">Replaces this role&apos;s current permissions with a copy of that role&apos;s. Later changes to that role won&apos;t affect this one.</span>
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
                Save Changes
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
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Copied from</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {roles.find((roleOption) => roleOption.id === role.parent_role_id)?.name || 'None'}
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
      </div>
    </main>
  );
}
