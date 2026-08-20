'use client';

import type { LucideIcon } from 'lucide-react';
import {
  X, Mail, Play, CheckCircle, Clock, Ban, Copy, Loader2, Users, Eye, Pencil,
  MoreVertical, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatIST } from '@/lib/utils/dateUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The candidate list for an AI interview's invite tracker.
 *
 * One implementation for both entry points: the AI Interviews page's own popup
 * (full actions — resend, edit, revoke, bulk select, view details) and the Job
 * Details page's read-only tracker, which simply passes no action callbacks.
 * They used to be two separate renderings of the same data — a stacked card list
 * on one page and a table on the other — so a recruiter saw different columns,
 * different wording and different action rules depending on where they opened
 * tracking from.
 *
 * Layout mirrors the assessment tracker: a horizontally scrolling shell with a
 * sticky header and a pinned Actions column on desktop, stacked cards on phones.
 */

/* ── Status helpers ────────────────────────────────────────────────────
   Exported because the host page needs the same eligibility rules for its
   bulk-select bar; two copies of these rules is how the action buttons and the
   checkboxes drifted out of agreement in the first place. */

/** Client-side expiry check, in case the backend hasn't flipped status yet. */
export const resolveInviteStatus = (inv: any): string => {
  if (
    ['invited', 'scheduled', 'draft'].includes(inv.status) &&
    inv.expires_at &&
    new Date(inv.expires_at) < new Date()
  ) {
    return 'expired';
  }
  return inv.status;
};

/**
 * Secondary "Expired" flag, shown next to the base badge when an invite passed
 * its deadline without reaching a terminal state. Covers the candidate who
 * started the system check but never started the interview. Once a unit has been
 * consumed (the candidate actually started), expiry no longer applies.
 */
export const isInviteExpired = (inv: any): boolean => {
  if (['completed', 'cancelled', 'terminated', 'expired', 'revoked'].includes(inv.status)) return false;
  if (inv.unit_consumed) return false;
  return !!(inv.expires_at && new Date(inv.expires_at) < new Date());
};

/**
 * Single source of truth for "treat this row as expired when deciding actions".
 * Both halves are needed: resolveInviteStatus catches the backend flipping
 * status to 'expired' and a still-'invited' row whose deadline lapsed, while
 * isInviteExpired additionally catches a row that moved past invitation
 * (system_check, say) but was abandoned before starting and is now past expiry —
 * resolveInviteStatus doesn't relabel those, so without this half they'd fall
 * through every condition below and render with no actions at all.
 */
export const isExpiredForActions = (inv: any): boolean =>
  resolveInviteStatus(inv) === 'expired' || isInviteExpired(inv);

/**
 * Revocable — and therefore bulk-selectable. Hidden once the candidate accepted
 * Consent & Terms and entered the interview process (system_check/in_progress),
 * engaged with the interview (completed/terminated), the invite was abandoned
 * pre-send (cancelled), it is already revoked, or the link expired (only Resend
 * is offered at that point).
 */
export const isRevocableInvite = (inv: any): boolean =>
  !['system_check', 'in_progress', 'completed', 'terminated', 'cancelled', 'revoked'].includes(inv.status) &&
  !isExpiredForActions(inv);

/** Edit and Revoke appear together; Edit only ever enables once revoked. */
const canEditOrRevoke = (inv: any): boolean =>
  !['system_check', 'in_progress', 'completed', 'terminated', 'cancelled'].includes(inv.status) &&
  !isExpiredForActions(inv);

/**
 * Resend covers an invited row (regenerates the token), a revoked one
 * (reactivates and issues a fresh token) and an expired one — however it expired
 * — as long as the candidate hasn't already started or completed.
 */
const canResendInvite = (inv: any): boolean =>
  (resolveInviteStatus(inv) === 'invited' || inv.status === 'revoked' || isExpiredForActions(inv)) &&
  !inv.started_at &&
  !inv.completed_at;

export const isInterviewLinkLive = (inv: any): boolean =>
  !!inv.interview_token &&
  !['completed', 'cancelled', 'terminated', 'expired', 'revoked'].includes(resolveInviteStatus(inv)) &&
  !isInviteExpired(inv);

