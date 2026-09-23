'use client';

import { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Mail, Play, CheckCircle, Clock, Ban, Copy, Loader2, Eye, Pencil, Send,
  MoreVertical, Monitor, RefreshCw, X, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatIST } from '@/lib/utils/dateUtils';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { assessmentService } from '@/lib/services/assessmentService';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Shared invitation-action logic for the Assessment module, ported from (and
 * kept behaviorally identical to) the AI Interview module: Revoke, Edit +
 * "Save & Send", Copy Link, status-gated action visibility, and a full
 * action-log timeline.
 *
 * Unlike AIInterviewInviteTable.tsx (one component that renders the whole
 * row), this is a TOOLKIT — predicates, a row-action builder, and three
 * drop-in dialogs (Edit, Revoke, History) — consumed by three
 * pre-existing, differently-shaped tables (Assessments.tsx's Track Invites
 * popup, its cross-assessment Invitation Status tab, and the read-only
 * TrackInvitesModal.tsx on the Job Details page). Those three tables carry
 * columns this toolkit has no opinion on (job/version, tech/coding score
 * breakdowns), so unifying them into one table component would have meant
 * either dropping those columns or an unwieldy prop surface. Centralizing
 * the status rules and the three new dialogs here is what actually stops
 * the three surfaces from drifting apart — that was the drift risk, not the
 * surrounding column markup.
 */

/* ── Status helpers ──────────────────────────────────────────────────── */

/** Effective status, falling back to timestamp signals in case the status
 *  field is stale — ported verbatim from TrackInvitesModal's
 *  getEffectiveStatus so every surface keeps agreeing on it. */
export const resolveInviteStatus = (inv: any): string => {
  const s = (inv.status || '').toLowerCase();
  if (s === 'completed' || inv.completed_at) return 'completed';
  if (s === 'revoked') return 'revoked';
  if (s === 'failed') return 'failed';
  if (s === 'expired') return 'expired';
  if (s === 'abandoned') return 'abandoned';
  if (s === 'bounced' || inv.bounced_at) return 'bounced';
  if (s === 'started' || inv.started_at) return 'started';
  if (s === 'opened' || inv.opened_at) return 'opened';
  if (s === 'sent' || inv.sent_at) return 'sent';
  return 'pending';
};

/** Secondary "Expired" flag for a row whose deadline passed before the
 *  backend flipped its status — ported from isInvExpired. */
export const isInviteExpired = (inv: any): boolean => {
  const s = resolveInviteStatus(inv);
  if (['completed', 'failed', 'bounced', 'abandoned', 'expired', 'revoked'].includes(s)) return false;
  if (inv.unit_consumed) return false;
  return !!(inv.expires_at && new Date(inv.expires_at) < new Date());
};

/** Revoke — only while successfully sent and not yet engaged with. Matches
 *  the AI Interview rule: once expired, Resend is the only path back, not
 *  Revoke; once started/completed there is nothing left to revoke. */
export const isRevocableInvitation = (inv: any): boolean =>
  resolveInviteStatus(inv) === 'sent' && !inv.started_at && !inv.completed_at && !isInviteExpired(inv);

/** Edit (name + email) only ever appears once revoked — same rule as AI
 *  Interview. This is distinct from the pre-existing failed/bounced "fix the
 *  address" Edit/Change Email flow, which callers keep wiring separately. */
export const canEditInvitation = (inv: any): boolean => resolveInviteStatus(inv) === 'revoked';

/** Resend — expired or failed only now; a plain 'sent' row's only path to a
 *  new link is Revoke, then Edit's Save & Send (mirrors AI Interview
 *  removing direct Resend for a freshly-sent invitation). Failed keeps
 *  direct Resend since nothing was ever revocable — the first send never
 *  went out. */
export const canResendInvite = (inv: any): boolean => {
  const s = resolveInviteStatus(inv);
  return (s === 'expired' || s === 'failed' || isInviteExpired(inv)) && !inv.started_at && !inv.completed_at;
};

/** Copy Link — available whenever the link is live: sent, system-check
 *  ('opened'), or in-progress. Disappears once revoked — Edit is the only
 *  action from there — mirroring AI Interview's isInterviewLinkLive. */
