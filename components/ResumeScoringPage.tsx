'use client';

import { Target, Briefcase, Filter, Search, FileText, User, MapPin, Mail, Phone, CheckCircle, FolderOpen, Database, TrendingUp, Award, ChevronDown, Download, Clock, History, Eye, X, ArrowLeft, Send, MousePointer, PlayCircle, CheckCircle2, XCircle, AlertCircle, DollarSign, List } from 'lucide-react';
import { useState } from 'react';
import { Job, Resume, Folder } from '@/lib/types/types';
import ScoredResumesTable from './ScoredResumesTable';
import ResumeSelectionModal from './ResumeSelectionModal';
import ResumeScoringStatusPanel from './ResumeScoringStatusPanel';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import { scoringService } from '@/lib/services';

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
  jobs: Job[];
  resumes: Resume[];
  folders: Folder[];
  scoredHistory?: ScoredResumeData[];
  onSaveScores?: (data: ScoredResumeData) => void;
  onNavigateToAITalentMatch?: (jobId: string) => void;
  onBack?: () => void;
}

export default function ResumeScoringPage({ 
  jobs, 
  resumes,
  folders,
  scoredHistory = [], 
  onSaveScores,
  onNavigateToAITalentMatch,
  onBack
}: ResumeScoringPageProps) {
  const [viewMode, setViewMode] = useState<'history' | 'details' | 'new'>('history');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ScoredResumeData | null>(null);
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

  // History filters
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historySourceFilter, setHistorySourceFilter] = useState<'all' | 'my-resumes' | 'database'>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyMinCandidates, setHistoryMinCandidates] = useState<number>(0);
  const [historyAvgScoreMin, setHistoryAvgScoreMin] = useState<number>(0);
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);

  // For this demo, split resumes based on folderId
  const myResumes = resumes.filter(r => r.folderId && r.folderId !== 'all');
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

  const handleScoreResumes = async () => {
    if (!selectedJob || selectedResumes.length === 0) {
      return;
    }

    setIsScoring(true);

    try {
      // Try bulk scoring via API first
      const bulkResponse = await scoringService.bulkScore(selectedJob, selectedResumes);
      console.log('[TalentFlow] Bulk scoring started:', bulkResponse);

      // Poll for completion
      let completed = false;
      let attempts = 0;
      let finalResults = bulkResponse;

      while (!completed && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const status = await scoringService.getBulkStatus(bulkResponse.job_id);
        finalResults = status;

        if (status.status === 'completed' || status.completed >= status.total_resumes) {
          completed = true;
        }
        attempts++;
      }

      // Map API results to component format
      const scored = finalResults.items.map((item: any) => {
        const resume = resumes.find(r => r.id === item.resume_id);
        return {
          ...resume,
          id: item.resume_id,
          name: item.candidate_name || resume?.name || 'Unknown',
          matchScore: item.score || 0,
          skillMatches: resume?.skills?.slice(0, 3) || [],
          matchReason: getMatchReason(item.score || 0),
          scoreBreakdown: {
            skillsMatch: item.score || 70,
            experienceMatch: item.score || 70,
            educationMatch: item.score || 70,
            overallFit: item.score || 70,
          }
        };
      }).sort((a: any, b: any) => b.matchScore - a.matchScore);

      setScoredResumes(scored);
      setShowResults(true);

      // Save to history
      if (onSaveScores) {
        const selectedJobData = jobs.find(j => j.id === selectedJob);
        onSaveScores({
          id: Date.now().toString(),
          jobId: selectedJob,
          jobTitle: selectedJobData?.title || 'Unknown Job',
          scoredAt: new Date(),
          source: resumeSource || 'database',
          totalScored: scored.length,
          scoredResumes: scored,
        });
      }
    } catch (error) {
      console.log('[TalentFlow] API scoring failed, using mock fallback:', error);

      // Fallback to mock scoring
      const scored = selectedResumes.map(id => {
        const resume = resumes.find(r => r.id === id);
        const score = Math.floor(Math.random() * 40) + 60; // 60-100

        return {
          ...resume,
          matchScore: score,
          skillMatches: resume?.skills?.slice(0, 3) || [],
          matchReason: getMatchReason(score),
          scoreBreakdown: {
            skillsMatch: Math.floor(Math.random() * 30) + 70,
            experienceMatch: Math.floor(Math.random() * 30) + 70,
            educationMatch: Math.floor(Math.random() * 30) + 70,
            overallFit: Math.floor(Math.random() * 30) + 70,
          }
        };
      }).sort((a, b) => b.matchScore - a.matchScore);

      setScoredResumes(scored);
      setShowResults(true);

      // Save to history
      if (onSaveScores) {
        const selectedJobData = jobs.find(j => j.id === selectedJob);
        onSaveScores({
          id: Date.now().toString(),
          jobId: selectedJob,
          jobTitle: selectedJobData?.title || 'Unknown Job',
          scoredAt: new Date(),
          source: resumeSource || 'database',
          totalScored: scored.length,
          scoredResumes: scored,
        });
      }
    } finally {
      setIsScoring(false);
    }
  };

  const getMatchReason = (score: number) => {
    if (score >= 85) return 'Excellent match with strong alignment on key skills and experience requirements. Highly recommended candidate.';
    if (score >= 70) return 'Good match with relevant skills and experience. Solid candidate for consideration.';
    return 'Moderate match with some relevant skills. May require additional evaluation.';
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    return 'text-yellow-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-blue-100 border-blue-300 text-blue-700';
    return 'bg-yellow-100 border-yellow-300 text-yellow-700';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return 'Exact Match';
    if (score >= 70) return 'Partial Match';
    return 'No Match';
  };

  const publishedJobs = jobs.filter(j => j.status === 'Published' || j.status === 'Active');
  const selectedJobData = jobs.find(j => j.id === selectedJob);

  // Convert scored resumes to ScoredResumesTable format
  const convertToScoredResumesFormat = (scoredData: ScoredResumeData) => {
    return scoredData.scoredResumes.map((resume) => ({
      id: resume.id,
      candidateName: resume.name || 'Unknown Candidate',
      email: resume.email || 'N/A',
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
    }));
  };

  // View History Details
  if (viewMode === 'details' && selectedHistoryItem) {
    const scoredResumesData = convertToScoredResumesFormat(selectedHistoryItem);
    
    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-blue-50 via-purple-50 to-white">
        {/* Header with Back Button */}
        <div className="mb-6">
          <button
            onClick={() => {
              setViewMode('history');
              setSelectedHistoryItem(null);
              setSelectedStatusFilter('all');
            }}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 font-medium transition-colors hover:gap-3"
            aria-label="Go back to Scored Candidates list"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Scored Candidates
          </button>

          <div className="bg-white rounded-xl shadow-lg border-2 border-blue-300 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
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
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-purple-100 text-purple-700'
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
                aria-label="Score new resumes"
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
        />

        {/* Bulk Scoring Progress Modal */}
        {showProgressModal && (
          <BulkScoringProgressModal
            progressData={progressData}
            onClose={() => setShowProgressModal(false)}
          />
        )}
      </main>
    );
  }

  // View History List
  if (viewMode === 'history') {
    // Filter history items
    const filteredHistory = scoredHistory.filter(item => {
      // Search filter
      const matchesSearch = historySearchQuery === '' || 
        item.jobTitle.toLowerCase().includes(historySearchQuery.toLowerCase());

      // Source filter
      const matchesSource = historySourceFilter === 'all' || item.source === historySourceFilter;

      // Date range filter
      let matchesDate = true;
      if (historyDateFrom) {
        matchesDate = matchesDate && new Date(item.scoredAt) >= new Date(historyDateFrom);
      }
      if (historyDateTo) {
        matchesDate = matchesDate && new Date(item.scoredAt) <= new Date(historyDateTo);
      }

      // Min candidates filter
      const matchesCandidates = item.totalScored >= historyMinCandidates;

      // Avg score filter
      const avgScore = item.scoredResumes.length > 0
        ? item.scoredResumes.reduce((sum, r) => sum + r.matchScore, 0) / item.scoredResumes.length
        : 0;
      const matchesAvgScore = avgScore >= historyAvgScoreMin;

      return matchesSearch && matchesSource && matchesDate && matchesCandidates && matchesAvgScore;
    });

    // Count active filters
    const activeFiltersCount = [
      historySearchQuery !== '',
      historySourceFilter !== 'all',
      historyDateFrom !== '',
      historyDateTo !== '',
      historyMinCandidates > 0,
      historyAvgScoreMin > 0,
    ].filter(Boolean).length;

    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-blue-50 via-purple-50 to-white">
        {/* Header with Back Button */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-white/80 rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200"
                title="Back to Dashboard"
                aria-label="Back to Dashboard"
              >
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </button>
            )}
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <History className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-gray-900">Scored Candidates</h1>
              <p className="text-sm text-gray-600">View and manage previously scored resumes</p>
            </div>
            <button
              onClick={() => {
                // Generate centralized progress data for ALL jobs combined
                const allProgressData: ScoringProgressItem[] = [];
                
                // Include progress from all scored history items
                scoredHistory.forEach((historyItem) => {
                  historyItem.scoredResumes.forEach((resume, idx) => {
                    allProgressData.push({
                      id: `${historyItem.id}-${resume.id || idx}`,
                      candidateName: resume.name || 'Unknown Candidate',
                      jobTitle: historyItem.jobTitle,
                      jobId: historyItem.jobId,
                      source: historyItem.source === 'my-resumes' ? 'My Resumes' : 'Internal DB',
                      status: 'Scored successfully',
                      scoredDateTime: new Date(historyItem.scoredAt),
                      matchResult: resume.matchScore >= 85 ? 'Exact Match' : resume.matchScore >= 70 ? 'Partial Match' : 'No Match',
                      score: resume.matchScore,
                    });
                  });
                });
                
                // Add some mock in-progress and queued items for demonstration
                resumes.slice(0, 8).forEach((resume, idx) => {
                  const randomJob = scoredHistory[idx % scoredHistory.length] || { jobTitle: 'Senior Developer', jobId: 'mock-job' };
                  allProgressData.push({
                    id: `progress-${resume.id}`,
                    candidateName: resume.name,
                    jobTitle: randomJob.jobTitle,
                    jobId: randomJob.jobId,
                    source: idx % 2 === 0 ? 'Internal DB' : 'My Resumes',
                    status: idx < 2 ? 'Queued' : idx < 5 ? 'Scoring in progress' : idx < 7 ? 'Scored successfully' : 'Failed',
                    errorReason: idx >= 7 ? 'API timeout - unable to process resume' : undefined,
                    scoredDateTime: idx >= 5 && idx < 7 ? new Date() : undefined,
                    matchResult: idx >= 5 && idx < 7 ? (idx % 2 === 0 ? 'Exact Match' : 'Partial Match') : undefined,
                    score: idx >= 5 && idx < 7 ? Math.floor(Math.random() * 30) + 70 : undefined,
                  });
                });
                
                setProgressData(allProgressData);
                setFilterByJobId(undefined);  // Show ALL jobs
                setShowProgressModal(true);
              }}
              className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 transition-all text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
              aria-label="View progress tables"
            >
              <List className="w-4 h-4" />
              Progress Tables
            </button>
            <button
              onClick={() => {
                setViewMode('new');
                setSelectedJob('');
                setResumeSource(null);
                setSelectedResumes([]);
              }}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
              aria-label="Score new resumes"
            >
              <Target className="w-4 h-4" />
              Score Resumes
            </button>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="flex-1">
              <label htmlFor="history-search" className="sr-only">Search by job title</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="history-search"
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search by job title..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-shadow"
                  aria-label="Search scored candidates by job title"
                />
              </div>
            </div>

            {/* Filter Toggle Button */}
            <button
              onClick={() => setShowHistoryFilters(!showHistoryFilters)}
              className={`px-5 py-2.5 rounded-lg border-2 transition-all flex items-center gap-2 font-medium ${
                activeFiltersCount > 0
                  ? 'bg-purple-50 border-purple-600 text-purple-700 shadow-sm'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
              }`}
              aria-expanded={showHistoryFilters}
              aria-label={`${showHistoryFilters ? 'Hide' : 'Show'} filters${activeFiltersCount > 0 ? ` (${activeFiltersCount} active)` : ''}`}
            >
              <Filter className="w-5 h-5" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="px-2 py-0.5 bg-purple-600 text-white rounded-full text-xs font-medium">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${showHistoryFilters ? 'rotate-180' : ''}`} />
            </button>

            {/* Results Count */}
            <div className="text-sm text-gray-700 bg-gray-100 px-4 py-2.5 rounded-lg whitespace-nowrap font-medium border border-gray-200">
              <span className="text-blue-600">{filteredHistory.length}</span> of {scoredHistory.length} jobs
            </div>
          </div>

          {/* Expanded Filters */}
          {showHistoryFilters && (
            <div className="mt-5 pt-5 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-5">
                {/* Source Filter */}
                <div>
                  <label htmlFor="source-filter" className="block text-sm font-medium text-gray-700 mb-2">
                    Resume Source
                  </label>
                  <select
                    id="source-filter"
                    value={historySourceFilter}
                    onChange={(e) => setHistorySourceFilter(e.target.value as 'all' | 'my-resumes' | 'database')}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent bg-white transition-shadow"
                  >
                    <option value="all">All Sources</option>
                    <option value="my-resumes">My Resumes</option>
                    <option value="database">Resume Database</option>
                  </select>
                </div>

                {/* Date From */}
                <div>
                  <label htmlFor="date-from" className="block text-sm font-medium text-gray-700 mb-2">
                    Scored From
                  </label>
                  <input
                    id="date-from"
                    type="date"
                    value={historyDateFrom}
                    onChange={(e) => setHistoryDateFrom(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent bg-white transition-shadow"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label htmlFor="date-to" className="block text-sm font-medium text-gray-700 mb-2">
                    Scored To
                  </label>
                  <input
                    id="date-to"
                    type="date"
                    value={historyDateTo}
                    onChange={(e) => setHistoryDateTo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent bg-white transition-shadow"
                  />
                </div>

                {/* Min Candidates */}
                <div>
                  <label htmlFor="min-candidates" className="block text-sm font-medium text-gray-700 mb-2">
                    Min Candidates: <span className="text-blue-600">{historyMinCandidates}</span>
                  </label>
                  <input
                    id="min-candidates"
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={historyMinCandidates}
                    onChange={(e) => setHistoryMinCandidates(Number(e.target.value))}
                    className="w-full accent-purple-600"
                    aria-valuemin={0}
                    aria-valuemax={50}
                    aria-valuenow={historyMinCandidates}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                  </div>
                </div>

                {/* Min Avg Score */}
                <div>
                  <label htmlFor="min-avg-score" className="block text-sm font-medium text-gray-700 mb-2">
                    Min Avg Score: <span className="text-blue-600">{historyAvgScoreMin}%</span>
                  </label>
                  <input
                    id="min-avg-score"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={historyAvgScoreMin}
                    onChange={(e) => setHistoryAvgScoreMin(Number(e.target.value))}
                    className="w-full accent-purple-600"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={historyAvgScoreMin}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Clear Filters */}
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
                    aria-label="Clear all filters"
                  >
                    <X className="w-4 h-4" />
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Active Filters Tags */}
        {activeFiltersCount > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-700 font-medium">Active Filters:</span>
                {historySearchQuery && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-purple-300 text-purple-700 rounded-lg text-sm">
                    Search: &quot;{historySearchQuery}&quot;
                  </span>
                )}
                {historySourceFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-purple-300 text-purple-700 rounded-lg text-sm">
                    Source: {historySourceFilter === 'my-resumes' ? 'My Resumes' : 'Database'}
                  </span>
                )}
                {historyDateFrom && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-purple-300 text-purple-700 rounded-lg text-sm">
                    From: {new Date(historyDateFrom).toLocaleDateString()}
                  </span>
                )}
                {historyDateTo && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-purple-300 text-purple-700 rounded-lg text-sm">
                    To: {new Date(historyDateTo).toLocaleDateString()}
                  </span>
                )}
                {historyMinCandidates > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-purple-300 text-purple-700 rounded-lg text-sm">
                    Min Candidates: {historyMinCandidates}+
                  </span>
                )}
                {historyAvgScoreMin > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-purple-300 text-purple-700 rounded-lg text-sm">
                    Min Score: {historyAvgScoreMin}%+
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setHistorySearchQuery('');
                  setHistorySourceFilter('all');
                  setHistoryDateFrom('');
                  setHistoryDateTo('');
                  setHistoryMinCandidates(0);
                  setHistoryAvgScoreMin(0);
                }}
                className="text-sm text-purple-700 hover:text-purple-800 font-medium hover:underline transition-colors"
                aria-label="Clear all filters"
              >
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* History List or Empty State */}
        {filteredHistory.length > 0 ? (
          <div className="grid gap-5">
            {filteredHistory.map((item) => {
              const avgScore = item.scoredResumes.length > 0
                ? Math.round(item.scoredResumes.reduce((sum, r) => sum + r.matchScore, 0) / item.scoredResumes.length)
                : 0;

              const excellentCount = item.scoredResumes.filter(r => r.matchScore >= 85).length;
              const goodCount = item.scoredResumes.filter(r => r.matchScore >= 70 && r.matchScore < 85).length;
              const moderateCount = item.scoredResumes.filter(r => r.matchScore < 70).length;

              // Get full job details
              const jobDetails = jobs.find(j => j.id === item.jobId);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedHistoryItem(item);
                    setViewMode('details');
                  }}
                  className="bg-white rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all p-6 cursor-pointer group"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedHistoryItem(item);
                      setViewMode('details');
                    }
                  }}
                  aria-label={`View details for ${item.jobTitle}, scored on ${new Date(item.scoredAt).toLocaleDateString()}`}
                >
                  <div className="flex items-start gap-6">
                    {/* Left: Job Info & Details */}
                    <div className="flex-1 min-w-0">
                      {/* Job Header */}
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
                          <Target className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
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
                                ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                                : 'bg-purple-100 text-purple-700 border border-purple-200'
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

                          {/* Job Description Details */}
                          {jobDetails && (
                            <div className="bg-gradient-to-r from-gray-50 to-blue-50/30 border border-gray-200 rounded-lg p-4 mb-4">
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
                                <div className="flex items-start gap-2 col-span-2">
                                  <FileText className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500 mb-0.5">Status</div>
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        jobDetails.status === 'Published' || jobDetails.status === 'Active'
                                          ? 'bg-green-100 text-green-700 border border-green-200'
                                          : jobDetails.status === 'Draft'
                                          ? 'bg-gray-100 text-gray-700 border border-gray-200'
                                          : 'bg-red-100 text-red-700 border border-red-200'
                                      }`}>
                                        {jobDetails.status}
                                      </span>
                                      <span className="text-sm text-gray-600">• {jobDetails.applicants} applicants</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Score Distribution */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">Excellent</span>
                            <Award className="w-4 h-4 text-green-600" />
                          </div>
                          <div className="text-2xl text-green-700 font-bold">{excellentCount}</div>
                          <div className="text-xs text-gray-600 mt-0.5">85%+ match</div>
                        </div>

                        <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-700 font-medium">Good</span>
                            <CheckCircle className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="text-2xl text-blue-700 font-bold">{goodCount}</div>
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

                    {/* Right: Avg Score */}
                    <div className="flex-shrink-0 text-center">
                      <div className="text-sm text-gray-600 mb-2 font-medium">Avg Score</div>
                      <div className={`text-4xl font-bold mb-2 ${getScoreColor(avgScore)}`}>
                        {avgScore}%
                      </div>
                      <div className={`inline-block px-3 py-1.5 rounded-full text-xs border font-medium ${getScoreBgColor(avgScore)}`}>
                        {getScoreLabel(avgScore)}
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="mt-4 flex flex-col gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Generate centralized progress data, then filter to this job
                            const allProgressData: ScoringProgressItem[] = [];
                            
                            // Include ALL scored history items
                            scoredHistory.forEach((historyItem) => {
                              historyItem.scoredResumes.forEach((resume, idx) => {
                                allProgressData.push({
                                  id: `${historyItem.id}-${resume.id || idx}`,
                                  candidateName: resume.name || 'Unknown Candidate',
                                  jobTitle: historyItem.jobTitle,
                                  jobId: historyItem.jobId,
                                  source: historyItem.source === 'my-resumes' ? 'My Resumes' : 'Internal DB',
                                  status: 'Scored successfully',
                                  scoredDateTime: new Date(historyItem.scoredAt),
                                  matchResult: resume.matchScore >= 85 ? 'Exact Match' : resume.matchScore >= 70 ? 'Partial Match' : 'No Match',
                                  score: resume.matchScore,
                                });
                              });
                            });
                            
                            setProgressData(allProgressData);
                            setFilterByJobId(item.jobId);  // Filter to show only THIS job
                            setShowProgressModal(true);
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 transition-all text-sm font-medium flex items-center gap-2 justify-center shadow-sm hover:shadow-md"
                          title="View scoring progress for this job"
                        >
                          <List className="w-4 h-4" />
                          View Progress
                        </button>
                        
                        <div className="text-blue-600 group-hover:text-blue-700 text-sm font-medium flex items-center gap-1 justify-center">
                          View Details
                          <ArrowLeft className="w-4 h-4 rotate-180 group-hover:translate-x-1 transition-transform" />
                        </div>
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
              <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                <History className="w-10 h-10 text-blue-600" />
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
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium shadow-sm hover:shadow-md inline-flex items-center gap-2"
              >
                <Target className="w-5 h-5" />
                Score Resumes Now
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center">
                <Search className="w-10 h-10 text-purple-600" />
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
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-medium shadow-sm hover:shadow-md inline-flex items-center gap-2"
              >
                <X className="w-5 h-5" />
                Clear All Filters
              </button>
            </div>
          </div>
        )}

        {/* Bulk Scoring Progress Modal */}
        {showProgressModal && (
          <BulkScoringProgressModal
            progressData={progressData}
            onClose={() => setShowProgressModal(false)}
          />
        )}
      </main>
    );
  }

  // New Scoring Flow
  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-blue-50 via-purple-50 to-white">
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
            aria-label="Back to Scored Candidates"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
            <Target className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-gray-900">Score Resumes</h1>
            <p className="text-sm text-gray-600">Select a job and let AI match the best candidates</p>
          </div>
          
          {/* Available Units Display */}
          <div className="bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl shadow-lg p-4 border-2 border-purple-400">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-xs text-purple-100 mb-0.5">Available Units</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">250</span>
                  <span className="text-sm text-purple-100">units</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white border-opacity-20">
              <div className="flex items-center justify-between text-xs text-purple-100">
                <span>Cost per resume:</span>
                <span className="font-medium text-white">1 unit</span>
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
                  : 'bg-blue-600 text-white ring-4 ring-blue-100'
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
                  ? 'bg-blue-600 text-white ring-4 ring-blue-100' 
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
          : 'border-2 border-blue-300'
      }`}>
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
            selectedJob 
              ? 'bg-green-600 text-white' 
              : 'bg-blue-600 text-white'
          }`}>
            {selectedJob ? <CheckCircle2 className="w-6 h-6" /> : '1'}
          </div>
          <div>
            <h3 className="text-gray-900">Select Job Description</h3>
            <p className="text-sm text-gray-600">Choose which role you want to score candidates for</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="flex-1">
            <label htmlFor="job-select" className="sr-only">Select a published job</label>
            <select
              id="job-select"
              value={selectedJob}
              onChange={(e) => {
                setSelectedJob(e.target.value);
                setResumeSource(null);
                setSelectedResumes([]);
                setShowResults(false);
              }}
              className="w-full px-4 py-3.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white transition-shadow text-gray-900 font-medium"
              aria-label="Select a published job description"
            >
              <option value="">-- Choose a published job --</option>
              {publishedJobs.length === 0 ? (
                <option disabled>No published jobs available</option>
              ) : (
                publishedJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} • {job.location} • {job.applicants} applicants
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
              <div className="mt-4 p-5 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
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
                          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-blue-300 rounded-full text-blue-700 font-medium">
                            <User className="w-4 h-4" />
                            {selectedJobData.applicants} applicants
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowResumeSelectionModal(true)}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all text-sm font-medium flex items-center gap-2 shadow-md hover:shadow-lg"
                    aria-label="Proceed to score resumes for this job"
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
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="text-gray-900 font-medium mb-1">How Resume Scoring Works</h4>
            <ul className="text-sm text-gray-700 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span><strong>Step 1:</strong> Select a published job description from the dropdown above</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span><strong>Step 2:</strong> Click "Score Resumes" to open the resume selection modal</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span><strong>Step 3:</strong> Choose resumes from "My Resumes" folders or "Internal Database"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span><strong>Step 4:</strong> Select candidates and click "Score Resumes" to analyze with AI</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
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
            // Close modal
            setShowResumeSelectionModal(false);
            
            // Get selected resumes data
            const selectedResumesData = resumes.filter(r => selectedIds.includes(r.id));
            
            // Prepare resumes for scoring panel
            setResumesToScore(selectedResumesData.map(r => ({ id: r.id, name: r.name })));
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
          onComplete={(scoredResults) => {
            // Close scoring panel
            setShowScoringPanel(false);
            
            // Save to history and navigate to details
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
        />
      )}
    </main>
  );
}