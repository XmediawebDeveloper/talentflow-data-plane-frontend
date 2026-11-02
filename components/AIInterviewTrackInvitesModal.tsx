'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Users, Mail, Play, Check, CheckCircle, Clock, Ban, TrendingUp, Loader2, RefreshCw, Info, Send } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE, isInterviewConfigArchived } from '@/lib/services/aiInterviewService';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { INVITE_SOURCE_FILTER_OPTIONS, RESULT_FILTER_OPTIONS } from '@/components/ai-interview/ColumnFilterFields';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import RevokeLinkModal from '@/components/recruitment/RevokeLinkModal';
import { Button } from '@/components/ui/button';
import InviteFilterBar, {
  EMPTY_INVITE_FILTERS,
  AI_INTERVIEW_INVITE_STATUS_OPTIONS,
  hasActiveInviteFilters,
  type InviteFilterState,
} from '@/components/InviteFilterBar';
import InviteStatCards, { INVITE_CARD_TONES } from '@/components/InviteStatCards';
import { TRACKER_DIALOG_PANEL_CLASS } from '@/lib/constants/trackerDialog';
import TabEmptyState from '@/components/ui/tab-empty-state';
import { useDialogHeightLock } from '@/lib/hooks/useDialogHeightLock';
import { useTrackerPoll } from '@/lib/hooks/useTrackerPoll';
import { isValidEmailFormat, EMAIL_FORMAT_ERROR } from '@/lib/utils/email';
import { isValidCandidateName, NAME_FORMAT_ERROR } from '@/lib/utils/name';
import { formatIST } from '@/lib/utils/dateUtils';
import { VersionPill } from '@/components/ai-interview/AllInterviewsTable';
import AIInterviewInviteTable, {
  isExpiredForActions,
  isRevocableInvite,
  displayInviteScore,
  matchesInviteResultFilter,
} from '@/components/AIInterviewInviteTable';

/* Bulk resend eligibility — Expired rows only, and never once the candidate
   has started or completed. A freshly-sent "invited" row has no manual resend
   (Revoke, then Edit's Save and Send on the AI Interviews page, is the only
   way to reissue a link) — matches the per-row Resend rule so the two popups
   behave the same. */
const isBulkResendable = (inv: any): boolean =>
  isExpiredForActions(inv) &&
  !inv.started_at &&
  !inv.completed_at;

/* Any row a bulk Revoke OR a bulk Resend can act on gets a checkbox — same
   rule as the Assessments tracker, independent of which stat card filter is
   currently active. */
const isBulkActionable = (inv: any): boolean => isRevocableInvite(inv) || isBulkResendable(inv);

interface AIInterviewTrackInvitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Published AI interview config whose invitations are being tracked. */
  configId: string;
  jdTitle: string;
  /** This job's short id (e.g. "JD-014"), shown before the job title in the
   *  header and offered as the JD ID filter. */
  jdShortId?: string;
  /** The tracked interview's job version and interview version, shown as a
   *  column each (every row here shares both). Leave either out and the
   *  tracker looks the config up itself. */
  jobVersion?: number;
  interviewVersion?: number;
  /** Tracking ONE version (a version's own details page): every row shares
   *  its job and interview version, so their columns and filters are left out. */
  hideVersionDetails?: boolean;
  /** Opened from a job's own page: the job version is fixed, so its filter is
   *  dropped and the version shows after the job name in the title instead. */
  hideJobVersionFilter?: boolean;
  /** Opens a completed candidate's result. When the host can render the result
   *  inline (Job Details does), pass this; the table only offers View Details
   *  on completed rows when it is present. */
  onViewResult?: (inv: any) => void;
  /** Renders as a plain in-page panel instead of a fixed, backdropped dialog —
   *  the AI Interview Details page's Track tab, which is this same tracker
   *  living at a destination rather than a popup over one. Drops the backdrop,
   *  the dialog's width/height caps, and the header/footer Close controls
   *  (there is nothing to close back to); everything else — stats, filters,
   *  bulk resend, the table, pagination — is unchanged. */
  embedded?: boolean;
  /** The interview's job is disabled — invites stay viewable, but Invite More,
   *  Resend, Edit and Revoke are blocked. Omit it and the tracker looks the
   *  config's job status up itself. */
  jdDisabled?: boolean;
  /** The interview CONFIG itself is archived (its own status, independent of
   *  its job's) — same lock as `jdDisabled`. Omit it and the tracker looks the
   *  config's own status up itself. */
  configArchived?: boolean;
  /** Footer "Invite More" — the host closes this tracker and opens its own
   *  invite flow. Left out, the button is not shown. */
  onInviteMore?: () => void;
  /** Shown (greyed, as the tooltip) when Invite More is not allowed — the
   *  button stays visible (RBAC grey-out rule). */
  inviteMoreDeniedReason?: string;
  /** Called after a resend / revoke / edit changed invitations, once this
   *  tracker's own rows are reloaded — so the host's counts and lists (the
   *  Invitation Status tab, interview cards, activity) refresh at once rather
   *  than on their next poll. */
  onChanged?: () => void | Promise<void>;
  /** Bump to make the tracker reload its list at once — for a host whose own
   *  dialog (e.g. Share) adds invitations while this tracker stays mounted
   *  underneath, so they appear without waiting for the 15s poll. */
  refreshSignal?: number;
  /** Opens pre-filtered to one candidate (their email) — the bulk-send
   *  popup's per-row "Track status". */
  initialSearch?: string;
}

