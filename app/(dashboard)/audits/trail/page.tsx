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
import FilterSelect from '@/components/ui/filter-select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import NameAvatar from '@/components/ui/name-avatar';
import { MobileRecordList, MobileRecordCard, MobileStatChip } from '@/components/ui/mobile-record-card';
import { exportRows } from '@/lib/utils/exportUtils';
import { toast } from '@/components/ui/enhanced-toast';

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

// Logout details only carry a raw reason code ("manual", "timeout", …).
const LOGOUT_REASON_LABELS: Record<string, string> = {
  manual: 'Signed out manually',
  user: 'Signed out manually',
  timeout: 'Session timed out',
  idle: 'Signed out after inactivity',
  inactivity: 'Signed out after inactivity',
  expired: 'Session expired',
  token_expired: 'Session expired',
  session_expired: 'Session expired',
  forced: 'Signed out by an admin',
  admin: 'Signed out by an admin',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** The list endpoint returns at most this many rows in one request. */
const EXPORT_LIMIT = 1000;
/** Rows per request while exporting — the list's own page sizes go up to 100. */
const EXPORT_PAGE_SIZE = 100;

/** Candidates act without a tenant account: no user ID, and the API masks their name. */
const isCandidateActor = (log: Pick<AuditLog, 'actor_role' | 'user_display_id' | 'user_name'>) =>
  log.actor_role?.toLowerCase() === 'candidate' ||
  (!log.user_display_id && !!log.user_name && log.user_name.includes('*'));

const formatRole = (role: string | null) => (role ? role.replace(/_/g, ' ').toLowerCase() : '');

/** 'YYYY-MM-DD' (local day) → that day's first / last instant, as ISO strings. */
const dayStartISO = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const dayEndISO = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgoLocal = (n: number) => localDay(new Date(Date.now() - n * 86_400_000));

const formatAgo = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} hr ago`;
};

const ORIGIN_FILTER_LABELS: Record<string, string> = { TENANT: 'Tenant', SYSTEM: 'System', NONE: 'Normal' };

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
  // Used when dateRange === 'custom' (local YYYY-MM-DD days, both inclusive).
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const isCustomRange = dateRange === 'custom';
  const customRangeReady = !!customFrom && !!customTo && customFrom <= customTo;
  const [errorOriginFilter, setErrorOriginFilter] = useState<'' | ErrorOrigin>('');
  // user_id selected from the Active Users popup; sent to the API as user_id.
  const [userFilter, setUserFilter] = useState('');
  // Which stats card popup is open (Active Users / Action Types / Entity Types).
  const [statsPopup, setStatsPopup] = useState<'users' | 'actions' | 'entities' | null>(null);
  const statsPopupRef = useRef<HTMLDivElement>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // When the list last loaded, for the "Updated … ago" note by Refresh.
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
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
  const anyFilterActive = !!(actionFilter || entityFilter || userFilter || errorOriginFilter || searchQuery);

  /** Adds the list's date window to a request: a preset ("last N days") or the custom range. */
  const appendListDateRange = (params: URLSearchParams) => {
    if (isCustomRange) {
      if (customRangeReady) {
        params.append('start_date', dayStartISO(customFrom));
        params.append('end_date', dayEndISO(customTo));
      }
      return;
    }
    if (dateRange) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));
      params.append('start_date', startDate.toISOString());
      params.append('end_date', endDate.toISOString());
    }
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
  const prevFilters = useRef({ page, pageSize, actionFilter, entityFilter, dateRange, customFrom, customTo, errorOriginFilter, userFilter });
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
    { pageView, searchQuery, actionFilter, entityFilter, dateRange, customFrom, customTo, errorOriginFilter, userFilter, page, pageSize },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.actionFilter === 'string') setActionFilter(s.actionFilter);
      if (typeof s.entityFilter === 'string') setEntityFilter(s.entityFilter);
      if (typeof s.customFrom === 'string') setCustomFrom(s.customFrom);
      if (typeof s.customTo === 'string') setCustomTo(s.customTo);
      if (typeof s.dateRange === 'string') setDateRange(s.dateRange);
      if (typeof s.pageSize === 'number' && PAGE_SIZE_OPTIONS.includes(s.pageSize)) setPageSize(s.pageSize);
      if (typeof s.errorOriginFilter === 'string') setErrorOriginFilter(s.errorOriginFilter as '' | ErrorOrigin);
      if (typeof s.userFilter === 'string') setUserFilter(s.userFilter);
      if (typeof s.page === 'number') setPage(s.page);
    },
  );

  const fetchAuditLogs = useCallback(async () => {
    // A half-picked custom range would fetch everything — wait for both days.
    if (isCustomRange && !customRangeReady) return;
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

      appendListDateRange(params);

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
      setLastUpdated(Date.now());
      setNow(Date.now());
    } catch (err: any) {
      if (isStale()) return;
      console.error('Error fetching audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
    } finally {
      if (!isStale()) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- appendListDateRange reads only the range values listed here
  }, [page, pageSize, actionFilter, entityFilter, dateRange, customFrom, customTo, errorOriginFilter, userFilter]);

  const fetchStats = useCallback(async () => {
    if (isCustomRange && !customRangeReady) return;
    const seq = ++statsFetchSeqRef.current;
    const isStale = () => seq !== statsFetchSeqRef.current;
    // The stats endpoint only takes "last N days"; a custom range maps to its start → today.
    const statsDays = isCustomRange
      ? String(Math.max(1, Math.ceil((Date.now() - new Date(`${customFrom}T00:00:00`).getTime()) / 86_400_000)))
      : dateRange;
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/audits/stats?days=${statsDays}`, {
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
  }, [dateRange, customFrom, isCustomRange, customRangeReady]);

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
      prev.pageSize !== pageSize ||
      prev.actionFilter !== actionFilter ||
      prev.entityFilter !== entityFilter ||
      prev.dateRange !== dateRange ||
      prev.customFrom !== customFrom ||
      prev.customTo !== customTo ||
      prev.errorOriginFilter !== errorOriginFilter ||
      prev.userFilter !== userFilter;

    if (filtersChanged && hasFetched.current) {
      prevFilters.current = { page, pageSize, actionFilter, entityFilter, dateRange, customFrom, customTo, errorOriginFilter, userFilter };
      fetchAuditLogs();
      fetchStats();
    }
  }, [page, pageSize, actionFilter, entityFilter, dateRange, customFrom, customTo, errorOriginFilter, userFilter]);

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
    // Start from the range the list is showing.
    if (isCustomRange && customRangeReady) {
      setExportDateMode('custom');
      setExportStartDate(customFrom);
      setExportEndDate(customTo);
      setExportPresetDays('30');
    } else {
      setExportPresetDays(isCustomRange ? '30' : dateRange);
      setExportDateMode('preset');
      setExportStartDate('');
      setExportEndDate('');
    }
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
      if (!token) {
        handleUnauthorized();
        return;
      }
      const params = new URLSearchParams();

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
        // Whole days, end day included (midnight-UTC of the end day used to drop it).
        params.append('start_date', dayStartISO(exportStartDate));
        params.append('end_date', dayEndISO(exportEndDate));
      }

      // Pages of EXPORT_PAGE_SIZE: one big page_size=1000 request can be refused by
      // the API's page-size cap, and that failure used to be swallowed silently.
      const logs: AuditLog[] = [];
      for (let p = 1; logs.length < EXPORT_LIMIT; p++) {
        params.set('page', String(p));
        params.set('page_size', String(EXPORT_PAGE_SIZE));
        const response = await fetch(`${API_URL}/audits?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.status === 401) {
          handleUnauthorized();
          return;
        }
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const detail = Array.isArray(body.detail)
            ? body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(', ')
            : body.detail;
          throw new Error(detail || `Server returned ${response.status}`);
        }
        const data = await response.json();
        const items = (data.items || []) as AuditLog[];
        logs.push(...items);
        if (items.length < EXPORT_PAGE_SIZE || p >= (data.total_pages || 1)) break;
      }

      // Same rule as the list: the error-origin filter is also applied here.
      const exported = (errorOriginFilter ? logs.filter(l => l.error_origin === errorOriginFilter) : logs).slice(0, EXPORT_LIMIT);
      if (exported.length === 0) {
        toast.error({ title: 'Nothing to export', description: 'No audit records match this date range and filters.' });
        return;
      }

      const selectedKeys = EXPORT_COLUMNS.map(c => c.key).filter(k => exportSelectedCols[k]) as ExportColumnKey[];
      const headers = selectedKeys.map(k => EXPORT_COLUMNS.find(c => c.key === k)!.label);
      const rows = exported.map(log => selectedKeys.map(k => getColumnValue(log, k)));
      // Real .xlsx (was HTML saved as .xls, which Excel warns about) / UTF-8 CSV.
      await exportRows(exportFormat === 'csv' ? 'csv' : 'xlsx', headers, rows, 'audit-trail', { sheetName: 'Audit Trail' });
      toast.success({ title: 'Export ready', description: `${exported.length.toLocaleString()} audit records downloaded.` });
      setExportModalOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error({ title: 'Export failed', description: err instanceof Error ? err.message : 'Please try again.' });
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

  // Brief details summary; a logout's raw reason code becomes a sentence.
  const getDetailsSummary = (log: AuditLog): string => {
    const summary = getRawDetailsSummary(log);
    if (log.action.includes('logout')) return LOGOUT_REASON_LABELS[summary.toLowerCase()] ?? summary;
    return summary;
  };

  // Get brief details summary from details JSONB
  const getRawDetailsSummary = (log: AuditLog): string => {
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
    // Negative = a unit credited back (e.g. resume_delete writes -1 RU). It used
    // to fall through to "—", so a returned unit was invisible here.
    if (units && units < 0 && log.unit_type) {
      return { text: `+${Math.abs(units)} ${log.unit_type}`, negative: false, positive: true };
    }
    if (units === 0 && log.unit_type) {
      return { text: `0 ${log.unit_type}`, negative: false };
    }
    return { text: '—', negative: false };
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

  // One removable chip per active filter (the date range isn't one — it always has a value).
  const optionLabel = (list: Array<{ value: string; label: string }>, v: string) =>
    list.find(o => o.value === v)?.label ?? v.replace(/_/g, ' ');
  const filterChips = [
    searchQuery && { key: 'search', name: 'Search', value: searchQuery, clear: () => setSearchQuery('') },
    actionFilter && { key: 'action', name: 'Action', value: optionLabel(availableActions, actionFilter), clear: () => { setActionFilter(''); setPage(1); } },
    entityFilter && { key: 'entity', name: 'Entity', value: optionLabel(availableEntities, entityFilter), clear: () => { setEntityFilter(''); setPage(1); } },
    userFilter && {
      key: 'user', name: 'User',
      value: stats?.top_active_users.find(u => u.user_id === userFilter)?.user_name || 'Selected user',
      clear: () => { setUserFilter(''); setPage(1); },
    },
    errorOriginFilter && { key: 'origin', name: 'Origin', value: ORIGIN_FILTER_LABELS[errorOriginFilter] ?? errorOriginFilter, clear: () => { setErrorOriginFilter(''); setPage(1); } },
  ].filter(Boolean) as Array<{ key: string; name: string; value: string; clear: () => void }>;

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Audit Trail' }]} />
        <PageHeader
          icon={<ScrollText className="h-5 w-5" />}
          title="Audit Trail"
          description="Track every system activity and change across your organization."
          actions={
            <div className="flex items-center gap-2 sm:gap-3">
              {/* The list loads on demand (Refresh), so say how fresh it is. */}
              {lastUpdated !== null && (
                <span className="hidden md:inline tf-meta whitespace-nowrap" title={formatIST(new Date(lastUpdated).toISOString())}>
                  Updated {formatAgo(now - lastUpdated)}
                </span>
              )}
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
                  className="rounded-xl hover:-translate-y-0.5"
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
            <div className="tf-grid-stats">
              <button
                type="button"
                onClick={() => { setStatsPopup(null); clearAllFilters(); openListView(); }}
                title="Show all records (clears filters)"
                // Highlighted only while the list really shows everything.
                className={`text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border p-4 max-sm:p-3 sm:p-6 hover:shadow-md transition-all ${pageView === 'list' && !statsPopup && !anyFilterActive ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate tf-label max-sm:text-xs">Total Actions</p>
                    <p className="tf-section-title sm:text-2xl md:text-3xl mt-1 sm:mt-2">{stats.total_actions.toLocaleString()}</p>
                    <p
                      className="tf-meta mt-1 sm:mt-2 flex items-center gap-1"
                      title={isCustomRange && customFrom ? `Summary counts cover ${customFrom} to today` : undefined}
                    >
                      <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                      <span>
                        {isCustomRange && customFrom ? `Since ${customFrom}` : `Last ${stats.period_days} days`}
                        <span className="text-gray-400 dark:text-slate-500"> · {anyFilterActive ? 'Click to clear filters' : 'Click to view all'}</span>
                      </span>
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
                className={`text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border p-4 max-sm:p-3 sm:p-6 hover:shadow-md transition-all ${statsPopup === 'users' ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate tf-label max-sm:text-xs">Active Users</p>
                    <p className="tf-section-title sm:text-2xl md:text-3xl mt-1 sm:mt-2">{totalUsers !== null ? totalUsers : totalUsersFailed ? '—' : <StatValuePlaceholder />}</p>
                    <p className="tf-meta mt-1 sm:mt-2 flex items-center gap-1">
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
                className={`text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border p-4 max-sm:p-3 sm:p-6 hover:shadow-md transition-all ${statsPopup === 'actions' ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate tf-label max-sm:text-xs">Action Types</p>
                    <p className="tf-section-title sm:text-2xl md:text-3xl mt-1 sm:mt-2">{Object.keys(stats.actions_by_type).length}</p>
                    <p className="tf-meta mt-1 sm:mt-2 flex items-center gap-1">
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
                className={`text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border p-4 max-sm:p-3 sm:p-6 hover:shadow-md transition-all ${statsPopup === 'entities' ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate tf-label max-sm:text-xs">Entity Types</p>
                    <p className="tf-section-title sm:text-2xl md:text-3xl mt-1 sm:mt-2">{Object.keys(stats.actions_by_entity).length}</p>
                    <p className="tf-meta mt-1 sm:mt-2 flex items-center gap-1">
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
                  <p className="tf-row-title">
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
                      <p className="px-4 py-6 tf-body-muted text-center">No users found.</p>
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
                            className={`w-full text-left px-4 max-sm:px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${isActive ? 'bg-brand-blue/[0.06]' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <NameAvatar name={u.user_name} fallback={u.user_email} userId={u.user_id} size="sm" />
                              <div className="min-w-0">
                                <p className="tf-row-name truncate">{u.user_name || 'Unknown'}</p>
                                {u.user_email && <p className="tf-meta truncate">{u.user_email}</p>}
                              </div>
                            </div>
                            <span className="tf-caption bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex-shrink-0">{u.action_count}</span>
                          </button>
                        );
                      })
                    )
                  )}
                  {statsPopup === 'actions' && (
                    Object.entries(stats.actions_by_type).length === 0 ? (
                      <p className="px-4 py-6 tf-body-muted text-center">No actions found.</p>
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
                              className={`w-full text-left px-4 max-sm:px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${isActive ? 'bg-brand-blue/[0.06]' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                            >
                              <span className="tf-body truncate">{label}</span>
                              <span className="tf-caption bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex-shrink-0">{count}</span>
                            </button>
                          );
                        })
                    )
                  )}
                  {statsPopup === 'entities' && (
                    Object.entries(stats.actions_by_entity).length === 0 ? (
                      <p className="px-4 py-6 tf-body-muted text-center">No entities found.</p>
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
                              className={`w-full text-left px-4 max-sm:px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${isActive ? 'bg-brand-blue/[0.06]' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                            >
                              <span className="tf-body truncate">{label}</span>
                              <span className="tf-caption bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex-shrink-0">{count}</span>
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
        <div className="tf-card-soft overflow-hidden">
          {/* Record Count */}
          <div className="px-3 sm:px-4 md:px-5 pt-3 sm:pt-4 md:pt-5 pb-3 sm:pb-4 border-b border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <span className="tf-label">Audit Records</span>
              <span className="tf-label bg-gray-100 dark:bg-slate-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full">{total} records</span>
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
                    placeholder="Search this page by user, action, or IP..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 sm:pl-11"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3">
                <FilterSelect
                  ariaLabel="Filter by action"
                  value={actionFilter}
                  onChange={(v) => { setActionFilter(v); setPage(1); }}
                  options={[{ value: '', label: 'All Actions' }, ...availableActions]}
                />
                <FilterSelect
                  ariaLabel="Filter by entity"
                  value={entityFilter}
                  onChange={(v) => { setEntityFilter(v); setPage(1); }}
                  options={[{ value: '', label: 'All Entities' }, ...availableEntities]}
                />
                <FilterSelect
                  ariaLabel="Date range"
                  icon={Calendar}
                  value={dateRange}
                  onChange={(v) => {
                    // Custom starts from the last 30 days, so it's usable straight away.
                    if (v === 'custom' && !customRangeReady) {
                      setCustomFrom(daysAgoLocal(30));
                      setCustomTo(localDay(new Date()));
                    }
                    setDateRange(v);
                    setPage(1);
                  }}
                  options={[
                    { value: '7', label: '7 days' },
                    { value: '30', label: '30 days' },
                    { value: '90', label: '90 days' },
                    { value: '365', label: '1 year' },
                    { value: 'custom', label: 'Custom range' },
                  ]}
                />
                <FilterSelect
                  ariaLabel="Filter by error origin"
                  icon={Shield}
                  value={errorOriginFilter}
                  onChange={(v) => { setErrorOriginFilter(v as '' | ErrorOrigin); setPage(1); }}
                  options={[
                    { value: '', label: 'All Origins' },
                    { value: 'TENANT', label: 'Tenant' },
                    { value: 'SYSTEM', label: 'System' },
                    { value: 'NONE', label: 'Normal' },
                  ]}
                />
              </div>
              {isCustomRange && (
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:items-center">
                  <DateField
                    aria-label="From date"
                    value={customFrom}
                    max={customTo || localDay(new Date())}
                    onChange={(v) => { setCustomFrom(v); setPage(1); }}
                    className="w-full sm:w-[160px]"
                  />
                  <span className="text-xs font-medium text-gray-400 dark:text-slate-500">to</span>
                  <DateField
                    aria-label="To date"
                    value={customTo}
                    min={customFrom}
                    max={localDay(new Date())}
                    onChange={(v) => { setCustomTo(v); setPage(1); }}
                    className="w-full sm:w-[160px]"
                  />
                </div>
              )}
              {filterChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {filterChips.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={c.clear}
                      aria-label={`Remove filter ${c.name}: ${c.value}`}
                      className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-blue/[0.06] px-2.5 py-1 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/15 hover:bg-brand-blue/10 transition-colors"
                    >
                      <span className="text-gray-500 dark:text-slate-400">{c.name}:</span>
                      <span className="truncate max-w-[12rem]">{c.value}</span>
                      <X className="h-3 w-3 shrink-0" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="px-1 text-xs font-medium text-gray-600 dark:text-slate-400 underline underline-offset-2 hover:text-brand-blue"
                  >
                    Clear all
                  </button>
                </div>
              )}
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
              <p className="tf-label sm:text-base break-words px-4">{error}</p>
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
            <MobileRecordList className="p-3">
              {filteredLogs.map((log) => {
                const actionStatus = getActionStatus(log.action, log.error_origin);
                const impact = getImpactText(log);
                const impactLevel = getImpactLevel(log);
                return (
                  <MobileRecordCard
                    key={log.id}
                    title={
                      <span className="flex min-w-0 items-center gap-2">
                        <NameAvatar name={log.user_name} fallback={log.user_email} userId={log.user_id} size="sm" />
                        <span className="min-w-0 truncate" title={isCandidateActor(log) ? 'Candidate name is masked for privacy' : undefined}>{log.user_name || 'Unknown'}</span>
                      </span>
                    }
                    badges={
                      <>
                        {isCandidateActor(log) && (
                          <span className="inline-flex rounded px-1.5 py-px text-2xs font-semibold bg-brand-cyan/10 text-brand-blue ring-1 ring-brand-cyan/25">Candidate</span>
                        )}
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-2xs font-semibold ${getActionColor(log.action)}`}>
                          {log.action_label}
                        </span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-2xs font-semibold ${actionStatus.color}`}>
                          {actionStatus.label}
                        </span>
                        <span className={`text-2xs font-semibold ${impactLevel.color}`}>
                          {impactLevel.label}
                        </span>
                      </>
                    }
                    meta={[
                      { label: isCandidateActor(log) ? '' : (log.user_email || '') },
                      { icon: <Clock className="w-3.5 h-3.5" />, label: formatDate(log.created_at) },
                    ]}
                    footer={
                      impact.text !== '—' ? (
                        <MobileStatChip tone={impact.negative ? 'danger' : impact.positive ? 'success' : 'neutral'}>
                          {impact.text}
                        </MobileStatChip>
                      ) : undefined
                    }
                    actions={
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="flex items-center gap-1 px-2 py-1 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md text-2xs font-medium flex-shrink-0"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                    }
                  />
                );
              })}
            </MobileRecordList>
            {/* Desktop Table — sideways scroll only (many columns); the page
                itself is the sole vertical scroller, so its scrollbar stays at
                the true edge of the viewport instead of a second one drawn
                around this table. See the `.tf-table-shell` note in
                globals.css: giving a table its own vertical scroll cap here is
                exactly the nested-scroller problem that class documents. */}
            <div className="hidden lg:block table-responsive">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-white dark:bg-slate-900 backdrop-blur-sm shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85_/_0.6)]">
                    {/* User = name + role + user ID; Status = status + impact (error origin is
                        already in the status label, and stays in the details modal and export). */}
                    <th className="px-4 py-4 text-left tf-th whitespace-nowrap">Timestamp</th>
                    <th className="px-4 py-4 text-left tf-th whitespace-nowrap">User</th>
                    <th className="px-4 py-4 text-left tf-th whitespace-nowrap">Action</th>
                    <th className="px-4 py-4 text-left tf-th whitespace-nowrap">Details</th>
                    <th className="px-4 py-4 text-left tf-th whitespace-nowrap">Status</th>
                    <th className="px-4 py-4 text-left tf-th whitespace-nowrap">Error Code</th>
                    <th className="px-4 py-4 text-left tf-th whitespace-nowrap">Duration</th>
                    <th className="px-4 py-4 text-left tf-th whitespace-nowrap">Refund Flag</th>
                    <th className="px-4 py-4 text-left tf-th whitespace-nowrap">Units</th>
                    <th className="px-4 py-4 text-center tf-th whitespace-nowrap tf-sticky-col">Actions</th>
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
                        <td className="tf-td whitespace-nowrap">
                          <div className="flex items-center gap-2 tf-body-secondary">
                            <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            <span>{formatDate(log.created_at)}</span>
                          </div>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <NameAvatar name={log.user_name} fallback={log.user_email} userId={log.user_id} size="md" />
                            <div className="min-w-0">
                              <p
                                className="tf-row-name"
                                title={isCandidateActor(log) ? 'Candidate name is masked for privacy' : log.user_email || undefined}
                              >
                                {log.user_name || 'Unknown'}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 tf-meta">
                                {isCandidateActor(log) ? (
                                  <span
                                    className="inline-flex rounded px-1.5 py-px text-2xs font-semibold bg-brand-cyan/10 text-brand-blue ring-1 ring-brand-cyan/25"
                                    title="Candidates don't have a user ID"
                                  >
                                    Candidate
                                  </span>
                                ) : (
                                  <span className="capitalize">{formatRole(log.actor_role) || '—'}</span>
                                )}
                                {log.user_display_id && (
                                  <>
                                    <span aria-hidden className="text-gray-300 dark:text-slate-600">·</span>
                                    <span className="font-mono" title="User ID">{log.user_display_id}</span>
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className={`inline-flex px-3 py-1.5 rounded-lg text-xs font-semibold ${getActionColor(log.action)}`}>
                            {log.action_label}
                          </span>
                        </td>
                        <td className="tf-td">
                          <span className="tf-body max-w-[180px] truncate block" title={getDetailsSummary(log)}>
                            {getDetailsSummary(log)}
                          </span>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          {(() => {
                            const impactLevel = getImpactLevel(log);
                            return (
                              // One line, so every row keeps the same height.
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${actionStatus.color}`}>
                                  {actionStatus.label}
                                </span>
                                {/* Low impact is the normal case — only call out Medium / High. */}
                                {impactLevel.label !== 'Low' && (
                                  <span className={`text-xs font-semibold ${impactLevel.color}`} title={`${impactLevel.label} impact`}>{impactLevel.label}</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          {log.error_code ? (
                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${ERROR_CODE_COLORS[log.error_code] || 'bg-gray-50 text-gray-600'}`}>
                              {ERROR_CODE_LABELS[log.error_code] || log.error_code}
                            </span>
                          ) : (
                            <span className="tf-body-muted">—</span>
                          )}
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          {log.total_session_duration != null ? (
                            <span className="tf-label">
                              {formatSessionDuration(log.total_session_duration)}
                            </span>
                          ) : (
                            <span className="tf-body-muted">—</span>
                          )}
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${REFUND_FLAG_COLORS[log.refund_flag]}`}>
                            {log.refund_flag}
                          </span>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          {impact.text !== '—' ? (
                            <span className={`inline-flex items-center gap-1 text-sm font-semibold ${impact.negative ? 'text-destructive' : impact.positive ? 'text-success' : 'text-gray-500 dark:text-slate-500'}`}>
                              {impact.text}
                            </span>
                          ) : (
                            <span className="tf-body-muted">—</span>
                          )}
                        </td>
                        <td className="tf-td whitespace-nowrap tf-sticky-col">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                            aria-label="View details"
                            title="View details"
                            className="inline-flex h-8 w-8 items-center justify-center text-gray-600 dark:text-slate-300 hover:text-brand-blue hover:bg-brand-blue/5 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
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
                <p className="tf-body-secondary">
                  Showing <span className="font-semibold text-gray-900 dark:text-slate-50">{Math.min((page - 1) * pageSize + 1, total)}</span>–<span className="font-semibold text-gray-900 dark:text-slate-50">{Math.min(page * pageSize, total)}</span> of <span className="font-semibold text-gray-900 dark:text-slate-50">{total}</span>
                </p>
                <div className="flex items-center gap-2">
                  <span className="tf-body-muted whitespace-nowrap">Rows per page</span>
                  <FilterSelect
                    ariaLabel="Rows per page"
                    value={String(pageSize)}
                    onChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                    options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                    className="w-auto sm:w-auto"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-auto">
                <div className="flex items-center gap-1.5">
                  <span className="hidden sm:inline tf-body-muted whitespace-nowrap">Go to</span>
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
                    className="tf-input w-12 sm:w-14 h-7 sm:h-8 px-1.5 sm:px-2 text-center"
                  />
                </div>

                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="tf-btn tf-btn-secondary w-7 h-7 sm:w-8 sm:h-8 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors whitespace-normal gap-0 font-normal"
                  aria-label="Previous page" title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                <span className="tf-label px-1 whitespace-nowrap">
                  <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
                </span>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="tf-btn tf-btn-secondary w-7 h-7 sm:w-8 sm:h-8 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors whitespace-normal gap-0 font-normal"
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
                  <p className="tf-meta">Complete event information</p>
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
                <NameAvatar name={selectedLog.user_name} fallback={selectedLog.user_email} userId={selectedLog.user_id} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="tf-section-title">{selectedLog.user_name || 'Unknown User'}</p>
                  {isCandidateActor(selectedLog) ? (
                    <p className="tf-body-muted">Candidate · name masked for privacy</p>
                  ) : selectedLog.actor_role && (
                    <p className="tf-body-muted truncate capitalize">
                      {formatRole(selectedLog.actor_role)}{selectedLog.user_display_id ? ` · ${selectedLog.user_display_id}` : ''}
                    </p>
                  )}
                </div>
                <span className={`inline-flex px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-xs font-semibold flex-shrink-0 ${getActionColor(selectedLog.action)}`}>
                  {selectedLog.action_label}
                </span>
              </div>

              {/* Log ID */}
              <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">Log ID</p>
                <p className="tf-meta font-mono break-all">{selectedLog.id}</p>
              </div>

              {/* Summary Info */}
              <div className="tf-grid-3">
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                  <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">When</p>
                  <p className="tf-row-name">{formatDate(selectedLog.created_at)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                  <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">Entity</p>
                  <p className="tf-row-name capitalize">{selectedLog.entity_type?.replace(/_/g, ' ') || '—'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                  <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">IP Address</p>
                  <p className="tf-row-name font-mono break-all">{selectedLog.ip_address || '—'}</p>
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
                    <div className="tf-grid-3">
                      <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                        <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">Status</p>
                        {(() => { const s = getActionStatus(selectedLog.action, selectedLog.error_origin); return <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-xs font-semibold ${s.color}`}>{s.label}</span>; })()}
                      </div>
                      <div className="hidden sm:block" /><div className="hidden sm:block" />
                    </div>
                  );
                }
                return (
                  <div className="tf-grid-3">
                    {hasUnits ? (
                      <div className="bg-gray-100 dark:bg-slate-800 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                        <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">Impact</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-lg font-bold ${modalImpact.negative ? 'text-destructive' : 'text-gray-900 dark:text-slate-50'}`}>
                            {modalImpact.text}
                          </span>
                        </div>
                      </div>
                    ) : <div className="hidden sm:block" />}
                    {hasBalance ? (
                      <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                        <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">Available</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="tf-body-muted">{modalBalanceBefore}</span>
                          <span className="text-gray-300 dark:text-slate-500">→</span>
                          <span className="tf-section-title">{modalBalanceAfter ?? 0}</span>
                        </div>
                      </div>
                    ) : <div className="hidden sm:block" />}
                    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                      <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">Status</p>
                      {(() => { const s = getActionStatus(selectedLog.action, selectedLog.error_origin); return <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-xs font-semibold ${s.color}`}>{s.label}</span>; })()}
                    </div>
                  </div>
                );
              })()}

              {/* Entity ID (if present) */}
              {selectedLog.entity_id && (
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5">
                  <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">Entity ID</p>
                  <p className="tf-body font-mono truncate" title={selectedLog.entity_id}>{selectedLog.entity_id}</p>
                </div>
              )}

              {/* Session Details (shown when session fields exist) */}
              {(selectedLog.session_start_time || selectedLog.error_origin || selectedLog.module_type) && (
                <div>
                  <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-1.5 sm:mb-2.5">Session Details</p>
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg sm:rounded-xl divide-y divide-gray-100 dark:divide-slate-700/60 overflow-hidden">
                    {selectedLog.module_type && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Module</span>
                        <span className="tf-row-name">{MODULE_TYPE_LABELS[selectedLog.module_type] || selectedLog.module_type}</span>
                      </div>
                    )}
                    {selectedLog.session_start_time && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Session Start</span>
                        <span className="tf-body">{formatDate(selectedLog.session_start_time)}</span>
                      </div>
                    )}
                    {selectedLog.interruption_time && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Interruption</span>
                        <span className="text-sm text-destructive">{formatDate(selectedLog.interruption_time)}</span>
                      </div>
                    )}
                    {selectedLog.session_end_time && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Session End</span>
                        <span className="tf-body">{formatDate(selectedLog.session_end_time)}</span>
                      </div>
                    )}
                    {selectedLog.total_session_duration != null && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Duration</span>
                        <span className="tf-row-title">{formatSessionDuration(selectedLog.total_session_duration)}</span>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                      <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Error Origin</span>
                      <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-xs font-semibold ${ERROR_ORIGIN_COLORS[selectedLog.error_origin]}`}>
                        {ERROR_ORIGIN_LABELS[selectedLog.error_origin]}
                      </span>
                    </div>
                    {selectedLog.error_code && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Error Code</span>
                        <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-xs font-semibold ${ERROR_CODE_COLORS[selectedLog.error_code] || 'bg-gray-50 text-gray-600'}`}>
                          {ERROR_CODE_LABELS[selectedLog.error_code] || selectedLog.error_code}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                      <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Refund Flag</span>
                      <span className={`inline-flex px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-xs font-semibold ${REFUND_FLAG_COLORS[selectedLog.refund_flag]}`}>
                        {selectedLog.refund_flag}
                      </span>
                    </div>
                    {selectedLog.error_origin !== 'NONE' && (selectedLog.units_consumed ?? 0) > 0 && (
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Billing Impact</span>
                        <span className="tf-body break-words">{getBillingImpact(selectedLog.error_origin).description}</span>
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
                  <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-1.5 sm:mb-2.5">Event Details</p>
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
                        <span className="tf-caption min-w-[140px] flex-shrink-0 pt-0.5 capitalize">
                          {(DETAIL_KEY_LABELS as Record<string, string>)[key] || key.replace(/_/g, ' ')}
                        </span>
                        <span className="tf-body break-all">
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
                <div className="tf-grid-2">
                  <div className="bg-brand-blue/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5 ring-1 ring-brand-blue/15">
                    <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">AI Model Version</p>
                    <p className="tf-row-title">{aiAuditData.ai_model_version || 'N/A'}</p>
                  </div>
                  <div className="bg-brand-blue/5 rounded-lg sm:rounded-xl p-2.5 sm:p-3 md:p-3.5 ring-1 ring-brand-blue/15">
                    <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider mb-0.5 sm:mb-1">Generation Timestamp</p>
                    <p className="tf-row-name">
                      {formatIST(aiAuditData.questions_generated_at)}
                    </p>
                  </div>
                </div>

                {/* Input Parameters Table */}
                <div className="bg-gray-50 rounded-lg sm:rounded-xl divide-y divide-gray-100 overflow-hidden">
                  <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100/50 dark:bg-slate-800">
                    <p className="tf-micro-hint sm:text-2xs uppercase tracking-wider">Input Parameters</p>
                  </div>
                  {aiAuditData.generation_params ? (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">JD Title</span>
                        <span className="tf-body break-words">{aiAuditData.generation_params.jd_title || 'N/A'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Experience</span>
                        <span className="tf-body capitalize">{aiAuditData.generation_params.experience_level?.replace(/_/g, ' ') || 'N/A'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Duration</span>
                        <span className="tf-body">{aiAuditData.generation_params.duration_minutes ? `${aiAuditData.generation_params.duration_minutes} min` : 'N/A'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                        <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Questions</span>
                        <span className="tf-body">{aiAuditData.generation_params.total_questions_generated ?? 'N/A'}</span>
                      </div>
                      {aiAuditData.generation_params.rounds_config && aiAuditData.generation_params.rounds_config.length > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-start px-3 sm:px-4 py-2 sm:py-3 gap-0.5 sm:gap-4">
                          <span className="tf-caption sm:min-w-[140px] flex-shrink-0 sm:pt-0.5">Rounds</span>
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
                      <span className="tf-body-muted">No input parameters recorded</span>
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
            <div className="px-5 max-sm:px-4 py-4 max-sm:py-3 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between gap-3 bg-gradient-to-r from-gray-50 to-white dark:from-slate-800/50 dark:to-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-lg shadow-brand-blue/20 ring-1 ring-white/10">
                  <Download className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="tf-section-title">
                    Export {exportFormat === 'csv' ? 'CSV' : 'Excel'}
                  </h3>
                  <p className="tf-meta">Configure date range and columns</p>
                </div>
              </div>
              <button onClick={() => setExportModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors" aria-label="Close">
                <X className="w-4 h-4 text-gray-500 dark:text-slate-500" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5 max-sm:p-4 space-y-5 max-sm:space-y-4">
              {/* The list endpoint returns at most EXPORT_LIMIT rows per request — say so instead of cutting silently. */}
              {total > EXPORT_LIMIT && (
                <div className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-xs text-warning-strong ring-1 ring-warning-line">
                  <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Exports are limited to the latest <strong>{EXPORT_LIMIT.toLocaleString()}</strong> records. The current view has{' '}
                    <strong>{total.toLocaleString()}</strong> — narrow the date range or filters to export the rest.
                  </span>
                </div>
              )}
              {/* Date Range */}
              <div>
                <p className="tf-eyebrow mb-3">Date Range</p>
                <div className={`flex gap-2 ${exportDateMode === 'custom' ? 'mb-3' : ''}`}>
                  <button
                    onClick={() => setExportDateMode('preset')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${exportDateMode === 'preset' ? 'bg-brand-blue text-white border-brand-blue shadow-md shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30'}`}
                  >
                    Preset
                  </button>
                  <button
                    onClick={() => setExportDateMode('custom')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${exportDateMode === 'custom' ? 'bg-brand-blue text-white border-brand-blue shadow-md shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30'}`}
                  >
                    Custom
                  </button>
                </div>
                {exportDateMode === 'custom' && (
                  <div className="grid grid-cols-2 max-xs:grid-cols-1 gap-3">
                    <div>
                      <label className="block tf-caption mb-1.5">Start Date</label>
                      <DateField
                        aria-label="Start Date"
                        value={exportStartDate}
                        onChange={setExportStartDate}
                      />
                    </div>
                    <div>
                      <label className="block tf-caption mb-1.5">End Date</label>
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
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
                  <p className="tf-eyebrow">Columns</p>
                  <div className="flex flex-wrap items-center gap-2">
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
                    {exportDateMode === 'preset' && (
                      <FilterSelect
                        value={exportPresetDays}
                        onChange={(v) => setExportPresetDays(v)}
                        ariaLabel="Date range"
                        options={[
                          { value: '7', label: 'Last 7 days' },
                          { value: '30', label: 'Last 30 days' },
                          { value: '90', label: 'Last 90 days' },
                          { value: '365', label: 'Last 1 year' },
                        ]}
                        className="w-auto sm:w-auto h-6 data-[size=default]:h-6 sm:data-[size=default]:h-6 gap-1 py-0 sm:py-0 pl-1.5 sm:pl-1.5 pr-1 sm:pr-1 rounded-md sm:rounded-md text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-50 [&_svg]:size-3"
                      />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-sm:gap-1">
                  {EXPORT_COLUMNS.map(col => (
                    <label key={col.key} className="flex items-center gap-2.5 max-sm:gap-2 px-3 max-sm:px-2 py-2 max-sm:py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={!!exportSelectedCols[col.key]}
                        onChange={e => setExportSelectedCols(prev => ({ ...prev, [col.key]: e.target.checked }))}
                        className="tf-checkbox accent-brand-blue focus:ring-brand-blue/40"
                      />
                      <span className="tf-body max-sm:text-xs group-hover:text-gray-900 dark:group-hover:text-slate-50">{col.label}</span>
                    </label>
                  ))}
                </div>
                <p className="tf-hint mt-2">
                  {Object.values(exportSelectedCols).filter(Boolean).length} of {EXPORT_COLUMNS.length} columns selected
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 max-sm:px-4 py-4 max-sm:py-3 border-t border-gray-100 dark:border-slate-700/60 bg-gray-50/50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
              <p className="tf-meta">
                Up to {Math.min(total, EXPORT_LIMIT).toLocaleString()} records
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
