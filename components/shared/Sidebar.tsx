'use client';

import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Settings,
  BarChart3,
  HelpCircle,
  FileText,
  Target,
  Sparkles,
  ClipboardList,
  Video,
  Users,
  Database,
  UserCog,
  Shield,
  Key,
  Palette,
  Link as LinkIcon,
  Lock,
  Receipt,
  Wallet,
  RefreshCw,
  AlertTriangle,
  Activity,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Layers,
  GraduationCap,
  Clock,
  Factory,
  History,
  ScrollText,
  MessageCircle,
  Headphones,
  Inbox,
  ShieldCheck
} from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';
import { PlanFeatureKey, PLAN_FEATURE_METADATA } from '@/lib/types/planFeatures';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';

interface SidebarProps {
  user?: User;
  tenant?: Tenant;
  subscriptionExpired?: boolean | undefined;  // undefined = loading/unknown (default to locked)
  accountSuspended?: boolean;  // true = account suspended, block all navigation
  onClose?: () => void;  // Close mobile menu
}

// Paths allowed even when subscription is expired
const SUBSCRIPTION_ALLOWED_PATHS = [
  '/subscription/current-plan',
  '/subscription/payment-methods',
  '/subscription/usage-quotas',
  '/support-tickets',
];

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
  permission?: string;           // Single permission check (legacy)
  permissions?: string[];        // Multiple permissions check (show if ANY match)
  adminOnly?: boolean;
  internalUserOnly?: boolean;    // Show only to non-admin users (for internal help desk)
  planFeature?: PlanFeatureKey;  // Plan-level feature gate
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

