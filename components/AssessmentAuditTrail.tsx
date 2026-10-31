import { useState, useEffect, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  Download, CheckCircle, XCircle, Clock, AlertTriangle,
  FileText, RefreshCw, Eye, Calendar, Mail, User, Building2, Hash, Activity,
  Plus, Edit, Trash2, Send, Play, Award, UserX, TimerOff, Loader2,
  ChevronLeft, ChevronRight, MailWarning, LogOut, Ban, Save, Copy, X, Square, CheckSquare
} from 'lucide-react';
import { assessmentService, CombinedAuditActivity, CombinedAuditTrailResponse } from '@/lib/services';
import { formatIST } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/useAuth';
import ListToolbar from '@/components/ui/list-toolbar';
/* Puts the row below into the host page's one toolbar position — on the
   Assessments page, above the tab pills, where every other tab's search sits.
   Without a host slot it renders in place, as it did before. */
import { ListToolbarPortal } from '@/components/ui/list-toolbar-slot';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListEmptyState from '@/components/ui/list-empty-state';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { Skeleton, CardGridSkeleton } from '@/components/ui/skeleton';
import ListViewToggle, { type ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import { exportRows } from '@/lib/utils/exportUtils';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { formatScore } from '@/lib/utils/score';

type CategoryFilter = 'all' | 'assessment_lifecycle' | 'candidate_activity';

// Icon mapping for each activity type
const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  assessment_created: <Plus className="w-4 h-4" />,
  assessment_updated: <Edit className="w-4 h-4" />,
  assessment_version_created: <Copy className="w-4 h-4" />,
  assessment_deleted: <Trash2 className="w-4 h-4" />,
  assessment_published: <Send className="w-4 h-4" />,
  assessment_activated: <RefreshCw className="w-4 h-4" />,
  assessment_archived: <FileText className="w-4 h-4" />,
  assessment_saved_as_draft: <Save className="w-4 h-4" />,
  assessment_draft_updated: <Save className="w-4 h-4" />,
  invites_revoked: <Ban className="w-4 h-4" />,
  candidate_invited: <Mail className="w-4 h-4" />,
  candidate_started: <Play className="w-4 h-4" />,
  candidate_completed: <Award className="w-4 h-4" />,
  candidate_failed: <UserX className="w-4 h-4" />,
  candidate_expired: <TimerOff className="w-4 h-4" />,
  invite_failed: <MailWarning className="w-4 h-4" />,
  invite_email_changed: <Edit className="w-4 h-4" />,
  candidate_exited: <LogOut className="w-4 h-4" />,
  candidate_errored: <AlertTriangle className="w-4 h-4" />,
  recording_downloaded: <Download className="w-4 h-4" />,
  assessment_create_failed: <AlertTriangle className="w-4 h-4" />,
  invite_resent: <RefreshCw className="w-4 h-4" />,
  link_shared: <Copy className="w-4 h-4" />,
  invite_bounced: <MailWarning className="w-4 h-4" />,
  invite_revoked: <Ban className="w-4 h-4" />,
  invite_edited: <Edit className="w-4 h-4" />,
};

