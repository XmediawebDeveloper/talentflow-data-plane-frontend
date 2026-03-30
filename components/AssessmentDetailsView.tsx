import { ArrowLeft, Clock, Users, FileText, Award, Calendar, TrendingUp, Edit2, Eye, Mail, BarChart, Share2, Download, Copy, Archive, Trash2, Play, PauseCircle, CheckCircle, XCircle, AlertCircle, Briefcase, Target, Sparkles, Link2, Code, MessageSquare, Cpu, User, ExternalLink, Info, Layers, Star, Globe, Zap } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { assessmentService } from '@/lib/services';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import VersionBadge from './VersionBadge';
import { formatIST } from '@/lib/utils/dateUtils';

interface AssessmentDetailsViewProps {
  assessment: any;
  onBack: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onShare?: () => void;
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

// IST timezone constant
const INDIA_TIMEZONE = 'Asia/Kolkata';

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
  const dialog = useGlobalDialog();
  const { isTenantAdmin, user } = useAuth();
  const canCreateAssessments = isTenantAdmin || (user?.permissions?.canCreateAssessments ?? false);
  const [activeTab, setActiveTab] = useState<'overview' | 'sections' | 'analytics' | 'activity' | 'versions' | 'info'>('overview');
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

    // ==================== COMPILER AVAILABILITY CHECK ====================
    // Only show coding section if coding_enabled AND at least one language has a compiler
    if (assessment.coding_enabled) {
      // Languages with compilers (Piston API)
      const compilerLanguages = [
        'python', 'python3', 'javascript', 'js', 'java',
        'typescript', 'ts', 'cpp', 'c++', 'c', 'csharp', 'cs',
        'go', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'sql'
      ];

      const codingLanguages = assessment.coding_languages || [];
      const hasCompiler = codingLanguages.some((lang: string) =>
        compilerLanguages.includes(lang.toLowerCase())
      );

      if (hasCompiler) {
        result.push({
          name: 'Coding',
          type: 'coding',
          enabled: true,
          percentage: assessment.coding_percentage || 0,
          topics: assessment.coding_topics || [],
          languages: codingLanguages,
          icon: Code
        });
      } else {
        console.log('[COMPILER-CHECK] ❌ Coding round hidden - no compilers for languages:', codingLanguages);
      }
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
        <div className="px-3 sm:px-5 lg:px-8 py-3 sm:py-4 lg:py-5">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 sm:gap-2 text-white/90 hover:text-white mb-3 sm:mb-4 transition-colors text-sm sm:text-base"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            Back to Assessments
          </button>
          
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-2 sm:gap-3 lg:gap-4 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div className="min-w-0">
                {/* Line 1: AS-022 SQL Developer - Assessment V1  Active AI-Generated */}
                <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2 flex-wrap">
                  <span className="px-1.5 sm:px-2 lg:px-2.5 py-0.5 sm:py-1 bg-white/90 text-gray-900 rounded text-xs sm:text-sm font-bold">
                    {assessment.short_id || `AS-${String(assessment.id).slice(0, 8).toUpperCase()}`}
                  </span>
                  <h1 className="text-sm sm:text-lg lg:text-2xl text-white font-semibold truncate">
                    {assessment.jd_title || stripVersionFromTitle(assessment.title)} - Assessment
                  </h1>
                  <VersionBadge version={assessment.version} size="md" variant="primary" />
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    assessment.status === 'Active'
                      ? 'bg-gray-200/30 text-gray-100 border border-gray-300/30'
                      : assessment.status === 'Draft'
                      ? 'bg-gray-400/30 text-gray-200 border border-gray-400/30'
                      : 'bg-gray-500/20 text-gray-100 border border-gray-400/30'
                  }`}>
                    {assessment.status}
                  </span>
                  {sections.length > 0 && (
                    <span className="px-2 py-1 bg-gray-700/30 backdrop-blur-sm text-white rounded text-xs flex items-center gap-1 border border-white/20">
                      <Sparkles className="w-3 h-3" />
                      AI-Generated
                    </span>
                  )}
                </div>

                {/* Line 2: Linked to: JD-025 - SQL Developer v2 */}
                {assessment.jd_short_id && (
                  <div className="text-sm text-gray-100 mb-2">
                    <span className="font-medium">Linked to: {assessment.jd_short_id}</span>
                    {assessment.jd_title && (
                      <span> - {assessment.jd_title}</span>
                    )}
                    {assessment.jd_version && (
                      <span className="ml-1 text-gray-300">v{assessment.jd_version}</span>
                    )}
                  </div>
                )}

                {/* Line 3: 30 min 3 sections 1 candidates Created 9 Feb 2026 at 06:46 pm Last Updated date_time */}
                <div className="text-xs sm:text-sm text-gray-100 flex items-center gap-2 sm:gap-3 lg:gap-4 flex-wrap">
                  <span>{formattedDuration}</span>
                  <span>{sections.length} section{sections.length !== 1 ? 's' : ''}</span>
                  <span>{assessment.candidates || 0} candidates</span>
                  {assessment.created_at && (
                    <span>
                      Created {formatIST(assessment.created_at)}
                    </span>
                  )}
                  {assessment.updated_at && (
                    <span>
                      Last Updated {formatIST(assessment.updated_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {onShare && canCreateAssessments && (
                <button
                  onClick={onShare}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white text-gray-800 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 font-medium text-xs sm:text-sm"
                >
                  <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Share
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-[120px] sm:top-[148px] lg:top-[168px] z-10">
        <div className="px-3 sm:px-5 lg:px-8">
          <div className="flex gap-3 sm:gap-4 lg:gap-6 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Assessment Details
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'activity'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Recent Activity
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'versions'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Version History
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`py-3 sm:py-4 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'info'
                  ? 'border-gray-800 text-gray-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Assessment Info
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-3 sm:px-5 lg:px-8 py-3 sm:py-4 lg:py-6 w-full">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Assessment Details Section */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
                <h3 className="text-sm sm:text-base font-medium text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                  Assessment Details
                </h3>
              </div>

