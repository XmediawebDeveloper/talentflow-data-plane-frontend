import { useState, useEffect, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  Download, CheckCircle, Clock,
  FileText, Eye, Mail, User, Activity,
  Plus, Edit, Trash2, Send, Play, Award, UserX, TimerOff, Archive, Loader2, Ban,
  ChevronLeft, ChevronRight, Square, CheckSquare
} from 'lucide-react';
import { aiInterviewService, AIInterviewAuditActivity } from '@/lib/services/aiInterviewService';
import { formatIST } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import ListToolbar from '@/components/ui/list-toolbar';
import { useAuth } from '@/components/providers/AuthProvider';
import ListEmptyState from '@/components/ui/list-empty-state';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { Skeleton, CardGridSkeleton } from '@/components/ui/skeleton';
import { DateField } from '@/components/ui/date-field';
import { Button } from '@/components/ui/button';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, type ExportFileFormat } from '@/lib/utils/exportUtils';
import ListViewToggle, { type ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';

type CategoryFilter = 'all' | 'config_lifecycle' | 'candidate_activity';

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  config_created: <Plus className="w-4 h-4" />,
  config_updated: <Edit className="w-4 h-4" />,
  config_deleted: <Trash2 className="w-4 h-4" />,
  config_published: <Send className="w-4 h-4" />,
  config_archived: <Archive className="w-4 h-4" />,
  candidate_invited: <Mail className="w-4 h-4" />,
  candidate_started: <Play className="w-4 h-4" />,
  candidate_completed: <Award className="w-4 h-4" />,
  candidate_failed: <UserX className="w-4 h-4" />,
  candidate_expired: <TimerOff className="w-4 h-4" />,
  candidate_terminated: <UserX className="w-4 h-4" />,
  candidate_revoked: <Ban className="w-4 h-4" />,
  candidate_cancelled: <Ban className="w-4 h-4" />,
  candidate_consent: <CheckCircle className="w-4 h-4" />,
  candidate_exited: <UserX className="w-4 h-4" />,
  candidate_errored: <Activity className="w-4 h-4" />,
  link_shared: <Send className="w-4 h-4" />,
  invite_edited: <Edit className="w-4 h-4" />,
  ai_interview_save_draft: <Edit className="w-4 h-4" />,
  ai_interview_draft_update: <Edit className="w-4 h-4" />,
  /* The lifecycle rows arrive keyed by the raw audit action value. */
  ai_interview_recording_downloaded: <Download className="w-4 h-4" />,
  ai_interview_report_downloaded: <Download className="w-4 h-4" />,
  ai_interview_config_exported: <Download className="w-4 h-4" />,
};

const ACTIVITY_COLORS: Record<string, { bg: string; text: string; icon: string; border: string }> = {
  config_created: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500', border: 'border-blue-200' },
  config_updated: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500', border: 'border-purple-200' },
  config_deleted: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  config_published: { bg: 'bg-success-subtle', text: 'text-success', icon: 'text-success', border: 'border-success-line' },
  config_archived: { bg: 'bg-gray-50', text: 'text-gray-700', icon: 'text-gray-500', border: 'border-gray-200' },
  candidate_invited: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'text-indigo-500', border: 'border-indigo-200' },
  candidate_started: { bg: 'bg-warning-subtle', text: 'text-warning', icon: 'text-warning', border: 'border-warning-line' },
  candidate_completed: { bg: 'bg-success-subtle', text: 'text-success', icon: 'text-success', border: 'border-success-line' },
  candidate_failed: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  candidate_expired: { bg: 'bg-orange-50', text: 'text-orange-700', icon: 'text-orange-500', border: 'border-orange-200' },
  candidate_terminated: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  candidate_revoked: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'text-indigo-500', border: 'border-indigo-200' },
  candidate_cancelled: { bg: 'bg-gray-50', text: 'text-gray-700', icon: 'text-gray-500', border: 'border-gray-200' },
  candidate_consent: { bg: 'bg-success-subtle', text: 'text-success', icon: 'text-success', border: 'border-success-line' },
  candidate_exited: { bg: 'bg-orange-50', text: 'text-orange-700', icon: 'text-orange-500', border: 'border-orange-200' },
  candidate_errored: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  link_shared: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'text-indigo-500', border: 'border-indigo-200' },
  invite_edited: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'text-indigo-500', border: 'border-indigo-200' },
  ai_interview_save_draft: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500', border: 'border-purple-200' },
  ai_interview_draft_update: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500', border: 'border-purple-200' },
  ai_interview_recording_downloaded: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500', border: 'border-blue-200' },
  ai_interview_report_downloaded: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500', border: 'border-blue-200' },
  ai_interview_config_exported: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500', border: 'border-blue-200' },
};

