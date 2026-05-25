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
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import {
  ERROR_ORIGIN_LABELS,
  ERROR_ORIGIN_COLORS,
  formatSessionDuration,
  type ErrorOrigin,
} from '@/lib/types/auditSession';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import AuditTrailPage from '@/app/(dashboard)/audits/trail/page';

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

const actionColors: Record<string, string> = {
  login: 'bg-brand-blue',
  logout: 'bg-gradient-to-br from-gray-400 to-gray-500',
  create: 'bg-brand-teal',
  update: 'bg-brand-blue',
  delete: 'bg-gradient-to-br from-red-500 to-brand-orange-deep',
  upload: 'bg-brand-cyan',
  publish: 'bg-brand-orange',
  default: 'bg-gradient-to-br from-brand-blue/70 to-brand-blue-2/70',
};

type ActivityTab = 'activity' | 'audit';

export default function ActivityLogsPage() {
  const [activeTab, setActiveTab] = useState<ActivityTab>('audit');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

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

  const getActionColor = (action: string): string => {
    if (action.includes('login')) return actionColors.login;
    if (action.includes('logout')) return actionColors.logout;
    if (action.includes('create') || action.includes('upload')) return actionColors.create;
    if (action.includes('update') || action.includes('change')) return actionColors.update;
    if (action.includes('delete') || action.includes('remove')) return actionColors.delete;
    if (action.includes('publish')) return actionColors.publish;
    return actionColors.default;
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
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Activity Logs' }]} />
        {/* SaaS Hero Header */}
        <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                  <Sparkles className="h-3 w-3 text-brand-orange" />
                  Live timeline
                </div>
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Activity Logs</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">A real-time view of recent system activity across your organization.</p>
              </div>
            </div>
            {activeTab === 'activity' && (
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <select
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value))}
                  className="flex-1 sm:flex-none h-10 px-3 sm:px-4 text-sm rounded-xl bg-white/10 ring-1 ring-white/20 text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/40 [&>option]:text-gray-900"
                >
                  <option value="25">Last 25</option>
                  <option value="50">Last 50</option>
                  <option value="100">Last 100</option>
                </select>
                <button
                  onClick={fetchRecentActivity}
                  className="inline-flex items-center justify-center gap-1.5 sm:gap-2 h-10 px-3 sm:px-4 rounded-xl bg-white text-brand-blue text-sm font-medium shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Tab navigation */}
        <section className="mb-5">
          <div className="border-b border-gray-200 dark:border-slate-700">
            <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px" aria-label="Activity tabs">
              {([
                { id: 'audit', label: 'Audit Log' },
                { id: 'activity', label: 'Activity Log' },
              ] as { id: ActivityTab; label: string }[]).map((tab) => {
                const isActive = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`whitespace-nowrap px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      isActive
                        ? 'border-brand-blue text-brand-blue'
                        : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue hover:border-brand-blue/40'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
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
              [&>main>div]:max-w-none
              [&>main>div]:!px-0
              [&>main>div]:!mx-0
              [&>main>div>div]:!bg-transparent
              [&>main>div>div]:!rounded-none
              [&>main>div>div]:!shadow-none
              [&>main>div>div]:!ring-0
              [&>main>div>div]:!border-0
              [&>main>div>div]:!p-0
              [&>main>div>div]:!my-0
              [&>main>div>div>section:first-of-type]:!hidden"
          >
            <AuditTrailPage />
          </section>
        )}

        {/* Timeline */}
        {activeTab === 'activity' && (
        <>

        <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-brand-blue animate-spin mx-auto mb-4" />
              <p className="font-medium text-gray-600 dark:text-slate-400">Loading activity...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <p className="text-red-500">{error}</p>
              <button
                onClick={fetchRecentActivity}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2 text-sm font-medium text-white shadow-md ring-1 ring-white/10 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                Retry
              </button>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <Activity className="w-6 h-6 text-brand-blue" />
              </span>
              <p className="font-medium text-gray-600 dark:text-slate-400">No recent activity</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {Object.entries(groupedLogs).map(([date, dayLogs]) => (
                <div key={date}>
                  {/* Date Header */}
                  <div className="sticky top-0 bg-gray-50 dark:bg-slate-800/50 px-3 sm:px-6 py-2.5 sm:py-3 border-b border-gray-100 dark:border-slate-700/60 z-10">
                    <h3 className="text-xs sm:text-sm font-semibold text-brand-blue">{date}</h3>
                  </div>

                  {/* Activities for this date */}
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-[1.4rem] sm:left-[2.75rem] top-0 bottom-0 w-0.5 bg-gray-200" />

                    {dayLogs.map((log, index) => {
                      const ActionIcon = getActionIcon(log.action);
                      const EntityIcon = log.entity_type ? entityIcons[log.entity_type] || FileText : null;

                      return (
                        <div
                          key={log.id}
                          className="relative flex items-start gap-3 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4 hover:bg-brand-cyan/[0.04] transition-colors"
                        >
                          {/* Timeline dot */}
                          <div className={`relative z-10 w-9 h-9 rounded-full ${getActionColor(log.action)} flex items-center justify-center shadow-sm`}>
                            <ActionIcon className="w-4 h-4 text-white" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm text-gray-900 dark:text-slate-50">
                                  <span className="font-medium">{log.user_name}</span>
                                  {log.actor_role && (
                                    <span className="text-xs text-gray-400 dark:text-slate-500 ml-1 capitalize">({log.actor_role.replace(/_/g, ' ').toLowerCase()})</span>
                                  )}
                                  {' '}
                                  <span className="text-gray-600 dark:text-slate-400">{log.action_label.toLowerCase()}</span>
                                  {log.entity_type && (
                                    <>
                                      {' '}
                                      <span className="inline-flex items-center gap-1 text-gray-600 dark:text-slate-400">
                                        {EntityIcon && <EntityIcon className="w-3.5 h-3.5" />}
                                        {log.entity_type.replace(/_/g, ' ')}
                                      </span>
                                    </>
                                  )}
                                </p>

                                {/* Details preview */}
                                {log.details && Object.keys(log.details).length > 0 && (
                                  <div className="mt-1">
                                    {log.details.name && (
                                      <p className="text-xs text-gray-500 dark:text-slate-500">
                                        Name: {log.details.name}
                                      </p>
                                    )}
                                    {log.details.email && (
                                      <p className="text-xs text-gray-500 dark:text-slate-500">
                                        Email: {log.details.email}
                                      </p>
                                    )}
                                    {log.details.title && (
                                      <p className="text-xs text-gray-500 dark:text-slate-500">
                                        Title: {log.details.title}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* IP Address */}
                                {log.ip_address && (
                                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 font-mono">
                                    IP: {log.ip_address}
                                  </p>
                                )}

                                {/* Session indicators */}
                                {(log.total_session_duration != null || log.error_origin || log.refund_flag === 'YES') && (
                                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                    {log.total_session_duration != null && (
                                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                        <Timer className="w-3 h-3" />
                                        {formatSessionDuration(log.total_session_duration)}
                                      </span>
                                    )}
                                    {log.error_origin && log.error_origin !== 'NONE' && (
                                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${ERROR_ORIGIN_COLORS[log.error_origin as ErrorOrigin]}`}>
                                        {log.error_origin === 'SYSTEM' ? <AlertTriangle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                        {ERROR_ORIGIN_LABELS[log.error_origin as ErrorOrigin]}
                                      </span>
                                    )}
                                    {log.refund_flag === 'YES' && (
                                      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Refunded
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="text-right flex-shrink-0">
                                <p className="text-xs text-gray-500 dark:text-slate-500">{formatISTTime(log.created_at)}</p>
                                <p className="text-xs text-gray-400 dark:text-slate-500">{getRelativeTime(log.created_at)}</p>
                              </div>
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
        </div>

        {/* Load More */}
        {logs.length >= limit && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setLimit(l => l + 50)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 px-6 py-2 text-sm font-semibold text-brand-blue shadow-sm transition-[border-color,box-shadow,color,background-color] hover:border-brand-blue/30 hover:shadow-md"
            >
              Load More
            </button>
          </div>
        )}
        </>
        )}
      </div>
      </div>
    </main>
  );
}
