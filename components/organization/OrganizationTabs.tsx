'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { usePlanFeaturesContext } from '@/components/providers/PlanFeaturesProvider';

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
  const { hasPlanFeature } = usePlanFeaturesContext();

  const tabs = [
    { id: 'users', label: 'Users', href: '/organization/user-management', visible: isTenantAdmin },
    { id: 'usage-history', label: 'Usage History', href: '/organization/usage-history', visible: isTenantAdmin },
    { id: 'role-management', label: 'Roles & Permissions', href: '/organization/role-management', visible: isTenantAdmin },
    { id: 'team-management', label: 'Teams', href: '/organization/team-management', visible: (isTenantAdmin || hasPermission('canViewTeams')) && hasPlanFeature('teams') },
    { id: 'team-chat', label: 'Chat', href: '/organization/team-chat', visible: true },
  ].filter(tab => tab.visible);

  // Nothing to switch between — don't render a lone tab.
  if (tabs.length <= 1) return null;

  return (
    <section className="mb-5">
      <div className="border-b border-gray-200 dark:border-slate-700">
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px" aria-label="User management tabs">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`whitespace-nowrap px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-brand-blue text-brand-blue'
                    : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue hover:border-brand-blue/40'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
