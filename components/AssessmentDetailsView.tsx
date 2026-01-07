import { ArrowLeft, Clock, Users, FileText, Award, Calendar, TrendingUp, Edit2, Eye, Mail, BarChart, Share2, Download, Copy, Archive, Trash2, Play, PauseCircle, CheckCircle, XCircle, AlertCircle, Briefcase, Target, Sparkles, Link2, Code, MessageSquare, Cpu, User } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'sections' | 'analytics' | 'activity'>('overview');
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
    completed: assessment.completed_count || 0,
    inProgress: 0,  // Not tracked currently
    notStarted: (assessment.candidates || assessment.invitations_count || 0) - (assessment.completed_count || 0),
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
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl text-white">{assessment.title}</h1>
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
                
                {assessment.job && (
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="w-4 h-4 text-gray-200" />
                    <span className="text-gray-100 text-sm">
                      Linked to: {assessment.job.title} • {assessment.job.department}
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
                    Created {assessment.created}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={onEdit}
                className="px-4 py-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-2 border border-white/30"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={onPreview}
                className="px-4 py-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-2 border border-white/30"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
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
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6 w-full">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-6">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Users className="w-5 h-5 text-gray-800" />
                  </div>
                  <span className="text-sm text-gray-600">Total Invites</span>
                </div>
                <div className="text-3xl text-gray-900 mb-1">{analyticsData.totalInvites}</div>
                <div className="text-xs text-gray-500">All time</div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-sm text-gray-600">Completed</span>
                </div>
                <div className="text-3xl text-gray-900 mb-1">{analyticsData.completed}</div>
                <div className="text-xs text-gray-500">
                  {analyticsData.totalInvites > 0
                    ? `${Math.round((analyticsData.completed / analyticsData.totalInvites) * 100)}% completion rate`
                    : 'No invites yet'
                  }
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-gray-800" />
                  </div>
                  <span className="text-sm text-gray-600">Avg. Score</span>
                </div>
                <div className="text-3xl text-gray-900 mb-1">
                  {analyticsData.averageScore != null ? `${analyticsData.averageScore.toFixed(1)}%` : 'N/A'}
                </div>
                <div className="text-xs text-gray-500">Mean performance</div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                    <Award className="w-5 h-5 text-yellow-600" />
                  </div>
                  <span className="text-sm text-gray-600">Pass Rate</span>
                </div>
                <div className="text-3xl text-gray-900 mb-1">{analyticsData.passRate}</div>
                <div className="text-xs text-gray-500">70% threshold</div>
              </div>
            </div>

            {/* Assessment Details */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h3 className="text-lg text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-800" />
                Assessment Details
              </h3>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Assessment Type</div>
                  <div className="text-gray-900">
                    {sections.map(s => s.name).join(' + ') || 'General'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Duration</div>
                  <div className="text-gray-900">{formattedDuration}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Sections</div>
                  <div className="text-gray-900">{sections.length} section{sections.length !== 1 ? 's' : ''}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Passing Score</div>
                  <div className="text-gray-900">70%</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Proctoring</div>
                  <div className="text-gray-900">{assessment.proctoring_enabled ? 'Enabled' : 'Disabled'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Created On</div>
                  <div className="text-gray-900">{assessment.created}</div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h3 className="text-lg text-gray-900 mb-4">Quick Actions</h3>
              
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
            {/* Candidate Status */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h3 className="text-lg text-gray-900 mb-4">Candidate Status</h3>
              
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm text-gray-600">Completed</span>
                  </div>
                  <div className="text-2xl text-gray-900">{analyticsData.completed}</div>
                </div>

                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-yellow-600" />
                    <span className="text-sm text-gray-600">In Progress</span>
                  </div>
                  <div className="text-2xl text-gray-900">{analyticsData.inProgress}</div>
                </div>

                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-gray-600" />
                    <span className="text-sm text-gray-600">Not Started</span>
                  </div>
                  <div className="text-2xl text-gray-900">{analyticsData.notStarted}</div>
                </div>

                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-gray-800" />
                    <span className="text-sm text-gray-600">Avg. Time</span>
                  </div>
                  <div className="text-2xl text-gray-900">{analyticsData.averageTime}</div>
                </div>
              </div>
            </div>

            {/* Performance Breakdown */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h3 className="text-lg text-gray-900 mb-4">Performance Breakdown</h3>

              {analyticsData.totalInvites === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 mb-1">No performance data available yet</p>
                  <p className="text-sm text-gray-500">Data will appear after candidates complete the assessment</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-700">Passed (≥70%)</span>
                      <span className="text-sm font-medium text-gray-500">View Results for details</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className="bg-gray-300 h-3 rounded-full" style={{ width: '0%' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section Performance */}
            {sections.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <h3 className="text-lg text-gray-900 mb-4">Section Performance</h3>

                {analyticsData.totalInvites === 0 ? (
                  <div className="text-center py-8">
                    <BarChart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 mb-1">No section data available yet</p>
                    <p className="text-sm text-gray-500">Data will appear after candidates complete the assessment</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sections.map((section, index) => {
                      const SectionIcon = section.icon;
                      // Get section-specific score from assessment data
                      const sectionScore = section.type === 'hr' ? assessment.hr_score
                        : section.type === 'technical' ? assessment.technical_score
                        : section.type === 'coding' ? assessment.coding_score
                        : null;
                      const scoreDisplay = sectionScore != null ? `${sectionScore}%` : 'N/A';
                      const scoreWidth = sectionScore != null ? `${sectionScore}%` : '0%';

                      return (
                        <div key={section.type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center text-white">
                              <SectionIcon className="w-4 h-4" />
                            </div>
                            <span className="text-sm text-gray-900">{section.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm font-medium text-gray-700">{scoreDisplay}</div>
                              <div className="text-xs text-gray-500">Avg. Score</div>
                            </div>
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${sectionScore != null && sectionScore >= 70 ? 'bg-green-500' : 'bg-gray-400'}`}
                                style={{ width: scoreWidth }}
                              ></div>
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
                  const formattedDate = activityDate ? new Date(activityDate).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
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
                          {activity.status === 'completed' && activity.overall_score != null && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-sm font-medium ${activity.passed ? 'text-green-600' : 'text-red-600'}`}>
                                Score: {Math.round(activity.overall_score)}%
                              </span>
                              <span className={`px-2 py-0.5 rounded text-xs ${activity.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {activity.passed ? 'Passed' : 'Failed'}
                              </span>
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
      </div>
    </div>
  );
}