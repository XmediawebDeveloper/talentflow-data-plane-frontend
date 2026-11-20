'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Shield } from 'lucide-react';
import { toast } from 'sonner';
import AppModal from '@/components/ui/app-modal';
import { Input } from '@/components/ui/input';
import FilterSelect from '@/components/ui/filter-select';
import rbacService from '@/lib/services/rbacService';
import { showErrorToast } from '@/lib/utils/errorToast';
import { withRequired, withoutOrphanEntryPoints, getAllCatalogCodes } from '@/lib/permissions/permissionRules';
import { ALWAYS_ON, copyBlockedReason, pruneAutoMap, type AutoMap } from '@/lib/permissions/moduleLevels';
import type { Role, RoleListItem } from '@/lib/types/rbac';
import RoleAccessEditor from './RoleAccessEditor';
import RoleAccessSummary from './RoleAccessSummary';
import RoleUserPicker, { type PickedUser } from './RoleUserPicker';
import RoleMembers from './RoleMembers';
import { useAuth } from '@/lib/hooks/useAuth';

export type RoleEditorMode = 'new' | 'edit' | 'dup' | 'view';

/** Codes loaded into the editor: catalogue part completed with what it needs,
 *  entry points without their main dropped; non-catalogue (legacy) codes kept. */
export const normalizeRoleCodes = (codes: Iterable<string>): Set<string> => {
  const catalog = new Set(getAllCatalogCodes());
  const all = Array.from(codes);
  const fromCatalog = withoutOrphanEntryPoints(withRequired(all.filter((c) => catalog.has(c))));
  return new Set([...fromCatalog, ...all.filter((c) => !catalog.has(c)), ...ALWAYS_ON]);
};

export const roleCodes = (role: RoleListItem | null | undefined): Set<string> =>
  normalizeRoleCodes(role?.permission_codes ?? []);

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && Array.from(a).every((x) => b.has(x));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const peopleCount = (n: number) => (n === 1 ? '1 person' : `${n} people`);
const slug = (name: string) =>
  `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'role'}_${Date.now().toString(36)}`;

export interface RoleEditorModalProps {
  open: boolean;
  mode: RoleEditorMode;
  /** The role to edit / duplicate / view (null for new). */
  role: RoleListItem | null;
  /** Every role in the tenant (Start from, name check). */
  roles: RoleListItem[];
  onClose: () => void;
  /** After a save. `created` is the new role for new / duplicate. */
  onSaved: (created?: Role) => void;
  /** View mode: switch to Edit (custom roles only, when allowed). */
  onEdit?: () => void;
  canEdit?: boolean;
  /** View mode: switch to Duplicate (any role, system ones included). */
  onDuplicate?: () => void;
  /** Why Duplicate is greyed (no permission, role limit); undefined = allowed. */
  duplicateDisabledReason?: string;
  /** Stacked over another popup (Edit User → New role from …). */
  zIndexClass?: string;
  /** The caller shows its own success message (e.g. "Save to assign it"). */
  quietSuccess?: boolean;
  /** View: people were given this role from the popup; refresh counts. */
  onPeopleChanged?: () => void;
}

/**
 * Create / Edit / Duplicate / View Role in one popup (prototype
 * RBAC-SIMPLE-ADVANCED-PROTOTYPE.html). Editing a role changes access for
 * everyone who has it, so a role with holders asks "Update access for N users?"
 * first, naming them.
 */
