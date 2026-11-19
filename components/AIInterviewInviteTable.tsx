'use client';

import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { Fragment, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Mail, Play, CheckCircle, Clock, Ban, Copy, Loader2, Users, Eye, Pencil, Check,
  MoreVertical, Monitor, History, XCircle, FileText, Timer, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatIST, parseIST } from '@/lib/utils/dateUtils';
import { MENU_ITEM_SCALE_CLASS, MENU_ITEM_LIGHT_HIGHLIGHT_CLASS, MENU_ITEM_DESTRUCTIVE_HIGHLIGHT_CLASS, MENU_PANEL_BORDER_CLASS } from '@/lib/constants/menuAnimation';
import { TRACKER_DIALOG_PLACEHOLDER_CLASS } from '@/lib/constants/trackerDialog';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE, JD_ARCHIVED_ACTION_MESSAGE, isInterviewConfigArchived, INTERVIEW_ARCHIVED_ACTION_MESSAGE } from '@/lib/services/aiInterviewService';
import type { TimelineHistoryRow } from '@/components/ui/timeline-history-dialog';
import { JobVersionStatusPill, jobLockKindOf } from '@/components/jobs/JobLockNotice';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/ai-interview/AllInterviewsTable';
import { TrackerCheckbox, TrackerTimeline, TrackerScorePill } from '@/components/ui/tracker-look';
import InviteStatusChip from '@/components/ui/invite-status-chip';
import { capitalizedCase } from '@/lib/utils/candidateNameDisplay';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import { MobileRecordCard, MobileStatChip } from '@/components/ui/mobile-record-card';
import { type ListDisplayMode } from '@/components/ui/list-view-toggle';
import { Button } from '@/components/ui/button';
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
import { useAuth } from '@/components/providers/AuthProvider';
import { invitedViaResume, useInviteResumePreview } from '@/components/ai-interview/useInviteResumePreview';

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

/** Copy Link disappears as soon as the candidate STARTS the interview
 *  (in_progress / started_at set) — a link to an interview already under way
 *  is no use to share — and stays gone through completed/terminated. Also
 *  gone once revoked (only Edit remains from there). Revoked is listed
 *  explicitly (rather than relying on it not being 'invited') so the intent
 *  reads at the call site. */
export const isInterviewLinkLive = (inv: any): boolean =>
  !!inv.interview_token &&
  !inv.started_at &&
  !['in_progress', 'completed', 'cancelled', 'terminated', 'expired', 'revoked'].includes(resolveInviteStatus(inv)) &&
  !['in_progress', 'completed', 'terminated'].includes(inv.status) &&
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

/** Rows with a result to open: Completed, and Terminated (partial evaluation). */
const hasResultToOpen = (inv: any): boolean => inv.status === 'completed' || inv.status === 'terminated';

/** Pass/Fail for the Score column. The backend's `final_result` wins; older
 *  sessions without it fall back to the same 60% MHS pass mark the evaluation
 *  report uses. null (no badge) until there is a score to judge. */
export const inviteResult = (inv: any, score: number | null): 'Pass' | 'Fail' | null => {
  const backendFinal = (inv?.ai_evaluation?.final_result || '').toString().toLowerCase();
  if (backendFinal === 'pass') return 'Pass';
  if (backendFinal === 'fail') return 'Fail';
  if (score == null) return null;
  return score >= 60 ? 'Pass' : 'Fail';
};

/** The Result filter ('pass' | 'fail' | 'unscored', '' = any) matched against
 *  the same Pass/Fail the badge shows, so a filter never disagrees with it. */
export const matchesInviteResultFilter = (inv: any, score: number | null, filter: string): boolean => {
  if (!filter) return true;
  const result = inviteResult(inv, score);
  if (filter === 'unscored') return result == null;
  return result?.toLowerCase() === filter;
};

