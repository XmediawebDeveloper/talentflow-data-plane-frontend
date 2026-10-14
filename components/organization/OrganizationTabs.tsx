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
 */
export default function OrganizationTabs() {
  const pathname = usePathname();
  const { isTenantAdmin, hasPermission } = useAuth();
  const { hasPlanFeature, loading: planLoading } = usePlanFeaturesContext();

  const tabs: { id: string; label: string; href: string; visible: boolean; planLocked?: boolean }[] = [
    // Visibility mirrors each destination page's own access guard exactly —
    // UserManagement.tsx checks canManageUsers/canViewUsers, UsageHistory.tsx
    // checks canViewUsage (also declared in lib/navigation/routeAccess.ts for
    // this same route prefix), RoleManagement.tsx checks canManageUsers. This
    // used to be isTenantAdmin-only for all three, hiding tabs a non-owner
    // admin with the right granular permissions could actually open.
    { id: 'users', label: 'Users', href: '/organization/user-management', visible: isTenantAdmin || hasPermission('canManageUsers') || hasPermission('canViewUsers') },
    { id: 'usage-history', label: 'Usage History', href: '/organization/usage-history', visible: isTenantAdmin || hasPermission('canViewUsage') },
    { id: 'role-management', label: 'Roles & Permissions', href: '/organization/role-management', visible: isTenantAdmin || hasPermission('canManageUsers') },
    // Plan-gated: stays visible but disabled (hover explains) when the plan lacks Teams.
    { id: 'team-management', label: 'Teams', href: '/organization/team-management', visible: isTenantAdmin || hasPermission('canViewTeams'), planLocked: !planLoading && !hasPlanFeature('teams') },
    { id: 'team-chat', label: 'Chat', href: '/organization/team-chat', visible: true },
  ].filter(tab => tab.visible);

  // Nothing to switch between — don't render a lone tab.
  if (tabs.length <= 1) return null;

  return (
    <section className="mb-5">
      <nav
        aria-label="User management tabs"
        className="flex max-w-full flex-wrap gap-1 border-b border-gray-200 dark:border-slate-700"
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
