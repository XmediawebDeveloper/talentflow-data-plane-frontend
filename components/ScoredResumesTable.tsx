import { Mail, Phone, Calendar, Search, SlidersHorizontal, Download, FileDown, CheckSquare, Square, Filter, X, UserPlus, Eye, AlertCircle, Loader } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import ColumnCustomizationModal from './ColumnCustomizationModal';
import InviteToAssessmentModal from './InviteToAssessmentModal';
import { scoringService } from '@/lib/services/scoringService';

const COLUMN_PREFERENCES_KEY = 'scoredResumesTableColumns';

const DEFAULT_COLUMNS = [
  { id: 'candidateName', label: 'Candidate Name', enabled: true },
  { id: 'jobTitle', label: 'Job Title', enabled: true }, // Always show job title
  { id: 'email', label: 'Email', enabled: true },
  { id: 'phone', label: 'Phone', enabled: true },
  { id: 'matchStatus', label: 'Match Status', enabled: true },
  { id: 'scorePercentage', label: 'Score %', enabled: true },
  { id: 'experience', label: 'Experience', enabled: false },
  { id: 'education', label: 'Education', enabled: false },
  { id: 'certifications', label: 'Certifications', enabled: false },
  { id: 'scoredDate', label: 'Scored Date', enabled: true },
  { id: 'version', label: 'Version', enabled: true },
  { id: 'scoredBy', label: 'Scored By', enabled: true },
];

interface ScoredResume {
  id: string;
  resumeId?: string;  // Actual resume ID (different from score ID)
  candidateName: string;
  email: string;
  phone: string;
  matchStatus: string;
  scorePercentage: number;
  scoredDate: string;
  scoredBy: string;
  experience?: string;
  education?: string;
  certifications?: string[];
  // Version info
  version?: number;
  resumeVersion?: number;
  // Source and status fields
  source?: 'my-resumes' | 'database' | string;
  status?: 'completed' | 'failed' | 'processing' | 'queued' | string;
  errorReason?: string;
  // Real scoring data from API
  aiSummary?: string;
  strengths?: string[];
  gaps?: string[];
  matchReason?: string;
  scoreBreakdown?: {
    skillsMatch: number;
    experienceMatch: number;
    educationMatch: number;
    overallFit: number;
  };
  title?: string;
  currentCompany?: string;
  location?: string;
  // For global view
  jobTitle?: string;
  jdId?: string;
}

interface ScoredResumesTableProps {
  resumes: ScoredResume[];
  jobTitle: string;
  jobId?: string;
  availableUnits?: number;
  onViewCandidate?: (resume: ScoredResume) => void;
  selectedResumes?: string[];
  onSelectResume?: (resumeId: string) => void;
  onSelectAll?: (resumeIds: string[]) => void;
  isGlobalView?: boolean; // Show job title column in global view
}

