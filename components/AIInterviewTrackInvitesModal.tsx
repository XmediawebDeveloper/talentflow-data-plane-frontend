'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Users, Mail, Play, CheckCircle, Clock, Ban, TrendingUp, Copy, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { formatIST } from '@/lib/utils/dateUtils';

interface AIInterviewTrackInvitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Published AI interview config whose invitations are being tracked. */
  configId: string;
  jdTitle: string;
}

const PAGE_SIZE = 20;

// An invitation that passed its expiry but never reached a terminal state is
// still "invited" as far as the API is concerned. Same rule as the AI Interviews
// page popup: once a unit has been consumed (candidate actually started), expiry
// no longer applies.
const isInviteExpired = (inv: any): boolean => {
  if (['completed', 'cancelled', 'terminated', 'expired'].includes(inv.status)) return false;
  if (inv.unit_consumed) return false;
  return !!(inv.expires_at && new Date(inv.expires_at) < new Date());
};

// Milestones oldest-first. The table shows only the latest so every row stays a
// single line; the full sequence rides in the hover title with a "+N" hint.
const timelineEvents = (inv: any) => {
  const out: { label: string; at: string; Icon: typeof Mail; tone: string }[] = [];
  if (inv.created_at) out.push({ label: 'Invited', at: inv.created_at, Icon: Mail, tone: 'text-brand-blue' });
  if (inv.started_at) out.push({ label: 'Started', at: inv.started_at, Icon: Play, tone: 'text-brand-orange-deep' });
  if (inv.completed_at) out.push({ label: 'Completed', at: inv.completed_at, Icon: CheckCircle, tone: 'text-green-600' });
  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
};

// Prefer the evaluation's capability score so this matches the Result tab;
// round so 17.5 reads as 18 in both places.
const displayScore = (inv: any): number | null => {
  const raw = inv.ai_evaluation?.capability_score ?? inv.score;
  return raw != null ? Math.round(Number(raw)) : null;
};

const initialsOf = (name: string | null | undefined): string =>
  (name || '?')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const isLinkLive = (inv: any): boolean =>
  !!inv.interview_token &&
  !['completed', 'cancelled', 'terminated', 'expired'].includes(inv.status) &&
  !isInviteExpired(inv);

const copyInterviewLink = async (inv: any) => {
  const link = `${window.location.origin}/ai-interview/${inv.interview_token}`;
  await navigator.clipboard.writeText(link);
  toast.success('Interview link copied!');
};

// Badge wording and colours kept in lockstep with the AI Interviews page so a
// recruiter reads the same status regardless of where they opened tracking from.
const StatusBadge = ({ inv }: { inv: any }) => {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap flex-shrink-0 ring-1';
  switch (inv.status) {
    case 'completed': {
      // (Auto) surfaces when the timeout monitor finalized an abandoned session.
      const reason: string = (inv.ai_evaluation?.closing_reason || '').toString().toLowerCase();
      const autoCompleted = reason.startsWith('time_limit');
      return (
        <span
          className={`${base} bg-green-100 text-green-700 ring-green-200`}
          title={autoCompleted ? 'Auto-completed when the interview duration elapsed' : undefined}
        >
          <CheckCircle className="w-3 h-3" /> Completed{autoCompleted && <span className="text-green-600/80">(Auto)</span>}
        </span>
      );
    }
    case 'in_progress':
      return <span className={`${base} bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20`}><Play className="w-3 h-3" /> In Progress</span>;
    case 'invited':
      return <span className={`${base} bg-brand-blue/10 text-brand-blue ring-brand-blue/20`}><Mail className="w-3 h-3" /> Invited</span>;
    case 'cancelled':
      return <span className={`${base} bg-red-100 text-red-700 ring-red-200`}><X className="w-3 h-3" /> Cancelled</span>;
    case 'terminated':
      return (
        <span className={`${base} bg-red-100 text-red-700 ring-red-200`} title="Auto-ended by the proctoring policy — candidate left the interview screen">
          <Ban className="w-3 h-3" /> Terminated
        </span>
      );
    case 'expired':
      return <span className={`${base} bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20`}><Clock className="w-3 h-3" /> Expired</span>;
    default:
      return <span className={`${base} bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-gray-200 dark:ring-slate-700`}><Clock className="w-3 h-3" /> {inv.status || 'Pending'}</span>;
  }
};

