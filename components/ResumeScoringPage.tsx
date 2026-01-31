"use client";

import { Target, Briefcase, Filter, Search, FileText, User, MapPin, Mail, Phone, CheckCircle, FolderOpen, Database, TrendingUp, Award, ChevronDown, Download, Clock, History, Eye, X, ArrowLeft, Send, MousePointer, PlayCircle, CheckCircle2, XCircle, AlertCircle, DollarSign, List, LayoutGrid, Loader, Square, CheckSquare, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ScoredResumesTable from './ScoredResumesTable';
import ResumeSelectionModal from './ResumeSelectionModal';
import ResumeScoringStatusPanel from './ResumeScoringStatusPanel';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import ScoringJobProgressModal, { JobScoringProgress } from './ScoringJobProgressModal';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';
import ExistingScoreAlertModal from './ExistingScoreAlertModal';
import api from '@/lib/services/api';
import { scoringService } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';

// Types
interface Job {
  id: string;
  title: string;
  location: string;
  department: string;
  status: string;
  applicants: number;
  employmentType?: string;
  experience?: string;
}

interface Resume {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  experience?: string;
  skills?: string[];
  folderId?: string;
  education?: string;
  certifications?: string[];
}

interface Folder {
  id: string;
  name: string;
  resumeCount: number;
}

interface Tenant {
  id: string;
  subscription: {
    limits: { resumeScoring: number };
    usage: { resumeScoring: number };
  };
}

interface ScoredResumeData {
  id: string;
  jobId: string;
  jobTitle: string;
  scoredAt: Date;
  source: 'my-resumes' | 'database';
  totalScored: number;
  scoredResumes: any[];
}

interface PendingScoringData {
  jobId: string;
  jobTitle: string;
  resumeIds: string[];
  resumeNames: string[];
}

interface BatchProgressItem {
  resumeId: string;
  candidateName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  score?: number;
  errorMessage?: string;
}

interface BatchProgress {
  jobId: string;
  jobTitle: string;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  items?: BatchProgressItem[];
}

interface ResumeScoringPageProps {
  jobs?: Job[];
  resumes?: Resume[];
  folders?: Folder[];
  scoredHistory?: ScoredResumeData[];
  onSaveScores?: (data: ScoredResumeData) => void;
  onNavigateToAITalentMatch?: (jobId: string) => void;
  onBack?: () => void;
  tenant?: Tenant;
  initialJdId?: string | null;
  initialShowProgress?: boolean;
  pendingScoringData?: PendingScoringData | null;
  batchProgress?: BatchProgress | null;
}

export default function ResumeScoringPage({
  jobs: propJobs = [],
  resumes: propResumes = [],
  folders: propFolders = [],
  scoredHistory = [],
  onSaveScores,
  onNavigateToAITalentMatch,
  onBack,
  tenant,
  initialJdId,
  initialShowProgress = false,
  pendingScoringData = null,
  batchProgress = null
}: ResumeScoringPageProps) {
  const router = useRouter();

  // Use persistent scoring progress context
  const {
    startScoringJob,
    updateItemStatus,
    getJobProgress,
    hasActiveScoring,
    setOnRestorePanel
  } = useScoringProgress();

  // Use props directly - data is fetched by the page route
  const jobs = propJobs;
  const resumes = propResumes;
  const folders = propFolders;

  // View state
  const [viewMode, setViewMode] = useState<'history' | 'details' | 'new' | 'candidateView'>('history');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ScoredResumeData | null>(null);
  const [isWaitingForInitialJd, setIsWaitingForInitialJd] = useState(false);

  // Track if we've already handled the initialJdId to prevent re-triggering
  const [initialJdHandled, setInitialJdHandled] = useState(false);
  const [selectedCandidateForView, setSelectedCandidateForView] = useState<any | null>(null);
  const [selectedJob, setSelectedJob] = useState('');
  const [resumeSource, setResumeSource] = useState<'my-resumes' | 'internal-database' | null>(null);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showResumeSelectionModal, setShowResumeSelectionModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [experienceFilter, setExperienceFilter] = useState<string>('all');
  const [isScoring, setIsScoring] = useState(false);
  const [scoredResumes, setScoredResumes] = useState<any[]>([]);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // State for real-time scoring status panel
  const [showScoringPanel, setShowScoringPanel] = useState(false);
  const [isScoringMinimized, setIsScoringMinimized] = useState(false);
  const [resumesToScore, setResumesToScore] = useState<Array<{ id: string; name: string }>>([]);
  const [scoringSource, setScoringSource] = useState<'my-resumes' | 'database'>('database');

  // Register restore callback when scoring panel is minimized
  useEffect(() => {
    if (showScoringPanel && isScoringMinimized) {
      // When minimized, clicking floating indicator should restore the panel
      setOnRestorePanel(() => setIsScoringMinimized(false));
    } else {
      setOnRestorePanel(undefined);
    }
    return () => setOnRestorePanel(undefined);
  }, [showScoringPanel, isScoringMinimized, setOnRestorePanel]);

  // State for Progress Tables Modal
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressData, setProgressData] = useState<ScoringProgressItem[]>([]);
  const [filterByJobId, setFilterByJobId] = useState<string | undefined>(undefined);
  const [showJobTitleColumn, setShowJobTitleColumn] = useState(false);

  // State for Job Progress Modal (per-job view)
  const [showJobProgressModal, setShowJobProgressModal] = useState(false);
  const [jobProgressData, setJobProgressData] = useState<JobScoringProgress[]>([]);
  const [isJobProgressMinimized, setIsJobProgressMinimized] = useState(false);

  // History filters
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historySourceFilter, setHistorySourceFilter] = useState<'all' | 'my-resumes' | 'database'>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyMinCandidates, setHistoryMinCandidates] = useState<number>(0);
  const [historyAvgScoreMin, setHistoryAvgScoreMin] = useState<number>(0);
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);

  // History view mode and selection
  const [historyViewMode, setHistoryViewMode] = useState<'grid' | 'list'>('list');
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<Set<string>>(new Set());

  // Bulk download state for scored resumes
  const [selectedScoredResumes, setSelectedScoredResumes] = useState<string[]>([]);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);

  // Available units from quota API
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);

  // Global view state (view all scored resumes across all JDs)
  const [isGlobalView, setIsGlobalView] = useState(false);
  const [globalScoredResumes, setGlobalScoredResumes] = useState<any[]>([]);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  // Existing score alert modal state
  const [showExistingScoreAlert, setShowExistingScoreAlert] = useState(false);
  const [existingScoreData, setExistingScoreData] = useState<{
    jdTitle: string;
    existingScores: Array<{
      resume_id: string;
      score_id: string;
      candidate_name: string;
      candidate_email: string;
      overall_score: number;
      match_status: string;
      scored_at: string | null;
    }>;
    totalChecked: number;
    newCount: number;
    pendingResumeIds: string[];
    pendingSource: 'my-resumes' | 'database';
  } | null>(null);

  // Fetch all scored resumes for global view
  const fetchGlobalScoredResumes = async () => {
    setIsLoadingGlobal(true);
    try {
      const response = await scoringService.getAllScoredResumes({
        page: 1,
        page_size: 100,
      });

      // Convert to ScoredResumesTable format
      const converted = response.items.map((item: any) => ({
        id: item.id,
        candidateName: item.candidate_name || 'Unknown',
        email: item.email || '',
        phone: item.phone || '',
        matchStatus: item.match_status || 'No Match',
        scorePercentage: Math.round(item.overall_score || 0),
        scoredDate: item.created_at || new Date().toISOString(),
        scoredBy: item.scored_by || 'AI Engine',
        // Source, Status, Error Reason fields
        source: item.source || 'database',
        status: item.status || 'completed',
        errorReason: item.error_message || item.error_reason || '',
        experience: item.experience,
        education: item.education,
        certifications: item.certifications,
        aiSummary: item.ai_summary,
        strengths: item.strengths,
        gaps: item.gaps,
        jobTitle: item.jd_title,
        jdId: item.jd_id,
      }));

      setGlobalScoredResumes(converted);
    } catch (error) {
      console.error('Failed to fetch global scored resumes:', error);
      toast.error('Failed to load all scored candidates');
    } finally {
      setIsLoadingGlobal(false);
    }
  };

  // Toggle global view
  const handleToggleGlobalView = () => {
    if (!isGlobalView) {
      // Entering global view - fetch data
      fetchGlobalScoredResumes();
    }
    setIsGlobalView(!isGlobalView);
    setSelectedScoredResumes([]); // Clear selection when switching views
  };

  // Handle initial JD ID from URL - auto-open scored resumes view
  useEffect(() => {
    // Only handle initialJdId once
    if (initialJdHandled) return;

    if (initialJdId) {
      // Set waiting state when we have an initialJdId
      if (!isWaitingForInitialJd && scoredHistory.length === 0) {
        console.log('[ResumeScoringPage] Setting waiting state for initialJdId:', initialJdId);
        setIsWaitingForInitialJd(true);
        return;
      }

      if (scoredHistory.length > 0) {
        console.log('[ResumeScoringPage] Checking for initialJdId:', initialJdId);
        const historyItem = scoredHistory.find(item => item.jobId === initialJdId);
        if (historyItem) {
          console.log('[ResumeScoringPage] Found history item for JD, auto-opening:', historyItem.jobTitle);
          setSelectedHistoryItem(historyItem);
          setViewMode('details');
          setIsWaitingForInitialJd(false);
          setInitialJdHandled(true);

          // Save to localStorage so we can restore this view later
          try {
            localStorage.setItem('lastViewedScoringJdId', initialJdId);
          } catch (e) {
            console.error('Failed to save last viewed JD:', e);
          }

          // If show_progress is requested, open the job progress modal
          if (initialShowProgress) {
            console.log('[ResumeScoringPage] Show progress requested, opening progress modal');
            const jobProgress: JobScoringProgress = {
              jobId: historyItem.jobId,
              jobTitle: historyItem.jobTitle,
              total: historyItem.totalScored,
              queued: 0,
              inProgress: 0,
              completed: historyItem.scoredResumes.length,
              failed: historyItem.totalScored - historyItem.scoredResumes.length,
            };
            setJobProgressData([jobProgress]);
            setShowJobProgressModal(true);
          }
        } else {
          console.log('[ResumeScoringPage] No history item found for JD:', initialJdId);
          // History is loaded but JD not found - stop waiting and show history view
          setIsWaitingForInitialJd(false);
          setInitialJdHandled(true);
        }
      }
    }
  }, [initialJdId, scoredHistory, initialShowProgress, initialJdHandled, isWaitingForInitialJd]);

  // Timeout for waiting state - don't wait forever for history to load
  useEffect(() => {
    if (isWaitingForInitialJd) {
      const timeout = setTimeout(() => {
        console.log('[ResumeScoringPage] Timeout waiting for initial JD, showing history view');
        setIsWaitingForInitialJd(false);
        setInitialJdHandled(true);
      }, 5000); // 5 second timeout
      return () => clearTimeout(timeout);
    }
  }, [isWaitingForInitialJd]);

  // Fetch available units on mount
  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const response = await api.get('/usage/quota-status');
        const quotas = response.data?.data?.quotas;
        if (quotas?.RS) {
          setAvailableUnits(quotas.RS.total_remaining || 0);
        }
      } catch (error) {
        console.log('[ResumeScoringPage] Failed to load quota:', error);
      }
    };
    fetchQuota();
  }, []);

  // Handle pending scoring from my-resumes page - start scoring and show progress modal
  useEffect(() => {
    if (!pendingScoringData) return;

    const { jobId, jobTitle, resumeIds, resumeNames } = pendingScoringData;
    console.log('[ResumeScoringPage] Starting pending scoring for job:', jobTitle, 'with', resumeIds.length, 'resumes');

    // Create initial items array with candidate names - all start as queued
    const initialItems = resumeIds.map((resumeId, index) => ({
      resumeId,
      candidateName: resumeNames[index] || `Resume ${index + 1}`,
      status: 'queued' as const,
    }));

    // Initialize progress modal immediately with items
    const initialProgress: JobScoringProgress = {
      jobId,
      jobTitle,
      total: resumeIds.length,
      queued: resumeIds.length,
      inProgress: 0,
      completed: 0,
      failed: 0,
      items: initialItems,
    };
    setJobProgressData([initialProgress]);
    setShowJobProgressModal(true);

    // Also start tracking in persistent context (survives page refresh)
    const progressItems = resumeIds.map((resumeId, index) => ({
      id: `${jobId}-${resumeId}`,
      resumeId,
      candidateName: resumeNames[index] || `Resume ${index + 1}`,
      jobTitle,
      jobId,
      source: 'Internal DB' as const,
    }));
    startScoringJob(jobId, jobTitle, progressItems);

    // Track item statuses for the modal
    const itemStatuses: { resumeId: string; candidateName: string; status: 'queued' | 'processing' | 'completed' | 'failed'; score?: number; errorMessage?: string }[] =
      resumeIds.map((resumeId, index) => ({
        resumeId,
        candidateName: resumeNames[index] || `Resume ${index + 1}`,
        status: 'queued' as const,
      }));

    // Start scoring resumes
    const scoreResumes = async () => {
      let completed = 0;
      let failed = 0;

      for (let i = 0; i < resumeIds.length; i++) {
        const resumeId = resumeIds[i];
        const itemId = `${jobId}-${resumeId}`;

        // Update item status to processing
        itemStatuses[i].status = 'processing';

        // Update progress - move from queued to in progress
        setJobProgressData([{
          jobId,
          jobTitle,
          total: resumeIds.length,
          queued: resumeIds.length - i - 1,
          inProgress: 1,
          completed,
          failed,
          items: [...itemStatuses],
        }]);

        // Update persistent context
        updateItemStatus(jobId, itemId, 'Scoring in progress');

        try {
          const result = await scoringService.scoreResume(jobId, resumeId);
          completed++;
          console.log(`[ResumeScoringPage] Scored resume ${i + 1}/${resumeIds.length}`);

          // Update item status to completed with score
          itemStatuses[i].status = 'completed';
          itemStatuses[i].score = result?.overall_score || result?.score || 0;

          // Update persistent context with success
          updateItemStatus(jobId, itemId, 'Scored successfully', {
            score: result?.overall_score || result?.score || 0,
            matchResult: result?.match_status || 'Partial Match',
            scoredDateTime: new Date().toISOString(),
          });
        } catch (err) {
          console.error(`[ResumeScoringPage] Failed to score resume ${resumeId}:`, err);
          failed++;

          // Update item status to failed
          itemStatuses[i].status = 'failed';
          itemStatuses[i].errorMessage = err instanceof Error ? err.message : 'Scoring failed';

          // Update persistent context with failure
          updateItemStatus(jobId, itemId, 'Failed', {
            errorReason: err instanceof Error ? err.message : 'Scoring failed',
          });
        }

        // Update progress after scoring
        setJobProgressData([{
          jobId,
          jobTitle,
          total: resumeIds.length,
          queued: resumeIds.length - i - 1,
          inProgress: 0,
          completed,
          failed,
          items: [...itemStatuses],
        }]);
      }

      // Final update - all done
      setJobProgressData([{
        jobId,
        jobTitle,
        total: resumeIds.length,
        queued: 0,
        inProgress: 0,
        completed,
        failed,
        items: [...itemStatuses],
      }]);

      console.log(`[ResumeScoringPage] Scoring complete: ${completed} succeeded, ${failed} failed`);

      // Refresh page after a short delay to load the scored results
      setTimeout(() => {
        window.location.href = `/recruitment/resume-scoring?jd_id=${jobId}`;
      }, 2000);
    };

    scoreResumes();
  }, [pendingScoringData, startScoringJob, updateItemStatus]);

  // Handle batch progress from Celery async scoring - show progress modal
  useEffect(() => {
    if (!batchProgress) return;

    console.log('[ResumeScoringPage] Batch progress update:', batchProgress);
    console.log('[ResumeScoringPage] Batch items count:', batchProgress.items?.length || 0);

    // Map items from batchProgress
    const items = (batchProgress.items || []).map(item => ({
      resumeId: item.resumeId,
      candidateName: item.candidateName || 'Unknown',
      status: item.status,
      score: item.score,
      errorMessage: item.errorMessage,
    }));

    // Update job progress modal with batch status including individual resume items
    const progress: JobScoringProgress = {
      jobId: batchProgress.jobId,
      jobTitle: batchProgress.jobTitle,
      total: batchProgress.total,
      queued: batchProgress.queued,
      inProgress: batchProgress.processing,
      completed: batchProgress.completed,
      failed: batchProgress.failed,
      items: items,
    };

    console.log('[ResumeScoringPage] Setting jobProgressData with items:', items.length);
    setJobProgressData([progress]);
    setShowJobProgressModal(true);
  }, [batchProgress]);

  // Split resumes - myResumes are all user-uploaded resumes, databaseResumes are all resumes
  const myResumes = resumes; // All resumes belong to the user (My Resumes)
  const databaseResumes = resumes;

  const availableResumes = resumeSource === 'my-resumes' ? myResumes :
                          resumeSource === 'internal-database' ? databaseResumes :
                          [];

  const filteredResumes = availableResumes.filter(resume => {
    const matchesSearch = searchQuery === '' ||
      resume.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resume.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (resume.skills && resume.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesExperience = experienceFilter === 'all' || resume.experience === experienceFilter;

    return matchesSearch && matchesExperience;
  });

  const handleResumeToggle = (resumeId: string) => {
    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  const handleSelectAll = () => {
    if (selectedResumes.length === filteredResumes.length) {
      setSelectedResumes([]);
    } else {
      setSelectedResumes(filteredResumes.map(r => r.id));
    }
  };

  const getMatchReason = (score: number) => {
    if (score >= 70) return 'Excellent match with strong alignment on key skills and experience requirements. Highly recommended candidate.';
    if (score >= 50) return 'Good match with relevant skills and experience. Solid candidate for consideration.';
    return 'Moderate match with some relevant skills. May require additional evaluation.';
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-gray-800';
    return 'text-yellow-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 70) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 50) return 'bg-gray-100 border-gray-300 text-gray-900';
    return 'bg-yellow-100 border-yellow-300 text-yellow-700';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return 'Exact Match';
    if (score >= 50) return 'Partial Match';
    return 'No Match';
  };

  // Selection handlers for history items
  const handleSelectHistoryItem = (itemId: string) => {
    const newSelected = new Set(selectedHistoryItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedHistoryItems(newSelected);
  };

  const handleSelectAllHistory = (filteredHistory: ScoredResumeData[]) => {
    if (selectedHistoryItems.size === filteredHistory.length) {
      setSelectedHistoryItems(new Set());
    } else {
      setSelectedHistoryItems(new Set(filteredHistory.map(item => item.id)));
    }
  };

  const handleDownloadSelectedHistory = () => {
    if (selectedHistoryItems.size === 0) return;

    const selectedData = scoredHistory.filter(item => selectedHistoryItems.has(item.id));
    const totalResumes = selectedData.reduce((sum, item) => sum + item.totalScored, 0);

    alert(`Download initiated!\n\n${selectedHistoryItems.size} scoring session${selectedHistoryItems.size > 1 ? 's' : ''} selected\n${totalResumes} total resume${totalResumes > 1 ? 's' : ''}\n\nIncluded:\n${selectedData.map((item, i) => `${i + 1}. ${item.jobTitle} - ${item.totalScored} resumes`).join('\n')}\n\n(Mock download - would download ZIP file with all resumes)`);
  };

  // Bulk download scorecards as ZIP
  const handleBulkDownloadScorecards = async () => {
    if (selectedScoredResumes.length === 0) {
      toast.error('Please select at least one candidate to download scorecards');
      return;
    }

    setIsBulkDownloading(true);
    toast.loading(`Preparing ${selectedScoredResumes.length} scorecard(s) for download...`, { id: 'bulk-scorecard-download' });

    try {
      console.log('[BulkDownload] Downloading scorecards for:', selectedScoredResumes);

      // Use the scoring service to export scorecards
      const blob = await scoringService.exportScorecards(selectedScoredResumes);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TalentFlow_Scorecards_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('[BulkDownload] ZIP downloaded successfully');
      toast.success(`Successfully downloaded ${selectedScoredResumes.length} scorecard(s)`, { id: 'bulk-scorecard-download' });

      // Clear selection
      setSelectedScoredResumes([]);
    } catch (error) {
      console.error('[BulkDownload] Error:', error);
      toast.error('Failed to download scorecards. Please try again.', { id: 'bulk-scorecard-download' });
    } finally {
      setIsBulkDownloading(false);
    }
  };

  const publishedJobs = jobs.filter(j => j.status === 'Published' || j.status === 'Active');
  const selectedJobData = jobs.find(j => j.id === selectedJob);

  // Convert scored resumes to ScoredResumesTable format
  const convertToScoredResumesFormat = (scoredData: ScoredResumeData) => {
    console.log('[ResumeScoringPage] Converting scored resumes:', scoredData.scoredResumes);
    return scoredData.scoredResumes.map((resume, index) => {
      console.log('[ResumeScoringPage] Resume:', resume.id, 'candidateName:', resume.candidateName, 'candidateEmail:', resume.candidateEmail);
      const getResumeVersion = () => {
        if (resume.name === 'Sarah Johnson') return 'Current';
        if (resume.name === 'Michael Chen') return 'Version 2';
        if (index % 4 === 0) return 'Version 1';
        if (index % 3 === 0) return 'Version 2';
        return 'Current';
      };

      // Use matchStatus from API if available, otherwise calculate from score (70+ = Exact Match)
      const matchStatus = resume.matchStatus || (
        resume.matchScore >= 70 ? 'Exact Match' :
        resume.matchScore >= 50 ? 'Partial Match' : 'No Match'
      );

      return {
        id: resume.id,
        resumeId: resume.resumeId || resume.resume_id || '',  // CRITICAL: Resume ID for fetching full details
        // Use candidateName from API, fallback to name, then 'Unknown Candidate'
        candidateName: resume.candidateName || resume.name || 'Unknown Candidate',
        email: resume.candidateEmail || resume.email || 'N/A',
        phone: resume.phone || 'N/A',
        matchStatus: matchStatus,
        scorePercentage: resume.matchScore || resume.scorePercentage || 0,
        scoredDate: new Date(scoredData.scoredAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
        scoredBy: 'AI Resume Scorer',
        experience: resume.experience || 'N/A',
        education: resume.education || 'N/A',
        certifications: resume.certifications || [],
        resumeVersion: getResumeVersion(),
        // Job Title and JD ID from parent scoredData
        jobTitle: scoredData.jobTitle,
        jdId: scoredData.jobId,
        // Version info
        version: resume.version || resume.resumeVersion || 1,
        resumeVersion: resume.version || resume.resumeVersion || 1,
        // Source, Status, Error Reason fields
        source: resume.source || scoredData.source || 'database',
        status: resume.status || 'completed',
        errorReason: resume.errorReason || resume.error_reason || '',
        // Pass real scoring data from API
        aiSummary: resume.aiSummary,
        strengths: resume.strengths,
        gaps: resume.gaps,
        matchReason: resume.matchReason,
        scoreBreakdown: resume.scoreBreakdown,
        criteriaScores: resume.criteriaScores, // Important: Pass criteriaScores for Score Table
        title: resume.title,
        currentCompany: resume.currentCompany,
        location: resume.location,
        // Additional fields for personal info
        professionalSummary: resume.professionalSummary,
        skills: resume.skills,
        technicalSkills: resume.technicalSkills,
        softSkills: resume.softSkills,
        educationDetails: resume.educationDetails,
        experienceDetails: resume.experienceDetails,
        languages: resume.languages,
        // Explicit matched and missing skills from scoring
        matchedSkills: resume.matchedSkills || resume.matched_skills || resume.skills || [],
        missingSkills: resume.missingSkills || resume.missing_skills || [],
        // Pass scoredBy from API data
        scoredBy: resume.scoredBy || 'AI Resume Scorer',
        scoredDate: resume.scoredDate || resume.created_at,
      };
    });
  };

  // Show loading when waiting for initial JD's history to load
  if (isWaitingForInitialJd) {
    return (
      <main className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-gray-800 mx-auto mb-3" />
          <p className="text-gray-600">Loading scored candidates...</p>
        </div>
      </main>
    );
  }

  // View Candidate Scoring Detail Page
  if (viewMode === 'candidateView' && selectedCandidateForView && selectedHistoryItem) {
    return (
      <CandidateScoringDetailPage
        resume={selectedCandidateForView}
        jobTitle={selectedHistoryItem.jobTitle}
        jobId={selectedHistoryItem.jobId}
        onBack={() => {
          setSelectedCandidateForView(null);
          setViewMode('details');
        }}
        onMinimize={() => {
          setSelectedCandidateForView(null);
          setViewMode('details');
        }}
      />
    );
  }

  // View History Details
  if (viewMode === 'details' && selectedHistoryItem) {
    const scoredResumesData = convertToScoredResumesFormat(selectedHistoryItem);

    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-gray-50 to-white">
        {/* Header with Back Button */}
        <div className="mb-6">
          <button
            onClick={() => {
              setViewMode('history');
              setSelectedHistoryItem(null);
              setSelectedStatusFilter('all');
            }}
            className="flex items-center gap-2 text-gray-800 hover:text-gray-900 mb-4 font-medium transition-colors hover:gap-3"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Scored Candidates
          </button>

          <div className="bg-white rounded-xl shadow-lg border-2 border-gray-300 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                  <Target className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl text-gray-900 mb-1">{selectedHistoryItem.jobTitle}</h1>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(selectedHistoryItem.scoredAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      {selectedHistoryItem.totalScored} candidates scored
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      selectedHistoryItem.source === 'my-resumes'
                        ? 'bg-gray-100 text-gray-900'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      {selectedHistoryItem.source === 'my-resumes' ? (
                        <>
                          <FolderOpen className="w-3 h-3" />
                          My Resumes
                        </>
                      ) : (
                        <>
                          <Database className="w-3 h-3" />
                          Resume Database
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setViewMode('new')}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                <Target className="w-4 h-4" />
                Score New Resumes
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {scoredResumesData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={selectedScoredResumes.length === scoredResumesData.length && scoredResumesData.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedScoredResumes(scoredResumesData.map(r => r.id));
                    } else {
                      setSelectedScoredResumes([]);
                    }
                  }}
                  className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700 font-medium">
                  {selectedScoredResumes.length > 0
                    ? `${selectedScoredResumes.length} candidate${selectedScoredResumes.length > 1 ? 's' : ''} selected`
                    : 'Select candidates'}
                </span>
              </div>

              {selectedScoredResumes.length > 0 && (
                <button
                  onClick={handleBulkDownloadScorecards}
                  disabled={isBulkDownloading}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBulkDownloading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Generating ZIP...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download {selectedScoredResumes.length} Scorecard{selectedScoredResumes.length > 1 ? 's' : ''} (ZIP)
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scored Resumes Table */}
        <ScoredResumesTable
          resumes={scoredResumesData}
          jobTitle={selectedHistoryItem.jobTitle}
          jobId={selectedHistoryItem.jobId}
          availableUnits={availableUnits || 0}
          onViewCandidate={(resume) => {
            setSelectedCandidateForView(resume);
            setViewMode('candidateView');
          }}
          selectedResumes={selectedScoredResumes}
          onSelectResume={(resumeId) => {
            setSelectedScoredResumes(prev =>
              prev.includes(resumeId)
                ? prev.filter(id => id !== resumeId)
                : [...prev, resumeId]
            );
          }}
          onSelectAll={(resumeIds) => {
            setSelectedScoredResumes(resumeIds);
          }}
        />

        {/* Bulk Scoring Progress Modal */}
        {showProgressModal && (
          <BulkScoringProgressModal
            progressData={progressData}
            onClose={() => setShowProgressModal(false)}
            showJobTitleColumn={showJobTitleColumn}
            onRetryFailed={async (item) => {
              try {
                // Update item status to "Scoring in progress"
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? { ...p, status: 'Scoring in progress' as const, errorReason: undefined }
                    : p
                ));

                // Check quota before retry
                const quotaResponse = await api.get('/usage/quota-status');
                const quotas = quotaResponse.data?.data?.quotas;
                const remainingUnits = quotas?.RS?.total_remaining || 0;

                if (remainingUnits < 1) {
                  setProgressData(prev => prev.map(p =>
                    p.id === item.id
                      ? { ...p, status: 'Failed' as const, errorReason: 'Insufficient scoring units' }
                      : p
                  ));
                  toast.error('Insufficient scoring units for retry');
                  return;
                }

                // Retry scoring
                await scoringService.scoreResume(item.jobId, item.resumeId);

                // Fetch updated score
                const historyResponse = await jdService.getScoredResumes(item.jobId);
                const scoredResume = historyResponse.resumes?.find(r => r.resume_id === item.resumeId);

                // Update item with success status
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? {
                        ...p,
                        status: 'Scored successfully' as const,
                        errorReason: undefined,
                        scoredDateTime: new Date(),
                        matchResult: scoredResume
                          ? (scoredResume.match_score >= 85 ? 'Exact Match'
                             : scoredResume.match_score >= 70 ? 'Partial Match'
                             : 'No Match') as 'Exact Match' | 'Partial Match' | 'No Match'
                          : undefined,
                        score: scoredResume?.match_score
                      }
                    : p
                ));

                toast.success(`Successfully scored ${item.candidateName}`);
              } catch (error: any) {
                // Update item with failure status
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? {
                        ...p,
                        status: 'Failed' as const,
                        errorReason: error?.message || 'Retry failed'
                      }
                    : p
                ));
                toast.error(`Failed to retry scoring for ${item.candidateName}`);
              }
            }}
          />
        )}

        {/* Job Progress Modal - Per Job View */}
        <ScoringJobProgressModal
          isOpen={showJobProgressModal}
          onClose={() => {
            setShowJobProgressModal(false);
            setIsJobProgressMinimized(false);
          }}
          onMinimize={() => setIsJobProgressMinimized(!isJobProgressMinimized)}
          isMinimized={isJobProgressMinimized}
          jobProgressData={jobProgressData}
          onRetryFailed={async (resumeId, jobId) => {
            try {
              // Update item status to processing
              setJobProgressData(prev => prev.map(job => ({
                ...job,
                items: job.items?.map(item =>
                  item.resumeId === resumeId
                    ? { ...item, status: 'processing' as const, errorMessage: undefined }
                    : item
                )
              })));

              // Call scoring API
              const result = await scoringService.scoreResume(jobId, resumeId);

              // Update item with success
              setJobProgressData(prev => prev.map(job => ({
                ...job,
                failed: job.items?.filter(i => i.resumeId === resumeId && i.status === 'failed').length ? job.failed - 1 : job.failed,
                completed: job.items?.filter(i => i.resumeId === resumeId).length ? job.completed + 1 : job.completed,
                items: job.items?.map(item =>
                  item.resumeId === resumeId
                    ? { ...item, status: 'completed' as const, score: result?.match_score }
                    : item
                )
              })));

              toast.success('Retry successful');
            } catch (error: any) {
              // Update item with failure
              setJobProgressData(prev => prev.map(job => ({
                ...job,
                items: job.items?.map(item =>
                  item.resumeId === resumeId
                    ? { ...item, status: 'failed' as const, errorMessage: error?.message || 'Retry failed' }
                    : item
                )
              })));
              toast.error('Retry failed');
            }
          }}
          onViewJobDetails={(jobId) => {
            setShowJobProgressModal(false);
            setIsJobProgressMinimized(false);
            // Navigate to job details or filter by job
            const historyItem = scoredHistory.find(item => item.jobId === jobId);
            if (historyItem) {
              setSelectedHistoryItem(historyItem);
              setViewMode('details');
            }
          }}
        />
      </main>
    );
  }

  // View History List
  if (viewMode === 'history') {
    // Filter history items
    const filteredHistory = scoredHistory.filter(item => {
      const matchesSearch = historySearchQuery === '' ||
        item.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase());

      const matchesSource = historySourceFilter === 'all' || item.source === historySourceFilter;

      let matchesDate = true;
      if (historyDateFrom) {
        matchesDate = matchesDate && new Date(item.scoredAt) >= new Date(historyDateFrom);
      }
      if (historyDateTo) {
        matchesDate = matchesDate && new Date(item.scoredAt) <= new Date(historyDateTo);
      }

      const matchesCandidates = item.totalScored >= historyMinCandidates;

      const avgScore = item.scoredResumes.length > 0
        ? item.scoredResumes.reduce((sum, r) => sum + r.matchScore, 0) / item.scoredResumes.length
        : 0;
      const matchesAvgScore = avgScore >= historyAvgScoreMin;

      return matchesSearch && matchesSource && matchesDate && matchesCandidates && matchesAvgScore;
    });

    const activeFiltersCount = [
      historySearchQuery !== '',
      historySourceFilter !== 'all',
      historyDateFrom !== '',
      historyDateTo !== '',
      historyMinCandidates > 0,
      historyAvgScoreMin > 0,
    ].filter(Boolean).length;

    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-gray-50 to-white">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-white/80 rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </button>
            )}
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-lg">
              <History className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-gray-900 text-xl font-semibold">Scored Candidates</h1>
              <p className="text-sm text-gray-600">View and manage previously scored resumes</p>
            </div>

            {/* Available Units Display */}
            {availableUnits !== null && (
              <div className="bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl shadow-lg p-4 border-2 border-gray-300 mr-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-100 mb-0.5">Available Units</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-white">
                        {availableUnits.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-100">units</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Progress Tables Button */}
            {scoredHistory.length > 0 && (
              <button
                onClick={() => {
                  // Convert scored history to progress data format for the modal
                  const allProgressData = scoredHistory.flatMap(item =>
                    item.scoredResumes.map(resume => ({
                      id: resume.id,
                      candidateName: resume.candidateName || resume.name || 'Unknown',
                      jobTitle: item.jobTitle,
                      jobId: item.jobId,
                      source: item.source === 'my-resumes' ? 'My Resumes' : 'Internal DB' as 'My Resumes' | 'Internal DB',
                      status: 'Scored successfully' as const,
                      scoredDateTime: new Date(item.scoredAt),
                      matchResult: resume.matchScore >= 85 ? 'Exact Match' :
                                   resume.matchScore >= 70 ? 'Partial Match' : 'No Match' as 'Exact Match' | 'Partial Match' | 'No Match',
                      score: resume.matchScore,
                    }))
                  );
                  setProgressData(allProgressData);
                  setShowJobTitleColumn(true);
                  setFilterByJobId(undefined);
                  setShowProgressModal(true);
                }}
                className="px-5 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                <Clock className="w-4 h-4" />
                Progress Tables
                <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                  {scoredHistory.reduce((sum, item) => sum + item.totalScored, 0)}
                </span>
              </button>
            )}

            {/* View All Candidates Button */}
            <button
              onClick={handleToggleGlobalView}
              className={`px-5 py-2.5 rounded-lg transition-all text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md ${
                isGlobalView
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Eye className="w-4 h-4" />
              {isGlobalView ? 'View by Job' : 'View All Candidates'}
            </button>

            <button
              onClick={() => {
                setViewMode('new');
                setSelectedJob('');
                setResumeSource(null);
                setSelectedResumes([]);
              }}
              className="px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
            >
              <Target className="w-4 h-4" />
              Score Resumes
            </button>
          </div>
        </div>

        {/* Global View - All Scored Candidates */}
        {isGlobalView ? (
          <div className="space-y-4">
            {isLoadingGlobal ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <Loader className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Loading all scored candidates...</p>
              </div>
            ) : globalScoredResumes.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <div className="text-gray-400 mb-2">
                  <Search className="w-12 h-12 mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Scored Candidates</h3>
                <p className="text-sm text-gray-600">Score resumes against jobs to see them here.</p>
              </div>
            ) : (
              <ScoredResumesTable
                resumes={globalScoredResumes}
                jobTitle="All Jobs"
                jobId="global"
                availableUnits={availableUnits || 0}
                onViewCandidate={(resume) => {
                  setSelectedCandidateForView(resume);
                  setViewMode('candidateView');
                }}
                selectedResumes={selectedScoredResumes}
                onSelectResume={(id) => {
                  setSelectedScoredResumes(prev =>
                    prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
                  );
                }}
                onSelectAll={(ids) => setSelectedScoredResumes(ids)}
                isGlobalView={true}
              />
            )}
          </div>
        ) : (
        <>
        {/* View Toggle and Download Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setHistoryViewMode('grid')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    historyViewMode === 'grid'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Grid
                </button>
                <button
                  onClick={() => setHistoryViewMode('list')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    historyViewMode === 'list'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List className="w-4 h-4" />
                  List
                </button>
              </div>

              {selectedHistoryItems.size > 0 && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-sm text-gray-600">
                    {selectedHistoryItems.size} selected
                  </span>
                </div>
              )}
            </div>

            {selectedHistoryItems.size > 0 && (
              <button
                onClick={handleDownloadSelectedHistory}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium shadow-sm hover:shadow-md"
              >
                <Download className="w-4 h-4" />
                Download Selected ({selectedHistoryItems.size})
              </button>
            )}
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search by job title..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <button
              onClick={() => setShowHistoryFilters(!showHistoryFilters)}
              className={`px-5 py-2.5 rounded-lg border-2 transition-all flex items-center gap-2 font-medium ${
                activeFiltersCount > 0
                  ? 'bg-gray-50 border-gray-800 text-gray-900 shadow-sm'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
              }`}
            >
              <Filter className="w-5 h-5" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="px-2 py-0.5 bg-gray-800 text-white rounded-full text-xs font-medium">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${showHistoryFilters ? 'rotate-180' : ''}`} />
            </button>

            <div className="text-sm text-gray-700 bg-gray-100 px-4 py-2.5 rounded-lg whitespace-nowrap font-medium border border-gray-200">
              <span className="text-gray-800">{filteredHistory.length}</span> of {scoredHistory.length} jobs
            </div>
          </div>

          {/* Expanded Filters */}
          {showHistoryFilters && (
            <div className="mt-5 pt-5 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Resume Source
                  </label>
                  <select
                    value={historySourceFilter}
                    onChange={(e) => setHistorySourceFilter(e.target.value as 'all' | 'my-resumes' | 'database')}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent bg-white transition-shadow"
                  >
                    <option value="all">All Sources</option>
                    <option value="my-resumes">My Resumes</option>
                    <option value="database">Resume Database</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scored From
                  </label>
                  <input
                    type="date"
                    value={historyDateFrom}
                    onChange={(e) => setHistoryDateFrom(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent bg-white transition-shadow"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scored To
                  </label>
                  <input
                    type="date"
                    value={historyDateTo}
                    onChange={(e) => setHistoryDateTo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent bg-white transition-shadow"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Min Candidates: <span className="text-gray-800">{historyMinCandidates}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={historyMinCandidates}
                    onChange={(e) => setHistoryMinCandidates(Number(e.target.value))}
                    className="w-full accent-gray-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Min Avg Score: <span className="text-gray-800">{historyAvgScoreMin}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={historyAvgScoreMin}
                    onChange={(e) => setHistoryAvgScoreMin(Number(e.target.value))}
                    className="w-full accent-gray-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setHistorySearchQuery('');
                      setHistorySourceFilter('all');
                      setHistoryDateFrom('');
                      setHistoryDateTo('');
                      setHistoryMinCandidates(0);
                      setHistoryAvgScoreMin(0);
                    }}
                    disabled={activeFiltersCount === 0}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-medium hover:border-gray-400"
                  >
                    <X className="w-4 h-4" />
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* History List or Empty State */}
        {filteredHistory.length > 0 ? (
          <div className={historyViewMode === 'grid' ? 'grid gap-5' : 'space-y-3'}>
            {filteredHistory.map((item) => {
              const avgScore = item.scoredResumes.length > 0
                ? Math.round(item.scoredResumes.reduce((sum, r) => sum + r.matchScore, 0) / item.scoredResumes.length)
                : 0;

              const excellentCount = item.scoredResumes.filter(r => r.matchScore >= 85).length;
              const goodCount = item.scoredResumes.filter(r => r.matchScore >= 70 && r.matchScore < 85).length;
              const moderateCount = item.scoredResumes.filter(r => r.matchScore < 70).length;
              const isSelected = selectedHistoryItems.has(item.id);

              const jobDetails = jobs.find(j => j.id === item.jobId);

              if (historyViewMode === 'list') {
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg border-2 transition-all p-4 border-gray-200 hover:border-gray-300"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-gray-800 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
                        <Target className="w-5 h-5 text-white" />
                      </div>

                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => {
                          setSelectedHistoryItem(item);
                          setViewMode('details');
                          // Save to localStorage for persistence
                          try {
                            localStorage.setItem('lastViewedScoringJdId', item.jobId);
                          } catch (e) {
                            console.error('Failed to save last viewed JD:', e);
                          }
                          router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                        }}
                      >
                        <h3 className="text-lg text-gray-900 mb-1 hover:text-gray-800 transition-colors">
                          {item.jobTitle}
                        </h3>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <Clock className="w-4 h-4" />
                          {new Date(item.scoredAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <FileText className="w-4 h-4" />
                          {item.totalScored} candidates
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                          item.source === 'my-resumes'
                            ? 'bg-gray-100 text-gray-900 border border-gray-200'
                            : 'bg-gray-100 text-gray-900 border border-gray-200'
                        }`}>
                          {item.source === 'my-resumes' ? (
                            <>
                              <FolderOpen className="w-3 h-3" />
                              My Resumes
                            </>
                          ) : (
                            <>
                              <Database className="w-3 h-3" />
                              Database
                            </>
                          )}
                        </span>

                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                          <span className="text-xs text-gray-600">Avg Score:</span>
                          <span className={`text-base font-semibold ${
                            avgScore >= 85 ? 'text-green-600' : avgScore >= 70 ? 'text-gray-800' : 'text-yellow-600'
                          }`}>
                            {avgScore}%
                          </span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Show COMPLETED progress for this specific job - don't re-score
                            const resumes = item.scoredResumes || [];
                            console.log('[ViewProgress] scoredResumes:', resumes);

                            // Calculate actual completed/failed counts
                            const failedCount = resumes.filter(r => r.status === 'failed' || r.errorReason).length;
                            const completedCount = resumes.length - failedCount;

                            const jobProgress: JobScoringProgress[] = [{
                              jobId: item.jobId,
                              jobTitle: item.jobTitle,
                              total: resumes.length || item.totalScored,
                              queued: 0,
                              inProgress: 0,
                              completed: completedCount,
                              failed: failedCount,
                              items: resumes.map(resume => ({
                                resumeId: resume.resumeId || resume.id || '',
                                candidateName: resume.candidateName || resume.candidate_name || resume.name || 'Unknown',
                                status: (resume.status === 'failed' || resume.errorReason) ? 'failed' as const : 'completed' as const,
                                score: resume.matchScore || resume.scorePercentage || resume.score,
                                errorMessage: resume.errorReason || resume.error_reason,
                              })),
                            }];
                            console.log('[ViewProgress] jobProgress items:', jobProgress[0].items);
                            setJobProgressData(jobProgress);
                            setShowJobProgressModal(true);
                          }}
                          className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium flex items-center gap-1.5"
                        >
                          <Eye className="w-4 h-4" />
                          View Progress
                        </button>
                        <button
                          onClick={() => {
                            setSelectedHistoryItem(item);
                            setViewMode('details');
                            // Save to localStorage for persistence
                            try {
                              localStorage.setItem('lastViewedScoringJdId', item.jobId);
                            } catch (e) {
                              console.error('Failed to save last viewed JD:', e);
                            }
                            router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                          }}
                          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // Grid View
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border-2 transition-all p-6 group border-gray-200 hover:border-gray-400 hover:shadow-lg"
                >
                  <div className="flex items-start gap-6">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => {
                        setSelectedHistoryItem(item);
                        setViewMode('details');
                        router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                      }}
                    >
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
                          <Target className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl text-gray-900 mb-2 group-hover:text-gray-800 transition-colors">
                            {item.jobTitle}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-3">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              Scored {new Date(item.scoredAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <FileText className="w-4 h-4" />
                              {item.totalScored} candidates
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                              item.source === 'my-resumes'
                                ? 'bg-gray-100 text-gray-900 border border-gray-200'
                                : 'bg-gray-100 text-gray-900 border border-gray-200'
                            }`}>
                              {item.source === 'my-resumes' ? (
                                <>
                                  <FolderOpen className="w-3 h-3" />
                                  My Resumes
                                </>
                              ) : (
                                <>
                                  <Database className="w-3 h-3" />
                                  Database
                                </>
                              )}
                            </span>
                          </div>

                          {jobDetails && (
                            <div className="bg-gradient-to-r from-gray-50 to-gray-50/30 border border-gray-200 rounded-lg p-4 mb-4">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                                <div className="flex items-start gap-2">
                                  <MapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500 mb-0.5">Location</div>
                                    <div className="text-sm text-gray-900 font-medium">{jobDetails.location}</div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <Briefcase className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500 mb-0.5">Department</div>
                                    <div className="text-sm text-gray-900 font-medium">{jobDetails.department}</div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <User className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500 mb-0.5">Employment Type</div>
                                    <div className="text-sm text-gray-900 font-medium">{jobDetails.employmentType || 'Full-time'}</div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <Award className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500 mb-0.5">Experience</div>
                                    <div className="text-sm text-gray-900 font-medium">{jobDetails.experience || 'Not specified'}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">Excellent</span>
                            <Award className="w-4 h-4 text-green-600" />
                          </div>
                          <div className="text-2xl text-green-700 font-bold">{excellentCount}</div>
                          <div className="text-xs text-gray-600 mt-0.5">85%+ match</div>
                        </div>

                        <div className="bg-gradient-to-br from-gray-50 to-sky-50 border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">Good</span>
                            <CheckCircle className="w-4 h-4 text-gray-800" />
                          </div>
                          <div className="text-2xl text-gray-900 font-bold">{goodCount}</div>
                          <div className="text-xs text-gray-600 mt-0.5">70-84% match</div>
                        </div>

                        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">Moderate</span>
                            <TrendingUp className="w-4 h-4 text-yellow-600" />
                          </div>
                          <div className="text-2xl text-yellow-700 font-bold">{moderateCount}</div>
                          <div className="text-xs text-gray-600 mt-0.5">&lt;70% match</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-center">
                      <div className="text-sm text-gray-600 mb-2 font-medium">Avg Score</div>
                      <div className={`text-4xl font-bold mb-2 ${getScoreColor(avgScore)}`}>
                        {avgScore}%
                      </div>
                      <div className={`inline-block px-3 py-1.5 rounded-full text-xs border font-medium ${getScoreBgColor(avgScore)}`}>
                        {getScoreLabel(avgScore)}
                      </div>

                      <div className="mt-4 flex flex-col gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Show COMPLETED progress for this specific job - don't re-score
                            const resumes = item.scoredResumes || [];

                            // Calculate actual completed/failed counts
                            const failedCount = resumes.filter(r => r.status === 'failed' || r.errorReason).length;
                            const completedCount = resumes.length - failedCount;

                            const jobProgress: JobScoringProgress[] = [{
                              jobId: item.jobId,
                              jobTitle: item.jobTitle,
                              total: resumes.length || item.totalScored,
                              queued: 0,
                              inProgress: 0,
                              completed: completedCount,
                              failed: failedCount,
                              items: resumes.map(resume => ({
                                resumeId: resume.resumeId || resume.id || '',
                                candidateName: resume.candidateName || resume.candidate_name || resume.name || 'Unknown',
                                status: (resume.status === 'failed' || resume.errorReason) ? 'failed' as const : 'completed' as const,
                                score: resume.matchScore || resume.scorePercentage || resume.score,
                                errorMessage: resume.errorReason || resume.error_reason,
                              })),
                            }];
                            setJobProgressData(jobProgress);
                            setShowJobProgressModal(true);
                          }}
                          className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium flex items-center gap-1.5 justify-center"
                        >
                          <Eye className="w-4 h-4" />
                          View Progress
                        </button>
                        <button
                          onClick={() => {
                            setSelectedHistoryItem(item);
                            setViewMode('details');
                            // Save to localStorage for persistence
                            try {
                              localStorage.setItem('lastViewedScoringJdId', item.jobId);
                            } catch (e) {
                              console.error('Failed to save last viewed JD:', e);
                            }
                            router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                          }}
                          className="text-gray-800 hover:text-gray-900 text-sm font-medium flex items-center gap-1 justify-center cursor-pointer"
                        >
                          View Details
                          <ArrowLeft className="w-4 h-4 rotate-180 hover:translate-x-1 transition-transform" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : scoredHistory.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-gray-100 to-gray-100 rounded-full flex items-center justify-center">
                <History className="w-10 h-10 text-gray-800" />
              </div>
              <h3 className="text-xl text-gray-900 mb-2">No Scoring History Yet</h3>
              <p className="text-gray-600 mb-6">
                Start scoring resumes against job descriptions to see your results here. Our AI will analyze and rank candidates based on job fit.
              </p>
              <button
                onClick={() => {
                  setViewMode('new');
                  setSelectedJob('');
                  setResumeSource(null);
                  setSelectedResumes([]);
                }}
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium shadow-sm hover:shadow-md inline-flex items-center gap-2"
              >
                <Target className="w-5 h-5" />
                Score Resumes Now
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-gray-100 to-gray-100 rounded-full flex items-center justify-center">
                <Search className="w-10 h-10 text-gray-800" />
              </div>
              <h3 className="text-xl text-gray-900 mb-2">No Results Found</h3>
              <p className="text-gray-600 mb-6">
                No scored jobs match your current filters. Try adjusting your search criteria or clearing filters.
              </p>
              <button
                onClick={() => {
                  setHistorySearchQuery('');
                  setHistorySourceFilter('all');
                  setHistoryDateFrom('');
                  setHistoryDateTo('');
                  setHistoryMinCandidates(0);
                  setHistoryAvgScoreMin(0);
                }}
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium shadow-sm hover:shadow-md inline-flex items-center gap-2"
              >
                <X className="w-5 h-5" />
                Clear All Filters
              </button>
            </div>
          </div>
        )}
        </>
        )}

        {showProgressModal && (
          <BulkScoringProgressModal
            progressData={progressData}
            onClose={() => setShowProgressModal(false)}
            showJobTitleColumn={showJobTitleColumn}
            onRetryFailed={async (item) => {
              try {
                // Update item status to "Scoring in progress"
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? { ...p, status: 'Scoring in progress' as const, errorReason: undefined }
                    : p
                ));

                // Check quota before retry
                const quotaResponse = await api.get('/usage/quota-status');
                const quotas = quotaResponse.data?.data?.quotas;
                const remainingUnits = quotas?.RS?.total_remaining || 0;

                if (remainingUnits < 1) {
                  setProgressData(prev => prev.map(p =>
                    p.id === item.id
                      ? { ...p, status: 'Failed' as const, errorReason: 'Insufficient scoring units' }
                      : p
                  ));
                  toast.error('Insufficient scoring units for retry');
                  return;
                }

                // Retry scoring
                await scoringService.scoreResume(item.jobId, item.resumeId);

                // Fetch updated score
                const historyResponse = await jdService.getScoredResumes(item.jobId);
                const scoredResume = historyResponse.resumes?.find(r => r.resume_id === item.resumeId);

                // Update item with success status
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? {
                        ...p,
                        status: 'Scored successfully' as const,
                        errorReason: undefined,
                        scoredDateTime: new Date(),
                        matchResult: scoredResume
                          ? (scoredResume.match_score >= 85 ? 'Exact Match'
                             : scoredResume.match_score >= 70 ? 'Partial Match'
                             : 'No Match') as 'Exact Match' | 'Partial Match' | 'No Match'
                          : undefined,
                        score: scoredResume?.match_score
                      }
                    : p
                ));

                toast.success(`Successfully scored ${item.candidateName}`);
              } catch (error: any) {
                // Update item with failure status
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? {
                        ...p,
                        status: 'Failed' as const,
                        errorReason: error?.message || 'Retry failed'
                      }
                    : p
                ));
                toast.error(`Failed to retry scoring for ${item.candidateName}`);
              }
            }}
          />
        )}

        {/* Job Progress Modal - Per Job View */}
        <ScoringJobProgressModal
          isOpen={showJobProgressModal}
          onClose={() => {
            setShowJobProgressModal(false);
            setIsJobProgressMinimized(false);
          }}
          onMinimize={() => setIsJobProgressMinimized(!isJobProgressMinimized)}
          isMinimized={isJobProgressMinimized}
          jobProgressData={jobProgressData}
          onRetryFailed={async (resumeId, jobId) => {
            try {
              setJobProgressData(prev => prev.map(job => ({
                ...job,
                items: job.items?.map(item =>
                  item.resumeId === resumeId
                    ? { ...item, status: 'processing' as const, errorMessage: undefined }
                    : item
                )
              })));
              const result = await scoringService.scoreResume(jobId, resumeId);
              setJobProgressData(prev => prev.map(job => ({
                ...job,
                failed: job.items?.filter(i => i.resumeId === resumeId && i.status === 'failed').length ? job.failed - 1 : job.failed,
                completed: job.items?.filter(i => i.resumeId === resumeId).length ? job.completed + 1 : job.completed,
                items: job.items?.map(item =>
                  item.resumeId === resumeId
                    ? { ...item, status: 'completed' as const, score: result?.match_score }
                    : item
                )
              })));
              toast.success('Retry successful');
            } catch (error: any) {
              setJobProgressData(prev => prev.map(job => ({
                ...job,
                items: job.items?.map(item =>
                  item.resumeId === resumeId
                    ? { ...item, status: 'failed' as const, errorMessage: error?.message || 'Retry failed' }
                    : item
                )
              })));
              toast.error('Retry failed');
            }
          }}
          onViewJobDetails={(jobId) => {
            setShowJobProgressModal(false);
            setIsJobProgressMinimized(false);
            const historyItem = scoredHistory.find(item => item.jobId === jobId);
            if (historyItem) {
              setSelectedHistoryItem(historyItem);
              setViewMode('details');
            }
          }}
        />
      </main>
    );
  }

  // New Scoring Flow
  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-gray-50 to-white">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => {
              setViewMode('history');
              setSelectedJob('');
              setResumeSource(null);
              setSelectedResumes([]);
            }}
            className="p-2.5 hover:bg-white/80 rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200 group"
            title="Back to Scored Candidates"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-lg">
            <Target className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-gray-900 text-xl font-semibold">Score Resumes</h1>
            <p className="text-sm text-gray-600">Select a job and let AI match the best candidates</p>
          </div>

          {/* Available Units Display */}
          {availableUnits !== null && (
            <div className="bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl shadow-lg p-4 border-2 border-gray-300">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-xs text-gray-100 mb-0.5">Available Units</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">
                      {availableUnits.toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-100">units</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Progress Indicator */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                selectedJob
                  ? 'bg-green-600 text-white ring-4 ring-green-100'
                  : 'bg-gray-800 text-white ring-4 ring-gray-200'
              }`}>
                {selectedJob ? <CheckCircle2 className="w-5 h-5" /> : '1'}
              </div>
              <span className="text-sm font-medium text-gray-700">Select Job</span>
            </div>
            <div className={`flex-1 h-1 mx-4 rounded-full transition-all ${
              selectedJob ? 'bg-green-600' : 'bg-gray-200'
            }`}></div>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                selectedJob
                  ? 'bg-gray-800 text-white ring-4 ring-gray-200'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                2
              </div>
              <span className={`text-sm font-medium transition-colors ${
                selectedJob ? 'text-gray-700' : 'text-gray-400'
              }`}>View Results</span>
            </div>
          </div>
        </div>
      </div>

      {/* Step 1: Job Selection */}
      <div className={`bg-white rounded-xl shadow-lg p-6 mb-6 transition-all ${
        selectedJob
          ? 'border-2 border-green-300 bg-green-50/30'
          : 'border-2 border-gray-300'
      }`}>
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
            selectedJob
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-white'
          }`}>
            {selectedJob ? <CheckCircle2 className="w-6 h-6" /> : '1'}
          </div>
          <div>
            <h3 className="text-gray-900 font-medium">Select Job Description</h3>
            <p className="text-sm text-gray-600">Choose which role you want to score candidates for</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="flex-1">
            <select
              value={selectedJob}
              onChange={(e) => {
                setSelectedJob(e.target.value);
                setResumeSource(null);
                setSelectedResumes([]);
                setShowResults(false);
              }}
              className="w-full px-4 py-3.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent bg-white transition-shadow text-gray-900 font-medium"
            >
              <option value="">-- Choose a published job --</option>
              {publishedJobs.length === 0 ? (
                <option disabled>No published jobs available</option>
              ) : (
                publishedJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} - {job.location} - {job.applicants} applicants
                  </option>
                ))
              )}
            </select>

            {publishedJobs.length === 0 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-800 font-medium mb-1">No Published Jobs</p>
                  <p className="text-sm text-yellow-700">
                    You need to publish at least one job before you can score resumes. Go to JD Creation to create and publish jobs.
                  </p>
                </div>
              </div>
            )}

            {selectedJobData && (
              <div className="mt-4 p-5 bg-gradient-to-br from-gray-50 to-gray-50 border-2 border-gray-200 rounded-xl">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg text-gray-900 mb-1 font-medium">{selectedJobData.title}</h4>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4" />
                            {selectedJobData.location}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Briefcase className="w-4 h-4" />
                            {selectedJobData.department}
                          </span>
                          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-full text-gray-900 font-medium">
                            <User className="w-4 h-4" />
                            {selectedJobData.applicants} applicants
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowResumeSelectionModal(true)}
                    className="px-6 py-3 bg-gradient-to-r from-gray-800 to-gray-800 text-white rounded-lg hover:from-gray-700 hover:to-gray-900 transition-all text-sm font-medium flex items-center gap-2 shadow-md hover:shadow-lg"
                  >
                    <Target className="w-5 h-5" />
                    Select Resumes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Help Text */}
      {!selectedJob && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-start gap-3">
          <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="text-gray-900 font-medium mb-1">How Resume Scoring Works</h4>
            <ul className="text-sm text-gray-700 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-gray-800 mt-0.5">1.</span>
                <span><strong>Step 1:</strong> Select a published job description from the dropdown above</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-800 mt-0.5">2.</span>
                <span><strong>Step 2:</strong> Click &quot;Select Resumes&quot; to open the resume selection modal</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-800 mt-0.5">3.</span>
                <span><strong>Step 3:</strong> Choose resumes from &quot;My Resumes&quot; folders or &quot;Internal Database&quot;</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-800 mt-0.5">4.</span>
                <span><strong>Step 4:</strong> Select candidates and click &quot;Score Resumes&quot; to analyze with AI</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-800 mt-0.5">5.</span>
                <span><strong>Step 5:</strong> Review scored candidates ranked by match percentage and quality</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Resume Selection Modal */}
      {showResumeSelectionModal && selectedJobData && (
        <ResumeSelectionModal
          jobTitle={selectedJobData.title}
          myResumes={myResumes}
          databaseResumes={databaseResumes}
          folders={folders}
          availableUnits={availableUnits}
          onClose={() => setShowResumeSelectionModal(false)}
          onScoreResumes={async (selectedIds, source, versionSelections) => {
            setShowResumeSelectionModal(false);

            // Check for existing scores before proceeding
            try {
              toast.loading('Checking for existing scores...', { id: 'check-existing' });
              const checkResult = await scoringService.checkExistingScores(selectedJob, selectedIds);
              toast.dismiss('check-existing');

              if (checkResult.existing_count > 0) {
                // Show alert modal with existing scores
                setExistingScoreData({
                  jdTitle: selectedJobData.title,
                  existingScores: checkResult.existing_scores,
                  totalChecked: checkResult.total_checked,
                  newCount: checkResult.new_count,
                  pendingResumeIds: selectedIds,
                  pendingSource: source,
                });
                setShowExistingScoreAlert(true);
                return;
              }
            } catch (error) {
              console.error('Failed to check existing scores:', error);
              toast.dismiss('check-existing');
              // Continue with scoring if check fails
            }

            // Get resume names - use versionSelections if available, otherwise fall back to resumes list
            let resumeNames: string[];
            if (versionSelections && versionSelections.length > 0) {
              // Use candidate names from version selections
              resumeNames = versionSelections.map(v => v.candidateName || 'Unknown');
            } else {
              // Fall back to finding names from resumes list
              const selectedResumesData = resumes.filter(r => selectedIds.includes(r.id));
              resumeNames = selectedResumesData.map(r => r.name || r.candidateName || r.candidate_name || 'Unknown');
            }

            // Start scoring in background and redirect to resume-scoring page with progress view
            // Store pending scoring data in sessionStorage so it can be picked up after redirect
            const pendingData = {
              jobId: selectedJob,
              jobTitle: selectedJobData.title,
              resumeIds: selectedIds,
              resumeNames: resumeNames,
            };
            sessionStorage.setItem('pendingScoringData', JSON.stringify(pendingData));

            // Redirect to resume-scoring page with start_scoring=true to trigger scoring and show_progress=true to auto-open progress view
            // Use window.location.href for full page reload so useEffect runs and reads sessionStorage
            window.location.href = `/recruitment/resume-scoring?jd_id=${selectedJob}&start_scoring=true&show_progress=true`;
          }}
        />
      )}

      {/* Existing Score Alert Modal */}
      {showExistingScoreAlert && existingScoreData && (
        <ExistingScoreAlertModal
          isOpen={showExistingScoreAlert}
          onClose={() => {
            setShowExistingScoreAlert(false);
            setExistingScoreData(null);
          }}
          jdTitle={existingScoreData.jdTitle}
          existingScores={existingScoreData.existingScores}
          totalChecked={existingScoreData.totalChecked}
          newCount={existingScoreData.newCount}
          onViewExisting={(scoreId) => {
            setShowExistingScoreAlert(false);
            setExistingScoreData(null);
            // Navigate to the scored candidate view
            router.push(`/recruitment/resume-scoring?jd_id=${selectedJob}&score_id=${scoreId}`);
          }}
          onProceedWithRescoring={() => {
            setShowExistingScoreAlert(false);
            // Proceed with all selected resumes (re-score)
            const selectedResumesData = resumes.filter(r =>
              existingScoreData.pendingResumeIds.includes(r.id)
            );
            // Store pending scoring data and redirect to resume-scoring page with progress view
            const pendingData = {
              jobId: selectedJob,
              jobTitle: selectedJobData?.title || '',
              resumeIds: existingScoreData.pendingResumeIds,
              resumeNames: selectedResumesData.map(r => r.name || r.candidateName || r.candidate_name || 'Unknown'),
            };
            sessionStorage.setItem('pendingScoringData', JSON.stringify(pendingData));
            setExistingScoreData(null);
            // Use window.location.href for full page reload so useEffect runs and reads sessionStorage
            window.location.href = `/recruitment/resume-scoring?jd_id=${selectedJob}&start_scoring=true&show_progress=true`;
          }}
          onProceedWithNewOnly={existingScoreData.newCount > 0 ? () => {
            setShowExistingScoreAlert(false);
            // Filter out already scored resumes
            const existingResumeIds = new Set(existingScoreData.existingScores.map(s => s.resume_id));
            const newResumeIds = existingScoreData.pendingResumeIds.filter(id => !existingResumeIds.has(id));
            const selectedResumesData = resumes.filter(r => newResumeIds.includes(r.id));
            // Store pending scoring data and redirect to resume-scoring page with progress view
            const pendingData = {
              jobId: selectedJob,
              jobTitle: selectedJobData?.title || '',
              resumeIds: newResumeIds,
              resumeNames: selectedResumesData.map(r => r.name || r.candidateName || r.candidate_name || 'Unknown'),
            };
            sessionStorage.setItem('pendingScoringData', JSON.stringify(pendingData));
            setExistingScoreData(null);
            // Use window.location.href for full page reload so useEffect runs and reads sessionStorage
            window.location.href = `/recruitment/resume-scoring?jd_id=${selectedJob}&start_scoring=true&show_progress=true`;
          } : undefined}
        />
      )}

      {/* Real-Time Scoring Status Panel - COMMENTED OUT: Now redirects to resume-scoring page with progress view instead */}
      {/* {showScoringPanel && selectedJobData && (
        <div className={isScoringMinimized ? 'hidden' : ''}>
          <ResumeScoringStatusPanel
            resumes={resumesToScore}
            jobTitle={selectedJobData.title}
            jobId={selectedJob}
            isMinimized={isScoringMinimized}
            onComplete={(scoredResults) => {
              setShowScoringPanel(false);
              setIsScoringMinimized(false);

              if (onSaveScores) {
                const scoredData: ScoredResumeData = {
                  id: Date.now().toString(),
                  jobId: selectedJob,
                  jobTitle: selectedJobData.title,
                  scoredAt: new Date(),
                  source: scoringSource,
                  totalScored: scoredResults.length,
                  scoredResumes: scoredResults,
                };

                onSaveScores(scoredData);
                setSelectedHistoryItem(scoredData);
                setViewMode('details');
              }
            }}
            onMinimize={() => setIsScoringMinimized(true)}
          />
        </div>
      )} */}

      {/* Bulk Scoring Progress Modal */}
      {showProgressModal && (
        <BulkScoringProgressModal
          progressData={progressData}
          onClose={() => setShowProgressModal(false)}
          filterByJobId={filterByJobId}
          showJobTitleColumn={showJobTitleColumn}
          onRetryFailed={async (item) => {
            try {
              console.log('[Retry] Starting retry for:', item.candidateName, 'resumeId:', item.resumeId, 'jobId:', item.jobId);

              // Update item status to "Scoring in progress"
              setProgressData(prev => prev.map(p =>
                p.id === item.id
                  ? { ...p, status: 'Scoring in progress' as const, errorReason: undefined }
                  : p
              ));

              // Check quota before retry
              const quotaResponse = await api.get('/usage/quota-status');
              const quotas = quotaResponse.data?.data?.quotas;
              const remainingUnits = quotas?.RS?.total_remaining || 0;

              if (remainingUnits < 1) {
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? { ...p, status: 'Failed' as const, errorReason: 'Insufficient scoring units' }
                    : p
                ));
                toast.error('Insufficient scoring units for retry');
                return;
              }

              // Retry scoring
              console.log('[Retry] Calling scoreResume with jobId:', item.jobId, 'resumeId:', item.resumeId);
              const scoreResult = await scoringService.scoreResume(item.jobId, item.resumeId);
              console.log('[Retry] Score result:', scoreResult);

              // Update item with success status using the direct result
              setProgressData(prev => prev.map(p =>
                p.id === item.id
                  ? {
                      ...p,
                      status: 'Scored successfully' as const,
                      errorReason: undefined,
                      scoredDateTime: new Date(),
                      matchResult: scoreResult.overall_score >= 85 ? 'Exact Match' as const
                                 : scoreResult.overall_score >= 70 ? 'Partial Match' as const
                                 : 'No Match' as const,
                      score: scoreResult.overall_score
                    }
                  : p
              ));

              toast.success(`Successfully scored ${item.candidateName}`);
            } catch (error: any) {
              console.error('[Retry] Error:', error);
              // Extract detailed error message
              const errorDetail = error?.response?.data?.detail || error?.message || 'Retry failed';
              const errorMsg = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail);

              // Update item with failure status
              setProgressData(prev => prev.map(p =>
                p.id === item.id
                  ? {
                      ...p,
                      status: 'Failed' as const,
                      errorReason: errorMsg
                    }
                  : p
              ));
              toast.error(`Failed: ${errorMsg}`);
            }
          }}
        />
      )}

      {/* Job Progress Modal - Per Job View */}
      <ScoringJobProgressModal
        isOpen={showJobProgressModal}
        onClose={() => {
          setShowJobProgressModal(false);
          setIsJobProgressMinimized(false);
        }}
        onMinimize={() => setIsJobProgressMinimized(!isJobProgressMinimized)}
        isMinimized={isJobProgressMinimized}
        jobProgressData={jobProgressData}
        onRetryFailed={async (resumeId, jobId) => {
          try {
            console.log('[JobProgressRetry] Starting retry for resumeId:', resumeId, 'jobId:', jobId);
            setJobProgressData(prev => prev.map(job => ({
              ...job,
              items: job.items?.map(item =>
                item.resumeId === resumeId
                  ? { ...item, status: 'processing' as const, errorMessage: undefined }
                  : item
              )
            })));
            const result = await scoringService.scoreResume(jobId, resumeId);
            console.log('[JobProgressRetry] Score result:', result);
            setJobProgressData(prev => prev.map(job => ({
              ...job,
              failed: job.items?.filter(i => i.resumeId === resumeId && i.status === 'failed').length ? job.failed - 1 : job.failed,
              completed: job.items?.filter(i => i.resumeId === resumeId).length ? job.completed + 1 : job.completed,
              items: job.items?.map(item =>
                item.resumeId === resumeId
                  ? { ...item, status: 'completed' as const, score: result?.overall_score || result?.match_score }
                  : item
              )
            })));
            toast.success('Retry successful');
          } catch (error: any) {
            console.error('[JobProgressRetry] Error:', error);
            const errorDetail = error?.response?.data?.detail || error?.message || 'Retry failed';
            const errorMsg = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail);
            setJobProgressData(prev => prev.map(job => ({
              ...job,
              items: job.items?.map(item =>
                item.resumeId === resumeId
                  ? { ...item, status: 'failed' as const, errorMessage: errorMsg }
                  : item
              )
            })));
            toast.error(`Failed: ${errorMsg}`);
          }
        }}
        onViewJobDetails={(jobId) => {
          setShowJobProgressModal(false);
          setIsJobProgressMinimized(false);
          const historyItem = scoredHistory.find(item => item.jobId === jobId);
          if (historyItem) {
            setSelectedHistoryItem(historyItem);
            setViewMode('details');
          }
        }}
      />
    </main>
  );
}
