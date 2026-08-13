import { X, Search, Clock, CheckCircle, Users, Briefcase, Building2, Calendar, MapPin, User, Monitor, Laptop, Home, Sparkles, PenLine, Loader2, Ban } from 'lucide-react';
import { useState } from 'react';
import { Resume, Job } from '@/lib/types/types';
import { formatISTDate } from '@/lib/utils/dateUtils';
import SelectedCandidatesPanel, { versionInfo, type VersionChoice } from './SelectedCandidatesPanel';

// Work mode configuration
const workModeConfig: Record<string, { label: string; icon: React.ElementType; bgColor: string; textColor: string }> = {
  onsite: { label: 'On-site', icon: Monitor, bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  hybrid: { label: 'Hybrid', icon: Laptop, bgColor: 'bg-purple-50', textColor: 'text-purple-700' },
  remote: { label: 'Remote', icon: Home, bgColor: 'bg-green-50', textColor: 'text-green-700' },
};

// Format employment type
const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Format relative time
const formatRelativeTime = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatISTDate(dateStr);
};

/**
 * Only a published job can receive candidates. Everything else is still listed
 * — a recruiter looking for a job they know exists shouldn't be told it isn't
 * there — but greyed out, with the reason attached.
 */
const eligibilityFor = (job: Job): { eligible: boolean; reason?: string } => {
  const status = String(job.status || '').toLowerCase();
  if (status === 'published') return { eligible: true };
  if (status === 'draft') return { eligible: false, reason: 'Draft job — publish it before applying candidates' };
  if (status === 'archived') return { eligible: false, reason: 'Archived job — restore it to apply candidates' };
  if (status === 'disabled') return { eligible: false, reason: 'This job is disabled and cannot take new applicants' };
  if (status === 'closed' || status === 'filled') return { eligible: false, reason: 'This job is closed to new applicants' };
  return { eligible: false, reason: `Only published jobs can receive candidates (currently ${job.status || 'unknown'})` };
};

interface ApplyToJobModalProps {
  resumes: Resume[];
  jobs: Job[];
  onClose: () => void;
  onApply: (resumeIds: string[], jobIds: string[]) => void;
  mode?: 'apply' | 'assessment' | 'scoring' | 'match';
  title?: string; // New: Custom title
  description?: string; // New: Custom description
  stayOnCurrentPage?: boolean;
  /** Overrides the confirm button's label — "Run AI Talent Match" and friends. */
  confirmLabel?: string;
  /** Replaces the Next Steps list when a flow ends somewhere different. */
  nextSteps?: string[];
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
    : mode === 'match' ? 'Select the job description to match these candidates against'
    : 'Select job openings to apply candidates';

