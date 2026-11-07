'use client';

import { Users, Mail, Play, Check, CheckCircle, Clock, Eye, TrendingUp, RefreshCw, Loader2, Ban, Send, FileText, Undo2 } from 'lucide-react';
import { MobileRecordCard, MobileStatChip } from '@/components/ui/mobile-record-card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { INVITE_SOURCE_FILTER_OPTIONS, RESULT_FILTER_OPTIONS } from '@/components/ai-interview/ColumnFilterFields';
import { assessmentInviteSource, InviteSourceValue } from '@/components/AIInterviewInviteTable';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTrackerPoll } from '@/lib/hooks/useTrackerPoll';
import api from '@/lib/services/api';
import { formatIST } from '@/lib/utils/dateUtils';
import InviteFilterBar, {
  EMPTY_INVITE_FILTERS,
  ASSESSMENT_INVITE_STATUS_OPTIONS,
  hasActiveInviteFilters,
  type InviteFilterState,
} from '@/components/InviteFilterBar';
import InviteStatCards, { INVITE_CARD_TONES } from '@/components/InviteStatCards';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { TRACKER_DIALOG_PANEL_CLASS, TRACKER_DIALOG_PLACEHOLDER_CLASS } from '@/lib/constants/trackerDialog';
import { assessmentService, isAssessmentArchived } from '@/lib/services/assessmentService';
import {
  resolveInviteStatus,
  isInviteExpired,
  timelineEvents,
  hasMoreTimelineHistory,
  buildInvitationRowActions,
  InvitationActionsMenu,
  InvitationActionButtons,
  ViewFullHistoryLink,
  InvitationHistoryDialog,
  RevokeInvitationDialog,
  EditInvitationModal,
  isRevocableInvitation,
  canResendInvite,
} from '@/components/AssessmentInviteActions';
import { formatScore, SCORE_CELL_TEXT } from '@/lib/utils/score';
import { capitalizedCase } from '@/lib/utils/candidateNameDisplay';
import InviteStatusChip, { type InviteStatusKind } from '@/components/ui/invite-status-chip';
import { StatCardsHint, StatusLegend, UpdatedAgo } from '@/components/ui/guided-tracker';
import ListPagination from '@/components/ListPagination';
import { VersionChip } from '@/components/assessments/AssessmentVersionHistoryPanel';

/* Per-row actions: Resend / Copy Link always, plus Revoke (while an invite is
   still unopened) and Edit (name + email, revoked-only, then Save & Send) when
   the host allows changes - the same set, rules and dialogs as the Assessments
   page's Track Invites popup and the AI Interview tracker on this page. Fixing
   a bad address of a failed/bounced invite (Edit Email / Change Email) still
   lives only on the Assessments page. */

interface TrackInvitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  jdId: string;
  jdTitle: string;
  /** The JD's short id and job version — shown as `JD-xxx · title · V1`. The
   *  tracker is one job version's, so there is no Job Version filter. */
  jdShortId?: string;
  jobVersion?: number | null;
  /** Lets the host open a candidate's result without leaving its page (Job
   *  Details renders the detail view inline). Falls back to navigating to the
   *  standalone results-details route when not supplied. */
  onViewResult?: (invitation: any) => void;
  /** Footer "Invite More" - the host closes this tracker and opens its own
   *  invite flow. Left out, the button is not shown. */
  onInviteMore?: () => void;
  /** Shown (greyed, as the tooltip) when Invite More is not allowed — the
   *  button stays visible (RBAC grey-out rule). */
  inviteMoreDeniedReason?: string;
  /** This JD is disabled — Copy Link / Revoke on an Invited row, Edit on a
   *  Revoked row and Resend on an Expired row stay visible but disabled, the
   *  same lock the Assessments page's own Track Invites popup applies. */
  jdDisabled?: boolean;
  /** Called after a revoke / edit changed invitations, once this popup's own
   *  rows are reloaded - so the host's counts refresh at once. */
  onChanged?: () => void | Promise<void>;
  /** Opens pre-filtered to one candidate (their email) — the bulk-send
   *  popup's per-row "Track status". */
  initialSearch?: string;
  /** Rows a page. Default 5. */
  pageSize?: number;
  /** Paging under the table (the house ListPagination) instead of in the
   *  footer; the footer keeps just Cancel / Invite More. Default: on. */
  paginationBelowTable?: boolean;
  /** First-time-user aids, added on top of everything the tracker has: a
   *  card-filter hint, a status legend, each row's main action as a visible
   *  button, Refresh with "Updated … ago", a clearer Select All, helpful
   *  empty states, a red Revoked card and swipeable cards on phones. Default: on. */
  guided?: boolean;
  /** The assessments to track, when the host has already resolved them — the
   *  Assessments page's Track on one assessment, or on a whole job across all
   *  its job versions (each with `jd_version` set to the version it belongs
   *  to). Left out, the popup reads every assessment of `jdId` itself. */
  assessments?: any[];
}


const INVITES_PAGE_SIZE = 5;

/* Paging under the table: the popup, not the table, scrolls on a short
   screen — scrollbar room reserved (no sideways jump), header and footer
   pinned. */
/* Paging under the table: every row at least the height of one whose Timeline
   carries its two events and View full history (69px), so rows with and
   without the link line up the same. A table row's height is its minimum. */
const ROW_MIN_H = 'h-[69px]';
const PAGED_PANEL_CLASS = '!overflow-y-auto [scrollbar-gutter:stable] [&>.tf-tracker-header]:sticky [&>.tf-tracker-header]:top-0 [&>.tf-tracker-header]:z-20 [&>.tf-tracker-footer]:sticky [&>.tf-tracker-footer]:bottom-0 [&>.tf-tracker-footer]:z-20 xl:!max-w-[80rem] 2xl:!max-w-[88rem] h-[min(54rem,calc(100dvh-1.5rem))] sm:h-[min(54rem,calc(100dvh-2rem))] md:h-[min(54rem,calc(100dvh-3rem))]';
/* guided: the count cards as one swipeable row on phones. */
const GUIDED_STATS_PHONE = 'max-sm:flex max-sm:overflow-x-auto max-sm:pb-1 max-sm:[&>*]:min-w-[6.5rem] max-sm:[&>*]:shrink-0';
/* guided: the active card's name in the "Showing only" chip. */
const STATUS_CARD_LABEL: Record<string, string> = {
  invited: 'Invited', in_progress: 'In Progress', completed: 'Completed', expired: 'Expired', terminated: 'Terminated', revoked: 'Revoked',
};
/* guided: the Status dropdown in the cards' own keys, so a picked card always
   shows its name there (the default list uses the stored statuses, which
   left the dropdown blank for Invited / In Progress / Terminated / Revoked). */
