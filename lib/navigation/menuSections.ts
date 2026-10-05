// Shared navigation menu config used by both the Sidebar and the
// Dashboard menu grid. Edit menu items here once — both views update.

import {
  LayoutDashboard,
  FileSignature,
  Users,
  Database,
  ClipboardList,
  Video,
  CreditCard,
  Building2,
  Settings,
  ScrollText,
  HelpCircle,
  Headphones,
  type LucideIcon,
} from 'lucide-react';
// Drawn in-house because no lucide glyph carries these two meanings — see the
// file for the reasoning. Both are lucide-shaped, so they slot in unchanged.
import { ResumeScoringIcon, TalentMatchIcon } from '@/components/icons/nav-icons';
import type { PlanFeatureKey } from '@/lib/types/planFeatures';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  permission?: string;           // Single permission check (legacy)
  permissions?: string[];        // Multiple permissions check (show if ANY match)
  adminOnly?: boolean;
  internalUserOnly?: boolean;    // Show only to non-admin users (for internal help desk)
  planFeature?: PlanFeatureKey;  // Plan-level feature gate
  /** Set by filterMenuSections when the item fails its permission or plan
   *  check. The tile stays in the list (visible) but the renderer must show it
   *  as disabled/non-clickable instead of a working link, with
   *  `disabledReason` picking the hover message. adminOnly/internalUserOnly
   *  are audience gates and stay hard hides. */
  disabled?: boolean;
  disabledReason?: 'permission' | 'plan';
}

/** Hover text for a disabled menu item, keyed by why it is disabled. */
export const DISABLED_REASON_MESSAGE: Record<'permission' | 'plan', string> = {
  permission: 'You do not have permission to access this',
  plan: 'Your current plan does not have access to this feature',
};

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

/**
 * Build the full navigation section list. The only piece that varies per user
 * is the dashboard label ("Admin Dashboard" vs "Dashboard"); permission/plan
 * gating happens in the consumer.
 */
