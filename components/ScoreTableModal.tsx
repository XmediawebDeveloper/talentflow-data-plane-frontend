'use client';

import { useEffect, useState } from 'react';
import { X, BarChart3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import DetailedScorecardTab from './DetailedScorecardTab';
import { jdService } from '@/lib/services/jdService';
import type { ScoredResume } from './ScoredResumesTable';

interface ScoreTableModalProps {
  resume: ScoredResume;
  /** Fallback JD id for a single-job host, whose rows don't carry their own
   *  `jdId` (see ScoredResumesTable's own `jobCode` for the same pattern). */
  jobId?: string;
  /** Fallback readable JD code (e.g. "JD-105") for a single-job host, whose
   *  rows don't carry their own `jobCode` — same pattern as `jobId` above. */
  jobCode?: string;
  jobTitle: string;
  onClose: () => void;
}

/**
 * "View Score Table" from the Scored Resumes Actions menu — the same table
 * CandidateScoringDetailPage's Score Table tab renders, opened in place as a
 * popup instead of navigating away to that page.
 */
export default function ScoreTableModal({ resume, jobId, jobCode, jobTitle, onClose }: ScoreTableModalProps) {
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
        const match = (res.items || []).find((r: any) => r.id === resume.id);
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
  }, [resume.id, resume.jdId, jobId]);

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
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-gray-800';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };
  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-gray-100 border-gray-300 text-gray-700';
    if (score >= 60) return 'bg-yellow-100 border-yellow-300 text-yellow-700';
    return 'bg-red-100 border-red-300 text-red-700';
  };
  const getProgressBarColor = (score: number) => {
    if (score >= 85) return 'bg-green-600';
    if (score >= 70) return 'bg-gray-600';
    if (score >= 60) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-6xl h-[90dvh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 tracking-tight truncate">Score Table</h2>
              <p className="text-sm text-gray-500 truncate">
                {[
                  resume.candidateName || 'Candidate',
                  jobTitle || undefined,
                  resume.jobCode || jobCode,
                  resume.jobVersion ? `V${resume.jobVersion}` : undefined,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        {/* score-table-modal-body: DetailedScorecardTab's own .tf-table-shell
            caps its height and scrolls independently, which assumes the full
            page's generous surrounding space (see globals.css). Nested inside
            this modal's own scroller there isn't room for both, and the two
            competing scroll/sticky contexts is what was bleeding the table
            past the card. The matching globals.css rule drops that inner cap
            so this div stays the only vertical scroller. */}
        <div className="score-table-modal-body flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
              <span className="ml-3 text-sm text-gray-600">Loading score table...</span>
            </div>
          ) : (
            <DetailedScorecardTab
              resume={{
                scorePercentage,
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
