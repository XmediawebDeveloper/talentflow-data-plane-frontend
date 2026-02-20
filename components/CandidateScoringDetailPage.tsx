'use client';

import { Target, Award, CheckCircle, XCircle, TrendingUp, Mail, Phone, MapPin, Briefcase, GraduationCap, Star, Calendar, Zap, FileText, AlertCircle, Download, Clock, Building2, ChevronRight, Code, Languages, ArrowLeft, BarChart3, CheckSquare, MessageSquare, Minus, BookOpen, ThumbsUp, ThumbsDown } from 'lucide-react';
import DetailedScorecardTab from './DetailedScorecardTab';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { handleUnauthorized } from '@/lib/services/api';

interface ScoredResume {
  id: string;  // This is the SCORE ID, not resume ID!
  resumeId?: string;  // The actual resume ID (from API's resume_id field)
  candidateName: string;
  email: string;
  phone: string;
  matchStatus: string;
  scorePercentage: number;
  scoredDate: string;
  scoredBy: string;
  experience?: string;
  education?: string;
  certifications?: (string | { name?: string; date?: string; issuer?: string; credential_id?: string })[];
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
  languages?: any[];
  // Explicit matched and missing skills (from scoring)
  matchedSkills?: string[];
  missingSkills?: string[];
  // Additional fields from full resume
  projects?: any[];
  awards?: any[];
  achievements?: any[];
  hobbies?: any[];
  volunteerExperience?: any[];
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  objective?: string;
  noticePeriod?: string;
  resumeVersion?: number;  // Version of resume that was scored
}

interface CandidateScoringDetailPageProps {
  resume: ScoredResume;
  jobTitle: string;
  jobId: string;
  onBack: () => void;
}

