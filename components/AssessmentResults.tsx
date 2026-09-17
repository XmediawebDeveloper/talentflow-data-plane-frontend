import { ArrowLeft, User, Clock, Award, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, TrendingUp, Calendar, Briefcase, AlertCircle, Info, Filter, Layers, Search, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Mail, Phone, BarChart3, SlidersHorizontal, Columns3, Trash2, Users, Download, X, Play, CheckSquare, Eye } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { assessmentService } from '@/lib/services';
import { formatISTDate, formatISTWithSeconds } from '@/lib/utils/dateUtils';
import VersionBadge from './VersionBadge';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import {
  calculateFinalResult,
  QuestionScore,
  FinalAssessmentResult,
  getScoringBreakdown
} from '@/lib/utils/assessmentScoring';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import RecordPager from '@/components/RecordPager';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';

interface AssessmentResultsProps {
  onBack: () => void;
  assessmentId: string;
  assessmentTitle: string;
  assessmentVersion?: number | null;
  jdTitle?: string;
  canDownloadPDF?: boolean;
  canBatchDownload?: boolean;
  prevId?: string | null;
  nextId?: string | null;
  currentIndex?: number;
  totalCount?: number;
}

/** The canonical "Go to [input] · Previous · page/total · Next" control from
 *  components/Pagination.tsx, reused inline since this table's pagination
 *  footer also carries a "First"/"Last" pair and page-size-driven export
 *  wiring that don't fit that component's props as-is. */
function InlinePageNav({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  const [goToPage, setGoToPage] = useState(String(page));
  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);

  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      onPageChange(target);
    } else {
      setGoToPage(String(page));
    }
  };

  const navBtnClass =
    "inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors";

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Go to</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={goToPage}
          onChange={(e) => setGoToPage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
              commitGoToPage();
            }
          }}
          onBlur={commitGoToPage}
          aria-label="Go to page"
          className="w-14 h-8 sm:h-9 px-2 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
        />
      </div>

      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className={navBtnClass}
        aria-label="Previous page" title="Previous page"
      >
        <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>

      <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
        <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
      </span>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className={navBtnClass}
        aria-label="Next page" title="Next page"
      >
        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
    </div>
  );
}

interface CandidateResult {
  id: string;
  invitation_id: string;  // For pending candidates without attempt
  candidateDisplayId?: string;  // Per-tenant candidate ID (CID-01, CID-02, ...)
  name: string;
  email: string;
  phone?: string;
  inviteSource?: string;
  avatar?: string;
  score: number;
  totalScore: number;
  percentage: number;
  tech_score?: number;  // Technical round score percentage
  coding_score?: number; // Coding round score percentage
  hr_score?: number; // HR round score percentage
  status: 'Completed' | 'In Progress' | 'Pending';
  scoring_status?: string;  // "pending", "processing", "completed", "error"
  completedDate: string;
  duration: string;
  sent_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  sections: SectionResult[];
  round: number; // Added round tracking
  roundName?: string; // Optional round name
}

interface AssessmentDetails {
  hr_enabled: boolean;
  technical_enabled: boolean;
  coding_enabled: boolean;
  hr_percentage?: number;
  technical_percentage?: number;
  coding_percentage?: number;
  passing_threshold?: number;
}

interface SectionResult {
  name: string;
  score: number;
  totalScore: number;
  percentage: number;
  questions: QuestionResult[];
}

interface QuestionResult {
  question: string;
  candidateAnswer: string;
  correctAnswer?: string;
  score: number;
  maxScore: number;
  feedback: string;
  type: 'multiple-choice' | 'text' | 'coding';
}

