import { useState } from 'react';
import { X, FileText, Download, Calendar, History, Eye, Loader2, Briefcase, CheckCircle2, Lightbulb } from 'lucide-react';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';
import VersionCompareModal, { type CompareVersion } from './VersionCompareModal';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import { Skeleton } from '@/components/ui/skeleton';

interface ResumeVersion {
  id: string;
  version: number;
  file_name?: string;
  file_size?: number;
  file_size_kb?: number;
  created_at: string;
  uploaded_by_name?: string;
  /** Full document text. Only the version-detail endpoint returns it, so the
   *  diff fetches it on demand when the list didn't carry it. */
  extracted_text?: string;
  // Parsed content for comparison
  skills?: string[];
  technical_skills?: string[];
  experience?: any[];
  education?: any[];
  certifications?: any[];
  current_title?: string;
  current_company?: string;
  location?: string;
  professional_summary?: string;
}

interface MatchedCandidate {
  id: string;
  name: string;
  resumeId?: string;
}

interface ResumeVersionsModalProps {
  candidate: MatchedCandidate;
  versions: ResumeVersion[];
  loading?: boolean;
  onClose: () => void;
  onSelectVersion?: (version: ResumeVersion) => void;
  selectionMode?: boolean;
  /** Scores a version against a job. Renders the briefcase action when given —
   *  the My Resumes list offers it, AI Talent Match does not. */
  onApplyToJob?: (version: ResumeVersion) => void;
  /** True when Apply to Job applies here but the viewer's permission is off —
   * the button stays visible but disabled with this reason instead of firing. */
  onApplyToJobDisabled?: boolean;
  onApplyToJobDisabledReason?: string;
  /** The version currently in use. With `onSelectVersion` and without
   *  `selectionMode`, each row gains a "Use this version" action and this one
   *  is marked as in use — so the list both reads and chooses. */
  selectedVersionId?: string;
}

