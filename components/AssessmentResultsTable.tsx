import { useState, useEffect } from 'react';
import { ArrowLeft, Search, SlidersHorizontal, Download, FileDown, CheckSquare, Square, X, Eye, BarChart3, Calendar, Mail, Phone, Clock, CheckCircle, XCircle, FileText, Archive, Loader2, Trash2, Award, Play } from 'lucide-react';
import React from 'react';
import { useRouter } from 'next/navigation';
import { assessmentService } from '@/lib/services/assessmentService';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import TabEmptyState from '@/components/ui/tab-empty-state';
import Pagination from '@/components/Pagination';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatISTWithSeconds } from '@/lib/utils/dateUtils';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import { InviteSourceValue } from '@/components/AIInterviewInviteTable';
import { formatScore } from '@/lib/utils/score';

// AS-24: localStorage key for column preferences (v2 with new columns)
const COLUMN_PREFERENCES_KEY = 'assessment_results_jd_column_preferences_v2';

interface AssessmentResult {
  id: string;
  candidateDisplayId?: string;
  candidateName: string;
  email: string;
  phone: string;
  assessmentName: string;
  assessmentId?: string;
  totalScore: number;
  maxScore: number;
  scorePercentage: number;
  passFail: 'Pass' | 'Fail';
  completedDate: string;
  completionTime: string; // in minutes
  duration?: string; // formatted duration like "5m 30s"
  aiSummary: string;
  roundScores: {
    roundName: string;
    score: number;
    maxScore: number;
    passFail: 'Pass' | 'Fail';
  }[];
  invitedDate: string;
  invitedBy: string;
  inviteSource?: string;
  status?: string; // completed, in_progress, pending
  /**
   * AI scoring state, distinct from `status` (the candidate's submission
   * state). A candidate can be 'completed' while scoring is still running, so
   * the Tech/Coding score cells and the PDF download gate on this and show '—'
   * until it reads 'completed'.
   *
   * Was missing from this interface even though the code below reads it in five
   * places and JobDetailView passes it in explicitly — the union matches
   * ScoringStatus in assessmentService. Optional because the API can omit it.
   */
  scoring_status?: 'pending' | 'processing' | 'completed' | 'error';
  sent_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
}

interface Column {
  id: string;
  label: string;
  enabled: boolean;
}

interface AssessmentResultsTableProps {
  results: AssessmentResult[];
  jobTitle: string;
  jobId?: string;
  onViewResultDetail?: (result: AssessmentResult, jobTitle?: string) => void;
  canDownloadPDF?: boolean;
  canBatchDownload?: boolean;
  /**
   * Page-level actions (e.g. Create, Send Invite) rendered at the front of the
   * header's control row, ahead of Columns. Lets the owning page put them in
   * the table's own toolbar instead of a separate strip above it.
   */
  toolbarActions?: React.ReactNode;
  /**
   * Action for the nothing-recorded-yet empty state. Kept separate from
   * `toolbarActions` because the two want different sets: the toolbar shows
   * Send Invite always (disabled until it can be used), while the empty state
   * only includes it once an assessment exists to invite people to.
   */
  emptyStateAction?: React.ReactNode;
}

