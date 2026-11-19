'use client';

import { useState } from 'react';
import { Calendar, ClipboardCheck, Clock, Eye, Info, Layers, Mail, Star, User } from 'lucide-react';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import AssessmentPreviewModal from '@/components/AssessmentPreviewModal';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import { parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import { formatIST } from '@/lib/utils/dateUtils';

// The API rows the host already holds; typed loosely, as the hosts hold them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JobAssessment = any;

/* The rounds an assessment runs — the Rounds chips AssessmentPicker uses. */
const ROUND_CHIPS: { key: 'hr' | 'technical' | 'coding'; short: string; label: string }[] = [
  { key: 'hr', short: 'HR', label: 'HR Round' },
  { key: 'technical', short: 'TECH', label: 'Technical Round' },
  { key: 'coding', short: 'CODE', label: 'Coding Round' },
];

const versionOf = (a: JobAssessment): number | null =>
  typeof a.version === 'number' ? a.version : parseAssessmentTitle(a.title || '').version;

/** Every assessment of the job `jobId` names — across its job versions, which
 *  are separate JD rows sharing one short id — newest first. */
export function jobAssessments(assessments: JobAssessment[], jobId: string): JobAssessment[] {
  const own = assessments.filter((a) => a.jd_id === jobId);
  const shortIds = new Set(own.map((a) => a.jd_short_id).filter(Boolean));
  return assessments
    .filter((a) => a.jd_id === jobId || (a.jd_short_id && shortIds.has(a.jd_short_id)))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

/** The cards actually listed, newest first: the matched job version's own
 *  assessments when it has any, else the job's other versions'. */
function listedJobAssessments(allOfJob: JobAssessment[], jobId: string): JobAssessment[] {
  const ofMatchedVersion = allOfJob.filter((a) => a.jd_id === jobId);
  return ofMatchedVersion.length > 0 ? ofMatchedVersion : allOfJob;
}

/** The card tagged "Latest" — what a host pre-ticks (and, with a single
 *  version, the only choice). */
export function latestJobAssessment(assessments: JobAssessment[], jobId: string): JobAssessment | undefined {
  return listedJobAssessments(jobAssessments(assessments, jobId), jobId)[0];
}

/**
 * The assessment picker for an invite that already knows its job (candidates
 * opened from that job's AI Talent Match results) — the Assessment twin of
 * `JobInterviewVersionPicker`, card for card: one card per assessment version
 * of THAT job with its pick control, "Assessment V · Latest", date, rounds,
 * duration, invitations sent and creator, its status and a preview. Lists
 * only what the host offers (published, not revoked), so every card can take
 * the invite.
 *
 * `multiple` keeps AI Talent Match's several-at-once pick: the control is a
 * checkbox instead of a radio, and each card toggles.
 */
export default function JobAssessmentVersionPicker({
  assessments,
  jobId,
  multiple = false,
  selectedIds,
  onToggle,
  jobVersionNumber,
}: {
  assessments: JobAssessment[];
  /** The JD id the candidates were matched against. */
  jobId: string;
  /** That JD row's own job version, when the host knows it (Job Details).
   *  Heads the list and the preview instead of the assessment's `jd_version`
   *  snapshot, which can read 1 for a later version's assessment. */
  jobVersionNumber?: number;
  multiple?: boolean;
  selectedIds: string[];
  /** A card was clicked: the host adds / removes (multiple) or replaces it. */
  onToggle: (assessment: JobAssessment) => void;
}) {
  const [preview, setPreview] = useState<JobAssessment | null>(null);
  /* Each assessment once — a row repeated in the host's list is one card. */
  const seen = new Set<string>();
  const allOfJob = jobAssessments(assessments, jobId).filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  /* The job version the candidates were matched against (the `jobId` JD row)
     only. Assessment version numbers restart per job version, so listing every
     job version's assessments under the one "Job V" heading showed several
     "Assessment V1" cards that read as duplicates. Only when that job version
     has none are the job's other versions listed — each card then names its
     own job version (see `spansJobVersions`). */
  const versions = listedJobAssessments(allOfJob, jobId);
  const spansJobVersions = new Set(versions.map((a) => a.jd_id)).size > 1;
  const latestId = versions[0]?.id;
  // The job version the candidates were matched against — an assessment on
  // that exact JD row — else the newest one known for the job.
  const job = versions.find((a) => a.jd_id === jobId) ?? versions[0];

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="tf-row-title">
          {multiple ? 'Select Assessment Versions' : 'Select Assessment Version'}
        </span>
        {job?.jd_short_id && <JobIdBadge>{job.jd_short_id}</JobIdBadge>}
        {job?.jd_title && <span className="min-w-0 tf-body-secondary truncate">{job.jd_title}</span>}
        {job && !spansJobVersions && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20" title="Job version">
            V{jobVersionNumber ?? job.jd_version ?? 1}
          </span>
        )}
      </div>

      {versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-10 flex flex-col items-center gap-2 text-center px-4">
          <ClipboardCheck className="w-8 h-8 text-gray-300" />
          <div className="tf-label">No active assessment for this job</div>
          <div className="tf-meta">
            Create and publish an assessment for this job from Assessments, then invite candidates here.
          </div>
        </div>
      ) : (
        <div
          className="space-y-2.5"
          role={multiple ? 'group' : 'radiogroup'}
          aria-label="Assessment versions"
        >
          {versions.map((a) => {
            const isSelected = selectedIds.includes(a.id);
            const version = versionOf(a);
            const rounds = ROUND_CHIPS.filter((r) => a[`${r.key}_enabled`]);
            const pick = () => onToggle(a);
            return (
              <div
                key={a.id}
                role={multiple ? 'checkbox' : 'radio'}
                aria-checked={isSelected}
                tabIndex={0}
                onClick={pick}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
                className={`flex items-center gap-3 sm:gap-4 rounded-xl border px-3 sm:px-4 py-3.5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-brand-blue/50 bg-brand-blue/[0.06] ring-1 ring-brand-blue/30'
                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:bg-brand-blue/5'
                }`}
              >
                {/* The AI Talent Match results table's own native checkbox
                    (`rounded border-gray-300`) — a native radio when only one
                    can be picked. Display only: the card is the control (its
                    role / aria-checked / keyboard handling above), so the input
                    takes no focus or clicks of its own. `m-0` drops the
                    browser's default input margin — uneven on a radio (no
                    bottom margin), which sat it off the card's centre line.

                    Level with the TITLE line (name + version pill), not with
                    the card's middle: centred on the whole card it sat between
                    the title and the details line under it. The wrapper is one
                    title line tall (`h-6`, the title row's `min-h-6` below) and
                    pinned to the top of the text column, so the box centres on
                    that line at every width — and on the first line when a
                    long name wraps. */}
                <span className="self-start h-6 flex items-center shrink-0">
                  <input
                    type={multiple ? 'checkbox' : 'radio'}
                    checked={isSelected}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    className={`${multiple ? 'rounded ' : ''}m-0 border-gray-300 pointer-events-none`}
                  />
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap min-h-6">
                    {/* The assessment's own name (its title, version suffix
                        stripped — the pill carries the version), so two
                        assessments of one job version read apart. */}
                    <span
                      className="min-w-0 tf-row-title sm:text-base [overflow-wrap:anywhere]"
                      title={a.title || undefined}
                    >
                      {parseAssessmentTitle(a.title || '').cleanTitle || 'Assessment'}
                    </span>
                    {/* The cyan assessment-version pill used across the
                        Assessments tables. */}
                    {/* Its own job version, only when the cards span several —
                        the pair is what tells two "Assessment V1"s apart. */}
                    {spansJobVersions && a.jd_version ? <VersionPill kind="job" version={a.jd_version} /> : null}
                    {version ? <VersionPill kind="assessment" version={version} /> : null}
                    {a.id === latestId && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue">
                        <Star className="w-3 h-3 fill-current" /> Latest
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-x-4 gap-y-1 flex-wrap tf-meta">
                    {a.created_at && (
                      <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatIST(a.created_at)}</span>
                    )}
                    {rounds.length > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" />
                        {rounds.map((round) => (
                          <span
                            key={round.key}
                            title={round.label}
                            className="tf-badge text-2xs bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20"
                          >
                            {round.short}
                          </span>
                        ))}
                      </span>
                    )}
                    {!!a.duration_minutes && (
                      <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{a.duration_minutes} mins</span>
                    )}
                    <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{a.invitations_count ?? 0} sent</span>
                    {a.created_by_name && (
                      <span className="inline-flex items-center gap-1 min-w-0"><User className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Created by {a.created_by_name}</span></span>
                    )}
                  </div>
                </div>

                <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg ring-1 bg-success-subtle text-success-strong ring-success-line">
                  {a.status === 'published' ? 'Active' : a.status}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPreview(a); }}
                  title="Preview assessment"
                  aria-label="Preview assessment"
                  className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-brand-blue hover:border-brand-blue/30 hover:bg-brand-blue/5 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {versions.length > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-brand-blue/5 border border-gray-200 dark:border-slate-700 px-4 py-3">
          <Info className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" />
          <div className="text-sm min-w-0">
            <div className="font-medium text-gray-900 dark:text-slate-100">
              {multiple
                ? 'You’re about to use the selected assessment versions to invite candidates.'
                : 'You’re about to use this assessment version to invite candidates.'}
            </div>
            <div className="tf-meta mt-0.5">
              {multiple
                ? 'Each candidate you invite receives every assessment version you select.'
                : 'Once selected, this version will be used for the candidate invitation.'}
            </div>
          </div>
        </div>
      )}

      {preview && (
        <AssessmentPreviewModal
          isOpen
          onClose={() => setPreview(null)}
          assessment={preview}
          /* Job Details hosts: the preview also names the assessment and job
             versions and which rounds (Coding included) are configured. */
          jobContext={jobVersionNumber !== undefined ? { jobVersionNumber } : undefined}
        />
      )}
    </div>
  );
}