export default function RoleEditorModal({ open, mode, role, roles, onClose, onSaved, onEdit, canEdit = true, onDuplicate, duplicateDisabledReason, zIndexClass, quietSuccess = false, onPeopleChanged }: RoleEditorModalProps) {
  const startCodes = useMemo(() => (role ? roleCodes(role) : new Set<string>(ALWAYS_ON)), [role]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [codes, setCodes] = useState<Set<string>>(startCodes);
  // Areas switched on automatically ("Auto"), saved with the role.
  const [autoAreas, setAutoAreas] = useState<AutoMap>({});
  const [startFrom, setStartFrom] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Optional: people who get the new role straight away (Create / Duplicate).
  const [assignees, setAssignees] = useState<PickedUser[]>([]);
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canAssign = isTenantAdmin || hasPermissionCode('users:assign_role');
  const showAssign = (mode === 'new' || mode === 'dup') && !quietSuccess;
  const roleNames = useMemo(() => Object.fromEntries(roles.map((r) => [r.code.toLowerCase(), r.name])), [roles]);

  useEffect(() => {
    if (!open) return;
    setName(mode === 'dup' && role ? `${role.name} (COPY)` : mode === 'edit' && role ? role.name : '');
    setDescription(mode === 'edit' && role ? role.description ?? '' : mode === 'dup' && role ? role.description ?? '' : '');
    setCodes(startCodes);
    setAutoAreas(role && mode !== 'new' ? pruneAutoMap(startCodes, role.auto_enabled_areas) : {});
    setStartFrom('');
    setNameTouched(false);
    setConfirmOpen(false);
    setAssignees([]);
  }, [open, mode, role, startCodes]);

  const holders = mode === 'edit' && role ? role.user_count : 0;
  const trimmed = name.trim();
  const duplicateName = roles.some((r) => r.id !== (mode === 'edit' ? role?.id : -1) && r.name.trim().toLowerCase() === trimmed.toLowerCase());
  const nameError = !trimmed ? 'Enter a role name' : duplicateName ? 'A role with this name already exists' : '';

  if (mode === 'view' && role) {
    return (
      <AppModal
        open={open}
        onCancel={onClose}
        size="lg"
        icon={<Shield className="h-5 w-5" />}
        title={role.name}
        subtitle={role.is_system ? 'System role · read only' : 'Read only'}
        mobileSheet
        zIndexClass={zIndexClass}
        actions={[
          ...(onDuplicate ? [{
            label: 'Duplicate',
            variant: 'secondary' as const,
            onClick: () => onDuplicate(),
            locked: !!(duplicateDisabledReason || copyBlockedReason(role)),
            title: duplicateDisabledReason || copyBlockedReason(role),
          }] : []),
          ...(!role.is_system ? [{
            label: 'Edit Role',
            onClick: () => onEdit?.(),
            locked: !canEdit,
            title: canEdit ? undefined : 'You do not have permission to edit roles',
          }] : []),
        ]}
      >
        <RoleAccessSummary codes={roleCodes(role)} roleName={role.name} description={role.description} eyebrow={role.is_system ? 'System role' : 'Role'} auto={role.auto_enabled_areas} />
        <RoleMembers role={role} roleNames={roleNames} onChanged={onPeopleChanged} />
      </AppModal>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const { permissions } = await rbacService.getPermissionsCached();
      const idOf = new Map(permissions.map((p) => [p.code, p.id]));
      const permission_ids = Array.from(codes).map((c) => idOf.get(c)).filter((id): id is number => typeof id === 'number');
      if (mode === 'edit' && role) {
        const updated = await rbacService.updateRole(role.id, {
          name: trimmed, description: description.trim(), permission_ids,
          auto_enabled_areas: pruneAutoMap(codes, autoAreas),
        });
        const n = updated.affected_user_count ?? holders;
        toast.success(n ? `Role saved. Access updated for ${plural(n, 'user')}.` : 'Role saved');
        onSaved();
      } else {
        const created = await rbacService.createRole({
          name: trimmed,
          code: slug(trimmed),
          description: description.trim() || undefined,
          permission_ids,
          auto_enabled_areas: pruneAutoMap(codes, autoAreas),
        });
        // Give the new role to the people picked (one role per user, so this
        // replaces their current role). The role exists either way.
        const picked = showAssign && canAssign ? assignees : [];
        const results = await Promise.allSettled(
          picked.map((u) => rbacService.assignUserRoles(u.id, { role_ids: [created.id] })),
        );
        const failed = picked.filter((_, i) => results[i].status === 'rejected');
        const given = picked.length - failed.length;
        if (failed.length) {
          toast.warning(`Role "${created.name}" created${given ? ` and given to ${peopleCount(given)}` : ''}. Couldn't give it to ${failed.map((u) => u.name).join(', ')}; try again from User Management.`);
        } else if (!quietSuccess) {
          toast.success(given ? `Role "${created.name}" created and given to ${given === 1 ? picked[0].name : peopleCount(given)}` : `Role "${created.name}" created`);
        }
        onSaved(created);
      }
    } catch (error) {
      showErrorToast(error, "Couldn't save role");
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  const onPrimary = () => {
    setNameTouched(true);
    if (nameError) return;
    if (mode === 'edit' && role && holders > 0 && !sameSet(codes, startCodes)) {
      setConfirmOpen(true);
      return;
    }
    void save();
  };

  const title = { new: 'Create Role', edit: 'Edit Role', dup: 'Duplicate Role', view: '' }[mode];
  const subtitle = mode === 'edit'
    ? (holders ? `When you save, this changes access right away for the ${holders} ${holders === 1 ? 'person' : 'people'} with this role.` : 'Nobody has this role yet.')
    : mode === 'dup' && role
      ? `A copy of ${role.name}. Change what's different, then give it to people.`
      : 'Choose what people with this role can see and do.';
  const people = role?.holders ?? [];
  const named = people.slice(0, 4).map((p) => p.name);
  if (holders > named.length) named.push(`${holders - named.length} more`);

  return (
    <>
      <AppModal
        open={open}
        onCancel={() => { if (!saving) onClose(); }}
        cancelDisabled={saving}
        size="lg"
        mobileSheet
        zIndexClass={zIndexClass}
        icon={mode === 'dup' ? <Copy className="h-5 w-5" /> : mode === 'edit' ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        title={title}
        subtitle={subtitle}
        actions={[{ label: mode === 'edit' ? 'Save Changes' : 'Create Role', onClick: onPrimary, loading: saving, disabled: saving }]}
      >
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <div className="mb-4">
            <label className="mb-1.5 block text-[13px] font-medium text-gray-900 dark:text-slate-100" htmlFor="role-name">Role name</label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              placeholder="e.g. Hiring Manager"
              aria-invalid={nameTouched && !!nameError}
            />
            {nameTouched && nameError && <p className="mt-1.5 text-xs text-red-600">{nameError}</p>}
          </div>
          {mode === 'new' ? (
            <div className="mb-4">
              <label className="mb-1.5 block text-[13px] font-medium text-gray-900 dark:text-slate-100">Copy permissions from</label>
              <FilterSelect
                value={startFrom}
                onChange={(v: string) => {
                  setStartFrom(v);
                  const src = roles.find((r) => String(r.id) === v);
                  const nextCodes = src ? roleCodes(src) : new Set<string>(ALWAYS_ON);
                  setCodes(nextCodes);
                  setAutoAreas(src ? pruneAutoMap(nextCodes, src.auto_enabled_areas) : {});
                }}
                options={[{ value: '', label: "Don't copy (start with no access)" }, ...roles.filter((r) => !copyBlockedReason(r)).map((r) => ({ value: String(r.id), label: r.name }))]}
                ariaLabel="Copy permissions from"
                className="w-full sm:w-full data-[size=default]:h-9 sm:data-[size=default]:h-9 py-1 sm:py-1 px-3 sm:px-3 rounded-md sm:rounded-md border-input"
              />
            </div>
          ) : (
            <div className="mb-4">
              <label className="mb-1.5 block text-[13px] font-medium text-gray-900 dark:text-slate-100">People with this role</label>
              <Input value={String(holders)} disabled />
            </div>
          )}
          <div className="mb-4 sm:col-span-2">
            <label className="mb-1.5 block text-[13px] font-medium text-gray-900 dark:text-slate-100" htmlFor="role-desc">Description</label>
            <Input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this role for?" />
          </div>
          {showAssign && (
            <div className="mb-4 sm:col-span-2">
              <label className="mb-1.5 block text-[13px] font-medium text-gray-900 dark:text-slate-100">
                Give this role to <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <RoleUserPicker
                value={assignees}
                onChange={setAssignees}
                roleNames={roleNames}
                lockedReason={canAssign ? undefined : 'You do not have permission to assign roles'}
              />
              <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">
                {assignees.length
                  ? `When you create the role, ${assignees.length === 1 ? 'this person moves' : 'these people move'} to it from their current role.`
                  : 'You can also give it to people later in User Management.'}
              </p>
            </div>
          )}
        </div>
        <RoleAccessEditor codes={codes} onChange={setCodes} auto={autoAreas} onAutoChange={setAutoAreas} />
      </AppModal>
      <AppModal
        open={confirmOpen}
        onCancel={() => { if (!saving) setConfirmOpen(false); }}
        cancelDisabled={saving}
        size="sm"
        tone="warning"
        zIndexClass="z-[90]"
        title={`Update access for ${plural(holders, 'user')}?`}
        actions={[{ label: 'Update all', onClick: () => void save(), loading: saving, disabled: saving }]}
      >
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Everyone with the <b>{role?.name}</b> role gets the new access straight away
          {named.length ? <>: {named.join(', ')}</> : null}.
        </p>
        <p className="mt-3 text-sm text-gray-600 dark:text-slate-300">If only some of them should change, create a new role for those people instead.</p>
      </AppModal>
    </>
  );
}
