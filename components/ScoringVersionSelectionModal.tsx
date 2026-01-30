'use client';

import { useState, useEffect } from 'react';
import { X, FileText, Calendar, User, CheckCircle2, Target, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Resume, ResumeVersion } from '@/lib/types/types';
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

  // Load versions for resumes that have multiple versions
  useEffect(() => {
    const loadVersions = async () => {
      setLoading(true);
      const updatedResumes: ResumeWithVersions[] = [];

      for (const resume of resumes) {
        const hasMultipleVersions = (resume.versionCount || 1) > 1;

        if (hasMultipleVersions) {
          try {
            const versionsData = await resumeService.getVersions(resume.id);
            const rawVersions = versionsData.versions || versionsData || [];

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

            updatedResumes.push({
              ...resume,
              loadedVersions: sortedVersions,
              selectedVersionId: sortedVersions[0]?.id || resume.id, // Default to latest
            });

            // Auto-expand resumes with multiple versions
            setExpandedResumes(prev => new Set(prev).add(resume.id));
          } catch (error) {
            console.error(`Failed to load versions for resume ${resume.id}:`, error);
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
        } else {
          // Single version, use the resume ID directly
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-md">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">Select Resume Versions</h2>
              <p className="text-sm text-gray-600">
                Choose which version to score for candidates with multiple resume versions
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Job: <span className="font-medium text-gray-700">{jobTitle}</span>
              </p>
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
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-4" />
              <p className="text-gray-600">Loading resume versions...</p>
            </div>
          ) : (
            <>
              {/* Info Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-blue-900 font-medium mb-1">Latest versions auto-selected</p>
                    <p className="text-blue-700">
                      {multiVersionResumes.length > 0
                        ? `${multiVersionResumes.length} candidate${multiVersionResumes.length > 1 ? 's have' : ' has'} multiple versions. Latest version is selected by default.`
                        : 'All candidates have only one version.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Resumes with Multiple Versions */}
              {multiVersionResumes.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Candidates with Multiple Versions ({multiVersionResumes.length})
                  </h3>
                  <div className="space-y-3">
                    {multiVersionResumes.map(resume => {
                      const isExpanded = expandedResumes.has(resume.id);
                      const versions = resume.loadedVersions || [];
                      const selectedVersion = versions.find(v => v.id === resume.selectedVersionId);

                      return (
                        <div key={resume.id} className="border border-gray-200 rounded-lg overflow-hidden">
                          {/* Resume Header */}
                          <button
                            onClick={() => toggleExpand(resume.id)}
                            className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="w-5 h-5 text-gray-500" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-gray-500" />
                              )}
                              <div className="text-left">
                                <p className="font-medium text-gray-900">{resume.name}</p>
                                <p className="text-xs text-gray-500">{resume.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                                {versions.length} versions
                              </span>
                              {selectedVersion && (
                                <span className="text-sm text-gray-600">
                                  Selected: <span className="font-medium">v{versions.length - versions.indexOf(selectedVersion)}</span>
                                </span>
                              )}
                            </div>
                          </button>

                          {/* Versions List */}
                          {isExpanded && (
                            <div className="p-4 space-y-2 bg-white">
                              {versions.map((version, index) => {
                                const isLatest = index === 0;
                                const isSelected = version.id === resume.selectedVersionId;
                                // Use actual version number from API, fallback to calculated
                                const versionNumber = version.version || (versions.length - index);

                                return (
                                  <button
                                    key={version.id}
                                    onClick={() => selectVersion(resume.id, version.id)}
                                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                                      isSelected
                                        ? 'border-gray-800 bg-gray-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                          isSelected ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'
                                        }`}>
                                          <span className="text-xs font-bold">v{versionNumber}</span>
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-900">
                                              Version {versionNumber}
                                            </span>
                                            {isLatest && (
                                              <span className="px-1.5 py-0.5 bg-green-600 text-white text-[10px] font-medium rounded">
                                                Latest
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                                            <span className="flex items-center gap-1">
                                              <Calendar className="w-3 h-3" />
                                              {new Date(version.uploadDate).toLocaleDateString()}
                                            </span>
                                            <span className="flex items-center gap-1">
                                              <User className="w-3 h-3" />
                                              {version.uploadedBy}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                        isSelected ? 'bg-gray-800' : 'bg-gray-200'
                                      }`}>
                                        <CheckCircle2 className={`w-4 h-4 ${
                                          isSelected ? 'text-white' : 'text-gray-400'
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
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Candidates with Single Version ({singleVersionResumes.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {singleVersionResumes.map(resume => (
                      <div key={resume.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="font-medium text-gray-900 text-sm truncate">{resume.name}</p>
                        <p className="text-xs text-gray-500 truncate">{resume.email}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {resumesWithVersions.length} resume{resumesWithVersions.length !== 1 ? 's' : ''} selected for scoring
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
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
