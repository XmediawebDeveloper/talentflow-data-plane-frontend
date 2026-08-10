import { ArrowLeft, Clock, CheckCircle, XCircle, Loader2, AlertCircle, TrendingUp, Users, Target, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Resume, Job } from '@/lib/types/types';
import { formatIST } from '@/lib/utils/dateUtils';

interface ScoringItem {
  id: string;
  candidateName: string;
  source: 'my-resumes' | 'internal-db';
  status: 'queued' | 'in-progress' | 'completed' | 'failed';
  scoredDate?: string;
  matchResult?: 'excellent' | 'good' | 'fair' | 'poor';
  score?: number;
  errorReason?: string;
  startTime?: Date;
  endTime?: Date;
}

interface BulkScoringProgressProps {
  job: Job;
  resumeIds: string[];
  resumes: Resume[];
  source: 'my-resumes' | 'internal-db';
  onBack: () => void;
  onComplete: () => void;
}

export default function BulkScoringProgress({
  job,
  resumeIds = [],
  resumes = [],
  source,
  onBack,
  onComplete
}: BulkScoringProgressProps) {
  const [scoringItems, setScoringItems] = useState<ScoringItem[]>([]);
  const [totalResumes, setTotalResumes] = useState(resumeIds?.length || 0);
  const [queued, setQueued] = useState(resumeIds?.length || 0);
  const [inProgress, setInProgress] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [failed, setFailed] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number>(0);
  const [averageScoringTime, setAverageScoringTime] = useState(4); // seconds per resume
  const [startTime] = useState(new Date());

  // Early return if no job data
  if (!job) {
    return (
      <div className="flex-1 p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800">No job data available. Please try again.</p>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Initialize scoring items
  useEffect(() => {
    if (!resumeIds || !resumes || resumeIds.length === 0) return;
    
    const selectedResumes = resumes.filter(r => resumeIds.includes(r.id));
    const items: ScoringItem[] = selectedResumes.map(resume => ({
      id: resume.id,
      candidateName: resume.name,
      source: source,
      status: 'queued'
    }));
    setScoringItems(items);

    // Start scoring simulation
    processScoring(items);
  }, [resumeIds, resumes]);

  // Calculate estimated time remaining
  useEffect(() => {
    const remaining = queued + inProgress;
    const estimated = remaining * averageScoringTime;
    setEstimatedTimeRemaining(estimated);
  }, [queued, inProgress, averageScoringTime]);

  // Process scoring simulation
  const processScoring = async (items: ScoringItem[]) => {
    // Process resumes in batches of 2 (simulating concurrent API calls)
    const batchSize = 2;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Start processing batch
      await Promise.all(batch.map(item => scoreResume(item)));
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // All completed
    setTimeout(() => {
      onComplete();
    }, 2000);
  };

  const scoreResume = async (item: ScoringItem) => {
    // Update to in-progress
    setScoringItems(prev => prev.map(i => 
      i.id === item.id ? { ...i, status: 'in-progress', startTime: new Date() } : i
    ));
    setQueued(prev => prev - 1);
    setInProgress(prev => prev + 1);

    // Simulate API call (3-6 seconds)
    const scoringTime = 3000 + Math.random() * 3000;
    await new Promise(resolve => setTimeout(resolve, scoringTime));

    // Update average scoring time
    setAverageScoringTime(prev => (prev + scoringTime / 1000) / 2);

    // 10% chance of failure for demo
    const isFailed = Math.random() < 0.1;

    if (isFailed) {
      // Failed
      setScoringItems(prev => prev.map(i => 
        i.id === item.id ? {
          ...i,
          status: 'failed',
          errorReason: ['API timeout', 'Invalid resume format', 'Network error', 'Parsing failed'][Math.floor(Math.random() * 4)],
          endTime: new Date()
        } : i
      ));
      setInProgress(prev => prev - 1);
      setFailed(prev => prev + 1);
    } else {
      // Success - generate score
      const score = Math.floor(Math.random() * 40) + 60; // 60-100
      let matchResult: 'excellent' | 'good' | 'fair' | 'poor';
      
      if (score >= 85) matchResult = 'excellent';
      else if (score >= 70) matchResult = 'good';
      else if (score >= 60) matchResult = 'fair';
      else matchResult = 'poor';

      setScoringItems(prev => prev.map(i => 
        i.id === item.id ? {
          ...i,
          status: 'completed',
          score,
          matchResult,
          scoredDate: new Date().toISOString(),
          endTime: new Date()
        } : i
      ));
      setInProgress(prev => prev - 1);
      setCompleted(prev => prev + 1);
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getStatusIcon = (status: ScoringItem['status']) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-5 h-5 text-gray-400" />;
      case 'in-progress':
        return <Loader2 className="w-5 h-5 text-gray-800 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const getStatusText = (status: ScoringItem['status']) => {
    switch (status) {
      case 'queued':
        return 'Queued';
      case 'in-progress':
        return 'Scoring in progress...';
      case 'completed':
        return 'Scored successfully';
      case 'failed':
        return 'Failed';
    }
  };

  const getMatchBadge = (matchResult?: 'excellent' | 'good' | 'fair' | 'poor', score?: number) => {
    if (!matchResult || score === undefined) return null;

    const colors = {
      excellent: 'bg-green-100 text-green-700 border-green-300',
      good: 'bg-gray-100 text-gray-900 border-gray-300',
      fair: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      poor: 'bg-red-100 text-red-700 border-red-300'
    };

    const labels = {
      excellent: 'Excellent Match',
      good: 'Good Match',
      fair: 'Fair Match',
      poor: 'Poor Match'
    };

    return (
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 rounded text-xs border ${colors[matchResult]}`}>
          {labels[matchResult]}
        </span>
        <span className="text-sm text-gray-900">{score}%</span>
      </div>
    );
  };

  const progressPercentage = totalResumes > 0 ? ((completed + failed) / totalResumes) * 100 : 0;
  const isProcessing = queued > 0 || inProgress > 0;

  return (
    <div className="flex-1 p-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Job Details
        </button>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-gray-900 mb-2">Bulk Resume Scoring Progress</h1>
            <p className="text-sm text-gray-600">
              Scoring {totalResumes} resume{totalResumes > 1 ? 's' : ''} against: <span className="text-gray-900">{job.title}</span>
            </p>
          </div>
          
          {isProcessing && (
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <Loader2 className="w-5 h-5 text-gray-800 animate-spin" />
              <div className="text-sm">
                <div className="text-gray-800">Processing...</div>
                <div className="text-gray-900">Est. {formatTime(estimatedTimeRemaining)} remaining</div>
              </div>
            </div>
          )}
          
          {!isProcessing && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div className="text-sm">
                <div className="text-green-900">Completed</div>
                <div className="text-green-700">All resumes processed</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress Overview Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Total Resumes</span>
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-3xl text-gray-900">{totalResumes}</div>
          <div className="text-xs text-gray-500 mt-1">Selected for scoring</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">In Queue</span>
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-3xl text-gray-900">{queued}</div>
          <div className="text-xs text-gray-500 mt-1">Waiting to process</div>
        </div>

        <div className="bg-gray-50 rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-800">In Progress</span>
            <Loader2 className="w-5 h-5 text-gray-800 animate-spin" />
          </div>
          <div className="text-3xl text-gray-800">{inProgress}</div>
          <div className="text-xs text-gray-900 mt-1">Currently scoring</div>
        </div>

        <div className="bg-green-50 rounded-lg shadow-sm border border-green-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-green-900">Completed</span>
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-3xl text-green-900">{completed}</div>
          <div className="text-xs text-green-700 mt-1">Successfully scored</div>
        </div>

        <div className="bg-red-50 rounded-lg shadow-sm border border-red-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-red-900">Failed</span>
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div className="text-3xl text-red-900">{failed}</div>
          <div className="text-xs text-red-700 mt-1">Processing errors</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-800" />
            <span className="text-sm text-gray-900">Overall Progress</span>
          </div>
          <span className="text-sm text-gray-600">{Math.round(progressPercentage)}% Complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-gray-800 to-green-600 h-3 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
          <span>{completed + failed} of {totalResumes} processed</span>
          {isProcessing && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Approx. {formatTime(estimatedTimeRemaining)} remaining
            </span>
          )}
        </div>
      </div>

      {/* AI Scoring Info Banner */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Sparkles className="w-5 h-5 text-gray-800" />
          </div>
          <div>
            <h3 className="text-sm text-gray-800 mb-1">AI-Powered Resume Scoring</h3>
            <p className="text-xs text-gray-900">
              Each resume is analyzed by our AI engine against the job description. This process may take 3-6 seconds per resume. 
              You can navigate away and return anytime - progress will continue in the background.
            </p>
          </div>
        </div>
      </div>

      {/* Progress Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto tf-table-shell">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Candidate Name
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Match Result
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Scored Date & Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {scoringItems.map((item) => (
                <tr 
                  key={item.id}
                  className={`transition-colors ${
                    item.status === 'in-progress' ? 'bg-gray-50' : 
                    item.status === 'completed' ? 'bg-green-50' : 
                    item.status === 'failed' ? 'bg-red-50' : 
                    'bg-white hover:bg-gray-50'
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{item.candidateName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      item.source === 'my-resumes' 
                        ? 'bg-gray-100 text-gray-900' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {item.source === 'my-resumes' ? 'My Resumes' : 'Internal DB'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item.status)}
                      <div>
                        <div className="text-sm text-gray-900">{getStatusText(item.status)}</div>
                        {item.status === 'failed' && item.errorReason && (
                          <div className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3" />
                            {item.errorReason}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.status === 'completed' ? (
                      getMatchBadge(item.matchResult, item.score)
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.scoredDate ? (
                      <div className="text-sm text-gray-900">
                        {formatIST(item.scoredDate)}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Footer */}
      {!isProcessing && (
        <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-gray-900 mb-1">Scoring Complete</h3>
              <p className="text-sm text-gray-600">
                {completed} resume{completed > 1 ? 's' : ''} scored successfully
                {failed > 0 && <span className="text-red-600"> • {failed} failed</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back to Job
              </button>
              <button
                onClick={() => {
                  // Navigate to scored resumes section
                  onComplete();
                  onBack();
                }}
                className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
              >
                <Target className="w-4 h-4" />
                View Scored Resumes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}