/**
 * The Match Score from the candidate's Evaluation Report, or null for a dash.
 *
 * `capability_score` IS that number, not a proxy for it: the adapter documents
 * it as "section avg / planned x 10" — the same quantity the Evaluation Report
 * headline shows — and carries a parity guard stating the report must equal
 * `Math.round(capability_score)` (evaluation-dashboard/adapter.ts, "PARITY
 * GUARD"). Rounded here for the same reason it is rounded there, so 17.5 reads
 * as 18 on both screens.
 *
 * Deliberately no fallback to any other field. This used to read
 * `?? inv.score`, which is a different number: when the row arrived without an
 * evaluation — not interviewed yet, evaluation still running, or a compact
 * payload that omits it — the column quietly showed that instead of admitting
 * it had no Match Score, and the two screens disagreed. Absent means dash.
 *
 * A partial evaluation counts as absent: the report withholds its Match Score
 * block entirely while `isPartialEvaluation` is set (OverviewSectionV2), so
 * showing a number here would be showing one the report refuses to.
 */
export const displayInviteScore = (inv: any): number | null => {
  const evaluation = inv?.ai_evaluation;
  if (!evaluation) return null;
  if (evaluation.partial === true || evaluation.evaluation_incomplete === true) return null;

  const raw = evaluation.capability_score;
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : null;
};

const initialsOf = (name: string | null | undefined): string =>
  (name || '?')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const copyInterviewLink = async (inv: any) => {
  const link = `${window.location.origin}/ai-interview/${inv.interview_token}`;
  await navigator.clipboard.writeText(link);
  toast.success('Interview link copied!');
};

/** Milestones oldest-first, every one on its own line — the same treatment the
 *  assessment tracker gives its timeline. */
const timelineEvents = (inv: any) => {
  const out: { label: string; at: string; Icon: LucideIcon; tone: string }[] = [];
  if (inv.created_at) out.push({ label: 'Invited', at: inv.created_at, Icon: Mail, tone: 'text-brand-blue' });
  if (inv.started_at) out.push({ label: 'Started', at: inv.started_at, Icon: Play, tone: 'text-brand-orange-deep' });
  if (inv.completed_at) out.push({ label: 'Completed', at: inv.completed_at, Icon: CheckCircle, tone: 'text-green-600' });
  if (inv.revoked_at) out.push({ label: 'Revoked', at: inv.revoked_at, Icon: Ban, tone: 'text-red-600' });

  /* expires_at holds the deadline; it is surfaced as the moment of expiry once
     that deadline passed on an interview that never completed. Without it a
     lapsed invite shows only "Invited". */
  const status = (inv.status || '').toLowerCase();
  const clockExpired =
    !inv.started_at && !inv.unit_consumed && inv.expires_at && new Date(inv.expires_at) < new Date();
  if (!inv.completed_at && (status === 'expired' || clockExpired) && inv.expires_at) {
    out.push({ label: 'Expired at', at: inv.expires_at, Icon: Clock, tone: 'text-brand-orange-deep' });
  }

  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
};

/** Badge wording and colours kept in one place so a recruiter reads the same
 *  status regardless of where tracking was opened from. */
export const AIInviteStatusBadge = ({ inv }: { inv: any }) => {
  const base =
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap flex-shrink-0 ring-1';
  switch (inv.status) {
    case 'completed': {
      // (Auto) surfaces when the timeout monitor finalized an abandoned session —
      // closing_reason starts with 'time_limit' (ai_interview_timeout_monitor.py).
      const reason: string = (inv.ai_evaluation?.closing_reason || '').toString().toLowerCase();
      const autoCompleted = reason.startsWith('time_limit');
      return (
        <span
          className={`${base} bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300 ring-green-200 dark:ring-green-500/25`}
          title={autoCompleted ? 'Auto-completed when the interview duration elapsed' : undefined}
        >
          <CheckCircle className="w-3 h-3" /> Completed
          {autoCompleted && <span className="text-green-600/80 dark:text-green-400/80">(Auto)</span>}
        </span>
      );
    }
    case 'in_progress':
      return <span className={`${base} bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20`}><Play className="w-3 h-3" /> In Progress</span>;
    case 'invited':
      return <span className={`${base} bg-brand-blue/10 text-brand-blue ring-brand-blue/20`}><Mail className="w-3 h-3" /> Invited</span>;
    case 'cancelled':
      return <span className={`${base} bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-500/25`}><X className="w-3 h-3" /> Cancelled</span>;
    case 'terminated':
      return (
        <span
          className={`${base} bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-500/25`}
          title="Auto-ended by the proctoring policy — candidate left the interview screen"
        >
          <Ban className="w-3 h-3" /> Terminated
        </span>
      );
    case 'expired':
      return <span className={`${base} bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20`}><Clock className="w-3 h-3" /> Expired</span>;
    case 'revoked':
      return (
        <span
          className={`${base} bg-slate-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300 ring-gray-300 dark:ring-slate-600`}
          title="Revoked by recruiter — the old link no longer works"
        >
          <Ban className="w-3 h-3" /> Revoked
        </span>
      );
    default:
      return <span className={`${base} bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-gray-200 dark:ring-slate-700`}><Clock className="w-3 h-3" /> {inv.status || 'Pending'}</span>;
  }
};

