import { X, FileText, Download, Calendar, GitBranch, Eye, Clock } from 'lucide-react';

interface ResumeVersion {
  id: string;
  name: string;
  uploadDate: string;
  size: string;
}

interface MatchedCandidate {
  id: string;
  name: string;
  versions?: ResumeVersion[];
}

interface ResumeVersionsModalProps {
  candidate: MatchedCandidate;
  onClose: () => void;
}

export default function ResumeVersionsModal({
  candidate,
  onClose,
}: ResumeVersionsModalProps) {
  const versions = candidate.versions || [];
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 via-blue-50 to-white">
          <div>
            <h2 className="text-2xl text-gray-900 mb-1">Resume Version History</h2>
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
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
          {versions.length > 0 ? (
            <div className="space-y-4">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-purple-400 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start gap-6">
                    {/* Version Icon & Number */}
                    <div className="flex flex-col items-center gap-2">
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${
                        index === 0 
                          ? 'bg-gradient-to-br from-green-500 to-emerald-600' 
                          : 'bg-gradient-to-br from-gray-700 to-gray-800'
                      }`}>
                        {index === 0 ? (
                          <FileText className="w-7 h-7 text-white" />
                        ) : (
                          <GitBranch className="w-7 h-7 text-white" />
                        )}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                        index === 0
                          ? 'bg-green-100 text-green-700 border-green-200'
                          : 'bg-gray-100 text-gray-900 border-gray-200'
                      }`}>
                        v{versions.length - index}
                      </span>
                    </div>

                    {/* Version Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-gray-900 font-medium truncate">
                              {version.name}
                            </h3>
                            {index === 0 && (
                              <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium border border-green-200 flex-shrink-0">
                                Latest Version
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-700">Uploaded:</span>
                              <span className="font-medium">
                                {new Date(version.uploadDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            </span>
                            <span className="text-gray-400">•</span>
                            <span className="flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">{version.size}</span>
                            </span>
                            <span className="text-gray-400">•</span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-gray-500" />
                              {new Date(version.uploadDate).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            alert(`Previewing: ${version.name}`);
                          }}
                          className="px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium flex items-center gap-2 border border-gray-200"
                        >
                          <Eye className="w-4 h-4" />
                          Preview
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            alert(`Downloading: ${version.name}`);
                          }}
                          className="px-4 py-2 bg-gray-50 text-gray-900 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium flex items-center gap-2 border border-gray-200"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-xl text-gray-900 mb-2">No Resume Versions Available</h3>
              <p className="text-sm text-gray-500 text-center max-w-md">
                No version history found for this resume.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-8 py-5 bg-white">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Showing <span className="text-gray-900 font-medium">{versions.length}</span> version{versions.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}