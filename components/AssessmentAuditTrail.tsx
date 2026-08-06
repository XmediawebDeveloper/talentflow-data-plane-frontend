import { useState, useEffect, Fragment } from 'react';
import {
  Download, CheckCircle, XCircle, Clock, AlertTriangle,
  FileText, RefreshCw, Eye, Calendar, Mail, User, Building2, Hash, Activity,
  Plus, Edit, Trash2, Send, Play, Award, UserX, TimerOff, Loader2
} from 'lucide-react';
import { assessmentService, CombinedAuditActivity, CombinedAuditTrailResponse } from '@/lib/services';
import { formatIST } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import ListToolbar from '@/components/ui/list-toolbar';
import ListEmptyState from '@/components/ui/list-empty-state';
import { useListSearch } from '@/lib/hooks/useListSearch';

type CategoryFilter = 'all' | 'assessment_lifecycle' | 'candidate_activity';

// Icon mapping for each activity type
const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  assessment_created: <Plus className="w-4 h-4" />,
  assessment_updated: <Edit className="w-4 h-4" />,
  assessment_deleted: <Trash2 className="w-4 h-4" />,
  assessment_published: <Send className="w-4 h-4" />,
  assessment_archived: <FileText className="w-4 h-4" />,
  candidate_invited: <Mail className="w-4 h-4" />,
  candidate_started: <Play className="w-4 h-4" />,
  candidate_completed: <Award className="w-4 h-4" />,
  candidate_failed: <UserX className="w-4 h-4" />,
  candidate_expired: <TimerOff className="w-4 h-4" />,
};