// Color mapping for each activity type
const ACTIVITY_COLORS: Record<string, { bg: string; text: string; icon: string; border: string }> = {
  assessment_created: { bg: 'bg-brand-blue/5', text: 'text-brand-blue', icon: 'text-brand-blue', border: 'border-brand-blue/20' },
  assessment_updated: { bg: 'bg-brand-cyan/5', text: 'text-brand-cyan', icon: 'text-brand-cyan', border: 'border-brand-cyan/20' },
  assessment_version_created: { bg: 'bg-brand-blue/5', text: 'text-brand-blue', icon: 'text-brand-blue', border: 'border-brand-blue/20' },
  assessment_deleted: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  assessment_published: { bg: 'bg-success-subtle', text: 'text-success', icon: 'text-success', border: 'border-success-line' },
  assessment_activated: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500', border: 'border-green-200' },
  assessment_archived: { bg: 'bg-slate-50', text: 'text-gray-700', icon: 'text-gray-500', border: 'border-gray-200' },
  assessment_saved_as_draft: { bg: 'bg-brand-blue/5', text: 'text-brand-blue', icon: 'text-brand-blue', border: 'border-brand-blue/20' },
  assessment_draft_updated: { bg: 'bg-brand-cyan/5', text: 'text-brand-cyan', icon: 'text-brand-cyan', border: 'border-brand-cyan/20' },
  invites_revoked: { bg: 'bg-slate-50', text: 'text-gray-700', icon: 'text-gray-500', border: 'border-gray-200' },
  candidate_invited: { bg: 'bg-brand-cyan/5', text: 'text-brand-cyan', icon: 'text-brand-cyan', border: 'border-brand-cyan/20' },
  candidate_started: { bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', icon: 'text-brand-orange', border: 'border-brand-orange/20' },
  candidate_completed: { bg: 'bg-success-subtle', text: 'text-success', icon: 'text-success', border: 'border-success-line' },
  candidate_failed: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  candidate_expired: { bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', icon: 'text-brand-orange', border: 'border-brand-orange/20' },
  invite_failed: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  invite_email_changed: { bg: 'bg-brand-cyan/5', text: 'text-brand-cyan', icon: 'text-brand-cyan', border: 'border-brand-cyan/20' },
  candidate_exited: { bg: 'bg-brand-orange/10', text: 'text-brand-orange-deep', icon: 'text-brand-orange', border: 'border-brand-orange/20' },
  candidate_errored: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  recording_downloaded: { bg: 'bg-brand-blue/5', text: 'text-brand-blue', icon: 'text-brand-blue', border: 'border-brand-blue/20' },
  assessment_create_failed: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  invite_resent: { bg: 'bg-brand-cyan/5', text: 'text-brand-cyan', icon: 'text-brand-cyan', border: 'border-brand-cyan/20' },
  link_shared: { bg: 'bg-brand-cyan/5', text: 'text-brand-cyan', icon: 'text-brand-cyan', border: 'border-brand-cyan/20' },
  invite_bounced: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  invite_revoked: { bg: 'bg-destructive-subtle', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive-line' },
  invite_edited: { bg: 'bg-brand-cyan/5', text: 'text-brand-cyan', icon: 'text-brand-cyan', border: 'border-brand-cyan/20' },
};

export interface AssessmentAuditTrailProps {
  /**
   * DOM node to portal the search/filter toolbar into. When unset the toolbar
   * goes through `ListToolbarPortal` (the Assessments page's shared slot via
   * context), and renders inline where there is no host slot at all.
   */
  toolbarSlot?: HTMLDivElement | null;
  /** Bumped by the host's Refresh button to force a reload. */
  refreshSignal?: number;
  /**
   * List (timeline) or card grid — owned by the host so every tab shares one
   * choice, as on the AI Interviews page. The toggle only renders when
   * `onDisplayModeChange` is passed.
   */
  displayMode?: ListDisplayMode;
  onDisplayModeChange?: (mode: ListDisplayMode) => void;
}

export default function AssessmentAuditTrail({ toolbarSlot, refreshSignal, displayMode = 'list', onDisplayModeChange }: AssessmentAuditTrailProps = {}) {
  /* Export Logs is behind `assessments:export` (the server export endpoint
     enforces it too). Without it the button stays, greyed, with the reason. */
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canExportAssessments = isTenantAdmin || hasPermissionCode('assessments:export');
  const EXPORT_DENIED_REASON = 'You do not have permission to export assessments';
  const [activities, setActivities] = useState<CombinedAuditActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /* A failed load used to be swallowed into console.log, leaving the tab
     showing "No activity yet" — indistinguishable from a tenant that genuinely
     has none, which is how a 500 here went unnoticed while Export Logs (which
     surfaces its error) was the only visible symptom. */
  const [loadError, setLoadError] = useState<string | null>(null);
  /* The three segment badges show totals of the WHOLE set (see the comment
     above the segment control), so they never actually change value when a
     category chip is clicked — only the table rows do. Blanking them to "—"
     on every `isLoading` tick made each click shrink the chip then snap it
     back once the fetch resolved. Gating the placeholder on "never loaded
     yet" keeps the badges — and therefore the chip widths — stable across
     filter clicks, while a genuine first load (or a failed one that never
     populated stats) still shows the placeholder. */
  const [hasLoadedStatsOnce, setHasLoadedStatsOnce] = useState(false);
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

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Search + date range come from the shared hook: it owns the typed-vs-applied
  // query, the staged panel, the active count and the reset. The category
  // segments stay local — they are their own control, not part of the panel.
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

  // Row selection — the AI Interviews Activity Logs tab's: ticked rows are
  // what Export Logs saves; with none ticked it exports the whole filtered
  // set server-side, as before. Keyed by the row's position-qualified id, the
  // key the list renders with, since one activity id can repeat.
  const activityKey = (activity: CombinedAuditActivity, index: number) => `${activity.id}-${index}`;
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

  // Fetch audit trail data
  const loadAuditTrail = async () => {
    setIsLoading(true);
    try {
      setLoadError(null);
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
        // A new page or filter is a new list — a selection made on the old one
        // no longer points at anything on screen.
        setSelectedKeys(new Set());
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
        setHasLoadedStatsOnce(true);
      }
      console.log('[TalentFlow] Loaded combined audit trail');
    } catch (error) {
      console.error('[TalentFlow] Failed to load combined audit trail:', error);
      setActivities([]);
      setTotal(0);
      setLoadError(
        error instanceof Error && error.message
          ? error.message
          : 'Could not load the activity log.',
      );
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

  // `searchTerm` is the hook's debounced value, so this fires once per pause
  // rather than per keystroke — the hand-rolled timer this replaced did the
  // same job, and the hook's page reset covers the page > 1 case.
  useEffect(() => {
    if (page === 1) loadAuditTrail();
  }, [searchTerm, filterDateFrom, filterDateTo]);

  const [isExporting, setIsExporting] = useState(false);
  // "Export Logs" opens the format dialog rather than downloading straight
  // away — the same choice the Assessment Results export offers, and the
  // format the recruiter picks is what the audit trail then names
  // ("Activity Logs Exported – CSV" / "– Excel").
  const [showExportModal, setShowExportModal] = useState(false);

  // Honors whatever the tab is currently filtered to — not just the
  // current page — so the export matches what the recruiter is looking at.
  // The backend logs this call itself.
  const handleExportAuditLogs = async (exportFormat: 'csv' | 'excel') => {
    if (!canExportAssessments) return;
    if (isExporting) return;
    setIsExporting(true);
    setShowExportModal(false);
    // Ticked rows: saved from what is on screen (the AI Interviews tab's
    // behaviour). Nothing ticked: the server exports the whole filtered set.
    if (selectedKeys.size > 0) {
      try {
        const picked = activities.filter((activity, index) => selectedKeys.has(activityKey(activity, index)));
        const rows = picked.map((activity) => [
          formatIST(activity.timestamp),
          activity.title,
          getCategoryLabel(activity.category),
          activity.activity_type.replace(/_/g, ' '),
          activity.description,
          activity.actor_name ?? '',
          activity.assessment_title ?? '',
          activity.jd_title ?? '',
          activity.candidate_email ?? '',
          activity.score !== null && activity.score !== undefined ? formatScore(activity.score) : '',
        ]);
        await exportRows(
          exportFormat === 'excel' ? 'xlsx' : 'csv',
          ['Timestamp', 'Activity', 'Category', 'Activity Type', 'Description', 'Actor', 'Assessment', 'Job', 'Candidate Email', 'Score'],
          rows,
          'assessment_activity_logs',
          { sheetName: 'Activity Logs', title: 'Assessment Activity Logs' },
        );
        toast.success(`Exported ${rows.length} activity log entries as ${exportFormat === 'excel' ? 'Excel' : 'CSV'}`);
        // Built in the browser, so the audit row comes from this call. (The
        // nothing-ticked path below is a server export that audits itself.)
        void assessmentService.logListExport({
          format: exportFormat,
          record_count: rows.length,
          export_type: 'assessment_activity_logs_selected',
          tab: 'audit',
          ids: picked.map((activity) => String(activity.id ?? '')).filter(Boolean),
        });
      } catch (error) {
        console.error('Failed to export selected audit logs:', error);
        toast.error('Failed to export activity logs. Please try again.');
      } finally {
        setIsExporting(false);
      }
      return;
    }
    try {
      const blob = await assessmentService.exportCombinedAuditTrail({
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        search: searchTerm || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        format: exportFormat,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `assessment_activity_logs_${stamp}.${exportFormat === 'excel' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`Activity logs exported as ${exportFormat === 'excel' ? 'Excel' : 'CSV'}`);
    } catch (error) {
      console.error('Failed to export audit logs:', error);
      const msg = error instanceof Error ? error.message : '';
      toast.error(/permission|forbidden|403/i.test(msg)
        ? EXPORT_DENIED_REASON
        : 'Failed to export activity logs. Please try again.');
    } finally {
      setIsExporting(false);
    }
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
      {/* Summary + category filter, with no cards in it.

          The five-tile card row that stood here was more furniture than five
          counts deserved: it pushed the log — the only thing this tab exists to
          show — below the fold, and it sat directly above a SECOND row of
          controls, the "Filter:" chips, which already carried two of the same
          numbers. Two rows of chrome for one summary.

          So the two rows become one, the way the Invitation Status tab on this
          same page already did it (see the note above its segmented control in
          `Assessments.tsx`, which reached this conclusion first and for the same
          reason). The categories are a segmented control — slate trough, white
          raised pill for the selection, count badge in the segment's own tint —
          and the four figures that are NOT filters trail off to the right as
          plain text.

          Which half a number lands in is decided by one rule: can you click it
          and see exactly those rows? All / Lifecycle / Candidate are the
          `category` this tab filters by, so they are the segments and clicking
          them is honest. Created, Invited, In Progress and Completed have no
          filter behind them — "Completed" could only ever narrow to ALL
          candidate activity, so a card or a segment for it would promise rows
          it cannot deliver. They stay flat: `tabular-nums` figures, a coloured
          icon, no border, nothing to press.

          Icon colours are `ACTIVITY_COLORS` above, the same map the log rows
          below use to mark each event type, so a rail figure and the rows it
          counts cannot disagree about what colour "invited" is. The two
          category segments keep the blue and cyan their chips already wore.

          Counts are of the WHOLE set, not the current query, so narrowing the
          table never moves them — again the Invitation Status rule. The
          narrowed reading has its own home in "Showing N of M entries" under
          the table. */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div
          role="group"
          aria-label="Filter activity by category"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] self-start overflow-x-auto scrollbar-hide max-w-full"
        >
          {/* Classes are spelled out per segment rather than built from the key
              — `text-brand-${x}` would be invisible to Tailwind's scanner,
              which only reads literal class strings.

              All Events is the sum of the two category counts rather than
              `total`: `total` is the count for the CURRENT query, so the moment
              you picked Lifecycle the All badge would drop to the Lifecycle
              figure and the control would contradict itself. The two summands
              are the very values the chips this replaces already displayed, so
              this reads nothing new from the response. */}
          {([
            { key: 'all' as const, label: 'All Events', short: 'All', icon: Activity,
              value: stats.total_lifecycle_events + stats.total_candidate_events,
              text: 'text-gray-700 dark:text-slate-200', tint: 'bg-gray-200/70 dark:bg-slate-700/60', ring: 'ring-gray-300 dark:ring-slate-600' },
            { key: 'assessment_lifecycle' as const, label: 'Assessment Lifecycle', short: 'Lifecycle', icon: FileText,
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
                /* Clicking the selected segment clears back to all; `all` is
                   exempt because it already IS the cleared state. Same rule the
                   chips had.

                   `setPage(1)` is new, and it is a fix rather than a flourish:
                   the chips left the pager where it was, so switching category
                   while on page 3 of candidate activity asked the API for page 3
                   of a lifecycle list that may only have one, and the table came
                   back empty. */
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
                {/* The icon keeps its segment colour in every state, so it does
                    not inherit the button's grey resting label colour. */}
                <SegmentIcon className={`w-3.5 h-3.5 flex-shrink-0 ${segment.text}`} />
                <span className="hidden sm:inline">{segment.label}</span>
                <span className="sm:hidden">{segment.short}</span>
                <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-2xs font-semibold tabular-nums ring-1 transition-colors ${segment.text} ${segment.tint} ${segment.ring}`}>
                  {isLoading && !hasLoadedStatsOnce ? '—' : segment.value.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>

        {/* The breakdown. Reads as a sentence rather than a set of controls,
            which is the point — these are the four figures you can look at but
            not act on. Hairline dividers rather than gaps alone so the pairs
            group at a glance, and `tabular-nums` so nothing shifts sideways as
            the counts refresh underneath. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm lg:justify-end flex-shrink-0">
          {([
            { icon: Plus, value: stats.assessments_created, label: 'created', text: 'text-brand-blue' },
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
                  <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-50">
                    {isLoading ? '—' : item.value.toLocaleString()}
                  </span>
                  <span className="text-gray-500 dark:text-slate-400">{item.label}</span>
                </span>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Main Audit Trail */}
      <div className="bg-white rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 ring-1 ring-black/[0.02] tf-round-edges">
        {/* Header */}
        <div className="p-3 sm:p-6 border-b border-gray-100">
          {/* No bottom margin: the search row that used to follow this line
              is portalled to the page's toolbar slot, so the header is now the
              whole of this block. */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="tf-section-title">Activity Log</h2>
              <p className="tf-card-desc mt-0.5 sm:mt-1">
                Complete activity log for assessments and candidates
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => { if (canExportAssessments) setShowExportModal(true); }}
              disabled={isExporting}
              aria-disabled={!canExportAssessments || undefined}
              title={canExportAssessments ? undefined : EXPORT_DENIED_REASON}
              className={`self-start sm:self-auto ${canExportAssessments ? '' : 'opacity-60 cursor-not-allowed'}`}
              icon={isExporting ? (
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            >
              {isExporting ? 'Exporting…' : `Export Logs${selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ''}`}
            </Button>
          </div>

          {/* Search + filters in the job-openings format.

              Portalled out of this card header and up to the page's toolbar
              slot: this tab used to draw the same row inside its own card,
              which put the search box a card-header lower than it sits on
              every other tab. The controls, the hook behind them and the
              request they build are untouched. */}
          {(() => {
          const toolbarEl = (
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
            /* The count badge every other tab's toolbar closes with. `filtered`
               is the total for the CURRENT query, which is what the request
               returns; `total` is every event this tenant has, the sum of the
               two category figures the segments above already show. So it
               reads "18 of 412 events" and both numbers come from the same
               response. */
            countBadge={
              <ListCountBadge
                filtered={total}
                total={stats.total_lifecycle_events + stats.total_candidate_events}
                noun="event"
              />
            }
            filterPanel={
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <label htmlFor="audit-date-from" className="block tf-label mb-1.5">Date From</label>
                  <DateField
                    id="audit-date-from"
                    aria-label="Date From"
                    value={search.draftFilters.dateFrom}
                    max={search.draftFilters.dateTo || undefined}
                    onChange={(v) => search.setDraftFilter('dateFrom', v)}
                    className="min-w-0 h-[38px]"
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
                    className="min-w-0 h-[38px]"
                  />
                </div>
              </div>

              {/* Panel footer: "Done" applies the selection and reveals the
                  toolbar Clear - same flow as job-openings. */}
              <div className="mt-4 pt-3 border-t border-brand-blue/10 flex flex-wrap items-center justify-end gap-2">
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
            trailing={onDisplayModeChange ? <ListViewToggle value={displayMode} onChange={onDisplayModeChange} /> : undefined}
          />
          );
          return toolbarSlot
            ? createPortal(toolbarEl, toolbarSlot)
            : <ListToolbarPortal>{toolbarEl}</ListToolbarPortal>;
          })()}
        </div>

        {/* Timeline View */}
        <div className="p-3 sm:p-6">
          {isLoading && displayMode === 'grid' ? (
            // Card view loads as card skeletons, not the timeline.
            <CardGridSkeleton count={8} className="xl:grid-cols-4" />
          ) : isLoading ? (
            <div className="space-y-3 sm:space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="relative flex items-start gap-2.5 sm:gap-4 p-3 sm:p-4 rounded-lg border border-gray-100 bg-white"
                >
                  {/* Icon */}
                  <Skeleton className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full" />
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                          <Skeleton className="h-4 sm:h-5 w-48" />
                          <Skeleton className="h-4 w-16 rounded-full" />
                        </div>
                        <Skeleton className="h-3.5 w-full max-w-lg mb-1.5" />
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1.5 sm:mt-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                      </div>
                      <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 flex-shrink-0 mt-1 sm:mt-0">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            /* An error is NOT an empty list — say so, and offer the retry,
               rather than claiming the tenant has no activity. */
            <div className="py-10 sm:py-14 text-center">
              <AlertTriangle className="w-8 h-8 text-brand-orange-deep mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900 mb-1">Could not load the activity log</p>
              <p className="tf-card-desc mb-4">{loadError}</p>
              <button
                type="button"
                onClick={() => loadAuditTrail()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-brand-blue/30 text-brand-blue bg-white hover:bg-brand-blue/5 transition-colors text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
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
              {/* Select All — this page's entries, as on the AI Interviews
                  Activity Logs tab. */}
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
                /* Card view — the AI Interviews Activity Logs card. Clicking a
                   card opens its Details inside it, the same toggle the
                   timeline row uses. */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pt-2">
                  {activities.map((activity, index) => {
                    const colors = ACTIVITY_COLORS[activity.activity_type] || ACTIVITY_COLORS.assessment_created;
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
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                                activity.category === 'assessment_lifecycle'
                                  ? 'bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20'
                                  : 'bg-brand-cyan/5 text-brand-cyan ring-1 ring-brand-cyan/20'
                              }`}>
                                {getCategoryLabel(activity.category)}
                              </span>
                              {activity.passed !== null && activity.passed !== undefined && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  activity.passed ? 'bg-success-subtle text-success' : 'bg-destructive-subtle text-destructive'
                                }`}>
                                  {activity.passed ? 'Passed' : 'Failed'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <p className="tf-meta-strong line-clamp-3 [overflow-wrap:anywhere]" title={activity.description}>
                          {activity.description}
                        </p>

                        <div className="flex flex-col gap-1 tf-meta">
                          {activity.actor_name && (
                            <span className="flex items-center gap-1 min-w-0">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{activity.actor_name}</span>
                            </span>
                          )}
                          {activity.assessment_title && (
                            <span className="flex items-center gap-1 min-w-0">
                              <FileText className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate" title={activity.assessment_title}>{activity.assessment_title}</span>
                            </span>
                          )}
                          {activity.score !== null && activity.score !== undefined && (
                            <span className="flex items-center gap-1">
                              <Award className="w-3 h-3" />
                              Score: {formatScore(activity.score)}%
                            </span>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="p-3 bg-slate-50 rounded-lg border border-gray-100 text-xs space-y-1.5 [overflow-wrap:anywhere]">
                            <div><span className="text-gray-500">Activity Type:</span> <span className="text-gray-900">{activity.activity_type.replace(/_/g, ' ')}</span></div>
                            {activity.jd_title && (
                              <div><span className="text-gray-500">JD Title:</span> <span className="text-gray-900">{activity.jd_title}</span></div>
                            )}
                            {activity.actor_email && (
                              <div><span className="text-gray-500">Actor Email:</span> <span className="text-gray-900">{activity.actor_email}</span></div>
                            )}
                            {activity.candidate_email && (
                              <div><span className="text-gray-500">Candidate Email:</span> <span className="text-gray-900">{activity.candidate_email}</span></div>
                            )}
                            <div><span className="text-gray-500">Timestamp:</span> <span className="text-gray-900">{formatIST(activity.timestamp)}</span></div>
                            {activity.assessment_id && (
                              <div><span className="text-gray-500">Assessment ID:</span> <span className="text-gray-900 font-mono">{activity.assessment_id}</span></div>
                            )}
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-slate-800 text-xs">
                          <span className="text-gray-500">{formatTimestamp(activity.timestamp)}</span>
                          <span className="text-gray-400 group-hover:text-brand-blue">
                            <Eye className="w-3 h-3 inline mr-1" />
                            {isExpanded ? 'Hide' : 'Details'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : activities.map((activity, index) => {
                const colors = ACTIVITY_COLORS[activity.activity_type] || ACTIVITY_COLORS.assessment_created;
                const icon = ACTIVITY_ICONS[activity.activity_type] || <Activity className="w-4 h-4" />;
                const isExpanded = selectedActivity === activity.id;
                const key = activityKey(activity, index);
                const isSelected = selectedKeys.has(key);

                return (
                  <Fragment key={key}>
                    <div
                      className={`relative flex items-start gap-2.5 sm:gap-4 p-3 sm:p-4 rounded-lg border ${colors.border} ${colors.bg} hover:shadow-sm transition-shadow cursor-pointer`}
                      onClick={() => setSelectedActivity(isExpanded ? null : activity.id)}
                    >
                      {/* Timeline line - hidden on mobile */}
                      {index < activities.length - 1 && (
                        <div className="hidden sm:block absolute left-[54px] top-[52px] w-0.5 h-[calc(100%+16px)] bg-gray-200" />
                      )}

                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleSelected(key); }}
                        className="mt-2 sm:mt-2.5 p-1 -m-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex-shrink-0 relative z-10"
                        aria-label={isSelected ? 'Deselect activity' : 'Select activity'}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand-blue" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>

                      {/* Icon */}
                      <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center ${colors.icon} relative z-10 bg-white`}>
                        {icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                              <h4 className={`min-w-0 text-sm sm:text-base font-medium [overflow-wrap:anywhere] ${colors.text}`}>
                                {activity.title}
                              </h4>
                              <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${
                                activity.category === 'assessment_lifecycle'
                                  ? 'bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20'
                                  : 'bg-brand-cyan/5 text-brand-cyan ring-1 ring-brand-cyan/20'
                              }`}>
                                {getCategoryLabel(activity.category)}
                              </span>
                              {activity.passed !== null && activity.passed !== undefined && (
                                <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${
                                  activity.passed ? 'bg-success-subtle text-success' : 'bg-destructive-subtle text-destructive'
                                }`}>
                                  {activity.passed ? 'Passed' : 'Failed'}
                                </span>
                              )}
                            </div>
                            <p className="tf-card-desc line-clamp-2">{activity.description}</p>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1.5 sm:mt-2 tf-meta">
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
                                  Score: {formatScore(activity.score)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-0 flex-shrink-0 mt-1 sm:mt-0">
                            <p className="tf-body-muted">{formatTimestamp(activity.timestamp)}</p>
                            <button className="sm:mt-1 text-xs text-gray-400 hover:text-brand-blue">
                              <Eye className="w-3 h-3 inline mr-0.5 sm:mr-1" />
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="ml-0 sm:ml-14 p-3 sm:p-4 bg-slate-50 rounded-lg border border-gray-100 text-sm">
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
                              <span className="ml-1.5 sm:ml-2 text-gray-900 font-mono text-xs">{activity.assessment_id}</span>
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
          <div className="tf-card-desc">
            Showing {activities.length} of {total} entries
          </div>
          {total > pageSize && (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline tf-card-desc whitespace-nowrap">Go to</span>
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
                  className="w-14 h-8 px-2 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
                />
              </div>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                aria-label="Previous page" title="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
                <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                aria-label="Next page" title="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Export format dialog — the same choice, wording and layout the
          Assessment Results export opens with. One step, not two: the tab's
          own filters already decide what goes in the file, so there is no
          scope question to ask after the format. */}
      {showExportModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
          <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 tracking-tight truncate">Export Activity Logs</h3>
                  <p className="tf-body-muted mt-1">Choose format</p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1.5 shrink-0 text-gray-400 hover:text-brand-blue rounded-md hover:bg-brand-blue/5 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5">
              <p className="tf-card-desc mb-3 sm:mb-4">Choose export format:</p>

              <div className="space-y-2.5 sm:space-y-3">
                <button
                  onClick={() => handleExportAuditLogs('csv')}
                  className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-gray-200 rounded-xl hover:bg-brand-blue/5 hover:border-brand-blue/30 transition-all group"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-100 to-green-50 ring-1 ring-green-200 flex items-center justify-center transition-colors flex-shrink-0">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-green-700" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-sm sm:text-base font-medium text-gray-900">CSV Format</div>
                    <div className="tf-body-muted">Compatible with Excel, Google Sheets</div>
                  </div>
                </button>

                <button
                  onClick={() => handleExportAuditLogs('excel')}
                  className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border border-gray-200 rounded-xl hover:bg-brand-blue/5 hover:border-brand-blue/30 transition-all group"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center transition-colors flex-shrink-0">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-sm sm:text-base font-medium text-gray-900">Excel Format (XLSX)</div>
                    <div className="tf-body-muted">Native Excel format with better formatting</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
