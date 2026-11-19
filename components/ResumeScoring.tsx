import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { ArrowLeft, Star, TrendingUp, Award, Briefcase, CheckCircle, AlertCircle, ChevronDown, ChevronUp, FileText, Eye } from 'lucide-react';
import { Resume, Job } from '@/lib/types/types';
import { useState } from 'react';
import { toast } from '@/components/ui/enhanced-toast';
import { Button } from '@/components/ui/button';
import ListPagination from '@/components/ListPagination';
import NameAvatar from '@/components/ui/name-avatar';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';

interface ResumeScoringProps {
  resumes: Resume[] | any[];
  jobs?: Job[];
  jobTitle?: string;
  onBack: () => void;
  onComplete?: () => void;
  onProceedToApplicants?: () => void;
}

interface ScoringResult {
  resumeId: string;
  jobId: string;
  score: number;
  matchType: 'excellent' | 'good' | 'fair' | 'poor';
  keyMatches: string[];
  missingSkills: string[];
}

interface DetailedScoreCategory {
  category: string;
  rating: number;
  maxRating: number;
  matchStatus: 'Excellent' | 'Good' | 'Partial' | 'Poor';
  requirement: 'Required' | 'Preferred';
  score: number;
  reasoning: string;
}

export default function ResumeScoring({ resumes, jobs, jobTitle, onBack, onComplete, onProceedToApplicants }: ResumeScoringProps) {
  // Create a virtual job if only jobTitle is provided (single job context)
  const effectiveJobs: Job[] = jobs && jobs.length > 0
    ? jobs
    : jobTitle
      ? [{ id: 'single-job', title: jobTitle, location: '', status: 'Published', applicants: 0, daysActive: 0 } as Job]
      : [];

  const [scoringResults, setScoringResults] = useState<ScoringResult[]>(() => {
    // Generate mock scoring results
    const results: ScoringResult[] = [];
    if (!resumes || resumes.length === 0 || effectiveJobs.length === 0) {
      return [];
    }
    // `resumes` is declared `Resume[] | any[]`; iterating the union narrowed the
    // callback param to the Resume branch, which lacks the upload-flow fields read
    // below (score / scorePercentage / skills / gaps). Annotating to the any branch
    // the prop already allows - no runtime change.
    resumes.forEach((resume: any) => {
      effectiveJobs.forEach(job => {
        // Use existing score from resume if available (from upload flow)
        const existingScore = resume.score || resume.scorePercentage;
        const score = existingScore || Math.floor(Math.random() * 40) + 60; // 60-100
        let matchType: 'excellent' | 'good' | 'fair' | 'poor';
        if (score >= 90) matchType = 'excellent';
        else if (score >= 75) matchType = 'good';
        else if (score >= 60) matchType = 'fair';
        else matchType = 'poor';

        results.push({
          resumeId: resume.id,
          jobId: job.id,
          score,
          matchType,
          keyMatches: resume.skills || ['React', 'TypeScript', 'Node.js'].slice(0, Math.floor(Math.random() * 2) + 2),
          missingSkills: resume.gaps || ['AWS', 'Docker'].slice(0, Math.floor(Math.random() * 2)),
        });
      });
    });
    return results.sort((a, b) => b.score - a.score);
  });

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedResultForDetail, setSelectedResultForDetail] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const paginatedScoringResults = scoringResults.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Generate detailed score breakdown for a specific result
  const getDetailedScores = (resultKey: string): DetailedScoreCategory[] => {
    return [
      {
        category: 'Job Title Match',
        rating: 9,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 90,
        reasoning: 'The candidate\'s current role as "Senior Software Engineer" closely aligns with the job requirement. Strong technical leadership experience demonstrated through project ownership and mentoring responsibilities.',
      },
      {
        category: 'Total Experience',
        rating: 10,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 100,
        reasoning: 'Candidate has 8+ years of professional experience, exceeding the required 5+ years. Progressive career growth shown through increasing responsibilities and technical complexity.',
      },
      {
        category: 'Education',
        rating: 9,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 90,
        reasoning: 'Bachelor\'s degree in Computer Science from accredited university. Additional certifications in cloud architecture and agile methodologies demonstrate continued learning.',
      },
      {
        category: 'Must have Skills',
        rating: 9,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 90,
        reasoning: 'Strong proficiency in React, TypeScript, and Node.js with 5+ years experience. Demonstrated expertise through multiple production deployments and architectural decisions.',
      },
      {
        category: 'Nice to have Skills',
        rating: 7,
        maxRating: 10,
        matchStatus: 'Good',
        requirement: 'Preferred',
        score: 70,
        reasoning: 'Has experience with AWS and Docker but limited exposure to Kubernetes. Strong foundation in cloud technologies with room for growth in container orchestration.',
      },
      {
        category: 'Must have Competencies',
        rating: 9,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 90,
        reasoning: 'Excellent problem-solving skills, strong communication abilities, and proven track record of working in agile teams. Leadership qualities evident in mentoring and code review activities.',
      },
      {
        category: 'Location',
        rating: 10,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Required',
        score: 100,
        reasoning: 'Currently based in San Francisco with flexibility for hybrid work. No relocation required. Previous experience working in similar timezone and cultural context.',
      },
      {
        category: 'Leadership Experience',
        rating: 8,
        maxRating: 10,
        matchStatus: 'Excellent',
        requirement: 'Preferred',
        score: 80,
        reasoning: 'Led team of 4 developers on critical projects. Strong mentoring experience with junior developers. Some gap in formal people management but excellent technical leadership demonstrated.',
      },
      {
        category: 'Industry Experience',
        rating: 8,
        maxRating: 10,
        matchStatus: 'Partial',
        requirement: 'Preferred',
        score: 80,
        reasoning: 'Has worked in SaaS and fintech sectors, bringing relevant domain knowledge. Limited exposure to healthcare industry specifically but strong transferable skills and quick learning ability.',
      },
      {
        category: 'Job Hopping',
        rating: 8,
        maxRating: 10,
        matchStatus: 'Good',
        requirement: 'Preferred',
        score: 80,
        reasoning: 'Average tenure of 2.5 years per role, showing stability. Most recent role for 3+ years indicates maturity and commitment. Job changes driven by career growth rather than instability.',
      },
    ];
  };

  const getMatchColor = (type: string) => {
    switch (type) {
      case 'excellent': return 'bg-success-subtle text-success-strong border-success-line';
      case 'good': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'fair': return 'bg-warning-subtle text-warning-strong border-warning-line';
      case 'poor': return 'bg-destructive-subtle text-destructive-strong border-destructive-line';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getScoreIcon = (type: string) => {
    switch (type) {
      case 'excellent': return <Award className="w-5 h-5 text-success" />;
      case 'good': return <CheckCircle className="w-5 h-5 text-gray-800" />;
      case 'fair': return <TrendingUp className="w-5 h-5 text-warning" />;
      case 'poor': return <AlertCircle className="w-5 h-5 text-destructive" />;
      default: return <Star className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 md:px-8 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="tf-page-title mb-1">Resume Scoring Analysis</h1>
              <p className="tf-body-secondary">
                AI-powered match scoring for {resumes?.length || 0} resume{(resumes?.length || 0) !== 1 ? 's' : ''} {effectiveJobs.length > 1 ? `across ${effectiveJobs.length} job openings` : jobTitle ? `for ${jobTitle}` : ''}
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                if (onProceedToApplicants) {
                  onProceedToApplicants();
                } else if (onComplete) {
                  onComplete();
                }
              }}
              className="w-full sm:w-auto"
            >
              {onProceedToApplicants ? 'Proceed to Applicants' : 'Complete & Apply'}
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-4 md:px-8 py-5">
        <div className="tf-grid-stats mb-5">
          <div className="tf-panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="tf-body-secondary mb-1">Total Matches</div>
                <div className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 tracking-tight">{scoringResults.length}</div>
              </div>
              <div className="h-9 w-9 bg-gray-100 rounded-lg flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-gray-800" />
              </div>
            </div>
          </div>

          <div className="tf-panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="tf-body-secondary mb-1">Excellent Matches</div>
                <div className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 tracking-tight">
                  {scoringResults.filter(r => r.matchType === 'excellent').length}
                </div>
              </div>
              <div className="h-9 w-9 bg-success-subtle rounded-lg flex items-center justify-center">
                <Award className="w-4 h-4 text-success" />
              </div>
            </div>
          </div>

          <div className="tf-panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="tf-body-secondary mb-1">Good Matches</div>
                <div className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 tracking-tight">
                  {scoringResults.filter(r => r.matchType === 'good').length}
                </div>
              </div>
              <div className="h-9 w-9 bg-gray-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-gray-800" />
              </div>
            </div>
          </div>

          <div className="tf-panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="tf-body-secondary mb-1">Avg. Score</div>
                <div className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 tracking-tight">
                  {Math.round(scoringResults.reduce((acc, r) => acc + r.score, 0) / scoringResults.length)}%
                </div>
              </div>
              <div className="h-9 w-9 bg-gray-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-gray-800" />
              </div>
            </div>
          </div>
        </div>

        {/* Scoring Results Table */}
        <div className={`tf-panel overflow-hidden mb-5 ${DESKTOP_TABLE_ONLY}`}>
          <div className="overflow-x-auto tf-table-shell">
            <table className="w-full">
              <thead className="bg-white border-b border-gray-200">
                <tr>
                  <th className="tf-th-cell text-left tf-th">Candidate</th>
                  <th className="tf-th-cell text-left tf-th">Job Position</th>
                  <th className="tf-th-cell text-center tf-th">Match Score</th>
                  <th className="tf-th-cell text-left tf-th">Key Matches</th>
                  <th className="tf-th-cell text-left tf-th">Missing Skills</th>
                  <th className="tf-th-cell text-center tf-th">Status</th>
                  <th className="tf-th-cell text-center tf-th">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedScoringResults.map((result, index) => {
                  const resume = resumes?.find(r => r.id === result.resumeId);
                  const job = effectiveJobs.find(j => j.id === result.jobId);
                  const resultKey = `${result.resumeId}-${result.jobId}`;

                  if (!resume || !job) return null;

                  return (
                    <tr key={resultKey} className="hover:bg-gray-50 transition-colors">
                      <td className="tf-td">
                        <div className="flex items-center gap-3">
                          <NameAvatar name={resume.name || resume.candidateName} fallback={resume.email} size="md" />
                          <div>
                            <div className="tf-row-name">{resume.name || resume.candidateName || 'Unknown'}</div>
                            <div className="tf-meta">{resume.title || resume.experience || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="tf-td">
                        <div className="tf-body">{job.title}</div>
                        <div className="tf-meta">{job.location}</div>
                      </td>
                      <td className="tf-td">
                        <div className="flex items-center justify-center gap-2">
                          {getScoreIcon(result.matchType)}
                          <span className={`${SCORE_CELL_TEXT} text-gray-900`}>{result.score}%</span>
                        </div>
                      </td>
                      <td className="tf-td">
                        <div className="flex flex-wrap gap-1">
                          {result.keyMatches.map((skill, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-success-subtle text-success text-xs border border-success-line"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="tf-td">
                        <div className="flex flex-wrap gap-1">
                          {result.missingSkills.length > 0 ? (
                            result.missingSkills.map((skill, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 tf-meta border border-gray-200"
                              >
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="tf-hint">None</span>
                          )}
                        </div>
                      </td>
                      <td className="tf-td">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${getMatchColor(result.matchType)}`}>
                          {result.matchType.charAt(0).toUpperCase() + result.matchType.slice(1)}
                        </span>
                      </td>
                      <td className="tf-td text-center">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedResultForDetail(resultKey)}
                          icon={<Eye className="w-3 h-3" />}
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <MobileRecordList className="mb-5">
          {paginatedScoringResults.map((result) => {
            const resume = resumes?.find(r => r.id === result.resumeId);
            const job = effectiveJobs.find(j => j.id === result.jobId);
            const resultKey = `${result.resumeId}-${result.jobId}`;

            if (!resume || !job) return null;

            return (
              <MobileRecordCard
                key={resultKey}
                badges={
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${getMatchColor(result.matchType)}`}>
                    {result.matchType.charAt(0).toUpperCase() + result.matchType.slice(1)}
                  </span>
                }
                title={
                  <span className="flex min-w-0 items-center gap-2">
                    <NameAvatar name={resume.name || resume.candidateName} fallback={resume.email} size="md" />
                    <span className="min-w-0 truncate">{resume.name || resume.candidateName || 'Unknown'}</span>
                  </span>
                }
                footer={
                  <span className="inline-flex items-center gap-1">
                    {getScoreIcon(result.matchType)}
                    <span className={`${SCORE_CELL_TEXT} text-gray-900`}>{result.score}%</span>
                  </span>
                }
                meta={[
                  { icon: <Briefcase className="w-3.5 h-3.5" />, label: job.title },
                  { label: job.location },
                  { label: resume.title || resume.experience || '' },
                ]}
                fields={[
                  {
                    label: 'Key Matches',
                    value: result.keyMatches.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-1">
                        {result.keyMatches.map((skill, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-success-subtle text-success text-xs border border-success-line"
                          >
                            {skill}
                          </span>
                        ))}
                      </span>
                    ) : null,
                  },
                  {
                    label: 'Missing Skills',
                    value: result.missingSkills.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-1">
                        {result.missingSkills.map((skill, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 tf-meta border border-gray-200"
                          >
                            {skill}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="tf-hint">None</span>
                    ),
                  },
                ]}
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedResultForDetail(resultKey)}
                    icon={<Eye className="w-3 h-3" />}
                  >
                    View Details
                  </Button>
                }
              />
            );
          })}
        </MobileRecordList>

        <ListPagination
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalItems={scoringResults.length}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
          itemLabel="candidates"
        />

        {/* Detailed Analysis Section */}
        {selectedResultForDetail && (() => {
          const result = scoringResults.find(r => `${r.resumeId}-${r.jobId}` === selectedResultForDetail);
          const resume = resumes?.find(r => r.id === result?.resumeId);
          const job = effectiveJobs.find(j => j.id === result?.jobId);
          const detailedScores = getDetailedScores(selectedResultForDetail);

          if (!result || !resume || !job) return null;

          return (
            <>
              {/* STATIC SCORING RUBRIC TABLE REMOVED - User requested removal of mock data display */}
              {/* This static table has been commented out as it shows hardcoded mock data */}
              {/* Real scoring data should come from API endpoint /api/v1/scoring/score */}

              <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="tf-body-secondary">
                      Overall Match Score:
                    </div>
                    <div className="tf-panel flex items-center gap-3 px-3 py-1.5">
                      {getScoreIcon(result.matchType)}
                      <span className="tf-section-title">{result.score}%</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${getMatchColor(result.matchType)}`}>
                        {result.matchType.charAt(0).toUpperCase() + result.matchType.slice(1)} Match
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedResultForDetail(null)}
                  >
                    Close Detailed View
                  </Button>
                </div>
              </div>
            </>
          );
        })()}

        {/* Action Footer */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="tf-row-name mb-1">Ready to Proceed?</h3>
              <p className="tf-body-secondary">
                Review the scoring analysis above and click "Complete & Apply" to finalize the applications.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={onBack}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  // ✅ SCORING COMPLETED FEEDBACK
                  toast.success({
                    title: 'AI scoring completed!',
                    description: `${resumes?.length || 0} resume${(resumes?.length || 0) !== 1 ? 's' : ''} scored${effectiveJobs.length > 1 ? ` across ${effectiveJobs.length} jobs` : ''}. Applications ready to submit.`,
                    action: {
                      label: 'View Results',
                      onClick: () => {
                        toast.info('Opening detailed results...');
                      }
                    }
                  });
                  if (onProceedToApplicants) {
                    onProceedToApplicants();
                  } else if (onComplete) {
                    onComplete();
                  }
                }}
              >
                {onProceedToApplicants ? 'Proceed to Applicants' : 'Complete & Apply'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
