'use client';

import { Mail, Play, CheckCircle, Clock, Ban, Loader2, Users, Eye, Pencil, MoreVertical, Check, Monitor, RefreshCw, Send, X } from 'lucide-react';
import { formatIST } from '@/lib/utils/dateUtils';
import { isValidEmailFormat } from '@/lib/utils/email';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { TRACKER_DIALOG_PLACEHOLDER_CLASS } from '@/lib/constants/trackerDialog';
import { VersionChip } from '@/components/assessments/AssessmentVersionHistoryPanel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { InviteSourceValue, assessmentInviteSource } from '@/components/AIInterviewInviteTable';
import { formatScore } from '@/lib/utils/score';

/**
 * The candidate list for an ASSESSMENT invite tracker.
 *
 * One implementation for both places a recruiter meets it: the Assessments
 * page's "Assessments - Invite Status Tracking" popup, and the Invitation
 * Status tab on an assessment's own page. They were two different renderings
 * of one `listInvitations` payload — a full table in the popup, a five-row
 * summary of stacked cards in the tab — so the columns, the status wording and
 * the action rules a recruiter saw depended on which door they came in through.
 *
 * Moved here verbatim from the popup, which is why the popup is unchanged by
 * it: same shell, same auto-layout table, same sticky header and pinned
 * Actions column, same placeholders, same status vocabulary. Everything that
 * differs between the two hosts is a prop — the version columns are job-scope
 * only, the empty line is worded by whoever knows what the table is scoped to
 * — and nothing that does not differ is.
 *
 * Follows `AIInterviewInviteTable`, which did this for the interview tracker
 * first; the two are deliberately the same shape.
 */

/**
 * Past its configured expiry with no terminal state and no unit consumed: the
 * invite IS expired now, whatever the backend last wrote to `status`. Once a
 * unit has been consumed the candidate actually started, so expiry no longer
 * applies.
 *
 * NOT the interview tracker's `isInviteExpired`, which looks similar and is
 * not the same rule: an assessment invite that failed to send or bounced stays
 * Invite Failed / Bounced however long ago its deadline passed, because the
 * address is the problem and the deadline is beside the point. The interview
 * rule has no such statuses and would relabel both as Expired.
 */
export const isInviteExpired = (inv: any): boolean => {
  const s = inv.status;
  if (['completed', 'failed', 'bounced', 'abandoned', 'expired'].includes(s) || inv.completed_at || inv.bounced_at) return false;
  if (inv.unit_consumed) return false;
  return !!(inv.expires_at && new Date(inv.expires_at) < new Date());
};

/* ── Row rules ─────────────────────────────────────────────────────────
   Exported because the host needs the same rules for its bulk-select bar and
   its stat cards. Two copies is how a row's checkbox and its action menu came
   to disagree about whether it could be resent. */

/** Resendable, and therefore bulk-selectable: an invite that went out or
 *  lapsed, and that the candidate has neither started nor finished. This
 *  table's own per-row menu (below) treats Invited the same way — direct
 *  Resend, no Revoke step — so the bulk rule here has to match: it is a
 *  DIFFERENT, deliberately simpler action model than AssessmentInviteActions'
 *  (used by the Invite Tracking popup / Invitation Status tab), not a copy of
 *  it. */
export const isBulkResendable = (inv: any): boolean =>
  ['sent', 'expired'].includes(inv.status)
  && !inv.started_at
  && !inv.completed_at;

/** Has a result to open. Only Completed / Auto Completed rows do — every other
 *  status has no attempt behind it, so the row does not navigate. */
export const isTrackedInviteCompleted = (inv: any): boolean =>
  (inv.status === 'completed' || !!inv.completed_at) && !!inv.attempt_id;

/** The bucket a row counts in, for the stat cards above the table. Reads
 *  expiry the way the badge does, so a card's number always matches the rows
 *  that selecting it produces — including clock-expired invites, which
 *  `status` still calls 'sent'. */
export const inviteStatusBucket = (inv: any): string => {
  if (isInviteExpired(inv)) return 'expired';
  if (inv.status === 'completed' || inv.completed_at) return 'completed';
  if (inv.status === 'failed') return 'failed';
  if (inv.status === 'bounced' || inv.bounced_at) return 'bounced';
  if (inv.status === 'expired') return 'expired';
  if (inv.status === 'abandoned') return 'abandoned';
  if (inv.status === 'started' || inv.started_at) return 'started';
  if (inv.status === 'opened' || inv.opened_at) return 'opened';
  if (inv.status === 'sent' || inv.sent_at) return 'sent';
  return 'pending';
};

