"use client";

import { Target, Briefcase, Filter, Search, FileText, User, MapPin, Mail, Phone, CheckCircle, FolderOpen, Database, TrendingUp, Award, ChevronDown, Download, Clock, History, Eye, X, ArrowLeft, Send, MousePointer, PlayCircle, CheckCircle2, XCircle, AlertCircle, DollarSign, List, LayoutGrid } from 'lucide-react';
import { useState } from 'react';
import ScoredResumesTable from './ScoredResumesTable';
import ResumeSelectionModal from './ResumeSelectionModal';
import ResumeScoringStatusPanel from './ResumeScoringStatusPanel';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';

// Types
interface Job {
  id: string;
  title: string;
  location: string;
  department: string;
  status: string;
  applicants: number;
  employmentType?: string;
  experience?: string;
}

interface Resume {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  experience?: string;
  skills?: string[];
  folderId?: string;
  education?: string;
  certifications?: string[];
}

interface Folder {
  id: string;
  name: string;
  resumeCount: number;
}

interface Tenant {
  id: string;
  subscription: {
    limits: { resumeScoring: number };
    usage: { resumeScoring: number };
  };
}

interface ScoredResumeData {
  id: string;
  jobId: string;
  jobTitle: string;
  scoredAt: Date;
  source: 'my-resumes' | 'database';
  totalScored: number;
  scoredResumes: any[];
}

interface ResumeScoringPageProps {
  jobs?: Job[];
  resumes?: Resume[];
  folders?: Folder[];
  scoredHistory?: ScoredResumeData[];
  onSaveScores?: (data: ScoredResumeData) => void;
  onNavigateToAITalentMatch?: (jobId: string) => void;
  onBack?: () => void;
  tenant?: Tenant;
}

