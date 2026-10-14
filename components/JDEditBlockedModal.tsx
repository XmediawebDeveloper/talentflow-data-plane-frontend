'use client';

import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, LayoutGrid, ShieldCheck, ChevronRight, X, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { JDUsageModule } from '@/lib/utils/jdUsageModules';

/**
 * "Cannot Edit Job Description" — shown when a published JD is held by a
 * downstream module.
 *
 * Lives in one place because the same refusal is reachable from the JD detail
 * page and from both the grid and list views on job openings. Those used to
 * carry two different dialogs that drifted apart: one listed three modules and
 * silently omitted AI Interview, the other named none at all.
 */

interface JDEditBlockedModalProps {
  open: boolean;
  /** Modules holding this JD, from `getJDUsageModules()`. */
  modules: JDUsageModule[];
  /** Shown instead of the module list when the backend blocked for a reason
   *  the per-module counts don't describe. */
  reason?: string;
  /** True while the new-version fork is in flight. */
  creating?: boolean;
  onClose: () => void;
  onCreateNewVersion: () => void;
  /** Defaults to opening a blank JD; override to keep extra query params. */
  onCreateNewJD?: () => void;
  /** The blocked JD. Given it, each module card opens THIS JD's Job Details
   *  page on that module's tab instead of the module's own list. */
  jdId?: string;
  /** For a host already showing that JD's Job Details page: switch its tab
   *  in place (a same-page `?tab=` push would be overwritten by the page). */
  onOpenJobTab?: (tab: JobDetailsTab) => void;
  /** This JD's lineage is already at the 5-version cap — "Create New Version"
   *  would fail on the backend anyway, so it is disabled here and the reason
   *  shown up front, rather than letting the click round-trip to an error. */
  atMaxVersions?: boolean;
  /** Swap the header's Close (X) icon for a Cancel button in the footer.
   *  Both just call `onClose` — nothing is saved either way. */
  cancelInFooter?: boolean;
}

/** The Job Details tab each usage module lives on. */
export type JobDetailsTab = 'scored-resumes' | 'assessment-results' | 'ai-talent-match' | 'ai-interview-results';
const JOB_TAB_BY_MODULE: Record<string, JobDetailsTab> = {
  resume_scores_count: 'scored-resumes',
  assessments_count: 'assessment-results',
  ai_matches_count: 'ai-talent-match',
  ai_interview_count: 'ai-interview-results',
};

