'use client';

import {
  Activity,
  RefreshCw,
  Clock,
  User,
  FileText,
  Users,
  Settings,
  Briefcase,
  FolderOpen,
  CreditCard,
  LogIn,
  LogOut,
  Plus,
  Edit,
  Trash2,
  Upload,
  Eye,
  Send,
  Timer,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import {
  ERROR_ORIGIN_LABELS,
  ERROR_ORIGIN_COLORS,
  formatSessionDuration,
  type ErrorOrigin,
} from '@/lib/types/auditSession';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import AuditTrailPage from '@/app/(dashboard)/audits/trail/page';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/empty-state';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface AuditLog {
  id: string;
  user_name: string;
  user_email: string | null;
  action: string;
  action_label: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, any>;
  ip_address: string | null;
  // Session tracking fields
  session_start_time: string | null;
  interruption_time: string | null;
  session_end_time: string | null;
  total_session_duration: number | null;
  error_origin: 'TENANT' | 'SYSTEM' | 'NONE' | null;
  error_code: string | null;
  refund_flag: 'YES' | 'NO' | null;
  module_type: string | null;
  actor_role: string | null;
  created_at: string;
}

interface GroupedLogs {
  [date: string]: AuditLog[];
}

const actionIcons: Record<string, LucideIcon> = {
  login: LogIn,
  logout: LogOut,
  create: Plus,
  update: Edit,
  delete: Trash2,
  upload: Upload,
  view: Eye,
  invite: Send,
  default: Activity,
};

const entityIcons: Record<string, LucideIcon> = {
  user: Users,
  job_description: Briefcase,
  resume: FileText,
  folder: FolderOpen,
  assessment: Activity,
  settings: Settings,
  subscription: CreditCard,
};

// Soft-tinted icon tile per action — semantic colour, refined (not loud solid fills).
const actionTone: Record<string, { tile: string; icon: string }> = {
  login: { tile: 'bg-brand-blue/10 ring-brand-blue/15', icon: 'text-brand-blue' },
  logout: { tile: 'bg-gray-100 dark:bg-slate-800 ring-gray-200 dark:ring-slate-700', icon: 'text-gray-500 dark:text-slate-400' },
  create: { tile: 'bg-success/10 ring-success/20', icon: 'text-success' },
  update: { tile: 'bg-brand-blue/10 ring-brand-blue/15', icon: 'text-brand-blue' },
  delete: { tile: 'bg-destructive/10 ring-destructive/20', icon: 'text-destructive' },
  publish: { tile: 'bg-brand-orange/10 ring-brand-orange/20', icon: 'text-brand-orange-deep' },
  default: { tile: 'bg-brand-blue/10 ring-brand-blue/15', icon: 'text-brand-blue' },
};

type ActivityTab = 'activity' | 'audit';

