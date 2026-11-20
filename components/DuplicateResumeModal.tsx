'use client';

import { FileText, Trash2, RefreshCw, GitBranch, AlertTriangle, Eye, Calendar, Check, Ban, ShieldX, Info, Loader2, User, Mail, Folder, UserPlus } from 'lucide-react';
import { useState, useEffect, useMemo, ComponentType } from 'react';
import { resumeService } from '@/lib/services';
import { useAuth } from '@/components/providers/AuthProvider';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { extractLocalResumeText } from '@/lib/utils/localResumeText';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import VersionCompareModal, { type CompareVersion } from './VersionCompareModal';
import { ModalA11y } from '@/components/ui/modal-a11y';

// Maximum number of versions allowed per resume
const MAX_VERSIONS_PER_RESUME = 5;

export interface ExistingResume {
  id: string;
  candidate_name: string;
  email: string;
  folder_name?: string;
  folder_path?: string;
  upload_date: string;
  file_size: number;
  file_name: string;
  version: number;
  version_count?: number; // Total number of versions for this candidate
}

export interface DuplicateFile {
  file: File;
  existingResume: ExistingResume;
  contentDifferences: string[];
  isDuplicate: boolean; // true = exact duplicate, false = version (has changes)
}

interface DuplicateResumeModalProps {
  duplicates: DuplicateFile[];
  onClose: () => void;
  onResolve: (resolutions: { fileIndex: number; action: 'discard' | 'overwrite' | 'version' }[]) => void;
  /** Where the refused upload was actually headed — the folder the user picked,
   *  as a display path ("My Resumes / Engineering / 2026"). Without it the
   *  "New Resume (Uploading)" card can only fall back to the existing resume's
   *  location, which is a different folder whenever the two disagree. */
  targetFolderPath?: string;
}

