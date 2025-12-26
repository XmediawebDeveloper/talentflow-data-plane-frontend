import { Mail, Phone, Calendar, Search, SlidersHorizontal, Download, FileDown, CheckSquare, Square, Filter, X, UserPlus, Eye, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import ColumnCustomizationModal from './ColumnCustomizationModal';
import InviteToAssessmentModal from './InviteToAssessmentModal';

interface ScoredResume {
  id: string;
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
}

interface ScoredResumesTableProps {
  resumes: ScoredResume[];
  jobTitle: string;
  jobId?: string;
  availableUnits?: number;
  onViewCandidate?: (resume: ScoredResume) => void;
}

export default function ScoredResumesTable({ resumes, jobTitle, jobId = 'jd-1', availableUnits = 10, onViewCandidate }: ScoredResumesTableProps) {
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
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

  // Column configuration
  const [availableColumns, setAvailableColumns] = useState([
    { id: 'candidateName', label: 'Candidate Name', enabled: true },
    { id: 'email', label: 'Email', enabled: true },
    { id: 'phone', label: 'Phone', enabled: true },
    { id: 'matchStatus', label: 'Match Status', enabled: true },
    { id: 'scorePercentage', label: 'Score %', enabled: true },
    { id: 'experience', label: 'Experience', enabled: false },
    { id: 'education', label: 'Education', enabled: false },
    { id: 'certifications', label: 'Certifications', enabled: false },
    { id: 'scoredDate', label: 'Scored Date', enabled: true },
    { id: 'scoredBy', label: 'Scored By', enabled: true },
  ]);

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
    if (selectedResumes.length === filteredResumes.length) {
      setSelectedResumes([]);
    } else {
      setSelectedResumes(filteredResumes.map(r => r.id));
    }
  };

  const handleSelectResume = (id: string) => {
    setSelectedResumes(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleColumnApply = (selectedColumnIds: string[]) => {
    setAvailableColumns(prev =>
      prev.map(col => ({
        ...col,
        enabled: selectedColumnIds.includes(col.id)
      }))
    );
  };

  const handleExportExcel = () => {
    const selectedData = filteredResumes.filter(r => selectedResumes.includes(r.id));
    const dataToExport = selectedResumes.length > 0 ? selectedData : filteredResumes;
    
    console.log('Exporting to Excel:', {
      jobTitle,
      exportedDate: new Date().toISOString(),
      columns: enabledColumns.map(c => c.label),
      records: dataToExport.length,
      data: dataToExport
    });
    
    alert(`Excel export initiated!\n\nJob: ${jobTitle}\nRecords: ${dataToExport.length}\nColumns: ${enabledColumns.length}\n\n(Mock export - would download Excel file)`);
  };

  const handleDownloadScorecard = (resumeId: string) => {
    const resume = resumes.find(r => r.id === resumeId);
    console.log('Downloading scorecard for:', resume);
    alert(`Scorecard PDF download initiated for:\n\n${resume?.candidateName}\n\n(Mock download - would download PDF file)`);
  };

  const handleDownloadBulkScorecards = () => {
    const selectedData = resumes.filter(r => selectedResumes.includes(r.id));
    console.log('Downloading bulk scorecards:', selectedData);
    alert(`Bulk scorecard download initiated!\n\n${selectedData.length} scorecards will be compressed into ZIP file\n\n(Mock download - would download ZIP file)`);
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-gray-900">Scored Resumes</h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredResumes.length} of {resumes.length} candidates
            {selectedResumes.length > 0 && ` • ${selectedResumes.length} selected`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowColumnModal(true)}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Customize Columns
          </button>
          {selectedResumes.length > 0 && (
            <>
              <button
                onClick={handleDownloadBulkScorecards}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-900 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Scorecards ({selectedResumes.length})
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
          {selectedResumes.length === 0 && (
            <button
              onClick={handleExportExcel}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <FileDown className="w-4 h-4" />
              Export to Excel
            </button>
          )}
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-3">
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

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 text-sm border rounded-md transition-colors flex items-center gap-2 ${
              showFilters || hasActiveFilters
                ? 'bg-gray-50 border-gray-300 text-gray-900'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && !showFilters && (
              <span className="w-2 h-2 bg-gray-800 rounded-full"></span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4">
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
                        <div className="text-sm text-gray-900">{resume.candidateName}</div>
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
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="text-sm text-gray-600">{resume.education || 'N/A'}</div>
                      </td>
                    );
                  }
                  if (col.id === 'certifications') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="text-sm text-gray-600">
                          {resume.certifications && resume.certifications.length > 0
                            ? resume.certifications.join(', ')
                            : 'N/A'}
                        </div>
                      </td>
                    );
                  }
                  if (col.id === 'scoredDate') {
                    return (
                      <td key={col.id} className="py-3 px-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(resume.scoredDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
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
                  <span className="text-gray-500">Education:</span> {resume.education}
                </div>
              )}
              {enabledColumns.find(c => c.id === 'scoredDate') && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4" />
                  {new Date(resume.scoredDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
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
                className="w-full px-4 py-2 text-sm text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Download Scorecard
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
    </div>
  );
}