'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Clock, User, FileText, History, Loader2, ArrowLeft, Eye, Download } from 'lucide-react';
import { jdService, JDVersion, JDVersionHistoryResponse } from '@/lib/services/jdService';
import { formatIST } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface JDVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  jdId: string;
  jdTitle: string;
}

// Function to compute diff and return lines with diff info
function computeDiff(oldText: string, newText: string): { text: string; isNew: boolean }[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const oldSet = new Set(oldLines.map(line => line.trim()).filter(line => line.length > 0));

  return newLines.map(line => {
    const trimmedLine = line.trim();
    // If the line is empty or exists in old version, it's not new
    if (trimmedLine.length === 0 || oldSet.has(trimmedLine)) {
      return { text: line, isNew: false };
    }
    return { text: line, isNew: true };
  });
}


export default function JDVersionHistoryModal({
  isOpen,
  onClose,
  jdId,
  jdTitle,
}: JDVersionHistoryModalProps) {
  const [loading, setLoading] = useState(true);
  const [versionHistory, setVersionHistory] = useState<JDVersionHistoryResponse | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<JDVersion | null>(null);
  const [previousVersion, setPreviousVersion] = useState<JDVersion | null>(null);

  useEffect(() => {
    if (isOpen && jdId) {
      fetchVersionHistory();
    }
  }, [isOpen, jdId]);

  // Reset selected version when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedVersion(null);
      setPreviousVersion(null);
    }
  }, [isOpen]);

  const fetchVersionHistory = async () => {
    setLoading(true);
    try {
      const data = await jdService.getVersionHistory(jdId);
      console.log('Version history loaded:', data);
      setVersionHistory(data);
    } catch (error) {
      console.error('Failed to fetch version history:', error);
      toast.error('Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
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

  const handleVersionClick = (version: JDVersion, index: number) => {
    console.log('Version clicked:', version.version_number, version);
    setSelectedVersion(version);
    // Find the previous version for diff comparison
    if (versionHistory && index < versionHistory.versions.length - 1) {
      const prevVersion = versionHistory.versions[index + 1];
      console.log('Previous version for diff:', prevVersion?.version_number);
      setPreviousVersion(prevVersion);
    } else {
      setPreviousVersion(null);
    }
  };

  const handleBack = () => {
    setSelectedVersion(null);
    setPreviousVersion(null);
  };

  // Compute diff when viewing a version
  const diffLines = useMemo(() => {
    if (!selectedVersion) return null;
    if (!previousVersion) {
      // First version - no diff, just show all lines as normal
      return selectedVersion.description.split('\n').map(line => ({ text: line, isNew: false }));
    }
    return computeDiff(previousVersion.description, selectedVersion.description);
  }, [selectedVersion, previousVersion]);

  // Download JD as text file
  const handleDownload = () => {
    if (!selectedVersion) return;

    const content = `${selectedVersion.title}\n\n${selectedVersion.description}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedVersion.title.replace(/[^a-z0-9]/gi, '_')}_v${selectedVersion.version_number}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-4xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            {selectedVersion ? (
              <button
                onClick={handleBack}
                className="p-2 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
              </button>
            ) : (
              <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center">
                <History className="w-5 h-5 text-brand-blue" />
              </div>
            )}
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">
                {selectedVersion ? `Version ${selectedVersion.version_number}.0` : 'Version History'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
                {selectedVersion
                  ? `Published ${formatIST(selectedVersion.published_at)}`
                  : `${jdTitle} - ${versionHistory?.total || 0} version${(versionHistory?.total || 0) !== 1 ? 's' : ''}`
                }
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 dark:text-slate-500 hover:text-brand-blue rounded-lg hover:bg-brand-blue/5 transition-colors"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
              <span className="ml-3 text-gray-600 dark:text-slate-400">Loading version history...</span>
            </div>
          ) : selectedVersion ? (
            /* Version Detail View */
            <div>
              {/* Version Info Bar with Download Button */}
              <div className="flex items-center justify-between mb-6 p-4 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-xl">
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1.5 bg-brand-blue text-white rounded-lg text-sm font-semibold shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
                    v{selectedVersion.version_number}.0
                  </span>
                  <div className="text-sm text-gray-600 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {selectedVersion.published_by_name || 'Unknown'}
                    </span>
                  </div>
                  {previousVersion && (
                    <span className="text-xs bg-brand-blue/10 ring-1 ring-brand-blue/15 text-brand-blue px-2 py-0.5 rounded">
                      New content highlighted in blue
                    </span>
                  )}
                </div>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>

              {/* Job Title */}
              <h3 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-6">{selectedVersion.title}</h3>

              {/* Job Description with proper markdown rendering and blue highlighting */}
              <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
                {(() => {
                  const isV1 = selectedVersion.version_number === 1;
                  const currentDesc = selectedVersion.description || '';
                  const prevDesc = previousVersion?.description || '';

                  // For v1 or no previous version, render without highlighting
                  if (isV1 || !prevDesc) {
                    return (
                      <div className="prose prose-sm max-w-none text-gray-700 dark:text-slate-300 leading-relaxed markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{currentDesc}</ReactMarkdown>
                      </div>
                    );
                  }

                  // For v2+, use ReactMarkdown with custom components for diff highlighting
                  const stripMarkdown = (line: string): string => {
                    return line
                      .replace(/^#{1,6}\s+/, '')
                      .replace(/\*\*(.*?)\*\*/g, '$1')
                      .replace(/\*(.*?)\*/g, '$1')
                      .replace(/^[-*+]\s+/, '')
                      .replace(/^\d+\.\s+/, '')
                      .trim();
                  };

                  const prevLinesSet = new Set(
                    prevDesc.split('\n')
                      .map((l: string) => stripMarkdown(l))
                      .filter((l: string) => l.length > 0)
                  );

                  const getTextContent = (children: any): string => {
                    if (typeof children === 'string') return children;
                    if (typeof children === 'number') return String(children);
                    if (Array.isArray(children)) return children.map(getTextContent).join('');
                    if (children && typeof children === 'object' && children.props) {
                      return getTextContent(children.props.children);
                    }
                    return '';
                  };

                  const isNewContent = (children: any): boolean => {
                    const text = getTextContent(children).trim();
                    return text.length > 0 && !prevLinesSet.has(text);
                  };

                  const highlightClass = 'bg-brand-blue/10 ring-1 ring-brand-blue/15 text-brand-blue px-2 rounded';

                  const diffComponents = {
                    h1: ({ node, children, ...props }: any) => (
                      <h1 className={isNewContent(children) ? highlightClass : ''} {...props}>{children}</h1>
                    ),
                    h2: ({ node, children, ...props }: any) => (
                      <h2 className={isNewContent(children) ? highlightClass : ''} {...props}>{children}</h2>
                    ),
                    h3: ({ node, children, ...props }: any) => (
                      <h3 className={isNewContent(children) ? highlightClass : ''} {...props}>{children}</h3>
                    ),
                    p: ({ node, children, ...props }: any) => (
                      <p className={isNewContent(children) ? highlightClass : ''} {...props}>{children}</p>
                    ),
                    li: ({ node, children, ...props }: any) => (
                      <li className={isNewContent(children) ? highlightClass : ''} {...props}>{children}</li>
                    ),
                  };

                  return (
                    <div className="prose prose-sm max-w-none text-gray-700 dark:text-slate-300 leading-relaxed markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={diffComponents}>{currentDesc}</ReactMarkdown>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : !versionHistory || versionHistory.versions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-slate-500 text-lg">No version history available</p>
              <p className="text-gray-400 dark:text-slate-500 text-sm mt-2">
                Versions are created when you publish the job description
              </p>
            </div>
          ) : (
            /* Version List View */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {versionHistory.versions.map((version, index) => {
                const isLatest = index === 0;

                return (
                  <button
                    key={version.id}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleVersionClick(version, index);
                    }}
                    className={`bg-white dark:bg-slate-900 rounded-xl border ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 cursor-pointer transition-all hover:shadow-md text-left w-full ${
                      isLatest
                        ? 'border-brand-blue/20 bg-brand-blue/5 hover:border-brand-blue/30'
                        : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-blue/30'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                          isLatest
                            ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300'
                        }`}>
                          v{version.version_number}.0
                        </span>
                        {isLatest && (
                          <span className="px-2 py-0.5 bg-brand-cyan/10 ring-1 ring-brand-cyan/20 text-brand-cyan rounded-full text-xs font-medium">
                            Current
                          </span>
                        )}
                      </div>
                      <Eye className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                    </div>

                    <h3 className="font-medium text-gray-900 dark:text-slate-50 mb-2 line-clamp-1">{version.title}</h3>

                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {getRelativeTime(version.published_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {version.published_by_name || 'Unknown'}
                      </span>
                    </div>

                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                      {formatIST(version.published_at)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950">
          <button
            onClick={selectedVersion ? handleBack : onClose}
            className="px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
          >
            {selectedVersion ? 'Back to List' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
