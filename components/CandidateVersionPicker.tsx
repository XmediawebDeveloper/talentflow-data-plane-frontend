'use client';

import { useEffect, useState } from 'react';
import { Eye, FileText, Layers, Loader2 } from 'lucide-react';
import { Resume } from '@/lib/types/types';
import { resumeService } from '@/lib/services/resumeService';
import { formatISTDate } from '@/lib/utils/dateUtils';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import NameAvatar from '@/components/ui/name-avatar';
import type { VersionChoice } from './SelectedCandidatesPanel';

interface ResumeVersionRow {
  id: string;
  version?: number;
  file_name?: string;
  created_at?: string;
  uploaded_by_name?: string;
}

interface CandidateVersionPickerProps {
  resume: Resume;
  /** The version going forward; absent until the list loads (then the latest). */
  choice?: VersionChoice;
  onChoose: (choice: VersionChoice) => void;
}

/**
 * One candidate with EVERY resume version listed inline as a radio list, the
 * latest picked by default — for a dialog where the job is already fixed and
 * the only decision left is which version of the resume to send.
 * (SelectedCandidatesPanel shows one row per candidate and tucks the versions
 * behind an eye; this is its single-candidate, versions-up-front sibling.)
 */
export default function CandidateVersionPicker({ resume, choice, onChoose }: CandidateVersionPickerProps) {
  const [versions, setVersions] = useState<ResumeVersionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<ResumeVersionRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    resumeService.getVersions(resume.id)
      .then((raw: unknown) => {
        if (cancelled) return;
        const list = (Array.isArray(raw) ? raw : (raw as { versions?: ResumeVersionRow[] })?.versions || []) as ResumeVersionRow[];
        // Newest first; a record without a number keeps its API order.
        const sorted = [...list].sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
        const rows = sorted.length ? sorted : [{ id: resume.id, version: 1 }];
        setVersions(rows);
        // The latest goes forward unless the user picks another.
        if (!choice) onChoose({ id: rows[0].id, number: rows[0].version ?? rows.length, total: rows.length });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setVersions([{ id: resume.id, version: 1 }]);
      });
    return () => { cancelled = true; };
    // Loaded once per candidate; `choice`/`onChoose` only seed the default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.id]);

  const name = resume.name || 'Candidate';
  const total = versions?.length ?? 0;

  return (
    <div className="mb-4 sm:mb-5">
      <div className="flex items-center gap-2 mb-2">
        <Layers className="w-4 h-4 text-brand-blue" />
        <h3 className="tf-subsection-title">Candidate &amp; Resume Version</h3>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {/* Candidate */}
        <div className="flex items-center gap-3 p-3 border-b border-gray-100 dark:border-slate-800">
          <NameAvatar name={resume.name} fallback={resume.email || resume.candidate_email} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{name}</p>
            <p className="tf-meta">
              {versions ? `${total} resume version${total === 1 ? '' : 's'} · latest selected by default` : 'Loading versions…'}
            </p>
          </div>
        </div>

        {/* Versions */}
        {!versions ? (
          <div className="flex items-center justify-center gap-2 py-6 tf-meta">
            <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
            Loading resume versions…
          </div>
        ) : (
          <div role="radiogroup" aria-label={`${name}'s resume versions`} className="max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
            {versions.map((version, index) => {
              const number = version.version ?? total - index;
              const isLatest = index === 0;
              const checked = (choice?.id ?? versions[0].id) === version.id;
              return (
                <label
                  key={version.id}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-brand-blue/[0.05] dark:bg-brand-blue/10' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                >
                  <input
                    type="radio"
                    name={`resume-version-${resume.id}`}
                    checked={checked}
                    onChange={() => onChoose({ id: version.id, number, total })}
                    className="w-4 h-4 flex-shrink-0 text-brand-blue border-gray-300 dark:border-slate-600 focus:ring-brand-blue/40"
                  />
                  <span className="inline-flex items-center rounded-md bg-brand-blue/10 px-2 py-0.5 text-xs font-semibold text-brand-blue ring-1 ring-brand-blue/15 tabular-nums flex-shrink-0">
                    v{number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                      <span className="text-sm text-gray-800 dark:text-slate-200 truncate">{version.file_name || `Version ${number}`}</span>
                      {isLatest && (
                        <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-2xs font-semibold text-success ring-1 ring-success-line flex-shrink-0">
                          Latest
                        </span>
                      )}
                    </div>
                    {(version.created_at || version.uploaded_by_name) && (
                      <p className="text-2xs text-gray-500 dark:text-slate-500 mt-0.5 truncate">
                        {version.created_at && `Uploaded ${formatISTDate(version.created_at)}`}
                        {version.uploaded_by_name && ` · by ${version.uploaded_by_name}`}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setPreview(version); }}
                    title={`Preview version ${number}`}
                    aria-label={`Preview version ${number}`}
                    className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/10 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </label>
              );
            })}
          </div>
        )}
        {failed && (
          <p className="px-3 py-2 text-2xs text-brand-orange-deep border-t border-gray-100 dark:border-slate-800">
            Couldn&apos;t load the version list — the current resume will be scored.
          </p>
        )}
      </div>

      {preview && (
        <ResumeTextPreviewModal
          resumeId={preview.id}
          title={name}
          subtitle={preview.file_name}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
