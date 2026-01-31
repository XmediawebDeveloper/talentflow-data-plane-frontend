import { useState, useEffect, Fragment } from 'react';
import {
  Search, Filter, Download, X, CheckCircle, XCircle, Clock, AlertTriangle,
  FileText, RefreshCw, Eye, Calendar, Mail, User, Building2, Hash, Activity,
  Plus, Edit, Trash2, Send, Play, Award, UserX, TimerOff
} from 'lucide-react';
import { assessmentService, CombinedAuditActivity, CombinedAuditTrailResponse } from '@/lib/services';

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
  assessment_created: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500', border: 'border-blue-200' },
  assessment_updated: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500', border: 'border-purple-200' },
  assessment_deleted: { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-500', border: 'border-red-200' },
  assessment_published: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500', border: 'border-green-200' },
  assessment_archived: { bg: 'bg-gray-50', text: 'text-gray-700', icon: 'text-gray-500', border: 'border-gray-200' },
  candidate_invited: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'text-indigo-500', border: 'border-indigo-200' },
  candidate_started: { bg: 'bg-yellow-50', text: 'text-yellow-700', icon: 'text-yellow-500', border: 'border-yellow-200' },
  candidate_completed: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500', border: 'border-green-200' },
  candidate_failed: { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-500', border: 'border-red-200' },
  candidate_expired: { bg: 'bg-orange-50', text: 'text-orange-700', icon: 'text-orange-500', border: 'border-orange-200' },
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
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

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

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 1) {
        loadAuditTrail();
      } else {
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, filterDateFrom, filterDateTo]);

  const clearFilters = () => {
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchTerm('');
  };

  const activeFiltersCount =
    (filterDateFrom ? 1 : 0) +
    (filterDateTo ? 1 : 0) +
    (searchTerm ? 1 : 0);

  const handleExportAuditLogs = () => {
    console.log('Exporting audit logs:', activities);
    alert(`Exporting ${activities.length} audit log entries to CSV`);
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
      timeZone: 'UTC',
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
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Total Events</span>
            <Activity className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl text-gray-900">{total}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Assessments Created</span>
            <Plus className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl text-blue-600">{stats.assessments_created}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Candidates Invited</span>
            <Mail className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl text-indigo-600">{stats.candidates_invited}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Completed</span>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </div>
          <div className="text-2xl text-green-600">{stats.candidates_completed}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">In Progress</span>
            <Clock className="w-4 h-4 text-yellow-600" />
          </div>
          <div className="text-2xl text-yellow-600">{stats.candidates_in_progress}</div>
        </div>
      </div>

      {/* Main Audit Trail */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Activity Log</h2>
              <p className="text-sm text-gray-600 mt-1">
                Complete activity log for assessments and candidates
              </p>
            </div>

            <button
              onClick={handleExportAuditLogs}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export Logs
            </button>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-gray-600 mr-2">Filter:</span>
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Activities
            </button>
            <button
              onClick={() => setCategoryFilter('assessment_lifecycle')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                categoryFilter === 'assessment_lifecycle'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Assessment Lifecycle ({stats.total_lifecycle_events})
            </button>
            <button
              onClick={() => setCategoryFilter('candidate_activity')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                categoryFilter === 'candidate_activity'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              Candidate Activities ({stats.total_candidate_events})
            </button>
          </div>

          {/* Search and Filter Bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by assessment, candidate, or user..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 text-sm border rounded-md transition-colors flex items-center gap-2 ${
                showFilters || activeFiltersCount > 0
                  ? 'border-gray-300 text-gray-900 bg-gray-50'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="px-1.5 py-0.5 bg-gray-800 text-white rounded text-xs">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900">Filters</h3>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Clear All
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Date From */}
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Date From</label>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>

                {/* Date To */}
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Date To</label>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Timeline View */}
        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full mx-auto mb-4"></div>
              <p className="text-sm text-gray-500">Loading activity log...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">No activities found</p>
              {(searchTerm || filterDateFrom || filterDateTo) && (
                <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity, index) => {
                const colors = ACTIVITY_COLORS[activity.activity_type] || ACTIVITY_COLORS.assessment_created;
                const icon = ACTIVITY_ICONS[activity.activity_type] || <Activity className="w-4 h-4" />;
                const isExpanded = selectedActivity === activity.id;

                return (
                  <Fragment key={`${activity.id}-${index}`}>
                    <div
                      className={`relative flex items-start gap-4 p-4 rounded-lg border ${colors.border} ${colors.bg} hover:shadow-sm transition-shadow cursor-pointer`}
                      onClick={() => setSelectedActivity(isExpanded ? null : activity.id)}
                    >
                      {/* Timeline line */}
                      {index < activities.length - 1 && (
                        <div className="absolute left-[26px] top-[52px] w-0.5 h-[calc(100%+16px)] bg-gray-200" />
                      )}

                      {/* Icon */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center ${colors.icon} relative z-10 bg-white`}>
                        {icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className={`font-medium ${colors.text}`}>
                                {activity.title}
                              </h4>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                activity.category === 'assessment_lifecycle'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-indigo-100 text-indigo-700'
                              }`}>
                                {getCategoryLabel(activity.category)}
                              </span>
                              {activity.passed !== null && activity.passed !== undefined && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  activity.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {activity.passed ? 'Passed' : 'Failed'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{activity.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              {activity.actor_name && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {activity.actor_name}
                                </span>
                              )}
                              {activity.assessment_title && (
                                <span className="flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  {activity.assessment_title}
                                </span>
                              )}
                              {activity.score !== null && activity.score !== undefined && (
                                <span className="flex items-center gap-1">
                                  <Award className="w-3 h-3" />
                                  Score: {activity.score.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm text-gray-500">{formatTimestamp(activity.timestamp)}</p>
                            <button className="mt-1 text-xs text-gray-400 hover:text-gray-600">
                              <Eye className="w-3 h-3 inline mr-1" />
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="ml-14 p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-gray-500">Activity Type:</span>
                            <span className="ml-2 text-gray-900">{activity.activity_type.replace(/_/g, ' ')}</span>
                          </div>
                          {activity.jd_title && (
                            <div>
                              <span className="text-gray-500">JD Title:</span>
                              <span className="ml-2 text-gray-900">{activity.jd_title}</span>
                            </div>
                          )}
                          {activity.actor_email && (
                            <div>
                              <span className="text-gray-500">Actor Email:</span>
                              <span className="ml-2 text-gray-900">{activity.actor_email}</span>
                            </div>
                          )}
                          {activity.candidate_email && (
                            <div>
                              <span className="text-gray-500">Candidate Email:</span>
                              <span className="ml-2 text-gray-900">{activity.candidate_email}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-gray-500">Timestamp:</span>
                            <span className="ml-2 text-gray-900">
                              {new Date(activity.timestamp).toLocaleString('en-US', { timeZone: 'UTC', hour12: true })}
                            </span>
                          </div>
                          {activity.assessment_id && (
                            <div>
                              <span className="text-gray-500">Assessment ID:</span>
                              <span className="ml-2 text-gray-900 font-mono text-xs">{activity.assessment_id}</span>
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
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {activities.length} of {total} activity entries
          </div>
          {total > pageSize && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {Math.ceil(total / pageSize)}
              </span>
              <button
                onClick={() => setPage(Math.min(Math.ceil(total / pageSize), page + 1))}
                disabled={page >= Math.ceil(total / pageSize)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
