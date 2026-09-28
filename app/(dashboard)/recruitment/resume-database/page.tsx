'use client';

/**
 * Resume Database — the single entry point for both resume pools, following
 * UI-UX Guidelines §6 ("Two Clear Zones — My Resumes, Shared Database").
 *
 * The two used to be separate top-level menu items pointing at two routes.
 * They are the same records at two scopes: the API's `source` parameter is the
 * only difference — 'my-resumes' filters to the signed-in user's own uploads,
 * 'internal-db' returns every resume in the tenant. So they are now two tabs of
 * one page, matching the picker SelectSourceModal already shows in the scoring
 * / assessment / interview-invite flows.
 *
 * This file owns only the page chrome: the breadcrumb, the tab strip and which
 * tab a user is allowed to see. Each tab's body is unchanged and lives in its
 * own component; the chrome is handed to it as `header` so it renders inside
 * that view's white card, above its title row.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Database, FolderOpen, Lock } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MyResumesView from '@/components/resumes/MyResumesView';
import InternalDatabaseView from '@/components/resumes/InternalDatabaseView';
import { resumeService } from '@/lib/services/resumeService';
import type { Permission } from '@/lib/types/tenant';

export type ResumeTab = 'my-resumes' | 'internal-db';

/** Tab labels, kept here so the strip and the breadcrumb can never disagree. */
const TAB_LABEL: Record<ResumeTab, string> = {
  'my-resumes': 'My Resumes',
  'internal-db': 'Shared Database',
};

/* The same permission lists the nav entry is gated on (see
   lib/navigation/menuSections.ts) — holding ANY one of a tab's permissions is
   enough to see that tab, so the two stay in step: if the menu item shows, at
   least one tab behind it is reachable. */
const MY_RESUMES_PERMISSIONS = [
  'canViewResumes',
  'canUploadResumes',
  'canUpdateResumes',
  'canDeleteResumes',
] as const;

const INTERNAL_DB_PERMISSIONS = [
  'canAccessInternalDB',
  'canViewInternalDB',
  'canUpdateInternalDB',
  'canDeleteInternalDB',
] as const;

