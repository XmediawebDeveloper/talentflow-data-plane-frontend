'use client'

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

    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Upload Progress</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl text-gray-900 mb-2">No Uploads In Progress</h3>
              <p className="text-sm text-gray-500 text-center max-w-md">
                All bulk uploads have been completed. Active uploads will appear here while processing.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((record) => {
                const processed = record.completed + record.errors;
                const percentage = Math.round((processed / record.totalFiles) * 100);

                return (
                  <div
                    key={record.id}
                    className="bg-white border border-gray-200 rounded-lg p-4"
                  >
                    {/* File info and progress */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{record.fileName}</p>
                        <p className="text-xs text-gray-500">{formatDate(record.date)}</p>
                      </div>
                      <span className="text-sm font-medium text-blue-600">
                        {processed}/{record.totalFiles} files
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 text-right">{percentage}% complete</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-white">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}