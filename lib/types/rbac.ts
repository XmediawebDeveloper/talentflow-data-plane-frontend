/**
 * RBAC Types - Role-Based Access Control
 */

// Permission types
export interface Permission {
  id: number;
  code: string;
  name: string;
  description?: string;
  module: string;
  action: string;
  is_system: boolean;
}

// Role types
export interface Role {
  id: number;
  tenant_id?: string;
  code: string;
  name: string;
  description?: string;
  is_system: boolean;
  is_default: boolean;
  priority: number;
  parent_role_id?: number;
  parent_role_name?: string;
  permissions: RolePermission[];
  user_count: number;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  id: number;
  code: string;
  name: string;
  module: string;
  action: string;
}

export interface RoleListItem {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_system: boolean;
  is_default: boolean;
  priority: number;
  parent_role_id?: number;
  parent_role_name?: string;
  permission_count: number;
  user_count: number;
}

// User role types
export interface UserRole {
  id: number;
  role_id: number;
  role_code: string;
  role_name: string;
  assigned_at: string;
  expires_at?: string;
  is_active: boolean;
}

export interface UserRolesResponse {
  user_id: string;
  roles: UserRole[];
  effective_permissions: string[];
}

// Audit log types - uses main audit_logs table with RBAC action filters
export interface AuditLogEntry {
  id: string | number;  // Can be UUID string from main audit_logs
  action: string;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  changes?: Record<string, unknown>;
  performed_by?: string;
  performed_by_name?: string;
  performed_at?: string;
  ip_address?: string;
}

// Request/Response types
export interface RoleCreateRequest {
  name: string;
  code: string;
  description?: string;
  priority?: number;
  parent_role_id?: number;
  permission_ids: number[];
}

export interface RoleUpdateRequest {
  name?: string;
  description?: string;
  priority?: number;
  parent_role_id?: number;
  permission_ids?: number[];
}

export interface UserRoleAssignmentRequest {
  role_ids: number[];
  expires_at?: string;
}

export interface PermissionCheckResponse {
  user_id: string;
  permissions: Record<string, boolean>;
  roles: string[];
}

// Permission modules
export const PERMISSION_MODULES: Record<string, string> = {
  jd: 'Job Descriptions',
  resumes: 'Resumes',
  internal_db: 'Internal Database',
  assessments: 'Assessments',
  analytics: 'Analytics',
  settings: 'Settings',
  users: 'Users',
  roles: 'Roles',
  // RBAC03: Billing Manager modules
  billing: 'Billing & Subscriptions',
  invoices: 'Invoices & Payments',
  usage: 'Usage & Quotas',
};

// Permission actions
export const PERMISSION_ACTIONS: Record<string, string> = {
  create: 'Create',
  read: 'View',
  update: 'Edit',
  delete: 'Delete',
};

// Helper to get module display name
export function getModuleDisplayName(module: string): string {
  return PERMISSION_MODULES[module] || module;
}

// Helper to get action display name
export function getActionDisplayName(action: string): string {
  return PERMISSION_ACTIONS[action] || action;
}

// Helper to parse permission code
export function parsePermissionCode(code: string): { module: string; action: string } {
  const [module, action] = code.split(':');
  return { module, action };
}