const ASSESSMENT_CARD_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'invited', label: 'Invited' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'failed', label: 'Invite Failed' },
];
const ASSESSMENT_LEGEND: InviteStatusKind[] = ['invited', 'read', 'system_check', 'in_progress', 'completed', 'terminated', 'expired', 'revoked', 'invite_failed', 'bounced'];

// Effective status + expiry + timeline milestones now live in
// AssessmentInviteActions (resolveInviteStatus / isInviteExpired /
// timelineEvents) so this surface can't drift from the other two.
const getEffectiveStatus = resolveInviteStatus;

/* The stat cards' buckets — the AI Interview tracker's set. One bucket per
   invite, so the counts add up and a card filters to exactly what it counts.
   Invite Failed / Bounced stay in Total and in the Status dropdown. */
type CardBucket = 'invited' | 'in_progress' | 'completed' | 'expired' | 'terminated' | 'revoked' | 'failed';
const CARD_KEYS = new Set<string>(['invited', 'in_progress', 'completed', 'expired', 'terminated', 'revoked']);
const cardBucketOf = (inv: any): CardBucket => {
  const s = resolveInviteStatus(inv);
  if (s === 'completed') return 'completed';
  if (s === 'revoked') return 'revoked';
  if (s === 'abandoned') return 'terminated';
  if (s === 'expired' || isInviteExpired(inv)) return 'expired';
  if (s === 'failed' || s === 'bounced') return 'failed';
  if (s === 'started' || s === 'opened') return 'in_progress';
  return 'invited';
};

