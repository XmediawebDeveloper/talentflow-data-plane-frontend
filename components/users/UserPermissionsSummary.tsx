'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Info, Minus, Search } from 'lucide-react';
import { getPermissionDisplaySections } from '@/lib/constants/permissionCategories';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Compact read-only body for the Users table's "+N more" popup: one user's
 * permissions at a glance.
 *
 *   [Role] ● Active          42 of 60 permissions ▬▬▬▬▭
 *   [🔍 Filter permissions]                [Granted | All]
 *   ▾ Job Openings            3 / 5
 *     ✓ View JD  ✓ Create JD  ✓ Manage JD
 *   ▸ Resumes                 2 / 4
 *   ⓘ View Analytics and View Support are always included…
 *
 * Modules are collapsible rows (collapsed by default) with the permissions as
 * small chips (instead of
 * one big tile each). "All" also lists what the user does NOT have, greyed.
 */
export default function UserPermissionsSummary({
  codes,
  isLoading,
  roleLabel,
  roleBadgeClass,
  isActive,
}: {
  /** Granted permission codes (already including the always-on pair). */
  codes: Iterable<string>;
  isLoading: boolean;
  roleLabel: string;
  roleBadgeClass: string;
  isActive: boolean;
}) {
  const granted = useMemo(() => new Set(codes), [codes]);
  const [view, setView] = useState<'granted' | 'all'>('granted');
  const [query, setQuery] = useState('');
  // Expanded module ids — every module starts collapsed; tap a row to open it.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const allSections = useMemo(() => getPermissionDisplaySections(), []);
  const totalCount = allSections.reduce((n, s) => n + s.items.length, 0);
  const grantedCount = allSections.reduce((n, s) => n + s.items.filter((i) => granted.has(i.code)).length, 0);
  const coverage = totalCount ? Math.round((grantedCount / totalCount) * 100) : 0;

  const q = query.trim().toLowerCase();
  const sections = allSections
    .map((section) => {
      const sectionMatches = !!q && section.name.toLowerCase().includes(q);
      const items = section.items.filter(
        (item) =>
          (view === 'all' || granted.has(item.code)) &&
          (!q || sectionMatches || item.label.toLowerCase().includes(q)),
      );
      return {
        ...section,
        items,
        grantedHere: section.items.filter((i) => granted.has(i.code)).length,
        totalHere: section.items.length,
      };
    })
    .filter((section) => section.items.length > 0);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
        <span className={`max-w-[50%] truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-black/5 ${roleBadgeClass}`}>
          {roleLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-slate-400">
          <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-brand-blue' : 'bg-gray-300'}`} />
          {isActive ? 'Active' : 'Inactive'}
        </span>
        <div className="ml-auto flex min-w-[10rem] flex-1 items-center gap-2 sm:flex-none">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 sm:w-24 sm:flex-none dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-blue transition-all duration-500" style={{ width: `${coverage}%` }} />
          </div>
          <span className="whitespace-nowrap tf-meta">
            {isLoading ? '—' : (
              <>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{grantedCount}</span> of {totalCount}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Filter + Granted/All */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter permissions"
            aria-label="Filter permissions"
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm max-sm:text-[13px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 hover:border-brand-blue/40 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 focus-visible:!outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div role="radiogroup" aria-label="Show permissions" className="relative grid h-9 shrink-0 grid-cols-2 rounded-lg bg-brand-blue/5 p-1 ring-1 ring-brand-blue/10">
          <span
            aria-hidden
            className={`absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-md bg-white shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-slate-800 ${
              view === 'all' ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          {(['granted', 'all'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={`relative z-10 px-3 text-xs font-medium transition-colors duration-300 ${
                view === v ? 'text-brand-blue' : 'text-gray-600 hover:text-brand-blue dark:text-slate-400'
              }`}
            >
              {v === 'granted' ? 'Granted' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Modules */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-10" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Array.from({ length: 3 }).map((__, c) => (
                  <Skeleton key={c} className="h-6 w-24 rounded-md" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : sections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center tf-body-muted max-sm:text-[13px] dark:border-slate-700 dark:bg-slate-900">
          {q ? `No permissions match “${query.trim()}”` : 'No permissions granted'}
        </p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white dark:divide-slate-700/60 dark:border-slate-700 dark:bg-slate-900">
          {sections.map((section) => {
            // A filter opens its matches; otherwise collapsed until tapped.
            const open = !!q || expanded.has(section.id);
            return (
              <section key={section.id}>
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
                  />
                  <span className="min-w-0 flex-1 truncate tf-cell-name max-sm:text-[13px]">{section.name}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums ${
                      section.grantedHere > 0
                        ? 'bg-brand-blue/10 text-brand-blue'
                        : 'bg-gray-100 text-gray-400 dark:bg-slate-800'
                    }`}
                  >
                    {section.grantedHere} / {section.totalHere}
                  </span>
                </button>
                {open && (
                  <div className="flex flex-wrap gap-1.5 px-3 pb-3 pl-9">
                    {section.items.map((item) => {
                      const has = granted.has(item.code);
                      return (
                        <span
                          key={item.code}
                          title={has ? undefined : 'Not granted'}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                            has
                              ? 'bg-brand-blue/5 font-medium text-gray-800 ring-1 ring-brand-blue/10 dark:text-slate-200'
                              : 'border border-dashed border-gray-200 text-gray-400 dark:border-slate-700 dark:text-slate-500'
                          }`}
                        >
                          {has ? <Check className="h-3 w-3 text-brand-blue" /> : <Minus className="h-3 w-3" />}
                          {item.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-1.5 tf-meta">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-brand-blue/60" />
        <span>
          <span className="font-medium text-gray-700 dark:text-slate-300">View Analytics</span> and{' '}
          <span className="font-medium text-gray-700 dark:text-slate-300">View Support</span> are always included for every user.
        </span>
      </p>
    </div>
  );
}
