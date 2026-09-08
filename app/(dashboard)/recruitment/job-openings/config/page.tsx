'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Clock, GraduationCap, Factory, Settings, Sparkles, Loader2 } from 'lucide-react';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import MasterDataManagement from '@/components/masters/MasterDataManagement';

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

          {/* One hero for the page, where each master-data route carries its own
              when visited standalone. */}
          <section className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />
            <div className="relative">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-brand-orange" />
                Master data
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                  <Settings className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    Job Description Configuration
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">
                    The lists every job description is built from. Pick a section to add, edit or
                    reorder its options.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Tab bar — the Job Details pattern: a bordered card, the active tab
              tinted with an underline bar. Deliberately NOT sticky, unlike that
              page: the breadcrumb above is already sticky, and a second sticky
              layer is what let the crumb overlap and swallow clicks meant for
              the tabs there. Nothing here needs pinning. */}
          <div className="mb-5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
            <div
              role="tablist"
              aria-label="Configuration sections"
              className="flex items-center border-b border-gray-200 dark:border-slate-700 overflow-x-auto"
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
                    className={`px-4 py-2.5 text-sm transition-colors relative flex items-center gap-2 whitespace-nowrap rounded-t-[11px] ${
                      active
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-50 hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <TabIcon className="h-4 w-4" />
                    {label}
                    {active && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Only the active panel is mounted. Each fetches its own list, so
              rendering all three would fire three requests to show one. Keying
              on the tab makes the switch a remount, which is what resets the
              previous panel's pagination and any open modal. */}
          <div role="tabpanel" id={`config-panel-${activeTab}`}>
            <MasterDataManagement key={activeTab} type={activeTab} embedded />
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
      fallback={
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <Loader2 className="w-8 h-8 animate-spin text-gray-800 dark:text-slate-200" />
          <span className="ml-3 text-gray-600 dark:text-slate-400">Loading...</span>
        </div>
      }
    >
      <JobOpeningsConfigContent />
    </Suspense>
  );
}