export default function AssessmentResultsTable({ results, jobTitle, jobId = 'jd-1', onViewResultDetail, canDownloadPDF = false, canBatchDownload = false, toolbarActions, emptyStateAction }: AssessmentResultsTableProps) {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);

  // Filters (inline dropdowns matching AssessmentResults.tsx)
  const [statusFilter, setStatusFilter] = useState<'all' | 'Completed' | 'In Progress' | 'Pending'>('all');
  const [filterPassFail, setFilterPassFail] = useState<'all' | 'Pass' | 'Fail'>('all');
  const [roundFilters, setRoundFilters] = useState<{
    technical?: 'all' | '50-70' | '70-90' | '90+';
    coding?: 'all' | '50-70' | '70-90' | '90+';
  }>({});

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>('list');

  // Detect if any results have technical/coding rounds
  const hasTechnicalRound = results.some(r => r.roundScores.some(rs => rs.roundName === 'Technical'));
  const hasCodingRound = results.some(r => r.roundScores.some(rs => rs.roundName === 'Coding'));

  // AS-24: Default columns configuration (dynamic based on available rounds)
  const defaultColumns: Column[] = [
    { id: 'cid', label: 'CID', enabled: true },
    { id: 'candidateName', label: 'Candidate', enabled: true },
    { id: 'email', label: 'Email', enabled: true },
    { id: 'assessmentName', label: 'Assessment', enabled: true },
    { id: 'phone', label: 'Phone', enabled: true },
    ...(hasTechnicalRound ? [{ id: 'techScore', label: 'Tech Score', enabled: true }] : []),
    ...(hasCodingRound ? [{ id: 'codingScore', label: 'Coding Score', enabled: true }] : []),
    { id: 'inviteSource', label: 'Invite Source', enabled: true },
    { id: 'status', label: 'Result Status', enabled: true },
    { id: 'timeline', label: 'Timeline', enabled: true },
    { id: 'completed', label: 'Completed', enabled: true },
    { id: 'duration', label: 'Duration', enabled: true },
    { id: 'scorePercentage', label: 'Score %', enabled: false },
    { id: 'passFail', label: 'Result', enabled: false },
    { id: 'invitedBy', label: 'Invited By', enabled: false },
    { id: 'invitedDate', label: 'Invited Date', enabled: false },
  ];

  // AS-24: Load column preferences from localStorage on mount
  const [columns, setColumns] = useState<Column[]>(() => {
    if (typeof window === 'undefined') return defaultColumns;
    try {
      const saved = localStorage.getItem(COLUMN_PREFERENCES_KEY);
      if (saved) {
        const savedColumns = JSON.parse(saved) as Column[];
        // Merge saved preferences with default columns to handle new columns
        return defaultColumns.map(defaultCol => {
          const savedCol = savedColumns.find(sc => sc.id === defaultCol.id);
          return savedCol ? { ...defaultCol, enabled: savedCol.enabled } : defaultCol;
        });
      }
    } catch (error) {
      console.error('Failed to load column preferences:', error);
    }
    return defaultColumns;
  });

  // AS-24: Save column preferences to localStorage when they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(COLUMN_PREFERENCES_KEY, JSON.stringify(columns));
    } catch (error) {
      console.error('Failed to save column preferences:', error);
    }
  }, [columns]);

  const [selectedResultDetail, setSelectedResultDetail] = useState<string | null>(null);

  // AS-25/AS-26: PDF download states
  const [downloadingPDF, setDownloadingPDF] = useState<string | null>(null);
  const [downloadingBulkPDF, setDownloadingBulkPDF] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const enabledColumns = columns.filter(col => col.enabled);

  // Helper: extract round score percentage from roundScores array
  const getRoundScore = (result: AssessmentResult, roundName: string): number | undefined => {
    const round = result.roundScores.find(r => r.roundName === roundName);
    return round ? (round.maxScore > 0 ? (round.score / round.maxScore) * 100 : 0) : undefined;
  };

  // Helper: check if score falls in range
  const matchesScoreRange = (score: number | undefined, range: string): boolean => {
    if (score === undefined) return false;
    if (range === '50-70') return score >= 50 && score < 70;
    if (range === '70-90') return score >= 70 && score < 90;
    if (range === '90+') return score >= 90;
    return true;
  };

  // Helper: determine display status from result
  const getResultStatus = (result: AssessmentResult): string => {
    // The Result Status column = candidate's submission state, NOT AI
    // scoring state. completed_at OR status='completed' means the
    // candidate finished — display Completed even while scoring is
    // still running. (The Tech/Coding score cells gate on scoring_status
    // separately and show '—' until scoring is done.)
    if (result.status === 'completed' || result.completed_at) return 'Completed';
    if (result.status === 'in_progress' || result.started_at) return 'In Progress';
    if (result.status === 'pending') return 'Pending';
    if (result.completedDate && result.completedDate !== 'In Progress' && result.completedDate !== 'Not started') return 'Completed';
    if (result.completedDate === 'In Progress') return 'In Progress';
    return 'Pending';
  };

  const canDownloadResultPdf = (result: AssessmentResult): boolean => {
    return getResultStatus(result) === 'Completed' && result.scoring_status === 'completed';
  };

  // Helper: status badge colors
  // Canonical status → Badge variant (shared mapping so statuses don't drift).
  const getStatusVariant = (status: string): 'success' | 'info' | 'warning' | 'muted' | 'destructive' => {
    switch (status) {
      case 'Completed': return 'success';
      case 'In Progress': return 'info';
      case 'Pending': return 'warning';
      case 'Failed':
      case 'Abandoned': return 'destructive';
      default: return 'muted';
    }
  };

  // Helper: format timeline date
  const formatTimelineDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    // Timeline shows precise event times (incl. seconds) for assessment timing.
    return formatISTWithSeconds(dateStr);
  };

  // Handle delete result with timeout
  const handleDeleteResult = async (result: AssessmentResult) => {
    if (!result.assessmentId) {
      toast.error('Assessment ID not found for this result.');
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Delete Result',
      message: 'Are you sure you want to delete this result?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Result',
      item: { label: 'CANDIDATE RESULT', name: result.candidateName },
      warningNote: 'Deleting this result will permanently remove it and cannot be restored.',
    });

    if (!confirmed) return;

    console.log('[DELETE] Starting delete:', { assessmentId: result.assessmentId, resultId: result.id });
    setIsDeleting(result.id);

    try {
      await withTimeout(
        assessmentService.deleteResult(result.assessmentId, result.id),
        30000,
        'Delete operation timed out after 30 seconds. Please try again.'
      );
      toast.success(`Result for ${result.candidateName} deleted successfully`);
      window.location.reload();
    } catch (error: any) {
      console.error('[DELETE] Failed:', error);
      toast.error(error?.message || 'Failed to delete result. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  // Filter results
  const filteredResults = results.filter(result => {
    const matchesSearch =
      result.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      result.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPassFail = filterPassFail === 'all' || result.passFail === filterPassFail;

    // Status filter
    const matchesStatus = statusFilter === 'all' || getResultStatus(result) === statusFilter;

    // Tech score range filter
    let matchesTech = true;
    if (roundFilters.technical && roundFilters.technical !== 'all') {
      matchesTech = matchesScoreRange(getRoundScore(result, 'Technical'), roundFilters.technical);
    }

    // Coding score range filter
    let matchesCoding = true;
    if (roundFilters.coding && roundFilters.coding !== 'all') {
      matchesCoding = matchesScoreRange(getRoundScore(result, 'Coding'), roundFilters.coding);
    }

    return matchesSearch && matchesPassFail && matchesStatus && matchesTech && matchesCoding;
  });

  // Reset to page 1 whenever the filtered set changes shape, so a filter
  // narrowing the list never leaves the view stranded on a now-empty page.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterPassFail, statusFilter, roundFilters]);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedResults = filteredResults.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage
  );

  const handleSelectAll = () => {
    if (selectedResults.length === filteredResults.length) {
      setSelectedResults([]);
    } else {
      setSelectedResults(filteredResults.map(r => r.id));
    }
  };

  const handleSelectResult = (id: string) => {
    if (selectedResults.includes(id)) {
      setSelectedResults(selectedResults.filter(r => r !== id));
    } else {
      setSelectedResults([...selectedResults, id]);
    }
  };

  const handleToggleColumn = (columnId: string) => {
    setColumns(columns.map(col =>
      col.id === columnId ? { ...col, enabled: !col.enabled } : col
    ));
  };

  // Check if columns are customized (some unchecked)
  const areColumnsCustomized = () => {
    if (columns.length === 0) return false;
    return columns.some(col => !col.enabled);
  };

  // Export format modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStep, setExportStep] = useState<'format' | 'scope'>('format');
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'excel'>('excel');

  const handleExportExcel = () => {
    setShowExportModal(true);
  };

  // Handle format selection - move to scope selection
  const handleFormatSelect = (format: 'csv' | 'excel') => {
    setSelectedFormat(format);
    setExportStep('scope');
  };

  // Build filters object for export
  const buildExportFilters = () => {
    const filters: any = {};
    if (searchTerm.trim()) filters.search = searchTerm.trim();
    if (statusFilter !== 'all') filters.status_filter = statusFilter.toLowerCase().replace(' ', '_');
    if (filterPassFail === 'Pass') filters.passed = true;
    else if (filterPassFail === 'Fail') filters.passed = false;
    return filters;
  };

  // Export current page only
  const exportCurrentPage = async () => {
    try {
      // The JD details page hosts results from N assessments under one
      // JD; the per-assessment endpoint can't aggregate them. Hit the
      // JD-level endpoint instead — same params, same file shape.
      const blob = await assessmentService.exportJdResults(
        jobId,
        selectedFormat,
        false,
        enabledColumns.map(c => c.id),
        buildExportFilters()
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const extension = selectedFormat === 'csv' ? 'csv' : 'xlsx';
      link.download = `${jobTitle.replace(/\s+/g, '_')}_CurrentPage_${new Date().toISOString().slice(0, 10)}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      const formatName = selectedFormat === 'csv' ? 'CSV' : 'Excel';
      toast.success(`Current page exported to ${formatName} successfully!`);
      setShowExportModal(false);
      setExportStep('format');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export results. Please try again.');
    }
  };

  // Export all filtered results
  const exportAllFiltered = async () => {
    try {
      // JD-level endpoint — see exportCurrentPage for why.
      const filters = buildExportFilters();
      // When the user has selected specific rows, scope the export to
      // those attempt/invitation IDs so the backend filters correctly.
      if (selectedResults.length > 0) {
        filters.result_ids = selectedResults;
      }
      const blob = await assessmentService.exportJdResults(
        jobId,
        selectedFormat,
        false,
        enabledColumns.map(c => c.id),
        filters
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const extension = selectedFormat === 'csv' ? 'csv' : 'xlsx';
      link.download = `${jobTitle.replace(/\s+/g, '_')}_AllResults_${new Date().toISOString().slice(0, 10)}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      const count = selectedResults.length > 0 ? selectedResults.length : filteredResults.length;
      const formatName = selectedFormat === 'csv' ? 'CSV' : 'Excel';
      toast.success(`All ${count} filtered results exported to ${formatName} successfully!`);
      setShowExportModal(false);
      setExportStep('format');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export results. Please try again.');
    }
  };

  // Helper: wrap a promise with a timeout that rejects if not resolved in time
  const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
  };

  // AS-25: Individual PDF download
  const handleDownloadPDF = async (resultId: string) => {
    if (downloadingPDF) return;

    // Find the result to get assessmentId
    const result = results.find(r => r.id === resultId);
    if (!result || !canDownloadResultPdf(result)) {
      toast.error('PDF is available only after scoring is completed.');
      return;
    }
    const assessmentId = result?.assessmentId || jobId;

    console.log('[PDF] Starting download:', { assessmentId, resultId, hasAssessmentId: !!result?.assessmentId });
    toast.info('Generating PDF report... Please wait.');
    setDownloadingPDF(resultId);

    try {
      const blob = await withTimeout(
        assessmentService.exportPDF(assessmentId, resultId),
        60000,
        'PDF generation timed out after 60 seconds. The server may be busy. Please try again.'
      );

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeIdentifier = result?.candidateDisplayId?.replace(/[^a-zA-Z0-9]/g, '_') || `CID_${resultId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      link.download = `Assessment_Report_${safeIdentifier}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      console.log('[PDF] Download complete:', safeIdentifier);
      toast.success('PDF downloaded successfully!');
    } catch (error: any) {
      console.error('[PDF] Failed to download:', error);
      toast.error(error?.message || 'Failed to download PDF report. Please try again.');
    } finally {
      setDownloadingPDF(null);
    }
  };

  // AS-26: Bulk PDF download as ZIP
  const handleDownloadBulkPDFs = async () => {
    if (downloadingBulkPDF || selectedResults.length === 0) return;

    const eligibleResults = results.filter(r => selectedResults.includes(r.id) && canDownloadResultPdf(r));
    if (eligibleResults.length === 0) {
      toast.error('Select at least one fully scored result to download PDFs.');
      return;
    }

    if (eligibleResults.length !== selectedResults.length) {
      toast.info(`${selectedResults.length - eligibleResults.length} result(s) were skipped because scoring is not completed yet.`);
    }

    // Get assessmentId from first selected result
    const firstResult = eligibleResults[0];
    const assessmentId = firstResult?.assessmentId || jobId;

    setDownloadingBulkPDF(true);
    try {
      const blob = await assessmentService.exportResultsBulkPDFs(assessmentId, eligibleResults.map(r => r.id));

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `Assessment_Reports_${timestamp}.zip`;
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

  const handleViewDetails = (result: AssessmentResult) => {
    setSelectedResultDetail(selectedResultDetail === result.id ? null : result.id);
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setFilterPassFail('all');
    setRoundFilters({});
    setSearchTerm('');
  };

  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (filterPassFail !== 'all' ? 1 : 0) +
    (roundFilters.technical && roundFilters.technical !== 'all' ? 1 : 0) +
    (roundFilters.coding && roundFilters.coding !== 'all' ? 1 : 0);

  const getPassFailBadge = (status: 'Pass' | 'Fail') => {
    if (status === 'Pass') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-success-subtle text-success ring-1 ring-success-line rounded-full text-xs">
          <CheckCircle className="w-3 h-3" />
          Pass
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-destructive-subtle text-destructive ring-1 ring-destructive-line rounded-full text-xs">
        <XCircle className="w-3 h-3" />
        Fail
      </span>
    );
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-success';
    if (percentage >= 60) return 'text-brand-blue';
    if (percentage >= 40) return 'text-brand-orange-deep';
    return 'text-destructive';
  };
  // Nothing has been recorded for this job yet — not even an invitation. The
  // header, filters, column picker, export controls and table headings would
  // all be acting on nothing, so drop the whole shell and show the same
  // message-plus-action empty state the AI Talent Match tab uses. Filters that
  // narrow a non-empty list to zero still fall through to the in-table empty
  // row below, which keeps the controls on screen to undo them.
  if (results.length === 0) {
    return (
      <TabEmptyState
        icon={BarChart3}
        title="No Assessment Results"
        description="Create an assessment for this job and invite candidates to see their results here."
        action={emptyStateAction ?? undefined}
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-4 md:p-6 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
          <div>
            <h2 className="text-sm sm:text-base text-gray-900">Assessment Results</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              {filteredResults.length} {filteredResults.length === 1 ? 'result' : 'results'}
              {searchTerm && ` matching "${searchTerm}"`}
              {activeFiltersCount > 0 && ` with ${activeFiltersCount} filter${activeFiltersCount !== 1 ? 's' : ''} applied`}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {toolbarActions}

            {/* Column Selector */}
            <div className="relative">
              <button
                onClick={() => setShowColumnSelector(!showColumnSelector)}
                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-md transition-colors flex items-center gap-1.5 sm:gap-2"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Columns ({enabledColumns.length})
              </button>

              {showColumnSelector && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowColumnSelector(false)}
                  ></div>
                  <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-1.5rem)] bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-2 z-20 max-h-96 overflow-y-auto">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <div className="text-sm text-gray-900">Select Columns</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {enabledColumns.length} of {columns.length} selected
                      </div>
                    </div>
                    {columns.map((column) => (
                      <label
                        key={column.id}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-brand-blue/5 hover:text-brand-blue cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={column.enabled}
                          onChange={() => handleToggleColumn(column.id)}
                          className="w-4 h-4 text-brand-blue rounded border-gray-300 focus:ring-brand-blue/40"
                        />
                        <span className="text-sm text-gray-700">{column.label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Export Excel */}
            {selectedResults.length === 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleExportExcel}
                icon={<FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              >
                Export
              </Button>
            )}

            {/* Bulk Actions - When items are selected */}
            {selectedResults.length > 0 && (
              <>
                {canBatchDownload && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDownloadBulkPDFs}
                    disabled={downloadingBulkPDF}
                    icon={downloadingBulkPDF ? (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  >
                    {downloadingBulkPDF ? 'Downloading...' : `PDFs (${selectedResults.length})`}
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExportExcel}
                  icon={<FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                >
                  Export
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Search and Inline Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex-1 basis-full sm:basis-[260px] min-w-[180px] sm:max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'Completed' | 'In Progress' | 'Pending')}
              className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black"
            >
              <option value="all">All</option>
              <option value="Completed">Completed</option>
              <option value="In Progress">In Progress</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          {/* Result (Pass/Fail) Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Result:</label>
            <select
              value={filterPassFail}
              onChange={(e) => setFilterPassFail(e.target.value as 'all' | 'Pass' | 'Fail')}
              className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black"
            >
              <option value="all">All</option>
              <option value="Pass">Pass</option>
              <option value="Fail">Fail</option>
            </select>
          </div>

          {/* Tech Score Filter (only if any result has Technical round) */}
          {hasTechnicalRound && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">Tech:</label>
              <select
                value={roundFilters.technical || 'all'}
                onChange={(e) => {
                  const value = e.target.value as 'all' | '50-70' | '70-90' | '90+';
                  setRoundFilters(prev => value === 'all' ? { ...prev, technical: undefined } : { ...prev, technical: value });
                }}
                className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black"
              >
                <option value="all">All</option>
                <option value="50-70">50-70%</option>
                <option value="70-90">70-90%</option>
                <option value="90+">90%+</option>
              </select>
            </div>
          )}

          {/* Coding Score Filter (only if any result has Coding round) */}
          {hasCodingRound && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">Coding:</label>
              <select
                value={roundFilters.coding || 'all'}
                onChange={(e) => {
                  const value = e.target.value as 'all' | '50-70' | '70-90' | '90+';
                  setRoundFilters(prev => value === 'all' ? { ...prev, coding: undefined } : { ...prev, coding: value });
                }}
                className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-xs sm:text-sm text-black"
              >
                <option value="all">All</option>
                <option value="50-70">50-70%</option>
                <option value="70-90">70-90%</option>
                <option value="90+">90%+</option>
              </select>
            </div>
          )}

          {/* Clear Filters */}
          {activeFiltersCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={clearFilters}
              icon={<X className="w-4 h-4" />}
            >
              Clear
            </Button>
          )}

          <ListViewToggle value={displayMode} onChange={setDisplayMode} className="ml-auto" />
        </div>
      </div>

      {/* Desktop Table View */}
      <div className={displayMode === 'grid' ? 'hidden' : 'hidden md:block'}>
        {/* Header + data cells stay on one line; the shell below is the single
            scroll container handling both axes. The expanded detail row and the
            empty state opt back out via whitespace-normal — they're prose/panel
            layouts, not table data. */}
        <div className="tf-table-shell">
          {/* With no results the header comes off: its cells are `nowrap`, so
              they are the only thing making the table wider than the shell, and
              a wider table centres the empty cell across that width instead of
              the visible one. See `TABLE_EMPTY_PANEL_CLASS`. */}
          <table className="w-full [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
            {filteredResults.length > 0 && (
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left py-3 px-4 w-12 tf-sticky-col-left">
                  <button onClick={handleSelectAll} className="p-1 hover:bg-brand-blue/5 rounded">
                    {selectedResults.length === filteredResults.length && filteredResults.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-brand-blue" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </th>
                {enabledColumns.map((col) => (
                  <th
                    key={col.id}
                    className={`text-left py-3 px-4 text-xs text-gray-600 ${col.id === 'cid' ? 'w-24 whitespace-nowrap' : ''}`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="text-left py-3 px-4 text-xs text-gray-600 tf-sticky-col">Actions</th>
              </tr>
            </thead>
            )}
            <tbody>
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={enabledColumns.length + 2} className="p-0">
                    <div className={`${TABLE_EMPTY_PANEL_CLASS} text-gray-400`}>
                      <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No assessment results found</p>
                      {searchTerm && (
                        <p className="text-xs mt-1">Try adjusting your search or filters</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedResults.map((result, index) => (
                  <React.Fragment key={result.id}>
                    <tr
                      data-row-selected={selectedResults.includes(result.id)}
                      className={`border-b border-gray-100 hover:bg-brand-blue/5 transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                      } ${selectedResults.includes(result.id) ? 'bg-brand-blue/5' : ''} ${getResultStatus(result) !== 'Pending' && onViewResultDetail ? 'cursor-pointer' : ''}`}
                      onClick={() => {
                        if (getResultStatus(result) === 'Pending' || !onViewResultDetail) return;
                        onViewResultDetail(result, jobTitle);
                      }}
                    >
                      <td className="py-3 px-4 tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleSelectResult(result.id)}
                          className="p-1 hover:bg-brand-blue/10 rounded"
                        >
                          {selectedResults.includes(result.id) ? (
                            <CheckSquare className="w-4 h-4 text-brand-blue" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </td>
  
                      {enabledColumns.map((col) => {
                        if (col.id === 'cid') {
                          return (
                            <td key={col.id} className="py-3 px-4 w-24 whitespace-nowrap">
                              {result.candidateDisplayId ? (
                                <span className="inline-flex items-center text-xs font-mono font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 px-2 py-0.5 rounded whitespace-nowrap">
                                  {result.candidateDisplayId}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          );
                        }
                        if (col.id === 'candidateName') {
                          return (
                            <td key={col.id} className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-brand-blue ring-1 ring-white/10 shadow-sm shadow-brand-blue/25 flex items-center justify-center text-white text-xs">
                                  {(result.candidateName || 'U').split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>
                                <div className="text-sm text-gray-900 font-medium">{result.candidateName}</div>
                              </div>
                            </td>
                          );
                        }
                        if (col.id === 'email') {
                          return (
                            <td key={col.id} className="py-3 px-4">
                              <div className="text-sm text-gray-600">{result.email}</div>
                            </td>
                          );
                        }
                        if (col.id === 'phone') {
                          return (
                            <td key={col.id} className="py-3 px-4">
                              <div className="flex flex-col gap-0.5 text-sm text-gray-600">
                                {(() => {
                                  const numbers = splitPhoneNumbers(result.phone, 2);
                                  return numbers.length > 0
                                    ? numbers.map((num, i) => <span key={i}>{num}</span>)
                                    : <span>-</span>;
                                })()}
                              </div>
                            </td>
                          );
                        }
                        if (col.id === 'assessmentName') {
                          return (
                            <td key={col.id} className="py-3 px-4">
                              <div className="text-sm text-gray-700 truncate max-w-[200px]" title={result.assessmentName}>{result.assessmentName}</div>
                            </td>
                          );
                        }
                        if (col.id === 'inviteSource') {
                          return (
                            <td key={col.id} className="py-3 px-4 text-sm text-gray-700 whitespace-nowrap">
                              <InviteSourceValue inv={{ invite_source: result.inviteSource }} iconClassName="w-3.5 h-3.5" />
                            </td>
                          );
                        }
                        if (col.id === 'scorePercentage') {
                          return (
                            <td key={col.id} className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm ${getScoreColor(result.scorePercentage)}`}>
                                  {formatScore(result.scorePercentage)}%
                                </span>
                                <span className="text-xs text-gray-400">
                                  ({result.totalScore}/{result.maxScore})
                                </span>
                              </div>
                            </td>
                          );
                        }
                        if (col.id === 'techScore') {
                          // Match the Results page exactly: hide the value
                          // until AI scoring is finished, then render with
                          // green-on-pass / red-on-fail using the 70%
                          // passing threshold (not 50%).
                          const scoringDone = result.scoring_status === 'completed';
                          const techRound = result.roundScores.find(r => r.roundName === 'Technical');
                          const techPct = techRound && techRound.maxScore > 0 ? (techRound.score / techRound.maxScore) * 100 : null;
                          return (
                            <td key={col.id} className="py-3 px-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={`text-lg font-semibold ${scoringDone && techPct !== null ? (techPct >= 70 ? 'text-success' : 'text-destructive') : 'text-gray-400'}`}>
                                  {scoringDone && techPct !== null ? `${Math.round(techPct)}%` : '—'}
                                </span>
                                {scoringDone && techPct !== null && (
                                  <span className={`text-xs font-medium ${techPct >= 70 ? 'text-success' : 'text-destructive'}`}>
                                    {techPct >= 70 ? 'Pass' : 'Fail'}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }
                        if (col.id === 'codingScore') {
                          const scoringDone = result.scoring_status === 'completed';
                          const codingRound = result.roundScores.find(r => r.roundName === 'Coding');
                          const codingPct = codingRound && codingRound.maxScore > 0 ? (codingRound.score / codingRound.maxScore) * 100 : null;
                          return (
                            <td key={col.id} className="py-3 px-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={`text-lg font-semibold ${scoringDone && codingPct !== null ? (codingPct >= 70 ? 'text-success' : 'text-destructive') : 'text-gray-400'}`}>
                                  {scoringDone && codingPct !== null ? `${Math.round(codingPct)}%` : '—'}
                                </span>
                                {scoringDone && codingPct !== null && (
                                  <span className={`text-xs font-medium ${codingPct >= 70 ? 'text-success' : 'text-destructive'}`}>
                                    {codingPct >= 70 ? 'Pass' : 'Fail'}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }
                        if (col.id === 'status') {
                          const displayStatus = getResultStatus(result);
                          return (
                            <td key={col.id} className="py-3 px-4 text-center">
                              <Badge variant={getStatusVariant(displayStatus)} className="px-3 py-1">
                                {displayStatus}
                              </Badge>
                            </td>
                          );
                        }
                        if (col.id === 'timeline') {
                          return (
                            <td key={col.id} className="py-3 px-4 text-xs text-gray-500">
                              <div className="space-y-1">
                                {result.sent_at && (
                                  <div className="flex items-center gap-2">
                                    <Mail className="w-3 h-3 text-brand-blue" />
                                    <span>Sent: {formatTimelineDate(result.sent_at)}</span>
                                  </div>
                                )}
                                {result.started_at && (
                                  <div className="flex items-center gap-2">
                                    <Play className="w-3 h-3 text-brand-orange-deep" />
                                    <span>Started: {formatTimelineDate(result.started_at)}</span>
                                  </div>
                                )}
                                {result.completed_at && (
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-3 h-3 text-success" />
                                    <span>Completed: {formatTimelineDate(result.completed_at)}</span>
                                  </div>
                                )}
                                {!result.sent_at && !result.started_at && !result.completed_at && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-3 h-3 text-gray-400" />
                                    <span>{result.created_at ? `Created: ${formatTimelineDate(result.created_at)}` : '-'}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        }
                        if (col.id === 'completed') {
                          return (
                            <td key={col.id} className="py-3 px-4">
                              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                <Calendar className="w-3.5 h-3.5" />
                                {result.completedDate}
                              </div>
                            </td>
                          );
                        }
                        if (col.id === 'duration') {
                          return (
                            <td key={col.id} className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5 text-sm text-gray-600">
                                <Clock className="w-3.5 h-3.5" />
                                {result.duration || (result.completionTime ? `${result.completionTime} min` : '-')}
                              </div>
                            </td>
                          );
                        }
                        if (col.id === 'passFail') {
                          return (
                            <td key={col.id} className="py-3 px-4">
                              {getPassFailBadge(result.passFail)}
                            </td>
                          );
                        }
                        if (col.id === 'invitedBy') {
                          return (
                            <td key={col.id} className="py-3 px-4">
                              <div className="text-sm text-gray-600">{result.invitedBy}</div>
                            </td>
                          );
                        }
                        if (col.id === 'invitedDate') {
                          return (
                            <td key={col.id} className="py-3 px-4">
                              <div className="text-sm text-gray-600">{result.invitedDate}</div>
                            </td>
                          );
                        }
                        return null;
                      })}
  
                      {/* Actions — restored to always-visible old-code behavior
                          (View Details + Download PDF) so the column is never
                          empty for Pending rows or users without download perms. */}
                      <td className="px-2 sm:px-4 py-4 tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-nowrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              // Prefer the inline callback (keeps the origin
                              // breadcrumb, e.g. Job Descriptions) when provided;
                              // fall back to the standalone results route.
                              if (onViewResultDetail) { onViewResultDetail(result, jobTitle); return; }
                              if (result.assessmentId) {
                                router.push(`/recruitment/assessments/${result.assessmentId}/results/details?candidate_id=${result.id}${result.candidateDisplayId ? `&cid=${encodeURIComponent(result.candidateDisplayId)}` : ''}`);
                              }
                            }}
                            className="w-9 h-9 px-0"
                            title="View Details"
                            aria-label={`View details for ${result.candidateName || 'candidate'}`}
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownloadPDF(result.id)}
                            disabled={downloadingPDF === result.id}
                            className="w-9 h-9 px-0"
                            title="Download PDF Report"
                            aria-label={`Download PDF report for ${result.candidateName || 'candidate'}`}
                          >
                            {downloadingPDF === result.id ? (
                              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                            ) : (
                              <Download className="w-3 h-3 flex-shrink-0" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
  
                    {/* Expanded Detail Row */}
                    {selectedResultDetail === result.id && (
                      <tr className="bg-brand-blue/[0.03] border-b border-brand-blue/10">
                        <td colSpan={enabledColumns.length + 2} className="p-6 whitespace-normal">
                          <div className="max-w-4xl">
                            <div className="grid grid-cols-2 gap-6">
                              {/* Left Column - Round Scores */}
                              <div>
                                <h4 className="text-sm text-gray-900 mb-3">Round-wise Scores</h4>
                                <div className="space-y-2">
                                  {result.roundScores.map((round, idx) => (
                                    <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-gray-900">{round.roundName}</span>
                                        <div className="flex items-center gap-2">
                                          <span className={`text-sm ${round.passFail === 'Pass' ? 'text-success' : 'text-destructive'}`}>
                                            {round.score}/{round.maxScore}
                                          </span>
                                          {round.passFail === 'Pass' ? (
                                            <CheckCircle className="w-4 h-4 text-success" />
                                          ) : (
                                            <XCircle className="w-4 h-4 text-destructive" />
                                          )}
                                        </div>
                                      </div>
                                      <div className="bg-gray-200 rounded-full h-1.5">
                                        <div
                                          className={`h-1.5 rounded-full ${round.passFail === 'Pass' ? 'bg-success' : 'bg-destructive'}`}
                                          style={{ width: `${(round.score / round.maxScore) * 100}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
  
                              {/* Right Column - AI Summary */}
                              <div>
                                <h4 className="text-sm text-gray-900 mb-3">AI Summary</h4>
                                <div className="bg-brand-blue/5 rounded-lg p-4 border border-brand-blue/15">
                                  <p className="text-sm text-gray-700 leading-relaxed">
                                    {result.aiSummary}
                                  </p>
                                </div>
  
                                {/* Additional Info */}
                                <div className="mt-4 space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Invited By:</span>
                                    <span className="text-gray-900">{result.invitedBy}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Invited Date:</span>
                                    <span className="text-gray-900">{result.invitedDate}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Time Taken:</span>
                                    <span className="text-gray-900">{result.completionTime} minutes</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Desktop Grid View */}
      {displayMode === 'grid' && (
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
          {paginatedResults.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-400">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No assessment results found</p>
              {searchTerm && <p className="text-xs mt-1">Try adjusting your search or filters</p>}
            </div>
          ) : (
            paginatedResults.map((result) => {
              const status = getResultStatus(result);
              const scoringDone = status === 'Completed' && result.scoring_status === 'completed';
              const openDetail = () => {
                if (status === 'Pending') return;
                if (onViewResultDetail) { onViewResultDetail(result, jobTitle); return; }
                if (result.assessmentId) {
                  router.push(`/recruitment/assessments/${result.assessmentId}/results/details?candidate_id=${result.id}${result.candidateDisplayId ? `&cid=${encodeURIComponent(result.candidateDisplayId)}` : ''}`);
                }
              };
              return (
                <div
                  key={result.id}
                  role="button"
                  tabIndex={0}
                  onClick={openDetail}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(); } }}
                  className={`text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3 ${status === 'Pending' ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSelectResult(result.id); }}
                      className="p-1 -m-1 hover:bg-brand-blue/10 rounded flex-shrink-0"
                    >
                      {selectedResults.includes(result.id) ? (
                        <CheckSquare className="w-4 h-4 text-brand-blue" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    <div className="w-9 h-9 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-semibold text-sm flex-shrink-0">
                      {(result.candidateName || 'U')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{result.candidateName}</p>
                      <p className="text-xs text-gray-500 truncate">{result.email}</p>
                    </div>
                    {result.candidateDisplayId && (
                      <span className="text-2xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded shrink-0">
                        {result.candidateDisplayId}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-600 truncate" title={result.assessmentName}>
                    {result.assessmentName}
                  </p>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={getStatusVariant(status)}>
                      {status}
                    </Badge>
                    {scoringDone && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        result.passFail === 'Pass' ? 'bg-success-subtle text-success ring-1 ring-success-line' : 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line'
                      }`}>
                        {result.passFail}
                      </span>
                    )}
                  </div>

                  {scoringDone && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${result.passFail === 'Pass' ? 'bg-success' : 'bg-destructive'}`}
                          style={{ width: `${Math.min(100, result.scorePercentage)}%` }}
                        />
                      </div>
                      <span className={`font-medium text-xs shrink-0 ${getScoreColor(result.scorePercentage)}`}>
                        {formatScore(result.scorePercentage)}%
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <span>{result.duration || (result.completionTime ? `${result.completionTime} min` : '—')}</span>
                    <span className="truncate">{result.completedDate || '—'}</span>
                  </div>

                  {status !== 'Pending' && (
                    <div
                      onClick={(e) => { e.stopPropagation(); openDetail(); }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Details
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-gray-200">
        {filteredResults.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-gray-400">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No assessment results found</p>
              {searchTerm && (
                <p className="text-xs mt-1">Try adjusting your search or filters</p>
              )}
            </div>
          </div>
        ) : (
          paginatedResults.map((result) => (
            <div key={result.id} className="p-4">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => handleSelectResult(result.id)}
                  className="p-1 hover:bg-brand-blue/10 rounded mt-1"
                >
                  {selectedResults.includes(result.id) ? (
                    <CheckSquare className="w-4 h-4 text-brand-blue" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {result.candidateDisplayId && (
                          <span className="inline-flex items-center text-xs font-mono font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                            {result.candidateDisplayId}
                          </span>
                        )}
                        <h3 className="text-sm text-gray-900 truncate">{result.candidateName}</h3>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{result.assessmentName}</p>
                    </div>
                    <Badge variant={getStatusVariant(getResultStatus(result))}>
                      {getResultStatus(result)}
                    </Badge>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 mb-3">
                    {enabledColumns.find(c => c.id === 'email') && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Mail className="w-3 h-3" />
                        {result.email}
                      </div>
                    )}
                    {enabledColumns.find(c => c.id === 'phone') && result.phone && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-600">
                        <Phone className="w-3 h-3 mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-0.5">
                          {splitPhoneNumbers(result.phone, 2).map((num, i) => <span key={i}>{num}</span>)}
                        </div>
                      </div>
                    )}
                    {enabledColumns.find(c => c.id === 'techScore') && (() => {
                      const scoringDone = result.scoring_status === 'completed';
                      const techRound = result.roundScores.find(r => r.roundName === 'Technical');
                      const techPct = techRound && techRound.maxScore > 0 ? (techRound.score / techRound.maxScore) * 100 : null;
                      if (!scoringDone || techPct === null) return null;
                      return (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <BarChart3 className="w-3 h-3" />
                          Tech: <span className={techPct >= 70 ? 'text-success' : 'text-destructive'}>{Math.round(techPct)}%</span>
                        </div>
                      );
                    })()}
                    {enabledColumns.find(c => c.id === 'codingScore') && (() => {
                      const scoringDone = result.scoring_status === 'completed';
                      const codingRound = result.roundScores.find(r => r.roundName === 'Coding');
                      const codingPct = codingRound && codingRound.maxScore > 0 ? (codingRound.score / codingRound.maxScore) * 100 : null;
                      if (!scoringDone || codingPct === null) return null;
                      return (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <BarChart3 className="w-3 h-3" />
                          Coding: <span className={codingPct >= 70 ? 'text-success' : 'text-destructive'}>{Math.round(codingPct)}%</span>
                        </div>
                      );
                    })()}
                    {enabledColumns.find(c => c.id === 'completed') && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Calendar className="w-3 h-3" />
                        {result.completedDate}
                      </div>
                    )}
                    {enabledColumns.find(c => c.id === 'duration') && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Clock className="w-3 h-3" />
                        {result.duration || (result.completionTime ? `${result.completionTime} min` : '-')}
                      </div>
                    )}
                  </div>

                  {/* Actions — always-visible (old-code behavior). */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        // Prefer the inline callback (keeps the origin
                        // breadcrumb) when provided; else standalone route.
                        if (onViewResultDetail) { onViewResultDetail(result, jobTitle); return; }
                        if (result.assessmentId) {
                          router.push(`/recruitment/assessments/${result.assessmentId}/results/details?candidate_id=${result.id}${result.candidateDisplayId ? `&cid=${encodeURIComponent(result.candidateDisplayId)}` : ''}`);
                        }
                      }}
                      className="flex-1"
                      icon={<Award className="w-3.5 h-3.5" />}
                    >
                      View Details
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDownloadPDF(result.id)}
                      disabled={downloadingPDF === result.id}
                      className="flex-1"
                      icon={downloadingPDF === result.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    >
                      {downloadingPDF === result.id ? 'Downloading...' : 'PDF'}
                    </Button>
                  </div>

                  {/* Expanded Details */}
                  {selectedResultDetail === result.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                      {/* Round Scores */}
                      <div>
                        <h4 className="text-xs text-gray-900 mb-2">Round-wise Scores</h4>
                        <div className="space-y-2">
                          {result.roundScores.map((round, idx) => (
                            <div key={idx} className="bg-gray-50/60 rounded-lg p-2 border border-gray-100">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-900">{round.roundName}</span>
                                <span className={`text-xs ${round.passFail === 'Pass' ? 'text-success' : 'text-destructive'}`}>
                                  {round.score}/{round.maxScore}
                                </span>
                              </div>
                              <div className="bg-gray-200 rounded-full h-1">
                                <div
                                  className={`h-1 rounded-full ${round.passFail === 'Pass' ? 'bg-success' : 'bg-destructive'}`}
                                  style={{ width: `${(round.score / round.maxScore) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* AI Summary */}
                      <div>
                        <h4 className="text-xs text-gray-900 mb-2">AI Summary</h4>
                        <div className="bg-brand-blue/5 rounded-lg p-3 border border-brand-blue/15">
                          <p className="text-xs text-gray-700 leading-relaxed">
                            {result.aiSummary}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer with selection info */}
      {selectedResults.length > 0 && (
        <div className="p-4 bg-brand-blue/5 border-t border-brand-blue/15">
          <div className="flex items-center justify-between">
            <span className="text-sm text-brand-blue">
              {selectedResults.length} result{selectedResults.length !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setSelectedResults([])}
              className="text-sm text-brand-blue hover:text-brand-blue-2"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {filteredResults.length > 0 && (
        <Pagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={filteredResults.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); }}
        />
      )}

      {/* Export Format & Scope Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto">
            {/* Step 1: Format Selection */}
            {exportStep === 'format' && (
              <>
                <div className="flex items-center justify-between p-3 sm:p-5 border-b border-gray-200">
                  <div>
                    <h3 className="text-base sm:text-lg font-medium text-gray-900">Export Assessment Results</h3>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">Step 1 of 2: Choose format</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                   aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5">
                  <p className="text-sm text-gray-600 mb-4">Choose export format:</p>

                  <div className="space-y-3">
                    <button
                      onClick={() => handleFormatSelect('csv')}
                      className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group"
                    >
                      <div className="w-12 h-12 bg-success-subtle rounded-lg flex items-center justify-center group-hover:bg-success-subtle transition-colors">
                        <FileDown className="w-6 h-6 text-success" />
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-medium text-gray-900">CSV Format</div>
                        <div className="text-sm text-gray-500">Compatible with Excel, Google Sheets, and most spreadsheet apps</div>
                      </div>
                    </button>

                    <button
                      onClick={() => handleFormatSelect('excel')}
                      className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group"
                    >
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                        <FileDown className="w-6 h-6 text-blue-700" />
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-medium text-gray-900">Excel Format (XLSX)</div>
                        <div className="text-sm text-gray-500">Native Excel format with better formatting and compatibility</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200">
                </div>
              </>
            )}

            {/* Step 2: Scope Selection */}
            {exportStep === 'scope' && (
              <>
                <div className="flex items-center justify-between p-5 border-b border-gray-200">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Export Scope</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Step 2 of 2: Choose what to export ({selectedFormat === 'csv' ? 'CSV' : 'Excel'})
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                   aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5">
                  <p className="text-sm text-gray-600 mb-4">
                    {selectedResults.length > 0
                      ? `Export ${selectedResults.length} selected result${selectedResults.length !== 1 ? 's' : ''}:`
                      : areColumnsCustomized()
                        ? 'Export scope (with selected columns):'
                        : 'Select export scope:'}
                  </p>

                  <div className="space-y-3">
                    {selectedResults.length > 0 ? (
                      /* Candidates selected via checkbox → export only selected */
                      <button
                        onClick={exportAllFiltered}
                        className="w-full flex items-center gap-4 p-4 border-2 border-indigo-500 rounded-lg hover:bg-indigo-50 transition-all group"
                      >
                        <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                          <Download className="w-6 h-6 text-indigo-700" />
                        </div>
                        <div className="text-left flex-1">
                          <div className="font-medium text-gray-900">
                            Export {selectedResults.length} Selected Result{selectedResults.length !== 1 ? 's' : ''}
                          </div>
                          <div className="text-sm text-gray-500">
                            Export with {enabledColumns.length} columns
                          </div>
                        </div>
                      </button>
                    ) : areColumnsCustomized() ? (
                      /* No selection + columns customized → "All Filtered Results" with column count */
                      <button
                        onClick={exportAllFiltered}
                        className="w-full flex items-center gap-4 p-4 border-2 border-indigo-500 rounded-lg hover:bg-indigo-50 transition-all group"
                      >
                        <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                          <Download className="w-6 h-6 text-indigo-700" />
                        </div>
                        <div className="text-left flex-1">
                          <div className="font-medium text-gray-900">All Filtered Results</div>
                          <div className="text-sm text-gray-500">
                            Export all {filteredResults.length} results with {enabledColumns.length} selected columns
                            <div className="text-xs text-indigo-600 mt-1">
                              (includes completed, in-progress, and pending)
                            </div>
                          </div>
                        </div>
                      </button>
                    ) : (
                      /* No selection + all columns → "Current Page" */
                      <button
                        onClick={exportCurrentPage}
                        className="w-full flex items-center gap-4 p-4 border-2 border-purple-500 rounded-lg hover:bg-purple-50 transition-all group"
                      >
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                          <FileDown className="w-6 h-6 text-purple-700" />
                        </div>
                        <div className="text-left flex-1">
                          <div className="font-medium text-gray-900">Current Page</div>
                          <div className="text-sm text-gray-500">
                            Export {filteredResults.length} results visible on this page
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 p-5 border-t border-gray-200">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setExportStep('format')}
                    icon={<ArrowLeft className="w-4 h-4" />}
                  >
                    Back
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
