import { ArrowLeft, User, Clock, Award, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, TrendingUp, Calendar, Briefcase, AlertCircle, Info, Filter, Layers, Search, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Mail, Phone, BarChart3, SlidersHorizontal, Columns3, Trash2, Users, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { assessmentService, DetailedResultResponse, QuestionEvaluation, RoundScore } from '@/lib/services';
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
  name: string;
  email: string;
  phone?: string;
  inviteSource?: string;
  avatar?: string;
  score: number;
  totalScore: number;
  percentage: number;
  status: 'Passed' | 'Failed' | 'Under Review' | 'In Progress' | 'Pending';
  completedDate: string;
  duration: string;
  sections: SectionResult[];
  round: number; // Added round tracking
  roundName?: string; // Optional round name
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
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('technical-knowledge'); // For section tabs
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all'); // Round filter
  const [selectedDetailRound, setSelectedDetailRound] = useState<number | 'all'>('all'); // Round filter for detail view
  const [candidateResults, setCandidateResults] = useState<CandidateResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiStats, setApiStats] = useState<{ completed_count: number; passed_count: number; failed_count: number; in_progress_count: number; pending_count: number; average_score: number | null }>({ completed_count: 0, passed_count: 0, failed_count: 0, in_progress_count: 0, pending_count: 0, average_score: null });
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // AS-25: PDF download state
  const [downloadingPDF, setDownloadingPDF] = useState<string | null>(null);

  // AS-26: Bulk PDF download state
  const [downloadingBulkPDF, setDownloadingBulkPDF] = useState(false);

  // NEW: Detailed result state
  const [detailedResult, setDetailedResult] = useState<DetailedResultResponse | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // AS-23: Search, Sort, and Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'score' | 'status' | 'date'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Passed' | 'Failed' | 'Under Review' | 'In Progress' | 'Pending'>('all');

  // AS-24: Column customization
  const COLUMN_PREFERENCES_KEY = 'assessment_results_columns_v2';
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  interface ColumnConfig {
    id: string;
    label: string;
    enabled: boolean;
  }

  const defaultColumns: ColumnConfig[] = [
    { id: 'candidate', label: 'Candidate', enabled: true },
    { id: 'email', label: 'Email', enabled: true },
    { id: 'jdTitle', label: 'JD Title', enabled: true },
    { id: 'phone', label: 'Phone', enabled: true },
    { id: 'inviteSource', label: 'Invite Source', enabled: true },
    { id: 'score', label: 'Score %', enabled: true },
    { id: 'status', label: 'Status', enabled: true },
    { id: 'completed', label: 'Completed', enabled: true },
    { id: 'duration', label: 'Duration', enabled: true },
  ];

  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    if (typeof window === 'undefined') return defaultColumns;
    try {
      const saved = localStorage.getItem(COLUMN_PREFERENCES_KEY);
      if (saved) {
        const savedColumns = JSON.parse(saved) as ColumnConfig[];
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

  // Fetch results from API
  useEffect(() => {
    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const response = await assessmentService.listResults(assessmentId);
        if (response?.items) {
          // Map API response to component format
          const mapped: CandidateResult[] = response.items.map((item: any, index: number) => {
            // Determine status
            let status: 'Passed' | 'Failed' | 'Under Review' | 'In Progress' | 'Pending' = 'Under Review';
            if (item.status === 'pending') {
              status = 'Pending';
            } else if (item.status === 'completed') {
              status = item.passed === true ? 'Passed' : item.passed === false ? 'Failed' : 'Under Review';
            } else if (item.status === 'in_progress') {
              status = 'In Progress';
            } else if (item.passed === true) {
              status = 'Passed';
            } else if (item.passed === false) {
              status = 'Failed';
            }

            return {
              id: item.id || item.invitation_id,  // Use invitation_id for pending
              invitation_id: item.invitation_id,
              name: item.candidate_name || 'Unknown',
              email: item.candidate_email || '',
              phone: item.candidate_phone || '',
              inviteSource: item.invite_source || 'Manual',
              score: Math.round(Number(item.overall_score) || 0),
              totalScore: 100,
              percentage: Math.round(Number(item.overall_score) || 0),
              status,
              completedDate: item.completed_at?.split('T')[0] || (item.started_at?.split('T')[0] || (status === 'Pending' ? 'Not started' : 'N/A')),
              duration: item.time_spent_seconds ? `${Math.round(item.time_spent_seconds / 60)} min` : (status === 'Pending' ? '-' : 'N/A'),
              sections: [
                {
                  name: 'HR Section',
                  score: Math.round(Number(item.hr_score) || 0),
                  totalScore: 100,
                  percentage: Math.round(Number(item.hr_score) || 0),
                  questions: []
                },
                {
                  name: 'Technical Section',
                  score: Math.round(Number(item.technical_score) || 0),
                  totalScore: 100,
                  percentage: Math.round(Number(item.technical_score) || 0),
                  questions: []
                },
                {
                  name: 'Coding Section',
                  score: Math.round(Number(item.coding_score) || 0),
                  totalScore: 100,
                  percentage: Math.round(Number(item.coding_score) || 0),
                  questions: []
                }
              ].filter(s => s.score > 0 || s.percentage > 0),
              round: 1,
              roundName: 'Round 1'
            };
          });
          setCandidateResults(mapped);

          // Set stats from API
          setApiStats({
            completed_count: response.completed_count || mapped.filter((c: CandidateResult) => c.status === 'Passed' || c.status === 'Failed' || c.status === 'Under Review').length,
            passed_count: response.passed_count || mapped.filter((c: CandidateResult) => c.status === 'Passed').length,
            failed_count: response.failed_count || mapped.filter((c: CandidateResult) => c.status === 'Failed').length,
            in_progress_count: response.in_progress_count || mapped.filter((c: CandidateResult) => c.status === 'In Progress').length,
            pending_count: response.pending_count || mapped.filter((c: CandidateResult) => c.status === 'Pending').length,
            average_score: response.average_score ? Math.round(Number(response.average_score)) : null
          });
        }
      } catch (error) {
        console.error('Failed to fetch assessment results:', error);
        // Keep empty results on error
        setCandidateResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [assessmentId]);

  // NEW: Fetch detailed results when a candidate is selected
  useEffect(() => {
    const fetchDetailedResults = async () => {
      if (!selectedCandidate) {
        setDetailedResult(null);
        return;
      }

      setIsLoadingDetails(true);
      setDetailsError(null);
      try {
        const details = await assessmentService.getResultDetails(assessmentId, selectedCandidate);
        setDetailedResult(details);
        // Set active tab based on available rounds
        if (details.round_scores.length > 0) {
          setActiveTab(details.round_scores[0].round_type);
        }
      } catch (error) {
        console.error('Failed to fetch detailed results:', error);
        setDetailsError('Failed to load detailed results. Please try again.');
      } finally {
        setIsLoadingDetails(false);
      }
    };

    fetchDetailedResults();
  }, [selectedCandidate, assessmentId]);


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Passed': return 'bg-green-100 text-green-800 border-green-200';
      case 'Failed': return 'bg-red-100 text-red-800 border-red-200';
      case 'Pending': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'Under Review': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'In Progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Handle delete result
  const handleDeleteResult = async (resultId: string, candidateName: string) => {
    if (!confirm(`Are you sure you want to delete the result for ${candidateName}? This action cannot be undone.`)) {
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
          completed_count: Math.max(0, prev.completed_count - (deletedCandidate.status !== 'In Progress' ? 1 : 0)),
          passed_count: Math.max(0, prev.passed_count - (deletedCandidate.status === 'Passed' ? 1 : 0)),
          failed_count: Math.max(0, prev.failed_count - (deletedCandidate.status === 'Failed' ? 1 : 0)),
          in_progress_count: Math.max(0, prev.in_progress_count - (deletedCandidate.status === 'In Progress' ? 1 : 0)),
        }));
      }
    } catch (error) {
      console.error('Failed to delete result:', error);
      alert('Failed to delete result. Please try again.');
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
      alert('Failed to download PDF report. Please try again.');
    } finally {
      setDownloadingPDF(null);
    }
  };

  // AS-26: Handle bulk PDF download as ZIP
  const handleDownloadBulkPDFs = async () => {
    if (downloadingBulkPDF || selectedRows.length === 0) return;

    setDownloadingBulkPDF(true);
    try {
      const blob = await assessmentService.exportBulkPDFs(selectedRows);

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
      alert('Failed to download PDF reports. Please try again.');
    } finally {
      setDownloadingBulkPDF(false);
    }
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-gray-800';
    if (percentage >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Use API results only (no mock data)
  const displayResults = candidateResults;
  const selectedCandidateData = displayResults.find(c => c.id === selectedCandidate);

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
    setCurrentPage(1); // Reset to first page on sort change
  };

  // Overview view
  if (!selectedCandidate) {
    // AS-23: Filter candidates by round, search, and status
    let filteredCandidates = displayResults;

    // Round filter
    if (selectedRound !== 'all') {
      filteredCandidates = filteredCandidates.filter(c => c.round === selectedRound);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filteredCandidates = filteredCandidates.filter(c => c.status === statusFilter);
    }

    // Search filter (name, email, or phone)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filteredCandidates = filteredCandidates.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query) ||
        (c.phone && c.phone.toLowerCase().includes(query))
      );
    }

    // AS-23: Sort candidates
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

    // AS-23: Pagination calculations
    const totalItems = filteredCandidates.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedCandidates = filteredCandidates.slice(startIndex, endIndex);

    // Get unique rounds for filter
    const availableRounds = Array.from(new Set(displayResults.map(c => c.round))).sort();

    // Use API stats if available, otherwise calculate from data
    const passedCount = candidateResults.length > 0 ? apiStats.passed_count : filteredCandidates.filter(c => c.status === 'Passed').length;
    const failedCount = candidateResults.length > 0 ? apiStats.failed_count : filteredCandidates.filter(c => c.status === 'Failed').length;
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
                  Assessment Results - {displayResults.length} candidates completed
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
                  onClick={async () => {
                    try {
                      const blob = await assessmentService.exportResults(assessmentId, 'csv');
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${assessmentTitle.replace(/\s+/g, '_')}_results.csv`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    } catch (error) {
                      console.error('Failed to export results:', error);
                      alert('Failed to export results. Please try again.');
                    }
                  }}
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
          {/* Round Filter */}
          {availableRounds.length > 1 && (
            <div className="bg-gradient-to-r from-gray-50 to-gray-50 border-2 border-gray-300 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                    <Layers className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-gray-900 mb-1">📊 View Results by Round</h3>
                    <p className="text-sm text-gray-600">
                      {selectedRound === 'all' 
                        ? `Showing all ${filteredCandidates.length} candidates across ${availableRounds.length} rounds`
                        : `Showing ${filteredCandidates.length} candidate(s) from Round ${selectedRound}`
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedRound('all')}
                    className={`px-6 py-3 rounded-lg transition-all flex items-center gap-2 ${
                      selectedRound === 'all'
                        ? 'bg-gray-800 text-white shadow-lg'
                        : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                    <span>All Rounds</span>
                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                      selectedRound === 'all'
                        ? 'bg-gray-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {displayResults.length}
                    </span>
                  </button>
                  {availableRounds.map(round => {
                    const roundCount = displayResults.filter(c => c.round === round).length;
                    return (
                      <button
                        key={round}
                        onClick={() => setSelectedRound(round)}
                        className={`px-6 py-3 rounded-lg transition-all flex items-center gap-2 ${
                          selectedRound === round
                            ? 'bg-gray-800 text-white shadow-lg'
                            : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                        }`}
                      >
                        <span>Round {round}</span>
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                          selectedRound === round
                            ? 'bg-gray-500 text-white'
                            : 'bg-gray-200 text-gray-600'
                        }`}>
                          {roundCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-5 gap-4 mb-6">
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
                  <div className="text-gray-600 text-sm mb-1">Passed</div>
                  <div className="text-2xl text-green-600">{passedCount}</div>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm mb-1">Failed</div>
                  <div className="text-2xl text-red-600">{failedCount}</div>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-red-600" />
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
                  placeholder="Search by name, email, or phone..."
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
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as 'all' | 'Passed' | 'Failed' | 'Under Review' | 'In Progress' | 'Pending');
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent text-sm"
                >
                  <option value="all">Assessment Status</option>
                  <option value="Passed">Passed</option>
                  <option value="Failed">Failed</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>

              {/* Advanced Filters Button */}
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-700">
                <SlidersHorizontal className="w-4 h-4" />
                Advanced Filters
              </button>

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
                    {isColumnEnabled('score') && (
                      <th
                        className="text-center px-4 py-3 text-xs text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('score')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Score %
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
                          {searchQuery || statusFilter !== 'all' ? (
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
                        {isColumnEnabled('score') && (
                          <td className="px-4 py-4 text-center">
                            <span className={`text-lg font-semibold ${getScoreColor(candidate.percentage)}`}>
                              {candidate.status === 'In Progress' ? '-' : `${candidate.percentage}%`}
                            </span>
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
                              onClick={() => setSelectedCandidate(candidate.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                              title="View Details"
                            >
                              <Award className="w-3 h-3" />
                              View Details
                            </button>
                            {/* AS-25: PDF Download Button */}
                            {candidate.status === 'Passed' || candidate.status === 'Failed' ? (
                              <button
                                onClick={() => handleDownloadPDF(candidate.id)}
                                disabled={downloadingPDF === candidate.id}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Download PDF Report"
                              >
                                {downloadingPDF === candidate.id ? (
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
      </div>
    );
  }

  // Detailed candidate view
  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Sticky Header - Assessment & JD Title */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-800 border-b-2 border-gray-600 sticky top-0 z-20 shadow-lg">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-white/80 text-xs mb-1">Assessment</div>
                <h1 className="text-white text-xl">{assessmentTitle}</h1>
                {jdTitle && (
                  <div className="flex items-center gap-2 mt-1">
                    <Briefcase className="w-3.5 h-3.5 text-gray-200" />
                    <span className="text-gray-100 text-sm">Linked to: {jdTitle}</span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  const blob = await assessmentService.exportResults(assessmentId, 'csv', true);
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${assessmentTitle.replace(/\s+/g, '_')}_results_detailed.csv`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                } catch (error) {
                  console.error('Failed to export results:', error);
                  alert('Failed to export results. Please try again.');
                }
              }}
              className="px-6 py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-2 border border-white/30"
            >
              <FileText className="w-5 h-5" />
              Export Results
            </button>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-[88px] z-10">
        <div className="px-8 py-6">
          <button
            onClick={() => setSelectedCandidate(null)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Results Overview
          </button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-xl">
                {(selectedCandidateData?.name || 'U').split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h1 className="text-gray-900 mb-1">{selectedCandidateData?.name || 'Unknown'}</h1>
                <p className="text-sm text-gray-600">{selectedCandidateData?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-gray-600">Overall Score</div>
                <div className={`text-3xl ${getScoreColor(
                  detailedResult?.overall_score ?? selectedCandidateData?.percentage ?? 0
                )}`}>
                  {detailedResult?.overall_score ?? selectedCandidateData?.percentage}%
                </div>
              </div>
              {/* Use detailed result status when scoring is complete, otherwise fall back to list status */}
              {(() => {
                let displayStatus = selectedCandidateData?.status || 'Under Review';
                if (detailedResult && detailedResult.scoring_status === 'completed') {
                  displayStatus = detailedResult.passed === true ? 'Passed' : detailedResult.passed === false ? 'Failed' : 'Under Review';
                } else if (detailedResult && detailedResult.scoring_status === 'processing') {
                  displayStatus = 'Under Review';
                }
                return (
                  <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm border ${getStatusColor(displayStatus)}`}>
                    {displayStatus}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {/* Assessment Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-gray-800" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Assessment</div>
                <div className="text-gray-900">{assessmentTitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Completed</div>
                <div className="text-gray-900">{selectedCandidateData?.completedDate}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-gray-800" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Time Taken</div>
                <div className="text-gray-900">{selectedCandidateData?.duration}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Section Scores */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-gray-900 mb-4">Section-wise Performance</h2>
          <div className="space-y-4">
            {selectedCandidateData?.sections.map((section, idx) => (
              <div key={idx} className={`border rounded-lg p-4 ${
                section.name.toLowerCase().includes('hr') 
                  ? 'border-gray-200 bg-gray-50/30' 
                  : 'border-green-200 bg-green-50/30'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">{section.name}</span>
                      {section.name.toLowerCase().includes('hr') ? (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                          Not Scored
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                          Scored (0-10)
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {section.score}/{section.totalScore} points
                      {!section.name.toLowerCase().includes('hr') && (
                        <span className="text-gray-800 ml-2">• Pass: ≥7/10</span>
                      )}
                    </div>
                  </div>
                  <div className={`text-2xl ${getScoreColor(section.percentage)}`}>
                    {section.percentage}%
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${section.percentage >= 80 ? 'bg-green-600' : section.percentage >= 60 ? 'bg-gray-800' : section.percentage >= 40 ? 'bg-yellow-600' : 'bg-red-600'}`}
                    style={{ width: `${section.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scoring Rules & Pass/Fail Criteria */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-50 border-2 border-gray-300 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Info className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-gray-900 mb-1">Assessment Scoring Rules</h2>
              <p className="text-sm text-gray-600">Critical Evaluation Logic for PASS/FAIL determination</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* HR Section Rules */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-600" />
                </div>
                <h3 className="text-gray-900">HR Section</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Responses are <strong>recorded</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Displayed in reports</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700"><strong className="text-yellow-700">NOT part of PASS/FAIL</strong> decision</span>
                </div>
              </div>
            </div>

            {/* Technical & Coding Rules */}
            <div className="bg-white rounded-lg border-2 border-green-300 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <h3 className="text-gray-900">Technical & Coding</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Rating scale: <strong>0-10</strong> per question</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700">Minimum passing: <strong>≥7 per question</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 flex-shrink-0"></div>
                  <span className="text-gray-700"><strong className="text-green-700">Used for PASS/FAIL</strong> determination</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pass Logic */}
          <div className="mt-4 bg-white rounded-lg border-2 border-gray-300 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-5 h-5 text-gray-800" />
              <h3 className="text-gray-900">Pass Logic (Per Section)</h3>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="text-sm text-gray-900 mb-2">A section PASSES if either condition is met:</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-800 font-bold flex-shrink-0">1.</span>
                  <span className="text-gray-700">At least <strong>70% of questions</strong> score ≥7</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <span className="px-2 py-0.5 bg-gray-200 rounded">Example:</span>
                  <span>10 questions → 7+ questions must score ≥7</span>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-900 mb-2">OR:</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-800 font-bold flex-shrink-0">2.</span>
                  <span className="text-gray-700">Overall average score ≥7</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <span className="px-2 py-0.5 bg-gray-200 rounded">Example:</span>
                  <span>Total score: 75/100 → Average: 7.5 ≥ 7 → PASS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Final Result Calculation */}
          <div className="mt-4 bg-gradient-to-r from-green-50 to-gray-50 border-2 border-green-300 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-green-600" />
              <h3 className="text-gray-900">Final Assessment Result</h3>
            </div>
            <div className="text-sm text-gray-700">
              <strong>PASS</strong> if <strong>ALL</strong> evaluated sections (Technical + Coding) pass
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Remember: HR section is excluded from final PASS/FAIL calculation</span>
            </div>
          </div>
        </div>

        {/* Candidate Insights - AI Generated Analysis */}
        {detailedResult && detailedResult.candidate_insights && detailedResult.scoring_status === 'completed' && (
          <div className="bg-white rounded-lg border-2 border-blue-200 overflow-hidden shadow-lg mb-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <h2 className="text-white flex items-center gap-2">
                <Award className="w-5 h-5" />
                AI-Generated Candidate Insights
              </h2>
              <p className="text-blue-100 text-sm mt-1">Summary of candidate performance and recommendations</p>
            </div>
            <div className="p-6">
              {/* Summary */}
              {detailedResult.candidate_insights.summary && (
                <div className="mb-6">
                  <h3 className="text-gray-900 font-medium mb-2">Summary</h3>
                  <p className="text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    {detailedResult.candidate_insights.summary}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                {/* Strengths */}
                {detailedResult.candidate_insights.strengths && detailedResult.candidate_insights.strengths.length > 0 && (
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h3 className="text-green-800 font-medium mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Strengths
                    </h3>
                    <ul className="space-y-2">
                      {detailedResult.candidate_insights.strengths.map((s: string, i: number) => (
                        <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                          <span className="text-green-500 mt-1">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Areas for Improvement / Weaknesses */}
                {(detailedResult.candidate_insights.improvement_areas || detailedResult.candidate_insights.weaknesses) &&
                 (detailedResult.candidate_insights.improvement_areas?.length > 0 || detailedResult.candidate_insights.weaknesses?.length > 0) && (
                  <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                    <h3 className="text-orange-800 font-medium mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Areas for Improvement
                    </h3>
                    <ul className="space-y-2">
                      {(detailedResult.candidate_insights.improvement_areas || detailedResult.candidate_insights.weaknesses || []).map((a: string, i: number) => (
                        <li key={i} className="text-sm text-orange-700 flex items-start gap-2">
                          <span className="text-orange-500 mt-1">•</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Hiring Recommendation */}
              {detailedResult.hiring_recommendation && (
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <h3 className="text-gray-900 font-medium mb-2">Hiring Recommendation</h3>
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
                    detailedResult.hiring_recommendation === 'strong_yes' || detailedResult.hiring_recommendation === 'yes'
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : detailedResult.hiring_recommendation === 'maybe'
                      ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                      : 'bg-red-100 text-red-800 border border-red-200'
                  }`}>
                    <span className="font-medium capitalize">{detailedResult.hiring_recommendation.replace('_', ' ')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detailed Answers */}
        <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-lg">
          <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white">📝 Detailed Question Analysis</h2>
                <p className="text-gray-100 text-sm mt-1">Review questions and answers for each section</p>
              </div>
              {/* Agent Status Badge */}
              {detailedResult && (
                <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  detailedResult.scoring_status === 'completed'
                    ? 'bg-green-500/20 text-green-100 border border-green-400/30'
                    : detailedResult.scoring_status === 'processing'
                    ? 'bg-yellow-500/20 text-yellow-100 border border-yellow-400/30'
                    : detailedResult.scoring_status === 'error'
                    ? 'bg-red-500/20 text-red-100 border border-red-400/30'
                    : 'bg-gray-500/20 text-gray-100 border border-gray-400/30'
                }`}>
                  {detailedResult.scoring_status === 'processing' && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {detailedResult.scoring_status === 'completed' && (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {detailedResult.scoring_status === 'pending' && (
                    <Clock className="w-4 h-4" />
                  )}
                  {detailedResult.scoring_status === 'error' && (
                    <XCircle className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">
                    {detailedResult.scoring_status === 'completed' && 'Scoring Complete'}
                    {detailedResult.scoring_status === 'processing' && 'AI Agent Processing...'}
                    {detailedResult.scoring_status === 'pending' && 'Scoring Pending'}
                    {detailedResult.scoring_status === 'error' && 'Scoring Failed - Needs Retry'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Loading State */}
          {isLoadingDetails && (
            <div className="p-12 text-center">
              <Loader2 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
              <p className="text-gray-600">Loading detailed results...</p>
            </div>
          )}

          {/* Error State */}
          {detailsError && (
            <div className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-600">{detailsError}</p>
            </div>
          )}

          {/* Agent Processing State */}
          {detailedResult && detailedResult.scoring_status === 'processing' && (
            <div className="p-8">
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-8 text-center">
                <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">AI Agent Processing Results</h3>
                <p className="text-gray-600 mb-4">
                  Our AI scoring agent is analyzing the candidate's responses. This typically takes 1-2 minutes.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-yellow-700">
                  <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                  <span>Processing in progress...</span>
                </div>
              </div>
            </div>
          )}

          {/* Content when loaded */}
          {detailedResult && detailedResult.scoring_status !== 'processing' && !isLoadingDetails && (
            <>
              {/* Tab Navigation */}
              <div className="border-b border-gray-200 bg-gray-50">
                <div className="flex gap-2 px-6 py-3">
                  {detailedResult.round_scores.map((round, idx) => {
                    const isActive = activeTab === round.round_type;
                    const questionsForRound = detailedResult.question_evaluations.filter(
                      q => q.round_type === round.round_type
                    );

                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveTab(round.round_type)}
                        className={`px-6 py-3 rounded-t-lg transition-all flex items-center gap-2 ${
                          isActive
                            ? 'bg-white text-gray-800 border-t-2 border-x border-gray-800 shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <span className="font-medium capitalize">{round.round_type} Round</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          isActive ? 'bg-gray-100 text-gray-900' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {questionsForRound.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {detailedResult.round_scores.map((round, roundIdx) => {
                  const isActiveTab = activeTab === round.round_type;
                  if (!isActiveTab) return null;

                  const questionsForRound = detailedResult.question_evaluations.filter(
                    q => q.round_type === round.round_type
                  );

                  return (
                    <div key={roundIdx} className="space-y-6">
                      {/* Section Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                        <div>
                          <h3 className="text-xl text-gray-900 capitalize">{round.round_type} Round</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {questionsForRound.length} question{questionsForRound.length !== 1 ? 's' : ''} •
                            <span className="ml-1">{round.questions_correct}/{round.questions_total} correct</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600 mb-1">Section Score</div>
                          <div className={`text-3xl ${getScoreColor(round.raw_score)}`}>
                            {Math.round(round.raw_score)}%
                          </div>
                        </div>
                      </div>

                      {/* Questions */}
                      {questionsForRound.length > 0 ? (
                        <div className="space-y-6">
                          {questionsForRound.map((q, qIdx) => (
                            <div key={qIdx} className="border-2 border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors">
                              {/* Question Header */}
                              <div className={`px-6 py-4 border-b border-gray-200 ${
                                q.is_correct ? 'bg-green-50' : 'bg-red-50'
                              }`}>
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <span className="px-3 py-1 bg-gray-800 text-white rounded-full text-xs font-medium">
                                        Q{qIdx + 1}
                                      </span>
                                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                        q.question_type === 'coding'
                                          ? 'bg-purple-100 text-purple-700'
                                          : q.question_type === 'single_choice' || q.question_type === 'multiple_choice'
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-gray-100 text-gray-700'
                                      }`}>
                                        {q.question_type === 'coding' ? '💻 Coding'
                                          : q.question_type === 'single_choice' ? '○ Single Choice'
                                          : q.question_type === 'multiple_choice' ? '☑ Multiple Choice'
                                          : '✍️ Text'}
                                      </span>
                                      {q.is_correct ? (
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Correct</span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Incorrect</span>
                                      )}
                                    </div>
                                    <div className="text-gray-900 leading-relaxed">{q.question_text}</div>
                                  </div>
                                  <div className="ml-6 text-right flex-shrink-0">
                                    <div className="text-xs text-gray-600 mb-1">Score</div>
                                    <div className="flex items-center gap-2">
                                      <div className={`text-2xl font-bold ${getScoreColor((q.points_earned / q.points_possible) * 100)}`}>
                                        {q.points_earned}
                                      </div>
                                      <div className="text-gray-400">/</div>
                                      <div className="text-xl text-gray-600">{q.points_possible}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Question Content */}
                              <div className="p-6 space-y-4">
                                {/* Candidate's Answer */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                      <User className="w-4 h-4 text-gray-800" />
                                    </div>
                                    <div className="text-sm font-medium text-gray-800">CANDIDATE'S ANSWER</div>
                                  </div>
                                  <div className={`rounded-lg p-4 ${
                                    q.question_type === 'coding'
                                      ? 'bg-gray-900 text-green-400 font-mono text-sm overflow-x-auto'
                                      : 'bg-gray-50 text-gray-800'
                                  }`}>
                                    {q.question_type === 'coding' ? (
                                      <pre className="whitespace-pre-wrap">{q.candidate_code_submission || 'No code submitted'}</pre>
                                    ) : q.candidate_selected_options && q.candidate_selected_options.length > 0 ? (
                                      <div>
                                        {q.candidate_selected_options.map((opt, i) => {
                                          const option = q.options?.find(o => o.id === opt);
                                          return (
                                            <div key={i} className="flex items-center gap-2 mb-1">
                                              <span className="text-gray-500">•</span>
                                              <span>{option?.text || opt}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <p>{q.candidate_answer_text || 'No answer provided'}</p>
                                    )}
                                  </div>
                                </div>

                                {/* Correct Answer (for MCQ) */}
                                {q.correct_answer && q.correct_answer.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                      </div>
                                      <div className="text-sm font-medium text-green-900">CORRECT ANSWER</div>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-4">
                                      {q.correct_answer.map((opt, i) => {
                                        const option = q.options?.find(o => o.id === opt);
                                        return (
                                          <div key={i} className="flex items-center gap-2 mb-1 text-green-800">
                                            <CheckCircle className="w-4 h-4" />
                                            <span>{option?.text || opt}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Ideal/Model Answer (for text questions) */}
                                {q.ideal_answer && (!q.correct_answer || q.correct_answer.length === 0) && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-blue-600" />
                                      </div>
                                      <div className="text-sm font-medium text-blue-900">MODEL ANSWER</div>
                                    </div>
                                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                      <p className="text-blue-800 leading-relaxed">{q.ideal_answer}</p>
                                    </div>
                                  </div>
                                )}

                                {/* AI Feedback */}
                                {q.feedback && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-gray-800" />
                                      </div>
                                      <div className="text-sm font-medium text-gray-800">AI FEEDBACK & EVALUATION</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                      <div className="text-gray-800 leading-relaxed">{q.feedback}</div>
                                    </div>
                                  </div>
                                )}

                                {/* Strengths & Areas for Improvement */}
                                {((q.strengths && q.strengths.length > 0) || (q.areas_for_improvement && q.areas_for_improvement.length > 0)) && (
                                  <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                                    {q.strengths && q.strengths.length > 0 && (
                                      <div className="bg-green-50 rounded-lg p-4">
                                        <div className="text-sm font-medium text-green-800 mb-2">Strengths</div>
                                        <ul className="text-sm text-green-700 space-y-1">
                                          {q.strengths.map((s, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                              <CheckCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                                              {s}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {q.areas_for_improvement && q.areas_for_improvement.length > 0 && (
                                      <div className="bg-amber-50 rounded-lg p-4">
                                        <div className="text-sm font-medium text-amber-800 mb-2">Areas for Improvement</div>
                                        <ul className="text-sm text-amber-700 space-y-1">
                                          {q.areas_for_improvement.map((a, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                              <AlertCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                                              {a}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600">No questions available for this section</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}