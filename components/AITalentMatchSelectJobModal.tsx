import { X, Search, Clock, CheckCircle, Users, Briefcase, Building2, Calendar, MapPin, User, Monitor, Laptop, Home, Sparkles, PenLine, Target } from 'lucide-react';
import { useState } from 'react';
import { Resume, Job } from '@/lib/types/types';
import { formatISTDate } from '@/lib/utils/dateUtils';

// Work mode configuration
const workModeConfig: Record<string, { label: string; icon: React.ElementType; bgColor: string; textColor: string }> = {
  onsite: { label: 'On-site', icon: Monitor, bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  hybrid: { label: 'Hybrid', icon: Laptop, bgColor: 'bg-purple-50', textColor: 'text-purple-700' },
  remote: { label: 'Remote', icon: Home, bgColor: 'bg-green-50', textColor: 'text-green-700' },
};

// Format employment type
const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Format relative time
const formatRelativeTime = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatISTDate(dateStr);
};

interface AITalentMatchSelectJobModalProps {
  resumes: Resume[];
  jobs: Job[];
  onClose: () => void;
  onMatch: (resumeIds: string[], jobId: string) => void;
}

export default function AITalentMatchSelectJobModal({ resumes, jobs, onClose, onMatch }: AITalentMatchSelectJobModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [isMatching, setIsMatching] = useState(false);

  // Filter for published jobs only
  const activeJobs = jobs.filter(job => job.status === 'Published');

  const filteredJobs = activeJobs.filter(job =>
    job.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleMatch = async () => {
    if (selectedJob) {
      setIsMatching(true);
      const resumeIds = resumes.map(r => r.id);

      // Small delay for UX
      setTimeout(() => {
        onMatch(resumeIds, selectedJob);
        setIsMatching(false);
      }, 300);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl text-gray-900">AI Talent Match</h2>
              <p className="text-xs sm:text-sm text-gray-600">Select a job to find matching candidates</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Selected Candidates Summary */}
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-start gap-2 sm:gap-3">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xs sm:text-sm text-gray-800 mb-2">
                  {resumes.length} Candidate{resumes.length > 1 ? 's' : ''} Selected for AI Matching
                </h3>
                <div className="space-y-2">
                  {resumes.slice(0, 3).map(resume => (
                    <div key={resume.id} className="flex items-center gap-3 p-2 bg-white rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-900">
                        {resume.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{resume.name}</div>
                        <div className="text-xs text-gray-500 truncate">{resume.title}</div>
                      </div>
                    </div>
                  ))}
                  {resumes.length > 3 && (
                    <div className="text-xs text-gray-900 pl-2">
                      +{resumes.length - 3} more candidate{resumes.length - 3 > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Job Search */}
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-2">Search Jobs for AI Matching</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by job title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-black text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
              />
            </div>
          </div>

          {/* Job Selection */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-gray-700">
                Select Job Opening{selectedJob ? ' (1 selected)' : ''}
              </label>
              {selectedJob && (
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-xs text-gray-800 hover:text-gray-900"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {filteredJobs.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {filteredJobs.map(job => {
                  const isSelected = selectedJob === job.id;
                  const workMode = workModeConfig[(job as any).workMode?.toLowerCase() || (job as any).remote_type?.toLowerCase()] || null;
                  const WorkModeIcon = workMode?.icon;

                  // Get status badge
                  const getStatusBadge = (status: string) => {
                    const configs: Record<string, { bg: string; text: string; dot: string }> = {
                      draft: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
                      published: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
                      Published: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
                      archived: { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' },
                      disabled: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
                    };
                    const config = configs[status] || configs.draft;
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></span>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    );
                  };

                  // Get creation method badge
                  const getCreationMethodBadge = (creationMethod: string) => {
                    const isAI = creationMethod === 'ai_generated' || creationMethod === 'ai';
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        isAI ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {isAI ? <Sparkles className="w-3 h-3" /> : <PenLine className="w-3 h-3" />}
                        {isAI ? 'AI' : 'Manual'}
                      </span>
                    );
                  };

                  return (
                    <label
                      key={job.id}
                      className={`block bg-white rounded-xl border-2 p-3 sm:p-5 cursor-pointer transition-all hover:shadow-md ${
                        isSelected
                          ? 'border-gray-800 ring-1 ring-gray-800 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-2 sm:gap-4">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => setSelectedJob(isSelected ? null : job.id)}
                          className="w-4 h-4 mt-1 text-gray-800 border-gray-300 rounded focus:ring-gray-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          {/* Row 1: Job ID, Title, Status, Creation Method */}
                          <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                            {/* Job ID Badge */}
                            {(job as any).job_id && (
                              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-blue-100 text-blue-700 rounded-md text-xs sm:text-sm font-medium border border-blue-200">
                                {(job as any).job_id}
                              </span>
                            )}
                            {/* Title */}
                            <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{job.title}</h3>
                            {/* Status Badge */}
                            {getStatusBadge(job.status)}
                            {/* Creation Method Badge */}
                            {(job as any).creation_method && getCreationMethodBadge((job as any).creation_method)}
                            {/* Selected indicator */}
                            {isSelected && (
                              <CheckCircle className="w-5 h-5 text-gray-800 ml-auto flex-shrink-0" />
                            )}
                          </div>

                          {/* Row 2: Industry, Location, Employment Type, Work Mode */}
                          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 mb-2 flex-wrap">
                            {/* Industry/Department */}
                            {((job as any).industry_type || (job as any).department) && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-4 h-4" />
                                {(job as any).industry_type || (job as any).department}
                              </span>
                            )}
                            {/* Location */}
                            {job.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {job.location}
                              </span>
                            )}
                            {/* Employment Type */}
                            {((job as any).employmentType || (job as any).employment_type) && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="w-4 h-4" />
                                {formatEmploymentType((job as any).employmentType || (job as any).employment_type)}
                              </span>
                            )}
                            {/* Work Mode */}
                            {workMode && WorkModeIcon && (
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded ${workMode.bgColor} ${workMode.textColor}`}>
                                <WorkModeIcon className="w-3 h-3" />
                                {workMode.label}
                              </span>
                            )}
                          </div>

                          {/* Row 3: Posted Date, Posted By, Last Updated */}
                          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 mb-2 sm:mb-3 flex-wrap">
                            {/* Posted Date */}
                            {((job as any).postedDate || (job as any).published_at) && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                Posted {formatISTDate((job as any).postedDate || (job as any).published_at)}
                              </span>
                            )}
                            {/* Posted By / Created By */}
                            {((job as any).postedBy || (job as any).created_by_name) && (
                              <span className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                By {(job as any).postedBy || (job as any).created_by_name}
                              </span>
                            )}
                            {/* Last Updated */}
                            {(job as any).updated_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                Last Updated: {formatRelativeTime((job as any).updated_at)}
                              </span>
                            )}
                          </div>

                          {/* Row 4: Applicants */}
                          <div className="flex items-center gap-2 text-xs sm:text-sm">
                            <Users className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600">{job.applicants || (job as any).applicants_count || 0} applicants</span>
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 sm:py-12 text-gray-500">
                <Briefcase className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-xs sm:text-sm">
                  {searchQuery ? 'No jobs found matching your search' : 'No active jobs available'}
                </p>
              </div>
            )}
          </div>

          {/* Info Box */}
          {selectedJob && (
            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-start gap-2 sm:gap-3">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm text-gray-900 mb-1">Next Steps</h4>
                  <ul className="text-xs text-gray-700 space-y-1">
                    <li>• You'll be taken to the AI Talent Match page</li>
                    <li>• AI will analyze selected resumes against the job requirements</li>
                    <li>• Get detailed match scores and recommendations</li>
                    <li>• Review and shortlist top matching candidates</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-xs sm:text-sm text-gray-600">
            {!selectedJob && 'Select a job to continue'}
            {selectedJob && (
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-gray-800 flex-shrink-0" />
                Ready to run AI Talent Match
              </span>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={onClose}
              disabled={isMatching}
              className="px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleMatch}
              disabled={!selectedJob || isMatching}
              className="px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isMatching ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">Continue to AI Talent Match</span>
                  <span className="sm:hidden">Continue</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
