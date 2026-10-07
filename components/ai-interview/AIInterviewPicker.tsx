'use client';

import { useMemo, useState, type RefObject } from 'react';
import { Briefcase, CheckCircle, Eye, Info, Search } from 'lucide-react';
import ListPagination from '@/components/ListPagination';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { formatIST } from '@/lib/utils/dateUtils';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import ConfigurePreviewDialog from './ConfigurePreviewDialog';

/**
 * The "pick one active AI interview" list shared by the AI Interview page's
 * Send Invite popup and the Invite to AI Interview flow (My Resumes, Scored
 * Resumes, resume view). Search, the single-pick note, and one row per
 * active interview version (the Active tab's list view), radio + eye
 * (Configure Details preview), pinned Select/Preview.
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

export default function AIInterviewPicker({
  configs,
  selection,
  onSelectionChange,
  scrollContainerRef,
  searchLabel = 'Search Jobs',
}: AIInterviewPickerProps) {
  const [invitePickerSearch, setInvitePickerSearch] = useState('');
  const [invitePickerPage, setInvitePickerPage] = useState(1);
  const [invitePickerPageSize, setInvitePickerPageSize] = useState(10);
  const [configurePreviewId, setConfigurePreviewId] = useState<string | null>(null);
  const invitePickerSelection = selection;
  const setInvitePickerSelection = onSelectionChange;
  const invitePickerScrollRef = scrollContainerRef;

  /* Interview-version ordinal — oldest first within a job version (jd_id). */
  const ordinalById = useMemo(() => {
    const byJobVersion = new Map<string, AIInterviewResponse[]>();
    for (const config of configs) {
      if (!config.jd_id) continue;
      const bucket = byJobVersion.get(config.jd_id);
      if (bucket) bucket.push(config);
      else byJobVersion.set(config.jd_id, [config]);
    }
    const map = new Map<string, number>();
    for (const bucket of byJobVersion.values()) {
      bucket
        .slice()
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
        .forEach((config, index) => map.set(config.id, index + 1));
    }
    return map;
  }, [configs]);

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

  const pickerTotal = pickerRows.length;
  const pickerTotalPages = Math.max(1, Math.ceil(pickerTotal / invitePickerPageSize));
  const pickerSafePage = Math.min(Math.max(1, invitePickerPage), pickerTotalPages);
  const pagedPickerRows = pickerRows.slice(
    (pickerSafePage - 1) * invitePickerPageSize,
    pickerSafePage * invitePickerPageSize,
  );

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

      <div className="flex items-center justify-between gap-2 mb-3">
        <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">
          Select an Interview
          <span className="ml-2 font-normal text-gray-500 dark:text-slate-400">
            {`${pickerRows.length} active interview${pickerRows.length !== 1 ? 's' : ''}`}
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

      {pickerTotal > 0 && (
        <ListPagination
          currentPage={pickerSafePage}
          itemsPerPage={invitePickerPageSize}
          totalItems={pickerTotal}
          onPageChange={setInvitePickerPage}
          onItemsPerPageChange={(size) => { setInvitePickerPageSize(size); setInvitePickerPage(1); }}
          itemLabel="interviews"
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
