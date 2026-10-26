'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Clock, GraduationCap, Factory, Settings } from 'lucide-react';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { tabPill } from '@/components/ui/filter-pills';
import MasterDataManagement from '@/components/masters/MasterDataManagement';
import { PageSkeleton } from '@/components/ui/skeleton';

/**
 * The three master-data lists a job description is built from, behind one tab
 * bar — the same tab pattern the Job Details page uses, so the two read alike.
 *
 * Each panel is the SAME `MasterDataManagement` the standalone /masters/...
 * routes render, in its embedded mode. Add, edit, delete and pagination behave
 * identically here and there, and neither can drift from the other. Those
 * routes are kept: they are what existing deep links and bookmarks point at.
 */
const TABS = [
  { id: 'experience', label: 'Experience Levels', icon: Clock },
  { id: 'education', label: 'Education Levels', icon: GraduationCap },
  { id: 'industry', label: 'Industry Types', icon: Factory },
] as const;

type ConfigTab = (typeof TABS)[number]['id'];

const DEFAULT_TAB: ConfigTab = 'experience';

const isConfigTab = (value: string | null): value is ConfigTab =>
  TABS.some((tab) => tab.id === value);

function JobOpeningsConfigContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /* Seeded from the URL so a refresh, a Back, or a shared link opens the tab it
     names rather than resetting to the first one — the same reason the Job
     Details page keeps its tab in `?tab=`. An unknown value falls back to the
     default rather than rendering an empty panel. */
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<ConfigTab>(
    isConfigTab(urlTab) ? urlTab : DEFAULT_TAB,
  );

  /* Written back on every change. `replace`, not `push`: switching tabs is not a
     step the Back button should have to walk through — Back goes to the job
     list. `scroll: false` because the App Router would otherwise jump to the top
     of the page on each tab click. The default tab clears the param rather than
     writing `?tab=experience`, so a plain URL keeps meaning the default. */
  useEffect(() => {
    const current = searchParams.get('tab') || DEFAULT_TAB;
    if (current === activeTab) return;
    const next = new URLSearchParams(searchParams.toString());
    if (activeTab === DEFAULT_TAB) next.delete('tab');
    else next.set('tab', activeTab);
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [activeTab, searchParams, pathname, router]);

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Job Descriptions', href: '/recruitment/job-openings' },
              { label: 'Configuration' },
            ]}
          />

          {/* One header for the page, where each master-data route carries its
              own when visited standalone — the module page-header pattern
              (Resume Scoring, Assessments): a tinted icon tile, then title and
              subtitle, no banner. */}
          <div className="mb-5 flex items-start gap-3">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <Settings className="h-4 w-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight">
                Job Description Configuration
              </h1>
              <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
                The lists every job description is built from. Pick a section to add, edit or
                reorder its options.
              </p>
            </div>
          </div>

          {/* Horizontal pill tab bar above the chosen list — the same `tabPill`
              chrome the Job Openings list and detail pages use, so Config reads
              as part of the same tab system. Wraps on narrow screens rather than
              forcing a sideways scroll. */}
          <div className="space-y-4 md:space-y-5">
            <nav
              role="tablist"
              aria-label="Configuration sections"
              className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5"
            >
              {TABS.map(({ id, label, icon: TabIcon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`config-panel-${id}`}
                    onClick={() => setActiveTab(id)}
                    className={`${tabPill(active)} whitespace-nowrap`}
                  >
                    <TabIcon className="h-4 w-4 flex-shrink-0" />
                    {label}
                  </button>
                );
              })}
            </nav>

            {/* Only the active panel is mounted. Each fetches its own list, so
                rendering all three would fire three requests to show one.
                Keying on the tab makes the switch a remount, which is what
                resets the previous panel's pagination and any open modal. */}
            <div role="tabpanel" id={`config-panel-${activeTab}`} className="flex-1 min-w-0">
              <MasterDataManagement key={activeTab} type={activeTab} embedded />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function JobOpeningsConfigPage() {
  // `useSearchParams` needs a Suspense boundary above it, same as job-details.
  return (
    <Suspense
      fallback={<PageSkeleton variant="table" showStats={false} />}
    >
      <JobOpeningsConfigContent />
    </Suspense>
  );
}
