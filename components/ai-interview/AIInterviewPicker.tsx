'use client';

import { useMemo, useState, type RefObject } from 'react';
import { Briefcase, CheckCircle, ChevronDown, Eye, Info, Layers, Search, Send, Video } from 'lucide-react';
import ListPagination from '@/components/ListPagination';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import AssessmentVersionHistoryPanel, {
  ASSESSMENT_VOCABULARY,
  type AssessmentVersionRow,
  type VersionHistoryVocabulary,
} from '@/components/assessments/AssessmentVersionHistoryPanel';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { modeFromConfig } from '@/lib/constants/aiInterviewMode';
import { formatIST } from '@/lib/utils/dateUtils';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import ConfigurePreviewDialog from './ConfigurePreviewDialog';

/**
 * The "pick one active AI interview" list shared by the AI Interview page's
 * Send Invite popup and the Invite to AI Interview flow (My Resumes, Scored
 * Resumes, resume view). Search, a Grouped/Ungrouped toggle, the single-pick
 * note, and then either:
 *   - Ungrouped: one row per active interview version (the Active tab's list
 *     view), radio + eye (Configure Details preview), pinned Select/Preview;
 *   - Grouped: one card per job (the Active tab's grouped view) with its
 *     Job Versions → Interview Versions panel in select mode.
 * Paged with the project's ListPagination. The host owns the selection and
 * everything around this list (dialog chrome, footer, Continue/Send).
 */

export interface AIInterviewPickerSelection {
  jobKey: string;
  jdId?: string;
  interviewId: string;
}

interface AIInterviewPickerProps {
  /** Every config the host has (any status) — the list shows the active ones;
   *  the rest keep interview-version numbers and job lineages correct. */
  configs: AIInterviewResponse[];
  selection: AIInterviewPickerSelection | null;
  onSelectionChange: (selection: AIInterviewPickerSelection | null) => void;
  /** The host dialog's scroller — pagination scrolls it back to the top. */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  searchLabel?: string;
}

export const ROUND_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'Technical',
  behavioral: 'Behavioral',
  culture_fit: 'Culture Fit',
  leadership: 'Leadership',
  problem_solving: 'Problem Solving',
  must_have_skills: 'Must-Have Skills',
  nice_to_have_skills: 'Nice-to-Have Skills',
};

export const ROUND_SHORT_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'TECH',
  behavioral: 'BEH',
  culture_fit: 'CF',
  leadership: 'LEAD',
  problem_solving: 'PS',
  must_have_skills: 'MHS',
  nice_to_have_skills: 'NHS',
};

// Candidate-flow statuses are still live, published configs.
const normalizeConfigStatus = (status: string) =>
  ['invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled'].includes(status) ? 'published' : status;

const getStatusLabel = (status: string) => {
  switch (normalizeConfigStatus(status)) {
    case 'published': return 'Active';
    case 'draft': return 'Draft';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'archived': return 'Archived';
    default: return status;
  }
};

const INTERVIEW_VOCABULARY: VersionHistoryVocabulary = {
  ...ASSESSMENT_VOCABULARY,
  childSingular: 'Interview',
  childPlural: 'Interviews',
  childVersionsHeading: 'Interview Versions',
  childNone: 'No interview',
  detailColumn: { label: 'Mode', minW: 'min-w-[130px]' },
  extraDetailColumn: { label: 'Rounds', minW: 'min-w-[170px]' },
  statusLabel: (status?: string) => getStatusLabel(String(status ?? '')),
};

