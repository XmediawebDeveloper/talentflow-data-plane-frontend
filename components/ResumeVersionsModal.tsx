import { useState, useMemo } from 'react';
import { X, FileText, Download, Calendar, GitBranch, Eye, Clock, Loader2, ArrowLeft, Plus, Minus, Equal, Briefcase, MapPin, GraduationCap, Award } from 'lucide-react';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface ResumeVersion {
  id: string;
  version: number;
  file_name?: string;
  file_size?: number;
  file_size_kb?: number;
  created_at: string;
  uploaded_by_name?: string;
  // Parsed content for comparison
  skills?: string[];
  technical_skills?: string[];
  experience?: any[];
  education?: any[];
  certifications?: any[];
  current_title?: string;
  current_company?: string;
  location?: string;
  professional_summary?: string;
}

interface MatchedCandidate {
  id: string;
  name: string;
  resumeId?: string;
}

interface ResumeVersionsModalProps {
  candidate: MatchedCandidate;
  versions: ResumeVersion[];
  loading?: boolean;
  onClose: () => void;
  onSelectVersion?: (version: ResumeVersion) => void;
  selectionMode?: boolean;
}

// Helper function to compute array differences
function computeArrayDiff<T>(oldArray: T[], newArray: T[]): {
  added: T[];
  removed: T[];
  unchanged: T[];
} {
  const oldSet = new Set(oldArray.map(item => typeof item === 'string' ? item : JSON.stringify(item)));
  const newSet = new Set(newArray.map(item => typeof item === 'string' ? item : JSON.stringify(item)));

  const added: T[] = [];
  const removed: T[] = [];
  const unchanged: T[] = [];

  newArray.forEach(item => {
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (!oldSet.has(key)) {
      added.push(item);
    } else {
      unchanged.push(item);
    }
  });

  oldArray.forEach(item => {
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (!newSet.has(key)) {
      removed.push(item);
    }
  });

  return { added, removed, unchanged };
}

// Helper function to compute text diff (simple line-based)
function computeTextDiff(oldText: string, newText: string): { text: string; isNew: boolean; isRemoved: boolean }[] {
  if (!oldText && !newText) return [];
  if (!oldText) {
    return newText.split('\n').map(line => ({ text: line, isNew: true, isRemoved: false }));
  }
  if (!newText) {
    return oldText.split('\n').map(line => ({ text: line, isNew: false, isRemoved: true }));
  }

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const oldSet = new Set(oldLines.map(line => line.trim()).filter(line => line.length > 0));

  return newLines.map(line => {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 || oldSet.has(trimmedLine)) {
      return { text: line, isNew: false, isRemoved: false };
    }
    return { text: line, isNew: true, isRemoved: false };
  });
}