export const isCopyLinkAvailable = (inv: any): boolean => {
  const s = resolveInviteStatus(inv);
  return !!inv.invitation_link && !['completed', 'failed', 'bounced', 'abandoned', 'expired', 'revoked', 'pending'].includes(s) && !isInviteExpired(inv);
};

export const copyInvitationLink = async (inv: any) => {
  const link = inv.invitation_link?.startsWith('http')
    ? inv.invitation_link
    : `${window.location.origin}${inv.invitation_link}`;
  await navigator.clipboard.writeText(link);
  toast.success('Assessment link copied!');
};

/* ── Timeline: action -> label/icon, plus the full merge ────────────────
   Every send, resend, revoke and edit is audit-logged (entity_type
   "assessment_invitation"), and start/exit/complete against whichever
   attempt(s) the invitation produced (entity_type "assessment_attempt") —
   see the /timeline endpoint and the list endpoint's bulk equivalent
   (InvitationResponse.timeline). Both the compact column and the full-
   history modal read this same append-only trail now, rather than the
   single mutable columns below, which get overwritten/cleared on
   reactivation (a resend clears revoked_at, a second send overwrites
   sent_at) — that overwriting is what silently collapsed a row's history
   down to just its latest state. */

export type TimelineEntry = { label: string; at: string; Icon: LucideIcon; tone: string };

const describeTimelineAction = (action: string): { label: string; Icon: LucideIcon; tone: string } => {
  switch (action) {
    case 'assessment_invite':
    case 'assessment_invite_resend':
      return { label: 'Invited', Icon: Mail, tone: 'text-brand-blue' };
    case 'assessment_invitation_revoke':
      return { label: 'Revoked', Icon: Ban, tone: 'text-destructive' };
    case 'assessment_invitation_edit':
      return { label: 'Edited', Icon: Pencil, tone: 'text-brand-orange-deep' };
    case 'assessment_invitation_email_changed':
      return { label: 'Email Changed', Icon: Send, tone: 'text-brand-orange-deep' };
    case 'assessment_start':
      return { label: 'Started', Icon: Play, tone: 'text-brand-orange-deep' };
    case 'assessment_exit':
      return { label: 'Terminated', Icon: Ban, tone: 'text-destructive' };
    case 'assessment_complete':
      return { label: 'Completed', Icon: CheckCircle, tone: 'text-success' };
    case 'assessment_invitation_expired':
      return { label: 'Expired at', Icon: Clock, tone: 'text-brand-orange-deep' };
    case 'assessment_invite_failed':
      return { label: 'Invite Failed', Icon: X, tone: 'text-red-600' };
    default:
      return { label: action.replace(/_/g, ' '), Icon: Clock, tone: 'text-gray-500' };
  }
};

/** Merges the invitation's embedded audit trail (`inv.timeline`, attached by
 *  the list endpoint) with a same-shaped fallback synthesized from the
 *  invitation's own plain columns — for rows from before this trail existed,
 *  and for the case where the trail only has a LATER occurrence of an
 *  action (a resend's own "Invited" row, say) and would otherwise silently
 *  hide an earlier one that predates the interview_id/invitation_id field.
 *  Real audit rows always win: every occurrence in the trail becomes its
 *  own entry (so a revoke followed by an edited resend shows as three
 *  separate lines, not one), and the fallback for a given type only fires
 *  when there's no real row of that type (or an equivalent one — resend
 *  shares "Invited" with the initial send) AT OR BEFORE its own timestamp —
 *  "no rows at all" would wrongly suppress the fallback for the gap case
 *  above, since a later real row still makes that type non-empty. */
/** Rows that expired and were resent BEFORE expiry was audit-logged have no
 *  "Expired at" record anywhere, so the resend made that line vanish. The
 *  deadline is still derivable: every resend re-applies the original validity
 *  window (span = expires_at - last-send time, both untouched by anything
 *  else), so the earlier deadline was that Invited's time plus the span. Only
 *  a plain Invited -> (next) Invited pair qualifies, and only when the derived
 *  deadline really falls before the resend; if anything else (revoke, start,
 *  a real Expired row...) sits in between, the gap isn't an expiry.
 *  Real audit rows never reach this: it only fills a hole they left. */
