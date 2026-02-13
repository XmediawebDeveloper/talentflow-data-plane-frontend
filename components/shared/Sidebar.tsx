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
  Inbox
} from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';

interface SidebarProps {
  user?: User;
  tenant?: Tenant;
  subscriptionExpired?: boolean | undefined;  // undefined = loading/unknown (default to locked)
  accountSuspended?: boolean;  // true = account suspended, block all navigation
}

// Paths allowed even when subscription is expired
const SUBSCRIPTION_ALLOWED_PATHS = [
  '/subscription/current-plan',
  '/subscription/payment-methods',
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
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

export default function Sidebar({ user, tenant, subscriptionExpired, accountSuspended }: SidebarProps) {
  const pathname = usePathname();
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

  // ✅ Permission dependencies (must match backend)
  // If a permission has dependencies, ALL dependencies must be present for the feature to work
  const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
    // VIEW permissions don't need dependencies (just need to see the page)
    // RUN permissions need dependencies (need access to required data)

    // AI Talent Match RUN requires both Internal DB and JD access
    'canRunAiMatch': ['canViewAiMatch', 'canViewInternalDB', 'canReadJD'],

    // Resume Scoring RUN requires JD and Resume access
    'canRunScoring': ['canViewScoring', 'canReadJD', 'canViewResumes'],

    // Assessments require JD access
    'canCreateAssessments': ['canReadJD'],
    'canUpdateAssessments': ['canViewAssessments', 'canReadJD'],
    'canDeleteAssessments': ['canViewAssessments'],

    // AI Interviews require Resume access
    'canRunAiInterviews': ['canViewResumes'],

    // Delete permissions require read permission (CRUD hierarchy)
    'canDeleteJD': ['canReadJD'],
    'canDeleteResumes': ['canViewResumes'],
    'canDeleteInternalDB': ['canViewInternalDB'],
    'canDeleteAssessments': ['canViewAssessments'],
    'canDeleteUsers': ['canViewUsers'],
    'canDeleteRoles': ['canViewRoles'],

    // Update permissions require read permission (CRUD hierarchy)
    'canUpdateJD': ['canReadJD'],
    'canUpdateResumes': ['canViewResumes'],
    'canUpdateInternalDB': ['canViewInternalDB'],
    'canUpdateUsers': ['canViewUsers'],
    'canUpdateRoles': ['canViewRoles'],

    // Create permissions might require read permission (depends on feature)
    'canCreateJD': [], // No dependency
    'canCreateResumes': ['canViewResumes'], // Need to see resumes to create
    'canCreateInternalDB': ['canViewInternalDB'], // Need to see DB to create
    'canCreateUsers': ['canViewUsers'], // Need to see users to create
    'canCreateRoles': ['canViewRoles'], // Need to see roles to create
  };

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

  // NEW: Check permission AND all its dependencies
  const hasAllRequiredPermissions = (permissions: string[]): boolean => {
    if (isTenantAdmin) return true;

    console.log(`[SIDEBAR] Checking all required permissions:`, permissions);

    for (const perm of permissions) {
      console.log(`[SIDEBAR] Checking permission: ${perm} = ${user?.permissions?.[perm as keyof typeof user.permissions]}`);

      if (!user?.permissions || !user.permissions[perm as keyof typeof user.permissions]) {
        console.log(`[SIDEBAR] Missing permission: ${perm}`);
        return false;
      }

      // Check dependencies
      const deps = PERMISSION_DEPENDENCIES[perm] || [];
      if (deps.length > 0) {
        console.log(`[SIDEBAR] Checking dependencies for ${perm}:`, deps);
      }

      for (const dep of deps) {
        const hasDepValue = user?.permissions?.[dep as keyof typeof user.permissions];
        console.log(`[SIDEBAR]   Dependency ${dep} = ${hasDepValue}`);

        if (!user?.permissions || !user.permissions[dep as keyof typeof user.permissions]) {
          console.log(`[SIDEBAR] Missing dependency: ${perm} requires ${dep}`);
          return false;
        }
      }
    }

    console.log(`[SIDEBAR] All required permissions passed!`);
    return true;
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
        { id: 'resume-scoring', label: 'Resume Scoring', icon: Target, href: '/recruitment/resume-scoring', permissions: ['canViewScoring'] },  // ✅ FIX: Check VIEW permission, not RUN
        { id: 'ai-talent-match', label: 'AI Talent Match', icon: Sparkles, href: '/recruitment/ai-talent-match', permissions: ['canViewAiMatch'] },  // ✅ FIX: Check VIEW permission, not RUN
      ]
    },

    // RESUME MANAGEMENT
    {
      id: 'resume-management',
      label: 'RESUME MANAGEMENT',
      items: [
        { id: 'my-resumes', label: 'My Resumes', icon: Users, href: '/recruitment/my-resumes', permissions: ['canViewResumes', 'canUploadResumes', 'canUpdateResumes', 'canDeleteResumes'] },
        { id: 'resume-database', label: 'Internal Database', icon: Database, href: '/recruitment/resume-database', permissions: ['canAccessInternalDB', 'canViewInternalDB', 'canUpdateInternalDB', 'canDeleteInternalDB'] },
      ]
    },

    // EVALUATION
    {
      id: 'evaluation',
      label: 'EVALUATION',
      items: [
        { id: 'assessments', label: 'Assessments', icon: ClipboardList, href: '/recruitment/assessments', permissions: ['canViewAssessments', 'canCreateAssessments', 'canUpdateAssessments', 'canDeleteAssessments'] },
        { id: 'ai-interviews', label: 'AI Interviews', icon: Video, href: '/recruitment/ai-interviews', permissions: ['canViewResumes', 'canRunAiInterviews'] },
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

    // USER MANAGEMENT
    {
      id: 'user-management-section',
      label: 'USER MANAGEMENT',
      items: [
        { id: 'user-management', label: 'Users', icon: Users, href: '/organization/user-management', permission: 'canManageUsers' },
        { id: 'role-management', label: 'Roles & Permissions', icon: Shield, href: '/organization/role-management', permission: 'canManageUsers', adminOnly: true },
        { id: 'team-management', label: 'Teams', icon: UserCog, href: '/organization/team-management', permission: 'canManageUsers' },
        { id: 'team-chat', label: 'Chat', icon: MessageCircle, href: '/organization/team-chat' },  // ✅ Available to ALL users (bypass permission check)
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

    // SUBSCRIPTION & BILLING - RBAC03: Billing Manager access
    {
      id: 'subscription',
      label: 'SUBSCRIPTION & BILLING',
      items: [
        { id: 'current-plan', label: 'Current Plan', icon: CreditCard, href: '/subscription/current-plan', permission: 'canViewBilling' },
        { id: 'usage-quotas', label: 'Usage & Quotas', icon: BarChart3, href: '/subscription/usage-quotas', permission: 'canViewUsage' },
        { id: 'payment-methods', label: 'Payment Methods', icon: Wallet, href: '/subscription/payment-methods', permission: 'canViewBilling' },
        { id: 'billing-history', label: 'Billing History', icon: Receipt, href: '/subscription/billing-history', permission: 'canViewInvoices' },
        { id: 'refund-history', label: 'Refund History', icon: RefreshCw, href: '/subscription/refund-history', permission: 'canViewInvoices' },
        { id: 'dispute-history', label: 'Dispute History', icon: AlertTriangle, href: '/subscription/dispute-history', permission: 'canViewInvoices' },
        { id: 'unit-disputes', label: 'Unit Disputes', icon: Shield, href: '/subscription/unit-disputes', permission: 'canViewUsage' },
      ]
    },

    // SETTINGS - Permission-based access
    {
      id: 'settings',
      label: 'SETTINGS',
      items: [
        { id: 'general-settings', label: 'General Settings', icon: Settings, href: '/settings/general-settings', permission: 'canManageSettings' },
        { id: 'permissions', label: 'Permissions & Roles', icon: Shield, href: '/settings/permissions', permission: 'canManageUsers', adminOnly: true },
        { id: 'api-management', label: 'API Management', icon: Key, href: '/settings/api-management', permission: 'canManageSettings' },
        { id: 'branding', label: 'Branding & White Label', icon: Palette, href: '/settings/branding', permission: 'canManageSettings' },
        // { id: 'integrations', label: 'Integrations', icon: LinkIcon, href: '/settings/integrations', permission: 'canManageSettings' }, // Hidden for demo
        { id: 'security', label: 'Security Settings', icon: Lock, href: '/settings/security', permission: 'canManageSettings' },
      ]
    },

    // REPORTS & ANALYTICS - Hidden for demo, will be enabled in future
    // {
    //   id: 'reports',
    //   label: 'REPORTS & ANALYTICS',
    //   items: [
    //     { id: 'team-usage', label: 'Team Usage Analytics', icon: Activity, href: '/reports/team-usage', permission: 'canViewAnalytics' },
    //     { id: 'performance-reports', label: 'Performance Reports', icon: TrendingUp, href: '/reports/performance-reports', permission: 'canViewAnalytics' },
    //   ]
    // },

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
        { id: 'support-tickets', label: 'Support Tickets', icon: HelpCircle, href: '/support-tickets', adminOnly: true },
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
          // ✅ NEW: For specific features with dependencies, check ALL required permissions
          if (item.id === 'ai-talent-match' || item.id === 'resume-scoring') {
            return hasAllRequiredPermissions(item.permissions);
          }
          // For other items, use the existing ANY logic
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

  const isActive = (href?: string): boolean => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <aside className="w-64 bg-gray-200 border-r border-gray-300 flex flex-col shadow-sm h-screen">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <Link href="/dashboard" prefetch={false} className="flex items-center justify-center">
         <img
              src="/logos/talent_flow_logo.png"
              alt="TalentFlow"
              className="h-10 w-auto"
            />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {visibleSections.map((section) => (
          <div key={section.id} className="mb-2">
            {/* Section Header */}
            <div className="px-4 py-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {section.label}
              </span>
            </div>

            {/* Section Items */}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                // CRITICAL: Suspended accounts can ONLY access current-plan page
                // Suspended blocks ALL navigation except current-plan
                if (accountSuspended) {
                  const isCurrentPlanPage = item.href === '/subscription/current-plan';
                  if (!isCurrentPlanPage) {
                    return (
                      <div
                        key={item.id}
                        className="w-full flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm text-red-400 cursor-not-allowed opacity-40"
                        style={{ width: 'calc(100% - 16px)' }}
                        title="Account suspended - Contact support for assistance"
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0 text-red-300" />
                        <span>{item.label}</span>
                      </div>
                    );
                  }
                }

                // Lock menus if subscriptionExpired is true OR undefined (loading/unknown)
                // Only unlock if explicitly false
                const isItemAllowed = subscriptionExpired === false || SUBSCRIPTION_ALLOWED_PATHS.includes(item.href || '');

                if (!isItemAllowed) {
                  return (
                    <div
                      key={item.id}
                      className="w-full flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm text-gray-400 cursor-not-allowed opacity-50"
                      style={{ width: 'calc(100% - 16px)' }}
                      title="Renew your subscription to access this feature"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0 text-gray-300" />
                      <span>{item.label}</span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.id}
                    href={item.href || '#'}
                    prefetch={false}
                    className={`w-full flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm transition-colors ${
                      isActive(item.href)
                        ? 'bg-gray-800 text-white font-medium shadow-sm'
                        : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                    }`}
                    style={{ width: 'calc(100% - 16px)' }}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive(item.href) ? 'text-white' : 'text-gray-500'}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          {tenant?.name || 'TalentFlow'} v1.0
        </p>
      </div>
    </aside>
  );
}
