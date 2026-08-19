'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Users, Mail, Play, CheckCircle, Ban, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import InviteFilterBar, {
  EMPTY_INVITE_FILTERS,
  AI_INTERVIEW_INVITE_STATUS_OPTIONS,
  hasActiveInviteFilters,
  type InviteFilterState,
} from '@/components/InviteFilterBar';
import InviteStatCards, { INVITE_CARD_TONES } from '@/components/InviteStatCards';
import AIInterviewInviteTable from '@/components/AIInterviewInviteTable';

interface AIInterviewTrackInvitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Published AI interview config whose invitations are being tracked. */
  configId: string;
  jdTitle: string;
}

const PAGE_SIZE = 10;

/**
 * Invite tracking for a job's AI interview, opened from the Job Details page.
 *
 * Read-only by design: this answers "who was invited and how far did they get" —
 * resend/revoke/edit live on the AI Interviews page, and scores and transcripts
 * live in the AI Interview Result tab. It passes no action callbacks to
 * <AIInterviewInviteTable>, which is the same list the AI Interviews page renders
 * with its full action set, so the two show identical columns and wording.
 */
export default function AIInterviewTrackInvitesModal({
  isOpen,
  onClose,
  configId,
  jdTitle,
}: AIInterviewTrackInvitesModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  /* Same filter contract the AI Interviews page's tracker uses. The endpoint
     already accepted search/status/date — this tracker just never passed them,
     so it always showed the unfiltered first page. */
  const [filters, setFilters] = useState<InviteFilterState>(EMPTY_INVITE_FILTERS);
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
  });
  const refreshRef = useRef<NodeJS.Timeout | null>(null);

  const loadInvitations = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      /* Three page_size-1-or-N calls in parallel: the filtered page itself, the
         unfiltered overview, and the invited bucket. The list endpoint reports
         completed/in_progress/terminated/cancelled but not `invited`, and
         deriving it as "total minus the rest" would leave that card disagreeing
         with the rows it filters to — the remainder also holds revoked, expired
         and system_check sessions. */
      const [result, summary, invitedOnly] = await Promise.all([
        aiInterviewService.getConfigInvitations(configId, {
          search: filters.search.trim() || undefined,
          status: filters.status !== 'all' ? filters.status : undefined,
          invite_date_from: filters.dateFrom || undefined,
          invite_date_to: filters.dateTo || undefined,
          page,
          page_size: PAGE_SIZE,
        }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1 }),
        aiInterviewService.getConfigInvitations(configId, { page: 1, page_size: 1, status: 'invited' }),
      ]);

      setInvitations(result.items || []);
      setFilteredTotal(result.total || 0);
      setTotalPages(Math.max(1, result.total_pages || 1));
      setOverview({
        total: summary.total || 0,
        invited: invitedOnly.total || 0,
        completed: summary.completed || 0,
        inProgress: summary.in_progress || 0,
        terminated: summary.terminated || 0,
        cancelled: summary.cancelled || 0,
      });

      /* Filtering can empty the page you were on — drop back rather than showing
         "no candidates" over a list that still has results. */
      if ((result.items || []).length === 0 && (result.total || 0) > 0 && page > 1) {
        setPage(current => Math.min(current - 1, Math.max(1, result.total_pages || 1)));
      }
    } catch (error) {
      console.error('Failed to load AI interview invitations:', error);
      if (!silent) toast.error('Could not load invitations. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [configId, page, filters]);

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

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4 md:p-6">
      {/* Height is content-driven with a viewport cap, not a fixed dvh: a
          three-invite list on a large monitor used to stretch the dialog the full
          screen with empty space under the rows. The list absorbs the overflow
          once the cap engages, so a long list still scrolls inside the dialog on
          a 320px phone. */}
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-brand-blue/10 sm:border sm:border-gray-100 dark:sm:border-slate-700/60 sm:ring-1 sm:ring-black/[0.02] dark:sm:ring-white/[0.02] w-full sm:max-w-2xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 truncate tracking-tight">
                  <span className="hidden sm:inline">Invite Status Tracking</span>
                  <span className="sm:hidden">Invite Status</span>
                </h2>
                <p className="text-[10px] sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 truncate">{jdTitle}</p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

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
            { key: 'terminated', label: 'Terminated', Icon: Ban, value: overview.terminated, ...INVITE_CARD_TONES.red },
            { key: 'cancelled', label: 'Cancelled', Icon: X, value: overview.cancelled, ...INVITE_CARD_TONES.red },
            { key: 'completion-rate', label: 'Completion', Icon: TrendingUp, value: `${completionRate}%`, filterable: false, ...INVITE_CARD_TONES.cyan },
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
        />

        {/* Candidate list. overflow-hidden, not overflow-auto: the table shell (or
            the mobile card stack) inside is the single vertical scroller. */}
        <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-hidden flex-1 min-h-0 flex flex-col">
          <AIInterviewInviteTable
            invitations={invitations}
            isLoading={isLoading}
            hasActiveFilters={filtersActive}
            emptyHint="Use Send Invite to invite candidates to this job's AI interview."
          />
        </div>

        {/* Footer — stacks on phones; First/Last drop out below sm. */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-950 shrink-0">
          <p className="text-[11px] sm:text-sm text-gray-500 dark:text-slate-500 text-center sm:text-left order-2 sm:order-1">
            {resultsLabel}
          </p>
          <div className="flex items-center justify-center sm:justify-end flex-wrap gap-1.5 sm:gap-2 order-1 sm:order-2">
            {totalPages > 1 && (
              <>
                <button onClick={() => setPage(1)} disabled={page === 1} className={`hidden sm:inline-flex ${pageBtn}`}>
                  First
                </button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className={pageBtn}>
                  Prev
                </button>
                <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                  Page {page} of {totalPages}
                </span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className={pageBtn}>
                  Next
                </button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className={`hidden sm:inline-flex ${pageBtn}`}>
                  Last
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