const INFERENCE_SAFE_LABELS = new Set(['System Check', 'Email Read']);
const inferMissingExpiries = (
  events: TimelineEntry[],
  spanMs: number,
  expiredAction: string
): TimelineEntry[] => {
  if (!(spanMs > 0)) return events;
  const sorted = [...events].sort(compareTimelineEntries);
  const inferred: TimelineEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].label !== 'Invited') continue;
    let j = i + 1;
    while (j < sorted.length && sorted[j].label !== 'Invited') j++;
    if (j >= sorted.length) break;
    const between = sorted.slice(i + 1, j);
    if (between.some((e) => !INFERENCE_SAFE_LABELS.has(e.label))) continue;
    const deadline = new Date(sorted[i].at).getTime() + spanMs;
    if (deadline < new Date(sorted[j].at).getTime()) {
      inferred.push({ ...describeTimelineAction(expiredAction), at: new Date(deadline).toISOString() });
    }
  }
  return [...events, ...inferred];
};

/** An invitation can lapse at most once per send: between one "Invited" and
 *  the next there is a single deadline. More than one "Expired at" in that
 *  stretch is always an artefact — rows written out of order around a resend,
 *  or by older code that re-logged the same lapse — so keep the earliest and
 *  drop the rest. A fresh send ("Invited") starts a new stretch, so a genuine
 *  Invited -> Expired -> Invited -> Expired history is untouched. */
const collapseRepeatedExpiries = (sorted: TimelineEntry[]): TimelineEntry[] => {
  let expiredSinceLastSend = false;
  return sorted.filter((entry) => {
    if (entry.label === 'Invited') {
      expiredSinceLastSend = false;
      return true;
    }
    if (entry.label !== 'Expired at') return true;
    if (expiredSinceLastSend) return false;
    expiredSinceLastSend = true;
    return true;
  });
};

const FALLBACK_MATCH_WINDOW_MS = 2 * 60 * 1000;

/** Chronological order isn't quite the same as raw timestamp order in ONE
 *  known case: "Invite Failed" is written by the service layer before
 *  "Invited" is written by the router further up the call stack for the
 *  same send attempt, so a millisecond-accurate sort can show "Invite
 *  Failed" a beat before the "Invited" it belongs to. Every other pair of
 *  events (Edited -> its own resend's Invited, Revoked -> a later Edited,
 *  etc.) is written in true chronological order by the backend already, so
 *  a generic rank table here would do more harm than good — e.g. ranking
 *  Edited ahead of Invited to fix nothing would instead flip the very
 *  common "Edited" -> "Invited" (Save & Send) pair, which is always
 *  genuinely written in that order and just seconds apart. Handle only the
 *  one documented backwards case, and trust real timestamps everywhere
 *  else. */
const ORDER_TIE_WINDOW_MS = 10 * 1000;
const compareTimelineEntries = (a: TimelineEntry, b: TimelineEntry): number => {
  const ta = new Date(a.at).getTime();
  const tb = new Date(b.at).getTime();
  if (Math.abs(ta - tb) <= ORDER_TIE_WINDOW_MS) {
    const aFailed = a.label === 'Invite Failed';
    const bFailed = b.label === 'Invite Failed';
    if (aFailed && b.label === 'Invited') return 1;
    if (bFailed && a.label === 'Invited') return -1;
  }
  return ta - tb;
};

