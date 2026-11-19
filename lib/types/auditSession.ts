/**
 * Audit Session Types — Error Origin, Error Codes, Session Tracking
 * Implements: Sections 3-7, 14 of "Audit Logs and Error Codes" document
 */

// =========================================================================
// ERROR ORIGIN CLASSIFICATION (Section 5)
// =========================================================================

export type ErrorOrigin = 'TENANT' | 'SYSTEM' | 'NONE';

// =========================================================================
// ERROR CODES (Section 7)
// =========================================================================

/** 7.1 Tenant-Side Error Codes — Full unit charged */
export type TenantErrorCode =
  | 'TENANT_BROWSER_CLOSED'
  | 'TENANT_NETWORK_DISCONNECT'
  | 'TENANT_MANUAL_TERMINATION'
  | 'TENANT_SESSION_TIMEOUT'
  | 'TENANT_DEVICE_FAILURE'
  // RBAC business-rule violations
  | 'TENANT_DUPLICATE_ROLE_CODE'
  | 'TENANT_INVALID_PERMISSION_ASSIGNMENT'
  | 'TENANT_SYSTEM_ROLE_PROTECTED';

/** 7.2 System-Side Error Codes — Full refund */
export type SystemErrorCode =
  | 'SYSTEM_SERVER_ERROR'
  | 'SYSTEM_DATABASE_FAILURE'
  | 'SYSTEM_QUEUE_FAILURE'
  | 'SYSTEM_PROVIDER_API_ERROR'
  | 'SYSTEM_EVALUATION_FAILURE'
  | 'SYSTEM_UNEXPECTED_EXCEPTION';

/** Combined error code type */
export type SessionErrorCode = TenantErrorCode | SystemErrorCode | null;

// =========================================================================
// SESSION TYPES (Sections 3, 4, 14)
// =========================================================================

export type RefundFlag = 'YES' | 'NO';

export type SessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'INTERRUPTED';

/** Module types that use session-based tracking (Section 13) */
export type SessionModuleType = 'AS' | 'AIU';

/** Fields added to audit_logs for session tracking (Section 14) */
export interface SessionAuditFields {
  session_start_time: string | null;
  interruption_time: string | null;
  session_end_time: string | null;
  total_session_duration: number | null; // seconds
  error_origin: ErrorOrigin;
  error_code: SessionErrorCode;
  refund_flag: RefundFlag;
  module_type: string | null;
}

// =========================================================================
// DISPLAY HELPERS — Labels
// =========================================================================

export const ERROR_CODE_LABELS: Record<string, string> = {
  // Tenant-side
  TENANT_BROWSER_CLOSED: 'Browser Closed',
  TENANT_NETWORK_DISCONNECT: 'Network Disconnected',
  TENANT_MANUAL_TERMINATION: 'Manually Terminated',
  TENANT_SESSION_TIMEOUT: 'Session Timed Out',
  TENANT_DEVICE_FAILURE: 'Device Failure',
  // RBAC business-rule violations
  TENANT_DUPLICATE_ROLE_CODE: 'Duplicate Role Code',
  TENANT_INVALID_PERMISSION_ASSIGNMENT: 'Invalid Permission Assignment',
  TENANT_SYSTEM_ROLE_PROTECTED: 'System Role Protected',
  // System-side
  SYSTEM_SERVER_ERROR: 'Server Error',
  SYSTEM_DATABASE_FAILURE: 'Database Failure',
  SYSTEM_QUEUE_FAILURE: 'Queue Failure',
  SYSTEM_PROVIDER_API_ERROR: 'API Provider Error',
  SYSTEM_EVALUATION_FAILURE: 'Evaluation Failure',
  SYSTEM_UNEXPECTED_EXCEPTION: 'Unexpected Exception',
};

export const ERROR_ORIGIN_LABELS: Record<ErrorOrigin, string> = {
  TENANT: 'Tenant-Side',
  SYSTEM: 'System-Side',
  NONE: 'None',
};

export const MODULE_TYPE_LABELS: Record<string, string> = {
  AUTHENTICATION:    'Authentication',
  SIGNUP:            'Signup',
  USER_MANAGEMENT:   'User Management',
  RBAC:              'Roles & Permissions',
  FEATURE_MANAGEMENT: 'Feature Management',
  JOB_MANAGEMENT:    'Job Descriptions',
  RESUME_MANAGEMENT: 'Resume Management',
  RESUME_UPLOAD:     'Resume Upload',
  AI_PROCESSING:     'AI Processing',
  FOLDER_MANAGEMENT: 'Folder Management',
  RESUME_SCORING:    'Resume Scoring',
  AI_TALENT_MATCH:   'AI Talent Match',
  ASSESSMENT:        'Assessment',
  AI_INTERVIEW:      'AI Interview',
  BILLING:           'Billing',
  USAGE_TRACKING:    'Usage Tracking',
  TENANT_LIFECYCLE:  'Tenant Lifecycle',
  ACCESS_CONTROL:    'Access Control',
  SETTINGS:          'Settings',
  TEAM_MANAGEMENT:   'Team Management',
  REPORTS_EXPORT:    'Reports & Export',
  MASTER_DATA:       'Master Data',
  GENERAL:           'General',
};