export default function ResumeVersionsModal({
  candidate,
  versions = [],
  loading = false,
  onClose,
  onSelectVersion,
  selectionMode = false,
  onApplyToJob,
  onApplyToJobDisabled,
  onApplyToJobDisabledReason,
  selectedVersionId,
}: ResumeVersionsModalProps) {
  /* Choosing is offered whenever a handler exists and the whole dialog isn't
     already a picker. Falls back to the newest version, so "in use" is marked
     from the moment the list opens rather than only after a click. */
  const canChoose = !selectionMode && !!onSelectVersion;
  const effectiveSelectedId = selectedVersionId || versions[0]?.id;
  /* Compare state. Two versions, either ticked by hand or implied by "View
     Changes" (this one against the one before it). The diff runs on each
     version's extracted text, which the versions list doesn't carry — it is
     fetched per version when a comparison is actually asked for. */
  const [compareChecked, setCompareChecked] = useState<string[]>([]);
  const [comparePair, setComparePair] = useState<{ older: CompareVersion; newer: CompareVersion } | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  /** Version being read in the preview popup. */
  const [previewVersion, setPreviewVersion] = useState<ResumeVersion | null>(null);

  const formatFileSize = (version: ResumeVersion) => {
    // API returns file_size_kb (in KB)
    if (version.file_size_kb) {
      if (version.file_size_kb >= 1024) {
        return `${(version.file_size_kb / 1024).toFixed(1)} MB`;
      }
      return `${version.file_size_kb.toFixed(1)} KB`;
    }
    // Fallback for file_size in bytes
    if (version.file_size) {
      if (version.file_size < 1024) return `${version.file_size} B`;
      if (version.file_size < 1024 * 1024) return `${(version.file_size / 1024).toFixed(1)} KB`;
      return `${(version.file_size / (1024 * 1024)).toFixed(1)} MB`;
    }
    return 'N/A';
  };

  const handleDownload = async (version: ResumeVersion) => {
    try {
      const blob = candidate.resumeId
        ? await resumeService.downloadVersion(candidate.resumeId, version.id)
        : await resumeService.download(version.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = version.file_name || `${candidate.name}_v${version.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download resume');
    }
  };

  /* Opens in place rather than in a new tab: this dialog is usually stacked on
     top of a flow (apply-to-job, scoring) whose state would be stranded. */
  const handlePreview = (version: ResumeVersion) => {
    setPreviewVersion(version);
  };

  const toggleCompareCheck = (versionId: string) => {
    setCompareChecked((prev) => {
      if (prev.includes(versionId)) return prev.filter((id) => id !== versionId);
      // A third tick replaces the older of the two already held.
      return prev.length >= 2 ? [prev[1], versionId] : [...prev, versionId];
    });
  };

  /** Extracted text lives on the version-detail endpoint, not the list one. */
  const textFor = async (version: ResumeVersion): Promise<string> => {
    if (version.extracted_text) return version.extracted_text;
    try {
      // Only reached from a user-initiated Compare click, so this counts as
      // the user viewing that version's content.
      const detail = await resumeService.get(version.id, true);
      return detail?.extracted_text || '';
    } catch {
      return '';
    }
  };

  const openComparison = async (a: ResumeVersion, b: ResumeVersion) => {
    // Lower version number is the older side, whichever order they were picked.
    const [older, newer] = (a.version || 0) <= (b.version || 0) ? [a, b] : [b, a];
    setLoadingCompare(true);
    try {
      const [olderText, newerText] = await Promise.all([textFor(older), textFor(newer)]);
      setComparePair({
        older: { version: older.version, name: older.file_name, text: olderText },
        newer: { version: newer.version, name: newer.file_name, text: newerText },
      });
    } catch (error) {
      toast.error('Could not load those versions to compare');
    } finally {
      setLoadingCompare(false);
    }
  };

  const compareSelected = () => {
    if (compareChecked.length !== 2) return;
    const a = versions.find((v) => v.id === compareChecked[0]);
    const b = versions.find((v) => v.id === compareChecked[1]);
    if (a && b) openComparison(a, b);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-4xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <History className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">
                  {selectionMode ? 'Select Resume Version' : 'Version History'}
                </h2>
                {!selectionMode && versions.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/15">
                    {versions.length} version{versions.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-400 truncate">{candidate.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Reads as an instruction until two are ticked, then as the action. */}
            {!selectionMode && versions.length > 1 && (
              <button
                onClick={compareSelected}
                disabled={compareChecked.length !== 2 || loadingCompare}
                className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  compareChecked.length === 2 && !loadingCompare
                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2'
                    : 'bg-slate-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {loadingCompare && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {compareChecked.length === 2 ? 'Compare selected' : 'Select 2 versions to compare'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Skeleton className="h-4 w-4 shrink-0 rounded" />
                      <Skeleton className="w-10 h-10 shrink-0 rounded-lg" />
                      <div className="min-w-0 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3.5 w-44" />
                        <Skeleton className="h-3 w-36" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Skeleton className="h-7 w-24 rounded-lg" />
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : versions.length > 0 ? (
            /* Version List View */
            <div className="space-y-3">
              {/* Says what the highlighted row means before anyone has to
                  work it out from the "In use" pill. */}
              {canChoose && (
                <div className="flex items-start gap-2 rounded-lg bg-brand-orange/[0.08] border border-brand-orange/20 px-3 py-2">
                  <Lightbulb className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                    <span className="font-semibold">Tip:</span> The latest version is selected by default. Choose
                    another version if needed.
                  </p>
                </div>
              )}
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  onClick={() => selectionMode && onSelectVersion?.(version)}
                  /* The row in use is the one that stands out — not simply the
                     newest, since a recruiter may have chosen an older one. */
                  className={`border rounded-lg p-4 transition-all ${
                    selectionMode
                      ? 'bg-white dark:bg-slate-900 cursor-pointer hover:border-gray-400 hover:shadow-md border-gray-200 dark:border-slate-700'
                      : canChoose && version.id === effectiveSelectedId
                        ? 'bg-brand-blue/[0.06] border-brand-blue/40 ring-1 ring-brand-blue/15'
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Tick any two, compare from the header. */}
                      {!selectionMode && versions.length > 1 && (
                        <input
                          type="checkbox"
                          checked={compareChecked.includes(version.id)}
                          onChange={() => toggleCompareCheck(version.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                          aria-label={`Select version ${version.version} to compare`}
                        />
                      )}
                      <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${
                        index === 0
                          ? 'bg-brand-blue/10 ring-1 ring-brand-blue/15'
                          : 'bg-gray-100 dark:bg-slate-800 ring-1 ring-gray-200/60'
                      }`}>
                        <FileText className={`w-5 h-5 ${index === 0 ? 'text-brand-blue' : 'text-gray-500 dark:text-slate-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-brand-blue">
                            Version {version.version}
                          </span>
                          {index === 0 && (
                            <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs font-medium">
                              Latest
                            </span>
                          )}
                        </div>
                        {version.file_name && (
                          <p className="text-sm text-gray-600 dark:text-slate-400 truncate">{version.file_name}</p>
                        )}
                        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-slate-400 mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatISTDate(version.created_at)}
                          </span>
                          <span>{formatFileSize(version)}</span>
                          {version.uploaded_by_name && (
                            <span>by {version.uploaded_by_name}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {selectionMode ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVersion?.(version);
                        }}
                        className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors text-sm font-medium"
                      >
                        Select
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Straight to the diff against the version before it —
                            the common case, without ticking anything. The first
                            version has nothing behind it to compare against.
                            Hidden while choosing: that list is about which
                            version goes forward, and per-row diffing and
                            downloading crowd the decision. Two ticks and the
                            header's Compare still cover comparison there. */}
                        {canChoose ? null : index < versions.length - 1 ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openComparison(versions[index + 1], version);
                            }}
                            disabled={loadingCompare}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors disabled:opacity-50"
                            title="Compare with the previous version"
                          >
                            {loadingCompare ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
                            View Changes
                          </button>
                        ) : (
                          <span className="hidden sm:inline text-xs italic text-gray-400 dark:text-slate-500">First version</span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(version);
                          }}
                          className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          aria-label="Preview" title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {/* Read it, then act on it — the eye leads. */}
                        {onApplyToJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onApplyToJobDisabled) {
                                toast.error(onApplyToJobDisabledReason || 'You do not have permission to score resumes');
                                return;
                              }
                              onApplyToJob(version);
                            }}
                            disabled={onApplyToJobDisabled}
                            className={`p-2 rounded-lg transition-colors ${
                              onApplyToJobDisabled
                                ? 'text-gray-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                                : 'text-gray-600 dark:text-slate-400 hover:bg-brand-blue/10 hover:text-brand-blue'
                            }`}
                            aria-label="Apply to Job"
                            title={onApplyToJobDisabled ? (onApplyToJobDisabledReason || 'You do not have permission to score resumes') : 'Apply to Job'}
                          >
                            <Briefcase className="w-4 h-4" />
                          </button>
                        )}
                        {/* Which version goes forward. The one in use says so;
                            the others offer to take its place. */}
                        {canChoose && (
                          version.id === effectiveSelectedId ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              In use
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectVersion?.(version);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
                              title={`Use version ${version.version} instead`}
                            >
                              Use this version
                            </button>
                          )
                        )}
                        {/* Also hidden while choosing — the preview popup
                            carries its own Download for anyone who wants the
                            file. */}
                        {!canChoose && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(version);
                            }}
                            className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            aria-label="Download" title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-400 dark:text-slate-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-slate-50 mb-2">No Versions Found</h3>
              <p className="text-sm text-gray-500 dark:text-slate-500 text-center">
                No version history available for this resume.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-slate-700 px-6 py-4 bg-gray-50 dark:bg-slate-800/50">
          <div className="flex justify-between items-center gap-3">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {!selectionMode && versions.length > 1 && compareChecked.length > 0
                ? `${compareChecked.length} of 2 selected to compare`
                : `${versions.length} version${versions.length !== 1 ? 's' : ''}`}
            </p>
            <div className="flex items-center gap-2">
              {/* The header's compare button is desktop-only, so the footer
                  carries it where the header runs out of room. */}
              {!selectionMode && versions.length > 1 && (
                <button
                  onClick={compareSelected}
                  disabled={compareChecked.length !== 2 || loadingCompare}
                  className="sm:hidden inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-blue text-white disabled:bg-slate-200 disabled:text-gray-400"
                >
                  {loadingCompare && <Loader2 className="w-4 h-4 animate-spin" />}
                  Compare
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reading a single version, in place. */}
      {previewVersion && (
        <div onClick={(e) => e.stopPropagation()}>
          <ResumeTextPreviewModal
            resumeId={previewVersion.id}
            title={`Version ${previewVersion.version}`}
            subtitle={previewVersion.file_name}
            text={previewVersion.extracted_text}
            onClose={() => setPreviewVersion(null)}
          />
        </div>
      )}

      {/* The diff itself — same popup the resume detail page opens. */}
      {comparePair && (
        <div onClick={(e) => e.stopPropagation()}>
          <VersionCompareModal
            older={comparePair.older}
            newer={comparePair.newer}
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
