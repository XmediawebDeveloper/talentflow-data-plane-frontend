'use client';

import { Sparkles, Target, Filter, Search, ChevronDown, Mail, Phone, MapPin, Building2, CheckCircle, Star, User, FileText, Send, TrendingUp, Award, Clock, Briefcase, History, Eye, ArrowLeft, X, DollarSign, CheckCircle2, AlertCircle, PlayCircle, Paperclip } from 'lucide-react';
import { useState, useEffect } from 'react';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import AITalentMatchPageJobsList from './AITalentMatchPageJobsList';
import ResumeVersionsModal from './ResumeVersionsModal';
import { recordUsage } from '@/lib/services/usageTrackingService';
import { MatchedCandidate } from '@/lib/services/aiMatchService';

interface Job {
  id: string;
  title: string;
  department?: string;
  location: string;
  status: string;
  applicants: number;
  employmentType?: string;
  experience?: string;
}

// Extended interface for UI display (adds versions for modal)
interface MatchedCandidateWithVersions extends MatchedCandidate {
  versions?: Array<{
    id: string;
    name: string;
    uploadDate: string;
    size: string;
  }>;
}

interface MatchHistory {
  id: string;
  jobId: string;
  jobTitle: string;
  matchedAt: Date;
  totalMatches: number;
  matchedCandidates: MatchedCandidateWithVersions[];
}

interface AITalentMatchPageProps {
  jobs: Job[];
  matchHistory?: MatchHistory[];
  onSaveMatch?: (data: MatchHistory) => void;
  onSubmitToScoring?: (jobId: string, candidateIds: string[]) => void;
  onBack?: () => void;
}