// =========================================================================
// DISPLAY HELPERS — Colors (Tailwind classes)
// =========================================================================

export const ERROR_ORIGIN_COLORS: Record<ErrorOrigin, string> = {
  TENANT: 'bg-amber-100 text-amber-800 border border-amber-200',
  SYSTEM: 'bg-red-100 text-red-800 border border-red-200',
  NONE: 'bg-green-100 text-green-800 border border-green-200',
};

export const ERROR_CODE_COLORS: Record<string, string> = {
  // Tenant-side — amber
  TENANT_BROWSER_CLOSED: 'bg-amber-50 text-amber-700',
  TENANT_NETWORK_DISCONNECT: 'bg-amber-50 text-amber-700',
  TENANT_MANUAL_TERMINATION: 'bg-amber-50 text-amber-700',
  TENANT_SESSION_TIMEOUT: 'bg-amber-50 text-amber-700',
  TENANT_DEVICE_FAILURE: 'bg-amber-50 text-amber-700',
  TENANT_DUPLICATE_ROLE_CODE: 'bg-amber-50 text-amber-700',
  TENANT_INVALID_PERMISSION_ASSIGNMENT: 'bg-amber-50 text-amber-700',
  TENANT_SYSTEM_ROLE_PROTECTED: 'bg-amber-50 text-amber-700',
  // System-side — red
  SYSTEM_SERVER_ERROR: 'bg-red-50 text-red-700',
  SYSTEM_DATABASE_FAILURE: 'bg-red-50 text-red-700',
  SYSTEM_QUEUE_FAILURE: 'bg-red-50 text-red-700',
  SYSTEM_PROVIDER_API_ERROR: 'bg-red-50 text-red-700',
  SYSTEM_EVALUATION_FAILURE: 'bg-red-50 text-red-700',
  SYSTEM_UNEXPECTED_EXCEPTION: 'bg-red-50 text-red-700',
};

export const REFUND_FLAG_COLORS: Record<RefundFlag, string> = {
  YES: 'bg-green-100 text-green-800 border border-green-200',
  NO: 'bg-gray-100 text-gray-600 border border-gray-200',
};

// =========================================================================
// UTILITY FUNCTIONS
// =========================================================================

/** Derive error origin from an error code */
export function getErrorOriginFromCode(code: string | null): ErrorOrigin {
  if (!code) return 'NONE';
  if (code.startsWith('TENANT_')) return 'TENANT';
  if (code.startsWith('SYSTEM_')) return 'SYSTEM';
  return 'NONE';
}

/** Get billing impact based on error origin (Section 6) */
export function getBillingImpact(errorOrigin: ErrorOrigin): {
  units_deducted: 0 | 1;
  refund_flag: RefundFlag;
  description: string;
} {
  switch (errorOrigin) {
    case 'TENANT':
      return {
        units_deducted: 1,
        refund_flag: 'NO',
        description: 'Tenant-side interruption — 1 unit charged, no refund',
      };
    case 'SYSTEM':
      return {
        units_deducted: 0,
        refund_flag: 'YES',
        description: 'System-side failure — 0 units charged, full refund',
      };
    case 'NONE':
    default:
      return {
        units_deducted: 1,
        refund_flag: 'NO',
        description: 'Normal completion — 1 unit charged',
      };
  }
}

/** Check if an action is session-based (AS or AIU) */
export function isSessionBasedAction(action: string): boolean {
  const sessionActions = [
    'assessment_start', 'assessment_complete',
    'session_start', 'session_complete', 'session_interrupted',
  ];
  return sessionActions.includes(action);
}

/** Check if a module type uses session tracking */
export function isSessionModule(moduleType: string | null): boolean {
  return moduleType === 'AS' || moduleType === 'AIU';
}

/** Format session duration in seconds to human-readable string */
export function formatSessionDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

/** All tenant error codes */
export const TENANT_ERROR_CODES: TenantErrorCode[] = [
  'TENANT_BROWSER_CLOSED',
  'TENANT_NETWORK_DISCONNECT',
  'TENANT_MANUAL_TERMINATION',
  'TENANT_SESSION_TIMEOUT',
  'TENANT_DEVICE_FAILURE',
  'TENANT_DUPLICATE_ROLE_CODE',
  'TENANT_INVALID_PERMISSION_ASSIGNMENT',
  'TENANT_SYSTEM_ROLE_PROTECTED',
];

/** All system error codes */
export const SYSTEM_ERROR_CODES: SystemErrorCode[] = [
  'SYSTEM_SERVER_ERROR',
  'SYSTEM_DATABASE_FAILURE',
  'SYSTEM_QUEUE_FAILURE',
  'SYSTEM_PROVIDER_API_ERROR',
  'SYSTEM_EVALUATION_FAILURE',
  'SYSTEM_UNEXPECTED_EXCEPTION',
];

/** All error codes combined */
export const ALL_ERROR_CODES = [...TENANT_ERROR_CODES, ...SYSTEM_ERROR_CODES];
