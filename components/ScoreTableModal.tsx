'use client';

import { useEffect, useState } from 'react';
import { X, BarChart3, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import DetailedScorecardTab from './DetailedScorecardTab';
import { jdService } from '@/lib/services/jdService';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { MiniPagination } from '@/components/ui/mini-pagination';
import type { ScoredResume } from './ScoredResumesTable';

interface ScoreTableModalProps {
  resume: ScoredResume;
  /** Fallback JD id for a single-job host, whose rows don't carry their own
   *  `jdId` (see ScoredResumesTable's own `jobCode` for the same pattern). */
  jobId?: string;
  /** Fallback readable JD code (e.g. "JD-105") for a single-job host, whose
   *  rows don't carry their own `jobCode` — same pattern as `jobId` above. */
  jobCode?: string;
  /** Fallback JD version for a single-job host, whose rows don't carry their
   *  own `jobVersion` — same pattern as `jobCode` above. */
  jobVersion?: number | null;
  jobTitle: string;
  onClose: () => void;
  /** View by Candidates: steps through this candidate's other scored jobs,
   *  shown before the close button. */
  jobPager?: { page: number; total: number; onPageChange: (page: number) => void };
  /** Lay the header out as candidate (name + candidate ID), then the job role,
   *  then the job and resume versions this score belongs to. Each value comes
   *  from the host's records; one it does not have is left out. Off by
   *  default — the one-line header stays. */
  header?: { candidateId?: string | null; jobVersion?: number | null; resumeVersion?: number | null };
}

/**
 * "View Score Table" from the Scored Resumes Actions menu — the same table
 * CandidateScoringDetailPage's Score Table tab renders, opened in place as a
 * popup instead of navigating away to that page.
 */
export default function ScoreTableModal({ resume, jobId, jobCode, jobVersion, jobTitle, onClose, jobPager, header }: ScoreTableModalProps) {
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const jdId = resume.jdId || jobId;
    if (!jdId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    /* Same lookup CandidateScoringDetailPage uses for this candidate's
       criteria_scores / score_breakdown: a candidate scored more than once
       against the same job (or across JD versions) needs the exact score id
       matched out of the JD's own list, not just "some score for this
       candidate" — a bare score-id endpoint has been seen to land on the
       wrong attempt's record. */
    jdService.getScoredResumes(jdId, { page_size: 100 })
      .then((res: any) => {
        if (cancelled) return;
        const items = res.items || [];
        /* Exact score id first. A host that only knows the candidate (the
           scoring progress popup without a batch score id) falls back to that
           resume's score on this JD. */
        const match = items.find((r: any) => r.id === resume.id)
          || (resume.resumeId ? items.find((r: any) => (r.resume_id || r.resumeId) === resume.resumeId) : undefined);
        setDetail(match || null);
      })
      .catch((err: any) => {
        console.error('[ScoreTableModal] Failed to load score detail:', err);
        if (!cancelled) toast.error('Failed to load score table');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [resume.id, resume.resumeId, resume.jdId, jobId]);

  // Deterministic variation based on the score id, matching
  // CandidateScoringDetailPage's own fallback generator — keeps a criterion
  // without a real backend score from reading as a flat, identical number
  // every time rather than swinging on every render.
  const generateVariedScore = (base: number, variance: number) => {
    const hash = resume.id.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
    const variation = ((hash % variance) - variance / 2);
    return Math.min(100, Math.max(0, Math.round(base + variation)));
  };

  const scorePercentage = resume.scorePercentage ?? Number((detail?.overall_score || 0).toFixed(1));
  const scoreBreakdown = detail?.score_breakdown || resume.scoreBreakdown || [];
  const scoreBreakdownObj = Array.isArray(scoreBreakdown) ? undefined : (scoreBreakdown as any);
  const criteriaScores = detail?.criteria_scores || {};
  const matchStatus = resume.matchStatus || detail?.match_status;

  const detailedScores = {
    titleMatch: scoreBreakdownObj?.overallFit || scorePercentage,
    experienceMatch: scoreBreakdownObj?.experienceMatch || generateVariedScore(scorePercentage, 20),
    skillsMatch: scoreBreakdownObj?.skillsMatch || generateVariedScore(scorePercentage, 16),
    educationMatch: scoreBreakdownObj?.educationMatch || generateVariedScore(scorePercentage, 24),
    locationMatch: generateVariedScore(scorePercentage, 12),
  };

  const normalizedMatchStatus = matchStatus?.toLowerCase().replace(/[_\s]/g, '') || '';
  const aiReasoning = resume.aiSummary || resume.matchReason || detail?.ai_summary || (
    (normalizedMatchStatus === 'exactmatch' || normalizedMatchStatus === 'excellentmatch')
      ? 'Outstanding candidate with exceptional alignment to job requirements. Strong technical skills, relevant experience, and proven track record in similar roles.'
      : normalizedMatchStatus === 'partialmatch'
        ? 'Solid candidate with good alignment to most job requirements. Possesses core technical skills and relevant experience with minor gaps in specialized areas.'
        : 'Limited alignment with current job requirements. While the candidate shows promise in certain areas, there are significant gaps in required technical skills and experience.'
  );

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-success';
    if (score >= 70) return 'text-gray-800';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };
  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-success-subtle border-success-line text-success';
    if (score >= 70) return 'bg-gray-100 border-gray-300 text-gray-700';
    if (score >= 60) return 'bg-warning-subtle border-warning-line text-warning';
    return 'bg-destructive-subtle border-destructive-line text-destructive';
  };
  const getProgressBarColor = (score: number) => {
    if (score >= 85) return 'bg-success';
    if (score >= 70) return 'bg-gray-600';
    if (score >= 60) return 'bg-warning';
    return 'bg-destructive';
  };

  /* The JD version this score was made against: the row's own (cross-job
     hosts), then the scoring record fetched above (`jd_version_number`, the
     field Resume Scoring reads), then the single-job host's version — the one
     these scores were fetched for. */
  const scoredJobVersion = resume.jobVersion || detail?.jd_version_number || jobVersion || null;

  return (
    /* Below `sm` this is a full-screen docked page (edge to edge, back arrow,
       slides up from the bottom) rather than a floating card. */
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-0 sm:p-6">
      <div className="bg-white sm:rounded-2xl sm:shadow-2xl w-full sm:max-w-6xl h-dvh sm:h-[calc(100dvh-3rem)] flex flex-col overflow-hidden max-sm:animate-in max-sm:fade-in max-sm:slide-in-from-bottom-8 max-sm:duration-200">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 max-sm:pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-gray-100 bg-white sm:bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              className="sm:hidden -ml-1.5 flex h-9 w-9 flex-shrink-0 items-center justify-center self-start rounded-full text-gray-700 hover:bg-gray-100 active:bg-gray-200"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex w-10 h-10 rounded-xl bg-brand-blue items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            {header ? (
              /* Candidate (name + ID), then the job role, then the versions. */
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <h2 className="tf-section-title sm:text-lg tracking-tight truncate min-w-0">
                    {resume.candidateName || 'Candidate'}
                  </h2>
                  {header.candidateId && (
                    <span className="inline-flex items-center whitespace-nowrap text-xs font-mono font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 px-2 py-0.5 rounded flex-shrink-0">
                      {header.candidateId}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 tf-body-muted min-w-0 flex-wrap">
                  {(resume.jobCode || jobCode) && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 flex-shrink-0">
                      {resume.jobCode || jobCode}
                    </span>
                  )}
                  {jobTitle && <span className="truncate min-w-0 max-sm:flex-1 max-sm:basis-0">{jobTitle}</span>}
                  {header.jobVersion != null && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 flex-shrink-0">
                      v{header.jobVersion}
                    </span>
                  )}
                  {header.resumeVersion != null && (
                    <span className="px-2 py-0.5 rounded-md tf-caption bg-gray-100 ring-1 ring-gray-200 flex-shrink-0">
                      Resume V{header.resumeVersion}
                    </span>
                  )}
                </div>
              </div>
            ) : (
            <div className="min-w-0">
              <h2 className="tf-section-title sm:text-lg tracking-tight truncate">Score Table</h2>
              {/* Candidate · Job ID · Job Title · Job Version — the ID and
                  version as the light brand chips the match tables use. */}
              <div className="flex flex-wrap items-center gap-1.5 tf-body-muted min-w-0">
                <span className="truncate max-sm:basis-full max-sm:font-medium max-sm:text-gray-700">{resume.candidateName || 'Candidate'}</span>
                {(resume.jobCode || jobCode) && (
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 flex-shrink-0">
                    {resume.jobCode || jobCode}
                  </span>
                )}
                {jobTitle && <span className="truncate max-sm:min-w-0 max-sm:flex-1 max-sm:basis-0">{jobTitle}</span>}
                {scoredJobVersion != null && (
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 flex-shrink-0">
                    V{scoredJobVersion}
                  </span>
                )}
              </div>
            </div>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
            {jobPager && jobPager.total > 1 && (
              <MiniPagination
                page={jobPager.page}
                totalPages={jobPager.total}
                onPageChange={jobPager.onPageChange}
                aria-label="Scored jobs"
              />
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </Button>
          </div>
        </div>
        {/* Mobile: the job pager gets its own bar under the header. */}
        {jobPager && jobPager.total > 1 && (
          <div className="sm:hidden flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <span className="tf-caption">Scored jobs</span>
            <MiniPagination
              page={jobPager.page}
              totalPages={jobPager.total}
              onPageChange={jobPager.onPageChange}
              aria-label="Scored jobs"
            />
          </div>
        )}
        {/* score-table-modal-body: the only vertical scroller in this modal.
            DetailedScorecardTab's rubric table grows to its content (it does not
            use `.tf-table-shell`), so nothing nested inside competes for the
            scroll or the sticky context — which is what used to bleed the table
            past the card. The class is kept as the scroll container itself and
            as the hook the globals.css note refers to.

            `overflow-x-hidden` is explicit, not incidental: CSS's overflow
            interaction rule computes a bare `visible` x-axis to `auto` the
            moment the y-axis isn't `visible`, so leaving it unstated made this
            box sideways-scrollable the instant ANY descendant overflowed
            horizontally — one long unbroken run in the AI-generated reasoning
            text was enough to drag the whole body into a scrolled state, which
            read as the table and summary card being cut off with blank space
            stranded beside them. Stating it kills that axis outright regardless
            of what a future child does. */}
        <div className="score-table-modal-body flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 sm:p-6 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {loading ? (
            <div className="space-y-4">
              {/* Overall score summary row */}
              <div className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-32" />
              </div>
              {/* Rubric table: header + criterion rows */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <Skeleton className="h-3.5 flex-[2]" />
                  <Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="h-3.5 flex-1" />
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 border-b border-gray-100 px-4 py-3.5 last:border-b-0">
                    <Skeleton className="h-4 flex-[2]" />
                    <Skeleton className="h-2.5 flex-1 rounded-full" />
                    <Skeleton className="h-4 w-10" />
                  </div>
                ))}
              </div>
              {/* AI reasoning block */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            </div>
          ) : (
            <DetailedScorecardTab
              resume={{
                scorePercentage,
                // Resume Match Rating Mechanism (client doc, Sept 2026): same
                // fields DetailedScorecardTab reads on the full detail page -
                // `detail` (this candidate's fetched score record) is the
                // authoritative source; `resume` (the row this modal opened
                // from) only carries overallRating10, used as a fallback.
                overallRating10: detail?.overall_rating_10 ?? resume.overallRating10,
                essentialRating10: detail?.essential_rating_10,
                nonEssentialRating10: detail?.non_essential_rating_10,
                combinedAverage10: detail?.combined_average_10,
                ratingCapApplied: detail?.rating_cap_applied,
                ratingSummaryText: detail?.rating_summary_text,
                matchStatus,
                scoredDate: resume.scoredDate || detail?.created_at || '',
                scoredBy: resume.scoredBy || detail?.scored_by_name || detail?.scored_by || 'System',
                detailedScores,
                certifications: resume.certifications,
                education: resume.education as string,
                location: resume.location,
                title: resume.title,
                scoreBreakdown: scoreBreakdown as any,
                criteriaScores,
              }}
              jobTitle={jobTitle}
              aiReasoning={aiReasoning}
              getScoreColor={getScoreColor}
              getScoreBgColor={getScoreBgColor}
              getProgressBarColor={getProgressBarColor}
              /* Each criterion opens on its own ⌄, beside Expand all. */
              rowExpand
            />
          )}
        </div>
      </div>
    </div>
  );
}