/** Same pill as the Candidate Results tab's PassFailBadge — tick/cross inside. */
export const ResultBadge = ({ result }: { result: 'Pass' | 'Fail' | null }) =>
  result ? (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium ring-1 whitespace-nowrap ${
        result === 'Pass'
          ? 'bg-success-subtle text-success ring-success-line'
          : 'bg-destructive-subtle text-destructive ring-destructive-line'
      }`}
    >
      {result === 'Pass' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {result}
    </span>
  ) : null;

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
/** Compact view caps at the 4 most recent events, still read oldest-first
 *  (ascending, matching the full history) — older ones drop off the table
 *  cell but stay reachable via "View full history", which reads the uncapped
 *  trail separately. */
const COMPACT_TIMELINE_LIMIT = 4;

/** A candidate who reloads or reconnects lands on the system check again, and
 *  every consent click (rules_acknowledged, final_accept) is logged as
 *  ai_interview_consent — so back-to-back "System Check" rows piled up. Every
 *  view (compact cell and full history) keeps only the first of each unbroken
 *  run (when the check began); a System Check after a later event, e.g. a
 *  resend, still shows. */
const collapseRepeatedSystemChecks = (events: TimelineEntry[]): TimelineEntry[] =>
  events.filter((e, i) => !(e.label === 'System Check' && events[i - 1]?.label === 'System Check'));

export const timelineEvents = (inv: any, limit: number = COMPACT_TIMELINE_LIMIT): TimelineEntry[] =>
  collapseRepeatedSystemChecks(buildFullTimeline(inv, inv.timeline || [])).slice(-limit);

/** The Timeline cell's lines (Invited, System Check, Started, Completed...)
 *  for any AI interview row, so the Results tables read exactly like the
 *  Track Invites table. A results row is the same session/invite record,
 *  so it carries the same fields timelineEvents reads. `duration` adds the
 *  results-only Duration line underneath. */
export const InviteTimelineLines = ({ inv, duration, limit }: { inv: any; duration?: string | null; limit?: number }) => {
  const events = timelineEvents(inv, limit);
  if (events.length === 0 && !duration) {
    return <span className="tf-hint">—</span>;
  }
  return (
    <div className="space-y-1 text-xs">
      {events.map(({ label, at, Icon, tone }, i) => (
        <div key={`${label}-${i}`} className="flex items-center gap-2 whitespace-nowrap">
          <Icon className={`w-3 h-3 flex-shrink-0 ${tone}`} />
          <span className={tone}>{label}: {formatIST(at)}</span>
        </div>
      ))}
      {duration && (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Timer className="w-3 h-3 flex-shrink-0 text-gray-400" />
          <span><span className="text-gray-400 dark:text-slate-400">Duration:</span> {duration}</span>
        </div>
      )}
    </div>
  );
};

/** "View full history" only earns its place once something is actually
 *  hidden from the compact cell by the 4-event cap —
 *  otherwise the link would open a modal identical to what's on screen. */
export const hasMoreTimelineHistory = (inv: any, limit?: number): boolean =>
  collapseRepeatedSystemChecks(buildFullTimeline(inv, inv.timeline || [])).length > timelineEvents(inv, limit).length;

/** Timeline labels that are a status of the invitation (Edited only records
 *  a change to it) — View History's Status column. */
const TIMELINE_STATUS_LABELS = new Set(['Invited', 'Revoked', 'System Check', 'Started', 'Completed', 'Terminated', 'Expired at']);

/** One line under each event in View History, saying what it means. */
const TIMELINE_EVENT_DESCRIPTION: Record<string, string> = {
  'Invited': 'Invitation sent to candidate',
  'Revoked': 'Invitation revoked',
  'Edited': 'Invitation details edited',
  'System Check': 'Candidate accepted consent and began the system check',
  'Started': 'Candidate started the AI interview',
  'Completed': 'Candidate completed the AI interview',
  'Terminated': 'AI interview ended before it was completed',
  'Expired at': 'Invitation link expired',
};

/** View History on the Job Details AI Interview Result tab: the session's
 *  whole audit trail (the "View full history" modal's source), oldest first. */
export const loadInterviewHistory = async (inv: any): Promise<TimelineHistoryRow[]> => {
  const logs = await aiInterviewService.getSessionTimeline(inv.id);
  return collapseRepeatedSystemChecks(buildFullTimeline(inv, logs)).map((entry) => ({
    ...entry,
    isStatus: TIMELINE_STATUS_LABELS.has(entry.label),
    description: TIMELINE_EVENT_DESCRIPTION[entry.label],
  }));
};

/** Every occurrence of an invitation-management action (not just the latest)
 *  reads the same audit trail the Activity Log is built from — see
 *  aiInterviewService.getSessionTimeline. Multiple sends, edits or revokes
 *  each show up as their own row here, in real chronological order, and
 *  unlike timelineEvents() above (capped to the 4 most recent for the
 *  compact cell), this — the "View full history" modal's source — is never
 *  truncated. */
const describeTimelineAction = (action: string): { label: string; Icon: LucideIcon; tone: string } => {
  switch (action) {
    case 'ai_interview_invite':
      return { label: 'Invited', Icon: Mail, tone: 'text-brand-blue' };
    case 'ai_interview_invite_revoke':
      return { label: 'Revoked', Icon: Ban, tone: 'text-destructive' };
    case 'ai_interview_invite_edit':
      return { label: 'Edited', Icon: Pencil, tone: 'text-brand-orange-deep' };
    case 'ai_interview_consent':
      return { label: 'System Check', Icon: Monitor, tone: 'text-brand-cyan' };
    case 'ai_interview_start':
      return { label: 'Started', Icon: Play, tone: 'text-brand-orange-deep' };
    case 'ai_interview_complete':
      return { label: 'Completed', Icon: CheckCircle, tone: 'text-success' };
    case 'ai_interview_terminated':
      return { label: 'Terminated', Icon: Ban, tone: 'text-destructive' };
    case 'ai_interview_invite_expired':
      return { label: 'Expired at', Icon: Clock, tone: 'text-brand-orange-deep' };
    default:
      return { label: action, Icon: Clock, tone: 'text-gray-500 dark:text-slate-400' };
  }
};

/** Merges the fetched audit trail with a same-shaped fallback synthesized from
 *  the invitation row's own single-value columns — for rows from before this
 *  trail existed, and for the case where the trail only has a LATER
 *  occurrence of an action (a resend's own "Invited" row, say) and would
 *  otherwise silently hide an earlier one that predates the interview_id
 *  field. Real audit rows always win: the fallback for a given type only
 *  fires when there's no real row of that type AT OR BEFORE its own
 *  timestamp — "no rows at all" would wrongly suppress the fallback for the
 *  gap case above, since a later real row still makes loggedActions.has(...)
 *  true. */
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
/** See the identical comment in AssessmentInviteActions.tsx: only the
 *  Invite-Failed-before-Invited pair is a known backwards write; every other
 *  pair (Edited -> its resend's Invited, Revoked -> a later Edited, etc.) is
 *  already written in true chronological order, so this is intentionally
 *  narrow rather than a generic rank table. */
const ORDER_TIE_WINDOW_MS = 10 * 1000;
const compareTimelineEntries = (a: TimelineEntry, b: TimelineEntry): number => {
  const ta = parseIST(a.at).getTime();
  const tb = parseIST(b.at).getTime();
  if (Math.abs(ta - tb) <= ORDER_TIE_WINDOW_MS) {
    const aFailed = a.label === 'Invite Failed';
    const bFailed = b.label === 'Invite Failed';
    if (aFailed && b.label === 'Invited') return 1;
    if (bFailed && a.label === 'Invited') return -1;
  }
  return ta - tb;
};

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

/* 10 minutes, not 2 (2026-11-11) — as the assessment trail: a slow send
   landed its "Invited" audit row past 2 minutes, and the row's created_at
   then read as a second "Invited" in Invitation History. */
const FALLBACK_MATCH_WINDOW_MS = 10 * 60 * 1000;
/* The same event logged twice (a retried write) or read from two copies of
   the trail prints as two identical lines: neighbours with the same label
   inside a minute are one event, the earliest kept — the assessment trail's
   collapseRepeatedEvents. A real repeat (Invited -> Revoked -> Invited)
   keeps every line, since only neighbours in time order merge. */
const DUPLICATE_EVENT_WINDOW_MS = 60 * 1000;
const collapseRepeatedEvents = (sorted: TimelineEntry[]): TimelineEntry[] =>
  sorted.filter((entry, i) => {
    const prev = sorted[i - 1];
    return !(prev && prev.label === entry.label && parseIST(entry.at).getTime() - parseIST(prev.at).getTime() <= DUPLICATE_EVENT_WINDOW_MS);
  });
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
    const key = `${log.action}|${parseIST(log.created_at).getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const out: TimelineEntry[] = dedupedLogs
    .filter((log) => !!log.created_at)
    .map((log) => ({ ...describeTimelineAction(log.action), at: log.created_at as string }));

  // created_at (row birth, never touched again) rather than
  // invitation_sent_at/expires_at (both overwritten by a later resend) —
  // using a mutable column here would make the very fields a resend rewrites
  // decide whether history from BEFORE that resend still shows.
  const clockExpired =
    !inv.started_at && !inv.unit_consumed && inv.expires_at && new Date(inv.expires_at) < new Date();
  // Revoked is the recruiter's doing, not the deadline's: once the (untouched)
  // expires_at later slips into the past, clockExpired would otherwise add an
  // "Expired at" line after the Revoked one.
  const isLiveExpired =
    !inv.completed_at &&
    (inv.status || '').toLowerCase() !== 'revoked' &&
    ((inv.status || '').toLowerCase() === 'expired' || clockExpired);
  const fallback: [string, string | null | undefined][] = [
    // created_at specifically, not invitation_sent_at — the latter is
    // overwritten to the LATEST send time by every resend, so using it here
    // would make a resend's own real "Invited" row appear to "cover" the
    // original send too (same rewritten timestamp), erasing it from history.
    ['ai_interview_invite', inv.created_at],
    ['ai_interview_consent', inv.consent_accepted_at],
    ['ai_interview_start', inv.started_at],
    ['ai_interview_complete', inv.completed_at],
    ['ai_interview_invite_revoke', inv.revoked_at],
    // Live-computed only as a last resort — a real audit row (backdated to
    // the actual deadline) always wins once one exists.
    ['ai_interview_invite_expired', isLiveExpired ? inv.expires_at : null],
  ];
  for (const [action, at] of fallback) {
    if (!at) continue;
    const candidateMs = parseIST(at).getTime();
    // The audit row is written AFTER the column is set (the revoke row lands
    // ~1s after revoked_at, the invite row seconds after invitation_sent_at
    // because the email goes out first). A strict "at or before" test saw
    // that later row as a different event and rendered both, i.e. a
    // duplicate. The window treats a real row just after the column as the
    // same event; anything genuinely earlier still counts as before.
    const coveredByRealRow = dedupedLogs.some(
      (log) =>
        log.action === action &&
        log.created_at &&
        parseIST(log.created_at).getTime() <= candidateMs + FALLBACK_MATCH_WINDOW_MS
    );
    if (!coveredByRealRow) {
      out.push({ ...describeTimelineAction(action), at });
    }
  }

  const merged = inferMissingExpiries(out, inv.expires_at && inv.invitation_sent_at ? new Date(inv.expires_at).getTime() - new Date(inv.invitation_sent_at).getTime() : 0, 'ai_interview_invite_expired').sort(
    compareTimelineEntries
  );
  // Ascending — oldest event first, the order it happened in.
  return collapseRepeatedExpiries(collapseRepeatedEvents(merged));
};

/** Badge wording and colours kept in one place so a recruiter reads the same
 *  status regardless of where tracking was opened from. */
export const AIInviteStatusBadge = ({ inv }: { inv: any }) => {
  /* One badge — the status the Timeline ends on: a link that ran out before
     the candidate started is Expired, whatever step (Invited / System Check)
     it reached first. It used to keep that step's badge and add a second
     Expired flag beside it. */
  if (isInviteExpired(inv)) return <InviteStatusChip kind="expired" title="The link expired before the candidate started" />;
  switch (inv.status) {
    case 'completed': {
      // (Auto) surfaces when the timeout monitor finalized an abandoned session —
      // closing_reason starts with 'time_limit' (ai_interview_timeout_monitor.py).
      const reason: string = (inv.ai_evaluation?.closing_reason || '').toString().toLowerCase();
      const autoCompleted = reason.startsWith('time_limit');
      return <InviteStatusChip kind="completed" auto={autoCompleted} title={autoCompleted ? 'Auto-completed when the interview duration elapsed' : undefined} />;
    }
    case 'in_progress':
      return <InviteStatusChip kind="in_progress" />;
    // Was missing, so the raw "system_check" value printed — same chip and
    // tooltip as the Assessment tracker's System Check.
    case 'system_check':
      return <InviteStatusChip kind="system_check" title="Consent accepted — the candidate is on the system check step" />;
    case 'invited':
      return <InviteStatusChip kind="invited" />;
    case 'cancelled':
      return <InviteStatusChip kind="cancelled" />;
    case 'terminated': {
      // closing_reason is set by evaluate_and_persist_session as
      // "proctoring_terminated: <human message>" (candidate_ai_interview.py) once
      // the background re-evaluation of the cut-short transcript lands — strip the
      // prefix so the tooltip reads as a sentence. Falls back to the generic
      // wording when no evaluation exists yet (still evaluating, or it failed).
      const rawReason: string = (inv.ai_evaluation?.closing_reason || '').toString();
      const detail = rawReason.replace(/^proctoring_terminated:\s*/i, '').trim();
      return <InviteStatusChip kind="terminated" title={detail || 'Auto-ended by the proctoring policy — candidate left the interview screen'} />;
    }
    case 'expired':
      return <InviteStatusChip kind="expired" />;
    case 'revoked':
      return <InviteStatusChip kind="revoked" title="Revoked by recruiter — the old link no longer works" />;
    // The Invite Failed tab's rows, once the backend reports them.
    case 'failed':
      return <InviteStatusChip kind="invite_failed" />;
    case 'bounced':
      return <InviteStatusChip kind="bounced" />;
    default:
      return <InviteStatusChip kind="other" label={inv.status || 'Pending'} />;
  }
};

/** The status badge's wording as plain text (exports, screen-reader text).
 *  Same rules as AIInviteStatusBadge, so a file always matches the screen. */
export const inviteStatusLabel = (inv: {
  status?: string | null;
  expires_at?: string | null;
  ai_evaluation?: { closing_reason?: unknown } | null;
}): string => {
  if (isInviteExpired(inv)) return 'Expired';
  switch (inv.status) {
    case 'completed': {
      const reason: string = (inv.ai_evaluation?.closing_reason || '').toString().toLowerCase();
      return reason.startsWith('time_limit') ? 'Completed (Auto)' : 'Completed';
    }
    case 'in_progress': return 'In Progress';
    case 'system_check': return 'System Check';
    case 'invited': return 'Invited';
    case 'cancelled': return 'Cancelled';
    case 'terminated': return 'Terminated';
    case 'expired': return 'Expired';
    case 'revoked': return 'Revoked';
    case 'failed': return 'Invite Failed';
    case 'bounced': return 'Bounced';
    default: return inv.status ? String(inv.status) : 'Pending';
  }
};

/** "Invite Source" wording and icon for the backend's invite_source. Anonymous
 *  share-link sessions ("link") came from neither flow, so they read as a dash.
 *  Mail is the same glyph the "Invited" stat card and timeline entry use;
 *  FileText is the resume document. Both share one tone so neither source
 *  reads as more important than the other. */
const INVITE_SOURCES: Record<string, { label: string; Icon: LucideIcon }> = {
  resume: { label: 'Via Resume', Icon: FileText },
  email: { label: 'Via Email', Icon: Mail },
};
export const inviteSourceLabel = (inv: any): string | null => INVITE_SOURCES[inv.invite_source]?.label ?? null;

/** Assessment invitations store no invite method of their own — their
 *  invite_source names the page the invite was sent from ("Assessment", "JD").
 *  resume_id is written only when the recruiter picked a resume, so it IS the
 *  method: a resume invite, otherwise one typed in by e-mail. Returned in the
 *  shape InviteSourceValue reads, so both modules render the same cell. */
export const assessmentInviteSource = (row: { resume_id?: string | null } | null | undefined) =>
  ({ invite_source: row?.resume_id ? 'resume' : 'email' });

export const InviteSourceValue =({ inv, iconClassName }: { inv: any; iconClassName: string }) => {
  const source = INVITE_SOURCES[inv.invite_source];
  if (!source) return null;
  const { label, Icon } = source;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className={`${iconClassName} flex-shrink-0 text-brand-blue`} aria-hidden="true" />
      {label}
    </span>
  );
};