  const modalTitle = title || defaultTitle;
  const modalDescription = description || defaultDescription;
  const isScoringMode = mode === 'scoring';
  const isMatchMode = mode === 'match';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);

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
  /** Single-resume candidate being read, without leaving this dialog. */
  const [previewResume, setPreviewResume] = useState<{ id: string; title: string; subtitle?: string } | null>(null);

  /* Every job is listed; the search narrows it. Matching only `job.title`
     meant a JD number typed in full returned nothing — the number lives on
     `job_id`, and departments and locations are searched for just as often.

     Two passes per field. The plain one is a straight substring, so "77" finds
     JD-77 and "develop" finds Developer. The second strips everything that
     isn't a letter or a digit from BOTH sides first, so the separator a
     recruiter types doesn't have to match the one the record was stored with:
     "jd-77", "JD 77", "jd_77" and "jd77" all find the same job. */
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const jobSearch = searchQuery.trim().toLowerCase();
  const jobSearchCompact = normalize(searchQuery);

  const matchesSearch = (job: Job) => {
    if (!jobSearch) return true;
    const j = job as any;
    return [
      job.title,
      j.job_id,
      j.jobId,
      j.jd_number,
      j.jd_id,
      j.reference_id,
      j.industry_type,
      j.department,
      job.location,
      j.employment_type,
      j.employmentType,
    ]
      .filter(Boolean)
      .some(field => {
        const raw = String(field).toLowerCase();
        if (raw.includes(jobSearch)) return true;
        // Guard against a punctuation-only query matching everything.
        return !!jobSearchCompact && normalize(String(field)).includes(jobSearchCompact);
      });
  };

  const filteredJobs = jobs.filter(matchesSearch);

  /* Eligible jobs lead. Without this the selectable ones can sit below a run of
     greyed-out drafts, which reads as "nothing here can be picked". */
  const sortedJobs = [...filteredJobs].sort((a, b) => {
    const aOk = eligibilityFor(a).eligible ? 0 : 1;
    const bOk = eligibilityFor(b).eligible ? 0 : 1;
    return aOk - bOk;
  });
  const eligibleCount = filteredJobs.filter(j => eligibilityFor(j).eligible).length;

  /* One role at a time. Candidates are applied to a single job, so picking a
     second would be ambiguous rather than useful — the other rows go inert
     until the current pick is cleared or swapped by clicking it again. */
  const selectedJobId = selectedJobs[0] || null;

  const toggleJob = (jobId: string) => {
    setSelectedJobs(prev => (prev[0] === jobId ? [] : [jobId]));
  };

  const canSubmit = !!selectedJobId && includedResumes.length > 0;

  const handleApply = async () => {
    if (canSubmit) {
      setIsApplying(true);
      // Only the candidates still ticked, each on its chosen version (the
      // latest unless one was picked from the version list).
      const resumeIds = includedResumes.map(submittedIdFor);

      // Simulate API call
      setTimeout(() => {
        onApply(resumeIds, selectedJobs);
        setIsApplying(false);
      }, 800);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <Briefcase className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">{modalTitle}</h2>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{modalDescription}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Candidates Selected — shared with every other flow that acts
              on a set of candidates, so they all read the same. */}
          <SelectedCandidatesPanel
            resumes={resumes}
            excludedIds={excludedIds}
            onToggleCandidate={toggleCandidate}
            versionChoice={versionChoice}
            onVersionChosen={(resumeId, choice) =>
              setVersionChoice(prev => ({ ...prev, [resumeId]: choice }))
            }
            tip={isScoringMode
              ? 'For multi-version resumes, the latest version will be selected by default for scoring.'
              : undefined}
          />

          {/* Job Search */}
          <div className="mb-4">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Search Jobs</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search by JD number, role, department or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
              />
            </div>
          </div>

          {/* Job Selection */}
          <div className="mb-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">
                Select a Job Opening
                {filteredJobs.length > 0 && (
                  <span className="ml-2 font-normal text-gray-500 dark:text-slate-400">
                    {eligibleCount} of {filteredJobs.length} available
                  </span>
                )}
              </label>
              {selectedJobId && (
                <button
                  onClick={() => setSelectedJobs([])}
                  className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {sortedJobs.length > 0 ? (
              <div className="space-y-2 sm:space-y-3 max-h-96 overflow-y-auto pr-1">
                {sortedJobs.map(job => {
                  const isSelected = selectedJobId === job.id;
                  const { eligible, reason: eligibilityReason } = eligibilityFor(job);
                  /* One role at a time: once a job is picked the others go
                     inert, so "apply these candidates to that job" can't turn
                     into two answers. Clicking the picked one lets go of it. */
                  const blockedByOtherPick = eligible && !!selectedJobId && !isSelected;
                  const selectable = eligible && !blockedByOtherPick;
                  const reason = blockedByOtherPick
                    ? 'Only one job can be applied at a time — clear the current selection to choose this one'
                    : eligibilityReason;
                  const workMode = workModeConfig[(job as any).workMode?.toLowerCase() || (job as any).remote_type?.toLowerCase()] || null;
                  const WorkModeIcon = workMode?.icon;

                  // Get status badge
                  const getStatusBadge = (status: string) => {
                    const configs: Record<string, { bg: string; text: string; dot: string }> = {
                      draft: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
                      published: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
                      Published: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
                      archived: { bg: 'bg-gray-50 dark:bg-slate-800/50', text: 'text-gray-600 dark:text-slate-400', dot: 'bg-gray-400' },
                      disabled: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
                    };
                    const config = configs[status] || configs.draft;
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></span>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    );
                  };

                  // Get creation method badge
                  const getCreationMethodBadge = (creationMethod: string) => {
                    const isAI = creationMethod === 'ai_generated' || creationMethod === 'ai';
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        isAI ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {isAI ? <Sparkles className="w-3 h-3" /> : <PenLine className="w-3 h-3" />}
                        {isAI ? 'AI' : 'Manual'}
                      </span>
                    );
                  };

                  return (
                    <label
                      key={job.id}
                      /* Rows the user can't pick — wrong status, or another
                         job already chosen — stay visible but inert, with the
                         reason on the row and in the title attribute. */
                      title={selectable || isSelected ? undefined : reason}
                      aria-disabled={!selectable && !isSelected}
                      className={`block rounded-lg border-2 p-3 sm:p-4 transition-all ${
                        !selectable && !isSelected
                          ? 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700 opacity-60 cursor-not-allowed'
                          : isSelected
                            ? 'bg-brand-blue/5 border-brand-blue/40 shadow-sm shadow-brand-blue/10 cursor-pointer'
                            : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start gap-2 sm:gap-4">
                        {/* A radio, because exactly one job is applied to. */}
                        <input
                          type="radio"
                          name="apply-to-job-selection"
                          checked={isSelected}
                          disabled={!selectable && !isSelected}
                          onChange={() => (selectable || isSelected) && toggleJob(job.id)}
                          onClick={() => isSelected && toggleJob(job.id)}
                          className="w-4 h-4 mt-1 text-brand-blue border-gray-300 dark:border-slate-700 focus:ring-brand-blue/40 flex-shrink-0 disabled:cursor-not-allowed"
                        />
                        <div className="flex-1 min-w-0">
                          {/* Row 1: Job ID, Title, Status, Creation Method */}
                          <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                            {/* Job ID Badge */}
                            {(job as any).job_id && (
                              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-blue-100 text-blue-700 rounded-md text-xs sm:text-sm font-medium border border-blue-200">
                                {(job as any).job_id}
                              </span>
                            )}
                            {/* Title */}
                            <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">{job.title}</h3>
                            {/* Status Badge */}
                            {getStatusBadge(job.status)}
                            {/* Creation Method Badge */}
                            {(job as any).creation_method && getCreationMethodBadge((job as any).creation_method)}
                            {/* Selected indicator */}
                            {isSelected && eligible && (
                              <CheckCircle className="w-5 h-5 text-brand-blue ml-auto flex-shrink-0" />
                            )}
                          </div>

                          {/* Why this one can't be picked */}
                          {!selectable && !isSelected && reason && (
                            <p className="flex items-center gap-1.5 mb-2 text-xs text-gray-600 dark:text-slate-400">
                              <Ban className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                              {reason}
                            </p>
                          )}

                          {/* Row 2: Industry, Location, Employment Type, Work Mode */}
                          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-2 flex-wrap">
                            {/* Industry/Department */}
                            {((job as any).industry_type || (job as any).department) && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-4 h-4" />
                                {(job as any).industry_type || (job as any).department}
                              </span>
                            )}
                            {/* Location */}
                            {job.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {job.location}
                              </span>
                            )}
                            {/* Employment Type */}
                            {((job as any).employmentType || (job as any).employment_type) && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="w-4 h-4" />
                                {formatEmploymentType((job as any).employmentType || (job as any).employment_type)}
                              </span>
                            )}
                            {/* Work Mode */}
                            {workMode && WorkModeIcon && (
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded ${workMode.bgColor} ${workMode.textColor}`}>
                                <WorkModeIcon className="w-3 h-3" />
                                {workMode.label}
                              </span>
                            )}
                          </div>

                          {/* Row 3: Posted Date, Posted By, Last Updated */}
                          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-2 sm:mb-3 flex-wrap">
                            {/* Posted Date */}
                            {((job as any).postedDate || (job as any).published_at) && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                Posted {formatISTDate((job as any).postedDate || (job as any).published_at)}
                              </span>
                            )}
                            {/* Posted By / Created By */}
                            {((job as any).postedBy || (job as any).created_by_name) && (
                              <span className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                By {(job as any).postedBy || (job as any).created_by_name}
                              </span>
                            )}
                            {/* Last Updated */}
                            {(job as any).updated_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                Last Updated: {formatRelativeTime((job as any).updated_at)}
                              </span>
                            )}
                          </div>

                          {/* Row 4: Applicants */}
                          <div className="flex items-center gap-2 text-xs sm:text-sm">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500" />
                            <span className="text-gray-700 dark:text-slate-300">{job.applicants || (job as any).applicants_count || 0} applicants</span>
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-slate-500">
                <Briefcase className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-400 dark:text-slate-500" />
                <p className="text-xs sm:text-sm">
                  {searchQuery ? 'No jobs found matching your search' : 'No jobs available'}
                </p>
              </div>
            )}
          </div>

          {/* Info Box */}
          {selectedJobId && (
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
            {includedResumes.length === 0
              ? 'Select at least one candidate to continue'
              : !selectedJobId
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
            <button
              onClick={onClose}
              disabled={isApplying}
              className="flex-1 sm:flex-none px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!canSubmit || isApplying}
              className="flex-1 sm:flex-none px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
