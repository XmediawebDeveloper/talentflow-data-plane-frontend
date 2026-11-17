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

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { Database, FolderOpen, Lock } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MyResumesView from '@/components/resumes/MyResumesView';
import InternalDatabaseView from '@/components/resumes/InternalDatabaseView';
import { resumeService, RESUMES_CHANGED_EVENT } from '@/lib/services/resumeService';
import type { Permission } from '@/lib/types/tenant';
import {
  INTERNAL_DB_PERMISSIONS,
  MY_RESUMES_PERMISSIONS,
  RESUME_TAB_LABEL as TAB_LABEL,
  type ResumeTab,
} from '@/lib/constants/resumePools';

export type { ResumeTab };

/** The page's breadcrumb, shared by the page and its no-access state.
 *  The tab strip already shows which pool is open, so the trail stops at the
 *  page itself rather than repeating the tab name — and stays the same when
 *  the tab changes. */
const CRUMBS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Resume Database' },
];

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

  /* Both views pin their search bar as a second sticky layer under this
     page's sticky breadcrumb. Its real height (it can wrap on a phone) is
     published as --crumb-h so the search pins just below it instead of
     sliding underneath and being covered. A callback ref, so it re-measures
     when the tab swaps the view (and the breadcrumb) out. */
  const [crumbHeight, setCrumbHeight] = useState(0);
  const crumbObserver = useRef<ResizeObserver | null>(null);
  const crumbRef = useCallback((el: HTMLElement | null) => {
    crumbObserver.current?.disconnect();
    crumbObserver.current = null;
    if (!el) return;
    const measure = () => setCrumbHeight(el.getBoundingClientRect().height);
    measure();
    crumbObserver.current = new ResizeObserver(measure);
    crumbObserver.current.observe(el);
  }, []);

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

  /* Both pools readable — the tab counts are fetched only then (a pool the
     user may not read is never queried). */
  const bothPools = canSeeMyResumes && canSeeInternalDb;
  /* RBAC: the tab strip is always shown once the page renders. A pool the
     user lacks permission for stays VISIBLE as a greyed-out tab with a hover
     tooltip — permission-gated tabs are never hidden. */
  const showTabs = canSeeMyResumes || canSeeInternalDb;
  const tabLocked = (tab: ResumeTab): boolean =>
    !authLoading && (tab === 'my-resumes' ? !canSeeMyResumes : !canSeeInternalDb);

  /* Per-pool totals for the tab badges: ONE GET /resumes/stats call (both
     pools in a single COUNT … FILTER query, no folder breakdown) instead of a
     page_size=1 probe per tab. Active resumes only, matching the My Resumes
     "All Resumes" badge. Refetched when the tab changes so a count picks up
     uploads/deletes made on the other tab. */
  const [tabCounts, setTabCounts] = useState<Partial<Record<ResumeTab, number>>>({});
  useEffect(() => {
    if (!bothPools) return;
    let cancelled = false;
    const load = () => {
      resumeService
        .stats({ include_archived: false, include_folders: false })
        .then((res) => {
          if (cancelled) return;
          setTabCounts((prev) => {
            const next = { ...prev };
            (['my-resumes', 'internal-db'] as const).forEach((tab) => {
              const n = res.sources?.[tab];
              if (typeof n === 'number') next[tab] = n;
            });
            return next;
          });
        })
        .catch(() => {
          // Keep the last known figure (or none) rather than showing a wrong one.
        });
    };
    load();
    // Archive / unarchive / move / delete inside either view changes these
    // totals without a tab switch — refetch when the service says so.
    window.addEventListener(RESUMES_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(RESUMES_CHANGED_EVENT, load);
    };
  }, [bothPools, activeTab]);

  const header = (
    <>
      <PageBreadcrumb className={showTabs ? 'mb-3' : 'mb-4 md:mb-6'} items={CRUMBS} barRef={crumbRef} />
      {showTabs && (
        <Tabs value={activeTab ?? undefined} onValueChange={handleTabChange} className="mb-5 md:mb-6">
          {/* Sized to its labels and visibly grooved, so the selected pool reads
              at a glance. The shared TabsList defaults stretch triggers to fill
              the row (flex-1), which left two near-identical full-width slabs. */}
          <TabsList
            aria-label="Resume pool"
            /* Below sm a two-column grid: side by side at their natural width
               the two pools overflowed a phone and "Shared Database" scrolled
               out of view. From sm it sizes to its labels again. */
            className="grid h-auto w-full max-w-full grid-cols-2 gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-slate-200 shadow-sm sm:inline-flex sm:w-auto dark:bg-slate-900 dark:ring-slate-700"
          >
            {(['my-resumes', 'internal-db'] as const).map((tab) => {
              const Icon = tab === 'my-resumes' ? FolderOpen : Database;
              // Own colour per pool — orange like the folder icons in the
              // tree, cyan like the system folders — so the two read apart.
              const iconColor = tab === 'my-resumes' ? 'text-brand-orange' : 'text-brand-cyan';
              const locked = tabLocked(tab);
              /* Locked: native `disabled` on the trigger (Radix then refuses to
                 select it), wrapped in a span so the tooltip still shows. */
              const trigger = (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  disabled={locked}
                  aria-disabled={locked || undefined}
                  className={
                    locked
                      ? 'h-auto min-h-9 min-w-0 flex-none gap-1.5 whitespace-normal rounded-lg px-2.5 text-sm font-medium text-gray-400 cursor-not-allowed opacity-60 sm:h-9 sm:whitespace-nowrap dark:text-slate-500'
                      : 'h-auto min-h-9 min-w-0 flex-none gap-1.5 whitespace-normal rounded-lg px-2 text-sm sm:h-9 sm:whitespace-nowrap font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 data-[state=active]:bg-slate-100 data-[state=active]:font-semibold data-[state=active]:text-brand-blue data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-brand-blue/30 sm:gap-2 sm:px-4 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 dark:data-[state=active]:bg-slate-800'
                  }
                >
                  <Icon className={`h-4 w-4 shrink-0 ${locked ? 'text-gray-400' : iconColor}`} />
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
              return locked ? (
                <span
                  key={tab}
                  title={`You do not have permission to view ${TAB_LABEL[tab]}`}
                  className="inline-flex cursor-not-allowed"
                >
                  {trigger}
                </span>
              ) : trigger;
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
      <main className="tf-page">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="tf-page-sheet">
            <PageBreadcrumb className="mb-4 md:mb-6" items={CRUMBS} />
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <Lock className="h-5 w-5" />
              </span>
              <h1 className="tf-page-title">Access Restricted</h1>
              <p className="max-w-md tf-body-secondary">
                You don&apos;t have permission to view the resume database. Ask your administrator
                for access to My Resumes or the Shared Database.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // display:contents — the wrapper only carries --crumb-h down to the views;
  // it generates no box, so the views stay direct flex children of the layout.
  return (
    <div className="contents" style={{ '--crumb-h': `${crumbHeight}px` } as CSSProperties}>
      {activeTab === 'my-resumes' ? (
        <MyResumesView header={header} />
      ) : (
        <InternalDatabaseView header={header} />
      )}
    </div>
  );
}
