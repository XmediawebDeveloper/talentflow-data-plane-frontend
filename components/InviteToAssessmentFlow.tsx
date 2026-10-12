'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, CheckCircle, ClipboardCheck, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AssessmentPicker from '@/components/assessments/AssessmentPicker';
import JobAssessmentVersionPicker from '@/components/assessments/JobAssessmentVersionPicker';
import SelectedCandidatesPanel from '@/components/SelectedCandidatesPanel';
import type { Resume } from '@/lib/types/types';

/** The minimum a candidate row needs to become an assessment invite. */
export interface AssessmentInviteCandidate {
  id: string;
  name: string;
  email?: string;
}

// The API rows the host already holds; typed loosely, as the hosts hold them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InviteAssessment = any;

interface InviteToAssessmentFlowProps {
  open: boolean;
  onClose: () => void;
  /** The assessments on offer — loaded by the host exactly as it always has. */
  assessments: InviteAssessment[];
  loading?: boolean;
  /** Pick several assessments at once (checkboxes) instead of one (radio). */
  multiple?: boolean;
  /** The host's own selection state, unchanged. */
  selectedAssessments: InviteAssessment[];
  onSelectedAssessmentsChange: (assessments: InviteAssessment[]) => void;
  /** Who is being invited, in order. */
  candidates: AssessmentInviteCandidate[];
  /** The rows behind those candidates. Given them, the dialog shows the shared
   *  Candidates Selected panel (untick to leave someone out); ids must match
   *  `candidates`. */
  resumes?: Resume[];
  /**
   * Send Invitations: hands back the candidates still ticked. The host then
   * runs its existing step — builds its recipient list, validates, and opens
   * Share Assessment via Email — so no invite logic lives here.
   */
  onProceed: (invitees: AssessmentInviteCandidate[]) => void;
  /** The JD the candidates were matched against (AI Talent Match). Given it,
   *  the dialog opens on THAT job's assessment versions as cards — as the
   *  Invite to AI Interview dialog does — with a link to browse them all. */
  jobId?: string;
  /** `jobId`'s own job version, when the host knows it (Job Details) — passed
   *  to the version cards' heading and preview. */
  jobVersionNumber?: number;
  /** What "Browse all assessments instead" lists, when the host scopes
   *  `assessments` to one job (Job Details hands this job version's rows to
   *  the cards, and every active assessment across all jobs here). Omitted,
   *  the full list is `assessments` itself, as before. */
  browseAssessments?: InviteAssessment[];
  /** Still loading `browseAssessments`. */
  browseLoading?: boolean;
}

/**
 * "Invite selected candidates to an assessment" — the Invite to AI Interview
 * dialog (InviteToAIInterviewFlow) with assessments in it: the same shell,
 * header, Candidates Selected panel, footer sentence and buttons, and the
 * shared AssessmentPicker (search, Grouped/Ungrouped, paging, preview) in
 * place of the interview picker.
 *
 * One component so every "Invite Assessment" entry point — AI Talent Match's
 * row and bulk actions and a resume's Invite → Assessment — is the same
 * dialog. It owns only what the dialog shows; which assessments are listed,
 * what a pick means and what Send does stay with the host.
 */
