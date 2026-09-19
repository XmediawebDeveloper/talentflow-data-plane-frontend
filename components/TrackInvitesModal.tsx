'use client';

import { X, Users, Mail, Play, CheckCircle, Clock, Eye, TrendingUp, RefreshCw, Loader2, Monitor, Ban } from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/services/api';
import { formatIST } from '@/lib/utils/dateUtils';
import InviteFilterBar, {
  EMPTY_INVITE_FILTERS,
  ASSESSMENT_INVITE_STATUS_OPTIONS,
  hasActiveInviteFilters,
  type InviteFilterState,
} from '@/components/InviteFilterBar';
import InviteStatCards, { INVITE_CARD_TONES } from '@/components/InviteStatCards';
import { TRACKER_DIALOG_PANEL_CLASS, TRACKER_DIALOG_PLACEHOLDER_CLASS } from '@/lib/constants/trackerDialog';
import { assessmentService } from '@/lib/services/assessmentService';
import {
  resolveInviteStatus,
  isInviteExpired,
  timelineEvents,
  buildInvitationRowActions,
  InvitationActionsMenu,
  InvitationActionButtons,
  ViewFullHistoryLink,
  InvitationHistoryDialog,
} from '@/components/AssessmentInviteActions';

/* This popup is deliberately READ-ONLY beyond Resend/Copy Link, matching the
   AI Interview module's Job-Details tracker: Edit (name+email, revoked-only)
   and Revoke live only on the main Assessments page's Track Invites popup.
   Fixing a bad address (Edit Email / Change Email) moved there too — this
   surface is for tracking, not correcting invitations. */

interface TrackInvitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  jdId: string;
  jdTitle: string;
  /** Lets the host open a candidate's result without leaving its page (Job
   *  Details renders the detail view inline). Falls back to navigating to the
   *  standalone results-details route when not supplied. */
  onViewResult?: (invitation: any) => void;
}


const INVITES_PAGE_SIZE = 10;

// Effective status + expiry + timeline milestones now live in
// AssessmentInviteActions (resolveInviteStatus / isInviteExpired /
// timelineEvents) so this surface can't drift from the other two.
const getEffectiveStatus = resolveInviteStatus;