export default function AIInterviewPicker({
  configs,
  selection,
  onSelectionChange,
  scrollContainerRef,
  searchLabel = 'Search Jobs',
}: AIInterviewPickerProps) {
  const [invitePickerSearch, setInvitePickerSearch] = useState('');
  const [invitePickerViewMode, setInvitePickerViewMode] = useState<'grouped' | 'ungrouped'>('ungrouped');
  const [invitePickerExpandedKey, setInvitePickerExpandedKey] = useState<string | null>(null);
  const [invitePickerPage, setInvitePickerPage] = useState(1);
  const [invitePickerPageSize, setInvitePickerPageSize] = useState(5);
  const [configurePreviewId, setConfigurePreviewId] = useState<string | null>(null);
  const invitePickerSelection = selection;
  const setInvitePickerSelection = onSelectionChange;
  const invitePickerScrollRef = scrollContainerRef;
  const jdLineage = useJobVersionLineage();

  /* Configs bucketed by job version (jd_id) — the panel's child rows, and the
     interview-version ordinal (oldest first within a job version). */
  const configsByJobVersionId = useMemo(() => {
    const byJobVersion = new Map<string, AIInterviewResponse[]>();
    for (const config of configs) {
      if (!config.jd_id) continue;
      const bucket = byJobVersion.get(config.jd_id);
      if (bucket) bucket.push(config);
      else byJobVersion.set(config.jd_id, [config]);
    }
    return byJobVersion;
  }, [configs]);
  const ordinalById = useMemo(() => {
    const map = new Map<string, number>();
    for (const bucket of configsByJobVersionId.values()) {
      bucket
        .slice()
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
        .forEach((config, index) => map.set(config.id, index + 1));
    }
    return map;
  }, [configsByJobVersionId]);

  const toInterviewVersionRow = (config: AIInterviewResponse, ordinal: number): AssessmentVersionRow => ({
    id: config.id,
    short_id: config.display_id,
    title: config.jd_title || config.position,
    version: ordinal,
    status: normalizeConfigStatus(config.status),
    created_at: config.created_at,
    created_by_name: config.created_by_name,
    invitations_count: config.invitations_count,
    jd_id: config.jd_id,
    jd_version: config.jd_version,
  });
  const interviewVersionRows = (jdId?: string, statusFilter?: 'published' | 'draft' | 'archived'): AssessmentVersionRow[] => {
    if (!jdId) return [];
    const lineage = jdLineage.lineages[jdId];
    if (!lineage) return [];
    const rows = lineage.flatMap((jobVersion) =>
      (configsByJobVersionId.get(jobVersion.id) ?? [])
        .slice()
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
        .map((config, index) => toInterviewVersionRow(config, index + 1)),
    );
    return statusFilter ? rows.filter((row) => row.status === statusFilter) : rows;
  };
  const configLineageKeyOf = (c: AIInterviewResponse) => c.jd_short_id || c.jd_id || `__unlinked__:${c.id}`;
  /** Job versions: the fetched lineage once loaded, else the newest known version. */
  const getJobVersionCount = (config: AIInterviewResponse) => {
    const fetched = config.jd_id ? jdLineage.lineages[config.jd_id] : undefined;
    if (fetched?.length) return fetched.length;
    const key = configLineageKeyOf(config);
    return Math.max(1, ...configs.filter((c) => configLineageKeyOf(c) === key).map((c) => c.jd_version ?? 1));
  };

  /* The Active tab's list view: one row per ACTIVE interview version
     (not one card per job), searchable by job title, Job ID or
     interview ID. Newest first, like that list. */
  const q = invitePickerSearch.trim().toLowerCase();
  const activeConfigs = configs
    .filter((c) => normalizeConfigStatus(c.status) === 'published')
    .sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime());
  const pickerRows = activeConfigs.filter((c) =>
    !q ||
    `${c.jd_title || ''} ${c.position || ''} ${c.display_id || ''} ${c.jd_short_id || ''}`
      .toLowerCase()
      .includes(q),
  );
  const interviewVersionOf = (c: AIInterviewResponse) => ordinalById.get(c.id) ?? 1;
  const PICKER_TH = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap bg-slate-50 dark:bg-slate-800';

  /* Grouped view — the original one-card-per-job picker. */
  /* One card per JOB, collapsed on the same lineage key the main list
     uses — jd_short_id names the job, jd_id names a single version — so
     this dialog lists jobs, not every version, exactly as the reference
     does. Representative pick: a non-draft over a draft, then the newest
     job version, then the most recently created config. */
  const lineageKeyOf = (c: AIInterviewResponse) =>
    c.jd_short_id || c.jd_id || `__unlinked__:${c.id}`;
  const isNewerVersion = (a: AIInterviewResponse, b: AIInterviewResponse) => {
    const aIsDraft = normalizeConfigStatus(a.status) === 'draft';
    const bIsDraft = normalizeConfigStatus(b.status) === 'draft';
    if (aIsDraft !== bIsDraft) return !aIsDraft;
    const jobDelta = (a.jd_version ?? 1) - (b.jd_version ?? 1);
    if (jobDelta !== 0) return jobDelta > 0;
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime > bTime;
  };
  const collapse = (list: AIInterviewResponse[]) => {
    const byLineage = new Map<string, AIInterviewResponse>();
    for (const config of list) {
      const key = lineageKeyOf(config);
      const current = byLineage.get(key);
      if (!current || isNewerVersion(config, current)) byLineage.set(key, config);
    }
    return [...byLineage.values()];
  };

  /* Filtered BEFORE the collapse so a job stays listed when the version
     that matched the search is not the one representing it. */
  const matching = activeConfigs.filter((c) =>
    !q ||
    `${c.jd_title || ''} ${c.position || ''} ${c.display_id || ''} ${c.jd_short_id || ''}`
      .toLowerCase()
      .includes(q),
  );
  const jobRows = collapse(matching);
  const jobCount = collapse(activeConfigs).length;
  /* The Active tab's job-row totals, over the same active configs. */
  const pickerJobTotals = new Map<string, { interviews: number; active: number; invitations: number }>();
  for (const c of activeConfigs) {
    const key = lineageKeyOf(c);
    const entry = pickerJobTotals.get(key) ?? { interviews: 0, active: 0, invitations: 0 };
    entry.interviews += 1;
    entry.active += 1;
    entry.invitations += c.invitations_count ?? 0;
    pickerJobTotals.set(key, entry);
  }

  const statusPillStyles: Record<string, string> = {
    published: 'bg-success-subtle text-success ring-success-line',
    draft: 'bg-brand-orange/10 text-brand-orange-deep dark:text-brand-orange ring-brand-orange/20',
    completed: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20',
    cancelled: 'bg-destructive-subtle text-destructive ring-destructive-line',
    archived: 'bg-brand-orange/10 text-brand-orange-deep dark:text-brand-orange ring-brand-orange/20',
  };
  const statusPillLabels: Record<string, string> = {
    published: 'Active', draft: 'Draft', completed: 'Completed', cancelled: 'Cancelled', archived: 'Archived',
  };

  const pickerTotal = invitePickerViewMode === 'ungrouped' ? pickerRows.length : jobRows.length;
  const pickerTotalPages = Math.max(1, Math.ceil(pickerTotal / invitePickerPageSize));
  const pickerSafePage = Math.min(Math.max(1, invitePickerPage), pickerTotalPages);
  const pageSlice = <T,>(list: T[]) =>
    list.slice((pickerSafePage - 1) * invitePickerPageSize, pickerSafePage * invitePickerPageSize);
  const pagedPickerRows = pageSlice(pickerRows);
  const pagedJobRows = pageSlice(jobRows);


  return (
    <>
      {/* Search */}
      <div className="mb-4">
        <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{searchLabel}</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            autoFocus
            value={invitePickerSearch}
            onChange={(e) => { setInvitePickerSearch(e.target.value); setInvitePickerPage(1); }}
            placeholder="Search by job title, Job ID or interview ID..."
            className="w-full pl-10 pr-4 py-2 text-sm text-black dark:text-slate-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
          />
        </div>
      </div>

      {/* Grouped/Ungrouped — the same toggle the Active/Draft/Archived
          tabs carry. Ungrouped: one row per active interview version.
          Grouped: one card per job, versions behind View Versions. */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-600 dark:text-slate-400">View:</span>
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
          {([
            { key: 'ungrouped', label: 'Ungrouped' },
            { key: 'grouped', label: 'Grouped' },
          ] as const).map((mode) => {
            const isActive = invitePickerViewMode === mode.key;
            return (
              <button
                key={mode.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => { setInvitePickerViewMode(mode.key); setInvitePickerSelection(null); setInvitePickerPage(1); }}
                className={`px-2.5 sm:px-3 py-1.5 min-h-[32px] rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/20 text-brand-blue'
                    : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">
          Select an Interview
          <span className="ml-2 font-normal text-gray-500 dark:text-slate-400">
            {invitePickerViewMode === 'ungrouped'
              ? `${pickerRows.length} active interview${pickerRows.length !== 1 ? 's' : ''}`
              : `${jobCount} job${jobCount !== 1 ? 's' : ''}`}
          </span>
        </label>
        {invitePickerSelection && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
              <CheckCircle className="w-3 h-3" />
              1 selected
            </span>
            <button
              onClick={() => setInvitePickerSelection(null)}
              className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {/* Why the pick is single — same banner style as the Score
          Resumes page's Job Eligibility note. */}
      <div className="mb-3 flex items-start gap-2 rounded-lg bg-brand-blue/[0.06] border border-brand-blue/20 px-3 py-2.5">
        <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900 dark:text-slate-100">One interview per invite</p>
          <p className="mt-0.5 text-xs text-gray-700 dark:text-slate-300">
            You can pick only one interview at a time, so everyone you invite gets the same interview. To invite people to a different interview, send another invite.
          </p>
        </div>
      </div>

      {invitePickerViewMode === 'ungrouped' ? (
      <>
      {pickerRows.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-slate-400">
          <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-700" />
          <p>{q ? 'No active interviews match your search' : 'No active interviews'}</p>
          <p className="text-sm">{q ? 'Try a different job title or Job ID.' : 'Publish an AI interview to invite candidates to it.'}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto scrollbar-visible">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-[6]">
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className={`${PICKER_TH} w-14 tf-sticky-col-left !bg-slate-50 dark:!bg-slate-800`}>Select</th>
                  <th className={PICKER_TH}>Job ID</th>
                  <th className={PICKER_TH}>Job Name</th>
                  <th className={PICKER_TH}>Job Version</th>
                  <th className={PICKER_TH}>Interview Version</th>
                  <th className={PICKER_TH}>Status</th>
                  <th className={PICKER_TH}>Rounds</th>
                  <th className={PICKER_TH}>Invitations Sent</th>
                  <th className={PICKER_TH}>Created On</th>
                  <th className={`${PICKER_TH} pr-6`}>Created By</th>
                  <th className={`${PICKER_TH} !text-center tf-sticky-col !bg-slate-50 dark:!bg-slate-800`}>Preview</th>
                </tr>
              </thead>
              <tbody>
                {pagedPickerRows.map((config) => {
                  const isSelected = invitePickerSelection?.interviewId === config.id;
                  const rounds = (config.rounds_config || []).filter((round) => round.enabled !== false);
                  const pick = () => setInvitePickerSelection(
                    isSelected ? null : { jobKey: config.id, jdId: config.jd_id, interviewId: config.id },
                  );
                  return (
                    <tr
                      key={config.id}
                      onClick={pick}
                      aria-selected={isSelected}
                      data-row-selected={isSelected ? 'true' : undefined}
                      className={`border-b border-gray-100 dark:border-slate-700/60 last:border-b-0 cursor-pointer transition-colors ${
                        isSelected ? 'bg-brand-blue/[0.06] dark:bg-brand-blue/15' : 'hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10'
                      }`}
                    >
                      <td className="px-3 py-2.5 align-middle tf-sticky-col-left">
                        <input
                          type="radio"
                          name="ai-interview-invite-picker-selection"
                          checked={isSelected}
                          onChange={pick}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${config.jd_title || config.position || 'interview'}`}
                          className="w-4 h-4 accent-brand-blue cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        {config.jd_short_id ? <JobIdBadge>{config.jd_short_id}</JobIdBadge> : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 align-middle max-w-[16rem]">
                        <span className="block truncate font-medium text-gray-900 dark:text-slate-50" title={config.jd_title || config.position || 'Untitled'}>
                          {config.jd_title || config.position || 'Untitled'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 text-brand-blue bg-brand-blue/10 ring-brand-blue/20">
                          V{config.jd_version ?? 1}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20">
                          V{interviewVersionOf(config)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 bg-success-subtle text-success ring-success-line">
                          <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                          Active
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        {rounds.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-nowrap">
                            {rounds.map((round, index) => (
                              <span
                                key={`${round.type}-${index}`}
                                title={ROUND_LABELS[round.type] || round.type}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold whitespace-nowrap bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30"
                              >
                                {ROUND_SHORT_LABELS[round.type] || ROUND_LABELS[round.type] || round.type}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                        <span className="tabular-nums text-gray-900 dark:text-slate-100">{(config.invitations_count ?? 0).toLocaleString()}</span>
                        <span className="text-xs text-gray-400 ml-1">sent</span>
                      </td>
                      <td className="px-3 py-2.5 align-middle whitespace-nowrap text-gray-600 dark:text-slate-400 tabular-nums">
                        {config.created_at ? formatIST(config.created_at) : '—'}
                      </td>
                      <td className="px-3 pr-6 py-2.5 align-middle whitespace-nowrap text-gray-600 dark:text-slate-400">
                        {config.created_by_name || 'System'}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-center tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setConfigurePreviewId(config.id)}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-brand-blue/10 hover:text-brand-blue hover:border-brand-blue/40 transition-colors"
                          aria-label="Preview interview configuration"
                          title="Preview"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      ) : (
      <>
      {jobRows.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-slate-400">
          <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-700" />
          <p>{q ? 'No jobs match your search' : 'No jobs found'}</p>
          <p className="text-sm">{q ? 'Try a different job title or Job ID.' : 'Create an AI interview against a job first.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pagedJobRows.map((config) => {
            const jobKey = lineageKeyOf(config);
            const jdId = config.jd_id;
            const ownsSelection = invitePickerSelection?.jobKey === jobKey;
            const dimmed = !!invitePickerSelection && !ownsSelection;
            const expanded = invitePickerExpandedKey === jobKey;
            const normalizedStatus = normalizeConfigStatus(config.status);
            const statusPill = statusPillStyles[normalizedStatus]
              || 'bg-slate-100 text-gray-700 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
            const statusPillLabel = statusPillLabels[normalizedStatus] || getStatusLabel(config.status);
            /* The Active tab's four job figures, in its order and colours. */
            const totals = pickerJobTotals.get(jobKey) ?? { interviews: 0, active: 0, invitations: 0 };
            const rowMetrics = [
              { key: 'job-versions', icon: Layers, iconClass: 'text-brand-blue', value: getJobVersionCount(config), label: 'Job Versions' },
              { key: 'interviews', icon: Video, iconClass: 'text-brand-cyan', value: totals.interviews, label: 'Interviews' },
              { key: 'invitations', icon: Send, iconClass: 'text-brand-orange', value: totals.invitations, label: 'Invitations Sent' },
              { key: 'active', icon: CheckCircle, iconClass: 'text-menu-icon-activate', value: totals.active, label: 'Completed' },
            ];
            const toggleExpanded = () => {
              if (!jdId) return;
              const opening = !expanded;
              setInvitePickerExpandedKey(opening ? jobKey : null);
              if (opening) jdLineage.ensureLoaded(jdId, jdId);
            };
            return (
              <div
                key={jobKey}
                /* Clicking the card opens its versions, as on the Active tab. */
                onClick={toggleExpanded}
                className={`@container/ai-row relative p-3 sm:p-4 rounded-xl border ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 transition-all duration-150 ${
                  jdId ? 'cursor-pointer' : 'cursor-default'
                } ${
                  ownsSelection
                    ? 'border-brand-blue/50 bg-brand-blue/[0.03] shadow-md shadow-brand-blue/10'
                    : `border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 ${dimmed ? 'opacity-60' : ''}`
                }`}
              >
                <div className="flex flex-col gap-3 @4xl/ai-row:flex-row @4xl/ai-row:items-center @4xl/ai-row:gap-4">
                  {/* Identity */}
                  <div className="flex items-center gap-2.5 min-w-0 @4xl/ai-row:w-[360px] @4xl/ai-row:flex-shrink-0">
                    <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Briefcase className="h-4 w-4 text-brand-blue" />
                    </div>
                    {config.jd_short_id && (
                      <JobIdBadge className="flex-shrink-0">{config.jd_short_id}</JobIdBadge>
                    )}
                    <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate min-w-0" title={config.jd_title || config.position || 'Untitled'}>
                      {config.jd_title || config.position || 'Untitled'}
                    </h3>
                  </div>

                  {/* Status */}
                  <div className="flex-shrink-0 @4xl/ai-row:w-[104px]">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ring-1 ${statusPill}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                      {statusPillLabel}
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4 sm:gap-x-0 sm:gap-y-0 @4xl/ai-row:flex-1 @4xl/ai-row:min-w-0">
                    {rowMetrics.map(({ key, icon: MetricIcon, iconClass, value, label }) => (
                      <div key={key} className="min-w-0 sm:px-3 sm:border-l sm:border-gray-100 dark:sm:border-slate-700/60 sm:first:border-l-0 sm:first:pl-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MetricIcon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
                          <span className="text-sm font-semibold text-gray-900 dark:text-slate-50 truncate">{value}</span>
                        </div>
                        <p className="text-2xs text-gray-500 dark:text-slate-500 truncate mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* View Versions toggle */}
                  <div
                    className="flex items-center flex-wrap gap-2 flex-shrink-0 self-start @4xl/ai-row:self-auto @4xl/ai-row:ml-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {jdId ? (
                      <button
                        type="button"
                        onClick={toggleExpanded}
                        title={expanded ? 'Hide version history' : 'View version history'}
                        aria-expanded={expanded}
                        className={`h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap border rounded-lg text-xs font-medium transition-all ${
                          expanded
                            ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30'
                            : 'bg-white dark:bg-slate-900 text-brand-blue border-brand-blue/30 hover:bg-brand-blue/5'
                        }`}
                      >
                        <span className="hidden sm:inline">{expanded ? 'Hide' : 'View'} Versions</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                    ) : (
                      /* No job lineage behind this config — pick it
                         directly, the way the old flat picker did. */
                      <button
                        type="button"
                        onClick={() => setInvitePickerSelection(ownsSelection ? null : { jobKey, jdId: undefined, interviewId: config.id })}
                        className={`h-8 px-3 inline-flex items-center gap-1.5 whitespace-nowrap border rounded-lg text-xs font-medium transition-all ${
                          ownsSelection
                            ? 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                            : 'bg-white dark:bg-slate-900 text-brand-blue border-brand-blue/30 hover:bg-brand-blue/5'
                        }`}
                      >
                        {ownsSelection ? <><CheckCircle className="w-3.5 h-3.5" />Selected</> : 'Select'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Interview versions — the shared panel in select mode.
                    Picking a radio records the job + interview version as
                    the dialog's single selection. */}
                {expanded && jdId && (
                  <div
                    className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/60 cursor-default"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AssessmentVersionHistoryPanel
                      jobVersions={jdLineage.lineages[jdId]}
                      jobVersionDetails={jdLineage.versionDetails}
                      assessments={interviewVersionRows(jdId, 'published')}
                      loading={jdLineage.isLoading(jdId)}
                      currentAssessmentId={config.id}
                      vocabulary={INTERVIEW_VOCABULARY}
                      selectionGroupName="ai-interview-invite-picker-selection"
                      selectedAssessmentId={ownsSelection ? invitePickerSelection?.interviewId : undefined}
                      onSelectAssessment={(interviewId) =>
                        setInvitePickerSelection({ jobKey, jdId, interviewId })
                      }
                      /* Mode and Rounds — the Active tab's two columns. */
                      renderChildDetail={(child) => {
                        const source = configsByJobVersionId.get(child.jd_id || '')
                          ?.find((candidate) => candidate.id === child.id);
                        if (!source) {
                          return <span className="text-sm text-gray-500 dark:text-slate-400">&mdash;</span>;
                        }
                        const mode = modeFromConfig(source.special_instructions, source.duration_minutes);
                        return (
                          <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
                            {mode === 'fixed' ? 'Timed' : 'Conversational'}
                          </span>
                        );
                      }}
                      renderChildExtraDetail={(child) => {
                        const source = configsByJobVersionId.get(child.jd_id || '')
                          ?.find((candidate) => candidate.id === child.id);
                        const rounds = (source?.rounds_config || []).filter((round) => round.enabled !== false);
                        if (rounds.length === 0) {
                          return <span className="text-sm text-gray-500 dark:text-slate-400">&mdash;</span>;
                        }
                        return (
                          <div className="flex items-center gap-1.5 flex-nowrap">
                            {rounds.map((round, index) => (
                              <span
                                key={`${round.type}-${index}`}
                                title={ROUND_LABELS[round.type] || round.type}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold whitespace-nowrap bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30"
                              >
                                {ROUND_SHORT_LABELS[round.type] || ROUND_LABELS[round.type] || round.type}
                              </span>
                            ))}
                          </div>
                        );
                      }}
                      /* Same Configure Details preview as the Ungrouped eye. */
                      onViewAssessment={(child) => setConfigurePreviewId(child.id)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {pickerTotal > 0 && (
        <ListPagination
          currentPage={pickerSafePage}
          itemsPerPage={invitePickerPageSize}
          totalItems={pickerTotal}
          onPageChange={setInvitePickerPage}
          onItemsPerPageChange={(size) => { setInvitePickerPageSize(size); setInvitePickerPage(1); }}
          itemLabel={invitePickerViewMode === 'ungrouped' ? 'interviews' : 'jobs'}
          scrollContainerRef={invitePickerScrollRef}
          compact
          alwaysShow
        />
      )}

      {configurePreviewId && (
        <ConfigurePreviewDialog configId={configurePreviewId} onClose={() => setConfigurePreviewId(null)} />
      )}
    </>
  );
}