export default function Sidebar({ user, tenant, subscriptionExpired, accountSuspended, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { hasPlanFeature, loading: planFeaturesLoading } = usePlanFeatures();

  // Track which list page the user came from when viewing resume details
  const [resumeViewSource, setResumeViewSource] = useState<string | null>(null);
  useEffect(() => {
    if (pathname.startsWith('/recruitment/resume-view/')) {
      try {
        const src = sessionStorage.getItem('resumeNavSource');
        setResumeViewSource(src);
      } catch { setResumeViewSource(null); }
    } else {
      setResumeViewSource(null);
    }
  }, [pathname]);
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'administration', 'recruitment', 'resume-management', 'evaluation',
    'organization', 'user-management-section', 'masters', 'subscription', 'settings', 'reports', 'audits'
  ]);
  const [forceRender, setForceRender] = useState(0);

  const roleLabels = {
    tenant_admin: 'Owner',
    recruiter: 'Recruiter',
    viewer: 'Viewer',
  };

  const isTenantAdmin = user?.role === 'tenant_admin';

  // ✅ Listen for permission updates (from hard refresh or permission changes)
  useEffect(() => {
    const handlePermissionsUpdated = () => {
      console.log('[SIDEBAR] Permissions updated, forcing re-render');
      setForceRender(prev => prev + 1); // Force re-render to show updated menus
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('permissions-updated', handlePermissionsUpdated);
      return () => window.removeEventListener('permissions-updated', handlePermissionsUpdated);
    }
  }, []);

  // Debug: Log user permissions on sidebar render
  console.log('[SIDEBAR] User:', user?.email, 'Role:', user?.role, 'Permissions:', user?.permissions, 'ForceRender:', forceRender);

  /**
   * PERMISSION CHECKING LOGIC:
   *
   * 1. tenant_admin → ALWAYS returns true (bypass all checks)
   * 2. All other roles → Check ONLY the explicitly assigned permissions
   *    - Permissions come from backend API (user.permissions)
   *    - NO role-based defaults are applied
   *    - If permission is not in user.permissions, access is DENIED
   *
   * This ensures users ONLY see menus for permissions explicitly granted to them.
   */

  // Check if user has a specific permission
  const hasPermission = (permission?: string): boolean => {
    if (!permission) return true;

    // tenant_admin bypasses all permission checks
    if (isTenantAdmin) return true;

    // For all other roles, check ONLY explicitly assigned permissions
    if (!user?.permissions) {
      console.log('[SIDEBAR] No permissions found for user');
      return false;
    }

    const hasAccess = user.permissions[permission as keyof typeof user.permissions] === true;
    console.log(`[SIDEBAR] Permission check: ${permission} = ${hasAccess}`);
    return hasAccess;
  };

  // Check if user has ANY of the specified permissions (for grouped checks)
  const hasAnyPermission = (permissions: string[]): boolean => {
    // tenant_admin bypasses all permission checks
    if (isTenantAdmin) return true;

    // For all other roles, check ONLY explicitly assigned permissions
    if (!user?.permissions) return false;

    const hasAny = permissions.some(perm =>
      user.permissions[perm as keyof typeof user.permissions] === true
    );
    console.log(`[SIDEBAR] Any permission check: ${permissions.join(', ')} = ${hasAny}`);
    return hasAny;
  };

  // Define menu sections with grouped items
  const allSections: NavSection[] = [
    // ADMINISTRATION
    {
      id: 'administration',
      label: 'ADMINISTRATION',
      items: [
        { id: 'dashboard', label: isTenantAdmin ? 'Admin Dashboard' : 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      ]
    },

    // RECRUITMENT
    {
      id: 'recruitment',
      label: 'RECRUITMENT',
      items: [
        { id: 'job-openings', label: 'Job Descriptions', icon: Briefcase, href: '/recruitment/job-openings', permissions: ['canReadJD', 'canCreateJD', 'canUpdateJD', 'canDeleteJD'] },
        { id: 'resume-scoring', label: 'Resume Scoring', icon: Target, href: '/recruitment/resume-scoring', permissions: ['canViewScoring'], planFeature: 'resume_scoring' },
        { id: 'ai-talent-match', label: 'AI Talent Match', icon: Sparkles, href: '/recruitment/ai-talent-match', permissions: ['canViewAiMatch'], planFeature: 'ai_talent_match' },
      ]
    },

    // RESUME MANAGEMENT
    {
      id: 'resume-management',
      label: 'RESUME MANAGEMENT',
      items: [
        { id: 'my-resumes', label: 'My Resumes', icon: Users, href: '/recruitment/my-resumes', permissions: ['canViewResumes', 'canUploadResumes', 'canUpdateResumes', 'canDeleteResumes'], planFeature: 'resume_upload' },
        { id: 'resume-database', label: 'Internal Database', icon: Database, href: '/recruitment/resume-database', permissions: ['canAccessInternalDB', 'canViewInternalDB', 'canUpdateInternalDB', 'canDeleteInternalDB'], planFeature: 'resume_upload' },
      ]
    },

    // EVALUATION
    {
      id: 'evaluation',
      label: 'EVALUATION',
      items: [
        { id: 'assessments', label: 'Assessments', icon: ClipboardList, href: '/recruitment/assessments', permissions: ['canViewAssessments', 'canCreateAssessments', 'canUpdateAssessments', 'canDeleteAssessments'], planFeature: 'assessment' },
        { id: 'ai-interviews', label: 'AI Interviews', icon: Video, href: '/recruitment/ai-interviews', permissions: ['canViewAIInterviews', 'canRunAiInterviews'], planFeature: 'ai_interview' },
        { id: 'hr-question-bank', label: 'HR Question Bank', icon: ClipboardList, href: '/recruitment/hr-question-bank', permissions: ['canViewHRQuestionBank', 'canCreateHRQuestionBank', 'canUpdateHRQuestionBank', 'canDeleteHRQuestionBank'], planFeature: 'assessment' },
      ]
    },

    // USER MANAGEMENT
    {
      id: 'user-management-section',
      label: 'USER MANAGEMENT',
      items: [
        { id: 'user-management', label: 'Users', icon: Users, href: '/organization/user-management', permission: 'canManageUsers' },
        { id: 'usage-history', label: 'Usage History', icon: History, href: '/organization/usage-history', adminOnly: true },
        { id: 'role-management', label: 'Roles & Permissions', icon: Shield, href: '/organization/role-management', permission: 'canManageUsers', adminOnly: true },
        { id: 'team-management', label: 'Teams', icon: UserCog, href: '/organization/team-management', permission: 'canViewTeams', planFeature: 'teams' },
        { id: 'team-chat', label: 'Chat', icon: MessageCircle, href: '/organization/team-chat' },
      ]
    },

    // SUBSCRIPTION & BILLING - RBAC03: Billing Manager access
    {
      id: 'subscription',
      label: 'SUBSCRIPTION & BILLING',
      items: [
        { id: 'current-plan', label: 'Current Plan', icon: CreditCard, href: '/subscription/current-plan', permission: 'canViewCurrentPlan' },
        { id: 'usage-quotas', label: 'Usage & Quotas', icon: BarChart3, href: '/subscription/usage-quotas', permission: 'canViewUsage' },
        { id: 'payment-methods', label: 'Payment Methods', icon: Wallet, href: '/subscription/payment-methods', permission: 'canViewPaymentMethods' },
        { id: 'billing-history', label: 'Billing History', icon: Receipt, href: '/subscription/billing-history', permission: 'canViewBillingHistory' },
        { id: 'refund-history', label: 'Refund History', icon: RefreshCw, href: '/subscription/refund-history', permission: 'canViewRefundHistory' },
        { id: 'dispute-history', label: 'Dispute History', icon: AlertTriangle, href: '/subscription/dispute-history', permission: 'canViewDisputeHistory' },
        { id: 'unit-disputes', label: 'Unit Disputes', icon: Shield, href: '/subscription/unit-disputes', permission: 'canViewUsage' },
      ]
    },

    // MASTERS - Settings permission required
    {
      id: 'masters',
      label: 'MASTERS',
      items: [
        { id: 'experience-levels', label: 'Experience Levels', icon: Clock, href: '/masters/experience-levels', permission: 'canManageSettings' },
        { id: 'education-levels', label: 'Education Levels', icon: GraduationCap, href: '/masters/education-levels', permission: 'canManageSettings' },
        { id: 'industry-types', label: 'Industry Types', icon: Factory, href: '/masters/industry-types', permission: 'canManageSettings' },
      ]
    },

    // ORGANIZATION
    {
      id: 'organization',
      label: 'ORGANIZATION',
      items: [
        { id: 'company-profile', label: 'Company Profile', icon: Building2, href: '/organization/company-profile', permission: 'canManageSettings' },
      ]
    },

    // SETTINGS - Permission-based access
    {
      id: 'settings',
      label: 'SETTINGS',
      items: [
        { id: 'general-settings', label: 'Profile Settings', icon: Settings, href: '/settings/general-settings' },
        { id: 'permissions', label: 'Permissions & Roles', icon: Shield, href: '/settings/permissions', permission: 'canViewRoles' },
        { id: 'api-management', label: 'API Management', icon: Key, href: '/settings/api-management', permission: 'canViewApiManagement', planFeature: 'api_access' },
        { id: 'branding', label: 'Branding & White Label', icon: Palette, href: '/settings/branding', permission: 'canViewBranding' },
        // { id: 'integrations', label: 'Integrations', icon: LinkIcon, href: '/settings/integrations', permission: 'canManageSettings' }, // Hidden for demo
        { id: 'security', label: 'Security Settings', icon: Lock, href: '/settings/security', permission: 'canViewSecuritySettings' },
        { id: 'legal', label: 'Legal & Compliance', icon: ScrollText, href: '/settings/legal', permission: 'canManageSettings' },
      ]
    },

    // AUDITS & TRAIL - Tenant Admin Only
    {
      id: 'audits',
      label: 'AUDITS & TRAIL',
      items: [
        { id: 'audit-trail', label: 'Audit Trail', icon: ScrollText, href: '/audits/trail', adminOnly: true },
        { id: 'activity-logs', label: 'Activity Logs', icon: Activity, href: '/audits/activity', adminOnly: true },
      ]
    },

    // SUPPORT
    {
      id: 'support',
      label: 'SUPPORT',
      items: [
        { id: 'support-tickets', label: 'Support Tickets', icon: HelpCircle, href: '/support-tickets', permission: 'canViewSupport' },
        { id: 'help-desk', label: 'Help Desk', icon: Headphones, href: '/help-desk', internalUserOnly: true },
      ]
    },
  ];

  // Filter sections and items based on permissions
  const filterSections = (sections: NavSection[]): NavSection[] => {
    return sections.map(section => {
      // Filter items within section
      const filteredItems = section.items.filter(item => {
        // adminOnly items - only show to tenant_admin
        if (item.adminOnly && !isTenantAdmin) return false;

        // internalUserOnly items - show to everyone EXCEPT tenant_admin
        // This is for internal help desk where users raise tickets to their admin
        if (item.internalUserOnly && isTenantAdmin) return false;

        // Check permissions array (granular - show if ANY match)
        if (item.permissions && item.permissions.length > 0) {
          return hasAnyPermission(item.permissions);
        }

        // Fallback to single permission check (legacy)
        if (item.permission && !hasPermission(item.permission)) return false;

        return true;
      });

      return { ...section, items: filteredItems };
    }).filter(section => {
      // Remove empty sections
      if (section.items.length === 0) return false;
      // Check section-level admin requirement
      if (section.adminOnly && !isTenantAdmin) return false;
      return true;
    });
  };

  const visibleSections = filterSections(allSections);

  const relatedPaths: Record<string, string[]> = {
    '/recruitment/job-openings': resumeViewSource === 'job-details'
      ? ['/recruitment/job-details', '/recruitment/resume-view', '/recruitment/jd-creation']
      : ['/recruitment/job-details', '/recruitment/jd-creation'],
    '/recruitment/my-resumes': resumeViewSource === 'my-resumes' ? ['/recruitment/resume-view'] : [],
    '/recruitment/resume-database': resumeViewSource === 'resume-database' ? ['/recruitment/resume-view'] : [],
    '/recruitment/ai-talent-match': resumeViewSource === 'ai-talent-match' ? ['/recruitment/resume-view'] : [],
  };

  const isActive = (href?: string): boolean => {
    if (!href) return false;
    if (pathname === href || pathname.startsWith(href + '/')) return true;
    return (relatedPaths[href] || []).some(p => pathname === p || pathname.startsWith(p + '/'));
  };

  return (
    <aside className="relative w-64 sm:w-72 lg:w-64 bg-white border-r border-gray-100 flex flex-col shadow-xl lg:shadow-sm h-screen">
      {/* Logo + Close Button */}
      <div className="h-14 sm:h-16 lg:h-[72px] px-4 border-b border-gray-100 flex items-center justify-between shrink-0">
        <Link href="/dashboard" prefetch={false} className="flex items-center justify-center flex-1">
         <img
              src="/logos/talent_flow_logo.png"
              alt="TalentFlow"
              className="h-8 sm:h-10 w-auto"
            />
        </Link>
        {/* Close button for mobile */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 min-h-0 scrollbar-auto-hide">
        {visibleSections.map((section) => (
          <div key={section.id} className="mb-5 px-3">
            {/* Section Header */}
            <div className="px-3 pb-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.1em]">
                {section.label}
              </span>
            </div>

            {/* Section Items */}
            <div className="space-y-1">
              {section.items.map((item) => {
                // CRITICAL: Suspended accounts can ONLY access current-plan page
                // Suspended blocks ALL navigation except current-plan
                if (accountSuspended) {
                  const isCurrentPlanPage = item.href === '/subscription/current-plan';
                  if (!isCurrentPlanPage) {
                    return (
                      <div
                        key={item.id}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 cursor-not-allowed opacity-40"
                        title="Account suspended - Contact support for assistance"
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0 text-red-300" />
                        <span>{item.label}</span>
                      </div>
                    );
                  }
                }

                // Plan feature gate: hide item completely if feature is not in plan
                if (item.planFeature && !planFeaturesLoading && !hasPlanFeature(item.planFeature)) {
                  return null;
                }

                // Lock menus if subscriptionExpired is true OR undefined (loading/unknown)
                // Only unlock if explicitly false
                const isItemAllowed = subscriptionExpired === false || SUBSCRIPTION_ALLOWED_PATHS.includes(item.href || '');

                if (!isItemAllowed) {
                  return (
                    <div
                      key={item.id}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 cursor-not-allowed opacity-50"
                      title="Renew your subscription to access this feature"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0 text-gray-300" />
                      <span>{item.label}</span>
                    </div>
                  );
                }

                const active = isActive(item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href || '#'}
                    prefetch={false}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      // Close mobile menu when nav item is clicked
                      if (onClose) {
                        setTimeout(() => onClose(), 150);
                      }
                    }}
                    className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${
                      active
                        ? 'bg-brand-blue text-white font-medium'
                        : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                    }`}
                  >
                    <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-white' : 'text-gray-500'}`} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0">
        <p className="text-[11px] text-gray-400 text-center font-medium tracking-wide">
          {tenant?.name || 'TalentFlow'} <span className="opacity-60">·</span> v1.0
        </p>
      </div>
    </aside>
  );
}
