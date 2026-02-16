import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, Download, FileDown, CheckSquare, Square, Filter, X, Eye, BarChart3, Calendar, Mail, Phone, Clock, CheckCircle, XCircle, FileText, Archive, Loader2 } from 'lucide-react';
import React from 'react';
import { assessmentService } from '@/lib/services/assessmentService';
import { toast } from 'sonner';

// AS-24: localStorage key for column preferences
const COLUMN_PREFERENCES_KEY = 'assessment_results_column_preferences';

interface AssessmentResult {
  id: string;
  candidateName: string;
  email: string;
  phone: string;
  assessmentName: string;
  totalScore: number;
  maxScore: number;
  scorePercentage: number;
  passFail: 'Pass' | 'Fail';
  completedDate: string;
  completionTime: string; // in minutes
  aiSummary: string;
  roundScores: {
    roundName: string;
    score: number;
    maxScore: number;
    passFail: 'Pass' | 'Fail';
  }[];
  invitedDate: string;
  invitedBy: string;
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
}

export default function AssessmentResultsTable({ results, jobTitle, jobId = 'jd-1' }: AssessmentResultsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  
  // Filters
  const [filterPassFail, setFilterPassFail] = useState<'all' | 'Pass' | 'Fail'>('all');
  const [filterScoreMin, setFilterScoreMin] = useState('');
  const [filterScoreMax, setFilterScoreMax] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // AS-24: Default columns configuration
  const defaultColumns: Column[] = [
    { id: 'candidateName', label: 'Candidate Name', enabled: true },
    { id: 'email', label: 'Email', enabled: true },
    { id: 'phone', label: 'Phone', enabled: true },
    { id: 'assessmentName', label: 'Assessment', enabled: true },
    { id: 'scorePercentage', label: 'Score %', enabled: true },
    { id: 'passFail', label: 'Status', enabled: true },
    { id: 'completedDate', label: 'Completion Date', enabled: true },
    { id: 'completionTime', label: 'Time Taken', enabled: true },
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

  const enabledColumns = columns.filter(col => col.enabled);

  // Filter results
  const filteredResults = results.filter(result => {
    const matchesSearch = 
      result.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      result.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPassFail = filterPassFail === 'all' || result.passFail === filterPassFail;
    
    const matchesScoreRange = 
      (!filterScoreMin || result.scorePercentage >= Number(filterScoreMin)) &&
      (!filterScoreMax || result.scorePercentage <= Number(filterScoreMax));
    
    const matchesDateRange = 
      (!filterDateFrom || new Date(result.completedDate) >= new Date(filterDateFrom)) &&
      (!filterDateTo || new Date(result.completedDate) <= new Date(filterDateTo));
    
    return matchesSearch && matchesPassFail && matchesScoreRange && matchesDateRange;
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

  // Export current page only
  const exportCurrentPage = async () => {
    try {
      const assessmentId = jobId;
      const blob = await assessmentService.exportResults(
        assessmentId,
        selectedFormat,
        false,
        enabledColumns.map(c => c.id)
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
        enabledColumns.map(c => c.id)
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

  // AS-25: Individual PDF download
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

  // AS-26: Bulk PDF download as ZIP
  const handleDownloadBulkPDFs = async () => {
    if (downloadingBulkPDF || selectedResults.length === 0) return;

    setDownloadingBulkPDF(true);
    try {
      const blob = await assessmentService.exportBulkPDFs(selectedResults);

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
    setFilterPassFail('all');
    setFilterScoreMin('');
    setFilterScoreMax('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const activeFiltersCount = 
    (filterPassFail !== 'all' ? 1 : 0) +
    (filterScoreMin ? 1 : 0) +
    (filterScoreMax ? 1 : 0) +
    (filterDateFrom ? 1 : 0) +
    (filterDateTo ? 1 : 0);

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
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-gray-900">Assessment Results</h2>
            <p className="text-sm text-gray-600 mt-1">
              {filteredResults.length} {filteredResults.length === 1 ? 'result' : 'results'}
              {searchTerm && ` matching "${searchTerm}"`}
              {activeFiltersCount > 0 && ` with ${activeFiltersCount} filter${activeFiltersCount !== 1 ? 's' : ''} applied`}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Export Excel */}
            {selectedResults.length === 0 && (
              <button
                onClick={handleExportExcel}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                Export to Excel
              </button>
            )}

            {/* Bulk Actions - When items are selected */}
            {selectedResults.length > 0 && (
              <>
                <button
                  onClick={handleDownloadBulkPDFs}
                  disabled={downloadingBulkPDF}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-900 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloadingBulkPDF ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Archive className="w-4 h-4" />
                  )}
                  {downloadingBulkPDF ? 'Downloading...' : `Download PDFs (${selectedResults.length})`}
                </button>
                <button
                  onClick={handleExportExcel}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <FileDown className="w-4 h-4" />
                  Export to Excel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
            />
          </div>

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

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 text-sm border rounded-md transition-colors flex items-center gap-2 ${
              showFilters || activeFiltersCount > 0
                ? 'border-gray-300 text-gray-900 bg-gray-50'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.5 bg-gray-800 text-white rounded text-xs">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm text-gray-900">Filters</h3>
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-gray-800 hover:text-gray-900 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Clear All
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4">
              {/* Pass/Fail Filter */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">Status</label>
                <select
                  value={filterPassFail}
                  onChange={(e) => setFilterPassFail(e.target.value as 'all' | 'Pass' | 'Fail')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                >
                  <option value="all">All</option>
                  <option value="Pass">Pass</option>
                  <option value="Fail">Fail</option>
                </select>
              </div>

              {/* Score Range */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">Min Score %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={filterScoreMin}
                  onChange={(e) => setFilterScoreMin(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Max Score %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="100"
                  value={filterScoreMax}
                  onChange={(e) => setFilterScoreMax(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Completion Date From</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>

              <div className="col-start-4">
                <label className="block text-sm text-gray-700 mb-1">Completion Date To</label>
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
                      if (col.id === 'candidateName') {
                        return (
                          <td key={col.id} className="py-3 px-4">
                            <div className="text-sm text-gray-900">{result.candidateName}</div>
                          </td>
                        );
                      }
                      if (col.id === 'email') {
                        return (
                          <td key={col.id} className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Mail className="w-3.5 h-3.5" />
                              {result.email}
                            </div>
                          </td>
                        );
                      }
                      if (col.id === 'phone') {
                        return (
                          <td key={col.id} className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Phone className="w-3.5 h-3.5" />
                              {result.phone}
                            </div>
                          </td>
                        );
                      }
                      if (col.id === 'assessmentName') {
                        return (
                          <td key={col.id} className="py-3 px-4">
                            <div className="text-sm text-gray-700">{result.assessmentName}</div>
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
                      if (col.id === 'passFail') {
                        return (
                          <td key={col.id} className="py-3 px-4">
                            {getPassFailBadge(result.passFail)}
                          </td>
                        );
                      }
                      if (col.id === 'completedDate') {
                        return (
                          <td key={col.id} className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Calendar className="w-3.5 h-3.5" />
                              {result.completedDate}
                            </div>
                          </td>
                        );
                      }
                      if (col.id === 'completionTime') {
                        return (
                          <td key={col.id} className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                              <Clock className="w-3.5 h-3.5" />
                              {result.completionTime} min
                            </div>
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
                        <button
                          onClick={() => handleViewDetails(result)}
                          className="p-1.5 text-gray-800 hover:bg-gray-50 rounded-md transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(result.id)}
                          disabled={downloadingPDF === result.id}
                          className="p-1.5 text-gray-800 hover:bg-gray-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Download PDF Report"
                        >
                          {downloadingPDF === result.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
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
                      <h3 className="text-sm text-gray-900 truncate">{result.candidateName}</h3>
                      <p className="text-xs text-gray-600 mt-0.5">{result.assessmentName}</p>
                    </div>
                    {getPassFailBadge(result.passFail)}
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xl ${getScoreColor(result.scorePercentage)}`}>
                      {result.scorePercentage}%
                    </span>
                    <span className="text-xs text-gray-400">
                      ({result.totalScore}/{result.maxScore})
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
                    {enabledColumns.find(c => c.id === 'phone') && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Phone className="w-3 h-3" />
                        {result.phone}
                      </div>
                    )}
                    {enabledColumns.find(c => c.id === 'completedDate') && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Calendar className="w-3 h-3" />
                        {result.completedDate}
                      </div>
                    )}
                    {enabledColumns.find(c => c.id === 'completionTime') && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Clock className="w-3 h-3" />
                        {result.completionTime} min
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewDetails(result)}
                      className="flex-1 px-3 py-1.5 text-xs text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {selectedResultDetail === result.id ? 'Hide' : 'View'} Details
                    </button>
                    <button
                      onClick={() => handleDownloadPDF(result.id)}
                      disabled={downloadingPDF === result.id}
                      className="flex-1 px-3 py-1.5 text-xs text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {downloadingPDF === result.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                      {downloadingPDF === result.id ? 'Downloading...' : 'Download PDF'}
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
                  <p className="text-sm text-gray-600 mb-4">Select export scope:</p>

                  <div className="space-y-3">
                    {/* Current Page Option */}
                    <button
                      onClick={exportCurrentPage}
                      className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group"
                    >
                      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                        <FileDown className="w-6 h-6 text-purple-700" />
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-medium text-gray-900">Current Page</div>
                        <div className="text-sm text-gray-500">
                          Export results visible on this page only
                        </div>
                      </div>
                    </button>

                    {/* All Filtered Results Option */}
                    <button
                      onClick={exportAllFiltered}
                      className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group"
                    >
                      <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                        <Download className="w-6 h-6 text-indigo-700" />
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-medium text-gray-900">All Filtered Results</div>
                        <div className="text-sm text-gray-500">
                          Export all {filteredResults.length} results (includes completed, in-progress, and pending)
                        </div>
                      </div>
                    </button>
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