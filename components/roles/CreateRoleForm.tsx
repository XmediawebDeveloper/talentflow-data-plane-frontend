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
  Sparkles,
  ArrowUpRight,
  Loader2,
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
  'w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm max-sm:text-[13px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10';

// Same field, in its invalid state — a full replacement rather than extra classes
// appended to `fieldClassName`, so the red border/ring can't lose a Tailwind
// specificity tie against the gray/blue ones it replaces.
const fieldErrorClassName =
  'w-full rounded-lg border border-destructive-line bg-white px-4 py-3 text-sm max-sm:text-[13px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-destructive-line focus:ring-4 focus:ring-destructive-line';

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
  // Compact confirm popup for cascading permission changes (shared with Edit User).
  const { ask, dialog } = usePermissionChangeDialog();
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

  const handleSelectAll = () => {
    const allCodes = getAllCustomPermissionCodes();
    const allSelected = allCodes.every((code) => selectedPermissionCodes.has(code));
    setSelectedPermissionCodes(allSelected ? new Set() : withRequired(allCodes));
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

  const handleParentRoleChange = async (parentRoleId: string) => {
    const roleId = parentRoleId ? parseInt(parentRoleId, 10) : undefined;
    setFormData((prev) => ({ ...prev, parent_role_id: roleId }));

    if (roleId) {
      try {
        const parentRole = await rbacService.getRoleById(roleId);
        if (parentRole.permissions) {
          const codes = normalizeRoleCodes(parentRole.permissions.map((permission) => permission.code));
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
    return (
      <>
        {dialog}
        <AppModal
          open
          size="lg"
          mobileSheet
          zIndexClass="z-50"
          onCancel={handleClose}
          cancelDisabled={isSaving}
          icon={<Shield />}
          title="Create Role"
          subtitle="Name the role, then choose its permissions"
          actions={[
            {
              label: 'Create Role',
              onClick: handleSubmit,
              disabled: isSaving || isLoading,
              icon: isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined,
            },
          ]}
        >
          <div className="space-y-4 sm:space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div>
                <label className="block text-sm max-sm:text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-1.5">Role Name <span className="text-brand-orange">*</span></label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                  onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                  placeholder="e.g. SENIOR RECRUITER"
                  aria-invalid={!!showError('name')}
                />
                {showError('name') && <span className="mt-1.5 block text-xs font-medium text-destructive">{fieldErrors.name}</span>}
              </div>
              <div>
                <label className="block text-sm max-sm:text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-1.5">Role Code <span className="text-brand-orange">*</span></label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  onBlur={() => setTouched((prev) => ({ ...prev, code: true }))}
                  placeholder="e.g. senior_recruiter"
                  aria-invalid={!!showError('code')}
                />
                {showError('code') && <span className="mt-1.5 block text-xs font-medium text-destructive">{fieldErrors.code}</span>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div>
                <label className="block text-sm max-sm:text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-1.5">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What this role is for"
                />
              </div>
              <div>
                <label className="block text-sm max-sm:text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-1.5">Copy permissions from</label>
                <select
                  value={formData.parent_role_id || ''}
                  onChange={(e) => handleParentRoleChange(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm max-sm:text-[13px] text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/40 focus:ring-2 focus:ring-brand-blue/20"
                >
                  <option value="">None</option>
                  {roles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
              </div>
            </div>
            {isLoading ? <PermissionSectionsSkeleton sections={3} Skeleton={Skeleton} /> : renderPermissionCategories()}
          </div>
        </AppModal>
      </>
    );
  }

  if (isLoading) {
    // Skeleton mirroring the role builder: gradient hero, the Role Details form
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
          <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Role Management', href: '/organization/role-management' }, { label: 'Create Role' }]} />
        )}
        {!embedded && (
          <button
            onClick={handleClose}
            className="mb-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm max-sm:text-[13px] font-medium text-gray-600 transition-colors hover:bg-white hover:text-brand-blue"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Role Management
          </button>
        )}

        <PageHeader
          icon={<Shield className="h-5 w-5" />}
          title="Create New Role"
          description="Define a role that fits your dashboard's access model, including inheritance and detailed feature permissions."
          actions={
            <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
              <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                <div className="text-xs text-gray-500">Available roles</div>
                <div className="mt-1 text-xl max-sm:text-lg font-semibold text-gray-900">{roles.length}</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                <div className="text-xs text-gray-500">Selected permissions</div>
                <div className="mt-1 text-xl max-sm:text-lg font-semibold text-gray-900">{selectedPermissionCodes.size}</div>
              </div>
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
              <h2 className="text-base max-sm:text-sm font-semibold text-gray-900">Role Details</h2>
              <p className="text-sm max-sm:text-[13px] text-gray-500">Start with the role identity, then configure the access surface below.</p>
            </div>

            <div className="space-y-8 p-5 sm:p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm max-sm:text-[13px] font-medium text-gray-700">
                    Role Name <span className="text-brand-orange">*</span>
                  </span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                    onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                    placeholder="e.g. SENIOR RECRUITER"
                    aria-invalid={!!showError('name')}
                    className={showError('name') ? fieldErrorClassName : fieldClassName}
                  />
                  {showError('name') && (
                    <span className="mt-1.5 block text-xs font-medium text-destructive">{fieldErrors.name}</span>
                  )}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm max-sm:text-[13px] font-medium text-gray-700">
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
                <span className="mb-2 block text-sm max-sm:text-[13px] font-medium text-gray-700">Description</span>
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
                  <span className="mb-2 block text-sm max-sm:text-[13px] font-medium text-gray-700">Copy permissions from</span>
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
                  <span className="mt-2 block text-xs text-gray-500">Copies that role&apos;s permissions into this role as a starting point. Later changes to that role won&apos;t affect this one.</span>
                </label>
              </div>

              <div>
                <div className="mb-4">
                  <h3 className="text-base max-sm:text-sm font-semibold text-gray-900">Permissions</h3>
                  <p className="text-sm max-sm:text-[13px] text-gray-500">Choose only what this role needs. View access will be carried automatically where required.</p>
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
                  <h3 className="text-base max-sm:text-sm font-semibold text-gray-900">Role Summary</h3>
                  <p className="mt-1 text-sm max-sm:text-[13px] text-gray-500">A quick read of what will be created.</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Role Name</div>
                  <div className="mt-1 text-sm max-sm:text-[13px] font-semibold text-gray-900">{formData.name || 'Untitled role'}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Role Code</div>
                  <div className="mt-1 text-sm max-sm:text-[13px] font-semibold text-gray-900">{formData.code || 'not-set'}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Copied from</div>
                  <div className="mt-1 text-sm max-sm:text-[13px] font-semibold text-gray-900">
                    {roles.find((role) => role.id === formData.parent_role_id)?.name || 'None'}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-400">Selected Permissions</div>
                  <div className="mt-1 text-sm max-sm:text-[13px] font-semibold text-gray-900">{selectedPermissionCodes.size}</div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
              <h3 className="text-base max-sm:text-sm font-semibold text-gray-900">Guidance</h3>
              <div className="mt-4 space-y-3 text-sm max-sm:text-[13px] text-gray-600">
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