export default function TrackInvitesModal({ isOpen, onClose, jdId, jdTitle, onViewResult }: TrackInvitesModalProps) {
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
    expired: 0,
    started: 0,
    completed: 0,
    failed: 0,
    terminated: 0,
  });
  // Email editing state
  /* Filters run over the merged list rather than being pushed to the API.
     Unlike the per-assessment tracker on the Assessments page, this popup
     aggregates every assessment attached to the JD, and the stat cards are
     computed from that whole set — filtering server-side would silently
     narrow the totals too. */
  const [filters, setFilters] = useState<InviteFilterState>(EMPTY_INVITE_FILTERS);
  const [page, setPage] = useState(1);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<any | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen && jdId) {
      loadInvitations();
      // Auto-refresh every 15s so pixel-fired status updates are reflected automatically
      refreshIntervalRef.current = setInterval(() => {
        loadInvitations(true); // silent = don't show spinner
      }, 15000);
    }
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [isOpen, jdId]);

  const loadInvitations = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      // Fetch all assessments for this JD
      const assessmentsResponse = await api.get('/assessments', {
        params: { jd_id: jdId, page_size: 100 }
      });

      if (!assessmentsResponse.data?.items || assessmentsResponse.data.items.length === 0) {
        setInvitations([]);
        setStats({ total: 0, expired: 0, started: 0, completed: 0, failed: 0, terminated: 0 });
        setIsLoading(false);
        return;
      }

      // Fetch invitations for all assessments
      const allInvitations: any[] = [];
      for (const assessment of assessmentsResponse.data.items) {
        try {
          const invitationsResponse = await api.get(`/assessments/${assessment.id}/invitations`, {
            params: { page_size: 100 }
          });
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
              assessment_technical_enabled: assessment.technical_enabled,
              assessment_coding_enabled: assessment.coding_enabled,
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
      const newStats = {
        total: allInvitations.length,
        expired: allInvitations.filter(inv => _bucket(inv) === 'expired').length,
        started: allInvitations.filter(inv => _bucket(inv) === 'started').length,
        completed: allInvitations.filter(inv => _bucket(inv) === 'completed').length,
        failed: allInvitations.filter(inv => _bucket(inv) === 'failed').length,
        terminated: allInvitations.filter(inv => _bucket(inv) === 'terminated').length,
      };

      setInvitations(allInvitations);
      setStats(newStats);
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
    } catch (error) {
      console.error('Failed to resend invitation:', error);
    } finally {
      setResendingId(null);
    }
  };

  const filtersActive = hasActiveInviteFilters(filters);

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

      if (filters.status !== 'all' && getEffectiveStatus(inv) !== filters.status) return false;

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
  }, [invitations, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredInvitations.length / INVITES_PAGE_SIZE));
  // Clamped rather than stored: the list refreshes every 15s and a filter can
  // shrink it under the current page at any moment.
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * INVITES_PAGE_SIZE;
  const visibleInvitations = filteredInvitations.slice(pageStart, pageStart + INVITES_PAGE_SIZE);

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
    'px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm border border-gray-200 dark:border-slate-700 ' +
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
    const base = "inline-flex items-center gap-1 px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap flex-shrink-0 ring-1";
    if (effective === 'completed') {
      return <span className={`${base} bg-brand-blue/10 text-brand-blue ring-brand-blue/20`}><CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Completed</span>;
    }
    if (effective === 'failed') {
      return <span className={`${base} bg-red-50 text-red-600 ring-red-200`}><X className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Invite Failed</span>;
    }
    if (effective === 'bounced') {
      return <span className={`${base} bg-red-50 text-red-600 ring-red-200`}><RefreshCw className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Bounced</span>;
    }
    if (effective === 'revoked') {
      return <span className={`${base} bg-red-50 text-red-600 ring-red-200`}><Ban className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Revoked</span>;
    }
    if (effective === 'expired') {
      return <span className={`${base} bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20`}><Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Expired</span>;
    }
    if (effective === 'abandoned') {
      return <span className={`${base} bg-red-50 text-red-600 ring-red-200`} title="Ended before completion — the candidate left the assessment"><Ban className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Terminated</span>;
    }
    if (effective === 'started') {
      return <span className={`${base} bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20`}><Play className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> In Progress</span>;
    }
    if (effective === 'opened') {
      return <span className={`${base} bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20`} title="Consent accepted — the candidate is on the system check step"><Monitor className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> System Check</span>;
    }
    if (inv.email_read_at) {
      return <span className={`${base} bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20`}><Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Read</span>;
    }
    if (effective === 'sent') {
      return <span className={`${base} bg-brand-blue/10 text-brand-blue ring-brand-blue/20`}><Mail className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Invited</span>;
    }
    return <span className={`${base} bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-gray-200 dark:ring-slate-700`}><Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Pending</span>;
  };

  // timelineEvents / isInviteExpired now come from AssessmentInviteActions.
  const isInvExpired = isInviteExpired;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4 md:p-6">
      {/* Height is content-driven with a viewport cap, not a fixed dvh, so a
          short list no longer stretches the dialog down a large monitor. */}
      <div className={TRACKER_DIALOG_PANEL_CLASS}>
        {/* Modal Header */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between flex-shrink-0 bg-slate-50 dark:bg-slate-950">
          <div className="min-w-0 flex-1 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 truncate">
                <span className="hidden sm:inline">Invite Status Tracking</span>
                <span className="sm:hidden">Invite Status</span>
              </h2>
              <p className="text-[10px] sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 truncate">{jdTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors flex-shrink-0 ml-2"
           aria-label="Close">
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Stat row doubles as the status filter — identical buckets, wording and
            behaviour to the Assessments page popup. Filtering here is client-side
            over the loaded list, and getEffectiveStatus returns exactly these
            keys, so a card and its rows always agree. */}
        <InviteStatCards
          gridClassName="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1 sm:gap-2 lg:gap-3"
          activeStatus={filters.status}
          onSelect={(status) => {
            setFilters({ ...filters, status });
            setPage(1);
          }}
          cards={[
            { key: 'all', label: 'Total Invited', Icon: Users, value: stats.total, ...INVITE_CARD_TONES.blue },
            { key: 'expired', label: 'Invite Expired', Icon: Clock, value: stats.expired, ...INVITE_CARD_TONES.orange },
            { key: 'failed', label: 'Invite Failed', Icon: X, value: stats.failed, ...INVITE_CARD_TONES.red },
            { key: 'started', label: 'In Progress', Icon: Play, value: stats.started, ...INVITE_CARD_TONES.cyan },
            { key: 'completed', label: 'Completed', Icon: CheckCircle, value: stats.completed, ...INVITE_CARD_TONES.blue },
            /* Keyed on 'abandoned' — the raw status getEffectiveStatus reports —
               even though the count above buckets it as 'terminated'. The filter
               below compares against the raw value. */
            { key: 'abandoned', label: 'Terminated', Icon: Ban, value: stats.terminated, ...INVITE_CARD_TONES.red },
            /* Terminated — candidate walked out mid-assessment; getEffectiveStatus
               returns 'abandoned' for exactly these rows, so the card and the
               table it filters to always agree. */
            { key: 'abandoned', label: 'Terminated', Icon: Ban, value: stats.terminated, ...INVITE_CARD_TONES.red },
            {
              key: 'completion-rate',
              label: 'Completion Rate',
              Icon: TrendingUp,
              value: `${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%`,
              filterable: false,
              ...INVITE_CARD_TONES.blue,
            },
          ]}
        />

        <InviteFilterBar
          filters={filters}
          onChange={(nextFilters) => {
            setFilters(nextFilters);
            // A narrowed list has its own page 1; staying on page 4 would look empty.
            setPage(1);
          }}
          statusOptions={ASSESSMENT_INVITE_STATUS_OPTIONS}
          searchPlaceholder="Search by candidate name, email, or CID..."
        />

        {!isLoading && invitations.length > 0 && (
          <div className="px-2.5 sm:px-6 pt-2.5 sm:pt-3 flex-shrink-0">
            <p className="text-[11px] sm:text-xs text-gray-500 dark:text-slate-500">{resultsLabel}</p>
          </div>
        )}

        {/* Invitations Table / Cards */}
        <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-hidden flex-1 min-h-0 flex flex-col">
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
              <p className="text-xs sm:text-sm">
                {filtersActive
                  ? 'No invitations match the current filters.'
                  : "No invitations found for this job's assessments."}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden space-y-2 flex-1 min-h-0 overflow-y-auto">
                {visibleInvitations.map((invitation: any) => {
                  const initials = invitation.candidate_name
                    ?.split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2) || '??';

                  return (
                    <div key={invitation.id} className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-2.5">
                      {/* Candidate row */}
                      <div className="flex items-center gap-2 min-w-0 mb-1.5">
                        <div className="w-7 h-7 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center text-brand-blue font-medium text-[10px] flex-shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 dark:text-slate-50 text-xs truncate">{invitation.candidate_name}</p>
                          <p className="text-[10px] text-gray-500 dark:text-slate-500 truncate break-all">{invitation.candidate_email}</p>
                        </div>
                        {getStatusBadge(invitation)}
                      </div>

                      {/* CID + Assessment + the secondary Expired flag the
                          desktop table shows next to the status badge. */}
                      <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
                        <span className="text-[9px] font-mono font-medium text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/15 px-1 py-0.5 rounded flex-shrink-0">
                          {invitation.candidate_display_id || '-'}
                        </span>
                        <span className="text-[10px] text-gray-600 dark:text-slate-400 truncate flex-1">{invitation.assessment_title}</span>
                        {isInvExpired(invitation) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium ring-1 bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20 whitespace-nowrap flex-shrink-0">
                            <Clock className="w-2.5 h-2.5" /> Expired
                          </span>
                        )}
                      </div>

                      {invitation.status === 'failed' && (
                        <p className="text-[10px] text-red-600 mb-1.5">Incorrect Email</p>
                      )}

                      {/* Timeline — a two-column grid rather than a free wrap,
                          so the entries line up instead of staggering by the
                          width of whichever label came before them. */}
                      <div className="text-[10px] text-gray-500 dark:text-slate-500 grid grid-cols-2 gap-x-3 gap-y-0.5 mb-1">
                        {timelineEvents(invitation).map(({ label, at, Icon, tone }, i) => (
                          <div key={`${label}-${i}`} className="flex items-center gap-1 min-w-0">
                            <Icon className={`w-2.5 h-2.5 flex-shrink-0 ${tone}`} />
                            <span className="truncate">{label}: {formatIST(at)}</span>
                          </div>
                        ))}
                      </div>
                      <ViewFullHistoryLink compact onClick={() => setHistoryTarget(invitation)} />

                      {/* Progress + Actions */}
                      <div className="pt-1.5 border-t border-gray-100 dark:border-slate-700/60">
                        {/* Score/Progress row */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            {getEffectiveStatus(invitation) === 'completed' ? (
                              <div className="flex items-center gap-1 text-[10px]">
                                <span className="text-gray-600 dark:text-slate-400">Score:</span>
                                <span className={`font-medium ${invitation.passed ? 'text-brand-blue' : 'text-red-600'}`}>
                                  {invitation.overall_score != null ? `${Math.round(invitation.overall_score)}%` : 'N/A'}
                                </span>
                                {invitation.passed !== null && (
                                  <span className={`text-[9px] px-1 py-0.5 rounded ring-1 ${invitation.passed ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-red-50 text-red-600 ring-red-200'}`}>
                                    {invitation.passed ? 'Pass' : 'Fail'}
                                  </span>
                                )}
                              </div>
                            ) : getEffectiveStatus(invitation) === 'started' ? (
                              <div className="flex items-center gap-1 text-[10px]">
                                <span className="text-gray-600 dark:text-slate-400">Progress:</span>
                                <span className="font-medium text-brand-orange-deep">
                                  {invitation.progress_percent != null ? `${invitation.progress_percent}%` : 'In Progress'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400 dark:text-slate-500">—</span>
                            )}
                          </div>
                          {getEffectiveStatus(invitation) === 'completed' && invitation.attempt_id && (
                            <button
                              onClick={() => openResult(invitation)}
                              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-brand-blue hover:bg-brand-blue/5 rounded transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              View
                            </button>
                          )}
                        </div>
                        <InvitationActionButtons
                          actions={buildInvitationRowActions(invitation, {
                            onResend: handleResendInvitation,
                            resendingId,
                          })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View — Tech / Coding columns only render
                  when at least one row in the JD's invitations belongs to
                  an assessment that has that round enabled. Same rule as
                  the Results page: no all-empty columns. */}
              <div className="hidden sm:block tf-table-shell tf-table-shell--compact tf-table-shell--fill flex-1 min-h-0">
                {/* Auto layout, not table-fixed. The fixed column widths
                    summed well past the table's min-width, so every column
                    was scaled down and the Actions cell wrapped its two
                    buttons onto a second line. Columns now size to their
                    content, which cannot wrap, and the shell scrolls
                    horizontally instead. */}
                <table className="w-max min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700">
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">CID</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Candidate</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Assessment</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Timeline</th>
                      {invitations.some(inv => inv.assessment_technical_enabled) && (
                        <th className="text-center py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Tech Score</th>
                      )}
                      {invitations.some(inv => inv.assessment_coding_enabled) && (
                        <th className="text-center py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Coding Score</th>
                      )}
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap tf-sticky-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                    {visibleInvitations.map((invitation: any) => {
                      const initials = invitation.candidate_name
                        ?.split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2) || '??';

                      return (
                        <tr key={invitation.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                          <td className="py-3 px-3 lg:px-4 align-middle whitespace-nowrap">
                            <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-2 py-1 rounded whitespace-nowrap">
                              {invitation.candidate_display_id || '-'}
                            </span>
                          </td>
                          <td className="py-3 px-3 lg:px-4 align-middle whitespace-nowrap">
                            <div className="flex items-center gap-2 lg:gap-3">
                              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-medium text-xs lg:text-sm flex-shrink-0">
                                {initials}
                              </div>
                              {/* Capped rather than free: with auto layout a single
                                  long email would otherwise set the column width. */}
                              <div className="min-w-0 max-w-[220px]">
                                <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={invitation.candidate_name}>{invitation.candidate_name}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={invitation.candidate_email}>{invitation.candidate_email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 lg:px-4 align-middle whitespace-nowrap">
                            <p className="text-sm text-gray-700 dark:text-slate-300 truncate max-w-[200px]" title={invitation.assessment_title}>{invitation.assessment_title}</p>
                          </td>
                          <td className="py-3 px-3 lg:px-4 align-middle whitespace-nowrap">
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
                          {/* Every milestone on its own line, oldest first, the
                              way the Assessments page's Invite Status Tracking
                              table shows it. This used to print only the newest
                              with a "+N" counter, which hid the progression
                              behind a tooltip. align-top so the first line sits
                              level with the other columns' single line. */}
                          <td className="py-3 px-3 lg:px-4 align-top text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap">
                            {(() => {
                              const events = timelineEvents(invitation);
                              return (
                                <>
                                  {events.length === 0 ? (
                                    <span className="text-gray-400 dark:text-slate-500">—</span>
                                  ) : (
                                    <div className="space-y-1">
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
                                  <ViewFullHistoryLink onClick={() => setHistoryTarget(invitation)} />
                                </>
                              );
                            })()}
                          </td>
                          {/* Tech Score column body — render the cell only
                              when *some* row has tech enabled (column header
                              is gated identically). For a row whose source
                              assessment doesn't have tech, render '—'. */}
                          {invitations.some(inv => inv.assessment_technical_enabled) && (
                            <td className="py-3 px-3 lg:px-4 align-middle text-sm text-center whitespace-nowrap">
                              {(() => {
                                if (!invitation.assessment_technical_enabled) return <span className="text-gray-400 dark:text-slate-500">—</span>;
                                const ready =
                                  invitation.technical_score != null
                                  && invitation.scoring_status !== 'processing'
                                  && invitation.scoring_status !== 'pending';
                                if (!ready) return <span className="text-gray-400 dark:text-slate-500">—</span>;
                                const v = invitation.technical_score;
                                return (
                                  <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                    <span className={`font-medium ${v >= 70 ? 'text-brand-blue' : 'text-red-600'}`}>
                                      {Math.round(v)}%
                                    </span>
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${v >= 70 ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-red-50 text-red-600 ring-red-200'}`}>
                                      {v >= 70 ? 'Pass' : 'Fail'}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                          )}
                          {invitations.some(inv => inv.assessment_coding_enabled) && (
                            <td className="py-3 px-3 lg:px-4 align-middle text-sm text-center whitespace-nowrap">
                              {(() => {
                                if (!invitation.assessment_coding_enabled) return <span className="text-gray-400 dark:text-slate-500">—</span>;
                                const ready =
                                  invitation.coding_score != null
                                  && invitation.scoring_status !== 'processing'
                                  && invitation.scoring_status !== 'pending';
                                if (!ready) return <span className="text-gray-400 dark:text-slate-500">—</span>;
                                const v = invitation.coding_score;
                                return (
                                  <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                    <span className={`font-medium ${v >= 70 ? 'text-brand-blue' : 'text-red-600'}`}>
                                      {Math.round(v)}%
                                    </span>
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${v >= 70 ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-red-50 text-red-600 ring-red-200'}`}>
                                      {v >= 70 ? 'Pass' : 'Fail'}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                          )}
                          <td className="py-3 px-3 lg:px-4 align-middle whitespace-nowrap tf-sticky-col">
                            <InvitationActionsMenu
                              actions={buildInvitationRowActions(invitation, {
                                onResend: handleResendInvitation,
                                resendingId,
                                onViewResult: openResult,
                              })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        {/* Footer — stacks on phones; First/Last drop out below sm, matching the
            Assessments and AI Interviews trackers. */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-950 shrink-0">
          <p className="text-[11px] sm:text-sm text-gray-500 dark:text-slate-500 text-center sm:text-left order-2 sm:order-1">
            {/* The filtered count, not the raw total — the number has to agree
                with the rows actually on screen. */}
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
                <button onClick={() => setPage(() => Math.max(1, currentPage - 1))} disabled={currentPage === 1} className={pageBtn}>
                  Prev
                </button>
                <span className="px-1 sm:px-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                  Page {currentPage} of {totalPages}
                </span>
                <button onClick={() => setPage(() => Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className={pageBtn}>
                  Next
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

      <InvitationHistoryDialog
        target={historyTarget}
        onClose={() => setHistoryTarget(null)}
        getAssessmentId={(inv) => inv.assessment_id}
      />
    </div>
  );
}
