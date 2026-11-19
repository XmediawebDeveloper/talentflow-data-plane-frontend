/**
 * RBAC Service - API client for Role-Based Access Control
 */

import api from './api';
import { cachedList, listCacheKey, listReadOptions, type ListReadOptions } from '../utils/listCache';
import { readRbacCache, writeRbacCache, clearRbacSessionCache } from '../utils/rbacSessionCache';
import {
  Permission,
  Role,
  RoleListItem,
  RoleCreateRequest,
  RoleUpdateRequest,
  UserRolesResponse,
  UserRoleAssignmentRequest,
  AuditLogEntry,
  PermissionCheckResponse,
} from '../types/rbac';

const RBAC_BASE_URL = '/rbac';

// ============================================
// Permission APIs
// ============================================

export async function getPermissions(module?: string): Promise<{
  permissions: Permission[];
  total: number;
}> {
  const params = module ? { module } : {};
  const response = await api.get(`${RBAC_BASE_URL}/permissions`, { params });
  return response.data;
}

/** Max age of the session-cached permission catalogue (see getPermissionsCached). */
const PERMISSION_CATALOG_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * getPermissions() with a session cache (lib/utils/rbacSessionCache): the
 * catalogue of permission definitions, reused when moving between the Users
 * and Roles pages. Only successful responses are cached; the cache is cleared
 * on any role write and on every permissions update. Forms that edit a role
 * keep calling getPermissions() directly.
 */
export async function getPermissionsCached(module?: string): Promise<{
  permissions: Permission[];
  total: number;
}> {
  const key = `permissions:${module ?? ''}`;
  const hit = readRbacCache<{ permissions: Permission[]; total: number }>(key, PERMISSION_CATALOG_MAX_AGE_MS);
  if (hit) return hit;
  const data = await getPermissions(module);
  writeRbacCache(key, data);
  return data;
}

export async function getPermissionModules(): Promise<Record<string, string>> {
  const response = await api.get(`${RBAC_BASE_URL}/permissions/modules`);
  return response.data;
}

// ============================================
// Role APIs
// ============================================

/**
 * Role names are always shown and saved in CAPITALS (client rule 2026-10-17),
 * including the built-in roles and names typed in lower case. Normalised here,
 * where role data enters the app, so every screen gets the same form.
 */
export const formatRoleName = (name: string | null | undefined): string => (name ?? '').toUpperCase();

export async function getRoles(opts?: ListReadOptions): Promise<{
  roles: RoleListItem[];
  total: number;
  /** Max roles per tenant, system roles included. */
  role_limit?: number;
}> {
  // `reuseRecent`: arriving on User Management reuses an answer from the last 30 s
  // (any write, e.g. a role save, clears it — lib/utils/listCache).
  const response = { data: await cachedList(
    listCacheKey('rbac|roles'),
    async () => (await api.get(`${RBAC_BASE_URL}/roles`)).data,
    listReadOptions(opts),
  ) };

  // Ensure core system roles are always marked as system roles
  const systemRoleCodes = ['tenant_admin', 'admin', 'recruiter', 'viewer', 'billing_manager'];
  const roles = response.data.roles.map((raw: RoleListItem) => {
    const role = { ...raw, name: formatRoleName(raw.name), parent_role_name: raw.parent_role_name ? formatRoleName(raw.parent_role_name) : raw.parent_role_name };
    if (systemRoleCodes.includes(role.code.toLowerCase())) {
      return { ...role, is_system: true };
    }
    return role;
  });

  return {
    ...response.data,
    roles,
  };
}

/**
 * Permission codes for several roles in ONE request
 * (`GET /rbac/roles/permission-codes?ids=`). Ids the caller can't see are
 * absent from the result. Throws on an older backend without the route.
 */
export async function getRolesPermissionCodes(roleIds: number[]): Promise<Record<number, string[]>> {
  const response = await api.get<{ roles: Record<string, string[]> }>(`${RBAC_BASE_URL}/roles/permission-codes`, {
    params: { ids: roleIds.join(',') },
  });
  const out: Record<number, string[]> = {};
  Object.entries(response.data?.roles || {}).forEach(([id, codes]) => { out[Number(id)] = codes || []; });
  return out;
}

