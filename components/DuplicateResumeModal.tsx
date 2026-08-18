'use client';

import { X, FileText, Trash2, RefreshCw, GitBranch, AlertTriangle, Eye, Calendar, FolderOpen, HardDrive, ChevronLeft, ChevronRight, Check, Ban, ShieldX, Info } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { resumeService } from '@/lib/services';
import { useAuth } from '@/components/providers/AuthProvider';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';

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

  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Map<number, 'discard' | 'overwrite' | 'version'>>(new Map());
  const [selectedAction, setSelectedAction] = useState<'discard' | 'overwrite' | 'version' | null>(null);
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
    if (!hasOnlyExactDuplicates || exactDuplicates.length === 0) return;
    let cancelled = false;

    Promise.all(
      exactDuplicates.map(async ({ file }) => {
        const detail: any = await resumeService.get(file.existingResume.id).catch(() => null);
        return [file.existingResume.id, detail?.uploaded_by_name || ''] as const;
      }),
    ).then(pairs => {
      if (cancelled) return;
      setExistingUploaders(Object.fromEntries(pairs.filter(([, name]) => name)));
    });

    return () => {
      cancelled = true;
    };
  }, [hasOnlyExactDuplicates, exactDuplicates]);

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

  /* The refused file has no record to read text from, so its own bytes go to
     the popup: a PDF through an object URL, a Word file straight as a blob.
     The frame around it is the one above. */
  const handlePreviewNew = (file: File, candidateName: string) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    setPreview({
      kind: 'new',
      file,
      title: candidateName || 'New Resume',
      subtitle: file.name,
      url: isPdf ? window.URL.createObjectURL(file) : undefined,
    });
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
  const previewOverlay = preview ? (
    preview.kind === 'existing' ? (
      <ResumeTextPreviewModal
        resumeId={preview.resumeId}
        title={preview.title}
        subtitle={preview.subtitle}
        onClose={closePreview}
      />
    ) : (
      <ResumeTextPreviewModal
        title={preview.title}
        subtitle={preview.subtitle}
        documentUrl={preview.url}
        docxBlob={preview.url ? undefined : preview.file}
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

  const handleNext = () => {
    if (currentVersionIndex < versionsWithChanges.length - 1) {
      const nextIndex = currentVersionIndex + 1;
      setCurrentVersionIndex(nextIndex);
      setSelectedAction(resolutions.get(versionsWithChanges[nextIndex].originalIndex) || null);
    }
  };

  const handlePrevious = () => {
    if (currentVersionIndex > 0) {
      const prevIndex = currentVersionIndex - 1;
      setCurrentVersionIndex(prevIndex);
      setSelectedAction(resolutions.get(versionsWithChanges[prevIndex].originalIndex) || null);
    }
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
  const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-start gap-2 py-2 text-sm">
      <span className="w-28 flex-shrink-0 text-gray-500">{label}</span>
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
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-4xl w-full max-h-[calc(100dvh-2rem)] flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-6 flex-shrink-0">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <ShieldX className="w-7 h-7 text-red-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight">
                  Duplicate Resume{exactDuplicates.length > 1 ? 's' : ''} Detected
                </h2>
                <p className="text-base text-gray-600 dark:text-slate-400 mt-1">
                  {exactDuplicates.length === 1
                    ? 'This resume matches an existing candidate in the system and cannot be uploaded.'
                    : 'These resumes match existing candidates in the system and cannot be uploaded.'}
                </p>
              </div>
            </div>
            <button
              onClick={closeAsDiscarded}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-6 h-6 text-gray-500 dark:text-slate-500" />
            </button>
          </div>

          {/* The two records side by side: what is on file, and what was refused. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2 space-y-6">
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
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Existing */}
                    <div className="rounded-xl border border-gray-200 overflow-hidden flex flex-col">
                      <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200">
                        <h3 className="text-base font-semibold text-gray-900">Existing Resume</h3>
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
              <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                <span className="font-semibold">Note:</span> Exact duplicates are blocked automatically — existing records stay unchanged.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end p-6 flex-shrink-0">
            <button
              onClick={closeAsDiscarded}
              className="px-6 py-2.5 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 transition-colors font-medium shadow-sm shadow-brand-blue/25"
            >
              Close Now
            </button>
          </div>
        </div>
      </div>
      {previewOverlay}
      </>
    );
  }

  // Don't render if no versions to show
  if (!currentDuplicate) {
    return null;
  }

  return (
    <>
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-4xl w-full max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col tf-round-edges">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">
                Resume Update Detected
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                This candidate already exists in the system. Choose how to handle this update.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
          </button>
        </div>

        {/* File Counter */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
              Resume {currentVersionIndex + 1} of {versionsWithChanges.length}
            </span>
            {exactDuplicates.length > 0 && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                {exactDuplicates.length} duplicate{exactDuplicates.length > 1 ? 's' : ''} auto-blocked
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              Content Changes Detected
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 p-6 overflow-y-auto">
          {/* Candidate Info */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                {currentDuplicate.existingResume.candidate_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">{currentDuplicate.existingResume.candidate_name}</h3>
                <p className="text-sm text-gray-500 dark:text-slate-500">{currentDuplicate.existingResume.email}</p>
              </div>
            </div>
          </div>

          {/* Comparison Grid */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Existing Resume */}
            <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <h4 className="font-medium text-gray-900 dark:text-slate-50 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                  Existing Resume
                </h4>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">Location:</span>
                  <span className="text-gray-900 dark:text-slate-50">{currentDuplicate.existingResume.folder_path || 'My Resumes'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">Upload Date:</span>
                  <span className="text-gray-900 dark:text-slate-50">{formatISTDate(currentDuplicate.existingResume.upload_date)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">File Size:</span>
                  <span className="text-gray-900 dark:text-slate-50">{formatFileSize(currentDuplicate.existingResume.file_size)}</span>
                </div>
                {currentDuplicate.existingResume.version > 1 && (
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                    <span className="text-gray-600 dark:text-slate-400">Version:</span>
                    <span className="text-gray-900 dark:text-slate-50">v{currentDuplicate.existingResume.version}</span>
                  </div>
                )}
                <button
                  onClick={() => handlePreviewExisting(
                    currentDuplicate.existingResume.id,
                    currentDuplicate.existingResume.candidate_name,
                    currentDuplicate.existingResume.file_name,
                  )}
                  className="mt-2 w-full px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  Preview Existing
                </button>
              </div>
            </div>

            {/* New Resume */}
            <div className="border border-blue-200 rounded-xl overflow-hidden bg-blue-50/30">
              <div className="px-4 py-3 bg-blue-100 border-b border-blue-200">
                <h4 className="font-medium text-blue-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  New Resume (Uploading)
                </h4>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">File Name:</span>
                  <span className="text-gray-900 dark:text-slate-50 truncate">{currentDuplicate.file.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">Upload Date:</span>
                  <span className="text-gray-900 dark:text-slate-50">{formatISTDate(new Date().toISOString())}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">File Size:</span>
                  <span className="text-gray-900 dark:text-slate-50">{formatFileSize(currentDuplicate.file.size)}</span>
                </div>
                <button
                  onClick={() => handlePreviewNew(currentDuplicate.file, currentDuplicate.existingResume.candidate_name)}
                  className="mt-2 w-full px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  Preview New
                </button>
              </div>
            </div>
          </div>

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
                  ? 'border-gray-800 bg-gray-50 dark:bg-slate-800/50'
                  : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedAction === 'discard' ? 'bg-gray-800 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                }`}>
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900 dark:text-slate-50">1. Discard New Resume</h5>
                    {selectedAction === 'discard' && (
                      <Check className="w-5 h-5 text-gray-800" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                    Keep existing resume unchanged. New resume will be deleted.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-slate-500">
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
                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                    Replace old resume with new one. Original will be permanently deleted.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-slate-500">
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
                      <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                        Keep both resumes. New resume stored as a versioned update. Recommended for tracking changes.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-slate-500">
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
            <p className="text-xs text-gray-600 dark:text-slate-400">
              <span className="font-medium">Note:</span> All actions are fully audit logged.
              Overwriting or saving as a new version will consume 1 resume upload unit from your quota.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevious}
              disabled={currentVersionIndex === 0}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={currentVersionIndex === versionsWithChanges.length - 1}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            {versionsWithChanges.map(({ originalIndex }, index) => (
              <div
                key={originalIndex}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  resolutions.has(originalIndex) || (index === currentVersionIndex && selectedAction)
                    ? 'bg-green-500'
                    : index === currentVersionIndex
                    ? 'bg-gray-800'
                    : 'bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors font-medium"
            >
              Cancel All
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedAction}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {allVersionsResolved ? 'Confirm All' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Inline Preview Modal */}
    {previewOverlay}
    </>
  );
}
