'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Video, Clock, Users, Calendar, CheckCircle, Play, Mail,
  XCircle, Copy, Trash2, Archive, ArchiveRestore, GitBranch, Eye,
  Loader2, RefreshCw, Briefcase, Globe, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type {
  AIInterviewResponse,
  AIInterviewVersionHistoryItem,
} from '@/lib/services/aiInterviewService';

const ROUND_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'Technical',
  behavioral: 'Behavioral',
  culture_fit: 'Culture Fit',
  leadership: 'Leadership',
  problem_solving: 'Problem Solving',
};

interface AIInterviewDetailsViewProps {
  config: AIInterviewResponse;
  onBack: () => void;
  onRefresh?: () => void;
}

export default function AIInterviewDetailsView({ config, onBack, onRefresh }: AIInterviewDetailsViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'versions'>('overview');
  const [actionLoading, setActionLoading] = useState(false);

  // Activity
  const [recentActivity, setRecentActivity] = useState<AIInterviewResponse[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Version History
  const [versionHistory, setVersionHistory] = useState<AIInterviewVersionHistoryItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{ type: string; title: string; message: string; onConfirm: () => void } | null>(null);

  const enabledRounds = useMemo(() => {
    return config.rounds_config?.filter((r) => r.enabled !== false) || [];
  }, [config.rounds_config]);

  const formattedDuration = useMemo(() => {
    const mins = config.duration_minutes;
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins} min`;
  }, [config.duration_minutes]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const result = await aiInterviewService.getConfigInvitations(config.id);
      setRecentActivity(result.items);
    } catch (error) {
      console.error('Failed to load activity:', error);
    } finally {
      setActivityLoading(false);
    }
  }, [config.id]);

  const loadVersionHistory = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const result = await aiInterviewService.getVersionHistory(config.id);
      setVersionHistory(result.items);
    } catch (error) {
      console.error('Failed to load version history:', error);
    } finally {
      setVersionsLoading(false);
    }
  }, [config.id]);

  useEffect(() => {
    if (activeTab === 'activity') loadActivity();
    if (activeTab === 'versions') loadVersionHistory();
  }, [activeTab, loadActivity, loadVersionHistory]);

  // Quick actions
  const handleCopyLink = async () => {
    if (config.interview_link) {
      const fullLink = `${window.location.origin}${config.interview_link}`;
      await navigator.clipboard.writeText(fullLink);
      toast.success('Interview link copied to clipboard');
    }
  };

  const handleDuplicate = async () => {
    setActionLoading(true);
    try {
      const result = await aiInterviewService.clone(config.id);
      toast.success(`Config duplicated: ${result.cloned_title}`);
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to duplicate config');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    setActionLoading(true);
    try {
      await aiInterviewService.archive(config.id);
      toast.success('Config archived');
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to archive');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await aiInterviewService.delete(config.id);
      toast.success('Config deleted');
      onBack();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-700';
      case 'draft': return 'bg-gray-100 text-gray-600';
      case 'completed': return 'bg-blue-100 text-blue-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      case 'archived': return 'bg-orange-100 text-orange-700';
      case 'in_progress': return 'bg-yellow-100 text-yellow-700';
      case 'invited': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'published': return 'Active';
      case 'draft': return 'Draft';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'archived': return 'Archived';
      case 'in_progress': return 'In Progress';
      case 'invited': return 'Invited';
      default: return status;
    }
  };

  // Compute invitation stats from activity
  const invitationStats = useMemo(() => {
    const total = recentActivity.length;
    const completed = recentActivity.filter(a => a.status === 'completed').length;
    const inProgress = recentActivity.filter(a => a.status === 'in_progress').length;
    const scores = recentActivity.filter(a => a.score != null).map(a => Number(a.score));
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return { total, completed, inProgress, avgScore };
  }, [recentActivity]);

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="w-full">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to AI Interviews
          </button>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Video className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    {config.jd_title || config.position || 'Untitled'}
                  </h1>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(config.status)}`}>
                      {getStatusLabel(config.status)}
                    </span>
                    {config.jd_experience_level && (
                      <span className="text-xs text-gray-500">{config.jd_experience_level}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500 mt-2 ml-12">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formattedDuration}
                </span>
                {enabledRounds.length > 0 && (
                  <span>{enabledRounds.length} round{enabledRounds.length !== 1 ? 's' : ''}</span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Created {new Date(config.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="border-b border-gray-200 px-6">
            <div className="flex gap-6">
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'activity', label: 'Recent Activity' },
                { key: 'versions', label: 'Version History' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`py-4 text-sm border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-gray-800 text-gray-800 font-medium'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="p-6 space-y-6">
              {/* Round Configuration */}
              {enabledRounds.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Interview Rounds</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {enabledRounds.map((round, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900">
                            {ROUND_LABELS[round.type] || round.type}
                          </span>
                          <span className="text-sm text-gray-500">{round.percentage}%</span>
                        </div>
                        <div className="text-sm text-gray-500 mb-2">
                          {round.duration_minutes} min
                        </div>
                        {round.topics && round.topics.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {round.topics.slice(0, 4).map((topic: string) => (
                              <span key={topic} className="px-2 py-0.5 bg-gray-50 text-gray-500 text-xs rounded-full border border-gray-200">
                                {topic}
                              </span>
                            ))}
                            {round.topics.length > 4 && (
                              <span className="text-xs text-gray-400">+{round.topics.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* JD Skills */}
              {config.jd_must_have_skills && config.jd_must_have_skills.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Required Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {config.jd_must_have_skills.map((skill: string) => (
                      <span key={skill} className="px-3 py-1 bg-gray-50 text-gray-700 text-sm rounded-full border border-gray-200">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Invitation Stats */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Invitation Stats</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-gray-900">{invitationStats.total}</div>
                    <div className="text-xs text-gray-500 mt-1">Total Invited</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-green-600">{invitationStats.completed}</div>
                    <div className="text-xs text-gray-500 mt-1">Completed</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-yellow-600">{invitationStats.inProgress}</div>
                    <div className="text-xs text-gray-500 mt-1">In Progress</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-semibold text-blue-600">
                      {invitationStats.avgScore != null ? `${invitationStats.avgScore}%` : '-'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Avg Score</div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {config.status === 'published' && (
                    <button
                      onClick={handleCopyLink}
                      className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Copy className="w-5 h-5 text-gray-600" />
                      <span className="text-sm text-gray-700">Copy Link</span>
                    </button>
                  )}
                  <button
                    onClick={handleDuplicate}
                    disabled={actionLoading}
                    className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <GitBranch className="w-5 h-5 text-gray-600" />
                    <span className="text-sm text-gray-700">Duplicate</span>
                  </button>
                  {config.status !== 'archived' && (
                    <button
                      onClick={() => setConfirmAction({
                        type: 'archive',
                        title: 'Archive Config',
                        message: 'Are you sure you want to archive this configuration? It will be moved to the Archived tab.',
                        onConfirm: handleArchive,
                      })}
                      disabled={actionLoading}
                      className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <Archive className="w-5 h-5 text-gray-600" />
                      <span className="text-sm text-gray-700">Archive</span>
                    </button>
                  )}
                  {config.status === 'archived' && (
                    <button
                      onClick={async () => {
                        setActionLoading(true);
                        try {
                          await aiInterviewService.unarchive(config.id);
                          toast.success('Config restored to draft');
                          onRefresh?.();
                        } catch (error: any) {
                          toast.error(error.message || 'Failed to unarchive');
                        } finally {
                          setActionLoading(false);
                        }
                      }}
                      disabled={actionLoading}
                      className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <ArchiveRestore className="w-5 h-5 text-gray-600" />
                      <span className="text-sm text-gray-700">Unarchive</span>
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmAction({
                      type: 'delete',
                      title: 'Delete Config',
                      message: 'Are you sure you want to delete this configuration? This action cannot be undone.',
                      onConfirm: handleDelete,
                    })}
                    disabled={actionLoading}
                    className="flex flex-col items-center gap-2 p-4 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-5 h-5 text-red-500" />
                    <span className="text-sm text-red-600">Delete</span>
                  </button>
                  {config.status === 'published' && (
                    <button
                      onClick={() => router.push(`/recruitment/ai-interviews/${config.id}`)}
                      className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Eye className="w-5 h-5 text-gray-600" />
                      <span className="text-sm text-gray-700">View Results</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Recent Activity Tab */}
          {activeTab === 'activity' && (
            <div className="p-6">
              {activityLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 mb-2">No candidate activity yet</p>
                  <p className="text-sm text-gray-400">Invite candidates to see their activity here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((activity) => {
                    const statusIcon = () => {
                      switch (activity.status) {
                        case 'completed': return <CheckCircle className="w-5 h-5 text-green-500" />;
                        case 'in_progress': return <Play className="w-5 h-5 text-yellow-500" />;
                        case 'invited': return <Mail className="w-5 h-5 text-blue-500" />;
                        case 'cancelled': return <XCircle className="w-5 h-5 text-red-500" />;
                        default: return <Mail className="w-5 h-5 text-gray-400" />;
                      }
                    };

                    return (
                      <div key={activity.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg">
                        <div className="flex-shrink-0">{statusIcon()}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 truncate">
                              {activity.candidate_name || 'Unknown'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(activity.status)}`}>
                              {getStatusLabel(activity.status)}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 truncate">{activity.candidate_email}</div>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          {activity.score != null && (
                            <div className="text-right">
                              <div className="text-xs text-gray-500">Score</div>
                              <div className="text-lg font-medium text-green-600">{Number(activity.score)}%</div>
                            </div>
                          )}
                          <div className="text-xs text-gray-400">
                            {activity.completed_at
                              ? new Date(activity.completed_at).toLocaleDateString()
                              : activity.started_at
                              ? new Date(activity.started_at).toLocaleDateString()
                              : new Date(activity.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Version History Tab */}
          {activeTab === 'versions' && (
            <div className="p-6">
              {versionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : versionHistory.length === 0 ? (
                <div className="text-center py-12">
                  <GitBranch className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500">No version history available</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200"></div>
                  <div className="space-y-6">
                    {versionHistory.map((version, idx) => (
                      <div key={version.id} className="relative flex gap-4">
                        <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${
                          idx === 0 ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}>
                          v{version.version}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900">
                              Version {version.version}
                            </span>
                            {version.change_summary && (
                              <>
                                <span className="text-gray-400">-</span>
                                <span className="text-sm text-gray-600">{version.change_summary}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            {version.changed_by_name && (
                              <span>by {version.changed_by_name}</span>
                            )}
                            <span>{new Date(version.created_at).toLocaleString()}</span>
                          </div>
                          <div className="mt-2 text-sm text-gray-500 space-y-1">
                            {version.interview_type && (
                              <div>Type: {ROUND_LABELS[version.interview_type] || version.interview_type}</div>
                            )}
                            {version.duration_minutes && (
                              <div>Duration: {version.duration_minutes} min</div>
                            )}
                            {version.rounds_config && (
                              <div>
                                Rounds: {version.rounds_config.filter((r: any) => r.enabled !== false).map((r: any) => ROUND_LABELS[r.type] || r.type).join(', ')}
                              </div>
                            )}
                            {version.jd_title && (
                              <div>JD: {version.jd_title}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{confirmAction.title}</h3>
            <p className="text-sm text-gray-600 mb-6">{confirmAction.message}</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                disabled={actionLoading}
                className={`px-4 py-2 text-sm text-white rounded-md transition-colors disabled:opacity-50 ${
                  confirmAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-900'
                }`}
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
