'use client';

import { X, Target, TrendingUp, CheckCircle, AlertCircle, FileText, Briefcase, FolderOpen, Database } from 'lucide-react';
import { Resume, Job } from '@/lib/types/types';
import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/enhanced-toast';
import { usePlanFeature } from '@/lib/hooks/usePlanFeature';

interface ResumeScoringModalProps {
  resumes: Resume[];
  jobs: Job[];
  onClose: () => void;
  onScore: (jobId: string, resumeIds: string[]) => void;
}

export default function ResumeScoringModal({
  resumes,
  jobs,
  onClose,
  onScore,
}: ResumeScoringModalProps) {
  const { available: scoringAvailable } = usePlanFeature('resume_scoring');
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [resumeSource, setResumeSource] = useState<'my-resumes' | 'database' | null>(null);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [isScoring, setIsScoring] = useState(false);

  useEffect(() => {
    if (!scoringAvailable) {
      toast.error({
        title: 'Feature Not Available',
        description: 'Resume scoring is not available on your current plan. Please upgrade to access this feature.',
      });
      onClose();
    }
  }, [scoringAvailable, onClose]);

  if (!scoringAvailable) {
    return null;
  }

  // For this demo, we'll split resumes based on folderId
  // In production, you'd have a proper source field or different data sources
  const myResumes = resumes.filter(r => r.folderId && r.folderId !== 'all'); 
  const databaseResumes = resumes; // In real app, this would be from a different API/source

  const availableResumes = resumeSource === 'my-resumes' ? myResumes : 
                          resumeSource === 'database' ? databaseResumes : 
                          [];

  const handleResumeToggle = (resumeId: string) => {
    setSelectedResumes(prev => 
      prev.includes(resumeId) 
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  const handleSelectAll = () => {
    if (selectedResumes.length === availableResumes.length) {
      setSelectedResumes([]);
    } else {
      setSelectedResumes(availableResumes.map(r => r.id));
    }
  };

  const handleScore = async () => {
    if (!selectedJob) {
      toast.error({
        title: 'No Job Selected',
        description: 'Please select a job description to score against.',
      });
      return;
    }

    if (selectedResumes.length === 0) {
      toast.error({
        title: 'No Resumes Selected',
        description: 'Please select at least one resume to score.',
      });
      return;
    }

    setIsScoring(true);

    // Simulate scoring process
    setTimeout(() => {
      setIsScoring(false);
      toast.success({
        title: 'Resume Scoring Complete!',
        description: `${selectedResumes.length} resume${selectedResumes.length > 1 ? 's' : ''} scored successfully against the selected job.`,
      });
      onScore(selectedJob, selectedResumes);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden animate-scale-in flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl text-gray-900">Resume Scoring</h2>
              <p className="text-sm text-gray-600">Score resumes against job requirements</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-lg transition-colors"
           aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Step 1: Select Job */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-gray-800 text-white flex items-center justify-center text-sm font-medium">
                1
              </div>
              <h3 className="text-gray-900">Select Job Description</h3>
            </div>

            <div className="ml-11 space-y-2 max-h-64 overflow-y-auto">
              {jobs.filter(job => job.status === 'Published' || job.status === 'Active').map(job => (
                <button
                  key={job.id}
                  onClick={() => {
                    setSelectedJob(job.id);
                    setResumeSource(null);
                    setSelectedResumes([]);
                  }}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedJob === job.id
                      ? 'border-gray-800 bg-gray-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      selectedJob === job.id ? 'bg-gray-800' : 'bg-gray-100'
                    }`}>
                      <Briefcase className={`w-5 h-5 ${
                        selectedJob === job.id ? 'text-white' : 'text-gray-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-gray-900 mb-1">{job.title}</h4>
                      <div className="flex items-center gap-4 text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                          {job.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                          {job.type || job.employmentType || 'Full-time'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded">
                          {job.status}
                        </span>
                      </div>
                    </div>
                    {selectedJob === job.id && (
                      <CheckCircle className="w-5 h-5 text-gray-800 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}

              {jobs.filter(job => job.status === 'Published' || job.status === 'Active').length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-sm">No active jobs available for scoring.</p>
                  <p className="text-xs mt-1">Please create or activate a job first.</p>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Choose Resume Source & List Resumes */}
          {selectedJob && (
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  resumeSource ? 'bg-gray-800 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                  2
                </div>
                <h3 className="text-gray-900">Choose Resume</h3>
              </div>

              {!resumeSource ? (
                // Show Resume Source Options
                <div className="ml-11 grid grid-cols-2 gap-4">
                  {/* My Resumes Option */}
                  <button
                    onClick={() => {
                      setResumeSource('my-resumes');
                      setSelectedResumes([]);
                    }}
                    className="p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition-all text-left group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-gray-100 group-hover:bg-gray-800 flex items-center justify-center transition-colors">
                        <FolderOpen className="w-6 h-6 text-gray-800 group-hover:text-white transition-colors" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-gray-900 mb-1">
                          My Resumes
                        </h4>
                        <p className="text-sm text-gray-600 mb-2">
                          Resumes from your personal collection
                        </p>
                        <div className="text-xs text-gray-800 font-medium">
                          {myResumes.length} resume{myResumes.length !== 1 ? 's' : ''} available
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Resume Database Option */}
                  <button
                    onClick={() => {
                      setResumeSource('database');
                      setSelectedResumes([]);
                    }}
                    className="p-6 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition-all text-left group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-gray-100 group-hover:bg-gray-800 flex items-center justify-center transition-colors">
                        <Database className="w-6 h-6 text-gray-800 group-hover:text-white transition-colors" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-gray-900 mb-1">
                          Resume Database
                        </h4>
                        <p className="text-sm text-gray-600 mb-2">
                          All resumes in internal database
                        </p>
                        <div className="text-xs text-gray-800 font-medium">
                          {databaseResumes.length} resume{databaseResumes.length !== 1 ? 's' : ''} available
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              ) : (
                // Show Resume List
                <div className="ml-11">
                  {/* Back to Source Selection */}
                  <button
                    onClick={() => {
                      setResumeSource(null);
                      setSelectedResumes([]);
                    }}
                    className="mb-4 text-sm text-gray-800 hover:text-gray-900 font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Change Source
                  </button>

                  {/* Source Badge */}
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg mb-4 ${
                    resumeSource === 'my-resumes' 
                      ? 'bg-gray-100 text-gray-900' 
                      : 'bg-gray-100 text-gray-900'
                  }`}>
                    {resumeSource === 'my-resumes' ? (
                      <>
                        <FolderOpen className="w-4 h-4" />
                        <span className="text-sm font-medium">My Resumes</span>
                      </>
                    ) : (
                      <>
                        <Database className="w-4 h-4" />
                        <span className="text-sm font-medium">Resume Database</span>
                      </>
                    )}
                  </div>

                  {/* Select All / Deselect All */}
                  {availableResumes.length > 0 && (
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                      <div className="text-sm text-gray-600">
                        {selectedResumes.length} of {availableResumes.length} resume{availableResumes.length !== 1 ? 's' : ''} selected
                      </div>
                      <button
                        onClick={handleSelectAll}
                        className="text-sm text-gray-800 hover:text-gray-900 font-medium"
                      >
                        {selectedResumes.length === availableResumes.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                  )}

                  {/* Resume List */}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {availableResumes.map(resume => (
                      <label
                        key={resume.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedResumes.includes(resume.id)
                            ? resumeSource === 'my-resumes' 
                              ? 'border-gray-800 bg-gray-50'
                              : 'border-gray-800 bg-gray-50'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedResumes.includes(resume.id)}
                          onChange={() => handleResumeToggle(resume.id)}
                          className="w-5 h-5 text-gray-800 rounded border-gray-300 focus:ring-gray-500"
                        />
                        <FileText className={`w-5 h-5 ${
                          selectedResumes.includes(resume.id)
                            ? resumeSource === 'my-resumes' ? 'text-gray-800' : 'text-gray-800'
                            : 'text-gray-400'
                        }`} />
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">{resume.name}</div>
                          <div className="text-xs text-gray-500">
                            {resume.email} • {resume.experience}
                          </div>
                        </div>
                      </label>
                    ))}

                    {availableResumes.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm">No resumes found in {resumeSource === 'my-resumes' ? 'My Resumes' : 'Resume Database'}.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scoring Info */}
          {selectedResumes.length > 0 && (
            <div className="ml-11 p-4 bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-gray-800 mt-0.5" />
                <div>
                  <h4 className="text-sm text-gray-900 mb-2">AI-Powered Resume Scoring</h4>
                  <ul className="text-xs text-gray-700 space-y-1">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Analyzes skills match percentage</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Evaluates experience relevance</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Identifies skill gaps and provides overall compatibility score</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleScore}
            disabled={!selectedJob || selectedResumes.length === 0 || isScoring}
            className="px-6 py-2.5 text-sm bg-gradient-to-r from-gray-800 to-gray-800 text-white rounded-lg hover:from-blue-700 hover:to-gray-900 transition-all disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg font-medium"
          >
            {isScoring ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Scoring...
              </>
            ) : (
              <>
                <Target className="w-4 h-4" />
                Score {selectedResumes.length > 0 ? `${selectedResumes.length} Resume${selectedResumes.length > 1 ? 's' : ''}` : 'Resumes'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