export default function ActivityLogsPage() {
  const [activeTab, setActiveTab] = useState<ActivityTab>('audit');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  // Persist the tab + fetch limit and the scroll position so returning to this
  // page (browser back / remount) lands the user where they left off. The
  // active tab swaps between the embedded Audit Trail and the Activity timeline,
  // which changes the page height drastically — re-detect the scroller on it.
  const rootRef = useScrollRestoration<HTMLElement>('audits-activity', !loading, [activeTab]);
  useListStatePersistence(
    'audits-activity',
    { activeTab, limit },
    (s) => {
      if (s.activeTab === 'activity' || s.activeTab === 'audit') setActiveTab(s.activeTab);
      if (typeof s.limit === 'number') setLimit(s.limit);
    },
  );

  const fetchRecentActivity = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');

      if (!token) {
        throw new Error('Session expired. Please log in again.');
      }

      const response = await fetch(`${API_URL}/audits/recent?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // Handle 401 - logout and redirect to login
        if (response.status === 401) {
          handleUnauthorized();
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        console.error('[DEBUG] Activity logs error:', response.status, errorData);
        throw new Error(errorData.detail || `Failed to fetch activity logs (${response.status})`);
      }

      const data = await response.json();
      setLogs(data || []);
    } catch (err: any) {
      console.error('Error fetching activity:', err);
      setError(err.message || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchRecentActivity();
  }, [fetchRecentActivity]);

  // Group logs by date
  const groupedLogs: GroupedLogs = logs.reduce((groups: GroupedLogs, log) => {
    const date = formatISTDate(log.created_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(log);
    return groups;
  }, {});

  const getActionIcon = (action: string): LucideIcon => {
    if (action.includes('login')) return actionIcons.login;
    if (action.includes('logout')) return actionIcons.logout;
    if (action.includes('create') || action.includes('upload')) return actionIcons.create;
    if (action.includes('update') || action.includes('change')) return actionIcons.update;
    if (action.includes('delete') || action.includes('remove')) return actionIcons.delete;
    if (action.includes('upload')) return actionIcons.upload;
    if (action.includes('view')) return actionIcons.view;
    if (action.includes('invite')) return actionIcons.invite;
    return actionIcons.default;
  };

  const getActionTone = (action: string): { tile: string; icon: string } => {
    if (action.includes('login')) return actionTone.login;
    if (action.includes('logout')) return actionTone.logout;
    if (action.includes('create') || action.includes('upload')) return actionTone.create;
    if (action.includes('update') || action.includes('change')) return actionTone.update;
    if (action.includes('delete') || action.includes('remove')) return actionTone.delete;
    if (action.includes('publish')) return actionTone.publish;
    return actionTone.default;
  };

  const getRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatISTTime(dateStr);
  };

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: activeTab === 'audit' ? 'Audit Logs' : 'Activity Logs' }]} />
        <div className="mb-5 flex flex-col gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
              <Activity className="h-5 w-5 text-brand-blue" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{activeTab === 'audit' ? 'Audit Logs' : 'Activity Logs'}</h1>
              <p className="mt-0.5 text-sm text-gray-600 dark:text-slate-400">{activeTab === 'audit' ? 'A detailed record of audited actions across your organization.' : 'A real-time view of recent system activity across your organization.'}</p>
            </div>
          </div>
          {activeTab === 'activity' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                className="h-10 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              >
                <option value="25">Last 25</option>
                <option value="50">Last 50</option>
                <option value="100">Last 100</option>
              </select>
              <Tooltip content="Refresh activity">
                <Button
                  variant="primary"
                  onClick={fetchRecentActivity}
                  aria-label="Refresh activity"
                  icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
                  className="px-3 sm:px-4"
                >
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Tab navigation — segmented control */}
        <section className="mb-5">
          <div role="tablist" aria-label="Activity tabs" className="inline-flex w-full max-w-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800/50 p-1">
            {([
              { id: 'audit', label: 'Audit Log' },
              { id: 'activity', label: 'Activity Log' },
            ] as { id: ActivityTab; label: string }[]).map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 text-brand-blue shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]'
                      : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Audit Log tab — embeds the Audit Trail page; strips its breadcrumb,
            hero banner, outer chrome, and shadow wrapper so the content lines
            up seamlessly. */}
        {activeTab === 'audit' && (
          <section
            className="mb-5
              [&_[data-slot=breadcrumb]]:hidden
              [&>main]:flex-none
              [&>main]:overflow-visible
              [&>main]:bg-transparent
              [&>main>div:not(.fixed)]:max-w-none
              [&>main>div:not(.fixed)]:!px-0
              [&>main>div:not(.fixed)]:!mx-0
              [&>main>div:not(.fixed)>div]:!bg-transparent
              [&>main>div:not(.fixed)>div]:!rounded-none
              [&>main>div:not(.fixed)>div]:!shadow-none
              [&>main>div:not(.fixed)>div]:!ring-0
              [&>main>div:not(.fixed)>div]:!border-0
              [&>main>div:not(.fixed)>div]:!p-0
              [&>main>div:not(.fixed)>div]:!my-0
              [&>main>div:not(.fixed)>div>section:first-of-type]:!hidden"
          >
            <AuditTrailPage />
          </section>
        )}

        {/* Timeline */}
        {activeTab === 'activity' && (
        <>

        {loading ? (
          <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-3 sm:px-5 py-2.5">
              <Skeleton className="h-3.5 w-3.5 rounded" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 sm:gap-4 px-3 sm:px-5 py-4">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40 max-w-full" />
                        <Skeleton className="h-3 w-56 max-w-full" />
                      </div>
                      <Skeleton className="h-3 w-14 shrink-0" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 rounded-xl border border-destructive-line bg-destructive-subtle/80 p-4 ring-1 ring-destructive-line">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive-subtle text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <p className="flex-1 text-sm font-medium text-destructive">{error}</p>
            <Button variant="primary" onClick={fetchRecentActivity}>Retry</Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <EmptyState
              icon={Activity}
              title="No recent activity"
              description="There is no recent system activity to show yet."
            />
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedLogs).map(([date, dayLogs]) => (
              <div key={date}>
                {/* Date divider */}
                <div className="mb-3 flex items-center gap-2 px-1">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-brand-blue" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">{date}</h3>
                  <span className="h-px flex-1 bg-gray-100 dark:bg-slate-700/60" />
                  <span className="rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-0.5 text-2xs font-medium tabular-nums text-gray-500 dark:text-slate-400">{dayLogs.length}</span>
                </div>

                {/* Activity cards */}
                <div className="space-y-2.5">
                  {dayLogs.map((log) => {
                    const ActionIcon = getActionIcon(log.action);
                    const EntityIcon = log.entity_type ? entityIcons[log.entity_type] || FileText : null;
                    const tone = getActionTone(log.action);

                    return (
                      <div
                        key={log.id}
                        className="group rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:border-brand-blue/20 hover:shadow-md"
                      >
                        <div className="flex items-start gap-3 sm:gap-4">
                          {/* Action icon tile — soft tinted */}
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tone.tile}`}>
                            <ActionIcon className={`h-5 w-5 ${tone.icon}`} />
                          </span>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                {/* Line 1 — actor + role */}
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                  <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">{log.user_name}</span>
                                  {log.actor_role && (
                                    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 text-2xs font-medium capitalize text-gray-500 dark:text-slate-400">{log.actor_role.replace(/_/g, ' ').toLowerCase()}</span>
                                  )}
                                </div>
                                {/* Line 2 — action + entity */}
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-600 dark:text-slate-400">
                                  <span>{log.action_label.toLowerCase()}</span>
                                  {log.entity_type && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-brand-blue/5 px-1.5 py-0.5 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/10">
                                      {EntityIcon && <EntityIcon className="h-3 w-3" />}
                                      {log.entity_type.replace(/_/g, ' ')}
                                    </span>
                                  )}
                                </p>
                              </div>

                              {/* Timestamp */}
                              <div className="shrink-0 text-right">
                                <p className="whitespace-nowrap text-xs font-medium text-gray-700 dark:text-slate-300">{getRelativeTime(log.created_at)}</p>
                                <p className="whitespace-nowrap text-2xs text-gray-400 dark:text-slate-500">{formatISTTime(log.created_at)}</p>
                              </div>
                            </div>

                            {/* Details preview */}
                            {log.details && (log.details.name || log.details.email || log.details.title) && (
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-slate-500">
                                {log.details.name && (
                                  <span>Name: <span className="font-medium text-gray-700 dark:text-slate-300">{log.details.name}</span></span>
                                )}
                                {log.details.email && (
                                  <span>Email: <span className="font-medium text-gray-700 dark:text-slate-300">{log.details.email}</span></span>
                                )}
                                {log.details.title && (
                                  <span>Title: <span className="font-medium text-gray-700 dark:text-slate-300">{log.details.title}</span></span>
                                )}
                              </div>
                            )}

                            {/* Metadata chips — IP + session indicators */}
                            {(log.ip_address || log.total_session_duration != null || (log.error_origin && log.error_origin !== 'NONE') || log.refund_flag === 'YES') && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {log.ip_address && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-2xs text-gray-500 dark:text-slate-400">
                                    <Globe className="h-3 w-3" />
                                    {log.ip_address}
                                  </span>
                                )}
                                {log.total_session_duration != null && (
                                  <Badge variant="muted">
                                    <Timer className="w-3 h-3" />
                                    {formatSessionDuration(log.total_session_duration)}
                                  </Badge>
                                )}
                                {log.error_origin && log.error_origin !== 'NONE' && (
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs ${ERROR_ORIGIN_COLORS[log.error_origin as ErrorOrigin]}`}>
                                    <AlertTriangle className="w-3 h-3" />
                                    {ERROR_ORIGIN_LABELS[log.error_origin as ErrorOrigin]}
                                  </span>
                                )}
                                {log.refund_flag === 'YES' && (
                                  <Badge variant="success">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Refunded
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {logs.length >= limit && (
          <div className="mt-6 text-center">
            <Button
              variant="secondary"
              onClick={() => setLimit(l => l + 50)}
            >
              Load More
            </Button>
          </div>
        )}
        </>
        )}
      </div>
      </div>
    </main>
  );
}