export async function getRoleById(roleId: number): Promise<Role> {
  const response = await api.get(`${RBAC_BASE_URL}/roles/${roleId}`);

  // Ensure core system roles are always marked as system roles
  const systemRoleCodes = ['tenant_admin', 'admin', 'recruiter', 'viewer', 'billing_manager'];
  const role = { ...response.data, name: formatRoleName(response.data.name) };
  if (systemRoleCodes.includes(role.code.toLowerCase())) {
    return { ...role, is_system: true };
  }

  return role;
}

export async function createRole(data: RoleCreateRequest): Promise<Role> {
  clearRbacSessionCache();
  try {
    const response = await api.post(`${RBAC_BASE_URL}/roles`, { ...data, name: formatRoleName(data.name).trim() });
    return response.data;
  } finally {
    clearRbacSessionCache();
  }
}

export async function updateRole(roleId: number, data: RoleUpdateRequest): Promise<Role> {
  const payload = data.name !== undefined && data.name !== null ? { ...data, name: formatRoleName(data.name).trim() } : data;
  clearRbacSessionCache();
  try {
    const response = await api.put(`${RBAC_BASE_URL}/roles/${roleId}`, payload);
    return response.data;
  } finally {
    clearRbacSessionCache();
  }
}

export async function deleteRole(roleId: number): Promise<void> {
  clearRbacSessionCache();
  try {
    await api.delete(`${RBAC_BASE_URL}/roles/${roleId}`);
  } finally {
    clearRbacSessionCache();
  }
}

// ============================================
// User Role APIs
// ============================================

export async function getUserRoles(userId: string): Promise<UserRolesResponse> {
  const response = await api.get(`${RBAC_BASE_URL}/users/${userId}/roles`);
  return response.data;
}

export async function assignUserRoles(
  userId: string,
  data: UserRoleAssignmentRequest
): Promise<UserRolesResponse> {
  clearRbacSessionCache();
  try {
    const response = await api.put(`${RBAC_BASE_URL}/users/${userId}/roles`, data);
    return response.data;
  } finally {
    clearRbacSessionCache();
  }
}

// ============================================
// Permission Check APIs
// ============================================

export async function getMyPermissions(): Promise<{
  user_id: string;
  is_tenant_admin: boolean;
  permissions: string[];
  roles: string[];
  legacy_mode?: boolean;
}> {
  const response = await api.get(`${RBAC_BASE_URL}/me/permissions`);
  return response.data;
}

export async function checkPermissions(
  permissionCodes: string[]
): Promise<PermissionCheckResponse> {
  const response = await api.post(`${RBAC_BASE_URL}/check-permissions`, {
    permission_codes: permissionCodes,
  });
  return response.data;
}

// ============================================
// Audit Log APIs
// ============================================

export async function getAuditLogs(params: {
  page?: number;
  page_size?: number;
  entity_type?: string;
  entity_id?: string;
  action?: string;
}): Promise<{
  logs: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}> {
  const response = await api.get(`${RBAC_BASE_URL}/audit-logs`, { params });
  return response.data;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Check if user has a specific permission
 */
export async function hasPermission(permissionCode: string): Promise<boolean> {
  try {
    const result = await checkPermissions([permissionCode]);
    return result.permissions[permissionCode] || false;
  } catch {
    return false;
  }
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(permissionCodes: string[]): Promise<boolean> {
  try {
    const result = await checkPermissions(permissionCodes);
    return Object.values(result.permissions).some(Boolean);
  } catch {
    return false;
  }
}

/**
 * Check if user has all of the specified permissions
 */
export async function hasAllPermissions(permissionCodes: string[]): Promise<boolean> {
  try {
    const result = await checkPermissions(permissionCodes);
    return Object.values(result.permissions).every(Boolean);
  } catch {
    return false;
  }
}

// Export as default object for convenience
const rbacService = {
  getPermissions,
  getPermissionsCached,
  clearSessionCache: clearRbacSessionCache,
  getPermissionModules,
  getRoles,
  getRoleById,
  getRolesPermissionCodes,
  createRole,
  updateRole,
  deleteRole,
  getUserRoles,
  assignUserRoles,
  getMyPermissions,
  checkPermissions,
  getAuditLogs,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
};

export default rbacService;