/** Percentage cell for the Score column. null renders an
 *  em dash — the round wasn't run, isn't scored yet, or the evaluation carries no
 *  per-round breakdown. 60 is the same pass mark the overall Score column uses. */
const ScoreCell = ({ value }: { value: number | null }) =>
  value != null ? (
    <span className={`font-semibold ${value >= 60 ? 'text-green-600' : 'text-red-600'}`}>{value}%</span>
  ) : (
    <span className="text-gray-400 dark:text-slate-500">—</span>
  );

interface RowAction {
  key: string;
  label: string;
  Icon: LucideIcon;
  run: () => void;
  disabled?: boolean;
  title?: string;
  destructive?: boolean;
  busy?: boolean;
}

export interface AIInterviewInviteTableProps {
  invitations: any[];
  isLoading: boolean;
  /** Drives the empty-state wording — a filtered-to-nothing list is not "none invited". */
  hasActiveFilters: boolean;
  /** Extra line under the empty state when nothing is filtered. */
  emptyHint?: string;

  /** Bulk selection. Omit both to render no checkbox column at all. */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;

  /** Row actions. Each omitted callback simply drops that action from the menu,
   *  which is how the Job Details tracker stays read-only. */
  onResend?: (inv: any) => void;
  onEdit?: (inv: any) => void;
  onRevoke?: (inv: any) => void;
  onViewDetails?: (inv: any) => void;
  /** Ids currently mid-request, so the row can show a spinner. */
  resendingId?: string | null;
  revokingId?: string | null;
}