export default function DuplicateResumeModal({ duplicates, onClose, onResolve, targetFolderPath }: DuplicateResumeModalProps) {
  // Separate exact duplicates from versions (content changes)
  const { exactDuplicates, versionsWithChanges } = useMemo(() => {
    const exact: { file: DuplicateFile; originalIndex: number }[] = [];
    const versions: { file: DuplicateFile; originalIndex: number }[] = [];

    duplicates.forEach((dup, index) => {
      if (dup.isDuplicate) {
        exact.push({ file: dup, originalIndex: index });
      } else {
        versions.push({ file: dup, originalIndex: index });
      }
    });

    return { exactDuplicates: exact, versionsWithChanges: versions };
  }, [duplicates]);

  // Only show modal for versions with changes (exact duplicates are auto-rejected)
  const hasOnlyExactDuplicates = versionsWithChanges.length === 0;

  const [currentVersionIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Map<number, 'discard' | 'overwrite' | 'version'>>(new Map());
  const [selectedAction, setSelectedAction] = useState<'discard' | 'overwrite' | 'version' | null>(null);
  /* The side-by-side document diff — same popup the resume detail page's
     version history opens, so "what actually changed" reads identically
     whether it's two versions of one resume or a new upload against the one
     on file. Built from each side's extracted text, fetched on demand since
     the duplicate payload only carries metadata. */
  const [comparePair, setComparePair] = useState<{ older: CompareVersion; newer: CompareVersion } | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  /* Resolving hits the server (overwrite/version uploads), so the parent keeps
     this modal mounted until that finishes. Rather than a "Processing
     duplicate resolution..." toast floating over the dialog, the Confirm
     All/Continue button itself goes into a loading state — the modal never
     unmounts on its own, so this never needs to be reset back to false. */
  const [isSubmitting, setIsSubmitting] = useState(false);
  /* What the preview popup is currently showing. A stored resume is addressed
     by id and the popup fetches its extracted text; a file that was refused has
     no record yet, so its own bytes go across instead. */
  const [preview, setPreview] = useState<
    | { kind: 'existing'; resumeId: string; title: string; subtitle?: string }
    | { kind: 'new'; file: File; title: string; subtitle?: string; url?: string }
    | null
  >(null);

  /* Who uploaded the resume already on file. The duplicate response doesn't
     carry it, so it is read from the resume record once the dialog opens. */
  const [existingUploaders, setExistingUploaders] = useState<Record<string, string>>({});

  useEffect(() => {
    const allDuplicates = [...exactDuplicates, ...versionsWithChanges];
    if (allDuplicates.length === 0) return;
    let cancelled = false;

    Promise.all(
      allDuplicates.map(async ({ file }) => {
        const detail: any = await resumeService.get(file.existingResume.id).catch(() => null);
        return [file.existingResume.id, detail?.uploaded_by_name || ''] as const;
      }),
    ).then(pairs => {
      if (cancelled) return;
      setExistingUploaders(prev => ({ ...prev, ...Object.fromEntries(pairs.filter(([, name]) => name)) }));
    });

    return () => {
      cancelled = true;
    };
  }, [exactDuplicates, versionsWithChanges]);

  const { user } = useAuth();
  const currentUserName =
    (user as any)?.full_name || (user as any)?.name || (user as any)?.email || '-';
  /* Stamped when the dialog opens: the upload happened moments ago, and the
     file's own lastModified is when it was saved, not when it was sent. */
  const [uploadAttemptedAt] = useState(() => formatIST(new Date().toISOString()));

  /* Opens the same reader the rest of the app uses — the stored resume is
     addressed by id and the popup pulls its extracted text, so it reads as a
     document rather than as a printed page in a frame. */
  const handlePreviewExisting = (resumeId: string, candidateName: string, fileName?: string) => {
    setPreview({ kind: 'existing', resumeId, title: candidateName || 'Existing Resume', subtitle: fileName });
  };

  /* The refused file has no record to read text from, so the file itself goes
     to the popup, which reads its text in the browser and renders the same
     formatted page a stored resume gets. The object URL is only a fallback,
     for a scanned PDF that has no text layer to extract. */
  const handlePreviewNew = (file: File, candidateName: string) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    setPreview({
      kind: 'new',
      file,
      title: candidateName || 'New Resume',
      subtitle: file.name,
      // Typed as PDF so the preview iframe can only ever show it as a PDF.
      url: isPdf ? window.URL.createObjectURL(new Blob([file], { type: 'application/pdf' })) : undefined,
    });
  };

  /* Existing side reads from the stored record's extracted_text, same as any
     other version diff. New side has no record yet, so its text is pulled
     out of the file itself in the browser — the same path the preview popup
     uses for a refused upload. Either side silently contributes '' on
     failure (a scanned PDF, an unreadable .doc): VersionCompareModal already
     renders that as "no content to compare" rather than erroring the dialog. */
  const openComparison = async (dup: DuplicateFile) => {
    setLoadingCompare(true);
    try {
      const [existingText, newText] = await Promise.all([
        resumeService.get(dup.existingResume.id).then(d => d?.extracted_text || '').catch(() => ''),
        extractLocalResumeText(dup.file).catch(() => ''),
      ]);
      setComparePair({
        older: { label: 'Existing Resume', name: dup.existingResume.file_name, text: existingText },
        newer: { label: 'New Resume (Uploading)', name: dup.file.name, text: newText },
      });
    } finally {
      setLoadingCompare(false);
    }
  };

  const closePreview = () => {
    if (preview?.kind === 'new' && preview.url) {
      window.URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  };

  /* Held as a value rather than written inline: this component has two separate
     returns — the blocked exact-duplicate dialog and the version-resolution
     dialog — and both carry a View Resume button. The overlay used to live
     inside the second return only, so in the blocked dialog the button set its
     state and rendered nothing at all. Declared once here, rendered by both. */
  /* z-[80]: the preview is a SIBLING of this component's own overlay, which
     sits at z-[60] (higher than the z-50 most dialogs use). The preview's
     default z-50 therefore lost to it and the resume opened *behind* the
     Duplicate Resume Detected dialog. 80 clears z-[60] and also the z-[70]
     BulkVersionResolutionModal that shares the my-resumes page, while staying
     under the dashboard's blocking overlays (terms z-[95], suspension z-[100]). */
  const previewOverlay = preview ? (
    preview.kind === 'existing' ? (
      <ResumeTextPreviewModal
        resumeId={preview.resumeId}
        title={preview.title}
        subtitle={preview.subtitle}
        zIndexClassName="z-[80]"
        onClose={closePreview}
      />
    ) : (
      <ResumeTextPreviewModal
        title={preview.title}
        subtitle={preview.subtitle}
        localFile={preview.file}
        documentUrl={preview.url}
        zIndexClassName="z-[80]"
        onDownload={() => {
          const url = window.URL.createObjectURL(preview.file);
          const a = document.createElement('a');
          a.href = url;
          a.download = preview.file.name;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }}
        onClose={closePreview}
      />
    )
  ) : null;

  // Same stacking reasoning as the preview overlay above.
  const compareOverlay = comparePair ? (
    <VersionCompareModal
      older={comparePair.older}
      newer={comparePair.newer}
      highlightMode="matches"
      zIndexClassName="z-[80]"
      onClose={() => setComparePair(null)}
    />
  ) : null;

  // Auto-resolve exact duplicates as 'discard' on mount
  useEffect(() => {
    if (exactDuplicates.length > 0) {
      const autoResolutions = new Map(resolutions);
      exactDuplicates.forEach(({ originalIndex }) => {
        autoResolutions.set(originalIndex, 'discard');
      });
      setResolutions(autoResolutions);
    }
  }, [exactDuplicates]);

  /* The blocked-upload message stays until it is dismissed. It used to close
     itself after three seconds, which took the reason away mid-read — and this
     is the only place the rejected file and the record it matched are named. */

  const currentVersion = versionsWithChanges[currentVersionIndex];
  const currentDuplicate = currentVersion?.file;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  // Check if version limit is reached for the current resume
  const isVersionLimitReached = useMemo(() => {
    if (!currentDuplicate?.existingResume) return false;
    const versionCount = currentDuplicate.existingResume.version_count || currentDuplicate.existingResume.version || 1;
    return versionCount >= MAX_VERSIONS_PER_RESUME;
  }, [currentDuplicate]);

  const handleSelectAction = (action: 'discard' | 'overwrite' | 'version') => {
    if (!currentVersion) return;
    // Prevent selecting 'version' if limit is reached
    if (action === 'version' && isVersionLimitReached) return;
    setSelectedAction(action);
    const newResolutions = new Map(resolutions);
    newResolutions.set(currentVersion.originalIndex, action);
    setResolutions(newResolutions);
  };

  const handleConfirm = () => {
    // Save current selection if not already saved
    if (currentVersion && selectedAction && !resolutions.has(currentVersion.originalIndex)) {
      resolutions.set(currentVersion.originalIndex, selectedAction);
    }

    // Build resolution array (exact duplicates are already auto-discarded)
    const resolutionArray = Array.from(resolutions.entries()).map(([fileIndex, action]) => ({
      fileIndex,
      action
    }));

    setIsSubmitting(true);
    onResolve(resolutionArray);
  };

  // Check if all versions with changes have been resolved (exact duplicates are auto-resolved)
  const allVersionsResolved = versionsWithChanges.every(({ originalIndex }) =>
    resolutions.has(originalIndex) ||
    (currentVersion && originalIndex === currentVersion.originalIndex && selectedAction)
  );

  /* One labelled row inside a resume panel: label, colon, value on a single
     line, with the label at a fixed width so the colons and values line up
     down the card. Flex and stock widths rather than an arbitrary grid
     template — the arbitrary class wasn't generated, which left `grid` with no
     columns and stacked the three parts one per line. */
  const DetailRow = ({
    icon: Icon,
    label,
    value,
  }: {
    icon?: ComponentType<{ className?: string }>;
    label: string;
    value: string;
  }) => (
    <div className="flex items-start gap-2 py-2.5 text-sm">
      {Icon && <Icon className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />}
      <span className="w-20 sm:w-28 flex-shrink-0 text-gray-500">{label}</span>
      <span className="flex-shrink-0 text-gray-400">:</span>
      <span className="min-w-0 flex-1 text-gray-900 break-words">{value || '-'}</span>
    </div>
  );

  // Show blocked message for exact duplicates only
  if (hasOnlyExactDuplicates) {
    const closeAsDiscarded = () => {
      const autoResolutions = exactDuplicates.map(({ originalIndex }) => ({
        fileIndex: originalIndex,
        action: 'discard' as const,
      }));
      onResolve(autoResolutions);
    };

    return (
      <>
      <ModalA11y><div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-4xl w-full max-h-[calc(100dvh-2rem)] flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-4 sm:p-6 flex-shrink-0">
            <div className="flex items-start gap-3 sm:gap-4 min-w-0">
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <ShieldX className="w-6 h-6 sm:w-7 sm:h-7 text-red-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight">
                  Duplicate Resume{exactDuplicates.length > 1 ? 's' : ''} Detected
                </h2>
                <p className="tf-body-secondary sm:text-base mt-1">
                  {exactDuplicates.length === 1
                    ? 'This resume matches an existing candidate in the system and cannot be uploaded.'
                    : 'These resumes match existing candidates in the system and cannot be uploaded.'}
                </p>
              </div>
            </div>
          </div>

          {/* The two records side by side: what is on file, and what was refused. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-2 space-y-6">
            {exactDuplicates.map(({ file, originalIndex }) => {
              const existing = file.existingResume;
              /* Two different folders, and they were showing the same one. The
                 left card is where the resume already sits; the right card is
                 where this upload was aimed, which is only the same place by
                 coincidence. Falling back to the existing location keeps the
                 row populated for callers that upload with no folder choice. */
              const existingLocation = existing.folder_path || existing.folder_name || 'root';
              const uploadLocation = targetFolderPath || existingLocation;

              return (
                <div key={originalIndex} className="space-y-4">
                  <div className="tf-grid-split">
                    {/* Existing */}
                    <div className="rounded-xl border border-gray-200 overflow-hidden flex flex-col">
                      <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200">
                        <h3 className="tf-section-title">Existing Resume</h3>
                      </div>
                      <div className="px-5 py-2 flex-1">
                        <DetailRow label="Candidate" value={existing.candidate_name} />
                        <DetailRow label="Email" value={existing.email} />
                        <DetailRow label="Location" value={existingLocation} />
                        <div className="border-t border-gray-100 my-1" />
                        <DetailRow label="Upload Date" value={existing.upload_date ? formatIST(existing.upload_date) : '-'} />
                        <DetailRow label="Upload By" value={existingUploaders[existing.id] || '-'} />
                        <div className="border-t border-gray-100 my-1" />
                        <DetailRow
                          label="File Name"
                          value={`${existing.file_name}${existing.file_size ? ` (${formatFileSize(existing.file_size)})` : ''}`}
                        />
                      </div>
                      <button
                        onClick={() => handlePreviewExisting(existing.id, existing.candidate_name, existing.file_name)}
                        className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-50 hover:bg-gray-100 text-brand-blue font-medium text-sm transition-colors cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        View Resume
                      </button>
                    </div>

                    {/* The upload that was refused */}
                    <div className="rounded-xl border border-brand-blue/30 overflow-hidden flex flex-col">
                      <div className="px-5 py-3.5 bg-brand-blue/5 border-b border-brand-blue/20">
                        <h3 className="text-base font-semibold text-brand-blue">New Resume (Uploading)</h3>
                      </div>
                      <div className="px-5 py-2 flex-1">
                        {/* The refused file was never parsed on the server, so the
                            record it matched is what names the candidate. */}
                        <DetailRow label="Candidate" value={existing.candidate_name} />
                        <DetailRow label="Email" value={existing.email} />
                        <DetailRow label="Location" value={uploadLocation} />
                        <div className="border-t border-gray-100 my-1" />
                        <DetailRow label="Upload Date" value={uploadAttemptedAt} />
                        <DetailRow label="Upload By" value={currentUserName} />
                        <div className="border-t border-gray-100 my-1" />
                        <DetailRow label="File Name" value={`${file.file.name} (${formatFileSize(file.file.size)})`} />
                      </div>
                      <button
                        onClick={() => handlePreviewNew(file.file, existing.candidate_name)}
                        className="flex items-center justify-center gap-2 px-5 py-3 bg-brand-blue/5 hover:bg-brand-blue/10 text-brand-blue font-medium text-sm transition-colors cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        View Resume
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* The same treatment as the Tip on the upload dialog — the brand's
                amber, so it reads as guidance rather than a second warning. The
                wording is kept to one line at this dialog's width; the old
                sentence spilled a few words onto a second row. */}
            <div className="flex items-start gap-2.5 rounded-xl bg-brand-orange/[0.08] border border-brand-orange/20 px-3 py-2.5">
              <Info className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
              <p className="tf-body">
                <span className="font-semibold">Note:</span> Exact duplicates are blocked automatically — existing records stay unchanged.
              </p>
            </div>
          </div>

          {/* Footer — no X, this closes the same way. */}
          <div className="flex-shrink-0 flex justify-end gap-3 p-4 sm:p-6 sm:pt-4 border-t border-gray-100 dark:border-slate-700/60">
            <button
              onClick={closeAsDiscarded}
              className="tf-btn tf-btn-primary px-5 py-2.5 bg-brand-blue hover:bg-brand-blue-2 transition-colors whitespace-normal shadow-none gap-0"
            >
              Close
            </button>
          </div>
        </div>
      </div></ModalA11y>
      {previewOverlay}
      {compareOverlay}
      </>
    );
  }

  // Don't render if no versions to show
  if (!currentDuplicate) {
    return null;
  }

  return (
    <>
    <ModalA11y><div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-4xl w-full max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h2 className="tf-section-title sm:text-xl mb-1">
                Resume Update Detected
              </h2>
              <p className="tf-body-secondary">
                This candidate already exists in the system. Choose how to handle this update.
              </p>
            </div>
          </div>
        </div>

        {/* File Counter */}
        <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="tf-label">
              Resume {currentVersionIndex + 1} of {versionsWithChanges.length}
            </span>
            {exactDuplicates.length > 0 && (
              <span className="tf-badge bg-red-100 text-red-700">
                {exactDuplicates.length} duplicate{exactDuplicates.length > 1 ? 's' : ''} auto-blocked
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="tf-badge bg-amber-100 text-amber-700">
              Content Changes Detected
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto">
          {/* Candidate Info */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                {currentDuplicate.existingResume.candidate_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">{currentDuplicate.existingResume.candidate_name}</h3>
                <p className="tf-body-muted">{currentDuplicate.existingResume.email}</p>
              </div>
            </div>
          </div>

          {/* Opens the two resumes side by side, as documents — same diff
              popup the resume detail page's version history uses — rather
              than a table of metadata fields, which a candidate's actual
              content never showed up in. */}
          <div className="mb-6 flex justify-end">
            <button
              onClick={() => openComparison(currentDuplicate)}
              disabled={loadingCompare}
              className="px-4 py-2 text-sm font-medium text-brand-blue border border-brand-blue/30 rounded-lg hover:bg-brand-blue/5 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingCompare ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
              Compare Resumes
            </button>
          </div>

          {/* Comparison Cards — every row is bound to live data (existing
              resume record, the file being uploaded, the signed-in user, and
              the target folder). */}
          {(() => {
            const existing = currentDuplicate.existingResume;
            const existingLocation = existing.folder_path || existing.folder_name || 'root';
            const uploadLocation = targetFolderPath || existingLocation;

            return (
              <div className="tf-grid-split mb-6">
                {/* Existing */}
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col">
                  <div className="px-5 py-3.5 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-700 dark:text-slate-300" />
                    <h3 className="tf-section-title">Existing Resume</h3>
                  </div>
                  <div className="px-5 py-1 flex-1 divide-y divide-gray-100 dark:divide-slate-800">
                    <DetailRow icon={User} label="Candidate" value={existing.candidate_name} />
                    <DetailRow icon={Mail} label="Email" value={existing.email} />
                    <DetailRow icon={Folder} label="Location" value={existingLocation} />
                    <DetailRow icon={Calendar} label="Upload Date" value={formatISTDate(existing.upload_date)} />
                    <DetailRow icon={UserPlus} label="Upload By" value={existingUploaders[existing.id] || '-'} />
                    <DetailRow icon={FileText} label="File Name" value={existing.file_name} />
                    <DetailRow icon={Info} label="File Size" value={formatFileSize(existing.file_size)} />
                    {existing.version > 1 && (
                      <DetailRow icon={GitBranch} label="Version" value={`v${existing.version}`} />
                    )}
                  </div>
                  <button
                    onClick={() => handlePreviewExisting(existing.id, existing.candidate_name, existing.file_name)}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-50 hover:bg-blue-100 text-brand-blue font-medium text-sm transition-colors cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    Preview Existing
                  </button>
                </div>

                {/* New */}
                <div className="rounded-xl border border-brand-blue/30 overflow-hidden flex flex-col">
                  <div className="px-5 py-3.5 bg-brand-blue/5 border-b border-brand-blue/20 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand-blue" />
                    <h3 className="text-base font-semibold text-brand-blue">New Resume (Uploading)</h3>
                  </div>
                  <div className="px-5 py-1 flex-1 divide-y divide-gray-100 dark:divide-slate-800">
                    <DetailRow icon={User} label="Candidate" value={existing.candidate_name} />
                    <DetailRow icon={Mail} label="Email" value={existing.email} />
                    <DetailRow icon={Folder} label="Location" value={uploadLocation} />
                    <DetailRow icon={Calendar} label="Upload Date" value={uploadAttemptedAt} />
                    <DetailRow icon={UserPlus} label="Upload By" value={currentUserName} />
                    <DetailRow icon={FileText} label="File Name" value={currentDuplicate.file.name} />
                    <DetailRow icon={Info} label="File Size" value={formatFileSize(currentDuplicate.file.size)} />
                  </div>
                  <button
                    onClick={() => handlePreviewNew(currentDuplicate.file, existing.candidate_name)}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-50 hover:bg-blue-100 text-brand-blue font-medium text-sm transition-colors cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    Preview New
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Content Differences */}
          {currentDuplicate.contentDifferences.length > 0 && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <h4 className="font-medium text-amber-900 mb-3 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Content Differences Detected
              </h4>
              <ul className="space-y-1.5">
                {currentDuplicate.contentDifferences.map((diff, index) => (
                  <li key={index} className="text-sm text-amber-800 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    {diff}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Options */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 dark:text-slate-50 mb-3">Choose an action:</h4>

            {/* Option 1: Discard */}
            <button
              onClick={() => handleSelectAction('discard')}
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                selectedAction === 'discard'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedAction === 'discard' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                }`}>
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900 dark:text-slate-50">1. Discard New Resume</h5>
                    {selectedAction === 'discard' && (
                      <Check className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                  <p className="tf-body-secondary mt-1">
                    Keep existing resume unchanged. New resume will be deleted.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 tf-meta">
                    <span>• Old resume: <span className="text-gray-700 dark:text-slate-300">Unchanged</span></span>
                    <span>• New resume: <span className="text-red-600">Deleted</span></span>
                    <span>• Storage: <span className="text-gray-700 dark:text-slate-300">No impact</span></span>
                  </div>
                </div>
              </div>
            </button>

            {/* Option 2: Overwrite */}
            <button
              onClick={() => handleSelectAction('overwrite')}
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                selectedAction === 'overwrite'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedAction === 'overwrite' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                }`}>
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900 dark:text-slate-50">2. Overwrite Existing Resume</h5>
                    {selectedAction === 'overwrite' && (
                      <Check className="w-5 h-5 text-orange-500" />
                    )}
                  </div>
                  <p className="tf-body-secondary mt-1">
                    Replace old resume with new one. Original will be permanently deleted.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 tf-meta">
                    <span>• Old resume: <span className="text-red-600">Deleted</span></span>
                    <span>• New resume: <span className="text-green-600">Saved</span></span>
                    <span>• Consumes: <span className="text-orange-600">1 upload unit</span></span>
                  </div>
                </div>
              </div>
            </button>

            {/* Option 3: Save as Version */}
            <button
              onClick={() => handleSelectAction('version')}
              disabled={isVersionLimitReached}
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                isVersionLimitReached
                  ? 'border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 opacity-60 cursor-not-allowed'
                  : selectedAction === 'version'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isVersionLimitReached
                    ? 'bg-gray-300 text-gray-500 dark:text-slate-500'
                    : selectedAction === 'version' ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                }`}>
                  {isVersionLimitReached ? <Ban className="w-5 h-5" /> : <GitBranch className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h5 className={`font-semibold ${isVersionLimitReached ? 'text-gray-500 dark:text-slate-500' : 'text-gray-900 dark:text-slate-50'}`}>
                        3. Save as New Version
                      </h5>
                      {!isVersionLimitReached && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Recommended</span>
                      )}
                      {isVersionLimitReached && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">Limit Reached</span>
                      )}
                    </div>
                    {selectedAction === 'version' && !isVersionLimitReached && (
                      <Check className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                  {isVersionLimitReached ? (
                    <div className="mt-2">
                      <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-red-900 font-medium">Version Limit Exceeded</p>
                          <p className="text-xs text-red-700 mt-1">
                            Maximum {MAX_VERSIONS_PER_RESUME} versions allowed per candidate.
                            Current: {currentDuplicate.existingResume.version_count || currentDuplicate.existingResume.version || 1} versions.
                            Please choose "Overwrite Existing Resume" or "Discard New Resume" instead.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="tf-body-secondary mt-1">
                        Keep both resumes. New resume stored as a versioned update. Recommended for tracking changes.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4 tf-meta">
                        <span>• Old resume: <span className="text-green-600">Kept</span></span>
                        <span>• New resume: <span className="text-green-600">Saved as v{currentDuplicate.existingResume.version + 1}</span></span>
                        <span>• Consumes: <span className="text-orange-600">1 upload unit</span></span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </button>
          </div>

          {/* Note */}
          <div className="mt-6 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
            <p className="tf-meta">
              <span className="font-medium">Note:</span> All actions are fully audit logged.
              Overwriting or saving as a new version will consume 1 resume upload unit from your quota.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="tf-btn tf-btn-secondary px-5 py-2.5 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-brand-blue/30 transition-colors whitespace-normal gap-0"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedAction || isSubmitting}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Processing...' : allVersionsResolved ? 'Confirm All' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div></ModalA11y>

    {/* Inline Preview Modal */}
    {previewOverlay}
    {compareOverlay}
    </>
  );
}
