'use client';

import { useState } from 'react';
import { Calendar, Clock, Eye, Info, Layers, Mail, Star, Timer, User, Video } from 'lucide-react';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import { formatIST } from '@/lib/utils/dateUtils';
import { modeFromConfig } from '@/lib/constants/aiInterviewMode';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
import { isJdDisabled, JD_DISABLED_ACTION_MESSAGE } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { ROUND_LABELS, ROUND_SHORT_LABELS, type AIInterviewPickerSelection } from './AIInterviewPicker';
import ConfigurePreviewDialog from './ConfigurePreviewDialog';

// Candidate-flow statuses are still live, published configs (same rule as AIInterviewPicker).
const normalizeStatus = (status: string) =>
  ['invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled'].includes(status) ? 'published' : status;

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  published: { label: 'Active', className: 'bg-success-subtle text-success-strong ring-success-line' },
  draft: { label: 'Draft', className: 'bg-warning-subtle text-warning-strong ring-warning-line' },
  archived: { label: 'Archived', className: 'bg-destructive-subtle text-destructive ring-destructive-line' },
  completed: { label: 'Completed', className: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700' },
};

/** Every config of the job `jobId` names — across its job versions, which are
 *  separate JD rows sharing one short id — newest first. */
export function jobInterviewConfigs(configs: AIInterviewResponse[], jobId: string): AIInterviewResponse[] {
  const own = configs.filter((c) => c.jd_id === jobId);
  const shortIds = new Set(own.map((c) => c.jd_short_id).filter(Boolean));
  return configs
    .filter((c) => c.jd_id === jobId || (c.jd_short_id && shortIds.has(c.jd_short_id)))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

/** The cards actually listed, newest first — the Invite to Assessment cards'
 *  rule: the ACTIVE interviews of the matched job version (the `jobId` JD
 *  row) when it has any, else the job's other versions' active ones.
 *  Interview version numbers restart per job version, so listing every job
 *  version's interviews together showed several "V1" cards that read as
 *  duplicates. */
function listedJobInterviewConfigs(configs: AIInterviewResponse[], jobId: string): AIInterviewResponse[] {
  const active = jobInterviewConfigs(configs, jobId).filter((c) => normalizeStatus(c.status) === 'published');
  const ofMatchedVersion = active.filter((c) => c.jd_id === jobId);
  return ofMatchedVersion.length > 0 ? ofMatchedVersion : active;
}

/** The version the cards tag "Latest": the newest listed Active interview —
 *  what a host pre-selects (and, with a single version, the only choice). */
export function latestActiveInterviewConfig(configs: AIInterviewResponse[], jobId: string): AIInterviewResponse | undefined {
  // A disabled job's interview is listed but never pre-selected.
  return listedJobInterviewConfigs(configs, jobId).find((c) => !isJdDisabled(c.jd_status));
}

/**
 * The interview picker for an invite that already knows its job (candidates
 * opened from that job's Job Details or AI Talent Match results) — the
 * Invite to Assessment dialog's JobAssessmentVersionPicker, card for card:
 * one card per active interview version of THAT job with its pick control,
 * the interview's name (its position / job title) with its version pills and
 * Latest tag, then date, mode, rounds, duration, invitations sent and
 * creator, its status and a preview.
 */

export default function JobInterviewVersionPicker({
  configs,
  jobId,
  selection,
  onSelectionChange,
  multiple = false,
  selectedIds,
  onSelectedIdsChange,
  jobVersionNumber,
  onlyConfigId,
}: {
  /** Every config the host loaded, any status — numbering needs them all. */
  configs: AIInterviewResponse[];
  /** The JD id the candidate was matched against. */
  jobId: string;
  selection: AIInterviewPickerSelection | null;
  onSelectionChange: (selection: AIInterviewPickerSelection | null) => void;
  /** Opt-in multi-select (the Job Details invite, as the assessment cards'
   *  `multiple`): a card click adds / removes it from `selectedIds` instead
   *  of replacing `selection`. */
  multiple?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  /** That JD row's own job version, when the host knows it (Job Details) —
   *  heads the list instead of a config's `jd_version` snapshot, as the
   *  assessment cards do. */
  jobVersionNumber?: number;
  /** Given (Job Details), the cards are just this interview — the job
   *  version's mapped one; null lists none. Omitted, the usual rule. */
  onlyConfigId?: string | null;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const allVersions = jobInterviewConfigs(configs, jobId);
  // Only Active versions — the ones an invite can actually go out on — of the
  // matched job version first (see listedJobInterviewConfigs).
  const versions = onlyConfigId === undefined
    ? listedJobInterviewConfigs(configs, jobId)
    : configs.filter((c) => c.id === onlyConfigId);
  /* Only when the matched job version has none are the job's other versions
     listed — each card then names its own job version. */
  const spansJobVersions = new Set(versions.map((c) => c.jd_id)).size > 1;
  const latestActiveId = versions[0]?.id;
  // The job version the candidate was matched against — a config on that
  // exact JD row — else the newest one known for the job.
  const job = allVersions.find((c) => c.jd_id === jobId) ?? versions[0] ?? allVersions[0];

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="tf-row-title">
          {multiple ? 'Select Interview Versions' : 'Select Interview Version'}
        </span>
        {job?.jd_short_id && <JobIdBadge>{job.jd_short_id}</JobIdBadge>}
        {job && (job.jd_title || job.position) && <span className="min-w-0 tf-body-secondary truncate">{job.jd_title || job.position}</span>}
        {job && !spansJobVersions && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20" title="Job version">
            V{jobVersionNumber ?? job.jd_version ?? 1}
          </span>
        )}
      </div>

      {versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-10 flex flex-col items-center gap-2 text-center px-4">
          <Video className="w-8 h-8 text-gray-300" />
          <div className="tf-label">
            {allVersions.length === 0 ? 'No AI interview for this job yet' : 'No active interview version for this job'}
          </div>
          <div className="tf-meta">
            {allVersions.length === 0
              ? 'Create an interview for this job from AI Interviews, then invite candidates here.'
              : 'Publish an interview version for this job from AI Interviews, then invite candidates here.'}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5" role={multiple ? 'group' : 'radiogroup'} aria-label="Interview versions">
          {versions.map((c) => {
            const status = normalizeStatus(c.status);
            const pill = STATUS_PILL[status] ?? { label: status, className: STATUS_PILL.cancelled.className };
            const jdDisabled = isJdDisabled(c.jd_status);
            const selectable = status === 'published' && !jdDisabled;
            const isSelected = multiple ? (selectedIds ?? []).includes(c.id) : selection?.interviewId === c.id;
            const ivNum = interviewVersionOrdinal(c, configs);
            const rounds = (c.rounds_config || []).filter((r) => r.enabled !== false);
            const isFlexible = modeFromConfig(c.special_instructions, c.duration_minutes) === 'flexible';
            const pick = () => {
              if (!selectable) return;
              if (multiple) {
                const ids = selectedIds ?? [];
                onSelectedIdsChange?.(isSelected ? ids.filter((id) => id !== c.id) : [...ids, c.id]);
                return;
              }
              onSelectionChange(isSelected ? null : { jobKey: c.id, jdId: c.jd_id, interviewId: c.id });
            };
            return (
              <div
                key={c.id}
                role={multiple ? 'checkbox' : 'radio'}
                aria-checked={isSelected}
                aria-disabled={!selectable}
                title={jdDisabled ? JD_DISABLED_ACTION_MESSAGE : undefined}
                tabIndex={selectable ? 0 : -1}
                onClick={pick}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
                className={`flex items-center gap-3 sm:gap-4 rounded-xl border px-3 sm:px-4 py-3.5 transition-colors ${
                  isSelected
                    ? 'border-brand-blue/50 bg-brand-blue/[0.06] ring-1 ring-brand-blue/30'
                    : selectable
                      ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:bg-brand-blue/5 cursor-pointer'
                      : 'border-gray-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 opacity-70 cursor-not-allowed'
                }`}
              >
                {/* A native checkbox in the AI Talent Match results table's
                    checkbox chrome (`border-gray-300`). Display only: the card
                    is the control (role / aria-checked / keyboard above).
                    `m-0`: the box's default margin is uneven (none below), which
                    sat it off the card's centre line.

                    Level with the TITLE line (name + version pills), not
                    with the card's middle — the Invite to Assessment cards'
                    fix: a wrapper one title line tall (`h-6`, the title row's
                    `min-h-6` below), pinned to the top of the text column. */}
                <span className="self-start h-6 flex items-center shrink-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    className="rounded m-0 border-gray-300 pointer-events-none"
                  />
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap min-h-6">
                    {/* The interview's own name — the position / job title it
                        was configured for (an interview config has no title
                        of its own) — as the assessment cards lead with the
                        assessment's name; the pills carry the versions. */}
                    <span
                      className="min-w-0 tf-row-title sm:text-base [overflow-wrap:anywhere]"
                      title={c.display_id ? `${c.position || c.jd_title || 'AI Interview'} (${c.display_id})` : undefined}
                    >
                      {c.position || c.jd_title || 'AI Interview'}
                    </span>
                    {/* Its own job version, only when the cards span several —
                        the pair is what tells two "V1"s apart. */}
                    {spansJobVersions && c.jd_version ? <VersionPill kind="job" version={c.jd_version} /> : null}
                    {/* The cyan version pill the assessment cards use. */}
                    <VersionPill kind="assessment" version={ivNum} />
                    {c.id === latestActiveId && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue">
                        <Star className="w-3 h-3 fill-current" /> Latest
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-x-4 gap-y-1 flex-wrap tf-meta">
                    {/* Created date with its time. */}
                    {c.created_at && (
                      <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatIST(c.created_at)}</span>
                    )}
                    {/* Mode — Timed or Conversational. */}
                    <span className="inline-flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{isFlexible ? 'Conversational' : 'Timed'}</span>
                    {/* The rounds themselves (HR / MHS / NHS …), not just a count. */}
                    {rounds.length > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" />
                        {rounds.map((round, index) => (
                          <span
                            key={`${round.type}-${index}`}
                            title={ROUND_LABELS[round.type] || round.type}
                            className="tf-badge text-2xs bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20"
                          >
                            {ROUND_SHORT_LABELS[round.type] || ROUND_LABELS[round.type] || round.type}
                          </span>
                        ))}
                      </span>
                    )}
                    {/* Duration — a conversational interview has no fixed length. */}
                    {!isFlexible && !!c.duration_minutes && (
                      <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{c.duration_minutes} mins</span>
                    )}
                    <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{c.invitations_count ?? 0} sent</span>
                    {c.created_by_name && (
                      <span className="inline-flex items-center gap-1 min-w-0"><User className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Created by {c.created_by_name}</span></span>
                    )}
                  </div>
                </div>

                <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg ring-1 ${pill.className}`}>{pill.label}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPreviewId(c.id); }}
                  title="Preview interview"
                  aria-label="Preview interview"
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
                ? 'You’re about to use the selected interview versions to invite candidates.'
                : 'You’re about to use this interview version to invite candidates.'}
            </div>
            <div className="tf-meta mt-0.5">
              {multiple
                ? 'Each candidate you invite receives every interview version you select.'
                : 'Once selected, this version will be used for the candidate invitation.'}
            </div>
          </div>
        </div>
      )}

      {previewId && <ConfigurePreviewDialog configId={previewId} onClose={() => setPreviewId(null)} />}
    </div>
  );
}
