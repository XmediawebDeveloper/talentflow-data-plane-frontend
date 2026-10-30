'use client';

import type { ReactNode } from 'react';
import { Calendar, Clock, Eye } from 'lucide-react';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import NameAvatar from '@/components/ui/name-avatar';

/* ── Candidate result card ─────────────────────────────────────────────────
   The Candidate Results tab's card (Assessments page, Card View), lifted out so
   the per-assessment Result page's Grid View draws the same card instead of a
   second design. Presentational only: each page maps its own row shape onto
   these props and keeps its own status badge, open handler and extra actions. */

export interface CandidateResultCardScore {
  label: string;
  /** A missing score is an empty track and a dash — "not run", never zero. */
  value?: number | null;
}

export interface CandidateResultCardProps {
  name?: string | null;
  email?: string | null;
  cid?: string | null;
  jobShortId?: string | null;
  jobTitle?: string | null;
  jobVersion?: number | null;
  assessmentVersion?: number | null;
  resumeVersion?: number | null;
  /** The host page's own status badge for this row. */
  statusBadge?: ReactNode;
  scores: CandidateResultCardScore[];
  /** The mark a round counts as passed at. */
  passMark: number;
  /** How the score figure is printed; the bar itself always uses the raw value. */
  formatScore?: (value: number) => string | number;
  inviteSource?: ReactNode;
  phone?: string | null;
  duration: ReactNode;
  date: ReactNode;
  onOpen: () => void;
  /** A row checkbox, for pages whose cards can be ticked for a bulk action. */
  selection?: { checked: boolean; onChange: (checked: boolean) => void };
  /** Further action buttons, beside View Result. */
  actions?: ReactNode;
  /** Drop the View Result button (the card itself still opens the result on
   *  click) — for hosts whose `actions` is a row menu that already has it. */
  hideViewButton?: boolean;
}

export default function CandidateResultCard({
  name,
  email,
  cid,
  jobShortId,
  jobTitle,
  jobVersion,
  assessmentVersion,
  resumeVersion,
  statusBadge,
  scores,
  passMark,
  formatScore = (value) => value,
  inviteSource,
  phone,
  duration,
  date,
  onOpen,
  selection,
  actions,
  hideViewButton = false,
}: CandidateResultCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      title={`View ${name || 'candidate'}'s result`}
      className={`text-left bg-white dark:bg-slate-900 rounded-xl border ring-1 shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 sm:p-5 flex flex-col gap-4 h-full cursor-pointer min-w-0 ${
        selection?.checked
          ? 'border-brand-blue/30 ring-brand-blue/20'
          : 'border-gray-100 dark:border-slate-700/60 ring-black/[0.02]'
      }`}
    >
      <div className="flex items-center gap-3">
        {selection && (
          <input
            type="checkbox"
            checked={selection.checked}
            onChange={(e) => selection.onChange(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${name || 'candidate'}`}
            className="w-4 h-4 shrink-0 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
          />
        )}
        <NameAvatar name={name} fallback={email} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-gray-900 dark:text-slate-50 truncate" title={name || 'Unknown'}>
            {name || 'Unknown'}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500 truncate" title={email || undefined}>
            {email || '—'}
          </p>
        </div>
        {cid && (
          <span className="self-start text-2xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded shrink-0">
            {cid}
          </span>
        )}
      </div>

      {/* Job, then its versions and the status — one section, the badges a
          step under the title. */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {jobShortId && <JobIdBadge className="shrink-0">{jobShortId}</JobIdBadge>}
          <span className="truncate text-sm font-medium text-gray-900 dark:text-slate-50" title={jobTitle || undefined}>
            {jobTitle || '—'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {jobVersion ? <VersionPill kind="job" version={jobVersion} label="Job" /> : null}
          {assessmentVersion ? <VersionPill kind="assessment" version={assessmentVersion} label="Assessment" /> : null}
          {resumeVersion ? (
            <span className="inline-flex shrink-0 whitespace-nowrap items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30" title="Resume Version">
              Resume V{resumeVersion}
            </span>
          ) : null}
          {statusBadge}
        </div>
      </div>

      {/* Scores as progress bars — the Invitation Status "Completion rate" bar
          (grey track, solid fill), filled in the score's own pass / fail
          colour, with the figure and its Pass / Fail tag above it. */}
      {scores.length > 0 && (
        <div className="space-y-3">
          {scores.map(({ label, value }) => {
            const scored = typeof value === 'number';
            const passed = scored && value >= passMark;
            return (
              <div key={label}>
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="min-w-0 truncate text-2xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">{label}</span>
                  {scored ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className={`text-sm font-medium ${passed ? 'text-brand-blue' : 'text-destructive'}`}>
                        {formatScore(value)}%
                      </span>
                      <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${passed ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
                        {passed ? 'Pass' : 'Fail'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">&mdash;</span>
                  )}
                </div>
                <div
                  className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"
                  role="progressbar"
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={scored ? Math.round(value) : undefined}
                >
                  {scored && (
                    <div
                      className={`h-full rounded-full transition-all ${passed ? 'bg-brand-blue' : 'bg-destructive'}`}
                      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(inviteSource || phone) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600 dark:text-slate-400">
          {inviteSource}
          {phone && <span className="min-w-0 max-w-full truncate">{phone}</span>}
        </div>
      )}

      {/* Pinned to the bottom, so a row of cards ends level however much each
          one above holds. */}
      <div className="mt-auto space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-slate-500 pt-3 border-t border-gray-100 dark:border-slate-800">
          <span className="flex items-center gap-1.5 shrink-0">
            <Clock className="w-3 h-3 flex-shrink-0" />
            {duration}
          </span>
          <span className="flex items-center gap-1.5 min-w-0">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{date}</span>
          </span>
        </div>

        <div className={`flex items-center gap-2${hideViewButton ? ' justify-end' : ''}`} onClick={(e) => e.stopPropagation()}>
          {!hideViewButton && (
          <button
            type="button"
            onClick={onOpen}
            title="View Result"
            className="flex flex-1 min-w-0 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors"
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            View Result
          </button>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}

/** An extra icon action for the card's bottom row, in the View Result
 *  button's own tint, so it reads as the same control. */
export const CANDIDATE_RESULT_CARD_ICON_ACTION_CLASS =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
