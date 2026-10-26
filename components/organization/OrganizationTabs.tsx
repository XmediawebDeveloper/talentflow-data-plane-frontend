'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { usePlanFeaturesContext } from '@/components/providers/PlanFeaturesProvider';
import { DISABLED_REASON_MESSAGE } from '@/lib/navigation/menuSections';

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
  const tabs: { id: string; label: string; short: string; href: string; visible: boolean; deniedMessage?: string; planLocked?: boolean }[] = [
    // Visibility mirrors each destination page's own access guard exactly —
    // UserManagement.tsx checks canManageUsers/canViewUsers, UsageHistory.tsx
    // checks canViewUsage (also declared in lib/navigation/routeAccess.ts for
    // this same route prefix), RoleManagement.tsx checks canManageUsers. This
    // used to be isTenantAdmin-only for all three, hiding tabs a non-owner
    // admin with the right granular permissions could actually open.
    { id: 'users', label: 'Users', short: 'Users', href: '/organization/user-management', visible: isTenantAdmin || hasPermission('canManageUsers') || hasPermission('canViewUsers'), deniedMessage: 'You do not have permission to view users' },
    { id: 'usage-history', label: 'Usage History', short: 'Usage', href: '/organization/usage-history', visible: isTenantAdmin || hasPermission('canViewUsage'), deniedMessage: 'You do not have permission to view usage history' },
    { id: 'role-management', label: 'Roles & Permissions', short: 'Roles', href: '/organization/role-management', visible: isTenantAdmin || hasPermission('canManageUsers'), deniedMessage: 'You do not have permission to manage roles & permissions' },
    // Plan-gated: stays visible but disabled (hover explains) when the plan lacks Teams.
    { id: 'team-management', label: 'Teams', short: 'Teams', href: '/organization/team-management', visible: isTenantAdmin || hasPermission('canViewTeams'), deniedMessage: 'You do not have permission to view teams', planLocked: !planLoading && !hasPlanFeature('teams') },
    { id: 'team-chat', label: 'Chat', short: 'Chat', href: '/organization/team-chat', visible: true },
  ];

  // Nothing to switch between — don't render a lone tab.
  if (tabs.length <= 1) return null;

  return (
    <section
      // Lets a page measure the sticky band (its top + height) to scroll content
      // exactly below it — see RoleManagement's stat-card scroll.
      data-org-sticky-tabs={stickyTop !== undefined ? '' : undefined}
      style={stickyTop !== undefined ? { top: stickyTop } : undefined}
      className={
        stickyTop !== undefined
          // Negative margins = the page card's padding (p-4 md:p-8, set in
          // organization/layout.tsx), so the band spans the card and nothing
          // shows through at its sides.
          ? 'sticky z-20 -mx-4 md:-mx-8 px-4 md:px-8 pt-1 mb-3 lg:mb-5 bg-white dark:bg-slate-900'
          : 'mb-3 lg:mb-5'
      }
    >
      {/* Mobile + tablet (< lg): one segmented control — the sliding white-tile
          toggle used across the app. Five equal cells on a light brand-blue
          track; the white tile glides to the active tab. This bar lives in the
          persistent organization layout, so it stays mounted across tab
          switches and the tile visibly slides from the old tab to the new one.
          Short labels so all five fit on a phone (full name on hover). */}
      {(() => {
        const activeIndex = tabs.findIndex((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
        const cell = 'relative z-10 inline-flex min-w-0 items-center justify-center rounded-md px-1 text-xs font-medium transition-colors duration-300 sm:text-sm';
        return (
          <nav
            aria-label="User management tabs"
            className="relative grid h-9 grid-cols-5 rounded-lg bg-brand-blue/5 p-1 ring-1 ring-brand-blue/10 lg:hidden"
          >
            {activeIndex >= 0 && (
              <span
                aria-hidden
                style={{ transform: `translateX(${activeIndex * 100}%)` }}
                className="absolute bottom-1 left-1 top-1 w-[calc((100%-0.5rem)/5)] rounded-md bg-white shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-slate-800"
              />
            )}
            {tabs.map((tab) => {
              const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
              const text = <span className="truncate">{tab.short}</span>;
              if (tab.planLocked || !tab.visible) {
                return (
                  <span
                    key={tab.id}
                    aria-disabled="true"
                    title={tab.planLocked ? DISABLED_REASON_MESSAGE.plan : tab.deniedMessage || DISABLED_REASON_MESSAGE.permission}
                    className={`${cell} cursor-not-allowed text-gray-400 dark:text-slate-600 ${tab.planLocked ? '' : 'opacity-60'}`}
                  >
                    {text}
                  </span>
                );
              }
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  title={tab.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`${cell} ${
                    isActive ? 'text-brand-blue' : 'text-gray-600 hover:text-brand-blue dark:text-slate-400'
                  }`}
                >
                  {text}
                </Link>
              );
            })}
          </nav>
        );
      })()}

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
