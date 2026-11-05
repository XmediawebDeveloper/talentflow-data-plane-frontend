'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, History, Loader2, Lock, Pencil, Plus, Search, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import AppModal from '@/components/ui/app-modal';
import { formatIST } from '@/lib/utils/dateUtils';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import authService from '@/lib/services/authService';
import rbacService from '@/lib/services/rbacService';
import { accessCounts, LEVEL_NAMES } from '@/lib/permissions/moduleLevels';
import type { AuditLogEntry, RoleListItem } from '@/lib/types/rbac';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { useAuth } from '@/lib/hooks/useAuth';
import RoleEditorModal, { roleCodes, type RoleEditorMode } from './access/RoleEditorModal';
import { AccessDot, AccessInline, AccessLegend } from './access/AccessDots';

type TabType = 'roles' | 'audit';

/** Fallback when an older backend does not send role_limit (system roles count). */
const DEFAULT_ROLE_LIMIT = 25;

const NO_MANAGE_PERMISSION = 'You do not have permission to manage roles';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
};

const getActionBadgeClass = (action: string) => {
  if (action.includes('create')) {
    return 'bg-brand-teal/15 text-brand-teal border border-brand-teal/20';
  }
  if (action.includes('delete')) {
    return 'bg-brand-orange/15 text-brand-orange-deep border border-brand-orange/20';
  }
  return 'bg-brand-blue/10 text-brand-blue border border-brand-blue/15';
};

/**
 * Borderless icon action on a role card. Greyed, never hidden: when `disabledReason`
 * is set the button stays rendered (aria-disabled, tooltip, no-op click).
 */
