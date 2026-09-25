'use client';

/**
 * Resume Database — the single entry point for both resume pools, following
 * UI-UX Guidelines §6 ("Two Clear Zones — My Resumes, Internal Database").
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

import { useRouter, useSearchParams } from 'next/navigation';
import { Database, FolderOpen, Lock } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MyResumesView from '@/components/resumes/MyResumesView';
import InternalDatabaseView from '@/components/resumes/InternalDatabaseView';
import type { Permission } from '@/lib/types/tenant';

export type ResumeTab = 'my-resumes' | 'internal-db';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isTenantAdmin } = useAuth();

  const permissions = user?.permissions;
  const hasAnyPerm = (keys: readonly string[]): boolean =>
    isTenantAdmin || keys.some((k) => permissions?.[k as keyof Permission] === true);

  const canSeeMyResumes = hasAnyPerm(MY_RESUMES_PERMISSIONS);
  const canSeeInternalDb = hasAnyPerm(INTERNAL_DB_PERMISSIONS);

  /* Which tab to show. A `?tab=` the user isn't entitled to is treated as
     absent rather than as an error — deep links are shared between colleagues
     with different roles, and landing on the pool you CAN see beats a wall. */
  const requestedTab = searchParams.get('tab');
  const activeTab: ResumeTab | null =
    requestedTab === 'my-resumes' && canSeeMyResumes ? 'my-resumes'
    : requestedTab === 'internal-db' && canSeeInternalDb ? 'internal-db'
    : canSeeMyResumes ? 'my-resumes'
    : canSeeInternalDb ? 'internal-db'
    : null;

  const handleTabChange = (value: string) => {
    if (value === activeTab) return;
    router.replace(`/recruitment/resume-database?tab=${value}`, { scroll: false });
  };

  /* One tab is not a tab strip — a user with only one of the two permissions
     sees the page without it, rather than a lone chip that looks broken. */
  const showTabs = canSeeMyResumes && canSeeInternalDb;

  const header = (
    <>
      <PageBreadcrumb
        className={showTabs ? 'mb-3' : 'mb-4 md:mb-6'}
        items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resume Database' }]}
      />
      {showTabs && (
        <Tabs value={activeTab ?? undefined} onValueChange={handleTabChange} className="mb-4 md:mb-6">
          <TabsList aria-label="Resume pool">
            <TabsTrigger value="my-resumes" className="px-3 sm:px-4">
              <FolderOpen className="h-3.5 w-3.5" />
              My Resumes
            </TabsTrigger>
            <TabsTrigger value="internal-db" className="px-3 sm:px-4">
              <Database className="h-3.5 w-3.5" />
              Internal Database
            </TabsTrigger>
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
                for access to My Resumes or the Internal Database.
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
