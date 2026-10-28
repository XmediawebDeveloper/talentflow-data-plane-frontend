'use client';

import { usePathname } from 'next/navigation';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import OrganizationTabs, { type OrganizationTabGroup } from '@/components/organization/OrganizationTabs';
import { useBreadcrumbOffset } from '@/components/ai-interview/AIInterviewStepIndicator';

/**
 * Persistent frame for the organization tab groups:
 *   User Management — Users, Usage History, Roles & Permissions
 *   Teams           — Teams, Chat (opened from the dashboard's Teams tile)
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
  '/organization/team-chat': { label: 'Chat', group: 'teams' },
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

  // Chat fills the viewport height (its message list scrolls inside), so the
  // frame becomes a flex column down to the content; it never scrolls the page,
  // so its tab bar doesn't need to stick. On short screens (phone landscape)
  // that would leave the message list ~0px tall, so there the frame grows to
  // its content and the page scrolls down to a screen-tall chat window.
  const isChat = pathname === '/organization/team-chat';
  const fill = isChat ? 'flex flex-1 min-h-0 flex-col [@media(max-height:500px)]:flex-none' : '';

  return (
    <main className={`flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950 ${isChat ? 'flex h-full min-h-0 flex-col [@media(max-height:500px)]:h-auto [@media(max-height:500px)]:flex-none' : ''}`}>
      <div className={`mx-auto w-full max-w-[1400px] ${fill}`}>
        {/* Standard page panel: 16px inset on phones, 32px from md (same as
            every other page). OrganizationTabs' sticky band mirrors this padding. */}
        <div className={`my-4 w-full rounded-2xl bg-white shadow-2xl md:my-5 md:p-8 dark:bg-slate-900 p-4 ${fill}`}>
          <PageBreadcrumb
            barRef={crumbRef}
            className="mb-4 shrink-0 md:mb-6"
            items={
              pathname === root.href
                ? [{ label: 'Dashboard', href: '/dashboard' }, { label: root.label }]
                : [{ label: 'Dashboard', href: '/dashboard' }, { label: root.label, href: root.href }, { label }]
            }
          />
          <OrganizationTabs group={group} stickyTop={isChat ? undefined : crumbHeight} />

          {/* The active tab's panel — joins the tab bar's baseline on desktop
              (-mt-5 cancels the tab bar's mb-5). */}
          <div className={`rounded-xl border border-gray-200 bg-slate-100 sm:p-5 lg:-mt-5 lg:rounded-t-none lg:border-t-0 dark:border-slate-700 dark:bg-slate-800/50 p-4 ${fill}`}>
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
