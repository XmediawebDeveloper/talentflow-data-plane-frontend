'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Lightbulb } from 'lucide-react';
import { CANDIDATE_SOURCE_LABEL, type DeliveryMethod, type InviteCandidate, type InviteCandidateSource, type InviteKind } from './inviteVersions';
import { formatCandidateFirstName } from '@/lib/utils/candidateNameDisplay';

/* The share modals' Link expiry options. */
const EXPIRY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1 day' },
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 0, label: 'No expiry' },
];

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
 * The split panel's right column: who it goes to (the candidates ticked on
 * the page — untick to leave someone out; no email, no invite), then the
 * optional message, delivery and link expiry.
 */
export default function SendToPanel({
  kind,
  candidates,
  selectedIds,
  onSelectedIds,
  method,
  onMethod,
  message,
  onMessage,
  expiryDays,
  onExpiry,
  candidatesOnly = false,
  addInNextStep = false,
  listSlot,
}: {
  kind: InviteKind;
  candidates: InviteCandidate[];
  selectedIds: string[];
  onSelectedIds: (ids: string[]) => void;
  method: DeliveryMethod;
  onMethod: (method: DeliveryMethod) => void;
  message: string;
  onMessage: (message: string) => void;
  expiryDays: number;
  onExpiry: (days: number) => void;
  /** Just the candidate list — the Browse all view, whose Send hands over to
   *  Share Assessment via Email (it has its own message and expiry). */
  candidatesOnly?: boolean;
  /** Next leads to the email step, which adds candidates itself (Manual,
   *  Upload Excel, Resume Database): nobody ticked is fine, and the panel
   *  says where to add them. */
  addInNextStep?: boolean;
  /** Job Details' Create / Send for a whole job: the server-paged picker
   *  (ServerCandidatePicker) stands in for the candidate list — it has its
   *  own heading, counts and Select all. The delivery, message and expiry
   *  controls below are unchanged. */
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
  /* An assessment invite is always emailed; its link is copyable from the
     results once sent. AI interviews can create a link without emailing.
     The reason is the disabled option's tooltip — no text under Delivery. */
  const linkOff = kind === 'assessment'
    ? 'Assessments are always emailed — copy each link from the results after sending'
    : undefined;

  return (
    <div className="space-y-4">
      {listSlot ?? (
      <section aria-labelledby="send-to-heading">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
          <h3 id="send-to-heading" className={SECTION}>Candidates · {picked} of {candidates.length}</h3>
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
        {candidates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-4 text-center text-sm text-gray-600 dark:text-slate-400">
            {addInNextStep
              ? 'No candidates ticked. Add them in the next step: manually, by uploading an Excel file, or from the Resume Database.'
              : 'No candidates selected. Close this panel and tick candidates in the results table.'}
          </p>
        ) : (
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
                        {c.phone ? ` · ${c.phone}` : ''}
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
        {/* The app's tip card (Upload Resumes, My Resumes, JD Creation…):
            brand-orange wash and border, lightbulb, "Tip:" lead. Only beside a
            list — an empty one already says where to add candidates. */}
        {addInNextStep && candidates.length > 0 && (
          <p className="mt-3 flex items-start gap-2.5 rounded-xl bg-brand-orange/[0.08] border border-brand-orange/20 px-3 py-2.5 text-xs sm:text-sm text-gray-700 dark:text-slate-300">
            <Lightbulb className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span className="min-w-0">
              <span className="font-semibold">Tip:</span> You can add more candidates in the next step: manually, by uploading an Excel file, or from the Resume Database.
            </span>
          </p>
        )}
      </section>
      )}

      {!candidatesOnly && (<>
      <fieldset>
        <legend className={`${SECTION} mb-1.5`}>Delivery</legend>
        <div className="inline-flex flex-wrap gap-x-4 gap-y-1.5">
          {([
            { key: 'email', label: 'Send via Email' },
            { key: 'link', label: 'Copy Invitation Link' },
          ] as const).map((m) => {
            const off = m.key === 'link' ? linkOff : undefined;
            return (
              <label key={m.key} title={off} className={`inline-flex items-center gap-2 text-sm ${off ? 'text-gray-400 cursor-not-allowed' : 'text-gray-800 dark:text-slate-200 cursor-pointer'}`}>
                <input
                  type="radio"
                  name={`invite-delivery-${kind}`}
                  checked={method === m.key}
                  disabled={!!off}
                  onChange={() => onMethod(m.key)}
                  className="m-0 border-gray-300"
                />
                {m.label}
              </label>
            );
          })}
        </div>
        {method === 'link' && !linkOff && (
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Creates each candidate’s personal link without emailing it — copy them from the results.</p>
        )}
      </fieldset>

      {method === 'email' && (
        <div>
          <label htmlFor={`invite-message-${kind}`} className={SECTION}>
            Message <span className="normal-case font-normal tracking-normal">(optional)</span>
          </label>
          <textarea
            id={`invite-message-${kind}`}
            value={message}
            onChange={(e) => onMessage(e.target.value)}
            rows={3}
            placeholder="Added to the invitation email. Leave empty for the standard invitation."
            className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 dark:bg-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue resize-y"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`invite-expiry-${kind}`} className={SECTION}>Link expiry</label>
        <select
          id={`invite-expiry-${kind}`}
          value={expiryDays}
          onChange={(e) => onExpiry(Number(e.target.value))}
          className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
        >
          {EXPIRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      </>)}
    </div>
  );
}