export function buildMenuSections(isTenantAdmin: boolean): NavSection[] {
  return [
    // ADMINISTRATION
    {
      id: 'administration',
      label: 'ADMINISTRATION',
      items: [
        { id: 'dashboard', label: isTenantAdmin ? 'Admin Dashboard' : 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      ],
    },

    // RECRUITMENT
    {
      id: 'recruitment',
      label: 'RECRUITMENT',
      items: [
        { id: 'job-openings', label: 'Job Descriptions', icon: FileSignature, href: '/recruitment/job-openings', permissions: ['canReadJD', 'canCreateJD', 'canUpdateJD', 'canDeleteJD'] },
        { id: 'resume-scoring', label: 'Resume Scoring', icon: ResumeScoringIcon, href: '/recruitment/resume-scoring', permissions: ['canViewScoring'], planFeature: 'resume_scoring' },
        { id: 'ai-talent-match', label: 'AI Talent Match', icon: TalentMatchIcon, href: '/recruitment/ai-talent-match', permissions: ['canViewAiMatch'], planFeature: 'ai_talent_match' },
      ],
    },

    // EVALUATION
    {
      id: 'evaluation',
      label: 'EVALUATION',
      items: [
        { id: 'assessments', label: 'AI Assessments', icon: ClipboardList, href: '/recruitment/assessments', permissions: ['canViewAssessments', 'canCreateAssessments', 'canUpdateAssessments', 'canDeleteAssessments'], planFeature: 'assessment' },
        { id: 'ai-interviews', label: 'AI Interviews', icon: Video, href: '/recruitment/ai-interviews', permissions: ['canViewAIInterviews', 'canRunAiInterviews'], planFeature: 'ai_interview' },
        // HR Question Bank is reached from quick links on the Assessments (/recruitment/assessments) and AI Interviews (/recruitment/ai-interviews) pages.
      ],
    },

    // RESUME MANAGEMENT
    {
      id: 'resume-management',
      label: 'RESUME MANAGEMENT',
      items: [
        // My Resumes and Internal Database were two separate entries pointing at
        // two routes. They are one dataset at two scopes (the API's `source`
        // parameter), so they are now two tabs of this one page — see
        // app/(dashboard)/recruitment/resume-database/page.tsx. The permission
        // list is the union of both tabs': holding any one of them makes at
        // least one tab reachable, and the page picks the first tab the user is
        // entitled to.
        { id: 'resume-database', label: 'Resume Database', icon: Database, href: '/recruitment/resume-database', permissions: ['canViewResumes', 'canUploadResumes', 'canUpdateResumes', 'canDeleteResumes', 'canAccessInternalDB', 'canViewInternalDB', 'canUpdateInternalDB', 'canDeleteInternalDB'], planFeature: 'resume_upload' },
      ],
    },

    // USER MANAGEMENT
    {
      id: 'user-management-section',
      label: 'USER MANAGEMENT',
      items: [
        { id: 'user-management', label: 'User Management', icon: Users, href: '/organization/user-management', permission: 'canManageUsers' },
        // Usage History, Roles & Permissions, Teams and Chat are reached from the quick links on the Users (/organization/user-management) page.
      ],
    },

    // SUBSCRIPTION & BILLING - RBAC03: Billing Manager access
    {
      id: 'subscription',
      label: 'SUBSCRIPTION & BILLING',
      items: [
        { id: 'current-plan', label: 'Current Plan', icon: CreditCard, href: '/subscription/current-plan', permission: 'canViewCurrentPlan' },
        // Usage & Quotas, Payment Methods, Billing History, Refund History, Dispute History and Unit Disputes
        // are reached from the quick links on the Current Plan (/subscription/current-plan) page.
      ],
    },

    // ORGANIZATION
    {
      id: 'organization',
      label: 'ORGANIZATION',
      items: [
        { id: 'company-profile', label: 'Company Profile', icon: Building2, href: '/organization/company-profile', permission: 'canManageSettings' },
      ],
    },

    // SETTINGS - Permission-based access
    {
      id: 'settings',
      label: 'SETTINGS',
      items: [
        { id: 'general-settings', label: 'Profile Settings', icon: Settings, href: '/settings/general-settings' },
        // Permissions & Roles, API Management, Branding & White Label, Security Settings and Legal & Compliance
        // are reached from the "Workspace & Admin" links inside the Profile Settings (/settings/general-settings) page.
      ],
    },

    // AUDITS & TRAIL - Tenant Admin Only
    {
      id: 'audits',
      label: 'AUDITS & TRAIL',
      items: [
        { id: 'audit-trail', label: 'Audit Trail', icon: ScrollText, href: '/audits/trail', adminOnly: true },
        // Activity Logs is reached from the quick link on the Audit Trail (/audits/trail) page.
      ],
    },

    // SUPPORT
    {
      id: 'support',
      label: 'SUPPORT',
      items: [
        { id: 'support-tickets', label: 'Support Tickets', icon: HelpCircle, href: '/support-tickets', permission: 'canViewSupport' },
        { id: 'help-desk', label: 'Help Desk', icon: Headphones, href: '/help-desk', internalUserOnly: true },
      ],
    },
  ];
}

interface FilterOptions {
  isTenantAdmin: boolean;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
  hasPlanFeature: (key: PlanFeatureKey) => boolean;
  planFeaturesLoading: boolean;
}

/**
 * Apply admin / audience filters (hard hides) and permission + plan filters
 * (soft: item stays, flagged `disabled` with a `disabledReason`), then drop
 * empty sections. Mirrors the filtering used by the sidebar render loop.
 *
 * Permission and plan gating deliberately do NOT remove the item — a module
 * the user can't open renders visible-but-disabled with a hover message, the
 * same rule applied to in-page action icons. Hiding plan-gated items used to
 * make them flash in and vanish once /quota-status resolved; while plan
 * features are still loading the item renders normally (no layout shift),
 * and only greys out if the plan turns out not to include it.
 * adminOnly/internalUserOnly are audience targeting and stay hard hides.
 */
export function filterMenuSections(sections: NavSection[], opts: FilterOptions): NavSection[] {
  const { isTenantAdmin, hasPermission, hasAnyPermission, hasPlanFeature, planFeaturesLoading } = opts;
  return sections
    .map(section => {
      const items = section.items
        .filter(item => {
          if (item.adminOnly && !isTenantAdmin) return false;
          if (item.internalUserOnly && isTenantAdmin) return false;
          return true;
        })
        .map((item): NavItem => {
          // Plan first: no permission grant can unlock a module the plan lacks.
          if (item.planFeature && !planFeaturesLoading && !hasPlanFeature(item.planFeature)) {
            return { ...item, disabled: true, disabledReason: 'plan' };
          }
          const lacksPermission =
            item.permissions && item.permissions.length > 0
              ? !hasAnyPermission(item.permissions)
              : !!(item.permission && !hasPermission(item.permission));
          return lacksPermission ? { ...item, disabled: true, disabledReason: 'permission' } : item;
        });

      return { ...section, items };
    })
    .filter(section => {
      if (section.items.length === 0) return false;
      if (section.adminOnly && !isTenantAdmin) return false;
      return true;
    });
}