export default function AIInterviewInviteTable({
  invitations,
  isLoading,
  hasActiveFilters,
  emptyHint,
  selectedIds,
  onToggleSelect,
  onResend,
  onEdit,
  onRevoke,
  onViewDetails,
  resendingId,
  revokingId,
}: AIInterviewInviteTableProps) {
  const selectable = !!onToggleSelect;

  /* Built once per row and rendered twice — as menu items on desktop, as compact
     buttons on the mobile card — so the two can't drift apart. */
  const rowActions = (inv: any): RowAction[] => {
    const actions: RowAction[] = [];

    if (isInterviewLinkLive(inv)) {
      actions.push({ key: 'copy', label: 'Copy Link', Icon: Copy, run: () => copyInterviewLink(inv) });
    }
    if (onViewDetails && ['completed', 'in_progress', 'terminated'].includes(inv.status)) {
      actions.push({ key: 'view', label: 'View Details', Icon: Eye, run: () => onViewDetails(inv) });
    }
    if (onResend && canResendInvite(inv)) {
      actions.push({
        key: 'resend',
        label: inv.status === 'revoked' ? 'Send Again' : 'Resend Email',
        Icon: Mail,
        run: () => onResend(inv),
        title: 'Revoke old link and send a new invitation',
        busy: resendingId === inv.id,
        disabled: resendingId === inv.id,
      });
    }
    if (onEdit && canEditOrRevoke(inv)) {
      actions.push({
        key: 'edit',
        label: 'Edit',
        Icon: Pencil,
        run: () => onEdit(inv),
        // Editing a live invitation would change who the outstanding link belongs
        // to, so it stays disabled until the invitation is revoked.
        disabled: inv.status !== 'revoked',
        title: inv.status === 'revoked' ? 'Edit candidate details' : 'Revoke this invitation first to edit it',
      });
    }
    if (onRevoke && canEditOrRevoke(inv)) {
      actions.push({
        key: 'revoke',
        label: 'Revoke',
        Icon: Ban,
        run: () => onRevoke(inv),
        disabled: inv.status === 'revoked' || revokingId === inv.id,
        title: inv.status === 'revoked' ? 'Already revoked' : "Revoke this invitation — the candidate's link will stop working",
        destructive: true,
        busy: revokingId === inv.id,
      });
    }
    return actions;
  };

  const SelectBox = ({ inv }: { inv: any }) => {
    if (!selectable) return null;
    // A fixed-width slot even when this row can't be selected, so every avatar
    // below it stays on the same left edge.
    if (!isRevocableInvite(inv)) return <span className="inline-block w-5 flex-shrink-0" />;
    const checked = !!selectedIds?.has(inv.id);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`Select ${inv.candidate_name || inv.candidate_email || 'candidate'}`}
        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(inv.id); }}
        className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
          checked
            ? 'bg-brand-blue border-brand-blue'
            : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600 hover:border-brand-blue/50'
        }`}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 sm:py-12 tf-loader-center tf-loader-center--compact">
        <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin" />
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-slate-500">
        <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-brand-blue/30" />
        {/* "None invited" is wrong when a filter is what emptied the list — it
            reads as data loss rather than as a narrowed view. */}
        <p className="text-xs sm:text-sm">
          {hasActiveFilters ? 'No candidates match the current filters.' : 'No candidates invited yet.'}
        </p>
        {!hasActiveFilters && emptyHint && (
          <p className="text-[11px] sm:text-xs text-gray-400 dark:text-slate-500 mt-1">{emptyHint}</p>
        )}
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile cards ──────────────────────────────────────────────── */}
      <div className="sm:hidden space-y-2 flex-1 min-h-0 overflow-y-auto">
        {invitations.map((inv: any) => {
          const score = displayInviteScore(inv);
          const actions = rowActions(inv);
          return (
            <div
              key={inv.id}
              className="p-2.5 border border-gray-100 dark:border-slate-700/60 rounded-xl bg-white dark:bg-slate-900"
            >
              <div className="flex items-center gap-2 min-w-0 mb-1.5">
                <SelectBox inv={inv} />
                <div className="w-7 h-7 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-medium text-brand-blue">{initialsOf(inv.candidate_name)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-slate-50 text-xs truncate">
                    {inv.candidate_name || 'Unknown'}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-slate-500 truncate break-all">
                    {inv.candidate_email}
                  </p>
                  {inv.candidate_cid && (
                    <p className="text-[10px] font-medium text-gray-600 dark:text-slate-400 truncate">
                      {inv.candidate_cid}
                    </p>
                  )}
                </div>
                <AIInviteStatusBadge inv={inv} />
              </div>

              {/* Two-column grid rather than a free wrap, so entries line up
                  instead of staggering by label width. */}
              <div className="text-[10px] text-gray-500 dark:text-slate-500 grid grid-cols-2 gap-x-3 gap-y-0.5 mb-1.5">
                {timelineEvents(inv).map(({ label, at, Icon, tone }) => (
                  <div key={label} className="flex items-center gap-1 min-w-0">
                    <Icon className={`w-2.5 h-2.5 flex-shrink-0 ${tone}`} />
                    <span className="truncate">{label}: {formatIST(at)}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-100 dark:border-slate-700/60">
                <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap min-w-0">
                  {/* Score only — the per-round Tech and Coding figures were
                      dropped from this tracker; the interview result view is
                      where a round-by-round breakdown belongs. */}
                  {([
                    { label: 'Score', value: score },
                  ] as const).map(({ label, value }) => (
                    <span key={label} className="text-[10px] text-gray-600 dark:text-slate-400 whitespace-nowrap">
                      {label}:{' '}
                      {value != null ? (
                        <span className={`font-semibold ${value >= 60 ? 'text-green-600' : 'text-red-600'}`}>{value}%</span>
                      ) : (
                        <span className="text-gray-400 dark:text-slate-500">—</span>
                      )}
                    </span>
                  ))}
                  {isInviteExpired(inv) && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium ring-1 bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20 whitespace-nowrap flex-shrink-0">
                      <Clock className="w-2.5 h-2.5" /> Expired
                    </span>
                  )}
                </div>
                {/* Inline buttons rather than a kebab: the card has the room, and
                    a menu on a card is one extra tap for no gain. */}
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {actions.map(({ key, label, Icon, run, disabled, title, destructive, busy }) => (
                    <button
                      key={key}
                      onClick={(e) => { e.stopPropagation(); run(); }}
                      disabled={disabled}
                      title={title || label}
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        destructive
                          ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 ring-1 ring-red-200 dark:ring-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/20'
                          : 'border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                      }`}
                    >
                      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop table ─────────────────────────────────────────────── */}
      {/* Outer border on the scroll shell rather than the table: the shell is what
          stays put, so a border on the table itself would scroll away with the
          content. tf-table-shell--fill + flex-1/min-h-0 makes this shell the one
          vertical scroller, which is what keeps the sticky header and the pinned
          Actions column in place. */}
      <div className="hidden sm:block tf-table-shell tf-table-shell--compact tf-table-shell--fill flex-1 min-h-0 border border-gray-200 dark:border-slate-700 rounded-lg">
        {/* Auto layout, not table-fixed: columns size to their own content and the
            shell scrolls sideways, rather than every column being scaled down
            until the sticky header stops lining up with the rows. */}
        <table className="w-max min-w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700">
              {selectable && <th className="w-8 py-3 pl-4 pr-0" aria-label="Select" />}
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">CID</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Candidate</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Status</th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Score</th>
              {/* hidden md:table-cell mirrors this column's <td> — without it the
                  header carries one more cell than the body between sm and md and
                  every heading after Timeline shifts off its column. */}
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider hidden md:table-cell">Timeline</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider tf-sticky-col">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
            {invitations.map((inv: any) => {
              const score = displayInviteScore(inv);
              const events = timelineEvents(inv);
              const actions = rowActions(inv);

              return (
                <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors">
                  {selectable && (
                    <td className="py-3 pl-4 pr-0 align-middle">
                      <SelectBox inv={inv} />
                    </td>
                  )}

                  <td className="py-3 px-4 align-middle whitespace-nowrap text-xs font-medium text-gray-600 dark:text-slate-400">
                    {inv.candidate_cid || <span className="text-gray-400 dark:text-slate-500">—</span>}
                  </td>

                  <td className="py-3 px-4 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center text-brand-blue font-medium text-xs flex-shrink-0">
                        {initialsOf(inv.candidate_name)}
                      </div>
                      {/* Capped rather than free: with auto layout a single long
                          email would otherwise set the column width. */}
                      <div className="min-w-0 max-w-[220px]">
                        <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={inv.candidate_name || 'Unknown'}>
                          {inv.candidate_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={inv.candidate_email}>
                          {inv.candidate_email}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      <AIInviteStatusBadge inv={inv} />
                      {isInviteExpired(inv) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0">
                          <Clock className="w-3 h-3" /> Expired
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-4 align-middle text-center text-sm whitespace-nowrap">
                    <ScoreCell value={score} />
                  </td>

                  {/* Every milestone on its own line, oldest first. align-top so
                      the first line sits level with the other columns. */}
                  <td className="py-3 px-4 align-top text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap hidden md:table-cell">
                    {events.length > 0 ? (
                      <div className="space-y-1">
                        {events.map(({ label, at, Icon, tone }) => (
                          <div key={label} className="flex items-center gap-2 whitespace-nowrap">
                            <Icon className={`w-3 h-3 flex-shrink-0 ${tone}`} />
                            <span className={tone}>{label}: {formatIST(at)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-slate-500">—</span>
                    )}
                  </td>

                  <td className="py-3 px-4 align-middle tf-sticky-col">
                    {/* Radix's DropdownMenu rather than a hand-rolled absolute menu:
                        this table sits inside tf-table-shell (overflow: auto), which
                        would clip an absolutely positioned menu. Radix portals it out. */}
                    {actions.length === 0 ? (
                      <span className="text-xs text-gray-400 dark:text-slate-500">—</span>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            aria-label="Actions"
                            title="Actions"
                            className="p-1.5 text-gray-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200 rounded transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {actions.map(({ key, label, Icon, run, disabled, destructive, busy }) => (
                            <DropdownMenuItem
                              key={key}
                              disabled={disabled}
                              variant={destructive ? 'destructive' : 'default'}
                              onSelect={run}
                            >
                              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                              {label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
