"use client";

import { Target, Briefcase, Filter, Search, FileText, User, MapPin, Mail, Phone, CheckCircle, FolderOpen, Database, TrendingUp, Award, ChevronDown, Download, Clock, History, Eye, X, ArrowLeft, Send, MousePointer, PlayCircle, CheckCircle2, XCircle, AlertCircle, DollarSign, List, LayoutGrid, Loader2, Square, CheckSquare, ChevronLeft, ChevronRight, Building2, Calendar, Users } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ScoredResumesTable from './ScoredResumesTable';
import ListPagination from './ListPagination';
import ResumeSelectionModal from './ResumeSelectionModal';
import ResumeScoringStatusPanel from './ResumeScoringStatusPanel';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';
import api, { dispatchUnitsConsumed } from '@/lib/services/api';
import { scoringService } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import RecordPager from '@/components/RecordPager';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { Resume as SharedResume } from '@/lib/types/types';
import { useAuth } from '@/components/providers/AuthProvider';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import ModuleInfoBanner from '@/components/ModuleInfoBanner';
import { formatIST, formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';

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
  // Backend canonical and legacy camelCase candidate name fields — used by the
  // scoring page when reading resumes from either source.
  candidateName?: string;
  candidate_name?: string;
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
  source?: 'Internal DB' | 'My Resumes';
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
  historyLoading?: boolean;
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
  historyLoading = false,
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

  // Drill-in for the two action cards: list (Job-grouped + Global view) stays
  // hidden until either card is clicked.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  // Whether the floating Progress Tables icon has revealed its label.
  const [showProgressLabel, setShowProgressLabel] = useState(false);

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
  const showBulkProgressFromJob = (jobId: string, jobTitle: string, items: any[], source: 'Internal DB' | 'My Resumes' = 'Internal DB') => {
    const progressItems: ScoringProgressItem[] = items.map((item: any) => ({
      id: item.resumeId || '',
      resumeId: item.resumeId || '',
      candidateName: item.candidateName || 'Unknown',
      jobTitle: jobTitle,
      jobId: jobId,
      source: source,
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
  // Legacy history-filter state referenced by the "Clear All Filters" handler.
  // The active filter UI uses the fields above; these remain so the older clear
  // handler keeps compiling and resets any persisted legacy values.
  const [historySourceFilter, setHistorySourceFilter] = useState<'all' | string>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyMinCandidates, setHistoryMinCandidates] = useState(0);
  const [historyAvgScoreMin, setHistoryAvgScoreMin] = useState(0);
  void historySourceFilter; void historyDateFrom; void historyDateTo;
  void historyMinCandidates; void historyAvgScoreMin;

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

  // Persist list scroll position + view state across detail-page navigation, so
  // returning from a candidate/details drill-in lands the user exactly where
  // they left off. The scrollable content is the history-list view (the ref
  // walks up to the route's overflow container). Re-detect the scroller when a
  // toggle that drastically changes page height flips (cards<->list drill-in,
  // grid<->list, global view).
  const rootRef = useScrollRestoration<HTMLElement>('resume-scoring', !historyLoading, [pageView, isGlobalView, historyViewMode]);
  useListStatePersistence(
    'resume-scoring',
    {
      pageView, isGlobalView, globalSearchQuery, historyViewMode,
      historySearchQuery, historyCreatedBy, historyScoredFrom, historyScoredTo,
      historyLocation, historyJobType, historyIndustry,
      historyCurrentPage, historyItemsPerPage,
    },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (typeof s.isGlobalView === 'boolean') setIsGlobalView(s.isGlobalView);
      if (typeof s.globalSearchQuery === 'string') setGlobalSearchQuery(s.globalSearchQuery);
      if (s.historyViewMode === 'grid' || s.historyViewMode === 'list') setHistoryViewMode(s.historyViewMode);
      if (typeof s.historySearchQuery === 'string') setHistorySearchQuery(s.historySearchQuery);
      if (typeof s.historyCreatedBy === 'string') setHistoryCreatedBy(s.historyCreatedBy);
      if (typeof s.historyScoredFrom === 'string') setHistoryScoredFrom(s.historyScoredFrom);
      if (typeof s.historyScoredTo === 'string') setHistoryScoredTo(s.historyScoredTo);
      if (typeof s.historyLocation === 'string') setHistoryLocation(s.historyLocation);
      if (typeof s.historyJobType === 'string') setHistoryJobType(s.historyJobType);
      if (typeof s.historyIndustry === 'string') setHistoryIndustry(s.historyIndustry);
      if (typeof s.historyCurrentPage === 'number') setHistoryCurrentPage(s.historyCurrentPage);
      if (typeof s.historyItemsPerPage === 'number') setHistoryItemsPerPage(s.historyItemsPerPage);
    },
  );

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

  // Load the global candidates list whenever the "View All Candidates" view is
  // active but its data isn't loaded yet. This covers the case where the view
  // was restored from persistence (returning to this page) — previously only
  // the click handler fetched, so a restored global view showed empty. Guarded
  // by isLoadingGlobal so the click path (which fetches itself) doesn't double-fetch.
  useEffect(() => {
    if (isGlobalView && globalScoredResumes.length === 0 && !isLoadingGlobal) {
      fetchGlobalScoredResumes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobalView]);

  // Handle initial JD ID from URL - auto-open scored resumes view or start new scoring
  useEffect(() => {
    // Only handle initialJdId once
    if (initialJdHandled) return;

    // mode=new without a pre-selected JD (Quick Action entry): drop straight
    // into the "new scoring" view, same internal state change as the in-page
    // "Score Resumes" button.
    if (initialNewScoring && !initialJdId) {
      console.log('[ResumeScoringPage] mode=new (no jd_id): entering new scoring view');
      setViewMode('new');
      setSelectedJob('');
      setResumeSource(null);
      setSelectedResumes([]);
      setIsWaitingForInitialJd(false);
      setInitialJdHandled(true);
      return;
    }

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

    const { jobId, jobTitle, resumeIds, resumeNames, alreadyScoredItems = [], source = 'Internal DB' } = pendingScoringData;

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
    showBulkProgressFromJob(jobId, jobTitle, allInitialItems, source);

    // Also start tracking in persistent context (survives page refresh)
    const progressItems = resumeIds.map((resumeId, index) => ({
      id: `${jobId}-${resumeId}`,
      resumeId,
      candidateName: resumeNames[index] || `Resume ${index + 1}`,
      jobTitle,
      jobId,
      source: source,
    }));
    startScoringJob(jobId, jobTitle, progressItems);

    // Track item statuses for the modal (only new items to score)
    const newItemStatuses: { resumeId: string; candidateName: string; status: 'queued' | 'processing' | 'completed' | 'failed'; score?: number; matchStatus?: string; errorMessage?: string }[] =
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
        source: source,
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
        // Always derive the match result from the backend's authoritative
        // match_status (AI-determined, with backend threshold fallback). Never
        // recompute from the raw score on the frontend — those thresholds
        // disagree with the backend and showed everything as "No Match".
        matchResult: item.matchStatus
          ? convertMatchStatus(item.matchStatus)
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
                  newItemStatuses[idx].matchStatus = item.match_status;
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
              // Refresh header quota dropdown — Celery just finished deducting RS units on CP
              dispatchUnitsConsumed();

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

    // Source is tracked per-job in the persistent context (survives refresh);
    // fall back to Internal DB only if the job predates source tracking.
    const batchSource = getJobProgress(batchProgress.jobId)?.items?.[0]?.source ?? 'Internal DB';

    // Convert to BulkScoringProgressModal format
    const progressItems: ScoringProgressItem[] = items.map((item: any) => ({
      id: item.resumeId || '',
      resumeId: item.resumeId || '',
      candidateName: item.candidateName || 'Unknown',
      jobTitle: batchProgress.jobTitle,
      jobId: batchProgress.jobId,
      source: batchSource,
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
      <main className="flex-1 flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-blue mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-slate-400">Loading scored candidates...</p>
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
        breadcrumbItems={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Resume Scoring', onClick: () => {
            setSelectedCandidateForView(null);
            setSelectedHistoryItem(null);
            setViewMode('history');
            router.push(`/recruitment/resume-scoring`, { scroll: false });
          } },
          { label: selectedHistoryItem.jobTitle, onClick: () => {
            setSelectedCandidateForView(null);
            setViewMode('details');
            router.push(`/recruitment/resume-scoring?jd_id=${selectedHistoryItem.jobId}`, { scroll: false });
          } },
          { label: 'Candidate Details' },
        ]}
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
    const _globalIdx = globalScoredResumes.findIndex(
      (r: any) => (r.id ?? r.resumeId) === (selectedCandidateForView.id ?? selectedCandidateForView.resumeId)
    );
    const _goToGlobalCandidate = (candidate: any) => {
      setSelectedCandidateForView(candidate);
      const jdId = candidate.jdId || 'global';
      router.push(
        `/recruitment/resume-scoring?jd_id=${jdId}&score_id=${candidate.id ?? candidate.resumeId}`,
        { scroll: false }
      );
    };
    return (
      <CandidateScoringDetailPage
        resume={selectedCandidateForView}
        jobTitle={candidateJobTitle}
        jobId={candidateJdId}
        currentIndex={_globalIdx >= 0 ? _globalIdx : undefined}
        totalCount={globalScoredResumes.length}
        onPrev={_globalIdx > 0 ? () => _goToGlobalCandidate(globalScoredResumes[_globalIdx - 1]) : undefined}
        onNext={_globalIdx >= 0 && _globalIdx < globalScoredResumes.length - 1 ? () => _goToGlobalCandidate(globalScoredResumes[_globalIdx + 1]) : undefined}
        breadcrumbItems={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Resume Scoring', onClick: () => {
            setSelectedCandidateForView(null);
            setViewMode('history');
            router.push(`/recruitment/resume-scoring`, { scroll: false });
          } },
          { label: 'Candidate Details' },
        ]}
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
      <main className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full min-h-[calc(100vh-7rem)] bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Resume Scoring', onClick: () => {
            setViewMode('history');
            setSelectedHistoryItem(null);
            setSelectedStatusFilter('all');
          } },
          { label: selectedHistoryItem.jobTitle },
        ]} />
        {/* Header with Back Button + Prev/Next nav */}
        <div className="mb-5">
          {(() => {
            const _historyIdx = scoredHistory.findIndex(h => h.jobId === selectedHistoryItem.jobId);
            const _prevItem = _historyIdx > 0 ? scoredHistory[_historyIdx - 1] : null;
            const _nextItem = _historyIdx >= 0 && _historyIdx < scoredHistory.length - 1 ? scoredHistory[_historyIdx + 1] : null;
            const _goToHistoryItem = (item: ScoredResumeData) => {
              setSelectedHistoryItem(item);
              setSelectedScoredResumes([]);
              setSelectedStatusFilter('all');
              onLoadJdScores?.(item.jobId, item.jobTitle);
            };
            return (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <button
                  onClick={() => {
                    setViewMode('history');
                    setSelectedHistoryItem(null);
                    setSelectedStatusFilter('all');
                  }}
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-brand-blue hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue-2 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 flex-shrink-0" />
                  Back to Scored Candidates
                </button>
                {scoredHistory.length > 1 && (
                  <RecordPager
                    currentIndex={_historyIdx >= 0 ? _historyIdx : 0}
                    totalCount={scoredHistory.length}
                    onPrev={_prevItem ? () => _goToHistoryItem(_prevItem) : undefined}
                    onNext={_nextItem ? () => _goToHistoryItem(_nextItem) : undefined}
                    className="justify-between sm:justify-end"
                  />
                )}
              </div>
            );
          })()}

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                  <Target className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1 tracking-tight">{selectedHistoryItem.jobTitle}</h1>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatIST(selectedHistoryItem.scoredAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      {selectedHistoryItem.totalScored} candidates scored
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                      selectedHistoryItem.source === 'my-resumes'
                        ? 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-50'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-50'
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
                  className="w-full sm:w-auto px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 bg-brand-blue text-white hover:from-brand-blue-2 hover:to-brand-blue hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer"
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
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 mb-4">
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
                  className="w-4 h-4 text-brand-blue border-gray-300 dark:border-slate-700 rounded focus:ring-brand-blue/40"
                />
                <span className="text-sm text-gray-700 dark:text-slate-300 font-medium">
                  {selectedScoredResumes.length > 0
                    ? `${selectedScoredResumes.length} candidate${selectedScoredResumes.length > 1 ? 's' : ''} selected`
                    : 'Select candidates'}
                </span>
              </div>

              {selectedScoredResumes.length > 0 && canExport && (
                <button
                  onClick={handleBulkDownloadScorecards}
                  disabled={isBulkDownloading}
                  className="px-4 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all text-sm font-medium flex items-center gap-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBulkDownloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
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

        </div>
        </div>
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
      <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
        <div className={`p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl ${pageView === 'list' ? 'min-h-[calc(100vh-7rem)]' : ''}`}>
        <PageBreadcrumb className="mb-4 md:mb-8" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resume Scoring' }]} />
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          {/* Left: back + icon + title */}
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 bg-white dark:bg-slate-900 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200 dark:border-slate-700"
                aria-label="Back to Dashboard" title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-gray-700 dark:text-slate-300" />
              </button>
            )}
            <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <History className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-gray-900 dark:text-slate-50 text-lg sm:text-xl font-semibold tracking-tight">Scored Candidates</h1>
              <p className="text-sm text-gray-600 dark:text-slate-400 truncate">View and manage previously scored resumes</p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Available Units Display */}
            {availableUnits !== null && (
              <div className="bg-brand-blue rounded-xl shadow-md shadow-brand-blue/25 ring-1 ring-white/10 px-3 py-1.5 flex items-center gap-2">
                <div className="h-7 w-7 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <div className="text-[10px] text-blue-100 leading-tight">Available Units</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-white leading-tight">
                      {availableUnits.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-blue-100">units</span>
                  </div>
                </div>
              </div>
            )}

            {/* Progress Tables Button — commented out per request. The same
                action is still available via the "Progress Tables" stat card
                below the header, which calls the identical handler. */}
            {/* {scoredHistory.length > 0 && (
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
                className="px-3 py-2 bg-brand-cyan text-white rounded-lg hover:from-brand-teal hover:to-brand-cyan transition-all text-sm font-medium flex items-center gap-2 shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-cyan/30"
              >
                <Clock className="w-4 h-4" />
                <span>Progress Tables</span>
                <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                  {scoredHistory.reduce((sum, item) => sum + item.totalScored, 0)}
                </span>
              </button>
            )} */}

            {/* Score Resumes Button - only shown to users with run scoring permission */}
            {canRunScoring && (
              <button
                onClick={() => {
                  setViewMode('new');
                  setSelectedJob('');
                  setResumeSource(null);
                  setSelectedResumes([]);
                }}
                className="px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center gap-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 bg-brand-blue text-white hover:from-brand-blue-2 hover:to-brand-blue hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer"
              >
                <Target className="w-4 h-4" />
                Score Resumes
              </button>
            )}
          </div>
        </div>

        <ModuleInfoBanner
          icon={<Target className="h-4 w-4" />}
          title="AI-Powered Resume Scoring"
          description="Evaluate resumes against a selected job description using AI analysis of skills, experience, education, and role fit. Review transparent scores and recommendations to identify the strongest candidates faster."
        />

        {/* Overview cards — always visible; the active card is highlighted
            once its list is open below. */}
          <div className="mb-4 sm:mb-5">
            {/* Progress Tables — floating action button at the bottom-right
                corner. Clicking it reveals its label and opens the modal. */}
            {scoredHistory.length > 0 && (
              <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30">
                <div className="mx-auto flex max-w-[1400px] justify-end px-6 md:px-10">
                  <div className="pointer-events-auto flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowProgressLabel(true);
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
                  aria-label="Progress Tables"
                  title="Progress Tables"
                  className="h-12 w-12 rounded-full bg-brand-blue text-white flex items-center justify-center shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 hover:bg-brand-blue-2 transition-colors"
                >
                  <Clock className="w-5 h-5" />
                </button>
                {showProgressLabel && (
                  <span className="order-first rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-brand-blue shadow-sm ring-1 ring-brand-blue/15">
                    Progress Tables
                  </span>
                )}
                  </div>
                </div>
              </div>
            )}

            {/* Action cards — "View by Job" and "View All Candidates" as two
                separate cards. Clicking either opens its list view. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* View by Job card */}
              <button
                type="button"
                onClick={() => {
                  if (isGlobalView) {
                    setIsGlobalView(false);
                    setSelectedScoredResumes([]);
                  }
                  setPageView('list');
                }}
                className={`flex items-center gap-3 text-left bg-white dark:bg-slate-900 border rounded-xl p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:shadow-md ${pageView === 'list' && !isGlobalView ? 'border-brand-blue ring-2 ring-brand-blue/30' : 'border-gray-200 dark:border-slate-700/60 hover:border-brand-blue/30'}`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-slate-500">View by Job</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-slate-50 leading-tight tracking-tight">
                    {scoredHistory.length}
                  </p>
                </div>
              </button>

              {/* View All Candidates card */}
              <button
                type="button"
                onClick={() => {
                  if (!isGlobalView) {
                    fetchGlobalScoredResumes();
                    setIsGlobalView(true);
                    setSelectedScoredResumes([]);
                  }
                  setPageView('list');
                }}
                className={`flex items-center gap-3 text-left bg-white dark:bg-slate-900 border rounded-xl p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:shadow-md ${pageView === 'list' && isGlobalView ? 'border-brand-blue ring-2 ring-brand-blue/30' : 'border-gray-200 dark:border-slate-700/60 hover:border-brand-blue/30'}`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-slate-500">View All Candidates</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-slate-50 leading-tight tracking-tight">
                    {scoredHistory.reduce((sum, item) => sum + item.totalScored, 0)}
                  </p>
                </div>
              </button>
            </div>
          </div>

        {pageView === 'list' && (
        <>
        {/* Back to overview */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            onClick={() => setPageView('cards')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:text-brand-blue transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to overview
          </button>
        </div>

        {/* Global View - All Scored Candidates */}
        {isGlobalView ? (
          <div className="space-y-4">
            {isLoadingGlobal ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-10 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-brand-blue mx-auto mb-3" />
                <p className="text-sm text-gray-600 dark:text-slate-400">Loading all scored candidates...</p>
              </div>
            ) : globalScoredResumes.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-10 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                  <Search className="w-5 h-5 text-brand-blue" />
                </div>
                <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-slate-50 mb-2 tracking-tight">No Scored Candidates</h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">Score resumes against jobs to see them here.</p>
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
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 sm:gap-2 bg-brand-blue/5 ring-1 ring-brand-blue/10 rounded-lg p-1">
                <button
                  onClick={() => setHistoryViewMode('grid')}
                  className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    historyViewMode === 'grid'
                      ? 'bg-white dark:bg-slate-900 text-brand-blue shadow-sm shadow-brand-blue/10'
                      : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">Grid</span>
                </button>
                <button
                  onClick={() => setHistoryViewMode('list')}
                  className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    historyViewMode === 'list'
                      ? 'bg-white dark:bg-slate-900 text-brand-blue shadow-sm shadow-brand-blue/10'
                      : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">List</span>
                </button>
              </div>

              {selectedHistoryItems.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-slate-400">
                    {selectedHistoryItems.size} selected
                  </span>
                </div>
              )}
            </div>

            {selectedHistoryItems.size > 0 && (
              <button
                onClick={handleDownloadSelectedHistory}
                className="flex items-center gap-2 px-4 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all text-sm font-medium shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30"
              >
                <Download className="w-4 h-4" />
                Download Selected ({selectedHistoryItems.size})
              </button>
            )}
          </div>
        </div>

        {/* Search and Filter Bar — only when there's a list to filter */}
        {scoredHistory.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 mb-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-brand-blue/60" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Search by job title..."
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 transition-shadow text-sm text-gray-900 dark:text-slate-50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowHistoryFilters(!showHistoryFilters)}
                  className={`flex-1 sm:flex-none px-3 py-2 rounded-lg border transition-all flex items-center justify-center gap-2 font-medium text-sm ${
                    activeFiltersCount > 0
                      ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue shadow-sm shadow-brand-blue/5'
                      : 'bg-brand-blue/5 border-brand-blue/10 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:border-brand-blue/20 hover:text-brand-blue'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFiltersCount > 0 && (
                    <span className="px-2 py-0.5 bg-brand-blue text-white rounded-full text-xs font-medium">
                      {activeFiltersCount}
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showHistoryFilters ? 'rotate-180' : ''}`} />
                </button>

                <div className="text-sm text-gray-700 dark:text-slate-300 bg-brand-blue/5 ring-1 ring-brand-blue/10 px-3 py-2 rounded-lg whitespace-nowrap font-medium">
                  <span className="text-brand-blue font-semibold">{displayHistory.length}</span> of {scoredHistory.length + (processingEntry ? 1 : 0)} jobs
                </div>
              </div>
            </div>

            {/* Expanded Filters */}
            {showHistoryFilters && (() => {
              const uniqueLocations = [...new Set(scoredHistory.map(i => i.jdLocation).filter(Boolean))];
              const uniqueJobTypes = [...new Set(scoredHistory.map(i => i.jdEmploymentType).filter(Boolean))];
              const uniqueIndustries = [...new Set(scoredHistory.map(i => i.jdIndustryType).filter(Boolean))];
              const uniqueCreators = [...new Set(scoredHistory.map(i => i.jdCreatedByName).filter(Boolean))];
              const selectCls = "w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 text-sm";
              const inputCls = "w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 text-sm";
              const labelCls = "block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5";
              return (
                <div className="mt-4 pt-4 border-t border-brand-blue/10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className={labelCls}>Created By</label>
                      <select value={historyCreatedBy} onChange={e => setHistoryCreatedBy(e.target.value)} className={selectCls}>
                        <option value="">All Users</option>
                        {uniqueCreators.map(name => <option key={name} value={name!}>{name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Scored From</label>
                      <input type="date" value={historyScoredFrom} onChange={e => setHistoryScoredFrom(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Scored To</label>
                      <input type="date" value={historyScoredTo} onChange={e => setHistoryScoredTo(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Location</label>
                      <select value={historyLocation} onChange={e => setHistoryLocation(e.target.value)} className={selectCls}>
                        <option value="">All Locations</option>
                        {uniqueLocations.map(l => <option key={l} value={l!}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Job Type</label>
                      <select value={historyJobType} onChange={e => setHistoryJobType(e.target.value)} className={selectCls}>
                        <option value="">All Types</option>
                        {uniqueJobTypes.map(t => <option key={t} value={t!}>{formatEmploymentType(t)}</option>)}
                      </select>
                    </div>
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
                        className="px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-all flex items-center gap-2 text-sm font-medium"
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
        )}

        {/* History List or Empty State */}
        {displayHistory.length > 0 ? (
          <>
          <div className={historyViewMode === 'grid' ? 'grid gap-4' : 'space-y-3'}>
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
                    className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
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
                    <div className="flex flex-col sm:flex-row items-start gap-3">
                      {/* Scoring icon - like AI Talent Match */}
                      <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                        <Target className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0 w-full">
                        {/* Title row — matches JD list card */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {item.jdJobId && (
                            <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded-md text-xs font-bold font-mono border border-brand-blue/20 flex-shrink-0">
                              {item.jdJobId}
                            </span>
                          )}
                          <h3
                            className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate cursor-pointer hover:text-brand-blue transition-colors"
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
                              draft:     { label: 'Draft',     bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', border: 'border-brand-orange/20', dot: 'bg-brand-orange' },
                            };
                            const c = cfg[s] || cfg.published;
                            return (
                              <span className={`px-2 py-0.5 rounded-full text-xs ${c.bg} ${c.text} border ${c.border} flex items-center gap-1.5 flex-shrink-0`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></div>
                                {c.label}
                              </span>
                            );
                          })()}
                          {/* Version badge */}
                          {item.jdCurrentVersion && item.jdCurrentVersion >= 1 && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 flex items-center gap-1.5 flex-shrink-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500"></div>
                              v{item.jdCurrentVersion}
                            </span>
                          )}
                          {/* History icon button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setHistoryModalItem(item); }}
                            className="p-1.5 rounded-lg border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/15 transition-colors flex-shrink-0"
                            aria-label="Scoring History" title="Scoring History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Info row — matches JD list card exactly */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-600 dark:text-slate-400 mb-2">
                          {item.jdDepartment && (
                            <span className="flex items-center gap-1.5">
                              <Briefcase className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {item.jdDepartment}
                            </span>
                          )}
                          {item.jdIndustryType && (
                            <span className="flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {formatIndustryType(item.jdIndustryType)}
                            </span>
                          )}
                          {item.jdLocation && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {item.jdLocation}
                          </span>
                          )}
                          {item.jdEmploymentType && (
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {formatEmploymentType(item.jdEmploymentType)}
                            </span>
                          )}
                          {item.jdRemoteType && (
                            <span className="flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              <span className="capitalize">{item.jdRemoteType}</span>
                            </span>
                          )}
                          {item.scoredResumes?.[0]?.scoredBy && (
                            <span className="flex items-center gap-1.5">
                              <User className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              Scored by {item.scoredResumes[0].scoredBy}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {formatIST(item.scoredAt)}
                          </span>
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                            <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
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
                          className="px-3 py-2 bg-brand-cyan text-white rounded-lg hover:from-brand-teal hover:to-brand-cyan transition-all text-sm font-medium flex items-center gap-1.5 justify-center w-full shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10"
                        >
                          <Eye className="w-4 h-4" />
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
                          className="px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-sm font-medium flex items-center justify-center w-full"
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
                  className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 transition-all p-4 group hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5"
                >
                  <div className="flex flex-col sm:flex-row items-start gap-3">
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
                      <div className="p-0 mb-3">
                        {/* Top: icon + badges */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Briefcase className="h-4 w-4 text-brand-blue" />
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
                                draft:     { label: 'Draft',     bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', border: 'border-brand-orange/20', dot: 'bg-brand-orange' },
                              };
                              const c = cfg[s] || cfg.published;
                              return (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${c.bg} ${c.text} border ${c.border} flex items-center gap-1.5`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></div>
                                  {c.label}
                                </span>
                              );
                            })()}
                            {item.jdCurrentVersion && item.jdCurrentVersion >= 1 && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500"></div>
                                v{item.jdCurrentVersion}
                              </span>
                            )}
                            {/* History icon button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setHistoryModalItem(item); }}
                              className="p-1.5 rounded-lg border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/15 transition-colors flex-shrink-0"
                              aria-label="Scoring History" title="Scoring History"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* job_id + title */}
                        <div className="flex items-center gap-2 mb-3">
                          {item.jdJobId && (
                            <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded-md text-xs font-bold font-mono border border-brand-blue/20">
                              {item.jdJobId}
                            </span>
                          )}
                          <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 line-clamp-2">
                            {item.jobTitle}
                          </h3>
                        </div>

                        {/* Info rows — matches JD grid card body */}
                        <div className="space-y-2">
                          {item.jdDepartment && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <Briefcase className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span className="truncate">{item.jdDepartment}</span>
                            </div>
                          )}
                          {item.jdIndustryType && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <Building2 className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span className="truncate">{formatIndustryType(item.jdIndustryType)}</span>
                            </div>
                          )}
                          {item.jdLocation && (
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                            <MapPin className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                            <span className="truncate">{item.jdLocation}</span>
                          </div>
                          )}
                          {item.jdEmploymentType && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span className="truncate">{formatEmploymentType(item.jdEmploymentType)}</span>
                            </div>
                          )}
                          {item.jdRemoteType && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <Users className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span className="capitalize">{item.jdRemoteType}</span>
                            </div>
                          )}
                          {item.jdPublishedAt && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span>Posted {formatISTDate(item.jdPublishedAt)}</span>
                            </div>
                          )}
                          {item.jdCreatedByName && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <User className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                              <span className="truncate">By {item.jdCreatedByName}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                            <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                            <span>{item.totalScored} {item.totalScored === 1 ? 'candidate' : 'candidates'} scored</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gradient-to-br from-green-50 to-green-50/40 border border-green-200/70 ring-1 ring-green-100 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 dark:text-slate-300 font-medium">Exact Match</span>
                            <Award className="w-4 h-4 text-green-600" />
                          </div>
                          <div className="text-2xl text-green-700 font-bold tracking-tight">{exactMatchCount}</div>
                        </div>
                        <div className="bg-gradient-to-br from-brand-cyan/10 to-brand-cyan/5 border border-brand-cyan/20 ring-1 ring-brand-cyan/10 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 dark:text-slate-300 font-medium">Partial Match</span>
                            <CheckCircle className="w-4 h-4 text-brand-cyan" />
                          </div>
                          <div className="text-2xl text-brand-cyan font-bold tracking-tight">{partialMatchCount}</div>
                        </div>
                        <div className="bg-gradient-to-br from-brand-orange/10 to-brand-orange/5 border border-brand-orange/20 ring-1 ring-brand-orange/10 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 dark:text-slate-300 font-medium">No Match</span>
                            <XCircle className="w-4 h-4 text-brand-orange-deep" />
                          </div>
                          <div className="text-2xl text-brand-orange-deep font-bold tracking-tight">{noMatchCount}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-center w-full sm:w-auto">
                      <div className="text-xs text-gray-600 dark:text-slate-400 mb-1 font-medium">Avg Score</div>
                      <div className={`text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 tracking-tight ${getScoreColor(avgScore)}`}>
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
                          className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium flex items-center gap-1.5 justify-center w-full"
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
                          className="flex-1 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-sm font-medium flex items-center gap-1.5 justify-center cursor-pointer"
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
        ) : historyLoading && scoredHistory.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-8 sm:p-10 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-blue mx-auto mb-3" />
            <p className="text-gray-600 dark:text-slate-400 text-sm">Loading scoring history...</p>
          </div>
        ) : scoredHistory.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-brand-blue/20 p-8 sm:p-10 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto mb-3 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                <History className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 mb-2 tracking-tight font-semibold">No Scoring History Yet</h3>
              <p className="text-gray-600 dark:text-slate-400 text-sm mb-4">
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
                  className="px-4 py-2 rounded-lg transition-all font-medium text-sm shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 inline-flex items-center gap-1.5 bg-brand-blue text-white hover:from-brand-blue-2 hover:to-brand-blue hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer"
                >
                  <Target className="w-4 h-4" />
                  Score Resumes Now
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-brand-blue/20 p-8 sm:p-10 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto mb-3 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                <Search className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 mb-2 tracking-tight font-semibold">No Results Found</h3>
              <p className="text-gray-600 dark:text-slate-400 text-sm mb-4">
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
                className="px-4 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all font-medium text-sm shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 inline-flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                Clear All Filters
              </button>
            </div>
          </div>
        )}
        </>
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
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center">
                    <History className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-slate-50 text-sm">Scoring History</h3>
                    <p className="text-xs text-gray-500 dark:text-slate-500 truncate max-w-[260px]">{historyModalItem.jobTitle}</p>
                  </div>
                </div>
                <button onClick={() => setHistoryModalItem(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" aria-label="Close">
                  <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                {groups.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-gray-400 dark:text-slate-500">No scoring history available.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60 sticky top-0">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-slate-500">Scored By</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-slate-500">Date & Time</th>
                        <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 dark:text-slate-500">Resumes</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-slate-500">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {groups.map((g, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-semibold text-brand-blue">{g.scoredBy.charAt(0).toUpperCase()}</span>
                              </div>
                              <span className="text-gray-800 dark:text-slate-100 font-medium">{g.scoredBy}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-gray-600 dark:text-slate-400 text-xs whitespace-nowrap">{g.date}</td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-100 font-bold text-sm">{g.count}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.source === 'My Resumes' ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20' : 'bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700'}`}>
                              {g.source}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50 shrink-0">
                <span className="text-xs text-gray-500 dark:text-slate-500">{historyModalItem.totalScored} total resumes scored</span>
                <button onClick={() => setHistoryModalItem(null)} className="px-4 py-1.5 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg text-xs font-medium shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-all">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      </div>
      </div>
      </main>
    );
  }

  // New Scoring Flow
  return (
    <main className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className={`p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl ${showJobDropdown ? 'min-h-[780px]' : ''}`}>
      <PageBreadcrumb className="mb-4 md:mb-8" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Resume Scoring' }]} />
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              setViewMode('history');
              setSelectedJob('');
              setResumeSource(null);
              setSelectedResumes([]);
            }}
            className="p-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors flex-shrink-0"
            aria-label="Back" title="Back"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-slate-400" />
          </button>
          <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
            <Target className="h-4 w-4 text-brand-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Score Resumes</h1>
              {availableUnits !== null && (
                <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 text-xs font-medium rounded-full w-fit">
                  {availableUnits.toLocaleString()} units
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5">Select a job and let AI match the best candidates</p>
          </div>
        </div>
      </div>

      <ModuleInfoBanner
        icon={<Target className="h-4 w-4" />}
        title="AI-Powered Resume Scoring"
        description="Evaluate resumes against a selected job description using AI analysis of skills, experience, education, and role fit. Review transparent scores and recommendations to identify the strongest candidates faster."
      />

      {/* Job Selection */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 mb-5">
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Select Job Description
        </label>

        {/* Custom Job Dropdown */}
        <div className="relative" ref={jobDropdownRef}>
          {/* Trigger button */}
          <button
            type="button"
            onClick={() => { setShowJobDropdown(v => !v); setJobDropdownSearch(''); }}
            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-left flex items-center justify-between gap-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 hover:border-brand-blue/30 transition-colors"
          >
            {selectedJobData ? (
              <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                {selectedJobData.job_id && (
                  <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded text-xs font-bold font-mono border border-brand-blue/20">
                    {selectedJobData.job_id}
                  </span>
                )}
                <span className="text-gray-900 dark:text-slate-50 font-semibold text-sm">{selectedJobData.title}</span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                  Published
                </span>
                {selectedJobData.creation_method === 'ai_generated' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-brand-blue-2/10 text-brand-blue-2 border border-brand-blue-2/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-blue-2 inline-block"></span>
                    AI
                  </span>
                )}
                {selectedJobData.current_version && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
                    v{selectedJobData.current_version}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-gray-400 dark:text-slate-500 text-sm">Choose a published job...</span>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-500 dark:text-slate-500 flex-shrink-0 transition-transform ${showJobDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown panel */}
          {showJobDropdown && (
            <div className="absolute z-[9999] mt-1 left-0 right-0 w-full bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-xl shadow-lg shadow-brand-blue/10 overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex items-center gap-2 px-3 py-2 bg-brand-blue/5 ring-1 ring-brand-blue/10 rounded-lg">
                  <Search className="w-4 h-4 text-brand-blue/60 flex-shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={jobDropdownSearch}
                    onChange={e => setJobDropdownSearch(e.target.value)}
                    placeholder="Search by title or JD ID..."
                    className="flex-1 bg-transparent text-sm text-gray-700 dark:text-slate-300 outline-none placeholder-gray-400 dark:placeholder-slate-500"
                  />
                </div>
              </div>
              {/* Options */}
              <div className="min-h-[400px] max-h-[400px] overflow-y-auto">
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
                      className={`w-full px-3 py-2 text-left hover:bg-brand-blue/5 transition-colors border-b border-gray-100 dark:border-slate-700/60 last:border-0 ${selectedJob === job.id ? 'bg-brand-blue/10 hover:bg-brand-blue/10' : ''}`}
                    >
                      {/* JD ID + title + status + AI + version only */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {job.job_id && (
                          <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded text-xs font-bold font-mono border border-brand-blue/20">
                            {job.job_id}
                          </span>
                        )}
                        <span className="text-gray-900 dark:text-slate-50 font-medium text-sm">{job.title}</span>
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                          Published
                        </span>
                        {job.creation_method === 'ai_generated' && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-brand-blue-2/10 text-brand-blue-2 border border-brand-blue-2/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-blue-2 inline-block"></span>
                            AI
                          </span>
                        )}
                        {job.current_version && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
                            v{job.current_version}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                {publishedJobs.filter(j => j.title.toLowerCase().includes(jobDropdownSearch.toLowerCase()) || (j.job_id || '').toLowerCase().includes(jobDropdownSearch.toLowerCase())).length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">No jobs match your search</div>
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
          <div className="mt-3 p-3 bg-gradient-to-br from-brand-blue/[0.04] to-brand-cyan/[0.03] border border-brand-blue/15 ring-1 ring-brand-blue/5 rounded-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 bg-brand-blue rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                  <Briefcase className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  {/* Row 1: JD ID + title + badges */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    {selectedJobData.job_id && (
                      <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded text-xs font-bold font-mono border border-brand-blue/20">
                        {selectedJobData.job_id}
                      </span>
                    )}
                    <span className="font-semibold text-gray-900 dark:text-slate-50 text-sm">{selectedJobData.title}</span>
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
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
                        v{selectedJobData.current_version}
                      </span>
                    )}
                  </div>
                  {/* Row 2: industry · employment · remote · posted · by · applicants */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-500 flex-wrap">
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
                  className="w-full sm:w-auto px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer"
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

            // Carry the actual source tab through to the progress modal so the
            // Source column reflects where the resumes came from (was always
            // hardcoded to "Internal DB").
            const sourceLabel: 'Internal DB' | 'My Resumes' = source === 'my-resumes' ? 'My Resumes' : 'Internal DB';

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
                  source: sourceLabel,
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
              source: sourceLabel,
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


    </div>
    </main>
  );
}
