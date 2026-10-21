'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Shield, Users, Check, X, Edit2, Save, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import { useAuth } from '@/lib/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useScrollRestoration } from '@/lib/hooks/useListViewPersistence';

// Neutral-gray skeleton mirroring the Permissions & Roles layout:
// hero + 3-col grid (Roles list, then the module permissions panel).
function PermissionsSkeleton() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <Skeleton className="h-4 w-64 mb-4 md:mb-6" />

          {/* Header — mirrors PageHeader (icon tile + title/description) */}
          <div className="mb-5 flex items-start gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Roles list */}
            <div className="rounded-xl border border-gray-100 bg-white p-3 sm:p-4 lg:p-6">
              <Skeleton className="h-5 w-20 mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3 sm:p-4 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                    <div className="flex gap-3">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Permissions grid */}
            <div className="lg:col-span-2 rounded-xl border border-gray-100 bg-white p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between gap-3 mb-6">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-9 w-20 rounded-lg" />
              </div>
              <div className="space-y-6">
                {Array.from({ length: 3 }).map((_, m) => (
                  <div key={m} className="border border-gray-100 rounded-lg p-3 sm:p-4">
                    <Skeleton className="h-4 w-40 mb-3" />
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, r) => (
                        <div key={r} className="flex items-center justify-between p-2 sm:p-3 rounded-lg border border-gray-200">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-6 w-8 rounded-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface Permission {
  id: number;
  code: string;
  name: string;
  description?: string;
  module: string;
  action: string;
  is_system: boolean;
}

interface RolePermission {
  id: number;
  code: string;
  name: string;
  module: string;
  action: string;
}

interface Role {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_default: boolean;
  priority: number;
  parent_role_id: number | null;
  parent_role_name: string | null;
  permissions: RolePermission[];
  permission_count?: number;
  user_count: number;
  created_at: string;
  updated_at: string;
}

export default function PermissionsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('canManagePermissionsRoles');
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPermissionIds, setEditedPermissionIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Scroll-only: this page has no filters/search/tabs/pagination. The only
  // "view" state (selectedRole) is a fetched object + transient edit buffer,
  // not worth persisting.
  const rootRef = useScrollRestoration<HTMLElement>('settings-permissions', !loading);

  // Fetch roles and permissions on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setError('Not authenticated. Please log in.');
        setLoading(false);
        return;
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Fetch roles and permissions in parallel
      const [rolesRes, permissionsRes] = await Promise.all([
        fetch(`${API_URL}/rbac/roles`, { headers }),
        fetch(`${API_URL}/rbac/permissions`, { headers }),
      ]);

      if (!rolesRes.ok) {
        throw new Error(`Failed to fetch roles: ${rolesRes.status}`);
      }
      if (!permissionsRes.ok) {
        throw new Error(`Failed to fetch permissions: ${permissionsRes.status}`);
      }

      const rolesData = await rolesRes.json();
      const permissionsData = await permissionsRes.json();

      const rolesList = rolesData.roles || [];
      const permissionsList = permissionsData.permissions || [];

      setRoles(rolesList);
      setPermissions(permissionsList);

      // Select first non-system role by default, or first role
      if (rolesList.length > 0) {
        const defaultRole = rolesList.find((r: Role) => !r.is_system) || rolesList[0];
        await fetchRoleDetails(defaultRole.id, headers);
      }
    } catch (err) {
      console.error('[Permissions] Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoleDetails = async (roleId: number, headers?: Record<string, string>) => {
    try {
      const token = localStorage.getItem('accessToken');
      const reqHeaders = headers || {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const res = await fetch(`${API_URL}/rbac/roles/${roleId}`, { headers: reqHeaders });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch role details: ${res.status}`);
      }

      const roleData = await res.json();
      setSelectedRole(roleData);
      setIsEditing(false);
    } catch (err) {
      console.error('[Permissions] Error fetching role details:', err);
    }
  };

  const handleSelectRole = async (role: Role) => {
    setIsEditing(false);
    await fetchRoleDetails(role.id);
  };

  const startEditing = () => {
    if (selectedRole) {
      setEditedPermissionIds(selectedRole.permissions.map(p => p.id));
      setIsEditing(true);
    }
  };

  const togglePermission = (permissionId: number) => {
    setEditedPermissionIds(prev =>
      prev.includes(permissionId)
        ? prev.filter(id => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const saveChanges = async () => {
    if (!selectedRole) return;

    setSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(`${API_URL}/rbac/roles/${selectedRole.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          permission_ids: editedPermissionIds,
        }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to save: ${res.status}`);
      }

      const updatedRole = await res.json();
      setSelectedRole(updatedRole);

      // Update role in list
      setRoles(prev => prev.map(r => r.id === updatedRole.id ? { ...r, permission_count: updatedRole.permissions.length } : r));

      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('[Permissions] Error saving:', err);
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Group permissions by module
  const permissionsByModule = permissions.reduce((acc, p) => {
    if (!acc[p.module]) {
      acc[p.module] = [];
    }
    acc[p.module].push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

  const moduleDisplayNames: Record<string, string> = {
    jd: 'Job Descriptions',
    resumes: 'Resumes',
    users: 'User Management',
    assessments: 'Assessments',
    analytics: 'Analytics',
    settings: 'Settings',
    billing: 'Billing',
    internal_db: 'Shared Database',
    ai_interview: 'AI Interview',
  };

  if (loading) {
    return <PermissionsSkeleton />;
  }

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile Settings', href: '/settings/general-settings' }, { label: 'Permissions & Roles' }]} />

        <PageHeader
          title="Permissions & Roles"
          description="Configure what each role can see and do across the platform."
          icon={<Shield className="h-5 w-5" />}
          actions={
            <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={fetchData}>
              Refresh
            </Button>
          }
        />

        {/* Error Message */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-destructive-line bg-destructive-subtle p-4 ring-1 ring-destructive-line">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive-subtle text-destructive">
              <AlertCircle className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-destructive flex-1 min-w-0 break-words">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-destructive hover:text-destructive flex-shrink-0" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Roles List */}
          <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 lg:p-6">
            <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Roles</h2>
            <div className="space-y-2 sm:space-y-3">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleSelectRole(role)}
                  className={`w-full p-3 sm:p-4 rounded-lg text-left transition-all ${
                    selectedRole?.id === role.id
                      ? 'bg-brand-blue/5 border border-brand-blue/30 ring-1 ring-brand-blue/10 shadow-sm shadow-brand-blue/10'
                      : 'hover:bg-brand-blue/5 border border-gray-200 dark:border-slate-700 hover:border-brand-blue/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900 dark:text-slate-50 text-sm sm:text-base truncate">{role.name}</p>
                    {(role.is_system || role.code === 'recruiter') && (
                      <span className="text-2xs sm:text-xs bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/15 px-1.5 sm:px-2 py-0.5 rounded-full font-semibold flex-shrink-0">System</span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 sm:mt-1 line-clamp-2">{role.description || 'No description'}</p>
                  <div className="flex gap-2 sm:gap-3 mt-1.5 sm:mt-2 text-2xs sm:text-xs text-gray-500 dark:text-slate-500">
                    <span className="inline-flex items-center gap-1"><Shield className="w-3 h-3 text-brand-blue/70" />{role.permission_count || role.permissions?.length || 0} perms</span>
                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3 text-brand-cyan/70" />{role.user_count} users</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Permissions Grid */}
          <div className="lg:col-span-2 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 lg:p-6">
            {selectedRole ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 dark:text-slate-50 truncate">{selectedRole.name} Permissions</h2>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-500 truncate">{selectedRole.description || 'No description'}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {!selectedRole.is_system && !isEditing && selectedRole.code !== 'recruiter' && (
                      <Button
                        variant="primary"
                        onClick={() => {
                          if (!canManage) return;
                          startEditing();
                        }}
                        aria-disabled={!canManage}
                        className={!canManage ? 'opacity-50 cursor-not-allowed' : ''}
                        title={!canManage ? 'You do not have permission to manage roles' : ''}
                      >
                        <Edit2 className="w-4 h-4 flex-shrink-0" />
                        Edit
                      </Button>
                    )}
                    {isEditing && (
                      <>
                        <Button variant="secondary" onClick={() => setIsEditing(false)} disabled={saving}>
                          Cancel
                        </Button>
                        <Button variant="primary" onClick={saveChanges} disabled={saving}>
                          {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          {saving ? 'Saving...' : 'Save'}
                        </Button>
                      </>
                    )}
                    {saveSuccess && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-cyan/5 text-brand-cyan ring-1 ring-brand-cyan/20 rounded-full text-xs sm:text-sm font-semibold">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        Saved!
                      </div>
                    )}
                  </div>
                </div>

                {(selectedRole.is_system || selectedRole.code === 'recruiter') && (
                  <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-brand-orange/5 ring-1 ring-brand-orange/20 rounded-lg text-xs sm:text-sm text-brand-orange-deep">
                    System roles cannot be edited. They have predefined permissions.
                  </div>
                )}

                <div className="space-y-4 sm:space-y-6 max-h-[500px] sm:max-h-[600px] overflow-y-auto">
                  {Object.entries(permissionsByModule).map(([module, modulePermissions]) => (
                    <div key={module} className="border border-gray-100 dark:border-slate-700/60 rounded-lg p-3 sm:p-4 bg-white dark:bg-slate-900 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                      <h3 className="font-semibold text-brand-blue mb-2 sm:mb-3 text-xs sm:text-sm lg:text-base">
                        {moduleDisplayNames[module] || module.charAt(0).toUpperCase() + module.slice(1)}
                      </h3>
                      <div className="space-y-1.5 sm:space-y-2">
                        {modulePermissions.map((permission) => {
                          const hasPermission = isEditing
                            ? editedPermissionIds.includes(permission.id)
                            : selectedRole.permissions.some(p => p.id === permission.id);

                          return (
                            <div
                              key={permission.id}
                              className={`flex items-center justify-between p-2 sm:p-3 rounded-lg border gap-2 transition ${
                                hasPermission ? 'bg-brand-cyan/5 border-brand-cyan/20 ring-1 ring-brand-cyan/10' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-gray-900 dark:text-slate-50 text-xs sm:text-sm">{permission.name}</p>
                              </div>
                              {isEditing && !selectedRole.is_system && selectedRole.code !== 'recruiter' ? (
                                <button
                                  onClick={() => togglePermission(permission.id)}
                                  className={`w-9 sm:w-10 h-5 sm:h-6 rounded-full transition-colors flex-shrink-0 ${
                                    hasPermission ? 'bg-brand-cyan' : 'bg-gray-300 dark:bg-slate-700'
                                  }`}
                                >
                                  <div
                                    className={`w-4 sm:w-5 h-4 sm:h-5 bg-white rounded-full shadow-sm transform transition-transform ${
                                      hasPermission ? 'translate-x-4' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              ) : (
                                <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  hasPermission ? 'bg-brand-cyan/15 ring-1 ring-brand-cyan/20' : 'bg-gray-200 dark:bg-slate-800'
                                }`}>
                                  {hasPermission ? (
                                    <Check className="w-3 h-3 sm:w-4 sm:h-4 text-brand-cyan" />
                                  ) : (
                                    <X className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500" />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 sm:h-64 text-gray-500 dark:text-slate-500 text-sm">
                Select a role to view its permissions
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}