export default function TrackInvitesModal({ isOpen, onClose, jdId, jdTitle, jdShortId, jobVersion, onViewResult, onInviteMore, inviteMoreDeniedReason, jdDisabled = false, onChanged, initialSearch, pageSize = INVITES_PAGE_SIZE, paginationBelowTable = true, guided = true, assessments: scopedAssessments }: TrackInvitesModalProps) {
  const router = useRouter();

  // One rule for both the mobile cards and the desktop table: stay in place if
  // the host can show the result itself, otherwise fall back to the route.
  const openResult = (invitation: any) => {
    if (onViewResult) {
      onViewResult(invitation);
      return;
    }
    router.push(
      `/recruitment/assessments/${invitation.assessment_id}/results/details`
      + `?candidate_id=${invitation.attempt_id}`
      + `${invitation.candidate_display_id ? `&cid=${encodeURIComponent(invitation.candidate_display_id)}` : ''}`
      + `&from=jd&jd_id=${jdId}`
    );
  };
  const [isLoading, setIsLoading] = useState(true);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    invited: 0,
    expired: 0,
    started: 0,
    completed: 0,
    failed: 0,
    terminated: 0,
    revoked: 0,
  });
  /* The AI tracker's extra filters (no Job Version — this is one job version). */
  const [assessmentVersionFilter, setAssessmentVersionFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  // Email editing state
  /* Filters run over the merged list rather than being pushed to the API.
     Unlike the per-assessment tracker on the Assessments page, this popup
     aggregates every assessment attached to the JD, and the stat cards are
     computed from that whole set — filtering server-side would silently
     narrow the totals too. */
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<InviteFilterState>(() => (
    initialSearch ? { ...EMPTY_INVITE_FILTERS, search: initialSearch } : EMPTY_INVITE_FILTERS
  ));
  const [page, setPage] = useState(1);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<any | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  useEffect(() => {
    if (isOpen && jdId) loadInvitations();
  }, [isOpen, jdId]);
  // Auto-refresh so pixel-fired status updates are reflected automatically
  useTrackerPoll(isOpen && !!jdId, () => loadInvitations(true)); // silent = don't show spinner

  const loadInvitations = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      // The host's assessments, or every assessment for this JD
      const assessmentItems: any[] = scopedAssessments ?? (await api.get('/assessments', {
        params: { jd_id: jdId, page_size: 100 }
      })).data?.items ?? [];

      if (assessmentItems.length === 0) {
        setInvitations([]);
        setStats({ total: 0, invited: 0, expired: 0, started: 0, completed: 0, failed: 0, terminated: 0, revoked: 0 });
        setIsLoading(false);
        return;
      }

      // Fetch invitations for all assessments
      const allInvitations: any[] = [];
      for (const assessment of assessmentItems) {
        try {
          /* Every page, not just the first 100: a big send would otherwise
             drop candidates from the list and the cards. */
          const PAGE = 200;
          const items: any[] = [];
          for (let p = 1; p <= 50; p++) {
            const res = await api.get(`/assessments/${assessment.id}/invitations`, { params: { page: p, page_size: PAGE } });
            const pageItems: any[] = res.data?.items ?? [];
            items.push(...pageItems);
            if (pageItems.length < PAGE || items.length >= (res.data?.total ?? 0)) break;
          }
          const invitationsResponse = { data: { items } };
          if (invitationsResponse.data?.items) {
            // Carry the source assessment's enabled-round flags onto each
            // invitation row so the table can decide per-row whether to
            // render a Tech Score / Coding Score cell. Without this the
            // popup shows an empty Coding column for tech-only assessments
            // (and vice versa).
            allInvitations.push(...invitationsResponse.data.items.map((inv: any) => ({
              ...inv,
              assessment_title: assessment.title,
              assessment_id: assessment.id,
              assessment_version: assessment.version,
              // Job Version / Assessment Version columns — same fields the
              // Assessments page's job-scoped Track Invites popup stamps
              // (_jd_version / _assessment_version), so VersionChip renders
              // identically here.
              _jd_version: assessment.jd_version ?? jobVersion ?? undefined,
              _assessment_version: assessment.version,
              ...assessmentInviteSource(inv),
              assessment_technical_enabled: assessment.technical_enabled,
              assessment_coding_enabled: assessment.coding_enabled,
              assessment_status: assessment.status,
            })));
          }
        } catch (err) {
          console.warn(`Failed to load invitations for assessment ${assessment.id}:`, err);
        }
      }

      // Single-bucket classifier so stats stay mutually exclusive — same
      // rule as the assessment-level popup. Every invitation falls into
      // exactly one of completed / failed / expired / started / sent.
      const _now = new Date();
      const _bucket = (inv: any): 'completed' | 'failed' | 'terminated' | 'expired' | 'started' | 'sent' => {
        const s = (inv.status || '').toLowerCase();
        if (s === 'completed' || inv.completed_at) return 'completed';
        // 'abandoned' = candidate walked out mid-assessment. Counted on its own
        // as "Terminated" (AI Interview wording), NOT as an invite failure.
        if (s === 'abandoned') return 'terminated';
        if (['failed', 'bounced'].includes(s)) return 'failed';
        if (s === 'expired') return 'expired';
        if (!inv.started_at && !inv.unit_consumed && inv.expires_at && new Date(inv.expires_at) < _now) {
          return 'expired';
        }
        if (s === 'started' || (inv.started_at && !inv.completed_at)) return 'started';
        return 'sent';
      };
      void _bucket;
      const count = (b: CardBucket) => allInvitations.filter((inv) => cardBucketOf(inv) === b).length;
      const newStats = {
        total: allInvitations.length,
        invited: count('invited'),
        started: count('in_progress'),
        completed: count('completed'),
        expired: count('expired'),
        terminated: count('terminated'),
        revoked: count('revoked'),
        failed: count('failed'),
      };

      setInvitations(allInvitations);
      setStats(newStats);
      setLoadedAt(Date.now());
    } catch (error) {
      console.error('Failed to load invitations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendInvitation = async (invitation: any) => {
    setResendingId(invitation.id);
    try {
      await assessmentService.resendInvitation(invitation.assessment_id, invitation.id);
      await loadInvitations(true);
      toast.success('New invitation link generated and emailed!');
      setSelectedIds(new Set());
    } catch (error: any) {
      console.error('Failed to resend invitation:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't resend invitation. Please try again."));
    } finally {
      setResendingId(null);
    }
  };

  // A revoke / edit changed the rows: reload this list, then tell the host.
  const handleInvitesChanged = async () => {
    setSelectedIds(new Set());
    await loadInvitations(true);
    await onChanged?.();
  };

  // Edit / Revoke are wired unconditionally — same as the Assessments page's
  // own Track Invites popup and the AI Interview tracker — so the menu only
  // ever hides an action based on the invite's status (via
  // buildInvitationRowActions), never on a separate permission check. A
  // disabled JD still greys them out via `jdDisabled` below.
  const rowActionOptions = {
    onResend: handleResendInvitation,
    resendingId,
    onEdit: (inv: any) => setEditTarget(inv),
    onRevoke: (inv: any) => setRevokeTarget(inv),
    revokingId: revokeTarget?.id,
  };

  const filtersActive = hasActiveInviteFilters(filters) || !!(assessmentVersionFilter || sourceFilter || resultFilter);
  const assessmentVersions = [...new Set(invitations.map((inv: any) => inv.assessment_version).filter((v: any) => v != null))]
    .sort((a: any, b: any) => Number(b) - Number(a));
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  /* Matches the server-side filter the Assessments page applies, so the same
     search finds the same people from either entry point: free text over
     name / email / candidate id, status over the derived status (not the raw
     field, which can be stale), and an inclusive invite-date range. */
  const filteredInvitations = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
    // Inclusive of the whole end day, not midnight at its start.
    const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`) : null;

    return invitations.filter((inv: any) => {
      if (term) {
        const haystack = [
          inv.candidate_name,
          inv.candidate_email,
          inv.email,
          inv.candidate_display_id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      if (filters.status !== 'all') {
        if (CARD_KEYS.has(filters.status)) {
          if (cardBucketOf(inv) !== filters.status) return false;
        } else if (getEffectiveStatus(inv) !== filters.status) return false;
      }
      if (assessmentVersionFilter && String(inv.assessment_version ?? '') !== assessmentVersionFilter) return false;
      if (sourceFilter && inv.invite_source !== sourceFilter) return false;
      if (resultFilter) {
        const scored = getEffectiveStatus(inv) === 'completed' && typeof inv.passed === 'boolean';
        if (resultFilter === 'unscored' ? scored : !scored || (resultFilter === 'pass') !== inv.passed) return false;
      }

      if (from || to) {
        const raw = inv.invited_at || inv.sent_at || inv.created_at;
        if (!raw) return false;
        const invitedAt = new Date(raw);
        if (Number.isNaN(invitedAt.getTime())) return false;
        if (from && invitedAt < from) return false;
        if (to && invitedAt > to) return false;
      }

      return true;
    });
  }, [invitations, filters, assessmentVersionFilter, sourceFilter, resultFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredInvitations.length / pageSize));
  // Clamped rather than stored: the list refreshes every 15s and a filter can
  // shrink it under the current page at any moment.
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleInvitations = filteredInvitations.slice(pageStart, pageStart + pageSize);
  /* Row height: tighter when the table grows to its rows (paging under it). */
  const cellY = paginationBelowTable ? 'py-2' : 'py-3';
  const tdY = paginationBelowTable ? '!py-2' : '';
  /* guided: Status and scores right after the candidate, then Timeline, Job
     Version, Assessment, Assessment Version, and Invite Source last before
     Actions. */
  const reorderColumns = guided;
  /* guided: the Timeline cell shows the latest two events; the rest are one
     click away in View full history. */
  const timelineLimit = guided ? 2 : undefined;
  /* guided: the score over its Pass / Fail badge, one under the other, in the
     Results tab's colours — green for a pass, red for a fail. */
  const scoreStack = (v: number) => {
    const pass = v >= 70;
    return (
      <div className="inline-flex flex-col items-center gap-1">
        <span className={`${SCORE_CELL_TEXT} ${pass ? 'text-success' : 'text-destructive'}`}>{Math.round(v)}%</span>
        <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${pass ? 'bg-success-subtle text-success ring-success-line' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
          {pass ? 'Pass' : 'Fail'}
        </span>
      </div>
    );
  };

  /* Bulk selection — same control, wording and rules as the Assessments
     page's own job-scoped Track Invites popup: any row this popup's own
     per-row menu can revoke or resend gets a checkbox, scoped to the rows on
     the current page. Which bulk BUTTON appears depends on the ticked
     selection being uniformly one status-class or the other; a mixed
     Invited+Expired selection shows neither. */
  const isBulkActionable = (inv: any): boolean => isRevocableInvitation(inv) || canResendInvite(inv);
  const inviteArchived = (inv: any): boolean => isAssessmentArchived(inv.assessment_status);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectableIds = jdDisabled
    ? []
    : visibleInvitations.filter((inv: any) => isBulkActionable(inv) && !inviteArchived(inv)).map((inv: any) => inv.id);
  const selectedRows = visibleInvitations.filter((inv: any) => selectedIds.has(inv.id));
  const allRevocable = selectedRows.length > 0 && selectedRows.every(isRevocableInvitation);
  const allResendable = selectedRows.length > 0 && selectedRows.every(canResendInvite);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id: string) => selectedIds.has(id));
  const toggleSelectAll = () =>
    setSelectedIds(() => (allSelected ? new Set<string>() : new Set<string>(selectableIds)));
  const toggleSelectOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /* Reloads (paging, filtering, the 15s refresh moving a candidate forward)
     can leave selected ids pointing at rows that are gone or no longer
     eligible — drop those so the bulk button's count always matches what an
     action would actually do. */
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(visibleInvitations.filter(isBulkActionable).map((inv: any) => inv.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleInvitations, jdDisabled]);

  const [showBulkResendConfirm, setShowBulkResendConfirm] = useState(false);
  const [isBulkResending, setIsBulkResending] = useState(false);
  const [showBulkRevokeConfirm, setShowBulkRevokeConfirm] = useState(false);
  const [isBulkRevoking, setIsBulkRevoking] = useState(false);

  // Bulk resend — same endpoint as the single-row Resend, called per
  // invitation. Sequential on purpose: a burst of parallel resends is exactly
  // the kind of thing mail rate-limiters punish.
  const handleBulkResend = async () => {
    const targets = visibleInvitations.filter((inv: any) => selectedIds.has(inv.id) && canResendInvite(inv));
    if (targets.length === 0) {
      setShowBulkResendConfirm(false);
      return;
    }
    setIsBulkResending(true);
    let sent = 0;
    let failedCount = 0;
    for (const inv of targets) {
      try {
        await assessmentService.resendInvitation(inv.assessment_id, inv.id);
        sent++;
      } catch (error) {
        console.error(`Failed to resend invitation ${inv.id}:`, error);
        failedCount++;
      }
    }
    if (sent > 0) toast.success(`New invitation link${sent === 1 ? '' : 's'} sent to ${sent} candidate${sent === 1 ? '' : 's'}.`);
    if (failedCount > 0) toast.error(`${failedCount} invitation${failedCount === 1 ? '' : 's'} could not be resent.`);
    setSelectedIds(new Set());
    setShowBulkResendConfirm(false);
    setIsBulkResending(false);
    await handleInvitesChanged();
  };

  // Bulk revoke — offered whenever the selection is revocable, mirroring the
  // per-row Revoke action's own gate.
  const handleBulkRevoke = async () => {
    const targets = selectedRows.filter(isRevocableInvitation);
    if (targets.length === 0) {
      setShowBulkRevokeConfirm(false);
      return;
    }
    setIsBulkRevoking(true);
    let revoked = 0;
    let failedCount = 0;
    for (const inv of targets) {
      try {
        await assessmentService.revokeInvitation(inv.assessment_id, inv.id);
        revoked++;
      } catch (error) {
        console.error(`Failed to revoke invitation ${inv.id}:`, error);
        failedCount++;
      }
    }
    if (revoked > 0) toast.success(`Revoked ${revoked} invitation${revoked === 1 ? '' : 's'}.`);
    if (failedCount > 0) toast.error(`${failedCount} invitation${failedCount === 1 ? '' : 's'} could not be revoked.`);
    setSelectedIds(new Set());
    setShowBulkRevokeConfirm(false);
    setIsBulkRevoking(false);
    await handleInvitesChanged();
  };

  // "Go to page" input for the footer — buffered locally so a partial edit
  // doesn't get clobbered by currentPage until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState(String(currentPage));
  useEffect(() => {
    setGoToPage(String(currentPage));
  }, [currentPage]);
  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      setPage(target);
    } else {
      setGoToPage(String(currentPage));
    }
  };

  const resultsLabel = filtersActive
    ? `${filteredInvitations.length} matching invite${filteredInvitations.length === 1 ? '' : 's'}`
    : `Showing ${filteredInvitations.length === 0 ? 0 : pageStart + 1} to ${pageStart + visibleInvitations.length} of ${filteredInvitations.length} invites`;

  const pageBtn =
    'px-2 sm:px-3 py-1 sm:py-1.5 text-sm border border-gray-200 dark:border-slate-700 ' +
    'bg-white dark:bg-slate-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ' +
    'hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors';

  if (!isOpen) return null;

  // Status badge labels and styling kept in lockstep with the
  // assessment-level popup (Assessments.tsx) so a recruiter sees the
  // same wording — "System Check" / "Invited" / "Invite Failed" —
  // regardless of which surface they opened the popup from. That wording now
  // mirrors the AI Interview lifecycle (Invited -> System Check -> In Progress
  // -> Completed / Terminated); the underlying status values are unchanged.
  const getStatusBadge = (inv: any) => {
    const effective = getEffectiveStatus(inv);
    if (effective === 'completed') return <InviteStatusChip kind="completed" />;
    if (effective === 'failed') return <InviteStatusChip kind="invite_failed" />;
    if (effective === 'bounced') return <InviteStatusChip kind="bounced" />;
    if (effective === 'revoked') return <InviteStatusChip kind="revoked" />;
    if (effective === 'expired') return <InviteStatusChip kind="expired" />;
    if (effective === 'abandoned') return <InviteStatusChip kind="terminated" title="Ended before completion — the candidate left the assessment" />;
    if (effective === 'started') return <InviteStatusChip kind="in_progress" />;
    if (effective === 'opened') return <InviteStatusChip kind="system_check" title="Consent accepted — the candidate is on the system check step" />;
    if (inv.email_read_at) return <InviteStatusChip kind="read" />;
    if (effective === 'sent') return <InviteStatusChip kind="invited" />;
    return <InviteStatusChip kind="invited" title="Link created — no email sent yet" />;
  };

  // timelineEvents / isInviteExpired now come from AssessmentInviteActions.
  const isInvExpired = isInviteExpired;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 md:p-6">
      {/* Height is content-driven with a viewport cap, not a fixed dvh, so a
          short list no longer stretches the dialog down a large monitor. */}
      <div className={`${TRACKER_DIALOG_PANEL_CLASS} ${paginationBelowTable ? PAGED_PANEL_CLASS : ''}`}>
        {/* Modal Header */}
        {/* Header — the AI Interview tracker's: solid icon tile, title, then
            JD ID · job name · job version. */}
        <div className="tf-tracker-header px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="tf-section-title truncate tracking-tight">
                  <span className="hidden sm:inline">Assessment - Invite Status Tracking</span>
                  <span className="sm:hidden">Invite Status</span>
                </h2>
                <p className="flex items-center gap-2 tf-body-muted mt-0.5 min-w-0">
                  {jdShortId && <JobIdBadge className="flex-shrink-0">{jdShortId}</JobIdBadge>}
                  <span className="truncate">{jdTitle}</span>
                  {jobVersion != null && jobVersion > 0 && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 flex-shrink-0" title="Job version">V{jobVersion}</span>
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {guided && (
              <>
                <span className="max-sm:hidden"><UpdatedAgo at={loadedAt} /></span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => { setRefreshing(true); try { await loadInvitations(true); } finally { setRefreshing(false); } }}
                  disabled={refreshing}
                  aria-label="Refresh"
                  title="Refresh the list"
                  icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
                >
                  <span className="max-sm:hidden">Refresh</span>
                </Button>
              </>
            )}
            {/* No ✕: the footer's Cancel (and Esc's absence of a second way
                out) is the one close control. */}
          </div>
        </div>

        {/* Stat row doubles as the status filter — identical buckets, wording and
            behaviour to the Assessments page popup. Filtering here is client-side
            over the loaded list, and getEffectiveStatus returns exactly these
            keys, so a card and its rows always agree. */}
        <InviteStatCards
          gridClassName={guided ? `tf-tracker-stats ${GUIDED_STATS_PHONE}` : 'tf-tracker-stats'}
          activeStatus={filters.status}
          onSelect={(status) => {
            setFilters({ ...filters, status });
            setPage(1);
          }}
          cards={[
            { key: 'all', label: 'Total', Icon: Users, value: stats.total, ...INVITE_CARD_TONES.slate },
            { key: 'invited', label: 'Invited', Icon: Mail, value: stats.invited, ...INVITE_CARD_TONES.blue },
            { key: 'in_progress', label: 'In Progress', Icon: Play, value: stats.started, ...INVITE_CARD_TONES.orange },
            { key: 'completed', label: 'Completed', Icon: CheckCircle, value: stats.completed, ...INVITE_CARD_TONES.green },
            { key: 'expired', label: 'Expired', Icon: Clock, value: stats.expired, ...INVITE_CARD_TONES.orange },
            { key: 'terminated', label: 'Terminated', Icon: Ban, value: stats.terminated, ...INVITE_CARD_TONES.red },
            guided
              ? { key: 'revoked', label: 'Revoked', Icon: Undo2, value: stats.revoked, ...INVITE_CARD_TONES.red }
              : { key: 'revoked', label: 'Revoked', Icon: Ban, value: stats.revoked, ...INVITE_CARD_TONES.indigo },
          ]}
        />
        {guided && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2.5 sm:px-6 pt-2 flex-shrink-0">
            <StatCardsHint
              activeLabel={filters.status !== 'all' ? (STATUS_CARD_LABEL[filters.status] ?? filters.status) : null}
              onClear={() => { setFilters({ ...filters, status: 'all' }); setPage(1); }}
            />
            <StatusLegend kinds={ASSESSMENT_LEGEND} />
          </div>
        )}

        <InviteFilterBar
          filters={filters}
          onChange={(nextFilters) => {
            setFilters(nextFilters);
            // A narrowed list has its own page 1; staying on page 4 would look empty.
            setPage(1);
          }}
          statusOptions={guided ? ASSESSMENT_CARD_STATUS_OPTIONS : ASSESSMENT_INVITE_STATUS_OPTIONS}
          searchPlaceholder="Search by candidate name, email, or CID..."
          moreFilters={guided}
          extraSelects={[
            {
              key: 'assessment-version', ariaLabel: 'Assessment Version', anyLabel: 'All Assessment Versions', value: assessmentVersionFilter,
              options: assessmentVersions.map((v: any) => ({ value: String(v), label: `Assessment V${v}` })),
              onChange: (value) => { setAssessmentVersionFilter(value); setPage(1); },
            },
            {
              key: 'source', ariaLabel: 'Source', anyLabel: 'All Sources', value: sourceFilter,
              options: INVITE_SOURCE_FILTER_OPTIONS,
              onChange: (value) => { setSourceFilter(value); setPage(1); },
            },
            {
              key: 'result', ariaLabel: 'Result', anyLabel: 'All Results', value: resultFilter,
              options: RESULT_FILTER_OPTIONS,
              onChange: (value) => { setResultFilter(value); setPage(1); },
            },
          ]}
          onClearExtras={() => { setAssessmentVersionFilter(''); setSourceFilter(''); setResultFilter(''); }}
        />

        {/* Select All — same control, wording and placement as the
            Assessments page's own Track Invites popup. Any Invited or
            Expired row counts, regardless of the active stat card. */}
        {!isLoading && selectableIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-6 pt-2.5 sm:pt-3 flex-shrink-0">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue transition-colors"
            >
              <span
                role="checkbox"
                aria-checked={allSelected}
                className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                  allSelected
                    ? 'bg-brand-blue border-brand-blue'
                    : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600'
                }`}
              >
                {allSelected && <Check className="w-3 h-3 text-white" />}
              </span>
              {guided
                ? `Select all ${selectableIds.length} you can resend or revoke (Invited / Expired)`
                : `Select All (${selectableIds.length})`}
            </button>
            <div className="flex items-center gap-2">
              {/* Paging under the table: the count and completion sit on this
                  row too, so the table gets the height. */}
              {paginationBelowTable && (
                <>
                  <p className="tf-meta max-sm:hidden">{resultsLabel}</p>
                  <span className="tf-badge gap-1.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {completionRate}% Completion
                  </span>
                </>
              )}
              {/* Uniform selection's bulk action — never both at once. */}
              {allResendable && (
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => setShowBulkResendConfirm(true)}
                  disabled={isBulkResending}
                  icon={isBulkResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                >
                  {isBulkResending ? 'Sending…' : `Resend (${selectedIds.size})`}
                </Button>
              )}
              {allRevocable && (
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  onClick={() => setShowBulkRevokeConfirm(true)}
                  disabled={isBulkRevoking}
                  icon={isBulkRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                >
                  {isBulkRevoking ? 'Revoking…' : `Revoke (${selectedIds.size})`}
                </Button>
              )}
            </div>
          </div>
        )}

        {!isLoading && invitations.length > 0 && !(paginationBelowTable && selectableIds.length > 0) && (
          <div className="flex items-center justify-between gap-2 px-2.5 sm:px-6 pt-2.5 sm:pt-3 flex-shrink-0">
            <p className="tf-meta">{resultsLabel}</p>
          </div>
        )}

        {/* Invitations Table / Cards */}
        <div className={`px-2.5 sm:px-6 py-2.5 sm:py-4 flex flex-col ${paginationBelowTable ? 'flex-1' : 'overflow-hidden flex-1 min-h-0'}`}>
          {isLoading ? (
            /* Fills the body rather than sitting in a 200px box - see
               TRACKER_DIALOG_PLACEHOLDER_CLASS. The dialog's min-height
               reserves the space; this occupies it, so the swap to the table
               happens inside a box that does not change size. */
            <div className={TRACKER_DIALOG_PLACEHOLDER_CLASS}>
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin" />
            </div>
          ) : visibleInvitations.length === 0 ? (
            <div className={`${TRACKER_DIALOG_PLACEHOLDER_CLASS} text-gray-500 dark:text-slate-500`}>
              <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-300" />
              {/* "None found" is wrong when a filter is what emptied the list —
                  it reads as data loss rather than as a narrowed view. */}
              <p className="text-sm">
                {filtersActive
                  ? 'No invitations match the current filters.'
                  : "No invitations found for this job's assessments."}
              </p>
              {guided && (filtersActive ? (
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => { setFilters(EMPTY_INVITE_FILTERS); setAssessmentVersionFilter(''); setSourceFilter(''); setResultFilter(''); setPage(1); }}>
                  Clear filters
                </Button>
              ) : onInviteMore ? (
                <Button variant="primary" size="sm" className="mt-3" onClick={onInviteMore} icon={<Send className="w-3.5 h-3.5" />}>
                  Invite candidates
                </Button>
              ) : null)}
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="tf-record-list lg:hidden flex-1 min-h-0 overflow-y-auto">
                {visibleInvitations.map((invitation: any) => {
                  const effectiveStatus = getEffectiveStatus(invitation);
                  return (
                    <MobileRecordCard
                      key={invitation.id}
                      idBadge={
                        <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-2 py-1 rounded whitespace-nowrap">
                          {invitation.candidate_display_id || '-'}
                        </span>
                      }
                      title={
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{capitalizedCase(invitation.candidate_name)}</span>
                        </span>
                      }
                      badges={
                        <>
                          {getStatusBadge(invitation)}
                          {/* The secondary Expired flag the desktop table shows next to the status badge. */}
                          {isInvExpired(invitation) && (
                            <span className="tf-badge text-2xs ring-1 bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20 flex-shrink-0">
                              <Clock className="w-2.5 h-2.5" /> Expired
                            </span>
                          )}
                        </>
                      }
                      meta={[
                        { icon: <Mail />, label: invitation.candidate_email ? <span className="break-all">{invitation.candidate_email}</span> : null },
                        { icon: <FileText />, label: invitation.assessment_title || null },
                      ]}
                      footer={
                        effectiveStatus === 'completed' ? (
                          <>
                            <MobileStatChip tone={invitation.passed ? 'info' : 'danger'}>
                              Score: {invitation.overall_score != null ? `${formatScore(invitation.overall_score)}%` : 'N/A'}
                            </MobileStatChip>
                            {invitation.passed !== null && (
                              <MobileStatChip tone={invitation.passed ? 'info' : 'danger'}>
                                {invitation.passed ? 'Pass' : 'Fail'}
                              </MobileStatChip>
                            )}
                          </>
                        ) : effectiveStatus === 'started' ? (
                          <MobileStatChip tone="warning">
                            Progress: {invitation.progress_percent != null ? `${invitation.progress_percent}%` : 'In Progress'}
                          </MobileStatChip>
                        ) : undefined
                      }
                      actions={
                        <>
                          {effectiveStatus === 'completed' && invitation.attempt_id && (
                            <button
                              type="button"
                              onClick={() => openResult(invitation)}
                              title="View"
                              aria-label="View"
                              className="tf-icon-btn-outline"
                            >
                              <Eye />
                            </button>
                          )}
                          <InvitationActionButtons
                            actions={buildInvitationRowActions(invitation, {
                              ...rowActionOptions,
                              archived: isAssessmentArchived(invitation.assessment_status),
                              jdDisabled,
                            })}
                          />
                        </>
                      }
                    >
                      {invitation.status === 'failed' && (
                        <p className="mt-2 text-xs text-red-600">Incorrect Email</p>
                      )}

                      {/* Timeline — a two-column grid rather than a free wrap,
                          so the entries line up instead of staggering by the
                          width of whichever label came before them. */}
                      {timelineEvents(invitation, timelineLimit).length > 0 && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-slate-400">
                          {timelineEvents(invitation, timelineLimit).map(({ label, at, Icon, tone }, i) => (
                            <div key={`${label}-${i}`} className="flex items-center gap-1 min-w-0">
                              <Icon className={`w-3 h-3 flex-shrink-0 ${tone}`} />
                              <span className="truncate">{label}: {formatIST(at)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {hasMoreTimelineHistory(invitation, timelineLimit) && (
                        <ViewFullHistoryLink compact onClick={() => setHistoryTarget(invitation)} />
                      )}
                    </MobileRecordCard>
                  );
                })}
              </div>

              {/* Desktop Table View — Tech / Coding columns only render
                  when at least one row in the JD's invitations belongs to
                  an assessment that has that round enabled. Same rule as
                  the Results page: no all-empty columns. */}
              <div
                className={`hidden lg:block tf-table-shell tf-table-shell--compact ${paginationBelowTable ? 'border border-gray-200 dark:border-slate-700 rounded-lg' : 'tf-table-shell--fill flex-1 min-h-0'}`}
                style={paginationBelowTable ? { maxHeight: 'none' } : undefined}
              >
                {/* Auto layout, not table-fixed. The fixed column widths
                    summed well past the table's min-width, so every column
                    was scaled down and the Actions cell wrapped its two
                    buttons onto a second line. Columns now size to their
                    content, which cannot wrap, and the shell scrolls
                    horizontally instead. */}
                <table className="w-max min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700">
                      <th className="w-8 py-3 pl-3 lg:pl-4 pr-0 tf-sticky-col-left tf-th" aria-label="Select" />
                      <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[7.5rem]' : ''}`}>CID</th>
                      <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[15rem]' : ''}`}>Candidate</th>
                      {!reorderColumns && <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[14rem]' : ''}`}>Assessment</th>}
                      {!reorderColumns && <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[17rem]' : ''}`}>Timeline</th>}
                      <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[10rem]' : ''}`}>Status</th>
                      {invitations.some(inv => inv.assessment_technical_enabled) && (
                        <th className={`tf-th-cell text-center tf-th ${reorderColumns ? 'min-w-[7rem]' : ''}`}>Tech Score</th>
                      )}
                      {invitations.some(inv => inv.assessment_coding_enabled) && (
                        <th className={`tf-th-cell text-center tf-th ${reorderColumns ? 'min-w-[7rem]' : ''}`}>Coding Score</th>
                      )}
                      {reorderColumns && <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[17rem]' : ''}`}>Timeline</th>}
                      {!reorderColumns && <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[8.5rem]' : ''}`}>Invite Source</th>}
                      <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[7rem]' : ''}`}>Job Version</th>
                      {reorderColumns && <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[14rem]' : ''}`}>Assessment</th>}
                      <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[9.5rem]' : ''}`}>Assessment Version</th>
                      {reorderColumns && <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap ${reorderColumns ? 'min-w-[8.5rem]' : ''}`}>Invite Source</th>}
                      <th className={`text-left py-3 px-3 lg:px-4 tf-th whitespace-nowrap tf-sticky-col ${reorderColumns ? 'min-w-[5rem]' : ''}`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                    {visibleInvitations.map((invitation: any) => {
                      const assessmentCell = (
                      <td className={`tf-td ${tdY} whitespace-nowrap`}>
                        <p className="tf-body truncate max-w-[200px]" title={invitation.assessment_title}>{invitation.assessment_title}</p>
                      </td>
                      );
                      /* Every milestone on its own line, oldest first, the
                         way the Assessments page's Invite Status Tracking
                         table shows it. This used to print only the newest
                         with a "+N" counter, which hid the progression
                         behind a tooltip. align-top so the first line sits
                         level with the other columns' single line. */
                      /* Invite Source — how this candidate was actually
                         invited, from the invitation's own resume_id. */
                      const inviteSourceCell = (
                        <td className={`${cellY} px-3 lg:px-4 align-middle tf-td whitespace-nowrap`}>
                          <InviteSourceValue inv={assessmentInviteSource(invitation)} iconClassName="w-3.5 h-3.5" />
                        </td>
                      );
                      const timelineCell = (
                      <td className={`tf-td ${tdY} align-top tf-meta whitespace-nowrap`}>
                        {(() => {
                          const events = timelineEvents(invitation, timelineLimit);
                          return (
                            <>
                              {events.length === 0 ? (
                                <span className="text-gray-400 dark:text-slate-500">—</span>
                              ) : (
                                <div className={paginationBelowTable ? 'space-y-0.5' : 'space-y-1'}>
                                  {events.map(({ label, at, Icon, tone }, i) => (
                                    <div key={`${label}-${i}`} className="flex items-center gap-2 whitespace-nowrap">
                                      <Icon className={`w-3 h-3 flex-shrink-0 ${tone}`} />
                                      <span className={tone}>
                                        {label}: {formatIST(at)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {hasMoreTimelineHistory(invitation, timelineLimit) && (
                                <ViewFullHistoryLink onClick={() => setHistoryTarget(invitation)} />
                              )}
                            </>
                          );
                        })()}
                      </td>
                      );
                      return (
                        <tr key={invitation.id} className={`hover:bg-gray-50 dark:hover:bg-slate-800 ${paginationBelowTable ? ROW_MIN_H : ''}`}>
                          {/* stopPropagation: this row has no row-level click
                              handler today, but kept consistent with the
                              Assessments page popup's own checkbox cell. */}
                          <td className={`${cellY} pl-3 lg:pl-4 pr-0 align-middle tf-sticky-col-left`} onClick={(e) => e.stopPropagation()}>
                            {isBulkActionable(invitation) && !inviteArchived(invitation) && !jdDisabled ? (
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={selectedIds.has(invitation.id)}
                                aria-label={`Select ${invitation.candidate_name || invitation.candidate_email || 'candidate'}`}
                                onClick={() => toggleSelectOne(invitation.id)}
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
                          <td className={`tf-td ${tdY} whitespace-nowrap`}>
                            <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-2 py-1 rounded whitespace-nowrap">
                              {invitation.candidate_display_id || '-'}
                            </span>
                          </td>
                          <td className={`tf-td ${tdY} whitespace-nowrap`}>
                            <div className="flex items-center gap-2 lg:gap-3">
                              {/* Capped rather than free: with auto layout a single
                                  long email would otherwise set the column width. */}
                              <div className="min-w-0 max-w-[220px]">
                                <p className="tf-row-name truncate" title={capitalizedCase(invitation.candidate_name)}>{capitalizedCase(invitation.candidate_name)}</p>
                                <p className="tf-meta truncate" title={invitation.candidate_email}>{invitation.candidate_email}</p>
                              </div>
                            </div>
                          </td>
                          {!reorderColumns && assessmentCell}
                          {!reorderColumns && timelineCell}
                          <td className={`${cellY} px-3 lg:px-4 align-middle whitespace-nowrap`}>
                            {/* Badges stay on one line — the row height is set by
                                the candidate cell, and a wrapping second badge
                                was what pushed neighbouring columns out of line. */}
                            <div className="flex items-center gap-1.5 flex-nowrap overflow-hidden">
                              {getStatusBadge(invitation)}
                              {isInvExpired(invitation) && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ring-1 bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20 whitespace-nowrap flex-shrink-0">
                                  <Clock className="w-3 h-3" /> Expired
                                </span>
                              )}
                              {invitation.status === 'failed' && (
                                <span className="text-xs text-red-600 whitespace-nowrap">Incorrect Email</span>
                              )}
                            </div>
                          </td>
                          {/* Tech Score column body — render the cell only
                              when *some* row has tech enabled (column header
                              is gated identically). For a row whose source
                              assessment doesn't have tech, render '—'. */}
                          {invitations.some(inv => inv.assessment_technical_enabled) && (
                            <td className={`tf-td ${tdY} text-sm text-center whitespace-nowrap`}>
                              {(() => {
                                if (!invitation.assessment_technical_enabled) return <span className="text-gray-400 dark:text-slate-500">—</span>;
                                const ready =
                                  invitation.technical_score != null
                                  && invitation.scoring_status !== 'processing'
                                  && invitation.scoring_status !== 'pending';
                                if (!ready) return <span className="text-gray-400 dark:text-slate-500">—</span>;
                                const v = invitation.technical_score;
                                if (guided) return scoreStack(v);
                                return (
                                  <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                    <span className={`${SCORE_CELL_TEXT} ${v >= 70 ? 'text-brand-blue' : 'text-red-600'}`}>
                                      {Math.round(v)}%
                                    </span>
                                    <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${v >= 70 ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-red-50 text-red-600 ring-red-200'}`}>
                                      {v >= 70 ? 'Pass' : 'Fail'}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                          )}
                          {invitations.some(inv => inv.assessment_coding_enabled) && (
                            <td className={`tf-td ${tdY} text-sm text-center whitespace-nowrap`}>
                              {(() => {
                                if (!invitation.assessment_coding_enabled) return <span className="text-gray-400 dark:text-slate-500">—</span>;
                                const ready =
                                  invitation.coding_score != null
                                  && invitation.scoring_status !== 'processing'
                                  && invitation.scoring_status !== 'pending';
                                if (!ready) return <span className="text-gray-400 dark:text-slate-500">—</span>;
                                const v = invitation.coding_score;
                                if (guided) return scoreStack(v);
                                return (
                                  <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                    <span className={`${SCORE_CELL_TEXT} ${v >= 70 ? 'text-brand-blue' : 'text-red-600'}`}>
                                      {Math.round(v)}%
                                    </span>
                                    <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ring-1 ${v >= 70 ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-red-50 text-red-600 ring-red-200'}`}>
                                      {v >= 70 ? 'Pass' : 'Fail'}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                          )}
                          {reorderColumns && timelineCell}
                          {!reorderColumns && inviteSourceCell}
                          {/* Job Version / Assessment Version — this popup
                              aggregates every assessment attached to the JD,
                              so each row says which job version its
                              assessment belongs to and which version of the
                              assessment itself it is, the same two chips the
                              Assessments page's job-scoped Track Invites
                              popup shows. */}
                          <td className={`${cellY} px-3 lg:px-4 align-middle whitespace-nowrap`}>
                            <VersionChip kind="job" version={invitation._jd_version} />
                          </td>
                          {reorderColumns && assessmentCell}
                          <td className={`${cellY} px-3 lg:px-4 align-middle whitespace-nowrap`}>
                            <VersionChip kind="assessment" version={invitation._assessment_version} />
                          </td>
                          {reorderColumns && inviteSourceCell}
                          <td className={`${cellY} px-3 lg:px-4 align-middle whitespace-nowrap tf-sticky-col`}>
                            {(() => {
                              const rowActs = buildInvitationRowActions(invitation, {
                                ...rowActionOptions,
                                onViewResult: openResult,
                                archived: isAssessmentArchived(invitation.assessment_status),
                                jdDisabled,
                              });
                              return (
                                <InvitationActionsMenu actions={rowActs} />
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {paginationBelowTable && !isLoading && filteredInvitations.length > 0 && (
            <div className="mt-auto pt-3 shrink-0">
              <ListPagination
                currentPage={currentPage}
                itemsPerPage={pageSize}
                totalItems={filteredInvitations.length}
                onPageChange={(p) => setPage(() => p)}
                onItemsPerPageChange={() => setPage(() => 1)}
                pageSizeOptions={[pageSize]}
                itemLabel="invites"
                minimalOnMobile
                compact
                alwaysShow
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {/* Footer — stacks on phones; First/Last drop out below sm, matching the
            Assessments and AI Interviews trackers. */}
        <div className="tf-tracker-footer px-3 sm:px-6 py-2.5 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-950 shrink-0">
          {/* Phones show this count above the cards already, so it isn't repeated here. */}
          <p className="tf-body-muted text-center sm:text-left order-2 sm:order-1 max-sm:hidden">
            {/* The filtered count, not the raw total — the number has to agree
                with the rows actually on screen. Under the table instead when
                the paging is there. */}
            {!paginationBelowTable && resultsLabel}
          </p>
          <div className="flex items-center justify-center sm:justify-end flex-wrap gap-1.5 sm:gap-2 order-1 sm:order-2">
            {totalPages > 1 && !paginationBelowTable && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="tf-body-secondary whitespace-nowrap">Go to</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={goToPage}
                    onChange={(e) => setGoToPage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                        commitGoToPage();
                      }
                    }}
                    onBlur={commitGoToPage}
                    aria-label="Go to page"
                    className="tf-input w-12 sm:w-14 h-8 px-1.5 sm:px-2 text-center"
                  />
                </div>
                <button onClick={() => setPage(() => Math.max(1, currentPage - 1))} disabled={currentPage === 1} className={pageBtn}>
                  Prev
                </button>
                <span className="px-1 sm:px-2 tf-body-secondary whitespace-nowrap">
                  Page {currentPage} of {totalPages}
                </span>
                <button onClick={() => setPage(() => Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className={pageBtn}>
                  Next
                </button>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {(onInviteMore || inviteMoreDeniedReason) && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => { if (onInviteMore) onInviteMore(); }}
                aria-disabled={!onInviteMore || undefined}
                title={!onInviteMore ? inviteMoreDeniedReason : undefined}
                className={`${(!onInviteMore ? 'opacity-60 cursor-not-allowed' : undefined) ?? ''} disabled:opacity-50`}
                icon={<Send className="w-3.5 h-3.5" />}
              >
                Invite More
              </Button>
            )}
          </div>
        </div>
      </div>

      <RevokeInvitationDialog
        target={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        getAssessmentId={(inv) => inv.assessment_id}
        onRevoked={handleInvitesChanged}
      />
      <EditInvitationModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        getAssessmentId={(inv) => inv.assessment_id}
        onSaved={handleInvitesChanged}
      />
      <InvitationHistoryDialog
        target={historyTarget}
        onClose={() => setHistoryTarget(null)}
        getAssessmentId={(inv) => inv.assessment_id}
      />

      {/* Bulk resend confirmation — selected Expired/Failed candidates only. */}
      <ConfirmationDialog
        isOpen={showBulkResendConfirm}
        onClose={() => { if (!isBulkResending) setShowBulkResendConfirm(false); }}
        onConfirm={handleBulkResend}
        title="Resend invitations to selected candidates?"
        description={`A fresh assessment link will be emailed to ${selectedIds.size} selected candidate${selectedIds.size === 1 ? '' : 's'}. Each candidate's previous link will stop working immediately.`}
        confirmText={isBulkResending ? 'Sending…' : `Yes, resend to ${selectedIds.size}`}
        cancelText="Cancel"
        variant="info"
      />

      {/* Bulk revoke — selected Invited candidates only. */}
      <ConfirmationDialog
        isOpen={showBulkRevokeConfirm}
        onClose={() => { if (!isBulkRevoking) setShowBulkRevokeConfirm(false); }}
        onConfirm={handleBulkRevoke}
        title="Revoke invitations for selected candidates?"
        description={`The assessment link for ${selectedRows.length} selected candidate${selectedRows.length === 1 ? '' : 's'} will stop working immediately.`}
        confirmText={isBulkRevoking ? 'Revoking…' : `Yes, revoke ${selectedRows.length}`}
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