// Delegates to the one shared, comprehensive format rule (lib/utils/email)
// rather than this file's own regex, so a "Change Email" address can't pass
// here while failing the exact same check on the Edit Invitation dialog or
// the backend that actually saves it.
export const isValidInviteEmail = (email: string) => isValidEmailFormat(email);

/** Badge wording and colours, in one place so a recruiter reads the same
 *  status wherever tracking was opened from. Expiry is resolved first, so a
 *  lapsed invite shows one Expired badge rather than its stale pre-expiry
 *  status with a chip beside it. */
export const InviteStatusBadge = ({ inv }: { inv: any }) => {
  const s = inv.status;
  const base = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs sm:text-xs font-medium whitespace-nowrap flex-shrink-0 ring-1";
  if (isInviteExpired(inv)) {
    return <span className={`${base} bg-status-expired/10 text-status-expired ring-status-expired/20`}><Clock className="w-3 h-3" /> Expired</span>;
  }
  if (s === 'completed' || inv.completed_at) {
    const autoCompleted = inv.termination_code === 'TENANT_SESSION_TIMEOUT';
    return (
      <span
        className={`${base} bg-status-completed/10 dark:bg-status-completed/15 text-status-completed ring-status-completed/20 dark:ring-status-completed/25`}
        title={autoCompleted ? 'Auto-submitted when the assessment duration elapsed' : undefined}
      >
        <CheckCircle className="w-3 h-3" />
        Completed
        {autoCompleted && <span className="text-status-completed/80">(Auto)</span>}
      </span>
    );
  }
  if (s === 'failed') {
    return <span className={`${base} bg-destructive-subtle text-destructive ring-destructive-line`}><X className="w-3 h-3" /> Invite Failed</span>;
  }
  if (s === 'bounced' || inv.bounced_at) {
    return <span className={`${base} bg-destructive-subtle text-destructive ring-destructive-line`}><RefreshCw className="w-3 h-3" /> Bounced</span>;
  }
  if (s === 'expired') {
    return <span className={`${base} bg-status-expired/10 text-status-expired ring-status-expired/20`}><Clock className="w-3 h-3" /> Expired</span>;
  }
  if (s === 'abandoned') {
    return <span className={`${base} bg-destructive-subtle text-destructive ring-destructive-line`} title="Ended before completion — the candidate left the assessment"><Ban className="w-3 h-3" /> Terminated</span>;
  }
  if (s === 'started' || inv.started_at) {
    return <span className={`${base} bg-status-progress/10 text-status-progress ring-status-progress/20`}><Play className="w-3 h-3" /> In Progress</span>;
  }
  if (s === 'opened' || inv.opened_at) {
    return <span className={`${base} bg-status-progress/10 text-status-progress ring-status-progress/20`} title="Consent accepted — the candidate is on the system check step"><Monitor className="w-3 h-3" /> System Check</span>;
  }
  if (s === 'sent' || inv.sent_at) {
    return <span className={`${base} bg-status-invited/10 text-status-invited ring-status-invited/20`}><Mail className="w-3 h-3" /> Invited</span>;
  }
  return <span className={`${base} bg-slate-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-gray-200 dark:ring-slate-700`}><Clock className="w-3 h-3" /> Pending</span>;
};

/* The popup's own value for this class, kept beside the markup that uses it. */
const assessmentDropdownMenuItemClass = 'group';

export interface AssessmentInviteTableProps {
  invitations: any[];
  /** Nothing on screen yet — the spinner IS the body. A refresh over rows that
   *  are already there is the host's own veil, not this. */
  isInitialLoading: boolean;
  /** Drives the empty-state wording: filtered-to-nothing is not "none sent". */
  hasActiveFilters: boolean;
  /** What the empty state says when nothing is filtered — the host is what
   *  knows the scope the table was built for. */
  emptyMessage: string;
  /** Job Version / Assessment Version columns. Job scope only: with invites
   *  from several assessments in one table a row has to say which version it
   *  belongs to, and reading one assessment there is nothing to disambiguate. */
  showVersionColumns?: boolean;
  techEnabled: boolean;
  codingEnabled: boolean;

  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;

  canOpenResult: (inv: any) => boolean;
  onOpenResult: (inv: any) => void;
  onResend: (inv: any) => void;

