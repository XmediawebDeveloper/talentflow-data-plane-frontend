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

const actionIcons: Record<string, React.ElementType> = {
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

const entityIcons: Record<string, React.ElementType> = {
  user: Users,
  job_description: Briefcase,
  resume: FileText,
  folder: FolderOpen,
  assessment: Activity,
  settings: Settings,
  subscription: CreditCard,
};

const actionColors: Record<string, string> = {
  login: 'bg-gray-700',
  logout: 'bg-gray-400',
  create: 'bg-green-500',
  update: 'bg-gray-700',
  delete: 'bg-red-500',
  upload: 'bg-teal-500',
  publish: 'bg-gray-500',
  default: 'bg-gray-500',
};

export default function ActivityLogsPage() {
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

  const getActionIcon = (action: string): React.ElementType => {
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
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-600 to-green-700 rounded-xl flex items-center justify-center shadow-lg">
                <Activity className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Activity Logs</h1>
                <p className="text-sm text-gray-600">Recent system activity timeline</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 text-black"
              >
                <option value="25">Last 25</option>
                <option value="50">Last 50</option>
                <option value="100">Last 100</option>
              </select>
              <button
                onClick={fetchRecentActivity}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-black"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading activity...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <p className="text-red-500">{error}</p>
              <button
                onClick={fetchRecentActivity}
                className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
              >
                Retry
              </button>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No recent activity</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {Object.entries(groupedLogs).map(([date, dayLogs]) => (
                <div key={date}>
                  {/* Date Header */}
                  <div className="sticky top-0 bg-gray-50 px-6 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-medium text-gray-700">{date}</h3>
                  </div>

                  {/* Activities for this date */}
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-[2.75rem] top-0 bottom-0 w-0.5 bg-gray-200" />

                    {dayLogs.map((log, index) => {
                      const ActionIcon = getActionIcon(log.action);
                      const EntityIcon = log.entity_type ? entityIcons[log.entity_type] || FileText : null;

                      return (
                        <div
                          key={log.id}
                          className="relative flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                        >
                          {/* Timeline dot */}
                          <div className={`relative z-10 w-9 h-9 rounded-full ${getActionColor(log.action)} flex items-center justify-center shadow-sm`}>
                            <ActionIcon className="w-4 h-4 text-white" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm text-gray-900">
                                  <span className="font-medium">{log.user_name}</span>
                                  {log.actor_role && (
                                    <span className="text-xs text-gray-400 ml-1 capitalize">({log.actor_role.replace(/_/g, ' ').toLowerCase()})</span>
                                  )}
                                  {' '}
                                  <span className="text-gray-600">{log.action_label.toLowerCase()}</span>
                                  {log.entity_type && (
                                    <>
                                      {' '}
                                      <span className="inline-flex items-center gap-1 text-gray-600">
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
                                      <p className="text-xs text-gray-500">
                                        Name: {log.details.name}
                                      </p>
                                    )}
                                    {log.details.email && (
                                      <p className="text-xs text-gray-500">
                                        Email: {log.details.email}
                                      </p>
                                    )}
                                    {log.details.title && (
                                      <p className="text-xs text-gray-500">
                                        Title: {log.details.title}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* IP Address */}
                                {log.ip_address && (
                                  <p className="text-xs text-gray-400 mt-1 font-mono">
                                    IP: {log.ip_address}
                                  </p>
                                )}

                                {/* Session indicators */}
                                {(log.total_session_duration != null || log.error_origin || log.refund_flag === 'YES') && (
                                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                    {log.total_session_duration != null && (
                                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
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
                                <p className="text-xs text-gray-500">{formatISTTime(log.created_at)}</p>
                                <p className="text-xs text-gray-400">{getRelativeTime(log.created_at)}</p>
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
              className="px-6 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm text-black"
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
