'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { usePlanFeaturesContext } from '@/components/providers/PlanFeaturesProvider';
import { DISABLED_REASON_MESSAGE } from '@/lib/navigation/menuSections';
import { ScrollableTabs } from '@/components/subscription/ScrollableTabs';

/**
 * Shared tab bar for the organization / user-management area.
 *
 * Renders the same horizontal tabs across all five pages (Users, Usage History,
 * Roles & Permissions, Teams, Chat). Tabs navigate between routes — each target
 * page keeps its own content — and the active tab is derived from the pathname.
 * Visibility mirrors the quick-links that used to live on the User Management
 * page, so non-admins only see the tabs they can actually open.
 *
 * `stickyTop`: pin the bar just below the page's sticky breadcrumb — pass the
 * breadcrumb's measured height (useBreadcrumbOffset). The bar must then be a
 * DIRECT child of the page card (a sticky element only travels inside its
 * parent), and it paints the card's background edge to edge so content scrolls
 * cleanly underneath. Omit it on pages whose header never scrolls (Chat).
 */
export default function OrganizationTabs({ stickyTop }: { stickyTop?: number } = {}) {
  const pathname = usePathname();
  const { isTenantAdmin, hasPermission } = useAuth();
  const { hasPlanFeature, loading: planLoading } = usePlanFeaturesContext();

  // `visible: false` = the user lacks the permission. Such tabs are still
  // rendered — greyed, hover tooltip, not clickable — never hidden.
  const tabs: { id: string; label: string; href: string; visible: boolean; deniedMessage?: string; planLocked?: boolean }[] = [
    // Visibility mirrors each destination page's own access guard exactly —
    // UserManagement.tsx checks canManageUsers/canViewUsers, UsageHistory.tsx
    // checks canViewUsage (also declared in lib/navigation/routeAccess.ts for
    // this same route prefix), RoleManagement.tsx checks canManageUsers. This
    // used to be isTenantAdmin-only for all three, hiding tabs a non-owner
    // admin with the right granular permissions could actually open.
    { id: 'users', label: 'Users', href: '/organization/user-management', visible: isTenantAdmin || hasPermission('canManageUsers') || hasPermission('canViewUsers'), deniedMessage: 'You do not have permission to view users' },
    { id: 'usage-history', label: 'Usage History', href: '/organization/usage-history', visible: isTenantAdmin || hasPermission('canViewUsage'), deniedMessage: 'You do not have permission to view usage history' },
    { id: 'role-management', label: 'Roles & Permissions', href: '/organization/role-management', visible: isTenantAdmin || hasPermission('canManageUsers'), deniedMessage: 'You do not have permission to manage roles & permissions' },
    // Plan-gated: stays visible but disabled (hover explains) when the plan lacks Teams.
    { id: 'team-management', label: 'Teams', href: '/organization/team-management', visible: isTenantAdmin || hasPermission('canViewTeams'), deniedMessage: 'You do not have permission to view teams', planLocked: !planLoading && !hasPlanFeature('teams') },
    { id: 'team-chat', label: 'Chat', href: '/organization/team-chat', visible: true },
  ];

  // Nothing to switch between — don't render a lone tab.
  if (tabs.length <= 1) return null;

  return (
    <section
      style={stickyTop !== undefined ? { top: stickyTop } : undefined}
      className={
        stickyTop !== undefined
          // Negative margins = the page card's padding (p-4 md:p-8), so the band
          // spans the card and nothing shows through at its sides.
          ? 'sticky z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-1 mb-3 lg:mb-5 bg-white dark:bg-slate-900'
          : 'mb-3 lg:mb-5'
      }
    >
      {/* Mobile + tablet (< lg): scrollable pills with an always-visible scrollbar */}
      <ScrollableTabs className="lg:hidden" ariaLabel="User management tabs">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const pill = 'shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors';
          if (tab.planLocked) {
            return (
              <span
                key={tab.id}
                aria-disabled="true"
                title={DISABLED_REASON_MESSAGE.plan}
                className={`${pill} border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-400 dark:text-slate-600 cursor-not-allowed`}
              >
                {tab.label}
              </span>
            );
          }
          if (!tab.visible) {
            return (
              <span
                key={tab.id}
                aria-disabled="true"
                title={tab.deniedMessage || DISABLED_REASON_MESSAGE.permission}
                className={`${pill} border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-400 dark:text-slate-600 cursor-not-allowed opacity-60`}
              >
                {tab.label}
              </span>
            );
          }
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={`${pill} ${
                isActive
                  ? 'border-brand-blue bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 hover:border-brand-blue/30 hover:text-brand-blue'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </ScrollableTabs>

      {/* Desktop (lg+): folder tabs that merge into the panel below */}
      <nav
        aria-label="User management tabs"
        className="hidden max-w-full flex-wrap gap-1 border-b border-gray-200 dark:border-slate-700 lg:flex"
      >
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const base = '-mb-px whitespace-nowrap rounded-t-lg border px-4 py-2.5 text-sm font-medium transition-colors';
          if (tab.planLocked) {
            return (
              <span
                key={tab.id}
                aria-disabled="true"
                title={DISABLED_REASON_MESSAGE.plan}
                className={`${base} border-transparent text-gray-400 dark:text-slate-600 cursor-not-allowed`}
              >
                {tab.label}
              </span>
            );
          }
          if (!tab.visible) {
            return (
              <span
                key={tab.id}
                aria-disabled="true"
                title={tab.deniedMessage || DISABLED_REASON_MESSAGE.permission}
                className={`${base} border-transparent text-gray-400 dark:text-slate-600 cursor-not-allowed opacity-60`}
              >
                {tab.label}
              </span>
            );
          }
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={`${base} ${
                isActive
                  ? 'border-gray-200 dark:border-slate-700 border-b-slate-100 dark:border-b-slate-800 bg-slate-100 dark:bg-slate-800/50 text-brand-blue'
                  : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue hover:bg-gray-50 dark:hover:bg-slate-800/40'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
