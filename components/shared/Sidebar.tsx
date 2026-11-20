'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { buildMenuSections, DISABLED_REASON_MESSAGE, type NavSection } from '@/lib/navigation/menuSections';
import { IconButton } from '@/components/ui/icon-button';

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
    'organization', 'user-management-section', 'subscription', 'settings', 'reports', 'audits'
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
  console.log('[SIDEBAR] Role:', user?.role, 'Permissions:', user?.permissions, 'ForceRender:', forceRender);

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

  // Menu section data comes from the shared config so the Sidebar and the
  // Dashboard menu grid stay in sync — see lib/navigation/menuSections.ts.
  const allSections: NavSection[] = buildMenuSections(isTenantAdmin);

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
    // One entry now that My Resumes and Internal Database are tabs of the same
    // page — a resume opened from EITHER tab keeps Resume Database highlighted.
    '/recruitment/resume-database':
      resumeViewSource === 'my-resumes' || resumeViewSource === 'resume-database'
        ? ['/recruitment/resume-view', '/recruitment/my-resumes']
        : ['/recruitment/my-resumes'],
    '/recruitment/ai-talent-match': resumeViewSource === 'ai-talent-match' ? ['/recruitment/resume-view'] : [],
  };

  const isActive = (href?: string): boolean => {
    if (!href) return false;
    if (pathname === href || pathname.startsWith(href + '/')) return true;
    return (relatedPaths[href] || []).some(p => pathname === p || pathname.startsWith(p + '/'));
  };

  return (
    <aside className="relative w-64 sm:w-72 lg:w-64 bg-white border-r border-gray-100 flex flex-col shadow-xl lg:shadow-sm h-[100dvh]">
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
          <IconButton bare label="Close menu"
            onClick={onClose}
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </IconButton>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 min-h-0 scrollbar-auto-hide">
        {visibleSections.map((section) => (
          <div key={section.id} className="mb-5 px-3">
            {/* Section Header */}
            <div className="px-3 pb-2">
              <span className="text-2xs font-semibold text-gray-500 uppercase tracking-[0.1em]">
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

                // Plan feature gate: keep the item visible but disabled, with a
                // hover message — hiding it made it flash in and vanish once
                // plan features finished loading.
                if (item.planFeature && !planFeaturesLoading && !hasPlanFeature(item.planFeature)) {
                  return (
                    <div
                      key={item.id}
                      aria-disabled="true"
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg tf-body-muted cursor-not-allowed opacity-50"
                      title={DISABLED_REASON_MESSAGE.plan}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0 text-muted-foreground dark:text-gray-300" />
                      <span>{item.label}</span>
                    </div>
                  );
                }

                // Lock menus if subscriptionExpired is true OR undefined (loading/unknown)
                // Only unlock if explicitly false
                const isItemAllowed = subscriptionExpired === false || SUBSCRIPTION_ALLOWED_PATHS.includes(item.href || '');

                if (!isItemAllowed) {
                  return (
                    <div
                      key={item.id}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg tf-body-muted cursor-not-allowed opacity-50"
                      title="Renew your subscription to access this feature"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0 text-muted-foreground dark:text-gray-300" />
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
        <p className="text-2xs text-gray-500 text-center font-medium tracking-wide">
          {tenant?.name || 'TalentFlow'} <span className="opacity-60">·</span> v1.0
        </p>
      </div>
    </aside>
  );
}
