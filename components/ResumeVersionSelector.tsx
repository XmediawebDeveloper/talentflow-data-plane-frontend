'use client'

import { useState } from 'react';
import { X, FileText, Calendar, User, Clock, CheckCircle2, History, Loader2 } from 'lucide-react';
import { Resume, ResumeVersion } from '@/lib/types/types';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';
import VersionCompareModal, { type CompareVersion } from './VersionCompareModal';

interface ResumeVersionSelectorProps {
  resume: Resume;
  onSelect: (versionId: string) => void;
  onClose: () => void;
}

export default function ResumeVersionSelector({ resume, onSelect, onClose }: ResumeVersionSelectorProps) {
  const versions = resume.versions || [];

  // Sort versions by date (newest first)
  const sortedVersions = [...versions].sort((a, b) =>
    new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
  );

  const latestVersionId = sortedVersions[0]?.id;

  // Track selected version (default to latest)
  const [selectedVersionId, setSelectedVersionId] = useState<string>(latestVersionId || '');

  /* Comparison, same as the version history popup: tick any two and compare,
     or use "View Changes" on a row to diff it against the one before it.
     The tick boxes are their own column, kept clear of the row's own click
     target, so choosing what to compare never reads as choosing what to use. */
  const [comparePair, setComparePair] = useState<{ older: CompareVersion; newer: CompareVersion } | null>(null);
  const [compareChecked, setCompareChecked] = useState<string[]>([]);
  const [loadingCompare, setLoadingCompare] = useState(false);

  const toggleCompareCheck = (versionId: string) => {
    setCompareChecked((prev) => {
      if (prev.includes(versionId)) return prev.filter((id) => id !== versionId);
      // A third tick replaces the older of the two already held.
      return prev.length >= 2 ? [prev[1], versionId] : [...prev, versionId];
    });
  };

  /** Extracted text comes from the version-detail endpoint, not this list. */
  const textFor = async (version: ResumeVersion): Promise<string> => {
    if (version.extractedText || version.extracted_text) {
      return version.extractedText || version.extracted_text || '';
    }
    try {
      // Only reached from a user-initiated Compare click, so this counts as
      // the user viewing that version's content.
      const detail = await resumeService.get(version.id, true);
      return detail?.extracted_text || '';
    } catch {
      return '';
    }
  };

  const openComparison = async (
    older: ResumeVersion,
    olderNumber: number,
    newer: ResumeVersion,
    newerNumber: number,
  ) => {
    setLoadingCompare(true);
    try {
      const [olderText, newerText] = await Promise.all([textFor(older), textFor(newer)]);
      setComparePair({
        older: { version: olderNumber, name: older.name, text: olderText },
        newer: { version: newerNumber, name: newer.name, text: newerText },
      });
    } catch {
      toast.error('Could not load those versions to compare');
    } finally {
      setLoadingCompare(false);
    }
  };

  /** Version numbers here are positional (newest first), so derive them. */
  const numberFor = (versionId: string) => {
    const idx = sortedVersions.findIndex((v) => v.id === versionId);
    return idx === -1 ? undefined : sortedVersions.length - idx;
  };

  const compareSelected = () => {
    if (compareChecked.length !== 2) return;
    const a = sortedVersions.find((v) => v.id === compareChecked[0]);
    const b = sortedVersions.find((v) => v.id === compareChecked[1]);
    if (!a || !b) return;
    const aNum = numberFor(a.id) || 0;
    const bNum = numberFor(b.id) || 0;
    return aNum <= bNum
      ? openComparison(a, aNum, b, bNum)
      : openComparison(b, bNum, a, aNum);
  };

  const handleConfirm = () => {
    if (selectedVersionId) {
      onSelect(selectedVersionId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <FileText className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold tracking-tight text-gray-900 dark:text-slate-50">
                  Select Resume Version
                </h2>
                <span className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/15">
                  {sortedVersions.length} version{sortedVersions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                Which version of {resume.name}&apos;s resume to use
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Reads as the instruction until two are ticked, then as the action. */}
            {sortedVersions.length > 1 && (
              <button
                type="button"
                onClick={compareSelected}
                disabled={compareChecked.length !== 2 || loadingCompare}
                className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  compareChecked.length === 2 && !loadingCompare
                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2'
                    : 'bg-slate-100 dark:bg-slate-800 text-gray-400 cursor-not-allowed'
                }`}
              >
                {loadingCompare && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {compareChecked.length === 2 ? 'Compare selected' : 'Select 2 versions to compare'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* One line where a four-line notice used to sit — the default is
            already visible in the list, so it only needs saying once. */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 sm:px-6 py-2 bg-brand-blue/[0.04] border-b border-brand-blue/10 text-xs text-gray-600 dark:text-slate-400">
          <CheckCircle2 className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
          <span>
            The latest version is selected by default
            {sortedVersions.length > 1 ? ' — tick any two to compare them' : ''}.
          </span>
        </div>

        {/* Versions */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {sortedVersions.map((version, index) => {
            const isLatest = version.id === latestVersionId;
            const isSelected = version.id === selectedVersionId;
            const versionNumber = sortedVersions.length - index;
            const isTicked = compareChecked.includes(version.id);

            /* A div rather than a button: the row holds its own checkbox and
               buttons, and nesting interactive elements inside a button is
               invalid markup. Role and key handling keep it operable. */
            return (
              <div
                key={version.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => setSelectedVersionId(version.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedVersionId(version.id);
                  }
                }}
                className={`w-full cursor-pointer rounded-xl border p-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 ${
                  isSelected
                    ? 'border-brand-blue bg-brand-blue/[0.06] ring-1 ring-brand-blue/20 shadow-sm shadow-brand-blue/10'
                    : 'border-gray-200 dark:border-slate-700 hover:border-brand-blue/40 hover:bg-brand-blue/[0.02]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {sortedVersions.length > 1 && (
                    <input
                      type="checkbox"
                      checked={isTicked}
                      onChange={() => toggleCompareCheck(version.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 flex-shrink-0 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                      aria-label={`Select version ${versionNumber} to compare`}
                    />
                  )}

                  {/* The version number carries the identity; a file icon was
                      saying "this is a file" on a list of nothing but files. */}
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    isSelected
                      ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 ring-1 ring-gray-200/60'
                  }`}>
                    v{versionNumber}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${isSelected ? 'text-brand-blue' : 'text-gray-900 dark:text-slate-50'}`}>
                        Version {versionNumber}
                      </span>
                      {isLatest && (
                        <span className="rounded px-1.5 py-0.5 text-2xs font-semibold bg-brand-blue text-white">
                          Latest
                        </span>
                      )}
                    </div>
                    {version.name && (
                      <p className="text-xs text-gray-600 dark:text-slate-400 truncate mt-0.5">{version.name}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-gray-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {formatISTDate(version.uploadDate)}
                      </span>
                      {version.size && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {version.size}
                        </span>
                      )}
                      {version.uploadedBy && (
                        <span className="flex items-center gap-1 min-w-0">
                          <User className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{version.uploadedBy}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    {/* Diff against the next-oldest version. The last row has
                        nothing behind it to compare against. */}
                    {index < sortedVersions.length - 1 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openComparison(
                            sortedVersions[index + 1],
                            versionNumber - 1,
                            version,
                            versionNumber,
                          );
                        }}
                        disabled={loadingCompare}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 transition-colors hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:text-brand-blue disabled:opacity-50"
                        title="Compare with the previous version"
                      >
                        {loadingCompare ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">View Changes</span>
                      </button>
                    ) : (
                      <span className="hidden sm:inline text-2xs italic text-gray-400 dark:text-slate-500">First version</span>
                    )}
                    {/* A radio, not a tick: exactly one version is applied, and
                        the checkbox on the left already means something else. */}
                    <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isSelected ? 'border-brand-blue bg-brand-blue' : 'border-gray-300 dark:border-slate-600'
                    }`}>
                      {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950">
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {compareChecked.length > 0
              ? `${compareChecked.length} of 2 selected to compare`
              : `Version ${numberFor(selectedVersionId) ?? '-'} will be used`}
          </p>
          <div className="flex items-center gap-2 sm:gap-3">
            {sortedVersions.length > 1 && (
              <button
                type="button"
                onClick={compareSelected}
                disabled={compareChecked.length !== 2 || loadingCompare}
                className="sm:hidden inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-brand-blue text-white disabled:bg-slate-200 disabled:text-gray-400"
              >
                {loadingCompare && <Loader2 className="w-4 h-4 animate-spin" />}
                Compare
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={!selectedVersionId}
              className="flex-1 sm:flex-none px-5 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2 hover:shadow-md hover:shadow-brand-blue/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm &amp; Continue
            </button>
          </div>
        </div>
      </div>

      {/* Same diff popup the version history uses. */}
      {comparePair && (
        <VersionCompareModal
          older={comparePair.older}
          newer={comparePair.newer}
          onClose={() => {
            setComparePair(null);
            setCompareChecked([]);
          }}
        />
      )}
    </div>
  );
}
