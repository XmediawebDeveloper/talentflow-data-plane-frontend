// Shared navigation menu config used by both the Sidebar and the
// Dashboard menu grid. Edit menu items here once — both views update.

import {
  LayoutDashboard,
  FileSignature,
  FolderOpen,
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
}

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

    // RESUME MANAGEMENT
    {
      id: 'resume-management',
      label: 'RESUME MANAGEMENT',
      items: [
        { id: 'my-resumes', label: 'My Resumes', icon: FolderOpen, href: '/recruitment/my-resumes', permissions: ['canViewResumes', 'canUploadResumes', 'canUpdateResumes', 'canDeleteResumes'], planFeature: 'resume_upload' },
        { id: 'resume-database', label: 'Internal Database', icon: Database, href: '/recruitment/resume-database', permissions: ['canAccessInternalDB', 'canViewInternalDB', 'canUpdateInternalDB', 'canDeleteInternalDB'], planFeature: 'resume_upload' },
      ],
    },

    // EVALUATION
    {
      id: 'evaluation',
      label: 'EVALUATION',
      items: [
        { id: 'assessments', label: 'Assessments', icon: ClipboardList, href: '/recruitment/assessments', permissions: ['canViewAssessments', 'canCreateAssessments', 'canUpdateAssessments', 'canDeleteAssessments'], planFeature: 'assessment' },
        { id: 'ai-interviews', label: 'AI Interviews', icon: Video, href: '/recruitment/ai-interviews', permissions: ['canViewAIInterviews', 'canRunAiInterviews'], planFeature: 'ai_interview' },
        // HR Question Bank is reached from quick links on the Assessments (/recruitment/assessments) and AI Interviews (/recruitment/ai-interviews) pages.
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
 * Apply permission / admin / plan-feature filters and drop empty sections.
 * Mirrors the filtering used by the sidebar render loop.
 */
export function filterMenuSections(sections: NavSection[], opts: FilterOptions): NavSection[] {
  const { isTenantAdmin, hasPermission, hasAnyPermission, hasPlanFeature, planFeaturesLoading } = opts;
  return sections
    .map(section => {
      const filteredItems = section.items.filter(item => {
        if (item.adminOnly && !isTenantAdmin) return false;
        if (item.internalUserOnly && isTenantAdmin) return false;
        if (item.permissions && item.permissions.length > 0) {
          if (!hasAnyPermission(item.permissions)) return false;
        } else if (item.permission && !hasPermission(item.permission)) {
          return false;
        }
        // Hide plan-gated items once we know the plan doesn't include the feature.
        if (item.planFeature && !planFeaturesLoading && !hasPlanFeature(item.planFeature)) {
          return false;
        }
        return true;
      });

      return { ...section, items: filteredItems };
    })
    .filter(section => {
      if (section.items.length === 0) return false;
      if (section.adminOnly && !isTenantAdmin) return false;
      return true;
    });
}