export interface AIInterviewAuditTrailProps {
  /**
   * DOM node the search/filter toolbar portals into, so it renders in the
   * shared slot above the tab pills (AIInterview.tsx) instead of its own
   * default spot inline in this component's own header — every tab's
   * toolbar then sits in the same place regardless of which tab owns the
   * fields. Falls back to rendering inline when unset.
   */
  toolbarSlot?: HTMLDivElement | null;
  /**
   * Bumped by the host's Refresh button (AIInterview.tsx) to force a
   * reload — this trail otherwise only refetches on mount, page/category
   * change or a search/date edit.
   */
  refreshSignal?: number;
  /**
   * List (timeline) or card grid — owned by the host (AIInterview.tsx) so
   * every AI Interviews tab shares one choice. The toggle only renders when
   * `onDisplayModeChange` is passed.
   */
  displayMode?: ListDisplayMode;
  onDisplayModeChange?: (mode: ListDisplayMode) => void;
}

export default function AIInterviewAuditTrail({ toolbarSlot, refreshSignal, displayMode = 'list', onDisplayModeChange }: AIInterviewAuditTrailProps = {}) {
  // Export Logs is RBAC-gated (`ai_interview:export` — the export-log
  // endpoint enforces it too); greyed with the reason when missing.
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canExport = isTenantAdmin || hasPermissionCode('ai_interview:export');
  const [activities, setActivities] = useState<AIInterviewAuditActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total_lifecycle_events: 0,
    total_candidate_events: 0,
    interviews_created: 0,
    candidates_invited: 0,
    candidates_in_progress: 0,
    candidates_completed: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Local text for the "Go to" box so a partial edit doesn't get clobbered by
  // `page` until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState(String(page));
  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);
  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      setPage(target);
    } else {
      setGoToPage(String(page));
    }
  };

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Shared search/filter state — same shape as the assessment audit trail, so
  // the two behave identically. Category chips stay local: they are their own
  // control rather than part of the panel.
  const search = useListSearch({
    initialFilters: { dateFrom: '', dateTo: '' },
    onChange: () => setPage(1),
    // From and To are one date range, so they read as a single filter.
    countFilters: (filters) => (filters.dateFrom || filters.dateTo ? 1 : 0),
  });
  const searchTerm = search.appliedQuery;
  const { dateFrom: filterDateFrom, dateTo: filterDateTo } = search.filters;
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);

  // Row selection — the same CheckSquare / Square column every other AI
  // Interviews tab opens with. Keyed by the row's position-qualified id, the
  // same key the list renders with, since one activity id can repeat.
  const activityKey = (activity: AIInterviewAuditActivity, index: number) => `${activity.id}-${index}`;
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const toggleSelected = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const pageKeys = activities.map(activityKey);
  const allOnPageSelected = pageKeys.length > 0 && pageKeys.every((key) => selectedKeys.has(key));
  const toggleAllOnPage = () =>
    setSelectedKeys(() => (allOnPageSelected ? new Set<string>() : new Set(pageKeys)));

  const loadAuditTrail = async () => {
    setIsLoading(true);
    try {
      const response = await aiInterviewService.getAuditTrail({
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        search: searchTerm || undefined,
        page,
        page_size: pageSize,
        // The Date From/To panel already triggered this reload but its
        // values were never sent, so the filter did nothing.
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
      });

      if (response) {
        setActivities(response.items);
        // A new page or filter is a new list — a selection made on the old
        // one no longer points at anything on screen.
        setSelectedKeys(new Set());
        setTotal(response.total);
        setStats({
          total_lifecycle_events: response.total_lifecycle_events,
          total_candidate_events: response.total_candidate_events,
          interviews_created: response.interviews_created ?? 0,
          candidates_invited: response.candidates_invited ?? 0,
          candidates_in_progress: response.candidates_in_progress ?? 0,
          candidates_completed: response.candidates_completed ?? 0,
        });
      }
    } catch (error) {
      console.log('[TalentFlow] Failed to load AI interview audit trail:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAuditTrail();
  }, [categoryFilter, page]);

  /* Host's Refresh button — skips the mount value so this doesn't
     double-fetch alongside the effect above. */
  const skippedFirstRefreshSignal = useRef(false);
  useEffect(() => {
    if (refreshSignal === undefined) return;
    if (!skippedFirstRefreshSignal.current) {
      skippedFirstRefreshSignal.current = true;
      return;
    }
    loadAuditTrail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // `searchTerm` is the hook's debounced value, so this refetches once per pause
  // instead of per keystroke; the hook's page reset covers the page > 1 case.
  useEffect(() => {
    if (page === 1) loadAuditTrail();
  }, [searchTerm, filterDateFrom, filterDateTo]);

  // Export the selected rows, or the whole loaded page when nothing is selected.
  const [showExportModal, setShowExportModal] = useState(false);
  const AUDIT_EXPORT_HEADERS = ['Timestamp', 'Activity', 'Category', 'Activity Type', 'Description', 'Actor', 'Interview', 'Job', 'Candidate', 'Candidate Email', 'Score'];
  const exportActivities = () =>
    selectedKeys.size > 0
      ? activities.filter((activity, index) => selectedKeys.has(activityKey(activity, index)))
      : activities;

  const handleExportAuditLogs = async (format: ExportFileFormat) => {
    if (!canExport) return;
    const rows = exportActivities().map((activity) => [
      formatIST(activity.timestamp),
      activity.title,
      getCategoryLabel(activity.category),
      activity.activity_type.replace(/_/g, ' '),
      activity.description,
      activity.actor_name ?? '',
      activity.config_title ?? '',
      activity.jd_title ?? '',
      activity.candidate_name ?? '',
      activity.candidate_email ?? '',
      activity.score !== null && activity.score !== undefined ? Number(activity.score.toFixed(1)) : '',
    ]);
    await exportRows(format, AUDIT_EXPORT_HEADERS, rows, 'ai-interview-audit-logs', {
      sheetName: 'Audit Logs',
      title: 'AI Interview Audit Logs',
    });
    toast.success(`Exported ${rows.length} audit log entries to ${format === 'xlsx' ? 'Excel' : 'CSV'}`);
    // Record the export on the audit trail, as Assessment's Activity Logs
    // export does. The file is already saved, so a failed audit call is
    // logged rather than shown as a failed export.
    aiInterviewService.logActivityLogsExport({
      format: format === 'xlsx' ? 'excel' : 'csv',
      record_count: rows.length,
      selected: selectedKeys.size > 0,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      search: searchTerm || undefined,
      date_from: filterDateFrom || undefined,
      date_to: filterDateTo || undefined,
    }).catch((error) => console.log('[TalentFlow] Failed to record activity logs export:', error));
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
    return category === 'config_lifecycle' ? 'Lifecycle' : 'Candidate';
  };

  const toolbarEl = (
    <>
      {/* Same heading treatment as every other tab's — title + count, right
          above the search/filter bar. */}
      <h2 className="tf-section-title sm:text-lg tracking-tight mb-3">
        Activity Log ({total})
      </h2>

      <ListToolbar
      searchValue={search.query}
      onSearchChange={search.setQuery}
      // The hook debounces into `appliedQuery`, so keystrokes pass through.
      searchDebounceMs={0}
      searchPlaceholder="Search by config, candidate, or user..."
      onToggleFilters={() => setShowFilters(!showFilters)}
      filtersOpen={showFilters}
      activeFilterCount={search.activeFilterCount}
      filtersApplied={search.filtersApplied}
      onClearFilters={search.reset}
      className="mb-0"
      filterPanel={
      <div>
        <div className="tf-grid-4">
          <div>
            <label htmlFor="audit-date-from" className="block tf-label mb-1.5">Date From</label>
            <DateField
              id="audit-date-from"
              aria-label="Date From"
              value={search.draftFilters.dateFrom}
              max={search.draftFilters.dateTo || undefined}
              onChange={(v) => search.setDraftFilter('dateFrom', v)}
            />
          </div>
          <div>
            <label htmlFor="audit-date-to" className="block tf-label mb-1.5">Date To</label>
            <DateField
              id="audit-date-to"
              aria-label="Date To"
              value={search.draftFilters.dateTo}
              min={search.draftFilters.dateFrom || undefined}
              onChange={(v) => search.setDraftFilter('dateTo', v)}
            />
          </div>
        </div>

        {/* Panel footer: "Done" applies the selection and reveals the
            toolbar Clear - same flow as job-openings. */}
        <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => { search.applyFilters(); setShowFilters(false); }}
          >
            Done
          </Button>
        </div>
      </div>
      }
    >
      {onDisplayModeChange && <ListViewToggle value={displayMode} onChange={onDisplayModeChange} />}
    </ListToolbar>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Category control + breakdown — the Assessments Activity Logs header.
          All Events is the sum of the two category counts, not `total`, so the
          badge doesn't drop to the selected category's figure. */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div
          role="group"
          aria-label="Filter activity by category"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] self-start overflow-x-auto scrollbar-hide max-w-full"
        >
          {([
            { key: 'all' as const, label: 'All Events', short: 'All', icon: Activity,
              value: stats.total_lifecycle_events + stats.total_candidate_events,
              text: 'text-gray-700 dark:text-slate-200', tint: 'bg-gray-200/70 dark:bg-slate-700/60', ring: 'ring-gray-300 dark:ring-slate-600' },
            { key: 'config_lifecycle' as const, label: 'Interview Lifecycle', short: 'Lifecycle', icon: FileText,
              value: stats.total_lifecycle_events,
              text: 'text-brand-blue', tint: 'bg-brand-blue/10', ring: 'ring-brand-blue/20' },
            { key: 'candidate_activity' as const, label: 'Candidate Activities', short: 'Candidate', icon: User,
              value: stats.total_candidate_events,
              text: 'text-brand-cyan', tint: 'bg-brand-cyan/10', ring: 'ring-brand-cyan/20' },
          ]).map((segment) => {
            const SegmentIcon = segment.icon;
            const isActive = categoryFilter === segment.key;
            return (
              <button
                key={segment.key}
                type="button"
                aria-pressed={isActive}
                title={segment.key === 'all'
                  ? 'Show all activity'
                  : isActive
                    ? `Stop filtering by ${segment.short.toLowerCase()}`
                    : `Show only ${segment.short.toLowerCase()} activity`}
                onClick={() => {
                  setCategoryFilter(isActive && segment.key !== 'all' ? 'all' : segment.key);
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? `bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/10 ring-1 ${segment.text} ${segment.ring}`
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                }`}
              >
                <SegmentIcon className={`w-3.5 h-3.5 flex-shrink-0 ${segment.text}`} />
                <span className="hidden sm:inline">{segment.label}</span>
                <span className="sm:hidden">{segment.short}</span>
                {/* Keep showing the last-known count while a reload is in
                    flight — swapping it for "—" shrank the pill down to its
                    min-width and snapped back once the real number returned,
                    which read as the whole control shaking on every click. */}
                <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-2xs font-semibold tabular-nums ring-1 transition-colors ${isLoading ? 'opacity-60' : ''} ${segment.text} ${segment.tint} ${segment.ring}`}>
                  {segment.value.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm lg:justify-end flex-shrink-0">
          {([
            { icon: Plus, value: stats.interviews_created, label: 'created', text: 'text-brand-blue' },
            { icon: Mail, value: stats.candidates_invited, label: 'invited', text: 'text-brand-cyan' },
            { icon: Clock, value: stats.candidates_in_progress, label: 'in progress', text: 'text-brand-orange' },
            { icon: CheckCircle, value: stats.candidates_completed, label: 'completed', text: 'text-success' },
          ]).map((item, index) => {
            const ItemIcon = item.icon;
            return (
              <Fragment key={item.label}>
                {index > 0 && (
                  <span className="w-px h-3.5 bg-gray-200 dark:bg-slate-700 flex-shrink-0" aria-hidden />
                )}
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <ItemIcon className={`w-3.5 h-3.5 flex-shrink-0 ${item.text}`} />
                  <span className={`font-semibold tabular-nums text-gray-900 dark:text-slate-50 ${isLoading ? 'opacity-60' : ''}`}>
                    {item.value.toLocaleString()}
                  </span>
                  <span className="text-gray-500 dark:text-slate-400">{item.label}</span>
                </span>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Main Audit Trail */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 tf-round-edges">
        {/* Header */}
        {/* Tighter padding and a stacked header below sm: on a phone the
            Export button sat beside a three-line description, and the chips
            and timeline cards below clipped against the card's right edge. */}
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="tf-section-title">Activity Log</h2>
              <p className="tf-body-secondary mt-1">
                Complete activity log for AI interviews and candidates
              </p>
            </div>

            <Button
              variant="secondary"
              onClick={() => { if (canExport) setShowExportModal(true); }}
              disabled={activities.length === 0}
              aria-disabled={!canExport || undefined}
              title={canExport ? undefined : 'You do not have permission to export AI interviews'}
              className={`${(canExport ? undefined : 'opacity-50 cursor-not-allowed') ?? ''} disabled:opacity-50`}
              icon={<Download className="w-4 h-4" />}
            >
              Export Logs{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ''}
            </Button>
            <ExportFormatModal
              open={showExportModal}
              onClose={() => setShowExportModal(false)}
              title="Export Audit Logs"
              recordCount={exportActivities().length}
              selected={selectedKeys.size > 0}
              columns={AUDIT_EXPORT_HEADERS}
              onExport={handleExportAuditLogs}
            />
          </div>

          {/* Search + filters in the job-openings format — portalled to the
              shared slot above the tab pills when hosted from AIInterview.tsx,
              so this tab's toolbar sits in the same spot every other tab's
              does, rather than inside this component's own header. */}
          {toolbarSlot ? createPortal(toolbarEl, toolbarSlot) : toolbarEl}
        </div>

        {/* Timeline View */}
        <div className="p-3 sm:p-6">
          {isLoading && displayMode === 'grid' ? (
            // Card view loads as card skeletons, not the timeline.
            <CardGridSkeleton count={8} className="xl:grid-cols-4" />
          ) : isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="tf-panel relative flex items-start gap-4 p-4"
                >
                  {i < 5 && (
                    <div className="absolute left-[26px] top-[52px] w-0.5 h-[calc(100%+16px)] bg-gray-200" />
                  )}
                  {/* Icon bubble */}
                  <Skeleton className="flex-shrink-0 w-10 h-10 rounded-full relative z-10" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        {/* Title + category chip */}
                        <div className="flex items-center gap-2 mb-1">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-4 w-24 rounded-full" />
                        </div>
                        {/* Description */}
                        <Skeleton className="h-3.5 w-3/4 mb-2" />
                        {/* Metadata row */}
                        <div className="flex items-center gap-4 mt-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                      {/* Timestamp + Details */}
                      <div className="text-right flex-shrink-0">
                        <Skeleton className="h-3.5 w-24 ml-auto" />
                        <Skeleton className="h-3 w-14 mt-1 ml-auto" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <ListEmptyState
              icon={Activity}
              isNarrowed={search.isNarrowed}
              query={search.appliedQuery}
              entityLabel="activity"
              emptyTitle="No activity yet"
              emptyDescription="AI interview and candidate events appear here as they happen."
              onReset={search.reset}
            />
          ) : (
            <div className="space-y-4">
              {/* Select All — this page's entries, like the table tabs'
                  header checkbox. */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAllOnPage}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
                  aria-label={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                  title={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                >
                  {allOnPageSelected ? (
                    <CheckSquare className="w-4 h-4 text-brand-blue" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                <span className="tf-meta">
                  {selectedKeys.size > 0 ? `${selectedKeys.size} selected` : 'Select all'}
                </span>
              </div>
              {displayMode === 'grid' ? (
                /* Card view — one card per entry, the Candidate Results grid's
                   card shell. Clicking a card opens its Details inside it, the
                   same toggle the timeline row uses. */
                <div className="tf-grid-4 pt-2">
                  {activities.map((activity, index) => {
                    const colors = ACTIVITY_COLORS[activity.activity_type] || ACTIVITY_COLORS.config_created;
                    const icon = ACTIVITY_ICONS[activity.activity_type] || <Activity className="w-4 h-4" />;
                    const isExpanded = selectedActivity === activity.id;
                    const key = activityKey(activity, index);
                    const isSelected = selectedKeys.has(key);
                    return (
                      <div
                        key={key}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedActivity(isExpanded ? null : activity.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setSelectedActivity(isExpanded ? null : activity.id); }}
                        className={`group relative text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3 cursor-pointer ${gridCardSelectedClass(isSelected)}`}
                      >
                        <GridCardSelect
                          selected={isSelected}
                          onToggle={() => toggleSelected(key)}
                          label={activity.title}
                          selectionActive={selectedKeys.size > 0}
                        />
                        <div className="flex items-start gap-2.5">
                          <div className={`flex-shrink-0 w-9 h-9 rounded-full border-2 ${colors.border} ${colors.bg} flex items-center justify-center ${colors.icon}`}>
                            {icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`font-medium truncate ${colors.text}`} title={activity.title}>{activity.title}</p>
                            <span className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full ${
                              activity.category === 'config_lifecycle'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-indigo-100 text-indigo-700'
                            }`}>
                              {getCategoryLabel(activity.category)}
                            </span>
                          </div>
                        </div>

                        <p className="tf-meta line-clamp-3 [overflow-wrap:anywhere]" title={activity.description}>
                          {activity.description}
                        </p>

                        <div className="flex flex-col gap-1 tf-meta">
                          {activity.actor_name && (
                            <span className="flex items-center gap-1 min-w-0">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{activity.actor_name}</span>
                            </span>
                          )}
                          {activity.config_title && (
                            <span className="flex items-center gap-1 min-w-0">
                              <FileText className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate" title={activity.config_title}>{activity.config_title}</span>
                            </span>
                          )}
                          {activity.score !== null && activity.score !== undefined && (
                            <span className="flex items-center gap-1">
                              <Award className="w-3 h-3" />
                              Score: {activity.score.toFixed(1)}%
                            </span>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs space-y-1.5 [overflow-wrap:anywhere]">
                            <div><span className="text-gray-500">Activity Type:</span> <span className="text-gray-900">{activity.activity_type.replace(/_/g, ' ')}</span></div>
                            {activity.jd_title && (
                              <div><span className="text-gray-500">JD Title:</span> <span className="text-gray-900">{activity.jd_title}</span></div>
                            )}
                            {activity.candidate_email && (
                              <div><span className="text-gray-500">Candidate Email:</span> <span className="text-gray-900">{activity.candidate_email}</span></div>
                            )}
                            <div><span className="text-gray-500">Timestamp:</span> <span className="text-gray-900">{formatIST(activity.timestamp)}</span></div>
                            {activity.config_id && (
                              <div><span className="text-gray-500">Config ID:</span> <span className="text-gray-900 font-mono">{activity.config_id}</span></div>
                            )}
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-slate-800 text-xs">
                          <span className="text-gray-500">{formatTimestamp(activity.timestamp)}</span>
                          <span className="text-gray-400 group-hover:text-gray-600">
                            <Eye className="w-3 h-3 inline mr-1" />
                            {isExpanded ? 'Hide' : 'Details'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : activities.map((activity, index) => {
                const colors = ACTIVITY_COLORS[activity.activity_type] || ACTIVITY_COLORS.config_created;
                const icon = ACTIVITY_ICONS[activity.activity_type] || <Activity className="w-4 h-4" />;
                const isExpanded = selectedActivity === activity.id;
                const key = activityKey(activity, index);
                const isSelected = selectedKeys.has(key);

                return (
                  <Fragment key={key}>
                    <div
                      className={`relative flex items-start gap-3 sm:gap-4 p-4 rounded-lg border ${colors.border} ${colors.bg} hover:shadow-sm transition-shadow cursor-pointer`}
                      onClick={() => setSelectedActivity(isExpanded ? null : activity.id)}
                    >
                      {index < activities.length - 1 && (
                        <div className="absolute left-[54px] sm:left-[58px] top-[52px] w-0.5 h-[calc(100%+16px)] bg-gray-200" />
                      )}

                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleSelected(key); }}
                        className="mt-2.5 p-1 -m-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex-shrink-0 relative z-10"
                        aria-label={isSelected ? 'Deselect activity' : 'Select activity'}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand-blue" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>

                      <div className={`flex-shrink-0 w-10 h-10 rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center ${colors.icon} relative z-10 bg-white`}>
                        {icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Stacks below sm (timestamp + Details under the text):
                            side by side, the 115px timestamp column pushed the
                            text column past the card's edge on a phone. */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h4 className={`font-medium ${colors.text}`}>
                                {activity.title}
                              </h4>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                activity.category === 'config_lifecycle'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-indigo-100 text-indigo-700'
                              }`}>
                                {getCategoryLabel(activity.category)}
                              </span>
                            </div>
                            <p className="tf-body-secondary [overflow-wrap:anywhere]">{activity.description}</p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 tf-meta">
                              {activity.actor_name && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {activity.actor_name}
                                </span>
                              )}
                              {activity.config_title && (
                                <span className="flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  {activity.config_title}
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
                          <div className="flex items-center gap-3 sm:block sm:text-right flex-shrink-0">
                            <p className="tf-body-muted">{formatTimestamp(activity.timestamp)}</p>
                            <button className="mt-1 text-xs text-gray-400 hover:text-gray-600">
                              <Eye className="w-3 h-3 inline mr-1" />
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="ml-0 sm:ml-14 mt-2 sm:mt-0 p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm [overflow-wrap:anywhere]">
                        <div className="tf-grid-2">
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
                          {activity.candidate_email && (
                            <div>
                              <span className="text-gray-500">Candidate Email:</span>
                              <span className="ml-2 text-gray-900">{activity.candidate_email}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-gray-500">Timestamp:</span>
                            <span className="ml-2 text-gray-900">{formatIST(activity.timestamp)}</span>
                          </div>
                          {activity.config_id && (
                            <div>
                              <span className="text-gray-500">Config ID:</span>
                              <span className="ml-2 text-gray-900 font-mono text-xs">{activity.config_id}</span>
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
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between max-sm:justify-center gap-3">
          <div className="tf-body-secondary max-sm:text-center">
            Showing {activities.length} of {total} activity entries
          </div>
          {total > pageSize && (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline tf-body-secondary whitespace-nowrap">Go to</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={goToPage}
                  onChange={(e) => setGoToPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                      commitGoToPage();
                    }
                  }}
                  onBlur={commitGoToPage}
                  aria-label="Go to page"
                  className="tf-input w-14 h-8 px-2 text-center rounded-md"
                />
              </div>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 disabled:hover:text-gray-700 transition-colors"
                aria-label="Previous page" title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="tf-label px-1 whitespace-nowrap">
                <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 disabled:hover:text-gray-700 transition-colors"
                aria-label="Next page" title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
