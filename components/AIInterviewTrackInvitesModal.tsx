'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Users, Mail, Play, Square, CheckSquare, CheckCircle, Clock, Ban, TrendingUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { interviewVersionOrdinal } from '@/lib/utils/aiInterviewVersion';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { INVITE_SOURCE_FILTER_OPTIONS, RESULT_FILTER_OPTIONS } from '@/components/ai-interview/ColumnFilterFields';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
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
import AIInterviewInviteTable, {
  isExpiredForActions,
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
}

const PAGE_SIZE = 10;

/**
 * Invite tracking for a job's AI interview, opened from the Job Details page.
 *
 * Follows the same per-status action rules as the assessment Track Invite
 * popup: Invited → Copy Link only (no manual resend once sent), Expired →
 * Resend, System Check / In Progress → no action, Completed → View Result
 * only. Edit and Revoke stay on the AI Interviews page — those callbacks are
 * deliberately not passed to <AIInterviewInviteTable> (the same list the AI
 * Interviews page renders), so omitting them simply drops those menu items
 * here.
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
  onViewResult,
  embedded = false,
}: AIInterviewTrackInvitesModalProps) {
  const [isLoading, setIsLoading] = useState(true);

  /* Job / interview version for the two version columns. Taken from the host
     when it knows them; otherwise derived here from the config list — the
     interview version is this config's place among its job version's
     configs, which only the full list can say. */
  const [lookedUpVersions, setLookedUpVersions] = useState<{ job: number; interview: number } | null>(null);
  const needsVersionLookup = !hideVersionDetails && (jobVersionProp == null || interviewVersionProp == null);
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
  const [filters, setFilters] = useState<InviteFilterState>(EMPTY_INVITE_FILTERS);
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
  const refreshRef = useRef<NodeJS.Timeout | null>(null);
  // Resend flow — confirm first (the old link stops working), then send.
  const [resendTarget, setResendTarget] = useState<any | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  /* Bulk selection — same control and semantics as the assessment tracker's
     Select All bar: only bulk-resendable rows (Expired) are selectable,
     scoped to the rows on the CURRENT page. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkResendConfirm, setShowBulkResendConfirm] = useState(false);
  const [isBulkResending, setIsBulkResending] = useState(false);
  /* Selection follows the selected card: only the Expired card has a bulk
     action here (Resend), so only it shows the checkboxes and Select All.
     Revoke is not offered in this tracker at all — see the component note. */
  const bulkResendMode = filters.status === 'expired';
  const selectableIds = bulkResendMode ? invitations.filter(isBulkResendable).map((inv: any) => inv.id) : [];
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
     eligible — drop those so the bulk button's count always matches what a
     resend would actually do. */
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(invitations.filter(isBulkResendable).map((inv: any) => inv.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [invitations]);

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
  };

  const loadInvitations = useCallback(async (silent = false) => {
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
      console.error('Failed to load AI interview invitations:', error);
      if (!silent) toast.error('Could not load invitations. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [configId, page, filters, sourceFilter, resultFilter, fetchAllForClientFilters]);

  // Same 15s silent refresh the assessment tracker uses — candidates move through
  // an interview while the recruiter watches this list.
  useEffect(() => {
    if (!isOpen || !configId) return;
    loadInvitations();
    refreshRef.current = setInterval(() => loadInvitations(true), 15000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [isOpen, configId, loadInvitations]);

  if (!isOpen) return null;

  const filtersActive = hasActiveInviteFilters(filters);
  const completionRate = overview.total > 0 ? Math.round((overview.completed / overview.total) * 100) : 0;
  const startIndex = filteredTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, filteredTotal);
  const resultsLabel = filtersActive
    ? `${filteredTotal} matching candidate${filteredTotal === 1 ? '' : 's'}`
    : `Showing ${startIndex} to ${endIndex} of ${filteredTotal} invites`;

  const pageBtn =
    'px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm border border-gray-200 dark:border-slate-700 ' +
    'bg-white dark:bg-slate-900 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ' +
    'hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors';

  /* Nobody invited yet (the unfiltered total is 0): like the Results tab, the
     shared empty state stands alone — no zeroed stat cards, filter bar,
     completion badge, empty table or pager. */
  const isUnstarted = !isLoading && overview.total === 0;

  const panel = (
      <div className={embedded
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
                <h2 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 truncate tracking-tight">
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
                {/* JD ID, then the job title. */}
                <p className="flex items-center gap-2 text-2xs sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 min-w-0">
                  {jdShortId && <JobIdBadge className="flex-shrink-0">{jdShortId}</JobIdBadge>}
                  <span className="truncate">{jdTitle}</span>
                </p>
              </div>
            </div>
          </div>
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
            ...(hideVersionDetails ? [] : [{
              key: 'job-version', ariaLabel: 'Job Version', anyLabel: 'All Job Versions', value: jobVersionFilter,
              options: jobVersion != null ? [{ value: String(jobVersion), label: `Job V${jobVersion}` }] : [],
              onChange: setJobVersionFilter,
            },
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

        {/* Select All — same control, wording and placement as the assessment
            tracker's bulk-select bar. Only Expired rows count. The
            completion-rate badge (previously its own card in the stat row
            above) sits on this same row, straight across from Select All. */}
        {!isLoading && (
          <div className="flex items-center justify-between gap-2 px-2.5 sm:px-6 pt-2.5 sm:pt-3 flex-shrink-0">
            {selectableIds.length > 0 ? (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue transition-colors"
              >
                <span role="checkbox" aria-checked={allSelected} className="p-1 flex-shrink-0">
                  {allSelected ? (
                    <CheckSquare className="w-4 h-4 text-brand-blue" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </span>
                Select All ({selectableIds.length})
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              {/* Bulk Resend — appears once something is ticked. */}
              {bulkResendMode && selectedIds.size > 0 && (
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
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                <TrendingUp className="w-3.5 h-3.5" />
                {completionRate}% Completion
              </span>
            </div>
          </div>
        )}

        {/* Candidate list. overflow-hidden, not overflow-auto: the table shell (or
            the mobile card stack) inside is the single vertical scroller. */}
        <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-hidden flex-1 min-h-0 flex flex-col">
          {/* Same action rules as the assessment tracker: the table offers
              Resend on Expired only, View Details on Completed, and nothing
              once the candidate is in the interview flow (System Check / In
              Progress) or once sent (Invited gets Copy Link only). Edit and
              Revoke are not passed, so they never appear here. */}
          <AIInterviewInviteTable
            invitations={invitations}
            isLoading={isLoading}
            hasActiveFilters={filtersActive}
            emptyHint="Use Send Invite to invite candidates to this job's AI interview."
            jobVersion={jobVersion}
            interviewVersion={interviewVersion}
            onResend={(inv) => setResendTarget(inv)}
            resendingId={resendingId}
            onViewDetails={onViewResult}
            selectedIds={bulkResendMode ? selectedIds : undefined}
            onToggleSelect={bulkResendMode ? toggleSelectOne : undefined}
            // Bulk-resend gating (Expired only), not the AI Interviews
            // page's revocable-only default.
            isSelectable={isBulkResendable}
          />
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
          <p className="text-2xs sm:text-sm text-gray-500 dark:text-slate-500 text-center sm:text-left order-2 sm:order-1">
            {resultsLabel}
          </p>
          <div className="flex items-center justify-center sm:justify-end flex-wrap gap-1.5 sm:gap-2 order-1 sm:order-2">
            {totalPages > 1 && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">Go to</span>
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
                    className="w-12 sm:w-14 h-8 px-1.5 sm:px-2 text-xs sm:text-sm text-center border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className={pageBtn}>
                  Prev
                </button>
                <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                  Page {page} of {totalPages}
                </span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className={pageBtn}>
                  Next
                </button>
              </>
            )}
          </div>
        </div>
        )}
      </div>
  );

  if (embedded) return panel;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 md:p-6">
      {/* Height is content-driven with a viewport cap, not a fixed dvh: a
          three-invite list on a large monitor used to stretch the dialog the full
          screen with empty space under the rows. The list absorbs the overflow
          once the cap engages, so a long list still scrolls inside the dialog on
          a 320px phone. */}
      {panel}
    </div>
  );
}
