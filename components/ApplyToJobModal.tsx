import { X, Search, Star, MapPin, Clock, CheckCircle, Users, Briefcase } from 'lucide-react';
import { useState } from 'react';
import { Resume, Job } from '@/lib/types/types';

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

  const calculateMatch = (resume: Resume, job: Job) => {
    // Mock match calculation based on skills
    const resumeSkills = resume.skills.map(s => s.toLowerCase());
    const jobSkills = job.skills?.map(s => s.toLowerCase()) || [];
    
    const matchingSkills = jobSkills.filter(skill => 
      resumeSkills.some(rs => rs.includes(skill) || skill.includes(rs))
    ).length;
    
    const matchScore = jobSkills.length > 0 
      ? Math.min(95, Math.floor((matchingSkills / jobSkills.length) * 100) + Math.floor(Math.random() * 10))
      : Math.floor(Math.random() * 30) + 70;
    
    if (matchScore >= job.requiredMatch) {
      return { score: matchScore, status: 'exact' };
    } else if (matchScore >= job.requiredMatch - 15) {
      return { score: matchScore, status: 'partial' };
    }
    return { score: matchScore, status: 'no-match' };
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
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
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
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm text-blue-900 mb-2">
                  {resumes.length} Candidate{resumes.length > 1 ? 's' : ''} Selected
                </h3>
                <div className="space-y-2">
                  {resumes.slice(0, 3).map(resume => (
                    <div key={resume.id} className="flex items-center gap-3 p-2 bg-white rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs text-blue-700">
                        {resume.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{resume.name}</div>
                        <div className="text-xs text-gray-500 truncate">{resume.title}</div>
                      </div>
                    </div>
                  ))}
                  {resumes.length > 3 && (
                    <div className="text-xs text-blue-700 pl-2">
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
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
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
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Clear Selection
                </button>
              )}
            </div>
            
            {filteredJobs.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredJobs.map(job => {
                  const isSelected = selectedJobs.includes(job.id);
                  const match = resumes.length === 1 ? calculateMatch(resumes[0], job) : null;

                  return (
                    <div key={job.id} className="space-y-2">
                      <label
                        className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleJob(job.id)}
                          className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                        />
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm text-gray-900 mb-1.5">{job.title}</div>
                            {isSelected && (
                              <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded">
                              {job.status}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {job.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {job.applicants || 0} applicants
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {job.daysActive} days active
                            </span>
                          </div>
                        </div>
                      </label>

                      {/* Show match score for single resume */}
                      {isSelected && match && (
                        <div
                          className={`ml-11 p-3 rounded-lg border ${
                            match.status === 'exact'
                              ? 'bg-green-50 border-green-200'
                              : match.status === 'partial'
                              ? 'bg-yellow-50 border-yellow-200'
                              : 'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Star
                              className={`w-4 h-4 ${
                                match.status === 'exact'
                                  ? 'text-green-600 fill-green-600'
                                  : match.status === 'partial'
                                  ? 'text-yellow-600 fill-yellow-600'
                                  : 'text-red-600'
                              }`}
                            />
                            <span
                              className={`text-sm ${
                                match.status === 'exact'
                                  ? 'text-green-700'
                                  : match.status === 'partial'
                                  ? 'text-yellow-700'
                                  : 'text-red-700'
                              }`}
                            >
                              <span className="font-medium">{match.score}% Match</span>
                              {match.status === 'exact' && ' - Excellent fit!'}
                              {match.status === 'partial' && ' - Good potential'}
                              {match.status === 'no-match' && ` - Below required ${job.requiredMatch}%`}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
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
            <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
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
                <CheckCircle className="w-4 h-4 text-blue-600" />
                Ready to apply to job
              </span>
            )}
            {selectedJobs.length > 1 && (
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-blue-600" />
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
              className="px-6 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
