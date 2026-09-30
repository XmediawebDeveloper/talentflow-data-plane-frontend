'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  ExternalLink,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { jdService, type JDResponse } from '@/lib/services/jdService';
import JDOverviewSections from '@/components/jobs/JDOverviewSections';

/**
 * ONE JD, in full, in a dialog.
 *
 * The JD is fetched here by id rather than taken from whatever `Job` the host
 * happens to hold: a list-mapped `Job` carries the handful of fields a card
 * needs, and the fields a recruiter opens a JD to read — the description
 * itself, the recruiter's additional details, the assessment guidance, the
 * per-skill notes — are not among them. `jdService.get` is the same call the
 * Job Details page makes for its own Overview tab.
 *
 * WHAT IT SHOWS is that Overview tab's job-description column, section for
 * section: the description, Additional Details, the Internal Recruiter Notes /
 * Assessment Guidance pair, and the collapsible Extracted Data Summary with
 * its Skills & Requirements and Requirements halves. Same fields, same order,
 * same empty-state wording, and the same derivations — the label helpers and
 * the `JDResponse` → display mapping below are the Job Details page's own,
 * copied rather than re-invented so the two surfaces cannot disagree about one
 * JD. Nothing outside that column is here: the page's identity header, its
 * Quick Actions and its activity panels belong to the page.
 *
 * The shell is the Version History modal's: the same overlay, the same
 * `max-h-[calc(100dvh-...)]` box that never grows past the viewport on any
 * screen, a header that stays put with the close action in it, and one
 * scrolling body under it. Escape closes it, as does the overlay.
 */
export default function JDFullViewModal({
  jdId,
  jdTitle,
  onClose,
  onOpenFullPage,
}: {
  jdId: string;
  /** Shown in the header until the record lands, so the dialog opens named. */
  jdTitle?: string;
  onClose: () => void;
  /** Optional route to the JD's own page, offered in the footer when given. */
  onOpenFullPage?: () => void;
}) {
  const [jd, setJd] = useState<JDResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchJd = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await jdService.get(jdId);
        if (!cancelled) setJd(response);
      } catch (err) {
        console.error('[TalentFlow] Failed to load JD for full view:', err);
        const message = err instanceof Error ? err.message : '';
        if (!cancelled) setError(message || 'Failed to load job description');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchJd();
    /* The id can change under an open dialog — the host reopens it for another
       JD — so a reply for the previous id must not paint over the new one. */
    return () => {
      cancelled = true;
    };
  }, [jdId]);

  /* Lock the page behind while the dialog is up, so a wheel over the overlay
     does not scroll the host page out from under it.

     Mount-scoped, deliberately separate from the Escape listener below: hosts
     pass `onClose` as an inline arrow, so an effect keyed on it re-runs on
     every host render — and a re-run would capture the `hidden` it set itself
     as the value to restore, leaving the page locked after the dialog closed. */
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-3xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Job Description"
      >
        {/* Header — stays put while the body scrolls, so the close action is
            reachable from anywhere in a long JD. */}
        <div className="flex-shrink-0 flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <Briefcase className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">
                Job Description
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-400 truncate">
                {jd?.title || jdTitle || 'Loading…'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — the one scrolling region, so the dialog is bounded by the
            viewport whatever the JD's length. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : !jd ? (
            <div className="py-10 text-center">
              <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-slate-400">
                This job description could not be found.
              </p>
            </div>
          ) : (
            /* The Job Details page's Overview column, shared with the View
               JD tab on an assessment — see `JDOverviewSections`. This
               dialog's own copy of it is what moved there.

               `showScoringDetail={false}` keeps what this dialog has always
               shown: it is a quick read of the description, not a review of
               how a resume will be graded, so the Essential / Preferred
               badges, the Location tile and the Scoring Preferences block
               stay off here, as they always were. */
            <JDOverviewSections jd={jd} showScoringDetail={false} />
          )}
        </div>

        {/* Footer — the way through to the JD's own page where the host
            offers one (which is where View JD used to go). */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60">
          {onOpenFullPage && jd ? (
            <button
              type="button"
              onClick={onOpenFullPage}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-brand-blue hover:text-brand-blue-2 transition-colors"
            >
              Open full JD page
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  );
}
