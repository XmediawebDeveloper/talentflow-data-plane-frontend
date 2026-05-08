import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Users, FileText, Award, Calendar, TrendingUp, Edit2, Eye, Mail, BarChart, Share2, Download, Copy, Archive, Trash2, Play, PauseCircle, CheckCircle, XCircle, AlertCircle, Briefcase, Target, Sparkles, Link2, Code, MessageSquare, Cpu, User, ExternalLink, Info, Layers, Star, Globe, Zap, Loader2 } from 'lucide-react';
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
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
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
  onRefresh,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
}: AssessmentDetailsViewProps) {
  const router = useRouter();
  const dialog = useGlobalDialog();
  const { isTenantAdmin, user } = useAuth();
  const canCreateAssessments = isTenantAdmin || (user?.permissions?.canCreateAssessments ?? false);
  const canExport = isTenantAdmin || (user?.permissions?.canExport ?? false);
  const [activeTab, setActiveTab] = useState<'overview' | 'sections' | 'analytics' | 'activity' | 'versions' | 'info'>('overview');
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PAGE_SIZE = 10;
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Fetch recent activity when assessment changes.
  // Each invitation is expanded into MULTIPLE timeline events (Invited,
  // Email Sent, Link Opened, Assessment Started, Completed, Bounced,
  // Expired) so the recruiter sees the full lifecycle, not just the latest
  // state. The list is then sorted newest-first and paginated client-side
  // (10 per page).
  useEffect(() => {
    const fetchActivity = async () => {
      if (!assessment?.id) return;
      setActivityLoading(true);
      try {
        const response = await assessmentService.listInvitations(assessment.id, { page_size: 200 });
        const invitations = response?.items || [];
        const events: any[] = [];
        const _now = Date.now();
        for (const inv of invitations) {
          if (inv.created_at) events.push({ ...inv, _eventType: 'invited', _eventAt: inv.created_at });
          if (inv.sent_at && inv.sent_at !== inv.created_at) {
            events.push({ ...inv, _eventType: 'sent', _eventAt: inv.sent_at });
          }
          if (inv.opened_at) events.push({ ...inv, _eventType: 'opened', _eventAt: inv.opened_at });
          if (inv.started_at) events.push({ ...inv, _eventType: 'started', _eventAt: inv.started_at });
          if (inv.completed_at) events.push({ ...inv, _eventType: 'completed', _eventAt: inv.completed_at });
          if (inv.bounced_at) events.push({ ...inv, _eventType: 'bounced', _eventAt: inv.bounced_at });
          // Expired event — clock-based when the link passed its deadline
          // without the candidate starting (and no unit was consumed).
          const clockExpired = inv.expires_at
            && new Date(inv.expires_at).getTime() < _now
            && !inv.started_at
            && !inv.completed_at
            && !inv.unit_consumed;
          if (clockExpired || (inv.status || '').toLowerCase() === 'expired') {
            events.push({ ...inv, _eventType: 'expired', _eventAt: inv.expires_at || inv.created_at });
          }
        }
        events.sort((a, b) => new Date(b._eventAt).getTime() - new Date(a._eventAt).getTime());
        setRecentActivity(events);
        setActivityPage(1);
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

  // Same single-bucket classifier as the Track Invites popup so the cards
  // here stay in sync. recentActivity is now an expanded event list (one
  // row per lifecycle moment), so we dedupe by invitation id before
  // bucketing.
  const _uniqueInvites: any[] = (() => {
    const seen = new Map<string, any>();
    for (const ev of recentActivity) {
      if (ev?.id && !seen.has(ev.id)) seen.set(ev.id, ev);
    }
    return Array.from(seen.values());
  })();
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
  const _bucketCounts = {
    completed: 0,
    failed: 0,
    expired: 0,
    started: 0,
    sent: 0,
  };
  for (const inv of _uniqueInvites) {
    _bucketCounts[_bucket(inv)] += 1;
  }
  const _totalInvites = assessment.candidates || assessment.invitations_count || _uniqueInvites.length || 0;
  const _completed = _bucketCounts.completed || assessment.completed_count || 0;
  const analyticsData = {
    totalInvites: _totalInvites,
    expired: _bucketCounts.expired,
    failed: _bucketCounts.failed,
    started: _bucketCounts.started || assessment.in_progress_count || 0,
    completed: _completed,
    inProgress: _bucketCounts.started || assessment.in_progress_count || 0,
    notStarted: assessment.pending_count || 0,
    completionRate: _totalInvites > 0 ? Math.round((_completed / _totalInvites) * 100) : 0,
    averageScore: assessment.average_score as number | null,
    averageTime: formatTime(assessment.average_time_seconds),
    passRate: assessment.pass_rate !== null && assessment.pass_rate !== undefined
      ? `${assessment.pass_rate}%`
      : 'N/A',
    hrScore: assessment.hr_score as number | null,
    technicalScore: assessment.technical_score as number | null,
    codingScore: assessment.coding_score as number | null,
  };

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto">
      {/* Sticky Header */}
      <div className="bg-brand-blue border-b-2 border-brand-blue/50 sticky top-0 z-20 shadow-lg shadow-brand-blue/20">
        <div className="px-3 sm:px-5 lg:px-8 py-3 sm:py-4 lg:py-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 sm:gap-2 text-white/90 hover:text-white transition-colors text-sm sm:text-base"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              Back to Assessments
            </button>
            {totalCount != null && totalCount > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={onPrev}
                  disabled={!onPrev || currentIndex === 0}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-white/30 bg-white/10 text-white hover:bg-white/20 ring-1 ring-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-sm text-white/80 font-medium px-1">
                  {(currentIndex ?? 0) + 1} / {totalCount}
                </span>
                <button
                  onClick={onNext}
                  disabled={!onNext || currentIndex === totalCount - 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-white/30 bg-white/10 text-white hover:bg-white/20 ring-1 ring-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-2 sm:gap-3 lg:gap-4 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-11 lg:h-11 bg-white/20 backdrop-blur-sm rounded-lg ring-1 ring-white/20 shadow-sm shadow-brand-blue/10 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <div className="min-w-0">
                {/* Line 1: AS-022 SQL Developer - Assessment V1  Active AI-Generated */}
                <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2 flex-wrap">
                  <span className="px-1.5 sm:px-2 lg:px-2.5 py-0.5 sm:py-1 bg-white/95 text-brand-blue rounded text-xs sm:text-sm font-bold ring-1 ring-white/20 shadow-sm">
                    {assessment.short_id || `AS-${String(assessment.id).slice(0, 8).toUpperCase()}`}
                  </span>
                  <h1 className="text-sm sm:text-base lg:text-xl text-white font-semibold truncate tracking-tight">
                    {assessment.jd_title || stripVersionFromTitle(assessment.title)} - Assessment
                  </h1>
                  <VersionBadge version={assessment.version} size="md" variant="primary" />
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    assessment.status === 'Active'
                      ? 'bg-green-100/90 text-green-800 ring-1 ring-green-200/50'
                      : assessment.status === 'Draft'
                      ? 'bg-brand-orange/20 text-white ring-1 ring-brand-orange/40'
                      : 'bg-white/15 text-white ring-1 ring-white/20'
                  }`}>
                    {assessment.status}
                  </span>
                  {sections.length > 0 && (
                    <span className="px-2 py-1 bg-brand-cyan/25 backdrop-blur-sm text-white rounded text-xs flex items-center gap-1 ring-1 ring-white/20">
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
              {onShare && canCreateAssessments && (() => {
                // Archived assessments aren't candidate-facing — block Share so
                // a recruiter can't accidentally invite someone to an inactive
                // assessment. Mirrors the archived-row menu logic in
                // Assessments.tsx (which hides Copy Link / Duplicate / etc.).
                const isArchived = assessment.status === 'Archived';
                return (
                  <button
                    onClick={isArchived ? undefined : onShare}
                    disabled={isArchived}
                    title={isArchived ? 'Archived assessments cannot be shared' : ''}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg ring-1 ring-white/20 shadow-sm shadow-brand-blue/10 transition-colors flex items-center gap-1.5 sm:gap-2 font-medium text-xs sm:text-sm ${
                      isArchived
                        ? 'bg-white/60 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-brand-blue hover:bg-brand-blue/5'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Share
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 sticky top-[120px] sm:top-[148px] lg:top-[168px] z-10">
        <div className="px-3 sm:px-5 lg:px-8">
          <div className="flex gap-3 sm:gap-4 lg:gap-6 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-brand-blue text-brand-blue font-medium'
                  : 'border-transparent text-gray-600 hover:text-brand-blue'
              }`}
            >
              Assessment Details
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'activity'
                  ? 'border-brand-blue text-brand-blue font-medium'
                  : 'border-transparent text-gray-600 hover:text-brand-blue'
              }`}
            >
              Recent Activity
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'versions'
                  ? 'border-brand-blue text-brand-blue font-medium'
                  : 'border-transparent text-gray-600 hover:text-brand-blue'
              }`}
            >
              Version History
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`py-2.5 sm:py-3 text-xs sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'info'
                  ? 'border-brand-blue text-brand-blue font-medium'
                  : 'border-transparent text-gray-600 hover:text-brand-blue'
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
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-100">
                <h3 className="text-sm sm:text-base font-medium text-gray-900 flex items-center gap-2 tracking-tight">
                  <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                  </div>
                  Assessment Details
                </h3>
              </div>

              <div className="p-3 sm:p-4 lg:p-6">
                {/* Total Duration Card */}
                <div className="bg-gradient-to-r from-brand-blue/5 to-brand-cyan/5 border border-brand-blue/15 rounded-xl p-4 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Total Duration</div>
                      <div className="text-xl font-semibold text-gray-900 tracking-tight">{formattedDuration}</div>
                    </div>
                  </div>
                  <span className="px-4 py-2 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-sm font-medium rounded-lg">
                    100%
                  </span>
                </div>

                {/* Assessment Rounds */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700">Assessment Rounds</h4>

                  {assessment.hr_enabled && (
                    <div className="bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-sm font-medium rounded">
                          HR Round
                        </span>
                        <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-sm font-medium rounded-lg">
                          {assessment.hr_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.hr_topics || []).length > 0 ? (
                            (assessment.hr_topics || []).map((topic: any, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">
                                {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-slate-100 text-gray-600 ring-1 ring-gray-200 rounded text-xs">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {assessment.technical_enabled && (
                    <div className="bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-sm font-medium rounded">
                          Technical Round
                        </span>
                        <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-sm font-medium rounded-lg">
                          {assessment.technical_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.technical_topics || []).length > 0 ? (
                            (assessment.technical_topics || []).map((topic: any, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">
                                {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-slate-100 text-gray-600 ring-1 ring-gray-200 rounded text-xs">
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
                    <div className="bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-sm font-medium rounded">
                          Coding Round
                        </span>
                        <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-sm font-medium rounded-lg">
                          {assessment.coding_percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Topics Covered:</div>
                        <div className="flex flex-wrap gap-2">
                          {(assessment.coding_topics || []).length > 0 ? (
                            (assessment.coding_topics || []).map((topic: any, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">
                                {typeof topic === 'string' ? topic : topic?.text || JSON.stringify(topic)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-1 bg-slate-100 text-gray-600 ring-1 ring-gray-200 rounded text-xs">
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
                <div className="mt-8 pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Section Details</h4>
                  <div className="space-y-4">
                    {sections.length > 0 ? (
                      sections.map((section, index) => {
                        const SectionIcon = section.icon;
                        return (
                          <div key={section.type} className="bg-slate-50 rounded-xl border border-gray-100 ring-1 ring-black/[0.02] p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center text-white">
                                  <SectionIcon className="w-5 h-5" />
                                </div>
                                <div>
                                  <h5 className="text-gray-900 font-medium tracking-tight">{section.name}</h5>
                                  <div className="text-xs text-gray-600 mt-0.5">
                                    {section.percentage}% of total score
                                  </div>
                                </div>
                              </div>
                              <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 rounded-full text-xs font-medium">
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
                                    <span key={i} className="px-2 py-1 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 rounded text-xs">
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
                                    <span key={i} className="px-2 py-1 bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 rounded text-xs font-mono">
                                      {lang}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                              <div className="p-2 bg-white rounded-lg border border-gray-100 ring-1 ring-black/[0.02]">
                                <div className="text-xs text-gray-600 mb-1">Question Type</div>
                                <div className="text-xs text-gray-900 font-medium">
                                  {section.type === 'coding' ? 'Code Challenge' : 'Mixed Format'}
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-lg border border-gray-100 ring-1 ring-black/[0.02]">
                                <div className="text-xs text-gray-600 mb-1">Time Allocation</div>
                                <div className="text-xs text-gray-900 font-medium">
                                  {Math.round((assessment.duration_minutes || 30) * (section.percentage / 100))} min
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-lg border border-gray-100 ring-1 ring-black/[0.02]">
                                <div className="text-xs text-gray-600 mb-1">Weightage</div>
                                <div className="text-xs text-gray-900 font-medium">{section.percentage}%</div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="bg-slate-50 rounded-xl border-2 border-dashed border-brand-blue/20 p-8 text-center">
                        <FileText className="w-12 h-12 text-brand-blue/40 mx-auto mb-3" />
                        <p className="text-gray-600 text-sm">No sections configured</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Analytics - Moved from Analytics tab */}
                <div className="mt-8 pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Performance Analytics</h4>

                  {analyticsData.completed === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-gray-100 ring-1 ring-black/[0.02]">
                      <TrendingUp className="w-10 h-10 text-brand-blue/30 mx-auto mb-2" />
                      <p className="text-gray-600 text-sm mb-1">No performance data available yet</p>
                      <p className="text-xs text-gray-500">Data will appear after candidates complete the assessment</p>
                    </div>
                  ) : (
                    <div className={`grid grid-cols-1 ${assessment.technical_enabled && assessment.coding_enabled ? 'md:grid-cols-2' : ''} gap-6`}>
                      {/* Technical Performance */}
                      {assessment.technical_enabled && (
                        <div className="bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl p-4">
                          <h5 className="text-sm font-semibold text-gray-900 mb-4 tracking-tight">Technical Performance</h5>
                          <div className="space-y-3">
                            {/* Passed (≥70%) */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-700">Passed (≥70%)</span>
                                <span className="text-sm font-semibold text-green-700">
                                  {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) >= 70).length / analyticsData.completed) * 100) || 0}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all"
                                  style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) >= 70).length / analyticsData.completed) * 100 || 0}%` }}
                                ></div>
                              </div>
                            </div>

                            {/* Average (50-69%) */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-700">Average (50-69%)</span>
                                <span className="text-sm font-semibold text-brand-orange-deep">
                                  {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) >= 50 && (a.technical_score || 0) < 70).length / analyticsData.completed) * 100) || 0}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="bg-brand-orange h-2 rounded-full transition-all"
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
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-red-400 to-red-500 h-2 rounded-full transition-all"
                                  style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.technical_score || 0) < 50).length / analyticsData.completed) * 100 || 0}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Coding Performance */}
                      {assessment.coding_enabled && (
                        <div className="bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl p-4">
                          <h5 className="text-sm font-semibold text-gray-900 mb-4 tracking-tight">Coding Performance</h5>
                          <div className="space-y-3">
                            {/* Passed (≥70%) */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-700">Passed (≥70%)</span>
                                <span className="text-sm font-semibold text-green-700">
                                  {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) >= 70).length / analyticsData.completed) * 100) || 0}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all"
                                  style={{ width: `${(recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) >= 70).length / analyticsData.completed) * 100 || 0}%` }}
                                ></div>
                              </div>
                            </div>

                            {/* Average (50-69%) */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-700">Average (50-69%)</span>
                                <span className="text-sm font-semibold text-brand-orange-deep">
                                  {Math.round((recentActivity.filter((a: any) => a.status === 'completed' && (a.coding_score || 0) >= 50 && (a.coding_score || 0) < 70).length / analyticsData.completed) * 100) || 0}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="bg-brand-orange h-2 rounded-full transition-all"
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
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-red-400 to-red-500 h-2 rounded-full transition-all"
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
            <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                <h3 className="text-sm sm:text-base font-medium text-gray-900 flex items-center gap-2 tracking-tight">
                  <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                    <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                  </div>
                  Invitation Status
                </h3>
                <button
                  onClick={() => setActiveTab('activity')}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 w-fit"
                >
                  <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  View Full Tracking
                </button>
              </div>

              <div className="p-3 sm:p-4 lg:p-6">
                {/* Quick Stats — mirrors the Track Invites popup card row:
                    Total Invited / Expired / Invite Failed / In Progress /
                    Completed / Completion Rate. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
                  <div className="bg-gradient-to-br from-brand-blue/5 to-brand-cyan/5 border border-brand-blue/15 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-brand-blue text-xs mb-1.5 sm:mb-2">
                      <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Total Invited</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">{analyticsData.totalInvites}</div>
                  </div>

                  <div className="bg-brand-orange/5 border border-brand-orange/20 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-brand-orange-deep text-xs mb-1.5 sm:mb-2">
                      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Expired</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-brand-orange-deep tracking-tight">{analyticsData.expired}</div>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-red-600 text-xs mb-1.5 sm:mb-2">
                      <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Invite Failed</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-red-600 tracking-tight">{analyticsData.failed}</div>
                  </div>

                  <div className="bg-gradient-to-br from-brand-cyan/5 to-brand-teal/5 border border-brand-cyan/15 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-brand-cyan text-xs mb-1.5 sm:mb-2">
                      <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>In Progress</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">{analyticsData.started}</div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-green-700 text-xs mb-1.5 sm:mb-2">
                      <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Completed</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">{analyticsData.completed}</div>
                  </div>

                  <div className="bg-gradient-to-br from-brand-blue/5 to-brand-blue-2/5 border border-brand-blue/15 rounded-xl p-2.5 sm:p-3 lg:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-brand-blue text-xs mb-1.5 sm:mb-2">
                      <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Completion Rate</span>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">{analyticsData.completionRate}%</div>
                  </div>
                </div>

                {/* Recent Invitations */}
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Recent Invitations</h4>
                  {activityLoading ? (
                    <div className="py-8 sm:py-12 text-center">
                      <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin mx-auto mb-2 sm:mb-3" />
                      <p className="text-gray-600 text-xs sm:text-sm">Loading invitations...</p>
                    </div>
                  ) : recentActivity.length === 0 ? (
                    <div className="py-8 sm:py-12 text-center border-2 border-dashed border-brand-blue/20 rounded-xl">
                      <Mail className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-2 sm:mb-3" />
                      <p className="text-gray-600 mb-1 text-xs sm:text-sm">No invitations sent yet</p>
                      <p className="text-xs sm:text-sm text-gray-500">Invite candidates to start tracking their progress</p>
                    </div>
                  ) : (
                    <div className="space-y-2 sm:space-y-3">
                      {/* `recentActivity` is an EXPANDED timeline (one entry per
                          lifecycle event — invited / sent / opened / started /
                          completed / bounced / expired). The Recent Activity tab
                          renders all of them, but this Recent Invitations card
                          must show ONE row per invitation, otherwise a single
                          candidate whose invite has both `created_at` and `sent_at`
                          shows up 2–3 times. Dedupe by invitation id, keeping
                          the most recent event so the status/scores reflect the
                          latest known state. */}
                      {(() => {
                        const seen = new Set<string>();
                        const uniqueInvitations: any[] = [];
                        for (const ev of recentActivity) {
                          const key = ev.id || `${ev.candidate_email || ''}__${ev.created_at || ''}`;
                          if (seen.has(key)) continue;
                          seen.add(key);
                          uniqueInvitations.push(ev);
                        }
                        return uniqueInvitations.slice(0, 5);
                      })().map((activity: any) => {
                        const getStatusBadge = () => {
                          if (activity.status === 'completed') {
                            return { color: 'bg-green-100 text-green-700 ring-1 ring-green-200', label: 'Completed' };
                          } else if (activity.status === 'in_progress') {
                            return { color: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20', label: 'In Progress' };
                          } else if (activity.status === 'sent') {
                            return { color: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20', label: 'Sent' };
                          } else if (activity.status === 'failed') {
                            return { color: 'bg-red-100 text-red-700 ring-1 ring-red-200', label: 'Failed' };
                          }
                          return { color: 'bg-slate-100 text-gray-700 ring-1 ring-gray-200', label: 'Pending' };
                        };

                        const statusBadge = getStatusBadge();
                        const activityDate = activity.sent_at || activity.created_at;
                        const formattedDate = activityDate ? formatIST(activityDate) : 'N/A';

                        return (
                          <div key={activity.id} className="bg-slate-50 rounded-xl border border-gray-100 ring-1 ring-black/[0.02] p-2.5 sm:p-3 lg:p-4 hover:bg-brand-blue/5 transition-colors">
                            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center text-white font-semibold flex-shrink-0 text-xs sm:text-sm">
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
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-gradient-to-r from-brand-blue to-brand-cyan h-2 rounded-full transition-all"
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
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-100">
              <h3 className="text-sm sm:text-base lg:text-lg text-gray-900 tracking-tight flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <BarChart className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                </div>
                Recent Activity
              </h3>
            </div>

            {activityLoading ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-3" />
                <p className="text-gray-600">Loading activity...</p>
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Calendar className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-2 sm:mb-3" />
                <p className="text-gray-600 mb-1 text-sm">No activity recorded yet</p>
                <p className="text-xs sm:text-sm text-gray-500">Activity will appear here as candidates take the assessment</p>
              </div>
            ) : (() => {
              const totalPages = Math.max(1, Math.ceil(recentActivity.length / ACTIVITY_PAGE_SIZE));
              const startIdx = (activityPage - 1) * ACTIVITY_PAGE_SIZE;
              const pageItems = recentActivity.slice(startIdx, startIdx + ACTIVITY_PAGE_SIZE);
              return (
                <>
                  <div className="divide-y divide-gray-100">
                    {pageItems.map((activity: any, idx: number) => {
                      // Per-event icon + label, derived from _eventType so each
                      // lifecycle moment (invited, sent, opened, started,
                      // completed, bounced, expired) renders as its own row.
                      const getActivityInfo = () => {
                        switch (activity._eventType) {
                          case 'completed':
                            return { icon: CheckCircle, color: 'text-green-700 bg-green-100 ring-1 ring-green-200', label: 'Completed assessment' };
                          case 'started':
                            return { icon: Play, color: 'text-brand-cyan bg-brand-cyan/10 ring-1 ring-brand-cyan/20', label: 'Assessment started' };
                          case 'opened':
                            return { icon: Eye, color: 'text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20', label: 'Link opened' };
                          case 'sent':
                            return { icon: Mail, color: 'text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20', label: 'Invitation email sent' };
                          case 'bounced':
                            return { icon: XCircle, color: 'text-red-700 bg-red-100 ring-1 ring-red-200', label: 'Email bounced' };
                          case 'expired':
                            return { icon: XCircle, color: 'text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20', label: 'Invitation expired' };
                          case 'invited':
                          default:
                            return { icon: Mail, color: 'text-gray-600 bg-slate-100 ring-1 ring-gray-200', label: 'Invited to assessment' };
                        }
                      };

                      const info = getActivityInfo();
                      const ActivityIcon = info.icon;
                      const formattedDate = activity._eventAt ? formatIST(activity._eventAt) : 'N/A';
                      const showScores = activity._eventType === 'completed';

                      return (
                        <div key={`${activity.id}-${activity._eventType}-${idx}`} className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 hover:bg-brand-blue/5 transition-colors">
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
                              {showScores && (
                                <div className="flex items-center gap-3 mt-2">
                                  {assessment.technical_enabled && activity.technical_score != null && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-gray-600">Tech:</span>
                                      <span className="text-sm font-semibold text-gray-900">{Math.round(activity.technical_score)}%</span>
                                    </div>
                                  )}
                                  {assessment.coding_enabled && activity.coding_score != null && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-gray-600">Coding:</span>
                                      <span className="text-sm font-semibold text-gray-900">{Math.round(activity.coding_score)}%</span>
                                    </div>
                                  )}
                                  {activity.passed != null && (
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${activity.passed ? 'bg-green-100 text-green-700 ring-1 ring-green-200' : 'bg-red-100 text-red-700 ring-1 ring-red-200'}`}>
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

                  {/* Pagination — 10 events per page. */}
                  {recentActivity.length > ACTIVITY_PAGE_SIZE && (
                    <div className="px-3 sm:px-4 lg:px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs sm:text-sm text-gray-600">
                      <span>
                        Showing {startIdx + 1}–{Math.min(startIdx + ACTIVITY_PAGE_SIZE, recentActivity.length)} of {recentActivity.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                          disabled={activityPage <= 1}
                          className="px-3 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Previous
                        </button>
                        <span className="px-2">
                          Page {activityPage} of {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActivityPage(p => Math.min(totalPages, p + 1))}
                          disabled={activityPage >= totalPages}
                          className="px-3 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Version History Tab */}
        {activeTab === 'versions' && (
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-brand-cyan" />
                </div>
                <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Version History</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-600">Complete timeline of all changes made to this assessment</p>
            </div>

            {versionsLoading ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-3" />
                <p className="text-gray-600">Loading version history...</p>
              </div>
            ) : versionHistory.length === 0 ? (
              <div className="px-3 sm:px-4 lg:px-6 py-8 sm:py-12 text-center">
                <Clock className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue/30 mx-auto mb-2 sm:mb-3" />
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
                        <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full bg-brand-cyan shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-xs sm:text-sm">V{version.version}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                            <h4 className="text-sm sm:text-base font-semibold text-gray-900 tracking-tight">
                              Version {version.version} {version.version === 1 ? 'Published' : 'Updated'}
                            </h4>
                            {isCurrentVersion && (
                              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-xs font-medium rounded w-fit">
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
                          <div className="bg-slate-50 border border-gray-100 ring-1 ring-black/[0.02] rounded-xl p-2.5 sm:p-3 lg:p-4">
                            <div className="text-xs sm:text-sm font-medium text-gray-900 mb-2 sm:mb-3 tracking-tight">
                              {version.version === 1 ? 'Initial Configuration:' : 'Updated Configuration:'}
                            </div>
                            <ul className="space-y-1.5 sm:space-y-2">
                              <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                <span className="text-brand-blue mt-0.5">•</span>
                                <span>Assessment type: {[
                                  version.hr_enabled && 'HR',
                                  version.technical_enabled && 'Technical',
                                  version.coding_enabled && 'Coding'
                                ].filter(Boolean).join(', ')}</span>
                              </li>
                              <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                <span className="text-brand-blue mt-0.5">•</span>
                                <span>Duration set to {assessment.duration_minutes || 60} min</span>
                              </li>
                              {assessment.title && (
                                <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                  <span className="text-brand-blue mt-0.5">•</span>
                                  <span>Linked to job posting: {assessment.title}</span>
                                </li>
                              )}
                              <li className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 sm:gap-2">
                                <span className="text-brand-blue mt-0.5">•</span>
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
            low: 'bg-green-100 text-green-700 ring-1 ring-green-200',
            medium: 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200',
            high: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
            expert: 'bg-red-100 text-red-700 ring-1 ring-red-200',
          };
          return val ? (map[val] || 'bg-slate-100 text-gray-700 ring-1 ring-gray-200') : 'bg-slate-100 text-gray-700 ring-1 ring-gray-200';
        };
        const expLabel = (val: string | null | undefined) => {
          const map: Record<string, string> = {
            junior: 'Junior', mid: 'Mid-Level', senior: 'Senior', lead: 'Lead', expert: 'Expert',
          };
          return val ? (map[val] || val) : null;
        };
        const expColor = (val: string | null | undefined) => {
          const map: Record<string, string> = {
            junior: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20',
            mid: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
            senior: 'bg-brand-blue-2/15 text-brand-blue-2 ring-1 ring-brand-blue-2/25',
            lead: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
            expert: 'bg-red-100 text-red-700 ring-1 ring-red-200',
          };
          return val ? (map[val] || 'bg-slate-100 text-gray-700 ring-1 ring-gray-200') : 'bg-slate-100 text-gray-700 ring-1 ring-gray-200';
        };

        const skillDepth: any[] = assessment.jd_skill_depth || [];
        const niceToHaveSkills: any[] = (assessment as any).jd_nice_to_have_skills || [];
        const codingLanguages: string[] = assessment.coding_languages || [];
        // NHS section is always rendered (with an empty-state placeholder)
        // so its presence shouldn't gate the whole panel — fall back to the
        // other JD-snapshot signals to decide whether there's anything
        // worth showing at all.
        const hasData = assessment.jd_complexity || assessment.jd_experience_level || assessment.jd_primary_domain || skillDepth.length > 0 || codingLanguages.length > 0;

        return (
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
            <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                  <Info className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                </div>
                <h3 className="text-sm sm:text-base font-medium text-gray-900 tracking-tight">Assessment Info</h3>
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
                  <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                        <Layers className="w-4 h-4 text-brand-blue" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Job Complexity</span>
                    </div>
                    {assessment.jd_complexity ? (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${complexityColor(assessment.jd_complexity)}`}>
                        {complexityLabel(assessment.jd_complexity)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Not available</span>
                    )}
                  </div>

                  {/* Experience Level */}
                  <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-brand-cyan" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Experience Level</span>
                    </div>
                    {assessment.jd_experience_level ? (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${expColor(assessment.jd_experience_level)}`}>
                        {expLabel(assessment.jd_experience_level)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Not available</span>
                    )}
                  </div>

                  {/* Primary Domain */}
                  <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-brand-blue" />
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
                  <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center">
                        <Code className="w-4 h-4 text-brand-cyan" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Coding Requirement</span>
                    </div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${assessment.coding_enabled ? 'bg-green-100 text-green-700 ring-1 ring-green-200' : 'bg-slate-100 text-gray-600 ring-1 ring-gray-200'}`}>
                      {assessment.coding_enabled ? 'Required' : 'Not Required'}
                    </span>
                  </div>

                  {/* Eligible Programming Languages */}
                  <div className="rounded-xl border border-gray-100 ring-1 ring-black/[0.02] bg-white shadow-sm shadow-brand-blue/5 p-4 sm:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/20 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-brand-orange-deep" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Eligible Programming Languages</span>
                    </div>
                    {codingLanguages.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {codingLanguages.map((lang, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20"
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

                {/* Must-Have Skills (MHS) — labelled symmetrically with the
                    NHS section so a recruiter scanning the page sees a
                    matching pair instead of "Skill Depth" + "Nice-to-Have". */}
                {skillDepth.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Star className="w-4 h-4 text-brand-blue" />
                      <h4 className="text-sm font-medium text-gray-900 tracking-tight">Must-Have Skills</h4>
                      <span className="text-xs text-gray-500">(Required skills extracted from JD)</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {skillDepth.map((skill: any, idx: number) => {
                        const skillName = typeof skill === 'string' ? skill : skill?.name || skill?.skill || JSON.stringify(skill);
                        const level = typeof skill === 'object' ? (skill?.level || skill?.depth) : null;
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20"
                          >
                            {skillName}
                            {level && (
                              <span className="text-xs text-brand-blue/70 font-normal">· {level}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Nice-to-Have Skills (NHS) — always rendered alongside
                    MHS so the section's presence is consistent. When the
                    JD has none configured we show a muted placeholder
                    instead of hiding the heading entirely (which made
                    recruiters think NHS support was missing). */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Star className="w-4 h-4 text-brand-cyan" />
                    <h4 className="text-sm font-medium text-gray-900 tracking-tight">Nice-to-Have Skills</h4>
                    <span className="text-xs text-gray-500">(Preferred skills extracted from JD)</span>
                  </div>
                  {niceToHaveSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {niceToHaveSkills.map((skill: any, idx: number) => {
                        const skillName = typeof skill === 'string' ? skill : skill?.name || skill?.skill || JSON.stringify(skill);
                        const level = typeof skill === 'object' ? (skill?.level || skill?.depth) : null;
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/25"
                          >
                            {skillName}
                            {level && (
                              <span className="text-xs text-brand-cyan/80 font-normal">· {level}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-gray-400 bg-gray-50 border border-gray-200">
                      None configured for this JD
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}
      </div>
    </div>
  );
}