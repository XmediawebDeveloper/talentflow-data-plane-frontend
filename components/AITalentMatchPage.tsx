'use client';

import { Sparkles, Target, Filter, Search, ChevronDown, Mail, Phone, MapPin, Building2, CheckCircle, Star, User, FileText, Send, TrendingUp, Award, Clock, Briefcase, History, Eye, ArrowLeft, X, DollarSign, CheckCircle2, AlertCircle, AlertTriangle, PlayCircle, Paperclip, ClipboardList } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import AITalentMatchPageJobsList from './AITalentMatchPageJobsList';
import ResumeVersionsModal from './ResumeVersionsModal';
import Pagination from './Pagination';
import { recordUsage } from '@/lib/services/usageTrackingService';
import { MatchedCandidate } from '@/lib/services/aiMatchService';
import api from '@/lib/services/api';
import { scoringService } from '@/lib/services/scoringService';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';
import { assessmentService } from '@/lib/services';
import ShareAssessmentModal from './ShareAssessmentModal';
import { useAuth } from '@/lib/hooks/useAuth';

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

  // ✅ RBAC: Check if user can run AI match operations (bypass for tenant admin)
  const canRunAiMatch = isTenantAdmin || (user?.permissions?.canRunAiMatch ?? false);


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

  // Available units from quota API
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);

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

      if (existingMatch && existingMatch.matchedCandidates.length > 0) {
        // Show history details
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

      if (existingMatch && existingMatch.matchedCandidates.length > 0) {
        // Show existing results from history
        setSelectedHistoryItem(existingMatch);
        setMatchedCandidates(existingMatch.matchedCandidates);
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

  // Fetch available units on mount
  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const response = await api.get('/usage/quota-status');
        const quotas = response.data?.data?.quotas;
        // AI Talent Match uses Resume Scoring (RS) quota
        if (quotas?.RS) {
          setAvailableUnits(quotas.RS.total_remaining || 0);
        }
      } catch (error) {
        console.log('[AITalentMatchPage] Failed to load quota:', error);
      }
    };
    fetchQuota();
  }, []);

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
    const currentCandidates = viewMode === 'results' ? matchedCandidates :
                              selectedHistoryItem ? selectedHistoryItem.matchedCandidates : [];

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

    // MULTIPLE CANDIDATES: Use latest resume (resumeId) directly
    const resumeIds = selected.map(c => c.resumeId);

    try {
      // Start async bulk scoring via Celery (background processing)
      const response = await scoringService.startBulkScoringAsync(jobId, resumeIds);

      // Get candidate names for fallback display
      const resumeItems = selected.map(c => ({
        resumeId: c.resumeId,
        candidateName: c.name || 'Unknown',
      }));

      // Store batch info for the resume-scoring page to poll (including resume items for fallback)
      const scoringData = {
        batchId: response.batch_id,
        jobId: response.jd_id,
        jobTitle: response.jd_title,
        totalResumes: response.total_resumes,
        resumeItems: resumeItems,
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

    // Fetch active assessments (published status)
    try {
      const response = await assessmentService.list({ status: 'published', page_size: 100 });
      const activeAssessments = response.items.map((a: any) => ({
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
    const currentCandidates = viewMode === 'results' ? matchedCandidates :
                              selectedHistoryItem ? selectedHistoryItem.matchedCandidates : [];
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
              await assessmentService.sendInvitation(assessment.id, {
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
    const candidates: MatchedCandidateWithVersions[] = viewMode === 'results' ? matchedCandidates :
                      selectedHistoryItem ? selectedHistoryItem.matchedCandidates : [];

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
    if (score >= 70) return 'text-gray-800';
    if (score >= 50) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getMatchBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-gray-100 border-gray-300 text-gray-900';
    if (score >= 50) return 'bg-yellow-100 border-yellow-300 text-yellow-700';
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
    const matchesCandidateFilters = !hasCandidateFilters || item.matchedCandidates.some(candidate => {
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
    const filteredCandidates = filteredCandidatesMemo;
    const paginatedCandidates = getPaginatedCandidates();
    const excellentCount = selectedHistoryItem.matchedCandidates.filter(c => c.matchScore >= 85).length;
    const goodCount = selectedHistoryItem.matchedCandidates.filter(c => c.matchScore >= 70 && c.matchScore < 85).length;
    const moderateCount = selectedHistoryItem.matchedCandidates.filter(c => c.matchScore < 70).length;

    return (
      <>

      <main className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 via-blue-50 to-white">
        {/* Header Section - Sticky */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm p-6">
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
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => {
                      setViewMode('history');
                      setSelectedHistoryItem(null);
                      setSelectedJob('');
                      setSelectedCandidates([]);
                      router.push('/recruitment/ai-talent-match', { scroll: false });
                    }}
                    className="flex items-center gap-2 text-gray-800 hover:text-gray-900 font-medium transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Matched Jobs
                  </button>
                  {/* Run AI Match button */}
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
                      className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
                        canRunAiMatch
                          ? 'bg-gray-800 text-white hover:bg-gray-900 cursor-pointer'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                      }`}
                      title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
                    >
                      <Sparkles className="w-4 h-4" />
                      Run AI Match
                    </button>
                  )}
                </div>

                {/* Job Info Card */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h1 className="text-xl text-gray-900 font-semibold">{selectedHistoryItem.jobTitle}</h1>
                        {isJobDisabled && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full border border-red-200">
                            Disabled
                          </span>
                        )}
                      </div>
                <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {new Date(selectedHistoryItem.matchedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {selectedHistoryItem.totalMatches} matches
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium border border-blue-200">
                    <Sparkles className="w-3 h-3" />
                    AI Talent Match • 0 units consumed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search candidates..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                />
              </div>
              <select
                value={filterThreshold}
                onChange={(e) => setFilterThreshold(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
              >
                <option value={0}>All Matches</option>
                <option value={50}>50%+ Match</option>
                <option value={70}>70%+ Match</option>
                <option value={85}>85%+ Match</option>
              </select>
              <div className="text-sm text-gray-700 bg-gray-100 px-3 py-2 rounded-lg font-medium border border-gray-200">
                {filteredCandidates.length} candidates
              </div>
              {selectedCandidates.length > 0 && (
                <div className="flex items-center gap-2">
                  {availableUnits !== null && selectedCandidates.length > availableUnits && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span className="text-xs text-amber-700 font-medium">
                        Insufficient units! You have {availableUnits} RS unit{availableUnits !== 1 ? 's' : ''} but selected {selectedCandidates.length}. Remove {selectedCandidates.length - availableUnits} resume{selectedCandidates.length - availableUnits > 1 ? 's' : ''}.
                      </span>
                    </div>
                  )}
                  <>
                  <button
                      onClick={handleSubmitToScoring}
                      disabled={availableUnits !== null && selectedCandidates.length > availableUnits}
                    className={`px-4 py-2 text-white rounded-lg transition-all font-medium text-sm flex items-center gap-2 ${
                      availableUnits !== null && selectedCandidates.length > availableUnits
                        ? 'bg-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-gray-800 hover:bg-gray-900'
                    }`}
                    >
                      <Target className="w-4 h-4" />
                      Score ({selectedCandidates.length})
                    </button>
                  {(hasPermission('canCreateAssessments') || isTenantAdmin) && (
                    <button
                      onClick={handleAssessment}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium text-sm flex items-center gap-2"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Assessment ({selectedCandidates.length})
                    </button>
                  )}
                </>
                </div>
              )}
            </div>
            {/* Additional Filters */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                placeholder="Filter by phone..."
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
              <input
                type="text"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                placeholder="Filter by location..."
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
              <input
                type="number"
                value={filterExperienceMin}
                onChange={(e) => setFilterExperienceMin(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Min exp (years)"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
              <input
                type="number"
                value={filterExperienceMax}
                onChange={(e) => setFilterExperienceMax(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Max exp (years)"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'rank' | 'name' | 'score' | 'experience')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
              >
                <option value="rank">Sort by Rating (High to Low)</option>
                <option value="name">Sort by Name (A to Z)</option>
                <option value="score">Sort by Score</option>
                <option value="experience">Sort by Experience</option>
              </select>
            </div>
          </div>
              </>
            );
          })()}
        </div>

        {/* Candidates List - Table View */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
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
                    className="rounded border-gray-300 text-gray-800 focus:ring-gray-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                  Match Rating
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                  Candidate Name
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                  Skills
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                  Experience
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                  Uploaded By
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                  Uploaded Date
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                  Attachments
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedCandidates.map((candidate, index) => (
                <tr
                  key={candidate.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    selectedCandidates.includes(candidate.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedCandidates.includes(candidate.id)}
                      onChange={() => handleSelectCandidate(candidate.id)}
                      className="rounded border-gray-300 text-gray-800 focus:ring-gray-500"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className={`inline-flex items-center justify-center px-3 py-1 rounded-md font-bold text-sm ${
                      (candidate.rank || 0) >= 7 ? 'bg-green-100 text-green-800 border border-green-300' :
                      (candidate.rank || 0) >= 4 ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' :
                      (candidate.rank || 0) >= 1 ? 'bg-gray-100 text-gray-700 border border-gray-300' :
                      'bg-gray-50 text-gray-400 border border-gray-200'
                    }`}>
                      {candidate.rank || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700 font-medium">
                        {(candidate.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{candidate.name || 'Unknown'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    {candidate.email ? candidate.email : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    {candidate.phone ? candidate.phone : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    {candidate.location ? candidate.location : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {candidate.skills && candidate.skills.slice(0, 4).map((skill, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200"
                        >
                          {skill}
                        </span>
                      ))}
                      {candidate.skills && candidate.skills.length > 4 && (
                        <span className="inline-flex items-center px-2.5 py-0.5 text-xs text-blue-600">
                          +{candidate.skills.length - 4} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">{candidate.experience}</td>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    {formatUploadedBy(candidate.uploadedByName, candidate.uploadedBy)}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    {candidate.uploadDate ? new Date(candidate.uploadDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    }) : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAttachmentsClick(candidate);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 text-gray-900 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 text-xs font-medium"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {candidate.attachmentCount || 1}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsAssessmentModalOpen(false);
            setSelectedAssessments([]);
            setAssessmentSearchQuery('');
          }
        }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-2xl font-bold text-gray-900">Select Active Assessments</h2>
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Select one or more assessments to send to {selectedCandidates.length} candidate{selectedCandidates.length !== 1 ? 's' : ''}
              </p>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={assessmentSearchQuery}
                  onChange={(e) => setAssessmentSearchQuery(e.target.value)}
                  placeholder="Search by Assessment ID, Name, JD ID, or JD Name..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
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
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-3"
                  >
                    {selectedAssessments.length === filteredAssessments.length && selectedAssessments.length > 0 ? 'Clear All' : 'Select All'}
                  </button>
                );
              })()}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
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
                  <div className="text-center py-12">
                    <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">{assessmentSearchQuery ? 'No assessments match your search' : 'No active assessments available'}</p>
                    <p className="text-sm text-gray-400 mt-1">{assessmentSearchQuery ? 'Try different search terms' : 'Create and publish an assessment first'}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAssessments.map((assessment) => {
                      const isSelected = selectedAssessments.some(a => a.id === assessment.id);
                      return (
                        <button
                          key={assessment.id}
                          onClick={() => handleAssessmentSelect(assessment)}
                          className={`w-full text-left border-2 rounded-lg p-4 transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Checkbox */}
                            <div className="flex-shrink-0 mt-1">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-blue-500 border-blue-500'
                                  : 'bg-white border-gray-300'
                              }`}>
                                {isSelected && (
                                  <CheckCircle className="w-4 h-4 text-white" />
                                )}
                              </div>
                            </div>

                            <div className="flex-1">
                              {/* Assessment ID, Title, and Active Badge */}
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                {assessment.short_id && (
                                  <span className="text-xs px-2 py-0.5 bg-gray-800 text-white rounded font-semibold">
                                    {assessment.short_id}
                                  </span>
                                )}
                                <h5 className="font-medium text-gray-900">{assessment.title}</h5>
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                  Active
                                </span>
                              </div>

                              {/* Linked JD Information */}
                              {assessment.jd_short_id && (
                                <div className="text-xs text-gray-600 mb-1.5">
                                  <span className="font-medium">Linked to: </span>
                                  <span className="text-gray-800">{assessment.jd_short_id}</span>
                                  {assessment.jd_title && (
                                    <span className="ml-1">- {assessment.jd_title}</span>
                                  )}
                                  {assessment.jd_version && (
                                    <span className="ml-1 text-gray-500">v{assessment.jd_version}</span>
                                  )}
                                </div>
                              )}

                              {/* Duration and Sections */}
                              <div className="flex items-center gap-3 text-sm text-gray-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {assessment.duration_minutes || 0} min
                                </span>
                              </div>

                              {/* Created By and Date */}
                              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1.5">
                                {assessment.created_by_name && (
                                  <>
                                    <span>Created by: <span className="text-gray-700 font-medium">{assessment.created_by_name}</span></span>
                                    <span>•</span>
                                  </>
                                )}
                                {assessment.created_at && (
                                  <span>
                                    {(() => {
                                      const dateWithZ = assessment.created_at + (assessment.created_at.includes('Z') ? '' : 'Z');
                                      const date = new Date(dateWithZ);
                                      return `${date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}`;
                                    })()}
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

            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                {selectedAssessments.length} assessment{selectedAssessments.length !== 1 ? 's' : ''} selected
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedToInvite}
                  disabled={selectedAssessments.length === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" />
                  Proceed to Send Invitations
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
            jd_short_id: selectedAssessments[0].jd_short_id,
            jd_title: selectedAssessments[0].jd_title,
            jd_version: selectedAssessments[0].jd_version,
          }}
          assessments={selectedAssessments.map(a => ({
            id: a.id,
            title: a.title,
            duration: `${a.duration_minutes || 0} min`,
            questions: (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: a.short_id,
            jd_short_id: a.jd_short_id,
            jd_title: a.jd_title,
            jd_version: a.jd_version
          }))}
          prefilledCandidates={prefilledCandidates}
        />
      )}
      </>
    );
  }

  // View: History List
  if (viewMode === 'history') {
    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-blue-50 to-white">
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
              <h1 className="text-gray-900">AI Talent Match - Matched Jobs</h1>
              <p className="text-sm text-gray-600">Review jobs with AI-matched candidates and their results</p>
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
              className={`px-5 py-2.5 rounded-lg transition-all text-sm font-medium flex items-center gap-2 shadow-sm ${
                canRunAiMatch
                  ? 'bg-gray-800 text-white hover:bg-gray-900 hover:shadow-md cursor-pointer'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
              }`}
              title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
            >
              <Sparkles className="w-4 h-4" />
              Run AI Match
            </button>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              placeholder="Search by job title..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm bg-white"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setShowHistoryFilters(!showHistoryFilters)}
              className={`px-4 py-2.5 rounded-lg border transition-all flex items-center gap-2 text-sm font-medium ${
                activeFiltersCount > 0
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold bg-white text-gray-900">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Filter Popover */}
            {showHistoryFilters && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowHistoryFilters(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-40">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-900">Filters</span>
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
                        className="text-xs text-gray-500 hover:text-gray-900 font-medium"
                      >
                        Reset all
                      </button>
                    )}
                  </div>

                  <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
                    {/* Date Range */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Date Range</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[11px] text-gray-400 mb-1 block">From</span>
                          <input
                            type="date"
                            value={historyDateFrom}
                            onChange={(e) => setHistoryDateFrom(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white text-sm"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] text-gray-400 mb-1 block">To</span>
                          <input
                            type="date"
                            value={historyDateTo}
                            onChange={(e) => setHistoryDateTo(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Mobile Number */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Mobile No</label>
                      <div className="relative">
                        <Phone className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="text"
                          value={historyFilterPhone}
                          onChange={(e) => setHistoryFilterPhone(e.target.value)}
                          placeholder="Search by mobile number"
                          className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white text-sm"
                        />
                      </div>
                    </div>

                    {/* Location */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Location</label>
                      <div className="relative">
                        <MapPin className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="text"
                          value={historyFilterLocation}
                          onChange={(e) => setHistoryFilterLocation(e.target.value)}
                          placeholder="Search by location"
                          className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white text-sm"
                        />
                      </div>
                    </div>

                    {/* Experience */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Experience (years)</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={historyFilterExpMin}
                          onChange={(e) => setHistoryFilterExpMin(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Min"
                          min={0}
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white text-sm"
                        />
                        <input
                          type="number"
                          value={historyFilterExpMax}
                          onChange={(e) => setHistoryFilterExpMax(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Max"
                          min={0}
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-gray-100">
                    <button
                      onClick={() => setShowHistoryFilters(false)}
                      className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2.5 rounded-lg whitespace-nowrap font-medium border border-gray-200">
            <span className="text-gray-900 font-semibold">{filteredHistory.length}</span> / {matchHistory.length} jobs
          </div>
        </div>

        {/* History List */}
        {filteredHistory.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-gray-900 font-medium">Matched Jobs ({filteredHistory.length})</h2>
              <p className="text-sm text-gray-600">Click any job to view matched candidates</p>
            </div>
            <div className="grid gap-5">
            {filteredHistory.map((item) => {
              const avgScore = item.matchedCandidates.length > 0
                ? Math.round(item.matchedCandidates.reduce((sum, c) => sum + c.matchScore, 0) / item.matchedCandidates.length)
                : 0;

              const excellentCount = item.matchedCandidates.filter(c => c.matchScore >= 85).length;
              const goodCount = item.matchedCandidates.filter(c => c.matchScore >= 70 && c.matchScore < 85).length;
              const moderateCount = item.matchedCandidates.filter(c => c.matchScore < 70).length;

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
                  className="bg-white rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all p-6 cursor-pointer group"
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-center justify-between">
                    {/* Job Info */}
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {jobData?.jobId && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                              {jobData.jobId}
                            </span>
                          )}
                          {jobData?.currentVersion && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              v{jobData.currentVersion}
                            </span>
                          )}
                          {jobData?.currentVersion && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                              jobData.currentVersion > 1
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-green-50 text-green-700 border-green-200'
                            }`}>
                              {jobData.currentVersion > 1 ? 'Republished' : 'Published'}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-gray-800 transition-colors">
                          {item.jobTitle}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            {new Date(item.matchedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <User className="w-4 h-4" />
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
                      className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2 font-medium"
                    >
                      View Details
                      <ArrowLeft className="w-4 h-4 rotate-180 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </>
        ) : matchHistory.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-gray-100 to-gray-100 rounded-full flex items-center justify-center">
                <History className="w-10 h-10 text-gray-800" />
              </div>
              <h3 className="text-xl text-gray-900 mb-2">No Matching History Yet</h3>
              <p className="text-gray-600 mb-6">
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
                className={`px-6 py-3 rounded-lg transition-all font-medium shadow-sm inline-flex items-center gap-2 ${
                  canRunAiMatch
                    ? 'bg-gray-800 text-white hover:bg-gray-900 hover:shadow-md cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                }`}
                title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
              >
                <Sparkles className="w-5 h-5" />
                Run AI Match Now
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
                No matched jobs match your current filters. Try adjusting your search criteria.
              </p>
              <button
                onClick={() => {
                  setHistorySearchQuery('');
                  setHistoryDateFrom('');
                  setHistoryDateTo('');
                }}
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium shadow-sm hover:shadow-md inline-flex items-center gap-2"
              >
                <X className="w-5 h-5" />
                Clear All Filters
              </button>
            </div>
          </div>
        )}
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

    return (
      <main className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 via-blue-50 to-white">
        {/* Header Section - Sticky */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm p-6">
          {/* Back Button & Title */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                setViewMode('history');
                setSelectedCandidates([]);
                setMatchedCandidates([]);
                updateUrlParams({}); // Clear URL params
              }}
              className="flex items-center gap-2 text-gray-800 hover:text-gray-900 font-medium transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Matched Jobs
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  // Keep the current JD and run new match
                  if (selectedJob) {
                    isMatchingInProgress.current = true;
                    setSelectedCandidates([]);
                    setMatchedCandidates([]);
                    // Don't change URL view - just show overlay
                    // updateUrlParams({ jdId: selectedJob, view: 'matching' });
                    // Trigger matching panel immediately
                    setShowMatchingPanel(true);
                  }
                }}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                New AI Match
              </button>
            </div>
          </div>

          {/* Job Info Card */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl text-gray-900 font-semibold">{selectedJobData?.title}</h1>
                <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {matchedCandidates.length} matches
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    Complete
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium border border-blue-200">
                    <Sparkles className="w-3 h-3" />
                    AI Talent Match • 0 units consumed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search candidates..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                />
              </div>
              <select
                value={filterThreshold}
                onChange={(e) => setFilterThreshold(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
              >
                <option value={0}>All Matches</option>
                <option value={50}>50%+ Match</option>
                <option value={70}>70%+ Match</option>
                <option value={85}>85%+ Match</option>
              </select>
              <div className="text-sm text-gray-700 bg-gray-100 px-3 py-2 rounded-lg font-medium border border-gray-200">
                {filteredCandidates.length} candidates
              </div>
              {selectedCandidates.length > 0 && (
                <div className="flex items-center gap-2">
                  {availableUnits !== null && selectedCandidates.length > availableUnits && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span className="text-xs text-amber-700 font-medium">
                        Insufficient units! You have {availableUnits} RS unit{availableUnits !== 1 ? 's' : ''} but selected {selectedCandidates.length}. Remove {selectedCandidates.length - availableUnits} resume{selectedCandidates.length - availableUnits > 1 ? 's' : ''}.
                      </span>
                    </div>
                  )}
                  <>
                  <button
                      onClick={handleSubmitToScoring}
                      disabled={availableUnits !== null && selectedCandidates.length > availableUnits}
                    className={`px-4 py-2 text-white rounded-lg transition-all font-medium text-sm flex items-center gap-2 ${
                      availableUnits !== null && selectedCandidates.length > availableUnits
                        ? 'bg-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-gray-800 hover:bg-gray-900'
                    }`}
                    >
                      <Target className="w-4 h-4" />
                      Score ({selectedCandidates.length})
                    </button>
                  {(hasPermission('canCreateAssessments') || isTenantAdmin) && (
                    <button
                      onClick={handleAssessment}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium text-sm flex items-center gap-2"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Assessment ({selectedCandidates.length})
                    </button>
                  )}
                </>
                </div>
              )}
            </div>
            {/* Additional Filters */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                placeholder="Filter by phone..."
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
              <input
                type="text"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                placeholder="Filter by location..."
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
              <input
                type="number"
                value={filterExperienceMin}
                onChange={(e) => setFilterExperienceMin(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Min exp (years)"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
              <input
                type="number"
                value={filterExperienceMax}
                onChange={(e) => setFilterExperienceMax(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Max exp (years)"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'rank' | 'name' | 'score' | 'experience')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
              >
                <option value="rank">Sort by Rating (High to Low)</option>
                <option value="name">Sort by Name (A to Z)</option>
                <option value="score">Sort by Score</option>
                <option value="experience">Sort by Experience</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scrollable Candidates List */}
        <div className="flex-1 overflow-y-auto p-6">
          {matchedCandidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <Sparkles className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No AI Match Results Yet</h3>
              <p className="text-gray-600 text-center max-w-md mb-6">
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
                className={`px-6 py-3 rounded-lg transition-all font-medium flex items-center gap-2 shadow-md ${
                  canRunAiMatch
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                }`}
                title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
              >
                <Sparkles className="w-5 h-5" />
                Run AI Talent Match
              </button>
            </div>
          ) : (
          <div className="flex-1 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
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
                      className="rounded border-gray-300 text-gray-800 focus:ring-gray-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                    Matched Rating
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                    Candidate Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                    Skills
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                    Experience
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                    Uploaded By
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                    Uploaded Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
                    Attachments
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedCandidates.map((candidate, index) => (
                  <tr
                    key={candidate.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      selectedCandidates.includes(candidate.id) ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedCandidates.includes(candidate.id)}
                        onChange={() => handleSelectCandidate(candidate.id)}
                        className="rounded border-gray-300 text-gray-800 focus:ring-gray-500"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-base ${
                        (candidate.rank || 0) >= 9 ? 'bg-green-100 text-green-700 border-2 border-green-300' :
                        (candidate.rank || 0) >= 7 ? 'bg-blue-100 text-blue-700 border-2 border-blue-300' :
                        (candidate.rank || 0) >= 5 ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300' :
                        'bg-gray-100 text-gray-600 border-2 border-gray-200'
                      }`}>
                        {candidate.rank || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700 font-medium">
                          {(candidate.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{candidate.name || 'Unknown'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {candidate.email ? candidate.email : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {candidate.phone ? candidate.phone : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {candidate.location ? candidate.location : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {candidate.skills && candidate.skills.slice(0, 4).map((skill, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200"
                          >
                            {skill}
                          </span>
                        ))}
                        {candidate.skills && candidate.skills.length > 4 && (
                          <span className="inline-flex items-center px-2.5 py-0.5 text-xs text-blue-600">
                            +{candidate.skills.length - 4} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{candidate.experience}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {formatUploadedBy(candidate.uploadedByName, candidate.uploadedBy)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {candidate.uploadDate ? new Date(candidate.uploadDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      }) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVersionsCandidate(candidate);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 text-gray-900 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 text-xs font-medium"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        {candidate.attachmentCount || 1}
                      </button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsAssessmentModalOpen(false);
            setSelectedAssessments([]);
            setAssessmentSearchQuery('');
          }
        }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-2xl font-bold text-gray-900">Select Active Assessments</h2>
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Select one or more assessments to send to {selectedCandidates.length} candidate{selectedCandidates.length !== 1 ? 's' : ''}
              </p>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={assessmentSearchQuery}
                  onChange={(e) => setAssessmentSearchQuery(e.target.value)}
                  placeholder="Search by Assessment ID, Name, JD ID, or JD Name..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
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
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-3"
                  >
                    {selectedAssessments.length === filteredAssessments.length && selectedAssessments.length > 0 ? 'Clear All' : 'Select All'}
                  </button>
                );
              })()}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
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
                  <div className="text-center py-12">
                    <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">{assessmentSearchQuery ? 'No assessments match your search' : 'No active assessments available'}</p>
                    <p className="text-sm text-gray-400 mt-1">{assessmentSearchQuery ? 'Try different search terms' : 'Create and publish an assessment first'}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAssessments.map((assessment) => {
                      const isSelected = selectedAssessments.some(a => a.id === assessment.id);
                      return (
                        <button
                          key={assessment.id}
                          onClick={() => handleAssessmentSelect(assessment)}
                          className={`w-full text-left border-2 rounded-lg p-4 transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Checkbox */}
                            <div className="flex-shrink-0 mt-1">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-blue-500 border-blue-500'
                                  : 'bg-white border-gray-300'
                              }`}>
                                {isSelected && (
                                  <CheckCircle className="w-4 h-4 text-white" />
                                )}
                              </div>
                            </div>

                            <div className="flex-1">
                              {/* Assessment ID, Title, and Active Badge */}
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                {assessment.short_id && (
                                  <span className="text-xs px-2 py-0.5 bg-gray-800 text-white rounded font-semibold">
                                    {assessment.short_id}
                                  </span>
                                )}
                                <h5 className="font-medium text-gray-900">{assessment.title}</h5>
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                  Active
                                </span>
                              </div>

                              {/* Linked JD Information */}
                              {assessment.jd_short_id && (
                                <div className="text-xs text-gray-600 mb-1.5">
                                  <span className="font-medium">Linked to: </span>
                                  <span className="text-gray-800">{assessment.jd_short_id}</span>
                                  {assessment.jd_title && (
                                    <span className="ml-1">- {assessment.jd_title}</span>
                                  )}
                                  {assessment.jd_version && (
                                    <span className="ml-1 text-gray-500">v{assessment.jd_version}</span>
                                  )}
                                </div>
                              )}

                              {/* Duration and Sections */}
                              <div className="flex items-center gap-3 text-sm text-gray-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {assessment.duration_minutes || 0} min
                                </span>
                              </div>

                              {/* Created By and Date */}
                              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1.5">
                                {assessment.created_by_name && (
                                  <>
                                    <span>Created by: <span className="text-gray-700 font-medium">{assessment.created_by_name}</span></span>
                                    <span>•</span>
                                  </>
                                )}
                                {assessment.created_at && (
                                  <span>
                                    {(() => {
                                      const dateWithZ = assessment.created_at + (assessment.created_at.includes('Z') ? '' : 'Z');
                                      const date = new Date(dateWithZ);
                                      return `${date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}`;
                                    })()}
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

            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                {selectedAssessments.length} assessment{selectedAssessments.length !== 1 ? 's' : ''} selected
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedToInvite}
                  disabled={selectedAssessments.length === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" />
                  Proceed to Send Invitations
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
            jd_short_id: selectedAssessments[0].jd_short_id,
            jd_title: selectedAssessments[0].jd_title,
            jd_version: selectedAssessments[0].jd_version,
          }}
          assessments={selectedAssessments.map(a => ({
            id: a.id,
            title: a.title,
            duration: `${a.duration_minutes || 0} min`,
            questions: (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: a.short_id,
            jd_short_id: a.jd_short_id,
            jd_title: a.jd_title,
            jd_version: a.jd_version
          }))}
          prefilledCandidates={prefilledCandidates}
        />
      )}

    </>
  );
}