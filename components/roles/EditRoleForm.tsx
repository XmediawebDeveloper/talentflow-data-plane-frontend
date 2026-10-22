'use client';

import AppModal, { MODAL_FOOTER_BUTTON_CLASS, MODAL_FOOTER_ROW_CLASS } from '@/components/ui/app-modal';
import { Input } from '@/components/ui/input';
import PermissionTilesEditor from '@/components/roles/PermissionTilesEditor';
import { PermissionSectionsSkeleton } from '@/components/roles/PermissionSectionsView';
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Shield,
  Loader2,
  Lock,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { askTurnOnWithDependents, askUnlockEntryPoint, usePermissionChangeDialog } from '@/components/roles/PermissionChangeDialog';
import {
  forgetTurnOff,
  rememberTurnOff,
  TurnOffMemory,
  getAllCatalogCodes,
  labelOf,
  planTurnOff,
  planTurnOn,
  isGroupFullyOn,
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
  const [originalPermissionCodes, setOriginalPermissionCodes] = useState<Set<string>>(new Set());
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
          const loaded = normalizeRoleCodes(roleData.permissions.map((permission) => permission.code));
          setSelectedPermissionCodes(loaded);
          setOriginalPermissionCodes(loaded);
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
  // What each turn-off took with it, so turning it on again can restore it.
  const turnOffMemory = useRef<TurnOffMemory>(new Map());

  const applyTurnOn = async (codes: string[], label: string) => {
    const plan = planTurnOn(codes, selectedPermissionCodes);
    if (codes.length === 1 && plan.skippedLocked.includes(codes[0])) {
      // Locked entry point: offer to turn on its main (and what it needs).
      const next = await askUnlockEntryPoint(ask, codes[0], selectedPermissionCodes);
      if (next) setSelectedPermissionCodes(next);
      return;
    }
    // Something other sections depend on (View Job Description…): offer
    // [Only this] [Restore previous] [Turn on all].
    const withDeps = await askTurnOnWithDependents(ask, codes, label, selectedPermissionCodes, turnOffMemory.current);
    if (withDeps !== undefined) {
      if (withDeps) {
        forgetTurnOff(turnOffMemory.current, withDeps);
        setSelectedPermissionCodes(withDeps);
      }
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
        { heading: 'Can also be started from', codes: plan.offeredEntryPoints.flatMap((g) => g.entries) },
        { heading: 'Also turned on (needed)', codes: plan.autoRequired },
        { heading: 'Not turned on (their main permission is off)', codes: plan.skippedLocked },
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
    const turnedOn = choice === 'all' ? plan.all : plan.only;
    forgetTurnOff(turnOffMemory.current, turnedOn);
    setSelectedPermissionCodes(turnedOn);
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
      rememberTurnOff(turnOffMemory.current, codes, selectedPermissionCodes, next);
      setSelectedPermissionCodes(next);
      return;
    }
    const parts: string[] = [];
    if (plan.entryPointsOff.length) {
      parts.push(`${plan.entryPointsOff.length} permission${plan.entryPointsOff.length === 1 ? '' : 's'} from other modules`);
    }
    if (plan.dependentsOff.length) {
      parts.push(`${plan.dependentsOff.length} permission${plan.dependentsOff.length === 1 ? '' : 's'} that need${plan.dependentsOff.length === 1 ? 's' : ''} it`);
    }
    const choice = await ask({
      title: `Turn off "${label}"?`,
      tone: 'off',
      summary: `This will also turn off ${parts.join(' and ')}.`,
      details: [
        { heading: 'Permissions from other modules', codes: plan.entryPointsOff },
        { heading: 'Also turned off (they need it)', codes: plan.dependentsOff },
      ],
      actions: [{ id: 'off', label: 'Turn off', variant: 'destructive' }],
    });
    if (choice !== 'off') return;
    rememberTurnOff(turnOffMemory.current, codes, selectedPermissionCodes, next);
    setSelectedPermissionCodes(next);
  };

  const handlePermissionToggle = (code: string) => {
    if (selectedPermissionCodes.has(code)) {
      void applyTurnOff([code], labelOf(code));
    } else {
      void applyTurnOn([code], labelOf(code));
    }
  };

  // Section / sub-section checkbox: everything selected -> turn ALL off;
  // anything less (none or some) -> turn ALL on. Entry points whose main is
  // off can't be selected, so they don't block "everything selected".
  const handleSelectAllGroup = (codes: string[], label: string) => {
    if (isGroupFullyOn(codes, selectedPermissionCodes)) {
      void applyTurnOff(codes, label);
    } else {
      void applyTurnOn(codes.filter((code) => !selectedPermissionCodes.has(code)), label);
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

  const renderPermissionCategories = () => {
    const allCodes = getAllCustomPermissionCodes();
    const allSelected = allCodes.every((code) => selectedPermissionCodes.has(code));
    const activeCount = allCodes.filter((code) => selectedPermissionCodes.has(code)).length;

    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400">
            <Shield className="h-3.5 w-3.5 text-brand-blue" />
            Permissions
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleSelectAll} className="min-w-[96px]">
              {allSelected ? 'Deselect all' : 'Select all'}
            </Button>
            <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-semibold text-brand-blue ring-1 ring-brand-blue/20">
              {activeCount} active
            </span>
          </div>
        </div>
        <PermissionTilesEditor
          selected={selectedPermissionCodes}
          onToggleCode={handlePermissionToggle}
          onToggleGroup={handleSelectAllGroup}
        />
      </div>
    );
  };

  // Opened from Role Management: a popup laid out like Edit User (no side panel).
  if (embedded) {
    const hasUnsaved = selectedPermissionCodes.size !== originalPermissionCodes.size
      || Array.from(selectedPermissionCodes).some((c) => !originalPermissionCodes.has(c));
    return (
      <>
        {dialog}
        <AppModal
          open
          size="lg"
          zIndexClass="z-50"
          onCancel={handleClose}
          cancelDisabled={isSaving}
          icon={<Shield />}
          title="Edit Role"
          subtitle={role?.name}
          headerExtra={role?.is_system ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/25">
              <Lock className="h-3 w-3" /> System role
            </span>
          ) : undefined}
          footerStart={hasUnsaved ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-brand-orange">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-orange" />
              Unsaved changes
            </span>
          ) : undefined}
          actions={[
            {
              label: 'Save Changes',
              onClick: handleSubmit,
              disabled: isSaving || isLoading || !role,
              icon: isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined,
            },
          ]}
        >
          {isLoading || !role ? (
            <PermissionSectionsSkeleton sections={3} Skeleton={Skeleton} />
          ) : (
            <div className="space-y-4 sm:space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Role Name</label>
                  <Input
                    value={role.name}
                    onChange={(e) => setRole({ ...role, name: e.target.value.toUpperCase() })}
                    onBlur={() => setNameTouched(true)}
                    aria-invalid={!!showNameError}
                    disabled={role.is_system}
                  />
                  {showNameError && <span className="mt-1.5 block text-xs font-medium text-destructive">{nameError}</span>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Role Code</label>
                  <Input value={role.code} disabled />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Description</label>
                  <Input
                    value={role.description || ''}
                    onChange={(e) => setRole({ ...role, description: e.target.value })}
                    placeholder="What this role is for"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Copy permissions from</label>
                  <select
                    value={role.parent_role_id || ''}
                    onChange={(e) => handleParentRoleChange(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/40 focus:ring-2 focus:ring-brand-blue/20"
                  >
                    <option value="">None</option>
                    {roles.filter((r) => r.id !== role.id).map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                  </select>
                </div>
              </div>
              {renderPermissionCategories()}
            </div>
          )}
        </AppModal>
      </>
    );
  }

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
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange/10 px-2.5 py-1 text-xs font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
                  <Lock className="h-3 w-3" />
                  System role
                </span>
              )}
              <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
                <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                  <div className="text-xs text-gray-500">Assigned users</div>
                  <div className="mt-1 text-xl font-semibold text-gray-900">{role.user_count || 0}</div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                  <div className="text-xs text-gray-500">Selected permissions</div>
                  <div className="mt-1 text-xl font-semibold text-gray-900">{selectedPermissionCodes.size}</div>
                </div>
              </div>
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-gray-900">Role Details</h2>
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
                  <h3 className="text-base font-semibold text-gray-900">Permissions</h3>
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