export default function AssessmentResults({ onBack, assessmentId, assessmentTitle, assessmentVersion, jdTitle, canDownloadPDF = false, canBatchDownload = false, prevId, nextId, currentIndex, totalCount }: AssessmentResultsProps) {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [candidateResults, setCandidateResults] = useState<CandidateResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const initialLoadDone = useRef(false);
  const [apiStats, setApiStats] = useState<{ completed_count: number; in_progress_count: number; pending_count: number; average_score: number | null }>({ completed_count: 0, in_progress_count: 0, pending_count: 0, average_score: null });
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // AS-25: PDF download state
  const [downloadingPDF, setDownloadingPDF] = useState<string | null>(null);

  // AS-26: Bulk PDF download state
  const [downloadingBulkPDF, setDownloadingBulkPDF] = useState(false);

  // AS-23: Search, Sort, and Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'score' | 'status' | 'date'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Completed' | 'In Progress' | 'Pending'>('all');
  // Two-step view: 'cards' shows only the 4 stat tiles; 'list' shows search,
  // filters, and the candidate table. Mirrors the Job Openings page pattern
  // — a fresh visit lands on cards; clicking a stat card drills into the list
  // with the matching status filter applied.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const openCandidateList = (filter: 'all' | 'Completed' | 'In Progress' | 'Pending') => {
    setStatusFilter(filter);
    setCurrentPage(1);
    setPageView('list');
  };

  // Assessment details (which rounds are enabled)
  const [assessmentDetails, setAssessmentDetails] = useState<AssessmentDetails | null>(null);

  // Round-based filtering with dropdown options (HR removed - only Tech and Coding)
  const [roundFilters, setRoundFilters] = useState<{
    technical?: 'all' | '50-70' | '70-90' | '90+';
    coding?: 'all' | '50-70' | '70-90' | '90+';
  }>({});

  // Pass/Fail filter
  const [passFailFilter, setPassFailFilter] = useState<'all' | 'pass' | 'fail'>('all');

  // Date range filter (submitted/completed date)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // AS-24: Column customization
  const COLUMN_PREFERENCES_KEY = 'assessment_results_columns_v2';
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Export format modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStep, setExportStep] = useState<'format' | 'scope'>('format');
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'excel'>('excel');
  // In-flight feedback so the recruiter sees a spinner while a large
  // server-side export streams down. Toast.loading is used to surface a
  // persistent indicator that gets dismissed with success/error.
  const [isExporting, setIsExporting] = useState(false);

  interface ColumnConfig {
    id: string;
    label: string;
    enabled: boolean;
  }

  // Dynamic columns based on assessment details
  const getDefaultColumns = (): ColumnConfig[] => {
    const baseColumns: ColumnConfig[] = [
      { id: 'cid', label: 'CID', enabled: true },
      { id: 'candidate', label: 'Candidate', enabled: true },
      { id: 'email', label: 'Email', enabled: true },
      { id: 'jdTitle', label: 'JD Title', enabled: true },
      { id: 'phone', label: 'Phone', enabled: true },
      { id: 'inviteSource', label: 'Invite Source', enabled: true },
    ];

    // Add score columns only if those rounds are enabled for this assessment
    if (assessmentDetails?.technical_enabled) {
      baseColumns.push({ id: 'techScore', label: 'Tech Score', enabled: true });
    }
    if (assessmentDetails?.coding_enabled) {
      baseColumns.push({ id: 'codingScore', label: 'Coding Score', enabled: true });
    }

    baseColumns.push(
      { id: 'status', label: 'Result Status', enabled: true },
      { id: 'timeline', label: 'Timeline', enabled: true },
      { id: 'completed', label: 'Completed', enabled: true },
      { id: 'duration', label: 'Duration', enabled: true }
    );

    return baseColumns;
  };

  const [columns, setColumns] = useState<ColumnConfig[]>([]);

  // Update columns when assessmentDetails changes
  useEffect(() => {
    const newDefaultColumns = getDefaultColumns();
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(COLUMN_PREFERENCES_KEY);
        if (saved) {
          const savedColumns = JSON.parse(saved) as ColumnConfig[];
          setColumns(newDefaultColumns.map(defaultCol => {
            const savedCol = savedColumns.find(sc => sc.id === defaultCol.id);
            return savedCol ? { ...defaultCol, enabled: savedCol.enabled } : defaultCol;
          }));
        } else {
          setColumns(newDefaultColumns);
        }
      } catch (error) {
        console.error('Failed to load column preferences:', error);
        setColumns(newDefaultColumns);
      }
    } else {
      setColumns(newDefaultColumns);
    }
  }, [assessmentDetails]);

  // AS-24: Save column preferences to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(COLUMN_PREFERENCES_KEY, JSON.stringify(columns));
    } catch (error) {
      console.error('Failed to save column preferences:', error);
    }
  }, [columns]);

  const handleToggleColumn = (columnId: string) => {
    setColumns(columns.map(col =>
      col.id === columnId ? { ...col, enabled: !col.enabled } : col
    ));
  };

  const isColumnEnabled = (columnId: string) => {
    return columns.find(c => c.id === columnId)?.enabled ?? true;
  };

  const enabledColumnsCount = columns.filter(c => c.enabled).length;

  // Check if columns are customized (different from default)
  const areColumnsCustomized = () => {
    if (columns.length === 0) return false;
    // Check if any column is disabled
    return columns.some(col => !col.enabled);
  };

  // Fetch assessment details to determine enabled rounds
  useEffect(() => {
    const fetchAssessmentDetails = async () => {
      try {
        const details = await assessmentService.get(assessmentId);
        setAssessmentDetails({
          hr_enabled: details.hr_enabled || false,
          technical_enabled: details.technical_enabled || false,
          coding_enabled: details.coding_enabled || false,
          hr_percentage: details.hr_percentage,
          technical_percentage: details.technical_percentage,
          coding_percentage: details.coding_percentage,
          passing_threshold: (details as any).passing_threshold ?? 70,
        });
      } catch (error) {
        console.error('Failed to fetch assessment details:', error);
      }
    };
    fetchAssessmentDetails();
  }, [assessmentId]);

  // Track total items from server (for pagination)
  const [totalItems, setTotalItems] = useState(0);

  // Persist the list's view state + scroll so returning from a candidate's
  // details lands the recruiter exactly where they left off. Keyed per
  // assessment so different assessments keep independent filters/scroll.
  const persistKey = `assessment-results:${assessmentId}`;
  const rootRef = useScrollRestoration<HTMLDivElement>(persistKey, !isLoading, [pageView]);
  useListStatePersistence(
    persistKey,
    { pageView, statusFilter, searchQuery, sortField, sortDirection, currentPage, passFailFilter, dateFrom, dateTo, roundFilters },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (typeof s.statusFilter === 'string') setStatusFilter(s.statusFilter as typeof statusFilter);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.sortField === 'string') setSortField(s.sortField as typeof sortField);
      if (s.sortDirection === 'asc' || s.sortDirection === 'desc') setSortDirection(s.sortDirection);
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
      if (typeof s.passFailFilter === 'string') setPassFailFilter(s.passFailFilter as typeof passFailFilter);
      if (typeof s.dateFrom === 'string') setDateFrom(s.dateFrom);
      if (typeof s.dateTo === 'string') setDateTo(s.dateTo);
      if (s.roundFilters && typeof s.roundFilters === 'object') setRoundFilters(s.roundFilters as typeof roundFilters);
    },
  );

  // Fetch results from API with server-side pagination and filters
  useEffect(() => {
    const fetchResults = async () => {
      if (!initialLoadDone.current) {
        setIsLoading(true);
      } else {
        setIsFetching(true);
      }
      try {
        // Build server-side filter parameters
        const params: any = {
          page: currentPage,
          page_size: pageSize,
        };

        // Add server-supported filters
        if (searchQuery.trim()) {
          params.search = searchQuery.trim();
        }

        if (statusFilter !== 'all') {
          params.status_filter = statusFilter.toLowerCase().replace(' ', '_');
        }

        // Pass/Fail filter (convert to score filter)
        if (passFailFilter === 'pass') {
          params.passed = true;
        } else if (passFailFilter === 'fail') {
          params.passed = false;
        }

        // Date range filter — append time so FastAPI parses as valid datetime
        if (dateFrom) params.date_from = `${dateFrom}T00:00:00`;
        if (dateTo) params.date_to = `${dateTo}T23:59:59`;

        const response = await assessmentService.listResults(assessmentId, params);
        if (response?.items) {
          // Map API response to component format
          const mapped: CandidateResult[] = response.items.map((item: any, index: number) => {
            // Determine status: attempt status + scoring status
            const scoringStatus: string = item.scoring_status || 'pending';
            let status: 'Completed' | 'In Progress' | 'Pending' = 'Completed';
            if (item.status === 'pending') {
              status = 'Pending';
            } else if (item.status === 'in_progress') {
              status = 'In Progress';
            } else if (item.status === 'completed') {
              // Attempt done — but only show Completed once AI scoring is also done
              status = scoringStatus === 'completed' ? 'Completed' : 'In Progress';
            }

            // Hide scores while AI scoring is still running.
            // Round at the data source so every render site (table cells,
            // mobile card view, hover popovers, exports) shows the same
            // whole-number percentage. Recruiters were seeing 69.23% on the
            // Results page and 69% in the Track Invites popup; rounding here
            // keeps it consistent everywhere.
            const scoringDone = scoringStatus === 'completed';
            const tech_score = scoringDone && item.technical_score != null ? Math.round(Number(item.technical_score)) : undefined;
            const coding_score = scoringDone && item.coding_score != null ? Math.round(Number(item.coding_score)) : undefined;
            const hr_score = scoringDone && item.hr_score != null ? Math.round(Number(item.hr_score)) : undefined;

            // Format duration properly
            let duration = '-';
            if (item.time_spent_seconds && item.time_spent_seconds > 0) {
              const minutes = Math.floor(item.time_spent_seconds / 60);
              const seconds = item.time_spent_seconds % 60;
              if (minutes > 0) {
                duration = `${minutes}m ${seconds}s`;
              } else {
                duration = `${seconds}s`;
              }
            } else if (status === 'Pending') {
              duration = '-';
            } else if (status === 'In Progress') {
              duration = 'In Progress';
            }

            return {
              id: item.id || item.invitation_id,  // Use invitation_id for pending
              invitation_id: item.invitation_id,
              candidateDisplayId: item.candidate_display_id,
              name: item.candidate_name || 'Unknown',
              email: item.candidate_email || '',
              phone: item.candidate_phone || '',
              inviteSource: item.invite_source || 'Manual',
              score: scoringDone ? Number(item.overall_score) || 0 : 0,
              totalScore: 100,
              percentage: scoringDone ? Number(item.overall_score) || 0 : 0,
              tech_score,
              coding_score,
              hr_score,
              status,
              scoring_status: scoringStatus,
              sent_at: item.sent_at || undefined,
              started_at: item.started_at || undefined,
              completed_at: item.completed_at || undefined,
              created_at: item.created_at || undefined,
              completedDate: (() => {
                const dateStr = item.completed_at || item.started_at;
                if (!dateStr) return status === 'Pending' ? 'Not started' : 'N/A';
                return formatISTDate(dateStr);
              })(),
              duration,
              sections: [
                assessmentDetails?.technical_enabled && tech_score != null && {
                  name: 'Technical Section',
                  score: tech_score,
                  totalScore: 100,
                  percentage: tech_score,
                  questions: []
                },
                assessmentDetails?.coding_enabled && coding_score != null && {
                  name: 'Coding Section',
                  score: coding_score,
                  totalScore: 100,
                  percentage: coding_score,
                  questions: []
                }
              ].filter(Boolean) as SectionResult[],
              round: 1,
              roundName: 'Round 1'
            };
          });
          setCandidateResults(mapped);

          // Set total from server for pagination
          setTotalItems(response.total || mapped.length);

          // Set stats from mapped data so "processing" attempts show as In Progress
          setApiStats({
            completed_count: mapped.filter((c: CandidateResult) => c.status === 'Completed').length,
            in_progress_count: mapped.filter((c: CandidateResult) => c.status === 'In Progress').length,
            pending_count: mapped.filter((c: CandidateResult) => c.status === 'Pending').length,
            average_score: response.average_score ? Math.round(Number(response.average_score)) : null
          });
        }
      } catch (error) {
        console.error('Failed to fetch assessment results:', error);
        // Keep empty results on error
        setCandidateResults([]);
        setTotalItems(0);
      } finally {
        setIsLoading(false);
        setIsFetching(false);
        initialLoadDone.current = true;
      }
    };

    fetchResults();
  }, [assessmentId, currentPage, pageSize, searchQuery, statusFilter, passFailFilter, dateFrom, dateTo]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20';
      case 'Completed': return 'bg-green-100 text-green-700 ring-1 ring-green-200';
      case 'In Progress': return 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20';
      default: return 'bg-gray-100 text-gray-700 ring-1 ring-gray-200';
    }
  };

  const getInviteSourceMeta = (src?: string) => {
    const value = src || 'Manual';
    const styleMap: Record<string, string> = {
      'JD': 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
      'Assessment': 'bg-brand-blue/10 text-brand-blue-2 ring-1 ring-brand-blue/20',
      'Resume Scoring': 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
      'My Resumes': 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
      'Internal DB': 'bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20',
      'Manual': 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
    };
    const labelMap: Record<string, string> = {
      'JD': 'Job',
      'Assessment': 'Assessment',
      'Resume Scoring': 'Resume Scoring',
      'My Resumes': 'My Resumes',
      'Internal DB': 'Internal DB',
      'Manual': 'Manual',
    };
    return {
      cls: styleMap[value] || 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
      label: labelMap[value] || value,
    };
  };

  const formatTimelineDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    // Timeline shows precise event times (incl. seconds) for assessment timing.
    return formatISTWithSeconds(dateStr);
  };

  const getTimelineSummary = (candidate: CandidateResult) => {
    const entries: string[] = [];
    if (candidate.sent_at) entries.push(`Sent: ${formatTimelineDate(candidate.sent_at)}`);
    if (candidate.started_at) entries.push(`Started: ${formatTimelineDate(candidate.started_at)}`);
    if (candidate.completed_at) entries.push(`Completed: ${formatTimelineDate(candidate.completed_at)}`);
    if (entries.length === 0) {
      entries.push(candidate.created_at ? `Created: ${formatTimelineDate(candidate.created_at)}` : '-');
    }
    return entries.join(' | ');
  };

  const canDownloadResultPdf = (candidate: CandidateResult): boolean => {
    return candidate.status === 'Completed' && candidate.scoring_status === 'completed';
  };

  // Handle delete result
  const handleDeleteResult = async (resultId: string, candidateName: string) => {
    if (!await dialog.confirm({
      title: 'Delete Result',
      message: 'Are you sure you want to delete this result?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Result',
      item: { label: 'CANDIDATE RESULT', name: candidateName },
      warningNote: 'Deleting this result will permanently remove it and cannot be restored.',
    })) {
      return;
    }
    setIsDeleting(resultId);
    try {
      const deletedCandidate = candidateResults.find(c => c.id === resultId);
      await assessmentService.deleteResult(assessmentId, resultId);
      // Remove from local state
      setCandidateResults(prev => prev.filter(c => c.id !== resultId));
      // Update stats
      if (deletedCandidate) {
        setApiStats(prev => ({
          ...prev,
          completed_count: Math.max(0, prev.completed_count - (deletedCandidate.status === 'Completed' ? 1 : 0)),
          in_progress_count: Math.max(0, prev.in_progress_count - (deletedCandidate.status === 'In Progress' ? 1 : 0)),
          pending_count: Math.max(0, prev.pending_count - (deletedCandidate.status === 'Pending' ? 1 : 0)),
        }));
      }
      toast.success(`Result for ${candidateName} deleted successfully.`);
    } catch (error: any) {
      console.error('Failed to delete result:', error);
      const msg = error?.message || 'Failed to delete result. Please try again.';
      toast.error(msg);
    } finally {
      setIsDeleting(null);
    }
  };

  // Handle row selection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(candidateResults.map(c => c.id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRows(prev => [...prev, id]);
    } else {
      setSelectedRows(prev => prev.filter(rowId => rowId !== id));
    }
  };

  // AS-25: Handle PDF download for individual candidate result
  const handleDownloadPDF = async (candidateId: string, candidateDisplayId?: string) => {
    if (downloadingPDF) return;

    const candidate = candidateResults.find(c => c.id === candidateId);
    if (!candidate || !canDownloadResultPdf(candidate)) {
      toast.error('PDF is available only after scoring is completed.');
      return;
    }

    setDownloadingPDF(candidateId);
    try {
      const blob = await assessmentService.exportPDF(assessmentId, candidateId);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeIdentifier = candidateDisplayId?.replace(/[^a-zA-Z0-9]/g, '_') || `CID_${candidateId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const safeJdTitle = jdTitle?.replace(/[^a-zA-Z0-9]/g, '_') || 'Assessment';
      const pdfTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `${safeIdentifier}_${safeJdTitle}_${pdfTimestamp}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error('Failed to download PDF report. Please try again.');
    } finally {
      setDownloadingPDF(null);
    }
  };

  // AS-26: Handle bulk PDF download as ZIP
  const handleDownloadBulkPDFs = async () => {
    if (downloadingBulkPDF || selectedRows.length === 0) return;

    const eligibleCandidates = candidateResults.filter(c => selectedRows.includes(c.id) && canDownloadResultPdf(c));
    if (eligibleCandidates.length === 0) {
      toast.error('Select at least one fully scored result to download PDFs.');
      return;
    }

    if (eligibleCandidates.length !== selectedRows.length) {
      toast.info(`${selectedRows.length - eligibleCandidates.length} result(s) were skipped because scoring is not completed yet.`);
    }

    setDownloadingBulkPDF(true);
    try {
      const blob = await assessmentService.exportResultsBulkPDFs(assessmentId, eligibleCandidates.map(c => c.id));

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeJd = jdTitle?.replace(/[^a-zA-Z0-9]/g, '_') || assessmentTitle.replace(/\s+/g, '_');
      link.download = `${safeJd}_Reports_${timestamp}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download bulk PDFs:', error);
      toast.error('Failed to download PDF reports. Please try again.');
    } finally {
      setDownloadingBulkPDF(false);
    }
  };

  // Handle format selection - move to scope selection
  const handleFormatSelect = (format: 'csv' | 'excel') => {
    setSelectedFormat(format);
    setExportStep('scope');
  };

  // Export current page only
  const handleExportCurrentPage = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const _toastId = toast.loading('Preparing export… this may take a moment for large datasets.');
    try {
      const enabledColumnIds = columns
        .filter(col => col.enabled)
        .map(col => col.id);

      console.log('[EXPORT] Exporting current page with columns:', enabledColumnIds);

      // Get current page candidates
      const currentPageCandidates = paginatedCandidates;

      // Build filters object (same as all filtered)
      const filters: any = {};
      if (searchQuery.trim()) filters.search = searchQuery.trim();
      if (statusFilter !== 'all') filters.status_filter = statusFilter.toLowerCase().replace(' ', '_');
      if (passFailFilter === 'pass') filters.passed = true;
      else if (passFailFilter === 'fail') filters.passed = false;

      // Build sorting object
      const sorting = {
        sort_by: sortField,
        sort_order: sortDirection,
      };

      const blob = await assessmentService.exportResults(
        assessmentId,
        selectedFormat,
        false,
        enabledColumnIds,
        filters,
        sorting
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const extension = selectedFormat === 'csv' ? 'csv' : 'xlsx';
      link.download = `${assessmentTitle.replace(/\s+/g, '_')}_CurrentPage_${new Date().toISOString().slice(0, 10)}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      const formatName = selectedFormat === 'csv' ? 'CSV' : 'Excel';
      toast.success(`Current page exported to ${formatName} successfully! (${currentPageCandidates.length} results)`, { id: _toastId });
      setShowExportModal(false);
      setExportStep('format');
    } catch (error) {
      console.error('Failed to export current page:', error);
      toast.error('Failed to export results. Please try again.', { id: _toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // Export all filtered results
  const handleExportAllFiltered = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const _toastId = toast.loading('Preparing export of all filtered results…');
    try {
      const enabledColumnIds = columns
        .filter(col => col.enabled)
        .map(col => col.id);

      console.log('[EXPORT] Exporting all filtered results with columns:', enabledColumnIds);

      // Build filters object
      const filters: any = {};
      if (searchQuery.trim()) filters.search = searchQuery.trim();
      if (statusFilter !== 'all') filters.status_filter = statusFilter.toLowerCase().replace(' ', '_');
      if (passFailFilter === 'pass') filters.passed = true;
      else if (passFailFilter === 'fail') filters.passed = false;

      // Build sorting object
      const sorting = {
        sort_by: sortField,
        sort_order: sortDirection,
      };

      console.log('[EXPORT] Filters:', filters);
      console.log('[EXPORT] Sorting:', sorting);

      const blob = await assessmentService.exportResults(
        assessmentId,
        selectedFormat,
        false,
        enabledColumnIds,
        filters,
        sorting
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const extension = selectedFormat === 'csv' ? 'csv' : 'xlsx';
      link.download = `${assessmentTitle.replace(/\s+/g, '_')}_AllResults_${new Date().toISOString().slice(0, 10)}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      const formatName = selectedFormat === 'csv' ? 'CSV' : 'Excel';
      toast.success(`All filtered results exported to ${formatName} successfully! (${filteredCandidates.length} results including in-progress)`, { id: _toastId });
      setShowExportModal(false);
      setExportStep('format');
    } catch (error) {
      console.error('Failed to export all results:', error);
      toast.error('Failed to export results. Please try again.', { id: _toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // Export only the selected candidates
  const handleExportSelected = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const _toastId = toast.loading('Preparing export of selected results…');
    try {
      const enabledColumnIds = columns
        .filter(col => col.enabled)
        .map(col => col.id);

      const filters: any = {
        result_ids: selectedRows,
      };

      const sorting = {
        sort_by: sortField,
        sort_order: sortDirection,
      };

      const blob = await assessmentService.exportResults(
        assessmentId,
        selectedFormat,
        false,
        enabledColumnIds,
        filters,
        sorting
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const extension = selectedFormat === 'csv' ? 'csv' : 'xlsx';
      link.download = `${assessmentTitle.replace(/\s+/g, '_')}_Selected_${new Date().toISOString().slice(0, 10)}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      const formatName = selectedFormat === 'csv' ? 'CSV' : 'Excel';
      toast.success(`${selectedRows.length} selected candidate${selectedRows.length > 1 ? 's' : ''} exported to ${formatName} successfully!`, { id: _toastId });
      setShowExportModal(false);
      setExportStep('format');
    } catch (error) {
      console.error('Failed to export selected candidates:', error);
      toast.error('Failed to export results. Please try again.', { id: _toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-brand-blue';
    if (percentage >= 40) return 'text-brand-orange-deep';
    return 'text-red-600';
  };

  const passingThreshold = assessmentDetails?.passing_threshold ?? 70;

  const getMobileOverallScore = (candidate: CandidateResult) => {
    if (candidate.status !== 'Completed' || candidate.scoring_status !== 'completed') return null;
    return candidate.percentage;
  };

  const getMobilePassFail = (candidate: CandidateResult) => {
    const overallScore = getMobileOverallScore(candidate);
    if (overallScore === null) return null;
    const passingThreshold = assessmentDetails?.passing_threshold ?? 70;
    return overallScore >= passingThreshold ? 'Pass' : 'Fail';
  };

  // Reset to page 1 when filters change (MUST be before any early returns)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, passFailFilter, roundFilters, dateFrom, dateTo]);

  // Use API results only (no mock data)
  const displayResults = candidateResults;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-brand-blue animate-spin mx-auto mb-3 sm:mb-4" />
          <p className="text-sm sm:text-base text-gray-600">Loading assessment results...</p>
        </div>
      </div>
    );
  }

  // AS-23: Handle sort toggle
  const handleSort = (field: 'name' | 'score' | 'status' | 'date') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    // Note: Page reset handled by filter change effect above
  };

  // Server has already applied: search, status filter, pass/fail filter
  // Only apply client-side filters that server doesn't support (round-based percentage ranges)
  let filteredCandidates = displayResults;

  // Round-based filtering with percentage ranges (CLIENT-SIDE ONLY)
  if (Object.keys(roundFilters).length > 0) {
    filteredCandidates = filteredCandidates.filter(candidate => {
      // Check if candidate meets ALL specified round filters (HR removed - only Tech and Coding)
      let meetsAllFilters = true;

      // Check Technical round filter
      if (roundFilters.technical !== undefined && roundFilters.technical !== 'all') {
        const techScore = candidate.tech_score;
        if (techScore === undefined) {
          meetsAllFilters = false;
        } else {
          const range = roundFilters.technical;
          if (range === '50-70' && !(techScore > 50 && techScore < 70)) {
            meetsAllFilters = false;
          } else if (range === '70-90' && !(techScore >= 70 && techScore < 90)) {
            meetsAllFilters = false;
          } else if (range === '90+' && techScore < 90) {
            meetsAllFilters = false;
          }
        }
      }

      // Check Coding round filter
      if (roundFilters.coding !== undefined && roundFilters.coding !== 'all') {
        const codingScore = candidate.coding_score;
        if (codingScore === undefined) {
          meetsAllFilters = false;
        } else {
          const range = roundFilters.coding;
          if (range === '50-70' && !(codingScore > 50 && codingScore < 70)) {
            meetsAllFilters = false;
          } else if (range === '70-90' && !(codingScore >= 70 && codingScore < 90)) {
            meetsAllFilters = false;
          } else if (range === '90+' && codingScore < 90) {
            meetsAllFilters = false;
          }
        }
      }

      return meetsAllFilters;
    });
  }

  // Client-side sort (applied to current page only)
  filteredCandidates = [...filteredCandidates].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'score':
        comparison = a.percentage - b.percentage;
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
      case 'date':
        comparison = new Date(a.completedDate).getTime() - new Date(b.completedDate).getTime();
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Use server-paginated results directly (no client-side slice needed)
  const paginatedCandidates = filteredCandidates;

  // Open a candidate's result details. Stores the visible (non-Pending) order
  // first so the details view can offer Prev/Next between candidates. Used by
  // the row/card click AND the View Details button.
  const viewCandidateDetails = (candidate: CandidateResult) => {
    // A Pending candidate was invited but never started, so no attempt record
    // exists and `candidate.id` is the invitation id (see the mapping above).
    // Passing that to the details route asks the API for a result that isn't
    // there, which came back as a bare "Result not found" console error.
    if (candidate.status === 'Pending') {
      toast.info('This candidate has not started the assessment yet');
      return;
    }
    try {
      sessionStorage.setItem('assessmentResultNavList', JSON.stringify(
        paginatedCandidates
          .filter(c => c.status !== 'Pending')
          .map(c => ({ id: c.id, cid: c.candidateDisplayId || '' }))
      ));
    } catch { /* ignore quota errors */ }
    router.push(`/recruitment/assessments/${assessmentId}/results/details?candidate_id=${candidate.id}${candidate.candidateDisplayId ? `&cid=${encodeURIComponent(candidate.candidateDisplayId)}` : ''}`);
  };

  // Calculate pagination from server total
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  // Use API stats if available, otherwise calculate from data
  const completedCount = candidateResults.length > 0 ? apiStats.completed_count : filteredCandidates.filter(c => c.status === 'Completed').length;
  const inProgressCount = candidateResults.length > 0 ? apiStats.in_progress_count : filteredCandidates.filter(c => c.status === 'In Progress').length;
  const pendingCount = candidateResults.length > 0 ? apiStats.pending_count : filteredCandidates.filter(c => c.status === 'Pending').length;
  const stickyHeaderClass = 'bg-slate-50';

  return (
    <div ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Previous / Next assessment navigation rides inside the breadcrumb
              bar, as on job-details, so users can step through assessments
              without going back to the list — and without it scrolling away
              from the pinned crumb. */}
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Assessments', href: '/recruitment/assessments' },
              // Name the assessment these results belong to, not just "Results".
              ...(assessmentTitle ? [{ label: assessmentTitle }] : [{ label: 'Results' }]),
            ]}
            actions={
              <RecordPager
                currentIndex={currentIndex}
                totalCount={totalCount}
                onPrev={prevId ? () => router.push(`/recruitment/assessments/${prevId}/results`) : undefined}
                onNext={nextId ? () => router.push(`/recruitment/assessments/${nextId}/results`) : undefined}
              />
            }
          />
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 sm:mb-2 flex-wrap">
                <h1 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 truncate tracking-tight">{assessmentTitle}</h1>
                {assessmentVersion != null && (
                  <VersionBadge version={assessmentVersion} size="sm" variant="primary" />
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-600">
                Assessment Results - {totalItems} total candidates
                {selectedRows.length > 0 && (
                  <span className="ml-2 text-brand-blue font-medium">
                    • {selectedRows.length} selected
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* AS-26: Bulk PDF Download Button — only for users with download_pdf permission */}
              {canBatchDownload && selectedRows.length > 0 && (
                <button
                  onClick={handleDownloadBulkPDFs}
                  disabled={downloadingBulkPDF}
                  className="px-3 sm:px-6 py-2 sm:py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {downloadingBulkPDF ? (
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                  <span className="hidden sm:inline">{downloadingBulkPDF ? 'Downloading...' : `Download PDFs (${selectedRows.length})`}</span>
                  <span className="sm:hidden">{downloadingBulkPDF ? '...' : `PDFs (${selectedRows.length})`}</span>
                </button>
              )}
              <button
                onClick={() => setShowExportModal(true)}
                className="px-3 sm:px-6 py-2 sm:py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
              >
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Export Results</span>
                <span className="sm:hidden">Export</span>
              </button>

            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <button
            type="button"
            onClick={() => openCandidateList('all')}
            className="text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-xs sm:text-sm mb-1">Total Candidates</div>
                <div className="text-xl sm:text-2xl text-gray-900 tracking-tight">{displayResults.length}</div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openCandidateList('Completed')}
            className="text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 hover:border-green-300 hover:shadow-md hover:shadow-green-500/10 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-xs sm:text-sm mb-1">Completed</div>
                <div className="text-xl sm:text-2xl text-green-600 tracking-tight">{completedCount}</div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-100 to-green-50 ring-1 ring-green-200 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openCandidateList('In Progress')}
            className="text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 hover:border-brand-cyan/40 hover:shadow-md hover:shadow-brand-cyan/10 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-xs sm:text-sm mb-1">In Progress</div>
                <div className="text-xl sm:text-2xl text-brand-cyan tracking-tight">{inProgressCount}</div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex items-center justify-center">
                <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-brand-cyan" />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openCandidateList('Pending')}
            className="text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 hover:border-brand-orange/40 hover:shadow-md hover:shadow-brand-orange/10 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-xs sm:text-sm mb-1">Pending</div>
                <div className="text-xl sm:text-2xl text-brand-orange-deep tracking-tight">{pendingCount}</div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-orange/10 to-brand-orange/5 ring-1 ring-brand-orange/20 flex items-center justify-center">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange-deep" />
              </div>
            </div>
          </button>
        </div>

        {pageView === 'list' && (
        <>
        {/* justify-end, not justify-between: the Back to overview button that
            used to hold the left slot is gone, and the tally belongs on the
            right. */}
        <div className="mb-3 sm:mb-4 flex items-center justify-end gap-2">
          <span className="text-xs text-gray-500">
            {totalItems} {totalItems === 1 ? 'candidate' : 'candidates'}
          </span>
        </div>

        {/* AS-23: Search and Filter Bar */}
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-3 sm:mb-4 space-y-3 sm:space-y-4">
          {/* Search Input - full width row */}
          <div className="relative">
            <label htmlFor="assessment-results-search" className="sr-only">
              Search candidate results
            </label>
            <Search className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="assessment-results-search"
              type="text"
              placeholder="Search by name, email, phone, or JD title..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 sm:pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm sm:text-base text-black"
            />
          </div>

          {/* Filters Row - wraps when needed, aligned baseline */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Status Filter */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <label htmlFor="assessment-results-status-filter" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Status:</label>
                <select
                  id="assessment-results-status-filter"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as 'all' | 'Completed' | 'In Progress' | 'Pending');
                    setCurrentPage(1);
                  }}
                  className="min-w-0 flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black"
                >
                  <option value="all">All</option>
                  <option value="Completed">Completed</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>

              {/* Pass/Fail Filter */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <label htmlFor="assessment-results-pass-fail-filter" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Result:</label>
                <select
                  id="assessment-results-pass-fail-filter"
                  value={passFailFilter}
                  onChange={(e) => {
                    setPassFailFilter(e.target.value as 'all' | 'pass' | 'fail');
                    setCurrentPage(1);
                  }}
                  className="min-w-0 flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black"
                >
                  <option value="all">All</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                </select>
              </div>

              {/* Round-based Filters */}
              {assessmentDetails?.technical_enabled && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <label htmlFor="assessment-results-tech-filter" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Tech:</label>
                  <select
                    id="assessment-results-tech-filter"
                    value={roundFilters.technical || 'all'}
                    onChange={(e) => {
                      const value = e.target.value as 'all' | '50-70' | '70-90' | '90+';
                      setRoundFilters(prev => value === 'all' ? { ...prev, technical: undefined } : { ...prev, technical: value });
                      setCurrentPage(1);
                    }}
                    className="min-w-0 flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black"
                  >
                    <option value="all">All</option>
                    <option value="50-70">50-70%</option>
                    <option value="70-90">70-90%</option>
                    <option value="90+">90%+</option>
                  </select>
                </div>
              )}

              {assessmentDetails?.coding_enabled && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <label htmlFor="assessment-results-coding-filter" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Coding:</label>
                  <select
                    id="assessment-results-coding-filter"
                    value={roundFilters.coding || 'all'}
                    onChange={(e) => {
                      const value = e.target.value as 'all' | '50-70' | '70-90' | '90+';
                      setRoundFilters(prev => value === 'all' ? { ...prev, coding: undefined } : { ...prev, coding: value });
                      setCurrentPage(1);
                    }}
                    className="min-w-0 flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black"
                  >
                    <option value="all">All</option>
                    <option value="50-70">50-70%</option>
                    <option value="70-90">70-90%</option>
                    <option value="90+">90%+</option>
                  </select>
                </div>
              )}

              {/* Date Range Filter - full width on mobile */}
              <div className="col-span-2 flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                <label htmlFor="assessment-results-date-from" className="sr-only">Filter from date</label>
                <input
                  id="assessment-results-date-from"
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                  className="min-w-0 flex-1 px-1.5 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black"
                  title="From date"
                  aria-label="Filter from date"
                />
                <span className="text-xs text-gray-400">–</span>
                <label htmlFor="assessment-results-date-to" className="sr-only">Filter to date</label>
                <input
                  id="assessment-results-date-to"
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                  className="min-w-0 flex-1 px-1.5 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black"
                  title="To date"
                  aria-label="Filter to date"
                />
              </div>

              {/* Clear Filters & Columns - full width on mobile */}
              <div className="col-span-2 sm:col-span-1 flex items-center gap-2 sm:gap-3">
                {/* Clear Filters Button */}
                {(Object.keys(roundFilters).length > 0 || searchQuery || statusFilter !== 'all' || passFailFilter !== 'all' || dateFrom || dateTo) && (
                  <button
                    onClick={() => {
                      setRoundFilters({});
                      setSearchQuery('');
                      setStatusFilter('all');
                      setPassFailFilter('all');
                      setDateFrom('');
                      setDateTo('');
                      setCurrentPage(1);
                    }}
                    className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-xs sm:text-sm"
                  >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Clear
                  </button>
                )}

              {/* AS-24: Customize Columns Button */}
              <div className="relative">
                <button
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  aria-expanded={showColumnSelector}
                  aria-haspopup="dialog"
                  aria-controls="assessment-results-column-selector"
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-xs sm:text-sm"
                >
                  <Columns3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Columns ({enabledColumnsCount})</span>
                  <span className="sm:hidden">{enabledColumnsCount}</span>
                </button>

                {showColumnSelector && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowColumnSelector(false)}
                    ></div>
                    <div
                      id="assessment-results-column-selector"
                      role="dialog"
                      aria-label="Select visible result columns"
                      className="absolute right-0 top-full mt-2 w-56 sm:w-64 bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-2 z-20 max-h-80 sm:max-h-96 overflow-y-auto"
                    >
                      <div className="px-3 sm:px-4 py-2 border-b border-gray-100">
                        <div className="text-xs sm:text-sm font-medium text-gray-900">Select Columns</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {enabledColumnsCount} of {columns.length} selected
                        </div>
                      </div>
                      {columns.map((column) => (
                        <label
                          key={column.id}
                          className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={column.enabled}
                            onChange={() => handleToggleColumn(column.id)}
                            className="w-4 h-4 text-brand-blue rounded border-gray-300 focus:ring-brand-blue/40"
                          />
                          <span className="text-xs sm:text-sm text-gray-700">{column.label}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Candidates Results Table */}
        <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Candidate Results</h2>
              {isFetching && (
                <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />
              )}
            </div>
            <div className="text-xs sm:text-sm text-gray-500">
              {selectedRows.length > 0 && `${selectedRows.length} selected`}
            </div>
          </div>
          <div className="xl:hidden divide-y divide-gray-100">
            {paginatedCandidates.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="flex flex-col items-center">
                  <Users className="w-12 h-12 text-gray-300 mb-3" />
                  {searchQuery || Object.keys(roundFilters).length > 0 || statusFilter !== 'all' || passFailFilter !== 'all' ? (
                    <>
                      <p className="text-gray-600 mb-1">No candidates match your search criteria</p>
                      <p className="text-sm text-gray-500">Try adjusting your filters or search query</p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-600 mb-1">No candidates have completed this assessment yet</p>
                      <p className="text-sm text-gray-500">Share the assessment link to invite candidates</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              paginatedCandidates.map((candidate) => {
                const inviteMeta = getInviteSourceMeta(candidate.inviteSource);
                const overallScore = getMobileOverallScore(candidate);
                const passFail = getMobilePassFail(candidate);
                return (
                  <div
                    key={candidate.id}
                    onClick={() => viewCandidateDetails(candidate)}
                    className="p-4 space-y-3 cursor-pointer hover:bg-brand-blue/5 transition-colors"
                    role="article"
                    aria-label={`Candidate result for ${candidate.name || 'Unknown'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(candidate.id)}
                        onChange={(e) => handleSelectRow(candidate.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-9 h-9 rounded-full bg-brand-blue ring-1 ring-white/10 shadow-sm shadow-brand-blue/25 flex items-center justify-center text-white text-xs shrink-0">
                                {(candidate.name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{candidate.name || 'Unknown'}</div>
                                <div className="text-xs text-gray-500 truncate">{candidate.email || '-'}</div>
                              </div>
                            </div>
                          </div>
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs shrink-0 ${getStatusColor(candidate.status)}`}>
                            {candidate.status}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-gray-50 p-2 col-span-2">
                            <div className="text-gray-500">JD</div>
                            <div className="text-gray-800 truncate">{jdTitle || 'N/A'}</div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">Score</div>
                            <div className={overallScore !== null ? `font-semibold ${getScoreColor(overallScore)}` : 'text-gray-400'}>
                              {overallScore !== null ? `${overallScore}%` : '-'}
                            </div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">Pass / Fail</div>
                            {passFail ? (
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium mt-1 ${passFail === 'Pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {passFail}
                              </span>
                            ) : (
                              <div className="text-gray-400">-</div>
                            )}
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">Date</div>
                            <div className="text-gray-700">{candidate.completedDate}</div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">CID</div>
                            <div className="font-mono text-brand-blue">{candidate.candidateDisplayId || '-'}</div>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">Invite Source</div>
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium mt-1 ${inviteMeta.cls}`}>
                              {inviteMeta.label}
                            </span>
                          </div>
                          <div className="rounded-lg bg-gray-50 p-2">
                            <div className="text-gray-500">Duration</div>
                            <div className="text-gray-700">{candidate.duration}</div>
                          </div>
                          {assessmentDetails?.technical_enabled && (
                            <div className="rounded-lg bg-gray-50 p-2">
                              <div className="text-gray-500">Tech</div>
                              <div className={candidate.tech_score !== undefined ? (candidate.tech_score >= passingThreshold ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}>
                                {candidate.tech_score !== undefined ? `${candidate.tech_score}%` : '-'}
                              </div>
                            </div>
                          )}
                          {assessmentDetails?.coding_enabled && (
                            <div className="rounded-lg bg-gray-50 p-2">
                              <div className="text-gray-500">Coding</div>
                              <div className={candidate.coding_score !== undefined ? (candidate.coding_score >= passingThreshold ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}>
                                {candidate.coding_score !== undefined ? `${candidate.coding_score}%` : '-'}
                              </div>
                            </div>
                          )}
                        </div>

                        {candidate.phone && (
                          <div className="mt-2 text-xs text-gray-500">Phone: {candidate.phone}</div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => viewCandidateDetails(candidate)}
                            className="inline-flex items-center justify-center w-9 h-9 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-md shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
                            title="View Details"
                            aria-label={`View details for ${candidate.name || 'candidate'}`}
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                          </button>
                          <button
                            onClick={() => handleDownloadPDF(candidate.id, candidate.candidateDisplayId)}
                            disabled={downloadingPDF === candidate.id}
                            className="inline-flex items-center justify-center w-9 h-9 bg-brand-orange hover:bg-brand-orange-deep text-white rounded-md shadow-md shadow-brand-orange/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Download PDF Report"
                            aria-label={`Download PDF report for ${candidate.name || 'candidate'}`}
                          >
                            {downloadingPDF === candidate.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden xl:block tf-table-shell">
            <table className="w-full min-w-[2040px] table-fixed [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_td]:align-middle">
              <thead className="bg-slate-50 border-b border-gray-100">
                <tr>
                  <th className={`px-4 py-3 w-10 tf-sticky-col-left ${stickyHeaderClass}`}>
                    <input
                      type="checkbox"
                      checked={selectedRows.length === paginatedCandidates.length && paginatedCandidates.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                    />
                  </th>
                  {isColumnEnabled('cid') && (
                    <th className={`w-24 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>CID</th>
                  )}
                  {isColumnEnabled('candidate') && (
                    <th
                      className={`w-48 text-left px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-brand-blue/5 ${stickyHeaderClass}`}
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        Candidate
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'name' ? 'text-brand-blue' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('email') && (
                    <th className={`w-64 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        Email
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('jdTitle') && (
                    <th className={`w-56 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>
                      <div className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        JD Title
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('phone') && (
                    <th className={`w-36 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        Phone
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('inviteSource') && (
                    <th className={`w-36 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>Invite Source</th>
                  )}
                  {isColumnEnabled('techScore') && assessmentDetails?.technical_enabled && (
                    <th
                      className={`w-28 text-center px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-brand-blue/5 ${stickyHeaderClass}`}
                      onClick={() => handleSort('score')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Tech Score
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'score' ? 'text-brand-blue' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('codingScore') && assessmentDetails?.coding_enabled && (
                    <th
                      className={`w-28 text-center px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-brand-blue/5 ${stickyHeaderClass}`}
                      onClick={() => handleSort('score')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Coding Score
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'score' ? 'text-brand-blue' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('status') && (
                    <th
                      className={`w-28 text-center px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-brand-blue/5 ${stickyHeaderClass}`}
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Result Status
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'status' ? 'text-brand-blue' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('timeline') && (
                    <th className={`w-96 text-left px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Timeline
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('completed') && (
                    <th
                      className={`w-32 text-left px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-brand-blue/5 ${stickyHeaderClass}`}
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center gap-1">
                        Completed
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'date' ? 'text-brand-blue' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('duration') && (
                    <th className={`w-28 text-center px-4 py-3 text-xs text-gray-600 ${stickyHeaderClass}`}>Duration</th>
                  )}
                  <th className={`w-32 text-center px-4 py-3 text-xs text-gray-600 tf-sticky-col ${stickyHeaderClass}`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={enabledColumnsCount + 2} className="px-6 py-12 text-center whitespace-normal">
                      <div className="flex flex-col items-center">
                        <Users className="w-12 h-12 text-gray-300 mb-3" />
                        {searchQuery || Object.keys(roundFilters).length > 0 || statusFilter !== 'all' || passFailFilter !== 'all' ? (
                          <>
                            <p className="text-gray-600 mb-1">No candidates match your search criteria</p>
                            <p className="text-sm text-gray-500">Try adjusting your filters or search query</p>
                          </>
                        ) : (
                          <>
                            <p className="text-gray-600 mb-1">No candidates have completed this assessment yet</p>
                            <p className="text-sm text-gray-500">Share the assessment link to invite candidates</p>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedCandidates.map((candidate) => (
                    <tr
                      key={candidate.id}
                      onClick={() => viewCandidateDetails(candidate)}
                      data-row-selected={selectedRows.includes(candidate.id)}
                      className={`hover:bg-brand-blue/5 transition-colors cursor-pointer ${selectedRows.includes(candidate.id) ? 'bg-brand-blue/5' : ''}`}
                    >
                      <td className="px-4 py-4 tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(candidate.id)}
                          onChange={(e) => handleSelectRow(candidate.id, e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                        />
                      </td>
                      {isColumnEnabled('cid') && (
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center whitespace-nowrap text-xs font-mono font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                            {candidate.candidateDisplayId || '-'}
                          </span>
                        </td>
                      )}
                      {isColumnEnabled('candidate') && (
                        <td className="px-4 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-blue ring-1 ring-white/10 shadow-sm shadow-brand-blue/25 flex shrink-0 items-center justify-center text-white text-xs">
                              {(candidate.name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div className="min-w-0 truncate text-sm text-gray-900 font-medium" title={candidate.name || 'Unknown'}>{candidate.name || 'Unknown'}</div>
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('email') && (
                        <td className="px-4 py-4">
                          <div className="truncate text-sm text-gray-600" title={candidate.email || '-'}>{candidate.email || '-'}</div>
                        </td>
                      )}
                      {isColumnEnabled('jdTitle') && (
                        <td className="px-4 py-4">
                          <div className="truncate text-sm text-gray-600" title={jdTitle || 'N/A'}>
                            {jdTitle || 'N/A'}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('phone') && (
                        <td className="px-4 py-4">
                          <div className="truncate text-sm text-gray-600" title={candidate.phone || '-'}>{candidate.phone || '-'}</div>
                        </td>
                      )}
                      {isColumnEnabled('inviteSource') && (
                        <td className="px-4 py-4">
                          {(() => {
                            const meta = getInviteSourceMeta(candidate.inviteSource);
                            return (
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${meta.cls}`}>
                                {meta.label}
                              </span>
                            );
                          })()}
                        </td>
                      )}
                      {isColumnEnabled('techScore') && assessmentDetails?.technical_enabled && (
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {/* Tech Score: green when ≥ threshold, red below.
                                The 4-band gradient (red/yellow/gray/green)
                                was confusing because 69% rendered gray even
                                though it failed the 70% threshold. Now color
                                matches the Pass/Fail outcome consistently. */}
                            <span className={`text-lg font-semibold ${candidate.tech_score !== undefined ? (candidate.tech_score >= passingThreshold ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                              {candidate.tech_score !== undefined ? `${candidate.tech_score}%` : '-'}
                            </span>
                            {candidate.tech_score !== undefined && (
                              <span className={`text-xs font-medium ${candidate.tech_score >= passingThreshold ? 'text-green-600' : 'text-red-600'}`}>
                                {candidate.tech_score >= passingThreshold ? 'Pass' : 'Fail'}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('codingScore') && assessmentDetails?.coding_enabled && (
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`text-lg font-semibold ${candidate.coding_score !== undefined ? (candidate.coding_score >= passingThreshold ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                              {candidate.coding_score !== undefined ? `${candidate.coding_score}%` : '-'}
                            </span>
                            {candidate.coding_score !== undefined && (
                              <span className={`text-xs font-medium ${candidate.coding_score >= passingThreshold ? 'text-green-600' : 'text-red-600'}`}>
                                {candidate.coding_score >= passingThreshold ? 'Pass' : 'Fail'}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('status') && (
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${getStatusColor(candidate.status)}`}>
                            {candidate.status}
                          </span>
                        </td>
                      )}
                      {isColumnEnabled('timeline') && (
                        <td className="px-4 py-4 overflow-hidden text-xs text-gray-500">
                          <div className="flex min-w-0 items-center gap-3 overflow-hidden" title={getTimelineSummary(candidate)}>
                            {candidate.sent_at && (
                              <div className="inline-flex shrink-0 items-center gap-2">
                                <Mail className="w-3 h-3 shrink-0 text-brand-blue" />
                                <span>Sent: {formatTimelineDate(candidate.sent_at)}</span>
                              </div>
                            )}
                            {candidate.started_at && (
                              <div className="inline-flex shrink-0 items-center gap-2">
                                <Play className="w-3 h-3 shrink-0 text-brand-orange-deep" />
                                <span>Started: {formatTimelineDate(candidate.started_at)}</span>
                              </div>
                            )}
                            {candidate.completed_at && (
                              <div className="inline-flex shrink-0 items-center gap-2">
                                <CheckCircle className="w-3 h-3 shrink-0 text-green-500" />
                                <span>Completed: {formatTimelineDate(candidate.completed_at)}</span>
                              </div>
                            )}
                            {!candidate.sent_at && !candidate.started_at && !candidate.completed_at && (
                              <div className="inline-flex shrink-0 items-center gap-2">
                                <Clock className="w-3 h-3 shrink-0 text-gray-400" />
                                <span>{candidate.created_at ? `Created: ${formatTimelineDate(candidate.created_at)}` : '-'}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('completed') && (
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            {candidate.completedDate}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('duration') && (
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                            <Clock className="w-4 h-4" />
                            {candidate.duration}
                          </div>
                        </td>
                      )}
                      <td className="px-2 sm:px-4 py-4 tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-nowrap">
                          <button
                            onClick={() => viewCandidateDetails(candidate)}
                            className="inline-flex items-center justify-center w-9 h-9 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-md shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
                            title="View Details"
                            aria-label={`View details for ${candidate.name || 'candidate'}`}
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                          </button>
                          <button
                            onClick={() => handleDownloadPDF(candidate.id, candidate.candidateDisplayId)}
                            disabled={downloadingPDF === candidate.id}
                            className="inline-flex items-center justify-center w-9 h-9 bg-brand-orange hover:bg-brand-orange-deep text-white rounded-md shadow-md shadow-brand-orange/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Download PDF Report"
                            aria-label={`Download PDF report for ${candidate.name || 'candidate'}`}
                          >
                            {downloadingPDF === candidate.id ? (
                              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                            ) : (
                              <Download className="w-3 h-3 flex-shrink-0" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* AS-23: Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs sm:text-sm text-gray-600">
                Showing {startIndex + 1} to {Math.min(endIndex, totalItems)} of {totalItems} results
              </div>
              <InlinePageNav
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>

        </>
        )}
      </div>

      {/* Export Format & Scope Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto">
            {/* Step 1: Format Selection */}
            {exportStep === 'format' && (
              <>
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-medium text-gray-900 tracking-tight">Export Assessment Results</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">Step 1 of 2: Choose format</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="p-1 text-gray-400 hover:text-brand-blue rounded-md hover:bg-brand-blue/5 transition-colors"
                   aria-label="Close">
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>

                <div className="p-4 sm:p-5">
                  <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">Choose export format:</p>

                  <div className="space-y-2.5 sm:space-y-3">
                    <button
                      onClick={() => handleFormatSelect('csv')}
                      className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-gray-200 rounded-xl hover:bg-brand-blue/5 hover:border-brand-blue/30 transition-all group"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-100 to-green-50 ring-1 ring-green-200 flex items-center justify-center transition-colors flex-shrink-0">
                        <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-green-700" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-sm sm:text-base font-medium text-gray-900">CSV Format</div>
                        <div className="text-xs sm:text-sm text-gray-500">Compatible with Excel, Google Sheets</div>
                      </div>
                    </button>

                    <button
                      onClick={() => handleFormatSelect('excel')}
                      className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-gray-200 rounded-xl hover:bg-brand-blue/5 hover:border-brand-blue/30 transition-all group"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center transition-colors flex-shrink-0">
                        <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-sm sm:text-base font-medium text-gray-900">Excel Format (XLSX)</div>
                        <div className="text-xs sm:text-sm text-gray-500">Native Excel format with better formatting</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-gray-100">
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Scope Selection */}
            {exportStep === 'scope' && (
              <>
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center">
                      <Layers className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-medium text-gray-900 tracking-tight">Export Scope</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        Step 2 of 2: Choose what to export ({selectedFormat === 'csv' ? 'CSV' : 'Excel'})
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="p-1 text-gray-400 hover:text-brand-blue rounded-md hover:bg-brand-blue/5 transition-colors"
                   aria-label="Close">
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>

                <div className="p-4 sm:p-5">
                  <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                    {areColumnsCustomized()
                      ? 'Export scope (with selected columns):'
                      : 'Select export scope:'}
                  </p>

                  <div className="space-y-2.5 sm:space-y-3">
                    {/* Show "Selected Candidates" option when rows are selected */}
                    {selectedRows.length > 0 && (
                      <button
                        onClick={handleExportSelected}
                        disabled={isExporting}
                        className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border-2 border-green-400 rounded-xl hover:bg-green-50 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-100 to-green-50 ring-1 ring-green-200 flex items-center justify-center transition-colors flex-shrink-0">
                          {isExporting ? (
                            <Loader2 className="w-4 h-4 text-green-700 animate-spin" />
                          ) : (
                            <CheckSquare className="w-5 h-5 sm:w-6 sm:h-6 text-green-700" />
                          )}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-medium text-gray-900">{isExporting ? 'Generating…' : 'Selected Candidates'}</div>
                          <div className="text-xs sm:text-sm text-gray-500">
                            Export only the {selectedRows.length} selected candidate{selectedRows.length > 1 ? 's' : ''}
                          </div>
                        </div>
                      </button>
                    )}

                    {/* Show "All Filtered Results" if columns are customized */}
                    {areColumnsCustomized() ? (
                      <button
                        onClick={handleExportAllFiltered}
                        disabled={isExporting}
                        className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border-2 border-brand-blue/40 rounded-xl hover:bg-brand-blue/5 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center transition-colors flex-shrink-0">
                          {isExporting ? (
                            <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />
                          ) : (
                            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                          )}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-medium text-gray-900">{isExporting ? 'Generating…' : 'All Filtered Results'}</div>
                          <div className="text-xs sm:text-sm text-gray-500">
                            Export all {filteredCandidates.length} results with {enabledColumnsCount} selected columns
                            <div className="text-xs text-brand-blue mt-1">
                              (includes completed, in-progress, and pending)
                            </div>
                          </div>
                        </div>
                      </button>
                    ) : (
                      /* Show "Current Page" if columns are NOT customized */
                      <button
                        onClick={handleExportCurrentPage}
                        disabled={isExporting}
                        className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border-2 border-brand-cyan/40 rounded-xl hover:bg-brand-cyan/5 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex items-center justify-center transition-colors flex-shrink-0">
                          {isExporting ? (
                            <Loader2 className="w-4 h-4 text-brand-cyan animate-spin" />
                          ) : (
                            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-cyan" />
                          )}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-medium text-gray-900">{isExporting ? 'Generating…' : 'Current Page'}</div>
                          <div className="text-xs sm:text-sm text-gray-500">
                            Export {paginatedCandidates.length} results visible on this page
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-t border-gray-100">
                  <button
                    onClick={() => setExportStep('format')}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-md transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
