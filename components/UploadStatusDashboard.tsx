import { CheckCircle, RefreshCw, Copy, AlertCircle, X, Download, Eye, ArrowLeft, FileText, GitBranch, Clock } from 'lucide-react';
import { useState } from 'react';
import DuplicateResolutionModal from './DuplicateResolutionModal';

interface UploadStatus {
  fileName: string;
  status: 'completed' | 'updated' | 'duplicated' | 'version' | 'error' | 'pending';
  candidateName?: string;
  errorMessage?: string;
  existingLocation?: string;
  versionInfo?: string;
}

interface UploadStatusDashboardProps {
  statuses: UploadStatus[];
  fileName: string;
  uploadDate: string;
  onClose: () => void;
  onBack: () => void;
}

export default function UploadStatusDashboard({ statuses, fileName, uploadDate, onClose, onBack }: UploadStatusDashboardProps) {
  const [selectedCompleted, setSelectedCompleted] = useState<string[]>([]);
  const [selectedDuplicated, setSelectedDuplicated] = useState<string[]>([]);
  const [selectedVersioned, setSelectedVersioned] = useState<string[]>([]);
  const [selectedErrors, setSelectedErrors] = useState<string[]>([]);
  const [selectedPending, setSelectedPending] = useState<string[]>([]);
  const [showResolutionModal, setShowResolutionModal] = useState(false);

  const completed = statuses.filter(s => s.status === 'completed');
  const updated = statuses.filter(s => s.status === 'updated');
  const duplicated = statuses.filter(s => s.status === 'duplicated');
  const versioned = statuses.filter(s => s.status === 'version');
  const errors = statuses.filter(s => s.status === 'error');
  const pending = statuses.filter(s => s.status === 'pending');

  const totalProcessed = statuses.length;
  const successRate = Math.round(((completed.length + updated.length) / totalProcessed) * 100);

  const handleCompletedSelect = (fileName: string) => {
    setSelectedCompleted(prev => 
      prev.includes(fileName) 
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handleDuplicatedSelect = (fileName: string) => {
    setSelectedDuplicated(prev => 
      prev.includes(fileName) 
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handleVersionedSelect = (fileName: string) => {
    setSelectedVersioned(prev => 
      prev.includes(fileName) 
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handleErrorSelect = (fileName: string) => {
    setSelectedErrors(prev => 
      prev.includes(fileName) 
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handlePendingSelect = (fileName: string) => {
    setSelectedPending(prev => 
      prev.includes(fileName) 
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handleResolveVersioned = () => {
    setShowResolutionModal(true);
  };

  const handleResolveDuplicated = () => {
    setShowResolutionModal(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'updated':
        return <RefreshCw className="w-5 h-5 text-gray-800" />;
      case 'duplicated':
        return <Copy className="w-5 h-5 text-yellow-600" />;
      case 'version':
        return <GitBranch className="w-5 h-5 text-gray-800" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-600" />;
      default:
        return null;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-gradient-to-br from-green-50 to-green-100/50 border-green-200';
      case 'updated':
        return 'bg-gradient-to-br from-gray-50 to-gray-100/50 border-gray-200';
      case 'duplicated':
        return 'bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-yellow-200';
      case 'version':
        return 'bg-gradient-to-br from-gray-50 to-gray-100/50 border-gray-200';
      case 'error':
        return 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-200';
      case 'pending':
        return 'bg-gradient-to-br from-gray-50 to-gray-100/50 border-gray-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Successfully uploaded';
      case 'updated':
        return 'Updated existing';
      case 'duplicated':
        return 'Duplicate detected';
      case 'version':
        return 'Version detected';
      case 'error':
        return 'Upload failed';
      case 'pending':
        return 'Pending';
      default:
        return status;
    }
  };

  const exportReport = () => {
    const report = statuses.map(s => ({
      fileName: s.fileName,
      status: s.status,
      candidateName: s.candidateName || 'N/A',
      errorMessage: s.errorMessage || 'N/A',
    }));
    
    const csvContent = [
      ['File Name', 'Status', 'Candidate Name', 'Error Message'].join(','),
      ...report.map(r => [r.fileName, r.status, r.candidateName, r.errorMessage].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upload-report-${new Date().toISOString()}.csv`;
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 hover:bg-white rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h2 className="text-2xl text-gray-900 mb-1">Upload Details</h2>
                <p className="text-sm text-gray-600">
                  {fileName} • {formatDate(uploadDate)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-6 gap-3">
            <div className="bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm text-gray-700">Completed</span>
              </div>
              <div className="text-3xl text-green-700">{completed.length}</div>
            </div>

            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
                  <Copy className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm text-gray-700">Duplicates</span>
              </div>
              <div className="text-3xl text-yellow-700">{duplicated.length}</div>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center">
                  <GitBranch className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm text-gray-700">Versioned</span>
              </div>
              <div className="text-3xl text-gray-900">{versioned.length}</div>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm text-gray-700">Errors</span>
              </div>
              <div className="text-3xl text-red-700">{errors.length}</div>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-300 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-gray-500 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm text-gray-700">Pending</span>
              </div>
              <div className="text-3xl text-gray-700">{pending.length}</div>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm text-gray-700">Success Rate</span>
              </div>
              <div className="text-3xl text-gray-900">{successRate}%</div>
            </div>
          </div>
        </div>

        {/* Detailed Status List */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg text-gray-900">File-by-File Status</h3>
            <button
              onClick={exportReport}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-white transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>

          <div className="space-y-6">
            {/* Completed Section */}
            {completed.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-green-500 rounded-md flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-green-700">
                    Successfully Uploaded ({completed.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {completed.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedCompleted.includes(item.fileName) ? 'ring-2 ring-green-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedCompleted.includes(item.fileName)}
                          onChange={() => handleCompletedSelect(item.fileName)}
                          className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-pointer"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="text-xs text-gray-600 mt-0.5">{item.candidateName}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-700 px-3 py-1 bg-green-100 rounded-full">
                          {getStatusText(item.status)}
                        </span>
                        <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicated Section */}
            {duplicated.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-yellow-500 rounded-md flex items-center justify-center">
                      <Copy className="w-4 h-4 text-white" />
                    </div>
                    <h4 className="text-yellow-700">
                      Duplicate Resumes Detected ({duplicated.length})
                    </h4>
                  </div>
                  {selectedDuplicated.length > 0 && (
                    <button
                      onClick={handleResolveDuplicated}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors shadow-sm text-sm"
                    >
                      Resolve Selected ({selectedDuplicated.length})
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {duplicated.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedDuplicated.includes(item.fileName) ? 'ring-2 ring-yellow-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedDuplicated.includes(item.fileName)}
                          onChange={() => handleDuplicatedSelect(item.fileName)}
                          className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500 cursor-pointer"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="text-xs text-gray-600 mt-0.5">{item.candidateName}</div>
                          )}
                          {item.existingLocation && (
                            <div className="text-xs text-yellow-700 mt-1">
                              📁 Existing location: {item.existingLocation}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-yellow-700 px-3 py-1 bg-yellow-100 rounded-full">
                          {getStatusText(item.status)}
                        </span>
                        <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Versioned Section */}
            {versioned.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-gray-700 rounded-md flex items-center justify-center">
                      <GitBranch className="w-4 h-4 text-white" />
                    </div>
                    <h4 className="text-gray-900">
                      Version Detected ({versioned.length})
                    </h4>
                  </div>
                  {selectedVersioned.length > 0 && (
                    <button
                      onClick={handleResolveVersioned}
                      className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-sm text-sm"
                    >
                      Resolve Selected ({selectedVersioned.length})
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {versioned.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedVersioned.includes(item.fileName) ? 'ring-2 ring-gray-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedVersioned.includes(item.fileName)}
                          onChange={() => handleVersionedSelect(item.fileName)}
                          className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-500 cursor-pointer"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="text-xs text-gray-600 mt-0.5">{item.candidateName}</div>
                          )}
                          {item.existingLocation && (
                            <div className="text-xs text-gray-900 mt-1">
                              📁 Existing location: {item.existingLocation}
                            </div>
                          )}
                          {item.versionInfo && (
                            <div className="text-xs text-gray-900 mt-1">
                              🔄 {item.versionInfo}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-900 px-3 py-1 bg-gray-100 rounded-full">
                          {getStatusText(item.status)}
                        </span>
                        <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors Section */}
            {errors.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-red-500 rounded-md flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-red-700">
                    Upload Errors ({errors.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {errors.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedErrors.includes(item.fileName) ? 'ring-2 ring-red-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedErrors.includes(item.fileName)}
                          onChange={() => handleErrorSelect(item.fileName)}
                          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 cursor-pointer"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 truncate">{item.fileName}</div>
                          {item.errorMessage && (
                            <div className="text-xs text-red-600 mt-1">⚠️ {item.errorMessage}</div>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-red-700 px-3 py-1 bg-red-100 rounded-full">
                        {getStatusText(item.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Section */}
            {pending.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-gray-500 rounded-md flex items-center justify-center">
                    <Clock className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-gray-700">
                    Pending Uploads ({pending.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {pending.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-4 border rounded-lg ${getStatusBg(item.status)} hover:shadow-md transition-shadow ${
                        selectedPending.includes(item.fileName) ? 'ring-2 ring-gray-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedPending.includes(item.fileName)}
                          onChange={() => handlePendingSelect(item.fileName)}
                          className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-500 cursor-pointer"
                        />
                        {getStatusIcon(item.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 truncate">{item.fileName}</div>
                          {item.candidateName && (
                            <div className="text-xs text-gray-600 mt-0.5">{item.candidateName}</div>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-gray-700 px-3 py-1 bg-gray-100 rounded-full">
                        {getStatusText(item.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-8 py-5 bg-white">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Showing detailed status for <span className="text-gray-900">{totalProcessed}</span> file{totalProcessed !== 1 ? 's' : ''}
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      {showResolutionModal && (
        <DuplicateResolutionModal
          duplicateFiles={[
            ...versioned
              .filter(v => selectedVersioned.includes(v.fileName))
              .map(v => ({
                fileName: v.fileName,
                candidateName: v.candidateName || 'Unknown Candidate',
                newResumeSize: '245 KB',
                newResumeDate: new Date().toLocaleDateString(),
                existingLocation: v.existingLocation || 'Unknown Location',
                existingResumeDate: '2024-11-15',
                existingResumeSize: '220 KB',
                contentChanges: [
                  'Skills section updated (added 3 new skills)',
                  'Work experience added: Senior Developer at TechCorp',
                  'Education details updated'
                ]
              })),
            ...duplicated
              .filter(d => selectedDuplicated.includes(d.fileName))
              .map(d => ({
                fileName: d.fileName,
                candidateName: d.candidateName || 'Unknown Candidate',
                newResumeSize: '230 KB',
                newResumeDate: new Date().toLocaleDateString(),
                existingLocation: d.existingLocation || 'Unknown Location',
                existingResumeDate: '2024-10-20',
                existingResumeSize: '230 KB',
                contentChanges: [
                  'Identical content detected',
                  'Same file size and structure'
                ]
              }))
          ]}
          onClose={() => {
            setShowResolutionModal(false);
            setSelectedVersioned([]);
            setSelectedDuplicated([]);
          }}
          onResolve={(resolutions) => {
            console.log('Resolution Actions:', resolutions);
            // Handle the resolution actions here
            setShowResolutionModal(false);
            setSelectedVersioned([]);
            setSelectedDuplicated([]);
            const totalResolved = resolutions.length;
            alert(`Resolved ${totalResolved} resume(s):\n${resolutions.map(r => `${r.fileName}: ${r.action}`).join('\n')}`);
          }}
        />
      )}
    </div>
  );
}