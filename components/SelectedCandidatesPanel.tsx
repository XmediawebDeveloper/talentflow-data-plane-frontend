'use client';

import { useState, type ReactNode } from 'react';
import { Users, Mail, Phone, Briefcase, Layers, Eye, Loader2, Lightbulb } from 'lucide-react';
import { Resume } from '@/lib/types/types';
import { resumeService } from '@/lib/services/resumeService';
import { showErrorToast } from '@/lib/utils/errorToast';
import ResumeVersionsModal from './ResumeVersionsModal';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import { IconButton } from '@/components/ui/icon-button';

/**
 * The "Candidates Selected" panel, lifted out of the Score Resume / Apply to
 * Job dialog so every flow that acts on a set of candidates — score, apply,
 * invite to an assessment, invite to an AI interview, AI talent match — shows
 * the same list and offers the same controls: untick to drop someone, see the
 * version that will be used, and read the resume without leaving the dialog.
 *
 * State the caller owns: which candidates are excluded, and which version was
 * chosen for each. Everything else (fetching versions, previewing) lives here.
 */

/** Which version will be used, and how many exist. The API and the page-level
 *  mapping disagree on casing, and older rows carry neither. */
export const versionInfo = (resume: Resume) => {
  const r = resume as any;
  const count: number = r.versionCount ?? r.version_count ?? r.versions?.length ?? 1;
  const latest: number = r.version ?? count ?? 1;
  return { count, latest, hasMultiple: count > 1 };
};

/** Best contact detail we hold — email first, then phone. */
const contactFor = (resume: Resume): { text: string; kind: 'email' | 'phone' } | null => {
  const r = resume as any;
  const email = r.email && r.email !== 'No email' ? r.email : '';
  const phone = r.phone && r.phone !== 'No phone' ? r.phone : '';
  if (email) return { text: email, kind: 'email' };
  if (phone) return { text: phone, kind: 'phone' };
  return null;
};

export interface VersionChoice {
  id: string;
  number: number;
  total: number;
}

interface SelectedCandidatesPanelProps {
  resumes: Resume[];
  /** Candidates the user has unticked; they stay listed but won't be acted on. */
  excludedIds: string[];
  onToggleCandidate: (resumeId: string) => void;
  /** Version chosen per candidate id. Absent means "the latest". */
  versionChoice?: Record<string, VersionChoice>;
  /** Omit to make the version read-only — the list then only reads resumes. */
  onVersionChosen?: (resumeId: string, choice: VersionChoice) => void;
  /** Closing line under the list. Defaults to the version tip; null hides it. */
  tip?: ReactNode | null;
  /** Draw the ticks as the AI Talent Match results table's plain native
   *  checkbox (`rounded border-gray-300`) instead of this panel's own larger
   *  brand-tinted one — for the Invite to Assessment / AI Interview dialogs,
   *  which sit over that table. Off by default, so every other host is
   *  unchanged. */
  tableCheckboxes?: boolean;
  /** Opt-in: how a candidate's name is SHOWN in the list (Job Details' AI
   *  interview invite: first name capitalised). Display only. */
  formatName?: (name: string) => string;
}

