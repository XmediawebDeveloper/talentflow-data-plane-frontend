/**
 * Route Access Rules — centralized module-level route authorization.
 *
 * This is the single source of truth for "which permission does a dashboard
 * route require". It exists so that hiding a module from the sidebar
 * (menuSections.ts) and blocking direct URL access (RouteGuard) can never
 * drift apart — both read from the same permission keys the Owner toggles
 * on the User Management page (RBAC01-07 granular `Permission` flags).
 *
 * Semantics per rule (first match wins, longest prefix match):
 *   - allowAll: true        → any authenticated user (tenant_admin or not)
 *   - adminOnly: true        → tenant_admin only, no permission can unlock it
 *   - permissions: string[] → tenant_admin OR any of these permissions (OR match)
 *
 * A path with NO matching rule falls back to `DEFAULT_ADMIN_ONLY_PREFIXES`
 * (tenant_admin only) if it sits under one of those prefixes, otherwise it is
 * allowed — this mirrors the safe-by-default behavior these prefixes already
 * had before granular rules existed for every sub-route.
 */

export interface RouteRule {
  prefix: string;
  permissions?: string[];
  adminOnly?: boolean;
  allowAll?: boolean;
}

// Prefixes that are tenant_admin-only unless a more specific rule below
// grants access via permission. Acts as the safety net for any route added
// under these areas without an explicit rule.
export const DEFAULT_ADMIN_ONLY_PREFIXES = [
  '/organization',
  '/subscription',
  '/settings',
  '/audits',
  '/masters',
];

// The page a blocked user is sent to. Must itself always be allowAll.
export const UNAUTHORIZED_PATH = '/unauthorized';

