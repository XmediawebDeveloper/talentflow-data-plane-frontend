import { Clock, CheckCircle, RefreshCw, Copy, AlertCircle, ChevronRight, FileText, X, Calendar, Download, GitBranch } from 'lucide-react';
import { useState } from 'react';
import UploadStatusDashboard from './UploadStatusDashboard';

interface UploadRecord {
  id: string;
  date: string;
  fileName: string;
  totalFiles: number;
  completed: number;
  pending: number;
  duplicated: number;
  versioned: number;
  errors: number;
  source: 'my-resumes' | 'internal-db';
  statuses: any[];
}

interface UploadHistoryPanelProps {
  records: UploadRecord[];
  onClose: () => void;
  currentSource: 'my-resumes' | 'internal-db';
}

export default function UploadHistoryPanel({ records, onClose, currentSource }: UploadHistoryPanelProps) {
  const [selectedRecord, setSelectedRecord] = useState<UploadRecord | null>(null);

  const filteredRecords = records.filter(r => r.source === currentSource);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getSuccessRate = (record: UploadRecord) => {
    return Math.round((record.completed / record.totalFiles) * 100);
  };

  // If a record is selected, show the detailed status dashboard
  if (selectedRecord) {
    return (
      <UploadStatusDashboard
        statuses={selectedRecord.statuses}
        fileName={selectedRecord.fileName}
        uploadDate={selectedRecord.date}
        onClose={onClose}
        onBack={() => setSelectedRecord(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div>
            <h2 className="text-2xl text-gray-900 mb-1">Upload History</h2>
            <p className="text-sm text-gray-600">
              View all past bulk upload reports for {currentSource === 'my-resumes' ? 'My Resumes' : 'Internal Database'}
            </p>
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
          {filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-10 h-10 text-gray-800" />
              </div>
              <h3 className="text-xl text-gray-900 mb-2">No Upload History</h3>
              <p className="text-sm text-gray-500 text-center max-w-md">
                Bulk upload reports will appear here. Upload multiple resumes to see detailed status reports.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecords.map((record) => {
                const successRate = getSuccessRate(record);
                const hasIssues = record.duplicated > 0 || record.versioned > 0 || record.errors > 0;

                return (
                  <div
                    key={record.id}
                    onClick={() => setSelectedRecord(record)}
                    className="bg-white border border-gray-200 rounded-xl p-6 hover:border-gray-300 hover:shadow-lg transition-all cursor-pointer"
                  >
                    {/* Header Row */}
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-gray-800" />
                          </div>
                          <div>
                            <h3 className="text-gray-900 mb-1">{record.fileName}</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Calendar className="w-4 h-4" />
                              {formatDate(record.date)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {hasIssues && (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-100 text-yellow-700 text-xs rounded-full border border-yellow-200">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Needs Review
                          </span>
                        )}
                        <div className="text-right">
                          <div className={`text-3xl mb-1 ${
                            successRate === 100 ? 'text-green-600' :
                            successRate >= 90 ? 'text-gray-800' :
                            successRate >= 70 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {successRate}%
                          </div>
                          <div className="text-xs text-gray-500">Success Rate</div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>

                    {/* Stats Grid - 6 Status Cards */}
                    <div className="grid grid-cols-6 gap-3">
                      {/* Completed */}
                      <div className="bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-xs text-gray-700">Completed</span>
                        </div>
                        <div className="text-2xl text-green-700">{record.completed}</div>
                      </div>

                      {/* Pending */}
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center">
                            <RefreshCw className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-xs text-gray-700">Pending</span>
                        </div>
                        <div className="text-2xl text-gray-900">{record.pending}</div>
                      </div>

                      {/* Error */}
                      <div className="bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
                            <AlertCircle className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-xs text-gray-700">Error</span>
                        </div>
                        <div className="text-2xl text-red-700">{record.errors}</div>
                      </div>

                      {/* Duplicate */}
                      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border border-yellow-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
                            <Copy className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-xs text-gray-700">Duplicate</span>
                        </div>
                        <div className="text-2xl text-yellow-700">{record.duplicated}</div>
                      </div>

                      {/* Versioned */}
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center">
                            <GitBranch className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-xs text-gray-700">Versioned</span>
                        </div>
                        <div className="text-2xl text-gray-900">{record.versioned}</div>
                      </div>

                      {/* Total Files */}
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-300 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center">
                            <FileText className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-xs text-gray-700">Total Files</span>
                        </div>
                        <div className="text-2xl text-gray-700">{record.totalFiles}</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-5">
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                        <span>Upload Progress</span>
                        <span>{record.completed} of {record.totalFiles} processed</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            successRate === 100 ? 'bg-green-500' :
                            successRate >= 90 ? 'bg-gray-700' :
                            successRate >= 70 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${successRate}%` }}
                        />
                      </div>
                    </div>

                    {/* Click to view hint */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs text-gray-500 text-center">
                        Click to view detailed file-by-file status
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-8 py-5 bg-white">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Showing <span className="text-gray-900">{filteredRecords.length}</span> upload record{filteredRecords.length !== 1 ? 's' : ''}
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
    </div>
  );
}