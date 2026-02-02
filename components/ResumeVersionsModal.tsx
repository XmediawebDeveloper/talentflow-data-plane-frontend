import { X, FileText, Download, Calendar, GitBranch, Eye, Clock, Loader2 } from 'lucide-react';
import { resumeService } from '@/lib/services/resumeService';

interface ResumeVersion {
  id: string;
  version: number;
  file_name?: string;
  file_size?: number;
  file_size_kb?: number;
  created_at: string;
  uploaded_by_name?: string;
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

export default function ResumeVersionsModal({
  candidate,
  versions = [],
  loading = false,
  onClose,
  onSelectVersion,
  selectionMode = false,
}: ResumeVersionsModalProps) {

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
      // Use version.id directly as the resume ID for that version
      const blob = await resumeService.download(version.id);
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
      alert('Failed to download resume');
    }
  };

  const handlePreview = (version: ResumeVersion) => {
    // Use version.id directly as the resume ID for that version
    window.open(`/recruitment/resume-view/${version.id}`, '_blank');
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col border border-gray-200" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {selectionMode ? 'Select Resume Version' : 'Resume Versions'}
            </h2>
            <p className="text-sm text-gray-600">{candidate.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
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
          ) : versions.length > 0 ? (
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
                            {new Date(version.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(version);
                          }}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(version);
                          }}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Download"
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
              {versions.length} version{versions.length !== 1 ? 's' : ''}
            </p>
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
  );
}
