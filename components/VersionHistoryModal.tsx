'use client'

import { X, Download, Clock, User, FileText, History, Briefcase } from 'lucide-react';
import { ResumeVersion } from '@/lib/types/types';

interface VersionHistoryModalProps {
  candidateName?: string;
  versions?: ResumeVersion[];
  onClose: () => void;
  onApplyToJob?: (versionId: string) => void;
  // Job-specific props
  isOpen?: boolean;
  jobTitle?: string;
  versionHistory?: any[];
}

export default function VersionHistoryModal({
  candidateName,
  versions,
  onClose,
  onApplyToJob,
  isOpen,
  jobTitle,
  versionHistory
}: VersionHistoryModalProps) {
  // If isOpen is provided and false, don't render anything
  if (isOpen === false) {
    return null;
  }

  // Determine if this is for a job or a resume
  const isJobVersion = jobTitle !== undefined;
  const displayTitle = isJobVersion ? jobTitle : candidateName;
  const versionData = isJobVersion ? versionHistory : versions;

  const formatDate = (dateString: string) => {
    // Add Z suffix if not present to treat as UTC
    const utcDateString = dateString && !dateString.includes('Z') ? dateString + 'Z' : dateString;
    const date = new Date(utcDateString);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getRelativeTime = (dateString: string) => {
    // Add Z suffix if not present to treat as UTC
    const utcDateString = dateString && !dateString.includes('Z') ? dateString + 'Z' : dateString;
    const date = new Date(utcDateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  // Ensure versionData is an array before sorting
  const versionArray = Array.isArray(versionData) ? versionData : [];
  
  // Sort versions by upload date (newest first)
  const sortedVersions = [...versionArray].sort((a, b) => 
    new Date(b.uploadDate || b.date || b.timestamp).getTime() - new Date(a.uploadDate || a.date || a.timestamp).getTime()
  );

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <History className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl text-gray-900">Version History</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {displayTitle} • {sortedVersions.length} version{sortedVersions.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Version Timeline */}
        <div className="flex-1 overflow-y-auto p-6">
          {sortedVersions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No version history available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedVersions.map((version, index) => (
                <div 
                  key={version.id}
                  className="relative pl-8 pb-6 border-l-2 border-gray-200 last:border-l-0 last:pb-0"
                >
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 ${
                    index === 0 
                      ? 'bg-blue-600 border-blue-600' 
                      : 'bg-white border-gray-300'
                  }`} />

                  {/* Version Card */}
                  <div className={`bg-white rounded-lg border-2 transition-all hover:shadow-md ${
                    index === 0 
                      ? 'border-blue-200 bg-blue-50' 
                      : 'border-gray-200 hover:border-blue-200'
                  }`}>
                    <div className="p-4">
                      {/* Header Row */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`p-2 rounded-lg ${
                            index === 0 ? 'bg-blue-100' : 'bg-gray-100'
                          }`}>
                            <FileText className={`w-5 h-5 ${
                              index === 0 ? 'text-blue-600' : 'text-gray-600'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm text-gray-900 truncate">
                                {version.name}
                              </h3>
                              {index === 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-600 text-white flex-shrink-0">
                                  Latest
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-600">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {getRelativeTime(version.uploadDate || version.date || version.timestamp)}
                              </span>
                              <span>•</span>
                              <span>{version.size}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {onApplyToJob && (
                            <button
                              onClick={() => onApplyToJob(version.id)}
                              className={`p-2 rounded-md transition-colors flex-shrink-0 ${
                                index === 0
                                  ? 'text-blue-600 hover:bg-blue-100'
                                  : 'text-gray-600 hover:bg-gray-100'
                              }`}
                              title="Apply to Job"
                            >
                              <Briefcase className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            className={`p-2 rounded-md transition-colors flex-shrink-0 ${
                              index === 0
                                ? 'text-blue-600 hover:bg-blue-100'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                            title="Download this version"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Details Row */}
                      <div className="flex items-center gap-4 pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-gray-500" />
                          <span className="text-xs text-gray-600">
                            Uploaded by <span className="text-gray-900">{version.uploadedBy}</span>
                          </span>
                        </div>
                        <span className="text-gray-300">•</span>
                        <span className="text-xs text-gray-500">
                          {formatDate(version.uploadDate || version.date || version.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileText className="w-4 h-4" />
            <span>
              {isJobVersion 
                ? 'Version history tracks all job description updates' 
                : 'Version history tracks all resume updates for this candidate'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}