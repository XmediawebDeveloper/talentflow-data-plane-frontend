'use client';

import { X, CheckCircle, Briefcase, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Resume, Job } from '@/lib/types/types';
import JobOpeningPickerList, { JobSelection } from '@/components/jobs/JobOpeningPickerList';
import SelectedCandidatesPanel from './SelectedCandidatesPanel';
import CandidateVersionPicker from './CandidateVersionPicker';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';

/**
 * One radio group across the whole dialog — the job cards AND every Version
 * History row inside them. Exactly one JD version can be picked, and the
 * browser enforces it alongside the state.
 */
const JOB_RADIO_GROUP = 'apply-to-job-selection';

interface ApplyToJobModalProps {
  resumes: Resume[];
  /**
   * Jobs the host already had. Shown immediately so the list isn't empty on
   * open, then replaced by the job list's own fetch — the same request, mapping
   * and ordering the Job Openings page uses, so the list here matches that page
   * field for field rather than whatever subset a host happened to map.
   */
  jobs?: Job[];
  onClose: () => void;
  /**
   * The picked candidates and job. The third argument hands back the selected
   * Job records themselves: the job list reads from the API rather than from
   * the host, so a host that needs the object (a title for a toast, a job to
   * hand to a progress panel) can no longer be sure to find it in whatever
   * list it passed in.
   */
  onApply: (
    resumeIds: string[],
    jobIds: string[],
    selectedJobRecords?: Job[],
    /** Parallel to `resumeIds`: the candidate's own resume id each submitted
     *  id came from (they differ when an older version was picked). */
    sourceResumeIds?: string[],
  ) => void;
  mode?: 'apply' | 'assessment' | 'scoring' | 'match';
  title?: string; // New: Custom title
  description?: string; // New: Custom description
  stayOnCurrentPage?: boolean;
  /** Overrides the confirm button's label — "Run AI Talent Match" and friends. */
  confirmLabel?: string;
  /**
   * Run the dialog as a JOB PICKER: the Candidates Selected panel is dropped
   * and the confirm needs only a job.
   *
   * For flows that choose the JOB FIRST and the candidates after it — Resume
   * Scoring picks the job, then opens its own resume selection. Everything
   * else is untouched: the same shell, header, search, job cards, version
   * history, pagination and footer, so the picker reads as the dialog it is.
   * `onApply` is then called with an empty resume list.
   */
  jobOnly?: boolean;
  /** Replaces the Next Steps list when a flow ends somewhere different. */
  nextSteps?: string[];
  /**
   * The job is already decided (e.g. a resume opened from an AI Talent Match
   * result is scored against that match's JD): the job search and list are
   * dropped, the job is pre-selected, the subtitle names it as
   * "JD ID, JD title, JD version", and a single candidate's resume versions
   * are listed inline with the latest pre-selected.
   */
  fixedJob?: Job;
}