/**
 * Invite tracking for a job's AI interview, rendered in place on the Job Details
 * page. Read-only by design: this answers "who was invited and how far did they
 * get" — scores and transcripts live in the AI Interview Result tab.
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
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    inProgress: 0,
    terminated: 0,
    cancelled: 0,
    totalPages: 1,
  });
  const refreshRef = useRef<NodeJS.Timeout | null>(null);

  const loadInvitations = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const result = await aiInterviewService.getConfigInvitations(configId, {
        page,
        page_size: PAGE_SIZE,
      });
      setInvitations(result.items || []);
      setStats({
        total: result.total || 0,
        completed: result.completed || 0,
        inProgress: result.in_progress || 0,
        terminated: result.terminated || 0,
        cancelled: result.cancelled || 0,
        totalPages: Math.max(1, result.total_pages || 1),
      });
    } catch (error) {
      console.error('Failed to load AI interview invitations:', error);
      if (!silent) toast.error('Could not load invitations. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [configId, page]);

  // Same 15s silent refresh the assessment tracker uses — candidates move
  // through an interview while the recruiter watches this list.
  useEffect(() => {
    if (!isOpen || !configId) return;
    loadInvitations();
    refreshRef.current = setInterval(() => loadInvitations(true), 15000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [isOpen, configId, loadInvitations]);

  if (!isOpen) return null;

  // Everything not in a terminal or in-progress state is still awaiting the
  // candidate. Subtract the explicit counts so they don't inflate "Invited".
  const invited = Math.max(0, stats.total - stats.completed - stats.inProgress - stats.terminated - stats.cancelled);
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const statCards = [
    { label: 'Total', value: stats.total, icon: Users, tone: 'text-gray-900 dark:text-slate-50', iconTone: 'text-gray-500 dark:text-slate-500' },
    { label: 'Invited', value: invited, icon: Mail, tone: 'text-brand-blue', iconTone: 'text-brand-blue' },
    { label: 'In Progress', value: stats.inProgress, icon: Play, tone: 'text-brand-orange-deep', iconTone: 'text-brand-orange-deep' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle, tone: 'text-green-600', iconTone: 'text-green-600' },
    { label: 'Terminated', value: stats.terminated, icon: Ban, tone: 'text-red-600', iconTone: 'text-red-600' },
    { label: 'Cancelled', value: stats.cancelled, icon: X, tone: 'text-red-600', iconTone: 'text-red-600' },
    { label: 'Completion', value: `${completionRate}%`, icon: TrendingUp, tone: 'text-brand-cyan', iconTone: 'text-brand-cyan' },
  ];

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl shadow-brand-blue/10 sm:border sm:border-gray-100 dark:sm:border-slate-700/60 sm:ring-1 sm:ring-black/[0.02] dark:sm:ring-white/[0.02] w-full sm:max-w-5xl h-[95dvh] sm:h-[calc(100dvh-3rem)] max-h-[95dvh] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between flex-shrink-0 bg-slate-50 dark:bg-slate-950">
          <div className="min-w-0 flex-1 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 truncate">
                <span className="hidden sm:inline">AI Interview Invite Tracking</span>
                <span className="sm:hidden">Invite Status</span>
              </h2>
              <p className="text-[10px] sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 truncate">{jdTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors flex-shrink-0 ml-2"
            aria-label="Close"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          <div className="grid grid-cols-3 lg:grid-cols-7 gap-1 sm:gap-3">
            {statCards.map(({ label, value, icon: Icon, tone, iconTone }) => (
              <div key={label} className="bg-white dark:bg-slate-900 rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 dark:border-slate-700 text-center sm:text-left">
                <div className={`flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${iconTone} text-[9px] sm:text-xs mb-0.5 sm:mb-1`}>
                  <Icon className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                  <span className="truncate">{label}</span>
                </div>
                <p className={`text-sm sm:text-2xl font-bold tracking-tight ${tone}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Candidate list */}
        <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 sm:py-12">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-slate-500">
              <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-brand-blue/30" />
              <p className="text-xs sm:text-sm">No candidates invited yet.</p>
              <p className="text-[11px] sm:text-xs text-gray-400 dark:text-slate-500 mt-1">
                Use Send Invite to invite candidates to this job&apos;s AI interview.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="sm:hidden space-y-2">
                {invitations.map((inv: any) => {
                  const score = displayScore(inv);
                  return (
                    <div
                      key={inv.id}
                      className="p-2.5 border border-gray-100 dark:border-slate-700/60 rounded-xl bg-white dark:bg-slate-900"
                    >
                      <div className="flex items-center gap-2 min-w-0 mb-1.5">
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
                        </div>
                        <StatusBadge inv={inv} />
                      </div>

                      {/* Two-column grid rather than a free wrap, so entries
                          line up instead of staggering by label width. */}
                      <div className="text-[10px] text-gray-500 dark:text-slate-500 grid grid-cols-2 gap-x-3 gap-y-0.5 mb-1.5">
                        {timelineEvents(inv).map(({ label, at, Icon, tone }) => (
                          <div key={label} className="flex items-center gap-1 min-w-0">
                            <Icon className={`w-2.5 h-2.5 flex-shrink-0 ${tone}`} />
                            <span className="truncate">{label}: {formatIST(at)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-100 dark:border-slate-700/60">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {score != null ? (
                            <span className="text-[10px] text-gray-600 dark:text-slate-400 whitespace-nowrap">
                              Score:{' '}
                              <span className={`font-semibold ${score >= 60 ? 'text-green-600' : 'text-red-600'}`}>{score}%</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 dark:text-slate-500">—</span>
                          )}
                          {/* Secondary Expired flag, same as the desktop table. */}
                          {isInviteExpired(inv) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium ring-1 bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20 whitespace-nowrap flex-shrink-0">
                              <Clock className="w-2.5 h-2.5" /> Expired
                            </span>
                          )}
                        </div>
                        {isLinkLive(inv) && (
                          <button
                            onClick={() => copyInterviewLink(inv)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                            Copy Link
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table — fixed columns so every row is one line and the
                  cells stay in register down the list. */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[860px] table-fixed">
                  <colgroup>
                    <col className="w-[260px]" />
                    <col className="w-[150px]" />
                    <col className="w-[90px]" />
                    <col className="w-[210px]" />
                    <col className="w-[130px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700">
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Candidate</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                      <th className="text-center py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Score</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Timeline</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                    {invitations.map((inv: any) => {
                      const score = displayScore(inv);
                      const events = timelineEvents(inv);
                      const latest = events[events.length - 1];
                      const LatestIcon = latest?.Icon;

                      return (
                        <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                          <td className="py-3 px-3 lg:px-4 align-middle">
                            <div className="flex items-center gap-2 lg:gap-3">
                              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center text-brand-blue font-medium text-xs lg:text-sm flex-shrink-0">
                                {initialsOf(inv.candidate_name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={inv.candidate_name || 'Unknown'}>
                                  {inv.candidate_name || 'Unknown'}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={inv.candidate_email}>
                                  {inv.candidate_email}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3 lg:px-4 align-middle">
                            <div className="flex items-center gap-1.5 flex-nowrap overflow-hidden">
                              <StatusBadge inv={inv} />
                              {isInviteExpired(inv) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0">
                                  <Clock className="w-3 h-3" /> Expired
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 lg:px-4 align-middle text-center text-sm whitespace-nowrap">
                            {score != null ? (
                              <span className={`font-semibold ${score >= 60 ? 'text-green-600' : 'text-red-600'}`}>{score}%</span>
                            ) : (
                              <span className="text-gray-400 dark:text-slate-500">—</span>
                            )}
                          </td>

                          <td className="py-3 px-3 lg:px-4 align-middle text-xs text-gray-500 dark:text-slate-500">
                            {latest && LatestIcon ? (
                              <div
                                className="flex items-center gap-2 whitespace-nowrap"
                                title={events.map(e => `${e.label}: ${formatIST(e.at)}`).join('\n')}
                              >
                                <LatestIcon className={`w-3 h-3 flex-shrink-0 ${latest.tone}`} />
                                <span className={`truncate ${latest.tone}`}>
                                  {latest.label}: {formatIST(latest.at)}
                                </span>
                                {events.length > 1 && (
                                  <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0">
                                    +{events.length - 1}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 dark:text-slate-500">—</span>
                            )}
                          </td>

                          <td className="py-3 px-3 lg:px-4 align-middle">
                            {isLinkLive(inv) ? (
                              <button
                                onClick={() => copyInterviewLink(inv)}
                                title="Copy interview link"
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors whitespace-nowrap"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Copy Link
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-slate-500">—</span>
                            )}
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

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/50 px-3 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 flex-shrink-0">
          <span className="text-xs sm:text-sm text-gray-500 dark:text-slate-500">
            {stats.total} candidate{stats.total === 1 ? '' : 's'} invited
          </span>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {stats.totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label="Previous page"
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs sm:text-sm text-brand-blue font-semibold px-1">
                  {page} / {stats.totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(stats.totalPages, p + 1))}
                  disabled={page === stats.totalPages}
                  aria-label="Next page"
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
