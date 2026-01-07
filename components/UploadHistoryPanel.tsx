'use client'

import { Clock, CheckCircle, RefreshCw, AlertCircle, X, FileText } from 'lucide-react';
import { useState } from 'react';

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
  status?: string;
  source: 'my-resumes' | 'internal-db';
  statuses: any[];
}

interface UploadHistoryPanelProps {
  records: UploadRecord[];
  onClose: () => void;
  currentSource: 'my-resumes' | 'internal-db';
}

export default function UploadHistoryPanel({ records, onClose, currentSource }: UploadHistoryPanelProps) {
  const [activeTab, setActiveTab] = useState<'processing' | 'completed'>('processing');

  const filteredRecords = records.filter(r => r.source === currentSource);

  // Separate processing and completed records
  const processingRecords = filteredRecords.filter(r => r.status === 'processing' || r.pending > 0);
  const completedRecords = filteredRecords.filter(r => r.status === 'completed' && r.pending === 0);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const renderRecordCard = (record: UploadRecord, isProcessing: boolean) => {
    const processed = record.completed + record.errors + record.duplicated + record.versioned;
    const percentage = Math.round((processed / record.totalFiles) * 100);

    return (
      <div key={record.id} className="bg-white border border-gray-200 rounded-lg p-4">
        {/* File info and progress */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-8 h-8 ${isProcessing ? 'bg-blue-100' : 'bg-green-100'} rounded-lg flex items-center justify-center`}>
            {isProcessing ? (
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{record.fileName}</p>
            <p className="text-xs text-gray-500">{formatDate(record.date)}</p>
          </div>
          <span className={`text-sm font-medium ${isProcessing ? 'text-blue-600' : 'text-green-600'}`}>
            {processed}/{record.totalFiles}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full transition-all duration-300 ${isProcessing ? 'bg-blue-500' : 'bg-green-500'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Status Summary */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {record.completed > 0 && (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> {record.completed} uploaded
            </span>
          )}
          {record.versioned > 0 && (
            <span className="text-purple-600 flex items-center gap-1">
              <FileText className="w-3 h-3" /> {record.versioned} versioned
            </span>
          )}
          {record.duplicated > 0 && (
            <span className="text-yellow-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {record.duplicated} duplicate
            </span>
          )}
          {record.errors > 0 && (
            <span className="text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {record.errors} failed
            </span>
          )}
          {isProcessing && record.pending > 0 && (
            <span className="text-blue-600 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {record.pending} pending
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderEmptyState = (isProcessing: boolean) => (
    <div className="flex flex-col items-center justify-center py-12">
      <div className={`w-16 h-16 ${isProcessing ? 'bg-blue-100' : 'bg-green-100'} rounded-full flex items-center justify-center mb-4`}>
        {isProcessing ? (
          <Clock className="w-8 h-8 text-blue-600" />
        ) : (
          <CheckCircle className="w-8 h-8 text-green-600" />
        )}
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">
        {isProcessing ? 'No Uploads In Progress' : 'No Completed Uploads'}
      </h3>
      <p className="text-sm text-gray-500 text-center max-w-xs">
        {isProcessing
          ? 'Active uploads will appear here while processing.'
          : 'Completed bulk uploads will appear here.'}
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Upload History</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setActiveTab('processing')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'processing'
                ? 'text-blue-600 bg-white border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className={`w-4 h-4 ${activeTab === 'processing' && processingRecords.length > 0 ? 'animate-spin' : ''}`} />
              Processing
              {processingRecords.length > 0 && (
                <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                  {processingRecords.length}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'completed'
                ? 'text-green-600 bg-white border-b-2 border-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Completed
              {completedRecords.length > 0 && (
                <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                  {completedRecords.length}
                </span>
              )}
            </span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {activeTab === 'processing' ? (
            processingRecords.length === 0 ? (
              renderEmptyState(true)
            ) : (
              <div className="space-y-3">
                {processingRecords.map((record) => renderRecordCard(record, true))}
              </div>
            )
          ) : (
            completedRecords.length === 0 ? (
              renderEmptyState(false)
            ) : (
              <div className="space-y-3">
                {completedRecords.map((record) => renderRecordCard(record, false))}
              </div>
            )
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
