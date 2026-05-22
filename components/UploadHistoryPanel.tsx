'use client'

import { Clock, CheckCircle, RefreshCw, Copy, AlertCircle, ChevronRight, FileText, X, Calendar, Download, GitBranch } from 'lucide-react';
import { useState } from 'react';
import UploadStatusDashboard from './UploadStatusDashboard';
import { formatIST, parseIST } from '@/lib/utils/dateUtils';

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
    const date = parseIST(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;

    return formatIST(dateString);
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 sm:py-6 border-b border-gray-200 bg-gradient-to-r from-brand-blue/5 to-white">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl lg:text-2xl text-gray-900 mb-0.5 sm:mb-1">Upload History</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              View all past bulk upload reports for {currentSource === 'my-resumes' ? 'My Resumes' : 'Internal Database'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
           aria-label="Close">
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
          {filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-10 sm:py-16">
              <div className="w-14 h-14 sm:w-20 sm:h-20 bg-brand-blue/10 rounded-full flex items-center justify-center mb-3 sm:mb-4">
                <FileText className="w-7 h-7 sm:w-10 sm:h-10 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-xl text-gray-900 mb-1.5 sm:mb-2">No Upload History</h3>
              <p className="text-xs sm:text-sm text-gray-500 text-center max-w-md px-4">
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
                    className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 hover:border-brand-blue/30 hover:shadow-lg transition-all cursor-pointer"
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-5 gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm sm:text-base text-gray-900 mb-0.5 sm:mb-1 truncate">{record.fileName}</h3>
                            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-500">
                              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span className="truncate">{formatDate(record.date)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:gap-4 ml-10 sm:ml-0">
                        {hasIssues && (
                          <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 bg-brand-blue/10 text-brand-blue text-[10px] sm:text-xs rounded-full border border-brand-blue/20">
                            <AlertCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                            Needs Review
                          </span>
                        )}
                        <div className="text-right">
                          <div className={`text-xl sm:text-3xl mb-0.5 sm:mb-1 ${
                            successRate === 100 ? 'text-green-600' :
                            successRate >= 70 ? 'text-brand-blue' :
                            'text-red-600'
                          }`}>
                            {successRate}%
                          </div>
                          <div className="text-[10px] sm:text-xs text-gray-500">Success Rate</div>
                        </div>
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                      </div>
                    </div>

                    {/* Stats Grid - 6 Status Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                      {/* Completed */}
                      <div className="bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 rounded-lg p-2.5 sm:p-3 lg:p-4">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                          </div>
                          <span className="text-[10px] sm:text-xs text-gray-700 truncate">Completed</span>
                        </div>
                        <div className="text-lg sm:text-xl lg:text-2xl text-green-700">{record.completed}</div>
                      </div>

                      {/* Pending */}
                      <div className="bg-gradient-to-br from-brand-blue/5 to-brand-blue/10 border border-brand-blue/20 rounded-lg p-2.5 sm:p-3 lg:p-4">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-brand-blue rounded-lg flex items-center justify-center flex-shrink-0">
                            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                          </div>
                          <span className="text-[10px] sm:text-xs text-gray-700 truncate">Pending</span>
                        </div>
                        <div className="text-lg sm:text-xl lg:text-2xl text-brand-blue">{record.pending}</div>
                      </div>

                      {/* Error */}
                      <div className="bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 rounded-lg p-2.5 sm:p-3 lg:p-4">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                          </div>
                          <span className="text-[10px] sm:text-xs text-gray-700 truncate">Error</span>
                        </div>
                        <div className="text-lg sm:text-xl lg:text-2xl text-red-700">{record.errors}</div>
                      </div>

                      {/* Duplicate */}
                      <div className="bg-gradient-to-br from-brand-cyan/5 to-brand-cyan/10 border border-brand-cyan/20 rounded-lg p-2.5 sm:p-3 lg:p-4">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-brand-cyan rounded-lg flex items-center justify-center flex-shrink-0">
                            <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                          </div>
                          <span className="text-[10px] sm:text-xs text-gray-700 truncate">Duplicate</span>
                        </div>
                        <div className="text-lg sm:text-xl lg:text-2xl text-brand-cyan">{record.duplicated}</div>
                      </div>

                      {/* Versioned */}
                      <div className="bg-gradient-to-br from-brand-blue-2/5 to-brand-blue-2/10 border border-brand-blue-2/20 rounded-lg p-2.5 sm:p-3 lg:p-4">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-brand-blue-2 rounded-lg flex items-center justify-center flex-shrink-0">
                            <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                          </div>
                          <span className="text-[10px] sm:text-xs text-gray-700 truncate">Versioned</span>
                        </div>
                        <div className="text-lg sm:text-xl lg:text-2xl text-brand-blue-2">{record.versioned}</div>
                      </div>

                      {/* Total Files */}
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-300 rounded-lg p-2.5 sm:p-3 lg:p-4">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                          </div>
                          <span className="text-[10px] sm:text-xs text-gray-700 truncate">Total Files</span>
                        </div>
                        <div className="text-lg sm:text-xl lg:text-2xl text-gray-700">{record.totalFiles}</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3 sm:mt-5">
                      <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-600 mb-1.5 sm:mb-2">
                        <span>Upload Progress</span>
                        <span>{record.completed} of {record.totalFiles} processed</span>
                      </div>
                      <div className="h-1.5 sm:h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            successRate === 100 ? 'bg-green-500' :
                            successRate >= 70 ? 'bg-brand-blue' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${successRate}%` }}
                        />
                      </div>
                    </div>

                    {/* Click to view hint */}
                    <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
                      <p className="text-[10px] sm:text-xs text-gray-500 text-center">
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
        <div className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5 bg-white">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-0">
            <p className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
              Showing <span className="text-gray-900">{filteredRecords.length}</span> upload record{filteredRecords.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={onClose}
              className="px-4 sm:px-6 py-2 sm:py-2.5 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 transition-colors shadow-sm text-sm sm:text-base"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
