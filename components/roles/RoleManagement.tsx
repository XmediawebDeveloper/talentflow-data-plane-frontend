'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import OrganizationTabs from '@/components/organization/OrganizationTabs';
import CreateRoleForm from './CreateRoleForm';
import EditRoleForm from './EditRoleForm';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Pencil,
  Ban,
  Shield,
  Users,
  Loader2,
  History,
  Lock,
  Eye,
  X,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { formatIST } from '@/lib/utils/dateUtils';
import authService from '@/lib/services/authService';
import rbacService from '@/lib/services/rbacService';
import {
  Permission,
  RoleListItem,
  AuditLogEntry,
} from '@/lib/types/rbac';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { useAuth } from '@/lib/hooks/useAuth';

type TabType = 'roles' | 'audit';

const protectedRoleCodes = ['admin', 'recruiter', 'billing_manager', 'viewer'];

const getActionBadgeClass = (action: string) => {
  if (action.includes('create')) {
    return 'bg-brand-teal/15 text-brand-teal border border-brand-teal/20';
  }
  if (action.includes('delete')) {
    return 'bg-brand-orange/15 text-brand-orange-deep border border-brand-orange/20';
  }
  return 'bg-brand-blue/10 text-brand-blue border border-brand-blue/15';
};

const getRoleBadgeClass = (isSystem: boolean) =>
  isSystem
    ? 'bg-white/10 text-white ring-1 ring-white/15'
    : 'bg-brand-cyan/15 text-brand-blue ring-1 ring-brand-cyan/20';