export default function ResumeVersionsModal({
  candidate,
  versions = [],
  loading = false,
  onClose,
  onSelectVersion,
  selectionMode = false,
}: ResumeVersionsModalProps) {
  const [selectedVersion, setSelectedVersion] = useState<ResumeVersion | null>(null);
  const [previousVersion, setPreviousVersion] = useState<ResumeVersion | null>(null);
  const [comparisonMode, setComparisonMode] = useState(false);

  const formatFileSize = (version: ResumeVersion) => {
    // API returns file_size_kb (in KB)
    if (version.file_size_kb) {
      if (version.file_size_kb >= 1024) {
        return `${(version.file_size_kb / 1024).toFixed(1)} MB`;
      }
      return `${version.file_size_kb.toFixed(1)} KB`;
    }
    // Fallback for file_size in bytes
    if (version.file_size) {
      if (version.file_size < 1024) return `${version.file_size} B`;
      if (version.file_size < 1024 * 1024) return `${(version.file_size / 1024).toFixed(1)} KB`;
      return `${(version.file_size / (1024 * 1024)).toFixed(1)} MB`;
    }
    return 'N/A';
  };

  const handleDownload = async (version: ResumeVersion) => {
    try {
      const blob = candidate.resumeId
        ? await resumeService.downloadVersion(candidate.resumeId, version.id)
        : await resumeService.download(version.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = version.file_name || `${candidate.name}_v${version.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download resume');
    }
  };

  const handlePreview = (version: ResumeVersion) => {
    // Use version.id directly as the resume ID for that version
    window.open(`/recruitment/resume-view/${version.id}`, '_blank');
  };

  const handleCompare = (version: ResumeVersion, index: number) => {
    setSelectedVersion(version);
    // Find the previous version for comparison
    if (index < versions.length - 1) {
      setPreviousVersion(versions[index + 1]);
    } else {
      setPreviousVersion(null);
    }
    setComparisonMode(true);
  };

  const handleBackToList = () => {
    setSelectedVersion(null);
    setPreviousVersion(null);
    setComparisonMode(false);
  };

  // Compute differences when in comparison mode
  const changes = useMemo(() => {
    if (!selectedVersion || !previousVersion) return null;

    const skillsDiff = computeArrayDiff(
      previousVersion.skills || [],
      selectedVersion.skills || []
    );

    const technicalSkillsDiff = computeArrayDiff(
      previousVersion.technical_skills || [],
      selectedVersion.technical_skills || []
    );

    const certificationsDiff = computeArrayDiff(
      previousVersion.certifications || [],
      selectedVersion.certifications || []
    );

    const summaryDiff = computeTextDiff(
      previousVersion.professional_summary || '',
      selectedVersion.professional_summary || ''
    );

    return {
      skills: skillsDiff,
      technicalSkills: technicalSkillsDiff,
      certifications: certificationsDiff,
      summary: summaryDiff,
      titleChanged: previousVersion.current_title !== selectedVersion.current_title,
      companyChanged: previousVersion.current_company !== selectedVersion.current_company,
      locationChanged: previousVersion.location !== selectedVersion.location,
    };
  }, [selectedVersion, previousVersion]);

  const hasChanges = useMemo(() => {
    if (!changes) return false;
    return (
      changes.skills.added.length > 0 ||
      changes.skills.removed.length > 0 ||
      changes.technicalSkills.added.length > 0 ||
      changes.technicalSkills.removed.length > 0 ||
      changes.certifications.added.length > 0 ||
      changes.certifications.removed.length > 0 ||
      changes.titleChanged ||
      changes.companyChanged ||
      changes.locationChanged ||
      changes.summary.some(line => line.isNew)
    );
  }, [changes]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            {comparisonMode && (
              <button
                onClick={handleBackToList}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {comparisonMode && selectedVersion
                  ? `Version ${selectedVersion.version} Comparison`
                  : selectionMode
                  ? 'Select Resume Version'
                  : 'Resume Versions'}
              </h2>
              <p className="text-sm text-gray-600">
                {comparisonMode && selectedVersion && previousVersion
                  ? `Comparing v${selectedVersion.version} with v${previousVersion.version}`
                  : candidate.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-3" />
              <p className="text-gray-600">Loading versions...</p>
            </div>
          ) : comparisonMode && selectedVersion ? (
            /* Comparison View */
            <div className="space-y-6">
              {/* Version Info Bar */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold">
                      v{selectedVersion.version}
                    </span>
                    <span className="text-sm text-gray-600">
                      {formatISTDate(selectedVersion.created_at)}
                    </span>
                  </div>
                  {previousVersion && (
                    <>
                      <span className="text-gray-400">vs</span>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold">
                          v{previousVersion.version}
                        </span>
                        <span className="text-sm text-gray-600">
                          {formatISTDate(previousVersion.created_at)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {hasChanges && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    Changes Detected
                  </span>
                )}
              </div>

              {previousVersion ? (
                <div className="space-y-6">
                  {/* Changes Summary */}
                  {hasChanges && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                        <GitBranch className="w-4 h-4" />
                        What Changed
                      </h3>
                      <div className="space-y-2 text-sm">
                        {changes?.titleChanged && (
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-700">
                              Title: <span className="line-through text-gray-500">{previousVersion.current_title}</span>
                              {' → '}
                              <span className="font-medium text-blue-600">{selectedVersion.current_title}</span>
                            </span>
                          </div>
                        )}
                        {changes?.companyChanged && (
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-700">
                              Company: <span className="line-through text-gray-500">{previousVersion.current_company}</span>
                              {' → '}
                              <span className="font-medium text-blue-600">{selectedVersion.current_company}</span>
                            </span>
                          </div>
                        )}
                        {changes?.locationChanged && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-700">
                              Location: <span className="line-through text-gray-500">{previousVersion.location}</span>
                              {' → '}
                              <span className="font-medium text-blue-600">{selectedVersion.location}</span>
                            </span>
                          </div>
                        )}
                        {changes && changes.skills.added.length > 0 && (
                          <div className="flex items-start gap-2">
                            <Plus className="w-4 h-4 text-green-600 mt-0.5" />
                            <div>
                              <span className="text-gray-700 font-medium">Skills Added:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {changes.skills.added.map((skill, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {changes && changes.skills.removed.length > 0 && (
                          <div className="flex items-start gap-2">
                            <Minus className="w-4 h-4 text-red-600 mt-0.5" />
                            <div>
                              <span className="text-gray-700 font-medium">Skills Removed:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {changes.skills.removed.map((skill, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium line-through">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {changes && changes.technicalSkills.added.length > 0 && (
                          <div className="flex items-start gap-2">
                            <Plus className="w-4 h-4 text-green-600 mt-0.5" />
                            <div>
                              <span className="text-gray-700 font-medium">Technical Skills Added:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {changes.technicalSkills.added.map((skill, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                                    {typeof skill === 'string' ? skill : skill.name || JSON.stringify(skill)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {changes && changes.certifications.added.length > 0 && (
                          <div className="flex items-start gap-2">
                            <Award className="w-4 h-4 text-green-600 mt-0.5" />
                            <div>
                              <span className="text-gray-700 font-medium">Certifications Added:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {changes.certifications.added.map((cert, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                                    {typeof cert === 'string' ? cert : cert.name || cert.certification_name || JSON.stringify(cert)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Skills Comparison */}
                  {(changes?.skills.added.length || changes?.skills.removed.length || changes?.skills.unchanged.length) ? (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {changes?.skills.unchanged.map((skill, idx) => (
                          <span key={`unchanged-${idx}`} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs flex items-center gap-1">
                            <Equal className="w-3 h-3 text-gray-400" />
                            {skill}
                          </span>
                        ))}
                        {changes?.skills.added.map((skill, idx) => (
                          <span key={`added-${idx}`} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium flex items-center gap-1">
                            <Plus className="w-3 h-3" />
                            {skill}
                          </span>
                        ))}
                        {changes?.skills.removed.map((skill, idx) => (
                          <span key={`removed-${idx}`} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs line-through flex items-center gap-1">
                            <Minus className="w-3 h-3" />
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Professional Summary Comparison */}
                  {changes && changes.summary.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Professional Summary</h4>
                      <div className="bg-gray-50 rounded-lg p-4 space-y-1">
                        {changes.summary.map((line, idx) => (
                          <div
                            key={idx}
                            className={`text-sm ${
                              line.isNew
                                ? 'font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded'
                                : line.isRemoved
                                ? 'line-through text-red-600 bg-red-50 px-2 py-1 rounded'
                                : 'text-gray-700'
                            }`}
                          >
                            {line.text || '\u00A0'}
                          </div>
                        ))}
                      </div>
                      {changes.summary.some(line => line.isNew) && (
                        <p className="text-xs text-gray-500 mt-2">
                          <span className="font-medium text-blue-600">New content</span> is highlighted in blue
                        </p>
                      )}
                    </div>
                  )}

                  {/* Current Information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="text-xs font-medium text-gray-500 mb-3">Previous Version (v{previousVersion.version})</h4>
                      <div className="space-y-2 text-sm">
                        {previousVersion.current_title && (
                          <div>
                            <span className="text-gray-500">Title:</span>
                            <p className="text-gray-900 font-medium">{previousVersion.current_title}</p>
                          </div>
                        )}
                        {previousVersion.current_company && (
                          <div>
                            <span className="text-gray-500">Company:</span>
                            <p className="text-gray-900">{previousVersion.current_company}</p>
                          </div>
                        )}
                        {previousVersion.location && (
                          <div>
                            <span className="text-gray-500">Location:</span>
                            <p className="text-gray-900">{previousVersion.location}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="text-xs font-medium text-blue-700 mb-3">Current Version (v{selectedVersion.version})</h4>
                      <div className="space-y-2 text-sm">
                        {selectedVersion.current_title && (
                          <div>
                            <span className="text-blue-600">Title:</span>
                            <p className="text-gray-900 font-medium">{selectedVersion.current_title}</p>
                          </div>
                        )}
                        {selectedVersion.current_company && (
                          <div>
                            <span className="text-blue-600">Company:</span>
                            <p className="text-gray-900">{selectedVersion.current_company}</p>
                          </div>
                        )}
                        {selectedVersion.location && (
                          <div>
                            <span className="text-blue-600">Location:</span>
                            <p className="text-gray-900">{selectedVersion.location}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {!hasChanges && (
                    <div className="p-4 bg-gray-100 border border-gray-200 rounded-lg text-center">
                      <p className="text-sm text-gray-600">
                        No significant changes detected between these versions
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 bg-gray-50 rounded-lg text-center">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">This is the first version - no comparison available</p>
                </div>
              )}
            </div>
          ) : versions.length > 0 ? (
            /* Version List View */
            <div className="space-y-3">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  onClick={() => selectionMode && onSelectVersion?.(version)}
                  className={`bg-white border rounded-lg p-4 transition-all ${
                    selectionMode
                      ? 'cursor-pointer hover:border-gray-400 hover:shadow-md'
                      : 'border-gray-200'
                  } ${index === 0 ? 'border-green-300 bg-green-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        index === 0
                          ? 'bg-green-500'
                          : 'bg-gray-600'
                      }`}>
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">
                            {version.file_name || `Version ${version.version}`}
                          </span>
                          {index === 0 && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                              Latest
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-600 mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatISTDate(version.created_at)}
                          </span>
                          <span>{formatFileSize(version)}</span>
                          {version.uploaded_by_name && (
                            <span>by {version.uploaded_by_name}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {selectionMode ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVersion?.(version);
                        }}
                        className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium"
                      >
                        Select
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        {index < versions.length - 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCompare(version, index);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            aria-label="Compare with previous version" title="Compare with previous version"
                          >
                            <GitBranch className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(version);
                          }}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          aria-label="Preview" title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(version);
                          }}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          aria-label="Download" title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Versions Found</h3>
              <p className="text-sm text-gray-500 text-center">
                No version history available for this resume.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {comparisonMode && selectedVersion
                ? `Viewing version ${selectedVersion.version} comparison`
                : `${versions.length} version${versions.length !== 1 ? 's' : ''}`}
            </p>
            <div className="flex items-center gap-2">
              {comparisonMode && (
                <button
                  onClick={handleBackToList}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                >
                  Back to List
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