// Color mapping for each activity type
const ACTIVITY_COLORS: Record<string, { bg: string; text: string; icon: string; border: string }> = {
  assessment_created: { bg: 'bg-brand-blue/5', text: 'text-brand-blue', icon: 'text-brand-blue', border: 'border-brand-blue/20' },
  assessment_updated: { bg: 'bg-brand-cyan/5', text: 'text-brand-cyan', icon: 'text-brand-cyan', border: 'border-brand-cyan/20' },
  assessment_deleted: { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-500', border: 'border-red-200' },
  assessment_published: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500', border: 'border-green-200' },
  assessment_archived: { bg: 'bg-slate-50', text: 'text-gray-700', icon: 'text-gray-500', border: 'border-gray-200' },
  candidate_invited: { bg: 'bg-brand-cyan/5', text: 'text-brand-cyan', icon: 'text-brand-cyan', border: 'border-brand-cyan/20' },
  candidate_started: { bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', icon: 'text-brand-orange', border: 'border-brand-orange/20' },
  candidate_completed: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500', border: 'border-green-200' },
  candidate_failed: { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-500', border: 'border-red-200' },
  candidate_expired: { bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', icon: 'text-brand-orange', border: 'border-brand-orange/20' },
};

export default function AssessmentAuditTrail() {
  const [activities, setActivities] = useState<CombinedAuditActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total_lifecycle_events: 0,
    total_candidate_events: 0,
    assessments_created: 0,
    assessments_deleted: 0,
    assessments_archived: 0,
    candidates_invited: 0,
    candidates_completed: 0,
    candidates_in_progress: 0,
    candidates_not_started: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Search + date range come from the shared hook: it owns the typed-vs-applied
  // query, the staged panel, the active count and the reset. The category chips
  // stay local — they are their own control, not part of the panel.
  const search = useListSearch({
    initialFilters: { dateFrom: '', dateTo: '' },
    onChange: () => setPage(1),
    // From and To are one date range, so they read as a single filter.
    countFilters: (filters) => (filters.dateFrom || filters.dateTo ? 1 : 0),
  });
  const searchTerm = search.appliedQuery;
  const { dateFrom: filterDateFrom, dateTo: filterDateTo } = search.filters;

  // Selected activity for details view
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);

  // Fetch audit trail data
  const loadAuditTrail = async () => {
    setIsLoading(true);
    try {
      const response = await assessmentService.getCombinedAuditTrail({
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        search: searchTerm || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        page,
        page_size: pageSize,
      });

      if (response) {
        setActivities(response.items);
        setTotal(response.total);
        setStats({
          total_lifecycle_events: response.total_lifecycle_events,
          total_candidate_events: response.total_candidate_events,
          assessments_created: response.assessments_created,
          assessments_deleted: response.assessments_deleted,
          assessments_archived: response.assessments_archived,
          candidates_invited: response.candidates_invited,
          candidates_completed: response.candidates_completed,
          candidates_in_progress: response.candidates_in_progress,
          candidates_not_started: response.candidates_not_started,
        });
      }
      console.log('[TalentFlow] Loaded combined audit trail');
    } catch (error) {
      console.log('[TalentFlow] Failed to load combined audit trail:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAuditTrail();
  }, [categoryFilter, page]);

  // `searchTerm` is the hook's debounced value, so this fires once per pause
  // rather than per keystroke — the hand-rolled timer this replaced did the
  // same job, and the hook's page reset covers the page > 1 case.
  useEffect(() => {
    if (page === 1) loadAuditTrail();
  }, [searchTerm, filterDateFrom, filterDateTo]);

  const handleExportAuditLogs = () => {
    console.log('Exporting audit logs:', activities);
    toast.info(`Exporting ${activities.length} audit log entries to CSV`);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getCategoryLabel = (category: string) => {
    return category === 'assessment_lifecycle' ? 'Lifecycle' : 'Candidate';
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
        <div className="bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm text-gray-600">Total Events</span>
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
          </div>
          <div className="text-lg sm:text-2xl text-gray-900 tracking-tight">{total}</div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm text-gray-600">Created</span>
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue" />
          </div>
          <div className="text-lg sm:text-2xl text-brand-blue tracking-tight">{stats.assessments_created}</div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm text-gray-600">Invited</span>
            <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-cyan" />
          </div>
          <div className="text-lg sm:text-2xl text-brand-cyan tracking-tight">{stats.candidates_invited}</div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm text-gray-600">Completed</span>
            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
          </div>
          <div className="text-lg sm:text-2xl text-green-600 tracking-tight">{stats.candidates_completed}</div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm text-gray-600">In Progress</span>
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-orange" />
          </div>
          <div className="text-lg sm:text-2xl text-brand-orange-deep tracking-tight">{stats.candidates_in_progress}</div>
        </div>
      </div>

      {/* Main Audit Trail */}
      <div className="bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02]">
        {/* Header */}
        <div className="p-3 sm:p-6 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Activity Log</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
                Complete activity log for assessments and candidates
              </p>
            </div>

            <button
              onClick={handleExportAuditLogs}
              className="self-start sm:self-auto px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-200 bg-white text-gray-700 rounded-md hover:bg-slate-100 transition-colors flex items-center gap-1.5 sm:gap-2"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Export Logs
            </button>
          </div>

          {/* Category Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-4">
            <span className="text-xs sm:text-sm text-gray-600 mr-1 sm:mr-2">Filter:</span>
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                  : 'bg-slate-100 text-gray-700 hover:bg-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setCategoryFilter('assessment_lifecycle')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                categoryFilter === 'assessment_lifecycle'
                  ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                  : 'bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20 hover:bg-brand-blue/10'
              }`}
            >
              <span className="hidden sm:inline">Assessment Lifecycle</span>
              <span className="sm:hidden">Lifecycle</span>
              {' '}({stats.total_lifecycle_events})
            </button>
            <button
              onClick={() => setCategoryFilter('candidate_activity')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                categoryFilter === 'candidate_activity'
                  ? 'bg-brand-cyan text-white shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10'
                  : 'bg-brand-cyan/5 text-brand-cyan ring-1 ring-brand-cyan/20 hover:bg-brand-cyan/10'
              }`}
            >
              <span className="hidden sm:inline">Candidate Activities</span>
              <span className="sm:hidden">Candidate</span>
              {' '}({stats.total_candidate_events})
            </button>
          </div>

          {/* Search + filters in the job-openings format. */}
          <ListToolbar
            searchValue={search.query}
            onSearchChange={search.setQuery}
            // The hook debounces into `appliedQuery`, so keystrokes pass through.
            searchDebounceMs={0}
            searchPlaceholder="Search by assessment, candidate, or user..."
            onToggleFilters={() => setShowFilters(!showFilters)}
            filtersOpen={showFilters}
            activeFilterCount={search.activeFilterCount}
            filtersApplied={search.filtersApplied}
            onClearFilters={search.reset}
            className="mb-0"
            filterPanel={
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <label htmlFor="audit-date-from" className="block text-sm text-gray-700 mb-1.5 font-medium">Date From</label>
                  <input
                    id="audit-date-from"
                    type="date"
                    value={search.draftFilters.dateFrom}
                    max={search.draftFilters.dateTo || undefined}
                    onChange={(e) => search.setDraftFilter('dateFrom', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black"
                  />
                </div>
                <div>
                  <label htmlFor="audit-date-to" className="block text-sm text-gray-700 mb-1.5 font-medium">Date To</label>
                  <input
                    id="audit-date-to"
                    type="date"
                    value={search.draftFilters.dateTo}
                    min={search.draftFilters.dateFrom || undefined}
                    onChange={(e) => search.setDraftFilter('dateTo', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black"
                  />
                </div>
              </div>

              {/* Panel footer: "Done" applies the selection and reveals the
                  toolbar Clear - same flow as job-openings. */}
              <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
                <button
                  onClick={() => { search.applyFilters(); setShowFilters(false); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-blue transition-colors hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25"
                >
                  Done
                </button>
              </div>
            </div>
            }
          />
        </div>

        {/* Timeline View */}
        <div className="p-3 sm:p-6">
          {isLoading ? (
            <div className="text-center py-8 sm:py-12">
              <Loader2 className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-500">Loading activity log...</p>
            </div>
          ) : activities.length === 0 ? (
            <ListEmptyState
              icon={Activity}
              isNarrowed={search.isNarrowed}
              query={search.appliedQuery}
              entityLabel="activity"
              emptyTitle="No activity yet"
              emptyDescription="Assessment and candidate events appear here as they happen."
              onReset={search.reset}
            />
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {activities.map((activity, index) => {
                const colors = ACTIVITY_COLORS[activity.activity_type] || ACTIVITY_COLORS.assessment_created;
                const icon = ACTIVITY_ICONS[activity.activity_type] || <Activity className="w-4 h-4" />;
                const isExpanded = selectedActivity === activity.id;

                return (
                  <Fragment key={`${activity.id}-${index}`}>
                    <div
                      className={`relative flex items-start gap-2.5 sm:gap-4 p-3 sm:p-4 rounded-lg border ${colors.border} ${colors.bg} hover:shadow-sm transition-shadow cursor-pointer`}
                      onClick={() => setSelectedActivity(isExpanded ? null : activity.id)}
                    >
                      {/* Timeline line - hidden on mobile */}
                      {index < activities.length - 1 && (
                        <div className="hidden sm:block absolute left-[26px] top-[52px] w-0.5 h-[calc(100%+16px)] bg-gray-200" />
                      )}

                      {/* Icon */}
                      <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center ${colors.icon} relative z-10 bg-white`}>
                        {icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                              <h4 className={`text-sm sm:text-base font-medium ${colors.text}`}>
                                {activity.title}
                              </h4>
                              <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${
                                activity.category === 'assessment_lifecycle'
                                  ? 'bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20'
                                  : 'bg-brand-cyan/5 text-brand-cyan ring-1 ring-brand-cyan/20'
                              }`}>
                                {getCategoryLabel(activity.category)}
                              </span>
                              {activity.passed !== null && activity.passed !== undefined && (
                                <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${
                                  activity.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {activity.passed ? 'Passed' : 'Failed'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">{activity.description}</p>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-500">
                              {activity.actor_name && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[100px] sm:max-w-none">{activity.actor_name}</span>
                                </span>
                              )}
                              {activity.assessment_title && (
                                <span className="flex items-center gap-1">
                                  <FileText className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[100px] sm:max-w-none">{activity.assessment_title}</span>
                                </span>
                              )}
                              {activity.score !== null && activity.score !== undefined && (
                                <span className="flex items-center gap-1">
                                  <Award className="w-3 h-3 flex-shrink-0" />
                                  Score: {Math.round(activity.score)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-0 flex-shrink-0 mt-1 sm:mt-0">
                            <p className="text-xs sm:text-sm text-gray-500">{formatTimestamp(activity.timestamp)}</p>
                            <button className="sm:mt-1 text-[10px] sm:text-xs text-gray-400 hover:text-brand-blue">
                              <Eye className="w-3 h-3 inline mr-0.5 sm:mr-1" />
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="ml-0 sm:ml-14 p-3 sm:p-4 bg-slate-50 rounded-lg border border-gray-100 text-xs sm:text-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                          <div>
                            <span className="text-gray-500">Activity Type:</span>
                            <span className="ml-1.5 sm:ml-2 text-gray-900">{activity.activity_type.replace(/_/g, ' ')}</span>
                          </div>
                          {activity.jd_title && (
                            <div>
                              <span className="text-gray-500">JD Title:</span>
                              <span className="ml-1.5 sm:ml-2 text-gray-900">{activity.jd_title}</span>
                            </div>
                          )}
                          {activity.actor_email && (
                            <div className="break-all">
                              <span className="text-gray-500">Actor Email:</span>
                              <span className="ml-1.5 sm:ml-2 text-gray-900">{activity.actor_email}</span>
                            </div>
                          )}
                          {activity.candidate_email && (
                            <div className="break-all">
                              <span className="text-gray-500">Candidate Email:</span>
                              <span className="ml-1.5 sm:ml-2 text-gray-900">{activity.candidate_email}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-gray-500">Timestamp:</span>
                            <span className="ml-1.5 sm:ml-2 text-gray-900">
                              {formatIST(activity.timestamp)}
                            </span>
                          </div>
                          {activity.assessment_id && (
                            <div className="break-all">
                              <span className="text-gray-500">Assessment ID:</span>
                              <span className="ml-1.5 sm:ml-2 text-gray-900 font-mono text-[10px] sm:text-xs">{activity.assessment_id}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0">
          <div className="text-xs sm:text-sm text-gray-600">
            Showing {activities.length} of {total} entries
          </div>
          {total > pageSize && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-2.5 sm:px-3 py-1 text-xs sm:text-sm border border-gray-200 bg-white rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
              >
                Prev
              </button>
              <span className="text-xs sm:text-sm text-gray-600">
                {page} / {Math.ceil(total / pageSize)}
              </span>
              <button
                onClick={() => setPage(Math.min(Math.ceil(total / pageSize), page + 1))}
                disabled={page >= Math.ceil(total / pageSize)}
                className="px-2.5 sm:px-3 py-1 text-xs sm:text-sm border border-gray-200 bg-white rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
