import { X, Search, Star, MapPin, Clock, CheckCircle, Users, Briefcase, Building2, Calendar, User, DollarSign, Sparkles, PenLine, Hash, Monitor, Laptop, Home } from 'lucide-react';
import { useState } from 'react';
import { Resume, Job } from '@/lib/types/types';

// Work mode configuration
const workModeConfig: Record<string, { label: string; icon: React.ElementType; bgColor: string; textColor: string }> = {
  onsite: { label: 'On-site', icon: Monitor, bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  hybrid: { label: 'Hybrid', icon: Laptop, bgColor: 'bg-purple-50', textColor: 'text-purple-700' },
  remote: { label: 'Remote', icon: Home, bgColor: 'bg-green-50', textColor: 'text-green-700' },
};

interface ApplyToJobModalProps {
  resumes: Resume[];
  jobs: Job[];
  onClose: () => void;
  onApply: (resumeIds: string[], jobIds: string[]) => void;
}

export default function ApplyToJobModal({ resumes, jobs, onClose, onApply }: ApplyToJobModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);

  // Filter for published jobs only
  const activeJobs = jobs.filter(job => job.status === 'Published');
  
  const filteredJobs = activeJobs.filter(job =>
    job.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleJob = (jobId: string) => {
    setSelectedJobs(prev =>
      prev.includes(jobId)
        ? prev.filter(id => id !== jobId)
        : [...prev, jobId].slice(0, 5) // Max 5 jobs
    );
  };

  const handleApply = async () => {
    if (selectedJobs.length > 0) {
      setIsApplying(true);
      const resumeIds = resumes.map(r => r.id);
      
      // Simulate API call
      setTimeout(() => {
        onApply(resumeIds, selectedJobs);
        setIsApplying(false);
      }, 800);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl text-gray-900">Apply to Job</h2>
              <p className="text-sm text-gray-600">Select job openings to apply candidates</p>
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
        <div className="flex-1 overflow-y-auto p-6">
          {/* Selected Candidates Summary */}
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-gray-800 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm text-gray-800 mb-2">
                  {resumes.length} Candidate{resumes.length > 1 ? 's' : ''} Selected
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
            <label className="block text-sm text-gray-700 mb-2">Search Active Jobs</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by job title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
              />
            </div>
          </div>

          {/* Job Selection */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-gray-700">
                Select Job Opening{selectedJobs.length > 0 ? ` (${selectedJobs.length} selected)` : 's'}
              </label>
              {selectedJobs.length > 0 && (
                <button
                  onClick={() => setSelectedJobs([])}
                  className="text-xs text-gray-800 hover:text-gray-900"
                >
                  Clear Selection
                </button>
              )}
            </div>
            
            {filteredJobs.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredJobs.map(job => {
                  const isSelected = selectedJobs.includes(job.id);
                  const workMode = workModeConfig[(job as any).workMode?.toLowerCase()] || null;
                  const WorkModeIcon = workMode?.icon;

                  // Format posted date
                  const formatPostedDate = (dateStr: string | undefined) => {
                    if (!dateStr) return 'N/A';
                    const date = new Date(dateStr);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  };

                  return (
                    <label
                      key={job.id}
                      className={`block p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? 'border-gray-800 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleJob(job.id)}
                          className="mt-1 rounded border-gray-300 text-gray-800 focus:ring-gray-600"
                        />
                        <div className="flex-1 min-w-0">
                          {/* Header Row: Job ID, Title, Status, Creation Method */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Job ID Badge */}
                              {(job as any).job_id && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                  <Hash className="w-3 h-3" />
                                  {(job as any).job_id}
                                </span>
                              )}
                              {/* Title */}
                              <span className="text-sm font-medium text-gray-900">{job.title}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Status Badge */}
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                                {job.status}
                              </span>
                              {/* Creation Method Badge */}
                              {(job as any).creation_method && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                  (job as any).creation_method === 'ai'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {(job as any).creation_method === 'ai' ? (
                                    <><Sparkles className="w-3 h-3" /> AI</>
                                  ) : (
                                    <><PenLine className="w-3 h-3" /> Manual</>
                                  )}
                                </span>
                              )}
                              {isSelected && (
                                <CheckCircle className="w-5 h-5 text-gray-800" />
                              )}
                            </div>
                          </div>

                          {/* Info Row 1: Industry, Location, Employment Type, Work Mode */}
                          <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap mb-2">
                            {/* Industry */}
                            {(job as any).industry_type && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {(job as any).industry_type}
                              </span>
                            )}
                            {/* Location */}
                            {job.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {job.location}
                              </span>
                            )}
                            {/* Employment Type */}
                            {(job as any).employmentType && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                                <Briefcase className="w-3 h-3" />
                                {(job as any).employmentType}
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

                          {/* Info Row 2: Experience, Posted Date, Posted By */}
                          <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap mb-2">
                            {/* Experience */}
                            {(job as any).experience && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {(job as any).experience} yrs exp
                              </span>
                            )}
                            {/* Posted Date */}
                            {(job as any).postedDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatPostedDate((job as any).postedDate)}
                              </span>
                            )}
                            {/* Posted By */}
                            {(job as any).postedBy && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {(job as any).postedBy}
                              </span>
                            )}
                          </div>

                          {/* Info Row 3: Salary, Skills, Applicants */}
                          <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                            {/* Salary */}
                            {(job as any).salary && (
                              <span className="flex items-center gap-1 text-green-600 font-medium">
                                <DollarSign className="w-3 h-3" />
                                {(job as any).salary}
                              </span>
                            )}
                            {/* Skills Count */}
                            {job.skills && job.skills.length > 0 && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 rounded">
                                <Star className="w-3 h-3" />
                                {job.skills.length} skill{job.skills.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {/* Applicants */}
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {job.applicants || 0} applicant{(job.applicants || 0) !== 1 ? 's' : ''}
                            </span>
                            {/* Days Active */}
                            <span className="text-gray-400">
                              {job.daysActive} day{job.daysActive !== 1 ? 's' : ''} active
                            </span>
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm">
                  {searchQuery ? 'No jobs found matching your search' : 'No active jobs available'}
                </p>
              </div>
            )}
          </div>

          {/* Info Box */}
          {selectedJobs.length > 0 && (
            <div className="mt-4 p-4 bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-gray-800 mt-0.5" />
                <div>
                  <h4 className="text-sm text-gray-900 mb-1">Next Steps</h4>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {selectedJobs.length === 1 ? (
                      <>
                        <li>• Candidates will be added to the selected job</li>
                        <li>• You'll be navigated to the job's applicant list</li>
                        <li>• You can review and manage applications there</li>
                      </>
                    ) : (
                      <>
                        <li>• Candidates will be applied to {selectedJobs.length} jobs</li>
                        <li>• You'll see the Resume Scoring page</li>
                        <li>• AI will analyze fit for each job</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {selectedJobs.length === 0 && 'Select at least one job to continue'}
            {selectedJobs.length === 1 && (
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-gray-800" />
                Ready to apply to job
              </span>
            )}
            {selectedJobs.length > 1 && (
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-gray-800" />
                Ready to apply to {selectedJobs.length} jobs
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="px-6 py-2.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={selectedJobs.length === 0 || isApplying}
              className="px-6 py-2.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isApplying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Apply to {selectedJobs.length > 0 ? `${selectedJobs.length} Job${selectedJobs.length > 1 ? 's' : ''}` : 'Job'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
