import { ArrowLeft, Clock, Users, FileText, Award, Calendar, TrendingUp, Edit2, Eye, Mail, BarChart, Share2, Download, Copy, Archive, Trash2, Play, PauseCircle, CheckCircle, XCircle, AlertCircle, Briefcase, Target, Sparkles, Link2, Code, MessageSquare, Cpu, User, ExternalLink } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { assessmentService } from '@/lib/services';

interface AssessmentDetailsViewProps {
  assessment: any;
  onBack: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onShare: () => void;
  onViewResults: () => void;
  onRefresh?: () => void;
}

interface Section {
  name: string;
  type: 'hr' | 'technical' | 'coding';
  enabled: boolean;
  percentage: number;
  topics: string[];
  languages?: string[];
  icon: any;
}

export default function AssessmentDetailsView({
  assessment,
  onBack,
  onEdit,
  onPreview,
  onShare,
  onViewResults,
  onRefresh
}: AssessmentDetailsViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'sections' | 'analytics' | 'activity' | 'versions'>('overview');
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Fetch recent activity when assessment changes
  useEffect(() => {
    const fetchActivity = async () => {
      if (!assessment?.id) return;
      setActivityLoading(true);
      try {
        const response = await assessmentService.listInvitations(assessment.id, { page_size: 10 });
        if (response?.items) {
          // Sort by most recent activity (completed or created)
          const sorted = [...response.items].sort((a: any, b: any) => {
            const dateA = new Date(a.completed_at || a.started_at || a.created_at);
            const dateB = new Date(b.completed_at || b.started_at || b.created_at);
            return dateB.getTime() - dateA.getTime();
          });
          setRecentActivity(sorted.slice(0, 10)); // Latest 10 activities
        }
      } catch (error) {
        console.error('Failed to fetch activity:', error);
      } finally {
        setActivityLoading(false);
      }
    };
    fetchActivity();
  }, [assessment?.id]);

  // Fetch version history when versions tab is active
  useEffect(() => {
    const fetchVersions = async () => {
      if (!assessment?.id || activeTab !== 'versions') return;
      setVersionsLoading(true);
      try {
        const response = await assessmentService.getVersionHistory(assessment.id);
        setVersionHistory(response.items || []);
      } catch (error) {
        console.error('Failed to fetch version history:', error);
      } finally {
        setVersionsLoading(false);
      }
    };
    fetchVersions();
  }, [assessment?.id, activeTab]);

  // Construct sections array from individual assessment fields
  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];

    if (assessment.hr_enabled) {
      result.push({
        name: 'HR / Behavioral',
        type: 'hr',
        enabled: true,
        percentage: assessment.hr_percentage || 0,
        topics: assessment.hr_topics || [],
        icon: MessageSquare
      });
    }

    if (assessment.technical_enabled) {
      result.push({
        name: 'Technical',
        type: 'technical',
        enabled: true,
        percentage: assessment.technical_percentage || 0,
        topics: assessment.technical_topics || [],
        icon: Cpu
      });
    }

    if (assessment.coding_enabled) {
      result.push({
        name: 'Coding',
        type: 'coding',
        enabled: true,
        percentage: assessment.coding_percentage || 0,
        topics: assessment.coding_topics || [],
        languages: assessment.coding_languages || [],
        icon: Code
      });
    }

    return result;
  }, [assessment]);

  // Format duration from minutes
  const formattedDuration = useMemo(() => {
    const minutes = assessment.duration_minutes || 30;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
    return `${minutes} min`;
  }, [assessment.duration_minutes]);

  // Analytics data derived from assessment - uses correct API field names
  const formatTime = (seconds: number | null | undefined): string => {
    if (seconds == null) return 'N/A';
    const mins = Math.floor(seconds / 60);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hrs}h ${remainingMins}m`;
    }
    return `${mins} min`;
  };

  const analyticsData = {
    totalInvites: assessment.candidates || assessment.invitations_count || 0,
    sent: recentActivity.filter((a: any) => a.status === 'sent').length,
    failed: recentActivity.filter((a: any) => a.status === 'failed').length,
    started: recentActivity.filter((a: any) => a.status === 'in_progress' || a.status === 'started').length,
    completed: assessment.completed_count || 0,
    inProgress: assessment.in_progress_count || 0,
    notStarted: assessment.pending_count || 0,
    averageScore: assessment.average_score as number | null,
    averageTime: formatTime(assessment.average_time_seconds),
    passRate: assessment.pass_rate !== null && assessment.pass_rate !== undefined
      ? `${assessment.pass_rate}%`
      : 'N/A',
    // Section scores
    hrScore: assessment.hr_score as number | null,
    technicalScore: assessment.technical_score as number | null,
    codingScore: assessment.coding_score as number | null,
  };

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto">
      {/* Sticky Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-800 border-b-2 border-gray-600 sticky top-0 z-20 shadow-lg">
        <div className="px-8 py-5">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/90 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Assessments
          </button>
          
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl text-white">{assessment.title}</h1>
                  {/* Version Badge */}
                  <span className="px-2 py-1 bg-blue-500/20 backdrop-blur-sm text-blue-100 rounded text-xs font-medium border border-blue-400/30">
                    V{assessment.version || 1}
                  </span>
                  {sections.length > 0 && (
                    <span className="px-2 py-1 bg-gray-700/30 backdrop-blur-sm text-white rounded text-xs flex items-center gap-1 border border-white/20">
                      <Sparkles className="w-3 h-3" />
                      AI-Generated
                    </span>
                  )}
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    assessment.status === 'Active'
                      ? 'bg-green-500/20 text-green-100 border border-green-400/30'
                      : assessment.status === 'Draft'
                      ? 'bg-yellow-500/20 text-yellow-100 border border-yellow-400/30'
                      : 'bg-gray-500/20 text-gray-100 border border-gray-400/30'
                  }`}>
                    {assessment.status}
                  </span>
                </div>

                {/* Assessment ID & JD ID */}
                <div className="text-xs text-gray-300 mb-2">
                  Assessment ID: <span className="font-medium text-white">{assessment.short_id || `AS-${String(assessment.id).slice(0, 8).toUpperCase()}`}</span>
                  {assessment.jd_short_id && (
                    <span className="ml-3">| JD ID: <span className="font-medium text-white">{assessment.jd_short_id}</span></span>
                  )}
                </div>

                {assessment.job && (
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="w-4 h-4 text-gray-200" />
                    <span className="text-gray-100 text-sm">
                      Linked to: {assessment.job.title}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-6 text-sm text-gray-100">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {formattedDuration}
                  </span>
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {sections.length} section{sections.length !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    {assessment.candidates || 0} candidates
                  </span>
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Created {assessment.created_at
                      ? `${new Date(assessment.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date(assessment.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}`
                      : assessment.created}
                  </span>
                  {assessment.created_by_name && (
                    <span className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      By {assessment.created_by_name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={onShare}
                className="px-4 py-2 bg-white text-gray-800 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2 font-medium"
              >
                <Mail className="w-4 h-4" />
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-[168px] z-10">
        <div className="px-8">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 text-sm border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('sections')}
              className={`py-4 text-sm border-b-2 transition-colors ${
                activeTab === 'sections'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Sections & Questions
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-4 text-sm border-b-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`py-4 text-sm border-b-2 transition-colors ${
                activeTab === 'activity'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Recent Activity
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`py-4 text-sm border-b-2 transition-colors ${
                activeTab === 'versions'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Version History
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6 w-full">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Assessment Details Section */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-base font-medium text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-600" />
                  Assessment Details
                </h3>
              </div>

              <div className="p-6">
                {/* Total Duration Card */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Total Duration</div>
                      <div className="text-xl font-semibold text-gray-900">{formattedDuration}</div>
                    </div>
                  </div>
                  <span className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg">
                    100%
                  </span>
                </div>

                {/* Assessment Rounds */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700">Assessment Rounds</h4>

                  {assessment.hr_enabled && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-blue-500 text-white text-sm font-medium rounded">
                          HR Round
                        </span>
                        <span className="px-3 py-1 bg-blue-500 text-white text-sm font-medium rounded-lg">
                          {assessment.hr_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.hr_topics || []).length > 0 ? (
                            (assessment.hr_topics || []).map((topic: string, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-white border border-blue-200 text-blue-700 rounded text-xs">
                                {topic}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-white border border-blue-200 text-blue-700 rounded text-xs">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {assessment.technical_enabled && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-purple-500 text-white text-sm font-medium rounded">
                          Technical Round
                        </span>
                        <span className="px-3 py-1 bg-purple-500 text-white text-sm font-medium rounded-lg">
                          {assessment.technical_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.technical_topics || []).length > 0 ? (
                            (assessment.technical_topics || []).map((topic: string, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-white border border-purple-200 text-purple-700 rounded text-xs">
                                {topic}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-white border border-purple-200 text-purple-700 rounded text-xs">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {assessment.coding_enabled && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-green-500 text-white text-sm font-medium rounded">
                          Coding Round
                        </span>
                        <span className="px-3 py-1 bg-green-500 text-white text-sm font-medium rounded-lg">
                          {assessment.coding_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.coding_topics || []).length > 0 ? (
                            (assessment.coding_topics || []).map((topic: string, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-white border border-green-200 text-green-700 rounded text-xs">
                                {topic}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-white border border-green-200 text-green-700 rounded text-xs">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Invitation Status Section */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-base font-medium text-gray-900 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-gray-600" />
                  Invitation Status
                </h3>
                <button
                  onClick={() => setActiveTab('activity')}
                  className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Full Tracking
                </button>
              </div>

              <div className="p-6">
                {/* Quick Stats */}
                <div className="grid grid-cols-5 gap-4 mb-6">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-gray-600 text-xs mb-2">
                      <Users className="w-4 h-4" />
                      <span>Total</span>
                    </div>
                    <div className="text-2xl font-semibold text-gray-900">{analyticsData.totalInvites}</div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-600 text-xs mb-2">
                      <Mail className="w-4 h-4" />
                      <span>Sent</span>
                    </div>
                    <div className="text-2xl font-semibold text-gray-900">{analyticsData.sent || 0}</div>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-600 text-xs mb-2">
                      <XCircle className="w-4 h-4" />
                      <span>Failed</span>
                    </div>
                    <div className="text-2xl font-semibold text-gray-900">{analyticsData.failed || 0}</div>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-yellow-600 text-xs mb-2">
                      <Play className="w-4 h-4" />
                      <span>Started</span>
                    </div>
                    <div className="text-2xl font-semibold text-gray-900">{analyticsData.started || 0}</div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-600 text-xs mb-2">
                      <CheckCircle className="w-4 h-4" />
                      <span>Completed</span>
                    </div>
                    <div className="text-2xl font-semibold text-gray-900">{analyticsData.completed}</div>
                  </div>
                </div>

                {/* Recent Invitations */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Invitations</h4>
                  {activityLoading ? (
                    <div className="py-12 text-center">
                      <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-gray-600">Loading invitations...</p>
                    </div>
                  ) : recentActivity.length === 0 ? (
                    <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-lg">
                      <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600 mb-1">No invitations sent yet</p>
                      <p className="text-sm text-gray-500">Invite candidates to start tracking their progress</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentActivity.slice(0, 5).map((activity: any) => {
                        const getStatusBadge = () => {
                          if (activity.status === 'completed') {
                            return { color: 'bg-green-100 text-green-700', label: 'Completed' };
                          } else if (activity.status === 'in_progress') {
                            return { color: 'bg-yellow-100 text-yellow-700', label: 'In Progress' };
                          } else if (activity.status === 'sent') {
                            return { color: 'bg-blue-100 text-blue-700', label: 'Sent' };
                          } else if (activity.status === 'failed') {
                            return { color: 'bg-red-100 text-red-700', label: 'Failed' };
                          }
                          return { color: 'bg-gray-100 text-gray-700', label: 'Pending' };
                        };

                        const statusBadge = getStatusBadge();
                        const activityDate = activity.sent_at || activity.created_at;
                        const formattedDate = activityDate ? new Date(activityDate).toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        }) : 'N/A';

                        return (
                          <div key={activity.id} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                                {activity.candidate_name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900">{activity.candidate_name || 'Unknown'}</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge.color}`}>
                                      {statusBadge.label}
                                    </span>
                                  </div>
                                  {activity.status === 'completed' && (
                                    <div className="flex items-center gap-3">
                                      {/* Show Tech Score if technical section is enabled */}
                                      {assessment.technical_enabled && activity.technical_score != null && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs text-gray-600">Tech</span>
                                          <span className="font-semibold text-gray-900">{Math.round(activity.technical_score)}%</span>
                                        </div>
                                      )}
                                      {/* Show Coding Score if coding section is enabled */}
                                      {assessment.coding_enabled && activity.coding_score != null && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs text-gray-600">Coding</span>
                                          <span className="font-semibold text-gray-900">{Math.round(activity.coding_score)}%</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-600">
                                  <span className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    {activity.candidate_email}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Sent: {formattedDate}
                                  </span>
                                </div>
                                {activity.status === 'in_progress' && activity.progress != null && (
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                      <span>{activity.progress}% Complete</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                      <div
                                        className="bg-yellow-500 h-2 rounded-full transition-all"
                                        style={{ width: `${activity.progress}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-base font-medium text-gray-900">Quick Actions</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={async () => {
                    if (assessment.status === 'Draft') {
                      alert('Please publish the assessment before sharing');
                      return;
                    }
                    try {
                      // Create a generic invitation to get a shareable link
                      const invitation = await assessmentService.invite(assessment.id, {
                        candidate_name: 'Anonymous Candidate',
                        candidate_email: `anonymous-${Date.now()}@example.com`,
                      });
                      const shareableLink = `${window.location.origin}/assessment/take/${invitation.invitation_token}`;

                      // Copy to clipboard with fallback
                      try {
                        await navigator.clipboard.writeText(shareableLink);
                      } catch (clipboardError) {
                        // Fallback for when document is not focused
                        const textArea = document.createElement('textarea');
                        textArea.value = shareableLink;
                        textArea.style.position = 'fixed';
                        textArea.style.left = '-9999px';
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                      }
                      alert('Shareable link copied! This link can be used by one candidate.');
                    } catch (error) {
                      console.error('Failed to generate link:', error);
                      alert('Failed to generate shareable link. Please try Share via Email instead.');
                    }
                  }}
                  disabled={assessment.status === 'Draft'}
                  className={`p-4 border-2 rounded-lg transition-all text-left ${
                    assessment.status === 'Draft'
                      ? 'border-gray-200 bg-gray-100 cursor-not-allowed opacity-60'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Link2 className="w-6 h-6 text-gray-800 mb-2" />
                  <div className="text-sm font-medium text-gray-900">Copy Link</div>
                  <div className="text-xs text-gray-600 mt-1">
                    {assessment.status === 'Draft' ? 'Publish first' : 'Share assessment URL'}
                  </div>
                </button>

                <button
                  onClick={async () => {
                    setActionLoading('export');
                    try {
                      const blob = await assessmentService.exportResults(assessment.id, 'csv');
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${assessment.title.replace(/[^a-z0-9]/gi, '_')}_results.csv`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                      alert('Results exported successfully!');
                    } catch (error) {
                      console.error('Export failed:', error);
                      alert('Failed to export results. Make sure there are completed assessments to export.');
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                  disabled={actionLoading === 'export'}
                  className={`p-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left ${actionLoading === 'export' ? 'opacity-50 cursor-wait' : ''}`}
                >
                  <Download className={`w-6 h-6 text-gray-800 mb-2 ${actionLoading === 'export' ? 'animate-pulse' : ''}`} />
                  <div className="text-sm font-medium text-gray-900">{actionLoading === 'export' ? 'Exporting...' : 'Export Results'}</div>
                  <div className="text-xs text-gray-600 mt-1">Download as CSV</div>
                </button>

                <button
                  onClick={async () => {
                    setActionLoading('duplicate');
                    try {
                      const result = await assessmentService.clone(assessment.id, `${assessment.title} (Copy)`);
                      alert(`Assessment duplicated successfully! New assessment: "${result.cloned_title}"`);
                      onRefresh?.();
                    } catch (error) {
                      console.error('Duplicate failed:', error);
                      alert('Failed to duplicate assessment. Please try again.');
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                  disabled={actionLoading === 'duplicate'}
                  className={`p-4 border-2 border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-all text-left ${actionLoading === 'duplicate' ? 'opacity-50 cursor-wait' : ''}`}
                >
                  <Copy className={`w-6 h-6 text-green-600 mb-2 ${actionLoading === 'duplicate' ? 'animate-pulse' : ''}`} />
                  <div className="text-sm font-medium text-gray-900">{actionLoading === 'duplicate' ? 'Duplicating...' : 'Duplicate'}</div>
                  <div className="text-xs text-gray-600 mt-1">Create a copy</div>
                </button>

                {assessment.candidates > 0 && (
                  <button
                    onClick={onViewResults}
                    className="p-4 border-2 border-gray-200 bg-gray-50 rounded-lg hover:border-gray-400 hover:bg-gray-100 transition-all text-left"
                  >
                    <BarChart className="w-6 h-6 text-gray-800 mb-2" />
                    <div className="text-sm font-medium text-gray-900">View Results</div>
                    <div className="text-xs text-gray-600 mt-1">{assessment.candidates} responses</div>
                  </button>
                )}

                <button
                  onClick={async () => {
                    if (!confirm('Archive this assessment? It will be moved to the archived section.')) return;
                    setActionLoading('archive');
                    try {
                      await assessmentService.update(assessment.id, { status: 'archived' });
                      alert('Assessment archived successfully!');
                      onRefresh?.();
                      onBack();
                    } catch (error) {
                      console.error('Archive failed:', error);
                      alert('Failed to archive assessment. Please try again.');
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                  disabled={actionLoading === 'archive' || assessment.status === 'Archived'}
                  className={`p-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left ${actionLoading === 'archive' || assessment.status === 'Archived' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Archive className={`w-6 h-6 text-gray-600 mb-2 ${actionLoading === 'archive' ? 'animate-pulse' : ''}`} />
                  <div className="text-sm font-medium text-gray-900">{actionLoading === 'archive' ? 'Archiving...' : 'Archive'}</div>
                  <div className="text-xs text-gray-600 mt-1">{assessment.status === 'Archived' ? 'Already archived' : 'Move to archive'}</div>
                </button>

                <button
                  onClick={async () => {
                    if (!confirm('Delete this assessment permanently? This action cannot be undone.')) return;
                    setActionLoading('delete');
                    try {
                      await assessmentService.delete(assessment.id);
                      alert('Assessment deleted successfully!');
                      onRefresh?.();
                      onBack();
                    } catch (error) {
                      console.error('Delete failed:', error);
                      alert('Failed to delete assessment. Only draft assessments can be deleted.');
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                  disabled={actionLoading === 'delete'}
                  className={`p-4 border-2 border-red-200 rounded-lg hover:border-red-300 hover:bg-red-50 transition-all text-left ${actionLoading === 'delete' ? 'opacity-50 cursor-wait' : ''}`}
                >
                  <Trash2 className={`w-6 h-6 text-red-600 mb-2 ${actionLoading === 'delete' ? 'animate-pulse' : ''}`} />
                  <div className="text-sm font-medium text-gray-900">{actionLoading === 'delete' ? 'Deleting...' : 'Delete'}</div>
                  <div className="text-xs text-gray-600 mt-1">Permanent removal</div>
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Sections Tab */}
        {activeTab === 'sections' && (
          <div className="space-y-4">
            {sections.length > 0 ? (
              sections.map((section, index) => {
                const SectionIcon = section.icon;
                return (
                  <div key={section.type} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-white">
                            <SectionIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-gray-900 font-medium">{section.name}</h4>
                            <div className="text-sm text-gray-600 mt-0.5">
                              {section.percentage}% of total score
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-gray-100 text-gray-900 rounded-full text-xs font-medium">
                            {section.percentage} points
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="text-sm text-gray-700 mb-4">
                        {section.type === 'hr' && 'Evaluates communication skills, cultural fit, and behavioral competencies.'}
                        {section.type === 'technical' && 'Tests domain knowledge, technical concepts, and problem-solving abilities.'}
                        {section.type === 'coding' && 'Assesses programming skills through hands-on coding challenges.'}
                      </div>

                      {/* Topics */}
                      {section.topics.length > 0 && (
                        <div className="mb-4">
                          <div className="text-xs text-gray-600 mb-2 font-medium">Topics Covered</div>
                          <div className="flex flex-wrap gap-2">
                            {section.topics.map((topic, i) => (
                              <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Coding Languages */}
                      {section.type === 'coding' && section.languages && section.languages.length > 0 && (
                        <div className="mb-4">
                          <div className="text-xs text-gray-600 mb-2 font-medium">Programming Languages</div>
                          <div className="flex flex-wrap gap-2">
                            {section.languages.map((lang, i) => (
                              <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono">
                                {lang}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-600 mb-1">Question Type</div>
                          <div className="text-sm text-gray-900">
                            {section.type === 'coding' ? 'Code Challenge' : 'Mixed Format'}
                          </div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-600 mb-1">Time Allocation</div>
                          <div className="text-sm text-gray-900">
                            {Math.round((assessment.duration_minutes || 30) * (section.percentage / 100))} min
                          </div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-600 mb-1">Weightage</div>
                          <div className="text-sm text-gray-900">{section.percentage}%</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">No sections configured</p>
                <p className="text-sm text-gray-500">This assessment doesn't have structured sections</p>
              </div>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Performance Breakdown */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h3 className="text-base font-medium text-gray-900 mb-6">Performance Breakdown</h3>

              {analyticsData.completed === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 mb-1">No performance data available yet</p>
                  <p className="text-sm text-gray-500">Data will appear after candidates complete the assessment</p>
                </div>
              ) : (
                <div className={`grid grid-cols-1 ${assessment.technical_enabled && assessment.coding_enabled ? 'md:grid-cols-2' : ''} gap-8`}>
                  {/* Technical Performance */}
                  {assessment.technical_enabled && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-4">Technical Performance</h4>
                    <div className="space-y-4">
                      {/* Passed (≥70%) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-700">Passed (≥70%)</span>
                          <span className="text-sm font-semibold text-green-600">
                            {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) >= 70).length / analyticsData.completed) * 100) || 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-green-500 h-3 rounded-full transition-all"
                            style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) >= 70).length / analyticsData.completed) * 100 || 0}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Average (50-69%) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-700">Average (50-69%)</span>
                          <span className="text-sm font-semibold text-yellow-600">
                            {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) >= 50 && (a.technical_score || 0) < 70).length / analyticsData.completed) * 100) || 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-yellow-500 h-3 rounded-full transition-all"
                            style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) >= 50 && (a.technical_score || 0) < 70).length / analyticsData.completed) * 100 || 0}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Below Average (<50%) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-700">Below Average (&lt;50%)</span>
                          <span className="text-sm font-semibold text-red-600">
                            {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) < 50).length / analyticsData.completed) * 100) || 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-red-500 h-3 rounded-full transition-all"
                            style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) < 50).length / analyticsData.completed) * 100 || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Coding Performance */}
                  {assessment.coding_enabled && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-4">Coding Performance</h4>
                    <div className="space-y-4">
                      {/* Passed (≥70%) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-700">Passed (≥70%)</span>
                          <span className="text-sm font-semibold text-green-600">
                            {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) >= 70).length / analyticsData.completed) * 100) || 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-green-500 h-3 rounded-full transition-all"
                            style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) >= 70).length / analyticsData.completed) * 100 || 0}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Average (50-69%) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-700">Average (50-69%)</span>
                          <span className="text-sm font-semibold text-yellow-600">
                            {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) >= 50 && (a.coding_score || 0) < 70).length / analyticsData.completed) * 100) || 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-yellow-500 h-3 rounded-full transition-all"
                            style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) >= 50 && (a.coding_score || 0) < 70).length / analyticsData.completed) * 100 || 0}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Below Average (<50%) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-700">Below Average (&lt;50%)</span>
                          <span className="text-sm font-semibold text-red-600">
                            {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) < 50).length / analyticsData.completed) * 100) || 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-red-500 h-3 rounded-full transition-all"
                            style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) < 50).length / analyticsData.completed) * 100 || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>

            {/* All Candidates */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-base font-medium text-gray-900">All Candidates</h3>
                <button
                  onClick={() => setActiveTab('activity')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  View Full Tracking
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {activityLoading ? (
                <div className="px-6 py-12 text-center">
                  <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-gray-600">Loading candidates...</p>
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 mb-1">No candidates yet</p>
                  <p className="text-sm text-gray-500">Candidates will appear here after being invited</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                        {assessment.technical_enabled && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tech Score</th>
                        )}
                        {assessment.coding_enabled && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coding Score</th>
                        )}
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completed</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {recentActivity.map((candidate: any) => {
                        const completedDate = candidate.completed_at ? new Date(candidate.completed_at).toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
                        }) : '-';

                        // Calculate duration from start and end times if available
                        let durationDisplay = '-';
                        if (candidate.started_at && candidate.completed_at) {
                          const startTime = new Date(candidate.started_at).getTime();
                          const endTime = new Date(candidate.completed_at).getTime();
                          const durationMs = endTime - startTime;
                          const durationMin = Math.round(durationMs / (1000 * 60));
                          durationDisplay = `${durationMin} min`;
                        } else if (candidate.time_taken_minutes) {
                          durationDisplay = `${candidate.time_taken_minutes} min`;
                        } else if (candidate.duration_minutes) {
                          durationDisplay = `${candidate.duration_minutes} min`;
                        }

                        // Determine status badge
                        const getStatusBadge = () => {
                          const status = candidate.status?.toLowerCase();
                          const techScore = candidate.technical_score || 0;
                          const codingScore = candidate.coding_score || 0;
                          const avgScore = (techScore + codingScore) / 2;

                          if (status === 'completed') {
                            if (avgScore >= 70) {
                              return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">Passed</span>;
                            } else if (avgScore >= 50) {
                              return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">Average</span>;
                            } else {
                              return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">Failed</span>;
                            }
                          } else if (status === 'in_progress' || status === 'started') {
                            return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">In Progress</span>;
                          } else if (status === 'invited' || status === 'pending') {
                            return <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">Invited</span>;
                          } else if (status === 'expired') {
                            return <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded">Expired</span>;
                          } else {
                            return <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">{status || 'Pending'}</span>;
                          }
                        };

                        return (
                          <tr key={candidate.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                                  {candidate.candidate_name?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                <span className="text-sm font-medium text-gray-900">{candidate.candidate_name || 'Unknown'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900">{candidate.candidate_email}</div>
                              <div className="text-xs text-gray-500">{candidate.candidate_phone || '+1 (555) 123-4567'}</div>
                            </td>
                            {assessment.technical_enabled && (
                            <td className="px-6 py-4">
                              {candidate.status === 'completed' && candidate.technical_score != null ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-900">{Math.round(candidate.technical_score)}%</span>
                                  <div className="w-24 bg-gray-200 rounded-full h-2">
                                    <div className={`h-2 rounded-full ${candidate.technical_score >= 70 ? 'bg-green-500' : candidate.technical_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                      style={{ width: `${candidate.technical_score}%` }}></div>
                                  </div>
                                </div>
                              ) : <span className="text-sm text-gray-500">-</span>}
                            </td>
                            )}
                            {assessment.coding_enabled && (
                            <td className="px-6 py-4">
                              {candidate.status === 'completed' && candidate.coding_score != null ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-900">{Math.round(candidate.coding_score)}%</span>
                                  <div className="w-24 bg-gray-200 rounded-full h-2">
                                    <div className={`h-2 rounded-full ${candidate.coding_score >= 70 ? 'bg-green-500' : candidate.coding_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                      style={{ width: `${candidate.coding_score}%` }}></div>
                                  </div>
                                </div>
                              ) : <span className="text-sm text-gray-500">-</span>}
                            </td>
                            )}
                            <td className="px-6 py-4">
                              {getStatusBadge()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{completedDate}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-1 text-sm text-gray-900">
                                <Clock className="w-4 h-4 text-gray-400" />{durationDisplay}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {candidate.status === 'completed' ? (
                                <button
                                  onClick={() => router.push(`/recruitment/assessments/${assessment.id}/results`)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg text-gray-900">Recent Activity</h3>
            </div>

            {activityLoading ? (
              <div className="px-6 py-12 text-center">
                <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">Loading activity...</p>
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 mb-1">No activity recorded yet</p>
                <p className="text-sm text-gray-500">Activity will appear here as candidates take the assessment</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentActivity.map((activity: any) => {
                  const getActivityInfo = () => {
                    if (activity.status === 'completed') {
                      return { icon: CheckCircle, color: 'text-green-600 bg-green-100', label: 'Completed assessment' };
                    } else if (activity.status === 'in_progress') {
                      return { icon: Play, color: 'text-blue-600 bg-blue-100', label: 'Started assessment' };
                    } else if (activity.status === 'expired') {
                      return { icon: XCircle, color: 'text-red-600 bg-red-100', label: 'Assessment expired' };
                    }
                    return { icon: Mail, color: 'text-gray-600 bg-gray-100', label: 'Invited to assessment' };
                  };

                  const info = getActivityInfo();
                  const ActivityIcon = info.icon;
                  const activityDate = activity.completed_at || activity.started_at || activity.created_at;
                  const formattedDate = activityDate ? new Date(activityDate).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
                  }) : 'N/A';

                  return (
                    <div key={activity.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${info.color}`}>
                          <ActivityIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-900">{activity.candidate_name || 'Unknown'}</span>
                              <span className="text-gray-500 ml-2">{info.label}</span>
                            </div>
                            <span className="text-sm text-gray-500">{formattedDate}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">{activity.candidate_email}</p>
                          {activity.status === 'completed' && (
                            <div className="flex items-center gap-3 mt-2">
                              {/* Show Tech Score if technical section is enabled */}
                              {assessment.technical_enabled && activity.technical_score != null && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-600">Tech:</span>
                                  <span className="text-sm font-semibold text-gray-900">{Math.round(activity.technical_score)}%</span>
                                </div>
                              )}
                              {/* Show Coding Score if coding section is enabled */}
                              {assessment.coding_enabled && activity.coding_score != null && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-600">Coding:</span>
                                  <span className="text-sm font-semibold text-gray-900">{Math.round(activity.coding_score)}%</span>
                                </div>
                              )}
                              {/* Show Passed/Failed badge */}
                              {activity.passed != null && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${activity.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {activity.passed ? 'Passed' : 'Failed'}
                                </span>
                              )}
                            </div>
                          )}
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
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-5 h-5 text-gray-600" />
                <h3 className="text-base font-medium text-gray-900">Version History</h3>
              </div>
              <p className="text-sm text-gray-600">Complete timeline of all changes made to this assessment</p>
            </div>

            {versionsLoading ? (
              <div className="px-6 py-12 text-center">
                <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">Loading version history...</p>
              </div>
            ) : versionHistory.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 mb-1">No version history available</p>
                <p className="text-sm text-gray-500">Version history will appear when the assessment is edited</p>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {versionHistory.map((version: any, idx: number) => {
                  const isCurrentVersion = idx === 0;
                  const versionDate = new Date(version.created_at).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  });

                  return (
                    <div key={version.id} className="space-y-4">
                      {/* Version Header */}
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-teal-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">V{version.version}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-base font-semibold text-gray-900">
                              Version {version.version} {version.version === 1 ? 'Published' : 'Updated'}
                            </h4>
                            {isCurrentVersion && (
                              <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                                Current Version
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-blue-600 mb-3">
                            {version.version === 1 ? 'Initial assessment created and published' : (version.change_summary || 'Assessment configuration updated')}
                          </p>

                          {/* User & Date Info */}
                          <div className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                            <Users className="w-4 h-4 text-gray-500" />
                            <span className="font-medium">{version.changed_by_name || 'Unknown User'}</span>
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-600">Lead Recruiter</span>
                          </div>

                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                            <Calendar className="w-4 h-4 text-gray-500" />
                            <span>Published on {versionDate} IST</span>
                          </div>

                          {/* Configuration Details */}
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="text-sm font-medium text-gray-900 mb-3">
                              {version.version === 1 ? 'Initial Configuration:' : 'Updated Configuration:'}
                            </div>
                            <ul className="space-y-2">
                              <li className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-green-600 mt-0.5">•</span>
                                <span>Assessment type: {[
                                  version.hr_enabled && 'HR',
                                  version.technical_enabled && 'Technical',
                                  version.coding_enabled && 'Coding'
                                ].filter(Boolean).join(', ')}</span>
                              </li>
                              <li className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-green-600 mt-0.5">•</span>
                                <span>Duration set to {assessment.duration_minutes || 60} min</span>
                              </li>
                              {assessment.title && (
                                <li className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-green-600 mt-0.5">•</span>
                                  <span>Linked to job posting: {assessment.title}</span>
                                </li>
                              )}
                              <li className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-green-600 mt-0.5">•</span>
                                <span>Proctoring {assessment.proctoring_enabled ? 'enabled' : 'disabled'} with AI monitoring</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}