export default function InviteToAssessmentFlow({
  open,
  onClose,
  assessments,
  loading = false,
  multiple = false,
  selectedAssessments,
  onSelectedAssessmentsChange,
  candidates,
  resumes,
  onProceed,
  jobId,
  jobVersionNumber,
  browseAssessments,
  browseLoading = false,
}: InviteToAssessmentFlowProps) {
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  /** Candidates unticked in the panel — listed, but not invited. */
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const invitees = candidates.filter((candidate) => !excludedIds.includes(candidate.id));
  const pickedCount = selectedAssessments.length;
  /** Escape hatch from the job-scoped cards to the full list. */
  const [browseAll, setBrowseAll] = useState(false);
  const jobScoped = !!jobId && !browseAll;
  /* The full list's rows and loading state — the host's cross-job list when
     it gave one, else the same rows as ever. */
  const listAssessments = browseAssessments ?? assessments;
  const listLoading = browseAssessments ? browseLoading : loading;
  /* One picked version, in the job view: named on the footer and the button
     ("Send with V2"), as the AI Interview dialog names its interview. */
  const singlePickVersion = jobScoped && pickedCount === 1
    ? (typeof selectedAssessments[0].version === 'number' ? selectedAssessments[0].version : null)
    : null;

  if (!open) return null;

  const close = () => {
    setExcludedIds([]);
    setBrowseAll(false);
    onClose();
  };
  const proceed = () => {
    const ticked = invitees;
    setExcludedIds([]);
    setBrowseAll(false);
    onProceed(ticked);
  };
  /* A card click in the job view — add / remove when several can be picked,
     else replace. */
  const toggleFromCard = (a: InviteAssessment) => {
    const isPicked = selectedAssessments.some((x) => x.id === a.id);
    if (multiple) {
      onSelectedAssessmentsChange(isPicked ? selectedAssessments.filter((x) => x.id !== a.id) : [...selectedAssessments, a]);
    } else {
      onSelectedAssessmentsChange(isPicked ? [] : [a]);
    }
  };
  /* Switching between the job's cards and the full list starts the pick
     over, as the AI Interview dialog does. */
  const switchView = (all: boolean) => {
    onSelectedAssessmentsChange([]);
    setBrowseAll(all);
  };

  const candidatesPanel = resumes && resumes.length > 0 ? (
    <SelectedCandidatesPanel
      resumes={resumes}
      excludedIds={excludedIds}
      onToggleCandidate={(id) =>
        setExcludedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
      }
      tip="Invitations go to each candidate's email address — untick anyone you want to leave out."
      tableCheckboxes
    />
  ) : null;

  return (
    <>
      {/* Shell, header, body and footer are the Invite to AI Interview
          dialog's, class for class. */}
      <div
        className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={close}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        {/* Opened for a job (AI Talent Match), ONE size whichever view is up:
            narrower than the cross-job dialog, and a fixed height, so "Browse
            all assessments instead" swaps the content inside the same box —
            the list scrolls in the body (its wide table sideways in its own
            shell) — rather than growing the dialog. */}
        <div className={`bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl ${jobId ? 'lg:max-w-4xl xl:max-w-5xl h-[calc(100dvh-1.5rem)] sm:h-[min(46rem,calc(100dvh-3rem))]' : 'lg:max-w-6xl xl:max-w-7xl'} max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200`}>
          <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                <ClipboardCheck className="w-4 h-4 text-brand-blue" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Invite to Assessment</h2>
                {/* What the dialog is for. The count lives on the Candidates
                    Selected panel below, which tracks unticking. */}
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Select candidates to invite for an assessment</p>
              </div>
            </div>
            {/* No X — the footer's Cancel closes. */}
          </div>

          {/* One scrolling body. Over the job's version cards, the cards come
              first and the Candidates Selected panel follows; over the full
              list, the panel leads as before (the list pages and searches). */}
          <div ref={bodyScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {!jobScoped && candidatesPanel}

            {(jobScoped ? loading : listLoading) ? (
              <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
                <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
              </div>
            ) : jobScoped ? (
              <div>
                {/* Opened from a job (AI Talent Match): only that job's
                    assessment versions, as selectable cards. */}
                <JobAssessmentVersionPicker
                  assessments={assessments}
                  jobId={jobId as string}
                  jobVersionNumber={jobVersionNumber}
                  multiple={multiple}
                  selectedIds={selectedAssessments.map((a) => a.id)}
                  onToggle={toggleFromCard}
                />
                <button
                  type="button"
                  onClick={() => switchView(true)}
                  className="mt-3 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
                >
                  Browse all assessments instead
                </button>
              </div>
            ) : multiple ? (
              <>
                {jobId && (
                  <button
                    type="button"
                    onClick={() => switchView(false)}
                    className="mt-4 mb-1 inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                    Back to this job&apos;s assessment versions
                  </button>
                )}
              <AssessmentPicker
                assessments={listAssessments}
                multiple
                selectedIds={selectedAssessments.map((a) => a.id)}
                onSelectionChange={onSelectedAssessmentsChange}
                scrollContainerRef={bodyScrollRef}
              />
              </>
            ) : (
              <>
                {jobId && (
                  <button
                    type="button"
                    onClick={() => switchView(false)}
                    className="mt-4 mb-1 inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 hover:underline underline-offset-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                    Back to this job&apos;s assessment versions
                  </button>
                )}
              <AssessmentPicker
                assessments={listAssessments}
                selectedId={selectedAssessments[0]?.id ?? null}
                onSelect={(a) => onSelectedAssessmentsChange(a ? [a] : [])}
                scrollContainerRef={bodyScrollRef}
              />
              </>
            )}

            {jobScoped && candidatesPanel && <div className="mt-5">{candidatesPanel}</div>}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0">
            {/* Same footer sentence as the AI Interview dialog: what is
                missing, then what is about to happen. */}
            <div className="min-w-0 sm:truncate sm:whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-slate-300">
              {invitees.length === 0
                ? 'Select at least one candidate to continue'
                : pickedCount === 0
                  ? (jobScoped
                      ? 'Select an assessment version to continue'
                      : multiple ? 'Select at least one assessment to continue' : 'Select one assessment to continue')
                  : (
                    <span className="inline-flex items-center gap-1.5 align-middle">
                      <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                      Ready to invite {invitees.length} candidate{invitees.length === 1 ? '' : 's'} to {singlePickVersion
                        ? `Assessment V${singlePickVersion}`
                        : `${pickedCount} assessment${pickedCount === 1 ? '' : 's'}`}
                    </span>
                  )}
            </div>
            <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
              {/* Cancel — closes without sending or touching the pick (the
                  host keeps its selection; only this dialog's own unticks and
                  view reset, as the X used to). */}
              <Button variant="secondary" onClick={close} className="flex-1 sm:flex-none !h-9">
                Cancel
              </Button>
              <button
                onClick={proceed}
                disabled={pickedCount === 0 || invitees.length === 0}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail className="w-4 h-4" />
                {singlePickVersion ? `Send with V${singlePickVersion}` : 'Send Invitations'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
