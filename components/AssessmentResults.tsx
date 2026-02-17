import { ArrowLeft, User, Clock, Award, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, TrendingUp, Calendar, Briefcase, AlertCircle, Info, Filter, Layers, Search, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Mail, Phone, BarChart3, SlidersHorizontal, Columns3, Trash2, Users, Download, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { assessmentService } from '@/lib/services';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import {
  calculateFinalResult,
  QuestionScore,
  FinalAssessmentResult,
  getScoringBreakdown
} from '@/lib/utils/assessmentScoring';

interface AssessmentResultsProps {
  onBack: () => void;
  assessmentId: string;
  assessmentTitle: string;
  jdTitle?: string;
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
  completedDate: string;
  duration: string;
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

export default function AssessmentResults({ onBack, assessmentId, assessmentTitle, jdTitle }: AssessmentResultsProps) {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [candidateResults, setCandidateResults] = useState<CandidateResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  // Assessment details (which rounds are enabled)
  const [assessmentDetails, setAssessmentDetails] = useState<AssessmentDetails | null>(null);

  // Round-based filtering with dropdown options (HR removed - only Tech and Coding)
  const [roundFilters, setRoundFilters] = useState<{
    technical?: 'all' | '50-70' | '70-90' | '90+';
    coding?: 'all' | '50-70' | '70-90' | '90+';
  }>({});

  // Pass/Fail filter
  const [passFailFilter, setPassFailFilter] = useState<'all' | 'pass' | 'fail'>('all');

  // AS-24: Column customization
  const COLUMN_PREFERENCES_KEY = 'assessment_results_columns_v2';
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Export format modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStep, setExportStep] = useState<'format' | 'scope'>('format');
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'excel'>('excel');

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
      { id: 'status', label: 'Status', enabled: true },
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
        });
      } catch (error) {
        console.error('Failed to fetch assessment details:', error);
      }
    };
    fetchAssessmentDetails();
  }, [assessmentId]);

  // Track total items from server (for pagination)
  const [totalItems, setTotalItems] = useState(0);

  // Fetch results from API with server-side pagination and filters
  useEffect(() => {
    const fetchResults = async () => {
      setIsLoading(true);
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

        const response = await assessmentService.listResults(assessmentId, params);
        if (response?.items) {
          // Map API response to component format
          const mapped: CandidateResult[] = response.items.map((item: any, index: number) => {
            // Determine status - mark as "In Progress" or "Completed"
            let status: 'Completed' | 'In Progress' | 'Pending' = 'Completed';
            if (item.status === 'pending') {
              status = 'Pending';
            } else if (item.status === 'in_progress') {
              status = 'In Progress';
            } else if (item.status === 'completed') {
              status = 'Completed';
            }

            // Calculate scores using the formula: (total_marks_in_round / total_marks_of_round) * 100
            // The API returns scores as percentages already, so we use them directly
            const tech_score = item.technical_score != null ? Math.round(Number(item.technical_score)) : undefined;
            const coding_score = item.coding_score != null ? Math.round(Number(item.coding_score)) : undefined;
            const hr_score = item.hr_score != null ? Math.round(Number(item.hr_score)) : undefined;

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
              score: Math.round(Number(item.overall_score) || 0),
              totalScore: 100,
              percentage: Math.round(Number(item.overall_score) || 0),
              tech_score,
              coding_score,
              hr_score,
              status,
              completedDate: (() => {
                const dateStr = item.completed_at || item.started_at;
                if (!dateStr) return status === 'Pending' ? 'Not started' : 'N/A';
                // Convert UTC to IST and format as date
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-US', {
                  timeZone: 'Asia/Kolkata',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                });
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

          // Set stats from API
          setApiStats({
            completed_count: response.completed_count || mapped.filter((c: CandidateResult) => c.status === 'Completed').length,
            in_progress_count: response.in_progress_count || mapped.filter((c: CandidateResult) => c.status === 'In Progress').length,
            pending_count: response.pending_count || mapped.filter((c: CandidateResult) => c.status === 'Pending').length,
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
      }
    };

    fetchResults();
  }, [assessmentId, currentPage, pageSize, searchQuery, statusFilter, passFailFilter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'Completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'In Progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Handle delete result
  const handleDeleteResult = async (resultId: string, candidateName: string) => {
    if (!await dialog.confirm({ title: 'Delete Result', message: `Are you sure you want to delete the result for ${candidateName}? This action cannot be undone.`, variant: 'error', confirmText: 'Delete' })) {
      return;
    }
    setIsDeleting(resultId);
    try {
      await assessmentService.deleteResult(assessmentId, resultId);
      // Remove from local state
      setCandidateResults(prev => prev.filter(c => c.id !== resultId));
      // Update stats
      const deletedCandidate = candidateResults.find(c => c.id === resultId);
      if (deletedCandidate) {
        setApiStats(prev => ({
          ...prev,
          completed_count: Math.max(0, prev.completed_count - (deletedCandidate.status === 'Completed' ? 1 : 0)),
          in_progress_count: Math.max(0, prev.in_progress_count - (deletedCandidate.status === 'In Progress' ? 1 : 0)),
          pending_count: Math.max(0, prev.pending_count - (deletedCandidate.status === 'Pending' ? 1 : 0)),
        }));
      }
    } catch (error) {
      console.error('Failed to delete result:', error);
      toast.error('Failed to delete result. Please try again.');
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

  // AS-25: Handle PDF download for individual result
  const handleDownloadPDF = async (resultId: string) => {
    if (downloadingPDF) return;

    setDownloadingPDF(resultId);
    try {
      const blob = await assessmentService.exportPDF(resultId);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Assessment_Report_${resultId}.pdf`;
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

    setDownloadingBulkPDF(true);
    try {
      const blob = await assessmentService.exportResultsBulkPDFs(assessmentId, selectedRows);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `${assessmentTitle.replace(/\s+/g, '_')}_Reports_${timestamp}.zip`;
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
      toast.success(`Current page exported to ${formatName} successfully! (${currentPageCandidates.length} results)`);
      setShowExportModal(false);
      setExportStep('format');
    } catch (error) {
      console.error('Failed to export current page:', error);
      toast.error('Failed to export results. Please try again.');
    }
  };

  // Export all filtered results
  const handleExportAllFiltered = async () => {
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
      toast.success(`All filtered results exported to ${formatName} successfully! (${filteredCandidates.length} results including in-progress)`);
      setShowExportModal(false);
      setExportStep('format');
    } catch (error) {
      console.error('Failed to export all results:', error);
      toast.error('Failed to export results. Please try again.');
    }
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-gray-800';
    if (percentage >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Reset to page 1 when filters change (MUST be before any early returns)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, passFailFilter, roundFilters]);

  // Use API results only (no mock data)
  const displayResults = candidateResults;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading assessment results...</p>
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

  // Calculate pagination from server total
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  // Use API stats if available, otherwise calculate from data
  const completedCount = candidateResults.length > 0 ? apiStats.completed_count : filteredCandidates.filter(c => c.status === 'Completed').length;
  const inProgressCount = candidateResults.length > 0 ? apiStats.in_progress_count : filteredCandidates.filter(c => c.status === 'In Progress').length;
  const pendingCount = candidateResults.length > 0 ? apiStats.pending_count : filteredCandidates.filter(c => c.status === 'Pending').length;

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-8 py-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-gray-900 mb-2">{assessmentTitle}</h1>
              <p className="text-sm text-gray-600">
                Assessment Results - {totalItems} total candidates
                {selectedRows.length > 0 && (
                  <span className="ml-2 text-gray-800 font-medium">
                    • {selectedRows.length} selected
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* AS-26: Bulk PDF Download Button */}
              {selectedRows.length > 0 && (
                <button
                  onClick={handleDownloadBulkPDFs}
                  disabled={downloadingBulkPDF}
                  className="px-6 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloadingBulkPDF ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                  {downloadingBulkPDF ? 'Downloading...' : `Download PDFs (${selectedRows.length})`}
                </button>
              )}
              <button
                onClick={() => setShowExportModal(true)}
                className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
              >
                <FileText className="w-5 h-5" />
                Export Results
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="px-8 py-6">

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-sm mb-1">Total Candidates</div>
                <div className="text-2xl text-gray-900">{displayResults.length}</div>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-gray-800" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-sm mb-1">Completed</div>
                <div className="text-2xl text-green-600">{completedCount}</div>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-sm mb-1">In Progress</div>
                <div className="text-2xl text-blue-600">{inProgressCount}</div>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-sm mb-1">Pending</div>
                <div className="text-2xl text-gray-600">{pendingCount}</div>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </div>
        </div>

        {/* AS-23: Search and Filter Bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, phone, or JD title..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'all' | 'Completed' | 'In Progress' | 'Pending');
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent text-sm"
              >
                <option value="all">All</option>
                <option value="Completed">Completed</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending">Pending</option>
              </select>
            </div>

            {/* Pass/Fail Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">Result:</label>
              <select
                value={passFailFilter}
                onChange={(e) => {
                  setPassFailFilter(e.target.value as 'all' | 'pass' | 'fail');
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent text-sm"
              >
                <option value="all">All</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
              </select>
            </div>

            {/* Round-based Filters */}
            {assessmentDetails?.technical_enabled && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">Tech:</label>
                <select
                  value={roundFilters.technical || 'all'}
                  onChange={(e) => {
                    const value = e.target.value as 'all' | '50-70' | '70-90' | '90+';
                    setRoundFilters(prev => value === 'all' ? { ...prev, technical: undefined } : { ...prev, technical: value });
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent text-sm"
                >
                  <option value="all">All</option>
                  <option value="50-70">50-70%</option>
                  <option value="70-90">70-90%</option>
                  <option value="90+">90%+</option>
                </select>
              </div>
            )}

            {assessmentDetails?.coding_enabled && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">Coding:</label>
                <select
                  value={roundFilters.coding || 'all'}
                  onChange={(e) => {
                    const value = e.target.value as 'all' | '50-70' | '70-90' | '90+';
                    setRoundFilters(prev => value === 'all' ? { ...prev, coding: undefined } : { ...prev, coding: value });
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent text-sm"
                >
                  <option value="all">All</option>
                  <option value="50-70">50-70%</option>
                  <option value="70-90">70-90%</option>
                  <option value="90+">90%+</option>
                </select>
              </div>
            )}

            {/* Clear Filters Button */}
            {(Object.keys(roundFilters).length > 0 || searchQuery || statusFilter !== 'all' || passFailFilter !== 'all') && (
              <button
                onClick={() => {
                  setRoundFilters({});
                  setSearchQuery('');
                  setStatusFilter('all');
                  setPassFailFilter('all');
                  setCurrentPage(1);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}

            {/* AS-24: Customize Columns Button */}
            <div className="relative">
              <button
                onClick={() => setShowColumnSelector(!showColumnSelector)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-700"
              >
                <Columns3 className="w-4 h-4" />
                Columns ({enabledColumnsCount})
              </button>

              {showColumnSelector && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowColumnSelector(false)}
                  ></div>
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20 max-h-96 overflow-y-auto">
                    <div className="px-4 py-2 border-b border-gray-200">
                      <div className="text-sm font-medium text-gray-900">Select Columns</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {enabledColumnsCount} of {columns.length} selected
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
                          className="w-4 h-4 text-gray-800 rounded border-gray-300 focus:ring-gray-500"
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

        {/* Candidates Results Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-gray-900">Candidate Results</h2>
            <div className="text-sm text-gray-500">
              {selectedRows.length > 0 && `${selectedRows.length} selected`}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedRows.length === paginatedCandidates.length && paginatedCandidates.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-800"
                    />
                  </th>
                  {isColumnEnabled('cid') && (
                    <th className="text-left px-4 py-3 text-xs text-gray-600">CID</th>
                  )}
                  {isColumnEnabled('candidate') && (
                    <th
                      className="text-left px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        Candidate
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'name' ? 'text-gray-800' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('email') && (
                    <th className="text-left px-4 py-3 text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        Email
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('jdTitle') && (
                    <th className="text-left px-4 py-3 text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        JD Title
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('phone') && (
                    <th className="text-left px-4 py-3 text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        Phone
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('inviteSource') && (
                    <th className="text-left px-4 py-3 text-xs text-gray-600">Invite Source</th>
                  )}
                  {isColumnEnabled('techScore') && assessmentDetails?.technical_enabled && (
                    <th
                      className="text-center px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('score')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Tech Score
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'score' ? 'text-gray-800' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('codingScore') && assessmentDetails?.coding_enabled && (
                    <th
                      className="text-center px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('score')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Coding Score
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'score' ? 'text-gray-800' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('status') && (
                    <th
                      className="text-center px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Status
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'status' ? 'text-gray-800' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('completed') && (
                    <th
                      className="text-left px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center gap-1">
                        Completed
                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'date' ? 'text-gray-800' : 'text-gray-400'}`} />
                      </div>
                    </th>
                  )}
                  {isColumnEnabled('duration') && (
                    <th className="text-center px-4 py-3 text-xs text-gray-600">Duration</th>
                  )}
                  <th className="text-center px-4 py-3 text-xs text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={enabledColumnsCount + 2} className="px-6 py-12 text-center">
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
                    <tr key={candidate.id} className={`hover:bg-gray-50 transition-colors ${selectedRows.includes(candidate.id) ? 'bg-gray-50' : ''}`}>
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(candidate.id)}
                          onChange={(e) => handleSelectRow(candidate.id, e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-gray-800"
                        />
                      </td>
                      {isColumnEnabled('cid') && (
                        <td className="px-4 py-4">
                          <span className="text-xs font-mono font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded">
                            {candidate.candidateDisplayId || '-'}
                          </span>
                        </td>
                      )}
                      {isColumnEnabled('candidate') && (
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-xs">
                              {(candidate.name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div className="text-sm text-gray-900 font-medium">{candidate.name || 'Unknown'}</div>
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('email') && (
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-600">{candidate.email}</div>
                        </td>
                      )}
                      {isColumnEnabled('jdTitle') && (
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-600 truncate max-w-[200px]" title={jdTitle || 'N/A'}>
                            {jdTitle || 'N/A'}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('phone') && (
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-600">{candidate.phone || '-'}</div>
                        </td>
                      )}
                      {isColumnEnabled('inviteSource') && (
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">
                            {candidate.inviteSource || 'Manual'}
                          </span>
                        </td>
                      )}
                      {isColumnEnabled('techScore') && assessmentDetails?.technical_enabled && (
                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-lg font-semibold ${candidate.tech_score !== undefined ? getScoreColor(candidate.tech_score) : 'text-gray-400'}`}>
                              {candidate.tech_score !== undefined ? `${candidate.tech_score}%` : '-'}
                            </span>
                            {candidate.tech_score !== undefined && (
                              <span className={`text-xs font-medium ${candidate.tech_score >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                                {candidate.tech_score >= 50 ? 'Pass' : 'Fail'}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('codingScore') && assessmentDetails?.coding_enabled && (
                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-lg font-semibold ${candidate.coding_score !== undefined ? getScoreColor(candidate.coding_score) : 'text-gray-400'}`}>
                              {candidate.coding_score !== undefined ? `${candidate.coding_score}%` : '-'}
                            </span>
                            {candidate.coding_score !== undefined && (
                              <span className={`text-xs font-medium ${candidate.coding_score >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                                {candidate.coding_score >= 50 ? 'Pass' : 'Fail'}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnEnabled('status') && (
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${getStatusColor(candidate.status)}`}>
                            {candidate.status}
                          </span>
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
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => router.push(`/recruitment/assessments/${assessmentId}/results/details?candidate_id=${candidate.id}`)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            title="View Details"
                          >
                            <Award className="w-3 h-3" />
                            View Details
                          </button>
                          {/* AS-25: PDF Download Button */}
                          {candidate.status === 'Completed' ? (
                            <button
                              onClick={() => handleDownloadPDF(assessmentId)}
                              disabled={downloadingPDF === assessmentId}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Download PDF Report"
                            >
                              {downloadingPDF === assessmentId ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                              PDF
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleDeleteResult(candidate.id, candidate.name)}
                            disabled={isDeleting === candidate.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {isDeleting === candidate.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                            Delete
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
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {startIndex + 1} to {Math.min(endIndex, totalItems)} of {totalItems} results
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-1.5 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-1.5 text-sm rounded-md ${
                          currentPage === pageNum
                            ? 'bg-gray-800 text-white'
                            : 'border border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export Format & Scope Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            {/* Step 1: Format Selection */}
            {exportStep === 'format' && (
              <>
                <div className="flex items-center justify-between p-5 border-b border-gray-200">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Export Assessment Results</h3>
                    <p className="text-sm text-gray-500 mt-1">Step 1 of 2: Choose format</p>
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
                        <FileText className="w-6 h-6 text-green-700" />
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
                        <FileText className="w-6 h-6 text-blue-700" />
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
                    {areColumnsCustomized()
                      ? 'Export scope (with selected columns):'
                      : 'Select export scope:'}
                  </p>

                  <div className="space-y-3">
                    {/* Show "All Filtered Results" if columns are customized */}
                    {areColumnsCustomized() ? (
                      <button
                        onClick={handleExportAllFiltered}
                        className="w-full flex items-center gap-4 p-4 border-2 border-indigo-500 rounded-lg hover:bg-indigo-50 transition-all group"
                      >
                        <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                          <Users className="w-6 h-6 text-indigo-700" />
                        </div>
                        <div className="text-left flex-1">
                          <div className="font-medium text-gray-900">All Filtered Results</div>
                          <div className="text-sm text-gray-500">
                            Export all {filteredCandidates.length} results with {enabledColumnsCount} selected columns
                            <div className="text-xs text-indigo-600 mt-1">
                              (includes completed, in-progress, and pending)
                            </div>
                          </div>
                        </div>
                      </button>
                    ) : (
                      /* Show "Current Page" if columns are NOT customized */
                      <button
                        onClick={handleExportCurrentPage}
                        className="w-full flex items-center gap-4 p-4 border-2 border-purple-500 rounded-lg hover:bg-purple-50 transition-all group"
                      >
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                          <FileText className="w-6 h-6 text-purple-700" />
                        </div>
                        <div className="text-left flex-1">
                          <div className="font-medium text-gray-900">Current Page</div>
                          <div className="text-sm text-gray-500">
                            Export {paginatedCandidates.length} results visible on this page
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
