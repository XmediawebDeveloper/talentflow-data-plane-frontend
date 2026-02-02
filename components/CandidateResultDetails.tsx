'use client';

import { ArrowLeft, User, Clock, Award, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, Calendar, Briefcase, AlertCircle, Info, Loader2, ShieldAlert, Eye, Clipboard, MousePointer, Volume2, Monitor, Maximize } from 'lucide-react';
import { useState, useEffect } from 'react';
import { assessmentService, DetailedResultResponse, QuestionEvaluation, RoundScore } from '@/lib/services';

interface CandidateResultDetailsProps {
  onBack: () => void;
  assessmentId: string;
  candidateId: string;
  assessmentTitle: string;
  jdTitle?: string;
}

interface CandidateBasicInfo {
  name: string;
  email: string;
  phone?: string;
  completedDate: string;
  duration: string;
  percentage: number;
  status: 'Completed' | 'In Progress' | 'Pending';
  sections: {
    name: string;
    score: number;
    totalScore: number;
    percentage: number;
  }[];
}

export default function CandidateResultDetails({
  onBack,
  assessmentId,
  candidateId,
  assessmentTitle,
  jdTitle
}: CandidateResultDetailsProps) {
  const [detailedResult, setDetailedResult] = useState<DetailedResultResponse | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('technical-knowledge');
  const [candidateData, setCandidateData] = useState<CandidateBasicInfo | null>(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  // Fetch detailed results
  useEffect(() => {
    const fetchDetailedResults = async () => {
      setIsLoadingDetails(true);
      setDetailsError(null);
      try {
        const details = await assessmentService.getResultDetails(assessmentId, candidateId);
        console.log('[CandidateResultDetails] API Response:', {
          overall_score: details.overall_score,
          round_scores: details.round_scores.map(r => ({
            type: r.round_type,
            raw_score: r.raw_score,
            weighted_score: r.weighted_score,
            weightage_percent: r.weightage_percent,
            questions_correct: r.questions_correct,
            questions_total: r.questions_total
          })),
          question_evaluations_sample: details.question_evaluations.slice(0, 2).map(q => ({
            question_type: q.question_type,
            points_earned: q.points_earned,
            points_possible: q.points_possible,
            is_correct: q.is_correct
          }))
        });
        setDetailedResult(details);

        // Set active tab based on available rounds
        if (details.round_scores.length > 0) {
          setActiveTab(details.round_scores[0].round_type);
        }

        // Map to candidate data
        let status: 'Completed' | 'In Progress' | 'Pending' = 'In Progress';
        if (details.scoring_status === 'completed') {
          status = 'Completed';
        } else if (details.scoring_status === 'processing') {
          status = 'In Progress';
        } else if (details.scoring_status === 'pending') {
          status = 'Pending';
        }

        // Map section scores - RoundScore only has percentages, not points
        const sections = details.round_scores.map(round => {
          // raw_score is already a percentage (0-100)
          const rawPercentage = round.raw_score ?? 0;
          const percentage = Math.min(Math.round(rawPercentage), 100);

          // Calculate the actual score out of 10 based on percentage
          const score = Math.round((percentage / 100) * 10 * 10) / 10; // Round to 1 decimal

          return {
            name: `${round.round_type.charAt(0).toUpperCase() + round.round_type.slice(1)} Section`,
            score: score,
            totalScore: 10,
            percentage: percentage
          };
        });

        // Use overall score from API
        const overallScore = details.overall_score ?? 0;

        setCandidateData({
          name: details.candidate_name || 'Unknown',
          email: details.candidate_email || '',
          phone: details.candidate_phone || '',
          completedDate: details.completed_at?.split('T')[0] || 'N/A',
          duration: details.time_spent_seconds ? `${Math.round(details.time_spent_seconds / 60)} min` : 'N/A',
          percentage: overallScore,
          status,
          sections
        });
      } catch (error) {
        console.error('Failed to fetch detailed results:', error);
        setDetailsError('Failed to load detailed results. Please try again.');
      } finally {
        setIsLoadingDetails(false);
      }
    };

    fetchDetailedResults();
  }, [assessmentId, candidateId]);

  // Helper functions
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-gray-800';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-50 text-green-700 border-green-300';
      case 'In Progress':
        return 'bg-blue-50 text-blue-700 border-blue-300';
      case 'Pending':
        return 'bg-gray-50 text-gray-700 border-gray-300';
      default:
        return 'bg-yellow-50 text-yellow-700 border-yellow-300';
    }
  };

  const handleGenerateInsights = async () => {
    if (!detailedResult) return;

    setIsGeneratingInsights(true);
    try {
      const response = await assessmentService.generateCandidateInsights(
        assessmentId,
        candidateId
      );

      if (response.success && response.insights) {
        // Update detailedResult with new insights
        setDetailedResult(prev => prev ? {
          ...prev,
          candidate_insights: {
            ...prev.candidate_insights,
            ...response.insights
          }
        } : null);
      }
    } catch (error) {
      console.error('Failed to generate insights:', error);
      alert('Failed to generate AI insights. Please try again.');
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  if (isLoadingDetails) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Loading detailed results...</p>
        </div>
      </div>
    );
  }

  if (detailsError) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{detailsError}</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
          >
            Back to Results
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Sticky Header - Assessment & JD Title */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-800 border-b-2 border-gray-600 sticky top-0 z-20 shadow-lg">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-white/80 text-xs mb-1">Assessment</div>
                <h1 className="text-white text-xl">{assessmentTitle}</h1>
                {jdTitle && (
                  <div className="flex items-center gap-2 mt-1">
                    <Briefcase className="w-3.5 h-3.5 text-gray-200" />
                    <span className="text-gray-100 text-sm">Linked to: {jdTitle}</span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  const blob = await assessmentService.exportResults(assessmentId, 'csv', true);
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${assessmentTitle.replace(/\s+/g, '_')}_results_detailed.csv`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                } catch (error) {
                  console.error('Failed to export results:', error);
                  alert('Failed to export results. Please try again.');
                }
              }}
              className="px-6 py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-2 border border-white/30"
            >
              <FileText className="w-5 h-5" />
              Export Results
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-[88px] z-10">
        <div className="px-8 py-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Results Overview
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-xl">
                {(candidateData?.name || 'U').split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h1 className="text-gray-900 mb-1">{candidateData?.name || 'Unknown'}</h1>
                <p className="text-sm text-gray-600">{candidateData?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Status Badge */}
              {(() => {
                let displayStatus = candidateData?.status || 'In Progress';
                if (detailedResult && detailedResult.scoring_status === 'completed') {
                  displayStatus = 'Completed';
                } else if (detailedResult && detailedResult.scoring_status === 'processing') {
                  displayStatus = 'In Progress';
                } else if (detailedResult && detailedResult.scoring_status === 'pending') {
                  displayStatus = 'Pending';
                }
                return (
                  <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm border ${getStatusColor(displayStatus)}`}>
                    {displayStatus}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {/* Assessment Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-gray-800" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Assessment</div>
                <div className="text-gray-900">{assessmentTitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Completed</div>
                <div className="text-gray-900">{candidateData?.completedDate}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-gray-800" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Time Taken</div>
                <div className="text-gray-900">{candidateData?.duration}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Score Calculation Notice - Show if individual questions are all 0 */}
        {detailedResult && candidateData && (() => {
          // Check if all questions show 0 points
          const allQuestionsZero = detailedResult.question_evaluations.every(q => q.points_earned === 0);
          const sectionsHaveScores = detailedResult.round_scores.some(r => (r.raw_score ?? 0) > 0);

          if (allQuestionsZero && sectionsHaveScores) {
            return (
              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-yellow-900 mb-2">Score Calculation Note</h3>
                    <p className="text-sm text-yellow-800 mb-3">
                      The assessment score is calculated using weighted section scores.
                      Individual section scores may show 0% if questions are not yet scored or if there's a scoring status mismatch.
                    </p>
                    <div className="text-xs text-yellow-700 space-y-1">
                      <div><strong>Scoring Status:</strong> {detailedResult.scoring_status}</div>
                      <div className="mt-2 mb-1"><strong>Score Breakdown:</strong></div>
                      {detailedResult.round_scores.map((round, idx) => (
                        <div key={idx} className="ml-2">
                          • <strong className="capitalize">{round.round_type}:</strong> {round.raw_score}% raw score × {round.weightage_percent}% weight = <strong>{round.weighted_score}% contribution</strong>
                        </div>
                      ))}
                      <div className="mt-2 text-yellow-800 bg-yellow-100 rounded p-2">
                        <strong>Note:</strong> Individual questions show 0 points because the backend hasn't populated the question-level scores,
                        but section scores ({detailedResult.round_scores.map(r => r.raw_score).join('%, ')}%) are calculated correctly.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Section Scores */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-gray-900 mb-4">Section-wise Performance</h2>
          <div className="space-y-4">
            {candidateData?.sections.filter(section => !section.name.toLowerCase().includes('hr')).map((section, idx) => (
              <div key={idx} className={`border rounded-lg p-4 ${
                section.name.toLowerCase().includes('hr')
                  ? 'border-gray-200 bg-gray-50/30'
                  : 'border-green-200 bg-green-50/30'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">{section.name}</span>
                      {section.name.toLowerCase().includes('hr') ? (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                          Not Scored
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                          Scored (0-10)
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {section.score}/{section.totalScore} points
                      {!section.name.toLowerCase().includes('hr') && (
                        <span className="text-gray-800 ml-2">• Pass: ≥7/10</span>
                      )}
                    </div>
                  </div>
                  <div className={`text-2xl ${getScoreColor(section.percentage)}`}>
                    {section.percentage}%
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full ${section.percentage >= 80 ? 'bg-green-600' : section.percentage >= 60 ? 'bg-gray-800' : section.percentage >= 40 ? 'bg-yellow-600' : 'bg-red-600'}`}
                    style={{ width: `${Math.min(section.percentage, 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scoring Rules & Pass/Fail Criteria */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-50 border-2 border-gray-300 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Info className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-gray-900 mb-1">Assessment Scoring Rules</h2>
              <p className="text-sm text-gray-600">Critical Evaluation Logic for PASS/FAIL determination</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* HR Section Rules */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-600" />
                </div>
                <h3 className="text-gray-900">HR Section</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Responses are <strong>recorded</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Displayed in reports</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700"><strong className="text-yellow-700">NOT part of PASS/FAIL</strong> decision</span>
                </div>
              </div>
            </div>

            {/* Technical & Coding Rules */}
            <div className="bg-white rounded-lg border-2 border-green-300 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <h3 className="text-gray-900">Technical & Coding</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Rating scale: <strong>0-10</strong> per question</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Minimum passing: <strong>≥7 per question</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700"><strong className="text-green-700">Used for PASS/FAIL</strong> determination</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pass Logic */}
          <div className="mt-4 bg-white rounded-lg border-2 border-gray-300 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-5 h-5 text-gray-800" />
              <h3 className="text-gray-900">Pass Logic (Per Section)</h3>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="text-sm text-gray-900 mb-2">A section PASSES if either condition is met:</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-800 font-bold flex-shrink-0">1.</span>
                  <span className="text-gray-700">At least <strong>70% of questions</strong> score ≥7</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <span className="px-2 py-0.5 bg-gray-200 rounded">Example:</span>
                  <span>10 questions → 7+ questions must score ≥7</span>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-900 mb-2">OR:</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-800 font-bold flex-shrink-0">2.</span>
                  <span className="text-gray-700">Overall average score ≥7</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <span className="px-2 py-0.5 bg-gray-200 rounded">Example:</span>
                  <span>Total score: 75/100 → Average: 7.5 ≥ 7 → PASS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Final Result Calculation */}
          <div className="mt-4 bg-gradient-to-r from-green-50 to-gray-50 border-2 border-green-300 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-green-600" />
              <h3 className="text-gray-900">Final Assessment Result</h3>
            </div>
            <div className="text-sm text-gray-700">
              <strong>PASS</strong> if <strong>ALL</strong> evaluated sections (Technical + Coding) pass
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Remember: HR section is excluded from final PASS/FAIL calculation</span>
            </div>
          </div>
        </div>

        {/* Candidate Insights - AI Generated Analysis */}
        {detailedResult && detailedResult.scoring_status === 'completed' && (
          <div className="bg-white rounded-lg border-2 border-blue-200 overflow-hidden shadow-lg mb-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-white flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  AI-Generated Candidate Insights
                </h2>
                <p className="text-blue-100 text-sm mt-1">Advanced automated analysis for Technical & Coding rounds</p>
              </div>
              {(!detailedResult.candidate_insights?.interview_strength) && (
                <button
                  onClick={handleGenerateInsights}
                  disabled={isGeneratingInsights}
                  className="px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingInsights ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Award className="w-4 h-4" />
                      Generate Insights
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="p-6">
              {detailedResult.candidate_insights?.interview_strength ? (
              <div className="grid grid-cols-2 gap-6">
                {/* Interview Strength */}
                {detailedResult.candidate_insights.interview_strength && (
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h3 className="text-green-800 font-medium mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Interview Strength
                    </h3>
                    <p className="text-sm text-green-700">
                      {detailedResult.candidate_insights.interview_strength}
                    </p>
                  </div>
                )}

                {/* Interview Weakness */}
                {detailedResult.candidate_insights.interview_weakness && (
                  <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                    <h3 className="text-orange-800 font-medium mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Interview Weakness
                    </h3>
                    <p className="text-sm text-orange-700">
                      {detailedResult.candidate_insights.interview_weakness}
                    </p>
                  </div>
                )}

                {/* Interview Training Modules */}
                {detailedResult.candidate_insights.interview_training_modules && (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h3 className="text-blue-800 font-medium mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Interview Training Modules
                    </h3>
                    <p className="text-sm text-blue-700">
                      {detailedResult.candidate_insights.interview_training_modules}
                    </p>
                  </div>
                )}

                {/* Interview Training Suggestion */}
                {detailedResult.candidate_insights.interview_training_suggestion && (
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <h3 className="text-purple-800 font-medium mb-3 flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Interview Training Suggestion
                    </h3>
                    <p className="text-sm text-purple-700">
                      {detailedResult.candidate_insights.interview_training_suggestion}
                    </p>
                  </div>
                )}
              </div>
              ) : (
                <div className="text-center py-12">
                  <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg text-gray-700 mb-2">No AI Insights Generated Yet</h3>
                  <p className="text-gray-600 mb-4">
                    Click &quot;Generate Insights&quot; to analyze this candidate&apos;s Technical and Coding performance
                  </p>
                  <button
                    onClick={handleGenerateInsights}
                    disabled={isGeneratingInsights}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingInsights ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating AI Insights...
                      </>
                    ) : (
                      <>
                        <Award className="w-5 h-5" />
                        Generate AI Insights
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detailed Answers */}
        <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-lg">
          <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white">Detailed Question Analysis</h2>
                <p className="text-gray-100 text-sm mt-1">Review questions and answers for each section</p>
              </div>
              {/* Agent Status Badge */}
              {detailedResult && (
                <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  detailedResult.scoring_status === 'completed'
                    ? 'bg-green-500/20 text-green-100 border border-green-400/30'
                    : detailedResult.scoring_status === 'processing'
                    ? 'bg-yellow-500/20 text-yellow-100 border border-yellow-400/30'
                    : detailedResult.scoring_status === 'error'
                    ? 'bg-red-500/20 text-red-100 border border-red-400/30'
                    : 'bg-gray-500/20 text-gray-100 border border-gray-400/30'
                }`}>
                  {detailedResult.scoring_status === 'processing' && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {detailedResult.scoring_status === 'completed' && (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {detailedResult.scoring_status === 'pending' && (
                    <Clock className="w-4 h-4" />
                  )}
                  {detailedResult.scoring_status === 'error' && (
                    <XCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">
                    {detailedResult.scoring_status === 'completed' && 'Scoring Complete'}
                    {detailedResult.scoring_status === 'processing' && 'Processing...'}
                    {detailedResult.scoring_status === 'pending' && 'Scoring Pending'}
                    {detailedResult.scoring_status === 'error' && 'Scoring Failed - Needs Retry'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Agent Processing State */}
          {detailedResult && detailedResult.scoring_status === 'processing' && (
            <div className="p-8">
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-8 text-center">
                <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Processing Results</h3>
                <p className="text-gray-600 mb-4">
                  We're analyzing the candidate's responses. This usually takes 1–2 minutes.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-yellow-700">
                  <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                  <span>Processing in progress...</span>
                </div>
              </div>
            </div>
          )}

          {/* Content when loaded */}
          {detailedResult && detailedResult.scoring_status !== 'processing' && (
            <>
              {/* Tab Navigation */}
              <div className="border-b border-gray-200 bg-gray-50">
                <div className="flex gap-2 px-6 py-3">
                  {detailedResult.round_scores.map((round, idx) => {
                    const isActive = activeTab === round.round_type;
                    const questionsForRound = detailedResult.question_evaluations.filter(
                      q => q.round_type === round.round_type
                    );

                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveTab(round.round_type)}
                        className={`px-6 py-3 rounded-t-lg transition-all flex items-center gap-2 ${
                          isActive
                            ? 'bg-white text-gray-800 border-t-2 border-x border-gray-800 shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <span className="font-medium capitalize">{round.round_type} Round</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          isActive ? 'bg-gray-100 text-gray-900' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {questionsForRound.length}
                        </span>
                      </button>
                    );
                  })}

                  {/* Violations Tab */}
                  <button
                    onClick={() => setActiveTab('violations')}
                    className={`px-6 py-3 rounded-t-lg transition-all flex items-center gap-2 ${
                      activeTab === 'violations'
                        ? 'bg-white text-red-700 border-t-2 border-x border-red-500 shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span className="font-medium">Violations</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      activeTab === 'violations'
                        ? 'bg-red-100 text-red-700'
                        : (detailedResult.proctoring_stats?.total_violations || 0) > 0
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-200 text-gray-600'
                    }`}>
                      {detailedResult.proctoring_stats?.total_violations || 0}
                    </span>
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {detailedResult.round_scores.map((round, roundIdx) => {
                  const isActiveTab = activeTab === round.round_type;
                  if (!isActiveTab) return null;

                  const questionsForRound = detailedResult.question_evaluations.filter(
                    q => q.round_type === round.round_type
                  );

                  return (
                    <div key={roundIdx} className="space-y-6">
                      {/* Section Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                        <div>
                          <h3 className="text-xl text-gray-900 capitalize">{round.round_type} Round</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {questionsForRound.length} question{questionsForRound.length !== 1 ? 's' : ''} •
                            <span className="ml-1">{round.questions_correct}/{round.questions_total} correct</span>
                          </p>
                        </div>
                        {round.round_type.toLowerCase() !== 'hr' && (
                          <div className="text-right">
                            <div className="text-sm text-gray-600 mb-1">Section Score</div>
                            <div className={`text-3xl ${getScoreColor(Math.min(round.raw_score, 100))}`}>
                              {Math.min(Math.round(round.raw_score), 100)}%
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Questions */}
                      {questionsForRound.length > 0 ? (
                        <div className="space-y-6">
                          {questionsForRound.map((q, qIdx) => (
                            <div key={qIdx} className="border-2 border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors">
                              {/* Question Header */}
                              <div className={`px-6 py-4 border-b border-gray-200 ${
                                q.is_correct ? 'bg-green-50' : 'bg-red-50'
                              }`}>
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <span className="px-3 py-1 bg-gray-800 text-white rounded-full text-xs font-medium">
                                        Q{qIdx + 1}
                                      </span>
                                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                        q.question_type === 'coding'
                                          ? 'bg-purple-100 text-purple-700'
                                          : q.question_type === 'single_choice' || q.question_type === 'multiple_choice'
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-gray-100 text-gray-700'
                                      }`}>
                                        {q.question_type === 'coding' ? 'Coding'
                                          : q.question_type === 'single_choice' ? 'Single Choice'
                                          : q.question_type === 'multiple_choice' ? 'Multiple Choice'
                                          : 'Text'}
                                      </span>
                                      {q.is_correct ? (
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Correct</span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Incorrect</span>
                                      )}
                                    </div>
                                    <div className="text-gray-900 leading-relaxed">{q.question_text}</div>
                                  </div>
                                  <div className="ml-6 text-right flex-shrink-0">
                                    <div className="text-xs text-gray-600 mb-1">Score</div>
                                    <div className="flex items-center gap-2">
                                      {(() => {
                                        // Normalize scores to be out of 10
                                        const normalizedEarned = q.points_possible === 100 ? q.points_earned / 10 : q.points_earned;
                                        const normalizedPossible = q.points_possible === 100 ? 10 : q.points_possible;
                                        const percentage = (normalizedEarned / normalizedPossible) * 100;

                                        return (
                                          <>
                                            <div className={`text-2xl font-bold ${getScoreColor(percentage)}`}>
                                              {Math.round(normalizedEarned * 10) / 10}
                                            </div>
                                            <div className="text-gray-400">/</div>
                                            <div className="text-xl text-gray-600">{normalizedPossible}</div>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Question Content */}
                              <div className="p-6 space-y-4">
                                {/* Candidate's Answer */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                      <User className="w-4 h-4 text-gray-800" />
                                    </div>
                                    <div className="text-sm font-medium text-gray-800">CANDIDATE'S ANSWER</div>
                                  </div>
                                  <div className={`rounded-lg p-4 ${
                                    q.question_type === 'coding'
                                      ? 'bg-gray-900 text-green-400 font-mono text-sm overflow-x-auto'
                                      : 'bg-gray-50 text-gray-800'
                                  }`}>
                                    {q.question_type === 'coding' ? (
                                      <pre className="whitespace-pre-wrap">{q.candidate_code_submission || 'No code submitted'}</pre>
                                    ) : q.candidate_selected_options && q.candidate_selected_options.length > 0 ? (
                                      <div>
                                        {q.candidate_selected_options.map((opt, i) => {
                                          const option = q.options?.find(o => o.id === opt);
                                          return (
                                            <div key={i} className="flex items-center gap-2 mb-1">
                                              <span className="text-gray-500">•</span>
                                              <span>{option?.text || opt}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p>{q.candidate_answer_text || 'No answer provided'}</p>
                                    )}
                                  </div>
                                </div>

                                {/* Correct Answer (for MCQ) */}
                                {q.correct_answer && q.correct_answer.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                      </div>
                                      <div className="text-sm font-medium text-green-900">CORRECT ANSWER</div>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-4">
                                      {q.correct_answer.map((opt, i) => {
                                        const option = q.options?.find(o => o.id === opt);
                                        return (
                                          <div key={i} className="flex items-center gap-2 mb-1 text-green-800">
                                            <CheckCircle className="w-4 h-4" />
                                            <span>{option?.text || opt}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Ideal/Model Answer (for text questions) */}
                                {q.ideal_answer && (!q.correct_answer || q.correct_answer.length === 0) && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-blue-600" />
                                      </div>
                                      <div className="text-sm font-medium text-blue-900">MODEL ANSWER</div>
                                    </div>
                                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                      <p className="text-blue-800 leading-relaxed">{q.ideal_answer}</p>
                                    </div>
                                  </div>
                                )}

                                {/* AI Feedback */}
                                {q.feedback && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-gray-800" />
                                      </div>
                                      <div className="text-sm font-medium text-gray-800">AI FEEDBACK & EVALUATION</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                      <div className="text-gray-800 leading-relaxed">{q.feedback}</div>
                                    </div>
                                  </div>
                                )}

                                {/* Strengths & Areas for Improvement */}
                                {((q.strengths && q.strengths.length > 0) || (q.areas_for_improvement && q.areas_for_improvement.length > 0)) && (
                                  <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                                    {q.strengths && q.strengths.length > 0 && (
                                      <div className="bg-green-50 rounded-lg p-4">
                                        <div className="text-sm font-medium text-green-800 mb-2">Strengths</div>
                                        <ul className="text-sm text-green-700 space-y-1">
                                          {q.strengths.map((s, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                              <CheckCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                                              {s}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {q.areas_for_improvement && q.areas_for_improvement.length > 0 && (
                                      <div className="bg-amber-50 rounded-lg p-4">
                                        <div className="text-sm font-medium text-amber-800 mb-2">Areas for Improvement</div>
                                        <ul className="text-sm text-amber-700 space-y-1">
                                          {q.areas_for_improvement.map((a, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                              <AlertCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                                              {a}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600">No questions available for this section</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Violations Tab Content */}
                {activeTab === 'violations' && detailedResult.proctoring_stats && (
                  <div className="space-y-6">
                    {/* Violations Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                      <div>
                        <h3 className="text-xl text-gray-900">Proctoring Violations</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {detailedResult.proctoring_stats.total_violations} total violation{detailedResult.proctoring_stats.total_violations !== 1 ? 's' : ''} detected during the assessment
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600 mb-1">Integrity Status</div>
                        <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium ${
                          detailedResult.proctoring_stats.integrity_status === 'clean'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : detailedResult.proctoring_stats.integrity_status === 'flagged'
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                        }`}>
                          {detailedResult.proctoring_stats.integrity_status === 'clean' && <CheckCircle className="w-4 h-4 mr-2" />}
                          {detailedResult.proctoring_stats.integrity_status === 'flagged' && <ShieldAlert className="w-4 h-4 mr-2" />}
                          {detailedResult.proctoring_stats.integrity_status === 'suspicious' && <AlertCircle className="w-4 h-4 mr-2" />}
                          {detailedResult.proctoring_stats.integrity_status.charAt(0).toUpperCase() + detailedResult.proctoring_stats.integrity_status.slice(1)}
                        </span>
                      </div>
                    </div>

                    {/* Violations Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {/* Window Blur */}
                      <div className={`rounded-xl p-5 border-2 ${
                        detailedResult.proctoring_stats.window_blur_count > 0
                          ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          detailedResult.proctoring_stats.window_blur_count > 0
                            ? 'bg-red-100'
                            : 'bg-gray-100'
                        }`}>
                          <Eye className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.window_blur_count > 0
                              ? 'text-red-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Window Blur</div>
                        <div className={`text-3xl font-bold ${
                          detailedResult.proctoring_stats.window_blur_count > 0
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.window_blur_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Tab Switch */}
                      <div className={`rounded-xl p-5 border-2 ${
                        detailedResult.proctoring_stats.tab_switch_count > 0
                          ? 'bg-orange-50 border-orange-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          detailedResult.proctoring_stats.tab_switch_count > 0
                            ? 'bg-orange-100'
                            : 'bg-gray-100'
                        }`}>
                          <Monitor className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.tab_switch_count > 0
                              ? 'text-orange-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Tab Switch</div>
                        <div className={`text-3xl font-bold ${
                          detailedResult.proctoring_stats.tab_switch_count > 0
                            ? 'text-orange-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.tab_switch_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Copy Count */}
                      <div className={`rounded-xl p-5 border-2 ${
                        (detailedResult.proctoring_stats.copy_count || 0) > 0
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          (detailedResult.proctoring_stats.copy_count || 0) > 0
                            ? 'bg-yellow-100'
                            : 'bg-gray-100'
                        }`}>
                          <Clipboard className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.copy_count || 0) > 0
                              ? 'text-yellow-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Copy Attempts</div>
                        <div className={`text-3xl font-bold ${
                          (detailedResult.proctoring_stats.copy_count || 0) > 0
                            ? 'text-yellow-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.copy_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Paste Count */}
                      <div className={`rounded-xl p-5 border-2 ${
                        (detailedResult.proctoring_stats.paste_count || 0) > 0
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          (detailedResult.proctoring_stats.paste_count || 0) > 0
                            ? 'bg-yellow-100'
                            : 'bg-gray-100'
                        }`}>
                          <MousePointer className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.paste_count || 0) > 0
                              ? 'text-yellow-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Paste Attempts</div>
                        <div className={`text-3xl font-bold ${
                          (detailedResult.proctoring_stats.paste_count || 0) > 0
                            ? 'text-yellow-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.paste_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Video Violations */}
                      <div className={`rounded-xl p-5 border-2 ${
                        detailedResult.proctoring_stats.video_violation_count > 0
                          ? 'bg-purple-50 border-purple-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          detailedResult.proctoring_stats.video_violation_count > 0
                            ? 'bg-purple-100'
                            : 'bg-gray-100'
                        }`}>
                          <Eye className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.video_violation_count > 0
                              ? 'text-purple-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Video Violations</div>
                        <div className={`text-3xl font-bold ${
                          detailedResult.proctoring_stats.video_violation_count > 0
                            ? 'text-purple-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.video_violation_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">occurrences</div>
                      </div>

                      {/* Voice Violations */}
                      <div className={`rounded-xl p-5 border-2 ${
                        detailedResult.proctoring_stats.voice_violation_count > 0
                          ? 'bg-pink-50 border-pink-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          detailedResult.proctoring_stats.voice_violation_count > 0
                            ? 'bg-pink-100'
                            : 'bg-gray-100'
                        }`}>
                          <Volume2 className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.voice_violation_count > 0
                              ? 'text-pink-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Voice Violations</div>
                        <div className={`text-3xl font-bold ${
                          detailedResult.proctoring_stats.voice_violation_count > 0
                            ? 'text-pink-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.voice_violation_count}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">occurrences</div>
                      </div>

                      {/* Fullscreen Exit */}
                      <div className={`rounded-xl p-5 border-2 ${
                        (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                            ? 'bg-blue-100'
                            : 'bg-gray-100'
                        }`}>
                          <Maximize className={`w-6 h-6 ${
                            (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                              ? 'text-blue-600'
                              : 'text-gray-400'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Fullscreen Exit</div>
                        <div className={`text-3xl font-bold ${
                          (detailedResult.proctoring_stats.fullscreen_exit_count || 0) > 0
                            ? 'text-blue-600'
                            : 'text-gray-400'
                        }`}>
                          {detailedResult.proctoring_stats.fullscreen_exit_count || 0}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">times</div>
                      </div>

                      {/* Other Violations (uncategorized) - only show if > 0 */}
                      {(detailedResult.proctoring_stats.other_violation_count || 0) > 0 && (
                        <div className="rounded-xl p-5 border-2 bg-gray-50 border-gray-300">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3 bg-gray-200">
                            <AlertCircle className="w-6 h-6 text-gray-600" />
                          </div>
                          <div className="text-sm text-gray-600 mb-1">Other</div>
                          <div className="text-3xl font-bold text-gray-600">
                            {detailedResult.proctoring_stats.other_violation_count}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">events</div>
                        </div>
                      )}

                      {/* Total Violations */}
                      <div className={`rounded-xl p-5 border-2 ${
                        detailedResult.proctoring_stats.total_violations > 0
                          ? 'bg-red-50 border-red-300'
                          : 'bg-green-50 border-green-200'
                      }`}>
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                          detailedResult.proctoring_stats.total_violations > 0
                            ? 'bg-red-100'
                            : 'bg-green-100'
                        }`}>
                          <ShieldAlert className={`w-6 h-6 ${
                            detailedResult.proctoring_stats.total_violations > 0
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`} />
                        </div>
                        <div className="text-sm text-gray-600 mb-1">Total Violations</div>
                        <div className={`text-3xl font-bold ${
                          detailedResult.proctoring_stats.total_violations > 0
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}>
                          {detailedResult.proctoring_stats.total_violations}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">total</div>
                      </div>
                    </div>

                    {/* Summary Note */}
                    {detailedResult.proctoring_stats.total_violations === 0 ? (
                      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 text-center">
                        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                        <h4 className="text-lg font-medium text-green-800 mb-1">No Violations Detected</h4>
                        <p className="text-sm text-green-600">
                          This candidate completed the assessment without any proctoring violations.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6">
                        <div className="flex items-start gap-4">
                          <AlertCircle className="w-8 h-8 text-yellow-600 flex-shrink-0" />
                          <div>
                            <h4 className="text-lg font-medium text-yellow-800 mb-1">Violations Summary</h4>
                            <p className="text-sm text-yellow-700">
                              {detailedResult.proctoring_stats.total_violations} violation{detailedResult.proctoring_stats.total_violations !== 1 ? 's were' : ' was'} detected during this assessment.
                              Please review the candidate's responses and consider these violations when making your hiring decision.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