export default function SelectedCandidatesPanel({
  resumes,
  excludedIds,
  onToggleCandidate,
  versionChoice = {},
  onVersionChosen,
  tip,
  tableCheckboxes = false,
  formatName,
}: SelectedCandidatesPanelProps) {
  const checkboxClass = tableCheckboxes
    ? 'rounded border-gray-300 cursor-pointer'
    : 'w-4 h-4 text-brand-blue border-gray-300 dark:border-slate-700 rounded focus:ring-brand-blue/40 cursor-pointer';
  const [versionViewer, setVersionViewer] = useState<{ id: string; name: string; versions: any[] } | null>(null);
  const [loadingViewFor, setLoadingViewFor] = useState<string | null>(null);
  const [previewResume, setPreviewResume] = useState<{ id: string; title: string; subtitle?: string } | null>(null);

  const isIncluded = (id: string) => !excludedIds.includes(id);
  const includedCount = resumes.filter(r => isIncluded(r.id)).length;
  const submittedIdFor = (resume: Resume) => versionChoice[resume.id]?.id || resume.id;

  const allIncluded = resumes.length > 0 && includedCount === resumes.length;
  const someIncluded = includedCount > 0 && !allIncluded;

  /**
   * Tick or untick everyone at once. Only the rows that actually differ are
   * toggled, so this leans on the same per-candidate callback the rows use —
   * callers fold it into a functional state update, so the calls coalesce.
   */
  const toggleAll = () => {
    const include = !allIncluded;
    resumes.forEach(resume => {
      if (isIncluded(resume.id) !== include) onToggleCandidate(resume.id);
    });
  };

  /**
   * The eye. One resume and there is nothing to choose between — open it.
   * Several, and the version list opens, where each can be previewed, diffed
   * and (when the caller wants it) picked.
   */
  const handleView = async (resume: Resume) => {
    const { count } = versionInfo(resume);
    if (count <= 1) {
      setPreviewResume({ id: submittedIdFor(resume), title: resume.name, subtitle: (resume as any).fileName });
      return;
    }
    setLoadingViewFor(resume.id);
    try {
      const raw = await resumeService.getVersions(resume.id);
      const list: any[] = Array.isArray(raw) ? raw : raw?.versions || [];
      if (list.length <= 1) {
        // The count was stale — the single-resume case after all.
        setPreviewResume({
          id: list[0]?.id || submittedIdFor(resume),
          title: resume.name,
          subtitle: list[0]?.file_name || (resume as any).fileName,
        });
        return;
      }
      setVersionViewer({ id: resume.id, name: resume.name, versions: list });
    } catch (error) {
      showErrorToast(error, `Couldn't load the versions for ${resume.name || 'this candidate'}`, { retry: () => handleView(resume) });
    } finally {
      setLoadingViewFor(null);
    }
  };

  /* One candidate or fifty, the tip reads the same — the eye is drawn into the
     sentence rather than described, so it points at the button beside each row. */
  const tipText =
    tip === null
      ? null
      : tip ?? (
        <>
          For multi-version resumes, the latest version is selected by default. Click the{' '}
          <Eye className="inline-block w-3.5 h-3.5 align-text-bottom text-brand-blue" aria-hidden="true" />{' '}
          icon to switch versions.
        </>
      );

  return (
    <div className="mb-4 sm:mb-6 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="flex items-center gap-2 tf-row-title">
          <Users className="w-4 h-4 text-brand-blue" />
          {/* Counts the ticked ones, so it tracks unticking. */}
          {includedCount} Candidate{includedCount === 1 ? '' : 's'} Selected
          {includedCount !== resumes.length && (
            <span className="font-normal text-gray-500 dark:text-slate-400">of {resumes.length}</span>
          )}
        </h3>

        {/* Ticks or unticks the whole list in one click — half-ticked while
            only some are in, so the box reads the list's state at a glance. */}
        {resumes.length > 1 && (
          <label className="flex items-center gap-1.5 tf-caption cursor-pointer select-none flex-shrink-0">
            <input
              type="checkbox"
              checked={allIncluded}
              ref={el => {
                if (el) el.indeterminate = someIncluded;
              }}
              onChange={toggleAll}
              className={checkboxClass}
              aria-label={allIncluded ? 'Unselect all candidates' : 'Select all candidates'}
            />
            Select all
          </label>
        )}
      </div>

      {/* A fixed, scrolling column: an expander that reflowed the dialog on
          every click was worse than a scrollbar, and whatever sits below has
          to stay where the user left it. */}
      <div className="space-y-2 max-h-56 sm:max-h-64 overflow-y-auto pr-1">
        {resumes.map(resume => {
          const included = isIncluded(resume.id);
          const { latest, count, hasMultiple } = versionInfo(resume);
          const contact = contactFor(resume);
          const initials = (resume.name || '?')
            .split(' ')
            .map(n => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          const role = (resume as any).title || (resume as any).current_title || '';
          const chosen = versionChoice[resume.id];
          const shownVersion = chosen?.number ?? latest;
          const shownTotal = chosen?.total ?? count;

          return (
            /* A div, not a label: the row carries the eye button, and a button
               inside a label would fire the checkbox too. */
            <div
              key={resume.id}
              className="flex items-center gap-3 p-2.5 rounded-lg border transition-colors bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700"
            >
              <input
                type="checkbox"
                checked={included}
                onChange={() => onToggleCandidate(resume.id)}
                className={`flex-shrink-0 ${checkboxClass}`}
                aria-label={`Include ${resume.name}`}
              />
              <div className="w-8 h-8 flex-shrink-0 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center text-xs font-semibold text-brand-blue">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm truncate text-gray-900 dark:text-slate-50">
                    {formatName && resume.name ? formatName(resume.name) : resume.name}
                  </span>
                  {/* Read-only label of the version going forward — the eye is
                      where versions are opened and chosen. */}
                  <span
                    title={
                      chosen
                        ? `Version ${chosen.number} of ${chosen.total} — chosen from the version list`
                        : hasMultiple ? `Latest of ${count} versions` : 'Only version'
                    }
                    className="tf-badge bg-brand-blue/10 text-2xs text-brand-blue ring-1 ring-brand-blue/15 tabular-nums"
                  >
                    {shownTotal > 1 && <Layers className="w-3 h-3" />}
                    v{shownVersion}
                    {shownTotal > 1 && <span className="font-normal">of {shownTotal}</span>}
                  </span>
                  {chosen && chosen.number !== latest && (
                    <span className="text-2xs font-medium text-brand-orange-deep">not latest</span>
                  )}
                </div>
                {/* Role first, then how to reach them. */}
                <div className="flex items-center gap-2 tf-meta mt-0.5 min-w-0">
                  {role && (
                    <span className="flex items-center gap-1 min-w-0">
                      <Briefcase className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{role}</span>
                    </span>
                  )}
                  {role && contact && <span className="text-gray-300">•</span>}
                  {contact && (
                    <span className="flex items-center gap-1 min-w-0">
                      {contact.kind === 'email' ? <Mail className="w-3 h-3 flex-shrink-0" /> : <Phone className="w-3 h-3 flex-shrink-0" />}
                      <span className="truncate">{contact.text}</span>
                    </span>
                  )}
                  {!role && !contact && <span className="truncate">No role or contact details</span>}
                </div>
              </div>

              <IconButton bare label={hasMultiple ? `View ${resume.name}'s resume versions` : `View ${resume.name}'s resume`} tooltip={hasMultiple ? 'View resume versions' : 'View resume'}
                type="button"
                onClick={() => handleView(resume)}
                disabled={loadingViewFor === resume.id}
                className="flex-shrink-0 p-1.5 rounded-lg text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/10 transition-colors disabled:opacity-50"
              >
                {loadingViewFor === resume.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              </IconButton>
            </div>
          );
        })}
      </div>

      {includedCount === 0 && (
        <p className="mt-3 text-xs text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20 rounded-lg px-3 py-2">
          Every candidate has been unticked — tick at least one to continue.
        </p>
      )}

      {tipText && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand-orange/[0.08] border border-brand-orange/20 px-3 py-2">
          <Lightbulb className="w-3.5 h-3.5 text-brand-orange flex-shrink-0 mt-0.5" />
          <p className="tf-meta">
            <span className="font-semibold">Tip:</span> {tipText}
          </p>
        </div>
      )}

      {/* One resume, read in place — no navigation away from the dialog. */}
      {previewResume && (
        <ResumeTextPreviewModal
          resumeId={previewResume.id}
          title={previewResume.title}
          subtitle={previewResume.subtitle}
          onClose={() => setPreviewResume(null)}
        />
      )}

      {/* Several versions: read, compare, and pick the one that goes forward
          when the caller accepts a choice. */}
      {versionViewer && (
        <ResumeVersionsModal
          candidate={{ id: versionViewer.id, name: versionViewer.name, resumeId: versionViewer.id }}
          versions={versionViewer.versions}
          selectedVersionId={versionChoice[versionViewer.id]?.id}
          onSelectVersion={onVersionChosen ? ((version: any) => {
            const all = versionViewer.versions;
            const idx = all.findIndex(v => v.id === version.id);
            onVersionChosen(versionViewer.id, {
              id: version.id,
              // Newest-first ordering supplies the number when the API omits it.
              number: version.version ?? all.length - idx,
              total: all.length,
            });
            setVersionViewer(null);
          }) : undefined}
          onClose={() => setVersionViewer(null)}
        />
      )}
    </div>
  );
}