export default function ScoredResumesTable({
  resumes,
  jobTitle,
  jobId = 'jd-1',
  availableUnits = 10,
  onViewCandidate,
  selectedResumes: externalSelectedResumes = [],
  onSelectResume,
  onSelectAll,
  isGlobalView = false
}: ScoredResumesTableProps) {
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [internalSelectedResumes, setInternalSelectedResumes] = useState<string[]>([]);

  // Use external selection if provided, otherwise use internal
  const selectedResumes = onSelectResume ? externalSelectedResumes : internalSelectedResumes;
  const setSelectedResumes = onSelectResume ?
    (ids: string[] | ((prev: string[]) => string[])) => {
      // No-op when using external control
    } : setInternalSelectedResumes;
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCandidate, setInviteCandidate] = useState<ScoredResume | null>(null);
  
  // Filter states
  const [filterMatchStatus, setFilterMatchStatus] = useState<string>('all');
  const [filterScoreMin, setFilterScoreMin] = useState<number>(0);
  const [filterScoreMax, setFilterScoreMax] = useState<number>(100);
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterRecruiter, setFilterRecruiter] = useState<string>('all');

  // Column configuration - initialize with defaults, then load from localStorage
  const [availableColumns, setAvailableColumns] = useState(DEFAULT_COLUMNS);
  const [columnsLoaded, setColumnsLoaded] = useState(false);

  // Load column preferences from localStorage on mount
  // Auto-enable jobTitle column in global view
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_PREFERENCES_KEY);
      if (saved) {
        const savedPrefs = JSON.parse(saved) as Record<string, boolean>;
        setAvailableColumns(prev =>
          prev.map(col => ({
            ...col,
            // In global view, always enable jobTitle; otherwise use saved preference
            enabled: col.id === 'jobTitle' && isGlobalView
              ? true
              : (savedPrefs[col.id] !== undefined ? savedPrefs[col.id] : col.enabled)
          }))
        );
      } else if (isGlobalView) {
        // No saved preferences, but in global view - enable jobTitle
        setAvailableColumns(prev =>
          prev.map(col => ({
            ...col,
            enabled: col.id === 'jobTitle' ? true : col.enabled
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load column preferences:', error);
    }
    setColumnsLoaded(true);
  }, [isGlobalView]);

  // Save column preferences to localStorage when they change
  useEffect(() => {
    if (!columnsLoaded) return; // Don't save on initial load
    try {
      const prefs: Record<string, boolean> = {};
      availableColumns.forEach(col => {
        prefs[col.id] = col.enabled;
      });
      localStorage.setItem(COLUMN_PREFERENCES_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.error('Failed to save column preferences:', error);
    }
  }, [availableColumns, columnsLoaded]);

  const enabledColumns = availableColumns.filter(col => col.enabled);

  // Filtering logic
  const filteredResumes = resumes.filter(resume => {
    // Search filter
    const matchesSearch = 
      resume.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resume.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resume.phone.includes(searchTerm);

    // Match status filter
    const matchesStatus = filterMatchStatus === 'all' || resume.matchStatus === filterMatchStatus;

    // Score range filter
    const matchesScore = resume.scorePercentage >= filterScoreMin && resume.scorePercentage <= filterScoreMax;

    // Date range filter
    let matchesDate = true;
    if (filterDateFrom) {
      matchesDate = matchesDate && new Date(resume.scoredDate) >= new Date(filterDateFrom);
    }
    if (filterDateTo) {
      matchesDate = matchesDate && new Date(resume.scoredDate) <= new Date(filterDateTo);
    }

    // Recruiter filter
    const matchesRecruiter = filterRecruiter === 'all' || resume.scoredBy === filterRecruiter;

    return matchesSearch && matchesStatus && matchesScore && matchesDate && matchesRecruiter;
  });

  const uniqueRecruiters = Array.from(new Set(resumes.map(r => r.scoredBy)));

  const handleSelectAll = () => {
    if (onSelectAll) {
      // External control with onSelectAll prop
      if (selectedResumes.length === filteredResumes.length) {
        onSelectAll([]);  // Deselect all
      } else {
        onSelectAll(filteredResumes.map(r => r.id));  // Select all
      }
    } else if (onSelectResume) {
      // External control without onSelectAll - toggle each item
      const allSelected = selectedResumes.length === filteredResumes.length;
      filteredResumes.forEach(resume => {
        const isSelected = selectedResumes.includes(resume.id);
        // Toggle: if all selected, deselect; if not all selected, select unselected ones
        if (allSelected && isSelected) {
          onSelectResume(resume.id);  // Deselect
        } else if (!allSelected && !isSelected) {
          onSelectResume(resume.id);  // Select
        }
      });
    } else {
      // Internal control
      if (selectedResumes.length === filteredResumes.length) {
        setSelectedResumes([]);
      } else {
        setSelectedResumes(filteredResumes.map(r => r.id));
      }
    }
  };

  const handleSelectResume = (id: string) => {
    if (onSelectResume) {
      onSelectResume(id);
    } else {
      setSelectedResumes(prev =>
        prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
      );
    }
  };

  const handleColumnApply = (selectedColumnIds: string[]) => {
    setAvailableColumns(prev =>
      prev.map(col => ({
        ...col,
        enabled: selectedColumnIds.includes(col.id)
      }))
    );
  };

  // Export format modal state
  const [showExportModal, setShowExportModal] = useState(false);

  // Get cell value for export based on column ID
  const getCellValue = (resume: ScoredResume, columnId: string): string => {
    switch (columnId) {
      case 'candidateName':
        return resume.candidateName || '';
      case 'jobTitle':
        return resume.jobTitle || '';
      case 'version':
        return `v${resume.version || resume.resumeVersion || 1}`;
      case 'email':
        return resume.email || '';
      case 'phone':
        return resume.phone || '';
      case 'matchStatus':
        return resume.matchStatus || '';
      case 'scorePercentage':
        return `${resume.scorePercentage}%`;
      case 'experience':
        return resume.experience || '';
      case 'education':
        return typeof resume.education === 'string'
          ? resume.education
          : Array.isArray(resume.education) && resume.education.length > 0
            ? (resume.education[0]?.degree || resume.education[0]?.institution || '')
            : '';
      case 'certifications':
        return resume.certifications?.map(cert =>
          typeof cert === 'string' ? cert : (cert?.name || '')
        ).join(', ') || '';
      case 'scoredDate':
        const d = new Date(new Date(resume.scoredDate).getTime() + (5 * 60 + 30) * 60 * 1000);
        return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      case 'scoredBy':
        return resume.scoredBy || '';
      default:
        return '';
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const selectedData = filteredResumes.filter(r => selectedResumes.includes(r.id));
    const dataToExport = selectedResumes.length > 0 ? selectedData : filteredResumes;

    // Build CSV content with only enabled columns
    const headers = enabledColumns.map(col => `"${col.label}"`).join(',');
    const rows = dataToExport.map(resume =>
      enabledColumns.map(col => {
        const value = getCellValue(resume, col.id);
        // Escape quotes and wrap in quotes
        return `"${value.replace(/"/g, '""')}"`;
      }).join(',')
    );

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${jobTitle.replace(/\s+/g, '_')}_Scored_Resumes_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success(`Exported ${dataToExport.length} records to CSV`);
    setShowExportModal(false);
  };

  // Export to XLS (using HTML table format that Excel can read)
  const exportToXLS = () => {
    const selectedData = filteredResumes.filter(r => selectedResumes.includes(r.id));
    const dataToExport = selectedResumes.length > 0 ? selectedData : filteredResumes;

    // Build HTML table that Excel can open
    let tableHTML = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head>
        <meta charset="UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Scored Resumes</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          table { border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 8px; text-align: left; }
          th { background-color: #f0f0f0; font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>${jobTitle} - Scored Resumes</h2>
        <p>Exported: ${new Date().toLocaleString()}</p>
        <p>Total Records: ${dataToExport.length}</p>
        <table>
          <thead>
            <tr>
              ${enabledColumns.map(col => `<th>${col.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${dataToExport.map(resume => `
              <tr>
                ${enabledColumns.map(col => `<td>${getCellValue(resume, col.id)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([tableHTML], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${jobTitle.replace(/\s+/g, '_')}_Scored_Resumes_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success(`Exported ${dataToExport.length} records to Excel`);
    setShowExportModal(false);
  };

  const handleExportExcel = () => {
    setShowExportModal(true);
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const handleDownloadScorecard = async (resumeId: string) => {
    const resume = resumes.find(r => r.id === resumeId);
    if (!resume) return;

    setDownloadingId(resumeId);
    try {
      const blob = await scoringService.downloadScorecard(resumeId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${resume.candidateName.replace(/\s+/g, '_')}_Screening_Report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Scorecard downloaded successfully');
    } catch (error) {
      console.error('Error downloading scorecard:', error);
      toast.error('Failed to download scorecard');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadBulkScorecards = async () => {
    if (selectedResumes.length === 0) return;

    setBulkDownloading(true);
    try {
      const blob = await scoringService.exportScorecards(selectedResumes);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `TalentFlow_Scorecards_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`${selectedResumes.length} scorecards downloaded`);
    } catch (error) {
      console.error('Error downloading bulk scorecards:', error);
      toast.error('Failed to download scorecards');
    } finally {
      setBulkDownloading(false);
    }
  };

  const clearFilters = () => {
    setFilterMatchStatus('all');
    setFilterScoreMin(0);
    setFilterScoreMax(100);
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterRecruiter('all');
    setSearchTerm('');
  };

  const hasActiveFilters = 
    filterMatchStatus !== 'all' ||
    filterScoreMin > 0 ||
    filterScoreMax < 100 ||
    filterDateFrom ||
    filterDateTo ||
    filterRecruiter !== 'all' ||
    searchTerm;

  // Function to handle row click and open detail view
  const handleRowClick = (resumeId: string, event: React.MouseEvent) => {
    // Don't open view if clicking on checkbox or action button
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('input[type="checkbox"]')) {
      return;
    }
    const resume = resumes.find(r => r.id === resumeId);
    if (resume && onViewCandidate) {
      onViewCandidate(resume);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-gray-900">Scored Resumes</h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredResumes.length} of {resumes.length} candidates
            {selectedResumes.length > 0 && ` • ${selectedResumes.length} selected`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Customize Columns - Hide on mobile */}
          <button
            onClick={() => setShowColumnModal(true)}
            className="hidden sm:flex px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors items-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden md:inline">Customize Columns</span>
            <span className="md:hidden">Columns</span>
          </button>
          {selectedResumes.length > 0 && (
            <>
              <button
                onClick={handleDownloadBulkScorecards}
                disabled={bulkDownloading}
                className="px-3 sm:px-4 py-2 text-sm border border-gray-300 text-gray-900 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkDownloading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">{bulkDownloading ? 'Downloading...' : `Download (${selectedResumes.length})`}</span>
                <span className="sm:hidden">{selectedResumes.length}</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="px-3 sm:px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </>
          )}
          {selectedResumes.length === 0 && (
            <button
              onClick={handleExportExcel}
              className="px-3 sm:px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          )}
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, or phone..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
            />
          </div>

          {/* Filter and Clear buttons row */}
          <div className="flex gap-2">
            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex-1 sm:flex-none px-4 py-2 text-sm border rounded-md transition-colors flex items-center justify-center gap-2 ${
                showFilters || hasActiveFilters
                  ? 'bg-gray-50 border-gray-300 text-gray-900'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              {hasActiveFilters && !showFilters && (
                <span className="w-2 h-2 bg-gray-800 rounded-full"></span>
              )}
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors whitespace-nowrap"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Match Status */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">Match Status</label>
                <select
                  value={filterMatchStatus}
                  onChange={(e) => setFilterMatchStatus(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                >
                  <option value="all">All Statuses</option>
                  <option value="Exact Match">Exact Match</option>
                  <option value="Partial Match">Partial Match</option>
                  <option value="No Match">No Match</option>
                </select>
              </div>

              {/* Score Range */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">Score Range</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={filterScoreMin}
                    onChange={(e) => setFilterScoreMin(Number(e.target.value))}
                    min="0"
                    max="100"
                    placeholder="Min"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                  <input
                    type="number"
                    value={filterScoreMax}
                    onChange={(e) => setFilterScoreMax(Number(e.target.value))}
                    min="0"
                    max="100"
                    placeholder="Max"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>
              </div>

              {/* Recruiter */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">Scored By</label>
                <select
                  value={filterRecruiter}
                  onChange={(e) => setFilterRecruiter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                >
                  <option value="all">All Recruiters</option>
                  {uniqueRecruiters.map(recruiter => (
                    <option key={recruiter} value={recruiter}>{recruiter}</option>
                  ))}
                </select>
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 w-12">
                <button onClick={handleSelectAll} className="p-1 hover:bg-gray-100 rounded">
                  {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? (
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
              <th className="text-left py-3 px-4 text-sm text-gray-600">Assessment</th>
              <th className="text-left py-3 px-4 text-sm text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredResumes.map((resume, index) => (
              <tr
                key={resume.id}
                onClick={(e) => handleRowClick(resume.id, e)}
                className={`border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                }`}
              >
                <td className="py-3 px-4">
                  <button
                    onClick={() => handleSelectResume(resume.id)}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {selectedResumes.includes(resume.id) ? (
                      <CheckSquare className="w-4 h-4 text-gray-800" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </td>

                {enabledColumns.map((col) => {
                  if (col.id === 'candidateName') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        {onViewCandidate ? (
                          <button
                            onClick={() => onViewCandidate(resume)}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors"
                          >
                            {resume.candidateName}
                          </button>
                        ) : (
                          <div className="text-sm text-gray-900">{resume.candidateName}</div>
                        )}
                      </td>
                    );
                  }
                  if (col.id === 'jobTitle') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="text-sm text-gray-700 font-medium">{resume.jobTitle || '-'}</div>
                      </td>
                    );
                  }
                  if (col.id === 'version') {
                    const ver = resume.version || resume.resumeVersion || 1;
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200">
                          v{ver}
                        </span>
                      </td>
                    );
                  }
                  if (col.id === 'email') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Mail className="w-3.5 h-3.5" />
                          {resume.email}
                        </div>
                      </td>
                    );
                  }
                  if (col.id === 'phone') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Phone className="w-3.5 h-3.5" />
                          {resume.phone}
                        </div>
                      </td>
                    );
                  }
                  if (col.id === 'matchStatus') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${
                          resume.matchStatus === 'Exact Match'
                            ? 'bg-green-100 text-green-700 border-green-300'
                            : resume.matchStatus === 'Partial Match'
                            ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                            : 'bg-red-100 text-red-700 border-red-300'
                        }`}>
                          {resume.matchStatus}
                        </span>
                      </td>
                    );
                  }
                  if (col.id === 'scorePercentage') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className={`text-base ${
                            resume.scorePercentage >= 85
                              ? 'text-green-600'
                              : resume.scorePercentage >= 70
                              ? 'text-gray-800'
                              : 'text-yellow-600'
                          }`}>
                            {resume.scorePercentage}%
                          </div>
                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                resume.scorePercentage >= 85
                                  ? 'bg-green-600'
                                  : resume.scorePercentage >= 70
                                  ? 'bg-gray-800'
                                  : 'bg-yellow-600'
                              }`}
                              style={{ width: `${resume.scorePercentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                    );
                  }
                  if (col.id === 'experience') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="text-sm text-gray-600">{resume.experience || 'N/A'}</div>
                      </td>
                    );
                  }
                  if (col.id === 'education') {
                    const educationDisplay = typeof resume.education === 'string'
                      ? resume.education
                      : Array.isArray(resume.education) && resume.education.length > 0
                        ? (resume.education[0]?.degree || resume.education[0]?.institution || 'Education available')
                        : 'N/A';
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="text-sm text-gray-600">{educationDisplay}</div>
                      </td>
                    );
                  }
                  if (col.id === 'certifications') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="text-sm text-gray-600">
                          {resume.certifications && resume.certifications.length > 0
                            ? resume.certifications.map(cert =>
                                typeof cert === 'string' ? cert : (cert?.name || '')
                              ).join(', ')
                            : 'N/A'}
                        </div>
                      </td>
                    );
                  }
                  if (col.id === 'scoredDate') {
                    const rawDate = new Date(resume.scoredDate);
                    // Convert UTC to IST (UTC + 5:30)
                    const istDate = new Date(rawDate.getTime() + (5 * 60 + 30) * 60 * 1000);
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {istDate.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                            {' '}
                            <span className="text-gray-400">
                              {istDate.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </span>
                          </span>
                        </div>
                      </td>
                    );
                  }
                  if (col.id === 'scoredBy') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="text-sm text-gray-600">{resume.scoredBy}</div>
                      </td>
                    );
                  }
                  return null;
                })}

                {/* Assessment Column */}
                <td className="py-3 px-4">
                  {/* Invite Button - For Exact Match & Partial Match */}
                  {(resume.matchStatus === 'Exact Match' || resume.matchStatus === 'Partial Match') ? (
                    availableUnits === 0 ? (
                      <div className="relative group">
                        <button
                          disabled
                          className="px-3 py-1.5 text-xs text-gray-400 bg-gray-200 rounded-md cursor-not-allowed flex items-center gap-1.5 opacity-60"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Invite
                        </button>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30">
                          <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                              <span>No assessment units available</span>
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                              <div className="border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInviteCandidate(resume);
                          setShowInviteModal(true);
                        }}
                        className={`px-3 py-1.5 text-xs text-white rounded-md transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md ${
                          resume.matchStatus === 'Exact Match'
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                            : 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700'
                        }`}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Invite
                      </button>
                    )
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>

                {/* Actions Column */}
                <td className="py-3 px-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onViewCandidate) {
                        onViewCandidate(resume);
                      }
                    }}
                    className="px-3 py-1.5 text-xs text-white bg-gray-800 hover:bg-gray-900 rounded-md transition-colors flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredResumes.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">
              <Search className="w-12 h-12 mx-auto" />
            </div>
            <p className="text-gray-600">No scored resumes found</p>
            <p className="text-sm text-gray-500 mt-1">
              {hasActiveFilters ? 'Try adjusting your filters' : 'Upload and score candidates to see them here'}
            </p>
          </div>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {filteredResumes.map((resume) => (
          <div
            key={resume.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all"
            onClick={(e) => handleRowClick(resume.id, e)}
          >
            {/* Card Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3 flex-1">
                <button
                  onClick={() => handleSelectResume(resume.id)}
                  className="p-1 hover:bg-gray-200 rounded mt-1"
                >
                  {selectedResumes.includes(resume.id) ? (
                    <CheckSquare className="w-5 h-5 text-gray-800" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                <div className="flex-1">
                  <h3 className="text-gray-900 mb-1">{resume.candidateName}</h3>
                  {/* Show job title in global view */}
                  {isGlobalView && resume.jobTitle && (
                    <div className="text-xs text-gray-500 mb-1">
                      Applied for: <span className="font-medium text-gray-700">{resume.jobTitle}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${
                      resume.matchStatus === 'Exact Match'
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : resume.matchStatus === 'Partial Match'
                        ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                        : 'bg-red-100 text-red-700 border-red-300'
                    }`}>
                      {resume.matchStatus}
                    </span>
                    <div className={`text-lg ${
                      resume.scorePercentage >= 85
                        ? 'text-green-600'
                        : resume.scorePercentage >= 70
                        ? 'text-gray-800'
                        : 'text-yellow-600'
                    }`}>
                      {resume.scorePercentage}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Content */}
            <div className="space-y-2 text-sm mb-3">
              {enabledColumns.find(c => c.id === 'email') && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="w-4 h-4" />
                  {resume.email}
                </div>
              )}
              {enabledColumns.find(c => c.id === 'phone') && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4" />
                  {resume.phone}
                </div>
              )}
              {enabledColumns.find(c => c.id === 'experience') && resume.experience && (
                <div className="text-gray-600">
                  <span className="text-gray-500">Experience:</span> {resume.experience}
                </div>
              )}
              {enabledColumns.find(c => c.id === 'education') && resume.education && (
                <div className="text-gray-600">
                  <span className="text-gray-500">Education:</span> {
                    typeof resume.education === 'string'
                      ? resume.education
                      : Array.isArray(resume.education) && resume.education.length > 0
                        ? (resume.education[0]?.degree || resume.education[0]?.institution || 'Education available')
                        : ''
                  }
                </div>
              )}
              {enabledColumns.find(c => c.id === 'scoredDate') && (() => {
                const rawDate = new Date(resume.scoredDate);
                const istDate = new Date(rawDate.getTime() + (5 * 60 + 30) * 60 * 1000);
                return (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {istDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                      {' '}
                      <span className="text-gray-400">
                        {istDate.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </span>
                    </span>
                  </div>
                );
              })()}
              {enabledColumns.find(c => c.id === 'scoredBy') && (
                <div className="text-gray-600">
                  <span className="text-gray-500">Scored by:</span> {resume.scoredBy}
                </div>
              )}
            </div>

            {/* Card Actions */}
            <div className="space-y-2">
              {/* Invite Button - For Exact Match & Partial Match */}
              {(resume.matchStatus === 'Exact Match' || resume.matchStatus === 'Partial Match') && (
                availableUnits === 0 ? (
                  <div className="relative group">
                    <button
                      disabled
                      className="w-full px-4 py-2 text-sm text-gray-400 bg-gray-200 rounded-md cursor-not-allowed flex items-center justify-center gap-2 opacity-60"
                    >
                      <UserPlus className="w-4 h-4" />
                      Invite for Assessment
                    </button>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30">
                      <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                          <span>No assessment units available</span>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                          <div className="border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInviteCandidate(resume);
                      setShowInviteModal(true);
                    }}
                    className={`w-full px-4 py-2 text-sm text-white rounded-md transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md ${
                      resume.matchStatus === 'Exact Match'
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                        : 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700'
                    }`}
                  >
                    <UserPlus className="w-4 h-4" />
                    Invite for Assessment
                  </button>
                )
              )}
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadScorecard(resume.id);
                }}
                disabled={downloadingId === resume.id}
                className="w-full px-4 py-2 text-sm text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {downloadingId === resume.id ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Scorecard
                  </>
                )}
              </button>
            </div>
          </div>
        ))}

        {filteredResumes.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">
              <Search className="w-12 h-12 mx-auto" />
            </div>
            <p className="text-gray-600">No scored resumes found</p>
            <p className="text-sm text-gray-500 mt-1">
              {hasActiveFilters ? 'Try adjusting your filters' : 'Upload and score candidates to see them here'}
            </p>
          </div>
        )}
      </div>

      {/* Column Customization Modal */}
      {showColumnModal && (
        <ColumnCustomizationModal
          columns={availableColumns}
          onClose={() => setShowColumnModal(false)}
          onApply={handleColumnApply}
        />
      )}

      {/* Invite to Assessment Modal */}
      {showInviteModal && inviteCandidate && (
        <InviteToAssessmentModal
          candidate={inviteCandidate}
          jobId={jobId}
          jobTitle={jobTitle}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {/* Export Format Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Export Scored Resumes</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedResumes.length > 0
                    ? `${selectedResumes.length} selected records`
                    : `${filteredResumes.length} records`
                  } • {enabledColumns.length} columns
                </p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-gray-600 mb-4">Choose export format:</p>

              <div className="space-y-3">
                <button
                  onClick={exportToCSV}
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
                  onClick={exportToXLS}
                  className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group"
                >
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                    <FileDown className="w-6 h-6 text-blue-700" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-medium text-gray-900">Excel Format (.xls)</div>
                    <div className="text-sm text-gray-500">Native Excel format with formatting and styling</div>
                  </div>
                </button>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">
                  <strong>Columns included:</strong> {enabledColumns.map(c => c.label).join(', ')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}