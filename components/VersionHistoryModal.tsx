'use client'

import { useState } from 'react';
import { formatIST } from '@/lib/utils/dateUtils';
import { X, Download, Clock, User, FileText, History, Briefcase, Eye, GitCompare, ArrowLeft, Loader2 } from 'lucide-react';
import { ResumeVersion, Resume } from '@/lib/types/types';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';

interface VersionHistoryModalProps {
  candidateName?: string;
  versions?: ResumeVersion[];
  onClose: () => void;
  /** Opens a single version for reading. Renders the eye action when given. */
  onView?: (versionId: string) => void;
  onApplyToJob?: (versionId: string) => void;
  onDownload?: (versionId: string) => void;
  // Job-specific props
  isOpen?: boolean;
  jobTitle?: string;
  versionHistory?: any[];
}

/** The fields a recruiter actually re-reads when a candidate re-uploads. */
const COMPARED_FIELDS: { label: string; get: (r: Resume) => string }[] = [
  { label: 'Candidate', get: (r) => r.candidate_name || '' },
  { label: 'Email', get: (r) => r.email || '' },
  { label: 'Phone', get: (r) => r.phone || '' },
  { label: 'Current title', get: (r) => r.current_title || '' },
  { label: 'Current company', get: (r) => r.current_company || '' },
  { label: 'Experience', get: (r) => (r.experience_years ? `${r.experience_years} years` : '') },
  { label: 'Location', get: (r) => r.location || '' },
  { label: 'Notice period', get: (r) => r.notice_period || '' },
];

const skillsOf = (r: Resume): string[] =>
  (Array.isArray(r.skills) ? r.skills : []).map((s) => String(s).trim()).filter(Boolean);

