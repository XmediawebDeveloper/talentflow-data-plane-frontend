'use client';

import {
  ScrollText,
  Search,
  Filter,
  Download,
  Calendar,
  User,
  Clock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  X,
  Activity,
  FileText,
  Users,
  Settings,
  Briefcase,
  FolderOpen,
  CreditCard,
  Zap,
  ShoppingCart,
  TrendingUp,
  Tag,
  Cpu,
  Loader2 as Loader2Icon,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { handleUnauthorized } from '@/lib/services/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  action: string;
  action_label: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  units_consumed: number;
  unit_type: string | null;
  // Unit consumption tracking fields
  consumption_status: string | null;  // SUCCESS, FAILED, INSUFFICIENT_UNITS, etc.
  balance_before: number | null;      // Available units before action
  balance_after: number | null;       // Available units after action
  created_at: string;
}

interface AuditStats {
  period_days: number;
  total_actions: number;
  actions_by_type: Record<string, number>;
  actions_by_entity: Record<string, number>;
  top_active_users: Array<{
    user_id: string;
    user_name: string;
    user_email: string | null;
    action_count: number;
  }>;
}

const actionColors: Record<string, string> = {
  create: 'bg-gray-100 text-gray-800 border border-gray-200',
  update: 'bg-gray-100 text-gray-800 border border-gray-200',
  delete: 'bg-gray-200 text-gray-900 border border-gray-300',
  login: 'bg-gray-100 text-gray-800 border border-gray-200',
  logout: 'bg-gray-100 text-gray-700 border border-gray-200',
  upload: 'bg-gray-100 text-gray-800 border border-gray-200',
  publish: 'bg-gray-100 text-gray-800 border border-gray-200',
  purchase: 'bg-gray-200 text-gray-900 border border-gray-300',
  addon: 'bg-gray-200 text-gray-900 border border-gray-300',
  usage: 'bg-gray-100 text-gray-800 border border-gray-200',
  subscription: 'bg-gray-200 text-gray-900 border border-gray-300',
  upgrade: 'bg-gray-100 text-gray-800 border border-gray-200',
  downgrade: 'bg-gray-200 text-gray-900 border border-gray-300',
  default: 'bg-gray-100 text-gray-700 border border-gray-200',
};

const entityIcons: Record<string, React.ElementType> = {
  user: Users,
  job_description: Briefcase,
  resume: FileText,
  folder: FolderOpen,
  assessment: Activity,
  settings: Settings,
  subscription: CreditCard,
  addon: ShoppingCart,
  billing: CreditCard,
  quota: Zap,
  default: ScrollText,
};