const buildFullTimeline = (
  inv: any,
  auditLogs: Array<{ action: string; created_at: string | null }>
): TimelineEntry[] => {
  // Defensive: collapse exact duplicates — same action, same millisecond —
  // rather than every occurrence of an action. The real fix is upstream
  // (the write side no longer double-logs a retry/reconnect as a second
  // "Started"), but this catches any other exact-duplicate row without
  // touching two genuinely repeated actions at different times, e.g.
  // Started 10:00 -> Revoked 10:05 -> Started 10:10 must all still show.
  const seen = new Set<string>();
  const dedupedLogs = auditLogs.filter((log) => {
    if (!log.created_at) return true;
    const key = `${log.action}|${new Date(log.created_at).getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const out: TimelineEntry[] = dedupedLogs
    .filter((log) => !!log.created_at)
    .map((log) => ({ ...describeTimelineAction(log.action), at: log.created_at as string }));

  // created_at (row birth, never touched again) rather than sent_at/
  // expires_at (both overwritten by a later resend) — using a mutable
  // column here would make the very fields a resend rewrites decide whether
  // history from BEFORE that resend still shows.
  const clockExpired = !inv.started_at && !inv.unit_consumed && inv.expires_at && new Date(inv.expires_at) < new Date();
  // A revoked invitation was killed by the recruiter, not by its deadline —
  // even when a stale expires_at (older revokes overwrote it with the revoke
  // time) says the clock ran out, "Expired at" would be a phantom line.
  const isLiveExpired =
    !inv.completed_at &&
    resolveInviteStatus(inv) !== 'revoked' &&
    (resolveInviteStatus(inv) === 'expired' || clockExpired);
  const fallback: [string, string | null | undefined][] = [
    ['assessment_invite', inv.created_at],
    ['assessment_start', inv.started_at],
    ['assessment_complete', inv.completed_at],
    ['assessment_exit', inv.terminated_at && !inv.completed_at ? inv.terminated_at : null],
    // Live-computed only as a last resort — a real audit row (backdated to
    // the actual deadline) always wins once one exists.
    ['assessment_invitation_expired', isLiveExpired ? inv.expires_at : null],
  ];
  for (const [action, at] of fallback) {
    if (!at) continue;
    const candidateMs = new Date(at).getTime();
    const wantedLabel = describeTimelineAction(action).label;
    // The audit row is written AFTER the column is set (revoke/start rows
    // land seconds later; the invite row after the email goes out), so a
    // strict "at or before" test saw that later row as a different event and
    // rendered both. The window treats a real row just after the column as
    // the same event; anything genuinely earlier still counts as before.
    const coveredByRealRow = dedupedLogs.some(
      (log) =>
        log.created_at &&
        new Date(log.created_at).getTime() <= candidateMs + FALLBACK_MATCH_WINDOW_MS &&
        describeTimelineAction(log.action).label === wantedLabel
    );
    if (!coveredByRealRow) {
      out.push({ ...describeTimelineAction(action), at });
    }
  }

  // Email Read / Bounced / System Check aren't audit-logged (they're pixel/
  // IMAP/consent signals, not recruiter or candidate actions) — always
  // synthesized from their own columns.
  if (inv.email_read_at) out.push({ label: 'Email Read', at: inv.email_read_at, Icon: Eye, tone: 'text-brand-cyan' });
  if (inv.bounced_at) out.push({ label: 'Bounced', at: inv.bounced_at, Icon: RefreshCw, tone: 'text-destructive' });
  if (inv.opened_at) out.push({ label: 'System Check', at: inv.opened_at, Icon: Monitor, tone: 'text-brand-cyan' });

  const merged = inferMissingExpiries(out, inv.expires_at && inv.sent_at ? new Date(inv.expires_at).getTime() - new Date(inv.sent_at).getTime() : 0, 'assessment_invitation_expired').sort(
    compareTimelineEntries
  );
  // Every derivation above (inference, dedup, collapse) assumes ascending
  // input, so the reverse — most recent event first — happens only here, on
  // the way out.
  return collapseRepeatedExpiries(merged).reverse();
};

/** Compact per-row timeline preview — capped at the 4 most recent events
 *  (newest first, matching the full history); older ones drop off the cell
 *  but stay reachable via "View full history", which reads the uncapped
 *  trail separately. */
const COMPACT_TIMELINE_LIMIT = 4;
export const timelineEvents = (inv: any): TimelineEntry[] =>
  buildFullTimeline(inv, inv.timeline || []).slice(0, COMPACT_TIMELINE_LIMIT);

/** "View full history" only earns its place once something is actually
 *  hidden by the cap above — at 4 events or fewer the compact list already
 *  shows everything, so the link would open a modal identical to what's
 *  already on screen. */
export const hasMoreTimelineHistory = (inv: any): boolean =>
  buildFullTimeline(inv, inv.timeline || []).length > COMPACT_TIMELINE_LIMIT;

/* ── Row-action builder ─────────────────────────────────────────────────
   One function, called by all three surfaces, so the status rules for
   which actions show can never drift between them again. */

export interface RowAction {
  key: string;
  label: string;
  Icon: LucideIcon;
  run: () => void;
  disabled?: boolean;
  title?: string;
  destructive?: boolean;
  busy?: boolean;
  iconClassName?: string;
}

export function buildInvitationRowActions(inv: any, opts: {
  onResend?: (inv: any) => void;
  resendingId?: string | null;
  /** Pre-existing "fix a bad address" flow — failed (Edit Email) / bounced (Change Email). */
  onEditEmail?: (inv: any) => void;
  /** New: edit candidate name + email while revoked, then Save & Send. */
  onEdit?: (inv: any) => void;
  /** New: revoke a single sent invitation. */
  onRevoke?: (inv: any) => void;
  revokingId?: string | null;
  onViewResult?: (inv: any) => void;
}): RowAction[] {
  const actions: RowAction[] = [];
  const status = resolveInviteStatus(inv);

  if (isCopyLinkAvailable(inv)) {
    actions.push({ key: 'copy', label: 'Copy Link', Icon: Copy, run: () => copyInvitationLink(inv), iconClassName: 'text-menu-icon-download' });
  }
  if (opts.onViewResult && status === 'completed') {
    actions.push({
      key: 'view',
      label: 'View Results',
      Icon: Eye,
      run: () => opts.onViewResult!(inv),
      disabled: !inv.attempt_id,
      iconClassName: 'text-menu-icon-view',
    });
  }
  if (opts.onResend && canResendInvite(inv)) {
    actions.push({
      key: 'resend',
      label: 'Resend',
      Icon: Mail,
      run: () => opts.onResend!(inv),
      busy: opts.resendingId === inv.id,
      disabled: opts.resendingId === inv.id,
      iconClassName: 'text-menu-icon-share',
    });
  }
  if (opts.onEditEmail && (status === 'failed' || status === 'bounced')) {
    actions.push({
      key: 'edit-email',
      label: status === 'bounced' ? 'Change Email' : 'Edit Email',
      Icon: Pencil,
      run: () => opts.onEditEmail!(inv),
      iconClassName: 'text-menu-icon-edit',
    });
  }
  if (opts.onEdit && canEditInvitation(inv)) {
    actions.push({
      key: 'edit',
      label: 'Edit',
      Icon: Pencil,
      run: () => opts.onEdit!(inv),
      title: 'Edit candidate details and send',
      iconClassName: 'text-menu-icon-edit',
    });
  }
  if (opts.onRevoke && isRevocableInvitation(inv)) {
    actions.push({
      key: 'revoke',
      label: 'Revoke',
      Icon: Ban,
      run: () => opts.onRevoke!(inv),
      disabled: opts.revokingId === inv.id,
      busy: opts.revokingId === inv.id,
      title: "Revoke this invitation — the candidate's link will stop working",
      destructive: true,
    });
  }
  return actions;
}

/* ── Presentational: desktop kebab + mobile inline buttons ─────────────── */

export function InvitationActionsMenu({ actions, extraItems, className }: {
  actions: RowAction[];
  /** Report/score menu items that aren't part of this shared toolkit (e.g.
   *  "View Result" / "Download Report" on the Invitation Status tab) —
   *  rendered ahead of the built-in actions inside the same menu. */
  extraItems?: React.ReactNode;
  className?: string;
}) {
  if (actions.length === 0 && !extraItems) return <span className="text-xs text-gray-400 dark:text-slate-500">—</span>;
  return (
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
      <DropdownMenuContent align="end" className={className || 'w-44'}>
        {extraItems}
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
  );
}

export function InvitationActionButtons({ actions }: { actions: RowAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap justify-end">
      {actions.map(({ key, label, Icon, run, disabled, title, destructive, busy }) => (
        <button
          key={key}
          onClick={(e) => { e.stopPropagation(); run(); }}
          disabled={disabled}
          title={title || label}
          className={`flex items-center gap-1 px-2 py-1 text-2xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            destructive
              ? 'text-destructive bg-destructive-subtle ring-1 ring-destructive-line hover:bg-destructive-subtle'
              : 'border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
          }`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
          {label}
        </button>
      ))}
    </div>
  );
}

/** "View full history" trigger — drop next to the compact timeline preview. */
export function ViewFullHistoryLink({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex items-center gap-1 font-medium text-brand-blue hover:underline ${compact ? 'text-2xs mb-1.5' : 'text-2xs mt-1'}`}
    >
      <History className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} /> View full history
    </button>
  );
}