export default function VersionHistoryModal({
  candidateName,
  versions,
  onClose,
  onView,
  onApplyToJob,
  onDownload,
  isOpen,
  jobTitle,
  versionHistory
}: VersionHistoryModalProps) {
  /* Compare state. Two versions at a time — a three-way diff has nowhere to go
     in a dialog this size, and "what changed since last time" is the question
     being asked. Picking a third drops the oldest pick rather than blocking. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<{ newer: Resume; older: Resume } | null>(null);
  const [isComparing, setIsComparing] = useState(false);

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

  /* Comparison is a resume-only affair, and needs something to compare against
     — a single version has no "changes". */
  const canCompare = !isJobVersion && sortedVersions.length > 1;

  const toggleSelected = (versionId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(versionId)) return prev.filter((id) => id !== versionId);
      // Keep the most recent pick and add the new one once two are held.
      return prev.length < 2 ? [...prev, versionId] : [prev[1], versionId];
    });
  };

  const handleCompare = async () => {
    if (selectedIds.length !== 2) return;
    setIsComparing(true);
    try {
      const [first, second] = await Promise.all(selectedIds.map((id) => resumeService.getById(id)));
      /* `sortedVersions` is newest-first, so whichever pick sits earlier in it
         is the newer of the two — more reliable than comparing version
         numbers, which legacy rows sometimes omit. */
      const firstIsNewer =
        sortedVersions.findIndex((v) => v.id === selectedIds[0]) <
        sortedVersions.findIndex((v) => v.id === selectedIds[1]);
      setComparison(
        firstIsNewer ? { newer: first, older: second } : { newer: second, older: first },
      );
    } catch (error) {
      toast.error('Could not load those versions to compare');
    } finally {
      setIsComparing(false);
    }
  };

  const labelForVersion = (versionId: string) => {
    const found = sortedVersions.find((v) => v.id === versionId);
    return found?.version ? `v${found.version}` : found?.name || 'version';
  };

  const newerSkills = comparison ? skillsOf(comparison.newer) : [];
  const olderSkills = comparison ? skillsOf(comparison.older) : [];
  const addedSkills = newerSkills.filter((s) => !olderSkills.some((o) => o.toLowerCase() === s.toLowerCase()));
  const removedSkills = olderSkills.filter((s) => !newerSkills.some((n) => n.toLowerCase() === s.toLowerCase()));
  const changedFields = comparison
    ? COMPARED_FIELDS.filter((f) => f.get(comparison.newer).trim() !== f.get(comparison.older).trim())
    : [];

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center">
              {comparison ? <GitCompare className="w-5 h-5 text-brand-blue" /> : <History className="w-5 h-5 text-brand-blue" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">
                {comparison ? 'Compare Versions' : 'Version History'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
                {comparison
                  ? `${displayTitle} • ${labelForVersion(selectedIds[0])} vs ${labelForVersion(selectedIds[1])}`
                  : `${displayTitle} • ${sortedVersions.length} version${sortedVersions.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 dark:text-slate-500 hover:text-brand-blue rounded-md hover:bg-brand-blue/5 transition-colors"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {comparison ? (
          /* ---- Comparison view ------------------------------------------ */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="grid grid-cols-[1fr_1fr] gap-3 mb-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">
              <span>Older · {labelForVersion(comparison.older.id)}</span>
              <span>Newer · {labelForVersion(comparison.newer.id)}</span>
            </div>

            <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 overflow-hidden">
              {COMPARED_FIELDS.map((field) => {
                const before = field.get(comparison.older).trim();
                const after = field.get(comparison.newer).trim();
                const changed = before !== after;
                return (
                  <div
                    key={field.label}
                    className={`border-b border-gray-100 dark:border-slate-700/60 last:border-b-0 px-3 py-2.5 ${
                      changed ? 'bg-brand-orange/[0.06]' : ''
                    }`}
                  >
                    <p className="text-2xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-1">
                      {field.label}
                      {changed && (
                        <span className="ml-2 normal-case tracking-normal text-brand-orange-deep">changed</span>
                      )}
                    </p>
                    <div className="grid grid-cols-[1fr_1fr] gap-3 text-sm">
                      <span className={changed ? 'text-gray-500 dark:text-slate-400 line-through decoration-gray-300' : 'text-gray-700 dark:text-slate-300'}>
                        {before || <span className="text-gray-300 dark:text-slate-600">—</span>}
                      </span>
                      <span className={changed ? 'font-medium text-gray-900 dark:text-slate-50' : 'text-gray-700 dark:text-slate-300'}>
                        {after || <span className="text-gray-300 dark:text-slate-600">—</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Skills read as a set, not a string — added and dropped is the
                useful shape, rather than two long lists side by side. */}
            <div className="mt-4 rounded-xl border border-gray-100 dark:border-slate-700/60 p-3">
              <p className="text-2xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2">
                Skills
              </p>
              {addedSkills.length === 0 && removedSkills.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-slate-400">No skill changes between these versions.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {addedSkills.map((s) => (
                    <span key={`add-${s}`} className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      + {s}
                    </span>
                  ))}
                  {removedSkills.map((s) => (
                    <span key={`del-${s}`} className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 line-through">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {changedFields.length === 0 && addedSkills.length === 0 && removedSkills.length === 0 && (
              <p className="mt-4 text-sm text-gray-500 dark:text-slate-400">
                These two versions carry the same extracted details — the difference is in the file itself.
              </p>
            )}
          </div>
        ) : (
        /* ---- Version timeline ------------------------------------------- */
        <div className="flex-1 overflow-y-auto p-6">
          {sortedVersions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-slate-500">No version history available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {canCompare && (
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Tick any two versions to see what changed between them.
                </p>
              )}
              {sortedVersions.map((version, index) => (
                <div
                  key={version.id}
                  className="relative pl-8 pb-6 border-l-2 border-gray-200 dark:border-slate-700 last:border-l-0 last:pb-0"
                >
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 ${
                    index === 0
                      ? 'bg-brand-blue border-brand-blue'
                      : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-700'
                  }`} />

                  {/* Version Card */}
                  <div className={`bg-white dark:bg-slate-900 rounded-xl border ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 transition-all hover:shadow-md ${
                    selectedIds.includes(version.id)
                      ? 'border-brand-blue ring-brand-blue/20'
                      : index === 0
                        ? 'border-brand-blue/20 bg-brand-blue/5'
                        : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-blue/30'
                  }`}>
                    <div className="p-4">
                      {/* Header Row */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {canCompare && (
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(version.id)}
                              onChange={() => toggleSelected(version.id)}
                              className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                              aria-label={`Select ${version.version ? `v${version.version}` : version.name} to compare`}
                            />
                          )}
                          <div className={`p-2 rounded-lg ring-1 ${
                            index === 0 ? 'bg-brand-blue/10 ring-brand-blue/15' : 'bg-gray-100 dark:bg-slate-800 ring-gray-200/50'
                          }`}>
                            <FileText className={`w-5 h-5 ${
                              index === 0 ? 'text-brand-blue' : 'text-gray-600 dark:text-slate-400'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {version.version && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 flex-shrink-0 tabular-nums">
                                  v{version.version}
                                </span>
                              )}
                              <h3 className="text-sm text-gray-900 dark:text-slate-50 truncate">
                                {version.name}
                              </h3>
                              {index === 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-brand-blue text-white flex-shrink-0">
                                  Latest
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-slate-400">
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
                          {/* Read the version first, act on it second — hence the
                              eye ahead of Apply to Job. */}
                          {onView && (
                            <button
                              onClick={() => onView(version.id)}
                              className={`p-2 rounded-md transition-colors flex-shrink-0 ${
                                index === 0
                                  ? 'text-brand-blue hover:bg-brand-blue/10'
                                  : 'text-gray-600 dark:text-slate-400 hover:bg-brand-blue/5 hover:text-brand-blue'
                              }`}
                              aria-label="View this version" title="View this version"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {onApplyToJob && (
                            <button
                              onClick={() => onApplyToJob(version.id)}
                              className={`p-2 rounded-md transition-colors flex-shrink-0 ${
                                index === 0
                                  ? 'text-brand-blue hover:bg-brand-blue/10'
                                  : 'text-gray-600 dark:text-slate-400 hover:bg-brand-blue/5 hover:text-brand-blue'
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
                                : 'text-gray-600 dark:text-slate-400 hover:bg-brand-blue/5 hover:text-brand-blue'
                            }`}
                            title="Download this version"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Details Row */}
                      <div className="flex items-center gap-4 pt-3 border-t border-gray-100 dark:border-slate-700/60">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-gray-500 dark:text-slate-500" />
                          <span className="text-xs text-gray-600 dark:text-slate-400">
                            Uploaded by <span className="text-gray-900 dark:text-slate-50">{version.uploadedBy}</span>
                          </span>
                        </div>
                        <span className="text-gray-300">•</span>
                        <span className="text-xs text-gray-500 dark:text-slate-500">
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
        )}

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950">
          {comparison ? (
            <button
              onClick={() => setComparison(null)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:text-brand-blue rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to versions
            </button>
          ) : (
            <div className="flex items-center gap-2 min-w-0 text-sm text-gray-600 dark:text-slate-400">
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">
                {isJobVersion
                  ? 'Version history tracks all job description updates'
                  : canCompare
                    ? `${selectedIds.length} of 2 selected to compare`
                    : 'Version history tracks all resume updates for this candidate'}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 flex-shrink-0">
            {canCompare && !comparison && (
              <button
                onClick={handleCompare}
                disabled={selectedIds.length !== 2 || isComparing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2 disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none disabled:ring-0 disabled:cursor-not-allowed"
              >
                {isComparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompare className="w-4 h-4" />}
                Compare
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
