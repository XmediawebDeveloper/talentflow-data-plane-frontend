'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, Loader2, X } from 'lucide-react';
import { getJDDisableImpactModules } from '@/lib/utils/jdUsageModules';

/**
 * "Disable Job Description?" — the confirmation shown before a published JD is
 * taken out of service.
 *
 * A plain overlay rather than a Radix `AlertDialog` — no scroll-lock reflow and
 * no enter animation, so it mounts and paints in one frame and cannot be caught
 * half-open.
 *
 * Two things about how it is mounted are load-bearing, both aimed at the same
 * reported bug — the job row the menu was opened from flashing on top of this
 * dialog for a few frames:
 *
 *   - It renders through a portal into `document.body`, so it is a top-level
 *     sibling of the whole dashboard rather than a node inside the job list's
 *     subtree. No ancestor of the list can put it in a stacking context, and
 *     the list's composited layers sit unambiguously beneath it.
 *   - Its z-index matches `ConfirmationDialog`'s (the AI Talent Match confirm
 *     opened from this same three-dot menu, which does not exhibit the bug).
 *     z-50 is not enough on this page: several components still raise cards to
 *     z-[9999], and the virtual-scrollbar overlay sits at 10000.
 */

interface JDDisableModalProps {
  open: boolean;
  /** Title of the JD being disabled — named back to the user in the prompt. */
  jobTitle: string;
  /** Human-readable JD id ("JD-001"), from the row's own `job_id`. */
  jdNumber?: string;
  /** Lineage version behind the row's v1/v2 badge, from `versionNumber`. */
  version?: number | null;
  /** True while the status write is in flight. */
  disabling?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function JDDisableModal({
  open,
  jobTitle,
  jdNumber,
  version,
  disabling = false,
  onCancel,
  onConfirm,
}: JDDisableModalProps) {
  // Escape closes, as it did while this was a Radix AlertDialog. Held back
  // mid-write so a stray keypress can't hide a disable that is still running.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disabling) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, disabling, onCancel]);

  // document only exists once mounted; the portal target cannot be read on the
  // server render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  const modules = getJDDisableImpactModules();

  return createPortal(
    <div
      className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="jd-disable-title"
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90dvh] flex flex-col border border-gray-300 dark:border-slate-700">
        {/* Header — icon, question and the JD it applies to, above a rule. */}
        <div className="flex items-start gap-3 sm:gap-4 px-4 sm:px-6 pt-5 pb-4 border-b border-gray-200 dark:border-slate-700 shrink-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="jd-disable-title"
              className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50"
            >
              Disable Job Description?
            </h3>
            {/* The JD's name carries the warning colour: it is the one part of
                this sentence that changes between one disable and the next. */}
            {/* JD number, then role, then version — the same order and the same
                two fields the list row shows in its own chips, so the line can
                never name a different JD than the row that was clicked. A draft
                with no assigned JD number, or a row with no lineage version,
                drops that part rather than printing "undefined". */}
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-400 leading-relaxed break-words">
              Are you sure you want to disable{' '}
              {jdNumber && (
                <>
                  <span className="font-semibold text-red-600 dark:text-red-400">{jdNumber}</span>{' '}
                </>
              )}
              <span className="font-semibold text-red-600 dark:text-red-400">&quot;{jobTitle}&quot;</span>
              {version != null && (
                <span className="font-semibold text-red-600 dark:text-red-400"> (V{version})</span>
              )}
              ?
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={disabling}
            className="p-1 -mt-0.5 -mr-0.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4">
          {/* Consequence, marked with the same red rule that leads the cards
              below it so the whole block reads as one warning. */}
          <div className="flex items-stretch gap-3">
            <span className="w-1 rounded-full bg-red-500 dark:bg-red-400 shrink-0" aria-hidden="true" />
            <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-100 leading-relaxed">
              If you disable this JD, it will{' '}
              <span className="font-semibold text-red-600 dark:text-red-400">not</span>{' '}
              be available to use in:
            </p>
          </div>

          {/* Each module keeps its own dashboard glyph and colour, so the row
              is recognisable as the sidebar entry it names. */}
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {modules.map(module => {
              const ModuleIcon = module.icon;
              return (
                <li
                  key={module.key}
                  className="flex items-start gap-3 rounded-lg border border-red-100 dark:border-red-500/20 bg-red-50/70 dark:bg-red-500/[0.06] p-3"
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${module.tileClass}`}
                  >
                    <ModuleIcon className={`w-5 h-5 ${module.iconClass}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">
                      {module.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mt-0.5">
                      {module.summary}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Reassurance last: disabling is reversible, and saying so here is
              what stops a recruiter treating this dialog as a delete. */}
          <div className="flex items-center gap-2.5 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/5 px-3 py-3">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
              You can re-enable this JD at any time if needed.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-slate-700 shrink-0">
          <button
            onClick={onCancel}
            disabled={disabling}
            className="px-4 py-2 bg-white dark:bg-slate-900 text-sm font-medium text-gray-900 dark:text-slate-100 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={disabling}
            className="px-4 py-2 bg-red-600 text-sm font-medium text-white rounded-lg hover:bg-red-700 transition-colors shadow-md shadow-red-500/25 ring-1 ring-white/10 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {disabling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Disabling...
              </>
            ) : (
              'Yes, Disable'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
