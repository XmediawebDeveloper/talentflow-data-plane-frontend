'use client';

import { useState, useEffect } from 'react';
import { X, FileText, Calendar, User, CheckCircle2, Target, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Resume, ResumeVersion } from '@/lib/types/types';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { resumeService } from '@/lib/services/resumeService';

interface ResumeWithVersions extends Resume {
  loadedVersions?: ResumeVersion[];
  selectedVersionId?: string;
}

interface ScoringVersionSelectionModalProps {
  resumes: Resume[];
  jobTitle: string;
  onClose: () => void;
  onConfirm: (selectedVersions: { resumeId: string; versionId: string; candidateName: string }[]) => void;
}

export default function ScoringVersionSelectionModal({
  resumes,
  jobTitle,
  onClose,
  onConfirm,
}: ScoringVersionSelectionModalProps) {
  const [resumesWithVersions, setResumesWithVersions] = useState<ResumeWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedResumes, setExpandedResumes] = useState<Set<string>>(new Set());

  // Load versions for ALL resumes from API (don't trust versionCount from initial data)
  useEffect(() => {
    const loadVersions = async () => {
      setLoading(true);
      const updatedResumes: ResumeWithVersions[] = [];

      for (const resume of resumes) {
        // ALWAYS fetch versions from API to get accurate data
        try {
          console.log(`[ScoringVersionModal] Fetching versions for resume ${resume.id}`);
          const versionsData = await resumeService.getVersions(resume.id);
          const rawVersions = versionsData.versions || versionsData || [];

          console.log(`[ScoringVersionModal] Found ${rawVersions.length} versions for resume ${resume.id}`);

          // Map API response fields to frontend ResumeVersion type
          // API returns: { id, version, file_name, created_at, uploaded_by_name, file_size_kb }
          // Frontend expects: { id, name, uploadDate, size, uploadedBy, version }
          const mappedVersions: ResumeVersion[] = rawVersions.map((v: any) => ({
            id: v.id,
            name: v.file_name || v.name || 'Unknown',
            uploadDate: v.created_at || v.uploadDate || new Date().toISOString(),
            size: v.file_size_kb ? `${v.file_size_kb} KB` : (v.size || ''),
            uploadedBy: v.uploaded_by_name || v.uploadedBy || 'Unknown',
            version: v.version || 1,
            fileName: v.file_name,
          }));

          // Sort versions by version number (highest first = latest)
          const sortedVersions = [...mappedVersions].sort((a, b) =>
            (b.version || 0) - (a.version || 0)
          );

          // If API returned versions, use them; otherwise fallback to resume itself
          if (sortedVersions.length > 0) {
            updatedResumes.push({
              ...resume,
              loadedVersions: sortedVersions,
              selectedVersionId: sortedVersions[0]?.id || resume.id, // Default to latest
            });

            // Auto-expand if multiple versions
            if (sortedVersions.length > 1) {
              setExpandedResumes(prev => new Set(prev).add(resume.id));
            }
          } else {
            // No versions returned, use resume itself
            updatedResumes.push({
              ...resume,
              loadedVersions: [{
                id: resume.id,
                name: resume.fileName || resume.name,
                uploadDate: resume.uploadDate,
                size: resume.fileSizeKb ? `${resume.fileSizeKb} KB` : '',
                uploadedBy: resume.uploadedBy,
                version: resume.version || 1,
              }],
              selectedVersionId: resume.id,
            });
          }
        } catch (error) {
          console.error(`[ScoringVersionModal] Failed to load versions for resume ${resume.id}:`, error);
          // Use the resume itself as the only version
          updatedResumes.push({
            ...resume,
            loadedVersions: [{
              id: resume.id,
              name: resume.fileName || resume.name,
              uploadDate: resume.uploadDate,
              size: resume.fileSizeKb ? `${resume.fileSizeKb} KB` : '',
              uploadedBy: resume.uploadedBy,
              version: resume.version || 1,
            }],
            selectedVersionId: resume.id,
          });
        }
      }

      setResumesWithVersions(updatedResumes);
      setLoading(false);
    };

    loadVersions();
  }, [resumes]);

  const toggleExpand = (resumeId: string) => {
    setExpandedResumes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(resumeId)) {
        newSet.delete(resumeId);
      } else {
        newSet.add(resumeId);
      }
      return newSet;
    });
  };

  const selectVersion = (resumeId: string, versionId: string) => {
    setResumesWithVersions(prev =>
      prev.map(r =>
        r.id === resumeId ? { ...r, selectedVersionId: versionId } : r
      )
    );
  };

  const handleConfirm = () => {
    const selectedVersions = resumesWithVersions.map(r => ({
      resumeId: r.id,
      versionId: r.selectedVersionId || r.id,
      candidateName: r.name || 'Unknown',
    }));
    onConfirm(selectedVersions);
  };

  const multiVersionResumes = resumesWithVersions.filter(r => (r.loadedVersions?.length || 0) > 1);
  const singleVersionResumes = resumesWithVersions.filter(r => (r.loadedVersions?.length || 0) <= 1);

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-4xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-blue ring-1 ring-white/10 shadow-md shadow-brand-blue/25 rounded-xl flex items-center justify-center flex-shrink-0">
              <Target className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">Select Resume Versions</h2>
              <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                Choose which version to score for candidates with multiple resume versions
              </p>
              <p className="text-xs text-gray-600 dark:text-slate-400 mt-1 truncate">
                Job: <span className="font-semibold text-gray-900 dark:text-slate-50">{jobTitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors flex-shrink-0"
           aria-label="Close">
            <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 tf-loader-center tf-loader-center--compact">
              <Loader2 className="w-8 h-8 text-gray-400 dark:text-slate-500 animate-spin mb-4" />
              <p className="text-sm sm:text-base text-gray-700 dark:text-slate-300 font-medium">Loading resume versions...</p>
            </div>
          ) : (
            <>
              {/* Info Banner */}
              <div className="bg-brand-blue/5 ring-1 ring-brand-blue/20 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                <div className="flex items-start gap-2 sm:gap-3">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm">
                    <p className="text-brand-blue font-semibold mb-1">Latest versions auto-selected</p>
                    <p className="text-gray-700 dark:text-slate-300">
                      {multiVersionResumes.length > 0
                        ? `${multiVersionResumes.length} candidate${multiVersionResumes.length > 1 ? 's have' : ' has'} multiple versions. Latest version is selected by default.`
                        : 'All candidates have only one version.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Resumes with Multiple Versions */}
              {multiVersionResumes.length > 0 && (
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-slate-100 mb-2 sm:mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Candidates with Multiple Versions ({multiVersionResumes.length})
                  </h3>
                  <div className="space-y-2 sm:space-y-3">
                    {multiVersionResumes.map(resume => {
                      const isExpanded = expandedResumes.has(resume.id);
                      const versions = resume.loadedVersions || [];
                      const selectedVersion = versions.find(v => v.id === resume.selectedVersionId);

                      return (
                        <div key={resume.id} className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                          {/* Resume Header */}
                          <button
                            onClick={() => toggleExpand(resume.id)}
                            className="w-full flex items-center justify-between p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/50 hover:bg-brand-blue/5 transition-colors gap-2"
                          >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 dark:text-slate-500 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 dark:text-slate-500 flex-shrink-0" />
                              )}
                              <div className="text-left min-w-0">
                                <p className="font-semibold text-gray-900 dark:text-slate-50 text-sm truncate">{resume.name}</p>
                                <p className="text-xs text-gray-600 dark:text-slate-400 truncate">{resume.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                              <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-amber-100 text-amber-800 text-[10px] sm:text-xs font-semibold rounded-full whitespace-nowrap">
                                {versions.length} versions
                              </span>
                              {selectedVersion && (
                                <span className="hidden sm:inline text-sm text-gray-700 dark:text-slate-300">
                                  Selected: <span className="font-semibold">v{versions.length - versions.indexOf(selectedVersion)}</span>
                                </span>
                              )}
                            </div>
                          </button>

                          {/* Versions List */}
                          {isExpanded && (
                            <div className="p-3 sm:p-4 space-y-2 bg-white dark:bg-slate-900">
                              {versions.map((version, index) => {
                                const isLatest = index === 0;
                                const isSelected = version.id === resume.selectedVersionId;
                                // Use actual version number from API, fallback to calculated
                                const versionNumber = version.version || (versions.length - index);

                                return (
                                  <button
                                    key={version.id}
                                    onClick={() => selectVersion(resume.id, version.id)}
                                    className={`w-full text-left p-2.5 sm:p-3 rounded-lg border-2 transition-all ${
                                      isSelected
                                        ? 'border-brand-blue/40 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                                        : 'border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                          isSelected ? 'bg-brand-blue text-white shadow shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300'
                                        }`}>
                                          <span className="text-[10px] sm:text-xs font-bold">v{versionNumber}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50">
                                              Version {versionNumber}
                                            </span>
                                            {isLatest && (
                                              <span className="px-1.5 py-0.5 bg-green-600 text-white text-[10px] font-semibold rounded">
                                                Latest
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-600 dark:text-slate-400 mt-0.5 flex-wrap">
                                            <span className="flex items-center gap-1">
                                              <Calendar className="w-3 h-3 flex-shrink-0" />
                                              {formatISTDate(version.uploadDate)}
                                            </span>
                                            <span className="flex items-center gap-1">
                                              <User className="w-3 h-3 flex-shrink-0" />
                                              <span className="truncate max-w-[100px] sm:max-w-none">{version.uploadedBy}</span>
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                                        isSelected ? 'bg-brand-blue' : 'bg-gray-200 dark:bg-slate-800'
                                      }`}>
                                        <CheckCircle2 className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                                          isSelected ? 'text-white' : 'text-gray-400 dark:text-slate-500'
                                        }`} />
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Resumes with Single Version */}
              {singleVersionResumes.length > 0 && (
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-slate-100 mb-2 sm:mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Candidates with Single Version ({singleVersionResumes.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {singleVersionResumes.map(resume => (
                      <div key={resume.id} className="p-2.5 sm:p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                        <p className="font-semibold text-gray-900 dark:text-slate-50 text-sm truncate">{resume.name}</p>
                        <p className="text-xs text-gray-600 dark:text-slate-400 truncate">{resume.email}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 bg-brand-blue/[0.03] shrink-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300 font-medium">
              <span className="font-semibold text-brand-blue">{resumesWithVersions.length}</span> resume{resumesWithVersions.length !== 1 ? 's' : ''} selected for scoring
            </p>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 sm:px-5 py-2.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 sm:flex-none px-4 sm:px-6 py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2 text-sm"
              >
                <Target className="w-4 h-4" />
                Start Scoring
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