const PAGE_SIZE = 10;

/**
 * Invite tracking for a job's AI interview, opened from the Job Details page.
 *
 * Mirrors the AI Interviews page's own tracker element for element: Refresh,
 * the results note with the completion badge, the stat cards, filters, bulk
 * Revoke (Invited card) / Resend (Expired card), per-row Resend / Edit /
 * Revoke, the refresh veil and Invite More. The list is the same
 * <AIInterviewInviteTable>, so the per-status action rules are the table's.
 */
export default function AIInterviewTrackInvitesModal({
  isOpen,
  onClose,
  configId,
  jdTitle,
  jdShortId,
  jobVersion: jobVersionProp,
  interviewVersion: interviewVersionProp,
  hideVersionDetails = false,
  hideJobVersionFilter = false,
  onViewResult,
  embedded = false,
  jdDisabled: jdDisabledProp,
  configArchived: configArchivedProp,
  onInviteMore,
  inviteMoreDeniedReason,
  onChanged,
  refreshSignal,
  initialSearch,
}: AIInterviewTrackInvitesModalProps) {
  const [isLoading, setIsLoading] = useState(true);

  const [lookedUpJdDisabled, setLookedUpJdDisabled] = useState(false);
  const [lookedUpConfigArchived, setLookedUpConfigArchived] = useState(false);
  useEffect(() => {
    if (!isOpen || !configId || (jdDisabledProp !== undefined && configArchivedProp !== undefined)) return;
    let cancelled = false;
    aiInterviewService
      .get(configId)
      .then((cfg) => {
        if (cancelled) return;
        if (jdDisabledProp === undefined) setLookedUpJdDisabled(isJdDisabled(cfg?.jd_status));
        if (configArchivedProp === undefined) setLookedUpConfigArchived(isInterviewConfigArchived(cfg?.status));
      })
      .catch(() => { /* Unknown — the server still refuses actions on a disabled/archived config. */ });
    return () => { cancelled = true; };
  }, [isOpen, jdDisabledProp, configArchivedProp, configId]);
  const jdDisabled = jdDisabledProp ?? lookedUpJdDisabled;
  const configArchived = configArchivedProp ?? lookedUpConfigArchived;

  /* Job / interview version for the two version columns. Taken from the host
     when it knows them; otherwise derived here from the config list — the
     interview version is this config's place among its job version's
     configs, which only the full list can say. */
  const [lookedUpVersions, setLookedUpVersions] = useState<{ job: number; interview: number } | null>(null);
  const needsVersionLookup = (!hideVersionDetails || hideJobVersionFilter) && (jobVersionProp == null || interviewVersionProp == null);
  useEffect(() => {
    if (!isOpen || !needsVersionLookup) return;
    let cancelled = false;
    aiInterviewService
      .listConfigs({ page: 1, page_size: 500, compact: true })
      .then((res) => {
        if (cancelled) return;
        const all = res.items ?? [];
        const self = all.find((c) => c.id === configId);
        if (!self) return;
        setLookedUpVersions({ job: self.jd_version ?? 1, interview: interviewVersionOrdinal(self, all) });
      })
      .catch(() => { /* The columns simply stay hidden. */ });
    return () => { cancelled = true; };
  }, [isOpen, needsVersionLookup, configId]);
  const jobVersion = hideVersionDetails ? undefined : (jobVersionProp ?? lookedUpVersions?.job);
  const interviewVersion = hideVersionDetails ? undefined : (interviewVersionProp ?? lookedUpVersions?.interview);
  // The header names the version when the table has no version columns to.
  const headerJobVersion = jobVersionProp ?? lookedUpVersions?.job;
  const headerInterviewVersion = interviewVersionProp ?? lookedUpVersions?.interview;
  const [invitations, setInvitations] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  // "Go to page" input for the footer — buffered locally so a partial edit
  // doesn't get clobbered by `page` until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState('1');
  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);
  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      setPage(target);
    } else {
      setGoToPage(String(page));
    }
  };
  /* Same filter contract the AI Interviews page's tracker uses. The endpoint
     already accepted search/status/date — this tracker just never passed them,
     so it always showed the unfiltered first page. */
  const [filters, setFilters] = useState<InviteFilterState>(() => (
    initialSearch ? { ...EMPTY_INVITE_FILTERS, search: initialSearch } : EMPTY_INVITE_FILTERS
  ));
  /* Job Version and Interview Version filters. Everything in a tracker
     belongs to one interview, so each offers that interview's single value
     and every row matches it — they mirror the table's columns rather than
     narrow it. Source does narrow: see loadInvitations. */
  const [jobVersionFilter, setJobVersionFilter] = useState('');
  const [versionFilter, setVersionFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const fetchAllForClientFilters = !!(sourceFilter || resultFilter);
  const [totalPages, setTotalPages] = useState(1);
  const [filteredTotal, setFilteredTotal] = useState(0);
  /* Card counts are deliberately NOT taken from the filtered response: selecting
     a bucket would then zero every other card. This holds the unfiltered
     overview, refreshed alongside the list. */
  const [overview, setOverview] = useState({
    total: 0,
    invited: 0,
    completed: 0,
    inProgress: 0,
    terminated: 0,
    cancelled: 0,
    revoked: 0,
    expired: 0,
  });
  // Resend flow — confirm first (the old link stops working), then send.
  const [resendTarget, setResendTarget] = useState<any | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  // Revoke (single + bulk) and Edit — the same flows the AI Interviews page's
  // tracker runs, against the same endpoints.
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [showBulkRevokeConfirm, setShowBulkRevokeConfirm] = useState(false);
  const [isBulkRevoking, setIsBulkRevoking] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ candidate_name: '', candidate_email: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const heightLock = useDialogHeightLock<HTMLDivElement>();

  /* Bulk selection — same control and semantics as the Assessments tracker's
     Select All bar: any row a bulk Revoke OR a bulk Resend can act on gets a
     checkbox, regardless of which stat card filter is currently active —
     Invited and Expired rows can be ticked together. Which bulk BUTTON
     appears depends on the ticked selection being uniformly one status-class
     or the other (see allRevocable/allResendable below); a mixed
     Invited+Expired selection shows neither — an action valid for one status
     must never be applied to the other. Scoped to the rows on the CURRENT page. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkResendConfirm, setShowBulkResendConfirm] = useState(false);
  const [isBulkResending, setIsBulkResending] = useState(false);
  const selectableIds = (jdDisabled || configArchived) ? [] : invitations.filter(isBulkActionable).map((inv: any) => inv.id);
  const selectedRows = invitations.filter((inv: any) => selectedIds.has(inv.id));
  const allRevocable = selectedRows.length > 0 && selectedRows.every(isRevocableInvite);
  const allResendable = selectedRows.length > 0 && selectedRows.every(isBulkResendable);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id: string) => selectedIds.has(id));
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
      const valid = new Set(invitations.filter(isBulkActionable).map((inv: any) => inv.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitations, jdDisabled, configArchived]);

  // Bulk resend — same endpoint as the single-row Resend, called per
  // invitation. Sequential on purpose: a burst of parallel resends is exactly
  // the kind of thing mail rate-limiters punish.
  const handleBulkResend = async () => {
    const targets = invitations.filter(
      (inv: any) => selectedIds.has(inv.id) && isBulkResendable(inv)
    );
    if (targets.length === 0) {
      setShowBulkResendConfirm(false);
      return;
    }
    setIsBulkResending(true);
    let sent = 0;
    let failedCount = 0;
    for (const inv of targets) {
      try {
        await aiInterviewService.sendSessionEmail(inv.id, { base_url: window.location.origin });
        sent++;
      } catch (error) {
        console.error(`Failed to resend AI interview invitation ${inv.id}:`, error);
        failedCount++;
      }
    }
    if (sent > 0) {
      toast.success(`New invitation link${sent === 1 ? '' : 's'} sent to ${sent} candidate${sent === 1 ? '' : 's'}.`);
    }
    if (failedCount > 0) {
      toast.error(`${failedCount} invitation${failedCount === 1 ? '' : 's'} could not be resent.`);
    }
    setSelectedIds(new Set());
    setShowBulkResendConfirm(false);
    setIsBulkResending(false);
    await loadInvitations(true);
    await onChanged?.();
  };

  /* Bumped by every loadInvitations run (filter/page change, poll, Refresh),
     so an older response landing late can't overwrite a newer one's rows and
     cards. */
  const loadSeqRef = useRef(0);
  const loadInvitations = useCallback(async (silent = false) => {
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;
    if (!silent) setIsLoading(true);
    try {
      /* Four page_size-1-or-N calls in parallel: the filtered page itself, the
         unfiltered overview, and the invited and revoked buckets. The list
         endpoint reports completed/in_progress/terminated/cancelled but not
         `invited` or `revoked`, and deriving either as "total minus the rest"
         would leave that card disagreeing with the rows it filters to — the
         remainder also holds expired and system_check sessions. */
      const [result, summary, invitedOnly, revokedOnly, expiredOnly] = await Promise.all([
        aiInterviewService.getConfigInvitations(configId, {
          search: filters.search.trim() || undefined,
          status: filters.status !== 'all' ? filters.status : undefined,
          invite_date_from: filters.dateFrom || undefined,
          invite_date_to: filters.dateTo || undefined,
          /* Source (email / resume) and Result (the Score column's Pass /
             Fail) have no server-side filter, so with either set the whole
             matching list is fetched and paged here instead. */
          page: fetchAllForClientFilters ? 1 : page,
          page_size: fetchAllForClientFilters ? 1000 : PAGE_SIZE,
        }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1 }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1, status: 'invited' }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1, status: 'revoked' }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1, status: 'expired' }),
      ]);
      if (isStale()) return;

      if (fetchAllForClientFilters) {
        const matching = (result.items || []).filter((inv: any) =>
          (!sourceFilter || inv.invite_source === sourceFilter) && matchesInviteResultFilter(inv, displayInviteScore(inv), resultFilter));
        const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
        const safePage = Math.min(page, pages);
        setInvitations(matching.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE));
        setFilteredTotal(matching.length);
        setTotalPages(pages);
        if (safePage !== page) setPage(safePage);
      } else {
        setInvitations(result.items || []);
        setFilteredTotal(result.total || 0);
        setTotalPages(Math.max(1, result.total_pages || 1));
      }
      setOverview({
        total: summary.total || 0,
        invited: invitedOnly.total || 0,
        completed: summary.completed || 0,
        inProgress: summary.in_progress || 0,
        terminated: summary.terminated || 0,
        cancelled: summary.cancelled || 0,
        revoked: revokedOnly.total || 0,
        expired: expiredOnly.total || 0,
      });

      /* Filtering can empty the page you were on — drop back rather than showing
         "no candidates" over a list that still has results. */
      if (!fetchAllForClientFilters && (result.items || []).length === 0 && (result.total || 0) > 0 && page > 1) {
        setPage(current => Math.min(current - 1, Math.max(1, result.total_pages || 1)));
      }
    } catch (error) {
      if (isStale()) return;
      console.error('Failed to load AI interview invitations:', error);
      if (!silent) toast.error('Could not load invitations. Please try again.');
    } finally {
      // A stale run leaves the spinner to the run that replaced it.
      if (!isStale()) setIsLoading(false);
    }
  }, [configId, page, filters, sourceFilter, resultFilter, fetchAllForClientFilters]);

  /* Header Refresh — re-reads in place: the rows stay put under a veil and the
     dialog's height is pinned until the new data lands, so nothing jumps. */
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await heightLock.run(() => loadInvitations(true));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBulkRevoke = async () => {
    const targets = selectedRows.filter(isRevocableInvite);
    if (targets.length === 0) { setShowBulkRevokeConfirm(false); return; }
    setIsBulkRevoking(true);
    try {
      const results = await Promise.allSettled(targets.map((inv: any) => aiInterviewService.revokeInvitation(inv.id)));
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      if (succeeded > 0) toast.success(`Revoked ${succeeded} invitation${succeeded === 1 ? '' : 's'}.`);
      if (failed > 0) toast.error(`Failed to revoke ${failed} invitation${failed === 1 ? '' : 's'}.`);
      setSelectedIds(new Set());
      await loadInvitations(true);
      await onChanged?.();
    } finally {
      setIsBulkRevoking(false);
      setShowBulkRevokeConfirm(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !configId) return;
    loadInvitations();
  }, [isOpen, configId, loadInvitations]);
  // Same silent refresh the assessment tracker uses — candidates move through
  // an interview while the recruiter watches this list.
  useTrackerPoll(isOpen && !!configId, () => loadInvitations(true));

  useEffect(() => {
    if (!isOpen || !configId || !refreshSignal) return;
    loadInvitations(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  if (!isOpen) return null;

  /* No rows yet → the spinner is the body. Rows on screen and a re-read in
     flight → keep them and veil them, as the AI Interviews tracker does. */
  const initialLoading = isLoading && invitations.length === 0;
  const refreshVeil = (isLoading || isRefreshing) && invitations.length > 0;

  const filtersActive = hasActiveInviteFilters(filters);
  const completionRate = overview.total > 0 ? Math.round((overview.completed / overview.total) * 100) : 0;
  const startIndex = filteredTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, filteredTotal);
  const resultsLabel = filtersActive
    ? `${filteredTotal} matching candidate${filteredTotal === 1 ? '' : 's'}`
    : `Showing ${startIndex} to ${endIndex} of ${filteredTotal} invites`;

  const pageBtn =
    'px-2 sm:px-3 py-1 sm:py-1.5 text-sm border border-gray-200 dark:border-slate-700 ' +
    'bg-white dark:bg-slate-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ' +
    'hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors';

  /* Nobody invited yet (the unfiltered total is 0): like the Results tab, the
     shared empty state stands alone — no zeroed stat cards, filter bar,
     completion badge, empty table or pager. */
  const isUnstarted = !isLoading && overview.total === 0;

  const panel = (
      <div
        {...(embedded ? {} : heightLock.dialogProps)}
        className={embedded
          ? 'bg-white dark:bg-slate-900 w-full flex flex-col'
          : TRACKER_DIALOG_PANEL_CLASS}>
        {/* Header */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50 truncate tracking-tight">
                  {embedded ? (
                    // Embedded as the details page's Invitation Status tab —
                    // headed with that tab's own name.
                    'Invitation Status'
                  ) : (
                    <>
                      <span className="hidden sm:inline">AI Interview - Invite Status Tracking</span>
                      <span className="sm:hidden">Invite Status</span>
                    </>
                  )}
                </h2>
                {/* JD ID · job title · job version */}
                <p className="flex items-center gap-2 tf-body-muted mt-0.5 min-w-0">
                  {jdShortId && <JobIdBadge className="flex-shrink-0">{jdShortId}</JobIdBadge>}
                  <span className="truncate">{jdTitle}</span>
                  {/* "Job title - V1   Interview Version - V1", as the AI
                      Interviews tracker heads a single version. */}
                  {hideJobVersionFilter && headerJobVersion != null && headerJobVersion > 0 && (
                    <span className="-ml-0.5 flex items-center gap-3 flex-shrink-0 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        -
                        <VersionPill kind="job" version={headerJobVersion} />
                      </span>
                      {headerInterviewVersion != null && (
                        <span className="inline-flex items-center gap-1.5">
                          Interview Version -
                          <VersionPill kind="interview" version={headerInterviewVersion} />
                        </span>
                      )}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              title="Fetch the latest invite statuses"
              aria-label="Refresh"
              icon={<RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
            >
              {/* Reserves the wider word so the header never shifts. */}
              <span className="hidden sm:inline-block min-w-[5.5rem] text-left">
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </span>
            </Button>
            {!embedded && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="px-2"
                aria-label="Close"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            )}
          </div>
        </div>

        {isUnstarted ? (
          <div className="px-2.5 sm:px-6 py-2.5 sm:py-4">
            <TabEmptyState
              icon={Mail}
              title="No Invitations Sent Yet"
              description="Invite candidates to this interview and their status appears here."
            />
          </div>
        ) : (
        <>
        {/* Stat row doubles as the status filter — same buckets and wording as the
            AI Interviews page tracker. */}
        <InviteStatCards
          gridClassName="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1 sm:gap-2 lg:gap-3"
          activeStatus={filters.status}
          onSelect={(status) => {
            setFilters({ ...filters, status });
            setPage(1);
          }}
          cards={[
            { key: 'all', label: 'Total', Icon: Users, value: overview.total, ...INVITE_CARD_TONES.slate },
            { key: 'invited', label: 'Invited', Icon: Mail, value: overview.invited, ...INVITE_CARD_TONES.blue },
            { key: 'in_progress', label: 'In Progress', Icon: Play, value: overview.inProgress, ...INVITE_CARD_TONES.orange },
            { key: 'completed', label: 'Completed', Icon: CheckCircle, value: overview.completed, ...INVITE_CARD_TONES.green },
            { key: 'expired', label: 'Expired', Icon: Clock, value: overview.expired, ...INVITE_CARD_TONES.orange },
            { key: 'terminated', label: 'Terminated', Icon: Ban, value: overview.terminated, ...INVITE_CARD_TONES.red },
            { key: 'revoked', label: 'Revoked', Icon: Ban, value: overview.revoked, ...INVITE_CARD_TONES.indigo },
          ]}
        />

        <InviteFilterBar
          filters={filters}
          onChange={(nextFilters) => {
            setFilters(nextFilters);
            // A narrowed list has its own page 1; staying on page 4 would look empty.
            setPage(1);
          }}
          statusOptions={AI_INTERVIEW_INVITE_STATUS_OPTIONS}
          searchPlaceholder="Search by candidate name or email..."
          extraSelects={[
            ...(hideVersionDetails ? [] : [...(hideJobVersionFilter ? [] : [{
              key: 'job-version', ariaLabel: 'Job Version', anyLabel: 'All Job Versions', value: jobVersionFilter,
              options: jobVersion != null ? [{ value: String(jobVersion), label: `Job V${jobVersion}` }] : [],
              onChange: setJobVersionFilter,
            }]),
            {
              key: 'interview-version', ariaLabel: 'Interview Version', anyLabel: 'All Interview Versions', value: versionFilter,
              options: interviewVersion != null ? [{ value: String(interviewVersion), label: `Interview V${interviewVersion}` }] : [],
              onChange: setVersionFilter,
            }]),
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
          onClearExtras={() => { setJobVersionFilter(''); setVersionFilter(''); setSourceFilter(''); setResultFilter(''); }}
        />

        {/* Select All — same control, wording and placement as the Assessments
            tracker's bulk-select bar. Any Invited or Expired row counts,
            regardless of the active stat card. The completion-rate badge
            (previously its own card in the stat row above) sits on this same
            row, straight across from Select All. */}
        {!initialLoading && (
          <div className="flex items-center justify-between gap-2 px-2.5 sm:px-6 pt-2.5 sm:pt-3 flex-shrink-0">
            {selectableIds.length > 0 ? (
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
                Select All ({selectableIds.length})
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              {/* Uniform selection's bulk action — never both at once. */}
              {allRevocable && (
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  onClick={() => setShowBulkRevokeConfirm(true)}
                  disabled={isBulkRevoking}
                  title="Revoke the selected candidates' interview links"
                  icon={isBulkRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                >
                  {isBulkRevoking ? 'Revoking…' : `Revoke (${selectedRows.length})`}
                </Button>
              )}
              {allResendable && (
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => setShowBulkResendConfirm(true)}
                  disabled={isBulkResending}
                  className="whitespace-nowrap"
                >
                  {isBulkResending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Mail className="w-3.5 h-3.5" />}
                  {isBulkResending ? 'Sending…' : `Resend (${selectedIds.size})`}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Candidate list. overflow-hidden, not overflow-auto: the table shell (or
            the mobile card stack) inside is the single vertical scroller. */}
        <div className="relative px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-hidden flex-1 min-h-0 flex flex-col">
          {/* Same list and action rules as the AI Interviews tracker. */}
          <AIInterviewInviteTable
            invitations={invitations}
            jdDisabled={jdDisabled}
            configArchived={configArchived}
            isLoading={initialLoading}
            hasActiveFilters={filtersActive}
            emptyHint="Use Send Invite to invite candidates to this job's AI interview."
            jobVersion={jobVersion}
            interviewVersion={interviewVersion}
            onResend={(inv) => setResendTarget(inv)}
            resendingId={resendingId}
            onEdit={(inv) => {
              setEditForm({ candidate_name: inv.candidate_name || '', candidate_email: inv.candidate_email || '' });
              setEditTarget(inv);
            }}
            onRevoke={(inv) => setRevokeTarget(inv)}
            revokingId={revokingId}
            onViewDetails={onViewResult}
            selectedIds={(jdDisabled || configArchived) ? undefined : selectedIds}
            onToggleSelect={(jdDisabled || configArchived) ? undefined : toggleSelectOne}
            isSelectable={isBulkActionable}
          />
          {refreshVeil && (
            <div
              className="absolute inset-0 z-10 flex items-start justify-center pt-10 sm:pt-14 bg-white/60 dark:bg-slate-900/60 rounded-lg"
              aria-live="polite"
            >
              <span className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 shadow-sm ring-1 ring-black/[0.06] dark:ring-white/10">
                <Loader2 className="w-3.5 h-3.5 text-brand-blue animate-spin" />
                Refreshing invite statuses...
              </span>
            </div>
          )}
        </div>
        </>
        )}

        {/* Resend confirmation — regenerates the interview token, so the old
            link stops working the moment the new email goes out. Mirrors the
            AI Interviews page tracker's dialog and endpoint. */}
        <ConfirmationDialog
          isOpen={!!resendTarget}
          onClose={() => { if (resendingId !== resendTarget?.id) setResendTarget(null); }}
          onConfirm={async () => {
            const inv = resendTarget;
            if (!inv) return;
            setResendingId(inv.id);
            try {
              await aiInterviewService.sendSessionEmail(inv.id, { base_url: window.location.origin });
              toast.success(`New invitation link sent to ${inv.candidate_email}`);
              await loadInvitations(true);
              await onChanged?.();
            } catch (err: any) {
              const detail = err?.response?.data?.detail;
              const msg =
                (typeof detail === 'object' && detail?.message) ||
                (typeof detail === 'string' && detail) ||
                err?.message ||
                'Failed to resend email';
              toast.error(msg);
            } finally {
              setResendingId(null);
              setResendTarget(null);
            }
          }}
          title="Invalidate old link & send new invitation?"
          description={
            resendTarget
              ? `A fresh interview link will be emailed to ${resendTarget.candidate_email}. The previous link will stop working immediately.`
              : ''
          }
          confirmText={resendingId && resendingId === resendTarget?.id ? 'Sending…' : 'Yes, send new link'}
          cancelText="Cancel"
          variant="info"
        >
          {resendTarget && <NewLinkExpiry inv={resendTarget} />}
        </ConfirmationDialog>

        {/* Revoke — the old link stops working immediately. */}
        <RevokeLinkModal
          isOpen={!!revokeTarget}
          kind="interview"
          email={revokeTarget?.candidate_email}
          isLoading={!!revokingId && revokingId === revokeTarget?.id}
          onCancel={() => { if (!revokingId) setRevokeTarget(null); }}
          onConfirm={async () => {
            const inv = revokeTarget;
            if (!inv) return;
            setRevokingId(inv.id);
            try {
              await aiInterviewService.revokeInvitation(inv.id);
              toast.success(`Invitation for ${inv.candidate_email} has been revoked`);
              await loadInvitations(true);
              await onChanged?.();
            } catch (err: any) {
              toast.error(friendlyErrorMessage(err, "Couldn't revoke invitation. Please try again."));
            } finally {
              setRevokingId(null);
              setRevokeTarget(null);
            }
          }}
        />

        {/* Bulk revoke — selected Invited candidates only. */}
        <ConfirmationDialog
          isOpen={showBulkRevokeConfirm}
          onClose={() => { if (!isBulkRevoking) setShowBulkRevokeConfirm(false); }}
          onConfirm={handleBulkRevoke}
          title="Revoke invitations for selected candidates?"
          description={`The interview link for ${selectedRows.length} selected candidate${selectedRows.length === 1 ? '' : 's'} will stop working immediately.`}
          confirmText={isBulkRevoking ? 'Revoking…' : `Yes, revoke ${selectedRows.length}`}
          cancelText="Cancel"
          variant="danger"
        />

        {/* Bulk resend confirmation — selected Expired candidates only. */}
        <ConfirmationDialog
          isOpen={showBulkResendConfirm}
          onClose={() => { if (!isBulkResending) setShowBulkResendConfirm(false); }}
          onConfirm={handleBulkResend}
          title="Resend invitations to selected candidates?"
          description={`A fresh interview link will be emailed to ${selectedIds.size} selected candidate${selectedIds.size === 1 ? '' : 's'}. Each candidate's previous link will stop working immediately.`}
          confirmText={isBulkResending ? 'Sending…' : `Yes, resend to ${selectedIds.size}`}
          cancelText="Cancel"
          variant="info"
        />

        {/* Footer — stacks on phones; First/Last drop out below sm. Nothing to
            count or page when nobody is invited, so embedded it goes too. */}
        {!(isUnstarted && embedded) && (
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-950 shrink-0">
          <p className="tf-body-muted text-center sm:text-left order-2 sm:order-1">
            {resultsLabel}
          </p>
          <div className="flex items-center justify-center sm:justify-end flex-wrap gap-1.5 sm:gap-2 order-1 sm:order-2">
            {totalPages > 1 && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="tf-card-desc whitespace-nowrap">Go to</span>
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
                    className="w-12 sm:w-14 h-8 px-1.5 sm:px-2 text-sm text-center border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className={pageBtn}>
                  Prev
                </button>
                <span className="px-1 sm:px-2 tf-card-desc whitespace-nowrap">
                  Page {page} of {totalPages}
                </span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className={pageBtn}>
                  Next
                </button>
              </>
            )}
            {!embedded && (
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
            )}
            {(onInviteMore || inviteMoreDeniedReason) && !embedded && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => { if (onInviteMore) onInviteMore(); }}
                disabled={jdDisabled}
                aria-disabled={!onInviteMore || undefined}
                className={!onInviteMore ? 'opacity-60 cursor-not-allowed' : undefined}
                title={jdDisabled ? JD_DISABLED_ACTION_MESSAGE : !onInviteMore ? inviteMoreDeniedReason : undefined}
                icon={<Send className="w-3.5 h-3.5" />}
              >
                Invite More
              </Button>
            )}
          </div>
        </div>
        )}
      </div>
  );

  const editEmailTrimmed = editForm.candidate_email.trim();
  const editEmailError =
    editEmailTrimmed.length > 0 && !isValidEmailFormat(editEmailTrimmed) ? EMAIL_FORMAT_ERROR : null;
  const editNameError =
    editForm.candidate_name.trim().length > 0 && !isValidCandidateName(editForm.candidate_name) ? NAME_FORMAT_ERROR : null;
  const handleSaveEdit = async () => {
    const inv = editTarget;
    if (!inv) return;
    const name = editForm.candidate_name.trim();
    const email = editForm.candidate_email.trim();
    if (!name || !email) { toast.error('Candidate name and email are required'); return; }
    if (!isValidCandidateName(name)) { toast.error(NAME_FORMAT_ERROR); return; }
    if (!isValidEmailFormat(email)) { toast.error(EMAIL_FORMAT_ERROR); return; }
    setSavingEdit(true);
    try {
      await aiInterviewService.updateInvitation(inv.id, { candidate_name: name, candidate_email: email });
      // Saving is the only way to reactivate a revoked invite, so it resends.
      try {
        await aiInterviewService.sendSessionEmail(inv.id, { base_url: window.location.origin });
        toast.success(`Invitation updated and sent to ${email}`);
      } catch (sendErr: any) {
        toast.error(friendlyErrorMessage(sendErr, 'Details saved, but the invitation could not be sent. Try Edit again.'));
      }
      await loadInvitations(true);
      await onChanged?.();
      setEditTarget(null);
    } catch (err: any) {
      toast.error(friendlyErrorMessage(err, "Couldn't update invitation. Please try again."));
    } finally {
      setSavingEdit(false);
    }
  };

  /* Edit invitation — only offered on REVOKED rows by the table. Same modal
     as the AI Interviews page's tracker. */
  const editModal = editTarget && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-md">
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
          <h3 className="tf-section-title">Edit Invitation</h3>
          <Button variant="secondary" size="sm" onClick={() => { if (!savingEdit) setEditTarget(null); }} aria-label="Close" className="px-2">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="px-5 sm:px-6 py-4 space-y-4">
          <p className="tf-body-muted">
            Update the candidate&apos;s details below. Saving will send them a fresh invitation link automatically.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Candidate name</label>
            <input
              type="text"
              value={editForm.candidate_name}
              onChange={(e) => setEditForm((f) => ({ ...f, candidate_name: e.target.value }))}
              aria-invalid={editNameError ? 'true' : undefined}
              className={`w-full px-3 py-2 text-sm border bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 ${
                editNameError
                  ? 'border-destructive focus:ring-destructive/30 focus:border-destructive'
                  : 'border-gray-200 dark:border-slate-700 focus:ring-brand-blue/30 focus:border-brand-blue'
              }`}
            />
            {editNameError && <p className="mt-1 tf-error">{editNameError}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Candidate email</label>
            <input
              type="email"
              value={editForm.candidate_email}
              onChange={(e) => setEditForm((f) => ({ ...f, candidate_email: e.target.value }))}
              aria-invalid={editEmailError ? 'true' : undefined}
              className={`w-full px-3 py-2 text-sm border bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 ${
                editEmailError
                  ? 'border-destructive focus:ring-destructive/30 focus:border-destructive'
                  : 'border-gray-200 dark:border-slate-700 focus:ring-brand-blue/30 focus:border-brand-blue'
              }`}
            />
            {editEmailError && <p className="mt-1 tf-error">{editEmailError}</p>}
          </div>
        </div>
        <div className="px-5 sm:px-6 py-4 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-end gap-2">
          <Button variant="secondary" size="md" onClick={() => setEditTarget(null)} disabled={savingEdit}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSaveEdit}
            disabled={savingEdit || !isValidCandidateName(editForm.candidate_name) || !isValidEmailFormat(editEmailTrimmed)}
            icon={savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
          >
            Save & Send
          </Button>
        </div>
      </div>
    </div>
  );

  if (embedded) return <>{panel}{editModal}</>;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 md:p-6">
      {/* Height is content-driven with a viewport cap, not a fixed dvh: a
          three-invite list on a large monitor used to stretch the dialog the full
          screen with empty space under the rows. The list absorbs the overflow
          once the cap engages, so a long list still scrolls inside the dialog on
          a 320px phone. */}
      {panel}
      {editModal}
    </div>
  );
}

/** Resend's "New link expiry" preview — same duration as the original
 *  invitation, anchored on the last send, as the AI Interviews tracker shows. */
function NewLinkExpiry({ inv }: { inv: any }) {
  const sentAnchor = inv.invitation_sent_at || inv.created_at;
  const createdMs = sentAnchor ? new Date(sentAnchor).getTime() : NaN;
  const expiresMs = inv.expires_at ? new Date(inv.expires_at).getTime() : NaN;
  let durationMs = 24 * 60 * 60 * 1000;
  if (Number.isFinite(createdMs) && Number.isFinite(expiresMs) && expiresMs > createdMs) {
    durationMs = expiresMs - createdMs;
  }
  const newExpiry = new Date(Date.now() + durationMs);
  const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
  let durationLabel: string;
  if (totalMinutes >= 60 * 24) {
    const days = Math.round(totalMinutes / (60 * 24));
    durationLabel = days === 1 ? '1 day' : `${days} days`;
  } else if (totalMinutes >= 60) {
    const hours = Math.round(totalMinutes / 60);
    durationLabel = hours === 1 ? '1 hour' : `${hours} hours`;
  } else {
    durationLabel = `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  }
  return (
    <div className="bg-brand-orange/10 border border-brand-orange/20 ring-1 ring-brand-orange/10 rounded-xl p-3 text-sm">
      <p className="text-brand-orange-deep font-medium mb-1">New link expiry</p>
      <p className="text-brand-orange-deep">
        Valid for <strong>{durationLabel}</strong> from now — expires on{' '}
        <strong>{formatIST(newExpiry.toISOString())}</strong>.
      </p>
      <p className="text-brand-orange-deep/80 text-xs mt-2">
        Same duration as the original invitation.
      </p>
    </div>
  );
}