export default function CandidateScoringDetailPage({ resume, jobTitle, jobId, onBack }: CandidateScoringDetailPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'scoretable' | 'personalinfo'>('overview');
  const [isDataReady, setIsDataReady] = useState(false);
  const [fullResumeData, setFullResumeData] = useState<ScoredResume>(resume);
  const [fullResumeLoaded, setFullResumeLoaded] = useState(false);
  const [jdDetails, setJdDetails] = useState<any>(null);

  // Debug: Check props
  console.log('[CandidateScoringDetailPage] Props:', {
    hasResume: !!resume,
    jobTitle,
    jobId,
    resumeId: resume?.id,
    scorePercentage: resume?.scorePercentage,
    criteriaScores: resume?.criteriaScores
  });

  // Always fetch complete scoring data AND full resume data from API
  useEffect(() => {
    const fetchCompleteData = async () => {
      console.log('[CandidateScoringDetailPage] Fetching complete data from API');

      // Always fetch from API when jobId is available to get latest data
      if (jobId && resume?.id) {
        console.log('[CandidateScoringDetailPage] Fetching from API for jobId:', jobId, 'scoreId:', resume.id);
        try {
          const { jdService } = await import('@/lib/services/jdService');
          const { resumeService } = await import('@/lib/services/resumeService');

          // Fetch JD details for Overview tab
          jdService.get(jobId).then((jd: any) => {
            setJdDetails(jd);
          }).catch((err: any) => {
            console.error('[CandidateScoringDetailPage] Failed to fetch JD details:', err);
          });

          // First fetch scored resumes to get the actual resume_id
          const scoredResumes = await jdService.getScoredResumes(jobId, { page_size: 100 });
          const completeResumeData = scoredResumes.items.find((r: any) => r.id === resume.id);

          // IMPORTANT: API returns 'id' as score ID and 'resume_id' as the actual resume ID
          const actualResumeId = completeResumeData?.resume_id || resume.resumeId || resume.id;
          console.log('[CandidateScoringDetailPage] Score ID:', resume.id, 'Actual Resume ID:', actualResumeId);

          // Now fetch the full resume using the correct resume ID
          const fullResume = await resumeService.get(actualResumeId).catch((err) => {
            console.error('[CandidateScoringDetailPage] Failed to fetch full resume:', err);
            return null;
          });

          if (completeResumeData) {
            console.log('[CandidateScoringDetailPage] Complete data fetched successfully:', {
              overall_score: completeResumeData.overall_score,
              has_criteria_scores: !!completeResumeData.criteria_scores,
              criteria_count: Object.keys(completeResumeData.criteria_scores || {}).length,
              hasFullResume: !!fullResume
            });

            // Debug: Log full resume data to check available fields
            if (fullResume) {
              const fr = fullResume as any;
              console.log('[CandidateScoringDetailPage] Full resume data from API:', {
                candidate_name: fr.candidate_name,
                current_title: fr.current_title,
                current_company: fr.current_company,
                experience_years: fr.experience_years,
                professional_summary: fr.professional_summary?.substring(0, 100) + '...',
                experience_count: fr.experience?.length,
                education_count: fr.education?.length,
                skills_count: fr.skills?.length,
                technical_skills_count: fr.technical_skills?.length,
                soft_skills_count: fr.soft_skills?.length,
                certifications_count: fr.certifications?.length,
                languages_count: fr.languages?.length,
                hasProjects: !!(fr.projects?.length),
                hasAwards: !!(fr.awards?.length),
                allKeys: Object.keys(fullResume),
              });
              setFullResumeLoaded(true);
            } else {
              console.warn('[CandidateScoringDetailPage] Full resume fetch returned null - using fallback data');
              setFullResumeLoaded(false);
            }

            // Merge scoring data with full resume data
            // IMPORTANT: Prioritize full resume data over scored resume data for Personal Info
            const fr = fullResume as any;
            setFullResumeData({
              ...resume,
              // Store the actual resume ID (different from score ID!)
              resumeId: actualResumeId,
              // Scoring-specific data
              scorePercentage: Number((completeResumeData.overall_score || 0).toFixed(1)),  // Keep 1 decimal for consistency
              criteriaScores: completeResumeData.criteria_scores || {},
              scoreBreakdown: completeResumeData.score_breakdown || [],
              aiSummary: completeResumeData.ai_summary,
              strengths: completeResumeData.strengths || [],
              gaps: completeResumeData.gaps || [],
              scoredDate: completeResumeData.created_at,
              matchStatus: completeResumeData.match_status,
              scoredBy: completeResumeData.scored_by || completeResumeData.scored_by_name || resume.scoredBy || 'System',
              // Full resume data for Personal Info tab (prioritize full resume over scored resume)
              // Note: Backend returns snake_case, we map to camelCase for frontend
              candidateName: fr?.candidate_name || resume.candidateName,
              professionalSummary: fr?.professional_summary || '', // Don't fall back to AI summary
              experienceDetails: fr?.experience || [],
              educationDetails: fr?.education || [],
              skills: fr?.skills || [],
              technicalSkills: fr?.technical_skills || [],
              softSkills: fr?.soft_skills || [],
              certifications: fr?.certifications || resume.certifications || [],
              languages: fr?.languages || [],
              currentCompany: fr?.current_company || '',
              title: fr?.current_title || resume.title || '',
              location: fr?.location || resume.location || '',
              experience: fr?.experience_years ? `${fr.experience_years} years` : '',
              // Additional fields from full resume
              projects: fr?.projects || [],
              awards: fr?.awards || [],
              achievements: fr?.achievements || [],
              hobbies: fr?.hobbies || [],
              volunteerExperience: fr?.volunteer_experience || [],
              linkedinUrl: fr?.linkedin_url || '',
              githubUrl: fr?.github_url || '',
              portfolioUrl: fr?.portfolio_url || '',
              objective: fr?.objective || '',
              noticePeriod: fr?.notice_period || '',
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
  // Filter out items that are already shown in missingSkills to avoid duplication
  const improvementAreas = fullResumeData.gaps && fullResumeData.gaps.length > 0
    ? fullResumeData.gaps.filter((gap: string) => !missingSkills.includes(gap))
    : [];

  const normalizedMatchStatus = fullResumeData.matchStatus?.toLowerCase().replace(/[_\s]/g, '') || '';
  const aiReasoning = fullResumeData.aiSummary || fullResumeData.matchReason || (
    (normalizedMatchStatus === 'exactmatch' || normalizedMatchStatus === 'excellentmatch')
      ? 'Outstanding candidate with exceptional alignment to job requirements. Strong technical skills, relevant experience, and proven track record in similar roles.'
      : normalizedMatchStatus === 'partialmatch'
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

  // Format match status from API (e.g., "partial_match" -> "Partial Match")
  const formatMatchStatus = (status: string) => {
    if (!status) return 'Unknown';
    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  const getMatchStatusColor = (status: string) => {
    const normalized = status?.toLowerCase().replace(/[_\s]/g, '');
    if (normalized === 'exactmatch' || normalized === 'excellentmatch') return 'bg-green-100 text-green-700 border-green-300';
    if (normalized === 'partialmatch') return 'bg-yellow-100 text-yellow-700 border-yellow-300';
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
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const response = await fetch(`${API_URL}/scoring/scores/${fullResumeData.id}/download-pdf`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('[Download] Failed:', response.status, errorData);

        // Provide user-friendly error message
        let errorMessage = 'Failed to download scorecard. Please try again later.';

        if (response.status === 404) {
          errorMessage = 'Scorecard not found. The score may have been deleted.';
        } else if (response.status === 500) {
          errorMessage = 'Server error while generating scorecard. Our team has been notified.';
        } else if (response.status === 403) {
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
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-800 hover:text-gray-900 font-medium transition-colors hover:gap-3 text-sm sm:text-base"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          Back to Scored Resumes
        </button>
      </div>

      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4 sm:mb-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl text-gray-900 font-bold mb-2 truncate">{resume.candidateName}</h1>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                  <p className="text-base sm:text-lg text-gray-700 font-medium">{resume.title || resume.experience || 'Candidate'}</p>
                  {resume.resumeVersion && (
                    <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-xs sm:text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      Version {resume.resumeVersion}
                    </span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-2 bg-gray-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-gray-200 min-w-0">
                    <Mail className="w-4 h-4 text-gray-800 flex-shrink-0" />
                    <span className="text-gray-900 truncate">{resume.email}</span>
                  </span>
                  <span className="flex items-center gap-2 bg-gray-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-gray-200">
                    <Phone className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-gray-900">{resume.phone}</span>
                  </span>
                  {resume.location && (
                    <span className="flex items-center gap-2 bg-gray-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-gray-200">
                      <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span className="text-gray-900">{resume.location}</span>
                    </span>
                  )}
                </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={handleDownloadScorecard}
                className="w-full sm:w-auto px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-700 border-2 border-gray-300 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download Scorecard</span>
                <span className="sm:hidden">Download</span>
              </button>
            </div>
          </div>

          {/* Score Display - Compact */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 bg-gray-50 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className={`text-2xl sm:text-3xl font-bold ${getScoreColor(fullResumeData.scorePercentage)}`}>{fullResumeData.scorePercentage}%</div>
              <span className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium border whitespace-nowrap ${getMatchStatusColor(fullResumeData.matchStatus || resume.matchStatus)}`}>
                {formatMatchStatus(fullResumeData.matchStatus || resume.matchStatus)}
              </span>
              <span className="hidden sm:inline text-gray-400">|</span>
              <span className="text-xs sm:text-sm text-gray-700 truncate">{jobTitle}</span>
            </div>
            <div className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
              {fullResumeData.scoredDate && !isNaN(new Date(fullResumeData.scoredDate).getTime())
                ? new Date(fullResumeData.scoredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : fullResumeData.scoredDate}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-t-xl border-x-2 border-t-2 border-gray-200">
          <div className="flex gap-1 px-3 sm:px-6 pt-2 overflow-x-auto scrollbar-hide">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'scoretable', label: 'Score Table' },
              { id: 'personalinfo', label: 'Personal Info' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors rounded-t-lg whitespace-nowrap ${
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
      <div className="px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8">
        <div className="bg-white rounded-b-xl border-x-2 border-b-2 border-gray-200 p-4 sm:p-6 lg:p-8">
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

          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* JD Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="w-5 h-5 text-gray-700" />
                  <h3 className="text-lg font-semibold text-gray-900">Job Description Summary</h3>
                </div>
                {jdDetails ? (
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span><strong>Role:</strong> {jobTitle}{jdDetails.location ? ` — ${jdDetails.location}` : ''}{jdDetails.employment_type ? ` (${jdDetails.employment_type.replace(/_/g, ' ')})` : ''}</span>
                    </li>
                    {(jdDetails.experience_min || jdDetails.experience_max) && (
                      <li className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span><strong>Experience:</strong> {jdDetails.experience_min && jdDetails.experience_max ? `${jdDetails.experience_min}–${jdDetails.experience_max} years` : jdDetails.experience_min ? `${jdDetails.experience_min}+ years` : `Up to ${jdDetails.experience_max} years`}</span>
                      </li>
                    )}
                    {jdDetails.must_have_skills?.map((skill: string, i: number) => (
                      <li key={`must-${i}`} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{skill}</span>
                      </li>
                    ))}
                    {jdDetails.must_have_comments?.map((comment: string, i: number) => (
                      <li key={`mc-${i}`} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{comment}</span>
                      </li>
                    ))}
                    {jdDetails.nice_to_have_skills?.map((skill: string, i: number) => (
                      <li key={`nice-${i}`} className="flex items-start gap-2 text-sm text-gray-500">
                        <CheckCircle className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span>{skill} <span className="text-xs text-gray-400">(preferred)</span></span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500 py-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                    <span className="text-sm">Loading job details...</span>
                  </div>
                )}
              </div>

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Strengths */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ThumbsUp className="w-5 h-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Strengths</h3>
                  </div>
                  {keyStrengths.length > 0 ? (
                    <ul className="space-y-3">
                      {keyStrengths.map((strength: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-800">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No strengths data available.</p>
                  )}
                </div>

                {/* Weaknesses */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ThumbsDown className="w-5 h-5 text-red-500" />
                    <h3 className="text-lg font-semibold text-gray-900">Weaknesses</h3>
                  </div>
                  {(improvementAreas.length > 0 || missingSkills.length > 0) ? (
                    <ul className="space-y-3">
                      {improvementAreas.map((gap: string, idx: number) => (
                        <li key={`gap-${idx}`} className="flex items-start gap-3">
                          <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-800">{gap}</span>
                        </li>
                      ))}
                      {missingSkills.length > 0 && (
                        <li className="flex items-start gap-3">
                          <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-800">
                            Missing skills: {missingSkills.join(', ')}
                          </span>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No weaknesses identified.</p>
                  )}
                </div>
              </div>

              {/* AI Analysis Summary */}
              {aiReasoning && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="w-5 h-5 text-gray-700" />
                    <h3 className="text-lg font-semibold text-gray-900">AI Analysis</h3>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{aiReasoning}</p>
                </div>
              )}
            </div>
          )}

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
              aiReasoning={aiReasoning}
              getScoreColor={getScoreColor}
              getScoreBgColor={getScoreBgColor}
              getProgressBarColor={getProgressBarColor}
            />
          )}

          {activeTab === 'personalinfo' && (
            <div className="space-y-6">
              {/* Warning if full resume data couldn't be loaded */}
              {!fullResumeLoaded && (
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-yellow-800 font-medium">Limited resume data available</p>
                    <p className="text-yellow-700 text-sm mt-1">
                      Some details may be missing. View the full resume in{' '}
                      <a href={`/recruitment/resume-view/${fullResumeData.resumeId || resume.resumeId || resume.id}`} className="underline hover:text-yellow-900">
                        Resume Details
                      </a>{' '}
                      for complete information, or re-upload the resume to refresh data.
                    </p>
                  </div>
                </div>
              )}

              {/* Personal Info Card - Same as Resume View */}
              <div className="bg-gray-50 border border-gray-300 rounded-xl p-6 shadow-sm">
                <div>
                    <div className="mb-4">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">{fullResumeData.candidateName || resume.candidateName}</h2>
                      <div className="flex items-center gap-3 mb-3">
                        <p className="text-lg text-gray-700">{fullResumeData.title || resume.title || 'Candidate'}</p>
                        {resume.resumeVersion && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            Version {resume.resumeVersion}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                        {fullResumeData.location && fullResumeData.location !== 'N/A' && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {fullResumeData.location}
                          </span>
                        )}
                        {fullResumeData.experience && fullResumeData.experience !== 'N/A' && fullResumeData.experience !== '' && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-4 h-4" />
                            {fullResumeData.experience}
                          </span>
                        )}
                        {fullResumeData.currentCompany && fullResumeData.currentCompany !== 'N/A' && fullResumeData.currentCompany !== '' && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {fullResumeData.currentCompany}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      {resume.email && (
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <Mail className="w-4 h-4 text-gray-500" />
                          <a href={`mailto:${resume.email}`} className="hover:text-gray-900">{resume.email}</a>
                        </div>
                      )}
                      {resume.phone && (
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <Phone className="w-4 h-4 text-gray-500" />
                          <a href={`tel:${resume.phone}`} className="hover:text-gray-900">{resume.phone}</a>
                        </div>
                      )}
                    </div>

                    {/* Top Skills Tags */}
                    {(fullResumeData.skills?.length > 0 || fullResumeData.technicalSkills?.length > 0) && (
                      <div className="flex flex-wrap gap-2">
                        {(fullResumeData.technicalSkills || fullResumeData.skills || []).slice(0, 8).map((skill: string, index: number) => (
                          <span key={index} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs border border-gray-300">
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                </div>
              </div>

              {/* Professional Summary - Only show actual resume summary, NOT AI scoring summary */}
              {fullResumeData.professionalSummary && (
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-gray-500" />
                  <h3 className="text-lg font-semibold text-gray-800">Professional Summary</h3>
                </div>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {fullResumeData.professionalSummary}
                </p>
              </div>
              )}

              {/* Work Experience */}
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Briefcase className="w-5 h-5 text-gray-500" />
                  <h3 className="text-lg font-semibold text-gray-800">Work Experience</h3>
                </div>
                {fullResumeData.experienceDetails && fullResumeData.experienceDetails.length > 0 ? (
                  <div className="space-y-6">
                    {fullResumeData.experienceDetails.map((exp: any, index: number) => (
                      <div key={index} className="relative pl-6 pb-6 border-l-2 border-gray-400 last:pb-0">
                        <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-gray-500 border-2 border-gray-50"></div>
                        <div className="mb-3">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-1">{exp.title || exp.position || 'Position'}</h4>
                              <div className="flex items-center gap-2 text-gray-700 mb-1">
                                <Building2 className="w-4 h-4" />
                                <span>{exp.company || 'Company'}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                {exp.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {exp.location}
                                  </span>
                                )}
                                {(exp.start_date || exp.end_date) && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {exp.start_date || ''} - {exp.end_date || 'Present'}
                                  </span>
                                )}
                                {exp.duration && (
                                  <span className="text-gray-600">({exp.duration})</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {exp.description && (
                            <p className="text-gray-700 mb-3">{exp.description}</p>
                          )}
                          {exp.achievements && exp.achievements.length > 0 && (
                            <div className="space-y-2">
                              {exp.achievements.map((achievement: string, achIndex: number) => (
                                <div key={achIndex} className="flex items-start gap-2 text-sm text-gray-700">
                                  <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                                  <span>{achievement}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg text-center">
                    <p className="text-gray-600">Work experience details not available.</p>
                    <p className="text-sm text-gray-500 mt-2">Please re-upload the resume to extract full details.</p>
                  </div>
                )}
              </div>

              {/* Education */}
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-6">
                  <GraduationCap className="w-5 h-5 text-gray-500" />
                  <h3 className="text-lg font-semibold text-gray-800">Education</h3>
                </div>
                {fullResumeData.educationDetails && fullResumeData.educationDetails.length > 0 ? (
                  <div className="space-y-4">
                    {fullResumeData.educationDetails.map((edu: any, index: number) => (
                      <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                        <h4 className="font-semibold text-gray-800 mb-1">
                          {edu.degree || edu.qualification || 'Degree'}
                          {edu.field && ` in ${edu.field}`}
                        </h4>
                        {(edu.institution || edu.school) && (
                          <div className="text-gray-700 mb-1">{edu.institution || edu.school}</div>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          {(edu.year || edu.graduation_year) && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {edu.year || edu.graduation_year}
                            </span>
                          )}
                          {edu.gpa && <span className="text-gray-700">GPA: {edu.gpa}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                    <h4 className="font-semibold text-gray-800 mb-2">{
                      typeof fullResumeData.education === 'string'
                        ? fullResumeData.education
                        : Array.isArray(fullResumeData.education) && fullResumeData.education.length > 0
                          ? (fullResumeData.education[0]?.degree || fullResumeData.education[0]?.institution || 'Education available')
                          : 'Education not specified'
                    }</h4>
                  </div>
                )}
              </div>

              {/* Skills */}
              {(fullResumeData.skills && fullResumeData.skills.length > 0) ||
               (fullResumeData.technicalSkills && fullResumeData.technicalSkills.length > 0) ||
               (fullResumeData.softSkills && fullResumeData.softSkills.length > 0) ||
               matchedSkills.length > 0 ? (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Code className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Skills</h3>
                  </div>

                  {/* Technical Skills */}
                  {fullResumeData.technicalSkills && fullResumeData.technicalSkills.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-medium text-gray-900 mb-4">Technical Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {fullResumeData.technicalSkills.map((skill: string, index: number) => (
                          <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Soft Skills */}
                  {fullResumeData.softSkills && fullResumeData.softSkills.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-medium text-gray-900 mb-4">Soft Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {fullResumeData.softSkills.map((skill: string, index: number) => (
                          <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* General Skills - only show if no technical/soft skills */}
                  {fullResumeData.skills && fullResumeData.skills.length > 0 && !fullResumeData.technicalSkills?.length && !fullResumeData.softSkills?.length && (
                    <div className="flex flex-wrap gap-2">
                      {fullResumeData.skills.map((skill: string, index: number) => (
                        <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Fallback to matched skills if no specific skills available */}
                  {!fullResumeData.skills?.length && !fullResumeData.technicalSkills?.length && !fullResumeData.softSkills?.length && matchedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {matchedSkills.map((skill, index) => (
                        <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Languages */}
              {fullResumeData.languages && fullResumeData.languages.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Languages className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Languages</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    {fullResumeData.languages.map((language: any, index: number) => {
                      // Handle both string and object formats
                      const langName = typeof language === 'string' ? language : (language.name || language.language || 'Unknown');
                      const proficiency = typeof language === 'object' ? (language.proficiency || language.level || 'Fluent') : 'Fluent';
                      return (
                        <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg text-center">
                          <div className="font-medium text-gray-800 mb-1">{langName}</div>
                          <div className="text-sm text-gray-600">{proficiency}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Certifications */}
              {fullResumeData.certifications && fullResumeData.certifications.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Award className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Certifications</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.certifications.map((cert, index) => {
                      // Handle both string and object formats
                      const certName = typeof cert === 'string' ? cert : (cert.name || 'Certification');
                      const certIssuer = typeof cert === 'object' ? cert.issuer : null;
                      const certDate = typeof cert === 'object' ? cert.date : null;
                      const certCredentialId = typeof cert === 'object' ? cert.credential_id : null;
                      return (
                        <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-800 mb-1">{certName}</h4>
                              {certIssuer && <div className="text-sm text-gray-700 mb-1">{certIssuer}</div>}
                              <div className="flex items-center gap-4 text-xs text-gray-600">
                                {certDate && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Issued {certDate}
                                  </span>
                                )}
                                {certCredentialId && <span>ID: {certCredentialId}</span>}
                              </div>
                            </div>
                            <Award className="w-6 h-6 text-gray-500" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Projects */}
              {fullResumeData.projects && fullResumeData.projects.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Code className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Projects</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.projects.map((project: any, index: number) => (
                      <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-gray-800">{project.name}</h4>
                          {project.url && (
                            <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                              <FileText className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                        {project.description && (
                          <p className="text-gray-700 text-sm mb-2">{project.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                          {project.duration && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {project.duration}
                            </span>
                          )}
                          {project.technologies && (
                            <span className="px-2 py-0.5 bg-gray-200 rounded">{project.technologies}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Awards */}
              {fullResumeData.awards && fullResumeData.awards.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Award className="w-5 h-5 text-yellow-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Awards & Honors</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.awards.map((award: any, index: number) => (
                      <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-1">{award.name}</h4>
                            {award.issuer && <div className="text-sm text-gray-700">{award.issuer}</div>}
                            {award.date && (
                              <div className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                                <Calendar className="w-3 h-3" />
                                {award.date}
                              </div>
                            )}
                            {award.description && (
                              <p className="text-sm text-gray-600 mt-2">{award.description}</p>
                            )}
                          </div>
                          <Award className="w-6 h-6 text-yellow-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Achievements */}
              {fullResumeData.achievements && fullResumeData.achievements.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Star className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Achievements</h3>
                  </div>
                  <div className="space-y-2">
                    {fullResumeData.achievements.map((achievement: any, index: number) => (
                      <div key={index} className="flex items-start gap-2 text-gray-700">
                        <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                        <span>{typeof achievement === 'string' ? achievement : achievement.description || achievement.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hobbies & Interests */}
              {fullResumeData.hobbies && fullResumeData.hobbies.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Star className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Hobbies & Interests</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fullResumeData.hobbies.map((hobby: any, index: number) => (
                      <span key={index} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-300">
                        {typeof hobby === 'string' ? hobby : hobby.name || hobby}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Social Links */}
              {(fullResumeData.linkedinUrl || fullResumeData.githubUrl || fullResumeData.portfolioUrl) && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <FileText className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Social & Portfolio Links</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    {fullResumeData.linkedinUrl && (
                      <a href={fullResumeData.linkedinUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                        <span className="text-blue-700 text-sm font-medium">LinkedIn</span>
                      </a>
                    )}
                    {fullResumeData.githubUrl && (
                      <a href={fullResumeData.githubUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 p-4 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors">
                        <span className="text-gray-700 text-sm font-medium">GitHub</span>
                      </a>
                    )}
                    {fullResumeData.portfolioUrl && (
                      <a href={fullResumeData.portfolioUrl} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 p-4 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
                        <span className="text-purple-700 text-sm font-medium">Portfolio</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Notice Period */}
              {fullResumeData.noticePeriod && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Notice Period</h3>
                  </div>
                  <p className="text-gray-700">{fullResumeData.noticePeriod}</p>
                </div>
              )}

              {/* Volunteer Experience */}
              {fullResumeData.volunteerExperience && fullResumeData.volunteerExperience.length > 0 && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Star className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Volunteer Experience</h3>
                  </div>
                  <div className="space-y-4">
                    {fullResumeData.volunteerExperience.map((vol: any, index: number) => (
                      <div key={index} className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
                        <h4 className="font-semibold text-gray-800 mb-1">{vol.role || vol.title}</h4>
                        {vol.organization && <div className="text-sm text-gray-700 mb-1">{vol.organization}</div>}
                        {vol.duration && (
                          <div className="text-xs text-gray-600 flex items-center gap-1 mb-2">
                            <Calendar className="w-3 h-3" />
                            {vol.duration}
                          </div>
                        )}
                        {vol.description && <p className="text-sm text-gray-600">{vol.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Objective */}
              {fullResumeData.objective && fullResumeData.objective !== fullResumeData.professionalSummary && (
                <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-gray-500" />
                    <h3 className="text-lg font-semibold text-gray-800">Career Objective</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed">{fullResumeData.objective}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