export default function RoleManagement() {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const { hasPermission } = useAuth();
  // Route access only requires view rights (canViewRoles); mutating actions
  // (create/edit/delete) additionally require the manage permission — without
  // this, a view-only user sees fully clickable Create/Edit/Delete controls.
  const canManageRoles = hasPermission('canManagePermissionsRoles');
  const [activeTab, setActiveTab] = useState<TabType>('roles');
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingRole, setViewingRole] = useState<RoleListItem | null>(null);
  const [viewingRolePermissions, setViewingRolePermissions] = useState<Permission[]>([]);
  // CRUD is inline (side panels), not full-page redirects — per UI/UX guidelines.
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleListItem | null>(null);
  // Two-step drill-in: 'cards' shows only the 4 stat tiles; clicking one expands
  // into a focused list view. Each card drives a different listView so the
  // expanded panel reflects what was clicked (mirrors /recruitment/job-openings).
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const [listView, setListView] = useState<'roles-all' | 'roles-system' | 'users' | 'permissions'>('roles-all');
  const openListView = (view: 'roles-all' | 'roles-system' | 'users' | 'permissions') => {
    setListView(view);
    setPageView('list');
  };
  const isRolesView = listView === 'roles-all' || listView === 'roles-system';

  // Persist scroll + view state so returning to Roles & Permissions lands the
  // user where they left off. Re-detect the scroll container when the tab or
  // two-step view flips (height changes between overview and list).
  const rootRef = useScrollRestoration<HTMLElement>('org-role-management', !isLoading, [pageView, activeTab]);
  useListStatePersistence(
    'org-role-management',
    { activeTab, pageView, listView, searchQuery },
    (s) => {
      if (s.activeTab === 'roles' || s.activeTab === 'audit') setActiveTab(s.activeTab as TabType);
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (s.listView === 'roles-all' || s.listView === 'roles-system' || s.listView === 'users' || s.listView === 'permissions') {
        setListView(s.listView as typeof listView);
      }
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
      console.error('Failed to load roles and permissions:', error);
      toast.error('Failed to load roles and permissions');
      setRoles([]);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  };

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

  const filteredRoles = roles.filter((role) => {
    if (listView === 'roles-system' && !role.is_system) return false;
    return (
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.code.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Assigned Users view: roles sorted by user_count (descending), filtered to
  // those that actually have at least one user assigned. Search bar applies the
  // same role-name/code match.
  const userAssignmentRoles = roles
    .filter((role) => (role.user_count || 0) > 0)
    .filter((role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.code.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (b.user_count || 0) - (a.user_count || 0));

  // Permissions Catalog view: grouped by module so admins can scan capabilities
  // by area. Search applies to code/name/description so a quick filter works.
  const filteredPermissions = permissions.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      p.module.toLowerCase().includes(q)
    );
  });
  const permissionsByModule = filteredPermissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ||= []).push(p);
    return acc;
  }, {});

  const systemRolesCount = roles.filter((role) => role.is_system).length;
  const customRolesCount = roles.length - systemRolesCount;
  const assignedUsersCount = roles.reduce((sum, role) => sum + (role.user_count || 0), 0);
  const managedPermissionsCount = permissions.length;

  const handleDeleteRole = async (roleId: number) => {
    const role = roles.find((item) => item.id === roleId);
    if (role?.is_system) {
      toast.error('System roles cannot be deleted');
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Delete Role',
      message: 'Are you sure you want to delete this role?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Role',
      item: role ? { label: 'ROLE', name: role.name } : undefined,
      warningNote: 'Deleting this role is permanent — users assigned to it will immediately lose its permissions.',
    });
    if (!confirmed) return;

    try {
      await rbacService.deleteRole(roleId);
      toast.success('Role deleted successfully');
      loadData();
    } catch (error) {
      console.error('Failed to delete role:', error);
      toast.error('Failed to delete role');
    }
  };

  const handleViewPermissions = async (role: RoleListItem) => {
    try {
      const roleDetails = await rbacService.getRoleById(role.id);
      setViewingRole(role);
      setViewingRolePermissions(roleDetails.permissions || []);
    } catch (error) {
      console.error('Error loading role permissions:', error);
      toast.error('Failed to load role permissions');
    }
  };

  const handleEditRole = (role: RoleListItem) => {
    if (!role.id || role.id <= 0) {
      toast.error(`Invalid role ID: ${role.id}`);
      return;
    }
    setEditingRole(role);
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
          <div className="text-sm text-gray-700 dark:text-slate-300">
            <span className="font-medium text-gray-900 dark:text-slate-50">Role:</span> {roleName}
          </div>
          {permCount > 0 && (
            <div className="text-xs text-gray-500 dark:text-slate-500">
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
          <div className="text-sm text-gray-700 dark:text-slate-300">
            <span className="font-medium text-gray-900 dark:text-slate-50">Deleted:</span> {roleName}
          </div>
          {roleCode && (
            <div className="text-xs text-gray-500 dark:text-slate-500">Code: {roleCode}</div>
          )}
        </div>
      );
    }

    if (action === 'role_update' || action === 'role_updated') {
      const changesData = changes.changes as Record<string, { from: unknown; to: unknown }> | undefined;
      if (!changesData) {
        return <span className="text-sm text-gray-500 dark:text-slate-500">Settings updated</span>;
      }

      return (
        <div className="space-y-1">
          {Object.entries(changesData).map(([field, change]) => {
            if (field === 'permissions') {
              const fromCount = Array.isArray(change.from) ? change.from.length : 0;
              const toCount = Array.isArray(change.to) ? change.to.length : 0;
              return (
                <div key={field} className="text-xs text-gray-600 dark:text-slate-400">
                  <span className="font-medium text-gray-900 dark:text-slate-50">Permissions:</span> {fromCount} to {toCount}
                </div>
              );
            }

            return (
              <div key={field} className="text-xs text-gray-600 dark:text-slate-400">
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
            <div className="text-xs text-gray-500 dark:text-slate-500">
              <span className="font-medium text-gray-900 dark:text-slate-50">From:</span> {oldRoles.join(', ') || 'None'}
            </div>
          )}
          {newRoles && (
            <div className="text-xs text-gray-700 dark:text-slate-300">
              <span className="font-medium text-gray-900 dark:text-slate-50">To:</span> {newRoles.join(', ') || 'None'}
            </div>
          )}
        </div>
      );
    }

    return (
      <span className="text-xs text-gray-500 dark:text-slate-500">
        {Object.keys(changes).length} field{Object.keys(changes).length !== 1 ? 's' : ''} modified
      </span>
    );
  };

  const groupedPermissions = viewingRolePermissions.reduce((acc, permission) => {
    const moduleName = permission.module || 'other';
    if (!acc[moduleName]) {
      acc[moduleName] = [];
    }
    acc[moduleName].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users', href: '/organization/user-management' }, { label: 'Roles & Permissions' }]} />
        <OrganizationTabs />
        <div className="-mt-5 rounded-b-xl border border-t-0 border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 sm:p-5">
        <PageHeader
          icon={<Shield className="h-5 w-5" />}
          title="Role Management"
          description="Manage role structure, permission coverage, and access activity with the same operational guardrails used across the dashboard."
          actions={
            <Button
              variant="primary"
              onClick={() => {
                if (!canManageRoles) {
                  toast.error('You do not have permission to manage roles');
                  return;
                }
                setCreateOpen(true);
              }}
              aria-disabled={!canManageRoles}
              title={!canManageRoles ? 'You do not have permission to manage roles' : ''}
              icon={<Plus className="h-4 w-4" />}
            >
              Create Role
            </Button>
          }
        />

        <div className="mb-5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-2 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => setActiveTab('roles')}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'roles'
                  ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-brand-blue/[0.04] hover:text-brand-blue'
              }`}
            >
              <Shield className="h-4 w-4" />
              Roles
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'audit'
                  ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-brand-blue/[0.04] hover:text-brand-blue'
              }`}
            >
              <History className="h-4 w-4" />
              Activity Log
            </button>
          </div>
        </div>

        {activeTab === 'roles' && (
          <>
            {/* Stats Cards — clicking any card drills into the roles list below.
                System Roles also pre-filters by type. */}
            <StatsCardGrid columns={4}>
              <StatsCard
                label="Total Roles"
                value={roles.length}
                icon={Shield}
                tone="neutral"
                sparkVariant={0}
                onClick={() => openListView('roles-all')}
                active={pageView === 'list' && listView === 'roles-all'}
                showClickArrow
              />
              <StatsCard
                label="System Roles"
                value={systemRolesCount}
                icon={Lock}
                tone="neutral"
                sparkVariant={1}
                onClick={() => openListView('roles-system')}
                active={pageView === 'list' && listView === 'roles-system'}
                showClickArrow
              />
              <StatsCard
                label="Assigned Users"
                value={assignedUsersCount}
                icon={Users}
                tone="neutral"
                sparkVariant={2}
                onClick={() => openListView('users')}
                active={pageView === 'list' && listView === 'users'}
                showClickArrow
              />
              <StatsCard
                label="Permissions Catalog"
                value={managedPermissionsCount}
                icon={Sparkles}
                tone="neutral"
                sparkVariant={3}
                onClick={() => openListView('permissions')}
                active={pageView === 'list' && listView === 'permissions'}
                showClickArrow
              />
            </StatsCardGrid>

            {pageView === 'list' && (
            <>
            {/* Count lives only in the filter chips below (was also duplicated
                in a top-right tally — removed to show it in one place). */}
            <section className="mb-5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                  <input
                    aria-label={listView === 'permissions' ? 'Search permissions' : 'Search roles'}
                    type="text"
                    placeholder={listView === 'permissions' ? 'Search by permission code, name or module' : 'Search by role name or code'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-3 pl-10 pr-4 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-slate-500">
                  {listView === 'permissions' ? (
                    <>
                      <span className="inline-flex items-center rounded-full bg-gray-50 dark:bg-slate-800/50 px-3 py-1.5 ring-1 ring-gray-200 dark:ring-slate-700">
                        {filteredPermissions.length} visible permissions
                      </span>
                      <span className="inline-flex items-center rounded-full bg-brand-orange/10 px-3 py-1.5 text-brand-orange-deep ring-1 ring-brand-orange/20">
                        {Object.keys(permissionsByModule).length} modules
                      </span>
                    </>
                  ) : listView === 'users' ? (
                    <>
                      <span className="inline-flex items-center rounded-full bg-gray-50 dark:bg-slate-800/50 px-3 py-1.5 ring-1 ring-gray-200 dark:ring-slate-700">
                        {userAssignmentRoles.length} roles with users
                      </span>
                      <span className="inline-flex items-center rounded-full bg-brand-teal/10 px-3 py-1.5 text-brand-teal ring-1 ring-brand-teal/20">
                        {assignedUsersCount} total assignments
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center rounded-full bg-gray-50 dark:bg-slate-800/50 px-3 py-1.5 ring-1 ring-gray-200 dark:ring-slate-700">
                        {filteredRoles.length} visible roles
                      </span>
                      <span className="inline-flex items-center rounded-full bg-brand-cyan/10 px-3 py-1.5 text-brand-blue ring-1 ring-brand-cyan/20">
                        {customRolesCount} custom
                      </span>
                      <span className="inline-flex items-center rounded-full bg-brand-teal/10 px-3 py-1.5 text-brand-teal ring-1 ring-brand-teal/20">
                        {systemRolesCount} system
                      </span>
                    </>
                  )}
                </div>
              </div>
            </section>

            {isRolesView && (
            <section className="mb-5 overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-4 sm:px-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Roles Directory</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-500">Review access levels, inheritance, and role usage across the organization.</p>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-20 tf-loader-center">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
                </div>
              ) : filteredRoles.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                    <Shield className="h-6 w-6 text-brand-blue" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">No roles found</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">Try a different search query or create a new role.</p>
                </div>
              ) : (
                <>
                  <div className="hidden xl:block overflow-x-auto tf-table-shell">
                    <table className="w-full min-w-[980px]">
                      <thead className="bg-gray-50/80 dark:bg-slate-800/50">
                        <tr className="text-left">
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Role</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Type</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Inheritance</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Permissions</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Users</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Priority</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500 text-right tf-sticky-col">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                        {filteredRoles.map((role) => (
                          <tr key={role.id} className="transition-colors hover:bg-brand-blue/[0.02]">
                            <td className="px-6 py-5">
                              <div className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                                  <Shield className="h-5 w-5 text-brand-blue" />
                                </span>
                                <div className="w-[260px] min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-slate-50">{role.name}</p>
                                    {role.is_default && (
                                      <span className="shrink-0 inline-flex items-center rounded-full bg-brand-orange/10 px-2.5 py-1 text-2xs font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
                                        Default
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 truncate text-xs font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">{role.code}</p>
                                  <p className="mt-2 line-clamp-2 break-words text-sm text-gray-500 dark:text-slate-500">{role.description || 'No description provided.'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <Badge variant={role.is_system ? 'muted' : 'secondary'}>
                                {role.is_system ? 'System role' : 'Custom role'}
                              </Badge>
                            </td>
                            <td className="px-6 py-5 text-sm text-gray-600 dark:text-slate-400">
                              {role.parent_role_name ? role.parent_role_name : <span className="text-gray-400 dark:text-slate-500">Independent</span>}
                            </td>
                            <td className="px-6 py-5">
                              <Badge variant="info">
                                {role.permission_count} permissions
                              </Badge>
                            </td>
                            <td className="px-6 py-5">
                              <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 dark:bg-slate-800/50 px-3 py-1.5 ring-1 ring-gray-200 dark:ring-slate-700">
                                <Users className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{role.user_count}</span>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">{role.priority}</span>
                            </td>
                            <td className="px-6 py-5 tf-sticky-col">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleViewPermissions(role)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-blue/15 bg-brand-blue/[0.04] text-brand-blue transition-all hover:-translate-y-0.5 hover:bg-brand-blue/[0.08]"
                                  title={`View permissions for ${role.name}`}
                                  aria-label={`View permissions for ${role.name}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                {!protectedRoleCodes.includes(role.code) ? (
                                  <button
                                    onClick={() => {
                                      if (!canManageRoles) {
                                        toast.error('You do not have permission to manage roles');
                                        return;
                                      }
                                      handleEditRole(role);
                                    }}
                                    aria-disabled={!canManageRoles}
                                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-[border-color,box-shadow,color,background-color] ${
                                      canManageRoles
                                        ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue'
                                        : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-300 cursor-not-allowed'
                                    }`}
                                    title={!canManageRoles ? 'You do not have permission to manage roles' : `Edit ${role.name}`}
                                    aria-label={`Edit ${role.name}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-300" title="Protected role">
                                    <Lock className="h-4 w-4" />
                                  </span>
                                )}
                                {!role.is_system ? (
                                  <button
                                    onClick={() => {
                                      if (!canManageRoles) {
                                        toast.error('You do not have permission to manage roles');
                                        return;
                                      }
                                      handleDeleteRole(role.id);
                                    }}
                                    aria-disabled={!canManageRoles}
                                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                                      canManageRoles
                                        ? 'border-destructive-line/15 bg-destructive/[0.05] text-destructive hover:-translate-y-0.5 hover:bg-destructive/[0.1]'
                                        : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-300 cursor-not-allowed'
                                    }`}
                                    title={!canManageRoles ? 'You do not have permission to manage roles' : `Delete ${role.name}`}
                                    aria-label={`Delete ${role.name}`}
                                  >
                                    <Ban className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-300" title="System roles cannot be deleted">
                                    <Lock className="h-4 w-4" />
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-4 p-4 xl:hidden sm:p-6">
                    {filteredRoles.map((role) => (
                      <article
                        key={role.id}
                        className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-white to-brand-blue/[0.02] dark:from-slate-900 dark:to-slate-900 p-4 shadow-sm transition-all hover:border-brand-blue/20 hover:shadow-md hover:shadow-brand-blue/5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                              <Shield className="h-5 w-5 text-brand-blue" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50">{role.name}</h3>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-medium ${role.is_system ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-1 ring-gray-200 dark:ring-slate-700' : 'bg-brand-cyan/10 text-brand-blue ring-1 ring-brand-cyan/20'}`}>
                                  {role.is_system ? 'System' : 'Custom'}
                                </span>
                              </div>
                              <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">{role.code}</p>
                              <p className="mt-2 text-sm text-gray-500 dark:text-slate-500">{role.description || 'No description provided.'}</p>
                            </div>
                          </div>
                          {role.is_default && (
                            <span className="inline-flex items-center rounded-full bg-brand-orange/10 px-2.5 py-1 text-2xs font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
                              Default
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 px-3 py-2 ring-1 ring-gray-100 dark:ring-slate-700/60">
                            <div className="text-xs text-gray-500 dark:text-slate-500">Permissions</div>
                            <div className="mt-1 font-semibold text-gray-900 dark:text-slate-50">{role.permission_count}</div>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 px-3 py-2 ring-1 ring-gray-100 dark:ring-slate-700/60">
                            <div className="text-xs text-gray-500 dark:text-slate-500">Users</div>
                            <div className="mt-1 font-semibold text-gray-900 dark:text-slate-50">{role.user_count}</div>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 px-3 py-2 ring-1 ring-gray-100 dark:ring-slate-700/60">
                            <div className="text-xs text-gray-500 dark:text-slate-500">Priority</div>
                            <div className="mt-1 font-semibold text-gray-900 dark:text-slate-50">{role.priority}</div>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 px-3 py-2 ring-1 ring-gray-100 dark:ring-slate-700/60">
                            <div className="text-xs text-gray-500 dark:text-slate-500">Inherits</div>
                            <div className="mt-1 font-semibold text-gray-900 dark:text-slate-50">{role.parent_role_name || 'Independent'}</div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleViewPermissions(role)}
                            className="inline-flex items-center gap-2 rounded-xl border border-brand-blue/15 bg-brand-blue/[0.04] px-3 py-2 text-sm font-medium text-brand-blue transition-all hover:bg-brand-blue/[0.08]"
                          >
                            <Eye className="h-4 w-4" />
                            View permissions
                          </button>
                          {!protectedRoleCodes.includes(role.code) && (
                            <button
                              onClick={() => {
                                if (!canManageRoles) {
                                  toast.error('You do not have permission to manage roles');
                                  return;
                                }
                                handleEditRole(role);
                              }}
                              aria-disabled={!canManageRoles}
                              title={!canManageRoles ? 'You do not have permission to manage roles' : ''}
                              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                                canManageRoles
                                  ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:border-brand-cyan/20 hover:bg-brand-cyan/[0.04] hover:text-brand-blue'
                                  : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-300 cursor-not-allowed'
                              }`}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </button>
                          )}
                          {!role.is_system && (
                            <button
                              onClick={() => {
                                if (!canManageRoles) {
                                  toast.error('You do not have permission to manage roles');
                                  return;
                                }
                                handleDeleteRole(role.id);
                              }}
                              aria-disabled={!canManageRoles}
                              title={!canManageRoles ? 'You do not have permission to manage roles' : ''}
                              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                                canManageRoles
                                  ? 'border-destructive-line/15 bg-destructive/[0.05] text-destructive hover:bg-destructive/[0.1]'
                                  : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-300 cursor-not-allowed'
                              }`}
                            >
                              <Ban className="h-4 w-4" />
                              Delete
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
            )}

            {/* Assigned Users view — roles ranked by user_count. The roles list
                is still the source of truth (no per-user API call). */}
            {listView === 'users' && (
              <section className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-teal/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-4 sm:px-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">User Assignments</h2>
                    <p className="text-sm text-gray-500 dark:text-slate-500">How many users hold each role across the organization.</p>
                  </div>
                </div>
                {isLoading ? (
                  <div className="flex items-center justify-center py-20 tf-loader-center">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
                  </div>
                ) : userAssignmentRoles.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-teal/10 ring-1 ring-brand-teal/15">
                      <Users className="h-6 w-6 text-brand-teal" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">No assignments yet</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">Users will appear here once roles are assigned to them.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto tf-table-shell">
                    <table className="w-full min-w-[640px]">
                      <thead className="bg-gray-50/80 dark:bg-slate-800/50">
                        <tr className="text-left">
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Role</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Type</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Permissions</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500 text-right">Users</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                        {userAssignmentRoles.map((role) => (
                          <tr key={role.id} className="transition-colors hover:bg-brand-teal/[0.04]">
                            <td className="px-6 py-4">
                              <div className="flex items-start gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15">
                                  <Users className="h-5 w-5 text-brand-teal" />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">{role.name}</p>
                                  <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">{role.code}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${role.is_system ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-1 ring-gray-200 dark:ring-slate-700' : 'bg-brand-cyan/10 text-brand-blue ring-1 ring-brand-cyan/20'}`}>
                                {role.is_system ? 'System' : 'Custom'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-slate-300">{role.permission_count}</td>
                            <td className="px-6 py-4 text-right">
                              <span className="inline-flex items-center rounded-full bg-brand-teal/10 px-3 py-1 text-sm font-semibold text-brand-teal ring-1 ring-brand-teal/20">
                                {role.user_count}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* Permissions Catalog view — permissions grouped by module. */}
            {listView === 'permissions' && (
              <section className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-orange/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-4 sm:px-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Permissions Catalog</h2>
                    <p className="text-sm text-gray-500 dark:text-slate-500">All permissions available to assign, grouped by module.</p>
                  </div>
                </div>
                {isLoading ? (
                  <div className="flex items-center justify-center py-20 tf-loader-center">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
                  </div>
                ) : filteredPermissions.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-orange/10 ring-1 ring-brand-orange/15">
                      <Sparkles className="h-6 w-6 text-brand-orange-deep" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">No permissions found</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">Try a different search query.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
                    {Object.entries(permissionsByModule)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([module, perms]) => (
                        <div key={module} className="px-4 py-4 sm:px-6">
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-700 dark:text-slate-300">{module.replace(/_/g, ' ')}</h3>
                            <span className="text-xs text-gray-500 dark:text-slate-500">{perms.length} {perms.length === 1 ? 'permission' : 'permissions'}</span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {perms.map((p) => (
                              <div key={p.id} className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/40 p-3 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">{p.name}</p>
                                  <span className="text-2xs font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-slate-500 whitespace-nowrap">{p.action}</span>
                                </div>
                                <p className="mt-1 font-mono text-2xs text-brand-blue">{p.code}</p>
                                {p.description && (
                                  <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">{p.description}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </section>
            )}
            </>
            )}
          </>
        )}

        {activeTab === 'audit' && (
          <section className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Access Activity Log</h2>
                <p className="text-sm text-gray-500 dark:text-slate-500">Track role lifecycle changes and permission updates for audit readiness.</p>
              </div>
              <span className="hidden rounded-full bg-gray-50 dark:bg-slate-800/50 px-3 py-1.5 text-xs text-gray-500 dark:text-slate-500 ring-1 ring-gray-200 dark:ring-slate-700 sm:inline-flex">
                {auditLogs.length} events
              </span>
            </div>

            {auditLogs.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15">
                  <History className="h-6 w-6 text-brand-cyan" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">No audit logs found</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">Recent role changes will appear here once activity is recorded.</p>
              </div>
            ) : (
              <>
                <div className="hidden lg:block overflow-x-auto tf-table-shell">
                  <table className="w-full min-w-[980px]">
                    <thead className="bg-gray-50/80 dark:bg-slate-800/50">
                      <tr className="text-left">
                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Action</th>
                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Entity</th>
                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Performed By</th>
                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Date</th>
                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Changes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="transition-colors hover:bg-brand-blue/[0.02]">
                          <td className="px-6 py-5">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getActionBadgeClass(log.action)}`}>
                              {getAuditActionLabel(log.action)}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="text-sm font-semibold text-gray-900 dark:text-slate-50">{log.entity_name || log.entity_id}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-400 dark:text-slate-500">{log.entity_type}</div>
                          </td>
                          <td className="px-6 py-5 text-sm text-gray-600 dark:text-slate-400">
                            {log.performed_by_name || log.performed_by}
                          </td>
                          <td className="px-6 py-5 text-sm text-gray-600 dark:text-slate-400">
                            {formatIST(log.performed_at)}
                          </td>
                          <td className="px-6 py-5">
                            {formatAuditChanges(log.action, log.changes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-4 p-4 lg:hidden sm:p-6">
                  {auditLogs.map((log) => (
                    <article
                      key={log.id}
                      className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-white to-brand-blue/[0.02] dark:from-slate-900 dark:to-slate-900 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getActionBadgeClass(log.action)}`}>
                          {getAuditActionLabel(log.action)}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">{formatIST(log.performed_at)}</span>
                      </div>
                      <div className="mt-4">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50">{log.entity_name || log.entity_id}</h3>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">{log.entity_type}</p>
                      </div>
                      <p className="mt-4 text-sm text-gray-600 dark:text-slate-400">By {log.performed_by_name || log.performed_by}</p>
                      <div className="mt-4 rounded-xl bg-gray-50 dark:bg-slate-800/50 p-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                        {formatAuditChanges(log.action, log.changes)}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>
      </div>

      {viewingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90dvh] w-full max-w-[95vw] sm:max-w-4xl rounded-3xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 flex flex-col">
            <div className="relative overflow-hidden bg-brand-blue px-5 py-5 text-white sm:px-6 shrink-0 rounded-t-3xl">
              <div className="pointer-events-none absolute -top-10 right-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                    <Eye className="h-5 w-5 text-white" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-semibold">{viewingRole.name}</h2>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-medium ${getRoleBadgeClass(viewingRole.is_system)}`}>
                        {viewingRole.is_system ? 'System role' : 'Custom role'}
                      </span>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-white/80">{viewingRole.description || 'No description provided.'}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setViewingRole(null);
                    setViewingRolePermissions([]);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
                  aria-label="Close permissions modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">Role Code</div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-slate-50">{viewingRole.code}</div>
                </div>
                <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">Assigned Users</div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-slate-50">{viewingRole.user_count}</div>
                </div>
                <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">Permissions</div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-slate-50">{viewingRolePermissions.length}</div>
                </div>
                <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">Inheritance</div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-slate-50">{viewingRole.parent_role_name || 'Independent'}</div>
                </div>
              </div>

              {viewingRolePermissions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-6 py-16 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                    <Shield className="h-6 w-6 text-brand-blue" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">No permissions allocated</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">This role does not currently expose any explicit permissions.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedPermissions).map(([moduleName, modulePermissions]) => (
                    <section
                      key={moduleName}
                      className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-3 sm:px-5">
                        <div>
                          <h3 className="text-sm font-semibold capitalize text-gray-900 dark:text-slate-50">{moduleName.replace(/_/g, ' ')}</h3>
                          <p className="text-xs text-gray-500 dark:text-slate-500">{modulePermissions.length} permission{modulePermissions.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                        {modulePermissions.map((permission) => (
                          <div
                            key={permission.id}
                            className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-white to-gray-50 dark:from-slate-900 dark:to-slate-800/50 p-4 transition-colors hover:border-brand-blue/15"
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                  permission.action === 'read'
                                    ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15'
                                    : permission.action === 'create'
                                    ? 'bg-brand-teal/10 text-brand-teal ring-brand-teal/15'
                                    : permission.action === 'update'
                                    ? 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15'
                                    : permission.action === 'delete'
                                    ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/15'
                                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-gray-200 dark:ring-slate-700'
                                }`}
                              >
                                <span className="text-xs font-semibold uppercase">{permission.action?.[0] || 'P'}</span>
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">{permission.name}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-400 dark:text-slate-500">{permission.code}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Create Role — inline side panel (CRUD is not a full-page redirect) */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto p-4 sm:p-6">
          <CreateRoleForm
            embedded
            onCancel={() => setCreateOpen(false)}
            onSuccess={() => { setCreateOpen(false); loadData(); }}
          />
        </SheetContent>
      </Sheet>

      {/* Edit Role — inline side panel */}
      <Sheet open={!!editingRole} onOpenChange={(open) => { if (!open) setEditingRole(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto p-4 sm:p-6">
          {editingRole && (
            <EditRoleForm
              roleId={editingRole.id}
              embedded
              onCancel={() => setEditingRole(null)}
              onSuccess={() => { setEditingRole(null); loadData(); }}
            />
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