export default function AITalentMatchPage({ 
  jobs, 
  matchHistory = [], 
  onSaveMatch,
  onSubmitToScoring,
  onBack
}: AITalentMatchPageProps) {
  const [viewMode, setViewMode] = useState<'history' | 'details' | 'new' | 'results'>('history');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<MatchHistory | null>(null);
  const [selectedJob, setSelectedJob] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterThreshold, setFilterThreshold] = useState(0);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  
  // History filters
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  
  // Matching progress
  const [showMatchingPanel, setShowMatchingPanel] = useState(false);
  const [matchedCandidates, setMatchedCandidates] = useState<MatchedCandidateWithVersions[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  
  // Versions modal
  const [selectedVersionsCandidate, setSelectedVersionsCandidate] = useState<MatchedCandidateWithVersions | null>(null);

  // Handle preselected job from JD view page
  useEffect(() => {
    const preselectedJobId = sessionStorage.getItem('preselectedJobId');
    const showResultsOnly = sessionStorage.getItem('showResultsOnly') === 'true';

    if (!preselectedJobId) return;
    // Wait for jobs to be loaded before processing
    if (jobs.length === 0) return;

    // Clear sessionStorage immediately
    sessionStorage.removeItem('preselectedJobId');
    sessionStorage.removeItem('showResultsOnly');

    // Set the selected job
    setSelectedJob(preselectedJobId);

    // Check if there are existing match results for this job
    const existingMatch = matchHistory.find(h => h.jobId === preselectedJobId);

    if (existingMatch && existingMatch.matchedCandidates.length > 0) {
      // Show existing results directly
      setSelectedHistoryItem(existingMatch);
      setMatchedCandidates(existingMatch.matchedCandidates);
      setViewMode('results');
    } else if (showResultsOnly) {
      // User clicked "AI Talent Match Results" - show empty results view for this JD
      // Set empty results so the results view shows "no results" message
      setMatchedCandidates([]);
      setViewMode('results');
    } else {
      // User clicked "AI Talent Match" - run new match
      setViewMode('new');
      // Trigger matching panel after a short delay to ensure job is selected
      setTimeout(() => {
        setShowMatchingPanel(true);
      }, 500);
    }
  }, [jobs, matchHistory]);

  const publishedJobs = jobs.filter(j => j.status === 'Published' || j.status === 'Active');
  const selectedJobData = jobs.find(j => j.id === selectedJob);

  const handleRunAIMatch = (jobId?: string) => {
    const jobToMatch = jobId || selectedJob;
    if (!jobToMatch) return;
    
    // Set the selected job if provided
    if (jobId && jobId !== selectedJob) {
      setSelectedJob(jobId);
    }
    
    // Show matching progress panel
    setShowMatchingPanel(true);
  };

  const handleMatchingComplete = (results: MatchedCandidate[]) => {
    // Transform results to include versions placeholder for UI compatibility
    const candidatesWithVersions: MatchedCandidateWithVersions[] = results.map(candidate => ({
      ...candidate,
      versions: [{
        id: 'v1',
        name: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf`,
        uploadDate: candidate.uploadDate,
        size: '200 KB'
      }]
    }));

    setMatchedCandidates(candidatesWithVersions);
    setShowMatchingPanel(false);
    setMatchError(null);
    setViewMode('results');

    // Track usage - POST /api/v1/external/usage/record (RS - talent match uses resume scoring quota)
    recordUsage({
      quota_type: 'RS',
      amount: results.length,
      operation_type: 'talent_match',
      resource_id: selectedJob,
      metadata: { candidates_matched: results.length }
    });

    // Save to history
    if (onSaveMatch && selectedJobData) {
      const newMatchHistory: MatchHistory = {
        id: Date.now().toString(),
        jobId: selectedJob,
        jobTitle: selectedJobData.title,
        matchedAt: new Date(),
        totalMatches: results.length,
        matchedCandidates: candidatesWithVersions
      };
      onSaveMatch(newMatchHistory);
    }
  };

  const handleSelectCandidate = (id: string) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const filtered = getFilteredCandidates();
    if (selectedCandidates.length === filtered.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(filtered.map(c => c.id));
    }
  };

  const handleSubmitToScoring = () => {
    if (selectedCandidates.length === 0 || !selectedJob) {
      alert('Please select at least one candidate to score');
      return;
    }
    
    if (onSubmitToScoring) {
      onSubmitToScoring(selectedJob, selectedCandidates);
      alert(`${selectedCandidates.length} candidate${selectedCandidates.length > 1 ? 's' : ''} submitted for scoring!`);
    }
  };

  const getFilteredCandidates = (): MatchedCandidateWithVersions[] => {
    const candidates: MatchedCandidateWithVersions[] = viewMode === 'results' ? matchedCandidates :
                      selectedHistoryItem ? selectedHistoryItem.matchedCandidates : [];

    return candidates.filter(candidate => {
      const matchesThreshold = candidate.matchScore >= filterThreshold;
      const matchesSearch = searchQuery === '' ||
        candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (candidate.email && candidate.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        candidate.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesThreshold && matchesSearch;
    });
  };

  const getMatchColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-gray-800';
    if (score >= 50) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getMatchBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-gray-100 border-gray-300 text-gray-900';
    if (score >= 50) return 'bg-yellow-100 border-yellow-300 text-yellow-700';
    return 'bg-gray-100 border-gray-300 text-gray-700';
  };

  const getMatchLabel = (score: number) => {
    if (score >= 85) return 'Excellent Match';
    if (score >= 70) return 'Good Match';
    if (score >= 50) return 'Moderate Match';
    return 'Low Match';
  };

  const filteredHistory = matchHistory.filter(item => {
    const matchesSearch = historySearchQuery === '' || 
      item.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase());
    
    const matchesDateFrom = !historyDateFrom || new Date(item.matchedAt) >= new Date(historyDateFrom);
    const matchesDateTo = !historyDateTo || new Date(item.matchedAt) <= new Date(historyDateTo);
    
    return matchesSearch && matchesDateFrom && matchesDateTo;
  });

  const activeFiltersCount = [
    historySearchQuery !== '',
    historyDateFrom !== '',
    historyDateTo !== '',
  ].filter(Boolean).length;

  // View: History Details
  if (viewMode === 'details' && selectedHistoryItem) {
    const filteredCandidates = getFilteredCandidates();
    const excellentCount = selectedHistoryItem.matchedCandidates.filter(c => c.matchScore >= 85).length;
    const goodCount = selectedHistoryItem.matchedCandidates.filter(c => c.matchScore >= 70 && c.matchScore < 85).length;
    const moderateCount = selectedHistoryItem.matchedCandidates.filter(c => c.matchScore < 70).length;

    return (
      <>
      <main className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 via-blue-50 to-white">
        {/* Header Section - Sticky */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm p-6">
          {/* Back Button & Title */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                setViewMode('history');
                setSelectedHistoryItem(null);
                setSelectedCandidates([]);
              }}
              className="flex items-center gap-2 text-gray-800 hover:text-gray-900 font-medium transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Matched Jobs
            </button>
            <button
              onClick={() => {
                setViewMode('new');
                setSelectedJob('');
                setSelectedCandidates([]);
              }}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              New AI Match
            </button>
          </div>

          {/* Job Info Card */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl text-gray-900 font-semibold">{selectedHistoryItem.jobTitle}</h1>
                <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {new Date(selectedHistoryItem.matchedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {selectedHistoryItem.totalMatches} matches
                  </span>
                </div>
              </div>
              {/* Match Distribution - Compact */}
              <div className="flex gap-2">
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
                  <div className="text-lg font-bold text-green-700">{excellentCount}</div>
                  <div className="text-xs text-gray-600">85%+</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-center">
                  <div className="text-lg font-bold text-gray-900">{goodCount}</div>
                  <div className="text-xs text-gray-600">70-84%</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-center">
                  <div className="text-lg font-bold text-yellow-700">{moderateCount}</div>
                  <div className="text-xs text-gray-600">&lt;70%</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
            </div>
            <select
              value={filterThreshold}
              onChange={(e) => setFilterThreshold(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
            >
              <option value={0}>All Matches</option>
              <option value={50}>50%+ Match</option>
              <option value={70}>70%+ Match</option>
              <option value={85}>85%+ Match</option>
            </select>
            <div className="text-sm text-gray-700 bg-gray-100 px-3 py-2 rounded-lg font-medium border border-gray-200">
              {filteredCandidates.length} candidates
            </div>
            {selectedCandidates.length > 0 && (
              <button
                onClick={handleSubmitToScoring}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium text-sm flex items-center gap-2"
              >
                <Target className="w-4 h-4" />
                Score ({selectedCandidates.length})
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Candidates List */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
          {filteredCandidates.map((candidate, index) => (
            <div
              key={candidate.id}
              className={`bg-white rounded-xl border-2 transition-all p-6 ${
                selectedCandidates.includes(candidate.id)
                  ? 'border-gray-300 shadow-md'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
              }`}
            >
              <div className="flex items-start gap-6">
                {/* Checkbox & Rank */}
                <div className="flex flex-col items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedCandidates.includes(candidate.id)}
                    onChange={() => handleSelectCandidate(candidate.id)}
                    className="w-5 h-5 text-gray-800 rounded border-gray-300 focus:ring-gray-500"
                  />
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-base font-medium ${
                    index === 0 ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300' :
                    index === 1 ? 'bg-gray-100 text-gray-700 border-2 border-gray-300' :
                    index === 2 ? 'bg-orange-100 text-orange-700 border-2 border-orange-300' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    #{index + 1}
                  </div>
                </div>

                {/* Candidate Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl text-gray-900 mb-1">{candidate.name}</h3>
                  <p className="text-gray-600 mb-3">{candidate.title}</p>
                  
                  {/* Match Score */}
                  <div className="mb-3">
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${getMatchBgColor(candidate.matchScore)}`}>
                      <Target className="w-4 h-4" />
                      <span className="font-bold">{candidate.matchScore}% Match</span>
                      <span className="text-xs opacity-75">• {getMatchLabel(candidate.matchScore)}</span>
                    </div>
                  </div>

                  {/* Match Reason */}
                  <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium text-gray-900">Why this match: </span>
                      {candidate.matchReason}
                    </p>
                  </div>

                  {/* Skill Matches */}
                  {candidate.skillMatches && candidate.skillMatches.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 mb-2 font-medium">Key Skill Matches:</p>
                      <div className="flex flex-wrap gap-2">
                        {candidate.skillMatches.map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 bg-green-100 text-green-700 rounded-md text-xs font-medium border border-green-300"
                          >
                            <CheckCircle className="w-3 h-3 inline mr-1" />
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Candidate Details */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      {candidate.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {candidate.phone}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {candidate.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Building2 className="w-4 h-4" />
                      {candidate.currentCompany}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedVersionsCandidate(candidate);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 text-gray-900 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 font-medium"
                    >
                      <Paperclip className="w-4 h-4" />
                      {candidate.attachmentCount || 1} {(candidate.attachmentCount || 1) === 1 ? 'Attachment' : 'Attachments'}
                    </button>
                    <span className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 text-gray-900 rounded-lg border border-gray-200 font-medium">
                      <Clock className="w-4 h-4" />
                      Uploaded: {new Date(candidate.uploadDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      </main>

      {/* Resume Versions Modal */}
      {selectedVersionsCandidate && (
        <ResumeVersionsModal
          candidate={selectedVersionsCandidate}
          onClose={() => setSelectedVersionsCandidate(null)}
        />
      )}
      </>
    );
  }

  // View: History List
  if (viewMode === 'history') {
    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-blue-50 to-white">
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
              <h1 className="text-gray-900">AI Talent Match - Matched Jobs</h1>
              <p className="text-sm text-gray-600">Review jobs with AI-matched candidates and their results</p>
            </div>
            
            {/* Units Display */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl shadow-lg p-4 border-2 border-gray-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xs text-gray-100 mb-0.5">Available Units</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold text-white">250</span>
                    <span className="text-xs text-gray-100">units</span>
                  </div>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => {
                setViewMode('new');
                setSelectedJob('');
                setSelectedCandidates([]);
              }}
              className="px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              Run AI Match
            </button>
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
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>
            </div>

            <button
              onClick={() => setShowHistoryFilters(!showHistoryFilters)}
              className={`px-5 py-2.5 rounded-lg border-2 transition-all flex items-center gap-2 font-medium ${
                activeFiltersCount > 0
                  ? 'bg-gray-50 border-gray-800 text-gray-900 shadow-sm'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
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
              <span className="text-gray-800">{filteredHistory.length}</span> of {matchHistory.length} jobs
            </div>
          </div>

          {/* Expanded Filters */}
          {showHistoryFilters && (
            <div className="mt-5 pt-5 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Matched From
                  </label>
                  <input
                    type="date"
                    value={historyDateFrom}
                    onChange={(e) => setHistoryDateFrom(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Matched To
                  </label>
                  <input
                    type="date"
                    value={historyDateTo}
                    onChange={(e) => setHistoryDateTo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setHistorySearchQuery('');
                      setHistoryDateFrom('');
                      setHistoryDateTo('');
                    }}
                    disabled={activeFiltersCount === 0}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-medium"
                  >
                    <X className="w-4 h-4" />
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* History List */}
        {filteredHistory.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-gray-900 font-medium">Matched Jobs ({filteredHistory.length})</h2>
              <p className="text-sm text-gray-600">Click any job to view matched candidates</p>
            </div>
            <div className="grid gap-5">
            {filteredHistory.map((item) => {
              const avgScore = item.matchedCandidates.length > 0
                ? Math.round(item.matchedCandidates.reduce((sum, c) => sum + c.matchScore, 0) / item.matchedCandidates.length)
                : 0;

              const excellentCount = item.matchedCandidates.filter(c => c.matchScore >= 85).length;
              const goodCount = item.matchedCandidates.filter(c => c.matchScore >= 70 && c.matchScore < 85).length;
              const moderateCount = item.matchedCandidates.filter(c => c.matchScore < 70).length;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedHistoryItem(item);
                    setViewMode('details');
                  }}
                  className="bg-white rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all p-6 cursor-pointer group"
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start gap-6">
                    {/* Job Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
                          <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl text-gray-900 mb-2 group-hover:text-gray-800 transition-colors">
                            {item.jobTitle}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              {new Date(item.matchedAt).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric'
                              })}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <User className="w-4 h-4" />
                              {item.totalMatches} matches
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Match Distribution */}
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

                    {/* Avg Score */}
                    <div className="flex-shrink-0 text-center">
                      <div className="text-sm text-gray-600 mb-2 font-medium">Avg Score</div>
                      <div className={`text-4xl font-bold mb-2 ${getMatchColor(avgScore)}`}>
                        {avgScore}%
                      </div>
                      <div className={`inline-block px-3 py-1.5 rounded-full text-xs border font-medium ${getMatchBgColor(avgScore)}`}>
                        {getMatchLabel(avgScore)}
                      </div>
                      <div className="mt-4 text-gray-800 group-hover:text-gray-900 text-sm font-medium flex items-center gap-1 justify-center">
                        View Details
                        <ArrowLeft className="w-4 h-4 rotate-180 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </>
        ) : matchHistory.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-gray-100 to-gray-100 rounded-full flex items-center justify-center">
                <History className="w-10 h-10 text-gray-800" />
              </div>
              <h3 className="text-xl text-gray-900 mb-2">No Matching History Yet</h3>
              <p className="text-gray-600 mb-6">
                Start using AI Talent Match to find the best candidates for your jobs. Our AI will analyze and rank candidates based on job fit.
              </p>
              <button
                onClick={() => {
                  setViewMode('new');
                  setSelectedJob('');
                }}
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium shadow-sm hover:shadow-md inline-flex items-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                Run AI Match Now
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
                No matched jobs match your current filters. Try adjusting your search criteria.
              </p>
              <button
                onClick={() => {
                  setHistorySearchQuery('');
                  setHistoryDateFrom('');
                  setHistoryDateTo('');
                }}
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium shadow-sm hover:shadow-md inline-flex items-center gap-2"
              >
                <X className="w-5 h-5" />
                Clear All Filters
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  // View: Results (After Matching)
  if (viewMode === 'results') {
    const filteredCandidates = getFilteredCandidates();
    const excellentCount = matchedCandidates.filter(c => c.matchScore >= 85).length;
    const goodCount = matchedCandidates.filter(c => c.matchScore >= 70 && c.matchScore < 85).length;
    const moderateCount = matchedCandidates.filter(c => c.matchScore < 70).length;

    return (
      <main className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 via-blue-50 to-white">
        {/* Header Section - Sticky */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm p-6">
          {/* Back Button & Title */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                setViewMode('history');
                setSelectedCandidates([]);
                setMatchedCandidates([]);
              }}
              className="flex items-center gap-2 text-gray-800 hover:text-gray-900 font-medium transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Matched Jobs
            </button>
            <button
              onClick={() => {
                setViewMode('new');
                setSelectedJob('');
                setSelectedCandidates([]);
                setMatchedCandidates([]);
              }}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              New AI Match
            </button>
          </div>

          {/* Job Info Card */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl text-gray-900 font-semibold">{selectedJobData?.title}</h1>
                <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {matchedCandidates.length} matches
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    Complete
                  </span>
                </div>
              </div>
              {/* Match Distribution - Compact */}
              <div className="flex gap-2">
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
                  <div className="text-lg font-bold text-green-700">{excellentCount}</div>
                  <div className="text-xs text-gray-600">85%+</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-center">
                  <div className="text-lg font-bold text-gray-900">{goodCount}</div>
                  <div className="text-xs text-gray-600">70-84%</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-center">
                  <div className="text-lg font-bold text-yellow-700">{moderateCount}</div>
                  <div className="text-xs text-gray-600">&lt;70%</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
              />
            </div>
            <select
              value={filterThreshold}
              onChange={(e) => setFilterThreshold(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
            >
              <option value={0}>All Matches</option>
              <option value={50}>50%+ Match</option>
              <option value={70}>70%+ Match</option>
              <option value={85}>85%+ Match</option>
            </select>
            <div className="text-sm text-gray-700 bg-gray-100 px-3 py-2 rounded-lg font-medium border border-gray-200">
              {filteredCandidates.length} candidates
            </div>
            {selectedCandidates.length > 0 && (
              <button
                onClick={handleSubmitToScoring}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium text-sm flex items-center gap-2"
              >
                <Target className="w-4 h-4" />
                Score ({selectedCandidates.length})
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Candidates List */}
        <div className="flex-1 overflow-y-auto p-6">
          {matchedCandidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <Sparkles className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No AI Match Results Yet</h3>
              <p className="text-gray-600 text-center max-w-md mb-6">
                AI Talent Match has not been run for this job yet. Run AI matching to find candidates that match this job description.
              </p>
              <button
                onClick={() => {
                  setShowMatchingPanel(true);
                }}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all font-medium flex items-center gap-2 shadow-md"
              >
                <Sparkles className="w-5 h-5" />
                Run AI Talent Match
              </button>
            </div>
          ) : (
          <div className="space-y-3">
            {filteredCandidates.map((candidate, index) => (
              <div
                key={candidate.id}
                className={`bg-white rounded-xl border-2 transition-all p-6 ${
                  selectedCandidates.includes(candidate.id)
                    ? 'border-gray-300 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
                }`}
              >
                <div className="flex items-start gap-6">
                  {/* Checkbox & Rank */}
                  <div className="flex flex-col items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedCandidates.includes(candidate.id)}
                      onChange={() => handleSelectCandidate(candidate.id)}
                      className="w-5 h-5 text-gray-800 rounded border-gray-300 focus:ring-gray-500"
                    />
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-base font-medium ${
                      index === 0 ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300' :
                      index === 1 ? 'bg-gray-100 text-gray-700 border-2 border-gray-300' :
                      index === 2 ? 'bg-orange-100 text-orange-700 border-2 border-orange-300' :
                      'bg-gray-50 text-gray-600'
                    }`}>
                      #{index + 1}
                    </div>
                  </div>

                  {/* Candidate Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl text-gray-900 mb-1">{candidate.name}</h3>
                    <p className="text-gray-600 mb-3">{candidate.title}</p>
                    
                    {/* Match Score */}
                    <div className="mb-3">
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${getMatchBgColor(candidate.matchScore)}`}>
                        <Target className="w-4 h-4" />
                        <span className="font-bold">{candidate.matchScore}% Match</span>
                        <span className="text-xs opacity-75">• {getMatchLabel(candidate.matchScore)}</span>
                      </div>
                    </div>

                    {/* Match Reason */}
                    <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium text-gray-900">Why this match: </span>
                        {candidate.matchReason}
                      </p>
                    </div>

                    {/* Skill Matches */}
                    {candidate.skillMatches && candidate.skillMatches.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-600 mb-2 font-medium">Key Skill Matches:</p>
                        <div className="flex flex-wrap gap-2">
                          {candidate.skillMatches.map((skill, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 bg-green-100 text-green-700 rounded-md text-xs font-medium border border-green-300"
                            >
                              <CheckCircle className="w-3 h-3 inline mr-1" />
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Candidate Details */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {candidate.email}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        {candidate.phone}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {candidate.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        {candidate.currentCompany}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVersionsCandidate(candidate);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 text-gray-900 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 font-medium"
                      >
                        <Paperclip className="w-4 h-4" />
                        {candidate.attachmentCount || 1} {(candidate.attachmentCount || 1) === 1 ? 'Attachment' : 'Attachments'}
                      </button>
                      <span className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 text-gray-900 rounded-lg border border-gray-200 font-medium">
                        <Clock className="w-4 h-4" />
                        Uploaded: {new Date(candidate.uploadDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </main>
    );
  }

  // View: New Match (Job Selection)
  return (
    <>
      <AITalentMatchPageJobsList
        jobs={jobs}
        matchHistory={matchHistory}
        onSelectJob={(jobId) => {
          handleRunAIMatch(jobId);
        }}
        onViewHistory={() => setViewMode('history')}
        onBack={onBack}
      />
      
      {/* AI Matching Progress Panel */}
      {showMatchingPanel && selectedJob && (
        <AITalentMatchProgressPanel
          jobTitle={selectedJobData?.title || 'Job Description'}
          jobId={selectedJob}
          onComplete={handleMatchingComplete}
          onError={(error) => {
            setMatchError(error);
            setShowMatchingPanel(false);
          }}
        />
      )}
      
      {/* Resume Versions Modal */}
      {selectedVersionsCandidate && (
        <ResumeVersionsModal
          candidate={selectedVersionsCandidate}
          onClose={() => setSelectedVersionsCandidate(null)}
        />
      )}
    </>
  );
}