              <div className="p-3 sm:p-4 lg:p-6">
                {/* Total Duration Card */}
                <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Total Duration</div>
                      <div className="text-xl font-semibold text-gray-900">{formattedDuration}</div>
                    </div>
                  </div>
                  <span className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg">
                    100%
                  </span>
                </div>

                {/* Assessment Rounds */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700">Assessment Rounds</h4>

                  {assessment.hr_enabled && (
                    <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-gray-700 text-white text-sm font-medium rounded">
                          HR Round
                        </span>
                        <span className="px-3 py-1 bg-gray-700 text-white text-sm font-medium rounded-lg">
                          {assessment.hr_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.hr_topics || []).length > 0 ? (
                            (assessment.hr_topics || []).map((topic: any, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs">
                                {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {assessment.technical_enabled && (
                    <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-gray-700 text-white text-sm font-medium rounded">
                          Technical Round
                        </span>
                        <span className="px-3 py-1 bg-gray-700 text-white text-sm font-medium rounded-lg">
                          {assessment.technical_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.technical_topics || []).length > 0 ? (
                            (assessment.technical_topics || []).map((topic: any, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs">
                                {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {(() => {
                    // ==================== COMPILER AVAILABILITY CHECK ====================
                    // Only show coding section if coding_enabled AND at least one language has a compiler
                    if (!assessment.coding_enabled) return null;

                    const compilerLanguages = [
                      'python', 'python3', 'javascript', 'js', 'java',
                      'typescript', 'ts', 'cpp', 'c++', 'c', 'csharp', 'cs',
                      'go', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'sql'
                    ];

                    const codingLanguages = assessment.coding_languages || [];
                    const hasCompiler = codingLanguages.some((lang: string) =>
                      compilerLanguages.includes(lang.toLowerCase())
                    );

                    if (!hasCompiler) return null;

                    return (
                    <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-gray-700 text-white text-sm font-medium rounded">
                          Coding Round
                        </span>
                        <span className="px-3 py-1 bg-gray-700 text-white text-sm font-medium rounded-lg">
                          {assessment.coding_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.coding_topics || []).length > 0 ? (
                            (assessment.coding_topics || []).map((topic: any, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs">
                                {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })()}
                </div>

                {/* Sections Details - Moved from Sections tab */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Section Details</h4>
                  <div className="space-y-4">
                    {sections.length > 0 ? (
                      sections.map((section, index) => {
                        const SectionIcon = section.icon;
                        return (
                          <div key={section.type} className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-white">
                                  <SectionIcon className="w-5 h-5" />
                                </div>
                                <div>
                                  <h5 className="text-gray-900 font-medium">{section.name}</h5>
                                  <div className="text-xs text-gray-600 mt-0.5">
                                    {section.percentage}% of total score
                                  </div>
                                </div>
                              </div>
                              <span className="px-3 py-1 bg-gray-100 text-gray-900 rounded-full text-xs font-medium">
                                {section.percentage} points
                              </span>
                            </div>

                            <div className="text-sm text-gray-700 mb-3">
                              {section.type === 'hr' && 'Evaluates communication skills, cultural fit, and behavioral competencies.'}
                              {section.type === 'technical' && 'Tests domain knowledge, technical concepts, and problem-solving abilities.'}
                              {section.type === 'coding' && 'Assesses programming skills through hands-on coding challenges.'}
                            </div>

                            {/* Topics */}
                            {section.topics.length > 0 && (
                              <div className="mb-3">
                                <div className="text-xs text-gray-600 mb-2 font-medium">Topics Covered</div>
                                <div className="flex flex-wrap gap-2">
                                  {section.topics.map((topic: any, i: number) => (
                                    <span key={i} className="px-2 py-1 bg-white border border-gray-200 text-gray-700 rounded text-xs">
                                      {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Coding Languages */}
                            {section.type === 'coding' && section.languages && section.languages.length > 0 && (
                              <div className="mb-3">
                                <div className="text-xs text-gray-600 mb-2 font-medium">Programming Languages</div>
                                <div className="flex flex-wrap gap-2">
                                  {section.languages.map((lang, i) => (
                                    <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                                      {lang}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                              <div className="p-2 bg-white rounded border border-gray-200">
                                <div className="text-xs text-gray-600 mb-1">Question Type</div>
                                <div className="text-xs text-gray-900 font-medium">
                                  {section.type === 'coding' ? 'Code Challenge' : 'Mixed Format'}
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded border border-gray-200">
                                <div className="text-xs text-gray-600 mb-1">Time Allocation</div>
                                <div className="text-xs text-gray-900 font-medium">
                                  {Math.round((assessment.duration_minutes || 30) * (section.percentage / 100))} min
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded border border-gray-200">
                                <div className="text-xs text-gray-600 mb-1">Weightage</div>
                                <div className="text-xs text-gray-900 font-medium">{section.percentage}%</div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600 text-sm">No sections configured</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Analytics - Moved from Analytics tab */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Performance Analytics</h4>

                  {analyticsData.completed === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                      <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-600 text-sm mb-1">No performance data available yet</p>
                      <p className="text-xs text-gray-500">Data will appear after candidates complete the assessment</p>
                    </div>
                  ) : (
                    <div className={`grid grid-cols-1 ${assessment.technical_enabled && assessment.coding_enabled ? 'md:grid-cols-2' : ''} gap-6`}>
                      {/* Technical Performance */}
                      {assessment.technical_enabled && (
                        <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
                          <h5 className="text-sm font-semibold text-gray-900 mb-4">Technical Performance</h5>
                          <div className="space-y-3">
                            {/* Passed (≥70%) */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-700">Passed (≥70%)</span>
                                <span className="text-sm font-semibold text-gray-800">
                                  {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) >= 70).length / analyticsData.completed) * 100) || 0}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-gray-700 h-2 rounded-full transition-all"
                                  style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) >= 70).length / analyticsData.completed) * 100 || 0}%` }}
                                ></div>
                              </div>
                            </div>

                            {/* Average (50-69%) */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-700">Average (50-69%)</span>
                                <span className="text-sm font-semibold text-gray-600">
                                  {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) >= 50 && (a.technical_score || 0) < 70).length / analyticsData.completed) * 100) || 0}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-gray-500 h-2 rounded-full transition-all"
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
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-red-500 h-2 rounded-full transition-all"
                                  style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) < 50).length / analyticsData.completed) * 100 || 0}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Coding Performance */}
                      {assessment.coding_enabled && (
                        <div className="bg-gray-100 border border-gray-200 rounded-lg p-4">
                          <h5 className="text-sm font-semibold text-gray-900 mb-4">Coding Performance</h5>
                          <div className="space-y-3">
                            {/* Passed (≥70%) */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-700">Passed (≥70%)</span>
                                <span className="text-sm font-semibold text-gray-800">
                                  {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) >= 70).length / analyticsData.completed) * 100) || 0}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-gray-700 h-2 rounded-full transition-all"
                                  style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) >= 70).length / analyticsData.completed) * 100 || 0}%` }}
                                ></div>
                              </div>
                            </div>

                            {/* Average (50-69%) */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-700">Average (50-69%)</span>
                                <span className="text-sm font-semibold text-gray-600">
                                  {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) >= 50 && (a.coding_score || 0) < 70).length / analyticsData.completed) * 100) || 0}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-gray-500 h-2 rounded-full transition-all"
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
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-red-500 h-2 rounded-full transition-all"
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
              </div>
            </div>

            {/* Invitation Status Section */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                <h3 className="text-sm sm:text-base font-medium text-gray-900 flex items-center gap-2">
                  <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                  Invitation Status
                </h3>
                <button
                  onClick={() => setActiveTab('activity')}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-700 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-1.5 sm:gap-2 w-fit"
                >
                  <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  View Full Tracking
                </button>
              </div>

              <div className="p-3 sm:p-4 lg:p-6">
                {/* Quick Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-gray-600 text-xs mb-1.5 sm:mb-2">
                      <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Total</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900">{analyticsData.totalInvites}</div>
                  </div>

                  <div className="bg-gray-100 border border-gray-200 rounded-lg p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-gray-600 text-xs mb-1.5 sm:mb-2">
                      <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Sent</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900">{analyticsData.sent || 0}</div>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-red-600 text-xs mb-1.5 sm:mb-2">
                      <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Failed</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900">{analyticsData.failed || 0}</div>
                  </div>

                  <div className="bg-gray-100 border border-gray-200 rounded-lg p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-gray-600 text-xs mb-1.5 sm:mb-2">
                      <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Started</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900">{analyticsData.started || 0}</div>
                  </div>

                  <div className="bg-gray-100 border border-gray-200 rounded-lg p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-gray-600 text-xs mb-1.5 sm:mb-2">
                      <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Completed</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900">{analyticsData.completed}</div>
                  </div>
                </div>

                {/* Recent Invitations */}
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Recent Invitations</h4>
                  {activityLoading ? (
                    <div className="py-8 sm:py-12 text-center">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-2 sm:mb-3"></div>
                      <p className="text-gray-600 text-xs sm:text-sm">Loading invitations...</p>
                    </div>
                  ) : recentActivity.length === 0 ? (
                    <div className="py-8 sm:py-12 text-center border-2 border-dashed border-gray-200 rounded-lg">
                      <Mail className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2 sm:mb-3" />
                      <p className="text-gray-600 mb-1 text-xs sm:text-sm">No invitations sent yet</p>
                      <p className="text-xs sm:text-sm text-gray-500">Invite candidates to start tracking their progress</p>
                    </div>
                  ) : (
                    <div className="space-y-2 sm:space-y-3">
                      {recentActivity.slice(0, 5).map((activity: any) => {
                        const getStatusBadge = () => {
                          if (activity.status === 'completed') {
                            return { color: 'bg-gray-700 text-white', label: 'Completed' };
                          } else if (activity.status === 'in_progress') {
                            return { color: 'bg-gray-400 text-white', label: 'In Progress' };
                          } else if (activity.status === 'sent') {
                            return { color: 'bg-gray-200 text-gray-700', label: 'Sent' };
                          } else if (activity.status === 'failed') {
                            return { color: 'bg-red-100 text-red-700', label: 'Failed' };
                          }
                          return { color: 'bg-gray-100 text-gray-700', label: 'Pending' };
                        };

                        const statusBadge = getStatusBadge();
                        const activityDate = activity.sent_at || activity.created_at;
                        const formattedDate = activityDate ? formatIST(activityDate) : 'N/A';

                        return (
                          <div key={activity.id} className="bg-gray-50 rounded-lg p-2.5 sm:p-3 lg:p-4 hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-700 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 text-xs sm:text-sm">
                                {activity.candidate_name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-0.5 sm:gap-0">
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                    <span className="font-medium text-gray-900 text-xs sm:text-sm truncate">{activity.candidate_name || 'Unknown'}</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge.color}`}>
                                      {statusBadge.label}
                                    </span>
                                  </div>
                                  {activity.status === 'completed' && (
                                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                      {/* Show Tech Score if technical section is enabled */}
                                      {assessment.technical_enabled && activity.technical_score != null && (
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-gray-600">Tech</span>
                                          <span className="font-semibold text-gray-900 text-xs sm:text-sm">{Math.round(activity.technical_score)}%</span>
                                        </div>
                                      )}
                                      {/* Show Coding Score if coding section is enabled */}
                                      {assessment.coding_enabled && activity.coding_score != null && (
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-gray-600">Coding</span>
                                          <span className="font-semibold text-gray-900 text-xs sm:text-sm">{Math.round(activity.coding_score)}%</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-gray-600">
                                  <span className="flex items-center gap-1 truncate">
                                    <Mail className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{activity.candidate_email}</span>
                                  </span>
                                  <span className="flex items-center gap-1 whitespace-nowrap">
                                    <Calendar className="w-3 h-3 flex-shrink-0" />
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
                                        className="bg-gray-600 h-2 rounded-full transition-all"
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
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
                <h3 className="text-sm sm:text-base font-medium text-gray-900">Quick Actions</h3>
              </div>
              <div className="p-3 sm:p-4 lg:p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                {canCreateAssessments && (
                <button
                  onClick={async () => {
                    if (assessment.status === 'Draft') {
                      toast.warning('Please publish the assessment before sharing');
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
                      toast.success('Shareable link copied! This link can be used by one candidate.');
                    } catch (error) {
                      console.error('Failed to generate link:', error);
                      toast.error('Failed to generate shareable link. Please try Share via Email instead.');
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
                )}

                {canExport && (
                <button
                  onClick={async () => {
                    setActionLoading('export');
                    try {
                      const blob = await assessmentService.exportResults(assessment.id, 'excel');
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${assessment.title.replace(/[^a-z0-9]/gi, '_')}_results.xlsx`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                      toast.success('Results exported successfully!');
                    } catch (error) {
                      console.error('Export failed:', error);
                      toast.error('Failed to export results. Make sure there are completed assessments to export.');
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
                )}

                {canCreateAssessments && (
                <button
                  onClick={async () => {
                    setActionLoading('duplicate');
                    try {
                      const result = await assessmentService.clone(assessment.id, `${assessment.title} (Copy)`);
                      toast.success(`Assessment duplicated successfully! New assessment: "${result.cloned_title}"`);
                      onRefresh?.();
                    } catch (error) {
                      console.error('Duplicate failed:', error);
                      toast.error('Failed to duplicate assessment. Please try again.');
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                  disabled={actionLoading === 'duplicate'}
                  className={`p-4 border-2 border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-100 transition-all text-left ${actionLoading === 'duplicate' ? 'opacity-50 cursor-wait' : ''}`}
                >
                  <Copy className={`w-6 h-6 text-gray-700 mb-2 ${actionLoading === 'duplicate' ? 'animate-pulse' : ''}`} />
                  <div className="text-sm font-medium text-gray-900">{actionLoading === 'duplicate' ? 'Duplicating...' : 'Duplicate'}</div>
                  <div className="text-xs text-gray-600 mt-1">Create a copy</div>
                </button>
                )}

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
                    if (!await dialog.confirm({ title: 'Archive Assessment', message: 'Archive this assessment? It will be moved to the archived section.', variant: 'warning', confirmText: 'Archive' })) return;
                    setActionLoading('archive');
                    try {
                      await assessmentService.update(assessment.id, { status: 'archived' });
                      toast.success('Assessment archived successfully!');
                      onRefresh?.();
                      onBack();
                    } catch (error) {
                      console.error('Archive failed:', error);
                      toast.error('Failed to archive assessment. Please try again.');
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
                    if (!await dialog.confirm({ title: 'Delete Assessment', message: 'Delete this assessment permanently? This action cannot be undone.', variant: 'error', confirmText: 'Delete' })) return;
                    setActionLoading('delete');
                    try {
                      await assessmentService.delete(assessment.id);
                      toast.success('Assessment deleted successfully!');
                      onRefresh?.();
                      onBack();
                    } catch (error) {
                      console.error('Delete failed:', error);
                      toast.error('Failed to delete assessment. Only draft assessments can be deleted.');
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

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
              <h3 className="text-sm sm:text-base lg:text-lg text-gray-900">Recent Activity</h3>
            </div>

            {activityLoading ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">Loading activity...</p>
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Calendar className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2 sm:mb-3" />
                <p className="text-gray-600 mb-1 text-sm">No activity recorded yet</p>
                <p className="text-xs sm:text-sm text-gray-500">Activity will appear here as candidates take the assessment</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentActivity.map((activity: any) => {
                  const getActivityInfo = () => {
                    if (activity.status === 'completed') {
                      return { icon: CheckCircle, color: 'text-gray-700 bg-gray-100', label: 'Completed assessment' };
                    } else if (activity.status === 'in_progress') {
                      return { icon: Play, color: 'text-gray-600 bg-gray-100', label: 'Started assessment' };
                    } else if (activity.status === 'expired') {
                      return { icon: XCircle, color: 'text-red-600 bg-red-100', label: 'Assessment expired' };
                    }
                    return { icon: Mail, color: 'text-gray-600 bg-gray-100', label: 'Invited to assessment' };
                  };

                  const info = getActivityInfo();
                  const ActivityIcon = info.icon;
                  const activityDate = activity.completed_at || activity.started_at || activity.created_at;
                  const formattedDate = activityDate ? formatIST(activityDate) : 'N/A';

                  return (
                    <div key={activity.id} className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start sm:items-center gap-2 sm:gap-3 lg:gap-4">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${info.color}`}>
                          <ActivityIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-0">
                            <div className="min-w-0">
                              <span className="font-medium text-gray-900 text-xs sm:text-sm">{activity.candidate_name || 'Unknown'}</span>
                              <span className="text-gray-500 ml-1 sm:ml-2 text-xs sm:text-sm">{info.label}</span>
                            </div>
                            <span className="text-xs sm:text-sm text-gray-500">{formattedDate}</span>
                          </div>
                          <p className="text-xs sm:text-sm text-gray-600 mt-0.5 truncate">{activity.candidate_email}</p>
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
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${activity.passed ? 'bg-gray-700 text-white' : 'bg-red-100 text-red-700'}`}>
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
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                <h3 className="text-sm sm:text-base font-medium text-gray-900">Version History</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-600">Complete timeline of all changes made to this assessment</p>
            </div>

            {versionsLoading ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">Loading version history...</p>
              </div>
            ) : versionHistory.length === 0 ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Clock className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2 sm:mb-3" />
                <p className="text-gray-600 mb-1 text-sm">No version history available</p>
                <p className="text-xs sm:text-sm text-gray-500">Version history will appear when the assessment is edited</p>
              </div>
            ) : (
              <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
                {versionHistory.map((version: any, idx: number) => {
                  const isCurrentVersion = idx === 0;
                  const versionDate = formatIST(version.created_at);

                  return (
                    <div key={version.id} className="space-y-4">
                      {/* Version Header */}
                      <div className="flex items-start gap-2 sm:gap-3 lg:gap-4">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-teal-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-xs sm:text-sm">V{version.version}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                            <h4 className="text-sm sm:text-base font-semibold text-gray-900">
                              Version {version.version} {version.version === 1 ? 'Published' : 'Updated'}
                            </h4>
                            {isCurrentVersion && (
                              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-gray-700 text-white text-xs font-medium rounded w-fit">
                                Current Version
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
                            {version.version === 1 ? 'Initial assessment created and published' : (version.change_summary || 'Assessment configuration updated')}
                          </p>

                          {/* User & Date Info */}
                          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-700 mb-1 flex-wrap">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                            <span className="font-medium">{version.changed_by_name || 'Unknown User'}</span>
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-600">Lead Recruiter</span>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 flex-wrap">
                            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                            <span>Published on {versionDate} IST (UTC+5:30)</span>
                          </div>

                          {/* Configuration Details */}
                          <div className="bg-gray-100 border border-gray-200 rounded-lg p-2.5 sm:p-3 lg:p-4">
                            <div className="text-xs sm:text-sm font-medium text-gray-900 mb-2 sm:mb-3">
                              {version.version === 1 ? 'Initial Configuration:' : 'Updated Configuration:'}
                            </div>
                            <ul className="space-y-1.5 sm:space-y-2">
                              <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                <span className="text-gray-600 mt-0.5">•</span>
                                <span>Assessment type: {[
                                  version.hr_enabled && 'HR',
                                  version.technical_enabled && 'Technical',
                                  version.coding_enabled && 'Coding'
                                ].filter(Boolean).join(', ')}</span>
                              </li>
                              <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                <span className="text-gray-600 mt-0.5">•</span>
                                <span>Duration set to {assessment.duration_minutes || 60} min</span>
                              </li>
                              {assessment.title && (
                                <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                  <span className="text-gray-600 mt-0.5">•</span>
                                  <span>Linked to job posting: {assessment.title}</span>
                                </li>
                              )}
                              <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                <span className="text-gray-600 mt-0.5">•</span>
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
      {/* Assessment Info Tab */}
      {activeTab === 'info' && (() => {
        const complexityLabel = (val: string | null | undefined) => {
          const map: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', expert: 'Expert' };
          return val ? (map[val] || val) : null;
        };
        const complexityColor = (val: string | null | undefined) => {
          const map: Record<string, string> = {
            low: 'bg-green-100 text-green-700 border-green-200',
            medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
            high: 'bg-orange-100 text-orange-700 border-orange-200',
            expert: 'bg-red-100 text-red-700 border-red-200',
          };
          return val ? (map[val] || 'bg-gray-100 text-gray-700 border-gray-200') : 'bg-gray-100 text-gray-700 border-gray-200';
        };
        const expLabel = (val: string | null | undefined) => {
          const map: Record<string, string> = {
            junior: 'Junior', mid: 'Mid-Level', senior: 'Senior', lead: 'Lead', expert: 'Expert',
          };
          return val ? (map[val] || val) : null;
        };
        const expColor = (val: string | null | undefined) => {
          const map: Record<string, string> = {
            junior: 'bg-blue-100 text-blue-700 border-blue-200',
            mid: 'bg-indigo-100 text-indigo-700 border-indigo-200',
            senior: 'bg-purple-100 text-purple-700 border-purple-200',
            lead: 'bg-pink-100 text-pink-700 border-pink-200',
            expert: 'bg-red-100 text-red-700 border-red-200',
          };
          return val ? (map[val] || 'bg-gray-100 text-gray-700 border-gray-200') : 'bg-gray-100 text-gray-700 border-gray-200';
        };

        const skillDepth: any[] = assessment.jd_skill_depth || [];
        const codingLanguages: string[] = assessment.coding_languages || [];
        const hasData = assessment.jd_complexity || assessment.jd_experience_level || assessment.jd_primary_domain || skillDepth.length > 0 || codingLanguages.length > 0;

        return (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                <h3 className="text-sm sm:text-base font-medium text-gray-900">Assessment Info</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-600">Metadata extracted from the job description used to generate this assessment</p>
            </div>

            {!hasData ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Info className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2 sm:mb-3" />
                <p className="text-gray-600 mb-1">No metadata available</p>
                <p className="text-sm text-gray-500">Assessment info will appear once the JD analysis is complete</p>
              </div>
            ) : (
              <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
                {/* Key Metadata Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                  {/* Job Complexity Level */}
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-gray-100 rounded-lg">
                        <Layers className="w-4 h-4 text-gray-600" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Job Complexity</span>
                    </div>
                    {assessment.jd_complexity ? (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${complexityColor(assessment.jd_complexity)}`}>
                        {complexityLabel(assessment.jd_complexity)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Not available</span>
                    )}
                  </div>

                  {/* Experience Level */}
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-gray-100 rounded-lg">
                        <TrendingUp className="w-4 h-4 text-gray-600" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Experience Level</span>
                    </div>
                    {assessment.jd_experience_level ? (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${expColor(assessment.jd_experience_level)}`}>
                        {expLabel(assessment.jd_experience_level)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Not available</span>
                    )}
                  </div>

                  {/* Primary Domain */}
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-gray-100 rounded-lg">
                        <Globe className="w-4 h-4 text-gray-600" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Primary Domain</span>
                    </div>
                    {assessment.jd_primary_domain ? (
                      <span className="text-sm font-medium text-gray-900">{assessment.jd_primary_domain}</span>
                    ) : (
                      <span className="text-sm text-gray-400">Not available</span>
                    )}
                  </div>

                  {/* Coding Requirement */}
                  <div className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-gray-100 rounded-lg">
                        <Code className="w-4 h-4 text-gray-600" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Coding Requirement</span>
                    </div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${assessment.coding_enabled ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {assessment.coding_enabled ? 'Required' : 'Not Required'}
                    </span>
                  </div>

                  {/* Eligible Programming Languages */}
                  <div className="rounded-lg border border-gray-200 p-4 sm:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-gray-100 rounded-lg">
                        <Zap className="w-4 h-4 text-gray-600" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Eligible Programming Languages</span>
                    </div>
                    {codingLanguages.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {codingLanguages.map((lang, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">{assessment.coding_enabled ? 'No languages specified' : 'N/A — coding not required'}</span>
                    )}
                  </div>
                </div>

                {/* Skill Depth */}
                {skillDepth.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Star className="w-4 h-4 text-gray-600" />
                      <h4 className="text-sm font-medium text-gray-900">Skill Depth</h4>
                      <span className="text-xs text-gray-500">(Must-have skills extracted from JD)</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {skillDepth.map((skill: any, idx: number) => {
                        const skillName = typeof skill === 'string' ? skill : skill?.name || skill?.skill || JSON.stringify(skill);
                        const level = typeof skill === 'object' ? (skill?.level || skill?.depth) : null;
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-50 text-gray-800 border border-gray-200"
                          >
                            {skillName}
                            {level && (
                              <span className="text-xs text-gray-500 font-normal">· {level}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
      </div>
    </div>
  );
}