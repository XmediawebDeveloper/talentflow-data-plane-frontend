'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  X, Mail, Play, CheckCircle, Clock, Ban, Copy, Loader2, Users, Eye, Pencil,
  MoreVertical, Check, Monitor, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatIST } from '@/lib/utils/dateUtils';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { TRACKER_DIALOG_PLACEHOLDER_CLASS } from '@/lib/constants/trackerDialog';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

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
 * Revocable — and therefore both bulk-selectable and eligible for the row's
 * own Revoke action. Hidden once the candidate accepted Consent & Terms and
 * entered the interview process (system_check/in_progress), engaged with the
 * interview (completed/terminated), the invite was abandoned pre-send
 * (cancelled), it is already revoked (Edit + Copy Link only from here on), or
 * the link expired (only Resend is offered at that point).
 */
export const isRevocableInvite = (inv: any): boolean =>
  !['system_check', 'in_progress', 'completed', 'terminated', 'cancelled', 'revoked'].includes(inv.status) &&
  !isExpiredForActions(inv);

/**
 * Edit only ever appears once an invitation is revoked — editing is how a
 * revoked invite gets corrected and sent again (Save and Send), so there is
 * nothing to edit before that.
 */
const canEdit = (inv: any): boolean => inv.status === 'revoked';

/**
 * Resend only ever covers an expired row now — a live "invited" row has no
 * manual resend (Revoke, then Edit's Save and Send, is the only path to a
 * fresh link), and a revoked row's resend lives inside the Edit modal too.
 * As long as the candidate hasn't already started or completed.
 */
const canResendInvite = (inv: any): boolean =>
  isExpiredForActions(inv) &&
  !inv.started_at &&
  !inv.completed_at;

/** Copy Link disappears once revoked — only Edit remains from there.
 *  Revoked is listed explicitly (rather than relying on it not being
 *  'invited') so the intent reads at the call site. */
export const isInterviewLinkLive = (inv: any): boolean =>
  !!inv.interview_token &&
  !['completed', 'cancelled', 'terminated', 'expired', 'revoked'].includes(resolveInviteStatus(inv)) &&
  !isInviteExpired(inv);

/** Invite/list Score is ALWAYS the Must-Have Skills percentage (MHS section
 *  average ×10), shown only once an evaluation exists — otherwise a dash.
 *  Full (non-compact) payloads carry `section_question_avg.mth` (0-10); the
 *  compact list payload instead carries the MHS%-derived value directly in
 *  `capability_score` (the backend mirrors it there). Never fall back to a
 *  blended capability_score or the legacy `score`. Round so 17.5 reads as 18. */