function CardAction({
  label,
  icon,
  onClick,
  disabledReason,
  danger = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabledReason?: string;
  danger?: boolean;
}) {
  const disabled = !!disabledReason;
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      title={disabledReason ?? label}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors dark:text-slate-400 [&_svg]:h-4 [&_svg]:w-4 ${
        disabled
          ? 'cursor-not-allowed opacity-35'
          : danger
            ? 'hover:bg-destructive/[0.08] hover:text-destructive'
            : 'hover:bg-brand-blue/[0.06] hover:text-brand-blue dark:hover:bg-slate-800'
      }`}
    >
      {icon}
    </button>
  );
}

export default function RoleManagement() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  // Route access only requires view rights (canViewRoles); mutating actions
  // (create/edit/duplicate/delete) additionally require the manage permission.
  // Without it they stay visible but greyed (RBAC: grey out, never hide).
  const canManageRoles = hasPermission('canManagePermissionsRoles');
  const [activeTab, setActiveTab] = useState<TabType>('roles');
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [roleLimit, setRoleLimit] = useState(DEFAULT_ROLE_LIMIT);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // One popup for View / Edit / Duplicate / Create (components/roles/access).
  const [editor, setEditor] = useState<{ mode: RoleEditorMode; role: RoleListItem | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rootRef = useScrollRestoration<HTMLDivElement>('org-role-management', !isLoading, [activeTab]);
  useListStatePersistence(
    'org-role-management',
    { activeTab, searchQuery },
    (s) => {
      if (s.activeTab === 'roles' || s.activeTab === 'audit') setActiveTab(s.activeTab as TabType);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
    },
  );

  useEffect(() => {
    const checkPermission = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        const hasPermission = currentUser.role === 'tenant_admin' || currentUser.permissions?.can_manage_users;

        if (!hasPermission) {
          toast.error('You do not have permission to access Role Management');
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Permission check failed:', error);
        router.push('/dashboard');
      }
    };

    checkPermission();
  }, [router]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await rbacService.getRoles();
      setRoles(data.roles);
      if (typeof data.role_limit === 'number' && data.role_limit > 0) setRoleLimit(data.role_limit);
    } catch (error) {
      console.error('Failed to load roles:', error);
      toast.error(friendlyErrorMessage(error, 'Failed to load roles'));
      setRoles([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadAuditLogs = async () => {
    try {
      const data = await rbacService.getAuditLogs({ page: 1, page_size: 50 });
      setAuditLogs(data.logs);
    } catch (error) {
      console.warn('Failed to load audit logs:', error);
      setAuditLogs([]);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab]);

  const atLimit = roles.length >= roleLimit;
  const limitReason = `Role limit reached (${roleLimit}). Delete an unused role first.`;

  const filteredRoles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((role) => `${role.name} ${role.description ?? ''}`.toLowerCase().includes(q));
  }, [roles, searchQuery]);

  // Disabled reasons (undefined = allowed). Permission first, then the role rule.
  const createReason = !canManageRoles ? 'You do not have permission to create roles' : atLimit ? limitReason : undefined;
  const editReason = (role: RoleListItem) =>
    !canManageRoles
      ? 'You do not have permission to edit roles'
      : role.is_system
        ? 'System role: cannot be edited. Duplicate it to make a copy you can change.'
        : undefined;
  const duplicateReason = () =>
    !canManageRoles ? 'You do not have permission to duplicate roles' : atLimit ? limitReason : undefined;
  const deleteReason = (role: RoleListItem) =>
    !canManageRoles
      ? 'You do not have permission to delete roles'
      : role.is_system
        ? 'System roles cannot be deleted'
        : role.user_count > 0
          ? `${plural(role.user_count, 'user')} still ${role.user_count === 1 ? 'has' : 'have'} this role. Move them to another role first.`
          : undefined;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await rbacService.deleteRole(deleteTarget.id);
      toast.success(`Role "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete role:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't delete the role. Please try again."));
    } finally {
      setDeleting(false);
    }
  };

  const getAuditActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      role_create: 'Role Created',
      role_created: 'Role Created',
      role_update: 'Role Updated',
      role_updated: 'Role Updated',
      role_delete: 'Role Deleted',
      role_deleted: 'Role Deleted',
      user_role_change: 'User Roles Changed',
      user_roles_updated: 'User Roles Changed',
      permission_update: 'Permission Updated',
    };
    return labels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const formatAuditChanges = (action: string, changes: Record<string, unknown> | undefined) => {
    if (!changes) return null;

    if (action === 'role_create' || action === 'role_created') {
      const roleName = changes.role_name as string;
      const permCount = (changes.permissions as number[])?.length || 0;
      return (
        <div className="space-y-1">
          <div className="tf-body">
            <span className="font-medium text-gray-900 dark:text-slate-50">Role:</span> {roleName}
          </div>
          {permCount > 0 && (
            <div className="tf-meta">
              {permCount} permission{permCount !== 1 ? 's' : ''} assigned
            </div>
          )}
        </div>
      );
    }

    if (action === 'role_delete' || action === 'role_deleted') {
      const roleName = changes.role_name as string;
      const roleCode = changes.role_code as string;
      return (
        <div className="space-y-1">
          <div className="tf-body">
            <span className="font-medium text-gray-900 dark:text-slate-50">Deleted:</span> {roleName}
          </div>
          {roleCode && (
            <div className="tf-meta">Code: {roleCode}</div>
          )}
        </div>
      );
    }

    if (action === 'role_update' || action === 'role_updated') {
      const changesData = changes.changes as Record<string, { from: unknown; to: unknown }> | undefined;
      if (!changesData) {
        return <span className="tf-body-muted">Settings updated</span>;
      }

      return (
        <div className="space-y-1">
          {Object.entries(changesData).map(([field, change]) => {
            if (field === 'permissions') {
              const fromCount = Array.isArray(change.from) ? change.from.length : 0;
              const toCount = Array.isArray(change.to) ? change.to.length : 0;
              return (
                <div key={field} className="tf-meta">
                  <span className="font-medium text-gray-900 dark:text-slate-50">Permissions:</span> {fromCount} to {toCount}
                </div>
              );
            }

            return (
              <div key={field} className="tf-meta">
                <span className="font-medium capitalize text-gray-900 dark:text-slate-50">{field.replace(/_/g, ' ')}:</span>{' '}
                <span className="text-gray-400 dark:text-slate-500">{String(change.from || '-')}</span>
                <span className="mx-1 text-gray-400 dark:text-slate-500">to</span>
                <span className="text-gray-700 dark:text-slate-300">{String(change.to || '-')}</span>
              </div>
            );
          })}
        </div>
      );
    }

    if (action === 'user_role_change' || action === 'user_roles_updated') {
      const oldRoles = changes.old_roles as string[] | undefined;
      const newRoles = changes.new_roles as string[] | undefined;
      return (
        <div className="space-y-1">
          {oldRoles && oldRoles.length > 0 && (
            <div className="tf-meta">
              <span className="font-medium text-gray-900 dark:text-slate-50">From:</span> {oldRoles.join(', ') || 'None'}
            </div>
          )}
          {newRoles && (
            <div className="tf-meta">
              <span className="font-medium text-gray-900 dark:text-slate-50">To:</span> {newRoles.join(', ') || 'None'}
            </div>
          )}
        </div>
      );
    }

    return (
      <span className="tf-meta">
        {Object.keys(changes).length} field{Object.keys(changes).length !== 1 ? 's' : ''} modified
      </span>
    );
  };

  return (
    // Card, breadcrumb, organization tabs and the tab panel come from
    // app/(dashboard)/organization/layout.tsx — this renders the panel's content.
    <div ref={rootRef}>
        <PageHeader
          icon={<Shield className="h-5 w-5" />}
          title="Role Management"
          // Hidden on phones — the title is enough there and the line costs rows.
          description={<span className="hidden sm:inline">A role decides what people can do. Changing a role changes it for everyone who has that role.</span>}
          actions={
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Roles / Activity Log — the sliding white-tile toggle from
                  Resume Scoring's "View by" (same track, tile, size). Shorter
                  on phones so it shares one row with Create Role. */}
              <div
                role="radiogroup"
                aria-label="Role management view"
                className="relative grid grid-cols-2 h-9 sm:h-9 p-1 rounded-lg bg-brand-blue/5 ring-1 ring-brand-blue/10"
              >
                <span
                  aria-hidden
                  className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-white dark:bg-slate-800 shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out ${
                    activeTab === 'audit' ? 'translate-x-full' : 'translate-x-0'
                  }`}
                />
                {([
                  { id: 'roles', label: 'Roles', short: 'Roles', icon: Shield },
                  { id: 'audit', label: 'Activity Log', short: 'Activity', icon: History },
                ] as const).map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative z-10 inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors duration-300 ${
                        isActive ? 'text-brand-blue' : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="sm:hidden">{tab.short}</span>
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  if (createReason) return;
                  setEditor({ mode: 'new', role: null });
                }}
                aria-disabled={!!createReason || undefined}
                title={createReason ?? ''}
                icon={<Plus className="h-4 w-4" />}
                className={`max-sm:h-9 max-sm:px-3 max-sm:text-xs ${createReason ? 'cursor-not-allowed opacity-35' : ''}`}
              >
                <span className="sm:hidden">Create</span>
                <span className="hidden sm:inline">Create Role</span>
              </Button>
            </div>
          }
        />

        {activeTab === 'roles' && (
          <>
            {/* Toolbar: search, how many of the role limit are used, dot legend. */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  aria-label="Search roles"
                  type="text"
                  placeholder="Search roles"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="tf-input pl-10 pr-4 focus-visible:!outline-none"
                />
              </div>
              <span className={`text-xs ${atLimit ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-slate-400'}`}>
                {isLoading ? '…' : roles.length} of {roleLimit} roles used
              </span>
              <AccessLegend className="sm:ml-auto" />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20 tf-loader-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="tf-card-soft px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                  <Shield className="h-6 w-6 text-brand-blue" />
                </div>
                <h3 className="tf-section-title max-sm:text-sm">No roles match</h3>
                <p className="mt-1 tf-body-muted">Try a different search.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
                {filteredRoles.map((role) => {
                  const codes = roleCodes(role);
                  const counts = accessCounts(codes);
                  const holders = role.holders ?? [];
                  const n = role.user_count || 0;
                  return (
                    <article
                      key={role.id}
                      className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-gray-200 bg-white px-4 pb-3.5 pt-4 transition-[box-shadow,border-color] hover:border-gray-300 hover:shadow-md dark:border-slate-700/70 dark:bg-slate-900 dark:hover:border-slate-600 sm:px-[18px] sm:pt-[18px]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setEditor({ mode: 'view', role })}
                            className="block max-w-full truncate text-left text-base font-semibold tracking-tight text-gray-900 transition-colors hover:text-brand-blue dark:text-slate-50"
                            title={`View ${role.name}`}
                          >
                            {role.name}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {role.is_system ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                                <Lock className="h-3 w-3" aria-hidden />
                                System
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                Custom
                              </span>
                            )}
                            {role.is_default && (
                              <span className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue dark:bg-brand-blue/20 dark:text-sky-300">
                                Default for new users
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="-mr-2 -mt-1.5 flex shrink-0">
                          <CardAction label={`View ${role.name}`} icon={<Eye />} onClick={() => setEditor({ mode: 'view', role })} />
                          <CardAction
                            label={`Edit ${role.name}`}
                            icon={<Pencil />}
                            disabledReason={editReason(role)}
                            onClick={() => setEditor({ mode: 'edit', role })}
                          />
                          <CardAction
                            label={`Duplicate ${role.name}`}
                            icon={<Copy />}
                            disabledReason={duplicateReason()}
                            onClick={() => setEditor({ mode: 'dup', role })}
                          />
                          <CardAction
                            label={`Delete ${role.name}`}
                            icon={<Trash2 />}
                            danger
                            disabledReason={deleteReason(role)}
                            onClick={() => setDeleteTarget(role)}
                          />
                        </div>
                      </div>

                      <p className="m-0 line-clamp-2 min-h-[38px] break-words text-[13px] text-gray-500 dark:text-slate-400">
                        {role.description || 'No description provided.'}
                      </p>

                      <div className="min-w-0 border-y border-gray-100 py-2.5 dark:border-slate-700/60">
                        <AccessInline codes={codes} max={4} />
                      </div>

                      <div className="flex min-w-0 items-center gap-2.5 text-[12.5px] text-gray-500 dark:text-slate-400">
                        {n > 0 && holders.length > 0 && (
                          <div className="flex shrink-0">
                            {holders.slice(0, 4).map((h, i) => (
                              <span
                                key={h.id}
                                title={h.name}
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-blue/10 text-[10px] font-semibold text-brand-blue ring-2 ring-white dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-900 ${i ? '-ml-1.5' : ''}`}
                              >
                                {initials(h.name)}
                              </span>
                            ))}
                          </div>
                        )}
                        <span className="truncate">{n ? plural(n, 'user') : 'No users yet'}</span>
                        <span className="ml-auto flex shrink-0 gap-3">
                          <span className="inline-flex items-center gap-1.5"><AccessDot tone="full" />{counts.full} {LEVEL_NAMES.full}</span>
                          <span className="inline-flex items-center gap-1.5"><AccessDot tone="view" />{counts.view} {LEVEL_NAMES.view}</span>
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'audit' && (
          <section className="tf-card-soft overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-3 py-3 sm:px-6 sm:py-4">
              <div>
                <h2 className="tf-section-title max-sm:text-sm">Access Activity Log</h2>
                <p className="hidden tf-body-muted sm:block">Track role lifecycle changes and permission updates for audit readiness.</p>
              </div>
              <span className="hidden rounded-full bg-gray-50 dark:bg-slate-800/50 px-3 py-1.5 tf-meta ring-1 ring-gray-200 dark:ring-slate-700 sm:inline-flex">
                {auditLogs.length} events
              </span>
            </div>

            {auditLogs.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15">
                  <History className="h-6 w-6 text-brand-cyan" />
                </div>
                <h3 className="tf-section-title max-sm:text-sm">No audit logs found</h3>
                <p className="mt-1 tf-body-muted">Recent role changes will appear here once activity is recorded.</p>
              </div>
            ) : (
              <>
                <div className="hidden lg:block overflow-x-auto tf-table-shell">
                  <table className="w-full min-w-[980px]">
                    <thead className="bg-white dark:bg-slate-900">
                      <tr className="text-left">
                        <th className="tf-th-cell tf-th">Action</th>
                        <th className="tf-th-cell tf-th">Entity</th>
                        <th className="tf-th-cell tf-th">Performed By</th>
                        <th className="tf-th-cell tf-th">Date</th>
                        <th className="tf-th-cell tf-th">Changes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="transition-colors hover:bg-brand-blue/[0.02]">
                          <td className="tf-td">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getActionBadgeClass(log.action)}`}>
                              {getAuditActionLabel(log.action)}
                            </span>
                          </td>
                          <td className="tf-td">
                            <div className="tf-row-title">{log.entity_name || log.entity_id}</div>
                            <div className="mt-1 tf-hint uppercase tracking-[0.14em]">{log.entity_type}</div>
                          </td>
                          <td className="tf-td tf-body-secondary">
                            {log.performed_by_name || log.performed_by}
                          </td>
                          <td className="tf-td tf-body-secondary">
                            {formatIST(log.performed_at)}
                          </td>
                          <td className="tf-td">
                            {formatAuditChanges(log.action, log.changes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="tf-grid-2 p-3 sm:p-6 lg:hidden">
                  {auditLogs.map((log) => (
                    <article
                      key={log.id}
                      className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-white to-brand-blue/[0.02] dark:from-slate-900 dark:to-slate-900 p-3 sm:p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium sm:px-3 sm:py-1 ${getActionBadgeClass(log.action)}`}>
                          {getAuditActionLabel(log.action)}
                        </span>
                        <span className="tf-hint">{formatIST(log.performed_at)}</span>
                      </div>
                      <div className="mt-3 sm:mt-4">
                        <h3 className="tf-row-title">{log.entity_name || log.entity_id}</h3>
                        <p className="mt-1 tf-hint uppercase tracking-[0.16em]">{log.entity_type}</p>
                      </div>
                      <p className="mt-2 tf-meta sm:mt-4 sm:text-sm">By {log.performed_by_name || log.performed_by}</p>
                      <div className="mt-3 rounded-xl bg-gray-50 dark:bg-slate-800/50 p-2.5 ring-1 sm:mt-4 sm:p-3 ring-gray-100 dark:ring-slate-700/60">
                        {formatAuditChanges(log.action, log.changes)}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

      {/* View / Edit / Duplicate / Create — one popup (components/roles/access). */}
      <RoleEditorModal
        open={!!editor}
        mode={editor?.mode ?? 'new'}
        role={editor?.role ?? null}
        roles={roles}
        canEdit={canManageRoles}
        onClose={() => setEditor(null)}
        onEdit={() => setEditor((cur) => (cur?.role && !cur.role.is_system ? { mode: 'edit', role: cur.role } : cur))}
        onDuplicate={() => setEditor((cur) => (cur?.role ? { mode: 'dup', role: cur.role } : cur))}
        duplicateDisabledReason={duplicateReason()}
        onSaved={() => {
          setEditor(null);
          loadData();
        }}
      />

      <AppModal
        open={!!deleteTarget}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
        cancelDisabled={deleting}
        size="sm"
        tone="warning"
        icon={<Trash2 className="h-5 w-5" />}
        title="Delete role?"
        actions={[{
          label: 'Delete Role',
          variant: 'destructive',
          onClick: () => void confirmDelete(),
          loading: deleting,
          disabled: deleting,
        }]}
      >
        <p className="text-sm text-gray-600 dark:text-slate-300">
          <b className="text-gray-900 dark:text-slate-100">{deleteTarget?.name}</b> will be removed. This cannot be undone.
        </p>
      </AppModal>
    </div>
  );
}