export default function AuditTrailPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode: 'all' | 'system' | 'usage'
  const [viewMode, setViewMode] = useState<'all' | 'system' | 'usage'>('all');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateRange, setDateRange] = useState('30');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // AI Generation audit data (fetched when modal opens for assessment logs)
  const [aiAuditData, setAiAuditData] = useState<{
    ai_model_version: string | null;
    questions_generated_at: string | null;
    generation_params: Record<string, any> | null;
  } | null>(null);
  const [isLoadingAiAudit, setIsLoadingAiAudit] = useState(false);

  // Available filters
  const [availableActions, setAvailableActions] = useState<Array<{value: string; label: string}>>([]);
  const [availableEntities, setAvailableEntities] = useState<Array<{value: string; label: string}>>([]);

  // Total users count
  const [totalUsers, setTotalUsers] = useState(0);

  // Prevent duplicate fetches in development mode
  const hasFetched = useRef(false);
  const prevFilters = useRef({ page, actionFilter, entityFilter, dateRange });

  // Valid backend enum values (actions the API accepts as filters)
  const validBackendActions = [
    'login', 'logout', 'login_failed', 'password_change', 'password_reset',
    'user_create', 'user_update', 'user_delete', 'user_activate', 'user_deactivate', 'user_invite', 'user_role_change',
    'role_create', 'role_update', 'role_delete', 'permission_update',
    'jd_create', 'jd_update', 'jd_delete', 'jd_publish', 'jd_archive',
    'resume_upload', 'resume_update', 'resume_delete', 'resume_version', 'resume_move',
    'duplicate_detected', 'duplicate_resolved',
    'resume_upload_failed', 'resume_move_failed', 'search_failed',
    'folder_create', 'folder_update', 'folder_delete',
    'folder_create_failed', 'folder_update_failed', 'folder_delete_failed',
    'scoring_submit', 'scoring_complete', 'ai_match_run', 'ai_match_failed',
    'assessment_create', 'assessment_update', 'assessment_delete', 'assessment_publish', 'assessment_invite', 'assessment_start', 'assessment_complete',
    'master_create', 'master_update', 'master_delete',
    'settings_update', 'company_settings_update',
    'subscription_upgrade', 'subscription_downgrade', 'subscription_cancel', 'payment_method_add', 'payment_method_remove',
    'export_excel', 'export_pdf', 'export_csv',
  ];

  const validBackendEntities = [
    'user', 'job_description', 'resume', 'folder', 'assessment', 'role', 'permission', 'master_data', 'settings', 'subscription',
  ];

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });

      // Only send filter to API if it's a valid backend enum value
      if (actionFilter && validBackendActions.includes(actionFilter)) {
        params.append('action', actionFilter);
      }
      if (entityFilter && validBackendEntities.includes(entityFilter)) {
        params.append('entity_type', entityFilter);
      }

      // Calculate date range
      if (dateRange) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(dateRange));
        params.append('start_date', startDate.toISOString());
        params.append('end_date', endDate.toISOString());
      }

      if (!token) {
        throw new Error('Session expired. Please log in again.');
      }

      const response = await fetch(`${API_URL}/audits?${params}`, {
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
        console.error('[DEBUG] Audit logs error:', response.status, JSON.stringify(errorData, null, 2));
        console.error('[DEBUG] Request params:', params.toString());
        const errorMessage = Array.isArray(errorData.detail)
          ? errorData.detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join(', ')
          : errorData.detail || `Failed to fetch audit logs (${response.status})`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setAuditLogs(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, actionFilter, entityFilter, dateRange]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/audits/stats?days=${dateRange}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, [dateRange]);

  const fetchFilters = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');

      const [actionsRes, entitiesRes] = await Promise.all([
        fetch(`${API_URL}/audits/actions/list`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/audits/entities/list`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      // Handle 401 on either response
      if (actionsRes.status === 401 || entitiesRes.status === 401) {
        handleUnauthorized();
        return;
      }

      if (actionsRes.ok) {
        const data = await actionsRes.json();
        setAvailableActions(data.actions || []);
      }

      if (entitiesRes.ok) {
        const data = await entitiesRes.json();
        setAvailableEntities(data.entity_types || []);
      }
    } catch (err) {
      console.error('Error fetching filters:', err);
    }
  }, []);

  const fetchTotalUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        const users = data.users || data || [];
        setTotalUsers(Array.isArray(users) ? users.length : 0);
      }
    } catch (err) {
      console.error('Error fetching users count:', err);
    }
  }, []);

  // Initial fetch - only runs once
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchFilters();
    fetchTotalUsers();
    fetchAuditLogs();
    fetchStats();
  }, []);

  // Re-fetch when filters change (compare with previous values)
  useEffect(() => {
    const prev = prevFilters.current;
    const filtersChanged =
      prev.page !== page ||
      prev.actionFilter !== actionFilter ||
      prev.entityFilter !== entityFilter ||
      prev.dateRange !== dateRange;

    if (filtersChanged && hasFetched.current) {
      prevFilters.current = { page, actionFilter, entityFilter, dateRange };
      fetchAuditLogs();
      fetchStats();
    }
  }, [page, actionFilter, entityFilter, dateRange]);

  // Fetch AI generation audit data when an assessment-related log is selected
  useEffect(() => {
    setAiAuditData(null);

    if (!selectedLog) return;

    // Check if this is an assessment-related log with an attempt_id
    const isAssessmentLog = selectedLog.entity_type === 'assessment' || selectedLog.entity_type === 'assessment_attempt';
    const attemptId = selectedLog.details?.attempt_id
      || (selectedLog.entity_type === 'assessment_attempt' ? selectedLog.entity_id : null);

    if (!isAssessmentLog || !attemptId) return;

    const fetchAiAudit = async () => {
      setIsLoadingAiAudit(true);
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        const response = await fetch(`${API_URL}/audits/ai-generation/${attemptId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.ai_model_version || data.questions_generated_at || data.generation_params) {
            setAiAuditData(data);
          }
        }
      } catch (err) {
        console.error('[AI-AUDIT] Failed to fetch AI generation data:', err);
      } finally {
        setIsLoadingAiAudit(false);
      }
    };

    fetchAiAudit();
  }, [selectedLog]);

  // Handle view mode change - reset filters and update view mode together
  const handleViewModeChange = (newMode: 'all' | 'system' | 'usage') => {
    if (newMode === viewMode) return;
    setActionFilter('');
    setEntityFilter('');
    setPage(1);
    setViewMode(newMode);
  };

  const getActionColor = (action: string): string => {
    if (action.includes('addon') || action.includes('purchase')) return actionColors.addon;
    if (action.includes('usage') || action.includes('recorded')) return actionColors.usage;
    if (action.includes('upgrade')) return actionColors.upgrade;
    if (action.includes('downgrade')) return actionColors.downgrade;
    if (action.includes('subscription')) return actionColors.subscription;
    if (action.includes('create') || action.includes('upload')) return actionColors.create;
    if (action.includes('update') || action.includes('change')) return actionColors.update;
    if (action.includes('delete') || action.includes('remove')) return actionColors.delete;
    if (action.includes('login')) return actionColors.login;
    if (action.includes('logout')) return actionColors.logout;
    if (action.includes('publish')) return actionColors.publish;
    return actionColors.default;
  };

  const getEntityIcon = (entityType: string | null): React.ElementType => {
    if (!entityType) return entityIcons.default;
    return entityIcons[entityType] || entityIcons.default;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams({
        page: '1',
        page_size: '100',
      });

      if (actionFilter) params.append('action', actionFilter);
      if (entityFilter) params.append('entity_type', entityFilter);

      const response = await fetch(`${API_URL}/audits?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        const csv = convertToCSV(data.items);
        downloadCSV(csv, 'audit-trail.csv');
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  // Derive status from action name
  const getActionStatus = (action: string): { label: string; color: string } => {
    if (action.includes('_failed') || action === 'login_failed')
      return { label: 'Failed', color: 'bg-red-100 text-red-800 border border-red-200' };
    if (action === 'quota_exhausted' || action === 'user_limit_exceeded')
      return { label: 'Blocked', color: 'bg-orange-100 text-orange-800 border border-orange-200' };
    if (action.includes('_blocked') || action.includes('_denied'))
      return { label: 'Denied', color: 'bg-orange-100 text-orange-800 border border-orange-200' };
    return { label: 'Success', color: 'bg-green-100 text-green-800 border border-green-200' };
  };

  // Get brief details summary from details JSONB
  const getDetailsSummary = (log: AuditLog): string => {
    if (!log.details || Object.keys(log.details).length === 0) return '—';
    const d = log.details;
    // Show most relevant field based on context
    if (d.file_name) return d.file_name;
    if (d.resume_name) return d.resume_name;
    if (d.jd_title) return d.jd_title;
    if (d.assessment_title || d.assessment_name) return d.assessment_title || d.assessment_name;
    if (d.candidate_name) return d.candidate_name;
    if (d.candidate_email) return d.candidate_email;
    if (d.role_name) return d.role_name;
    if (d.user_name || d.full_name) return d.user_name || d.full_name;
    if (d.email) return d.email;
    if (d.plan_name) return d.plan_name;
    if (d.reason) return d.reason;
    if (d.error) return typeof d.error === 'string' ? d.error.slice(0, 60) : '—';
    // Fallback: first string value
    const firstVal = Object.values(d).find(v => typeof v === 'string' && v.length > 0 && v.length < 80);
    return typeof firstVal === 'string' ? firstVal : '—';
  };

  // Get impact level (severity based on status)
  const getImpactLevel = (log: AuditLog): { label: string; color: string } => {
    const status = getActionStatus(log.action);
    if (status.label === 'Failed') return { label: 'High', color: 'text-red-600' };
    if (status.label === 'Blocked') return { label: 'High', color: 'text-red-600' };
    if (status.label === 'Denied') return { label: 'Medium', color: 'text-amber-600' };
    // Destructive actions
    if (log.action.includes('delete') || log.action.includes('remove') || log.action.includes('cancel'))
      return { label: 'Medium', color: 'text-amber-600' };
    return { label: 'Low', color: 'text-green-600' };
  };

  // Get impact text (unit consumption impact)
  const getImpactText = (log: AuditLog): { text: string; negative: boolean } => {
    const units = log.details?.units_consumed_actual ?? log.units_consumed;
    if (units && units > 0 && log.unit_type) {
      return { text: `-${units} ${log.unit_type}`, negative: true };
    }
    if (units === 0 && log.unit_type) {
      return { text: `0 ${log.unit_type}`, negative: false };
    }
    return { text: '—', negative: false };
  };

  const convertToCSV = (logs: AuditLog[]): string => {
    const headers = ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Status', 'Details', 'Impact', 'Unit Type', 'Units Consumed', 'Available Before', 'Available After', 'IP Address'];
    const rows = logs.map(log => {
      const status = getActionStatus(log.action);
      const impact = getImpactText(log);
      return [
        log.created_at,
        log.user_name,
        log.action_label,
        log.entity_type || '',
        log.entity_id || '',
        status.label,
        getDetailsSummary(log),
        impact.text,
        log.unit_type || '',
        log.units_consumed || '',
        log.balance_before ?? log.details?.balance_before ?? '',
        log.balance_after ?? log.details?.balance_after ?? '',
        log.ip_address || '',
      ];
    });
    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  };

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Usage/billing related actions and entity types (must match backend enums)
  const usageActions = [
    'addon_purchase',
    'addon_approve',
    'addon_reject',
    'seats_purchase',
    'usage_recorded',
    'unit_consume',
    'resume_upload',
    'resume_upload_failed',
    'scoring_complete',
    'scoring_failed',
    'assessment_complete',
    'user_create',
    'user_limit_exceeded',
    'quota_exhausted',
    'subscription_upgrade',
    'subscription_downgrade',
    'subscription_cancel',
    'subscription_activation',
    'plan_upgrade',
    'plan_downgrade',
    'plan_selection',
    'tenant_signup',
    'payment_confirmed',
    'invoice_generated',
  ];
  const usageEntityTypes = [
    'addon',
    'subscription',
    'billing',
    'quota',
    'unit_pool',
    'payment',
    'invoice',
    'seats',
    'plan',
  ];

  // Filter available actions and entities based on view mode
  const filteredAvailableActions = viewMode === 'all'
    ? availableActions
    : viewMode === 'usage'
      ? availableActions.filter(action => usageActions.includes(action.value))
      : availableActions.filter(action => !usageActions.includes(action.value));

  const filteredAvailableEntities = viewMode === 'all'
    ? availableEntities
    : viewMode === 'usage'
      ? availableEntities.filter(entity => usageEntityTypes.includes(entity.value))
      : availableEntities.filter(entity => !usageEntityTypes.includes(entity.value));

  const filteredLogs = auditLogs.filter(log => {
    // First filter by view mode
    const isUsageLog = usageActions.includes(log.action) ||
                       usageEntityTypes.includes(log.entity_type || '') ||
                       (log.units_consumed && log.units_consumed > 0);

    if (viewMode === 'usage' && !isUsageLog) return false;
    if (viewMode === 'system' && isUsageLog) return false;
    // 'all' shows everything

    // Client-side filter by action (for usage-related actions not supported by backend)
    if (actionFilter && !validBackendActions.includes(actionFilter)) {
      if (log.action !== actionFilter) return false;
    }

    // Client-side filter by entity (for usage-related entities not supported by backend)
    if (entityFilter && !validBackendEntities.includes(entityFilter)) {
      if (log.entity_type !== entityFilter) return false;
    }

    // Then filter by search query
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      (log.user_name && log.user_name.toLowerCase().includes(search)) ||
      (log.action_label && log.action_label.toLowerCase().includes(search)) ||
      (log.entity_type && log.entity_type.toLowerCase().includes(search)) ||
      (log.ip_address && log.ip_address.includes(search)) ||
      (log.user_email && log.user_email.toLowerCase().includes(search))
    );
  });

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gray-50/50">
      <div>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-gray-700 to-gray-900 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-300">
                <ScrollText className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
                <p className="text-sm text-gray-500 mt-0.5">Track all system activities and changes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { fetchAuditLogs(); fetchStats(); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
              >
                <RefreshCw className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Refresh</span>
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-md shadow-gray-300"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm font-medium">Export CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Actions</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total_actions.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Last {stats.period_days} days
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center shadow-lg shadow-gray-300">
                  <Activity className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Active Users</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{totalUsers}</p>
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Registered users
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-800 rounded-xl flex items-center justify-center shadow-lg shadow-gray-300">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Action Types</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{Object.keys(stats.actions_by_type).length}</p>
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    Unique types
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-gray-500 to-gray-700 rounded-xl flex items-center justify-center shadow-lg shadow-gray-300">
                  <Zap className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Entity Types</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{Object.keys(stats.actions_by_entity).length}</p>
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                    <ScrollText className="w-3 h-3" />
                    Resources tracked
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-800 rounded-xl flex items-center justify-center shadow-lg shadow-gray-300">
                  <FolderOpen className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Combined Audit Log Card - Tabs, Filters & Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* View Mode Tabs */}
          <div className="px-5 pt-5 pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => handleViewModeChange('all')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    viewMode === 'all'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span className="text-sm">All Activity</span>
                </button>
                <button
                  onClick={() => handleViewModeChange('system')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    viewMode === 'system'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm">System Activity</span>
                </button>
                <button
                  onClick={() => handleViewModeChange('usage')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    viewMode === 'usage'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="text-sm">Usage & Billing</span>
                </button>
              </div>
              <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full font-medium">{filteredLogs.length} records</span>
            </div>
          </div>

          {/* Filters */}
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[280px]">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by user, action, or IP address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-gray-400 transition-all text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <select
                    value={actionFilter}
                    onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                    className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-gray-400 transition-all text-sm cursor-pointer"
                  >
                    <option value="">All Actions</option>
                    {filteredAvailableActions.map(action => (
                      <option key={action.value} value={action.value}>{action.label}</option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 rotate-90 pointer-events-none" />
                </div>
                <div className="relative">
                  <select
                    value={entityFilter}
                    onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
                    className="appearance-none pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-gray-400 transition-all text-sm cursor-pointer"
                  >
                    <option value="">All Entities</option>
                    {filteredAvailableEntities.map(entity => (
                      <option key={entity.value} value={entity.value}>{entity.label}</option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 rotate-90 pointer-events-none" />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <select
                    value={dateRange}
                    onChange={(e) => { setDateRange(e.target.value); setPage(1); }}
                    className="appearance-none pl-9 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-gray-400 transition-all text-sm cursor-pointer"
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last year</option>
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 rotate-90 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Table Content */}
          {loading ? (
            <div className="p-16 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-gray-300">
                <RefreshCw className="w-6 h-6 text-white animate-spin" />
              </div>
              <p className="text-gray-500 font-medium">Loading audit logs...</p>
              <p className="text-sm text-gray-400 mt-1">Please wait</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center mx-auto mb-4">
                <X className="w-6 h-6 text-gray-600" />
              </div>
              <p className="text-gray-700 font-medium">{error}</p>
              <button
                onClick={fetchAuditLogs}
                className="mt-4 px-5 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-md shadow-gray-300 text-sm font-medium"
              >
                Retry
              </button>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ScrollText className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">No audit logs found</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Impact</th>
                    {viewMode !== 'system' && (
                      <>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Units Consumed</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Available</th>
                      </>
                    )}
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLogs.map((log) => {
                    const actionStatus = getActionStatus(log.action);
                    const impact = getImpactText(log);
                    const balanceBefore = log.balance_before ?? log.details?.balance_before;
                    const balanceAfter = log.balance_after ?? log.details?.balance_after;
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span>{formatDate(log.created_at)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center text-xs font-semibold shadow-md shadow-gray-200">
                              {(log.user_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{log.user_name || 'Unknown'}</p>
                              {log.user_email && (
                                <p className="text-xs text-gray-500">{log.user_email}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-3 py-1.5 rounded-lg text-xs font-semibold ${getActionColor(log.action)}`}>
                            {log.action_label}
                          </span>
                        </td>
                        {/* Details */}
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-700 max-w-[200px] truncate block" title={getDetailsSummary(log)}>
                            {getDetailsSummary(log)}
                          </span>
                        </td>
                        {/* Status (derived from action) */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${actionStatus.color}`}>
                            {actionStatus.label}
                          </span>
                        </td>
                        {/* Impact (severity level) */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(() => {
                            const impactLevel = getImpactLevel(log);
                            return (
                              <span className={`text-sm font-semibold ${impactLevel.color}`}>
                                {impactLevel.label}
                              </span>
                            );
                          })()}
                        </td>
                        {viewMode !== 'system' && (
                          <>
                            {/* Units Consumed */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              {impact.text !== '—' ? (
                                <span className={`inline-flex items-center gap-1 text-sm font-semibold ${impact.negative ? 'text-red-700' : 'text-gray-500'}`}>
                                  {impact.negative && <Zap className="w-3.5 h-3.5" />}
                                  {impact.text}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </td>
                            {/* Available Units (Balance Before -> After) */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              {balanceBefore != null ? (
                                <div className="text-sm">
                                  <span className="text-gray-600">{balanceBefore}</span>
                                  <span className="text-gray-400 mx-1">→</span>
                                  <span className="font-medium text-gray-800">{balanceAfter ?? 0}</span>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && filteredLogs.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <p className="text-sm text-gray-600">
                Page <span className="font-semibold text-gray-900">{page}</span> of <span className="font-semibold text-gray-900">{totalPages}</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 transition-all text-sm font-medium text-gray-700"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 transition-all text-sm font-medium text-gray-700"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center shadow-lg shadow-gray-300">
                  <ScrollText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Audit Log Details</h3>
                  <p className="text-xs text-gray-500">Complete event information</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-5">
              {/* User & Action Header */}
              <div className="flex items-start gap-4 pb-5 border-b border-gray-100">
                <div className="w-11 h-11 rounded-xl bg-gray-800 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {(selectedLog.user_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{selectedLog.user_name || 'Unknown User'}</p>
                  {selectedLog.user_email && (
                    <p className="text-sm text-gray-500 truncate">{selectedLog.user_email}</p>
                  )}
                </div>
                <span className={`inline-flex px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 ${getActionColor(selectedLog.action)}`}>
                  {selectedLog.action_label}
                </span>
              </div>

              {/* Summary Info */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3.5">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">When</p>
                  <p className="text-sm font-medium text-gray-900">{formatDate(selectedLog.created_at)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3.5">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Entity</p>
                  <p className="text-sm font-medium text-gray-900 capitalize">{selectedLog.entity_type?.replace(/_/g, ' ') || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3.5">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">IP Address</p>
                  <p className="text-sm font-mono font-medium text-gray-900">{selectedLog.ip_address || '—'}</p>
                </div>
              </div>

              {/* Units, Balance & Status Row */}
              {(() => {
                const modalImpact = getImpactText(selectedLog);
                const modalBalanceBefore = selectedLog.balance_before ?? selectedLog.details?.balance_before;
                const modalBalanceAfter = selectedLog.balance_after ?? selectedLog.details?.balance_after;
                const hasUnits = selectedLog.units_consumed && selectedLog.units_consumed > 0;
                const hasBalance = modalBalanceBefore != null;
                if (!hasUnits && !hasBalance) {
                  // Just show status alone
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-50 rounded-xl p-3.5">
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Status</p>
                        {(() => { const s = getActionStatus(selectedLog.action); return <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${s.color}`}>{s.label}</span>; })()}
                      </div>
                      <div /><div />
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-3 gap-3">
                    {hasUnits ? (
                      <div className="bg-gray-100 rounded-xl p-3.5">
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Impact</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-lg font-bold ${modalImpact.negative ? 'text-red-700' : 'text-gray-900'}`}>
                            {modalImpact.text}
                          </span>
                        </div>
                      </div>
                    ) : <div />}
                    {hasBalance ? (
                      <div className="bg-gray-50 rounded-xl p-3.5">
                        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Available</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm text-gray-500">{modalBalanceBefore}</span>
                          <span className="text-gray-300">→</span>
                          <span className="text-lg font-bold text-gray-900">{modalBalanceAfter ?? 0}</span>
                        </div>
                      </div>
                    ) : <div />}
                    <div className="bg-gray-50 rounded-xl p-3.5">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Status</p>
                      {(() => { const s = getActionStatus(selectedLog.action); return <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${s.color}`}>{s.label}</span>; })()}
                    </div>
                  </div>
                );
              })()}

              {/* Entity ID (if present) */}
              {selectedLog.entity_id && (
                <div className="bg-gray-50 rounded-xl p-3.5">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Entity ID</p>
                  <p className="text-sm font-mono text-gray-700 truncate" title={selectedLog.entity_id}>{selectedLog.entity_id}</p>
                </div>
              )}

              {/* Event Details - Friendly key-value display */}
              {selectedLog.details && Object.keys(selectedLog.details).filter(k => !['units_consumed_actual', 'balance_before', 'balance_after'].includes(k)).length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2.5">Event Details</p>
                  <div className="bg-gray-50 rounded-xl divide-y divide-gray-100 overflow-hidden">
                    {Object.entries(selectedLog.details)
                      .filter(([key]) => !['units_consumed_actual', 'balance_before', 'balance_after'].includes(key))
                      .map(([key, value]) => (
                      <div key={key} className="flex items-start px-4 py-3 gap-4">
                        <span className="text-xs font-medium text-gray-500 min-w-[140px] flex-shrink-0 pt-0.5 capitalize">
                          {key.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm text-gray-900 break-all">
                          {value === null || value === undefined
                            ? '—'
                            : typeof value === 'boolean'
                            ? value ? 'Yes' : 'No'
                            : typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Generation Audit Section */}
              {isLoadingAiAudit && (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading AI generation data...</span>
                </div>
              )}
              {aiAuditData && (
                <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-600" />
                  <p className="text-[11px] font-medium text-purple-600 uppercase tracking-wider">AI Generation Audit</p>
                </div>

                {/* Model Version + Generation Timestamp */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-purple-50 rounded-xl p-3.5 border border-purple-100">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">AI Model Version</p>
                    <p className="text-sm font-semibold text-gray-900">{aiAuditData.ai_model_version || 'N/A'}</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3.5 border border-purple-100">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">Generation Timestamp</p>
                    <p className="text-sm font-medium text-gray-900">
                      {aiAuditData.questions_generated_at
                        ? new Date(aiAuditData.questions_generated_at).toLocaleString('en-US', {
                            timeZone: 'Asia/Kolkata',
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
                          })
                        : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Input Parameters Table */}
                <div className="bg-gray-50 rounded-xl divide-y divide-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-100/50">
                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Input Parameters</p>
                  </div>
                  {aiAuditData.generation_params ? (
                    <>
                      <div className="flex items-start px-4 py-3 gap-4">
                        <span className="text-xs font-medium text-gray-500 min-w-[140px] flex-shrink-0 pt-0.5">JD Title</span>
                        <span className="text-sm text-gray-900">{aiAuditData.generation_params.jd_title || 'N/A'}</span>
                      </div>
                      <div className="flex items-start px-4 py-3 gap-4">
                        <span className="text-xs font-medium text-gray-500 min-w-[140px] flex-shrink-0 pt-0.5">Experience Level</span>
                        <span className="text-sm text-gray-900 capitalize">{aiAuditData.generation_params.experience_level?.replace(/_/g, ' ') || 'N/A'}</span>
                      </div>
                      <div className="flex items-start px-4 py-3 gap-4">
                        <span className="text-xs font-medium text-gray-500 min-w-[140px] flex-shrink-0 pt-0.5">Duration</span>
                        <span className="text-sm text-gray-900">{aiAuditData.generation_params.duration_minutes ? `${aiAuditData.generation_params.duration_minutes} minutes` : 'N/A'}</span>
                      </div>
                      <div className="flex items-start px-4 py-3 gap-4">
                        <span className="text-xs font-medium text-gray-500 min-w-[140px] flex-shrink-0 pt-0.5">Questions Generated</span>
                        <span className="text-sm text-gray-900">{aiAuditData.generation_params.total_questions_generated ?? 'N/A'}</span>
                      </div>
                      {aiAuditData.generation_params.rounds_config && aiAuditData.generation_params.rounds_config.length > 0 && (
                        <div className="flex items-start px-4 py-3 gap-4">
                          <span className="text-xs font-medium text-gray-500 min-w-[140px] flex-shrink-0 pt-0.5">Rounds Config</span>
                          <div className="flex flex-wrap gap-1.5">
                            {aiAuditData.generation_params.rounds_config.map((round: any, idx: number) => (
                              <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium capitalize">
                                {round.type} ({round.weightage}%)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-4 py-3">
                      <span className="text-sm text-gray-400">No input parameters recorded</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all shadow-md shadow-gray-300 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
