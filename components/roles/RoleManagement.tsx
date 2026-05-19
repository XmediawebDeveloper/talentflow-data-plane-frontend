'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
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
  Layers3,
  Sparkles,
  ArrowUpRight,
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
  const [activeTab, setActiveTab] = useState<TabType>('roles');
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingRole, setViewingRole] = useState<RoleListItem | null>(null);
  const [viewingRolePermissions, setViewingRolePermissions] = useState<Permission[]>([]);

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

  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    role.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      message: 'Are you sure you want to delete this role? Users with this role will lose their permissions.',
      variant: 'error',
      confirmText: 'Delete',
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
    router.push(`/organization/role-management/edit/${role.id}`);
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
    <main className="flex-1 overflow-x-hidden bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px] px-4 md:px-8">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-8" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users', href: '/organization/user-management' }, { label: 'Roles & Permissions' }]} />
        <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Layers3 className="h-3.5 w-3.5 text-brand-orange" />
                Organization access control
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Role Management</h1>
                  <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">
                    Manage role structure, permission coverage, and access activity with the same operational guardrails used across the dashboard.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="grid grid-cols-2 gap-2 text-sm text-white/85 sm:min-w-[240px]">
                <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
                  <div className="text-xs text-white/65">Roles</div>
                  <div className="mt-1 font-semibold">{roles.length}</div>
                </div>
                <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
                  <div className="text-xs text-white/65">Permissions</div>
                  <div className="mt-1 font-semibold">{managedPermissionsCount}</div>
                </div>
              </div>
              <button
                onClick={() => router.push('/organization/role-management/create')}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-brand-blue shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <Plus className="h-4 w-4" />
                Create Role
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        <div className="mb-6 rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-2 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => setActiveTab('roles')}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
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
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
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
            <section className="mb-6 rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                  <input
                    aria-label="Search roles"
                    type="text"
                    placeholder="Search by role name or code"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-3 pl-10 pr-4 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-slate-500">
                  <span className="inline-flex items-center rounded-full bg-gray-50 dark:bg-slate-800/50 px-3 py-1.5 ring-1 ring-gray-200 dark:ring-slate-700">
                    {filteredRoles.length} visible roles
                  </span>
                  <span className="inline-flex items-center rounded-full bg-brand-cyan/10 px-3 py-1.5 text-brand-blue ring-1 ring-brand-cyan/20">
                    {customRolesCount} custom
                  </span>
                  <span className="inline-flex items-center rounded-full bg-brand-teal/10 px-3 py-1.5 text-brand-teal ring-1 ring-brand-teal/20">
                    {systemRolesCount} system
                  </span>
                </div>
              </div>
            </section>

            <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-500">Total Roles</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{roles.length}</p>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                    <Shield className="h-5 w-5 text-brand-blue" />
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 shadow-sm shadow-brand-cyan/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-500">System Roles</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{systemRolesCount}</p>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 shadow-sm shadow-brand-cyan/10">
                    <Lock className="h-5 w-5 text-brand-cyan" />
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 shadow-sm shadow-brand-teal/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-500">Assigned Users</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{assignedUsersCount}</p>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
                    <Users className="h-5 w-5 text-brand-teal" />
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 shadow-sm shadow-brand-orange/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-slate-500">Permissions Catalog</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{managedPermissionsCount}</p>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 shadow-sm shadow-brand-orange/10">
                    <Sparkles className="h-5 w-5 text-brand-orange-deep" />
                  </span>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-4 sm:px-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Roles Directory</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-500">Review access levels, inheritance, and role usage across the organization.</p>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
                </div>
              ) : filteredRoles.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                    <Shield className="h-6 w-6 text-brand-blue" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">No roles found</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">Try a different search query or create a new role.</p>
                </div>
              ) : (
                <>
                  <div className="hidden xl:block overflow-x-auto">
                    <table className="w-full min-w-[980px]">
                      <thead className="bg-gray-50/80 dark:bg-slate-800/50">
                        <tr className="text-left">
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Role</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Type</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Inheritance</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Permissions</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Users</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500">Priority</th>
                          <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500 text-right">Actions</th>
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
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">{role.name}</p>
                                    {role.is_default && (
                                      <span className="inline-flex items-center rounded-full bg-brand-orange/10 px-2.5 py-1 text-[11px] font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
                                        Default
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">{role.code}</p>
                                  <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-slate-500">{role.description || 'No description provided.'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${role.is_system ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-1 ring-gray-200 dark:ring-slate-700' : 'bg-brand-cyan/10 text-brand-blue ring-1 ring-brand-cyan/20'}`}>
                                {role.is_system ? 'System role' : 'Custom role'}
                              </span>
                            </td>
                            <td className="px-6 py-5 text-sm text-gray-600 dark:text-slate-400">
                              {role.parent_role_name ? role.parent_role_name : <span className="text-gray-400 dark:text-slate-500">Independent</span>}
                            </td>
                            <td className="px-6 py-5">
                              <span className="inline-flex items-center rounded-full bg-brand-blue/[0.06] px-3 py-1 text-sm font-medium text-brand-blue ring-1 ring-brand-blue/10">
                                {role.permission_count} permissions
                              </span>
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
                            <td className="px-6 py-5">
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
                                    onClick={() => handleEditRole(role)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 transition-all hover:-translate-y-0.5 hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue"
                                    title={`Edit ${role.name}`}
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
                                    onClick={() => handleDeleteRole(role.id)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-orange/15 bg-brand-orange/[0.05] text-brand-orange-deep transition-all hover:-translate-y-0.5 hover:bg-brand-orange/[0.1]"
                                    title={`Delete ${role.name}`}
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
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${role.is_system ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-1 ring-gray-200 dark:ring-slate-700' : 'bg-brand-cyan/10 text-brand-blue ring-1 ring-brand-cyan/20'}`}>
                                  {role.is_system ? 'System' : 'Custom'}
                                </span>
                              </div>
                              <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">{role.code}</p>
                              <p className="mt-2 text-sm text-gray-500 dark:text-slate-500">{role.description || 'No description provided.'}</p>
                            </div>
                          </div>
                          {role.is_default && (
                            <span className="inline-flex items-center rounded-full bg-brand-orange/10 px-2.5 py-1 text-[11px] font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
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
                              onClick={() => handleEditRole(role)}
                              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-all hover:border-brand-cyan/20 hover:bg-brand-cyan/[0.04] hover:text-brand-blue"
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </button>
                          )}
                          {!role.is_system && (
                            <button
                              onClick={() => handleDeleteRole(role.id)}
                              className="inline-flex items-center gap-2 rounded-xl border border-brand-orange/15 bg-brand-orange/[0.05] px-3 py-2 text-sm font-medium text-brand-orange-deep transition-all hover:bg-brand-orange/[0.1]"
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
                <div className="hidden lg:block overflow-x-auto">
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
          <div className="max-h-[90vh] w-full max-w-5xl rounded-3xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 flex flex-col">
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
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${getRoleBadgeClass(viewingRole.is_system)}`}>
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
            <div className="flex justify-end gap-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/50 px-5 py-4 sm:px-6 shrink-0 rounded-b-3xl">
              <button
                onClick={() => {
                  setViewingRole(null);
                  setViewingRolePermissions([]);
                }}
                className="rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
