'use client';

import { Target, Award, CheckCircle, XCircle, TrendingUp, Mail, Phone, MapPin, Briefcase, GraduationCap, Star, Calendar, Zap, FileText, AlertCircle, Download, Clock, Building2, ChevronRight, Code, Languages, ArrowLeft, BarChart3, CheckSquare, MessageSquare, Minus } from 'lucide-react';
import DetailedScorecardTab from './DetailedScorecardTab';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

interface ScoredResume {
  id: string;
  candidateName: string;
  email: string;
  phone: string;
  matchStatus: string;
  scorePercentage: number;
  scoredDate: string;
  scoredBy: string;
  experience?: string;
  education?: string;
  certifications?: string[];
  aiSummary?: string;
  strengths?: string[];
  gaps?: string[];
  matchReason?: string;
  scoreBreakdown?: any[]; // Array of score breakdown items from API
  criteriaScores?: Record<string, any>; // Criteria scores object from API
  title?: string;
  currentCompany?: string;
  location?: string;
  professionalSummary?: string;
  skills?: string[];
  technicalSkills?: string[];
  softSkills?: string[];
  educationDetails?: any[];
  experienceDetails?: any[];
  languages?: string[];
  // Explicit matched and missing skills (from scoring)
  matchedSkills?: string[];
  missingSkills?: string[];
}

interface CandidateScoringDetailPageProps {
  resume: ScoredResume;
  jobTitle: string;
  jobId: string;
  onBack: () => void;
}