export default function JDEditBlockedModal({
  open,
  modules,
  reason,
  creating = false,
  onClose,
  onCreateNewVersion,
  onCreateNewJD,
  jdId,
  onOpenJobTab,
  atMaxVersions = false,
  cancelInFooter = false,
}: JDEditBlockedModalProps) {
  const router = useRouter();

  if (!open) return null;

  const handleCreateNewJD = () => {
    if (onCreateNewJD) {
      onCreateNewJD();
      return;
    }
    onClose();
    // The jd-creation route segment is cached by the App Router, so a bare
    // "/recruitment/jd-creation" push can reuse whatever JD was last open in it
    // (an in-progress draft, or the very JD this modal just blocked editing on)
    // instead of opening blank. Same fix as JobOpeningsPage's own "Create" button:
    // a unique `new` nonce makes this a distinct URL, forcing a fresh remount.
    router.push(`/recruitment/jd-creation?new=${Date.now()}`);
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="jd-edit-blocked-title"
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-[95vw] sm:max-w-lg w-full max-h-[90dvh] flex flex-col border border-gray-300 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-start gap-3 px-4 sm:px-5 pt-4 pb-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-warning-subtle flex items-center justify-center shrink-0">
            <AlertTriangle className="w-[18px] h-[18px] text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="jd-edit-blocked-title"
              className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50"
            >
              Cannot Edit Job Description
            </h3>
            <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed mt-1">
              This job description is actively used in one or more modules and cannot be
              modified to maintain data integrity.
            </p>
          </div>
          {!cancelInFooter && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={creating}
              className="px-2 -mt-0.5 -mr-0.5 shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 pb-4 space-y-3">
          {modules.length > 0 ? (
            <div className="rounded-lg border border-warning-line bg-warning-subtle/60 p-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-warning-subtle flex items-center justify-center shrink-0">
                  <LayoutGrid className="w-4 h-4 text-warning" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-warning">
                    Active in ({modules.length})
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed mt-0.5">
                    This JD is currently linked to the following active modules.
                  </p>
                </div>
              </div>

              <ul className="mt-3 space-y-1.5">
                {modules.map(module => {
                  const ModuleIcon = module.icon;
                  const rowBody = (
                    <>
                      <div className="w-8 h-8 rounded-lg bg-brand-blue/10 dark:bg-brand-blue/15 flex items-center justify-center shrink-0">
                        <ModuleIcon className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">
                            {module.name}
                          </span>
                          <span className="px-1.5 py-px text-2xs font-medium rounded bg-brand-blue/10 text-brand-blue shrink-0">
                            {module.count}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed truncate">
                          {module.description}
                        </p>
                      </div>
                    </>
                  );

                  // This JD's own tab for the module, when the host said which JD.
                  const jobTab = jdId || onOpenJobTab ? JOB_TAB_BY_MODULE[module.key] : undefined;
                  /* A link only where the module has somewhere to go. An
                     unrecognised module has no navigation entry, and a
                     chevron leading nowhere is a broken promise. */
                  return (
                    <li key={module.key}>
                      {(jobTab || module.href) ? (
                        <button
                          onClick={() => {
                            if (jobTab && onOpenJobTab) { onOpenJobTab(jobTab); return; }
                            if (jobTab && jdId) { router.push(`/recruitment/job-details?id=${encodeURIComponent(jdId)}&tab=${jobTab}`); return; }
                            router.push(module.href as string);
                          }}
                          title={jobTab ? `Open this JD's ${module.name} tab` : undefined}
                          className="w-full text-left flex items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 hover:border-brand-blue/40 hover:bg-brand-blue/[0.03] transition-colors"
                        >
                          {rowBody}
                          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5">
                          {rowBody}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            /* Blocked for a reason the usage breakdown does not name — show
               whatever the backend said rather than inventing a module. */
            <div className="rounded-lg border border-warning-line bg-warning-subtle/60 p-3">
              <p className="text-xs text-gray-700 dark:text-slate-300 leading-relaxed">
                {reason || 'This JD cannot be edited because it is already in use.'}
              </p>
            </div>
          )}

          <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/5 p-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  Why can&apos;t I edit?
                </h4>
                <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed mt-0.5">
                  Editing is disabled to prevent issues in active processes and ensure
                  consistency across modules.
                </p>
              </div>
            </div>
          </div>

          {atMaxVersions && (
            <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50/60 dark:bg-red-500/5 p-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-semibold text-red-700 dark:text-red-400">
                    Maximum versions reached
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed mt-0.5">
                    This JD already has 5 versions, the maximum allowed. &quot;Create New
                    Version&quot; is unavailable for it — use &quot;Create New JD&quot; instead
                    to start an independent one.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Spells out what each footer button actually does — the two
              differ in a way the labels alone don't convey: one starts an
              unrelated JD, the other carries this one's content forward. */}
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-3">
            {/* Icon and label share one row on `items-center`, so the glyph
                sits on the label's own horizontal line instead of being
                centred against the whole block. The list then hangs below,
                indented by the icon's width plus the gap (24 + 8 = pl-8) so
                its text starts on the same vertical line as "Tip:". */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-warning-subtle flex items-center justify-center shrink-0">
                <Lightbulb className="w-3.5 h-3.5 text-warning" />
              </div>
              <h4 className="text-xs font-semibold text-gray-900 dark:text-slate-100 leading-none">Tip:</h4>
            </div>
            <ol className="mt-2 pl-8 space-y-1 text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
              <li className="flex gap-1.5">
                <span className="font-medium text-gray-500 dark:text-slate-500 shrink-0">1.</span>
                <span>
                  <span className="font-medium text-gray-900 dark:text-slate-200">Create New JD</span>
                  {' '}&mdash; a new JD will be created from scratch. This will be an independent JD.
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="font-medium text-gray-500 dark:text-slate-500 shrink-0">2.</span>
                <span>
                  <span className="font-medium text-gray-900 dark:text-slate-200">Create New Version</span>
                  {' '}&mdash; in this existing JD, a new version will be created.
                </span>
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end px-4 sm:px-5 py-3 border-t border-gray-200 dark:border-slate-700 shrink-0">
          {cancelInFooter && (
            <Button variant="secondary" onClick={onClose} disabled={creating}>
              Cancel
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={handleCreateNewJD}
            disabled={creating}
          >
            Create New JD
          </Button>
          <Button
            variant="primary"
            onClick={onCreateNewVersion}
            disabled={creating || atMaxVersions}
            title={atMaxVersions ? 'This JD has reached the maximum of 5 versions' : undefined}
          >
            {creating ? (
              <>
                {/* The only glyph on either button, and it is state rather
                    than decoration — without it a slow fork looks like a
                    dead click. */}
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Creating...
              </>
            ) : (
              'Create New Version'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
