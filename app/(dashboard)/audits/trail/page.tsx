'use client';

import {
  ScrollText,
  Search,
  Filter,
  Download,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
  Shield,
  Cpu,
  Loader2 as Loader2Icon,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import {
  ERROR_ORIGIN_LABELS,
  ERROR_ORIGIN_COLORS,
  ERROR_CODE_LABELS,
  ERROR_CODE_COLORS,
  REFUND_FLAG_COLORS,
  MODULE_TYPE_LABELS,
  formatSessionDuration,
  getBillingImpact,
  type ErrorOrigin,
  type RefundFlag,
} from '@/lib/types/auditSession';
import { formatIST } from '@/lib/utils/dateUtils';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { StatValuePlaceholder } from '@/components/ui/stats-card';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DateField } from '@/components/ui/date-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import NameAvatar from '@/components/ui/name-avatar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string | null;
  user_display_id: string | null;
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
  // Session tracking fields (Audit Logs & Error Codes: Sections 3, 14)
  session_start_time: string | null;
  interruption_time: string | null;
  session_end_time: string | null;
  total_session_duration: number | null; // seconds
  // Error origin classification (Section 5)
  error_origin: ErrorOrigin;
  error_code: string | null;
  // Refund tracking (Section 6)
  refund_flag: RefundFlag;
  // Module type and actor role
  module_type: string | null;
  actor_role: string | null;
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

const EXPORT_COLUMNS = [
  { key: 'timestamp',      label: 'Timestamp' },
  { key: 'user',           label: 'User' },
  { key: 'role',           label: 'Role' },
  { key: 'action',         label: 'Action' },
  { key: 'module',         label: 'Module' },
  { key: 'entity_type',    label: 'Entity Type' },
  { key: 'entity_id',      label: 'Entity ID' },
  { key: 'status',         label: 'Status' },
  { key: 'details',        label: 'Details' },
  { key: 'impact',         label: 'Impact' },
  { key: 'unit_type',      label: 'Unit Type' },
  { key: 'units_impact',   label: 'Units Impact' },
  { key: 'balance_before', label: 'Available Before' },
  { key: 'balance_after',  label: 'Available After' },
  { key: 'error_origin',   label: 'Error Origin' },
  { key: 'error_code',     label: 'Error Code' },
  { key: 'session_start',  label: 'Session Start' },
  { key: 'session_end',    label: 'Session End' },
  { key: 'duration',       label: 'Duration (s)' },
  { key: 'refund',         label: 'Refund Flag' },
  { key: 'ip_address',     label: 'IP Address' },
] as const;

type ExportColumnKey = typeof EXPORT_COLUMNS[number]['key'];