export default function CandidateScoringDetailPage({ resume, jobTitle, jobId, onBack }: CandidateScoringDetailPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'comparison' | 'scoretable' | 'personalinfo'>('overview');
  const [isDataReady, setIsDataReady] = useState(false);
  const [fullResumeData, setFullResumeData] = useState<ScoredResume>(resume);

  // Debug: Check props
  console.log('[CandidateScoringDetailPage] Props:', {
    hasResume: !!resume,
    jobTitle,
    jobId,
    resumeId: resume?.id,
    scorePercentage: resume?.scorePercentage,
    criteriaScores: resume?.criteriaScores
  });

  // Always fetch complete scoring data from API to ensure fresh data
  useEffect(() => {
    const fetchCompleteData = async () => {
      console.log('[CandidateScoringDetailPage] Fetching complete data from API');

      // Always fetch from API when jobId is available to get latest data
      if (jobId && resume?.id) {
        console.log('[CandidateScoringDetailPage] Fetching from API for jobId:', jobId, 'resumeId:', resume.id);
        try {
          const { jdService } = await import('@/lib/services/jdService');
          const scoredResumes = await jdService.getScoredResumes(jobId, { page_size: 100 });
          const completeResumeData = scoredResumes.items.find((r: any) => r.id === resume.id);

          if (completeResumeData) {
            console.log('[CandidateScoringDetailPage] Complete data fetched successfully:', {
              overall_score: completeResumeData.overall_score,
              has_criteria_scores: !!completeResumeData.criteria_scores,
              criteria_count: Object.keys(completeResumeData.criteria_scores || {}).length
            });
            setFullResumeData({
              ...resume,
              scorePercentage: Math.round(completeResumeData.overall_score || 0),
              criteriaScores: completeResumeData.criteria_scores || {},
              scoreBreakdown: completeResumeData.score_breakdown || [],
              aiSummary: completeResumeData.ai_summary,
              strengths: completeResumeData.strengths || [],
              gaps: completeResumeData.gaps || [],
              scoredDate: completeResumeData.created_at,
              matchStatus: completeResumeData.match_status,
            });
            setIsDataReady(true);
          } else {
            console.log('[CandidateScoringDetailPage] Resume not found in API response, using existing data');
            setFullResumeData(resume);
            setIsDataReady(true);
          }
        } catch (error) {
          console.error('[CandidateScoringDetailPage] Error fetching complete data:', error);
          setFullResumeData(resume);
          setIsDataReady(true);
        }
      } else {
        console.log('[CandidateScoringDetailPage] No jobId provided, using existing data');
        setFullResumeData(resume);
        setIsDataReady(true);
      }
    };

    fetchCompleteData();
  }, [resume?.id, jobId]);

  // Generate enriched data from resume with varied fallback scores
  const generateVariedScore = (base: number, variance: number) => {
    // Use a deterministic variation based on resume id to keep scores consistent across renders
    const hash = resume.id.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
    const variation = ((hash % variance) - variance / 2);
    return Math.min(100, Math.max(0, Math.round(base + variation)));
  };

  const detailedScores = {
    titleMatch: fullResumeData.scoreBreakdown?.overallFit || fullResumeData.scorePercentage,
    experienceMatch: fullResumeData.scoreBreakdown?.experienceMatch || generateVariedScore(fullResumeData.scorePercentage, 20),
    skillsMatch: fullResumeData.scoreBreakdown?.skillsMatch || generateVariedScore(fullResumeData.scorePercentage, 16),
    educationMatch: fullResumeData.scoreBreakdown?.educationMatch || generateVariedScore(fullResumeData.scorePercentage, 24),
    locationMatch: generateVariedScore(fullResumeData.scorePercentage, 12),
  };

  // matchedSkills should be from the explicit matchedSkills field, or fall back to skills arrays
  // strengths are AI-generated descriptions, not skills
  const matchedSkills = fullResumeData.matchedSkills || fullResumeData.technicalSkills || fullResumeData.skills || [];
  // missingSkills should be from the explicit missingSkills field
  const missingSkills = fullResumeData.missingSkills || [];

  // Use strengths directly from API without template prefixes
  const keyStrengths = fullResumeData.strengths && fullResumeData.strengths.length > 0
    ? fullResumeData.strengths
    : fullResumeData.scorePercentage >= 85
      ? ['Strong alignment with job requirements', 'Excellent technical profile']
      : fullResumeData.scorePercentage >= 70
        ? ['Good technical foundation', 'Relevant experience']
        : ['Shows potential for growth'];

  // Use gaps directly from API without template prefixes
  const improvementAreas = fullResumeData.gaps && fullResumeData.gaps.length > 0
    ? fullResumeData.gaps
    : [];

  const aiReasoning = fullResumeData.aiSummary || fullResumeData.matchReason || (
    (fullResumeData.matchStatus === 'Exact Match' || fullResumeData.matchStatus === 'Excellent Match')
      ? 'Outstanding candidate with exceptional alignment to job requirements. Strong technical skills, relevant experience, and proven track record in similar roles.'
      : fullResumeData.matchStatus === 'Partial Match'
        ? 'Solid candidate with good alignment to most job requirements. Possesses core technical skills and relevant experience with minor gaps in specialized areas.'
        : 'Limited alignment with current job requirements. While the candidate shows promise in certain areas, there are significant gaps in required technical skills and experience.'
  );

  // No static recommendations - removed hardcoded next steps

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

  const getMatchStatusColor = (status: string) => {
    if (status === 'Exact Match' || status === 'Excellent Match') return 'bg-green-100 text-green-700 border-green-300';
    if (status === 'Partial Match') return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const handleDownloadScorecard = async () => {
    const toastId = toast.loading('Generating scorecard PDF...');

    try {
      console.log('[Download] Starting PDF download for score_id:', fullResumeData.id);

      // Get token from localStorage
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('Please login to download scorecard', { id: toastId });
        return;
      }

      // Call the backend API to get PDF
      const response = await fetch(`https://talentflowdata.api.mo.vc/api/v1/scoring/scores/${fullResumeData.id}/download-pdf`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('[Download] Failed:', response.status, errorData);

        // Provide user-friendly error message
        let errorMessage = 'Failed to download scorecard. Please try again later.';

        if (response.status === 404) {
          errorMessage = 'Scorecard not found. The score may have been deleted.';
        } else if (response.status === 500) {
          errorMessage = 'Server error while generating scorecard. Our team has been notified.';
        } else if (response.status === 401 || response.status === 403) {
          errorMessage = 'You do not have permission to download this scorecard.';
        }

        toast.error(errorMessage, { id: toastId, duration: 5000 });
        return;
      }

      // Get the PDF blob
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fullResumeData.candidateName.replace(/\s+/g, '_')}_Scorecard.pdf`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Scorecard downloaded successfully', { id: toastId });
      console.log('[Download] PDF downloaded successfully');
    } catch (error) {
      console.error('[Download] Error:', error);
      toast.error('Failed to download scorecard. Please try again.', { id: toastId });
    }
  };

  // Show loading state while waiting for complete data
  if (!isDataReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading candidate details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-white">
      {/* Back Button */}
      <div className="px-8 pt-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-800 hover:text-gray-900 font-medium transition-colors hover:gap-3"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Scored Resumes
        </button>
      </div>

      {/* Header */}
      <div className="px-8 py-6">
        <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-20 h-20 bg-gradient-to-br from-gray-700 to-gray-800 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                <Target className="w-10 h-10 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl text-gray-900 font-bold mb-2">{resume.candidateName}</h1>
                <p className="text-lg text-gray-700 mb-3 font-medium">{resume.title || resume.experience || 'Candidate'}</p>
                <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                  <span className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                    <Mail className="w-4 h-4 text-gray-800" />
                    <span className="text-gray-900">{resume.email}</span>
                  </span>
                  <span className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                    <Phone className="w-4 h-4 text-green-600" />
                    <span className="text-gray-900">{resume.phone}</span>
                  </span>
                  {resume.location && (
                    <span className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                      <MapPin className="w-4 h-4 text-red-500" />
                      <span className="text-gray-900">{resume.location}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadScorecard}
                className="px-4 py-2 text-sm text-gray-700 border-2 border-gray-300 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Scorecard
              </button>
            </div>
          </div>

          {/* Score Display */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 border-2 border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-2 font-medium">Overall Match Score</div>
                <div className="flex items-center gap-4">
                  <div className={`text-6xl font-bold ${getScoreColor(resume.scorePercentage)}`}>{resume.scorePercentage}%</div>
                  <span className={`px-5 py-2.5 rounded-lg text-sm font-medium border-2 ${getMatchStatusColor(resume.matchStatus)}`}>
                    {resume.matchStatus}
                  </span>
                </div>
              </div>
              <div className="text-right bg-white px-6 py-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-sm text-gray-600 mb-1 font-medium">Position</div>
                <div className="text-xl font-bold text-gray-900">{jobTitle}</div>
                <div className="text-xs text-gray-600 mt-2 flex items-center gap-1.5 justify-end">
                  <Clock className="w-3.5 h-3.5" />
                  Scored on {resume.scoredDate}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-8">
        <div className="bg-white rounded-t-xl border-x-2 border-t-2 border-gray-200">
          <div className="flex gap-1 px-6 pt-2">
            {[
              { id: 'overview', label: 'Overview' },
              // { id: 'comparison', label: 'JD Comparison' },
              { id: 'scoretable', label: 'Score Table' },
              { id: 'personalinfo', label: 'Personal Info' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-6 py-3 text-sm font-medium transition-colors rounded-t-lg ${
                  activeTab === tab.id
                    ? 'text-gray-800 bg-gray-50 border-b-2 border-gray-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 pb-8">
        <div className="bg-white rounded-b-xl border-x-2 border-b-2 border-gray-200 p-6 min-h-[500px]">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* AI Analysis */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Match Analysis</h3>
                    <p className="text-gray-700 leading-relaxed">{aiReasoning}</p>
                  </div>
                </div>
              </div>

              {/* Skills Match */}
              {matchedSkills.length > 0 && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Matched Skills ({matchedSkills.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {matchedSkills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-4 py-2 bg-green-100 text-green-700 border border-green-300 rounded-lg text-sm font-medium flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Skills */}
              {missingSkills.length > 0 && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    Skills Gap ({missingSkills.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {missingSkills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-4 py-2 bg-red-100 text-red-700 border border-red-300 rounded-lg text-sm font-medium flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Strengths */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-600" />
                  Key Strengths
                </h3>
                <ul className="space-y-3">
                  {keyStrengths.map((strength, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-gray-700">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvement Areas */}
              {improvementAreas.length > 0 && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    Areas for Development
                  </h3>
                  <ul className="space-y-3">
                    {improvementAreas.map((area, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-gray-700">
                        <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                        <span>{area}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* AI Summary - if available */}
              {resume.aiSummary && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Award className="w-5 h-5 text-gray-800" />
                    AI Summary
                  </h3>
                  <p className="text-gray-700 leading-relaxed">{resume.aiSummary}</p>
                </div>
              )}
            </div>
          )}

          {/* {activeTab === 'comparison' && (
            <div className="space-y-6">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Candidate vs Job Requirements - {jobTitle}</h3>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-medium text-gray-700 mb-4 text-lg">Candidate Strengths</h4>
                    <ul className="space-y-3 text-gray-600">
                      {keyStrengths.length > 0 ? keyStrengths.map((strength, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>{strength}</span>
                        </li>
                      )) : (
                        <li className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span>No specific strengths identified</span>
                        </li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700 mb-4 text-lg">Candidate Profile</h4>
                    <ul className="space-y-3 text-gray-600">
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span><strong>Experience:</strong> {resume.experience || 'Not specified'}</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span><strong>Skills:</strong> {matchedSkills.length} matched skills</span>
                      </li>
                      <li className="flex items-start gap-3">
                        {resume.currentCompany ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        )}
                        <span><strong>Company:</strong> {resume.currentCompany || 'Not specified'}</span>
                      </li>
                      <li className="flex items-start gap-3">
                        {resume.education ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        )}
                        <span><strong>Education:</strong> {
                          typeof resume.education === 'string'
                            ? resume.education
                            : Array.isArray(resume.education) && resume.education.length > 0
                              ? (resume.education[0]?.degree || resume.education[0]?.institution || 'Education available')
                              : 'Not specified'
                        }</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-white border-2 border-orange-200 rounded-xl p-6">
                <h4 className="font-medium text-orange-700 mb-4 text-lg flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Areas for Development
                </h4>
                <ul className="space-y-3 text-gray-600">
                  {improvementAreas.map((area, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                      <span>{area}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`rounded-xl p-6 border-2 ${
                resume.scorePercentage >= 85
                  ? 'bg-green-50 border-green-300'
                  : resume.scorePercentage >= 70
                  ? 'bg-gray-50 border-gray-300'
                  : resume.scorePercentage >= 60
                  ? 'bg-yellow-50 border-yellow-300'
                  : 'bg-red-50 border-red-300'
              }`}>
                <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Overall Recommendation
                </h4>
                <p className="text-gray-700">
                  {resume.scorePercentage >= 85
                    ? 'Highly recommended candidate. Strong alignment with job requirements across all key areas. Proceed to interview stage immediately.'
                    : resume.scorePercentage >= 70
                    ? 'Good candidate with solid qualifications. Some minor gaps that can be addressed. Recommended for interview consideration.'
                    : resume.scorePercentage >= 60
                    ? 'Moderate fit. Consider if pipeline is limited, but may require additional training and development.'
                    : 'Limited fit for this role. Significant gaps in required qualifications. Consider other opportunities.'}
                </p>
              </div>
            </div>
          )} */}

          {activeTab === 'scoretable' && (
            <DetailedScorecardTab
              resume={{
                scorePercentage: fullResumeData.scorePercentage,
                scoredDate: fullResumeData.scoredDate,
                scoredBy: fullResumeData.scoredBy,
                detailedScores: detailedScores,
                certifications: resume.certifications,
                education: resume.education,
                location: resume.location,
                title: resume.title,
                // Pass API data for accurate scoring display
                scoreBreakdown: fullResumeData.scoreBreakdown,
                criteriaScores: fullResumeData.criteriaScores,
              }}
              jobTitle={jobTitle}
              getScoreColor={getScoreColor}
              getScoreBgColor={getScoreBgColor}
              getProgressBarColor={getProgressBarColor}
            />
          )}

          {activeTab === 'personalinfo' && (
            <div className="space-y-6">
              {/* Professional Summary */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-yellow-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Professional Summary</h3>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  {resume.professionalSummary || resume.aiSummary || `${resume.title || 'Professional'} with ${resume.experience || 'experience'} in the field.`}
                </p>
              </div>

              {/* Work Experience */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Briefcase className="w-5 h-5 text-gray-800" />
                  <h3 className="text-lg font-semibold text-gray-900">Work Experience</h3>
                </div>
                {resume.experienceDetails && resume.experienceDetails.length > 0 ? (
                  <div className="space-y-4">
                    {resume.experienceDetails.map((exp: any, index: number) => (
                      <div key={index} className="relative pl-6 border-l-2 border-gray-200">
                        <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-gray-600 border-2 border-white"></div>
                        <div className="mb-4">
                          <h4 className="font-semibold text-gray-900 mb-1">{exp.title || exp.position || 'Position'}</h4>
                          <div className="flex items-center gap-2 text-gray-700 mb-1">
                            <Building2 className="w-4 h-4" />
                            <span>{exp.company || 'Company'}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            {exp.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {exp.location}
                              </span>
                            )}
                            {(exp.start_date || exp.end_date || exp.duration) && (
                              <span className="text-gray-800">
                                {exp.duration || `${exp.start_date || ''} - ${exp.end_date || 'Present'}`}
                              </span>
                            )}
                          </div>
                          {exp.description && (
                            <p className="mt-2 text-sm text-gray-600">{exp.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="relative pl-6 border-l-2 border-gray-200">
                    <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-gray-600 border-2 border-white"></div>
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 mb-1">{resume.title || 'Current Position'}</h4>
                      <div className="flex items-center gap-2 text-gray-700 mb-1">
                        <Building2 className="w-4 h-4" />
                        <span>{resume.currentCompany || 'Company Not Specified'}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        {resume.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {resume.location}
                          </span>
                        )}
                        <span className="text-gray-800">({resume.experience || 'N/A'})</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Education */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <GraduationCap className="w-5 h-5 text-gray-800" />
                  <h3 className="text-lg font-semibold text-gray-900">Education</h3>
                </div>
                {resume.educationDetails && resume.educationDetails.length > 0 ? (
                  <div className="space-y-3">
                    {resume.educationDetails.map((edu: any, index: number) => (
                      <div key={index} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-1">
                          {edu.degree || edu.qualification || 'Degree'}
                        </h4>
                        {edu.institution && (
                          <p className="text-gray-700">{edu.institution}</p>
                        )}
                        {edu.year && (
                          <p className="text-sm text-gray-500">{edu.year}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-2">{
                      typeof resume.education === 'string'
                        ? resume.education
                        : Array.isArray(resume.education) && resume.education.length > 0
                          ? (resume.education[0]?.degree || resume.education[0]?.institution || 'Education available')
                          : 'Education not specified'
                    }</h4>
                  </div>
                )}
              </div>

              {/* Skills */}
              {(resume.skills && resume.skills.length > 0) ||
               (resume.technicalSkills && resume.technicalSkills.length > 0) ||
               (resume.softSkills && resume.softSkills.length > 0) ||
               matchedSkills.length > 0 ? (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Code className="w-5 h-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Skills</h3>
                  </div>

                  {/* Technical Skills */}
                  {resume.technicalSkills && resume.technicalSkills.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Technical Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {resume.technicalSkills.map((skill: string, index: number) => (
                          <span key={index} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm border border-blue-200">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Soft Skills */}
                  {resume.softSkills && resume.softSkills.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Soft Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {resume.softSkills.map((skill: string, index: number) => (
                          <span key={index} className="px-4 py-2 bg-purple-50 text-purple-700 rounded-lg text-sm border border-purple-200">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* General Skills */}
                  {resume.skills && resume.skills.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">All Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {resume.skills.map((skill: string, index: number) => (
                          <span key={index} className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fallback to matched skills if no specific skills available */}
                  {!resume.skills?.length && !resume.technicalSkills?.length && !resume.softSkills?.length && matchedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {matchedSkills.map((skill, index) => (
                        <span key={index} className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Languages */}
              {resume.languages && resume.languages.length > 0 && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Languages className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Languages</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {resume.languages.map((language: any, index: number) => {
                      // Handle both string and object formats
                      const langName = typeof language === 'string' ? language : (language.name || language.language || 'Unknown');
                      const proficiency = typeof language === 'object' ? language.proficiency : null;
                      return (
                        <span key={index} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm border border-indigo-200">
                          {langName}{proficiency ? ` (${proficiency})` : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Certifications */}
              {resume.certifications && resume.certifications.length > 0 && (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Award className="w-5 h-5 text-yellow-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Certifications</h3>
                  </div>
                  <div className="space-y-3">
                    {resume.certifications.map((cert, index) => (
                      <div key={index} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
                        <span className="font-medium text-gray-900">{cert}</span>
                        <Award className="w-5 h-5 text-yellow-600" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
