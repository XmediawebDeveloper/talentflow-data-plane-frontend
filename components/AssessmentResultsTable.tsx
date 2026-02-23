import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, Download, FileDown, CheckSquare, Square, X, Eye, BarChart3, Calendar, Mail, Phone, Clock, CheckCircle, XCircle, FileText, Archive, Loader2, Trash2, Award, Play } from 'lucide-react';
import React from 'react';
import { useRouter } from 'next/navigation';
import { assessmentService } from '@/lib/services/assessmentService';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';

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
}

export default function AssessmentResultsTable({ results, jobTitle, jobId = 'jd-1', onViewResultDetail }: AssessmentResultsTableProps) {
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
    { id: 'inviteSource', label: 'Invite Source', enabled: true },
    ...(hasTechnicalRound ? [{ id: 'techScore', label: 'Tech Score', enabled: true }] : []),
    ...(hasCodingRound ? [{ id: 'codingScore', label: 'Coding Score', enabled: true }] : []),
    { id: 'status', label: 'Status', enabled: true },
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
    if (result.status === 'completed' || result.completed_at) return 'Completed';
    if (result.status === 'in_progress' || result.started_at) return 'In Progress';
    if (result.status === 'pending') return 'Pending';
    // Fallback: check completedDate string
    if (result.completedDate && result.completedDate !== 'In Progress' && result.completedDate !== 'Not started') return 'Completed';
    if (result.completedDate === 'In Progress') return 'In Progress';
    return 'Pending';
  };

  // Helper: status badge colors
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'In Progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Pending': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Helper: format timeline date
  const formatTimelineDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    const dateWithZ = dateStr + (dateStr.includes('Z') ? '' : 'Z');
    const date = new Date(dateWithZ);
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Handle delete result with timeout
  const handleDeleteResult = async (result: AssessmentResult) => {
    if (!result.assessmentId) {
      toast.error('Assessment ID not found for this result.');
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Delete Result',
      message: `Are you sure you want to delete the result for ${result.candidateName}? This action cannot be undone.`,
      variant: 'error',
      confirmText: 'Delete',
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
      const assessmentId = jobId;
      const blob = await assessmentService.exportResults(
        assessmentId,
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
      const assessmentId = jobId;
      const blob = await assessmentService.exportResults(
        assessmentId,
        selectedFormat,
        false,
        enabledColumns.map(c => c.id),
        buildExportFilters()
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
      const safeName = result?.candidateName?.replace(/[^a-zA-Z0-9]/g, '_') || resultId;
      link.download = `Assessment_Report_${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      console.log('[PDF] Download complete:', safeName);
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

    // Get assessmentId from first selected result
    const firstResult = results.find(r => selectedResults.includes(r.id));
    const assessmentId = firstResult?.assessmentId || jobId;

    setDownloadingBulkPDF(true);
    try {
      const blob = await assessmentService.exportResultsBulkPDFs(assessmentId, selectedResults);

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
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs border border-green-300">
          <CheckCircle className="w-3 h-3" />
          Pass
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs border border-red-300">
        <XCircle className="w-3 h-3" />
        Fail
      </span>
    );
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-gray-800';
    if (percentage >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-3 sm:p-4 md:p-6 border-b border-gray-200">
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
            {/* Export Excel */}
            {selectedResults.length === 0 && (
              <button
                onClick={handleExportExcel}
                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1.5 sm:gap-2"
              >
                <FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Export to Excel</span>
                <span className="sm:hidden">Export</span>
              </button>
            )}

            {/* Bulk Actions - When items are selected */}
            {selectedResults.length > 0 && (
              <>
                <button
                  onClick={handleDownloadBulkPDFs}
                  disabled={downloadingBulkPDF}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 text-gray-900 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloadingBulkPDF ? (
                    <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                  ) : (
                    <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                  {downloadingBulkPDF ? 'Downloading...' : `PDFs (${selectedResults.length})`}
                </button>
                <button
                  onClick={handleExportExcel}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-1.5 sm:gap-2"
                >
                  <FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Export
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search and Inline Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex-1 min-w-[150px] sm:min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-black"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'Completed' | 'In Progress' | 'Pending')}
              className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent text-xs sm:text-sm text-black"
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
              className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent text-xs sm:text-sm text-black"
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
                className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent text-xs sm:text-sm text-black"
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
                className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent text-xs sm:text-sm text-black"
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
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}

          {/* Column Selector */}
          <div className="relative">
            <button
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Columns ({enabledColumns.length})
            </button>

            {showColumnSelector && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowColumnSelector(false)}
                ></div>
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20 max-h-96 overflow-y-auto">
                  <div className="px-4 py-2 border-b border-gray-200">
                    <div className="text-sm text-gray-900">Select Columns</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {enabledColumns.length} of {columns.length} selected
                    </div>
                  </div>
                  {columns.map((column) => (
                    <label
                      key={column.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={column.enabled}
                        onChange={() => handleToggleColumn(column.id)}
                        className="w-4 h-4 text-gray-800 rounded"
                      />
                      <span className="text-sm text-gray-700">{column.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 w-12">
                <button onClick={handleSelectAll} className="p-1 hover:bg-gray-100 rounded">
                  {selectedResults.length === filteredResults.length && filteredResults.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-gray-800" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </th>
              {enabledColumns.map((col) => (
                <th key={col.id} className="text-left py-3 px-4 text-sm text-gray-600">
                  {col.label}
                </th>
              ))}
              <th className="text-left py-3 px-4 text-sm text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.length === 0 ? (
              <tr>
                <td colSpan={enabledColumns.length + 2} className="py-12 text-center">
                  <div className="text-gray-400">
                    <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No assessment results found</p>
                    {searchTerm && (
                      <p className="text-xs mt-1">Try adjusting your search or filters</p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredResults.map((result, index) => (
                <React.Fragment key={result.id}>
                  <tr
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleSelectResult(result.id)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        {selectedResults.includes(result.id) ? (
                          <CheckSquare className="w-4 h-4 text-gray-800" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </td>

                    {enabledColumns.map((col) => {
                      if (col.id === 'cid') {
                        return (
                          <td key={col.id} className="py-3 px-4">
                            <span className="text-xs font-mono font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded">
                              {result.candidateDisplayId || '-'}
                            </span>
                          </td>
                        );
                      }
                      if (col.id === 'candidateName') {
                        return (
                          <td key={col.id} className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-xs">
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
                            <div className="text-sm text-gray-600">{result.phone || '-'}</div>
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
                          <td key={col.id} className="py-3 px-4">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">
                              {result.inviteSource || 'Manual'}
                            </span>
                          </td>
                        );
                      }
                      if (col.id === 'scorePercentage') {
                        return (
                          <td key={col.id} className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm ${getScoreColor(result.scorePercentage)}`}>
                                {result.scorePercentage}%
                              </span>
                              <span className="text-xs text-gray-400">
                                ({result.totalScore}/{result.maxScore})
                              </span>
                            </div>
                          </td>
                        );
                      }
                      if (col.id === 'techScore') {
                        const techRound = result.roundScores.find(r => r.roundName === 'Technical');
                        const techPct = techRound ? Math.round((techRound.score / techRound.maxScore) * 100) : null;
                        return (
                          <td key={col.id} className="py-3 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-lg font-semibold ${techPct !== null ? getScoreColor(techPct) : 'text-gray-400'}`}>
                                {techPct !== null ? `${techPct}%` : '-'}
                              </span>
                              {techPct !== null && (
                                <span className={`text-xs font-medium ${techPct >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                                  {techPct >= 50 ? 'Pass' : 'Fail'}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      }
                      if (col.id === 'codingScore') {
                        const codingRound = result.roundScores.find(r => r.roundName === 'Coding');
                        const codingPct = codingRound ? Math.round((codingRound.score / codingRound.maxScore) * 100) : null;
                        return (
                          <td key={col.id} className="py-3 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-lg font-semibold ${codingPct !== null ? getScoreColor(codingPct) : 'text-gray-400'}`}>
                                {codingPct !== null ? `${codingPct}%` : '-'}
                              </span>
                              {codingPct !== null && (
                                <span className={`text-xs font-medium ${codingPct >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                                  {codingPct >= 50 ? 'Pass' : 'Fail'}
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
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${getStatusBadgeColor(displayStatus)}`}>
                              {displayStatus}
                            </span>
                          </td>
                        );
                      }
                      if (col.id === 'timeline') {
                        return (
                          <td key={col.id} className="py-3 px-4 text-xs text-gray-500">
                            <div className="space-y-1">
                              {result.sent_at && (
                                <div className="flex items-center gap-2">
                                  <Mail className="w-3 h-3 text-blue-500" />
                                  <span>Sent: {formatTimelineDate(result.sent_at)}</span>
                                </div>
                              )}
                              {result.started_at && (
                                <div className="flex items-center gap-2">
                                  <Play className="w-3 h-3 text-yellow-500" />
                                  <span>Started: {formatTimelineDate(result.started_at)}</span>
                                </div>
                              )}
                              {result.completed_at && (
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3 text-green-500" />
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

                    {/* Actions */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {getResultStatus(result) !== 'Pending' && (
                        <button
                          onClick={() => {
                            if (result.assessmentId) {
                              router.push(`/recruitment/assessments/${result.assessmentId}/results/details?candidate_id=${result.id}`);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                          title="View Details"
                        >
                          <Award className="w-3 h-3" />
                          View Details
                        </button>
                        )}
                        {getResultStatus(result) === 'Completed' && (
                          <button
                            onClick={() => handleDownloadPDF(result.id)}
                            disabled={downloadingPDF === result.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Download PDF Report"
                          >
                            {downloadingPDF === result.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                            PDF
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteResult(result)}
                          disabled={isDeleting !== null && isDeleting === result.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {isDeleting !== null && isDeleting === result.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Detail Row */}
                  {selectedResultDetail === result.id && (
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <td colSpan={enabledColumns.length + 2} className="p-6">
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
                                        <span className={`text-sm ${round.passFail === 'Pass' ? 'text-green-600' : 'text-red-600'}`}>
                                          {round.score}/{round.maxScore}
                                        </span>
                                        {round.passFail === 'Pass' ? (
                                          <CheckCircle className="w-4 h-4 text-green-600" />
                                        ) : (
                                          <XCircle className="w-4 h-4 text-red-600" />
                                        )}
                                      </div>
                                    </div>
                                    <div className="bg-gray-200 rounded-full h-1.5">
                                      <div
                                        className={`h-1.5 rounded-full ${round.passFail === 'Pass' ? 'bg-green-600' : 'bg-red-600'}`}
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
                              <div className="bg-gradient-to-br from-gray-50 to-gray-50 rounded-lg p-4 border border-gray-200">
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
          filteredResults.map((result) => (
            <div key={result.id} className="p-4">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => handleSelectResult(result.id)}
                  className="p-1 hover:bg-gray-100 rounded mt-1"
                >
                  {selectedResults.includes(result.id) ? (
                    <CheckSquare className="w-4 h-4 text-gray-800" />
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
                          <span className="text-xs font-mono font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                            {result.candidateDisplayId}
                          </span>
                        )}
                        <h3 className="text-sm text-gray-900 truncate">{result.candidateName}</h3>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{result.assessmentName}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${getStatusBadgeColor(getResultStatus(result))}`}>
                      {getResultStatus(result)}
                    </span>
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
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Phone className="w-3 h-3" />
                        {result.phone}
                      </div>
                    )}
                    {enabledColumns.find(c => c.id === 'techScore') && (() => {
                      const techRound = result.roundScores.find(r => r.roundName === 'Technical');
                      const techPct = techRound ? Math.round((techRound.score / techRound.maxScore) * 100) : null;
                      return techPct !== null ? (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <BarChart3 className="w-3 h-3" />
                          Tech: <span className={getScoreColor(techPct)}>{techPct}%</span>
                        </div>
                      ) : null;
                    })()}
                    {enabledColumns.find(c => c.id === 'codingScore') && (() => {
                      const codingRound = result.roundScores.find(r => r.roundName === 'Coding');
                      const codingPct = codingRound ? Math.round((codingRound.score / codingRound.maxScore) * 100) : null;
                      return codingPct !== null ? (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <BarChart3 className="w-3 h-3" />
                          Coding: <span className={getScoreColor(codingPct)}>{codingPct}%</span>
                        </div>
                      ) : null;
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

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {getResultStatus(result) !== 'Pending' && (
                    <button
                      onClick={() => {
                        if (result.assessmentId) {
                          router.push(`/recruitment/assessments/${result.assessmentId}/results/details?candidate_id=${result.id}`);
                        }
                      }}
                      className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Award className="w-3.5 h-3.5" />
                      View Details
                    </button>
                    )}
                    {getResultStatus(result) === 'Completed' && (
                      <button
                        onClick={() => handleDownloadPDF(result.id)}
                        disabled={downloadingPDF === result.id}
                        className="flex-1 px-3 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {downloadingPDF === result.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        {downloadingPDF === result.id ? 'Downloading...' : 'PDF'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteResult(result)}
                      disabled={isDeleting !== null && isDeleting === result.id}
                      className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isDeleting !== null && isDeleting === result.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Delete
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {selectedResultDetail === result.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                      {/* Round Scores */}
                      <div>
                        <h4 className="text-xs text-gray-900 mb-2">Round-wise Scores</h4>
                        <div className="space-y-2">
                          {result.roundScores.map((round, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-900">{round.roundName}</span>
                                <span className={`text-xs ${round.passFail === 'Pass' ? 'text-green-600' : 'text-red-600'}`}>
                                  {round.score}/{round.maxScore}
                                </span>
                              </div>
                              <div className="bg-gray-200 rounded-full h-1">
                                <div
                                  className={`h-1 rounded-full ${round.passFail === 'Pass' ? 'bg-green-600' : 'bg-red-600'}`}
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
                        <div className="bg-gradient-to-br from-gray-50 to-gray-50 rounded-lg p-3 border border-gray-200">
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
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {selectedResults.length} result{selectedResults.length !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setSelectedResults([])}
              className="text-sm text-gray-800 hover:text-gray-900"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* Export Format & Scope Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
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
                  >
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
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                        <FileDown className="w-6 h-6 text-green-700" />
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
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
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
                  >
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
                  <button
                    onClick={() => setExportStep('format')}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportStep('format');
                    }}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
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
  );
}