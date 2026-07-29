'use client';

import { Sparkles, Target, Filter, Search, ChevronDown, ChevronLeft, ChevronRight, Mail, Phone, MapPin, Building2, CheckCircle, Star, User, FileText, Send, TrendingUp, Award, Clock, Briefcase, History, Eye, ArrowLeft, X, DollarSign, CheckCircle2, AlertCircle, AlertTriangle, PlayCircle, Paperclip, ClipboardList, XCircle, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import AITalentMatchPageJobsList from './AITalentMatchPageJobsList';
import ResumeVersionsModal from './ResumeVersionsModal';
import Pagination from './Pagination';
import ListPagination from './ListPagination';
import { recordUsage } from '@/lib/services/usageTrackingService';
import { aiMatchService, MatchedCandidate } from '@/lib/services/aiMatchService';
import { scoringService } from '@/lib/services/scoringService';
import { resumeService } from '@/lib/services/resumeService';
import { jdService } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { assessmentService } from '@/lib/services';
import ShareAssessmentModal from './ShareAssessmentModal';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds, parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';
import SkillsList from '@/components/ui/SkillsList';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import ModuleInfoBanner from '@/components/ModuleInfoBanner';
import RecordPager from '@/components/RecordPager';
import { formatISTDate, formatIST } from '@/lib/utils/dateUtils';
import { useQuota } from '@/contexts/QuotaContext';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';

interface Job {
  id: string;
  title: string;
  department?: string;
  location: string;
  status: string;
  applicants: number;
  employmentType?: string;
  experience?: string;
  jobId?: string;
  currentVersion?: number;
}

// Extended interface for UI display (adds versions for modal)
interface MatchedCandidateWithVersions extends MatchedCandidate {
  versions?: Array<{
    id: string;
    name: string;
    uploadDate: string;
    size: string;
  }>;
}

interface MatchHistory {
  id: string;
  jobId: string;
  jobTitle: string;
  matchedAt: Date;
  totalMatches: number;
  matchedCandidates: MatchedCandidateWithVersions[];
}

interface AITalentMatchPageProps {
  jobs: Job[];
  matchHistory?: MatchHistory[];
  onSaveMatch?: (data: MatchHistory) => void;
  onSubmitToScoring?: (jobId: string, candidateIds: string[]) => void;
  onBack?: () => void;
}

export default function AITalentMatchPage({
  jobs,
  matchHistory = [],
  onSaveMatch,
  onSubmitToScoring,
  onBack
}: AITalentMatchPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission, isTenantAdmin, user } = useAuth();
  const { quotaData } = useQuota();

  // ✅ RBAC: Check if user can run AI match operations (bypass for tenant admin)
  const canRunAiMatch = isTenantAdmin || (user?.permissions?.canRunAiMatch ?? false);
  const canRunScoring = isTenantAdmin || (user?.permissions?.canRunScoring ?? false);


  const [viewMode, setViewMode] = useState<'history' | 'details' | 'new' | 'results'>('history');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<MatchHistory | null>(null);
  const [selectedJob, setSelectedJob] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterThreshold, setFilterThreshold] = useState(0);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);

  // Additional filters
  const [filterPhone, setFilterPhone] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterExperienceMin, setFilterExperienceMin] = useState<number | ''>('');
  const [filterExperienceMax, setFilterExperienceMax] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<'rank' | 'name' | 'score' | 'experience'>('rank'); // Sort by highest rating first (DevRMS style)

  // Pagination state for match results
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Assessment-related state
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessments, setSelectedAssessments] = useState<any[]>([]); // Changed to store full assessment objects
  const [assessmentSearchQuery, setAssessmentSearchQuery] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [currentAssessmentForShare, setCurrentAssessmentForShare] = useState<any>(null);
  const [prefilledCandidates, setPrefilledCandidates] = useState<any[]>([]);


  // Track if we're in an active matching session to prevent URL effect interference
  const isMatchingInProgress = useRef(false);
  // Track if user manually changed view (to prevent useEffect from resetting)
  const userChangedView = useRef(false);

  // Helper function to format uploaded by name (avoid showing UUIDs)
  const formatUploadedBy = (name?: string, id?: string) => {
    // Check if uploadedByName exists and is not a UUID
    if (name && !name.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return name;
    }
    // If we only have UUID or no name, return generic label
    return 'System';
  };

  const availableUnits = useMemo(() => {
    const remaining = quotaData?.quotas?.RS?.total_remaining;
    if (typeof remaining === 'number') return remaining;
    if (typeof remaining === 'string') {
      if (remaining.toLowerCase() === 'unlimited') return null;
      const parsed = Number(remaining);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, [quotaData]);

  const getResolvedHistoryCandidates = (item: MatchHistory | null | undefined): MatchedCandidateWithVersions[] => {
    if (!item) return [];
    return historyCandidatesById[item.id] ?? item.matchedCandidates ?? [];
  };

  const loadHistoryCandidates = async (item: MatchHistory): Promise<MatchedCandidateWithVersions[]> => {
    if (historyCandidatesById[item.id]) {
      return historyCandidatesById[item.id];
    }
    if (item.totalMatches <= 0) {
      return [];
    }

    setLoadingHistorySessionId(item.id);
    try {
      const details = await aiMatchService.getSession(item.id);
      const candidates = details.candidates as MatchedCandidateWithVersions[];
      setHistoryCandidatesById(prev => ({ ...prev, [item.id]: candidates }));
      return candidates;
    } catch (error) {
      console.error('[AITalentMatch] Failed to fetch session details:', error);
      toast.error('Failed to load matched candidates');
      return [];
    } finally {
      setLoadingHistorySessionId(current => current === item.id ? null : current);
    }
  };

  // Helper to update URL params - use shallow routing to prevent full page reload
  const updateUrlParams = (params: { jdId?: string; view?: string }) => {
    const url = new URL(window.location.href);

    if (params.jdId) {
      url.searchParams.set('jdId', params.jdId);
    } else {
      url.searchParams.delete('jdId');
    }

    if (params.view) {
      url.searchParams.set('view', params.view);
    } else {
      url.searchParams.delete('view');
    }

    router.push(url.pathname + url.search, { scroll: false });
  };
  
  // History filters
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyFilterPhone, setHistoryFilterPhone] = useState('');
  const [historyFilterLocation, setHistoryFilterLocation] = useState('');
  const [historyFilterExpMin, setHistoryFilterExpMin] = useState<number | ''>('');
  const [historyFilterExpMax, setHistoryFilterExpMax] = useState<number | ''>('');
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);
  // Two-step view: 'cards' shows just the Matched Jobs stats card; clicking it reveals 'list'.
  const [historyPageView, setHistoryPageView] = useState<'cards' | 'list'>('cards');

  useEffect(() => {
    setHistoryCurrentPage(1);
  }, [historySearchQuery, historyDateFrom, historyDateTo, historyFilterPhone, historyFilterLocation, historyFilterExpMin, historyFilterExpMax]);
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  
  // Matching progress
  const [showMatchingPanel, setShowMatchingPanel] = useState(false);
  const [matchedCandidates, setMatchedCandidates] = useState<MatchedCandidateWithVersions[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  
  // Versions modal
  const [selectedVersionsCandidate, setSelectedVersionsCandidate] = useState<MatchedCandidateWithVersions | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [realVersionsData, setRealVersionsData] = useState<any[]>([]);

  // Version selection for scoring (single candidate)
  const [showVersionSelectForScoring, setShowVersionSelectForScoring] = useState(false);
  const [scoringCandidate, setScoringCandidate] = useState<MatchedCandidateWithVersions | null>(null);
  const [scoringVersions, setScoringVersions] = useState<any[]>([]);
  const [historyCandidatesById, setHistoryCandidatesById] = useState<Record<string, MatchedCandidateWithVersions[]>>({});
  const [loadingHistorySessionId, setLoadingHistorySessionId] = useState<string | null>(null);

  // Scored resume IDs for current JD
  const [scoredResumeIds, setScoredResumeIds] = useState<Set<string>>(new Set());

  // Persist + restore the Matched Jobs list scroll position and view state
  // (two-step view, filters, search, pagination) so returning from a detail
  // page lands the user where they left off instead of a reset list. Scroll is
  // only tracked while the history list is mounted (viewMode === 'history').
  const rootRef = useScrollRestoration<HTMLElement>('ai-talent-match', viewMode === 'history', [historyPageView]);
  useListStatePersistence(
    'ai-talent-match',
    {
      historyPageView, showHistoryFilters,
      historySearchQuery, historyDateFrom, historyDateTo,
      historyFilterPhone, historyFilterLocation, historyFilterExpMin, historyFilterExpMax,
      historyCurrentPage, historyItemsPerPage,
      searchQuery, filterThreshold, filterPhone, filterLocation,
      filterExperienceMin, filterExperienceMax, sortBy,
      currentPage, itemsPerPage,
    },
    (s) => {
      if (s.historyPageView === 'cards' || s.historyPageView === 'list') setHistoryPageView(s.historyPageView);
      if (typeof s.showHistoryFilters === 'boolean') setShowHistoryFilters(s.showHistoryFilters);
      if (typeof s.historySearchQuery === 'string') setHistorySearchQuery(s.historySearchQuery);
      if (typeof s.historyDateFrom === 'string') setHistoryDateFrom(s.historyDateFrom);
      if (typeof s.historyDateTo === 'string') setHistoryDateTo(s.historyDateTo);
      if (typeof s.historyFilterPhone === 'string') setHistoryFilterPhone(s.historyFilterPhone);
      if (typeof s.historyFilterLocation === 'string') setHistoryFilterLocation(s.historyFilterLocation);
      if (typeof s.historyFilterExpMin === 'number' || s.historyFilterExpMin === '') setHistoryFilterExpMin(s.historyFilterExpMin as number | '');
      if (typeof s.historyFilterExpMax === 'number' || s.historyFilterExpMax === '') setHistoryFilterExpMax(s.historyFilterExpMax as number | '');
      if (typeof s.historyCurrentPage === 'number') setHistoryCurrentPage(s.historyCurrentPage);
      if (typeof s.historyItemsPerPage === 'number') setHistoryItemsPerPage(s.historyItemsPerPage);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.filterThreshold === 'number') setFilterThreshold(s.filterThreshold);
      if (typeof s.filterPhone === 'string') setFilterPhone(s.filterPhone);
      if (typeof s.filterLocation === 'string') setFilterLocation(s.filterLocation);
      if (typeof s.filterExperienceMin === 'number' || s.filterExperienceMin === '') setFilterExperienceMin(s.filterExperienceMin as number | '');
      if (typeof s.filterExperienceMax === 'number' || s.filterExperienceMax === '') setFilterExperienceMax(s.filterExperienceMax as number | '');
      if (s.sortBy === 'rank' || s.sortBy === 'name' || s.sortBy === 'score' || s.sortBy === 'experience') setSortBy(s.sortBy);
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  // Fetch scored resumes when viewing details or results for a JD
  useEffect(() => {
    const jobId = selectedHistoryItem?.jobId || (viewMode === 'results' ? selectedJob : '');
    if (!jobId) {
      setScoredResumeIds(new Set());
      return;
    }
    const fetchScored = async () => {
      try {
        const allItems: any[] = [];
        let page = 1;
        while (true) {
          const response = await jdService.getScoredResumes(jobId, { page_size: 100, page });
          allItems.push(...(response.items || []));
          if (allItems.length >= (response.total || 0) || (response.items || []).length < 100) break;
          page++;
        }
        const ids = new Set<string>(
          allItems.map((r: any) => r.resume_id).filter(Boolean)
        );
        setScoredResumeIds(ids);
      } catch (e) {
        setScoredResumeIds(new Set());
      }
    };
    fetchScored();
  }, [selectedHistoryItem, selectedJob, viewMode]);

  useEffect(() => {
    const hydrateSelectedHistory = async () => {
      if (viewMode === 'details' && selectedHistoryItem) {
        const resolvedCandidates = getResolvedHistoryCandidates(selectedHistoryItem);
        if (selectedHistoryItem.totalMatches > 0 && resolvedCandidates.length === 0) {
          const candidates = await loadHistoryCandidates(selectedHistoryItem);
          setSelectedHistoryItem(prev => prev && prev.id === selectedHistoryItem.id
            ? { ...prev, matchedCandidates: candidates }
            : prev);
        }
        return;
      }

      if (viewMode === 'results' && selectedJob && matchedCandidates.length === 0) {
        const historyItem = matchHistory.find(item => item.jobId === selectedJob);
        if (!historyItem || historyItem.totalMatches <= 0) return;

        const candidates = await loadHistoryCandidates(historyItem);
        setMatchedCandidates(candidates);
        setSelectedHistoryItem({
          ...historyItem,
          matchedCandidates: candidates,
        });
      }
    };

    hydrateSelectedHistory();
  }, [viewMode, selectedHistoryItem, selectedJob, matchedCandidates.length, matchHistory, historyCandidatesById]);

  // Handle attachments click - fetch real versions
  const handleAttachmentsClick = async (candidate: MatchedCandidateWithVersions) => {
    if (!candidate.resumeId) {
      toast.error('Resume ID not found');
      return;
    }

    // Show modal with loading state
    setSelectedVersionsCandidate(candidate);
    setLoadingVersions(true);
    setRealVersionsData([]);

    try {
      console.log('[Attachments] Fetching versions for resume:', candidate.resumeId);
      const response = await resumeService.getVersions(candidate.resumeId);
      console.log('[Attachments] API Response:', response);

      // API returns array directly from response.data (resumeService already extracts .data)
      let versions = Array.isArray(response) ? response : [];

      // If no versions returned, create a default version from the candidate info
      if (versions.length === 0) {
        versions = [{
          id: candidate.resumeId,
          version: 1,
          file_name: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf`,
          created_at: candidate.uploadDate || new Date().toISOString(),
          uploaded_by_name: candidate.uploadedByName || 'System',
          file_size_kb: null,
        }];
      } else {
        // Sort by version descending so latest is first
        versions.sort((a: any, b: any) => (b.version || 0) - (a.version || 0));
      }

      console.log('[Attachments] Versions:', versions);
      setRealVersionsData(versions);
    } catch (error) {
      console.error('[Attachments] Failed to fetch resume versions:', error);
      // On error, show the candidate's resume as version 1
      setRealVersionsData([{
        id: candidate.resumeId,
        version: 1,
        file_name: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf`,
        created_at: candidate.uploadDate || new Date().toISOString(),
        uploaded_by_name: candidate.uploadedByName || 'System',
        file_size_kb: null,
      }]);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Handle URL params and sessionStorage for job selection
  useEffect(() => {
    // Skip if we're in an active matching session
    if (isMatchingInProgress.current) return;
    // Skip if user manually changed the view (prevents resetting after clicking View Details)
    if (userChangedView.current) {
      userChangedView.current = false; // Reset for next time
      return;
    }

    // First check URL params (for refresh persistence)
    const urlJdId = searchParams.get('jdId');
    const urlView = searchParams.get('view');

    // Then check sessionStorage (for navigation from JD page)
    const sessionJobId = sessionStorage.getItem('preselectedJobId');
    const showResultsOnly = sessionStorage.getItem('showResultsOnly') === 'true';

    const preselectedJobId = urlJdId || sessionJobId;

    if (!preselectedJobId) return;
    // Wait for jobs to be loaded before processing
    if (jobs.length === 0) return;

    // Clear sessionStorage if we used it
    if (sessionJobId) {
      sessionStorage.removeItem('preselectedJobId');
      sessionStorage.removeItem('showResultsOnly');
    }

    // Set the selected job
    setSelectedJob(preselectedJobId);

    // Determine view based on URL param or sessionStorage flag
    const shouldShowResults = urlView === 'results' || showResultsOnly;
    const shouldShowDetails = urlView === 'details';
    const isMatching = urlView === 'matching';

    if (isMatching) {
      // User is in matching mode - don't change view, matching panel will handle it
      // Just make sure job is selected, but don't change the current view mode
      return;
    } else if (shouldShowDetails) {
      // User clicked from history list - show details view
      const existingMatch = matchHistory.find(h => h.jobId === preselectedJobId);

      if (existingMatch) {
        setSelectedHistoryItem(existingMatch);
        setViewMode('details');
      } else {
        // No match found, go to history
        setViewMode('history');
        updateUrlParams({});
      }
    } else if (shouldShowResults) {
      // User clicked "AI Talent Match Results" - show existing results or empty state
      const existingMatch = matchHistory.find(h => h.jobId === preselectedJobId);

      if (existingMatch) {
        const existingCandidates = getResolvedHistoryCandidates(existingMatch);
        setSelectedHistoryItem(existingMatch);
        setMatchedCandidates(existingCandidates);
        setViewMode('results');
      } else {
        // No results in history - but don't clear matchedCandidates if we just completed a match
        // (matchHistory prop is stale until page refresh, but matchedCandidates state has fresh results)
        setViewMode('results');
        // Only clear if we don't already have results in state (avoids clearing just-completed match results)
        setMatchedCandidates(prev => prev.length > 0 ? prev : []);
      }

      // Update URL to persist state on refresh
      if (!urlJdId) {
        updateUrlParams({ jdId: preselectedJobId, view: 'results' });
      }
    } else {
      // User clicked "AI Talent Match" - ALWAYS run new match (ignore history)
      setViewMode('new');

      // Update URL to persist state on refresh
      if (!urlJdId) {
        updateUrlParams({ jdId: preselectedJobId, view: 'matching' });
      }

      // Trigger matching panel immediately
      setTimeout(() => {
        setShowMatchingPanel(true);
      }, 300);
    }
  }, [jobs, matchHistory, searchParams]);

  const publishedJobs = jobs.filter(j => j.status === 'Published' || j.status === 'Active');
  const selectedJobData = jobs.find(j => j.id === selectedJob);

  const handleRunAIMatch = (jobId?: string) => {
    const jobToMatch = jobId || selectedJob;
    if (!jobToMatch) return;

    // Mark that we're in an active matching session to prevent URL effect interference
    isMatchingInProgress.current = true;

    // Set the selected job if provided
    if (jobId && jobId !== selectedJob) {
      setSelectedJob(jobId);
    }

    // Update URL to show matching in progress
    updateUrlParams({ jdId: jobToMatch, view: 'matching' });

    // Show matching progress panel
    setShowMatchingPanel(true);
  };

  const handleMatchingComplete = (results: MatchedCandidate[]) => {
    // Transform results to include versions placeholder for UI compatibility
    const candidatesWithVersions: MatchedCandidateWithVersions[] = results.map(candidate => ({
      ...candidate,
      versions: [{
        id: 'v1',
        name: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf`,
        uploadDate: candidate.uploadDate,
        size: '200 KB'
      }]
    }));

    setMatchedCandidates(candidatesWithVersions);
    setShowMatchingPanel(false);
    setMatchError(null);
    setViewMode('results');

    // Update URL to show results view
    updateUrlParams({ jdId: selectedJob, view: 'results' });

    // Clear matching flag after a longer delay to allow state and URL to fully settle
    // This prevents the URL effect from interfering with the just-set matchedCandidates
    setTimeout(() => {
      isMatchingInProgress.current = false;
    }, 500);

    // Track usage - POST /api/v1/external/usage/record (RS - talent match uses resume scoring quota)
    recordUsage({
      quota_type: 'RS',
      amount: results.length,
      operation_type: 'talent_match',
      resource_id: selectedJob,
      metadata: { candidates_matched: results.length }
    });

    // Save to history
    if (onSaveMatch && selectedJobData) {
      const newMatchHistory: MatchHistory = {
        id: Date.now().toString(),
        jobId: selectedJob,
        jobTitle: selectedJobData.title,
        matchedAt: new Date(),
        totalMatches: results.length,
        matchedCandidates: candidatesWithVersions
      };
      onSaveMatch(newMatchHistory);
    }
  };

  const handleSelectCandidate = (id: string) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const filtered = getFilteredCandidates();
    if (selectedCandidates.length === filtered.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(filtered.map(c => c.id));
    }
  };

  const handleSubmitToScoring = async () => {
    if (selectedCandidates.length === 0) {
      toast.warning('Please select at least one candidate to score');
      return;
    }

    // Get the current candidates based on view mode
    const currentCandidates = viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem);

    // Get selected candidates data
    const selected = currentCandidates.filter(c => selectedCandidates.includes(c.id));

    // Get the job ID and title
    const jobId = selectedJob || selectedHistoryItem?.jobId;
    const jobTitle = selectedJobData?.title || selectedHistoryItem?.jobTitle || 'Job';

    if (!jobId) {
      toast.error('Job ID not found');
      return;
    }

    // SINGLE CANDIDATE: Show version selection popup
    if (selected.length === 1) {
      const candidate = selected[0];
      if (!candidate.resumeId) {
        toast.error('Resume ID not found for this candidate');
        return;
      }

      // Fetch versions and show selection modal
      setScoringCandidate(candidate);
      setLoadingVersions(true);
      setShowVersionSelectForScoring(true);

      try {
        const versions = await resumeService.getVersions(candidate.resumeId);
        setScoringVersions(versions.data || versions || []);
      } catch (error) {
        console.error('Failed to fetch versions:', error);
        setScoringVersions([]);
      } finally {
        setLoadingVersions(false);
      }
      return;
    }

    // MULTIPLE CANDIDATES: Pre-check for already-scored resumes, then batch-score only new ones
    const resumeIds = selected.map(c => c.resumeId);

    try {
      // Check which resumes are already scored for this JD
      let newResumeIds = resumeIds;
      let alreadyScoredItems: Array<{ resumeId: string; candidateName: string; score?: number; matchStatus?: string; scoredAt?: string }> = [];

      try {
        const existingCheck = await scoringService.checkExistingScores(jobId, resumeIds);
        if (existingCheck.existing_count > 0) {
          const existingMap = new Map(existingCheck.existing_scores.map(s => [s.resume_id, s]));
          alreadyScoredItems = existingCheck.existing_scores.map(s => ({
            resumeId: s.resume_id,
            candidateName: selected.find(c => c.resumeId === s.resume_id)?.name || s.candidate_name || 'Unknown',
            score: s.overall_score,
            matchStatus: s.match_status,
            scoredAt: s.scored_at || undefined,
          }));
          newResumeIds = resumeIds.filter(id => !existingMap.has(id));
        }
      } catch (checkError) {
        console.warn('[AITalentMatch] checkExistingScores failed, scoring all:', checkError);
      }

      // Get candidate names for progress display
      const newSelected = selected.filter(c => newResumeIds.includes(c.resumeId));
      const resumeItems = newSelected.map(c => ({
        resumeId: c.resumeId,
        candidateName: c.name || 'Unknown',
      }));

      if (newResumeIds.length === 0) {
        // All already scored - use pendingScoringData path (no batch needed)
        const pendingData = {
          jobId: jobId,
          jobTitle: jobTitle,
          resumeIds: [],
          resumeNames: [],
          alreadyScoredItems: alreadyScoredItems,
        };
        sessionStorage.setItem('pendingScoringData', JSON.stringify(pendingData));
        router.push(`/recruitment/resume-scoring?jd_id=${jobId}&start_scoring=true`);
        return;
      }

      // Start async bulk scoring via Celery for new resumes only
      const response = await scoringService.startBulkScoringAsync(jobId, newResumeIds);

      // Store batch info including already-scored items for progress display
      const scoringData = {
        batchId: response.batch_id,
        jobId: response.jd_id,
        jobTitle: response.jd_title,
        totalResumes: response.total_resumes + alreadyScoredItems.length,
        resumeItems: resumeItems,
        alreadyScoredItems: alreadyScoredItems,
      };
      sessionStorage.setItem('pendingScoringBatch', JSON.stringify(scoringData));

      // Navigate to resume scoring page with batch_id to show progress
      router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      toast.error(error.message || 'Failed to start scoring');
    }
  };

  // Assessment handlers
  const handleAssessment = async () => {
    if (selectedCandidates.length === 0) {
      toast.warning('Please select at least one candidate');
      return;
    }

    // Fetch active assessments (published status). Revoked assessments are
    // excluded — once invites have been revoked the assessment is sealed
    // and the recruiter must duplicate it for a fresh invite round.
    try {
      const response = await assessmentService.list({ status: 'published', page_size: 100 });
      const revokedIds = getLocallyRevokedAssessmentIds();
      const activeAssessments = response.items
        .filter((a: any) => !isAssessmentRevoked(a, revokedIds))
        .map((a: any) => ({
          ...a,
          created_by_name: a.created_by_name || 'System',
          short_id: a.short_id || `AS-${String(a.id).slice(0, 8).toUpperCase()}`,
        }));

      setAssessments(activeAssessments);
      setIsAssessmentModalOpen(true);
    } catch (error) {
      console.error('[AITalentMatch] Failed to fetch assessments:', error);
      toast.error('Failed to load assessments');
    }
  };

  const handleAssessmentSelect = (assessment: any) => {
    setSelectedAssessments(prev => {
      const isSelected = prev.some(a => a.id === assessment.id);
      if (isSelected) {
        return prev.filter(a => a.id !== assessment.id);
      } else {
        return [...prev, assessment];
      }
    });
  };

  const handleProceedToInvite = () => {
    if (selectedAssessments.length === 0) {
      toast.error('Please select at least one assessment');
      return;
    }

    // Extract candidate data from selected candidates
    const currentCandidates = viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem);
    const candidateData = currentCandidates
      .filter(c => selectedCandidates.includes(c.id))
      .map((c, index) => ({
        id: `${Date.now()}-${index}`,
        name: c.name,
        email: c.email || '',
        source: 'ai-match' as const,
        candidateId: c.id
      }))
      .filter(c => c.email); // Only include candidates with email

    if (candidateData.length === 0) {
      toast.error('Selected candidates must have email addresses');
      return;
    }

    // Open ShareAssessmentModal with first selected assessment
    setPrefilledCandidates(candidateData);
    setCurrentAssessmentForShare(selectedAssessments[0]);
    setIsAssessmentModalOpen(false);
    setIsShareModalOpen(true);
  };

  const handleSendInvitations = async (candidates: any[], message: string) => {
    try {
      let successCount = 0;
      let failCount = 0;

      // Bulk send invitations for all selected assessments
      for (const assessment of selectedAssessments) {
        for (const candidate of candidates) {
          if (candidate.email) {
            try {
              await assessmentService.invite(assessment.id, {
                candidate_email: candidate.email,
                candidate_name: candidate.name,
                resume_id: candidate.resumeId || candidate.candidateId,
                custom_message: message,
              });
              successCount++;
            } catch (err) {
              console.error(`Failed to send invitation for ${candidate.email}:`, err);
              failCount++;
            }
          }
        }
      }

      if (successCount > 0) {
        toast.success(`Sent ${successCount} invitation(s) for ${selectedAssessments.length} assessment(s)`);
      }
      if (failCount > 0) {
        toast.error(`Failed to send ${failCount} invitation(s)`);
      }

      setIsShareModalOpen(false);
      setSelectedAssessments([]);
      setSelectedCandidates([]);
      setPrefilledCandidates([]);
      setAssessmentSearchQuery('');
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      toast.error(error.message || 'Failed to send invitations');
    }
  };

  const getFilteredCandidates = (): MatchedCandidateWithVersions[] => {
    const candidates: MatchedCandidateWithVersions[] = viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem);

    const filtered = candidates.filter(candidate => {
      // Existing filters
      const matchesThreshold = candidate.matchScore >= filterThreshold;
      const matchesSearch = searchQuery === '' ||
        candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (candidate.email && candidate.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        candidate.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()));

      // Phone filter (normalize phone numbers - remove special chars)
      const matchesPhone = filterPhone === '' ||
        (candidate.phone && (
          candidate.phone.toLowerCase().includes(filterPhone.toLowerCase()) ||
          candidate.phone.replace(/[^0-9]/g, '').includes(filterPhone.replace(/[^0-9]/g, ''))
        ));

      // Location filter
      const matchesLocation = filterLocation === '' ||
        (candidate.location && candidate.location.toLowerCase().includes(filterLocation.toLowerCase()));

      // Experience filter
      const candidateExp = candidate.experience ? parseFloat(candidate.experience) : 0;
      const matchesExperienceMin = filterExperienceMin === '' || candidateExp >= filterExperienceMin;
      const matchesExperienceMax = filterExperienceMax === '' || candidateExp <= filterExperienceMax;

      return matchesThreshold && matchesSearch && matchesPhone && matchesLocation &&
             matchesExperienceMin && matchesExperienceMax;
    });

    // Sort by selected option
    const sorted = [...filtered];
    switch (sortBy) {
      case 'rank':
        sorted.sort((a, b) => (b.rank || 0) - (a.rank || 0));
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'score':
        sorted.sort((a, b) => b.matchScore - a.matchScore);
        break;
      case 'experience':
        sorted.sort((a, b) => {
          const expA = a.experience ? parseFloat(a.experience) : 0;
          const expB = b.experience ? parseFloat(b.experience) : 0;
          return expB - expA;
        });
        break;
    }

    return sorted;
  };

  // Memoized filtered candidates for pagination calculations
  const filteredCandidatesMemo = useMemo(() => getFilteredCandidates(), [
    viewMode, matchedCandidates, selectedHistoryItem, filterThreshold, searchQuery,
    filterPhone, filterLocation, filterExperienceMin, filterExperienceMax, sortBy
  ]);

  // Calculate pagination values
  const totalFilteredCandidates = filteredCandidatesMemo.length;
  const totalPages = Math.ceil(totalFilteredCandidates / itemsPerPage);

  // Get paginated candidates - maintains ranking order across pages
  const getPaginatedCandidates = (): MatchedCandidateWithVersions[] => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredCandidatesMemo.slice(startIndex, endIndex);
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterThreshold, filterPhone, filterLocation, filterExperienceMin, filterExperienceMax, sortBy, selectedHistoryItem, viewMode]);

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of results
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle items per page change
  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const getMatchColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-brand-cyan';
    if (score >= 50) return 'text-brand-orange-deep';
    return 'text-gray-600';
  };

  const getMatchBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan';
    if (score >= 50) return 'bg-brand-orange/10 border-brand-orange/30 text-brand-orange-deep';
    return 'bg-gray-100 border-gray-300 text-gray-700';
  };

  const getMatchLabel = (score: number) => {
    if (score >= 85) return 'Excellent Match';
    if (score >= 70) return 'Good Match';
    if (score >= 50) return 'Moderate Match';
    return 'Low Match';
  };

  const filteredHistory = matchHistory.filter(item => {
    const matchesSearch = historySearchQuery === '' ||
      item.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase());

    const matchesDateFrom = !historyDateFrom || new Date(item.matchedAt) >= new Date(historyDateFrom);
    const matchesDateTo = !historyDateTo || new Date(item.matchedAt) <= new Date(historyDateTo);

    // Candidate-level filters: show history item if ANY candidate matches
    const hasCandidateFilters = historyFilterPhone !== '' || historyFilterLocation !== '' || historyFilterExpMin !== '' || historyFilterExpMax !== '';
    const historyCandidates = getResolvedHistoryCandidates(item);
    const matchesCandidateFilters = !hasCandidateFilters || historyCandidates.length === 0 || historyCandidates.some(candidate => {
      const matchesPhone = historyFilterPhone === '' ||
        (candidate.phone && (
          candidate.phone.toLowerCase().includes(historyFilterPhone.toLowerCase()) ||
          candidate.phone.replace(/[^0-9]/g, '').includes(historyFilterPhone.replace(/[^0-9]/g, ''))
        ));
      const matchesLocation = historyFilterLocation === '' ||
        (candidate.location && candidate.location.toLowerCase().includes(historyFilterLocation.toLowerCase()));
      const candidateExp = candidate.experience ? parseFloat(candidate.experience) : 0;
      const matchesExpMin = historyFilterExpMin === '' || candidateExp >= historyFilterExpMin;
      const matchesExpMax = historyFilterExpMax === '' || candidateExp <= historyFilterExpMax;
      return matchesPhone && matchesLocation && matchesExpMin && matchesExpMax;
    });

    return matchesSearch && matchesDateFrom && matchesDateTo && matchesCandidateFilters;
  });

  const activeFiltersCount = [
    historySearchQuery !== '',
    historyDateFrom !== '',
    historyDateTo !== '',
    historyFilterPhone !== '',
    historyFilterLocation !== '',
    historyFilterExpMin !== '',
    historyFilterExpMax !== '',
  ].filter(Boolean).length;

  // View: History Details
  if (viewMode === 'details' && selectedHistoryItem) {
    const detailCandidates = getResolvedHistoryCandidates(selectedHistoryItem);
    const filteredCandidates = filteredCandidatesMemo;
    const paginatedCandidates = getPaginatedCandidates();
    const excellentCount = detailCandidates.filter(c => c.matchScore >= 85).length;
    const goodCount = detailCandidates.filter(c => c.matchScore >= 70 && c.matchScore < 85).length;
    const moderateCount = detailCandidates.filter(c => c.matchScore < 70).length;
    const isLoadingSelectedHistory = loadingHistorySessionId === selectedHistoryItem.id;

    return (
      <>

      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full min-h-[calc(100vh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4 md:mb-6">
              <PageBreadcrumb
                className="mb-0 flex-1"
                items={[
                  { label: 'Dashboard', href: '/dashboard' },
                  { label: 'AI Talent Match', onClick: () => setViewMode('history') },
                  { label: 'Match Details' },
                ]}
              />
              {(() => {
                const _matchIdx = matchHistory.findIndex(h => h.jobId === selectedHistoryItem.jobId);
                const _prevMatch = _matchIdx > 0 ? matchHistory[_matchIdx - 1] : null;
                const _nextMatch = _matchIdx >= 0 && _matchIdx < matchHistory.length - 1 ? matchHistory[_matchIdx + 1] : null;
                const _goToMatch = (item: MatchHistory) => {
                  setSelectedHistoryItem(item);
                  setSelectedCandidates([]);
                  setSelectedJob('');
                };
                if (matchHistory.length <= 1) return null;
                return (
                  <RecordPager
                    currentIndex={_matchIdx >= 0 ? _matchIdx : 0}
                    totalCount={matchHistory.length}
                    onPrev={_prevMatch ? () => _goToMatch(_prevMatch) : undefined}
                    onNext={_nextMatch ? () => _goToMatch(_nextMatch) : undefined}
                  />
                );
              })()}
            </div>
        {/* Header Section */}
        <div className="border-b border-gray-200 dark:border-slate-700 mb-4 pb-4">
          <div className="w-full">
          {/* Back Button & Title */}
          {(() => {
            // Check if job is disabled
            const jobData = jobs.find(j => j.id === selectedHistoryItem.jobId);
            const jobStatus = jobData?.status?.toLowerCase();
            const isJobDisabled = jobStatus === 'disabled';
            // Show Run AI Match button for all jobs except disabled ones
            const canRunAIMatch = !isJobDisabled;

            return (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <button
                    onClick={() => {
                      setViewMode('history');
                      setSelectedHistoryItem(null);
                      setSelectedJob('');
                      setSelectedCandidates([]);
                      router.push('/recruitment/ai-talent-match', { scroll: false });
                    }}
                    className="flex items-center gap-2 text-sm text-brand-blue hover:text-brand-blue-2 font-medium transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Matched Jobs
                  </button>
                  {/* Run AI Match — right side of the Back row */}
                  {canRunAIMatch && (
                    <button
                      onClick={() => {
                        if (!canRunAiMatch) {
                          toast.error('You do not have permission to run AI matching operations');
                          return;
                        }
                        const jobId = selectedJob || selectedHistoryItem?.jobId;
                        if (jobId) {
                          handleRunAIMatch(jobId);
                          setSelectedCandidates([]);
                        }
                      }}
                      disabled={!canRunAiMatch}
                      className={`px-3 py-2 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2 w-full sm:w-auto ${
                        canRunAiMatch
                          ? 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 cursor-pointer'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                      }`}
                      title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Run AI Match
                    </button>
                  )}
                </div>

                {/* Job Info Card */}
                <div className="bg-gradient-to-br from-brand-blue/[0.04] to-brand-cyan/[0.03] rounded-xl border border-brand-blue/15 ring-1 ring-brand-blue/5 p-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 font-semibold">{selectedHistoryItem.jobTitle}</h1>
                        {isJobDisabled && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full border border-red-200">
                            Disabled
                          </span>
                        )}
                      </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400 mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatISTDate(selectedHistoryItem.matchedAt.toISOString())}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {selectedHistoryItem.totalMatches} matches
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded-full text-xs font-medium border border-brand-blue/20">
                    <Sparkles className="w-3 h-3" />
                    AI Talent Match • 0 units consumed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search candidates..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
                />
              </div>
              <select
                value={filterThreshold}
                onChange={(e) => setFilterThreshold(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-sm text-black"
              >
                <option value={0}>All Matches</option>
                <option value={50}>50%+ Match</option>
                <option value={70}>70%+ Match</option>
                <option value={85}>85%+ Match</option>
              </select>
              <div className="text-sm text-gray-700 dark:text-slate-300 bg-brand-blue/5 ring-1 ring-brand-blue/10 px-3 py-2 rounded-lg font-medium">
                <span className="text-brand-blue font-semibold">{filteredCandidates.length}</span> candidates
              </div>
              {selectedCandidates.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {availableUnits !== null && selectedCandidates.length > availableUnits && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-orange/10 border border-brand-orange/30 ring-1 ring-brand-orange/15 rounded-lg w-full sm:w-auto">
                      <AlertTriangle className="w-4 h-4 text-brand-orange-deep flex-shrink-0" />
                      <span className="text-xs text-brand-orange-deep font-medium">
                        Insufficient units! You have {availableUnits} RS unit{availableUnits !== 1 ? 's' : ''} but selected {selectedCandidates.length}. Remove {selectedCandidates.length - availableUnits} resume{selectedCandidates.length - availableUnits > 1 ? 's' : ''}.
                      </span>
                    </div>
                  )}
                  <>
                  {canRunScoring && (
                  <button
                      onClick={handleSubmitToScoring}
                      disabled={availableUnits !== null && selectedCandidates.length > availableUnits}
                    className={`px-3 py-2 text-white rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 flex-1 sm:flex-initial ${
                      availableUnits !== null && selectedCandidates.length > availableUnits
                        ? 'bg-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                    }`}
                    >
                      <Target className="w-3.5 h-3.5" />
                      Score ({selectedCandidates.length})
                    </button>
                  )}
                  {(hasPermission('canCreateAssessments') || isTenantAdmin) && (
                    <button
                      onClick={handleAssessment}
                      className="px-3 py-2 bg-brand-cyan hover:from-brand-teal hover:to-brand-cyan text-white rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 flex-1 sm:flex-initial shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Assessment ({selectedCandidates.length})
                    </button>
                  )}
                </>
                </div>
              )}
            </div>
            {/* Additional Filters */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              <input
                type="text"
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                placeholder="Filter by phone..."
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="text"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                placeholder="Filter by location..."
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="number"
                value={filterExperienceMin}
                onChange={(e) => setFilterExperienceMin(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Min exp"
                className="w-full sm:w-28 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="number"
                value={filterExperienceMax}
                onChange={(e) => setFilterExperienceMax(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Max exp"
                className="w-full sm:w-28 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'rank' | 'name' | 'score' | 'experience')}
                className="col-span-2 sm:col-span-1 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-sm text-black"
              >
                <option value="rank">Sort by Rating</option>
                <option value="name">Sort by Name</option>
                <option value="score">Sort by Score</option>
                <option value="experience">Sort by Experience</option>
              </select>
            </div>
          </div>
              </>
            );
          })()}
          </div>
        </div>

        {/* Candidates List - Table View */}
        {isLoadingSelectedHistory ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading matched candidates...
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="mx-auto w-full max-w-[1400px] py-4">
          <table className="w-full min-w-[1300px] table-auto">
            <thead className="bg-gray-50 dark:bg-slate-800/50 sticky top-0">
              <tr>
                <th className="w-12 px-4 py-3 align-middle">
                  <input
                    type="checkbox"
                    checked={filteredCandidates.length > 0 && filteredCandidates.every(c => selectedCandidates.includes(c.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCandidates(filteredCandidates.map(c => c.id));
                      } else {
                        setSelectedCandidates([]);
                      }
                    }}
                    className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Match Rating
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Candidate Name
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Skills
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Experience
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Uploaded By
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Uploaded Date
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Attachments
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Scored Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-700">
              {paginatedCandidates.map((candidate, index) => (
                <tr
                  key={candidate.id}
                  className={`hover:bg-brand-blue/[0.03] transition-colors cursor-pointer ${
                    selectedCandidates.includes(candidate.id) ? 'bg-brand-blue/5' : ''
                  }`}
                  onClick={() => {
                    if (candidate.resumeId) {
                      try {
                        sessionStorage.setItem('resumeNavList', JSON.stringify(filteredCandidatesMemo.map((c: any) => c.resumeId).filter(Boolean)));
                        sessionStorage.setItem('resumeNavSource', 'ai-talent-match');
                      } catch { /* ignore */ }
                      router.push(`/recruitment/resume-view/${candidate.resumeId}`);
                    }
                  }}
                >
                  <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedCandidates.includes(candidate.id)}
                      onChange={() => handleSelectCandidate(candidate.id)}
                      className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <div className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-md font-bold text-sm ${
                      (candidate.rank || 0) >= 7 ? 'bg-green-100 text-green-800 border border-green-300' :
                      (candidate.rank || 0) >= 4 ? 'bg-brand-orange/10 text-brand-orange-deep border border-brand-orange/20' :
                      (candidate.rank || 0) >= 1 ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-700' :
                      'bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-700'
                    }`}>
                      {candidate.rank || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-slate-800 flex items-center justify-center text-xs text-gray-700 dark:text-slate-300 font-medium">
                        {(candidate.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-slate-50">{candidate.name || 'Unknown'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                    {candidate.email ? candidate.email : <span className="text-gray-400 dark:text-slate-500">-</span>}
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                    {(() => {
                      const numbers = splitPhoneNumbers(candidate.phone, 2);
                      return numbers.length > 0
                        ? <div className="flex flex-col gap-0.5">{numbers.map((num, i) => <span key={i}>{num}</span>)}</div>
                        : <span className="text-gray-400 dark:text-slate-500">-</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                    {candidate.location ? candidate.location : <span className="text-gray-400 dark:text-slate-500">-</span>}
                  </td>
                  <td className="px-4 py-3 align-middle min-w-[220px]">
                    <div className="flex flex-wrap gap-1">
                      <SkillsList
                        skills={candidate.skills}
                        chipClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20 whitespace-nowrap"
                        moreClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-brand-blue font-medium whitespace-nowrap hover:bg-brand-blue/10 transition-colors cursor-pointer"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">{candidate.experience}</td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                    {formatUploadedBy(candidate.uploadedByName, candidate.uploadedBy)}
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                    {candidate.uploadDate ? formatISTDate(candidate.uploadDate) : <span className="text-gray-400 dark:text-slate-500">-</span>}
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAttachmentsClick(candidate);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 text-xs font-medium"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {candidate.attachmentCount || 1}
                    </button>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    {scoredResumeIds.has(candidate.resumeId) ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Scored
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 rounded-full text-xs font-medium">
                        <XCircle className="w-3 h-3" />
                        Not Scored
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        )}

        {/* Pagination Controls */}
        {totalFilteredCandidates > 0 && (
          <div className="mx-auto w-full max-w-[1400px]">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalFilteredCandidates}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          </div>
        )}
          </div>
        </div>
      </main>

      {/* Resume Versions Modal */}
      {selectedVersionsCandidate && (
        <ResumeVersionsModal
          candidate={selectedVersionsCandidate}
          versions={realVersionsData}
          loading={loadingVersions}
          onClose={() => {
            setSelectedVersionsCandidate(null);
            setRealVersionsData([]);
          }}
        />
      )}

      {/* Version Selection Modal for Scoring (single candidate) */}
      {showVersionSelectForScoring && scoringCandidate && (
        <ResumeVersionsModal
          candidate={scoringCandidate}
          versions={scoringVersions}
          loading={loadingVersions}
          selectionMode={true}
          onClose={() => {
            setShowVersionSelectForScoring(false);
            setScoringCandidate(null);
            setScoringVersions([]);
          }}
          onSelectVersion={async (version) => {
            // Score with selected version
            const jobId = selectedJob || selectedHistoryItem?.jobId;
            if (!jobId || !scoringCandidate) return;

            try {
              const response = await scoringService.startBulkScoringAsync(jobId, [version.id]);
              const scoringData = {
                batchId: response.batch_id,
                jobId: response.jd_id,
                jobTitle: response.jd_title,
                totalResumes: response.total_resumes,
                resumeItems: [{ resumeId: version.id, candidateName: scoringCandidate.name }],
              };
              sessionStorage.setItem('pendingScoringBatch', JSON.stringify(scoringData));
              router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
            } catch (error: any) {
              console.error('Failed to start scoring:', error);
              toast.error(error.message || 'Failed to start scoring');
            }

            setShowVersionSelectForScoring(false);
            setScoringCandidate(null);
            setScoringVersions([]);
          }}
        />
      )}

      {/* AI Matching Progress Panel - for details view */}
      {showMatchingPanel && selectedJob && (
        <AITalentMatchProgressPanel
          jobTitle={selectedJobData?.title || selectedHistoryItem?.jobTitle || 'Job Description'}
          jobId={selectedJob}

          onComplete={handleMatchingComplete}
          onError={(error) => {
            setMatchError(error);
            setShowMatchingPanel(false);
          }}
        />
      )}

      {/* Assessment Selection Modal - for details/results view */}
      {isAssessmentModalOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsAssessmentModalOpen(false);
            setSelectedAssessments([]);
            setAssessmentSearchQuery('');
          }
        }}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-4xl max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-slate-700 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-slate-50">Select Active Assessments</h2>
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 p-1"
                 aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-3">
                Select one or more assessments to send to {selectedCandidates.length} candidate{selectedCandidates.length !== 1 ? 's' : ''}
              </p>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={assessmentSearchQuery}
                  onChange={(e) => setAssessmentSearchQuery(e.target.value)}
                  placeholder="Search assessments..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                />
              </div>

              {/* Select All / Clear All */}
              {assessments.length > 0 && (() => {
                const filteredAssessments = assessments.filter(assessment => {
                  if (!assessmentSearchQuery.trim()) return true;
                  const query = assessmentSearchQuery.toLowerCase();
                  return (
                    assessment.short_id?.toLowerCase().includes(query) ||
                    assessment.title?.toLowerCase().includes(query) ||
                    assessment.jd_short_id?.toLowerCase().includes(query) ||
                    assessment.jd_title?.toLowerCase().includes(query)
                  );
                });
                return filteredAssessments.length > 0 && (
                  <button
                    onClick={() => {
                      if (selectedAssessments.length === filteredAssessments.length) {
                        setSelectedAssessments([]);
                      } else {
                        setSelectedAssessments(filteredAssessments);
                      }
                    }}
                    className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium mt-3"
                  >
                    {selectedAssessments.length === filteredAssessments.length && selectedAssessments.length > 0 ? 'Clear All' : 'Select All'}
                  </button>
                );
              })()}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {(() => {
                const filteredAssessments = assessments.filter(assessment => {
                  if (!assessmentSearchQuery.trim()) return true;
                  const query = assessmentSearchQuery.toLowerCase();
                  return (
                    assessment.short_id?.toLowerCase().includes(query) ||
                    assessment.title?.toLowerCase().includes(query) ||
                    assessment.jd_short_id?.toLowerCase().includes(query) ||
                    assessment.jd_title?.toLowerCase().includes(query)
                  );
                });

                return filteredAssessments.length === 0 ? (
                  <div className="text-center py-10">
                    <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-slate-500">{assessmentSearchQuery ? 'No assessments match your search' : 'No active assessments available'}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{assessmentSearchQuery ? 'Try different search terms' : 'Create and publish an assessment first'}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAssessments.map((assessment) => {
                      const isSelected = selectedAssessments.some(a => a.id === assessment.id);
                      return (
                        <button
                          key={assessment.id}
                          onClick={() => handleAssessmentSelect(assessment)}
                          className={`w-full text-left border-2 rounded-lg p-3 transition-all ${
                            isSelected
                              ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                              : 'border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/5'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {/* Checkbox */}
                            <div className="flex-shrink-0 mt-1">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-brand-blue border-brand-blue'
                                  : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-700'
                              }`}>
                                {isSelected && (
                                  <CheckCircle className="w-4 h-4 text-white" />
                                )}
                              </div>
                            </div>

                            <div className="flex-1">
                              {/* Assessment ID, Title, Version + Active Badge */}
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                {assessment.short_id && (
                                  <span className="text-xs px-2 py-0.5 bg-brand-blue text-white rounded font-semibold">
                                    {assessment.short_id}
                                  </span>
                                )}
                                {(() => {
                                  // Strip any "- Version N" baked into the stored title
                                  // and render the live version (from `version`, falling
                                  // back to the parsed title version) as its own badge.
                                  const parsed = parseAssessmentTitle(assessment.title || '');
                                  const displayVersion = typeof assessment.version === 'number'
                                    ? assessment.version
                                    : parsed.version;
                                  const base = parsed.cleanTitle || 'Untitled assessment';
                                  return (
                                    <>
                                      <h5 className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{base}</h5>
                                      {displayVersion && (
                                        <span className="text-xs px-2 py-0.5 bg-brand-cyan/15 text-brand-cyan ring-1 ring-brand-cyan/30 rounded font-semibold">
                                          V{displayVersion}
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                  Active
                                </span>
                              </div>

                              {/* Linked JD Information */}
                              {assessment.jd_short_id && (
                                <div className="text-xs text-gray-600 dark:text-slate-400 mb-1.5">
                                  <span className="font-medium">Linked to: </span>
                                  <span className="text-gray-800 dark:text-slate-100">{assessment.jd_short_id}</span>
                                  {assessment.jd_title && (
                                    <span className="ml-1">- {assessment.jd_title}</span>
                                  )}
                                  {assessment.jd_version && (
                                    <span className="ml-1 text-gray-500 dark:text-slate-500">v{assessment.jd_version}</span>
                                  )}
                                </div>
                              )}

                              {/* Duration and Sections */}
                              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {assessment.duration_minutes || 0} min
                                </span>
                              </div>

                              {/* Created By and Date */}
                              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-500 mt-1.5">
                                {assessment.created_by_name && (
                                  <>
                                    <span>Created by: <span className="text-gray-700 dark:text-slate-300 font-medium">{assessment.created_by_name}</span></span>
                                    <span>•</span>
                                  </>
                                )}
                                {assessment.created_at && (
                                  <span>
                                    {formatIST(assessment.created_at)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 gap-3 sm:gap-0 shrink-0">
              <div className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 text-center sm:text-left">
                {selectedAssessments.length} assessment{selectedAssessments.length !== 1 ? 's' : ''} selected
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedToInvite}
                  disabled={selectedAssessments.length === 0}
                  className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white text-sm rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" />
                  <span className="hidden sm:inline">Proceed to Send Invitations</span>
                  <span className="sm:hidden">Send Invitations</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Assessment Modal - for details/results view */}
      {isShareModalOpen && selectedAssessments.length > 0 && (
        <ShareAssessmentModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setCurrentAssessmentForShare(null);
            setSelectedAssessments([]);
            setPrefilledCandidates([]);
            setAssessmentSearchQuery('');
          }}
          assessment={{
            id: selectedAssessments[0].id,
            title: selectedAssessments[0].title,
            duration: `${selectedAssessments[0].duration_minutes || 0} min`,
            questions: (selectedAssessments[0].hr_enabled ? 1 : 0) +
                      (selectedAssessments[0].technical_enabled ? 1 : 0) +
                      (selectedAssessments[0].coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: selectedAssessments[0].short_id,
            version: selectedAssessments[0].version,
            jd_short_id: selectedAssessments[0].jd_short_id,
            jd_title: selectedAssessments[0].jd_title,
            jd_version: selectedAssessments[0].jd_version,
          }}
          additionalAssessments={selectedAssessments.map(a => ({
            id: a.id,
            title: a.title,
            duration: `${a.duration_minutes || 0} min`,
            questions: (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: a.short_id,
            version: a.version,
            jd_short_id: a.jd_short_id,
            jd_title: a.jd_title,
            jd_version: a.jd_version
          }))}
          prefilledCandidates={prefilledCandidates}
          inviteSource="Resume Scoring"
        />
      )}
      </>
    );
  }

  // View: History List
  if (viewMode === 'history') {
    return (
      <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-8" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'AI Talent Match' }]} />
        {/* Header */}
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-white/80 rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200 dark:border-slate-700 self-start"
                aria-label="Back to Dashboard" title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-gray-700 dark:text-slate-300" />
              </button>
            )}
            <div className="h-9 w-9 bg-brand-blue rounded-lg flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <History className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 truncate">AI Talent Match - Matched Jobs</h1>
              <p className="text-sm text-gray-600 dark:text-slate-400 truncate">Review jobs with AI-matched candidates and their results</p>
            </div>
            
            {/* Units Display - Commented out (static data)
            {availableUnits !== null && (
              <div className="bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl shadow-lg p-4 border-2 border-gray-300">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-100 mb-0.5">Available Units</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-white">{availableUnits.toLocaleString()}</span>
                      <span className="text-xs text-gray-100">units</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            */}
            
            <button
              onClick={() => {
                if (!canRunAiMatch) {
                  toast.error('You do not have permission to run AI matching operations');
                  return;
                }
                setViewMode('new');
                setSelectedJob('');
                setSelectedCandidates([]);
                router.push('/recruitment/ai-talent-match', { scroll: false });
              }}
              disabled={!canRunAiMatch}
              className={`w-full sm:w-auto px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-2 shadow-sm ${
                canRunAiMatch
                  ? 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
              }`}
              title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Run AI Match
            </button>
          </div>
        </div>

        <ModuleInfoBanner
          icon={<Sparkles className="h-4 w-4" />}
          title="AI-Powered Talent Matching"
          description="Use AI to compare your candidate pool with each job's skills, experience, and requirements. Review ranked matches, understand fit signals, and launch a new match whenever a role needs fresh candidates."
        />

        {/* Stats Cards — clicking Matched Jobs drills into the list */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <button
            type="button"
            onClick={() => setHistoryPageView('list')}
            className={`flex items-center gap-3 text-left bg-white dark:bg-slate-900 border rounded-xl p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:shadow-md ${
              historyPageView === 'list'
                ? 'border-brand-blue ring-2 ring-brand-blue/30'
                : 'border-gray-200 dark:border-slate-700/60 hover:border-brand-blue/30'
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-slate-500">Matched Jobs</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-slate-50 leading-tight tracking-tight">
                {matchHistory.length}
              </p>
            </div>
          </button>
        </div>

        {historyPageView === 'list' && (
        <>
        {/* Back to cards button */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            onClick={() => setHistoryPageView('cards')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:text-brand-blue transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to overview
          </button>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              placeholder="Search by job title..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm bg-white dark:bg-slate-900 text-black placeholder:text-gray-400"
            />
          </div>

          <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowHistoryFilters(!showHistoryFilters)}
              className={`px-3 py-2 rounded-lg border transition-all flex items-center gap-2 text-sm font-medium ${
                activeFiltersCount > 0
                  ? 'bg-brand-blue border-brand-blue text-white shadow-sm shadow-brand-blue/25'
                  : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold bg-white text-brand-blue">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Filter Popover */}
            {showHistoryFilters && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowHistoryFilters(false)} />
                <div className="fixed inset-x-3 top-1/2 -translate-y-1/2 sm:absolute sm:inset-x-auto sm:top-full sm:translate-y-0 sm:right-0 sm:mt-2 w-auto sm:w-80 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 z-40 max-h-[85vh] sm:max-h-auto flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700/60 flex-shrink-0">
                    <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">Filters</span>
                    <div className="flex items-center gap-3">
                      {activeFiltersCount > 0 && (
                        <button
                          onClick={() => {
                            setHistorySearchQuery('');
                            setHistoryDateFrom('');
                            setHistoryDateTo('');
                            setHistoryFilterPhone('');
                            setHistoryFilterLocation('');
                            setHistoryFilterExpMin('');
                            setHistoryFilterExpMax('');
                          }}
                          className="text-xs text-gray-500 dark:text-slate-500 hover:text-gray-900 font-medium"
                        >
                          Reset all
                        </button>
                      )}
                      <button
                        onClick={() => setShowHistoryFilters(false)}
                        className="sm:hidden p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                       aria-label="Close">
                        <X className="w-4 h-4 text-gray-500 dark:text-slate-500" />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto flex-1">
                    {/* Date Range */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-2 block">Date Range</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[11px] text-gray-400 dark:text-slate-500 mb-1 block">From</span>
                          <input
                            type="date"
                            value={historyDateFrom}
                            onChange={(e) => setHistoryDateFrom(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-white dark:bg-slate-900 text-xs sm:text-sm text-black"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] text-gray-400 dark:text-slate-500 mb-1 block">To</span>
                          <input
                            type="date"
                            value={historyDateTo}
                            onChange={(e) => setHistoryDateTo(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-white dark:bg-slate-900 text-xs sm:text-sm text-black"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Mobile Number */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-2 block">Mobile No</label>
                      <div className="relative">
                        <Phone className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                        <input
                          type="text"
                          value={historyFilterPhone}
                          onChange={(e) => setHistoryFilterPhone(e.target.value)}
                          placeholder="Search by mobile number"
                          className="w-full pl-8 pr-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-white dark:bg-slate-900 text-xs sm:text-sm text-black placeholder:text-gray-400"
                        />
                      </div>
                    </div>

                    {/* Location */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-2 block">Location</label>
                      <div className="relative">
                        <MapPin className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                        <input
                          type="text"
                          value={historyFilterLocation}
                          onChange={(e) => setHistoryFilterLocation(e.target.value)}
                          placeholder="Search by location"
                          className="w-full pl-8 pr-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-white dark:bg-slate-900 text-xs sm:text-sm text-black placeholder:text-gray-400"
                        />
                      </div>
                    </div>

                    {/* Experience */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-2 block">Experience (years)</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={historyFilterExpMin}
                          onChange={(e) => setHistoryFilterExpMin(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Min"
                          min={0}
                          className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-white dark:bg-slate-900 text-xs sm:text-sm text-black placeholder:text-gray-400"
                        />
                        <input
                          type="number"
                          value={historyFilterExpMax}
                          onChange={(e) => setHistoryFilterExpMax(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Max"
                          min={0}
                          className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-white dark:bg-slate-900 text-xs sm:text-sm text-black placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700/60 flex-shrink-0">
                    <button
                      onClick={() => setShowHistoryFilters(false)}
                      className="w-full py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white text-sm font-medium rounded-lg shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-all"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="text-sm text-gray-500 dark:text-slate-500 bg-brand-blue/5 ring-1 ring-brand-blue/10 px-3 py-2 rounded-lg whitespace-nowrap font-medium">
            <span className="text-brand-blue font-semibold">{filteredHistory.length}</span> / {matchHistory.length} jobs
          </div>
          </div>
        </div>

        {/* History List */}
        {filteredHistory.length > 0 ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 mb-3">
              <h2 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 font-medium">Matched Jobs ({filteredHistory.length})</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">Click any job to view matched candidates</p>
            </div>
            <div className="grid gap-3 sm:gap-4">
            {filteredHistory.slice((historyCurrentPage - 1) * historyItemsPerPage, historyCurrentPage * historyItemsPerPage).map((item) => {
              const jobData = jobs.find(j => j.id === item.jobId);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    userChangedView.current = true; // Prevent useEffect from resetting view
                    setSelectedHistoryItem(item);
                    setSelectedJob(item.jobId);
                    setViewMode('details');
                    updateUrlParams({ jdId: item.jobId, view: 'details' });
                  }}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 transition-all duration-150 p-4 cursor-pointer group"
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    {/* Job Info */}
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0 group-hover:scale-105 transition-transform">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          {jobData?.jobId && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold font-mono bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
                              {jobData.jobId}
                            </span>
                          )}
                          {jobData?.currentVersion && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20">
                              v{jobData.currentVersion}
                            </span>
                          )}
                          {jobData?.currentVersion && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                              jobData.currentVersion > 1
                                ? 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20'
                                : 'bg-green-50 text-green-700 border-green-200'
                            }`}>
                              {jobData.currentVersion > 1 ? 'Republished' : 'Published'}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 mb-1 group-hover:text-brand-blue transition-colors">
                          {item.jobTitle}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {formatISTDate(item.matchedAt.toISOString())}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" />
                            {item.totalMatches} matches
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* View Details Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        userChangedView.current = true; // Prevent useEffect from resetting view
                        setSelectedHistoryItem(item);
                        setSelectedJob(item.jobId);
                        setViewMode('details');
                        updateUrlParams({ jdId: item.jobId, view: 'details' });
                      }}
                      className="px-3 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all flex items-center justify-center gap-2 font-medium text-sm w-full sm:w-auto shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      View Details
                      <ArrowLeft className="w-3.5 h-3.5 rotate-180 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
            <ListPagination
              currentPage={historyCurrentPage}
              itemsPerPage={historyItemsPerPage}
              totalItems={filteredHistory.length}
              onPageChange={setHistoryCurrentPage}
              onItemsPerPageChange={setHistoryItemsPerPage}
              itemLabel="jobs"
            />
          </>
        ) : matchHistory.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-brand-blue/20 p-8 sm:p-10 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                <History className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 mb-2">No Matching History Yet</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                Start using AI Talent Match to find the best candidates for your jobs. Our AI will analyze and rank candidates based on job fit.
              </p>
              <button
                onClick={() => {
                  if (!canRunAiMatch) {
                    toast.error('You do not have permission to run AI matching operations');
                    return;
                  }
                  setViewMode('new');
                  setSelectedJob('');
                  router.push('/recruitment/ai-talent-match', { scroll: false });
                }}
                disabled={!canRunAiMatch}
                className={`px-4 py-2 rounded-lg transition-all font-medium shadow-sm inline-flex items-center gap-2 text-sm ${
                  canRunAiMatch
                    ? 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                }`}
                title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
              >
                <Sparkles className="w-4 h-4" />
                Run AI Match Now
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-brand-blue/20 p-8 sm:p-10 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                <Search className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 mb-2">No Results Found</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                No matched jobs match your current filters. Try adjusting your search criteria.
              </p>
              <button
                onClick={() => {
                  setHistorySearchQuery('');
                  setHistoryDateFrom('');
                  setHistoryDateTo('');
                }}
                className="px-4 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all font-medium shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 inline-flex items-center gap-2 text-sm"
              >
                <X className="w-4 h-4" />
                Clear All Filters
              </button>
            </div>
          </div>
        )}
        </>
        )}
        </div>
      </div>
      </main>
    );
  }

  // View: Results (After Matching)
  if (viewMode === 'results') {
    const filteredCandidates = filteredCandidatesMemo;
    const paginatedCandidates = getPaginatedCandidates();
    const excellentCount = matchedCandidates.filter(c => c.matchScore >= 85).length;
    const goodCount = matchedCandidates.filter(c => c.matchScore >= 70 && c.matchScore < 85).length;
    const moderateCount = matchedCandidates.filter(c => c.matchScore < 70).length;
    const historyItemForSelectedJob = matchHistory.find(item => item.jobId === selectedJob);
    const isLoadingResultsFromHistory =
      loadingHistorySessionId !== null &&
      (loadingHistorySessionId === selectedHistoryItem?.id || loadingHistorySessionId === historyItemForSelectedJob?.id);

    return (
      <main className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Talent Match', onClick: () => setViewMode('history') },
              { label: selectedJobData?.title || 'Results' },
            ]}
          />

          {/* SaaS Header */}
          <div className="mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div className="flex items-start gap-3 min-w-0">
                <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1 tracking-tight truncate">{selectedJobData?.title}</h1>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {matchedCandidates.length} matches
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                      <CheckCircle2 className="w-3 h-3" />
                      Complete
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                      <Sparkles className="w-3 h-3" />
                      AI Talent Match • 0 units consumed
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-2">
                <button
                  onClick={() => {
                    if (selectedJob) {
                      isMatchingInProgress.current = true;
                      setSelectedCandidates([]);
                      setMatchedCandidates([]);
                      setShowMatchingPanel(true);
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>New AI Match</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filters & Search toolbar — only show when there are matched candidates to filter */}
          {!isLoadingResultsFromHistory && matchedCandidates.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search candidates..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
                />
              </div>
              <select
                value={filterThreshold}
                onChange={(e) => setFilterThreshold(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-sm text-black"
              >
                <option value={0}>All Matches</option>
                <option value={50}>50%+ Match</option>
                <option value={70}>70%+ Match</option>
                <option value={85}>85%+ Match</option>
              </select>
              <div className="text-sm text-gray-700 dark:text-slate-300 bg-brand-blue/5 ring-1 ring-brand-blue/10 px-3 py-2 rounded-lg font-medium whitespace-nowrap">
                <span className="text-brand-blue font-semibold">{filteredCandidates.length}</span> candidates
              </div>
              {selectedCandidates.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {availableUnits !== null && selectedCandidates.length > availableUnits && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-orange/10 border border-brand-orange/30 ring-1 ring-brand-orange/15 rounded-lg w-full sm:w-auto">
                      <AlertTriangle className="w-4 h-4 text-brand-orange-deep flex-shrink-0" />
                      <span className="text-xs text-brand-orange-deep font-medium">
                        Insufficient units! You have {availableUnits} RS unit{availableUnits !== 1 ? 's' : ''} but selected {selectedCandidates.length}. Remove {selectedCandidates.length - availableUnits} resume{selectedCandidates.length - availableUnits > 1 ? 's' : ''}.
                      </span>
                    </div>
                  )}
                  <>
                  {canRunScoring && (
                  <button
                      onClick={handleSubmitToScoring}
                      disabled={availableUnits !== null && selectedCandidates.length > availableUnits}
                    className={`px-3 py-2 text-white rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 flex-1 sm:flex-initial ${
                      availableUnits !== null && selectedCandidates.length > availableUnits
                        ? 'bg-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                    }`}
                    >
                      <Target className="w-3.5 h-3.5" />
                      Score ({selectedCandidates.length})
                    </button>
                  )}
                  {(hasPermission('canCreateAssessments') || isTenantAdmin) && (
                    <button
                      onClick={handleAssessment}
                      className="px-3 py-2 bg-brand-cyan hover:from-brand-teal hover:to-brand-cyan text-white rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 flex-1 sm:flex-initial shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Assessment ({selectedCandidates.length})
                    </button>
                  )}
                </>
                </div>
              )}
            </div>
            {/* Additional Filters */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3">
              <input
                type="text"
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                placeholder="Filter by phone..."
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="text"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                placeholder="Filter by location..."
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="number"
                value={filterExperienceMin}
                onChange={(e) => setFilterExperienceMin(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Min exp (years)"
                className="w-full sm:w-28 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="number"
                value={filterExperienceMax}
                onChange={(e) => setFilterExperienceMax(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Max exp (years)"
                className="w-full sm:w-28 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'rank' | 'name' | 'score' | 'experience')}
                className="col-span-2 sm:col-span-1 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-sm text-black"
              >
                <option value="rank">Sort by Rating (High to Low)</option>
                <option value="name">Sort by Name (A to Z)</option>
                <option value="score">Sort by Score</option>
                <option value="experience">Sort by Experience</option>
              </select>
            </div>
          </div>
          )}

          {/* Candidates List */}
          <div>
          {isLoadingResultsFromHistory ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin mb-3" />
              <p className="text-sm text-gray-600 dark:text-slate-400 text-center">Loading matched candidates...</p>
            </div>
          ) : matchedCandidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="w-12 h-12 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2 text-center">No AI Match Results Yet</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 text-center max-w-md mb-4">
                AI Talent Match has not been run for this job yet. Run AI matching to find candidates that match this job description.
              </p>
              <button
                onClick={() => {
                  if (!canRunAiMatch) {
                    toast.error('You do not have permission to run AI matching operations');
                    return;
                  }
                  setShowMatchingPanel(true);
                }}
                disabled={!canRunAiMatch}
                className={`px-4 py-2 rounded-lg transition-all font-medium flex items-center gap-2 shadow-md text-sm ${
                  canRunAiMatch
                    ? 'bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                }`}
                title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
              >
                <Sparkles className="w-4 h-4" />
                Run AI Talent Match
              </button>
            </div>
          ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filteredCandidates.length > 0 && filteredCandidates.every(c => selectedCandidates.includes(c.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCandidates(filteredCandidates.map(c => c.id));
                        } else {
                          setSelectedCandidates([]);
                        }
                      }}
                      className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Matched Rating
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Candidate Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Skills
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Experience
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Uploaded By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Uploaded Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Attachments
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Scored Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-700">
                {paginatedCandidates.map((candidate, index) => (
                  <tr
                    key={candidate.id}
                    className={`hover:bg-brand-blue/[0.03] transition-colors cursor-pointer ${
                      selectedCandidates.includes(candidate.id) ? 'bg-brand-blue/5' : ''
                    }`}
                    onClick={() => {
                      if (candidate.resumeId) {
                        try {
                          sessionStorage.setItem('resumeNavList', JSON.stringify(filteredCandidatesMemo.map((c: any) => c.resumeId).filter(Boolean)));
                          sessionStorage.setItem('resumeNavSource', 'ai-talent-match');
                        } catch { /* ignore */ }
                        router.push(`/recruitment/resume-view/${candidate.resumeId}`);
                      }
                    }}
                  >
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedCandidates.includes(candidate.id)}
                        onChange={() => handleSelectCandidate(candidate.id)}
                        className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-base ${
                        (candidate.rank || 0) >= 9 ? 'bg-brand-blue/10 text-brand-blue border-2 border-brand-blue/30' :
                        (candidate.rank || 0) >= 7 ? 'bg-brand-cyan/10 text-brand-cyan border-2 border-brand-cyan/30' :
                        (candidate.rank || 0) >= 5 ? 'bg-brand-orange/10 text-brand-orange-deep border-2 border-brand-orange/30' :
                        'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-2 border-gray-200 dark:border-slate-700'
                      }`}>
                        {candidate.rank || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-sm text-brand-blue font-medium flex-shrink-0">
                          {(candidate.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-slate-50">{candidate.name || 'Unknown'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {candidate.email ? candidate.email : <span className="text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {(() => {
                        const numbers = splitPhoneNumbers(candidate.phone, 2);
                        return numbers.length > 0
                          ? <div className="flex flex-col gap-0.5">{numbers.map((num, i) => <span key={i}>{num}</span>)}</div>
                          : <span className="text-gray-400 dark:text-slate-500">-</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {candidate.location ? candidate.location : <span className="text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        <SkillsList
                          skills={candidate.skills}
                          chipClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20"
                          moreClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-brand-blue font-medium hover:bg-brand-blue/10 transition-colors cursor-pointer"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{candidate.experience}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {formatUploadedBy(candidate.uploadedByName, candidate.uploadedBy)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {candidate.uploadDate ? formatISTDate(candidate.uploadDate) : <span className="text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVersionsCandidate(candidate);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 text-xs font-medium"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        {candidate.attachmentCount || 1}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      {scoredResumeIds.has(candidate.resumeId) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                          <CheckCircle className="w-3 h-3" />
                          Scored
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 ring-1 ring-gray-200 dark:ring-slate-700">
                          <XCircle className="w-3 h-3" />
                          Not Scored
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalFilteredCandidates > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalFilteredCandidates}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            )}
          </div>
          )}
          </div>
        </div>
        </div>
      </main>
    );
  }

  // View: New Match (Job Selection)
  return (
    <>

      <AITalentMatchPageJobsList
        jobs={jobs}
        matchHistory={matchHistory}
        onSelectJob={(jobId) => {
          handleRunAIMatch(jobId);
        }}
        onViewHistory={() => setViewMode('history')}
        onBack={onBack}
      />
      
      {/* AI Matching Progress Panel */}
      {showMatchingPanel && selectedJob && (
        <AITalentMatchProgressPanel
          jobTitle={selectedJobData?.title || 'Job Description'}
          jobId={selectedJob}

          onComplete={handleMatchingComplete}
          onError={(error) => {
            setMatchError(error);
            setShowMatchingPanel(false);
          }}
        />
      )}
      
      {/* Resume Versions Modal */}
      {selectedVersionsCandidate && (
        <ResumeVersionsModal
          candidate={selectedVersionsCandidate}
          versions={realVersionsData}
          loading={loadingVersions}
          onClose={() => {
            setSelectedVersionsCandidate(null);
            setRealVersionsData([]);
          }}
        />
      )}

      {/* Version Selection Modal for Scoring (single candidate) */}
      {showVersionSelectForScoring && scoringCandidate && (
        <ResumeVersionsModal
          candidate={scoringCandidate}
          versions={scoringVersions}
          loading={loadingVersions}
          selectionMode={true}
          onClose={() => {
            setShowVersionSelectForScoring(false);
            setScoringCandidate(null);
            setScoringVersions([]);
          }}
          onSelectVersion={async (version) => {
            // Score with selected version
            const jobId = selectedJob || selectedHistoryItem?.jobId;
            if (!jobId || !scoringCandidate) return;

            try {
              const response = await scoringService.startBulkScoringAsync(jobId, [version.id]);
              const scoringData = {
                batchId: response.batch_id,
                jobId: response.jd_id,
                jobTitle: response.jd_title,
                totalResumes: response.total_resumes,
                resumeItems: [{ resumeId: version.id, candidateName: scoringCandidate.name }],
              };
              sessionStorage.setItem('pendingScoringBatch', JSON.stringify(scoringData));
              router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
            } catch (error: any) {
              console.error('Failed to start scoring:', error);
              toast.error(error.message || 'Failed to start scoring');
            }

            setShowVersionSelectForScoring(false);
            setScoringCandidate(null);
            setScoringVersions([]);
          }}
        />
      )}

      {/* Assessment Selection Modal */}
      {isAssessmentModalOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsAssessmentModalOpen(false);
            setSelectedAssessments([]);
            setAssessmentSearchQuery('');
          }
        }}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-4xl max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-slate-700 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-slate-50">Select Active Assessments</h2>
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 p-1"
                 aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-3">
                Select one or more assessments to send to {selectedCandidates.length} candidate{selectedCandidates.length !== 1 ? 's' : ''}
              </p>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={assessmentSearchQuery}
                  onChange={(e) => setAssessmentSearchQuery(e.target.value)}
                  placeholder="Search assessments..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                />
              </div>

              {/* Select All / Clear All */}
              {assessments.length > 0 && (() => {
                const filteredAssessments = assessments.filter(assessment => {
                  if (!assessmentSearchQuery.trim()) return true;
                  const query = assessmentSearchQuery.toLowerCase();
                  return (
                    assessment.short_id?.toLowerCase().includes(query) ||
                    assessment.title?.toLowerCase().includes(query) ||
                    assessment.jd_short_id?.toLowerCase().includes(query) ||
                    assessment.jd_title?.toLowerCase().includes(query)
                  );
                });
                return filteredAssessments.length > 0 && (
                  <button
                    onClick={() => {
                      if (selectedAssessments.length === filteredAssessments.length) {
                        setSelectedAssessments([]);
                      } else {
                        setSelectedAssessments(filteredAssessments);
                      }
                    }}
                    className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium mt-3"
                  >
                    {selectedAssessments.length === filteredAssessments.length && selectedAssessments.length > 0 ? 'Clear All' : 'Select All'}
                  </button>
                );
              })()}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {(() => {
                const filteredAssessments = assessments.filter(assessment => {
                  if (!assessmentSearchQuery.trim()) return true;
                  const query = assessmentSearchQuery.toLowerCase();
                  return (
                    assessment.short_id?.toLowerCase().includes(query) ||
                    assessment.title?.toLowerCase().includes(query) ||
                    assessment.jd_short_id?.toLowerCase().includes(query) ||
                    assessment.jd_title?.toLowerCase().includes(query)
                  );
                });

                return filteredAssessments.length === 0 ? (
                  <div className="text-center py-10">
                    <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-slate-500">{assessmentSearchQuery ? 'No assessments match your search' : 'No active assessments available'}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{assessmentSearchQuery ? 'Try different search terms' : 'Create and publish an assessment first'}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAssessments.map((assessment) => {
                      const isSelected = selectedAssessments.some(a => a.id === assessment.id);
                      return (
                        <button
                          key={assessment.id}
                          onClick={() => handleAssessmentSelect(assessment)}
                          className={`w-full text-left border-2 rounded-lg p-3 transition-all ${
                            isSelected
                              ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                              : 'border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/5'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {/* Checkbox */}
                            <div className="flex-shrink-0 mt-1">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-brand-blue border-brand-blue'
                                  : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-700'
                              }`}>
                                {isSelected && (
                                  <CheckCircle className="w-4 h-4 text-white" />
                                )}
                              </div>
                            </div>

                            <div className="flex-1">
                              {/* Assessment ID, Title, Version + Active Badge */}
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                {assessment.short_id && (
                                  <span className="text-xs px-2 py-0.5 bg-brand-blue text-white rounded font-semibold">
                                    {assessment.short_id}
                                  </span>
                                )}
                                {(() => {
                                  // Strip any "- Version N" baked into the stored title
                                  // and render the live version (from `version`, falling
                                  // back to the parsed title version) as its own badge.
                                  const parsed = parseAssessmentTitle(assessment.title || '');
                                  const displayVersion = typeof assessment.version === 'number'
                                    ? assessment.version
                                    : parsed.version;
                                  const base = parsed.cleanTitle || 'Untitled assessment';
                                  return (
                                    <>
                                      <h5 className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{base}</h5>
                                      {displayVersion && (
                                        <span className="text-xs px-2 py-0.5 bg-brand-cyan/15 text-brand-cyan ring-1 ring-brand-cyan/30 rounded font-semibold">
                                          V{displayVersion}
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                  Active
                                </span>
                              </div>

                              {/* Linked JD Information */}
                              {assessment.jd_short_id && (
                                <div className="text-xs text-gray-600 dark:text-slate-400 mb-1.5">
                                  <span className="font-medium">Linked to: </span>
                                  <span className="text-gray-800 dark:text-slate-100">{assessment.jd_short_id}</span>
                                  {assessment.jd_title && (
                                    <span className="ml-1">- {assessment.jd_title}</span>
                                  )}
                                  {assessment.jd_version && (
                                    <span className="ml-1 text-gray-500 dark:text-slate-500">v{assessment.jd_version}</span>
                                  )}
                                </div>
                              )}

                              {/* Duration and Sections */}
                              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {assessment.duration_minutes || 0} min
                                </span>
                              </div>

                              {/* Created By and Date */}
                              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-500 mt-1.5">
                                {assessment.created_by_name && (
                                  <>
                                    <span>Created by: <span className="text-gray-700 dark:text-slate-300 font-medium">{assessment.created_by_name}</span></span>
                                    <span>•</span>
                                  </>
                                )}
                                {assessment.created_at && (
                                  <span>
                                    {formatIST(assessment.created_at)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 gap-3 sm:gap-0 shrink-0">
              <div className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 text-center sm:text-left">
                {selectedAssessments.length} assessment{selectedAssessments.length !== 1 ? 's' : ''} selected
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedToInvite}
                  disabled={selectedAssessments.length === 0}
                  className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white text-sm rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" />
                  <span className="hidden sm:inline">Proceed to Send Invitations</span>
                  <span className="sm:hidden">Send Invitations</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Assessment Modal */}
      {isShareModalOpen && selectedAssessments.length > 0 && (
        <ShareAssessmentModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setCurrentAssessmentForShare(null);
            setSelectedAssessments([]);
            setPrefilledCandidates([]);
            setAssessmentSearchQuery('');
          }}
          assessment={{
            id: selectedAssessments[0].id,
            title: selectedAssessments[0].title,
            duration: `${selectedAssessments[0].duration_minutes || 0} min`,
            questions: (selectedAssessments[0].hr_enabled ? 1 : 0) +
                      (selectedAssessments[0].technical_enabled ? 1 : 0) +
                      (selectedAssessments[0].coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: selectedAssessments[0].short_id,
            version: selectedAssessments[0].version,
            jd_short_id: selectedAssessments[0].jd_short_id,
            jd_title: selectedAssessments[0].jd_title,
            jd_version: selectedAssessments[0].jd_version,
          }}
          additionalAssessments={selectedAssessments.map(a => ({
            id: a.id,
            title: a.title,
            duration: `${a.duration_minutes || 0} min`,
            questions: (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: a.short_id,
            version: a.version,
            jd_short_id: a.jd_short_id,
            jd_title: a.jd_title,
            jd_version: a.jd_version
          }))}
          prefilledCandidates={prefilledCandidates}
          inviteSource="Resume Scoring"
        />
      )}

    </>
  );
}
