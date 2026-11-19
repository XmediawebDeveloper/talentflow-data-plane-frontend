'use client';

import { usePathname } from 'next/navigation';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import OrganizationTabs, { type OrganizationTabGroup } from '@/components/organization/OrganizationTabs';
import { useBreadcrumbOffset } from '@/components/ai-interview/AIInterviewStepIndicator';
import { MobileRecordCardVariantProvider } from '@/components/ui/mobile-record-card';

/**
 * Persistent frame for the organization tab groups:
 *   User Management — Users, Roles & Permissions, Usage History
 *   Teams           — Teams (Chat is its own page now: app/(dashboard)/chat)
 *
 * The page card, breadcrumb, tab bar and the grey tab panel live HERE, so they
 * stay mounted while switching tabs — only the panel's content changes, with a
 * short fade. Each tab's page (and its loading.tsx) renders just that content.
 * Before this, every page drew its own frame, so a tab switch tore the whole
 * page down and rebuilt it (and loading.tsx skeletonised the tabs too), which
 * read as a full reload.
 *
 * Other routes under /organization (company profile, internal tickets, usage,
 * role create/edit) are not tabs — they pass through untouched.
 */
const TAB_PAGES: Record<string, { label: string; group: OrganizationTabGroup }> = {
  '/organization/user-management': { label: 'Users', group: 'users' },
  '/organization/usage-history': { label: 'Usage History', group: 'users' },
  '/organization/role-management': { label: 'Roles & Permissions', group: 'users' },
  '/organization/team-management': { label: 'Teams', group: 'teams' },
};

/** Each group's landing tab — the breadcrumb's middle crumb links here. */
const GROUP_ROOT: Record<OrganizationTabGroup, { label: string; href: string }> = {
  users: { label: 'User Management', href: '/organization/user-management' },
  teams: { label: 'Teams', href: '/organization/team-management' },
};

export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Tab bar pins just below the sticky breadcrumb (measured height).
  const [crumbRef, crumbHeight] = useBreadcrumbOffset();

  const page = TAB_PAGES[pathname];
  if (!page) return <>{children}</>;
  const { label, group } = page;
  const root = GROUP_ROOT[group];

  return (
    <main className="flex-1 overflow-x-clip bg-white xl:bg-slate-50 dark:bg-slate-900 xl:dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        {/* Standard page panel: 16px inset on phones, 32px from md (same as
            every other page). OrganizationTabs' sticky band mirrors this padding. */}
        <div className="my-0 xl:my-5 w-full rounded-none xl:rounded-2xl bg-white shadow-none xl:shadow-2xl md:p-8 dark:bg-slate-900 p-4">
          <PageBreadcrumb
            barRef={crumbRef}
            className="mb-4 shrink-0 md:mb-6"
            items={
              pathname === root.href
                ? [{ label: 'Dashboard', href: '/dashboard' }, { label: root.label }]
                : [{ label: 'Dashboard', href: '/dashboard' }, { label: root.label, href: root.href }, { label }]
            }
          />
          <OrganizationTabs group={group} stickyTop={crumbHeight} />

          {/* The active tab's panel — joins the tab bar's baseline on desktop
              (-mt-5 cancels the tab bar's mb-5). */}
          <div className="rounded-xl border border-gray-200 bg-slate-100 p-4 sm:p-5 lg:-mt-5 lg:rounded-t-none lg:border-t-0 dark:border-slate-700 dark:bg-slate-800/50">
            {/* Keyed by route so the fade replays on every tab switch. Opacity
                only — a transform here would re-anchor the pages' fixed-position
                popups to this box while it animates. */}
            <div key={pathname} className="animate-in fade-in duration-200 motion-reduce:animate-none">
              {/* User Management tabs: phone / tablet cards, toolbars, menus and
                  selects use the Job Openings module's layout (MobileRecordCardVariant). */}
              {group === 'users'
                ? <MobileRecordCardVariantProvider variant="jd">{children}</MobileRecordCardVariantProvider>
                : children}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
