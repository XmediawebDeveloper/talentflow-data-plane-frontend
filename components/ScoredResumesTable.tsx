import { Mail, Phone, Calendar, Search, SlidersHorizontal, Download, FileDown, CheckSquare, Square, Filter, X, UserPlus, Eye, AlertCircle, Loader2, Send, ShieldAlert, Info } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import ColumnCustomizationModal from './ColumnCustomizationModal';
import InviteToAssessmentModal from './InviteToAssessmentModal';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds, parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import { scoringService } from '@/lib/services/scoringService';
import { assessmentService } from '@/lib/services/assessmentService';
import { useAuth } from '@/components/providers/AuthProvider';
import { formatIST, formatISTDate, formatISTTime, parseIST } from '@/lib/utils/dateUtils';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';

const COLUMN_PREFERENCES_KEY = 'scoredResumesTableColumns';

const DEFAULT_COLUMNS = [
  { id: 'candidateName', label: 'Candidate Name', enabled: true },
  { id: 'jobTitle', label: 'Job Title', enabled: true }, // Always show job title
  { id: 'email', label: 'Email', enabled: true },
  { id: 'phone', label: 'Phone', enabled: true },
  { id: 'matchStatus', label: 'Match Status', enabled: true },
  { id: 'scorePercentage', label: 'Score %', enabled: true },
  { id: 'experience', label: 'Experience', enabled: true },  // Enable by default
  { id: 'education', label: 'Education', enabled: false },
  { id: 'certifications', label: 'Certifications', enabled: false },
  { id: 'scoredDate', label: 'Scored Date', enabled: true },
  { id: 'version', label: 'Version', enabled: true },
  { id: 'scoredBy', label: 'Scored By', enabled: true },
  { id: 'tenantName', label: 'Tenant Name', enabled: true },  // Add tenant column
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
  // Education can arrive as a label ("Bachelor's"), a structured array from the
  // candidate-detail endpoint, or be absent. The cell renderer below handles
  // each shape; the union here keeps narrowing precise instead of collapsing.
  education?: string | Array<{ degree?: string; institution?: string }>;
  // Certifications: simple string list or structured objects with a name field.
  certifications?: Array<string | { name?: string }>;
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
  // Tenant info
  tenantName?: string;
  tenantId?: string;
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
  const { tenant, isTenantAdmin, user } = useAuth();  // Get tenant info from auth context
  const canCreateAssessments = isTenantAdmin || (user?.permissions?.canCreateAssessments ?? false);
  const canExport = isTenantAdmin || (user?.permissions?.canExport ?? false);
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
  const [showBulkInviteModal, setShowBulkInviteModal] = useState(false);

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

  // Add tenant name to all resumes (from auth context)
  // Remove "Organization: " prefix if present
  const cleanTenantName = tenant?.name?.replace(/^Organization:\s*/i, '') || 'N/A';

  const resumesWithTenant = resumes.map(resume => ({
    ...resume,
    tenantName: cleanTenantName,
    tenantId: tenant?.id
  }));

  // Filtering logic
  const filteredResumes = resumesWithTenant.filter(resume => {
    // Search filter
    const matchesSearch =
      resume.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resume.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resume.phone.includes(searchTerm);

    // Match status filter
    const matchesStatus = filterMatchStatus === 'all' || resume.matchStatus === filterMatchStatus;

    // Score range filter
    const matchesScore = resume.scorePercentage >= filterScoreMin && resume.scorePercentage <= filterScoreMax;

    // Date range filter - compare date portions in IST (UTC+5:30)
    let matchesDate = true;
    if (filterDateFrom || filterDateTo) {
      const d = parseIST(resume.scoredDate);
      if (!isNaN(d.getTime())) {
        // Extract YYYY-MM-DD in IST using Intl (parseIST already handles IST-naive strings)
        const scoredDateIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
        if (filterDateFrom) {
          matchesDate = matchesDate && scoredDateIST >= filterDateFrom;
        }
        if (filterDateTo) {
          matchesDate = matchesDate && scoredDateIST <= filterDateTo;
        }
      }
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
        return formatIST(resume.scoredDate);
      case 'scoredBy':
        return resume.scoredBy || '';
      case 'tenantName':
        return resume.tenantName || '';
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
        <p>Exported: ${formatIST(new Date().toISOString())}</p>
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
    // Validation 1: Check if any resumes are available
    if (filteredResumes.length === 0) {
      toast.warning('No resumes available to export');
      return;
    }

    // Validation 2: Must select at least one candidate
    if (selectedResumes.length === 0) {
      toast.warning('Please select at least one candidate to export');
      return;  // ✅ BLOCK export
    }

    // Selection valid - proceed with export
    setShowExportModal(true);
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const handleDownloadScorecard = async (resumeId: string) => {
    const resume = resumes.find(r => r.id === resumeId);
    if (!resume) return;

    setDownloadingId(resumeId);
    try {
      const rawBlob = await scoringService.downloadScorecard(resumeId);
      // Ensure blob has correct MIME type for cross-platform PDF rendering
      const blob = new Blob([rawBlob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeCandidateName = (resume.candidateName || 'Candidate').replace(/[^\w\s\-]/g, '').trim().replace(/\s+/g, '_') || 'Candidate';
      link.download = `${safeCandidateName}_Screening_Report.pdf`;
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
      const rawBlob = await scoringService.exportScorecards(selectedResumes);
      // Ensure blob has correct MIME type for cross-platform compatibility
      const blob = new Blob([rawBlob], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = jobTitle.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'Scorecards';
      link.download = `${safeName}_Scorecards.zip`;
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
              {canExport && (
              <button
                onClick={handleDownloadBulkScorecards}
                disabled={bulkDownloading}
                className="px-3 sm:px-4 py-2 text-sm border border-gray-300 text-gray-900 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">{bulkDownloading ? 'Downloading...' : `Download (${selectedResumes.length})`}</span>
                <span className="sm:hidden">{selectedResumes.length}</span>
              </button>
              )}
              {canExport && (
              <button
                onClick={handleExportExcel}
                className="px-3 sm:px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
              )}
              {canCreateAssessments && (
                <button
                  onClick={() => setShowBulkInviteModal(true)}
                  disabled={availableUnits === 0}
                  className="px-3 sm:px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={availableUnits === 0 ? 'No assessment units available' : `Bulk invite ${selectedResumes.length} candidates`}
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Bulk Invite ({selectedResumes.length})</span>
                  <span className="sm:hidden">{selectedResumes.length}</span>
                </button>
              )}
            </>
          )}
          {selectedResumes.length === 0 && canExport && (
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
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-black palaceholder-gray-500 bg-white"
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
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
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
                    className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                  />
                  <input
                    type="number"
                    value={filterScoreMax}
                    onChange={(e) => setFilterScoreMax(Number(e.target.value))}
                    min="0"
                    max="100"
                    placeholder="Max"
                    className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                  />
                </div>
              </div>

              {/* Recruiter */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">Scored By</label>
                <select
                  value={filterRecruiter}
                  onChange={(e) => setFilterRecruiter(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
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
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[1100px] table-auto">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 w-12 align-middle">
                <button onClick={handleSelectAll} className="p-1 hover:bg-gray-100 rounded">
                  {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-gray-800" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </th>
              {enabledColumns.map((col) => (
                <th key={col.id} className="text-left py-3 px-4 text-sm text-gray-600 whitespace-nowrap align-middle">
                  {col.label}
                </th>
              ))}
              <th className="text-left py-3 px-4 text-sm text-gray-600 whitespace-nowrap align-middle">Assessment</th>
              <th className="text-left py-3 px-4 text-sm text-gray-600 whitespace-nowrap align-middle">Actions</th>
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
                <td className="py-3 px-4 align-middle">
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
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
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
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
                        <div className="text-sm text-gray-700 font-medium">{resume.jobTitle || '-'}</div>
                      </td>
                    );
                  }
                  if (col.id === 'version') {
                    const ver = resume.version || resume.resumeVersion || 1;
                    return (
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200">
                          v{ver}
                        </span>
                      </td>
                    );
                  }
                  if (col.id === 'email') {
                    return (
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Mail className="w-3.5 h-3.5" />
                          {resume.email}
                        </div>
                      </td>
                    );
                  }
                  if (col.id === 'phone') {
                    return (
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
                        <div className="flex items-start gap-1 text-sm text-gray-600">
                          <Phone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <div className="flex flex-col gap-0.5">
                            {(() => {
                              const numbers = splitPhoneNumbers(resume.phone, 2);
                              return numbers.length > 0
                                ? numbers.map((num, i) => <span key={i}>{num}</span>)
                                : <span>-</span>;
                            })()}
                          </div>
                        </div>
                      </td>
                    );
                  }
                  if (col.id === 'matchStatus') {
                    return (
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
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
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
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
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
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
                      <td key={col.id} className="py-3 px-4 align-middle min-w-[180px]">
                        <div className="text-sm text-gray-600">{educationDisplay}</div>
                      </td>
                    );
                  }
                  if (col.id === 'certifications') {
                    return (
                      <td key={col.id} className="py-3 px-4 align-middle min-w-[200px]">
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
                    return (
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatISTDate(resume.scoredDate)}{' '}<span className="text-gray-400">{formatISTTime(resume.scoredDate)}</span></span>
                        </div>
                      </td>
                    );
                  }
                  if (col.id === 'scoredBy') {
                    return (
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
                        <div className="text-sm text-gray-600">{resume.scoredBy}</div>
                      </td>
                    );
                  }
                  if (col.id === 'tenantName') {
                    return (
                      <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
                        <div className="text-sm text-gray-600">{resume.tenantName || 'N/A'}</div>
                      </td>
                    );
                  }
                  return null;
                })}

                {/* Assessment Column */}
                <td className="py-3 px-4 align-middle whitespace-nowrap">
                  {/* Invite Button - For Exact Match & Partial Match */}
                  {canCreateAssessments && (resume.matchStatus === 'Exact Match' || resume.matchStatus === 'Partial Match') ? (
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
                <td className="py-3 px-4 align-middle whitespace-nowrap">
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
            className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-[var(--border-dark)] transition-all cursor-pointer"
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
                <div className="flex items-start gap-2 text-gray-600">
                  <Phone className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    {splitPhoneNumbers(resume.phone, 2).map((num, i) => <span key={i}>{num}</span>)}
                  </div>
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
              {enabledColumns.find(c => c.id === 'scoredDate') && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>{formatISTDate(resume.scoredDate)}{' '}<span className="text-gray-400">{formatISTTime(resume.scoredDate)}</span></span>
                  </div>
              )}
              {enabledColumns.find(c => c.id === 'scoredBy') && (
                <div className="text-gray-600">
                  <span className="text-gray-500">Scored by:</span> {resume.scoredBy}
                </div>
              )}
            </div>

            {/* Card Actions */}
            <div className="space-y-2">
              {/* Invite Button - For Exact Match & Partial Match + assessment permission */}
              {canCreateAssessments && (resume.matchStatus === 'Exact Match' || resume.matchStatus === 'Partial Match') && (
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
              
              {canExport && (
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
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Scorecard
                  </>
                )}
              </button>
              )}
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

      {/* Bulk Invite Modal */}
      {showBulkInviteModal && (
        <BulkInviteModal
          selectedResumes={selectedResumes.map(id => {
            const resume = resumes.find(r => r.id === id);
            return resume!;
          }).filter(Boolean)}
          jobId={jobId}
          jobTitle={jobTitle}
          onClose={() => setShowBulkInviteModal(false)}
          onSuccess={() => {
            setShowBulkInviteModal(false);
            // Clear selection after successful bulk invite
            if (onSelectAll) {
              onSelectAll([]);
            } else {
              setInternalSelectedResumes([]);
            }
          }}
        />
      )}

      {/* Export Format Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md max-h-[calc(100dvh-2rem)] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 shrink-0">
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
               aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
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

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 shrink-0">
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

// Bulk Invite Modal Component
interface BulkInviteModalProps {
  selectedResumes: ScoredResume[];
  jobId: string;
  jobTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

function BulkInviteModal({ selectedResumes, jobId, jobTitle, onClose, onSuccess }: BulkInviteModalProps) {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<string>('');
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [showNoMatchWarning, setShowNoMatchWarning] = useState(false);

  // Quota stats
  const [quotaStats, setQuotaStats] = useState<{
    total_quota: number; consumed: number; pending: number; available: number;
  } | null>(null);

  // Separate valid and invalid candidates
  const validCandidates = selectedResumes.filter(r =>
    r.matchStatus === 'Exact Match' || r.matchStatus === 'Partial Match'
  );
  const noMatchCandidates = selectedResumes.filter(r =>
    r.matchStatus === 'No Match' || (!r.matchStatus || r.matchStatus === '')
  );

  useEffect(() => {
    fetchAssessments();
    // Show warning if there are no match candidates
    if (noMatchCandidates.length > 0) {
      setShowNoMatchWarning(true);
    }
    // Fetch quota stats
    assessmentService.getInvitationStats()
      .then(stats => setQuotaStats(stats))
      .catch(() => setQuotaStats(null));
  }, [jobId]);

  const fetchAssessments = async () => {
    setIsLoadingAssessments(true);
    try {
      const response = await assessmentService.list({ jd_id: jobId });
      const revokedIds = getLocallyRevokedAssessmentIds();
      // Only show PUBLISHED assessments (not draft, not archived) and
      // exclude any whose invites the recruiter has revoked — once revoked
      // an assessment is sealed against further invites (duplicate to V2
      // for a fresh round).
      const activeAssessments = response.items.filter(
        (a: any) =>
          a.status === 'published' &&
          !a.is_archived &&
          !isAssessmentRevoked(a, revokedIds)
      );
      setAssessments(activeAssessments);
      // Auto-select if only one assessment
      if (activeAssessments.length === 1) {
        setSelectedAssessment(activeAssessments[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
      toast.error('Failed to load assessments');
    } finally {
      setIsLoadingAssessments(false);
    }
  };

  const handleSendBulkInvitations = async () => {
    if (!selectedAssessment) {
      toast.error('Please select an assessment first');
      return;
    }

    // Only send to valid candidates (Exact Match or Partial Match)
    if (validCandidates.length === 0) {
      toast.error('No valid candidates to invite. Only "Exact Match" and "Partial Match" candidates can be invited.');
      return;
    }

    // Quota check
    if (quotaStats !== null && quotaStats.total_quota < 999999 && quotaStats.available < validCandidates.length) {
      const pendingMsg = quotaStats.pending > 0
        ? ` ${quotaStats.pending} unit(s) held by pending invitations will be released when links expire.`
        : '';
      toast.error(`Insufficient quota. ${quotaStats.available} unit(s) available, need ${validCandidates.length}.${pendingMsg}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const candidates = validCandidates.map(resume => ({
        candidate_name: resume.candidateName,
        candidate_email: resume.email,
        resume_id: resume.resumeId,
      }));

      await assessmentService.bulkInvite(selectedAssessment, {
        candidates,
        expiry_days: expiryDays,
      });

      const message = noMatchCandidates.length > 0
        ? `Successfully sent ${validCandidates.length} invitation${validCandidates.length > 1 ? 's' : ''}! ${noMatchCandidates.length} "No Match" candidate${noMatchCandidates.length > 1 ? 's were' : ' was'} excluded.`
        : `Successfully sent ${validCandidates.length} invitation${validCandidates.length > 1 ? 's' : ''}!`;

      toast.success(message);
      onSuccess();
    } catch (error: any) {
      console.error('Failed to send bulk invitations:', error);
      const errorMessage = error.message || 'Failed to send invitations. Please try again.';

      // Check for quota error
      if (errorMessage.includes('quota') || errorMessage.includes('units')) {
        toast.error('Insufficient assessment units available');
      } else if (errorMessage.includes('409') || errorMessage.includes('duplicate')) {
        toast.error('Some candidates have already been invited to this assessment');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAssessmentData = assessments.find(a => a.id === selectedAssessment);

  if (isLoadingAssessments) {
    return (
      <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Assessments...</h3>
          <p className="text-gray-500 text-sm">Checking for existing assessments</p>
        </div>
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
            <h3 className="text-gray-900 text-lg font-medium">No Assessment Found</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6 overflow-y-auto flex-1">
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-amber-600" />
              </div>
              <p className="text-gray-600 text-sm">
                There is no published assessment for this job description yet.
                Please create and publish an assessment first.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-center shrink-0">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Bulk Invite Candidates</h2>
              <p className="text-blue-100 text-sm">{jobTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quota Banner */}
          {quotaStats !== null && (() => {
            const isUnlimited = quotaStats.total_quota >= 999999;
            const isInsufficient = !isUnlimited && quotaStats.available === 0;
            const isLow = !isUnlimited && !isInsufficient && quotaStats.available <= 3;
            if (isUnlimited) return null;
            return (
              <div className={`px-4 py-3 rounded-lg border text-sm flex items-start gap-2 ${
                isInsufficient ? 'bg-red-50 border-red-200 text-red-800'
                : isLow ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}>
                {isInsufficient
                  ? <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  : <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                }
                <div className="flex-1">
                  <div className="font-medium mb-0.5">
                    {isInsufficient ? 'No assessment units available'
                      : isLow ? `Only ${quotaStats.available} unit(s) available`
                      : `${quotaStats.available} assessment unit(s) available`}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs opacity-80">
                    <span>Total: {quotaStats.total_quota}</span>
                    <span>Consumed: {quotaStats.consumed}</span>
                    {quotaStats.pending > 0 && <span>Pending: {quotaStats.pending}</span>}
                  </div>
                  {quotaStats.pending > 0 && (
                    <p className="text-xs mt-1 opacity-80">
                      {quotaStats.pending} unit(s) held by active invitations — released when links expire.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Assessment Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Assessment *</label>
            <select
              value={selectedAssessment}
              onChange={(e) => setSelectedAssessment(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Choose an assessment --</option>
              {assessments.map((assessment) => {
                // Strip any "- Version N" baked into the stored title and
                // append the live version from `assessment.version` so the
                // dropdown always reflects the assessment's real version.
                const parsed = parseAssessmentTitle(assessment.title || '');
                const displayVersion = typeof assessment.version === 'number'
                  ? assessment.version
                  : parsed.version;
                const base = parsed.cleanTitle || assessment.short_id || 'Untitled assessment';
                const versionSuffix = displayVersion ? ` — Version ${displayVersion}` : '';
                const shortIdSuffix = assessment.short_id ? ` (${assessment.short_id})` : '';
                return (
                  <option key={assessment.id} value={assessment.id}>
                    {base}{versionSuffix}{shortIdSuffix} • {assessment.duration_minutes} min
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              {assessments.length} assessment{assessments.length !== 1 ? 's' : ''} available for this job
            </p>
          </div>

          {/* Expiry Settings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Invitation Expiry</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          {/* No Match Warning */}
          {showNoMatchWarning && noMatchCandidates.length > 0 && (
            <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-1">
                    {noMatchCandidates.length} Candidate{noMatchCandidates.length > 1 ? 's' : ''} Cannot Be Invited
                  </h4>
                  <p className="text-sm text-gray-700 mb-3">
                    Only candidates with "Exact Match" or "Partial Match" status can be invited to assessments.
                    The following {noMatchCandidates.length > 1 ? 'candidates have' : 'candidate has'} "No Match" status and will be excluded:
                  </p>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2 max-h-32 overflow-y-auto">
                    {noMatchCandidates.map((resume) => (
                      <div key={resume.id} className="flex items-center gap-2 text-sm">
                        <X className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <span className="font-medium text-gray-900">{resume.candidateName}</span>
                        <span className="text-gray-500">({resume.email})</span>
                        <span className="ml-auto px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded-full">No Match</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  <strong>{validCandidates.length}</strong> valid candidate{validCandidates.length !== 1 ? 's' : ''} will receive invitations
                </p>
                <button
                  onClick={() => setShowNoMatchWarning(false)}
                  className="text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Candidates List - Valid Only */}
          {validCandidates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Candidates to Invite ({validCandidates.length})
              </label>
              <div className="max-h-60 overflow-y-auto border border-green-200 rounded-lg bg-green-50">
                {validCandidates.map((resume, index) => (
                  <div
                    key={resume.id}
                    className={`p-3 flex items-center gap-3 ${
                      index < validCandidates.length - 1 ? 'border-b border-green-100' : ''
                    }`}
                  >
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-medium text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 text-sm">{resume.candidateName}</div>
                      <div className="text-xs text-gray-600">{resume.email}</div>
                    </div>
                    {resume.matchStatus && (
                      <div
                        className={`px-2 py-1 text-xs rounded-full ${
                          resume.matchStatus === 'Exact Match'
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                        }`}
                      >
                        {resume.matchStatus}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Valid Candidates Warning */}
          {validCandidates.length === 0 && (
            <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-6 text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-8 h-8 text-gray-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">No Valid Candidates Selected</h4>
              <p className="text-sm text-gray-600">
                All selected candidates have "No Match" status and cannot be invited to assessments.
                Please select candidates with "Exact Match" or "Partial Match" status.
              </p>
            </div>
          )}

          {/* Preview */}
          {selectedAssessment && validCandidates.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Mail className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-800">Ready to Send</span>
              </div>
              <div className="text-sm text-blue-700 space-y-1">
                <p><strong>Assessment:</strong> {selectedAssessmentData?.title}</p>
                <p><strong>Duration:</strong> {selectedAssessmentData?.duration_minutes} minutes</p>
                <p><strong>Recipients:</strong> {validCandidates.length} candidate(s)</p>
                {noMatchCandidates.length > 0 && (
                  <p className="text-gray-600">
                    <strong>Excluded:</strong> {noMatchCandidates.length} "No Match" candidate(s)
                  </p>
                )}
                <p><strong>Expires in:</strong> {expiryDays} day{expiryDays > 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
          <div className="text-sm">
            {validCandidates.length > 0 ? (
              (() => {
                const insufficient = quotaStats !== null && quotaStats.total_quota < 999999 && quotaStats.available < validCandidates.length;
                return (
                  <span className={insufficient ? 'text-red-600 font-medium' : 'text-gray-600'}>
                    <strong className={insufficient ? 'text-red-600' : 'text-green-600'}>{validCandidates.length}</strong> invitation{validCandidates.length !== 1 ? 's' : ''} will be sent
                    {insufficient && ` — only ${quotaStats!.available} unit(s) available`}
                    {!insufficient && noMatchCandidates.length > 0 && (
                      <span className="ml-2 text-gray-500">({noMatchCandidates.length} excluded)</span>
                    )}
                  </span>
                );
              })()
            ) : (
              <span className="text-gray-500">No valid candidates to invite</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSendBulkInvitations}
              disabled={!selectedAssessment || isSubmitting || validCandidates.length === 0 || (quotaStats !== null && quotaStats.available === 0 && quotaStats.total_quota < 999999)}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Invitations
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}