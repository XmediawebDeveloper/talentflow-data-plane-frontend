"use client";

import { Target, Briefcase, Filter, Search, FileText, User, MapPin, Mail, Phone, CheckCircle, FolderOpen, Database, TrendingUp, Award, ChevronDown, Download, Clock, History, Eye, X, ArrowLeft, Send, MousePointer, PlayCircle, CheckCircle2, XCircle, AlertCircle, DollarSign, List, LayoutGrid, Loader, Square, CheckSquare, ChevronRight, Building2, Calendar, Users } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ScoredResumesTable from './ScoredResumesTable';
import ListPagination from './ListPagination';
import ResumeSelectionModal from './ResumeSelectionModal';
import ResumeScoringStatusPanel from './ResumeScoringStatusPanel';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';
import api from '@/lib/services/api';
import { scoringService } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { Resume as SharedResume } from '@/lib/types/types';
import { useAuth } from '@/components/providers/AuthProvider';
import { formatIST, formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';

const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '-';
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const formatIndustryType = (type: string | undefined): string => {
  if (!type) return '-';
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

// Helper function to convert backend match_status to frontend format
const convertMatchStatus = (status: string | undefined): 'Exact Match' | 'Partial Match' | 'No Match' => {
  if (!status) return 'No Match';

  const normalized = status.toLowerCase().trim();

  // Handle all possible backend formats
  if (normalized === 'exact_match' || normalized === 'exact match' || normalized === 'excellent') {
    return 'Exact Match';
  } else if (normalized === 'partial_match' || normalized === 'partial match' || normalized === 'partial') {
    return 'Partial Match';
  } else if (normalized === 'no_match' || normalized === 'no match') {
    return 'No Match';
  }

  // Default fallback
  return 'No Match';
};

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
  job_id?: string;
  current_version?: number;
  published_at?: string;
  created_by_name?: string;
  creation_method?: string;
  industry_type?: string;
  remote_type?: string;
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
  jdStatus?: string;
  jdJobId?: string;
  jdCreationMethod?: string;
  jdCurrentVersion?: number;
  jdDepartment?: string;
  jdIndustryType?: string;
  jdEmploymentType?: string;
  jdRemoteType?: string;
  jdLocation?: string;
  jdPublishedAt?: string;
  jdCreatedByName?: string;
  totalScored: number;
  scoredResumes: any[];
  // Processing state for in-progress jobs
  isProcessing?: boolean;
  processingProgress?: {
    total: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  };
}

interface AlreadyScoredItem {
  resumeId: string;
  candidateName: string;
  score: number;
  scoredAt?: string;
  matchStatus?: string;
}

interface PendingScoringData {
  jobId: string;
  jobTitle: string;
  resumeIds: string[];
  resumeNames: string[];
  alreadyScoredItems?: AlreadyScoredItem[];
}

interface BatchProgressItem {
  resumeId: string;
  candidateName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'already_scored';
  score?: number;
  matchStatus?: string;
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
  onRefreshHistory?: () => Promise<void>;
  onLoadJdScores?: (jdId: string, jdTitle?: string) => Promise<void>;
  onRefreshResumes?: () => Promise<void>;
  onNavigateToAITalentMatch?: (jobId: string) => void;
  onBack?: () => void;
  tenant?: Tenant;
  initialJdId?: string | null;
  initialScoreId?: string | null;
  initialShowProgress?: boolean;
  initialNewScoring?: boolean;
  pendingScoringData?: PendingScoringData | null;
  batchProgress?: BatchProgress | null;
}

export default function ResumeScoringPage({
  jobs: propJobs = [],
  resumes: propResumes = [],
  folders: propFolders = [],
  scoredHistory = [],
  onSaveScores,
  onRefreshHistory,
  onLoadJdScores,
  onRefreshResumes,
  onNavigateToAITalentMatch,
  onBack,
  tenant,
  initialJdId,
  initialScoreId,
  initialShowProgress = false,
  initialNewScoring = false,
  pendingScoringData = null,
  batchProgress = null
}: ResumeScoringPageProps) {
  const router = useRouter();

  // ✅ RBAC: Get user permissions (bypass for tenant admin)
  const { user, isTenantAdmin } = useAuth();
  const canRunScoring = isTenantAdmin || (user?.permissions?.canRunScoring ?? false);
  const canExport = isTenantAdmin || (user?.permissions?.canExport ?? false);

  // Use persistent scoring progress context
  const {
    startScoringJob,
    updateItemStatus,
    getJobProgress,
    hasActiveScoring,
    setOnRestorePanel,
    setMainPanelOpen,
    setMinimized: setContextMinimized,
  } = useScoringProgress();

  // Use props directly - data is fetched by the page route
  const jobs = propJobs;
  const resumes = propResumes;
  const folders = propFolders;

  // View state
  const [viewMode, setViewMode] = useState<'history' | 'details' | 'new' | 'candidateView'>('history');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ScoredResumeData | null>(null);
  const [isWaitingForInitialJd, setIsWaitingForInitialJd] = useState(false);
  // After scoring completes & history refreshes, auto-navigate to this JD's details
  const [pendingAutoSelectJdId, setPendingAutoSelectJdId] = useState<string | null>(null);

  // Track if we've already handled the initialJdId to prevent re-triggering
  const [initialJdHandled, setInitialJdHandled] = useState(false);
  const [selectedCandidateForView, setSelectedCandidateForView] = useState<any | null>(null);
  const [selectedJob, setSelectedJob] = useState('');
  const [resumeSource, setResumeSource] = useState<'my-resumes' | 'internal-database' | null>(null);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showResumeSelectionModal, setShowResumeSelectionModal] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
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

  // Scoring History Modal
  const [historyModalItem, setHistoryModalItem] = useState<ScoredResumeData | null>(null);

  // State for Progress Tables Modal
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressData, setProgressData] = useState<ScoringProgressItem[]>([]);
  const [filterByJobId, setFilterByJobId] = useState<string | undefined>(undefined);
  const [showJobTitleColumn, setShowJobTitleColumn] = useState(false);
  const [isBulkProgressMinimized, setIsBulkProgressMinimized] = useState(false);

  // Hide global floating widget when BulkScoringProgressModal is open and NOT minimized
  // When minimized, setMainPanelOpen(false) lets GlobalScoringProgressIndicator show
  useEffect(() => {
    setMainPanelOpen(showProgressModal && !isBulkProgressMinimized);
    return () => { setMainPanelOpen(false); };
  }, [showProgressModal, isBulkProgressMinimized, setMainPanelOpen]);

  // Helper: Convert job progress items to ScoringProgressItem[] for BulkScoringProgressModal
  const showBulkProgressFromJob = (jobId: string, jobTitle: string, items: any[]) => {
    const progressItems: ScoringProgressItem[] = items.map((item: any) => ({
      id: item.resumeId || '',
      resumeId: item.resumeId || '',
      candidateName: item.candidateName || 'Unknown',
      jobTitle: jobTitle,
      jobId: jobId,
      source: 'Internal DB' as const,
      status: item.status === 'completed'
        ? 'Scored successfully' as const
        : item.status === 'already_scored'
        ? 'Already Scored - Skipped' as const
        : item.status === 'failed'
        ? 'Failed' as const
        : item.status === 'processing'
        ? 'Scoring in progress' as const
        : 'Queued' as const,
      errorReason: item.errorMessage,
      score: item.score,
      scoredDateTime: item.status === 'already_scored' && item.scoredAt
        ? new Date(item.scoredAt)
        : item.status === 'completed'
        ? new Date()
        : undefined,
      matchResult: item.matchStatus
        ? convertMatchStatus(item.matchStatus)
        : undefined,
    }));
    setProgressData(progressItems);
    setFilterByJobId(jobId);
    setShowJobTitleColumn(false);
    setShowProgressModal(true);
  };

  // History filters
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyCreatedBy, setHistoryCreatedBy] = useState('');
  const [historyScoredFrom, setHistoryScoredFrom] = useState('');
  const [historyScoredTo, setHistoryScoredTo] = useState('');
  const [historyLocation, setHistoryLocation] = useState('');
  const [historyJobType, setHistoryJobType] = useState('');
  const [historyIndustry, setHistoryIndustry] = useState('');
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);

  // History view mode and selection
  const [historyViewMode, setHistoryViewMode] = useState<'grid' | 'list'>('list');
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);

  useEffect(() => {
    setHistoryCurrentPage(1);
  }, [historySearchQuery, historyCreatedBy, historyScoredFrom, historyScoredTo, historyLocation, historyJobType, historyIndustry]);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<Set<string>>(new Set());

  // Bulk download state for scored resumes
  const [selectedScoredResumes, setSelectedScoredResumes] = useState<string[]>([]);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);

  // Available units from quota API
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);  // RS quota for scoring
  const [availableASUnits, setAvailableASUnits] = useState<number | null>(null);  // AS quota for invites

  // Global view state (view all scored resumes across all JDs)
  const [isGlobalView, setIsGlobalView] = useState(false);
  const [globalScoredResumes, setGlobalScoredResumes] = useState<any[]>([]);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  // Locally uploaded resumes (from Resume Selection Modal)
  const [uploadedResumes, setUploadedResumes] = useState<SharedResume[]>([]);

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
        scoredBy: item.scored_by_name || item.scored_by || 'AI Engine',
        // Source, Status, Error Reason fields
        source: item.source || 'database',
        status: item.status || 'completed',
        errorReason: item.error_message || item.error_reason || '',
        experience: item.experience_years ? `${item.experience_years} years` : (Array.isArray(item.experience) ? `${item.experience.length} positions` : item.experience),
        experienceDetails: Array.isArray(item.experience) ? item.experience : [],
        education: Array.isArray(item.education) ? (item.education[0]?.degree || `${item.education.length} degrees`) : item.education,
        educationDetails: Array.isArray(item.education) ? item.education : [],
        certifications: item.certifications,
        aiSummary: item.ai_summary,
        strengths: item.strengths,
        gaps: item.gaps,
        jobTitle: item.jd_title,
        jdId: item.jd_id,
        // Version tracking
        version: item.resume_version || 1,
        resumeVersion: item.resume_version || 1,
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

  // Handle initial JD ID from URL - auto-open scored resumes view or start new scoring
  useEffect(() => {
    // Only handle initialJdId once
    if (initialJdHandled) return;

    if (initialJdId) {
      // JD-First Scoring Flow: mode=new from JD module - skip history, go straight to new scoring
      if (initialNewScoring) {
        console.log('[ResumeScoringPage] JD-first flow: pre-selecting JD and entering new scoring mode:', initialJdId);
        // Verify the JD exists in the published jobs list
        const jobExists = jobs.find(j => j.id === initialJdId);
        if (jobExists) {
          setSelectedJob(initialJdId);
          setViewMode('new');
          setResumeSource(null);
          setSelectedResumes([]);
          setIsWaitingForInitialJd(false);
          setInitialJdHandled(true);
          // Auto-open resume selection modal after a short delay for UI to render
          setTimeout(() => {
            setShowResumeSelectionModal(true);
          }, 300);
        } else if (jobs.length === 0) {
          // Jobs not loaded yet - wait
          console.log('[ResumeScoringPage] JD-first flow: waiting for jobs to load');
          return;
        } else {
          console.log('[ResumeScoringPage] JD-first flow: JD not found in published jobs:', initialJdId);
          setIsWaitingForInitialJd(false);
          setInitialJdHandled(true);
        }
        return;
      }

      // Standard flow: look for JD in scored history
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
          // Load full scores for this JD dynamically
          onLoadJdScores?.(historyItem.jobId, historyItem.jobTitle);

          // If we also have a score_id, open the candidate view directly
          if (initialScoreId && historyItem.scoredResumes) {
            const candidateResume = historyItem.scoredResumes.find((r: any) => r.id === initialScoreId);
            if (candidateResume) {
              console.log('[ResumeScoringPage] Found candidate for score_id, opening candidate view:', candidateResume.candidateName);
              setSelectedCandidateForView(candidateResume);
              setViewMode('candidateView');
            } else {
              console.log('[ResumeScoringPage] Score_id not found in resumes, showing details view');
              setViewMode('details');
            }
          } else {
            setViewMode('details');
          }

          setIsWaitingForInitialJd(false);
          setInitialJdHandled(true);

          // Save to localStorage so we can restore this view later
          try {
            localStorage.setItem('lastViewedScoringJdId', initialJdId);
          } catch (e) {
            console.error('Failed to save last viewed JD:', e);
          }

          // If show_progress is requested, open the job progress modal
          // Skip if pendingScoringData exists - that useEffect handles progress with already_scored items
          if (initialShowProgress && !pendingScoringData) {
            console.log('[ResumeScoringPage] Show progress requested, opening progress modal');
            // Build items from scored resumes history
            const progressItems = (historyItem.scoredResumes || []).map((r: any) => ({
              resumeId: r.id || r.resumeId || '',
              candidateName: r.candidateName || r.candidate_name || 'Unknown',
              status: 'completed' as const,
              score: r.overallScore ?? r.overall_score ?? 0,
            }));
            shownJobsRef.current.add(historyItem.jobId);
            showBulkProgressFromJob(historyItem.jobId, historyItem.jobTitle, progressItems);
          }
        } else {
          console.log('[ResumeScoringPage] No history item found for JD:', initialJdId);
          // History is loaded but JD not found - stop waiting and show history view
          setIsWaitingForInitialJd(false);
          setInitialJdHandled(true);
        }
      }
    }
  }, [initialJdId, initialScoreId, scoredHistory, initialShowProgress, initialJdHandled, isWaitingForInitialJd, pendingScoringData, initialNewScoring, jobs]);

  // After scoring completes: auto-navigate to details view once scoredHistory is refreshed
  useEffect(() => {
    if (!pendingAutoSelectJdId) return;
    const historyItem = scoredHistory.find(h => h.jobId === pendingAutoSelectJdId);
    if (historyItem) {
      setSelectedHistoryItem(historyItem);
      setViewMode('details');
      setPendingAutoSelectJdId(null);
      // Load full scores for this JD dynamically
      onLoadJdScores?.(historyItem.jobId, historyItem.jobTitle);
    }
  }, [pendingAutoSelectJdId, scoredHistory]);

  // Sync selectedHistoryItem when scoredHistory is updated (e.g. after loadJdScores completes)
  useEffect(() => {
    if (!selectedHistoryItem) return;
    const updated = scoredHistory.find(h => h.jobId === selectedHistoryItem.jobId);
    if (updated && updated !== selectedHistoryItem) {
      setSelectedHistoryItem(updated);
    }
  }, [scoredHistory]);

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
        // FIX: Use AS (Assessment) quota for invite button, not RS
        if (quotas?.AS) {
          setAvailableASUnits(quotas.AS.total_remaining || 0);
        }
      } catch (error) {
        console.log('[ResumeScoringPage] Failed to load quota:', error);
      }
    };
    fetchQuota();
  }, []);

  // Track jobs that have already started scoring to prevent duplicate scoring
  const scoringStartedRef = useRef<Set<string>>(new Set());

  // Handle pending scoring from my-resumes page - start scoring and show progress modal
  useEffect(() => {
    if (!pendingScoringData) return;

    const { jobId, jobTitle, resumeIds, resumeNames, alreadyScoredItems = [] } = pendingScoringData;

    // Prevent duplicate scoring - check if this job has already started
    if (scoringStartedRef.current.has(jobId)) {
      console.log('[ResumeScoringPage] Scoring already started for job:', jobId, '- skipping');
      return;
    }
    scoringStartedRef.current.add(jobId);

    const totalItems = resumeIds.length + alreadyScoredItems.length;
    console.log('[ResumeScoringPage] Starting pending scoring for job:', jobTitle, 'with', resumeIds.length, 'new resumes,', alreadyScoredItems.length, 'already scored');

    // Build already-scored items for the progress modal
    const alreadyScoredProgressItems: { resumeId: string; candidateName: string; status: 'already_scored'; score?: number; scoredAt?: string; matchStatus?: string }[] =
      alreadyScoredItems.map(item => ({
        resumeId: item.resumeId,
        candidateName: item.candidateName,
        status: 'already_scored' as const,
        score: item.score,
        scoredAt: item.scoredAt,
        matchStatus: item.matchStatus,
      }));

    // Create initial items array with candidate names - new ones start as queued
    const initialNewItems = resumeIds.map((resumeId, index) => ({
      resumeId,
      candidateName: resumeNames[index] || `Resume ${index + 1}`,
      status: 'queued' as const,
    }));

    const allInitialItems = [...alreadyScoredProgressItems, ...initialNewItems];

    // Initialize progress modal immediately with items
    shownJobsRef.current.add(jobId);
    showBulkProgressFromJob(jobId, jobTitle, allInitialItems);

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

    // Track item statuses for the modal (only new items to score)
    const newItemStatuses: { resumeId: string; candidateName: string; status: 'queued' | 'processing' | 'completed' | 'failed'; score?: number; errorMessage?: string }[] =
      resumeIds.map((resumeId, index) => ({
        resumeId,
        candidateName: resumeNames[index] || `Resume ${index + 1}`,
        status: 'queued' as const,
      }));

    // Helper to build ScoringProgressItem[] from current statuses and push to BulkScoringProgressModal
    const updateBulkProgress = () => {
      const allItems = [...alreadyScoredProgressItems, ...newItemStatuses];
      const progressItems: ScoringProgressItem[] = allItems.map((item: any) => ({
        id: item.resumeId || '',
        resumeId: item.resumeId || '',
        candidateName: item.candidateName || 'Unknown',
        jobTitle: jobTitle,
        jobId: jobId,
        source: 'Internal DB' as const,
        status: item.status === 'completed'
          ? 'Scored successfully' as const
          : item.status === 'already_scored'
          ? 'Already Scored - Skipped' as const
          : item.status === 'failed'
          ? 'Failed' as const
          : item.status === 'processing'
          ? 'Scoring in progress' as const
          : 'Queued' as const,
        errorReason: item.errorMessage,
        score: item.score,
        scoredDateTime: item.status === 'already_scored' && item.scoredAt
          ? new Date(item.scoredAt)
          : item.status === 'completed'
          ? new Date()
          : undefined,
        matchResult: item.status === 'already_scored' && item.matchStatus
          ? convertMatchStatus(item.matchStatus)
          : item.score != null
          ? (item.score >= 85 ? 'Exact Match' as const : item.score >= 70 ? 'Partial Match' as const : 'No Match' as const)
          : undefined,
      }));
      setProgressData(progressItems);
    };

    // Dispatch all resumes to Celery, then poll for progress
    const scoreResumes = async () => {
      try {
        console.log(`[ResumeScoringPage] Dispatching ${resumeIds.length} resume(s) to Celery`);
        const batch = await scoringService.startBulkScoringAsync(jobId, resumeIds);
        const batchId = batch.batch_id;
        console.log(`[ResumeScoringPage] Batch created: ${batchId}`);

        // Map resumeId → array index for O(1) status updates
        const resumeIdToIndex = new Map<string, number>(
          resumeIds.map((id, idx) => [id, idx] as [string, number])
        );

        // Poll Celery batch status every 2 seconds
        let isDone = false;
        const pollIntervalId = setInterval(async () => {
          if (isDone) return;
          try {
            const status = await scoringService.getBatchStatus(batchId);

            // Merge item statuses into newItemStatuses (only advance, never regress)
            if (status.items) {
              for (const item of status.items) {
                const idx = resumeIdToIndex.get(item.resume_id);
                if (idx === undefined) continue;
                const itemId = `${jobId}-${item.resume_id}`;

                if (item.status === 'completed' && newItemStatuses[idx].status !== 'completed') {
                  newItemStatuses[idx].status = 'completed';
                  newItemStatuses[idx].score = item.overall_score ?? 0;
                  updateItemStatus(jobId, itemId, 'Scored successfully', {
                    score: item.overall_score ?? 0,
                    matchResult: convertMatchStatus(item.match_status),
                    scoredDateTime: new Date().toISOString(),
                  });
                } else if (item.status === 'failed' && newItemStatuses[idx].status !== 'failed') {
                  newItemStatuses[idx].status = 'failed';
                  newItemStatuses[idx].errorMessage = item.error_message || 'Scoring failed';
                  updateItemStatus(jobId, itemId, 'Failed', {
                    errorReason: item.error_message || 'Scoring failed',
                  });
                } else if (item.status === 'processing' && newItemStatuses[idx].status === 'queued') {
                  newItemStatuses[idx].status = 'processing';
                  updateItemStatus(jobId, itemId, 'Scoring in progress');
                }
              }
            }

            updateBulkProgress();

            // All Celery workers finished?
            if (status.queued === 0 && status.processing === 0 && status.total > 0) {
              isDone = true;
              clearInterval(pollIntervalId);
              updateBulkProgress();
              console.log(`[ResumeScoringPage] Celery scoring complete`);

              if (onRefreshHistory) {
                console.log('[ResumeScoringPage] Refreshing scored history...');
                await onRefreshHistory();
                setShowProgressModal(false);
                setPendingAutoSelectJdId(jobId);
                router.push(`/recruitment/resume-scoring?jd_id=${jobId}`, { scroll: false });
              } else {
                setTimeout(() => {
                  window.location.href = `/recruitment/resume-scoring?jd_id=${jobId}`;
                }, 2000);
              }
            }
          } catch (pollErr) {
            console.error(`[ResumeScoringPage] Batch poll error:`, pollErr);
          }
        }, 2000);
      } catch (err) {
        console.error(`[ResumeScoringPage] Failed to dispatch scoring batch:`, err);
        toast.error('Failed to start scoring. Please try again.');
        // Mark all queued items as failed so the modal shows the error
        for (let i = 0; i < newItemStatuses.length; i++) {
          newItemStatuses[i].status = 'failed';
          newItemStatuses[i].errorMessage = err instanceof Error ? err.message : 'Failed to start scoring';
          updateItemStatus(jobId, `${jobId}-${resumeIds[i]}`, 'Failed', {
            errorReason: err instanceof Error ? err.message : 'Failed to start scoring',
          });
        }
        updateBulkProgress();
      }
    };

    scoreResumes();
  }, [pendingScoringData, startScoringJob, updateItemStatus, onRefreshHistory, router]);

  // Track completed job IDs to prevent flickering from stale polling data
  const completedJobsRef = useRef<Set<string>>(new Set());

  // Track jobs that modal has already been shown for - prevents reopening after user closes
  const shownJobsRef = useRef<Set<string>>(new Set());

  // Handle batch progress from Celery async scoring - show progress modal
  useEffect(() => {
    if (!batchProgress) return;

    // Skip update if this job was already marked as complete
    if (completedJobsRef.current.has(batchProgress.jobId)) {
      console.log('[ResumeScoringPage] Skipping batch progress update - job already completed');
      return;
    }

    // Check if this update shows completion
    // already_scored items count toward total but not toward completed/failed from backend
    const alreadyScoredCount = (batchProgress.items || []).filter(i => i.status === 'already_scored').length;
    const isComplete = batchProgress.queued === 0 &&
                       batchProgress.processing === 0 &&
                       (batchProgress.completed + batchProgress.failed + alreadyScoredCount) === batchProgress.total &&
                       batchProgress.total > 0;

    // Mark job as complete to prevent future updates
    if (isComplete) {
      completedJobsRef.current.add(batchProgress.jobId);
    }

    console.log('[ResumeScoringPage] Batch progress update:', batchProgress, 'isComplete:', isComplete);

    // Map items from batchProgress
    const items = (batchProgress.items || []).map(item => ({
      resumeId: item.resumeId,
      candidateName: item.candidateName || 'Unknown',
      status: item.status,
      score: item.score,
      errorMessage: item.errorMessage,
      matchStatus: item.matchStatus || item.match_status,
    }));

    // Convert to BulkScoringProgressModal format
    const progressItems: ScoringProgressItem[] = items.map((item: any) => ({
      id: item.resumeId || '',
      resumeId: item.resumeId || '',
      candidateName: item.candidateName || 'Unknown',
      jobTitle: batchProgress.jobTitle,
      jobId: batchProgress.jobId,
      source: 'Internal DB' as const,
      status: item.status === 'completed'
        ? 'Scored successfully' as const
        : item.status === 'already_scored'
        ? 'Already Scored - Skipped' as const
        : item.status === 'failed'
        ? 'Failed' as const
        : item.status === 'processing'
        ? 'Scoring in progress' as const
        : 'Queued' as const,
      errorReason: item.errorMessage,
      score: item.score,
      matchResult: item.matchStatus
        ? convertMatchStatus(item.matchStatus)
        : undefined, // Stay "Pending" until real match_status is fetched after completion
    }));

    // Always update progress data for live polling
    setProgressData(progressItems);
    setFilterByJobId(batchProgress.jobId);
    setShowJobTitleColumn(false);

    // Only show modal for NEW jobs, not for updates to jobs already shown
    if (!shownJobsRef.current.has(batchProgress.jobId)) {
      shownJobsRef.current.add(batchProgress.jobId);
      setShowProgressModal(true);
    }

    // When batch scoring completes, fetch real match results then refresh history
    if (isComplete && onRefreshHistory) {
      console.log('[ResumeScoringPage] Batch complete - fetching real match results');
      const jobId = batchProgress.jobId;
      // Delay to ensure backend has committed all scores before fetching
      setTimeout(() => {
        // Step 1: Fetch actual scored results to get the real match_status for each resume
        scoringService.getJDScoredResumes(jobId, { page_size: 500 })
          .then(jdScores => {
            // Build map of resume_id → match_status from the actual score records
            const scoreMap = new Map(jdScores.items.map(s => [s.resume_id, s.match_status]));
            // Update the popup items with correct match results
            setProgressData(prev => prev.map(item => ({
              ...item,
              matchResult: scoreMap.has(item.resumeId)
                ? convertMatchStatus(scoreMap.get(item.resumeId)!)
                : item.matchResult,
            })));
          })
          .catch(e => console.warn('[ResumeScoringPage] Could not update match statuses from scores:', e))
          .finally(() => {
            // Step 2: Wait 3 seconds so user can read the correct match results,
            // then refresh history and close modal
            setTimeout(() => {
              onRefreshHistory().then(() => {
                setShowProgressModal(false);
                // Trigger auto-navigation to the details view for this JD
                setPendingAutoSelectJdId(jobId);
                router.push(`/recruitment/resume-scoring?jd_id=${jobId}`, { scroll: false });
              }).catch((err) => {
                console.error('[ResumeScoringPage] Failed to refresh history after batch:', err);
                setShowProgressModal(false);
                setViewMode('history');
              });
            }, 3000);
          });
      }, 2000);
    }
  }, [batchProgress, onRefreshHistory, router]);

  // Split resumes - myResumes are all user-uploaded resumes, databaseResumes are all resumes
  // Include locally uploaded resumes (from the modal) to keep them visible without page refresh
  // IMPORTANT: Deduplicate by ID to prevent showing the same resume twice
  const deduplicateResumes = (localUploads: any[], apiResumes: any[]) => {
    const seenIds = new Set<string>();
    const result = [];

    // Add API resumes first (they're the source of truth)
    for (const resume of apiResumes) {
      if (!seenIds.has(resume.id)) {
        seenIds.add(resume.id);
        result.push(resume);
      }
    }

    // Add local uploads only if not already in API results
    for (const resume of localUploads) {
      if (!seenIds.has(resume.id)) {
        seenIds.add(resume.id);
        result.push(resume);
      }
    }

    return result;
  };

  const myResumes = deduplicateResumes(uploadedResumes, resumes); // All resumes belong to the user (My Resumes)
  const databaseResumes = deduplicateResumes(uploadedResumes, resumes);

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

    toast.info(`Download initiated! ${selectedHistoryItems.size} scoring session(s) selected, ${totalResumes} total resume(s)`);
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
      const jdName = (selectedHistoryItem?.jobTitle || 'TalentFlow').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');
      a.download = `${jdName}_Scorecards.zip`;
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
  const [showJobDropdown, setShowJobDropdown] = useState(false);
  const [jobDropdownSearch, setJobDropdownSearch] = useState('');
  const jobDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (jobDropdownRef.current && !jobDropdownRef.current.contains(e.target as Node)) {
        setShowJobDropdown(false);
      }
    };
    if (showJobDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showJobDropdown]);

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
      const scoreValue = resume.overall_score || resume.scorePercentage || 0;
      const matchStatus = resume.matchStatus || resume.match_status || (
        scoreValue >= 70 ? 'Exact Match' :
        scoreValue >= 50 ? 'Partial Match' : 'No Match'
      );

      return {
        id: resume.id,
        resumeId: resume.resumeId || resume.resume_id || '',  // CRITICAL: Resume ID for fetching full details
        // Use candidateName from API, fallback to name, then 'Unknown Candidate'
        candidateName: resume.candidateName || resume.name || 'Unknown Candidate',
        email: resume.candidateEmail || resume.email || 'N/A',
        phone: resume.phone || 'N/A',
        matchStatus: matchStatus,
        scorePercentage: Math.round(scoreValue),
        // Keep ISO string for timestamp - let display component format it
        scoredDate: resume.scoredDate || resume.created_at || scoredData.scoredAt,
        // Use scored_by_name from API for recruiter attribution
        scoredBy: resume.scored_by_name || resume.scoredBy || resume.scored_by || 'AI Resume Scorer',
        experience: resume.experience || 'N/A',
        education: resume.education || 'N/A',
        certifications: resume.certifications || [],
        // Job Title and JD ID from parent scoredData
        jobTitle: scoredData.jobTitle,
        jdId: scoredData.jobId,
        // Version info - use resume_version from API
        version: resume.resume_version || resume.version || resume.resumeVersion || 1,
        resumeVersion: resume.resume_version || resume.version || resume.resumeVersion || 1,
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
    const _scoredList = selectedHistoryItem.scoredResumes ?? [];
    const _currentIdx = _scoredList.findIndex((r: any) => (r.id ?? r.resumeId) === (selectedCandidateForView.id ?? selectedCandidateForView.resumeId));

    const _goToCandidate = (candidate: any) => {
      setSelectedCandidateForView(candidate);
      router.push(
        `/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}&score_id=${candidate.id ?? candidate.resumeId}`,
        { scroll: false }
      );
    };

    return (
      <CandidateScoringDetailPage
        resume={selectedCandidateForView}
        jobTitle={selectedHistoryItem.jobTitle}
        jobId={selectedHistoryItem.jobId}
        currentIndex={_currentIdx >= 0 ? _currentIdx : undefined}
        totalCount={_scoredList.length}
        onPrev={_currentIdx > 0 ? () => _goToCandidate(_scoredList[_currentIdx - 1]) : undefined}
        onNext={_currentIdx < _scoredList.length - 1 ? () => _goToCandidate(_scoredList[_currentIdx + 1]) : undefined}
        onBack={() => {
          setSelectedCandidateForView(null);
          setViewMode('details');
          router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}`, { scroll: false });
        }}
        onMinimize={() => {
          setSelectedCandidateForView(null);
          setViewMode('details');
          router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}`, { scroll: false });
        }}
      />
    );
  }

  // View Candidate Scoring Detail Page from Global View (no selectedHistoryItem)
  if (viewMode === 'candidateView' && selectedCandidateForView && !selectedHistoryItem) {
    const candidateJdId = selectedCandidateForView.jdId || 'global';
    const candidateJobTitle = selectedCandidateForView.jobTitle || 'All Jobs';
    return (
      <CandidateScoringDetailPage
        resume={selectedCandidateForView}
        jobTitle={candidateJobTitle}
        jobId={candidateJdId}
        onBack={() => {
          setSelectedCandidateForView(null);
          setViewMode('history');
          // Go back to global view
          router.push(`/recruitment/resume-scoring`, { scroll: false });
        }}
        onMinimize={() => {
          setSelectedCandidateForView(null);
          setViewMode('history');
          router.push(`/recruitment/resume-scoring`, { scroll: false });
        }}
      />
    );
  }

  // View History Details
  if (viewMode === 'details' && selectedHistoryItem) {
    const scoredResumesData = convertToScoredResumesFormat(selectedHistoryItem);

    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-gray-50 to-white">
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

          <div className="bg-white rounded-xl shadow-lg border-2 border-gray-300 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                  <Target className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl text-gray-900 mb-1">{selectedHistoryItem.jobTitle}</h1>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatIST(selectedHistoryItem.scoredAt)}
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

              {canRunScoring && (
                <button
                  onClick={() => setViewMode('new')}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2 shadow-sm bg-gray-800 text-white hover:bg-gray-900 hover:shadow-md cursor-pointer"
                >
                  <Target className="w-4 h-4" />
                  Score New Resumes
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {scoredResumesData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4">
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

              {selectedScoredResumes.length > 0 && canExport && (
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
          availableUnits={availableASUnits ?? 10}
          onViewCandidate={(resume) => {
            setSelectedCandidateForView(resume);
            setViewMode('candidateView');
            // Update URL with jd_id and score_id for shareable link & browser history
            router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}&score_id=${resume.id}`, { scroll: false });
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
            minimized={isBulkProgressMinimized}
            onMinimize={() => {
              setIsBulkProgressMinimized(true);
              setContextMinimized(true);
              setOnRestorePanel(() => () => {
                setIsBulkProgressMinimized(false);
                setContextMinimized(false);
              });
            }}
            onRetryFailed={async (item) => {
              try {
                // Update item status to "Scoring in progress"
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? { ...p, status: 'Scoring in progress' as const, errorReason: undefined }
                    : p
                ));

                // ✅ NEW: Use retry endpoint
                const retryResponse = await api.post('/api/v1/scoring/retry/single', {
                  score_id: item.id,
                  force: false
                });

                const retryData = retryResponse.data;

                if (retryData.status === 'SUCCESS') {
                  // Update item with success status
                  setProgressData(prev => prev.map(p =>
                    p.id === item.id
                      ? {
                          ...p,
                          status: 'Scored successfully' as const,
                          errorReason: undefined,
                          scoredDateTime: new Date(),
                          matchResult: convertMatchStatus(retryData.match_status),
                          score: retryData.overall_score
                        }
                      : p
                  ));

                  toast.success(retryData.message || `Successfully scored ${item.candidateName}`);
                } else if (retryData.status === 'SKIPPED') {
                  setProgressData(prev => prev.map(p =>
                    p.id === item.id
                      ? { ...p, status: 'Already Scored - Skipped' as const }
                      : p
                  ));
                  toast.info(retryData.message);
                } else {
                  throw new Error(retryData.message || 'Retry failed');
                }
              } catch (error: any) {
                const errorMsg = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Retry failed';
                // Update item with failure status
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? {
                        ...p,
                        status: 'Failed' as const,
                        errorReason: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)
                      }
                    : p
                ));
                toast.error(`Failed to retry scoring for ${item.candidateName}`);
              }
            }}
          />
        )}

      </main>
    );
  }

  // View History List
  if (viewMode === 'history') {
    // Create a processing entry from batchProgress if it exists
    let processingEntry: ScoredResumeData | null = null;
    if (batchProgress && batchProgress.jobId && (batchProgress.queued > 0 || batchProgress.processing > 0)) {
      // Check if this job is not already in scoredHistory (avoid duplicate)
      const alreadyInHistory = scoredHistory.some(h => h.jobId === batchProgress.jobId);
      if (!alreadyInHistory) {
        processingEntry = {
          id: `processing-${batchProgress.jobId}`,
          jobId: batchProgress.jobId,
          jobTitle: batchProgress.jobTitle || 'Processing...',
          scoredAt: new Date(),
          source: 'database',
          totalScored: batchProgress.total,
          scoredResumes: (batchProgress.items || []).map(item => ({
            id: item.resumeId,
            resumeId: item.resumeId,
            candidateName: item.candidateName,
            status: item.status,
            overall_score: item.score,
            errorReason: item.errorMessage,
          })),
          isProcessing: true,
          processingProgress: {
            total: batchProgress.total,
            queued: batchProgress.queued,
            processing: batchProgress.processing,
            completed: batchProgress.completed,
            failed: batchProgress.failed,
          },
        };
      }
    }

    // Filter history items
    const filteredHistory = scoredHistory.filter(item => {
      const matchesSearch = historySearchQuery === '' ||
        item.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        (item.jdJobId || '').toLowerCase().includes(historySearchQuery.toLowerCase());

      const matchesCreatedBy = historyCreatedBy === '' ||
        (item.jdCreatedByName || '') === historyCreatedBy;

      let matchesScoredDate = true;
      if (historyScoredFrom) matchesScoredDate = matchesScoredDate && new Date(item.scoredAt) >= new Date(historyScoredFrom);
      if (historyScoredTo) matchesScoredDate = matchesScoredDate && new Date(item.scoredAt) <= new Date(historyScoredTo);

      const matchesLocation = historyLocation === '' ||
        (item.jdLocation || '').toLowerCase().includes(historyLocation.toLowerCase());

      const matchesJobType = historyJobType === '' ||
        (item.jdEmploymentType || '').toLowerCase() === historyJobType.toLowerCase();

      const matchesIndustry = historyIndustry === '' ||
        (item.jdIndustryType || '').toLowerCase() === historyIndustry.toLowerCase();

      return matchesSearch && matchesCreatedBy && matchesScoredDate && matchesLocation && matchesJobType && matchesIndustry;
    });

    // Add processing entry at the top if it exists and matches filters
    const displayHistory = processingEntry && (historySearchQuery === '' || processingEntry.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase()))
      ? [processingEntry, ...filteredHistory]
      : filteredHistory;

    const activeFiltersCount = [
      historyCreatedBy !== '',
      historyScoredFrom !== '',
      historyScoredTo !== '',
      historyLocation !== '',
      historyJobType !== '',
      historyIndustry !== '',
    ].filter(Boolean).length;

    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-gray-50 to-white">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          {/* Left: back + icon + title */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-white/80 rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </button>
            )}
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
              <History className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-gray-900 text-lg sm:text-xl font-semibold">Scored Candidates</h1>
              <p className="text-xs sm:text-sm text-gray-600 truncate">View and manage previously scored resumes</p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Available Units Display */}
            {availableUnits !== null && (
              <div className="bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl shadow-lg px-3 py-2 border-2 border-gray-300 flex items-center gap-2 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-300 leading-tight">Available Units</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base sm:text-lg font-bold text-white leading-tight">
                      {availableUnits.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-gray-300">units</span>
                  </div>
                </div>
              </div>
            )}

            {/* Progress Tables Button */}
            {scoredHistory.length > 0 && (
              <button
                onClick={() => {
                  const allProgressData = scoredHistory.flatMap(item =>
                    item.scoredResumes.map(resume => ({
                      id: resume.id,
                      candidateName: resume.candidateName || resume.name || 'Unknown',
                      jobTitle: item.jobTitle,
                      jobId: item.jobId,
                      source: item.source === 'my-resumes' ? 'My Resumes' : 'Internal DB' as 'My Resumes' | 'Internal DB',
                      status: 'Scored successfully' as const,
                      scoredDateTime: new Date(item.scoredAt),
                      matchResult: (resume.matchStatus === 'exact_match' || resume.matchStatus === 'Exact Match' ? 'Exact Match'
                                   : resume.matchStatus === 'partial_match' || resume.matchStatus === 'Partial Match' ? 'Partial Match'
                                   : resume.matchStatus === 'no_match' || resume.matchStatus === 'No Match' ? 'No Match'
                                   : (resume.overall_score || resume.scorePercentage || 0) >= 85 ? 'Exact Match'
                                   : (resume.overall_score || resume.scorePercentage || 0) >= 70 ? 'Partial Match'
                                   : 'No Match') as 'Exact Match' | 'Partial Match' | 'No Match',
                      score: resume.overall_score || resume.scorePercentage || 0,
                    }))
                  );
                  setProgressData(allProgressData);
                  setShowJobTitleColumn(true);
                  setFilterByJobId(undefined);
                  setShowProgressModal(true);
                }}
                className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all text-xs sm:text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                <Clock className="w-4 h-4" />
                <span>Progress Tables</span>
                <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                  {scoredHistory.reduce((sum, item) => sum + item.totalScored, 0)}
                </span>
              </button>
            )}

            {/* View All Candidates Button */}
            <button
              onClick={handleToggleGlobalView}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg transition-all text-xs sm:text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md ${
                isGlobalView
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>{isGlobalView ? 'View by Job' : 'View All Candidates'}</span>
            </button>

            {/* Score Resumes Button - only shown to users with run scoring permission */}
            {canRunScoring && (
              <button
                onClick={() => {
                  setViewMode('new');
                  setSelectedJob('');
                  setResumeSource(null);
                  setSelectedResumes([]);
                }}
                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg transition-all text-xs sm:text-sm font-medium flex items-center gap-2 shadow-sm bg-gray-800 text-white hover:bg-gray-900 hover:shadow-md cursor-pointer"
              >
                <Target className="w-4 h-4" />
                Score Resumes
              </button>
            )}
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
                availableUnits={availableASUnits ?? 10}
                onViewCandidate={(resume) => {
                  setSelectedCandidateForView(resume);
                  setViewMode('candidateView');
                  // Update URL with jd_id and score_id for shareable link & browser history
                  const jdId = resume.jdId || 'global';
                  router.push(`/recruitment/resume-scoring?jd_id=${jdId}&score_id=${resume.id}`, { scroll: false });
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 sm:gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setHistoryViewMode('grid')}
                  className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    historyViewMode === 'grid'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">Grid</span>
                </button>
                <button
                  onClick={() => setHistoryViewMode('list')}
                  className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    historyViewMode === 'list'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">List</span>
                </button>
              </div>

              {selectedHistoryItems.size > 0 && (
                <div className="flex items-center gap-2">
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-5 mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search by job title..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent transition-shadow text-gray-900"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={() => setShowHistoryFilters(!showHistoryFilters)}
                className={`flex-1 sm:flex-none px-3 sm:px-5 py-2.5 rounded-lg border-2 transition-all flex items-center justify-center gap-2 font-medium text-sm sm:text-base ${
                  activeFiltersCount > 0
                    ? 'bg-gray-50 border-gray-800 text-gray-900 shadow-sm'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
                }`}
              >
                <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="px-2 py-0.5 bg-gray-800 text-white rounded-full text-xs font-medium">
                    {activeFiltersCount}
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${showHistoryFilters ? 'rotate-180' : ''}`} />
              </button>

              <div className="text-xs sm:text-sm text-gray-700 bg-gray-100 px-3 sm:px-4 py-2.5 rounded-lg whitespace-nowrap font-medium border border-gray-200">
                <span className="text-gray-800">{displayHistory.length}</span> of {scoredHistory.length + (processingEntry ? 1 : 0)} jobs
              </div>
            </div>
          </div>

          {/* Expanded Filters */}
          {showHistoryFilters && (() => {
            const uniqueLocations = [...new Set(scoredHistory.map(i => i.jdLocation).filter(Boolean))];
            const uniqueJobTypes = [...new Set(scoredHistory.map(i => i.jdEmploymentType).filter(Boolean))];
            const uniqueIndustries = [...new Set(scoredHistory.map(i => i.jdIndustryType).filter(Boolean))];
            const uniqueCreators = [...new Set(scoredHistory.map(i => i.jdCreatedByName).filter(Boolean))];
            const selectCls = "w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent bg-white text-gray-900 text-sm";
            const inputCls = "w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent bg-white text-gray-900 text-sm";
            const labelCls = "block text-xs font-medium text-gray-600 mb-1.5";
            return (
            <div className="mt-5 pt-5 border-t border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                {/* Created By — dropdown with user names */}
                <div>
                  <label className={labelCls}>Created By</label>
                  <select value={historyCreatedBy} onChange={e => setHistoryCreatedBy(e.target.value)} className={selectCls}>
                    <option value="">All Users</option>
                    {uniqueCreators.map(name => <option key={name} value={name!}>{name}</option>)}
                  </select>
                </div>

                {/* Scored From */}
                <div>
                  <label className={labelCls}>Scored From</label>
                  <input type="date" value={historyScoredFrom} onChange={e => setHistoryScoredFrom(e.target.value)} className={inputCls} />
                </div>

                {/* Scored To */}
                <div>
                  <label className={labelCls}>Scored To</label>
                  <input type="date" value={historyScoredTo} onChange={e => setHistoryScoredTo(e.target.value)} className={inputCls} />
                </div>

                {/* Location */}
                <div>
                  <label className={labelCls}>Location</label>
                  <select value={historyLocation} onChange={e => setHistoryLocation(e.target.value)} className={selectCls}>
                    <option value="">All Locations</option>
                    {uniqueLocations.map(l => <option key={l} value={l!}>{l}</option>)}
                  </select>
                </div>

                {/* Job Type */}
                <div>
                  <label className={labelCls}>Job Type</label>
                  <select value={historyJobType} onChange={e => setHistoryJobType(e.target.value)} className={selectCls}>
                    <option value="">All Types</option>
                    {uniqueJobTypes.map(t => <option key={t} value={t!}>{formatEmploymentType(t)}</option>)}
                  </select>
                </div>

                {/* Industry */}
                <div>
                  <label className={labelCls}>Industry</label>
                  <select value={historyIndustry} onChange={e => setHistoryIndustry(e.target.value)} className={selectCls}>
                    <option value="">All Industries</option>
                    {uniqueIndustries.map(i => <option key={i} value={i!}>{formatIndustryType(i)}</option>)}
                  </select>
                </div>

              </div>

              {activeFiltersCount > 0 && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setHistoryCreatedBy('');
                      setHistoryScoredFrom('');
                      setHistoryScoredTo('');
                      setHistoryLocation('');
                      setHistoryJobType('');
                      setHistoryIndustry('');
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2 text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                    Clear All Filters
                  </button>
                </div>
              )}
            </div>
            );
          })()}
        </div>

        {/* History List or Empty State */}
        {displayHistory.length > 0 ? (
          <>
          <div className={historyViewMode === 'grid' ? 'grid gap-5' : 'space-y-4'}>
            {displayHistory.slice((historyCurrentPage - 1) * historyItemsPerPage, historyCurrentPage * historyItemsPerPage).map((item) => {
              const avgScore = item.scoredResumes.length > 0
                ? Math.round(item.scoredResumes.reduce((sum, r) => sum + (r.overall_score || r.scorePercentage || 0), 0) / item.scoredResumes.length)
                : 0;

              const exactMatchCount = item.scoredResumes.filter(r => r.matchStatus === 'Exact Match' || r.matchStatus === 'exact_match').length;
              const partialMatchCount = item.scoredResumes.filter(r => r.matchStatus === 'Partial Match' || r.matchStatus === 'partial_match').length;
              const noMatchCount = item.scoredResumes.filter(r => r.matchStatus === 'No Match' || r.matchStatus === 'no_match' || (!r.matchStatus)).length;
              const isSelected = selectedHistoryItems.has(item.id);

              const jobDetails = jobs.find(j => j.id === item.jobId);

              if (historyViewMode === 'list') {
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      setSelectedHistoryItem(item);
                      setViewMode('details');
                      onLoadJdScores?.(item.jobId, item.jobTitle);
                      try {
                        localStorage.setItem('lastViewedScoringJdId', item.jobId);
                      } catch (e) {}
                      router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                    }}
                  >
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                      {/* Scoring icon - like AI Talent Match */}
                      <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                        <Target className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0 w-full">
                        {/* Title row — matches JD list card */}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                          {item.jdJobId && (
                            <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-blue-100 text-blue-700 rounded-md text-xs sm:text-sm font-bold font-mono border border-blue-200 flex-shrink-0">
                              {item.jdJobId}
                            </span>
                          )}
                          <h3
                            className="text-base sm:text-xl font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => {
                              setSelectedHistoryItem(item);
                              setViewMode('details');
                              onLoadJdScores?.(item.jobId, item.jobTitle);
                              try { localStorage.setItem('lastViewedScoringJdId', item.jobId); } catch (e) {}
                              router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                            }}
                          >
                            {item.jobTitle}
                          </h3>
                          {/* Status badge */}
                          {(() => {
                            const s = (item.jdStatus || 'published').toLowerCase();
                            const cfg: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
                              published: { label: 'Published', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500' },
                              active:    { label: 'Published', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500' },
                              closed:    { label: 'Closed',    bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500' },
                              archived:  { label: 'Archived',  bg: 'bg-gray-50',   text: 'text-gray-500',   border: 'border-gray-200',   dot: 'bg-gray-400' },
                              disabled:  { label: 'Disabled',  bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
                              draft:     { label: 'Draft',     bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500' },
                            };
                            const c = cfg[s] || cfg.published;
                            return (
                              <span className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm ${c.bg} ${c.text} border ${c.border} flex items-center gap-1.5 sm:gap-2 flex-shrink-0`}>
                                <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${c.dot}`}></div>
                                {c.label}
                              </span>
                            );
                          })()}
                          {/* Version badge */}
                          {item.jdCurrentVersion && item.jdCurrentVersion >= 1 && (
                            <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5 flex-shrink-0">
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gray-500"></div>
                              v{item.jdCurrentVersion}
                            </span>
                          )}
                          {/* History icon button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setHistoryModalItem(item); }}
                            className="p-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex-shrink-0"
                            title="Scoring History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Info row — matches JD list card exactly */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-5 text-sm sm:text-base text-gray-600 mb-2">
                          {item.jdDepartment && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              {item.jdDepartment}
                            </span>
                          )}
                          {item.jdIndustryType && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              {formatIndustryType(item.jdIndustryType)}
                            </span>
                          )}
                          {item.jdLocation && (
                          <span className="flex items-center gap-1.5 sm:gap-2">
                            <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                            {item.jdLocation}
                          </span>
                          )}
                          {item.jdEmploymentType && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              {formatEmploymentType(item.jdEmploymentType)}
                            </span>
                          )}
                          {item.jdRemoteType && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              <span className="capitalize">{item.jdRemoteType}</span>
                            </span>
                          )}
                          {item.scoredResumes?.[0]?.scoredBy && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <User className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              Scored by {item.scoredResumes[0].scoredBy}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 sm:gap-2">
                            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                            {formatIST(item.scoredAt)}
                          </span>
                          <span className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-50 rounded-lg">
                            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                            {item.totalScored} {item.totalScored === 1 ? 'candidate' : 'candidates'} scored
                          </span>
                        </div>
                      </div>

                      {/* Action buttons - right side */}
                      <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Show progress in BulkScoringProgressModal
                            const resumes = item.scoredResumes || [];
                            const allProgressItems: ScoringProgressItem[] = resumes.map((resume: any) => ({
                              id: resume.resumeId || resume.id || '',
                              resumeId: resume.resumeId || resume.id || '',
                              candidateName: resume.candidateName || resume.candidate_name || resume.name || 'Unknown',
                              jobTitle: item.jobTitle,
                              jobId: item.jobId,
                              source: item.source === 'my-resumes' ? 'My Resumes' as const : 'Internal DB' as const,
                              status: (resume.status === 'failed' || resume.errorReason) ? 'Failed' as const : 'Scored successfully' as const,
                              errorReason: resume.errorReason || resume.error_reason,
                              scoredDateTime: new Date(item.scoredAt),
                              matchResult: (resume.matchStatus === 'exact_match' || resume.matchStatus === 'Exact Match' ? 'Exact Match'
                                           : resume.matchStatus === 'partial_match' || resume.matchStatus === 'Partial Match' ? 'Partial Match'
                                           : resume.matchStatus === 'no_match' || resume.matchStatus === 'No Match' ? 'No Match'
                                           : (resume.overall_score || resume.scorePercentage || 0) >= 85 ? 'Exact Match'
                                           : (resume.overall_score || resume.scorePercentage || 0) >= 70 ? 'Partial Match'
                                           : 'No Match') as 'Exact Match' | 'Partial Match' | 'No Match',
                              score: resume.overall_score || resume.scorePercentage || resume.score || 0,
                            }));
                            setProgressData(allProgressItems);
                            setFilterByJobId(item.jobId);
                            setShowJobTitleColumn(false);
                            setShowProgressModal(true);
                          }}
                          className="px-3 sm:px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-xs sm:text-sm font-medium flex items-center gap-1.5 justify-center w-full"
                        >
                          <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                          View Progress
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedHistoryItem(item);
                            setViewMode('details');
                            onLoadJdScores?.(item.jobId, item.jobTitle);
                            try {
                              localStorage.setItem('lastViewedScoringJdId', item.jobId);
                            } catch (e) {}
                            router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                          }}
                          className="px-3 sm:px-4 py-2 border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 hover:border-gray-400 rounded-lg transition-colors text-xs sm:text-sm font-medium flex items-center justify-center w-full"
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
                  <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                    <div
                      className="flex-1 min-w-0 cursor-pointer w-full"
                      onClick={() => {
                        setSelectedHistoryItem(item);
                        setViewMode('details');
                        onLoadJdScores?.(item.jobId, item.jobTitle);
                        router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                      }}
                    >
                      {/* Card header — matches JD grid card */}
                      <div className="p-0 mb-4">
                        {/* Top: icon + badges */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {(() => {
                              const s = (item.jdStatus || 'published').toLowerCase();
                              const cfg: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
                                published: { label: 'Published', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500' },
                                active:    { label: 'Published', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500' },
                                closed:    { label: 'Closed',    bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500' },
                                archived:  { label: 'Archived',  bg: 'bg-gray-50',   text: 'text-gray-500',   border: 'border-gray-200',   dot: 'bg-gray-400' },
                                disabled:  { label: 'Disabled',  bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
                                draft:     { label: 'Draft',     bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500' },
                              };
                              const c = cfg[s] || cfg.published;
                              return (
                                <span className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm ${c.bg} ${c.text} border ${c.border} flex items-center gap-1.5`}>
                                  <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${c.dot}`}></div>
                                  {c.label}
                                </span>
                              );
                            })()}
                            {item.jdCurrentVersion && item.jdCurrentVersion >= 1 && (
                              <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gray-500"></div>
                                v{item.jdCurrentVersion}
                              </span>
                            )}
                            {/* History icon button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setHistoryModalItem(item); }}
                              className="p-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex-shrink-0"
                              title="Scoring History"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* job_id + title */}
                        <div className="flex items-center gap-2 mb-3">
                          {item.jdJobId && (
                            <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-blue-100 text-blue-700 rounded-md text-xs sm:text-sm font-bold font-mono border border-blue-200">
                              {item.jdJobId}
                            </span>
                          )}
                          <h3 className="text-base sm:text-xl font-medium text-gray-900 line-clamp-2">
                            {item.jobTitle}
                          </h3>
                        </div>

                        {/* Info rows — matches JD grid card body */}
                        <div className="space-y-2">
                          {item.jdDepartment && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{item.jdDepartment}</span>
                            </div>
                          )}
                          {item.jdIndustryType && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{formatIndustryType(item.jdIndustryType)}</span>
                            </div>
                          )}
                          {item.jdLocation && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{item.jdLocation}</span>
                          </div>
                          )}
                          {item.jdEmploymentType && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{formatEmploymentType(item.jdEmploymentType)}</span>
                            </div>
                          )}
                          {item.jdRemoteType && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                              <span className="capitalize">{item.jdRemoteType}</span>
                            </div>
                          )}
                          {item.jdPublishedAt && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                              <span>Posted {formatISTDate(item.jdPublishedAt)}</span>
                            </div>
                          )}
                          {item.jdCreatedByName && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <User className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                              <span className="truncate">By {item.jdCreatedByName}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            <span>{item.totalScored} {item.totalScored === 1 ? 'candidate' : 'candidates'} scored</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">Exact Match</span>
                            <Award className="w-4 h-4 text-green-600" />
                          </div>
                          <div className="text-2xl text-green-700 font-bold">{exactMatchCount}</div>
                        </div>
                        <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">Partial Match</span>
                            <CheckCircle className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="text-2xl text-blue-700 font-bold">{partialMatchCount}</div>
                        </div>
                        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">No Match</span>
                            <XCircle className="w-4 h-4 text-yellow-600" />
                          </div>
                          <div className="text-2xl text-yellow-700 font-bold">{noMatchCount}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-center w-full sm:w-auto">
                      <div className="text-xs sm:text-sm text-gray-600 mb-2 font-medium">Avg Score</div>
                      <div className={`text-3xl sm:text-4xl font-bold mb-2 ${getScoreColor(avgScore)}`}>
                        {avgScore}%
                      </div>
                      <div className="mt-4 flex flex-col gap-2 w-full">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const resumes = item.scoredResumes || [];
                            const allProgressItems: ScoringProgressItem[] = resumes.map((resume: any) => ({
                              id: resume.resumeId || resume.id || '',
                              resumeId: resume.resumeId || resume.id || '',
                              candidateName: resume.candidateName || resume.candidate_name || resume.name || 'Unknown',
                              jobTitle: item.jobTitle,
                              jobId: item.jobId,
                              source: item.source === 'my-resumes' ? 'My Resumes' as const : 'Internal DB' as const,
                              status: (resume.status === 'failed' || resume.errorReason) ? 'Failed' as const : 'Scored successfully' as const,
                              errorReason: resume.errorReason || resume.error_reason,
                              scoredDateTime: new Date(item.scoredAt),
                              matchResult: (resume.matchStatus === 'exact_match' || resume.matchStatus === 'Exact Match' ? 'Exact Match'
                                           : resume.matchStatus === 'partial_match' || resume.matchStatus === 'Partial Match' ? 'Partial Match'
                                           : resume.matchStatus === 'no_match' || resume.matchStatus === 'No Match' ? 'No Match'
                                           : (resume.overall_score || resume.scorePercentage || 0) >= 85 ? 'Exact Match'
                                           : (resume.overall_score || resume.scorePercentage || 0) >= 70 ? 'Partial Match'
                                           : 'No Match') as 'Exact Match' | 'Partial Match' | 'No Match',
                              score: resume.overall_score || resume.scorePercentage || resume.score || 0,
                            }));
                            setProgressData(allProgressItems);
                            setFilterByJobId(item.jobId);
                            setShowJobTitleColumn(false);
                            setShowProgressModal(true);
                          }}
                          className="px-3 sm:px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-xs sm:text-sm font-medium flex items-center gap-1.5 justify-center w-full"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Progress
                        </button>
                        <button
                          onClick={() => {
                            setSelectedHistoryItem(item);
                            setViewMode('details');
                            onLoadJdScores?.(item.jobId, item.jobTitle);
                            try {
                              localStorage.setItem('lastViewedScoringJdId', item.jobId);
                            } catch (e) {
                              console.error('Failed to save last viewed JD:', e);
                            }
                            router.push(`/recruitment/resume-scoring?jd_id=${item.jobId}`);
                          }}
                          className="flex-1 py-2 border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 hover:border-gray-400 rounded-lg transition-colors text-xs sm:text-sm font-medium flex items-center gap-1.5 justify-center cursor-pointer"
                        >
                          View Details
                          <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <ListPagination
            currentPage={historyCurrentPage}
            itemsPerPage={historyItemsPerPage}
            totalItems={displayHistory.length}
            onPageChange={setHistoryCurrentPage}
            onItemsPerPageChange={setHistoryItemsPerPage}
            itemLabel="jobs"
          />
          </>
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
              {canRunScoring && (
                <button
                  onClick={() => {
                    setViewMode('new');
                    setSelectedJob('');
                    setResumeSource(null);
                    setSelectedResumes([]);
                  }}
                  className="px-6 py-3 rounded-lg transition-all font-medium shadow-sm inline-flex items-center gap-2 bg-gray-800 text-white hover:bg-gray-900 hover:shadow-md cursor-pointer"
                >
                  <Target className="w-5 h-5" />
                  Score Resumes Now
                </button>
              )}
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
            minimized={isBulkProgressMinimized}
            onMinimize={() => {
              setIsBulkProgressMinimized(true);
              setContextMinimized(true);
              setOnRestorePanel(() => () => {
                setIsBulkProgressMinimized(false);
                setContextMinimized(false);
              });
            }}
            onRetryFailed={async (item) => {
              try {
                // Update item status to "Scoring in progress"
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? { ...p, status: 'Scoring in progress' as const, errorReason: undefined }
                    : p
                ));

                // ✅ NEW: Use retry endpoint
                const retryResponse = await api.post('/api/v1/scoring/retry/single', {
                  score_id: item.id,
                  force: false
                });

                const retryData = retryResponse.data;

                if (retryData.status === 'SUCCESS') {
                  // Update item with success status
                  setProgressData(prev => prev.map(p =>
                    p.id === item.id
                      ? {
                          ...p,
                          status: 'Scored successfully' as const,
                          errorReason: undefined,
                          scoredDateTime: new Date(),
                          matchResult: convertMatchStatus(retryData.match_status),
                          score: retryData.overall_score
                        }
                      : p
                  ));

                  toast.success(retryData.message || `Successfully scored ${item.candidateName}`);
                } else if (retryData.status === 'SKIPPED') {
                  setProgressData(prev => prev.map(p =>
                    p.id === item.id
                      ? { ...p, status: 'Already Scored - Skipped' as const }
                      : p
                  ));
                  toast.info(retryData.message);
                } else {
                  throw new Error(retryData.message || 'Retry failed');
                }
              } catch (error: any) {
                const errorMsg = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Retry failed';
                // Update item with failure status
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? {
                        ...p,
                        status: 'Failed' as const,
                        errorReason: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)
                      }
                    : p
                ));
                toast.error(`Failed to retry scoring for ${item.candidateName}`);
              }
            }}
          />
        )}

      {/* Scoring History Modal */}
      {historyModalItem && (() => {
        const groups: { scoredBy: string; date: string; count: number; source: string }[] = [];
        const seen = new Map<string, number>();
        (historyModalItem.scoredResumes || []).forEach((r: any) => {
          const scorer = r.scoredBy || 'System';
          const rawDate = r.scoredDate || r.created_at || historyModalItem.scoredAt;
          const day = formatISTDate(rawDate);
          const time = formatISTTime(rawDate);
          const src = r.source === 'my-resumes' ? 'My Resumes' : 'Resume Database';
          const key = `${scorer}||${day}||${src}`;
          if (seen.has(key)) {
            groups[seen.get(key)!].count++;
          } else {
            seen.set(key, groups.length);
            groups.push({ scoredBy: scorer, date: `${day}, ${time}`, count: 1, source: src });
          }
        });
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <History className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">Scoring History</h3>
                    <p className="text-xs text-gray-500 truncate max-w-[260px]">{historyModalItem.jobTitle}</p>
                  </div>
                </div>
                <button onClick={() => setHistoryModalItem(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-[420px]">
                {groups.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-gray-400">No scoring history available.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Scored By</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Date & Time</th>
                        <th className="text-center px-5 py-3 text-xs font-medium text-gray-500">Resumes</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {groups.map((g, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-semibold text-indigo-700">{g.scoredBy.charAt(0).toUpperCase()}</span>
                              </div>
                              <span className="text-gray-800 font-medium">{g.scoredBy}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-gray-600 text-xs whitespace-nowrap">{g.date}</td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-800 font-bold text-sm">{g.count}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.source === 'My Resumes' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-700 border border-gray-200'}`}>
                              {g.source}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="px-6 py-3 border-t border-gray-100 flex justify-between items-center bg-gray-50">
                <span className="text-xs text-gray-500">{historyModalItem.totalScored} total resumes scored</span>
                <button onClick={() => setHistoryModalItem(null)} className="px-4 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-medium hover:bg-gray-900 transition-colors">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      </main>
    );
  }

  // New Scoring Flow
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => {
              setViewMode('history');
              setSelectedJob('');
              setResumeSource(null);
              setSelectedResumes([]);
            }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Score Resumes</h1>
              {availableUnits !== null && (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs sm:text-sm font-medium rounded-full w-fit">
                  {availableUnits.toLocaleString()} units
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Select a job and let AI match the best candidates</p>
          </div>
        </div>
      </div>

      {/* Job Selection */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Select Job Description
        </label>

        {/* Custom Job Dropdown */}
        <div className="relative" ref={jobDropdownRef}>
          {/* Trigger button */}
          <button
            type="button"
            onClick={() => { setShowJobDropdown(v => !v); setJobDropdownSearch(''); }}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-left flex items-center justify-between gap-3 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent hover:border-gray-400 transition-colors"
          >
            {selectedJobData ? (
              <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                {selectedJobData.job_id && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold font-mono border border-blue-200">
                    {selectedJobData.job_id}
                  </span>
                )}
                <span className="text-gray-900 font-semibold text-sm">{selectedJobData.title}</span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                  Published
                </span>
                {selectedJobData.creation_method === 'ai_generated' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"></span>
                    AI
                  </span>
                )}
                {selectedJobData.current_version && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 border border-gray-200">
                    v{selectedJobData.current_version}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-gray-400 text-sm">Choose a published job...</span>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${showJobDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown panel */}
          {showJobDropdown && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-gray-100">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                  <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={jobDropdownSearch}
                    onChange={e => setJobDropdownSearch(e.target.value)}
                    placeholder="Search by title or JD ID..."
                    className="flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder-gray-400"
                  />
                </div>
              </div>
              {/* Options */}
              <div className="max-h-72 overflow-y-auto">
                {publishedJobs
                  .filter(j => j.title.toLowerCase().includes(jobDropdownSearch.toLowerCase()) || (j.job_id || '').toLowerCase().includes(jobDropdownSearch.toLowerCase()))
                  .map(job => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        setSelectedJob(job.id);
                        setResumeSource(null);
                        setSelectedResumes([]);
                        setShowResults(false);
                        setShowJobDropdown(false);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${selectedJob === job.id ? 'bg-blue-50 hover:bg-blue-50' : ''}`}
                    >
                      {/* JD ID + title + status + AI + version only */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {job.job_id && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold font-mono border border-blue-200">
                            {job.job_id}
                          </span>
                        )}
                        <span className="text-gray-900 font-medium text-sm">{job.title}</span>
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                          Published
                        </span>
                        {job.creation_method === 'ai_generated' && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"></span>
                            AI
                          </span>
                        )}
                        {job.current_version && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 border border-gray-200">
                            v{job.current_version}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                {publishedJobs.filter(j => j.title.toLowerCase().includes(jobDropdownSearch.toLowerCase()) || (j.job_id || '').toLowerCase().includes(jobDropdownSearch.toLowerCase())).length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">No jobs match your search</div>
                )}
              </div>
            </div>
          )}
        </div>

        {publishedJobs.length === 0 && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-700">
              No published jobs available. Create and publish a job first.
            </p>
          </div>
        )}

        {/* Selected Job Details */}
        {selectedJobData && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Briefcase className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  {/* Row 1: JD ID + title + badges */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    {selectedJobData.job_id && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold font-mono border border-blue-200">
                        {selectedJobData.job_id}
                      </span>
                    )}
                    <span className="font-semibold text-gray-900 text-sm">{selectedJobData.title}</span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                      Published
                    </span>
                    {selectedJobData.creation_method === 'ai_generated' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"></span>
                        AI
                      </span>
                    )}
                    {selectedJobData.current_version && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 border border-gray-200">
                        v{selectedJobData.current_version}
                      </span>
                    )}
                  </div>
                  {/* Row 2: industry · employment · remote · posted · by · applicants */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    {selectedJobData.industry_type && (
                      <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{formatIndustryType(selectedJobData.industry_type)}</span>
                    )}
                    {selectedJobData.employmentType && (
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatEmploymentType(selectedJobData.employmentType)}</span>
                    )}
                    {selectedJobData.remote_type && (
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /><span className="capitalize">{selectedJobData.remote_type}</span></span>
                    )}
                    {selectedJobData.published_at && (
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Posted {formatISTDate(selectedJobData.published_at)}</span>
                    )}
                    {selectedJobData.created_by_name && (
                      <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />By {selectedJobData.created_by_name}</span>
                    )}
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{selectedJobData.applicants} {selectedJobData.applicants === 1 ? 'applicant' : 'applicants'}</span>
                  </div>
                </div>
              </div>
              {canRunScoring && (
                <button
                  onClick={() => setShowResumeSelectionModal(true)}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2 bg-gray-800 text-white hover:bg-gray-700 cursor-pointer"
                >
                  <Target className="w-4 h-4" />
                  Select Resumes
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Resume Selection Modal */}
      {showResumeSelectionModal && selectedJobData && (
        <ResumeSelectionModal
          jobTitle={selectedJobData.title}
          myResumes={myResumes}
          databaseResumes={databaseResumes}
          folders={folders}
          availableUnits={availableUnits}
          error={selectionError}
          onClearError={() => setSelectionError(null)}
          onClose={() => {
            setShowResumeSelectionModal(false);
            setSelectionError(null); // Clear error when modal closes
          }}
          onResumeUploaded={async (resume) => {
            // Add uploaded resume to local state temporarily for immediate display
            setUploadedResumes(prev => [resume, ...prev]);

            // Refresh resumes from API to get the uploaded resume from backend
            // This ensures data consistency and prevents duplicates
            if (onRefreshResumes) {
              await onRefreshResumes();
              // Clear uploadedResumes since API data now has it
              setUploadedResumes([]);
            }
          }}
          onScoreResumes={async (selectedIds, source, versionSelections) => {
            // Clear any previous error when attempting to score
            setSelectionError(null);

            // Check for existing scores before proceeding
            try {
              toast.loading('Checking for existing scores...', { id: 'check-existing' });
              const checkResult = await scoringService.checkExistingScores(selectedJob, selectedIds);
              toast.dismiss('check-existing');

              // Close modal only if check succeeds
              setShowResumeSelectionModal(false);

              if (checkResult.existing_count > 0) {
                // Build already-scored items for progress display
                const alreadyScoredItems = checkResult.existing_scores.map((s: any) => ({
                  resumeId: s.resume_id,
                  candidateName: s.candidate_name || 'Unknown',
                  score: s.overall_score || 0,
                  scoredAt: s.scored_at,
                  matchStatus: s.match_status,
                }));

                // Filter out already-scored, keep only new ones
                const existingResumeIds = new Set(checkResult.existing_scores.map((s: any) => s.resume_id));
                const newResumeIds = selectedIds.filter(id => !existingResumeIds.has(id));
                const selectedResumesData = resumes.filter(r => newResumeIds.includes(r.id));
                let newResumeNames: string[];
                if (newResumeIds.length > 0) {
                  if (versionSelections && versionSelections.length > 0) {
                    const versionMap = new Map(versionSelections.map(v => [v.resumeId || v.id, v.candidateName || 'Unknown']));
                    newResumeNames = newResumeIds.map(id => versionMap.get(id) || 'Unknown');
                  } else {
                    newResumeNames = selectedResumesData.map(r => r.name || r.candidateName || r.candidate_name || 'Unknown');
                  }
                } else {
                  newResumeNames = [];
                }

                // Use redirect flow for both all-scored and partial cases
                const pendingData = {
                  jobId: selectedJob,
                  jobTitle: selectedJobData.title,
                  resumeIds: newResumeIds,
                  resumeNames: newResumeNames,
                  alreadyScoredItems,
                };
                sessionStorage.setItem('pendingScoringData', JSON.stringify(pendingData));
                window.location.href = `/recruitment/resume-scoring?jd_id=${selectedJob}&start_scoring=true&show_progress=true`;
                return;
              }
            } catch (error: any) {
              console.error('Failed to check existing scores:', error);
              toast.dismiss('check-existing');

              // Extract detailed error message from API response
              let errorMessage = 'Failed to verify existing scores. Please try again.';

              if (error?.response?.status === 400 && error?.response?.data?.detail) {
                const detail = error.response.data.detail;
                if (typeof detail === 'string') {
                  errorMessage = detail;
                } else if (detail.message) {
                  errorMessage = detail.message;
                } else if (detail.error) {
                  errorMessage = `${detail.error}: ${detail.message || 'Please check your selection and try again.'}`;
                }
              } else if (error?.response?.data?.message) {
                errorMessage = error.response.data.message;
              } else if (error?.message) {
                errorMessage = error.message;
              }

              console.log('[ResumeScoringPage] Setting selection error:', errorMessage);

              // Show error inline in the modal instead of toast
              setSelectionError(errorMessage);
              setShowResumeSelectionModal(true); // Keep/reopen modal with error
              return; // Don't proceed if check fails
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
          minimized={isBulkProgressMinimized}
          onMinimize={() => {
            setIsBulkProgressMinimized(true);
            setContextMinimized(true);
            setOnRestorePanel(() => () => {
              setIsBulkProgressMinimized(false);
              setContextMinimized(false);
            });
          }}
          onRetryFailed={async (item) => {
            try {
              console.log('[Retry] Starting retry for:', item.candidateName, 'resumeId:', item.resumeId, 'jobId:', item.jobId);

              // Update item status to "Scoring in progress"
              setProgressData(prev => prev.map(p =>
                p.id === item.id
                  ? { ...p, status: 'Scoring in progress' as const, errorReason: undefined }
                  : p
              ));

              // ✅ NEW: Use retry endpoint instead of direct scoring
              const retryResponse = await api.post('/api/v1/scoring/retry/single', {
                score_id: item.id,
                force: false
              });

              const retryData = retryResponse.data;

              if (retryData.status === 'SUCCESS') {
                // Update item with success status
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? {
                        ...p,
                        status: 'Scored successfully' as const,
                        errorReason: undefined,
                        scoredDateTime: new Date(),
                        matchResult: convertMatchStatus(retryData.match_status),
                        score: retryData.overall_score
                      }
                    : p
                ));

                toast.success(retryData.message || `Successfully scored ${item.candidateName}`);
              } else if (retryData.status === 'SKIPPED') {
                // Already scored
                setProgressData(prev => prev.map(p =>
                  p.id === item.id
                    ? { ...p, status: 'Already Scored - Skipped' as const }
                    : p
                ));
                toast.info(retryData.message);
              } else {
                // Failed
                throw new Error(retryData.message || 'Retry failed');
              }
            } catch (error: any) {
              console.error('[Retry] Error:', error);
              // Extract detailed error message
              const errorDetail = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Retry failed';
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


    </main>
  );
}
