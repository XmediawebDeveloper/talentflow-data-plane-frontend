'use client';

import { X, Users, Mail, Play, CheckCircle, Clock, Eye, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/services/api';

interface TrackInvitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  jdId: string;
  jdTitle: string;
}

// Helper function to format date/time in IST timezone
const formatDateTimeIST = (dateStr: string | null | undefined, options?: { includeTime?: boolean }) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const dateOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  if (options?.includeTime) {
    dateOptions.hour = '2-digit';
    dateOptions.minute = '2-digit';
    dateOptions.hour12 = true;
  }
  return date.toLocaleString('en-US', dateOptions);
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

  useEffect(() => {
    if (isOpen && jdId) {
      loadInvitations();
    }
  }, [isOpen, jdId]);

  const loadInvitations = async () => {
    setIsLoading(true);
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

      // Calculate stats
      const newStats = {
        total: allInvitations.length,
        sent: allInvitations.filter(inv => inv.sent_at).length,
        started: allInvitations.filter(inv => inv.started_at && inv.status !== 'completed').length,
        completed: allInvitations.filter(inv => inv.status === 'completed').length,
        failed: allInvitations.filter(inv => inv.status === 'failed' || inv.status === 'expired').length,
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
    try {
      await api.post(`/assessments/${invitation.assessment_id}/invitations/${invitation.id}/resend`);
      // Reload invitations
      await loadInvitations();
    } catch (error) {
      console.error('Failed to resend invitation:', error);
    }
  };

  if (!isOpen) return null;

  const getStatusBadge = (inv: any) => {
    // Status priority: completed > started > opened > sent > expired > failed > pending
    if (inv.status === 'completed') {
      return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Completed</span>;
    }
    if (inv.status === 'started' || (inv.started_at && inv.status !== 'completed')) {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs flex items-center gap-1"><Play className="w-3 h-3" /> Started</span>;
    }
    if (inv.status === 'opened') {
      return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs flex items-center gap-1"><Eye className="w-3 h-3" /> Link Opened</span>;
    }
    if (inv.status === 'sent' || inv.sent_at) {
      return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Sent</span>;
    }
    if (inv.status === 'expired') {
      return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Expired</span>;
    }
    if (inv.status === 'failed') {
      return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs flex items-center gap-1"><X className="w-3 h-3" /> Failed</span>;
    }
    if (inv.status === 'abandoned') {
      return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs flex items-center gap-1"><X className="w-3 h-3" /> Abandoned</span>;
    }
    // Default: pending
    return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return formatDateTimeIST(dateStr, { includeTime: true });
  };

  return (
    <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900">Assessment Invitations Status</h2>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{jdTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Cards */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-6 gap-4">
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <Users className="w-3.5 h-3.5" />
                Total Invited
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 text-blue-600 text-xs mb-1">
                <Mail className="w-3.5 h-3.5" />
                Sent
              </div>
              <p className="text-2xl font-bold text-blue-600">{stats.sent}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 text-red-600 text-xs mb-1">
                <X className="w-3.5 h-3.5" />
                Failed
              </div>
              <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 text-yellow-600 text-xs mb-1">
                <Play className="w-3.5 h-3.5" />
                In Progress
              </div>
              <p className="text-2xl font-bold text-yellow-600">{stats.started}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Completed
              </div>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 text-purple-600 text-xs mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                Completion
              </div>
              <p className="text-2xl font-bold text-purple-600">
                {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>

        {/* Invitations Table */}
        <div className="px-6 py-4 overflow-auto max-h-[50vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full"></div>
            </div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No invitations found for this job's assessments.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">CID</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Candidate</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assessment</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timeline</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Progress</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
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
                      <td className="py-3 px-4">
                        <span className="text-xs font-mono font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded">
                          {invitation.candidate_display_id || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-medium text-sm">
                            {initials}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{invitation.candidate_name}</p>
                            <p className="text-xs text-gray-500">{invitation.candidate_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-700">{invitation.assessment_title}</p>
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(invitation)}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500">
                        <div className="space-y-1">
                          {invitation.sent_at && (
                            <div className="flex items-center gap-2">
                              <Mail className="w-3 h-3 text-blue-500" />
                              <span>Sent: {formatDate(invitation.sent_at)}</span>
                            </div>
                          )}
                          {invitation.started_at && (
                            <div className="flex items-center gap-2">
                              <Play className="w-3 h-3 text-yellow-500" />
                              <span>Started: {formatDate(invitation.started_at)}</span>
                            </div>
                          )}
                          {invitation.completed_at && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span>Completed: {formatDate(invitation.completed_at)}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {invitation.status === 'completed' ? (
                          <div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-600">Score</span>
                              <span className={`font-medium ${invitation.passed ? 'text-green-600' : 'text-red-600'}`}>
                                {invitation.overall_score != null ? `${invitation.overall_score.toFixed(1)}%` : 'N/A'}
                              </span>
                              {invitation.passed !== null && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${invitation.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {invitation.passed ? 'Passed' : 'Failed'}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : invitation.started_at ? (
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
                      <td className="py-3 px-4">
                        {invitation.status === 'completed' ? (
                          <button
                            onClick={() => router.push(`/recruitment/assessments/${invitation.assessment_id}/results`)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Results
                          </button>
                        ) : invitation.status === 'failed' ? (
                          <button
                            onClick={() => handleResendInvitation(invitation)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            Resend
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <p className="text-sm text-gray-500">
            Showing <strong>{invitations.length}</strong> invitation{invitations.length !== 1 ? 's' : ''} for this job
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