export const ROUTE_RULES: RouteRule[] = [
  { prefix: UNAUTHORIZED_PATH, allowAll: true },
  { prefix: '/dashboard', allowAll: true },
  { prefix: '/notifications', allowAll: true },
  { prefix: '/help-desk', allowAll: true },
  { prefix: '/help', allowAll: true },

  // RECRUITMENT
  { prefix: '/recruitment/job-openings', permissions: ['canReadJD', 'canCreateJD', 'canUpdateJD', 'canDeleteJD'] },
  { prefix: '/recruitment/jd-creation', permissions: ['canReadJD', 'canCreateJD', 'canUpdateJD', 'canDeleteJD'] },
  { prefix: '/recruitment/jd-list', permissions: ['canReadJD', 'canCreateJD', 'canUpdateJD', 'canDeleteJD'] },
  { prefix: '/recruitment/jd-details', permissions: ['canReadJD', 'canCreateJD', 'canUpdateJD', 'canDeleteJD'] },
  { prefix: '/recruitment/job-details', permissions: ['canReadJD', 'canCreateJD', 'canUpdateJD', 'canDeleteJD'] },
  { prefix: '/recruitment/resume-scoring', permissions: ['canViewScoring', 'canRunScoring'] },
  { prefix: '/recruitment/ai-talent-match', permissions: ['canViewAiMatch', 'canRunAiMatch'] },
  // Resume Database serves BOTH pools as tabs, so it takes the union of their
  // permissions — gating it on the Internal DB keys alone would bounce a user
  // who only has My Resumes. The page itself then shows just the tabs that
  // user is entitled to. /recruitment/my-resumes is a redirect into it and
  // keeps its own (narrower) rule so the old URL still means what it did.
  { prefix: '/recruitment/my-resumes', permissions: ['canViewResumes', 'canUploadResumes', 'canUpdateResumes', 'canDeleteResumes'] },
  { prefix: '/recruitment/resume-database', permissions: ['canViewResumes', 'canUploadResumes', 'canUpdateResumes', 'canDeleteResumes', 'canAccessInternalDB', 'canViewInternalDB', 'canUpdateInternalDB', 'canDeleteInternalDB'] },
  // Detail/view pages reachable from either My Resumes or Internal Database.
  { prefix: '/recruitment/resume-detail', permissions: ['canViewResumes', 'canUploadResumes', 'canUpdateResumes', 'canDeleteResumes', 'canAccessInternalDB', 'canViewInternalDB', 'canUpdateInternalDB', 'canDeleteInternalDB'] },
  { prefix: '/recruitment/resume-view', permissions: ['canViewResumes', 'canUploadResumes', 'canUpdateResumes', 'canDeleteResumes', 'canAccessInternalDB', 'canViewInternalDB', 'canUpdateInternalDB', 'canDeleteInternalDB'] },
  { prefix: '/recruitment/scored-resume-detail', permissions: ['canViewScoring', 'canRunScoring'] },
  { prefix: '/recruitment/assessments', permissions: ['canViewAssessments', 'canCreateAssessments', 'canUpdateAssessments', 'canDeleteAssessments'] },
  { prefix: '/recruitment/ai-interviews', permissions: ['canViewAIInterviews', 'canRunAiInterviews'] },
  { prefix: '/recruitment/hr-question-bank', permissions: ['canViewHRQuestionBank', 'canCreateHRQuestionBank', 'canUpdateHRQuestionBank', 'canDeleteHRQuestionBank'] },

  // REPORTS / ANALYTICS
  { prefix: '/reports', permissions: ['canViewAnalytics'] },

  // MASTER DATA (settings-adjacent configuration)
  { prefix: '/masters', permissions: ['canManageSettings'] },

  // AUDITS — tenant_admin only (mirrors menuSections adminOnly on Audit Trail)
  { prefix: '/audits', adminOnly: true },

  // ORGANIZATION
  { prefix: '/organization/team-chat', allowAll: true },
  { prefix: '/organization/internal-tickets', allowAll: true },
  { prefix: '/organization/team-management', permissions: ['canViewTeams', 'canCreateTeams'] },
  { prefix: '/organization/user-management', permissions: ['canManageUsers'] },
  { prefix: '/organization/company-profile', permissions: ['canManageSettings'] },
  { prefix: '/organization/usage-history', adminOnly: true },
  { prefix: '/organization/role-management', adminOnly: true },
  { prefix: '/organization/usage', permissions: ['canViewUsage'] },

  // SUBSCRIPTION & BILLING
  { prefix: '/subscription/current-plan', permissions: ['canViewCurrentPlan'] },
  { prefix: '/subscription/usage-quotas', permissions: ['canViewUsage'] },
  { prefix: '/subscription/payment-methods', permissions: ['canViewPaymentMethods'] },
  { prefix: '/subscription/billing-history', permissions: ['canViewBillingHistory'] },
  // An invoice's own page — same access as the Billing History list it opens from.
  { prefix: '/subscription/invoices', permissions: ['canViewBillingHistory'] },
  { prefix: '/subscription/refund-history', permissions: ['canViewRefundHistory'] },
  { prefix: '/subscription/dispute-history', permissions: ['canViewDisputeHistory'] },
  { prefix: '/subscription/unit-disputes', permissions: ['canViewUsage'] },

  // SETTINGS
  { prefix: '/settings/general-settings', allowAll: true },
  { prefix: '/settings/permissions', permissions: ['canViewRoles'] },
  { prefix: '/settings/api-management', permissions: ['canViewApiManagement'] },
  { prefix: '/settings/branding', permissions: ['canViewBranding'] },
  { prefix: '/settings/security', permissions: ['canViewSecuritySettings'] },
  { prefix: '/settings/legal', permissions: ['canManageSettings'] },
  // No dedicated permission flag exists for Integrations — same settings-
  // configuration bucket as Legal & Compliance / Company Profile.
  { prefix: '/settings/integrations', permissions: ['canManageSettings'] },

  // SUPPORT
  { prefix: '/support-tickets', permissions: ['canViewSupport'] },
];

interface AuthorizationContext {
  isTenantAdmin: boolean;
  hasPermission: (permission: string) => boolean;
}

/** Returns the most specific (longest prefix) rule matching this path, if any. */
export function findRouteRule(pathname: string): RouteRule | undefined {
  let best: RouteRule | undefined;
  for (const rule of ROUTE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      if (!best || rule.prefix.length > best.prefix.length) {
        best = rule;
      }
    }
  }
  return best;
}

/**
 * Single source of truth for "can the current user open this route".
 * Mirrors filterMenuSections() semantics (tenant_admin bypasses everything,
 * OR-match on a `permissions` list) so a hidden sidebar item and a blocked
 * direct URL always agree.
 */
export function isRouteAuthorized(pathname: string, ctx: AuthorizationContext): boolean {
  const { isTenantAdmin, hasPermission } = ctx;
  if (isTenantAdmin) return true;

  const rule = findRouteRule(pathname);
  if (rule) {
    if (rule.allowAll) return true;
    if (rule.adminOnly) return false; // isTenantAdmin already handled above
    if (rule.permissions && rule.permissions.length > 0) {
      return rule.permissions.some(hasPermission);
    }
    return true;
  }

  // No explicit rule — fall back to the blanket admin-only areas.
  const isDefaultAdminOnly = DEFAULT_ADMIN_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  return !isDefaultAdminOnly;
}
