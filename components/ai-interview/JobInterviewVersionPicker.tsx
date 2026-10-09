'use client';

import { useState } from 'react';
import { Calendar, Clock, Eye, Info, Layers, Mail, Star, Timer, User, Video } from 'lucide-react';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { formatIST } from '@/lib/utils/dateUtils';
import { modeFromConfig } from '@/lib/constants/aiInterviewMode';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
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

/**
 * The interview picker for an invite that already knows its job (a candidate
 * opened from that job's AI Talent Match results): one card per interview
 * version of THAT job — radio, "Job V · Interview V", Latest tag, date,
 * rounds, duration, invitations — with its status. Only Active versions are
 * listed: drafts and archived ones can't take an invite.
 */
/** The version the cards tag "Latest": the job's newest Active interview —
 *  what a host pre-selects (and, with a single version, the only choice). */
export function latestActiveInterviewConfig(configs: AIInterviewResponse[], jobId: string): AIInterviewResponse | undefined {
  return jobInterviewConfigs(configs, jobId).find((c) => normalizeStatus(c.status) === 'published');
}

export default function JobInterviewVersionPicker({
  configs,
  jobId,
  selection,
  onSelectionChange,
}: {
  /** Every config the host loaded, any status — numbering needs them all. */
  configs: AIInterviewResponse[];
  /** The JD id the candidate was matched against. */
  jobId: string;
  selection: AIInterviewPickerSelection | null;
  onSelectionChange: (selection: AIInterviewPickerSelection | null) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const allVersions = jobInterviewConfigs(configs, jobId);
  // Only Active versions — the ones an invite can actually go out on.
  const versions = allVersions.filter((c) => normalizeStatus(c.status) === 'published');
  const latestActiveId = versions[0]?.id;
  // The job version the candidate was matched against — a config on that
  // exact JD row — else the newest one known for the job.
  const job = allVersions.find((c) => c.jd_id === jobId) ?? allVersions[0];

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Select Interview Version</span>
        {job?.jd_short_id && <JobIdBadge>{job.jd_short_id}</JobIdBadge>}
        {job && <span className="text-sm text-gray-600 dark:text-slate-400 truncate">{job.jd_title || job.position}</span>}
        {job && (
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20" title="Job version">
            Job V{job.jd_version ?? 1}
          </span>
        )}
      </div>

      {versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 py-10 flex flex-col items-center gap-2 text-center px-4">
          <Video className="w-8 h-8 text-gray-300" />
          <div className="text-sm font-medium text-gray-700 dark:text-slate-300">
            {allVersions.length === 0 ? 'No AI interview for this job yet' : 'No active interview version for this job'}
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400">
            {allVersions.length === 0
              ? 'Create an interview for this job from AI Interviews, then invite candidates here.'
              : 'Publish an interview version for this job from AI Interviews, then invite candidates here.'}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5" role="radiogroup" aria-label="Interview versions">
          {versions.map((c) => {
            const status = normalizeStatus(c.status);
            const pill = STATUS_PILL[status] ?? { label: status, className: STATUS_PILL.cancelled.className };
            const selectable = status === 'published';
            const isSelected = selection?.interviewId === c.id;
            const ivNum = interviewVersionOrdinal(c, configs);
            const rounds = (c.rounds_config || []).filter((r) => r.enabled !== false);
            const isFlexible = modeFromConfig(c.special_instructions, c.duration_minutes) === 'flexible';
            const pick = () => {
              if (!selectable) return;
              onSelectionChange(isSelected ? null : { jobKey: c.id, jdId: c.jd_id, interviewId: c.id });
            };
            return (
              <div
                key={c.id}
                role="radio"
                aria-checked={isSelected}
                aria-disabled={!selectable}
                tabIndex={selectable ? 0 : -1}
                onClick={pick}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
                className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-colors ${
                  isSelected
                    ? 'border-brand-blue/50 bg-brand-blue/[0.06] ring-1 ring-brand-blue/30'
                    : selectable
                      ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:bg-brand-blue/5 cursor-pointer'
                      : 'border-gray-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 opacity-70 cursor-not-allowed'
                }`}
              >
                {/* A native radio in the AI Talent Match results table's
                    checkbox chrome (`border-gray-300`). Display only: the card
                    is the control (role / aria-checked / keyboard above).
                    `m-0`: a radio's default margin is uneven (none below), which
                    sat it off the card's centre line.

                    Level with the TITLE line (Interview + version pill), not
                    with the card's middle — the Invite to Assessment cards'
                    fix: a wrapper one title line tall (`h-6`, the title row's
                    `min-h-6` below), pinned to the top of the text column. */}
                <span className="self-start h-6 flex items-center shrink-0">
                  <input
                    type="radio"
                    checked={isSelected}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    className="m-0 border-gray-300 pointer-events-none"
                  />
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap min-h-6">
                    <span className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Interview</span>
                    {/* Interview version as a badge — the cyan interview-version
                        pill used across the AI Interview tables. */}
                    <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20">
                      V{ivNum}
                    </span>
                    {c.id === latestActiveId && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue">
                        <Star className="w-3 h-3 fill-current" /> Latest
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-500 dark:text-slate-400">
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
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20"
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
                      <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />Created by {c.created_by_name}</span>
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
          <div className="text-sm">
            <div className="font-medium text-gray-900 dark:text-slate-100">You&apos;re about to use this interview version to invite candidates.</div>
            <div className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">Once selected, this version will be used for the candidate invitation.</div>
          </div>
        </div>
      )}

      {previewId && <ConfigurePreviewDialog configId={previewId} onClose={() => setPreviewId(null)} />}
    </div>
  );
}