export default function ApplyToJobModal({
  resumes,
  jobs,
  onClose,
  onApply,
  mode = 'apply',
  title,
  description,
  stayOnCurrentPage = false,
  confirmLabel,
  nextSteps,
  jobOnly = false,
  fixedJob,
}: ApplyToJobModalProps) {
  // Default titles based on mode
  const defaultTitle =
    mode === 'assessment' ? 'Create Assessment'
    : mode === 'scoring' ? 'Resume Scoring'
    : mode === 'match' ? 'AI Talent Match'
    : 'Apply to Job';
  const defaultDescription =
    mode === 'assessment' ? 'Select a job description for the assessment'
    : mode === 'scoring' ? 'Select job description to score resumes'
    : mode === 'match' ? 'Select a job description to find the best-matched candidates'
    : 'Select a job to apply candidates';

  const modalTitle = title || defaultTitle;
  const modalDescription = description || defaultDescription;
  const isScoringMode = mode === 'scoring';
  const isMatchMode = mode === 'match';

  /* The one JD version the candidates go to.
     Held as the record itself rather than an id, because the pick can now be an
     older version chosen from a job's Version History, and those versions are
     not in the list below — the history fetches them from its own endpoint.
     `lineage` records which job's card the pick belongs to, so that card reads
     as selected whichever of its versions was picked. Owned here (not by the
     job list) because the footer and info box below also need it. */
  const [selection, setSelection] = useState<JobSelection>(
    fixedJob ? { job: fixedJob, lineage: fixedJob.job_id || fixedJob.id } : null,
  );
  const [isApplying, setIsApplying] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  /* Candidate list state. Everything handed in starts ticked — the user
     already chose these on the previous screen — and unticking here is how you
     drop one without going back. */
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const isIncluded = (id: string) => !excludedIds.includes(id);
  const includedResumes = resumes.filter(r => isIncluded(r.id));

  const toggleCandidate = (id: string) => {
    setExcludedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  /* Version chosen per candidate, keyed by the candidate's own resume id.
     Nothing here means "the latest", which is the default the tip promises.
     A version is itself a resume record, so applying a chosen version means
     sending ITS id — the substitution the resume table makes too. */
  const [versionChoice, setVersionChoice] = useState<Record<string, { id: string; number: number; total: number }>>({});

  const submittedIdFor = (resume: Resume) => versionChoice[resume.id]?.id || resume.id;

  /* A job picker has no candidates to require — the flow that opened it picks
     them next. Everywhere else both halves are still needed. */
  const canSubmit = !!selection && (jobOnly || includedResumes.length > 0);

  const handleApply = async () => {
    if (canSubmit) {
      setIsApplying(true);
      // Only the candidates still ticked, each on its chosen version (the
      // latest unless one was picked from the version list).
      const resumeIds = includedResumes.map(submittedIdFor);

      /* The picked version's own id is what the candidates are applied to —
         a version IS a JD record with its own id, so an older version chosen
         from the history is submitted as itself, not as its lineage's latest. */
      const picked = selection!.job;

      /* A job picker hands the choice back and closes: there is nothing to
         submit yet, so the confirm must not sit in a pending state pretending
         there is. */
      if (jobOnly) {
        setIsApplying(false);
        onApply([], [picked.id], [picked]);
        return;
      }

      // Simulate API call
      setTimeout(() => {
        onApply(resumeIds, [picked.id], [picked], includedResumes.map(r => r.id));
        setIsApplying(false);
      }, 800);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      {/* Wider than a plain picker: the rows carry the Job Openings list's own
          fields, and the version history table underneath them needs the room. */}
      <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-2xl md:max-w-4xl lg:max-w-6xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <Briefcase className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">{modalTitle}</h2>
              {fixedJob && !description ? (
                /* The fixed job, as every other page shows a job: the JD ID
                   badge, the title, then the version pill. */
                <div className="flex items-center gap-2 mt-1 min-w-0">
                  {fixedJob.job_id && (
                    <JobIdBadge className="inline-flex h-6 items-center flex-shrink-0">{fixedJob.job_id}</JobIdBadge>
                  )}
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300 truncate">{fixedJob.title}</span>
                  <span className="px-2 py-0.5 rounded-md font-semibold text-xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35 flex-shrink-0">
                    v{fixedJob.versionNumber ?? 1}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{modalDescription}</p>
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="px-2 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Candidates Selected — shared with every other flow that acts
              on a set of candidates, so they all read the same. */}
          {fixedJob && resumes.length === 1 ? (
            /* Job already decided, one candidate — every resume version up
               front, latest pre-selected. Several candidates use the shared
               Candidates Selected panel below. */
            resumes.map(resume => (
              <CandidateVersionPicker
                key={resume.id}
                resume={resume}
                choice={versionChoice[resume.id]}
                onChoose={(choice) => setVersionChoice(prev => ({ ...prev, [resume.id]: choice }))}
              />
            ))
          ) : (
            <SelectedCandidatesPanel
              resumes={resumes}
              excludedIds={excludedIds}
              onToggleCandidate={toggleCandidate}
              versionChoice={versionChoice}
              onVersionChosen={(resumeId, choice) =>
                setVersionChoice(prev => ({ ...prev, [resumeId]: choice }))
              }
            />
          )}

          {/* The job list — search, cards, Version History, pagination — is
              the same component the Resume Scoring page renders statically
              for its own job-selection step, so the two never drift apart.
              Not shown when the job is fixed. */}
          {!fixedJob && (
            <JobOpeningPickerList
              jobs={jobs}
              selection={selection}
              onSelectionChange={setSelection}
              radioGroupName={JOB_RADIO_GROUP}
              scrollContainerRef={listRef}
            />
          )}

          {/* Info Box — not shown when the job is fixed: nothing is left to
              explain once the only choice is the candidates' versions. */}
          {selection && !fixedJob && (
            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gradient-to-r from-gray-50 to-gray-50 dark:from-slate-800/50 dark:to-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="flex items-start gap-2 sm:gap-3">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-1">Next Steps</h4>
                  <ul className="text-xs text-gray-700 dark:text-slate-300 space-y-1">
                    {nextSteps ? (
                      <>
                        {nextSteps.map(step => <li key={step}>&bull; {step}</li>)}
                      </>
                    ) : isMatchMode ? (
                      <>
                        <li>&bull; {includedResumes.length} candidate{includedResumes.length === 1 ? '' : 's'} will be matched against the selected job</li>
                        <li>&bull; {stayOnCurrentPage ? 'AI Talent Match will run on this page' : "You'll be taken to the AI Talent Match page"}</li>
                        <li>&bull; AI will rank the candidates for that role</li>
                      </>
                    ) : isScoringMode ? (
                      <>
                        <li>&bull; {includedResumes.length} resume{includedResumes.length === 1 ? '' : 's'} will be scored against the selected job</li>
                        <li>&bull; {stayOnCurrentPage ? 'Scoring progress will run on this resume page' : "You'll see the Resume Scoring page"}</li>
                        <li>&bull; AI will analyze the fit for that role</li>
                      </>
                    ) : (
                      <>
                        <li>• {includedResumes.length} candidate{includedResumes.length === 1 ? '' : 's'} will be added to the selected job</li>
                        <li>• You&apos;ll be navigated to the job&apos;s applicant list</li>
                        <li>• You can review and manage applications there</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0">
          <div className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
            {jobOnly
              ? !selection
                ? 'Select one job to continue'
                : (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                    Selected: {selection.job.job_id ? `${selection.job.job_id} · ` : ''}
                    {selection.job.title} (v{selection.job.versionNumber ?? 1})
                  </span>
                )
              : includedResumes.length === 0
              ? 'Select at least one candidate to continue'
              : !selection
                ? 'Select one job to continue'
                : (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                    {isScoringMode
                      ? `Ready to score ${includedResumes.length} resume${includedResumes.length === 1 ? '' : 's'} against 1 job`
                      : isMatchMode
                        ? `Ready to match ${includedResumes.length} candidate${includedResumes.length === 1 ? '' : 's'} against 1 job`
                        : `Ready to apply ${includedResumes.length} candidate${includedResumes.length === 1 ? '' : 's'} to 1 job`}
                  </span>
                )}
          </div>
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="primary"
              onClick={handleApply}
              disabled={!canSubmit || isApplying}
              className="flex-1 sm:flex-none"
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                  {isScoringMode ? 'Scoring...' : isMatchMode ? 'Matching...' : 'Applying...'}
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {confirmLabel
                    ? confirmLabel
                    : isScoringMode ? 'Score Resume'
                    : isMatchMode ? 'Continue to AI Talent Match'
                    : 'Apply to Job'}
                </>
              )}
            </Button>
          </div>
        </div>

      </div>

    </div>
  );
}
