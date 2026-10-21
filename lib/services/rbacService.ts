/**
 * RBAC Service - API client for Role-Based Access Control
 */

import api from './api';
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

export async function getRoles(): Promise<{
  roles: RoleListItem[];
  total: number;
}> {
  const response = await api.get(`${RBAC_BASE_URL}/roles`);

  // Ensure core system roles are always marked as system roles
  const systemRoleCodes = ['tenant_admin', 'admin', 'recruiter', 'viewer'];
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

export async function getRoleById(roleId: number): Promise<Role> {
  const response = await api.get(`${RBAC_BASE_URL}/roles/${roleId}`);

  // Ensure core system roles are always marked as system roles
  const systemRoleCodes = ['tenant_admin', 'admin', 'recruiter', 'viewer'];
  const role = { ...response.data, name: formatRoleName(response.data.name) };
  if (systemRoleCodes.includes(role.code.toLowerCase())) {
    return { ...role, is_system: true };
  }

  return role;
}

export async function createRole(data: RoleCreateRequest): Promise<Role> {
  const response = await api.post(`${RBAC_BASE_URL}/roles`, { ...data, name: formatRoleName(data.name).trim() });
  return response.data;
}

export async function updateRole(roleId: number, data: RoleUpdateRequest): Promise<Role> {
  const payload = data.name !== undefined && data.name !== null ? { ...data, name: formatRoleName(data.name).trim() } : data;
  const response = await api.put(`${RBAC_BASE_URL}/roles/${roleId}`, payload);
  return response.data;
}

export async function deleteRole(roleId: number): Promise<void> {
  await api.delete(`${RBAC_BASE_URL}/roles/${roleId}`);
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
  const response = await api.put(`${RBAC_BASE_URL}/users/${userId}/roles`, data);
  return response.data;
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
  getPermissionModules,
  getRoles,
  getRoleById,
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
