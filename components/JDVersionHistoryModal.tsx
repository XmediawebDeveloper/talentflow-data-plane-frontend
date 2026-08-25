'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Clock, User, FileText, History, Loader2, ArrowLeft, Eye, Download, Calendar } from 'lucide-react';
import { jdService, JDLineageVersion, JDResponse } from '@/lib/services/jdService';
import { formatIST } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import VersionCompareModal, { type CompareVersion } from './VersionCompareModal';

interface JDVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  jdId: string;
  jdTitle: string;
  initialVersionNumber?: number;
}

interface JDHistoryVersion {
  id: string;
  job_id?: string;
  version_number: number;
  title: string;
  description: string;
  status?: string;
  is_latest_version?: boolean;
  published_at?: string;
  created_at?: string;
  created_by_name?: string;
  department?: string;
  employment_type?: string;
  remote_type?: string;
  industry_type?: string;
}

const formatVersionDate = (value?: string) => value ? formatIST(value) : 'Date not available';

const statusLabel = (status?: string) =>
  (status || 'unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const versionDate = (version: JDHistoryVersion) => version.published_at || version.created_at || '';

const buildCompareText = (version: JDHistoryVersion) => {
  const lines = [
    `Title: ${version.title || 'Untitled JD'}`,
    version.job_id ? `Job ID: ${version.job_id}` : '',
    version.status ? `Status: ${statusLabel(version.status)}` : '',
    version.department ? `Department: ${version.department}` : '',
    version.industry_type ? `Industry: ${version.industry_type}` : '',
    version.employment_type ? `Employment Type: ${version.employment_type}` : '',
    version.remote_type ? `Work Mode: ${version.remote_type}` : '',
    '',
    'Job Description:',
    version.description || '',
  ];

  return lines.filter((line, index) => line || index === 7).join('\n');
};

const mapVersion = (lineageVersion: JDLineageVersion, detail?: JDResponse): JDHistoryVersion => ({
  id: lineageVersion.id,
  job_id: detail?.job_id || lineageVersion.job_id,
  version_number: lineageVersion.version_number || 1,
  title: detail?.title || lineageVersion.title || 'Untitled JD',
  description: detail?.description || '',
  status: detail?.status || lineageVersion.status,
  is_latest_version: lineageVersion.is_latest_version,
  published_at: detail?.published_at || lineageVersion.published_at,
  created_at: detail?.created_at || lineageVersion.created_at,
  created_by_name: detail?.created_by_name,
  department: detail?.department,
  employment_type: detail?.employment_type,
  remote_type: detail?.remote_type,
  industry_type: detail?.industry_type,
});

export default function JDVersionHistoryModal({
  isOpen,
  onClose,
  jdId,
  jdTitle,
  initialVersionNumber,
}: JDVersionHistoryModalProps) {
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<JDHistoryVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<JDHistoryVersion | null>(null);
  const [compareChecked, setCompareChecked] = useState<string[]>([]);
  const [comparePair, setComparePair] = useState<{ older: CompareVersion; newer: CompareVersion } | null>(null);

  const fetchVersionHistory = useCallback(async () => {
    setLoading(true);
    setSelectedVersion(null);
    setCompareChecked([]);
    setComparePair(null);
    try {
      const lineage = await jdService.getLineageVersions(jdId);
      const lineageItems = lineage.length
        ? lineage
        : [{
            id: jdId,
            title: jdTitle,
            version_number: initialVersionNumber || 1,
            is_latest_version: true,
            status: 'published',
          } as JDLineageVersion];

      const uniqueItems = Array.from(
        new Map(lineageItems.map((item) => [item.id, item])).values()
      );

      const hydratedVersions = await Promise.all(
        uniqueItems.map(async (lineageVersion) => {
          try {
            const detail = await jdService.getById(lineageVersion.id);
            return mapVersion(lineageVersion, detail);
          } catch (error) {
            console.warn('Failed to load JD version detail:', lineageVersion.id, error);
            return mapVersion(lineageVersion);
          }
        })
      );

      const sortedVersions = hydratedVersions.sort(
        (a, b) => (b.version_number || 1) - (a.version_number || 1)
      );

      setVersions(sortedVersions);
      if (initialVersionNumber != null) {
        setSelectedVersion(
          sortedVersions.find((version) => version.version_number === initialVersionNumber) || null
        );
      }
    } catch (error) {
      console.error('Failed to fetch JD version lineage:', error);
      toast.error('Failed to load version history');
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [initialVersionNumber, jdId, jdTitle]);

  useEffect(() => {
    if (!isOpen || !jdId) return;
    const timer = window.setTimeout(() => {
      void fetchVersionHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchVersionHistory, isOpen, jdId]);

  const closeModal = () => {
    setSelectedVersion(null);
    setCompareChecked([]);
    setComparePair(null);
    onClose();
  };

  const toggleCompareCheck = (versionId: string) => {
    setCompareChecked((prev) => {
      if (prev.includes(versionId)) return prev.filter((id) => id !== versionId);
      return prev.length >= 2 ? [prev[1], versionId] : [...prev, versionId];
    });
  };

  const openComparison = (a: JDHistoryVersion, b: JDHistoryVersion) => {
    const [older, newer] = (a.version_number || 0) <= (b.version_number || 0) ? [a, b] : [b, a];
    setComparePair({
      older: {
        version: older.version_number,
        label: `Version ${older.version_number}.0`,
        name: `${older.title} - ${formatVersionDate(versionDate(older))}`,
        text: older.description || '',
      },
      newer: {
        version: newer.version_number,
        label: `Version ${newer.version_number}.0`,
        name: `${newer.title} - ${formatVersionDate(versionDate(newer))}`,
        text: newer.description || '',
      },
    });
  };

  const compareSelected = () => {
    if (compareChecked.length !== 2) return;
    const a = versions.find((version) => version.id === compareChecked[0]);
    const b = versions.find((version) => version.id === compareChecked[1]);
    if (a && b) openComparison(a, b);
  };

  const handleDownload = (version: JDHistoryVersion) => {
    const content = buildCompareText(version);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${version.title.replace(/[^a-z0-9]/gi, '_')}_v${version.version_number}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6" onClick={closeModal}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-4xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0">
            {selectedVersion ? (
              <button
                type="button"
                onClick={() => setSelectedVersion(null)}
                className="p-2 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors"
                aria-label="Back to version list"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
              </button>
            ) : (
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                <History className="w-4 h-4 text-brand-blue" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">
                  {selectedVersion ? `Version ${selectedVersion.version_number}.0` : 'Version History'}
                </h2>
                {!selectedVersion && versions.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/15">
                    {versions.length} version{versions.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-400 truncate">
                {selectedVersion ? selectedVersion.title : jdTitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!selectedVersion && versions.length > 1 && (
              <button
                type="button"
                onClick={compareSelected}
                disabled={compareChecked.length !== 2}
                className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  compareChecked.length === 2
                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2'
                    : 'bg-slate-100 dark:bg-slate-800 text-gray-400 cursor-not-allowed'
                }`}
              >
                {compareChecked.length === 2 ? 'Compare selected' : 'Select 2 versions to compare'}
              </button>
            )}
            <button
              type="button"
              onClick={closeModal}
              className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!selectedVersion && versions.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-2 px-4 sm:px-6 py-2 bg-brand-blue/[0.04] border-b border-brand-blue/10 text-xs text-gray-600 dark:text-slate-400">
            <History className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
            <span>
              All available JD versions are shown. Tick any two versions to compare them.
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
              <Loader2 className="w-8 h-8 text-gray-400 dark:text-slate-500 animate-spin mb-3" />
              <p className="text-gray-600 dark:text-slate-400">Loading versions...</p>
            </div>
          ) : selectedVersion ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-xl">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="px-3 py-1.5 bg-brand-blue text-white rounded-lg text-sm font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    v{selectedVersion.version_number}.0
                  </span>
                  {selectedVersion.is_latest_version && (
                    <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs font-medium">
                      Latest
                    </span>
                  )}
                  <span className="text-xs text-gray-600 dark:text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatVersionDate(versionDate(selectedVersion))}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-slate-400">
                    {statusLabel(selectedVersion.status)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(selectedVersion)}
                  className="flex items-center justify-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-colors font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-2">
                  {selectedVersion.title}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-slate-400 mb-4">
                  {selectedVersion.job_id && <span>Job ID: {selectedVersion.job_id}</span>}
                  {selectedVersion.department && <span>Department: {selectedVersion.department}</span>}
                  {selectedVersion.industry_type && <span>Industry: {selectedVersion.industry_type}</span>}
                  {selectedVersion.created_by_name && <span>By {selectedVersion.created_by_name}</span>}
                </div>
                <div className="h-px bg-gray-200 dark:bg-slate-700 mb-4" />
                {selectedVersion.description ? (
                  <div className="prose prose-sm max-w-none text-gray-700 dark:text-slate-300 leading-relaxed markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                      {selectedVersion.description}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-slate-500 italic">
                    No job description content recorded for this version.
                  </p>
                )}
              </div>
            </div>
          ) : versions.length > 0 ? (
            <div className="space-y-3">
              {versions.map((version, index) => {
                const isLatest = version.is_latest_version || index === 0;
                const isCurrentPage = version.id === jdId;
                const previousVersion = index < versions.length - 1 ? versions[index + 1] : null;

                return (
                  <div
                    key={version.id}
                    className={`border rounded-lg p-4 transition-all ${
                      isCurrentPage
                        ? 'bg-brand-blue/[0.06] border-brand-blue/40 ring-1 ring-brand-blue/15'
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {versions.length > 1 && (
                          <input
                            type="checkbox"
                            checked={compareChecked.includes(version.id)}
                            onChange={() => toggleCompareCheck(version.id)}
                            className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                            aria-label={`Select version ${version.version_number} to compare`}
                          />
                        )}
                        <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${
                          isLatest
                            ? 'bg-brand-blue/10 ring-1 ring-brand-blue/15'
                            : 'bg-gray-100 dark:bg-slate-800 ring-1 ring-gray-200/60'
                        }`}>
                          <FileText className={`w-5 h-5 ${isLatest ? 'text-brand-blue' : 'text-gray-500 dark:text-slate-400'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-brand-blue">
                              Version {version.version_number}
                            </span>
                            {isLatest && (
                              <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs font-medium">
                                Latest
                              </span>
                            )}
                            {isCurrentPage && (
                              <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 rounded text-xs font-medium">
                                Current page
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-slate-400 truncate">{version.title}</p>
                          <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-slate-400 mt-1 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatVersionDate(versionDate(version))}
                            </span>
                            <span>{statusLabel(version.status)}</span>
                            {version.created_by_name && (
                              <span className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5" />
                                {version.created_by_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {previousVersion ? (
                          <button
                            type="button"
                            onClick={() => openComparison(previousVersion, version)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors"
                            title="Compare with the previous version"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">View Changes</span>
                          </button>
                        ) : (
                          <span className="hidden sm:inline text-xs italic text-gray-400 dark:text-slate-500">First version</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedVersion(version)}
                          className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          aria-label={`View version ${version.version_number}`}
                          title="View JD"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-400 dark:text-slate-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-slate-50 mb-2">No Versions Found</h3>
              <p className="text-sm text-gray-500 dark:text-slate-500 text-center">
                No version history available for this job description.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-slate-700 px-6 py-4 bg-gray-50 dark:bg-slate-800/50">
          <div className="flex justify-between items-center gap-3">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {selectedVersion
                ? `Viewing version ${selectedVersion.version_number}`
                : compareChecked.length > 0
                  ? `${compareChecked.length} of 2 selected to compare`
                  : `${versions.length} version${versions.length !== 1 ? 's' : ''}`}
            </p>
            <div className="flex items-center gap-2">
              {!selectedVersion && versions.length > 1 && (
                <button
                  type="button"
                  onClick={compareSelected}
                  disabled={compareChecked.length !== 2}
                  className="sm:hidden inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-blue text-white disabled:bg-slate-200 disabled:text-gray-400"
                >
                  Compare
                </button>
              )}
              <button
                type="button"
                onClick={selectedVersion ? () => setSelectedVersion(null) : closeModal}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-700 transition-colors font-medium text-sm"
              >
                {selectedVersion ? 'Back to List' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {comparePair && (
        <div onClick={(e) => e.stopPropagation()}>
          <VersionCompareModal
            older={comparePair.older}
            newer={comparePair.newer}
            contentFormat="markdown"
            onClose={() => {
              setComparePair(null);
              setCompareChecked([]);
            }}
          />
        </div>
      )}
    </div>
  );
}
