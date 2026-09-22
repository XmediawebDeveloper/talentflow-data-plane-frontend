'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { buildMenuSections, filterMenuSections } from '@/lib/navigation/menuSections';
import type { Permission } from '@/lib/types/tenant';

/**
 * Dashboard menu grid — renders the same nav sections as the sidebar as a
 * grid of cards. Used on /dashboard, which hides the sidebar in favour of
 * this in-page navigation hub. Section/item data and filtering live in
 * lib/navigation/menuSections.ts so the two views stay in sync.
 */
export default function DashboardMenuGrid() {
  const pathname = usePathname();
  const { user, isTenantAdmin } = useAuth();
  const { hasPlanFeature, loading: planFeaturesLoading } = usePlanFeatures();

  const hasPerm = (key: string): boolean => {
    if (!key) return true;
    if (isTenantAdmin) return true;
    if (!user?.permissions) return false;
    return user.permissions[key as keyof Permission] === true;
  };

  const hasAnyPerm = (keys: string[]): boolean => {
    if (isTenantAdmin) return true;
    if (!user?.permissions) return false;
    return keys.some((k) => user.permissions[k as keyof Permission] === true);
  };

  const sections = filterMenuSections(buildMenuSections(isTenantAdmin), {
    isTenantAdmin,
    hasPermission: hasPerm,
    hasAnyPermission: hasAnyPerm,
    hasPlanFeature,
    planFeaturesLoading,
  });

  if (sections.length === 0) return null;

  return (
    <section aria-label="Workspace navigation" className="mb-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <div
            key={section.id}
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]"
          >
            <h3 className="mb-3 text-2xs font-semibold uppercase tracking-wider text-gray-500">
              {section.label}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const href = item.href || '#';
                const isCurrent = !!item.href && (pathname === item.href || pathname.startsWith(item.href + '/'));
                return (
                  <li key={item.id}>
                    <Link
                      href={href}
                      prefetch={false}
                      aria-current={isCurrent ? 'page' : undefined}
                      className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                        isCurrent
                          ? 'border-brand-blue/30 bg-brand-blue/5'
                          : 'border-gray-200 bg-white hover:border-brand-blue/40'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${
                          isCurrent
                            ? 'bg-brand-blue text-white ring-brand-blue/20'
                            : 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                          isCurrent ? 'text-brand-blue' : 'text-gray-800 group-hover:text-brand-blue'
                        }`}
                      >
                        {item.label}
                      </span>
                      <ArrowUpRight
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          isCurrent ? 'text-brand-blue' : 'text-gray-300 group-hover:text-brand-blue'
                        }`}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