  /** The inline email editor. Held by the host, because the request it sends
   *  and the toasts it raises belong with the rest of that flow. */
  editingEmailId: string | null;
  newEmailValue: string;
  onNewEmailChange: (value: string) => void;
  onStartEditEmail: (inv: any) => void;
  onCancelEditEmail: () => void;
  onSubmitEmail: (inv: any) => void;
  isSendingChangeEmail: boolean;
}

export default function AssessmentInviteTable({
  invitations,
  isInitialLoading,
  hasActiveFilters,
  emptyMessage,
  showVersionColumns = false,
  techEnabled,
  codingEnabled,
  selectedIds,
  onToggleSelect,
  canOpenResult,
  onOpenResult,
  onResend,
  editingEmailId,
  newEmailValue,
  onNewEmailChange,
  onStartEditEmail,
  onCancelEditEmail,
  onSubmitEmail,
  isSendingChangeEmail,
}: AssessmentInviteTableProps) {
  return (
    <>
      {isInitialLoading ? (
        /* Nothing to show yet, so the spinner IS the body - and it
           FILLS it, rather than collapsing the dialog to a 200px box
           that then jumps to table height when the rows land. The
           dialog's min-height reserves the space; this occupies it. */
        <div className={TRACKER_DIALOG_PLACEHOLDER_CLASS}>
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin" />
        </div>
      ) : invitations.length === 0 ? (
        <div className={`${TRACKER_DIALOG_PLACEHOLDER_CLASS} text-gray-500 dark:text-slate-500`}>
          <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-brand-blue/40" />
          <p className="text-xs sm:text-sm">
            {hasActiveFilters ? 'No invitations match the current filters.' : emptyMessage}
          </p>
        </div>
      ) : (
        /* Outer border on the scroll shell rather than the table: the
           shell is what stays put, so a border on the table itself would
           scroll away with the content. Deliberately no overflow-hidden —
           the shell's overflow:auto is what lets the wide auto-layout
           table scroll sideways. */
        <div className="tf-table-shell tf-table-shell--compact tf-table-shell--fill flex-1 min-h-0 border border-gray-200 dark:border-slate-700 rounded-lg">
          {/* Auto layout, not table-fixed. The colgroup widths summed
              past the table's min-width, so every column was scaled
              down; combined with the shell's white-space: nowrap the
              content overflowed its cell instead of reflowing, and the
              sticky header stopped lining up with the rows. Columns now
              size to their own content and the shell scrolls sideways.
              px-4 on every cell gives the consistent column gutter. */}
          <table className="w-max min-w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="w-8 py-3 pl-4 pr-0 tf-sticky-col-left" aria-label="Select" />
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">CID</th>
                {/* Job scope only: with invites from several
                    assessments in one table, the row has to say which
                    job version its assessment belongs to - that is the
                    whole point of tracking a job rather than an
                    assessment. Reading one assessment there is nothing
                    to disambiguate, so neither column is there.

                    TWO columns, not one compound cell: a job version
                    and an assessment version are separate facts about
                    the row - the job was republished, the assessment
                    was re-authored - and they do not move together.
                    Side by side in this order they still read as the
                    relationship they are: this assessment version, on
                    that job version. */}
                {showVersionColumns && (
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Version</th>
                )}
                {showVersionColumns && (
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assessment Version</th>
                )}
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidate</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Invite Source</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                {/* hidden md:table-cell mirrors this column's <td>. Without
                    it the header carried one more cell than the body between
                    sm and md, shifting every heading after Timeline off its
                    column. */}
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Timeline</th>
                {/* Tech / Coding Score columns are conditional on the
                    assessment having that round enabled — same rule as
                    the Results page. Showing a "Coding Score" column
                    for a JD without a coding round produced a
                    permanent "—" column that confused recruiters. */}
                {techEnabled && (
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tech Score</th>
                )}
                {codingEnabled && (
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Coding Score</th>
                )}
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider tf-sticky-col">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {invitations.map((invitation: any) => {
                    const initials = invitation.candidate_name
                      ?.split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2) || '??';
  
                /* Only Completed / Auto Completed rows are interactive —
                   other statuses have no Result Details to open, so the
                   row carries no click handler, button role, or pointer
                   cursor. */
                const rowOpensDetails = canOpenResult(invitation);

                return (
                  <tr
                    key={invitation.id}
                    onClick={rowOpensDetails ? () => onOpenResult(invitation) : undefined}
                    onKeyDown={rowOpensDetails ? (e: React.KeyboardEvent) => {
                      // The row is exposed as a button to assistive tech,
                      // so it has to answer to the button keys too.
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      onOpenResult(invitation);
                    } : undefined}
                    role={rowOpensDetails ? 'button' : undefined}
                    tabIndex={rowOpensDetails ? 0 : undefined}
                    title={rowOpensDetails ? 'View result details' : undefined}
                    className={rowOpensDetails
                      ? 'transition-colors cursor-pointer hover:bg-brand-blue/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40'
                      : 'transition-colors hover:bg-gray-50 dark:hover:bg-slate-800'}
                  >
                    {/* stopPropagation: Complete rows navigate on click —
                        ticking a checkbox must never also open the row.
                        Only bulk-resendable rows (Invited/Expired) get a
                        checkbox; the rest keep a fixed-width slot so the
                        columns stay aligned. */}
                    <td className="py-3 pl-4 pr-0 align-top tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                      {isBulkResendable(invitation) ? (
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={selectedIds.has(invitation.id)}
                          aria-label={`Select ${invitation.candidate_name || invitation.candidate_email || 'candidate'}`}
                          onClick={() => onToggleSelect(invitation.id)}
                          className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                            selectedIds.has(invitation.id)
                              ? 'bg-brand-blue border-brand-blue'
                              : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600 hover:border-brand-blue/50'
                          }`}
                        >
                          {selectedIds.has(invitation.id) && <Check className="w-3 h-3 text-white" />}
                        </button>
                      ) : (
                        <span className="inline-block w-5" />
                      )}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 px-2 py-1 rounded ring-1 ring-brand-blue/20">
                        {invitation.candidate_display_id || '-'}
                      </span>
                    </td>
                    {/* The job version this invite's assessment was
                        built against - the version panel's own blue
                        chip, so V2 reads the same wherever a recruiter
                        meets it. */}
                    {showVersionColumns && (
                      <td className="py-3 px-4 align-top">
                        <VersionChip kind="job" version={invitation._jd_version} />
                      </td>
                    )}
                    {/* The assessment version, in the panel's cyan -
                        the version and nothing else. The assessment's
                        own id sat under it and was noise in a column
                        asked for a version; the assessment is named in
                        the row's actions and on the page it opens. */}
                    {showVersionColumns && (
                      <td className="py-3 px-4 align-top">
                        <VersionChip kind="assessment" version={invitation._assessment_version} />
                      </td>
                    )}
                    <td className="py-3 px-4 align-top">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-medium text-sm flex-shrink-0">
                          {initials}
                        </div>
                        {/* Capped rather than free: under auto layout a
                            single long email would otherwise set the
                            column width for the whole table. */}
                        <div className="min-w-0 max-w-[180px] sm:max-w-[240px]">
                          <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={invitation.candidate_name}>{invitation.candidate_name}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={invitation.candidate_email}>{invitation.candidate_email}</p>
                        </div>
                      </div>
                    </td>
                    {/* Invite Source — how this candidate was actually
                        invited, from the invitation's own resume_id. */}
                    <td className="py-3 px-4 align-top text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">
                      <InviteSourceValue inv={assessmentInviteSource(invitation)} iconClassName="w-3.5 h-3.5" />
                    </td>
                    <td className="py-3 px-4 align-top">
                      {/* Status is the badge alone. Expiry is resolved inside
                          renderInviteStatusBadge, so a lapsed invite renders one Expired
                          badge — not its old status with a chip beside it — and
                          the failed row's "Incorrect Email" note now lives only
                          in the Edit Email flow. */}
                      {<InviteStatusBadge inv={invitation} />}
                    </td>
                        <td className="py-3 px-4 align-top text-xs text-gray-500 dark:text-slate-500 hidden md:table-cell">
                          <div className="space-y-1">
                            {invitation.sent_at && (
                              <div className="flex items-center gap-2">
                                <Mail className="w-3 h-3 text-status-invited flex-shrink-0" />
                                <span className="text-status-invited">Invited: {formatIST(invitation.sent_at)}</span>
                          </div>
                        )}
                        {invitation.bounced_at && (
                          <div className="flex items-center gap-2">
                            <RefreshCw className="w-3 h-3 text-destructive flex-shrink-0" />
                            <span className="text-destructive">Bounced: {formatIST(invitation.bounced_at)}</span>
                          </div>
                        )}
                        {invitation.opened_at && (
                          <div className="flex items-center gap-2">
                            <Monitor className="w-3 h-3 text-status-progress flex-shrink-0" />
                            <span className="text-status-progress">System Check: {formatIST(invitation.opened_at)}</span>
                          </div>
                        )}
                        {invitation.started_at && (
                          <div className="flex items-center gap-2">
                            <Play className="w-3 h-3 text-status-progress flex-shrink-0" />
                            <span className="text-status-progress">Started: {formatIST(invitation.started_at)}</span>
                          </div>
                        )}
                        {invitation.completed_at && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-3 h-3 text-status-completed flex-shrink-0" />
                            <span className="text-status-completed">Completed: {formatIST(invitation.completed_at)}</span>
                          </div>
                        )}
                        {invitation.terminated_at && !invitation.completed_at && (
                          <div className="flex items-center gap-2">
                            <Ban className="w-3 h-3 text-destructive flex-shrink-0" />
                            <span className="text-destructive">Terminated: {formatIST(invitation.terminated_at)}</span>
                          </div>
                        )}
                        {/* Expired-at timestamp — shown when the link
                            has expired (status='expired' or clock-based
                            expiry on a never-started invite). The
                            expires_at column holds the deadline; we
                            surface it as the moment of expiry. */}
                        {(() => {
                          const s = (invitation.status || '').toLowerCase();
                          const clockExpired = !invitation.started_at
                            && !invitation.unit_consumed
                            && invitation.expires_at
                            && new Date(invitation.expires_at) < new Date();
                          const isExpired = !invitation.completed_at
                            && (s === 'expired' || clockExpired);
                          if (!isExpired || !invitation.expires_at) return null;
                          return (
                            <div className="flex items-center gap-2">
                              <Clock className="w-3 h-3 text-status-expired flex-shrink-0" />
                              <span className="text-status-expired">Expired at: {formatIST(invitation.expires_at)}</span>
                            </div>
                          );
                        })()}
                        {!invitation.sent_at && !invitation.started_at && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span>Created: {formatIST(invitation.created_at)}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Tech Score / Coding Score columns. Same pattern
                        as the Results page: percent number on top, small
                        Pass/Fail tag below, both colored against the 70%
                        threshold. Rounded so the value matches every
                        other surface (Results list, Detail view, PDF).
                        Show "—" until AI scoring is finished — surfacing
                        0% / Fail mid-evaluation was misleading because
                        the candidate's answers haven't been judged yet.
                        Cells are gated on the round being enabled for
                        this assessment so a Tech-only JD doesn't carry
                        an empty Coding column. */}
                    {/* Score is shown when a numeric value is on the
                        row. Earlier the gate also required
                        scoring_status === 'completed', but the
                        listInvitations endpoint didn't include that
                        field — which silently hid every score. The
                        backend now ships scoring_status; we still
                        treat its absence as "show the score if it
                        exists" so the popup keeps parity with the
                        Results page. */}
                    {techEnabled && (() => {
                      const techReady =
                        invitation.technical_score != null
                        && invitation.scoring_status !== 'processing'
                        && invitation.scoring_status !== 'pending';
                      return (
                        <td className="py-3 px-4 align-top text-sm text-center">
                          {techReady ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`font-medium ${invitation.technical_score >= 70 ? 'text-brand-blue' : 'text-destructive'}`}>
                                {formatScore(invitation.technical_score)}%
                              </span>
                              <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${invitation.technical_score >= 70 ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
                                {invitation.technical_score >= 70 ? 'Pass' : 'Fail'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      );
                    })()}
                    {codingEnabled && (() => {
                      const codingReady =
                        invitation.coding_score != null
                        && invitation.scoring_status !== 'processing'
                        && invitation.scoring_status !== 'pending';
                      return (
                        <td className="py-3 px-4 align-top text-sm text-center">
                          {codingReady ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`font-medium ${invitation.coding_score >= 70 ? 'text-brand-blue' : 'text-destructive'}`}>
                                {formatScore(invitation.coding_score)}%
                              </span>
                              <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${invitation.coding_score >= 70 ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
                                {invitation.coding_score >= 70 ? 'Pass' : 'Fail'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      );
                    })()}
                    <td className="py-3 px-4 align-top tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                      {/* Actions collapse into a kebab menu. This uses Radix's
                          DropdownMenu rather than the hand-rolled absolute
                          dropdown the cards above use, because this table sits
                          inside tf-table-shell (overflow: auto) — an absolutely
                          positioned menu would be clipped by the scroll
                          container. Radix portals the menu out of it. */}
                      {editingEmailId === invitation.id ? (
                        /* The email editor stays inline in the cell rather than
                           living in the menu: a text input inside a menu fights
                           the menu's own keyboard handling. Choosing "Edit Email"
                           closes the menu and swaps the cell to this form. Held
                           once here — it used to be duplicated across the bounced
                           and resendable branches. */
                        <div className="flex flex-col gap-1.5 min-w-[190px]">
                          <input
                            type="email"
                            value={newEmailValue}
                            onChange={e => onNewEmailChange(e.target.value)}
                            placeholder="new@email.com"
                            aria-invalid={newEmailValue.trim().length > 0 && !isValidInviteEmail(newEmailValue) ? 'true' : undefined}
                            className={`text-xs border rounded px-2 py-1 focus:outline-none focus:ring-2 w-full ${
                              newEmailValue.trim().length > 0 && !isValidInviteEmail(newEmailValue)
                                ? 'border-destructive focus:ring-destructive/40 focus:border-destructive'
                                : 'border-gray-200 dark:border-slate-700 focus:ring-brand-blue/40 focus:border-brand-blue'
                            }`}
                            autoFocus
                          />
                          {newEmailValue.trim().length > 0 && !isValidInviteEmail(newEmailValue) && (
                            <p className="text-2xs text-destructive">Please enter a valid email address.</p>
                          )}
                          <div className="flex gap-1">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => onSubmitEmail(invitation)}
                              disabled={!isValidInviteEmail(newEmailValue) || isSendingChangeEmail || newEmailValue.trim().toLowerCase() === (invitation.candidate_email || '').trim().toLowerCase()}
                              icon={<Send className="w-3 h-3" />}
                            >
                              {isSendingChangeEmail ? 'Sending…' : 'Send'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={onCancelEditEmail}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (() => {
                        const isCompleted = invitation.status === 'completed' || !!invitation.completed_at;
                        const isBounced = invitation.status === 'bounced';
                        // Action rules by status: Invited/Expired → Resend only;
                        // System Check ('opened') and In Progress → no menu at all;
                        // Completed → View Results only. Edit Email survives only
                        // where fixing the address is the point — a failed invite
                        // (mistyped address) or a bounce.
                        const canResend = ['sent', 'failed', 'expired'].includes(invitation.status)
                          && !invitation.started_at
                          && !invitation.completed_at;
                        const canEditEmail = invitation.status === 'failed'
                          && !invitation.started_at
                          && !invitation.completed_at;

                        // Nothing actionable — render no trigger rather than an
                        // empty menu the user can open onto nothing.
                        if (!isCompleted && !isBounced && !canResend) return null;

                        return (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                aria-label="Actions"
                                title="Actions"
                                className="p-2 text-gray-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200 rounded transition-colors"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {isCompleted && (
                                // Completed-but-no-attempt is a rare orphaned
                                // invitation: disabled, so we never silently drop
                                // the user on the aggregate results page.
                                <DropdownMenuItem
                                  className={assessmentDropdownMenuItemClass}
                                  disabled={!invitation.attempt_id}
                                  onSelect={() => onOpenResult(invitation)}
                                >
                                  <Eye className="w-3.5 h-3.5 text-menu-icon-view" />
                                  <span className={MENU_ITEM_SCALE_CLASS}>View Results</span>
                                </DropdownMenuItem>
                              )}
                              {canResend && (
                                <DropdownMenuItem className={assessmentDropdownMenuItemClass} onSelect={() => onResend(invitation)}>
                                  <Mail className="w-3.5 h-3.5 text-menu-icon-share" />
                                  <span className={MENU_ITEM_SCALE_CLASS}>Resend</span>
                                </DropdownMenuItem>
                              )}
                              {(isBounced || canEditEmail) && (
                                <DropdownMenuItem
                                  className={assessmentDropdownMenuItemClass}
                                  onSelect={() => onStartEditEmail(invitation)}
                                >
                                  <Pencil className="w-3.5 h-3.5 text-menu-icon-edit" />
                                  <span className={MENU_ITEM_SCALE_CLASS}>{isBounced ? 'Change Email' : 'Edit Email'}</span>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
