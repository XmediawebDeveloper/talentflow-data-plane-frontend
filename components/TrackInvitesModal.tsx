'use client';

import { X, Users, Mail, Play, CheckCircle, Clock, Eye, TrendingUp, RefreshCw, Pencil, Send, Loader2, Monitor, Ban } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/services/api';
import { toast } from 'sonner';
import { formatIST } from '@/lib/utils/dateUtils';

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


const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

// Derive effective status using both the status field and timestamp signals as fallback.
// This guards against stale/null status fields in the API response.
const getEffectiveStatus = (inv: any): string => {
  const s = inv.status?.toLowerCase();
  if (s === 'completed' || inv.completed_at) return 'completed';
  if (s === 'failed') return 'failed';
  if (s === 'expired') return 'expired';
  if (s === 'abandoned') return 'abandoned';
  if (s === 'bounced' || inv.bounced_at) return 'bounced';
  if (s === 'started' || inv.started_at) return 'started';
  if (s === 'opened' || inv.opened_at) return 'opened';
  if (s === 'sent' || inv.sent_at) return 'sent';
  return 'pending';
};

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
  });
  // Email editing state
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [newEmailValue, setNewEmailValue] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
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
        setStats({ total: 0, expired: 0, started: 0, completed: 0, failed: 0 });
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
      const _bucket = (inv: any): 'completed' | 'failed' | 'expired' | 'started' | 'sent' => {
        const s = (inv.status || '').toLowerCase();
        if (s === 'completed' || inv.completed_at) return 'completed';
        if (['failed', 'bounced', 'abandoned'].includes(s)) return 'failed';
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
      await api.post(`/assessments/${invitation.assessment_id}/invitations/${invitation.id}/resend`);
      await loadInvitations(true);
    } catch (error) {
      console.error('Failed to resend invitation:', error);
    } finally {
      setResendingId(null);
    }
  };

  const handleUpdateEmail = async (invitation: any) => {
    if (!isValidEmail(newEmailValue)) return;
    setIsSendingEmail(true);
    try {
      await api.patch(
        `/assessments/${invitation.assessment_id}/invitations/${invitation.id}/update-email`,
        { new_email: newEmailValue.trim() }
      );
      setEditingEmailId(null);
      setNewEmailValue('');
      toast.success('Email updated — previous link deactivated and a new invitation sent.');
      await loadInvitations(true);
    } catch (error: any) {
      console.error('Failed to update email:', error);
      // Surface the backend validation (e.g. "already invited to this assessment").
      const msg =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.message ||
        (typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : null) ||
        'Failed to update email. Please try again.';
      toast.error(msg);
    } finally {
      setIsSendingEmail(false);
    }
  };

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

  // Timeline milestones, oldest first. The table shows only the latest one so
  // every row stays a single line — the rest ride along in the hover title,
  // with a "+N" hint that there's more. Without this the column stretched some
  // rows to five lines while their neighbours had one, and nothing lined up.
  const timelineEvents = (inv: any) => {
    const out: { label: string; at: string; Icon: typeof Mail; tone: string }[] = [];
    if (inv.sent_at) out.push({ label: 'Sent', at: inv.sent_at, Icon: Mail, tone: 'text-brand-blue' });
    if (inv.email_read_at) out.push({ label: 'Email Read', at: inv.email_read_at, Icon: Eye, tone: 'text-brand-cyan' });
    if (inv.bounced_at) out.push({ label: 'Bounced', at: inv.bounced_at, Icon: RefreshCw, tone: 'text-red-600' });
    if (inv.started_at) out.push({ label: 'Started', at: inv.started_at, Icon: Play, tone: 'text-brand-orange-deep' });
    if (inv.completed_at) out.push({ label: 'Completed', at: inv.completed_at, Icon: CheckCircle, tone: 'text-brand-blue' });

    const s = (inv.status || '').toLowerCase();
    const clockExpired = !inv.started_at
      && !inv.unit_consumed
      && inv.expires_at
      && new Date(inv.expires_at) < new Date();
    if (!inv.completed_at && (s === 'expired' || clockExpired) && inv.expires_at) {
      out.push({ label: 'Expired at', at: inv.expires_at, Icon: Clock, tone: 'text-brand-orange-deep' });
    }

    return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  };

  // Secondary "Expired" badge — shown alongside the base status when the
  // invitation has passed its expiry but hasn't reached a terminal state.
  // Mirrors isInvExpired() in the assessment-level popup so both surfaces
  // flag the same expired-but-not-yet-marked invitations.
  const isInvExpired = (inv: any): boolean => {
    const s = (inv.status || '').toLowerCase();
    if (['completed', 'failed', 'bounced', 'abandoned', 'expired'].includes(s) || inv.completed_at || inv.bounced_at) return false;
    if (inv.unit_consumed) return false;
    return !!(inv.expires_at && new Date(inv.expires_at) < new Date());
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl shadow-brand-blue/10 sm:border sm:border-gray-100 dark:sm:border-slate-700/60 sm:ring-1 sm:ring-black/[0.02] dark:sm:ring-white/[0.02] w-full sm:max-w-5xl h-[95dvh] sm:h-[calc(100dvh-3rem)] max-h-[95dvh] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
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

        {/* Stats Cards */}
        <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          {/* Mirrors the assessment-level popup's stats row exactly. */}
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-1 sm:gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 dark:border-slate-700 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-gray-500 dark:text-slate-500 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <Users className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Total Invited</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-gray-900 dark:text-slate-50">{stats.total}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 dark:border-slate-700 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-brand-orange-deep text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <Clock className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Invite Expired</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-brand-orange-deep">{stats.expired}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 dark:border-slate-700 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-red-600 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <X className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Invite Failed</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-red-600">{stats.failed}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 dark:border-slate-700 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-gray-600 dark:text-slate-400 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <Play className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>In Progress</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-gray-700 dark:text-slate-300">{stats.started}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 dark:border-slate-700 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-gray-600 dark:text-slate-400 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <CheckCircle className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Completed</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-gray-700 dark:text-slate-300">{stats.completed}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 dark:border-slate-700 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-gray-600 dark:text-slate-400 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <TrendingUp className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Completion Rate</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-gray-700 dark:text-slate-300">
                {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>

        {/* Invitations Table / Cards */}
        <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 sm:py-12 tf-loader-center tf-loader-center--compact">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-slate-500">
              <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-xs sm:text-sm">No invitations found for this job's assessments.</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden space-y-2">
                {invitations.map((invitation: any) => {
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
                      <div className="text-[10px] text-gray-500 dark:text-slate-500 grid grid-cols-2 gap-x-3 gap-y-0.5 mb-1.5">
                        {timelineEvents(invitation).map(({ label, at, Icon, tone }) => (
                          <div key={label} className="flex items-center gap-1 min-w-0">
                            <Icon className={`w-2.5 h-2.5 flex-shrink-0 ${tone}`} />
                            <span className="truncate">{label}: {formatIST(at)}</span>
                          </div>
                        ))}
                      </div>

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
                        {/* Resend / Change Email — same reach as the desktop
                            table (any un-started invite, not just failed and
                            bounced ones), so a recruiter on a phone isn't
                            missing the fix-the-address path. */}
                        {(['sent', 'opened', 'failed', 'expired', 'bounced'].includes(invitation.status)
                          && !invitation.started_at
                          && !invitation.completed_at) && (
                          editingEmailId === invitation.id ? (
                            <div className="flex flex-col gap-1.5">
                              <input
                                type="email"
                                value={newEmailValue}
                                onChange={e => setNewEmailValue(e.target.value)}
                                placeholder="new@email.com"
                                className="text-xs text-black placeholder-gray-400 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                                autoFocus
                              />
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleUpdateEmail(invitation)}
                                  disabled={!isValidEmail(newEmailValue) || isSendingEmail || newEmailValue.trim().toLowerCase() === (invitation.candidate_email || '').trim().toLowerCase()}
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-brand-blue text-white rounded hover:bg-brand-blue-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Send className="w-3 h-3" />
                                  {isSendingEmail ? 'Sending…' : 'Send'}
                                </button>
                                <button
                                  onClick={() => { setEditingEmailId(null); setNewEmailValue(''); }}
                                  className="px-2 py-1 text-[10px] text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleResendInvitation(invitation)}
                                disabled={resendingId === invitation.id}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-red-600 text-white hover:bg-red-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {resendingId === invitation.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Mail className="w-3 h-3" />}
                                {resendingId === invitation.id ? 'Sending…' : 'Resend'}
                              </button>
                              <button
                                onClick={() => { setEditingEmailId(invitation.id); setNewEmailValue(invitation.candidate_email); }}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] border border-gray-400 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded transition-colors"
                              >
                                <Pencil className="w-3 h-3" />
                                Edit
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View — Tech / Coding columns only render
                  when at least one row in the JD's invitations belongs to
                  an assessment that has that round enabled. Same rule as
                  the Results page: no all-empty columns. */}
              <div className="hidden sm:block overflow-x-auto tf-table-shell tf-table-shell--compact">
                <table className="w-full min-w-[960px] table-fixed">
                  <colgroup>
                    <col className="w-[72px]" />
                    <col className="w-[220px]" />
                    <col className="w-[160px]" />
                    <col className="w-[150px]" />
                    <col className="w-[190px]" />
                    {invitations.some(inv => inv.assessment_technical_enabled) && <col className="w-[110px]" />}
                    {invitations.some(inv => inv.assessment_coding_enabled) && <col className="w-[110px]" />}
                    <col className="w-[168px]" />
                  </colgroup>
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
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Actions</th>
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

                      return (
                        <tr key={invitation.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                          <td className="py-3 px-3 lg:px-4 align-middle">
                            <span className="inline-block text-xs font-mono font-medium text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-2 py-1 rounded whitespace-nowrap">
                              {invitation.candidate_display_id || '-'}
                            </span>
                          </td>
                          <td className="py-3 px-3 lg:px-4 align-middle">
                            <div className="flex items-center gap-2 lg:gap-3">
                              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-medium text-xs lg:text-sm flex-shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={invitation.candidate_name}>{invitation.candidate_name}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={invitation.candidate_email}>{invitation.candidate_email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 lg:px-4 align-middle">
                            <p className="text-sm text-gray-700 dark:text-slate-300 truncate" title={invitation.assessment_title}>{invitation.assessment_title}</p>
                          </td>
                          <td className="py-3 px-3 lg:px-4 align-middle">
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
                          <td className="py-3 px-3 lg:px-4 align-middle text-xs text-gray-500 dark:text-slate-500">
                            {/* Latest milestone only — earlier ones are in the
                                hover title, counted by the trailing "+N". */}
                            {(() => {
                              const events = timelineEvents(invitation);
                              if (events.length === 0) {
                                return <span className="text-gray-400 dark:text-slate-500">—</span>;
                              }
                              const latest = events[events.length - 1];
                              const { Icon } = latest;
                              return (
                                <div
                                  className="flex items-center gap-2 whitespace-nowrap"
                                  title={events.map(e => `${e.label}: ${formatIST(e.at)}`).join('\n')}
                                >
                                  <Icon className={`w-3 h-3 flex-shrink-0 ${latest.tone}`} />
                                  <span className={`truncate ${latest.tone}`}>
                                    {latest.label}: {formatIST(latest.at)}
                                  </span>
                                  {events.length > 1 && (
                                    <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0">
                                      +{events.length - 1}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          {/* Tech Score column body — render the cell only
                              when *some* row has tech enabled (column header
                              is gated identically). For a row whose source
                              assessment doesn't have tech, render '—'. */}
                          {invitations.some(inv => inv.assessment_technical_enabled) && (
                            <td className="py-3 px-3 lg:px-4 align-middle text-sm text-center">
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
                            <td className="py-3 px-3 lg:px-4 align-middle text-sm text-center">
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
                          <td className="py-3 px-3 lg:px-4 align-middle">
                            {/* Action rules mirror the assessment-level
                                popup so a recruiter sees the same controls
                                from either entry point: View Results when
                                completed, Change Email on bounce, and a
                                Resend button on sent/opened/failed invites
                                that haven't been started yet. */}
                            {getEffectiveStatus(invitation) === 'completed' ? (
                              invitation.attempt_id ? (
                                <button
                                  onClick={() => openResult(invitation)}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors whitespace-nowrap"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View Results
                                </button>
                              ) : (
                                // Completed-but-no-attempt — extremely rare orphaned invitation. Render
                                // a disabled button rather than silently dumping the user on the aggregate
                                // results page (the very bug this fix is for).
                                <button
                                  disabled
                                  title="Result detail unavailable for this invitation"
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 dark:text-slate-500 rounded-lg whitespace-nowrap cursor-not-allowed"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View Results
                                </button>
                              )
                            ) : invitation.status === 'bounced' ? (
                              editingEmailId === invitation.id ? (
                                <div className="flex flex-col gap-1.5 min-w-[190px]">
                                  <input
                                    type="email"
                                    value={newEmailValue}
                                    onChange={e => setNewEmailValue(e.target.value)}
                                    placeholder="new@email.com"
                                    className="text-xs text-black placeholder-gray-400 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                                    autoFocus
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleUpdateEmail(invitation)}
                                      disabled={!isValidEmail(newEmailValue) || isSendingEmail || newEmailValue.trim().toLowerCase() === (invitation.candidate_email || '').trim().toLowerCase()}
                                      className="flex items-center gap-1 px-2 py-1 text-xs bg-brand-blue text-white rounded hover:bg-brand-blue-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <Send className="w-3 h-3" />
                                      {isSendingEmail ? 'Sending…' : 'Send'}
                                    </button>
                                    <button
                                      onClick={() => { setEditingEmailId(null); setNewEmailValue(''); }}
                                      className="px-2 py-1 text-xs text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingEmailId(invitation.id); setNewEmailValue(invitation.candidate_email); }}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-400 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  Change Email
                                </button>
                              )
                            ) : (['sent', 'opened', 'failed', 'expired'].includes(invitation.status) && !invitation.started_at && !invitation.completed_at) ? (
                              // Resend retries the SAME address (good for a transient
                              // network failure); Edit Email lets the recruiter fix a
                              // mistyped address before resending (the common cause of
                              // a "failed"/"Incorrect Email" invite). Mirrors mobile.
                              editingEmailId === invitation.id ? (
                                <div className="flex flex-col gap-1.5 min-w-[190px]">
                                  <input
                                    type="email"
                                    value={newEmailValue}
                                    onChange={e => setNewEmailValue(e.target.value)}
                                    placeholder="new@email.com"
                                    className="text-xs text-black placeholder-gray-400 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                                    autoFocus
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleUpdateEmail(invitation)}
                                      disabled={!isValidEmail(newEmailValue) || isSendingEmail || newEmailValue.trim().toLowerCase() === (invitation.candidate_email || '').trim().toLowerCase()}
                                      className="flex items-center gap-1 px-2 py-1 text-xs bg-brand-blue text-white rounded hover:bg-brand-blue-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <Send className="w-3 h-3" />
                                      {isSendingEmail ? 'Sending…' : 'Send'}
                                    </button>
                                    <button
                                      onClick={() => { setEditingEmailId(null); setNewEmailValue(''); }}
                                      className="px-2 py-1 text-xs text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleResendInvitation(invitation)}
                                    disabled={resendingId === invitation.id}
                                    aria-label="Revoke old link and send a new invitation" title="Revoke old link and send a new invitation"
                                    className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                                      invitation.status === 'failed'
                                        ? 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-60'
                                        : 'border border-gray-400 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60'
                                    }`}
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                    {resendingId === invitation.id ? 'Sending…' : 'Resend'}
                                  </button>
                                  <button
                                    onClick={() => { setEditingEmailId(invitation.id); setNewEmailValue(invitation.candidate_email); }}
                                    aria-label="Edit email address and resend" title="Edit email address and resend"
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-400 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    Edit Email
                                  </button>
                                </div>
                              )
                            ) : null}
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
        <div className="px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between bg-slate-50 dark:bg-slate-950 flex-shrink-0">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-500">
            <strong>{invitations.length}</strong> invitation{invitations.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
