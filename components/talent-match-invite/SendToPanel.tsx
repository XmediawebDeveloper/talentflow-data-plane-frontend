'use client';

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CANDIDATE_SOURCE_LABEL, type InviteCandidate, type InviteCandidateSource, type InviteKind } from './inviteVersions';
import { CANDIDATE_NAME_PLACEHOLDER, EXPIRY_OPTIONS } from './inviteDefaults';
import { formatCandidateFirstName } from '@/lib/utils/candidateNameDisplay';
import FilterSelect from '@/components/ui/filter-select';

/* The AI Talent Match tab's rating badge tones. */
const ratingTone = (rank: number) =>
  rank >= 7 ? 'bg-success-subtle text-success-strong border-success-line'
    : rank >= 4 ? 'bg-warning-subtle text-warning-strong border-warning-line'
    : rank >= 1 ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-700'
    : 'bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700';

/* The Scored Resumes tab's match status tones. */
const matchTone = (status: string) =>
  status === 'Exact Match' ? 'bg-success-subtle text-success-strong border-success-line'
    : status === 'Partial Match' ? 'bg-warning-subtle text-warning-strong border-warning-line'
    : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-700';

const SECTION ='text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500';


/**
 * The invite popup's "who and how": the candidates ticked on the page that
 * opened it (untick to leave someone out; no email, no invite), then
 * `listSlot` (Select From lists + Manual / Upload Excel), the email message
 * and the link expiry. Copy Link is per row, so there is no delivery choice.
 */
export default function SendToPanel({
  kind,
  candidates,
  selectedIds,
  onSelectedIds,
  message,
  onMessage,
  expiryDays,
  onExpiry,
  listSlot,
}: {
  kind: InviteKind;
  /** Ticked on the opening page; [] = none (the list is then left out). */
  candidates: InviteCandidate[];
  selectedIds: string[];
  onSelectedIds: (ids: string[]) => void;
  message: string;
  onMessage: (message: string) => void;
  expiryDays: number;
  onExpiry: (days: number) => void;
  /** Select From (the server-paged lists) and Manual / Upload Excel. */
  listSlot?: ReactNode;
}) {
  /* The list, under the heading of where its candidates came from (the tab
     that opened the popup). */
  const groups: { source?: InviteCandidateSource; items: InviteCandidate[] }[] = [];
  for (const c of candidates) {
    const group = groups.find((g) => g.source === c.source);
    if (group) group.items.push(c);
    else groups.push({ source: c.source, items: [c] });
  }
  const eligible = candidates.filter((c) => c.email);
  const noEmail = candidates.length - eligible.length;
  const picked = eligible.filter((c) => selectedIds.includes(c.id)).length;
  const all = eligible.length > 0 && picked === eligible.length;
  const toggle = (id: string) =>
    onSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <div className="space-y-4">
      {candidates.length > 0 && (
      <section aria-labelledby="send-to-heading">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
          <h3 id="send-to-heading" className={SECTION}>Selected candidates · {picked} of {candidates.length}</h3>
          <div className="flex flex-wrap items-center gap-2">
          {eligible.length > 0 && (
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={all}
                ref={(el) => { if (el) el.indeterminate = picked > 0 && !all; }}
                onChange={() => onSelectedIds(all ? [] : eligible.map((c) => c.id))}
                className="m-0 rounded border-gray-300 cursor-pointer"
              />
              Select all
            </label>
          )}
          </div>
        </div>
        {(
          <ul className="rounded-lg border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60 max-h-64 overflow-y-auto">
            {groups.flatMap((g) => [
              ...(g.source ? [(
                <li key={`group-${g.source}`} className="sticky top-0 z-[1] flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  <span className="truncate">{CANDIDATE_SOURCE_LABEL[g.source]}</span>
                  <span className="shrink-0 tabular-nums">{g.items.length}</span>
                </li>
              )] : []),
              ...g.items.map((c) => {
              const hasEmail = !!c.email;
              const on = hasEmail && selectedIds.includes(c.id);
              return (
                <li key={c.id}>
                  <label className={`flex items-center gap-2.5 px-3 py-2 ${hasEmail ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800' : 'cursor-not-allowed'} ${on ? 'bg-blue-50 dark:bg-slate-800/50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!hasEmail}
                      onChange={() => toggle(c.id)}
                      aria-label={`Invite ${c.name}`}
                      className="m-0 shrink-0 rounded border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 dark:text-slate-50 truncate" title={c.name}>{kind === 'interview' ? formatCandidateFirstName(c.name) : c.name}</span>
                      <span className="block text-xs text-gray-500 dark:text-slate-400 truncate">
                        {hasEmail ? c.email : <span className="font-medium text-warning-strong">No email</span>}
                      </span>
                    </span>
                    {c.score === 'unscored' ? (
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-2xs font-medium border bg-gray-50 dark:bg-slate-800/50 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700">
                        Not scored
                      </span>
                    ) : c.score && (
                      <span
                        title={`Resume score ${c.score.percent}% · ${c.score.matchStatus}`}
                        className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-2xs font-semibold border tabular-nums ${matchTone(c.score.matchStatus)}`}
                      >
                        {c.score.percent}%<span className="hidden sm:inline font-medium">&nbsp;· {c.score.matchStatus}</span>
                      </span>
                    )}
                    {/* A scored-only candidate has no Talent Match rating:
                        its score chip stands alone rather than beside a "-". */}
                    {(c.rating || !c.score) && (
                      <span
                        title="Match rating"
                        className={`shrink-0 inline-flex items-center justify-center min-w-[1.75rem] px-1.5 py-0.5 rounded-md text-xs font-bold border ${ratingTone(c.rating || 0)}`}
                      >
                        {c.rating || '-'}
                      </span>
                    )}
                  </label>
                </li>
              );
            }),
            ])}
          </ul>
        )}
        {/* Said once, under the list: a candidate with no email is left out
            silently otherwise, and the recruiter assumes everyone was invited. */}
        {noEmail > 0 && (
          <p role="note" className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning-subtle border border-warning-line px-3 py-2 text-xs text-warning-strong">
            <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
            <span>
              {noEmail === 1 ? '1 candidate has' : `${noEmail} candidates have`} no email address and won’t be invited.
              Add an email to {noEmail === 1 ? 'their resume' : 'their resumes'} to include them.
            </span>
          </p>
        )}
      </section>
      )}

      {listSlot}

      <div>
          <label htmlFor={`invite-message-${kind}`} className={SECTION}>
            Email message
          </label>
          <textarea
            id={`invite-message-${kind}`}
            value={message}
            onChange={(e) => onMessage(e.target.value)}
            rows={4}
            placeholder="Added to the invitation email. Leave empty for the standard invitation."
            className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 dark:bg-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue resize-y"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Use <code className="px-1 rounded bg-gray-100 dark:bg-slate-800">{CANDIDATE_NAME_PLACEHOLDER}</code> for each candidate’s name. The secure link is added below the message.
          </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`invite-expiry-${kind}`} className={SECTION}>Link expiry</label>
        <FilterSelect
          id={`invite-expiry-${kind}`}
          value={String(expiryDays)}
          onChange={(v) => onExpiry(Number(v))}
          options={EXPIRY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          className="w-auto sm:w-auto text-sm px-2 sm:pl-2 sm:pr-2 py-1 sm:py-1 rounded-lg sm:rounded-lg text-gray-700 dark:text-slate-300"
        />
      </div>
    </div>
  );
}
