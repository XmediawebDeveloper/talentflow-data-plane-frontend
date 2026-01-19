"use client";

import { CheckCircle2, Loader2, XCircle, Target, TrendingUp, Clock, AlertCircle, RefreshCw, History, Minus } from 'lucide-react';
import { useState, useEffect, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { scoringService } from '@/lib/services';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';

interface AttemptHistory {
  attemptNumber: number;
  timestamp: Date;
  status: 'Success' | 'Failed';
  errorReason?: string;
  score?: number;
}

interface ScoreBreakdownItem {
  category: string;
  score: number;
  reasoning: string;
}

interface ScoringResume {
  id: string;
  name: string;
  status: 'pending' | 'scoring' | 'completed' | 'error';
  score?: number;
  errorReason?: string;
  attemptHistory?: AttemptHistory[];
  currentAttempt?: number;
  aiSummary?: string;
  strengths?: string[];
  gaps?: string[];
  scoreBreakdown?: ScoreBreakdownItem[];
  essentialScore?: number;
  nonEssentialScore?: number;
  // Candidate info from API
  candidateName?: string;
  candidateEmail?: string;
  phone?: string;
  // Additional resume details
  title?: string;
  currentCompany?: string;
  location?: string;
  experience?: string;
  education?: string;
  skills?: string[];
  // Extended resume data
  professionalSummary?: string;
  technicalSkills?: string[];
  softSkills?: string[];
  educationDetails?: any[];
  experienceDetails?: any[];
  languages?: string[];
  certifications?: string[];
}

interface ResumeScoringStatusPanelProps {
  resumes: Array<{
    id: string;
    name: string;
    candidateName?: string;
    candidateEmail?: string;
    phone?: string;
  }>;
  onComplete: (scoredResumes: any[]) => void;
  jobTitle: string;
  jobId: string;
  onMinimize?: () => void;
}

// Storage key for scoring batch persistence
const SCORING_BATCH_STORAGE_KEY = 'talentflow_scoring_batch';

interface StoredScoringBatch {
  jobId: string;
  jobTitle: string;
  startTime: number;
  resumeIds: string[];
  status: 'in_progress' | 'completed';
}

export default function ResumeScoringStatusPanel({
  resumes,
  onComplete,
  jobTitle,
  jobId,
  onMinimize
}: ResumeScoringStatusPanelProps) {
  const router = useRouter();
  const [scoringResumes, setScoringResumes] = useState<ScoringResume[]>(
    resumes.map(r => ({
      ...r,
      status: 'pending' as const,
      currentAttempt: 1,
      attemptHistory: []
    }))
  );

  // Initialize startTime from localStorage or create new one (persists across minimize/maximize)
  const [startTime] = useState(() => {
    try {
      const storedBatch = localStorage.getItem(SCORING_BATCH_STORAGE_KEY);
      if (storedBatch) {
        const parsed: StoredScoringBatch = JSON.parse(storedBatch);
        // Only use stored time if it's for the same job and still in progress
        if (parsed.jobId === jobId && parsed.status === 'in_progress') {
          console.log('[Scoring] Restored start time from localStorage:', parsed.startTime);
          return parsed.startTime;
        }
      }
    } catch (e) {
      console.error('[Scoring] Error reading from localStorage:', e);
    }
    // Create new start time and store it
    const newStartTime = Date.now();
    try {
      const batchData: StoredScoringBatch = {
        jobId,
        jobTitle,
        startTime: newStartTime,
        resumeIds: resumes.map(r => r.id),
        status: 'in_progress'
      };
      localStorage.setItem(SCORING_BATCH_STORAGE_KEY, JSON.stringify(batchData));
      console.log('[Scoring] Stored new start time in localStorage:', newStartTime);
    } catch (e) {
      console.error('[Scoring] Error writing to localStorage:', e);
    }
    return newStartTime;
  });
  const [elapsedTime, setElapsedTime] = useState(() => {
    // Calculate initial elapsed time based on stored start time
    return Math.floor((Date.now() - startTime) / 1000);
  });
  const [selectedForRetry, setSelectedForRetry] = useState<string[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Process resumes with real API calls
  useEffect(() => {
    if (processingRef.current) return;

    const processResumes = async () => {
      processingRef.current = true;
      setIsProcessing(true);

      // Get pending resumes
      const pendingResumes = scoringResumes.filter(r => r.status === 'pending');

      for (const resume of pendingResumes) {
        // Update to scoring status
        setScoringResumes(prev => prev.map((r) =>
          r.id === resume.id ? { ...r, status: 'scoring' as const } : r
        ));

        try {
          // Call the actual API
          console.log(`[Scoring] Scoring resume ${resume.id} against job ${jobId}`);
          const result = await scoringService.scoreResume(jobId, resume.id);
          console.log(`[Scoring] Result for ${resume.name}:`, result);
          console.log(`[Scoring] Personal Info - professionalSummary:`, result.professional_summary);
          console.log(`[Scoring] Personal Info - technicalSkills:`, result.technical_skills);
          console.log(`[Scoring] Personal Info - educationDetails:`, result.education_details);
          console.log(`[Scoring] Personal Info - experienceDetails:`, result.experience_details);
          console.log(`[Scoring] Personal Info - languages:`, result.languages);

          // Success - create attempt history
          const newAttempt: AttemptHistory = {
            attemptNumber: resume.currentAttempt || 1,
            timestamp: new Date(),
            status: 'Success',
            score: result.overall_score,
          };

          // Update with real score and breakdown from API
          setScoringResumes(prev => prev.map((r) =>
            r.id === resume.id ? {
              ...r,
              status: 'completed' as const,
              score: result.overall_score,
              aiSummary: result.ai_summary,
              strengths: result.strengths,
              gaps: result.gaps,
              scoreBreakdown: result.score_breakdown,
              criteriaScores: result.criteria_scores,
              essentialScore: result.essential_score,
              nonEssentialScore: result.non_essential_score,
              // Capture candidate info from API response
              candidateName: result.candidate_name,
              candidateEmail: result.candidate_email,
              phone: result.phone,
              // Additional resume details
              title: result.current_title,
              currentCompany: result.current_company,
              location: result.location,
              experience: result.experience_years ? `${result.experience_years} years` : undefined,
              education: result.education?.[0]?.degree || (typeof result.education === 'string' ? result.education : undefined),
              skills: result.skills,
              // Extended resume data
              professionalSummary: result.professional_summary,
              technicalSkills: result.technical_skills,
              softSkills: result.soft_skills,
              educationDetails: result.education_details || result.education,
              experienceDetails: result.experience_details || result.experience,
              languages: result.languages,
              certifications: result.certifications,
              attemptHistory: [...(r.attemptHistory || []), newAttempt],
            } : r
          ));
        } catch (error: any) {
          console.error(`[Scoring] Error scoring ${resume.name}:`, error);

          // Check if this is a quota error first
          const isQuotaError = error?.response?.data?.detail &&
            typeof error.response.data.detail === 'object' &&
            (error.response.data.detail.error === 'QUOTA_EXHAUSTED' ||
             error.response.data.detail.error === 'QUOTA_INSUFFICIENT');

          if (isQuotaError) {
            // Handle quota error with UI prompts
            handleQuotaError(error, router, 'Resume scoring quota exceeded');
            // Don't continue processing other resumes
            break;
          }

          // Check if this is a duplicate score error
          let errorReason = error.message || 'Failed to score resume';

          // Detect duplicate key violation error
          if (errorReason.includes('duplicate key') ||
              errorReason.includes('already exists') ||
              errorReason.includes('UniqueViolationError') ||
              errorReason.includes('resume_scores_resume_id_job_description_id_key')) {
            errorReason = 'This resume has already been scored for this job. Please view the existing score instead.';
          }

          // Failed - create attempt history
          const newAttempt: AttemptHistory = {
            attemptNumber: resume.currentAttempt || 1,
            timestamp: new Date(),
            status: 'Failed',
            errorReason,
          };

          // Mark as error
          setScoringResumes(prev => prev.map((r) =>
            r.id === resume.id ? {
              ...r,
              status: 'error' as const,
              errorReason,
              attemptHistory: [...(r.attemptHistory || []), newAttempt],
            } : r
          ));
        }

        // Small delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setIsProcessing(false);
      processingRef.current = false;
    };

    processResumes();
  }, [jobId, scoringResumes]);

  // Check if all processing is complete
  useEffect(() => {
    const pendingCount = scoringResumes.filter(r => r.status === 'pending').length;
    const scoringCount = scoringResumes.filter(r => r.status === 'scoring').length;
    const errorCount = scoringResumes.filter(r => r.status === 'error').length;
    const completedCount = scoringResumes.filter(r => r.status === 'completed').length;

    // If no pending/scoring and we have results, check if we should complete
    if (pendingCount === 0 && scoringCount === 0 && !isProcessing) {
      // If all completed (no errors), auto-complete immediately
      if (errorCount === 0 && completedCount === resumes.length) {
        console.log('[Scoring] All resumes completed successfully, auto-closing popup immediately');
        console.log('[Scoring] Building final results, scoringResumes:', scoringResumes);
        const scoredResults = scoringResumes.map(resume => {
          console.log('[Scoring] Resume data:', resume.id, 'candidateName:', resume.candidateName, 'candidateEmail:', resume.candidateEmail);
          console.log('[Scoring] Scoring data:', 'score:', resume.score, 'criteriaScores:', resume.criteriaScores);
          console.log('[Scoring] Extended data:', 'professionalSummary:', resume.professionalSummary, 'technicalSkills:', resume.technicalSkills, 'languages:', resume.languages);
          return {
          ...resume,
          matchScore: resume.score || 0,
            skillMatches: resume.strengths?.slice(0, 3) || [],
            matchReason: resume.aiSummary || (
              resume.score && resume.score >= 85
                ? 'Excellent match with strong alignment on key skills and experience requirements.'
                : resume.score && resume.score >= 70
                  ? 'Good match with relevant skills and experience.'
                  : 'Moderate match with some relevant skills.'
            ),
            scoreBreakdown: (() => {
              // Use real breakdown data from API
              const breakdown = resume.scoreBreakdown || [];
              const findScore = (category: string) => {
                const item = breakdown.find(b => b.category.toLowerCase().includes(category.toLowerCase()));
                return item?.score || resume.score || 0;
              };
              return {
                skillsMatch: findScore('skill'),
                experienceMatch: findScore('experience'),
                educationMatch: findScore('education'),
                overallFit: resume.score || 0,
              };
            })(),
            // Raw breakdown with full details from API
            rawBreakdown: resume.scoreBreakdown || [],
            criteriaScores: resume.criteriaScores || {},
            essentialScore: resume.essentialScore,
            nonEssentialScore: resume.nonEssentialScore,
            // Ensure real scoring data is passed
            strengths: resume.strengths || [],
            gaps: resume.gaps || [],
            // Personal info fields
            professionalSummary: resume.professionalSummary,
            technicalSkills: resume.technicalSkills || [],
            softSkills: resume.softSkills || [],
            educationDetails: resume.educationDetails || [],
            experienceDetails: resume.experienceDetails || [],
            languages: resume.languages || [],
            certifications: resume.certifications || [],
          };
        });

        // Clear localStorage since scoring is complete
        try {
          localStorage.removeItem(SCORING_BATCH_STORAGE_KEY);
          console.log('[Scoring] Cleared scoring batch from localStorage');
        } catch (e) {
          console.error('[Scoring] Error clearing localStorage:', e);
        }

        // Auto-close popup immediately when all scoring completes
        onComplete(scoredResults);
      }
    }
  }, [scoringResumes, isProcessing, resumes.length, onComplete]);

  // Retry functionality
  const failedResumes = scoringResumes.filter(r => r.status === 'error');

  const handleRetryIndividual = (resumeId: string) => {
    setScoringResumes(prev => prev.map(item => {
      if (item.id === resumeId && item.status === 'error') {
        return {
          ...item,
          status: 'pending' as const,
          errorReason: undefined,
          currentAttempt: (item.currentAttempt || 1) + 1,
        };
      }
      return item;
    }));
    setSelectedForRetry(prev => prev.filter(id => id !== resumeId));
    processingRef.current = false;
  };

  const handleRetrySelected = () => {
    if (selectedForRetry.length === 0) return;

    setScoringResumes(prev => prev.map(item => {
      if (selectedForRetry.includes(item.id) && item.status === 'error') {
        return {
          ...item,
          status: 'pending' as const,
          errorReason: undefined,
          currentAttempt: (item.currentAttempt || 1) + 1,
        };
      }
      return item;
    }));

    setSelectedForRetry([]);
    processingRef.current = false;
  };

  const handleRetryAllFailed = () => {
    setScoringResumes(prev => prev.map(item => {
      if (item.status === 'error') {
        return {
          ...item,
          status: 'pending' as const,
          errorReason: undefined,
          currentAttempt: (item.currentAttempt || 1) + 1,
        };
      }
      return item;
    }));

    setSelectedForRetry([]);
    processingRef.current = false;
  };

  const toggleRetrySelection = (resumeId: string) => {
    setSelectedForRetry(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  const selectAllFailed = () => {
    if (selectedForRetry.length === failedResumes.length) {
      setSelectedForRetry([]);
    } else {
      setSelectedForRetry(failedResumes.map(r => r.id));
    }
  };

  const handleCompleteWithErrors = () => {
    const scoredResults = scoringResumes.map(resume => ({
      ...resume,
      matchScore: resume.score || 0,
      skillMatches: resume.strengths?.slice(0, 3) || [],
      matchReason: resume.status === 'error'
        ? 'Failed to score - ' + (resume.errorReason || 'Unknown error')
        : resume.aiSummary || (
          resume.score && resume.score >= 85
            ? 'Excellent match with strong alignment on key skills and experience requirements.'
            : resume.score && resume.score >= 70
              ? 'Good match with relevant skills and experience.'
              : 'Moderate match with some relevant skills.'
        ),
      scoreBreakdown: (() => {
        // Use real breakdown data from API
        const breakdown = resume.scoreBreakdown || [];
        const findScore = (category: string) => {
          const item = breakdown.find(b => b.category.toLowerCase().includes(category.toLowerCase()));
          return item?.score || resume.score || 0;
        };
        return {
          skillsMatch: findScore('skill'),
          experienceMatch: findScore('experience'),
          educationMatch: findScore('education'),
          overallFit: resume.score || 0,
        };
      })(),
      // Raw breakdown with full details from API
      rawBreakdown: resume.scoreBreakdown || [],
      essentialScore: resume.essentialScore,
      nonEssentialScore: resume.nonEssentialScore,
      // Ensure real scoring data is passed
      strengths: resume.strengths || [],
      gaps: resume.gaps || [],
    }));

    // Clear localStorage since scoring is complete (even with errors)
    try {
      localStorage.removeItem(SCORING_BATCH_STORAGE_KEY);
      console.log('[Scoring] Cleared scoring batch from localStorage (with errors)');
    } catch (e) {
      console.error('[Scoring] Error clearing localStorage:', e);
    }

    onComplete(scoredResults);
  };

  const completedCount = scoringResumes.filter(r => r.status === 'completed').length;
  const errorCount = scoringResumes.filter(r => r.status === 'error').length;
  const progressPercentage = ((completedCount + errorCount) / resumes.length) * 100;
  const avgScore = scoringResumes.filter(r => r.score).length > 0
    ? Math.round(scoringResumes.reduce((sum, r) => sum + (r.score || 0), 0) / scoringResumes.filter(r => r.score).length)
    : 0;

  const pendingCount = scoringResumes.filter(r => r.status === 'pending').length;
  const scoringCount = scoringResumes.filter(r => r.status === 'scoring').length;
  const remainingResumes = pendingCount + scoringCount;
  const avgTimePerResume = 20;
  const estimatedSecondsRemaining = remainingResumes * avgTimePerResume;
  const estimatedMinutesRemaining = Math.ceil(estimatedSecondsRemaining / 60);

  const getEstimatedTimeDisplay = () => {
    if (remainingResumes === 0) {
      return 'Completing...';
    }

    if (estimatedMinutesRemaining < 1) {
      return `Approx. ${estimatedSecondsRemaining} seconds remaining`;
    } else if (estimatedMinutesRemaining === 1) {
      return 'Approx. 1 minute remaining';
    } else if (estimatedMinutesRemaining <= 5) {
      return `Approx. ${estimatedMinutesRemaining} minutes remaining`;
    } else {
      const minRange = estimatedMinutesRemaining;
      const maxRange = estimatedMinutesRemaining + 2;
      return `Approx. ${minRange}-${maxRange} minutes remaining`;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-gray-800';
    return 'text-yellow-600';
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200" />

      {/* Status Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-200 flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-800 via-gray-700 to-gray-900 px-6 py-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl text-white font-semibold">AI Resume Scoring in Progress</h2>
                <p className="text-sm text-gray-100">Analyzing candidates for: {jobTitle}</p>
              </div>
              {onMinimize && (
                <button
                  onClick={onMinimize}
                  className="mr-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
                  title="Minimize"
                >
                  <Minus className="w-5 h-5 text-white" />
                </button>
              )}
              <div className="text-right">
                <div className="text-2xl text-white font-bold">{completedCount}/{resumes.length}</div>
                <div className="text-xs text-gray-100">Successfully Scored</div>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-white">
                <span className="font-medium">Overall Progress</span>
                <span className="font-semibold">{Math.round(progressPercentage)}%</span>
              </div>
              <div className="h-3 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                <div className="h-full flex">
                  <div
                    className="bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                    style={{ width: `${(completedCount / resumes.length) * 100}%` }}
                  />
                  <div
                    className="bg-red-500 transition-all duration-500"
                    style={{ width: `${(errorCount / resumes.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-50 px-6 py-4 border-b border-gray-200">
            {/* Real-time Update Info Banner */}
            {remainingResumes > 0 && (
              <div className="mb-4 bg-gradient-to-r from-gray-800 to-gray-800 rounded-xl p-4 text-white shadow-lg">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1.5">Real-Time AI Scoring Active</h4>
                    <div className="flex items-center gap-2 text-sm text-gray-50">
                      <Clock className="w-4 h-4 animate-pulse" />
                      <span className="font-medium">{getEstimatedTimeDisplay()}</span>
                      <span className="text-gray-100">
                        ({remainingResumes} {remainingResumes === 1 ? 'resume' : 'resumes'} remaining)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Failed Resumes Alert */}
            {failedResumes.length > 0 && remainingResumes === 0 && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-red-900">
                        {failedResumes.length} {failedResumes.length === 1 ? 'Resume' : 'Resumes'} Failed
                      </h4>
                      <p className="text-sm text-red-700 mt-0.5">
                        {selectedForRetry.length > 0
                          ? `${selectedForRetry.length} selected for retry`
                          : 'Select resumes below to retry or continue with successful results'
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {failedResumes.length > 1 && (
                      <button
                        onClick={selectAllFailed}
                        className="px-3 py-1.5 border-2 border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                      >
                        {selectedForRetry.length === failedResumes.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                    {selectedForRetry.length > 0 && (
                      <button
                        onClick={handleRetrySelected}
                        className="px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry Selected ({selectedForRetry.length})
                      </button>
                    )}
                    <button
                      onClick={handleRetryAllFailed}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry All
                    </button>
                    <button
                      onClick={handleCompleteWithErrors}
                      className="px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Average Score</div>
                    <div className={`text-2xl font-bold ${getScoreColor(avgScore)}`}>
                      {completedCount > 0 ? `${avgScore}%` : '--'}
                    </div>
                  </div>
                  <TrendingUp className="w-8 h-8 text-gray-800 opacity-30" />
                </div>
              </div>

              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Time Elapsed</div>
                    <div className="text-2xl font-bold text-gray-900">{formatTime(elapsedTime)}</div>
                  </div>
                  <Clock className="w-8 h-8 text-gray-800 opacity-30" />
                </div>
              </div>

              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Failed</div>
                    <div className="text-2xl font-bold text-red-600">{errorCount}</div>
                  </div>
                  <XCircle className="w-8 h-8 text-red-600 opacity-30" />
                </div>
              </div>
            </div>
          </div>

          {/* Resume List */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-2">
              {scoringResumes.map((resume, index) => (
                <Fragment key={resume.id}>
                  <div
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-300 ${
                      resume.status === 'completed'
                        ? 'bg-green-50 border-green-300 shadow-sm'
                        : resume.status === 'scoring'
                        ? 'bg-gray-50 border-gray-400 shadow-md scale-[1.02]'
                        : resume.status === 'error'
                        ? `bg-red-50 border-red-300 ${selectedForRetry.includes(resume.id) ? 'ring-2 ring-red-400' : ''}`
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    {/* Checkbox for failed resumes */}
                    {failedResumes.length > 0 && resume.status === 'error' && (
                      <div className="flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={selectedForRetry.includes(resume.id)}
                          onChange={() => toggleRetrySelection(resume.id)}
                          className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-600"
                        />
                      </div>
                    )}

                    {/* Status Icon */}
                    <div className="flex-shrink-0">
                      {resume.status === 'completed' ? (
                        <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                          <CheckCircle2 className="w-6 h-6 text-white" />
                        </div>
                      ) : resume.status === 'scoring' ? (
                        <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center shadow-lg">
                          <Loader2 className="w-6 h-6 text-white animate-spin" />
                        </div>
                      ) : resume.status === 'error' ? (
                        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                          <XCircle className="w-6 h-6 text-white" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-gray-600 font-semibold text-sm">{index + 1}</span>
                        </div>
                      )}
                    </div>

                    {/* Resume Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-gray-900 truncate">{resume.name}</h4>
                        {resume.status === 'scoring' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 text-white rounded-full text-xs font-medium animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Analyzing...
                          </span>
                        )}
                        {resume.currentAttempt && resume.currentAttempt > 1 && (
                          <span className="text-xs text-gray-500 font-medium">
                            (Attempt #{resume.currentAttempt})
                          </span>
                        )}
                        {resume.attemptHistory && resume.attemptHistory.length > 0 && (
                          <button
                            onClick={() => setExpandedHistory(expandedHistory === resume.id ? null : resume.id)}
                            className="text-xs text-gray-800 hover:text-gray-900 flex items-center gap-1 font-medium"
                          >
                            <History className="w-3 h-3" />
                            {resume.attemptHistory.length} {resume.attemptHistory.length === 1 ? 'attempt' : 'attempts'}
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {resume.status === 'completed' && resume.score && (
                          <span>
                            AI Analysis Complete - Score: <span className={`font-semibold ${getScoreColor(resume.score)}`}>{resume.score}%</span>
                          </span>
                        )}
                        {resume.status === 'scoring' && 'Evaluating skills, experience, and job fit...'}
                        {resume.status === 'pending' && 'Waiting in queue...'}
                        {resume.status === 'error' && resume.errorReason && (
                          <div className="flex items-start gap-1 text-red-600">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>{resume.errorReason}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Score Badge or Retry Button */}
                    {resume.status === 'completed' && resume.score && (
                      <div className="flex-shrink-0 text-right animate-in fade-in slide-in-from-right duration-300">
                        <div className={`text-3xl font-bold ${getScoreColor(resume.score)}`}>
                          {resume.score}%
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {resume.score >= 85 ? 'Excellent' : resume.score >= 70 ? 'Good' : 'Moderate'}
                        </div>
                      </div>
                    )}
                    {resume.status === 'error' && (
                      <button
                        onClick={() => handleRetryIndividual(resume.id)}
                        className="flex-shrink-0 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-medium flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </div>

                  {/* Attempt History Expanded */}
                  {expandedHistory === resume.id && resume.attemptHistory && resume.attemptHistory.length > 0 && (
                    <div className="ml-16 mr-4 mb-2 bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <History className="w-4 h-4 text-gray-800" />
                        <h4 className="font-medium text-gray-800">Attempt History</h4>
                      </div>
                      <div className="space-y-2">
                        {resume.attemptHistory.map((attempt) => (
                          <div
                            key={attempt.attemptNumber}
                            className="flex items-start gap-3 bg-white rounded-lg p-3 border border-gray-200"
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              attempt.status === 'Success' ? 'bg-green-100' : 'bg-red-100'
                            }`}>
                              {attempt.status === 'Success' ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-600" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <span className="font-medium text-gray-900">Attempt #{attempt.attemptNumber}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  attempt.status === 'Success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {attempt.status}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600">
                                {attempt.timestamp.toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              {attempt.errorReason && (
                                <div className="flex items-start gap-1 text-xs text-red-600 mt-2">
                                  <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                  <span>{attempt.errorReason}</span>
                                </div>
                              )}
                              {attempt.score && (
                                <div className="text-xs text-gray-700 mt-2">
                                  Score: <span className="font-semibold">{attempt.score}%</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                {remainingResumes > 0 ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-gray-800" />
                    <span>Processing resumes via AI...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>
                      {errorCount > 0
                        ? `Processing complete with ${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`
                        : 'All resumes scored successfully!'
                      }
                    </span>
                  </>
                )}
              </div>
              <div className="text-sm text-gray-500">
                AI-powered resume analysis
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
"use client";

import { CheckCircle2, Loader2, XCircle, Target, TrendingUp, Clock, AlertCircle, RefreshCw, History, Minus } from 'lucide-react';
import { useState, useEffect, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { scoringService } from '@/lib/services';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';

interface AttemptHistory {
  attemptNumber: number;
  timestamp: Date;
  status: 'Success' | 'Failed';
  errorReason?: string;
  score?: number;
}

interface ScoreBreakdownItem {
  category: string;
  score: number;
  reasoning: string;
}

interface ScoringResume {
  id: string;
  name: string;
  status: 'pending' | 'scoring' | 'completed' | 'error';
  score?: number;
  errorReason?: string;
  attemptHistory?: AttemptHistory[];
  currentAttempt?: number;
  aiSummary?: string;
  strengths?: string[];
  gaps?: string[];
  scoreBreakdown?: ScoreBreakdownItem[];
  essentialScore?: number;
  nonEssentialScore?: number;
  // Candidate info from API
  candidateName?: string;
  candidateEmail?: string;
  phone?: string;
  // Additional resume details
  title?: string;
  currentCompany?: string;
  location?: string;
  experience?: string;
  education?: string;
  skills?: string[];
  // Extended resume data
  professionalSummary?: string;
  technicalSkills?: string[];
  softSkills?: string[];
  educationDetails?: any[];
  experienceDetails?: any[];
  languages?: string[];
  certifications?: string[];
}

interface ResumeScoringStatusPanelProps {
  resumes: Array<{
    id: string;
    name: string;
    candidateName?: string;
    candidateEmail?: string;
    phone?: string;
  }>;
  onComplete: (scoredResumes: any[]) => void;
  jobTitle: string;
  jobId: string;
  onMinimize?: () => void;
}

export default function ResumeScoringStatusPanel({
  resumes,
  onComplete,
  jobTitle,
  jobId,
  onMinimize
}: ResumeScoringStatusPanelProps) {
  const router = useRouter();
  const [scoringResumes, setScoringResumes] = useState<ScoringResume[]>(
    resumes.map(r => ({
      ...r,
      status: 'pending' as const,
      currentAttempt: 1,
      attemptHistory: []
    }))
  );
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [selectedForRetry, setSelectedForRetry] = useState<string[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Process resumes with real API calls
  useEffect(() => {
    if (processingRef.current) return;

    const processResumes = async () => {
      processingRef.current = true;
      setIsProcessing(true);

      // Get pending resumes
      const pendingResumes = scoringResumes.filter(r => r.status === 'pending');

      for (const resume of pendingResumes) {
        // Update to scoring status
        setScoringResumes(prev => prev.map((r) =>
          r.id === resume.id ? { ...r, status: 'scoring' as const } : r
        ));

        try {
          // Call the actual API
          console.log(`[Scoring] Scoring resume ${resume.id} against job ${jobId}`);
          const result = await scoringService.scoreResume(jobId, resume.id);
          console.log(`[Scoring] Result for ${resume.name}:`, result);
          console.log(`[Scoring] Personal Info - professionalSummary:`, result.professional_summary);
          console.log(`[Scoring] Personal Info - technicalSkills:`, result.technical_skills);
          console.log(`[Scoring] Personal Info - educationDetails:`, result.education_details);
          console.log(`[Scoring] Personal Info - experienceDetails:`, result.experience_details);
          console.log(`[Scoring] Personal Info - languages:`, result.languages);

          // Success - create attempt history
          const newAttempt: AttemptHistory = {
            attemptNumber: resume.currentAttempt || 1,
            timestamp: new Date(),
            status: 'Success',
            score: result.overall_score,
          };

          // Update with real score and breakdown from API
          setScoringResumes(prev => prev.map((r) =>
            r.id === resume.id ? {
              ...r,
              status: 'completed' as const,
              score: result.overall_score,
              aiSummary: result.ai_summary,
              strengths: result.strengths,
              gaps: result.gaps,
              scoreBreakdown: result.score_breakdown,
              criteriaScores: result.criteria_scores,
              essentialScore: result.essential_score,
              nonEssentialScore: result.non_essential_score,
              // Capture candidate info from API response
              candidateName: result.candidate_name,
              candidateEmail: result.candidate_email,
              phone: result.phone,
              // Additional resume details
              title: result.current_title,
              currentCompany: result.current_company,
              location: result.location,
              experience: result.experience_years ? `${result.experience_years} years` : undefined,
              education: result.education?.[0]?.degree || (typeof result.education === 'string' ? result.education : undefined),
              skills: result.skills,
              // Extended resume data
              professionalSummary: result.professional_summary,
              technicalSkills: result.technical_skills,
              softSkills: result.soft_skills,
              educationDetails: result.education_details || result.education,
              experienceDetails: result.experience_details || result.experience,
              languages: result.languages,
              certifications: result.certifications,
              attemptHistory: [...(r.attemptHistory || []), newAttempt],
            } : r
          ));
        } catch (error: any) {
          console.error(`[Scoring] Error scoring ${resume.name}:`, error);

          // Check if this is a quota error first
          const isQuotaError = error?.response?.data?.detail &&
            typeof error.response.data.detail === 'object' &&
            (error.response.data.detail.error === 'QUOTA_EXHAUSTED' ||
             error.response.data.detail.error === 'QUOTA_INSUFFICIENT');

          if (isQuotaError) {
            // Handle quota error with UI prompts
            handleQuotaError(error, router, 'Resume scoring quota exceeded');
            // Don't continue processing other resumes
            break;
          }

          // Check if this is a duplicate score error
          let errorReason = error.message || 'Failed to score resume';

          // Detect duplicate key violation error
          if (errorReason.includes('duplicate key') ||
              errorReason.includes('already exists') ||
              errorReason.includes('UniqueViolationError') ||
              errorReason.includes('resume_scores_resume_id_job_description_id_key')) {
            errorReason = 'This resume has already been scored for this job. Please view the existing score instead.';
          }

          // Failed - create attempt history
          const newAttempt: AttemptHistory = {
            attemptNumber: resume.currentAttempt || 1,
            timestamp: new Date(),
            status: 'Failed',
            errorReason,
          };

          // Mark as error
          setScoringResumes(prev => prev.map((r) =>
            r.id === resume.id ? {
              ...r,
              status: 'error' as const,
              errorReason,
              attemptHistory: [...(r.attemptHistory || []), newAttempt],
            } : r
          ));
        }

        // Small delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setIsProcessing(false);
      processingRef.current = false;
    };

    processResumes();
  }, [jobId, scoringResumes]);

  // Check if all processing is complete
  useEffect(() => {
    const pendingCount = scoringResumes.filter(r => r.status === 'pending').length;
    const scoringCount = scoringResumes.filter(r => r.status === 'scoring').length;
    const errorCount = scoringResumes.filter(r => r.status === 'error').length;
    const completedCount = scoringResumes.filter(r => r.status === 'completed').length;

    // If no pending/scoring and we have results, check if we should complete
    if (pendingCount === 0 && scoringCount === 0 && !isProcessing) {
      // If all completed (no errors), auto-complete immediately
      if (errorCount === 0 && completedCount === resumes.length) {
        console.log('[Scoring] All resumes completed successfully, auto-closing popup immediately');
        console.log('[Scoring] Building final results, scoringResumes:', scoringResumes);
        const scoredResults = scoringResumes.map(resume => {
          console.log('[Scoring] Resume data:', resume.id, 'candidateName:', resume.candidateName, 'candidateEmail:', resume.candidateEmail);
          console.log('[Scoring] Scoring data:', 'score:', resume.score, 'criteriaScores:', resume.criteriaScores);
          console.log('[Scoring] Extended data:', 'professionalSummary:', resume.professionalSummary, 'technicalSkills:', resume.technicalSkills, 'languages:', resume.languages);
          return {
          ...resume,
          matchScore: resume.score || 0,
            skillMatches: resume.strengths?.slice(0, 3) || [],
            matchReason: resume.aiSummary || (
              resume.score && resume.score >= 85
                ? 'Excellent match with strong alignment on key skills and experience requirements.'
                : resume.score && resume.score >= 70
                  ? 'Good match with relevant skills and experience.'
                  : 'Moderate match with some relevant skills.'
            ),
            scoreBreakdown: (() => {
              // Use real breakdown data from API
              const breakdown = resume.scoreBreakdown || [];
              const findScore = (category: string) => {
                const item = breakdown.find(b => b.category.toLowerCase().includes(category.toLowerCase()));
                return item?.score || resume.score || 0;
              };
              return {
                skillsMatch: findScore('skill'),
                experienceMatch: findScore('experience'),
                educationMatch: findScore('education'),
                overallFit: resume.score || 0,
              };
            })(),
            // Raw breakdown with full details from API
            rawBreakdown: resume.scoreBreakdown || [],
            criteriaScores: resume.criteriaScores || {},
            essentialScore: resume.essentialScore,
            nonEssentialScore: resume.nonEssentialScore,
            // Ensure real scoring data is passed
            strengths: resume.strengths || [],
            gaps: resume.gaps || [],
            // Personal info fields
            professionalSummary: resume.professionalSummary,
            technicalSkills: resume.technicalSkills || [],
            softSkills: resume.softSkills || [],
            educationDetails: resume.educationDetails || [],
            experienceDetails: resume.experienceDetails || [],
            languages: resume.languages || [],
            certifications: resume.certifications || [],
          };
        });

        // Auto-close popup immediately when all scoring completes
        onComplete(scoredResults);
      }
    }
  }, [scoringResumes, isProcessing, resumes.length, onComplete]);

  // Retry functionality
  const failedResumes = scoringResumes.filter(r => r.status === 'error');

  const handleRetryIndividual = (resumeId: string) => {
    setScoringResumes(prev => prev.map(item => {
      if (item.id === resumeId && item.status === 'error') {
        return {
          ...item,
          status: 'pending' as const,
          errorReason: undefined,
          currentAttempt: (item.currentAttempt || 1) + 1,
        };
      }
      return item;
    }));
    setSelectedForRetry(prev => prev.filter(id => id !== resumeId));
    processingRef.current = false;
  };

  const handleRetrySelected = () => {
    if (selectedForRetry.length === 0) return;

    setScoringResumes(prev => prev.map(item => {
      if (selectedForRetry.includes(item.id) && item.status === 'error') {
        return {
          ...item,
          status: 'pending' as const,
          errorReason: undefined,
          currentAttempt: (item.currentAttempt || 1) + 1,
        };
      }
      return item;
    }));

    setSelectedForRetry([]);
    processingRef.current = false;
  };

  const handleRetryAllFailed = () => {
    setScoringResumes(prev => prev.map(item => {
      if (item.status === 'error') {
        return {
          ...item,
          status: 'pending' as const,
          errorReason: undefined,
          currentAttempt: (item.currentAttempt || 1) + 1,
        };
      }
      return item;
    }));

    setSelectedForRetry([]);
    processingRef.current = false;
  };

  const toggleRetrySelection = (resumeId: string) => {
    setSelectedForRetry(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  const selectAllFailed = () => {
    if (selectedForRetry.length === failedResumes.length) {
      setSelectedForRetry([]);
    } else {
      setSelectedForRetry(failedResumes.map(r => r.id));
    }
  };

  const handleCompleteWithErrors = () => {
    const scoredResults = scoringResumes.map(resume => ({
      ...resume,
      matchScore: resume.score || 0,
      skillMatches: resume.strengths?.slice(0, 3) || [],
      matchReason: resume.status === 'error'
        ? 'Failed to score - ' + (resume.errorReason || 'Unknown error')
        : resume.aiSummary || (
          resume.score && resume.score >= 85
            ? 'Excellent match with strong alignment on key skills and experience requirements.'
            : resume.score && resume.score >= 70
              ? 'Good match with relevant skills and experience.'
              : 'Moderate match with some relevant skills.'
        ),
      scoreBreakdown: (() => {
        // Use real breakdown data from API
        const breakdown = resume.scoreBreakdown || [];
        const findScore = (category: string) => {
          const item = breakdown.find(b => b.category.toLowerCase().includes(category.toLowerCase()));
          return item?.score || resume.score || 0;
        };
        return {
          skillsMatch: findScore('skill'),
          experienceMatch: findScore('experience'),
          educationMatch: findScore('education'),
          overallFit: resume.score || 0,
        };
      })(),
      // Raw breakdown with full details from API
      rawBreakdown: resume.scoreBreakdown || [],
      essentialScore: resume.essentialScore,
      nonEssentialScore: resume.nonEssentialScore,
      // Ensure real scoring data is passed
      strengths: resume.strengths || [],
      gaps: resume.gaps || [],
    }));

    onComplete(scoredResults);
  };

  const completedCount = scoringResumes.filter(r => r.status === 'completed').length;
  const errorCount = scoringResumes.filter(r => r.status === 'error').length;
  const progressPercentage = ((completedCount + errorCount) / resumes.length) * 100;
  const avgScore = scoringResumes.filter(r => r.score).length > 0
    ? Math.round(scoringResumes.reduce((sum, r) => sum + (r.score || 0), 0) / scoringResumes.filter(r => r.score).length)
    : 0;

  const pendingCount = scoringResumes.filter(r => r.status === 'pending').length;
  const scoringCount = scoringResumes.filter(r => r.status === 'scoring').length;
  const remainingResumes = pendingCount + scoringCount;
  const avgTimePerResume = 20;
  const estimatedSecondsRemaining = remainingResumes * avgTimePerResume;
  const estimatedMinutesRemaining = Math.ceil(estimatedSecondsRemaining / 60);

  const getEstimatedTimeDisplay = () => {
    if (remainingResumes === 0) {
      return 'Completing...';
    }

    if (estimatedMinutesRemaining < 1) {
      return `Approx. ${estimatedSecondsRemaining} seconds remaining`;
    } else if (estimatedMinutesRemaining === 1) {
      return 'Approx. 1 minute remaining';
    } else if (estimatedMinutesRemaining <= 5) {
      return `Approx. ${estimatedMinutesRemaining} minutes remaining`;
    } else {
      const minRange = estimatedMinutesRemaining;
      const maxRange = estimatedMinutesRemaining + 2;
      return `Approx. ${minRange}-${maxRange} minutes remaining`;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-gray-800';
    return 'text-yellow-600';
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200" />

      {/* Status Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-200 flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-800 via-gray-700 to-gray-900 px-6 py-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl text-white font-semibold">AI Resume Scoring in Progress</h2>
                <p className="text-sm text-gray-100">Analyzing candidates for: {jobTitle}</p>
              </div>
              {onMinimize && (
                <button
                  onClick={onMinimize}
                  className="mr-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
                  title="Minimize"
                >
                  <Minus className="w-5 h-5 text-white" />
                </button>
              )}
              <div className="text-right">
                <div className="text-2xl text-white font-bold">{completedCount}/{resumes.length}</div>
                <div className="text-xs text-gray-100">Successfully Scored</div>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-white">
                <span className="font-medium">Overall Progress</span>
                <span className="font-semibold">{Math.round(progressPercentage)}%</span>
              </div>
              <div className="h-3 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                <div className="h-full flex">
                  <div
                    className="bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                    style={{ width: `${(completedCount / resumes.length) * 100}%` }}
                  />
                  <div
                    className="bg-red-500 transition-all duration-500"
                    style={{ width: `${(errorCount / resumes.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-50 px-6 py-4 border-b border-gray-200">
            {/* Real-time Update Info Banner */}
            {remainingResumes > 0 && (
              <div className="mb-4 bg-gradient-to-r from-gray-800 to-gray-800 rounded-xl p-4 text-white shadow-lg">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1.5">Real-Time AI Scoring Active</h4>
                    <div className="flex items-center gap-2 text-sm text-gray-50">
                      <Clock className="w-4 h-4 animate-pulse" />
                      <span className="font-medium">{getEstimatedTimeDisplay()}</span>
                      <span className="text-gray-100">
                        ({remainingResumes} {remainingResumes === 1 ? 'resume' : 'resumes'} remaining)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Failed Resumes Alert */}
            {failedResumes.length > 0 && remainingResumes === 0 && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-medium text-red-900">
                        {failedResumes.length} {failedResumes.length === 1 ? 'Resume' : 'Resumes'} Failed
                      </h4>
                      <p className="text-sm text-red-700 mt-0.5">
                        {selectedForRetry.length > 0
                          ? `${selectedForRetry.length} selected for retry`
                          : 'Select resumes below to retry or continue with successful results'
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {failedResumes.length > 1 && (
                      <button
                        onClick={selectAllFailed}
                        className="px-3 py-1.5 border-2 border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                      >
                        {selectedForRetry.length === failedResumes.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                    {selectedForRetry.length > 0 && (
                      <button
                        onClick={handleRetrySelected}
                        className="px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry Selected ({selectedForRetry.length})
                      </button>
                    )}
                    <button
                      onClick={handleRetryAllFailed}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry All
                    </button>
                    <button
                      onClick={handleCompleteWithErrors}
                      className="px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Average Score</div>
                    <div className={`text-2xl font-bold ${getScoreColor(avgScore)}`}>
                      {completedCount > 0 ? `${avgScore}%` : '--'}
                    </div>
                  </div>
                  <TrendingUp className="w-8 h-8 text-gray-800 opacity-30" />
                </div>
              </div>

              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Time Elapsed</div>
                    <div className="text-2xl font-bold text-gray-900">{formatTime(elapsedTime)}</div>
                  </div>
                  <Clock className="w-8 h-8 text-gray-800 opacity-30" />
                </div>
              </div>

              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Failed</div>
                    <div className="text-2xl font-bold text-red-600">{errorCount}</div>
                  </div>
                  <XCircle className="w-8 h-8 text-red-600 opacity-30" />
                </div>
              </div>
            </div>
          </div>

          {/* Resume List */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-2">
              {scoringResumes.map((resume, index) => (
                <Fragment key={resume.id}>
                  <div
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-300 ${
                      resume.status === 'completed'
                        ? 'bg-green-50 border-green-300 shadow-sm'
                        : resume.status === 'scoring'
                        ? 'bg-gray-50 border-gray-400 shadow-md scale-[1.02]'
                        : resume.status === 'error'
                        ? `bg-red-50 border-red-300 ${selectedForRetry.includes(resume.id) ? 'ring-2 ring-red-400' : ''}`
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    {/* Checkbox for failed resumes */}
                    {failedResumes.length > 0 && resume.status === 'error' && (
                      <div className="flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={selectedForRetry.includes(resume.id)}
                          onChange={() => toggleRetrySelection(resume.id)}
                          className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-600"
                        />
                      </div>
                    )}

                    {/* Status Icon */}
                    <div className="flex-shrink-0">
                      {resume.status === 'completed' ? (
                        <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                          <CheckCircle2 className="w-6 h-6 text-white" />
                        </div>
                      ) : resume.status === 'scoring' ? (
                        <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center shadow-lg">
                          <Loader2 className="w-6 h-6 text-white animate-spin" />
                        </div>
                      ) : resume.status === 'error' ? (
                        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                          <XCircle className="w-6 h-6 text-white" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-gray-600 font-semibold text-sm">{index + 1}</span>
                        </div>
                      )}
                    </div>

                    {/* Resume Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-gray-900 truncate">{resume.name}</h4>
                        {resume.status === 'scoring' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 text-white rounded-full text-xs font-medium animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Analyzing...
                          </span>
                        )}
                        {resume.currentAttempt && resume.currentAttempt > 1 && (
                          <span className="text-xs text-gray-500 font-medium">
                            (Attempt #{resume.currentAttempt})
                          </span>
                        )}
                        {resume.attemptHistory && resume.attemptHistory.length > 0 && (
                          <button
                            onClick={() => setExpandedHistory(expandedHistory === resume.id ? null : resume.id)}
                            className="text-xs text-gray-800 hover:text-gray-900 flex items-center gap-1 font-medium"
                          >
                            <History className="w-3 h-3" />
                            {resume.attemptHistory.length} {resume.attemptHistory.length === 1 ? 'attempt' : 'attempts'}
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {resume.status === 'completed' && resume.score && (
                          <span>
                            AI Analysis Complete - Score: <span className={`font-semibold ${getScoreColor(resume.score)}`}>{resume.score}%</span>
                          </span>
                        )}
                        {resume.status === 'scoring' && 'Evaluating skills, experience, and job fit...'}
                        {resume.status === 'pending' && 'Waiting in queue...'}
                        {resume.status === 'error' && resume.errorReason && (
                          <div className="flex items-start gap-1 text-red-600">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>{resume.errorReason}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Score Badge or Retry Button */}
                    {resume.status === 'completed' && resume.score && (
                      <div className="flex-shrink-0 text-right animate-in fade-in slide-in-from-right duration-300">
                        <div className={`text-3xl font-bold ${getScoreColor(resume.score)}`}>
                          {resume.score}%
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {resume.score >= 85 ? 'Excellent' : resume.score >= 70 ? 'Good' : 'Moderate'}
                        </div>
                      </div>
                    )}
                    {resume.status === 'error' && (
                      <button
                        onClick={() => handleRetryIndividual(resume.id)}
                        className="flex-shrink-0 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-medium flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </div>

                  {/* Attempt History Expanded */}
                  {expandedHistory === resume.id && resume.attemptHistory && resume.attemptHistory.length > 0 && (
                    <div className="ml-16 mr-4 mb-2 bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <History className="w-4 h-4 text-gray-800" />
                        <h4 className="font-medium text-gray-800">Attempt History</h4>
                      </div>
                      <div className="space-y-2">
                        {resume.attemptHistory.map((attempt) => (
                          <div
                            key={attempt.attemptNumber}
                            className="flex items-start gap-3 bg-white rounded-lg p-3 border border-gray-200"
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              attempt.status === 'Success' ? 'bg-green-100' : 'bg-red-100'
                            }`}>
                              {attempt.status === 'Success' ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-600" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <span className="font-medium text-gray-900">Attempt #{attempt.attemptNumber}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  attempt.status === 'Success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {attempt.status}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600">
                                {attempt.timestamp.toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              {attempt.errorReason && (
                                <div className="flex items-start gap-1 text-xs text-red-600 mt-2">
                                  <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                  <span>{attempt.errorReason}</span>
                                </div>
                              )}
                              {attempt.score && (
                                <div className="text-xs text-gray-700 mt-2">
                                  Score: <span className="font-semibold">{attempt.score}%</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                {remainingResumes > 0 ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-gray-800" />
                    <span>Processing resumes via AI...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>
                      {errorCount > 0
                        ? `Processing complete with ${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`
                        : 'All resumes scored successfully!'
                      }
                    </span>
                  </>
                )}
              </div>
              <div className="text-sm text-gray-500">
                AI-powered resume analysis
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
