import { X, Clock, CheckCircle2, XCircle, AlertCircle, Loader, Database, FolderOpen, Target, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';

export interface ScoringProgressItem {
  id: string;
  candidateName: string;
  jobTitle: string;  // Added: Which job this scoring belongs to
  jobId: string;     // Added: Job identifier
  source: 'Internal DB' | 'My Resumes';
  status: 'Queued' | 'Scoring in progress' | 'Scored successfully' | 'Failed';
  errorReason?: string;
  scoredDateTime?: Date;
  matchResult?: 'Exact Match' | 'Partial Match' | 'No Match';
  score?: number;
}

interface BulkScoringProgressModalProps {
  onClose: () => void;
  progressData?: ScoringProgressItem[];
  filterByJobId?: string;  // Added: Optional filter to show only specific job
  showJobTitleColumn?: boolean; // Added: Explicitly control job title column visibility
}

export default function BulkScoringProgressModal({
  onClose,
  progressData = [],
  filterByJobId,
  showJobTitleColumn = true
}: BulkScoringProgressModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Real-time update simulation - updates every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Get the job title if filtering by specific job
  const filteredJobTitle = filterByJobId 
    ? progressData.find(item => item.jobId === filterByJobId)?.jobTitle 
    : null;

  // Calculate summary stats
  const totalResumes = progressData.length;
  const queuedCount = progressData.filter(item => item.status === 'Queued').length;
  const inProgressCount = progressData.filter(item => item.status === 'Scoring in progress').length;
  const completedCount = progressData.filter(item => item.status === 'Scored successfully').length;
  const failedCount = progressData.filter(item => item.status === 'Failed').length;

  // Calculate estimated time remaining
  const remainingResumes = queuedCount + inProgressCount;
  const avgTimePerResume = 20; // seconds (average LLM processing time)
  const estimatedSecondsRemaining = remainingResumes * avgTimePerResume;
  const estimatedMinutesRemaining = Math.ceil(estimatedSecondsRemaining / 60);
  
  const getEstimatedTimeDisplay = () => {
    if (remainingResumes === 0) {
      return 'All scoring operations completed';
    }
    
    if (estimatedMinutesRemaining < 1) {
      return `Approx. ${estimatedSecondsRemaining} seconds remaining`;
    } else if (estimatedMinutesRemaining === 1) {
      return 'Approx. 1 minute remaining';
    } else if (estimatedMinutesRemaining <= 5) {
      return `Approx. ${estimatedMinutesRemaining} minutes remaining`;
    } else {
      const minRange = estimatedMinutesRemaining;
      const maxRange = estimatedMinutesRemaining + 2;
      return `Approx. ${minRange}–${maxRange} minutes remaining`;
    }
  };

  // Filter data
  const filteredData = progressData.filter(item => {
    const matchesSearch = searchQuery === '' || 
      item.candidateName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'queued' && item.status === 'Queued') ||
      (statusFilter === 'in-progress' && item.status === 'Scoring in progress') ||
      (statusFilter === 'completed' && item.status === 'Scored successfully') ||
      (statusFilter === 'failed' && item.status === 'Failed');
    
    const matchesSource = sourceFilter === 'all' || 
      (sourceFilter === 'internal-db' && item.source === 'Internal DB') ||
      (sourceFilter === 'my-resumes' && item.source === 'My Resumes');
    
    const matchesJobId = !filterByJobId || item.jobId === filterByJobId;
    
    return matchesSearch && matchesStatus && matchesSource && matchesJobId;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Queued':
        return <Clock className="w-4 h-4 text-gray-500" />;
      case 'Scoring in progress':
        return <Loader className="w-4 h-4 text-gray-700 animate-spin" />;
      case 'Scored successfully':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'Failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Queued':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'Scoring in progress':
        return 'bg-gray-100 text-gray-900 border-gray-300';
      case 'Scored successfully':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'Failed':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getMatchResultBadge = (result?: string, score?: number) => {
    if (!result) return null;
    
    let badgeClass = '';
    let icon = null;
    
    switch (result) {
      case 'Exact Match':
        badgeClass = 'bg-green-100 text-green-700 border-green-300';
        icon = <CheckCircle2 className="w-3 h-3" />;
        break;
      case 'Partial Match':
        badgeClass = 'bg-yellow-100 text-yellow-700 border-yellow-300';
        icon = <TrendingUp className="w-3 h-3" />;
        break;
      case 'No Match':
        badgeClass = 'bg-red-100 text-red-700 border-red-300';
        icon = <XCircle className="w-3 h-3" />;
        break;
    }
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${badgeClass}`}>
        {icon}
        {result}
        {score !== undefined && <span className="ml-1 font-bold">({score}%)</span>}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl text-gray-900">
                {filterByJobId && filteredJobTitle ? `Scoring Progress - ${filteredJobTitle}` : 'Bulk Scoring Progress'}
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {filterByJobId 
                  ? 'Track real-time progress for this specific job'
                  : 'Track real-time progress of all scoring operations'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/80 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-white rounded-xl border-2 border-gray-300 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Total</span>
                <Target className="w-5 h-5 text-gray-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{totalResumes}</div>
              <div className="text-xs text-gray-500 mt-1">Selected</div>
            </div>

            <div className="bg-white rounded-xl border-2 border-gray-300 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">In Queue</span>
                <Clock className="w-5 h-5 text-gray-500" />
              </div>
              <div className="text-3xl font-bold text-gray-700">{queuedCount}</div>
              <div className="text-xs text-gray-500 mt-1">Waiting</div>
            </div>

            <div className="bg-white rounded-xl border-2 border-gray-300 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">In Progress</span>
                <Loader className="w-5 h-5 text-gray-800 animate-spin" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{inProgressCount}</div>
              <div className="text-xs text-gray-800 mt-1">Processing</div>
            </div>

            <div className="bg-white rounded-xl border-2 border-green-300 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-700">Completed</span>
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-3xl font-bold text-green-700">{completedCount}</div>
              <div className="text-xs text-green-600 mt-1">Success</div>
            </div>

            <div className="bg-white rounded-xl border-2 border-red-300 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-red-700">Failed</span>
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-3xl font-bold text-red-700">{failedCount}</div>
              <div className="text-xs text-red-600 mt-1">Errors</div>
            </div>
          </div>

          {/* Progress Bar */}
          {totalResumes > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-gray-700 font-medium">Overall Progress</span>
                <span className="text-gray-600">
                  {completedCount + failedCount} of {totalResumes} completed ({Math.round(((completedCount + failedCount) / totalResumes) * 100)}%)
                </span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full flex">
                  <div 
                    className="bg-green-500" 
                    style={{ width: `${(completedCount / totalResumes) * 100}%` }}
                  />
                  <div 
                    className="bg-red-500" 
                    style={{ width: `${(failedCount / totalResumes) * 100}%` }}
                  />
                  <div 
                    className="bg-gray-700 animate-pulse" 
                    style={{ width: `${(inProgressCount / totalResumes) * 100}%` }}
                  />
                </div>
              </div>
              
              {/* Estimated Time Remaining */}
              {remainingResumes > 0 && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
                  <Clock className="w-4 h-4 text-gray-800 animate-pulse" />
                  <span className="text-gray-800 font-medium">
                    {getEstimatedTimeDisplay()}
                  </span>
                  <span className="text-gray-800 text-xs">
                    ({remainingResumes} {remainingResumes === 1 ? 'resume' : 'resumes'} remaining • ~{avgTimePerResume}s per resume)
                  </span>
                </div>
              )}
              
              {/* Completion Message */}
              {remainingResumes === 0 && completedCount + failedCount === totalResumes && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-green-900 font-medium">
                    All scoring operations completed successfully!
                  </span>
                  <span className="text-green-600 text-xs">
                    {completedCount} successful • {failedCount} failed
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200 bg-white">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Candidate
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
              >
                <option value="all">All Status</option>
                <option value="queued">Queued</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
              >
                <option value="all">All Sources</option>
                <option value="internal-db">Internal DB</option>
                <option value="my-resumes">My Resumes</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-gray-600">
              Showing <span className="font-medium text-gray-900">{filteredData.length}</span> of <span className="font-medium text-gray-900">{totalResumes}</span> records
            </span>
            {(searchQuery || statusFilter !== 'all' || sourceFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setSourceFilter('all');
                }}
                className="text-gray-800 hover:text-gray-900 font-medium"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-6">
          {filteredData.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Candidate Name</th>
                  {(showJobTitleColumn && !filterByJobId) && <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Job Title</th>}
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Source</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Scored Date & Time</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Match Result</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr 
                    key={item.id} 
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="font-medium text-gray-900">{item.candidateName}</div>
                    </td>
                    {(showJobTitleColumn && !filterByJobId) && (
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-gray-800" />
                          <span className="text-sm text-gray-900 font-medium">{item.jobTitle}</span>
                        </div>
                      </td>
                    )}
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                        item.source === 'Internal DB' 
                          ? 'bg-gray-50 text-gray-900 border-gray-200' 
                          : 'bg-gray-50 text-gray-900 border-gray-200'
                      }`}>
                        {item.source === 'Internal DB' ? (
                          <Database className="w-3 h-3" />
                        ) : (
                          <FolderOpen className="w-3 h-3" />
                        )}
                        {item.source}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border w-fit ${getStatusBadgeClass(item.status)}`}>
                          {getStatusIcon(item.status)}
                          {item.status}
                        </span>
                        {item.status === 'Failed' && item.errorReason && (
                          <div className="flex items-start gap-1 text-xs text-red-600 mt-1">
                            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            <span>{item.errorReason}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {item.scoredDateTime ? (
                        <div className="text-sm text-gray-700">
                          <div className="font-medium">
                            {item.scoredDateTime.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="text-xs text-gray-500">
                            {item.scoredDateTime.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {item.matchResult ? (
                        getMatchResultBadge(item.matchResult, item.score)
                      ) : (
                        <span className="text-sm text-gray-400">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <Target className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg text-gray-900 mb-2">No Records Found</h3>
              <p className="text-gray-600">
                {searchQuery || statusFilter !== 'all' || sourceFilter !== 'all'
                  ? 'No scoring records match your current filters.'
                  : 'No scoring operations in progress.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}