export default function ResumeScoringPage({
  jobs: propJobs = [],
  resumes: propResumes = [],
  folders: propFolders = [],
  scoredHistory = [],
  onSaveScores,
  onNavigateToAITalentMatch,
  onBack,
  tenant
}: ResumeScoringPageProps) {
  // Use props directly - data is fetched by the page route
  const jobs = propJobs;
  const resumes = propResumes;
  const folders = propFolders;

  // View state
  const [viewMode, setViewMode] = useState<'history' | 'details' | 'new' | 'candidateView'>('history');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ScoredResumeData | null>(null);
  const [selectedCandidateForView, setSelectedCandidateForView] = useState<any | null>(null);
  const [selectedJob, setSelectedJob] = useState('');
  const [resumeSource, setResumeSource] = useState<'my-resumes' | 'internal-database' | null>(null);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showResumeSelectionModal, setShowResumeSelectionModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [experienceFilter, setExperienceFilter] = useState<string>('all');
  const [isScoring, setIsScoring] = useState(false);
  const [scoredResumes, setScoredResumes] = useState<any[]>([]);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // State for real-time scoring status panel
  const [showScoringPanel, setShowScoringPanel] = useState(false);
  const [resumesToScore, setResumesToScore] = useState<Array<{ id: string; name: string }>>([]);
  const [scoringSource, setScoringSource] = useState<'my-resumes' | 'database'>('database');

  // State for Progress Tables Modal
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressData, setProgressData] = useState<ScoringProgressItem[]>([]);
  const [filterByJobId, setFilterByJobId] = useState<string | undefined>(undefined);
  const [showJobTitleColumn, setShowJobTitleColumn] = useState(false);

  // History filters
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historySourceFilter, setHistorySourceFilter] = useState<'all' | 'my-resumes' | 'database'>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyMinCandidates, setHistoryMinCandidates] = useState<number>(0);
  const [historyAvgScoreMin, setHistoryAvgScoreMin] = useState<number>(0);
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);

  // History view mode and selection
  const [historyViewMode, setHistoryViewMode] = useState<'grid' | 'list'>('list');
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<Set<string>>(new Set());

  // Split resumes - myResumes are all user-uploaded resumes, databaseResumes are all resumes
  const myResumes = resumes; // All resumes belong to the user (My Resumes)
  const databaseResumes = resumes;

  const availableResumes = resumeSource === 'my-resumes' ? myResumes :
                          resumeSource === 'internal-database' ? databaseResumes :
                          [];

  const filteredResumes = availableResumes.filter(resume => {
    const matchesSearch = searchQuery === '' ||
      resume.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resume.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (resume.skills && resume.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesExperience = experienceFilter === 'all' || resume.experience === experienceFilter;

    return matchesSearch && matchesExperience;
  });

  const handleResumeToggle = (resumeId: string) => {
    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  const handleSelectAll = () => {
    if (selectedResumes.length === filteredResumes.length) {
      setSelectedResumes([]);
    } else {
      setSelectedResumes(filteredResumes.map(r => r.id));
    }
  };

  const getMatchReason = (score: number) => {
    if (score >= 85) return 'Excellent match with strong alignment on key skills and experience requirements. Highly recommended candidate.';
    if (score >= 70) return 'Good match with relevant skills and experience. Solid candidate for consideration.';
    return 'Moderate match with some relevant skills. May require additional evaluation.';
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-gray-800';
    return 'text-yellow-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-gray-100 border-gray-300 text-gray-900';
    return 'bg-yellow-100 border-yellow-300 text-yellow-700';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return 'Exact Match';
    if (score >= 70) return 'Partial Match';
    return 'No Match';
  };

  // Selection handlers for history items
  const handleSelectHistoryItem = (itemId: string) => {
    const newSelected = new Set(selectedHistoryItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedHistoryItems(newSelected);
  };

  const handleSelectAllHistory = (filteredHistory: ScoredResumeData[]) => {
    if (selectedHistoryItems.size === filteredHistory.length) {
      setSelectedHistoryItems(new Set());
    } else {
      setSelectedHistoryItems(new Set(filteredHistory.map(item => item.id)));
    }
  };

  const handleDownloadSelectedHistory = () => {
    if (selectedHistoryItems.size === 0) return;

    const selectedData = scoredHistory.filter(item => selectedHistoryItems.has(item.id));
    const totalResumes = selectedData.reduce((sum, item) => sum + item.totalScored, 0);

    alert(`Download initiated!\n\n${selectedHistoryItems.size} scoring session${selectedHistoryItems.size > 1 ? 's' : ''} selected\n${totalResumes} total resume${totalResumes > 1 ? 's' : ''}\n\nIncluded:\n${selectedData.map((item, i) => `${i + 1}. ${item.jobTitle} - ${item.totalScored} resumes`).join('\n')}\n\n(Mock download - would download ZIP file with all resumes)`);
  };

  const publishedJobs = jobs.filter(j => j.status === 'Published' || j.status === 'Active');
  const selectedJobData = jobs.find(j => j.id === selectedJob);

  // Convert scored resumes to ScoredResumesTable format
  const convertToScoredResumesFormat = (scoredData: ScoredResumeData) => {
    console.log('[ResumeScoringPage] Converting scored resumes:', scoredData.scoredResumes);
    return scoredData.scoredResumes.map((resume, index) => {
      console.log('[ResumeScoringPage] Resume:', resume.id, 'candidateName:', resume.candidateName, 'candidateEmail:', resume.candidateEmail);
      const getResumeVersion = () => {
        if (resume.name === 'Sarah Johnson') return 'Current';
        if (resume.name === 'Michael Chen') return 'Version 2';
        if (index % 4 === 0) return 'Version 1';
        if (index % 3 === 0) return 'Version 2';
        return 'Current';
      };

      return {
        id: resume.id,
        // Use candidateName from API, fallback to name, then 'Unknown Candidate'
        candidateName: resume.candidateName || resume.name || 'Unknown Candidate',
        email: resume.candidateEmail || resume.email || 'N/A',
        phone: resume.phone || 'N/A',
        matchStatus: resume.matchScore >= 85 ? 'Exact Match' :
                     resume.matchScore >= 70 ? 'Partial Match' : 'No Match',
        scorePercentage: resume.matchScore,
        scoredDate: new Date(scoredData.scoredAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
        scoredBy: 'AI Resume Scorer',
        experience: resume.experience || 'N/A',
        education: resume.education || 'N/A',
        certifications: resume.certifications || [],
        resumeVersion: getResumeVersion(),
        // Pass real scoring data from API
        aiSummary: resume.aiSummary,
        strengths: resume.strengths,
        gaps: resume.gaps,
        matchReason: resume.matchReason,
        scoreBreakdown: resume.scoreBreakdown,
        title: resume.title,
        currentCompany: resume.currentCompany,
        location: resume.location,
        // Additional fields for personal info
        professionalSummary: resume.professionalSummary,
        skills: resume.skills,
        technicalSkills: resume.technicalSkills,
        softSkills: resume.softSkills,
        educationDetails: resume.educationDetails,
        experienceDetails: resume.experienceDetails,
        languages: resume.languages,
      };
    });
  };

  // View Candidate Scoring Detail Page
  if (viewMode === 'candidateView' && selectedCandidateForView && selectedHistoryItem) {
    return (
      <CandidateScoringDetailPage
        resume={selectedCandidateForView}
        jobTitle={selectedHistoryItem.jobTitle}
        onBack={() => {
          setSelectedCandidateForView(null);
          setViewMode('details');
        }}
      />
    );
  }

  // View History Details
  if (viewMode === 'details' && selectedHistoryItem) {
    const scoredResumesData = convertToScoredResumesFormat(selectedHistoryItem);

    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-gray-50 to-white">
        {/* Header with Back Button */}
        <div className="mb-6">
          <button
            onClick={() => {
              setViewMode('history');
              setSelectedHistoryItem(null);
              setSelectedStatusFilter('all');
            }}
            className="flex items-center gap-2 text-gray-800 hover:text-gray-900 mb-4 font-medium transition-colors hover:gap-3"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Scored Candidates
          </button>

          <div className="bg-white rounded-xl shadow-lg border-2 border-gray-300 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                  <Target className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl text-gray-900 mb-1">{selectedHistoryItem.jobTitle}</h1>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(selectedHistoryItem.scoredAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      {selectedHistoryItem.totalScored} candidates scored
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      selectedHistoryItem.source === 'my-resumes'
                        ? 'bg-gray-100 text-gray-900'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      {selectedHistoryItem.source === 'my-resumes' ? (
                        <>
                          <FolderOpen className="w-3 h-3" />
                          My Resumes
                        </>
                      ) : (
                        <>
                          <Database className="w-3 h-3" />
                          Resume Database
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setViewMode('new')}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                <Target className="w-4 h-4" />
                Score New Resumes
              </button>
            </div>
          </div>
        </div>

        {/* Scored Resumes Table */}
        <ScoredResumesTable
          resumes={scoredResumesData}
          jobTitle={selectedHistoryItem.jobTitle}
          jobId={selectedHistoryItem.jobId}
          availableUnits={10}
          onViewCandidate={(resume) => {
            setSelectedCandidateForView(resume);
            setViewMode('candidateView');
          }}
        />

        {/* Bulk Scoring Progress Modal */}
        {showProgressModal && (
          <BulkScoringProgressModal
            progressData={progressData}
            onClose={() => setShowProgressModal(false)}
            showJobTitleColumn={showJobTitleColumn}
          />
        )}
      </main>
    );
  }

  // View History List
  if (viewMode === 'history') {
    // Filter history items
    const filteredHistory = scoredHistory.filter(item => {
      const matchesSearch = historySearchQuery === '' ||
        item.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase());

      const matchesSource = historySourceFilter === 'all' || item.source === historySourceFilter;

      let matchesDate = true;
      if (historyDateFrom) {
        matchesDate = matchesDate && new Date(item.scoredAt) >= new Date(historyDateFrom);
      }
      if (historyDateTo) {
        matchesDate = matchesDate && new Date(item.scoredAt) <= new Date(historyDateTo);
      }

      const matchesCandidates = item.totalScored >= historyMinCandidates;

      const avgScore = item.scoredResumes.length > 0
        ? item.scoredResumes.reduce((sum, r) => sum + r.matchScore, 0) / item.scoredResumes.length
        : 0;
      const matchesAvgScore = avgScore >= historyAvgScoreMin;

      return matchesSearch && matchesSource && matchesDate && matchesCandidates && matchesAvgScore;
    });

    const activeFiltersCount = [
      historySearchQuery !== '',
      historySourceFilter !== 'all',
      historyDateFrom !== '',
      historyDateTo !== '',
      historyMinCandidates > 0,
      historyAvgScoreMin > 0,
    ].filter(Boolean).length;

    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-gray-50 to-white">
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
              <h1 className="text-gray-900 text-xl font-semibold">Scored Candidates</h1>
              <p className="text-sm text-gray-600">View and manage previously scored resumes</p>
            </div>

            {/* Available Units Display */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl shadow-lg p-4 border-2 border-gray-300 mr-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xs text-gray-100 mb-0.5">Available Units</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold text-white">
                      {tenant ? (tenant.subscription.limits.resumeScoring - tenant.subscription.usage.resumeScoring).toLocaleString() : '250'}
                    </span>
                    <span className="text-xs text-gray-100">units</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-white border-opacity-20">
                <div className="flex items-center justify-between text-xs text-gray-100">
                  <span>Used / Limit:</span>
                  <span className="font-medium text-white">
                    {tenant ? `${tenant.subscription.usage.resumeScoring.toLocaleString()} / ${tenant.subscription.limits.resumeScoring.toLocaleString()}` : '3,247 / 5,000'}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setViewMode('new');
                setSelectedJob('');
                setResumeSource(null);
                setSelectedResumes([]);
              }}
              className="px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
            >
              <Target className="w-4 h-4" />
              Score Resumes
            </button>
          </div>
        </div>

        {/* View Toggle and Download Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setHistoryViewMode('grid')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    historyViewMode === 'grid'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Grid
                </button>
                <button
                  onClick={() => setHistoryViewMode('list')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    historyViewMode === 'list'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List className="w-4 h-4" />
                  List
                </button>
              </div>

              {selectedHistoryItems.size > 0 && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-sm text-gray-600">
                    {selectedHistoryItems.size} selected
                  </span>
                </div>
              )}
            </div>

            {selectedHistoryItems.size > 0 && (
              <button
                onClick={handleDownloadSelectedHistory}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium shadow-sm hover:shadow-md"
              >
                <Download className="w-4 h-4" />
                Download Selected ({selectedHistoryItems.size})
              </button>
            )}
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search by job title..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <button
              onClick={() => setShowHistoryFilters(!showHistoryFilters)}
              className={`px-5 py-2.5 rounded-lg border-2 transition-all flex items-center gap-2 font-medium ${
                activeFiltersCount > 0
                  ? 'bg-gray-50 border-gray-800 text-gray-900 shadow-sm'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
              }`}
            >
              <Filter className="w-5 h-5" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="px-2 py-0.5 bg-gray-800 text-white rounded-full text-xs font-medium">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${showHistoryFilters ? 'rotate-180' : ''}`} />
            </button>

            <div className="text-sm text-gray-700 bg-gray-100 px-4 py-2.5 rounded-lg whitespace-nowrap font-medium border border-gray-200">
              <span className="text-gray-800">{filteredHistory.length}</span> of {scoredHistory.length} jobs
            </div>
          </div>

          {/* Expanded Filters */}
          {showHistoryFilters && (
            <div className="mt-5 pt-5 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Resume Source
                  </label>
                  <select
                    value={historySourceFilter}
                    onChange={(e) => setHistorySourceFilter(e.target.value as 'all' | 'my-resumes' | 'database')}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent bg-white transition-shadow"
                  >
                    <option value="all">All Sources</option>
                    <option value="my-resumes">My Resumes</option>
                    <option value="database">Resume Database</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scored From
                  </label>
                  <input
                    type="date"
                    value={historyDateFrom}
                    onChange={(e) => setHistoryDateFrom(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent bg-white transition-shadow"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scored To
                  </label>
                  <input
                    type="date"
                    value={historyDateTo}
                    onChange={(e) => setHistoryDateTo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent bg-white transition-shadow"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Min Candidates: <span className="text-gray-800">{historyMinCandidates}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={historyMinCandidates}
                    onChange={(e) => setHistoryMinCandidates(Number(e.target.value))}
                    className="w-full accent-gray-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Min Avg Score: <span className="text-gray-800">{historyAvgScoreMin}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={historyAvgScoreMin}
                    onChange={(e) => setHistoryAvgScoreMin(Number(e.target.value))}
                    className="w-full accent-gray-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setHistorySearchQuery('');
                      setHistorySourceFilter('all');
                      setHistoryDateFrom('');
                      setHistoryDateTo('');
                      setHistoryMinCandidates(0);
                      setHistoryAvgScoreMin(0);
                    }}
                    disabled={activeFiltersCount === 0}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-medium hover:border-gray-400"
                  >
                    <X className="w-4 h-4" />
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* History List or Empty State */}
        {filteredHistory.length > 0 ? (
          <div className={historyViewMode === 'grid' ? 'grid gap-5' : 'space-y-3'}>
            {filteredHistory.map((item) => {
              const avgScore = item.scoredResumes.length > 0
                ? Math.round(item.scoredResumes.reduce((sum, r) => sum + r.matchScore, 0) / item.scoredResumes.length)
                : 0;

              const excellentCount = item.scoredResumes.filter(r => r.matchScore >= 85).length;
              const goodCount = item.scoredResumes.filter(r => r.matchScore >= 70 && r.matchScore < 85).length;
              const moderateCount = item.scoredResumes.filter(r => r.matchScore < 70).length;
              const isSelected = selectedHistoryItems.has(item.id);

              const jobDetails = jobs.find(j => j.id === item.jobId);

              if (historyViewMode === 'list') {
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg border-2 transition-all p-4 border-gray-200 hover:border-gray-300"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-gray-800 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
                        <Target className="w-5 h-5 text-white" />
                      </div>

                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => {
                          setSelectedHistoryItem(item);
                          setViewMode('details');
                        }}
                      >
                        <h3 className="text-lg text-gray-900 mb-1 hover:text-gray-800 transition-colors">
                          {item.jobTitle}
                        </h3>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <Clock className="w-4 h-4" />
                          {new Date(item.scoredAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <FileText className="w-4 h-4" />
                          {item.totalScored} candidates
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                          item.source === 'my-resumes'
                            ? 'bg-gray-100 text-gray-900 border border-gray-200'
                            : 'bg-gray-100 text-gray-900 border border-gray-200'
                        }`}>
                          {item.source === 'my-resumes' ? (
                            <>
                              <FolderOpen className="w-3 h-3" />
                              My Resumes
                            </>
                          ) : (
                            <>
                              <Database className="w-3 h-3" />
                              Database
                            </>
                          )}
                        </span>

                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                          <span className="text-xs text-gray-600">Avg Score:</span>
                          <span className={`text-base font-semibold ${
                            avgScore >= 85 ? 'text-green-600' : avgScore >= 70 ? 'text-gray-800' : 'text-yellow-600'
                          }`}>
                            {avgScore}%
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            setSelectedHistoryItem(item);
                            setViewMode('details');
                          }}
                          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // Grid View
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border-2 transition-all p-6 group border-gray-200 hover:border-gray-400 hover:shadow-lg"
                >
                  <div className="flex items-start gap-6">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => {
                        setSelectedHistoryItem(item);
                        setViewMode('details');
                      }}
                    >
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
                          <Target className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl text-gray-900 mb-2 group-hover:text-gray-800 transition-colors">
                            {item.jobTitle}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-3">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              Scored {new Date(item.scoredAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <FileText className="w-4 h-4" />
                              {item.totalScored} candidates
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                              item.source === 'my-resumes'
                                ? 'bg-gray-100 text-gray-900 border border-gray-200'
                                : 'bg-gray-100 text-gray-900 border border-gray-200'
                            }`}>
                              {item.source === 'my-resumes' ? (
                                <>
                                  <FolderOpen className="w-3 h-3" />
                                  My Resumes
                                </>
                              ) : (
                                <>
                                  <Database className="w-3 h-3" />
                                  Database
                                </>
                              )}
                            </span>
                          </div>

                          {jobDetails && (
                            <div className="bg-gradient-to-r from-gray-50 to-gray-50/30 border border-gray-200 rounded-lg p-4 mb-4">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                                <div className="flex items-start gap-2">
                                  <MapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500 mb-0.5">Location</div>
                                    <div className="text-sm text-gray-900 font-medium">{jobDetails.location}</div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <Briefcase className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500 mb-0.5">Department</div>
                                    <div className="text-sm text-gray-900 font-medium">{jobDetails.department}</div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <User className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500 mb-0.5">Employment Type</div>
                                    <div className="text-sm text-gray-900 font-medium">{jobDetails.employmentType || 'Full-time'}</div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <Award className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500 mb-0.5">Experience</div>
                                    <div className="text-sm text-gray-900 font-medium">{jobDetails.experience || 'Not specified'}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">Excellent</span>
                            <Award className="w-4 h-4 text-green-600" />
                          </div>
                          <div className="text-2xl text-green-700 font-bold">{excellentCount}</div>
                          <div className="text-xs text-gray-600 mt-0.5">85%+ match</div>
                        </div>

                        <div className="bg-gradient-to-br from-gray-50 to-sky-50 border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">Good</span>
                            <CheckCircle className="w-4 h-4 text-gray-800" />
                          </div>
                          <div className="text-2xl text-gray-900 font-bold">{goodCount}</div>
                          <div className="text-xs text-gray-600 mt-0.5">70-84% match</div>
                        </div>

                        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">Moderate</span>
                            <TrendingUp className="w-4 h-4 text-yellow-600" />
                          </div>
                          <div className="text-2xl text-yellow-700 font-bold">{moderateCount}</div>
                          <div className="text-xs text-gray-600 mt-0.5">&lt;70% match</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-center">
                      <div className="text-sm text-gray-600 mb-2 font-medium">Avg Score</div>
                      <div className={`text-4xl font-bold mb-2 ${getScoreColor(avgScore)}`}>
                        {avgScore}%
                      </div>
                      <div className={`inline-block px-3 py-1.5 rounded-full text-xs border font-medium ${getScoreBgColor(avgScore)}`}>
                        {getScoreLabel(avgScore)}
                      </div>

                      <div className="mt-4 flex flex-col gap-2">
                        <button
                          onClick={() => {
                            setSelectedHistoryItem(item);
                            setViewMode('details');
                          }}
                          className="text-gray-800 hover:text-gray-900 text-sm font-medium flex items-center gap-1 justify-center cursor-pointer"
                        >
                          View Details
                          <ArrowLeft className="w-4 h-4 rotate-180 hover:translate-x-1 transition-transform" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : scoredHistory.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-gray-100 to-gray-100 rounded-full flex items-center justify-center">
                <History className="w-10 h-10 text-gray-800" />
              </div>
              <h3 className="text-xl text-gray-900 mb-2">No Scoring History Yet</h3>
              <p className="text-gray-600 mb-6">
                Start scoring resumes against job descriptions to see your results here. Our AI will analyze and rank candidates based on job fit.
              </p>
              <button
                onClick={() => {
                  setViewMode('new');
                  setSelectedJob('');
                  setResumeSource(null);
                  setSelectedResumes([]);
                }}
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium shadow-sm hover:shadow-md inline-flex items-center gap-2"
              >
                <Target className="w-5 h-5" />
                Score Resumes Now
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
                No scored jobs match your current filters. Try adjusting your search criteria or clearing filters.
              </p>
              <button
                onClick={() => {
                  setHistorySearchQuery('');
                  setHistorySourceFilter('all');
                  setHistoryDateFrom('');
                  setHistoryDateTo('');
                  setHistoryMinCandidates(0);
                  setHistoryAvgScoreMin(0);
                }}
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium shadow-sm hover:shadow-md inline-flex items-center gap-2"
              >
                <X className="w-5 h-5" />
                Clear All Filters
              </button>
            </div>
          </div>
        )}

        {showProgressModal && (
          <BulkScoringProgressModal
            progressData={progressData}
            onClose={() => setShowProgressModal(false)}
            showJobTitleColumn={showJobTitleColumn}
          />
        )}
      </main>
    );
  }

  // New Scoring Flow
  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-gray-50 to-white">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => {
              setViewMode('history');
              setSelectedJob('');
              setResumeSource(null);
              setSelectedResumes([]);
            }}
            className="p-2.5 hover:bg-white/80 rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200 group"
            title="Back to Scored Candidates"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-lg">
            <Target className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-gray-900 text-xl font-semibold">Score Resumes</h1>
            <p className="text-sm text-gray-600">Select a job and let AI match the best candidates</p>
          </div>

          {/* Available Units Display */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl shadow-lg p-4 border-2 border-gray-300">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-xs text-gray-100 mb-0.5">Available Units</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">
                    {tenant ? (tenant.subscription.limits.resumeScoring - tenant.subscription.usage.resumeScoring).toLocaleString() : '250'}
                  </span>
                  <span className="text-sm text-gray-100">units</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white border-opacity-20">
              <div className="flex items-center justify-between text-xs text-gray-100">
                <span>Used / Limit:</span>
                <span className="font-medium text-white">
                  {tenant ? `${tenant.subscription.usage.resumeScoring.toLocaleString()} / ${tenant.subscription.limits.resumeScoring.toLocaleString()}` : '3,247 / 5,000'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                selectedJob
                  ? 'bg-green-600 text-white ring-4 ring-green-100'
                  : 'bg-gray-800 text-white ring-4 ring-gray-200'
              }`}>
                {selectedJob ? <CheckCircle2 className="w-5 h-5" /> : '1'}
              </div>
              <span className="text-sm font-medium text-gray-700">Select Job</span>
            </div>
            <div className={`flex-1 h-1 mx-4 rounded-full transition-all ${
              selectedJob ? 'bg-green-600' : 'bg-gray-200'
            }`}></div>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                selectedJob
                  ? 'bg-gray-800 text-white ring-4 ring-gray-200'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                2
              </div>
              <span className={`text-sm font-medium transition-colors ${
                selectedJob ? 'text-gray-700' : 'text-gray-400'
              }`}>View Results</span>
            </div>
          </div>
        </div>
      </div>

      {/* Step 1: Job Selection */}
      <div className={`bg-white rounded-xl shadow-lg p-6 mb-6 transition-all ${
        selectedJob
          ? 'border-2 border-green-300 bg-green-50/30'
          : 'border-2 border-gray-300'
      }`}>
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
            selectedJob
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-white'
          }`}>
            {selectedJob ? <CheckCircle2 className="w-6 h-6" /> : '1'}
          </div>
          <div>
            <h3 className="text-gray-900 font-medium">Select Job Description</h3>
            <p className="text-sm text-gray-600">Choose which role you want to score candidates for</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="flex-1">
            <select
              value={selectedJob}
              onChange={(e) => {
                setSelectedJob(e.target.value);
                setResumeSource(null);
                setSelectedResumes([]);
                setShowResults(false);
              }}
              className="w-full px-4 py-3.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent bg-white transition-shadow text-gray-900 font-medium"
            >
              <option value="">-- Choose a published job --</option>
              {publishedJobs.length === 0 ? (
                <option disabled>No published jobs available</option>
              ) : (
                publishedJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} - {job.location} - {job.applicants} applicants
                  </option>
                ))
              )}
            </select>

            {publishedJobs.length === 0 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-800 font-medium mb-1">No Published Jobs</p>
                  <p className="text-sm text-yellow-700">
                    You need to publish at least one job before you can score resumes. Go to JD Creation to create and publish jobs.
                  </p>
                </div>
              </div>
            )}

            {selectedJobData && (
              <div className="mt-4 p-5 bg-gradient-to-br from-gray-50 to-gray-50 border-2 border-gray-200 rounded-xl">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg text-gray-900 mb-1 font-medium">{selectedJobData.title}</h4>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4" />
                            {selectedJobData.location}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Briefcase className="w-4 h-4" />
                            {selectedJobData.department}
                          </span>
                          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-full text-gray-900 font-medium">
                            <User className="w-4 h-4" />
                            {selectedJobData.applicants} applicants
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowResumeSelectionModal(true)}
                    className="px-6 py-3 bg-gradient-to-r from-gray-800 to-gray-800 text-white rounded-lg hover:from-gray-700 hover:to-gray-900 transition-all text-sm font-medium flex items-center gap-2 shadow-md hover:shadow-lg"
                  >
                    <Target className="w-5 h-5" />
                    Select Resumes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Help Text */}
      {!selectedJob && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-start gap-3">
          <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="text-gray-900 font-medium mb-1">How Resume Scoring Works</h4>
            <ul className="text-sm text-gray-700 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-gray-800 mt-0.5">1.</span>
                <span><strong>Step 1:</strong> Select a published job description from the dropdown above</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-800 mt-0.5">2.</span>
                <span><strong>Step 2:</strong> Click &quot;Select Resumes&quot; to open the resume selection modal</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-800 mt-0.5">3.</span>
                <span><strong>Step 3:</strong> Choose resumes from &quot;My Resumes&quot; folders or &quot;Internal Database&quot;</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-800 mt-0.5">4.</span>
                <span><strong>Step 4:</strong> Select candidates and click &quot;Score Resumes&quot; to analyze with AI</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-800 mt-0.5">5.</span>
                <span><strong>Step 5:</strong> Review scored candidates ranked by match percentage and quality</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Resume Selection Modal */}
      {showResumeSelectionModal && selectedJobData && (
        <ResumeSelectionModal
          jobTitle={selectedJobData.title}
          myResumes={myResumes}
          databaseResumes={databaseResumes}
          folders={folders}
          onClose={() => setShowResumeSelectionModal(false)}
          onScoreResumes={(selectedIds, source) => {
            setShowResumeSelectionModal(false);

            const selectedResumesData = resumes.filter(r => selectedIds.includes(r.id));

            // Pass all available resume data to the scoring panel
            setResumesToScore(selectedResumesData.map(r => ({
              id: r.id,
              name: r.name,
              // Include candidate info if available from resume list
              candidateName: r.candidateName || r.candidate_name,
              candidateEmail: r.candidateEmail || r.candidate_email || r.email,
              phone: r.phone,
            })));
            setScoringSource(source);
            setShowScoringPanel(true);
          }}
        />
      )}

      {/* Real-Time Scoring Status Panel */}
      {showScoringPanel && selectedJobData && (
        <ResumeScoringStatusPanel
          resumes={resumesToScore}
          jobTitle={selectedJobData.title}
          jobId={selectedJob}
          onComplete={(scoredResults) => {
            setShowScoringPanel(false);

            if (onSaveScores) {
              const scoredData: ScoredResumeData = {
                id: Date.now().toString(),
                jobId: selectedJob,
                jobTitle: selectedJobData.title,
                scoredAt: new Date(),
                source: scoringSource,
                totalScored: scoredResults.length,
                scoredResumes: scoredResults,
              };

              onSaveScores(scoredData);
              setSelectedHistoryItem(scoredData);
              setViewMode('details');
            }
          }}
        />
      )}

      {/* Bulk Scoring Progress Modal */}
      {showProgressModal && (
        <BulkScoringProgressModal
          progressData={progressData}
          onClose={() => setShowProgressModal(false)}
          filterByJobId={filterByJobId}
          showJobTitleColumn={showJobTitleColumn}
        />
      )}
    </main>
  );
}