/** Percentage cell for the Score column. null renders an
 *  em dash — the round wasn't run, isn't scored yet, or the evaluation carries no
 *  per-round breakdown. 60 is the same pass mark the overall Score column uses. */
const ScoreCell = ({ value, result }: { value: number | null; result: 'Pass' | 'Fail' | null }) =>
  value != null ? (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${SCORE_CELL_TEXT} ${value >= 60 ? 'text-success' : 'text-destructive'}`}>{value}%</span>
      <ResultBadge result={result} />
    </span>
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

type InviteColumnId =
  | 'candidate' | 'timeline' | 'status' | 'score' | 'inviteSource' | 'cid'
  | 'jobId' | 'jobTitle' | 'jobVersion' | 'interviewVersion';
/* autoHeight: every row at least the height of one whose Timeline carries its
   two events and View full history (69px). A table row's height is its minimum. */
const AUTO_HEIGHT_ROW_MIN_H = 'h-[69px]';
const AUTO_HEIGHT_COL_MIN_W: Record<string, string> = {
  candidate: 'min-w-[15rem]', timeline: 'min-w-[17.5rem]', status: 'min-w-[10.5rem]', score: 'min-w-[9rem]',
  inviteSource: 'min-w-[8.5rem]', cid: 'min-w-[7rem]', jobId: 'min-w-[7rem]', jobTitle: 'min-w-[12rem]',
  jobVersion: 'min-w-[7rem]', interviewVersion: 'min-w-[8.5rem]', actions: 'min-w-[5rem]',
};
/* With `expandableRows`, the six columns the desktop row shows; the rest open
   in the row's expanded panel (the Resume Scoring list's expand pattern). */
const PRIMARY_INVITE_COLUMNS: InviteColumnId[] = ['candidate', 'jobId', 'jobTitle', 'status', 'score', 'inviteSource'];
/* `trackerLook` (the Track popups): CID and Candidate first, then Status,
   Timeline and Score, the versions, and Invite Source last before Actions. */
const TRACKER_LOOK_ORDER: InviteColumnId[] = ['cid', 'candidate', 'jobId', 'jobTitle', 'status', 'timeline', 'score', 'jobVersion', 'interviewVersion', 'inviteSource'];
/* …and only Candidate keeps a floor, so the columns size to their
   content and the table fits a 1920px screen at 100% / 125%. */
const TRACKER_LOOK_COL_MIN_W: Record<string, string> = { candidate: 'min-w-[11rem]' };

export interface AIInterviewInviteTableProps {
  invitations: any[];
  isLoading: boolean;
  /** Drives the empty-state wording — a filtered-to-nothing list is not "none invited". */
  hasActiveFilters: boolean;
  /** Extra line under the empty state when nothing is filtered. */
  emptyHint?: string;
  /** A button (or two) under the empty state — the guided tracker's "Clear
   *  filters" / "Invite candidates". */
  emptyAction?: ReactNode;
  /** The desktop table grows to its rows instead of scrolling inside itself
   *  (the paged trackers, a few rows a page), with tighter rows. */
  autoHeight?: boolean;

  /**
   * Adds a "Job / Interview" column (desktop) / line (mobile) reading each
   * row's `_config_title` (and `_jd_short_id` badge, when present) — for a
   * list that spans every interview rather than one config's own tracker.
   */
  showJobColumn?: boolean;

  /**
   * Job Version and Interview Version columns (desktop) / line (mobile) for a
   * single-config tracker (the Track popup), where every invite belongs to the
   * same interview and so shares both numbers. Omit both to show neither.
   */
  jobVersion?: number;
  interviewVersion?: number;
  /** A job-wide Track popup spans several interviews: the same two columns,
   *  read per row from `_jd_version` / `_interview_version` instead. */
  showRowVersions?: boolean;

  /** Bulk selection. Omit both to render no checkbox column at all. */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  /** Which rows get a checkbox. Defaults to isRevocableInvite (the AI
   *  Interviews page's bulk-revoke rule); the Job Details tracker passes its
   *  bulk-resend rule (Invited/Expired) instead. */
  isSelectable?: (inv: any) => boolean;
  /** Optional Select All in the header (desktop table). Omit to leave the
   *  header cell empty, as the Track dialogs do. */
  allSelected?: boolean;
  onToggleSelectAll?: () => void;
  /** `trackerLook`: the header checkbox shown greyed, with this as its
   *  tooltip (e.g. Invited and Expired mixed on the page). */
  selectAllBlockedReason?: string;

  /** Row actions. Each omitted callback simply drops that action from the menu,
   *  which is how the Job Details tracker stays read-only. */
  onResend?: (inv: any) => void;
  onEdit?: (inv: any) => void;
  onRevoke?: (inv: any) => void;
  onViewDetails?: (inv: any) => void;
  /** Ids currently mid-request, so the row can show a spinner. */
  resendingId?: string | null;
  revokingId?: string | null;
  /** The interview's job is disabled: rows stay viewable, but Copy Link,
   *  Resend, Edit and Revoke are shown disabled. A row's own `_jd_status` /
   *  `jd_status` is honoured too, for lists that span several interviews. */
  jdDisabled?: boolean;
  /** The interview CONFIG itself is archived (its own status, independent of
   *  its job's) — same effect as `jdDisabled`: Copy Link / Revoke on an
   *  Invited row, Edit on a Revoked row, and Resend on an Expired row all stay
   *  visible but disabled. Table-wide, like `jdDisabled`, since every caller
   *  scopes this table to one config. */
  configArchived?: boolean;
  /** Desktop table: only PRIMARY_INVITE_COLUMNS in the row; a row click (or
   *  its chevron) expands it to show the rest, instead of opening the
   *  candidate. View Details stays in the row's ⋮ menu. */
  expandableRows?: boolean;
  /** 'grid' renders the rows as cards (the host's List/Card toggle). Every
   *  other caller omits it and keeps the table. */
  displayMode?: ListDisplayMode;
  /** The Track popups' look (components/ui/tracker-look): the native
   *  checkbox, the column order above, the Timeline and Score cells, and a
   *  centred ⋮. Presentation only. */
  trackerLook?: boolean;
}

export default function AIInterviewInviteTable({
  invitations,
  isLoading,
  hasActiveFilters,
  emptyHint,
  emptyAction,
  autoHeight = false,
  showJobColumn = false,
  jobVersion,
  interviewVersion,
  showRowVersions = false,
  selectedIds,
  onToggleSelect,
  isSelectable,
  allSelected = false,
  onToggleSelectAll,
  selectAllBlockedReason,
  onResend,
  onEdit,
  onRevoke,
  onViewDetails,
  resendingId,
  revokingId,
  jdDisabled = false,
  configArchived = false,
  expandableRows = false,
  displayMode = 'list',
  trackerLook = false,
}: AIInterviewInviteTableProps) {
  // Resend / Edit / Revoke need AI Interviews "Invite" (2026-11-10): a
  // view-only role (Viewer) could resend expired links.
  const { isTenantAdmin: isOwnerForInvites, hasPermissionCode: hasCodeForInvites } = useAuth();
  const canInviteRows = isOwnerForInvites || hasCodeForInvites('ai_interview:invite');
  const selectable = !!onToggleSelect;
  /* Row height: tighter when the table grows to its rows (autoHeight). */
  const cellY = autoHeight ? 'py-2' : 'py-3';
  /* autoHeight (the paged trackers): the latest two timeline events in the
     cell; the rest are one click away in View full history. */
  const timelineLimit = autoHeight ? 2 : undefined;
  /* autoHeight (the paged trackers): every column a set minimum, at least its
     widest content, so filtering to fewer rows never re-sizes the columns. */
  const colMinW = (id: string) => (trackerLook ? TRACKER_LOOK_COL_MIN_W[id] ?? '' : autoHeight ? AUTO_HEIGHT_COL_MIN_W[id] ?? '' : '');
  const inOrder = <T extends { id: InviteColumnId }>(list: T[]): T[] =>
    trackerLook ? [...list].sort((a, b) => TRACKER_LOOK_ORDER.indexOf(a.id) - TRACKER_LOOK_ORDER.indexOf(b.id)) : list;
  const inRow = (id: InviteColumnId) => !expandableRows || PRIMARY_INVITE_COLUMNS.includes(id);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /* A row's own job version Disabled or Archived locks it too (job-wide
     trackers span versions, so this is per row). */
  const rowJdArchived = (inv: { _jd_status?: string | null; jd_status?: string | null } | null | undefined): boolean => String(inv?._jd_status ?? inv?.jd_status ?? '').toLowerCase() === 'archived';
  const rowLocked = (inv: any): boolean => jdDisabled || configArchived || isJdDisabled(inv?._jd_status ?? inv?.jd_status) || rowJdArchived(inv);

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
      setTimelineEntries(collapseRepeatedSystemChecks(buildFullTimeline(inv, logs)));
    } catch (err: any) {
      setTimelineError(err?.message || 'Failed to load history');
    } finally {
      setTimelineLoading(false);
    }
  };

  /* Built once per row and rendered twice — as menu items on desktop, as compact
     buttons on the mobile card — so the two can't drift apart. */
  // Row ⋮ › View Resume (Via Resume invites): the result page's resume lookup and preview popup.
  const resumePreview = useInviteResumePreview();

  const rowActions = (inv: any): RowAction[] => {
    const actions: RowAction[] = [];
    const locked = rowLocked(inv);
    const lockedProps = locked
      ? { disabled: true, title: configArchived ? INTERVIEW_ARCHIVED_ACTION_MESSAGE : !jdDisabled && rowJdArchived(inv) ? JD_ARCHIVED_ACTION_MESSAGE : JD_DISABLED_ACTION_MESSAGE }
      : {};
    const noInviteProps = !canInviteRows ? { disabled: true, title: "You can view invitations, but your role can't resend, edit or revoke them" } : {};

    /* Copy Link also on an In Progress row (2026-11-11), as the Assessment
       menu offers it — while the interview is under way and its link is not
       expired; isInterviewLinkLive alone ends at the start. */
    const inProgressLink = !!inv.interview_token && resolveInviteStatus(inv) === 'in_progress' && !inv.completed_at;
    if (isInterviewLinkLive(inv) || inProgressLink) {
      actions.push({ key: 'copy', label: 'Copy Link', Icon: Copy, run: () => copyInterviewLink(inv), iconClassName: 'text-menu-icon-download', ...lockedProps });
    }
    /* View Results on Completed and Terminated rows — a terminated interview
       still has its (partial) evaluation to open; the result page shows it as
       a Partial Evaluation. In Progress / Invited have nothing to show yet. */
    if (onViewDetails && hasResultToOpen(inv)) {
      actions.push({ key: 'view', label: 'View Results', Icon: Eye, run: () => onViewDetails(inv), iconClassName: 'text-menu-icon-view' });
    }
    /* View Resume — only for candidates invited from a resume ("Via Resume");
       a direct-email invite has no resume behind it. Any status: the resume is
       the recruiter's own record, not part of the interview. */
    if (invitedViaResume(inv)) {
      const loading = resumePreview.loadingId === inv.id;
      actions.push({
        key: 'resume',
        label: 'View Resume',
        Icon: FileText,
        run: () => { void resumePreview.openResume(inv); },
        busy: loading,
        disabled: loading,
        iconClassName: 'text-menu-icon-view',
      });
    }
    if (onResend && (canResendInvite(inv) || inv.status === 'failed')) {
      actions.push({
        key: 'resend',
        label: 'Resend Email',
        Icon: Mail,
        run: () => onResend(inv),
        title: 'Revoke old link and send a new invitation',
        busy: resendingId === inv.id,
        disabled: resendingId === inv.id,
        iconClassName: 'text-menu-icon-share',
        ...lockedProps,
        ...noInviteProps,
      });
    }
    if (onEdit && canEdit(inv)) {
      actions.push({
        key: 'edit',
        label: 'Edit Email',
        Icon: Pencil,
        run: () => onEdit(inv),
        title: 'Edit candidate details and send',
        iconClassName: 'text-menu-icon-edit',
        ...lockedProps,
        ...noInviteProps,
      });
    }
    if (onRevoke && isRevocableInvite(inv)) {
      actions.push({
        key: 'revoke',
        label: 'Revoke invite',
        Icon: Ban,
        run: () => onRevoke(inv),
        disabled: revokingId === inv.id,
        title: "Revoke this invitation — the candidate's link will stop working",
        destructive: true,
        busy: revokingId === inv.id,
        ...lockedProps,
        ...noInviteProps,
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
  const canOpenDetails = (inv: any): boolean => !!onViewDetails && hasResultToOpen(inv);

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
    if (rowLocked(inv) || !(isSelectable ?? isRevocableInvite)(inv)) return <span className="inline-block w-5 flex-shrink-0" />;
    const checked = !!selectedIds?.has(inv.id);
    if (trackerLook) {
      return (
        <TrackerCheckbox
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect?.(inv.id)}
          aria-label={`Select ${inv.candidate_name || inv.candidate_email || 'candidate'}`}
        />
      );
    }
    // Same round pill checkbox the Assessments tracker uses, so the select
    // column looks the same wherever it appears.
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
      <div className={`${TRACKER_DIALOG_PLACEHOLDER_CLASS} text-gray-500 dark:text-slate-400`}>
        <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-brand-blue/30" />
        {/* "None invited" is wrong when a filter is what emptied the list — it
            reads as data loss rather than as a narrowed view. */}
        <p className="text-sm">
          {hasActiveFilters ? 'No candidates match the current filters.' : 'No candidates invited yet.'}
        </p>
        {!hasActiveFilters && emptyHint && (
          <p className="tf-hint mt-1">{emptyHint}</p>
        )}
        {emptyAction && <div className="mt-3 flex justify-center">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <>
      {displayMode === 'grid' ? (
      /* ── Card grid (List/Card toggle) ──────────────────────────────────
         The Candidate Results tab's card, filled with this row's fields.
         A div rather than a <button>: the card carries its own action
         buttons, which can't nest inside one. */
      <div className="tf-grid-4 p-4 content-start flex-1 min-h-0 overflow-y-auto">
        {invitations.map((inv: any) => {
          const score = displayInviteScore(inv);
          const events = timelineEvents(inv, timelineLimit);
          const actions = rowActions(inv);
          const openable = canOpenDetails(inv);
          const canSelect = selectable && !rowLocked(inv) && (isSelectable ?? isRevocableInvite)(inv);
          const isSelected = !!selectedIds?.has(inv.id);
          const cardJobVersion = jobVersion ?? ((showJobColumn || showRowVersions) ? inv._jd_version : undefined);
          const cardInterviewVersion = interviewVersion ?? ((showJobColumn || showRowVersions) ? inv._interview_version : undefined);
          return (
            <div
              key={inv.id}
              onClick={openable ? () => onViewDetails?.(inv) : undefined}
              onKeyDown={openable ? onRowKeyDown(inv) : undefined}
              role={openable ? 'button' : undefined}
              tabIndex={openable ? 0 : undefined}
              title={openable ? 'View candidate details' : undefined}
              className={`group relative text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 transition-all p-4 flex flex-col gap-3 ${
                openable ? 'cursor-pointer hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40' : ''
              } ${gridCardSelectedClass(isSelected)}`}
            >
              {canSelect && (
                <GridCardSelect
                  selected={isSelected}
                  onToggle={() => onToggleSelect?.(inv.id)}
                  label={inv.candidate_name || inv.candidate_email || 'candidate'}
                  selectionActive={(selectedIds?.size ?? 0) > 0}
                />
              )}
              <div className={`flex items-start gap-2.5 ${canSelect ? 'pl-7' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-slate-50 truncate" title={capitalizedCase(inv.candidate_name) || 'Unknown'}>
                    {capitalizedCase(inv.candidate_name) || 'Unknown'}
                  </p>
                  <p className="tf-meta truncate" title={inv.candidate_email}>
                    {inv.candidate_email || '—'}
                  </p>
                </div>
                {inv.candidate_cid && (
                  <span className="text-2xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded shrink-0">
                    {inv.candidate_cid}
                  </span>
                )}
              </div>

              {showJobColumn && (inv._jd_short_id || inv._config_title) && (
                <div className="flex items-center gap-1.5 min-w-0">
                  {inv._jd_short_id && <JobIdBadge>{inv._jd_short_id}</JobIdBadge>}
                  <p className="tf-meta truncate" title={inv._config_title || ''}>
                    {inv._config_title}
                  </p>
                </div>
              )}
              {(cardJobVersion != null || cardInterviewVersion != null) && (
                <div className="flex items-center gap-1.5 tf-micro-hint">
                  {cardJobVersion != null && <><span>Job</span><VersionPill kind="job" version={cardJobVersion} />{jobLockKindOf(inv._jd_status) && <JobVersionStatusPill status={jobLockKindOf(inv._jd_status)!} />}</>}
                  {cardInterviewVersion != null && <><span className="ml-1">Interview</span><VersionPill kind="interview" version={cardInterviewVersion} /></>}
                </div>
              )}

              <div className="flex items-center gap-1.5 flex-wrap">
                <AIInviteStatusBadge inv={inv} />
              </div>

              <div className="flex items-center justify-between gap-2 tf-meta">
                <span className="inline-flex items-center gap-1.5">
                  {score != null ? (
                    <>
                      <span className={`font-medium ${score >= 60 ? 'text-success' : 'text-destructive'}`}>{score}%</span>
                      <ResultBadge result={inviteResult(inv, score)} />
                    </>
                  ) : (
                    <span className="text-gray-400 dark:text-slate-400">No score</span>
                  )}
                </span>
                {inviteSourceLabel(inv) && <InviteSourceValue inv={inv} iconClassName="w-3 h-3" />}
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-slate-800 tf-micro-hint space-y-0.5">
                {events.length > 0 ? events.map(({ label, at, Icon, tone }, i) => (
                  <div key={`${label}-${i}`} className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-3 h-3 flex-shrink-0 ${tone}`} />
                    <span className={`truncate ${tone}`}>{label}: {formatIST(at)}</span>
                  </div>
                )) : <span className="text-gray-400 dark:text-slate-500">—</span>}
                {hasMoreTimelineHistory(inv, timelineLimit) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openTimeline(inv); }}
                    className="flex items-center gap-1 text-2xs font-medium text-brand-blue hover:underline pt-0.5"
                  >
                    <History className="w-3 h-3" /> View full history
                  </button>
                )}
              </div>

              {/* Same inline action buttons as the mobile card. */}
              {actions.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mt-auto">
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
              )}
            </div>
          );
        })}
      </div>
      ) : (
      <>
      {/* ── Mobile cards ──────────────────────────────────────────────── */}
      <div className="tf-record-list lg:hidden flex-1 min-h-0 overflow-y-auto">
        {invitations.map((inv: any) => {
          const score = displayInviteScore(inv);
          const actions = rowActions(inv);
          const openable = canOpenDetails(inv);
          const cardJobVersion = jobVersion ?? (showRowVersions ? inv._jd_version : undefined);
          const cardInterviewVersion = interviewVersion ?? (showRowVersions ? inv._interview_version : undefined);
          const showJobLine = showJobColumn && inv._config_title;
          return (
            <MobileRecordCard
              key={inv.id}
              onClick={openable ? () => onViewDetails?.(inv) : undefined}
              onKeyDown={openable ? onRowKeyDown(inv) : undefined}
              role={openable ? 'button' : undefined}
              tabIndex={openable ? 0 : undefined}
              aria-description={openable ? 'View candidate details' : undefined}
              tooltip={openable ? 'View candidate details' : undefined}
              className={openable ? 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40' : undefined}
              select={selectable ? <SelectBox inv={inv} /> : undefined}
              idBadge={
                (inv.candidate_cid || (showJobLine && inv._jd_short_id)) ? (
                  <>
                    {inv.candidate_cid && (
                      <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 px-2 py-1 rounded ring-1 ring-brand-blue/20">
                        {inv.candidate_cid}
                      </span>
                    )}
                    {showJobLine && inv._jd_short_id && <JobIdBadge>{inv._jd_short_id}</JobIdBadge>}
                  </>
                ) : undefined
              }
              title={
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{capitalizedCase(inv.candidate_name) || 'Unknown'}</span>
                </span>
              }
              badges={
                <>
                  {inv.candidate_cid && cardJobVersion != null && <VersionPill kind="job" version={cardJobVersion} />}
                  {inv.candidate_cid && cardInterviewVersion != null && <VersionPill kind="interview" version={cardInterviewVersion} />}
                  <AIInviteStatusBadge inv={inv} />
                </>
              }
              meta={[
                { icon: <Mail />, label: inv.candidate_email ? <span className="break-all">{inv.candidate_email}</span> : null },
                { icon: <FileText />, label: showJobLine ? inv._config_title : null },
              ]}
              fields={[
                {
                  label: 'Invite Source',
                  value: inviteSourceLabel(inv)
                    ? <span className="inline-flex items-center gap-1 font-medium"><InviteSourceValue inv={inv} iconClassName="w-3 h-3" /></span>
                    : null,
                },
              ]}
              footer={
                <>
                  {/* Score only — the per-round Tech and Coding figures were
                      dropped from this tracker; the interview result view is
                      where a round-by-round breakdown belongs. */}
                  {score != null ? (
                    <>
                      <MobileStatChip tone={score >= 60 ? 'success' : 'danger'}>Score: {score}%</MobileStatChip>
                      <ResultBadge result={inviteResult(inv, score)} />
                    </>
                  ) : (
                    <MobileStatChip tone="neutral">Score: —</MobileStatChip>
                  )}
                </>
              }
              actions={
                actions.length > 0 ? (
                  <>
                    {/* Inline buttons rather than a kebab: the card has the room, and
                        a menu on a card is one extra tap for no gain. */}
                    {actions.map(({ key, label, Icon, run, disabled, title, destructive, busy }) => (
                      <button
                        key={key}
                        onClick={(e) => { e.stopPropagation(); run(); }}
                        disabled={disabled}
                        title={title || label}
                        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          destructive
                            ? 'text-destructive bg-destructive-subtle ring-1 ring-destructive-line hover:bg-destructive-subtle'
                            : 'border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                        }`}
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
                        {label}
                      </button>
                    ))}
                  </>
                ) : undefined
              }
            >
              {/* Timeline — two columns from sm so entries line up instead of
                  staggering by label width; one column on a phone. */}
              {timelineEvents(inv, timelineLimit).length > 0 && (
                <div className="tf-grid-2 mt-2 text-xs text-gray-500 dark:text-slate-400">
                  {timelineEvents(inv, timelineLimit).map(({ label, at, Icon, tone }, i) => (
                    <div key={`${label}-${i}`} className="flex items-center gap-1.5 min-w-0">
                      <Icon className={`w-3 h-3 flex-shrink-0 ${tone}`} />
                      <span className="truncate">{label}: {formatIST(at)}</span>
                    </div>
                  ))}
                </div>
              )}
              {hasMoreTimelineHistory(inv, timelineLimit) && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openTimeline(inv); }}
                  className="mt-1.5 flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
                >
                  <History className="w-3 h-3" /> View full history
                </button>
              )}
            </MobileRecordCard>
          );
        })}
      </div>

      {/* ── Desktop table ─────────────────────────────────────────────── */}
      {/* Outer border on the scroll shell rather than the table: the shell is what
          stays put, so a border on the table itself would scroll away with the
          content. tf-table-shell--fill + flex-1/min-h-0 makes this shell the one
          vertical scroller, which is what keeps the sticky header and the pinned
          Actions column in place. */}
      <div
        className={`hidden lg:block tf-table-shell tf-table-shell--compact border border-gray-200 dark:border-slate-700 rounded-lg ${autoHeight ? 'overscroll-y-auto' : 'tf-table-shell--fill flex-1 min-h-0'}`}
        /* overscrollBehaviorY inline, not the utility: globals.css gives every
           .tf-table-shell in a popup an unlayered `overscroll-behavior: contain`,
           which beats `overscroll-y-auto`. Once the table scrolls sideways
           (125% / 150% scale) that kept the wheel over it from scrolling the
           popup — only the scrollbar moved it. */
        style={autoHeight ? { maxHeight: 'none', overscrollBehaviorY: 'auto' } : undefined}
      >
        {/* Auto layout, not table-fixed: columns size to their own content and the
            shell scrolls sideways, rather than every column being scaled down
            until the sticky header stops lining up with the rows. */}
        <table className="w-max min-w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700">
              {selectable && (
                <th className="tf-th-cell w-8 pl-4 pr-0 tf-sticky-col-left tf-th" aria-label="Select">
                  {onToggleSelectAll && trackerLook && (
                    <TrackerCheckbox
                      checked={allSelected}
                      some={(selectedIds?.size ?? 0) > 0}
                      disabled={!!selectAllBlockedReason}
                      title={selectAllBlockedReason}
                      onChange={onToggleSelectAll}
                      aria-label={allSelected ? 'Deselect all on this page' : 'Select all on this page'}
                    />
                  )}
                  {onToggleSelectAll && !trackerLook && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={allSelected}
                      aria-label={allSelected ? 'Deselect all on this page' : 'Select all on this page'}
                      title={allSelected ? 'Deselect all on this page' : 'Select all on this page'}
                      onClick={onToggleSelectAll}
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        allSelected
                          ? 'bg-brand-blue border-brand-blue'
                          : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600 hover:border-brand-blue/50'
                      }`}
                    >
                      {allSelected && <Check className="w-3 h-3 text-white" />}
                    </button>
                  )}
                </th>
              )}
{/* One column order for both modes — the order every AI Interview and
                  Assessment tracking/results table shares: Timeline (which
                  carries the invite time), Status, Score, Invite Source, then the job group (Job ID and Job
                  Title on the Invitation Status tab only; the two versions wherever
                  they're known) just before Actions. `trackerLook` reorders it
                  (TRACKER_LOOK_ORDER). Timeline's `hidden md:table-cell` mirrors
                  its <td> — without it the header carries one more cell than
                  the body between sm and md. */}
              {inOrder(([
                { id: 'candidate', label: 'Candidate' },
                { id: 'timeline', label: 'Timeline', className: 'hidden md:table-cell' },
                { id: 'status', label: 'Status' },
                { id: 'score', label: 'Score', center: true },
                { id: 'inviteSource', label: 'Invite Source' },
                { id: 'cid', label: 'CID' },
                ...(showJobColumn ? [{ id: 'jobId', label: 'JD ID' }, { id: 'jobTitle', label: 'Job Title' }] : []),
                ...((showJobColumn || jobVersion != null || showRowVersions) ? [{ id: 'jobVersion', label: 'Job Version' }] : []),
                ...((showJobColumn || interviewVersion != null || showRowVersions) ? [{ id: 'interviewVersion', label: 'Interview Version' }] : []),
              ] as { id: InviteColumnId; label: string; className?: string; center?: boolean }[]).filter((h) => inRow(h.id))).map((h) => (
                <th key={h.id} className={`tf-th-cell ${h.center ? 'text-center' : 'text-left'} tf-th ${h.className ?? ''} ${colMinW(h.id)}`}><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">{h.label}</span></th>
              ))}
              <th className={`tf-th-cell ${trackerLook ? 'text-center' : 'text-left'} tf-th tf-sticky-col ${colMinW('actions')}`}><span className="inline-block w-max max-w-[8rem] whitespace-normal leading-tight align-middle">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
            {invitations.map((inv: any) => {
              const score = displayInviteScore(inv);
              const events = timelineEvents(inv, timelineLimit);
              const actions = rowActions(inv);
              const openable = canOpenDetails(inv);
              /* Each column once, in the table's order — placed in the row, or
                 (with `expandableRows`, the columns the row leaves out) in its
                 expanded panel. */
              const columns: { id: InviteColumnId; label: string; className: string; content: ReactNode }[] = [
                {
                  id: 'candidate', label: 'Candidate', className: `${cellY} px-4 align-middle whitespace-nowrap`,
                  content: (
                    <div className="flex items-center gap-3">
                      {/* Capped rather than free: with auto layout a single long
                          email would otherwise set the column width. */}
                      <div className="min-w-0 max-w-[220px]">
                        <p className="tf-row-name truncate" title={capitalizedCase(inv.candidate_name) || 'Unknown'}>
                          {capitalizedCase(inv.candidate_name) || 'Unknown'}
                        </p>
                        <p className="tf-meta truncate" title={inv.candidate_email}>
                          {inv.candidate_email}
                        </p>
                      </div>
                    </div>
                  ),
                },
                {
                  // Every milestone on its own line, oldest first. Centred like
                  // the other columns, so a lone "Invited" line is not stuck at
                  // the top of a taller row.
                  id: 'timeline', label: 'Timeline', className: `${cellY} px-4 align-middle text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap hidden md:table-cell`,
                  content: trackerLook ? (
                    <TrackerTimeline
                      events={events}
                      hiddenCount={timelineEvents(inv, Infinity).length - events.length}
                      onHistory={hasMoreTimelineHistory(inv, timelineLimit) ? () => openTimeline(inv) : undefined}
                    />
                  ) : (
                    <div className="tf-meta">
                      {events.length > 0 ? (
                        <div className={autoHeight ? 'space-y-0.5' : 'space-y-1'}>
                          {events.map(({ label, at, Icon, tone }, i) => (
                            <div key={`${label}-${i}`} className="flex items-center gap-2 whitespace-nowrap">
                              <Icon className={`w-3 h-3 flex-shrink-0 ${tone}`} />
                              <span className={tone}>{label}: {formatIST(at)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-slate-500">—</span>
                      )}
                      {hasMoreTimelineHistory(inv, timelineLimit) && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openTimeline(inv); }}
                          className="flex items-center gap-1 text-2xs font-medium text-brand-blue hover:underline mt-1"
                        >
                          <History className="w-3 h-3" /> View full history
                        </button>
                      )}
                    </div>
                  ),
                },
                {
                  id: 'status', label: 'Status', className: `${cellY} px-4 align-middle whitespace-nowrap`,
                  content: (
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      <AIInviteStatusBadge inv={inv} />
                    </div>
                  ),
                },
                {
                  id: 'score', label: 'Score', className: `${cellY} px-4 align-middle text-center text-sm whitespace-nowrap`,
                  content: trackerLook
                    ? <TrackerScorePill value={score} pass={inviteResult(inv, score) == null ? null : inviteResult(inv, score) === 'Pass'} why={hasResultToOpen(inv) ? 'No score for this interview' : 'Not taken yet'} />
                    : <ScoreCell value={score} result={inviteResult(inv, score)} />,
                },
                {
                  id: 'inviteSource', label: 'Invite Source', className: `${cellY} px-4 align-middle whitespace-nowrap text-xs font-medium text-gray-600 dark:text-slate-400`,
                  content: inviteSourceLabel(inv)
                    ? <InviteSourceValue inv={inv} iconClassName="w-3.5 h-3.5" />
                    : <span className="text-gray-400 dark:text-slate-500">—</span>,
                },
                {
                  id: 'cid', label: 'CID', className: `${cellY} px-4 align-middle whitespace-nowrap text-xs font-medium text-gray-600 dark:text-slate-400`,
                  content: inv.candidate_cid || <span className="text-gray-400 dark:text-slate-500">—</span>,
                },
                ...(showJobColumn ? [
                  {
                    id: 'jobId' as const, label: 'JD ID', className: `${cellY} px-4 align-middle whitespace-nowrap`,
                    content: inv._jd_short_id
                      ? <JobIdBadge>{inv._jd_short_id}</JobIdBadge>
                      : <span className="text-gray-400 dark:text-slate-500">—</span>,
                  },
                  {
                    id: 'jobTitle' as const, label: 'Job Title', className: `${cellY} px-4 align-middle max-w-[200px]`,
                    content: (
                      <p className="tf-body truncate" title={inv._config_title || ''}>
                        {inv._config_title || <span className="text-gray-400 dark:text-slate-500">—</span>}
                      </p>
                    ),
                  },
                ] : []),
                ...((showJobColumn || jobVersion != null || showRowVersions) ? [{
                  id: 'jobVersion' as const, label: 'Job Version', className: `${cellY} px-4 align-middle whitespace-nowrap`,
                  content: (jobVersion ?? inv._jd_version) != null
                    ? (
                      <span className="inline-flex items-center gap-1.5">
                        <VersionPill kind="job" version={jobVersion ?? inv._jd_version} />
                        {/* Only a Disabled / Archived job version gets its status. */}
                        {jobLockKindOf(inv._jd_status) && <JobVersionStatusPill status={jobLockKindOf(inv._jd_status)!} />}
                      </span>
                    )
                    : <span className="text-gray-400 dark:text-slate-500">—</span>,
                }] : []),
                ...((showJobColumn || interviewVersion != null || showRowVersions) ? [{
                  id: 'interviewVersion' as const, label: 'Interview Version', className: `${cellY} px-4 align-middle whitespace-nowrap`,
                  content: (interviewVersion ?? inv._interview_version) != null
                    ? <VersionPill kind="interview" version={interviewVersion ?? inv._interview_version} />
                    : <span className="text-gray-400 dark:text-slate-500">—</span>,
                }] : []),
              ];
              const rowColumns = inOrder(columns.filter((c) => inRow(c.id)));
              const detailColumns = columns.filter((c) => !inRow(c.id));
              const isExpanded = expandableRows && expandedIds.has(inv.id);
              const onRowClick = expandableRows ? () => toggleExpanded(inv.id) : openable ? () => onViewDetails?.(inv) : undefined;
              const rowInteractive = expandableRows || openable;

              return (
                <Fragment key={inv.id}>
                <tr
                  onClick={onRowClick}
                  onKeyDown={expandableRows
                    ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(inv.id); } }
                    : openable ? onRowKeyDown(inv) : undefined}
                  role={rowInteractive ? 'button' : undefined}
                  tabIndex={rowInteractive ? 0 : undefined}
                  aria-expanded={expandableRows ? isExpanded : undefined}
                  title={expandableRows ? (isExpanded ? 'Hide details' : 'Show details') : openable ? 'View candidate details' : undefined}
                  /* tf-row-match: the row's resting / hover / selected colours
                     are the pinned Select and Actions cells' own, so they never
                     read as a separate layer (dark mode). An expanded row counts
                     as selected for that tint. */
                  data-row-selected={isExpanded || selectedIds?.has(inv.id) ? 'true' : undefined}
                  className={`tf-row-match transition-colors ${
                    rowInteractive
                      ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40'
                      : ''
                  } ${autoHeight ? AUTO_HEIGHT_ROW_MIN_H : ''}`}
                >
                  {selectable && (
                    <td className="tf-td pl-4 pr-0 tf-sticky-col-left">
                      <SelectBox inv={inv} />
                    </td>
                  )}

                  {rowColumns.map((c) => (
                    <td key={c.id} className={c.className}>{c.content}</td>
                  ))}

                  <td className="tf-td tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                    {/* Radix's DropdownMenu rather than a hand-rolled absolute menu:
                        this table sits inside tf-table-shell (overflow: auto), which
                        would clip an absolutely positioned menu. Radix portals it out. */}
                    <div className={`flex items-center gap-1.5 ${trackerLook ? 'justify-center' : ''}`}>
                    {/* The Resume Scoring list's expand control. */}
                    {expandableRows && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => toggleExpanded(inv.id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Hide details' : 'Show details'}
                        title={isExpanded ? 'Hide details' : 'Show details'}
                        className="h-8 w-8"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </Button>
                    )}
                    {actions.length === 0 ? (
                      <span className="tf-hint">—</span>
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
                        <DropdownMenuContent align="end" className={`w-44 ${MENU_PANEL_BORDER_CLASS}`}>
                          {actions.map(({ key, label, Icon, run, disabled, destructive, busy, iconClassName }) => (
                            <DropdownMenuItem
                              key={key}
                              className={`group ${destructive ? MENU_ITEM_DESTRUCTIVE_HIGHLIGHT_CLASS : MENU_ITEM_LIGHT_HIGHLIGHT_CLASS}`}
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
                    </div>
                  </td>
                </tr>
                {/* The columns the row leaves out, as the Resume Scoring list's
                    expanded full-width row. */}
                {isExpanded && (
                  <tr className="bg-gray-50/60 dark:bg-slate-800/20">
                    <td colSpan={(selectable ? 1 : 0) + rowColumns.length + 1} className="tf-td pt-3 pb-4">
                      <dl className="tf-grid-stats">
                        {detailColumns.map((c) => (
                          <div key={c.id} className="min-w-0">
                            <dt className="text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                              {c.label}
                            </dt>
                            <dd className="tf-body-secondary min-w-0">{c.content}</dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      </>
      )}

      {/* Full action-log modal — every send, resend, revoke, edit and
          candidate-lifecycle milestone as its own row, oldest first. */}
      <Dialog open={!!timelineTarget} onOpenChange={(open) => { if (!open) setTimelineTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitation History</DialogTitle>
            {/* Name, then the email — the Assessments history pop-up's header. */}
            <DialogDescription className="break-words">
              {capitalizedCase(timelineTarget?.candidate_name) || timelineTarget?.candidate_email || 'Candidate'}
              {timelineTarget?.candidate_name && timelineTarget?.candidate_email && (
                <span className="text-gray-400 dark:text-slate-400"> · {timelineTarget.candidate_email}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh] -mx-1 px-1">
            {timelineLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
              </div>
            ) : timelineError ? (
              <p className="text-sm text-destructive py-6 text-center">{timelineError}</p>
            ) : timelineEntries && timelineEntries.length > 0 ? (
              <ol className="space-y-3">
                {timelineEntries.map((entry, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className={`mt-0.5 flex-shrink-0 rounded-full p-1.5 bg-gray-100 dark:bg-slate-800 ${entry.tone}`}>
                      <entry.Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="tf-row-name">{entry.label}</p>
                      <p className="tf-meta">{formatIST(entry.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="tf-body-muted py-6 text-center">No history recorded yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {resumePreview.modal}
    </>
  );
}
