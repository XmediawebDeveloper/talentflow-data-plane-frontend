'use client';

import { X, Users, Mail, Play, CheckCircle, Clock, Eye, TrendingUp, RefreshCw, Pencil, Send } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/services/api';
import { formatIST } from '@/lib/utils/dateUtils';

interface TrackInvitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  jdId: string;
  jdTitle: string;
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

export default function TrackInvitesModal({ isOpen, onClose, jdId, jdTitle }: TrackInvitesModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    sent: 0,
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
        setStats({ total: 0, sent: 0, started: 0, completed: 0, failed: 0 });
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
            allInvitations.push(...invitationsResponse.data.items.map((inv: any) => ({
              ...inv,
              assessment_title: assessment.title,
              assessment_id: assessment.id,
            })));
          }
        } catch (err) {
          console.warn(`Failed to load invitations for assessment ${assessment.id}:`, err);
        }
      }

      // Calculate stats using effective status (timestamp-aware)
      const newStats = {
        total: allInvitations.length,
        sent: allInvitations.filter(inv => ['sent', 'opened', 'pending'].includes(getEffectiveStatus(inv))).length,
        started: allInvitations.filter(inv => getEffectiveStatus(inv) === 'started').length,
        completed: allInvitations.filter(inv => getEffectiveStatus(inv) === 'completed').length,
        failed: allInvitations.filter(inv => ['failed', 'expired', 'abandoned', 'bounced'].includes(getEffectiveStatus(inv))).length,
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
        { new_email: newEmailValue }
      );
      setEditingEmailId(null);
      setNewEmailValue('');
      await loadInvitations(true);
    } catch (error) {
      console.error('Failed to update email:', error);
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (!isOpen) return null;

  const getStatusBadge = (inv: any) => {
    const effective = getEffectiveStatus(inv);
    const base = "px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs flex items-center gap-1 whitespace-nowrap flex-shrink-0";
    if (effective === 'completed') {
      return <span className={`${base} bg-green-100 text-green-700`}><CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Done</span>;
    }
    if (effective === 'failed') {
      return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs flex items-center gap-1"><X className="w-3 h-3" /> Failed</span>;
    }
    if (effective === 'bounced') {
      return <span className={`${base} bg-red-100 text-red-700`}><RefreshCw className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Bounced</span>;
    }
    if (effective === 'expired') {
      return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Expired</span>;
    }
    if (effective === 'abandoned') {
      return <span className={`${base} bg-gray-100 text-gray-700`}><X className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Left</span>;
    }
    if (effective === 'started') {
      return <span className={`${base} bg-yellow-100 text-yellow-700`}><Play className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Started</span>;
    }
    if (effective === 'opened') {
      return <span className={`${base} bg-purple-100 text-purple-700`}><Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Opened</span>;
    }
    if (inv.email_read_at) {
      return <span className={`${base} bg-indigo-100 text-indigo-700`}><Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Read</span>;
    }
    if (effective === 'sent') {
      return <span className={`${base} bg-blue-100 text-blue-700`}><Mail className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Sent</span>;
    }
    return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-6">
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-2xl sm:border sm:border-gray-200 w-full sm:max-w-5xl max-h-[95dvh] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 flex-shrink-0" />
              <h2 className="text-sm sm:text-lg font-semibold text-gray-900 truncate">
                <span className="hidden sm:inline">Assessment Invitations Status</span>
                <span className="sm:hidden">Invite Status</span>
              </h2>
            </div>
            <p className="text-[10px] sm:text-sm text-gray-500 mt-0.5 truncate">{jdTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 ml-2"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Stats Cards */}
        <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-1 sm:gap-4">
            <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-gray-500 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <Users className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Total</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-blue-600 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <Mail className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Sent</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-blue-600">{stats.sent}</p>
            </div>
            <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-red-600 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <X className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Failed</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-red-600">{stats.failed}</p>
            </div>
            <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-yellow-600 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <Play className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Active</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-yellow-600">{stats.started}</p>
            </div>
            <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-green-600 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <CheckCircle className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Done</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <div className="bg-white rounded-md sm:rounded-lg p-1.5 sm:p-3 border border-gray-200 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 text-purple-600 text-[9px] sm:text-xs mb-0.5 sm:mb-1">
                <TrendingUp className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 flex-shrink-0 hidden sm:block" />
                <span>Rate</span>
              </div>
              <p className="text-sm sm:text-2xl font-bold text-purple-600">
                {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>

        {/* Invitations Table / Cards */}
        <div className="px-2.5 sm:px-6 py-2.5 sm:py-4 overflow-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 sm:py-12">
              <div className="animate-spin w-6 h-6 sm:w-8 sm:h-8 border-4 border-purple-600 border-t-transparent rounded-full"></div>
            </div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-gray-500">
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
                    <div key={invitation.id} className="bg-white rounded-lg border border-gray-200 p-2.5">
                      {/* Candidate row */}
                      <div className="flex items-center gap-2 min-w-0 mb-1.5">
                        <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-medium text-[10px] flex-shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-xs truncate">{invitation.candidate_name}</p>
                          <p className="text-[10px] text-gray-500 truncate break-all">{invitation.candidate_email}</p>
                        </div>
                        {getStatusBadge(invitation)}
                      </div>

                      {/* CID + Assessment */}
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span className="text-[9px] font-mono font-medium text-purple-700 bg-purple-50 px-1 py-0.5 rounded">
                          {invitation.candidate_display_id || '-'}
                        </span>
                        <span className="text-[10px] text-gray-600 truncate">{invitation.assessment_title}</span>
                      </div>

                      {/* Timeline */}
                      <div className="text-[10px] text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mb-1.5">
                        {invitation.sent_at && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-2.5 h-2.5 text-blue-500 flex-shrink-0" />
                            <span>Sent: {formatIST(invitation.sent_at)}</span>
                          </div>
                        )}
                        {invitation.started_at && (
                          <div className="flex items-center gap-1">
                            <Play className="w-2.5 h-2.5 text-yellow-500 flex-shrink-0" />
                            <span>Started: {formatIST(invitation.started_at)}</span>
                          </div>
                        )}
                        {invitation.completed_at && (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />
                            <span>Done: {formatIST(invitation.completed_at)}</span>
                          </div>
                        )}
                      </div>

                      {/* Progress + Actions */}
                      <div className="pt-1.5 border-t border-gray-100">
                        {/* Score/Progress row */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            {getEffectiveStatus(invitation) === 'completed' ? (
                              <div className="flex items-center gap-1 text-[10px]">
                                <span className="text-gray-600">Score:</span>
                                <span className={`font-medium ${invitation.passed ? 'text-green-600' : 'text-red-600'}`}>
                                  {invitation.overall_score != null ? `${Math.round(invitation.overall_score)}%` : 'N/A'}
                                </span>
                                {invitation.passed !== null && (
                                  <span className={`text-[9px] px-1 py-0.5 rounded ${invitation.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {invitation.passed ? 'Pass' : 'Fail'}
                                  </span>
                                )}
                              </div>
                            ) : getEffectiveStatus(invitation) === 'started' ? (
                              <div className="flex items-center gap-1 text-[10px]">
                                <span className="text-gray-600">Progress:</span>
                                <span className="font-medium text-yellow-600">
                                  {invitation.progress_percent != null ? `${invitation.progress_percent}%` : 'In Progress'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400">—</span>
                            )}
                          </div>
                          {getEffectiveStatus(invitation) === 'completed' && (
                            <button
                              onClick={() => router.push(`/recruitment/assessments/${invitation.assessment_id}/results`)}
                              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-purple-600 hover:bg-purple-50 rounded transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              View
                            </button>
                          )}
                        </div>
                        {/* Failed/Bounced actions */}
                        {(['failed', 'bounced'].includes(getEffectiveStatus(invitation))) && (
                          editingEmailId === invitation.id ? (
                            <div className="flex flex-col gap-1.5">
                              <input
                                type="email"
                                value={newEmailValue}
                                onChange={e => setNewEmailValue(e.target.value)}
                                placeholder="new@email.com"
                                className="text-xs text-black placeholder-gray-400 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                                autoFocus
                              />
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleUpdateEmail(invitation)}
                                  disabled={!isValidEmail(newEmailValue) || isSendingEmail}
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Send className="w-3 h-3" />
                                  {isSendingEmail ? 'Sending…' : 'Send'}
                                </button>
                                <button
                                  onClick={() => { setEditingEmailId(null); setNewEmailValue(''); }}
                                  className="px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleResendInvitation(invitation)}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-red-600 text-white hover:bg-red-700 rounded transition-colors"
                              >
                                <Mail className="w-3 h-3" />
                                Resend
                              </button>
                              <button
                                onClick={() => { setEditingEmailId(invitation.id); setNewEmailValue(invitation.candidate_email); }}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] border border-gray-400 text-gray-700 hover:bg-gray-50 rounded transition-colors"
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

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">CID</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidate</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assessment</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timeline</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Progress</th>
                      <th className="text-left py-3 px-3 lg:px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invitations.map((invitation: any) => {
                      const initials = invitation.candidate_name
                        ?.split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2) || '??';

                      return (
                        <tr key={invitation.id} className="hover:bg-gray-50">
                          <td className="py-3 px-3 lg:px-4">
                            <span className="text-xs font-mono font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded">
                              {invitation.candidate_display_id || '-'}
                            </span>
                          </td>
                          <td className="py-3 px-3 lg:px-4">
                            <div className="flex items-center gap-2 lg:gap-3">
                              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-medium text-xs lg:text-sm flex-shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 text-sm truncate">{invitation.candidate_name}</p>
                                <p className="text-xs text-gray-500 truncate">{invitation.candidate_email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 lg:px-4">
                            <p className="text-sm text-gray-700">{invitation.assessment_title}</p>
                          </td>
                          <td className="py-3 px-3 lg:px-4">
                            {getStatusBadge(invitation)}
                          </td>
                          <td className="py-3 px-3 lg:px-4 text-xs text-gray-500">
                            <div className="space-y-1">
                              {invitation.sent_at && (
                                <div className="flex items-center gap-2">
                                  <Mail className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                  <span>Sent: {formatIST(invitation.sent_at)}</span>
                                </div>
                              )}
                              {invitation.email_read_at && (
                                <div className="flex items-center gap-2">
                                  <Eye className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                                  <span>Email Read: {formatIST(invitation.email_read_at)}</span>
                                </div>
                              )}
                              {invitation.bounced_at && (
                                <div className="flex items-center gap-2">
                                  <RefreshCw className="w-3 h-3 text-red-500 flex-shrink-0" />
                                  <span className="text-red-600">Bounced: {formatIST(invitation.bounced_at)}</span>
                                </div>
                              )}
                              {invitation.started_at && (
                                <div className="flex items-center gap-2">
                                  <Play className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                                  <span>Started: {formatIST(invitation.started_at)}</span>
                                </div>
                              )}
                              {invitation.completed_at && (
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                                  <span>Completed: {formatIST(invitation.completed_at)}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 lg:px-4">
                            {getEffectiveStatus(invitation) === 'completed' ? (
                              <div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-600">Score</span>
                                  <span className={`font-medium ${invitation.passed ? 'text-green-600' : 'text-red-600'}`}>
                                    {invitation.overall_score != null ? `${Math.round(invitation.overall_score)}%` : 'N/A'}
                                  </span>
                                  {invitation.passed !== null && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${invitation.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                      {invitation.passed ? 'Passed' : 'Failed'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : getEffectiveStatus(invitation) === 'started' ? (
                              <div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-600">Progress</span>
                                  <span className="font-medium text-yellow-600">
                                    {invitation.progress_percent != null ? `${invitation.progress_percent}%` : 'In Progress'}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 lg:px-4">
                            {getEffectiveStatus(invitation) === 'completed' ? (
                              <button
                                onClick={() => router.push(`/recruitment/assessments/${invitation.assessment_id}/results`)}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded-lg transition-colors whitespace-nowrap"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View Results
                              </button>
                            ) : (['failed', 'bounced'].includes(getEffectiveStatus(invitation))) ? (
                              editingEmailId === invitation.id ? (
                                // Inline email editor
                                <div className="flex flex-col gap-1.5 min-w-[180px]">
                                  <input
                                    type="email"
                                    value={newEmailValue}
                                    onChange={e => setNewEmailValue(e.target.value)}
                                    placeholder="new@email.com"
                                    className="text-xs text-black placeholder-gray-400 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                                    autoFocus
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleUpdateEmail(invitation)}
                                      disabled={!isValidEmail(newEmailValue) || isSendingEmail}
                                      className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <Send className="w-3 h-3" />
                                      {isSendingEmail ? 'Sending…' : 'Send'}
                                    </button>
                                    <button
                                      onClick={() => { setEditingEmailId(null); setNewEmailValue(''); }}
                                      className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                // Retry or Change Email buttons depending on email validity
                                <div className="flex flex-col gap-1">
                                  {isValidEmail(invitation.candidate_email) ? (
                                    <button
                                      onClick={() => handleResendInvitation(invitation)}
                                      disabled={resendingId === invitation.id}
                                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                                    >
                                      <RefreshCw className={`w-3.5 h-3.5 ${resendingId === invitation.id ? 'animate-spin' : ''}`} />
                                      {resendingId === invitation.id ? 'Sending…' : 'Retry'}
                                    </button>
                                  ) : null}
                                  <button
                                    onClick={() => { setEditingEmailId(invitation.id); setNewEmailValue(invitation.candidate_email); }}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-400 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors whitespace-nowrap"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    Change Email
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
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0">
          <p className="text-xs sm:text-sm text-gray-500">
            <strong>{invitations.length}</strong> invitation{invitations.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={onClose}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