/* ── Drop-in dialogs ─────────────────────────────────────────────────── */

/** Edit a revoked invitation's name/email, then resend in one step. */
export function EditInvitationModal({ target, onClose, getAssessmentId, onSaved }: {
  target: any | null;
  onClose: () => void;
  getAssessmentId: (inv: any) => string;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState({ candidate_name: '', candidate_email: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setForm({ candidate_name: target.candidate_name || '', candidate_email: target.candidate_email || '' });
    }
  }, [target]);

  if (!target) return null;

  const save = async () => {
    const name = form.candidate_name.trim();
    const email = form.candidate_email.trim();
    if (!name || !email) {
      toast.error('Candidate name and email are required');
      return;
    }
    const assessmentId = getAssessmentId(target);
    setSaving(true);
    try {
      await assessmentService.updateInvitationDetails(assessmentId, target.id, { candidate_name: name, candidate_email: email });
      try {
        await assessmentService.resendInvitation(assessmentId, target.id);
        toast.success(`Invitation updated and sent to ${email}`);
      } catch (sendErr: any) {
        const detail = sendErr?.response?.data?.detail;
        const msg =
          (typeof detail === 'object' && detail?.message) ||
          (typeof detail === 'string' && detail) ||
          sendErr?.message ||
          'Details saved, but the invitation could not be sent — try Edit again.';
        toast.error(msg);
      }
      await onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update invitation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-md">
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Edit Invitation</h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { if (!saving) onClose(); }}
            aria-label="Close"
            className="px-2"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="px-5 sm:px-6 py-4 space-y-4">
          <p className="text-sm text-gray-500 dark:text-slate-500">
            Update the candidate's details below. Saving will send them a fresh invitation link automatically.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Candidate name</label>
            <input
              type="text"
              value={form.candidate_name}
              onChange={(e) => setForm((f) => ({ ...f, candidate_name: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Candidate email</label>
            <input
              type="email"
              value={form.candidate_email}
              onChange={(e) => setForm((f) => ({ ...f, candidate_email: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
            />
          </div>
        </div>
        <div className="px-5 sm:px-6 py-4 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={save}
            disabled={saving}
            icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
          >
            Save & Send
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Revoke confirmation — thin wrapper so all three surfaces confirm the same way. */
export function RevokeInvitationDialog({ target, onClose, getAssessmentId, onRevoked }: {
  target: any | null;
  onClose: () => void;
  getAssessmentId: (inv: any) => string;
  onRevoked: () => void | Promise<void>;
}) {
  const [revoking, setRevoking] = useState(false);
  return (
    <ConfirmationDialog
      isOpen={!!target}
      onClose={() => { if (!revoking) onClose(); }}
      onConfirm={async () => {
        if (!target) return;
        setRevoking(true);
        try {
          await assessmentService.revokeInvitation(getAssessmentId(target), target.id);
          toast.success(`Invitation for ${target.candidate_email} has been revoked`);
          await onRevoked();
          onClose();
        } catch (err: any) {
          toast.error(err?.message || 'Failed to revoke invitation');
        } finally {
          setRevoking(false);
        }
      }}
      title="Revoke Invitation Link?"
      description={
        target
          ? `This will immediately expire the assessment link sent to ${target.candidate_email}. The candidate will no longer be able to access it using this link. You'll be able to edit the candidate's details and send a new invitation afterwards.`
          : ''
      }
      confirmText={revoking ? 'Revoking…' : 'Confirm'}
      cancelText="Cancel"
      variant="danger"
    />
  );
}

/** Full action-log modal — every send, resend, revoke, edit and candidate
 *  lifecycle milestone as its own row, oldest first. Fetched on demand. */
export function InvitationHistoryDialog({ target, onClose, getAssessmentId }: {
  target: any | null;
  onClose: () => void;
  getAssessmentId: (inv: any) => string;
}) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setEntries(null);
    setError(null);
    setLoading(true);
    assessmentService.getInvitationTimeline(getAssessmentId(target), target.id)
      .then((logs) => {
        setEntries(
          logs
            .filter((log) => !!log.created_at)
            .map((log) => ({ ...describeTimelineAction(log.action), at: log.created_at as string }))
            .sort(compareTimelineEntries)
            .reverse()
        );
      })
      .catch((err: any) => setError(err?.message || 'Failed to load history'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitation History</DialogTitle>
          <DialogDescription>{target?.candidate_name || target?.candidate_email || 'Candidate'}</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[60vh] -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6 text-center">{error}</p>
          ) : entries && entries.length > 0 ? (
            <ol className="space-y-3">
              {entries.map((entry, i) => (
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
  );
}