export default function ResumeDatabasePage() {
  const searchParams = useSearchParams();
  const { user, isTenantAdmin, isLoading: authLoading } = useAuth();

  /* The tab lives in React state, not in the router.
     `router.replace('?tab=…')` is a real App Router navigation: it refetches
     the route, tears the whole page down and rebuilds it, which read as a full
     page refresh on every tab click. Switching a tab is an in-page state
     change, so it is held here and the URL is rewritten with history.replaceState
     — the address bar still carries `?tab=` for sharing and reloads, but
     nothing navigates. Seeded from the URL once, on mount. */
  const [requestedTab, setRequestedTab] = useState<ResumeTab>(() =>
    searchParams.get('tab') === 'internal-db' ? 'internal-db' : 'my-resumes',
  );

  const permissions = user?.permissions;
  const hasAnyPerm = (keys: readonly string[]): boolean =>
    isTenantAdmin || keys.some((k) => permissions?.[k as keyof Permission] === true);

  const canSeeMyResumes = hasAnyPerm(MY_RESUMES_PERMISSIONS);
  const canSeeInternalDb = hasAnyPerm(INTERNAL_DB_PERMISSIONS);

  /* Entitlement is applied on top of the request every render rather than
     corrected into state by an effect, so there is no frame where the two
     disagree. While auth is still loading nobody has permissions yet — trust
     the requested tab rather than concluding "no access", which is what used
     to blank the tab strip and strand the user on whichever tab they had
     just opened. A `?tab=` the user isn't entitled to is treated as absent:
     deep links get shared between colleagues with different roles, and landing
     on the pool you CAN see beats a wall. */
  const activeTab: ResumeTab | null =
    authLoading ? requestedTab
    : requestedTab === 'my-resumes' && canSeeMyResumes ? 'my-resumes'
    : requestedTab === 'internal-db' && canSeeInternalDb ? 'internal-db'
    : canSeeMyResumes ? 'my-resumes'
    : canSeeInternalDb ? 'internal-db'
    : null;

  const handleTabChange = (value: string) => {
    const next: ResumeTab = value === 'internal-db' ? 'internal-db' : 'my-resumes';
    if (next === activeTab) return;
    setRequestedTab(next);
    // URL only — deliberately not router.replace(), see the note above.
    window.history.replaceState(null, '', `/recruitment/resume-database?tab=${next}`);
  };

  /* One tab is not a tab strip — a user with only one of the two permissions
     sees the page without it, rather than a lone chip that looks broken. */
  const showTabs = canSeeMyResumes && canSeeInternalDb;

  /* Per-pool totals for the tab badges. One page_size=1 request each — the
     same probe the views use for their own totals — so switching tabs never
     waits on a full listing. Active resumes only, matching the My Resumes
     "All Resumes" badge. Refetched when the tab changes so a count picks up
     uploads/deletes made on the other tab. */
  const [tabCounts, setTabCounts] = useState<Partial<Record<ResumeTab, number>>>({});
  useEffect(() => {
    if (!showTabs) return;
    let cancelled = false;
    (['my-resumes', 'internal-db'] as const).forEach((tab) => {
      resumeService
        .list({ source: tab, page: 1, page_size: 1, include_archived: false })
        .then((res) => {
          if (!cancelled) setTabCounts((prev) => ({ ...prev, [tab]: res.total }));
        })
        .catch(() => {
          // Keep the last known figure (or none) rather than showing a wrong one.
        });
    });
    return () => { cancelled = true; };
  }, [showTabs, activeTab]);

  const crumbs = [
    { label: 'Dashboard', href: '/dashboard' },
    // No href: this page has no "both tabs" state to link to, and PageBreadcrumb
    // renders a middle crumb without one as a muted grouping label.
    { label: 'Resume Database' },
    { label: activeTab ? TAB_LABEL[activeTab] : 'Resume Database' },
  ];

  const header = (
    <>
      <PageBreadcrumb className={showTabs ? 'mb-3' : 'mb-4 md:mb-6'} items={crumbs} />
      {showTabs && (
        <Tabs value={activeTab ?? undefined} onValueChange={handleTabChange} className="mb-5 md:mb-6">
          {/* Sized to its labels and visibly grooved, so the selected pool reads
              at a glance. The shared TabsList defaults stretch triggers to fill
              the row (flex-1), which left two near-identical full-width slabs. */}
          <TabsList
            aria-label="Resume pool"
            className="h-auto w-auto gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200 shadow-sm dark:bg-slate-900 dark:ring-slate-700"
          >
            {(['my-resumes', 'internal-db'] as const).map((tab) => {
              const Icon = tab === 'my-resumes' ? FolderOpen : Database;
              // Own colour per pool — orange like the folder icons in the
              // tree, cyan like the system folders — so the two read apart.
              const iconColor = tab === 'my-resumes' ? 'text-brand-orange' : 'text-brand-cyan';
              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="h-9 flex-none gap-2 rounded-lg px-4 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 data-[state=active]:bg-slate-100 data-[state=active]:font-semibold data-[state=active]:text-brand-blue data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-brand-blue/30 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 dark:data-[state=active]:bg-slate-800"
                >
                  <Icon className={`h-4 w-4 ${iconColor}`} />
                  {TAB_LABEL[tab]}
                  {tabCounts[tab] !== undefined && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                        activeTab === tab
                          ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                          : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
                      }`}
                    >
                      {tabCounts[tab]}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      )}
    </>
  );

  // Neither pool is readable. The nav hides the entry in this case, so this is
  // only reachable by typed/shared URL — say so plainly instead of rendering an
  // empty list that reads as "you have no resumes".
  if (!activeTab) {
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            <PageBreadcrumb
              className="mb-4 md:mb-6"
              items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resume Database' }]}
            />
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <Lock className="h-5 w-5" />
              </span>
              <h1 className="text-lg font-semibold text-gray-900">Access Restricted</h1>
              <p className="max-w-md text-sm text-gray-600">
                You don&apos;t have permission to view the resume database. Ask your administrator
                for access to My Resumes or the Shared Database.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return activeTab === 'my-resumes' ? (
    <MyResumesView header={header} />
  ) : (
    <InternalDatabaseView header={header} />
  );
}