// Human-readable labels for known detail keys
const DETAIL_KEY_LABELS: Record<string, string> = {
  candidate_name: 'Candidate Name',
  candidate_id: 'Candidate ID',
  assessment_id: 'Assessment ID',
  jd_title: 'JD Title',
  jd_id: 'JD ID',
  export_type: 'Export Type',
  generated_by: 'Generated By',
  filename: 'Filename',
  timestamp: 'Timestamp',
  candidates_requested: 'Candidates Requested',
  pdfs_generated: 'PDFs Generated',
  failed_count: 'Failed Count',
  candidate_names: 'Candidate Names',
  format: 'Format',
  result_ids_requested: 'Candidates Requested',
  file_name: 'File Name',
  resume_name: 'Resume Name',
  assessment_title: 'Assessment Title',
  assessment_name: 'Assessment Name',
  candidate_email: 'Candidate Email',
  role_name: 'Role Name',
  user_name: 'User Name',
  full_name: 'Full Name',
  plan_name: 'Plan Name',
  plan_tier: 'Plan Tier',
  root_error_code: 'Root Error Code',
  error_message: 'Error Message',
  error_classification: 'Error Classification',
  http_status: 'HTTP Status',
  new_role: 'New Role',
  assigned_by: 'Assigned By',
  revoked_by: 'Revoked By',
  reason: 'Reason',
  // Assessment lifecycle details
  attempt_id: 'Attempt ID',
  invitation_id: 'Invitation ID',
  consent_accepted: 'Consent Accepted',
  start_time: 'Start Time',
  end_time: 'End Time',
  overall_score: 'Overall Score',
  hr_score: 'HR Score',
  technical_score: 'Technical Score',
  coding_score: 'Coding Score',
  passed: 'Passed',
  completion_percentage: 'Completion %',
  answered_questions: 'Answered Questions',
  total_questions: 'Total Questions',
  units_consumed_actual: 'Units Consumed',
  balance_before: 'Balance Before',
  balance_after: 'Balance After',
  invited_by: 'Invited By (ID)',
  invited_by_email: 'Invited By',
  candidate_count: 'Candidate Count',
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

  // Drill-in: cards-first overview; the list is hidden until a stat card is
  // clicked. All 4 cards open the same list (the audits page uses cards as a
  // gate, not as categorical filters, because the cards are summary metrics).
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const openListView = () => setPageView('list');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [errorOriginFilter, setErrorOriginFilter] = useState<'' | ErrorOrigin>('');
  // user_id selected from the Active Users popup; sent to the API as user_id.
  const [userFilter, setUserFilter] = useState('');
  // Which stats card popup is open (Active Users / Action Types / Entity Types).
  const [statsPopup, setStatsPopup] = useState<'users' | 'actions' | 'entities' | null>(null);
  const statsPopupRef = useRef<HTMLDivElement>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // Text typed into the "jump to page" box; kept separate from `page` so the
  // input can hold invalid/in-progress text without touching the fetched data.
  // Synced back to `page` whenever it changes elsewhere (Previous/Next, filters).
  const [pageJumpInput, setPageJumpInput] = useState('1');
  useEffect(() => {
    setPageJumpInput(String(page));
  }, [page]);

  const jumpToPage = () => {
    const target = parseInt(pageJumpInput, 10);
    if (Number.isInteger(target) && target >= 1 && target <= totalPages) {
      setPage(target);
    } else {
      setPageJumpInput(String(page));
    }
  };

  // Reset every active filter back to "show everything". The date range is kept
  // because the Total Actions count is computed over that window — clearing the
  // rest makes the list show exactly that many records.
  const clearAllFilters = () => {
    setActionFilter('');
    setEntityFilter('');
    setUserFilter('');
    setErrorOriginFilter('');
    setSearchQuery('');
    setPage(1);
  };

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

  // Total users count — null until /users answers, so the card shows a
  // placeholder instead of a provisional 0.
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalUsersFailed, setTotalUsersFailed] = useState(false);

  // Export state
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('csv');
  const [exportDateMode, setExportDateMode] = useState<'preset' | 'custom'>('preset');
  const [exportPresetDays, setExportPresetDays] = useState('30');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportSelectedCols, setExportSelectedCols] = useState<Record<string, boolean>>(
    Object.fromEntries(EXPORT_COLUMNS.map(c => [c.key, true]))
  );
  const [exportLoading, setExportLoading] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Prevent duplicate fetches in development mode
  const hasFetched = useRef(false);
  const prevFilters = useRef({ page, actionFilter, entityFilter, dateRange, errorOriginFilter, userFilter });
  /* Bumped by every fetchAuditLogs / fetchStats run, so only the latest
     request applies. The mount fetch runs with default filters before the
     saved ones are restored, then again with them; whichever landed last
     used to win — rows and counts for the wrong filters. */
  const logsFetchSeqRef = useRef(0);
  const statsFetchSeqRef = useRef(0);

  // Persist the cards<->list view, filters and pagination + scroll position so
  // returning to this page restores exactly where the user left off. The
  // cards-first overview and the list differ a lot in height, so re-detect the
  // scroll container when pageView flips.
  const rootRef = useScrollRestoration<HTMLElement>('audits-trail', !loading, [pageView]);
  useListStatePersistence(
    'audits-trail',
    { pageView, searchQuery, actionFilter, entityFilter, dateRange, errorOriginFilter, userFilter, page },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.actionFilter === 'string') setActionFilter(s.actionFilter);
      if (typeof s.entityFilter === 'string') setEntityFilter(s.entityFilter);
      if (typeof s.dateRange === 'string') setDateRange(s.dateRange);
      if (typeof s.errorOriginFilter === 'string') setErrorOriginFilter(s.errorOriginFilter as '' | ErrorOrigin);
      if (typeof s.userFilter === 'string') setUserFilter(s.userFilter);
      if (typeof s.page === 'number') setPage(s.page);
    },
  );

  const fetchAuditLogs = useCallback(async () => {
    const seq = ++logsFetchSeqRef.current;
    const isStale = () => seq !== logsFetchSeqRef.current;
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });

      // The backend accepts any AuditAction value and any free-form entity_type
      // string, so forward the selected filters directly. The user filter is
      // applied server-side too (the stats popup only knows the recent page
      // otherwise, which made it look broken).
      if (actionFilter) {
        params.append('action', actionFilter);
      }
      if (entityFilter) {
        params.append('entity_type', entityFilter);
      }
      if (userFilter) {
        params.append('user_id', userFilter);
      }
      if (errorOriginFilter) {
        params.append('error_origin', errorOriginFilter);
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

      if (isStale()) return;
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
      if (isStale()) return;
      setAuditLogs(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err: any) {
      if (isStale()) return;
      console.error('Error fetching audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [page, pageSize, actionFilter, entityFilter, dateRange, errorOriginFilter, userFilter]);

  const fetchStats = useCallback(async () => {
    const seq = ++statsFetchSeqRef.current;
    const isStale = () => seq !== statsFetchSeqRef.current;
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
        if (isStale()) return;
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
      const response = await fetch(`${API_URL}/users?page=1&page_size=1`, {
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
        setTotalUsers(data.total ?? (Array.isArray(data.users || data) ? (data.users || data).length : 0));
      } else {
        setTotalUsersFailed(true);
      }
    } catch (err) {
      console.error('Error fetching users count:', err);
      setTotalUsersFailed(true);
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
      prev.dateRange !== dateRange ||
      prev.errorOriginFilter !== errorOriginFilter ||
      prev.userFilter !== userFilter;

    if (filtersChanged && hasFetched.current) {
      prevFilters.current = { page, actionFilter, entityFilter, dateRange, errorOriginFilter, userFilter };
      fetchAuditLogs();
      fetchStats();
    }
  }, [page, actionFilter, entityFilter, dateRange, errorOriginFilter, userFilter]);

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

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close stats popup on outside click
  useEffect(() => {
    if (!statsPopup) return;
    const handler = (e: MouseEvent) => {
      if (statsPopupRef.current && !statsPopupRef.current.contains(e.target as Node)) {
        setStatsPopup(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statsPopup]);

  const openExportModal = (format: 'csv' | 'excel') => {
    setExportFormat(format);
    setExportDropdownOpen(false);
    setExportPresetDays(dateRange);
    setExportDateMode('preset');
    setExportStartDate('');
    setExportEndDate('');
    setExportSelectedCols(Object.fromEntries(EXPORT_COLUMNS.map(c => [c.key, true])));
    setExportModalOpen(true);
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
    return formatIST(dateStr);
  };

  const getColumnValue = (log: AuditLog, key: ExportColumnKey): string => {
    const status = getActionStatus(log.action, log.error_origin);
    const impact = getImpactText(log);
    switch (key) {
      case 'timestamp':      return log.created_at;
      case 'user':           return log.user_name || '';
      case 'role':           return log.actor_role || '';
      case 'action':         return log.action_label;
      case 'module':         return log.module_type || '';
      case 'entity_type':    return log.entity_type || '';
      case 'entity_id':      return log.entity_id || '';
      case 'status':         return status.label;
      case 'details':        return getDetailsSummary(log);
      case 'impact':         return impact.text;
      case 'unit_type':      return log.unit_type || '';
      case 'units_impact':   return String(log.units_consumed || '');
      case 'balance_before': return String(log.balance_before ?? log.details?.balance_before ?? '');
      case 'balance_after':  return String(log.balance_after ?? log.details?.balance_after ?? '');
      case 'error_origin':   return log.error_origin;
      case 'error_code':     return log.error_code ? (ERROR_CODE_LABELS[log.error_code] || log.error_code) : '';
      case 'session_start':  return log.session_start_time || '';
      case 'session_end':    return log.session_end_time || '';
      case 'duration':       return String(log.total_session_duration ?? '');
      case 'refund':         return log.refund_flag;
      case 'ip_address':     return log.ip_address || '';
      default:               return '';
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const exportPageSize = Math.min(total || 1000, 1000);
      const params = new URLSearchParams({ page: '1', page_size: exportPageSize.toString() });

      if (actionFilter) params.append('action', actionFilter);
      if (entityFilter) params.append('entity_type', entityFilter);
      if (userFilter) params.append('user_id', userFilter);
      if (errorOriginFilter) params.append('error_origin', errorOriginFilter);

      if (exportDateMode === 'preset' && exportPresetDays) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(exportPresetDays));
        params.append('start_date', startDate.toISOString());
        params.append('end_date', endDate.toISOString());
      } else if (exportDateMode === 'custom' && exportStartDate && exportEndDate) {
        params.append('start_date', new Date(exportStartDate).toISOString());
        params.append('end_date', new Date(exportEndDate).toISOString());
      }

      const response = await fetch(`${API_URL}/audits?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        const selectedKeys = EXPORT_COLUMNS.map(c => c.key).filter(k => exportSelectedCols[k]) as ExportColumnKey[];
        if (exportFormat === 'csv') {
          const csv = convertToCSV(data.items, selectedKeys);
          downloadFile(csv, 'audit-trail.csv', 'text/csv');
        } else {
          const xls = convertToExcel(data.items, selectedKeys);
          downloadFile(xls, 'audit-trail.xls', 'application/vnd.ms-excel');
        }
        setExportModalOpen(false);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExportLoading(false);
    }
  };

  // Derive status from action name and error_origin
  const getActionStatus = (action: string, errorOrigin?: string | null): { label: string; color: string } => {
    // Use error_origin for session-based events when available
    if (errorOrigin === 'SYSTEM')
      return { label: 'System Failure', color: 'bg-destructive-subtle text-destructive-strong border border-destructive-line' };
    if (errorOrigin === 'TENANT')
      return { label: 'Tenant Interrupted', color: 'bg-warning-subtle text-warning-strong border border-warning-line' };
    if (action.includes('_failed') || action === 'login_failed' || action === 'session_interrupted' || action === 'assessment_error')
      return { label: 'Failed', color: 'bg-destructive-subtle text-destructive-strong border border-destructive-line' };
    if (action === 'quota_exhausted' || action === 'user_limit_exceeded')
      return { label: 'Blocked', color: 'bg-warning-subtle text-warning-strong border border-warning-line' };
    if (action.includes('_blocked') || action.includes('_denied'))
      return { label: 'Denied', color: 'bg-warning-subtle text-warning-strong border border-warning-line' };
    return { label: 'Success', color: 'bg-success-subtle text-success-strong border border-success-line' };
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

  // Get impact level (severity based on status and error_origin)
  const getImpactLevel = (log: AuditLog): { label: string; color: string } => {
    // Use error_origin when available for session-based events
    if (log.error_origin === 'SYSTEM') return { label: 'High', color: 'text-destructive' };
    if (log.error_origin === 'TENANT') return { label: 'Medium', color: 'text-warning' };
    const status = getActionStatus(log.action, log.error_origin);
    if (status.label === 'Failed' || status.label === 'System Failure') return { label: 'High', color: 'text-destructive' };
    if (status.label === 'Blocked') return { label: 'High', color: 'text-destructive' };
    if (status.label === 'Denied' || status.label === 'Tenant Interrupted') return { label: 'Medium', color: 'text-warning' };
    if (log.action.includes('delete') || log.action.includes('remove') || log.action.includes('cancel'))
      return { label: 'Medium', color: 'text-warning' };
    return { label: 'Low', color: 'text-success' };
  };

  // Get impact text (unit consumption impact)
  const getImpactText = (log: AuditLog): { text: string; negative: boolean; positive?: boolean } => {
    const units = log.details?.units_consumed_actual ?? log.units_consumed;
    // Addon/seat purchases add credits — show as positive (green)
    const isPurchase = ['addon_purchase', 'seats_purchase'].includes(log.action);
    if (units && units > 0 && log.unit_type) {
      if (isPurchase) {
        return { text: `+${units} ${log.unit_type}`, negative: false, positive: true };
      }
      return { text: `-${units} ${log.unit_type}`, negative: true };
    }
    if (units === 0 && log.unit_type) {
      return { text: `0 ${log.unit_type}`, negative: false };
    }
    return { text: '—', negative: false };
  };

  const convertToCSV = (logs: AuditLog[], keys: ExportColumnKey[]): string => {
    const headers = keys.map(k => EXPORT_COLUMNS.find(c => c.key === k)!.label);
    const rows = logs.map(log => keys.map(k => getColumnValue(log, k)));
    return [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  };

  const convertToExcel = (logs: AuditLog[], keys: ExportColumnKey[]): string => {
    const headers = keys.map(k => EXPORT_COLUMNS.find(c => c.key === k)!.label);
    const rows = logs.map(log => keys.map(k => getColumnValue(log, k)));
    const esc = (v: string) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Audit Trail</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--><meta charset="UTF-8"></head><body><div className="tf-table-shell">
      <table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div></body></html>`;
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = auditLogs.filter(log => {
    // Error origin filter (applied client-side; the list endpoint ignores it)
    if (errorOriginFilter && log.error_origin !== errorOriginFilter) return false;

    // Action / entity / user filters are applied server-side via fetchAuditLogs.

    // Then filter by search query
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      (log.user_name && log.user_name.toLowerCase().includes(search)) ||
      (log.action_label && log.action_label.toLowerCase().includes(search)) ||
      (log.entity_type && log.entity_type.toLowerCase().includes(search)) ||
      (log.ip_address && log.ip_address.includes(search)) ||
      (log.actor_role && log.actor_role.toLowerCase().includes(search)) ||
      (log.error_code && (ERROR_CODE_LABELS[log.error_code] || log.error_code).toLowerCase().includes(search))
    );
  });

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Audit Trail' }]} />
        <PageHeader
          icon={<ScrollText className="h-5 w-5" />}
          title="Audit Trail"
          description="Track every system activity and change in real-time."
          actions={
            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="secondary"
                onClick={() => { fetchAuditLogs(); fetchStats(); }}
                icon={<RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                className="rounded-xl hover:-translate-y-0.5"
              >
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <div className="relative" ref={exportDropdownRef}>
                <Button
                  variant="primary"
                  onClick={() => setExportDropdownOpen(v => !v)}
                  icon={<Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  className="rounded-xl shadow-md hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <span className="font-medium hidden sm:inline">Export</span>
                  <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </Button>
                {exportDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 rounded-xl shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.02] dark:ring-white/[0.02] z-50 overflow-hidden min-w-[120px] max-w-[calc(100vw-1.5rem)]">
                    <button
                      onClick={() => openExportModal('csv')}
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-brand-cyan/[0.06] hover:text-brand-blue transition-colors"
                    >
                      <FileText className="w-4 h-4 text-brand-blue/70" />
                      CSV
                    </button>
                    <button
                      onClick={() => openExportModal('excel')}
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-brand-cyan/[0.06] hover:text-brand-blue transition-colors border-t border-gray-100 dark:border-slate-700/60"
                    >
                      <Activity className="w-4 h-4 text-brand-teal/70" />
                      Excel
                    </button>
                  </div>
                )}
              </div>
            </div>
          }
        />

        {/* Stats Cards — Total Actions opens the list; the other three open a
            filter popup that lets the user drill into a specific user/action/entity. */}
        {stats && (
          <div ref={statsPopupRef} className="relative mb-4 sm:mb-6 lg:mb-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-5">
              <button
                type="button"
                onClick={() => { setStatsPopup(null); clearAllFilters(); openListView(); }}
                className={`text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border p-4 sm:p-6 hover:shadow-md transition-all ${pageView === 'list' && !statsPopup ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Actions</p>
                    <p className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-slate-50 mt-1 sm:mt-2">{stats.total_actions.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1 sm:mt-2 flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                      Last {stats.period_days} days
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-brand-blue rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-brand-blue/20 ring-1 ring-white/10 flex-shrink-0">
                    <Activity className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStatsPopup(p => p === 'users' ? null : 'users')}
                className={`text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border p-4 sm:p-6 hover:shadow-md transition-all ${statsPopup === 'users' ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Active Users</p>
                    <p className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-slate-50 mt-1 sm:mt-2">{totalUsers !== null ? totalUsers : totalUsersFailed ? '—' : <StatValuePlaceholder />}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1 sm:mt-2 flex items-center gap-1">
                      <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                      {userFilter ? 'Filtering by 1 user' : 'Click to filter'}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-brand-teal rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-brand-blue/20 ring-1 ring-white/10 flex-shrink-0">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStatsPopup(p => p === 'actions' ? null : 'actions')}
                className={`text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border p-4 sm:p-6 hover:shadow-md transition-all ${statsPopup === 'actions' ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Action Types</p>
                    <p className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-slate-50 mt-1 sm:mt-2">{Object.keys(stats.actions_by_type).length}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1 sm:mt-2 flex items-center gap-1">
                      <Filter className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                      {actionFilter ? 'Filtering by 1 action' : 'Click to filter'}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-brand-orange rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-brand-blue/20 ring-1 ring-white/10 flex-shrink-0">
                    <Zap className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStatsPopup(p => p === 'entities' ? null : 'entities')}
                className={`text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border p-4 sm:p-6 hover:shadow-md transition-all ${statsPopup === 'entities' ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Entity Types</p>
                    <p className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-slate-50 mt-1 sm:mt-2">{Object.keys(stats.actions_by_entity).length}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1 sm:mt-2 flex items-center gap-1">
                      <ScrollText className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                      {entityFilter ? 'Filtering by 1 entity' : 'Click to filter'}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-brand-teal rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-brand-blue/20 ring-1 ring-white/10 flex-shrink-0">
                    <FolderOpen className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
                  </div>
                </div>
              </button>
            </div>

            {/* Filter popup anchored below the stats cards */}
            {statsPopup && (
              <div className="absolute left-0 right-0 top-full mt-2 z-20 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.02] dark:ring-white/[0.02] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/50">
                  <p className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                    {statsPopup === 'users' ? 'Top Active Users' : statsPopup === 'actions' ? 'Action Types' : 'Entity Types'}
                  </p>
                  <div className="flex items-center gap-2">
                    {((statsPopup === 'users' && userFilter) || (statsPopup === 'actions' && actionFilter) || (statsPopup === 'entities' && entityFilter)) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (statsPopup === 'users') { setUserFilter(''); setPage(1); }
                          if (statsPopup === 'actions') { setActionFilter(''); setPage(1); }
                          if (statsPopup === 'entities') { setEntityFilter(''); setPage(1); }
                        }}
                        className="text-xs font-medium text-brand-blue hover:text-brand-blue-2"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setStatsPopup(null)}
                      className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700/60">
                  {statsPopup === 'users' && (
                    stats.top_active_users.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-500 dark:text-slate-400 text-center">No users found.</p>
                    ) : (
                      stats.top_active_users.map((u) => {
                        const isActive = userFilter === u.user_id;
                        return (
                          <button
                            key={u.user_id}
                            type="button"
                            onClick={() => {
                              setUserFilter(isActive ? '' : u.user_id);
                              setPage(1);
                              setStatsPopup(null);
                              openListView();
                            }}
                            className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${isActive ? 'bg-brand-blue/[0.06]' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <NameAvatar name={u.user_name} fallback={u.user_email} size="sm" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{u.user_name || 'Unknown'}</p>
                                {u.user_email && <p className="text-xs text-gray-500 dark:text-slate-500 truncate">{u.user_email}</p>}
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex-shrink-0">{u.action_count}</span>
                          </button>
                        );
                      })
                    )
                  )}
                  {statsPopup === 'actions' && (
                    Object.entries(stats.actions_by_type).length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-500 dark:text-slate-400 text-center">No actions found.</p>
                    ) : (
                      Object.entries(stats.actions_by_type)
                        .sort((a, b) => b[1] - a[1])
                        .map(([action, count]) => {
                          const isActive = actionFilter === action;
                          const label = action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                          return (
                            <button
                              key={action}
                              type="button"
                              onClick={() => {
                                setActionFilter(isActive ? '' : action);
                                setPage(1);
                                setStatsPopup(null);
                                openListView();
                              }}
                              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${isActive ? 'bg-brand-blue/[0.06]' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                            >
                              <span className="text-sm text-gray-800 dark:text-slate-100 truncate">{label}</span>
                              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex-shrink-0">{count}</span>
                            </button>
                          );
                        })
                    )
                  )}
                  {statsPopup === 'entities' && (
                    Object.entries(stats.actions_by_entity).length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-500 dark:text-slate-400 text-center">No entities found.</p>
                    ) : (
                      Object.entries(stats.actions_by_entity)
                        .sort((a, b) => b[1] - a[1])
                        .map(([entity, count]) => {
                          const isActive = entityFilter === entity;
                          const label = entity.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                          return (
                            <button
                              key={entity}
                              type="button"
                              onClick={() => {
                                setEntityFilter(isActive ? '' : entity);
                                setPage(1);
                                setStatsPopup(null);
                                openListView();
                              }}
                              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${isActive ? 'bg-brand-blue/[0.06]' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                            >
                              <span className="text-sm text-gray-800 dark:text-slate-100 truncate">{label}</span>
                              <span className="text-xs font-semibold text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex-shrink-0">{count}</span>
                            </button>
                          );
                        })
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {pageView === 'list' && (
        <>

        {/* Combined Audit Log Card - Tabs, Filters & Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/60 overflow-hidden">
          {/* Record Count */}
          <div className="px-3 sm:px-4 md:px-5 pt-3 sm:pt-4 md:pt-5 pb-3 sm:pb-4 border-b border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Audit Records</span>
              <span className="text-sm text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full font-medium">{total} records</span>
            </div>
          </div>

          {/* Filters */}
          <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/50 dark:bg-slate-800/50">
            <div className="flex flex-col gap-2 sm:gap-3">
              <div className="w-full">
                <div className="relative">
                  <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 z-10" />
                  <Input
                    type="text"
                    placeholder="Search by user, action, or IP..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 sm:pl-11"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3">
                <div className="relative">
                  <select
                    value={actionFilter}
                    onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                    className="appearance-none w-full pl-2.5 sm:pl-4 pr-7 sm:pr-10 py-1.5 sm:py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all text-sm cursor-pointer text-gray-900 dark:text-slate-50"
                  >
                    <option value="">All Actions</option>
                    {availableActions.map(action => (
                      <option key={action.value} value={action.value}>{action.label}</option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 rotate-90 pointer-events-none" />
                </div>
                <div className="relative">
                  <select
                    value={entityFilter}
                    onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
                    className="appearance-none w-full pl-2.5 sm:pl-4 pr-7 sm:pr-10 py-1.5 sm:py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all text-sm cursor-pointer text-gray-900 dark:text-slate-50"
                  >
                    <option value="">All Entities</option>
                    {availableEntities.map(entity => (
                      <option key={entity.value} value={entity.value}>{entity.label}</option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 rotate-90 pointer-events-none" />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
                  <select
                    value={dateRange}
                    onChange={(e) => { setDateRange(e.target.value); setPage(1); }}
                    className="appearance-none w-full pl-7 sm:pl-9 pr-7 sm:pr-10 py-1.5 sm:py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all text-sm cursor-pointer text-gray-900 dark:text-slate-50"
                  >
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">1 year</option>
                  </select>
                  <ChevronRight className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 rotate-90 pointer-events-none" />
                </div>
                <div className="relative">
                  <Shield className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
                  <select
                    value={errorOriginFilter}
                    onChange={(e) => { setErrorOriginFilter(e.target.value as '' | ErrorOrigin); setPage(1); }}
                    className="appearance-none w-full pl-7 sm:pl-9 pr-7 sm:pr-10 py-1.5 sm:py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all text-sm cursor-pointer text-gray-900 dark:text-slate-50"
                  >
                    <option value="">All Origins</option>
                    <option value="TENANT">Tenant</option>
                    <option value="SYSTEM">System</option>
                    <option value="NONE">Normal</option>
                  </select>
                  <ChevronRight className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 rotate-90 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Table Content */}
          {loading ? (
            <TableSkeleton />
          ) : error ? (
            <div className="p-8 sm:p-12 md:p-16 text-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 dark:bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600 dark:text-slate-400" />
              </div>
              <p className="text-gray-700 dark:text-slate-300 font-medium text-sm sm:text-base break-words px-4">{error}</p>
              <div className="mt-3 sm:mt-4 flex justify-center">
                <Button variant="primary" size="sm" onClick={fetchAuditLogs}>
                  Retry
                </Button>
              </div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No audit logs found"
              description="Try adjusting your filters"
            />
          ) : (
            <>
            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700/60">
              {filteredLogs.map((log) => {
                const actionStatus = getActionStatus(log.action, log.error_origin);
                const impact = getImpactText(log);
                const impactLevel = getImpactLevel(log);
                return (
                  <div key={log.id} className="p-3 sm:p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <NameAvatar name={log.user_name} fallback={log.user_email} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 dark:text-slate-50 truncate">{log.user_name || 'Unknown'}</p>
                          <p className="text-2xs text-gray-500 dark:text-slate-500 truncate">{log.user_email || ''}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="flex items-center gap-1 px-2 py-1 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md text-2xs font-medium flex-shrink-0"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-2xs font-semibold ${getActionColor(log.action)}`}>
                        {log.action_label}
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-2xs font-semibold ${actionStatus.color}`}>
                        {actionStatus.label}
                      </span>
                      <span className={`text-2xs font-semibold ${impactLevel.color}`}>
                        {impactLevel.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-2xs text-gray-500 dark:text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                        <span>{formatDate(log.created_at)}</span>
                      </div>
                      {impact.text !== '—' && (
                        <span className={`font-semibold ${impact.negative ? 'text-destructive' : impact.positive ? 'text-success' : 'text-gray-500 dark:text-slate-500'}`}>
                          {impact.text}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Desktop Table — sideways scroll only (many columns); the page
                itself is the sole vertical scroller, so its scrollbar stays at
                the true edge of the viewport instead of a second one drawn
                around this table. See the `.tf-table-shell` note in
                globals.css: giving a table its own vertical scroll cap here is
                exactly the nested-scroller problem that class documents. */}
            <div className="hidden md:block table-responsive">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50/95 dark:bg-slate-800/95 backdrop-blur-sm shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85_/_0.6)]">
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Timestamp</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">User ID</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Action</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Details</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Impact</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Error Origin</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Error Code</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Duration</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Refund Flag</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Units</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider tf-sticky-col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {filteredLogs.map((log) => {
                    const actionStatus = getActionStatus(log.action, log.error_origin);
                    const impact = getImpactText(log);
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className="hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                            <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            <span>{formatDate(log.created_at)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {log.user_display_id ? (
                            <span className="text-sm font-mono text-gray-700 dark:text-slate-300">{log.user_display_id}</span>
                          ) : log.actor_role?.toLowerCase() === 'candidate' ? (
                            <span className="text-sm font-mono text-brand-blue">CID</span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <NameAvatar name={log.user_name} fallback={log.user_email} size="md" />
                            <p className="text-sm font-medium text-gray-900 dark:text-slate-50">{log.user_name || 'Unknown'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {log.actor_role ? (
                            <span className="text-sm text-gray-700 dark:text-slate-300 capitalize">{log.actor_role.replace(/_/g, ' ').toLowerCase()}</span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-3 py-1.5 rounded-lg text-xs font-semibold ${getActionColor(log.action)}`}>
                            {log.action_label}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-gray-700 dark:text-slate-300 max-w-[180px] truncate block" title={getDetailsSummary(log)}>
                            {getDetailsSummary(log)}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${actionStatus.color}`}>
                            {actionStatus.label}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {(() => {
                            const impactLevel = getImpactLevel(log);
                            return (
                              <span className={`text-sm font-semibold ${impactLevel.color}`}>
                                {impactLevel.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${ERROR_ORIGIN_COLORS[log.error_origin]}`}>
                            {ERROR_ORIGIN_LABELS[log.error_origin]}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {log.error_code ? (
                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${ERROR_CODE_COLORS[log.error_code] || 'bg-gray-50 text-gray-600'}`}>
                              {ERROR_CODE_LABELS[log.error_code] || log.error_code}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {log.total_session_duration != null ? (
                            <span className="text-sm text-gray-700 dark:text-slate-300 font-medium">
                              {formatSessionDuration(log.total_session_duration)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${REFUND_FLAG_COLORS[log.refund_flag]}`}>
                            {log.refund_flag}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {impact.text !== '—' ? (
                            <span className={`inline-flex items-center gap-1 text-sm font-semibold ${impact.negative ? 'text-destructive' : impact.positive ? 'text-success' : 'text-gray-500 dark:text-slate-500'}`}>
                              {impact.text}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap tf-sticky-col">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-50 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
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
            </>
          )}

          {/* Pagination */}
          {filteredLogs.length > 0 && (
            <div className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 bg-gray-50/50 dark:bg-slate-800/50">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Showing <span className="font-semibold text-gray-900 dark:text-slate-50">{Math.min((page - 1) * pageSize + 1, total)}</span>–<span className="font-semibold text-gray-900 dark:text-slate-50">{Math.min(page * pageSize, total)}</span> of <span className="font-semibold text-gray-900 dark:text-slate-50">{total}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-auto">
                <div className="flex items-center gap-1.5">
                  <span className="hidden sm:inline text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">Go to</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageJumpInput}
                    onChange={(e) => setPageJumpInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                        jumpToPage();
                      }
                    }}
                    onBlur={jumpToPage}
                    aria-label="Go to page"
                    className="w-12 sm:w-14 h-7 sm:h-8 px-1.5 sm:px-2 text-sm text-center bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-gray-900 dark:text-slate-50"
                  />
                </div>

                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                  aria-label="Previous page" title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                <span className="text-sm font-medium text-gray-700 dark:text-slate-300 px-1 whitespace-nowrap">
                  <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
                </span>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                  aria-label="Next page" title="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
        </>
        )}
      </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-[95vw] sm:max-w-lg md:max-w-2xl w-full flex flex-col max-h-[90dvh] sm:max-h-[85dvh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex-shrink-0 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white dark:from-slate-800/50 dark:to-slate-900">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-brand-blue/20 ring-1 ring-white/10 flex-shrink-0">
                  <ScrollText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base md:text-lg font-bold text-gray-900 dark:text-slate-50">Audit Log Details</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Complete event information</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg sm:rounded-xl transition-colors flex-shrink-0"
               aria-label="Close">
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 dark:text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 flex-1 min-h-0 overflow-y-auto space-y-3 sm:space-y-4 md:space-y-5">
              {/* User & Action Header */}
              <div className="flex items-start gap-2.5 sm:gap-3 md:gap-4 pb-3 sm:pb-4 md:pb-5 border-b border-gray-100 dark:border-slate-700/60">
                <NameAvatar name={selectedLog.user_name} fallback={selectedLog.user_email} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base text-gray-900 dark:text-slate-50">{selectedLog.user_name || 'Unknown User'}</p>
                  {selectedLog.actor_role && (
                    <p className="text-sm text-gray-500 dark:text-slate-500 truncate capitalize">{selectedLog.actor_role.replace(/_/g, ' ').toLowerCase()}</p>
                  )}
                </div>
                <span className={`inline-flex px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-xs font-semibold flex-shrink-0 ${getActionColor(selectedLog.action)}`}>
                  {selectedLog.action_label}
                </span>
              </div>

              {/* Log ID */}
              <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">Log ID</p>
                <p className="text-xs font-mono text-gray-700 dark:text-slate-300 break-all">{selectedLog.id}</p>
              </div>

              {/* Summary Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                  <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">When</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-50">{formatDate(selectedLog.created_at)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                  <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">Entity</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-50 capitalize">{selectedLog.entity_type?.replace(/_/g, ' ') || '—'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                  <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">IP Address</p>
                  <p className="text-sm font-mono font-medium text-gray-900 dark:text-slate-50 break-all">{selectedLog.ip_address || '—'}</p>
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
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                      <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                        <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">Status</p>
                        {(() => { const s = getActionStatus(selectedLog.action, selectedLog.error_origin); return <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-xs font-semibold ${s.color}`}>{s.label}</span>; })()}
                      </div>
                      <div className="hidden sm:block" /><div className="hidden sm:block" />
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                    {hasUnits ? (
                      <div className="bg-gray-100 dark:bg-slate-800 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                        <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">Impact</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-lg font-bold ${modalImpact.negative ? 'text-destructive' : 'text-gray-900 dark:text-slate-50'}`}>
                            {modalImpact.text}
                          </span>
                        </div>
                      </div>
                    ) : <div className="hidden sm:block" />}
                    {hasBalance ? (
                      <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                        <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">Available</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm text-gray-500 dark:text-slate-500">{modalBalanceBefore}</span>
                          <span className="text-gray-300 dark:text-slate-500">→</span>
                          <span className="text-lg font-bold text-gray-900 dark:text-slate-50">{modalBalanceAfter ?? 0}</span>
                        </div>
                      </div>
                    ) : <div className="hidden sm:block" />}
                    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                      <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">Status</p>
                      {(() => { const s = getActionStatus(selectedLog.action, selectedLog.error_origin); return <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-xs font-semibold ${s.color}`}>{s.label}</span>; })()}
                    </div>
                  </div>
                );
              })()}

              {/* Entity ID (if present) */}
              {selectedLog.entity_id && (
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                  <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">Entity ID</p>
                  <p className="text-sm font-mono text-gray-700 dark:text-slate-300 truncate" title={selectedLog.entity_id}>{selectedLog.entity_id}</p>
                </div>
              )}

              {/* Session Details (shown when session fields exist) */}
              {(selectedLog.session_start_time || selectedLog.error_origin || selectedLog.module_type) && (
                <div>
                  <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2.5">Session Details</p>
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl divide-y divide-gray-100 dark:divide-slate-700/60 overflow-hidden">
                    {selectedLog.module_type && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Module</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{MODULE_TYPE_LABELS[selectedLog.module_type] || selectedLog.module_type}</span>
                      </div>
                    )}
                    {selectedLog.session_start_time && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Session Start</span>
                        <span className="text-sm text-gray-900 dark:text-slate-50">{formatDate(selectedLog.session_start_time)}</span>
                      </div>
                    )}
                    {selectedLog.interruption_time && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Interruption</span>
                        <span className="text-sm text-destructive">{formatDate(selectedLog.interruption_time)}</span>
                      </div>
                    )}
                    {selectedLog.session_end_time && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Session End</span>
                        <span className="text-sm text-gray-900 dark:text-slate-50">{formatDate(selectedLog.session_end_time)}</span>
                      </div>
                    )}
                    {selectedLog.total_session_duration != null && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Duration</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">{formatSessionDuration(selectedLog.total_session_duration)}</span>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                      <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Error Origin</span>
                      <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-xs font-semibold ${ERROR_ORIGIN_COLORS[selectedLog.error_origin]}`}>
                        {ERROR_ORIGIN_LABELS[selectedLog.error_origin]}
                      </span>
                    </div>
                    {selectedLog.error_code && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Error Code</span>
                        <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-xs font-semibold ${ERROR_CODE_COLORS[selectedLog.error_code] || 'bg-gray-50 text-gray-600'}`}>
                          {ERROR_CODE_LABELS[selectedLog.error_code] || selectedLog.error_code}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                      <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Refund Flag</span>
                      <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-xs font-semibold ${REFUND_FLAG_COLORS[selectedLog.refund_flag]}`}>
                        {selectedLog.refund_flag}
                      </span>
                    </div>
                    {selectedLog.error_origin !== 'NONE' && (selectedLog.units_consumed ?? 0) > 0 && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Billing Impact</span>
                        <span className="text-sm text-gray-700 dark:text-slate-300 break-words">{getBillingImpact(selectedLog.error_origin).description}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Event Details - Friendly key-value display */}
              {selectedLog.details && Object.entries(selectedLog.details).filter(([k, v]) => {
                const HIDDEN_KEYS = ['units_consumed_actual', 'balance_before', 'balance_after', 'units_deducted', 'pii_compliant'];
                if (HIDDEN_KEYS.includes(k)) return false;
                if (v === null || v === undefined) return false;
                if (Array.isArray(v) && v.length === 0) return false;
                return true;
              }).length > 0 && (
                <div>
                  <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2.5">Event Details</p>
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl divide-y divide-gray-100 dark:divide-slate-700/60 overflow-hidden">
                    {Object.entries(selectedLog.details)
                      .filter(([key, value]) => {
                        const HIDDEN_KEYS = ['units_consumed_actual', 'balance_before', 'balance_after', 'units_deducted', 'pii_compliant'];
                        if (HIDDEN_KEYS.includes(key)) return false;
                        if (value === null || value === undefined) return false;
                        if (Array.isArray(value) && value.length === 0) return false;
                        return true;
                      })
                      .map(([key, value]) => (
                      <div key={key} className="flex items-start px-4 py-3 gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 min-w-[140px] flex-shrink-0 pt-0.5 capitalize">
                          {(DETAIL_KEY_LABELS as Record<string, string>)[key] || key.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm text-gray-900 dark:text-slate-50 break-all">
                          {value === null || value === undefined
                            ? '—'
                            : typeof value === 'boolean'
                            ? value ? 'Yes' : 'No'
                            : Array.isArray(value)
                            ? value.join(', ')
                            : typeof value === 'object'
                            ? Object.entries(value as Record<string, unknown>)
                                .filter(([, v]) => v !== null && v !== undefined)
                                .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}`)
                                .join(' · ')
                            : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Generation Audit Section */}
              {isLoadingAiAudit && (
                <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500">
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading AI generation data...</span>
                </div>
              )}
              {aiAuditData && (
                <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue flex-shrink-0" />
                  <p className="text-2xs sm:text-2xs font-medium text-brand-blue uppercase tracking-wider">AI Generation Audit</p>
                </div>

                {/* Model Version + Generation Timestamp */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div className="bg-brand-blue/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5 ring-1 ring-brand-blue/15">
                    <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">AI Model Version</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">{aiAuditData.ai_model_version || 'N/A'}</p>
                  </div>
                  <div className="bg-brand-blue/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5 ring-1 ring-brand-blue/15">
                    <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1">Generation Timestamp</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-50">
                      {formatIST(aiAuditData.questions_generated_at)}
                    </p>
                  </div>
                </div>

                {/* Input Parameters Table */}
                <div className="bg-gray-50 rounded-lg sm:rounded-xl divide-y divide-gray-100 overflow-hidden">
                  <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100/50 dark:bg-slate-800">
                    <p className="text-2xs sm:text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">Input Parameters</p>
                  </div>
                  {aiAuditData.generation_params ? (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">JD Title</span>
                        <span className="text-sm text-gray-900 dark:text-slate-50 break-words">{aiAuditData.generation_params.jd_title || 'N/A'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Experience</span>
                        <span className="text-sm text-gray-900 dark:text-slate-50 capitalize">{aiAuditData.generation_params.experience_level?.replace(/_/g, ' ') || 'N/A'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Duration</span>
                        <span className="text-sm text-gray-900 dark:text-slate-50">{aiAuditData.generation_params.duration_minutes ? `${aiAuditData.generation_params.duration_minutes} min` : 'N/A'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Questions</span>
                        <span className="text-sm text-gray-900 dark:text-slate-50">{aiAuditData.generation_params.total_questions_generated ?? 'N/A'}</span>
                      </div>
                      {aiAuditData.generation_params.rounds_config && aiAuditData.generation_params.rounds_config.length > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                          <span className="text-xs font-medium text-gray-500 dark:text-slate-500 sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Rounds</span>
                          <div className="flex flex-wrap gap-1 sm:gap-1.5">
                            {aiAuditData.generation_params.rounds_config.map((round: any, idx: number) => (
                              <span key={idx} className="px-1.5 sm:px-2 py-0.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 rounded text-xs font-medium capitalize">
                                {round.type} ({round.weightage}%)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-3 sm:px-4 py-2 sm:py-3">
                      <span className="text-sm text-gray-500 dark:text-slate-500">No input parameters recorded</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>

          </div>
        </div>
      )}

      {/* Export Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white dark:from-slate-800/50 dark:to-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-lg shadow-brand-blue/20 ring-1 ring-white/10">
                  <Download className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-slate-50">
                    Export {exportFormat === 'csv' ? 'CSV' : 'Excel'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Configure date range and columns</p>
                </div>
              </div>
              <button onClick={() => setExportModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors" aria-label="Close">
                <X className="w-4 h-4 text-gray-500 dark:text-slate-500" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* Date Range */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-3">Date Range</p>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setExportDateMode('preset')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${exportDateMode === 'preset' ? 'bg-brand-blue text-white border-brand-blue shadow-md shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30'}`}
                  >
                    Preset
                  </button>
                  <button
                    onClick={() => setExportDateMode('custom')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${exportDateMode === 'custom' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                  >
                    Custom
                  </button>
                </div>
                {exportDateMode === 'preset' ? (
                  <div className="grid grid-cols-4 gap-2">
                    {[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setExportPresetDays(opt.value)}
                        className={`py-2 rounded-xl text-xs font-medium border transition-all ${exportPresetDays === opt.value ? 'bg-brand-blue text-white border-brand-blue shadow-md shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-500 mb-1.5">Start Date</label>
                      <DateField
                        aria-label="Start Date"
                        value={exportStartDate}
                        onChange={setExportStartDate}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-500 mb-1.5">End Date</label>
                      <DateField
                        aria-label="End Date"
                        value={exportEndDate}
                        onChange={setExportEndDate}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Columns */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider">Columns</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExportSelectedCols(Object.fromEntries(EXPORT_COLUMNS.map(c => [c.key, true])))}
                      className="text-xs text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-50 font-medium underline underline-offset-2"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300 dark:text-slate-500">|</span>
                    <button
                      onClick={() => setExportSelectedCols(Object.fromEntries(EXPORT_COLUMNS.map(c => [c.key, false])))}
                      className="text-xs text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-50 font-medium underline underline-offset-2"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {EXPORT_COLUMNS.map(col => (
                    <label key={col.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={!!exportSelectedCols[col.key]}
                        onChange={e => setExportSelectedCols(prev => ({ ...prev, [col.key]: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-200 dark:border-slate-700 accent-brand-blue focus:ring-brand-blue/40 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-50">{col.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                  {Object.values(exportSelectedCols).filter(Boolean).length} of {EXPORT_COLUMNS.length} columns selected
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-700/60 bg-gray-50/50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 dark:text-slate-500">
                Up to {Math.min(total, 1000).toLocaleString()} records
              </p>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={handleExport}
                  disabled={exportLoading || Object.values(exportSelectedCols).every(v => !v) || (exportDateMode === 'custom' && (!exportStartDate || !exportEndDate))}
                  icon={exportLoading ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                >
                  {exportLoading ? 'Exporting...' : `Export ${exportFormat === 'csv' ? 'CSV' : 'Excel'}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
