'use client';

import { usePathname } from 'next/navigation';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import OrganizationTabs from '@/components/organization/OrganizationTabs';
import { useBreadcrumbOffset } from '@/components/ai-interview/AIInterviewStepIndicator';

/**
 * Persistent frame for the five organization tabs (Users, Usage History,
 * Roles & Permissions, Teams, Chat).
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
const TAB_PAGES: Record<string, string> = {
  '/organization/user-management': 'Users',
  '/organization/usage-history': 'Usage History',
  '/organization/role-management': 'Roles & Permissions',
  '/organization/team-management': 'Teams',
  '/organization/team-chat': 'Chat',
};

export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Tab bar pins just below the sticky breadcrumb (measured height).
  const [crumbRef, crumbHeight] = useBreadcrumbOffset();

  const label = TAB_PAGES[pathname];
  if (!label) return <>{children}</>;

  // Chat fills the viewport height (its message list scrolls inside), so the
  // frame becomes a flex column down to the content; it never scrolls the page,
  // so its tab bar doesn't need to stick.
  const isChat = pathname === '/organization/team-chat';
  const fill = isChat ? 'flex flex-1 min-h-0 flex-col' : '';

  return (
    <main className={`flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950 ${isChat ? 'flex h-full min-h-0 flex-col' : ''}`}>
      <div className={`mx-auto w-full max-w-[1400px] ${fill}`}>
        <div className={`my-4 w-full rounded-2xl bg-white p-4 shadow-2xl md:my-5 md:p-8 dark:bg-slate-900 ${fill}`}>
          <PageBreadcrumb
            barRef={crumbRef}
            className="mb-4 shrink-0 md:mb-6"
            items={
              pathname === '/organization/user-management'
                ? [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users' }]
                : [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users', href: '/organization/user-management' }, { label }]
            }
          />
          <OrganizationTabs stickyTop={isChat ? undefined : crumbHeight} />

          {/* The active tab's panel — joins the tab bar's baseline on desktop
              (-mt-5 cancels the tab bar's mb-5). */}
          <div className={`rounded-xl border border-gray-200 bg-slate-100 p-4 sm:p-5 lg:-mt-5 lg:rounded-t-none lg:border-t-0 dark:border-slate-700 dark:bg-slate-800/50 ${fill}`}>
            {/* Keyed by route so the fade replays on every tab switch. Opacity
                only — a transform here would re-anchor the pages' fixed-position
                popups to this box while it animates. */}
            <div key={pathname} className={`animate-in fade-in duration-200 motion-reduce:animate-none ${fill}`}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