export const displayInviteScore = (inv: any): number | null => {
  const mth = inv.ai_evaluation?.section_question_avg?.mth;
  if (typeof mth === 'number') return Math.round(mth * 10);
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

type TimelineEntry = { label: string; at: string; Icon: LucideIcon; tone: string };

/** Milestones oldest-first, every one on its own line. Delegates to
 *  buildFullTimeline (below) over the invitation's own embedded `timeline`
 *  (every audit-logged send/resend/revoke/edit for this row, attached by the
 *  list endpoint) rather than reading the single mutable columns directly —
 *  those get overwritten or cleared on reactivation (a resend clears
 *  revoked_at, a second send overwrites invitation_sent_at), which is what
 *  silently collapsed a row's history down to just its latest state. The
 *  fallback inside buildFullTimeline still covers rows from before this
 *  field existed. */
const timelineEvents = (inv: any): TimelineEntry[] => buildFullTimeline(inv, inv.timeline || []);

/** Every occurrence of an invitation-management action (not just the latest)
 *  reads the same audit trail the Activity Log is built from — see
 *  aiInterviewService.getSessionTimeline. Multiple sends, edits or revokes
 *  each show up as their own row here, in real chronological order, unlike
 *  timelineEvents() above which only ever shows one row per milestone type. */
const describeTimelineAction = (action: string): { label: string; Icon: LucideIcon; tone: string } => {
  switch (action) {
    case 'ai_interview_invite':
      return { label: 'Invited', Icon: Mail, tone: 'text-brand-blue' };
    case 'ai_interview_invite_revoke':
      return { label: 'Revoked', Icon: Ban, tone: 'text-red-600' };
    case 'ai_interview_invite_edit':
      return { label: 'Edited', Icon: Pencil, tone: 'text-brand-orange-deep' };
    case 'ai_interview_consent':
      return { label: 'System Check', Icon: Monitor, tone: 'text-brand-cyan' };
    case 'ai_interview_start':
      return { label: 'Started', Icon: Play, tone: 'text-brand-orange-deep' };
    case 'ai_interview_complete':
      return { label: 'Completed', Icon: CheckCircle, tone: 'text-green-600' };
    case 'ai_interview_terminated':
      return { label: 'Terminated', Icon: Ban, tone: 'text-red-600' };
    default:
      return { label: action, Icon: Clock, tone: 'text-gray-500' };
  }
};

/** Merges the fetched audit trail with a same-shaped fallback synthesized from
 *  the invitation row's own single-value columns, for milestone types the
 *  audit trail has no row for at all — sessions from before this trail
 *  existed, and Expired, which is a deadline lapsing rather than a discrete
 *  logged action. Real audit rows always win: the fallback for a given type
 *  only fires when zero audit rows of that type are present. */
const buildFullTimeline = (
  inv: any,
  auditLogs: Array<{ action: string; created_at: string | null }>
): TimelineEntry[] => {
  const out: TimelineEntry[] = auditLogs
    .filter((log) => !!log.created_at)
    .map((log) => ({ ...describeTimelineAction(log.action), at: log.created_at as string }));

  const loggedActions = new Set(auditLogs.map((log) => log.action));
  const fallback: [string, string | null | undefined, string][] = [
    ['ai_interview_invite', inv.invitation_sent_at || inv.created_at, 'Invited'],
    ['ai_interview_consent', inv.consent_accepted_at, 'System Check'],
    ['ai_interview_start', inv.started_at, 'Started'],
    ['ai_interview_complete', inv.completed_at, 'Completed'],
    ['ai_interview_invite_revoke', inv.revoked_at, 'Revoked'],
  ];
  for (const [action, at] of fallback) {
    if (at && !loggedActions.has(action)) {
      out.push({ ...describeTimelineAction(action), at });
    }
  }

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
    case 'terminated': {
      // closing_reason is set by evaluate_and_persist_session as
      // "proctoring_terminated: <human message>" (candidate_ai_interview.py) once
      // the background re-evaluation of the cut-short transcript lands — strip the
      // prefix so the tooltip reads as a sentence. Falls back to the generic
      // wording when no evaluation exists yet (still evaluating, or it failed).
      const rawReason: string = (inv.ai_evaluation?.closing_reason || '').toString();
      const detail = rawReason.replace(/^proctoring_terminated:\s*/i, '').trim();
      return (
        <span
          className={`${base} bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-500/25`}
          title={detail || 'Auto-ended by the proctoring policy — candidate left the interview screen'}
        >
          <Ban className="w-3 h-3" /> Terminated
        </span>
      );
    }
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
  /** Icon-only color for the desktop ⋮ menu — one of the shared menu-icon-*
   *  tokens (globals.css). Omitted for destructive actions, which the
   *  DropdownMenuItem `variant="destructive"` prop already colors. */
  iconClassName?: string;
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
  /** Which rows get a checkbox. Defaults to isRevocableInvite (the AI
   *  Interviews page's bulk-revoke rule); the Job Details tracker passes its
   *  bulk-resend rule (Invited/Expired) instead. */
  isSelectable?: (inv: any) => boolean;

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
  isSelectable,
  onResend,
  onEdit,
  onRevoke,
  onViewDetails,
  resendingId,
  revokingId,
}: AIInterviewInviteTableProps) {
  const selectable = !!onToggleSelect;

  /* Full action-log modal — fetched on demand per row, never eagerly for the
     whole page, so opening the tracker doesn't fire one audit-trail request
     per visible invitation. */
  const [timelineTarget, setTimelineTarget] = useState<any | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[] | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const openTimeline = async (inv: any) => {
    setTimelineTarget(inv);
    setTimelineEntries(null);
    setTimelineError(null);
    setTimelineLoading(true);
    try {
      const logs = await aiInterviewService.getSessionTimeline(inv.id);
      setTimelineEntries(buildFullTimeline(inv, logs));
    } catch (err: any) {
      setTimelineError(err?.message || 'Failed to load history');
    } finally {
      setTimelineLoading(false);
    }
  };

  /* Built once per row and rendered twice — as menu items on desktop, as compact
     buttons on the mobile card — so the two can't drift apart. */
  const rowActions = (inv: any): RowAction[] => {
    const actions: RowAction[] = [];

    if (isInterviewLinkLive(inv)) {
      actions.push({ key: 'copy', label: 'Copy Link', Icon: Copy, run: () => copyInterviewLink(inv), iconClassName: 'text-menu-icon-download' });
    }
    /* View Details is completed-only — same rule as the assessment tracker:
       only Completed / Auto Completed invites have a result to open, so
       In Progress and Terminated rows no longer offer the action. */
    if (onViewDetails && inv.status === 'completed') {
      actions.push({ key: 'view', label: 'View Details', Icon: Eye, run: () => onViewDetails(inv), iconClassName: 'text-menu-icon-view' });
    }
    if (onResend && canResendInvite(inv)) {
      actions.push({
        key: 'resend',
        label: 'Resend Email',
        Icon: Mail,
        run: () => onResend(inv),
        title: 'Revoke old link and send a new invitation',
        busy: resendingId === inv.id,
        disabled: resendingId === inv.id,
        iconClassName: 'text-menu-icon-share',
      });
    }
    if (onEdit && canEdit(inv)) {
      actions.push({
        key: 'edit',
        label: 'Edit',
        Icon: Pencil,
        run: () => onEdit(inv),
        title: 'Edit candidate details and send',
        iconClassName: 'text-menu-icon-edit',
      });
    }
    if (onRevoke && isRevocableInvite(inv)) {
      actions.push({
        key: 'revoke',
        label: 'Revoke',
        Icon: Ban,
        run: () => onRevoke(inv),
        disabled: revokingId === inv.id,
        title: "Revoke this invitation — the candidate's link will stop working",
        destructive: true,
        busy: revokingId === inv.id,
      });
    }
    return actions;
  };

  /* Row-level shortcut to the candidate's result. Completed invites only: every
     other status has no result to show, so those rows stay inert rather than
     dropping the recruiter on an empty detail view. This mirrors the "View
     Details" menu action above — same callback, same guard on the host having
     supplied one — so the read-only Job Details tracker (which passes no
     onViewDetails) keeps its rows non-clickable. */
  const canOpenDetails = (inv: any): boolean => !!onViewDetails && inv.status === 'completed';

  // Enter/Space on a focused row does what a click does — the row is exposed as
  // a button to assistive tech, so it has to answer to the button keys.
  const onRowKeyDown = (inv: any) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onViewDetails?.(inv);
  };

  const SelectBox = ({ inv }: { inv: any }) => {
    if (!selectable) return null;
    // A fixed-width slot even when this row can't be selected, so every avatar
    // below it stays on the same left edge.
    if (!(isSelectable ?? isRevocableInvite)(inv)) return <span className="inline-block w-5 flex-shrink-0" />;
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

  /* Both stand-in states FILL the list area rather than collapsing it to a
     200px box. Every caller renders this inside a flex column that reserves
     the space (the Track dialogs through their own min-height), so a spinner
     that only claimed its own height made the dialog open small and then jump
     to table height a moment later. Sizing the placeholder to the space it is
     standing in for is what removes that. */
  if (isLoading) {
    return (
      <div className={TRACKER_DIALOG_PLACEHOLDER_CLASS}>
        <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin" />
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className={`${TRACKER_DIALOG_PLACEHOLDER_CLASS} text-gray-500 dark:text-slate-500`}>
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
          const openable = canOpenDetails(inv);
          return (
            <div
              key={inv.id}
              onClick={openable ? () => onViewDetails?.(inv) : undefined}
              onKeyDown={openable ? onRowKeyDown(inv) : undefined}
              role={openable ? 'button' : undefined}
              tabIndex={openable ? 0 : undefined}
              title={openable ? 'View candidate details' : undefined}
              className={`p-2.5 border border-gray-100 dark:border-slate-700/60 rounded-xl bg-white dark:bg-slate-900${
                openable
                  ? ' cursor-pointer transition-colors hover:border-brand-blue/30 hover:bg-brand-blue/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40'
                  : ''
              }`}
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
              <div className="text-[10px] text-gray-500 dark:text-slate-500 grid grid-cols-2 gap-x-3 gap-y-0.5 mb-1">
                {timelineEvents(inv).map(({ label, at, Icon, tone }) => (
                  <div key={label} className="flex items-center gap-1 min-w-0">
                    <Icon className={`w-2.5 h-2.5 flex-shrink-0 ${tone}`} />
                    <span className="truncate">{label}: {formatIST(at)}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openTimeline(inv); }}
                className="flex items-center gap-1 text-[10px] font-medium text-brand-blue hover:underline mb-1.5"
              >
                <History className="w-2.5 h-2.5" /> View full history
              </button>

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
              {selectable && <th className="w-8 py-3 pl-4 pr-0 tf-sticky-col-left" aria-label="Select" />}
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
              const openable = canOpenDetails(inv);

              return (
                <tr
                  key={inv.id}
                  onClick={openable ? () => onViewDetails?.(inv) : undefined}
                  onKeyDown={openable ? onRowKeyDown(inv) : undefined}
                  role={openable ? 'button' : undefined}
                  tabIndex={openable ? 0 : undefined}
                  title={openable ? 'View candidate details' : undefined}
                  className={`transition-colors ${
                    openable
                      ? 'cursor-pointer hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  {selectable && (
                    <td className="py-3 pl-4 pr-0 align-middle tf-sticky-col-left">
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
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openTimeline(inv); }}
                      className="flex items-center gap-1 text-[11px] font-medium text-brand-blue hover:underline mt-1"
                    >
                      <History className="w-3 h-3" /> View full history
                    </button>
                  </td>

                  <td className="py-3 px-4 align-middle tf-sticky-col" onClick={(e) => e.stopPropagation()}>
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
                          {actions.map(({ key, label, Icon, run, disabled, destructive, busy, iconClassName }) => (
                            <DropdownMenuItem
                              key={key}
                              className="group"
                              disabled={disabled}
                              variant={destructive ? 'destructive' : 'default'}
                              onSelect={run}
                            >
                              {busy ? (
                                <Loader2 className={`w-3.5 h-3.5 animate-spin ${iconClassName || ''}`} />
                              ) : (
                                <Icon className={`w-3.5 h-3.5 ${iconClassName || ''}`} />
                              )}
                              <span className={MENU_ITEM_SCALE_CLASS}>{label}</span>
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

      {/* Full action-log modal — every send, resend, revoke, edit and
          candidate-lifecycle milestone as its own row, oldest first. */}
      <Dialog open={!!timelineTarget} onOpenChange={(open) => { if (!open) setTimelineTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitation History</DialogTitle>
            <DialogDescription>
              {timelineTarget?.candidate_name || timelineTarget?.candidate_email || 'Candidate'}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh] -mx-1 px-1">
            {timelineLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
              </div>
            ) : timelineError ? (
              <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">{timelineError}</p>
            ) : timelineEntries && timelineEntries.length > 0 ? (
              <ol className="space-y-3">
                {timelineEntries.map((entry, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className={`mt-0.5 flex-shrink-0 rounded-full p-1.5 bg-gray-100 dark:bg-slate-800 ${entry.tone}`}>
                      <entry.Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{entry.label}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-500">{formatIST(entry.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray-500 dark:text-slate-500 py-6 text-center">No history recorded yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
