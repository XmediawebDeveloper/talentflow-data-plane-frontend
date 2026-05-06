'use client'

import { formatIST } from '@/lib/utils/dateUtils';
import { X, Download, Clock, User, FileText, History, Briefcase } from 'lucide-react';
import { ResumeVersion } from '@/lib/types/types';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';

interface VersionHistoryModalProps {
  candidateName?: string;
  versions?: ResumeVersion[];
  onClose: () => void;
  onApplyToJob?: (versionId: string) => void;
  onDownload?: (versionId: string) => void;
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
  onDownload,
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
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-3xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center">
              <History className="w-5 h-5 text-brand-blue" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Version History</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {displayTitle} • {sortedVersions.length} version{sortedVersions.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-brand-blue rounded-md hover:bg-brand-blue/5 transition-colors"
           aria-label="Close">
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
                      ? 'bg-brand-blue border-brand-blue'
                      : 'bg-white border-gray-300'
                  }`} />

                  {/* Version Card */}
                  <div className={`bg-white rounded-xl border ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 transition-all hover:shadow-md ${
                    index === 0
                      ? 'border-brand-blue/20 bg-brand-blue/5'
                      : 'border-gray-100 hover:border-brand-blue/30'
                  }`}>
                    <div className="p-4">
                      {/* Header Row */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`p-2 rounded-lg ring-1 ${
                            index === 0 ? 'bg-brand-blue/10 ring-brand-blue/15' : 'bg-gray-100 ring-gray-200/50'
                          }`}>
                            <FileText className={`w-5 h-5 ${
                              index === 0 ? 'text-brand-blue' : 'text-gray-600'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm text-gray-900 truncate">
                                {version.name}
                              </h3>
                              {index === 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-brand-blue text-white flex-shrink-0">
                                  Latest
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-600">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatIST(version.uploadDate || version.date || version.timestamp)}
                              </span>
                              {version.size && (
                                <>
                                  <span>•</span>
                                  <span>{version.size}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {onApplyToJob && (
                            <button
                              onClick={() => onApplyToJob(version.id)}
                              className={`p-2 rounded-md transition-colors flex-shrink-0 ${
                                index === 0
                                  ? 'text-brand-blue hover:bg-brand-blue/10'
                                  : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                              }`}
                              aria-label="Apply to Job" title="Apply to Job"
                            >
                              <Briefcase className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (onDownload) {
                                onDownload(version.id);
                              } else {
                                // Fallback: download directly
                                try {
                                  toast.loading('Downloading...', { id: 'version-download' });
                                  const blob = await resumeService.download(version.id);
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = version.name || 'resume';
                                  document.body.appendChild(a);
                                  a.click();
                                  window.URL.revokeObjectURL(url);
                                  document.body.removeChild(a);
                                  toast.success('Downloaded', { id: 'version-download' });
                                } catch (error) {
                                  toast.error('Download failed', { id: 'version-download' });
                                }
                              }
                            }}
                            className={`p-2 rounded-md transition-colors flex-shrink-0 ${
                              index === 0
                                ? 'text-brand-blue hover:bg-brand-blue/10'
                                : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                            }`}
                            title="Download this version"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Details Row */}
                      <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-gray-500" />
                          <span className="text-xs text-gray-600">
                            Uploaded by <span className="text-gray-900">{version.uploadedBy}</span>
                          </span>
                        </div>
                        <span className="text-gray-300">•</span>
                        <span className="text-xs text-gray-500">
                          {formatIST(version.uploadDate || version.date || version.timestamp)}
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
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-t border-gray-100 bg-slate-50">
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
            className="px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}